-- Prevent auth signup failures when profile username collides with existing users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_username TEXT;
  final_username TEXT;
BEGIN
  requested_username := NULLIF(BTRIM(NEW.raw_user_meta_data->>'username'), '');

  IF requested_username IS NOT NULL THEN
    final_username := requested_username;

    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = final_username) THEN
      final_username := requested_username || '_' || REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', '');
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    final_username
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

