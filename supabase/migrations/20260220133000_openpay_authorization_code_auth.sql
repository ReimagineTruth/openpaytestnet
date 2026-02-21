CREATE TABLE IF NOT EXISTS public.openpay_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openpay_authorization_codes_user
ON public.openpay_authorization_codes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openpay_authorization_codes_expiry
ON public.openpay_authorization_codes(expires_at);

ALTER TABLE public.openpay_authorization_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'openpay_authorization_codes'
      AND policyname = 'Users can view own authorization codes'
  ) THEN
    CREATE POLICY "Users can view own authorization codes"
      ON public.openpay_authorization_codes
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_openpay_authorization_code(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT UPPER(TRIM(COALESCE(p_code, '')));
$$;

CREATE OR REPLACE FUNCTION public.generate_openpay_authorization_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_chars CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT := '';
  v_i INTEGER;
BEGIN
  FOR v_i IN 1..8 LOOP
    v_code := v_code || substr(v_chars, (get_byte(gen_random_bytes(1), 0) % length(v_chars)) + 1, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_my_openpay_authorization_code(
  p_force_new BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  authorization_code TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing RECORD;
  v_candidate TEXT;
  v_try INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.openpay_authorization_codes oac
  WHERE (oac.used_at IS NOT NULL OR oac.expires_at <= now() - interval '1 day');

  IF NOT COALESCE(p_force_new, FALSE) THEN
    SELECT oac.authorization_code, oac.expires_at
    INTO v_existing
    FROM public.openpay_authorization_codes oac
    WHERE oac.user_id = v_user_id
      AND oac.used_at IS NULL
      AND oac.expires_at > now()
    ORDER BY oac.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT v_existing.authorization_code, v_existing.expires_at;
      RETURN;
    END IF;
  ELSE
    UPDATE public.openpay_authorization_codes oac
    SET used_at = now()
    WHERE oac.user_id = v_user_id
      AND oac.used_at IS NULL
      AND oac.expires_at > now();
  END IF;

  WHILE v_try < 20 LOOP
    v_try := v_try + 1;
    v_candidate := public.generate_openpay_authorization_code();

    BEGIN
      INSERT INTO public.openpay_authorization_codes (
        user_id,
        authorization_code,
        expires_at
      )
      VALUES (
        v_user_id,
        v_candidate,
        now() + interval '10 minutes'
      )
      RETURNING openpay_authorization_codes.authorization_code, openpay_authorization_codes.expires_at
      INTO authorization_code, expires_at;

      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'Failed to issue authorization code';
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_my_openpay_authorization_code(
  p_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_lookup TEXT := public.normalize_openpay_authorization_code(p_code);
  v_row_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_lookup = '' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.openpay_authorization_codes oac
  SET used_at = now()
  WHERE oac.user_id = v_user_id
    AND oac.authorization_code = v_lookup
    AND oac.used_at IS NULL
    AND oac.expires_at > now()
  RETURNING oac.id INTO v_row_id;

  RETURN v_row_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_my_openpay_code(
  p_code TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.verify_my_openpay_authorization_code(p_code);
$$;

REVOKE ALL ON TABLE public.openpay_authorization_codes FROM PUBLIC;
GRANT SELECT ON TABLE public.openpay_authorization_codes TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.normalize_openpay_authorization_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_openpay_authorization_code(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_openpay_authorization_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_openpay_authorization_code() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_my_openpay_authorization_code(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_my_openpay_authorization_code(BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_my_openpay_authorization_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_my_openpay_authorization_code(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_my_openpay_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_my_openpay_code(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
