-- Ensure user preferences always exist per account and enforce security password lifecycle.

-- 1) Backfill missing user preference rows for existing auth users.
INSERT INTO public.user_preferences (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.user_preferences p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 2) Keep user_preferences synced from profiles so account-level preferences remain attached.
CREATE OR REPLACE FUNCTION public.sync_profile_to_user_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, profile_full_name, profile_username, reference_code)
  VALUES (NEW.id, NEW.full_name, NEW.username, NEW.referral_code)
  ON CONFLICT (user_id) DO UPDATE
  SET
    profile_full_name = EXCLUDED.profile_full_name,
    profile_username = EXCLUDED.profile_username,
    reference_code = EXCLUDED.reference_code;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_user_preferences ON public.profiles;
CREATE TRIGGER trg_profiles_sync_user_preferences
AFTER INSERT OR UPDATE OF full_name, username, referral_code
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_user_preferences();

-- 3) Enforce security password lifecycle:
--    - Allowed: null -> hash (initial setup)
--    - Allowed: hash -> null (disable)
--    - Disallowed: hashA -> hashB directly (must disable first, then set again)
CREATE OR REPLACE FUNCTION public.enforce_user_preferences_security_password_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_password_hash TEXT;
  new_password_hash TEXT;
BEGIN
  IF NEW.security_settings IS NULL OR jsonb_typeof(NEW.security_settings) <> 'object' THEN
    NEW.security_settings := '{}'::jsonb;
  END IF;

  old_password_hash := COALESCE(NULLIF(OLD.security_settings->>'passwordHash', ''), NULL);
  new_password_hash := COALESCE(NULLIF(NEW.security_settings->>'passwordHash', ''), NULL);

  IF old_password_hash IS NOT NULL
     AND new_password_hash IS NOT NULL
     AND old_password_hash <> new_password_hash THEN
    RAISE EXCEPTION
      USING MESSAGE = 'Security password can only be changed after disabling it first.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_preferences_password_lifecycle ON public.user_preferences;
CREATE TRIGGER trg_user_preferences_password_lifecycle
BEFORE UPDATE OF security_settings
ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.enforce_user_preferences_security_password_lifecycle();
