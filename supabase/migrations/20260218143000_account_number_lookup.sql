CREATE OR REPLACE FUNCTION public.find_user_by_account_number(
  p_account_number TEXT
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  username TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_lookup TEXT := UPPER(TRIM(COALESCE(p_account_number, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_lookup = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.username, p.avatar_url
  FROM public.user_accounts ua
  JOIN public.profiles p ON p.id = ua.user_id
  WHERE ua.account_number = v_lookup
    AND ua.user_id <> v_user_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_user_by_account_number(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_user_by_account_number(TEXT) TO authenticated;

