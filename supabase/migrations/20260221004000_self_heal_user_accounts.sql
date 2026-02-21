-- Self-heal for user account identity objects used by top-up/account-based flows.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL DEFAULT '',
  account_username TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_accounts'
      AND policyname = 'Users can view own account'
  ) THEN
    CREATE POLICY "Users can view own account"
      ON public.user_accounts
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_accounts'
      AND policyname = 'Users can insert own account'
  ) THEN
    CREATE POLICY "Users can insert own account"
      ON public.user_accounts
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_accounts'
      AND policyname = 'Users can update own account'
  ) THEN
    CREATE POLICY "Users can update own account"
      ON public.user_accounts
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_common_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_accounts_updated_at ON public.user_accounts;
CREATE TRIGGER trg_user_accounts_updated_at
BEFORE UPDATE ON public.user_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

CREATE OR REPLACE FUNCTION public.generate_openpay_account_number(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'OP' || UPPER(REPLACE(p_user_id::TEXT, '-', ''));
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_user_account()
RETURNS public.user_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_name TEXT;
  v_profile_username TEXT;
  v_account public.user_accounts;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT full_name, COALESCE(username, '')
  INTO v_profile_name, v_profile_username
  FROM public.profiles
  WHERE id = v_user_id;

  INSERT INTO public.user_accounts (user_id, account_number, account_name, account_username)
  VALUES (
    v_user_id,
    public.generate_openpay_account_number(v_user_id),
    COALESCE(NULLIF(TRIM(v_profile_name), ''), 'OpenPay User'),
    COALESCE(NULLIF(TRIM(v_profile_username), ''), 'openpay')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET account_name = EXCLUDED.account_name,
      account_username = EXCLUDED.account_username
  RETURNING * INTO v_account;

  RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_user_account() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
