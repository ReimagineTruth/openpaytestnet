CREATE OR REPLACE FUNCTION public.normalize_openpay_code(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT UPPER(TRIM(COALESCE(p_code, '')));
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_accounts_account_number_format_ck'
      AND conrelid = 'public.user_accounts'::regclass
  ) THEN
    ALTER TABLE public.user_accounts
      ADD CONSTRAINT user_accounts_account_number_format_ck
      CHECK (account_number ~ '^OP[A-Z0-9]{6,64}$') NOT VALID;
  END IF;
END $$;

ALTER TABLE public.user_accounts
  VALIDATE CONSTRAINT user_accounts_account_number_format_ck;

CREATE OR REPLACE FUNCTION public.get_my_openpay_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.user_accounts;
BEGIN
  v_account := public.upsert_my_user_account();
  RETURN v_account.account_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_my_openpay_code(
  p_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected TEXT;
  v_lookup TEXT := public.normalize_openpay_code(p_code);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_lookup = '' THEN
    RETURN FALSE;
  END IF;

  v_expected := public.get_my_openpay_code();
  RETURN v_lookup = v_expected;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_openpay_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_openpay_code(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_openpay_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_openpay_code() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_my_openpay_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_my_openpay_code(TEXT) TO authenticated, service_role;
