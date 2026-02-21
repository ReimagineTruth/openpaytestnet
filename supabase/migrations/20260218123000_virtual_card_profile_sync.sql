CREATE OR REPLACE FUNCTION public.upsert_my_virtual_card(
  p_cardholder_name TEXT DEFAULT NULL,
  p_card_username TEXT DEFAULT NULL
)
RETURNS public.virtual_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_name TEXT;
  v_profile_username TEXT;
  v_card public.virtual_cards;
  v_now DATE := CURRENT_DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT full_name, COALESCE(username, '')
  INTO v_profile_name, v_profile_username
  FROM public.profiles
  WHERE id = v_user_id;

  SELECT *
  INTO v_card
  FROM public.virtual_cards
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.virtual_cards
    SET cardholder_name = COALESCE(NULLIF(TRIM(v_profile_name), ''), cardholder_name),
        card_username = COALESCE(NULLIF(TRIM(v_profile_username), ''), card_username),
        is_active = true
    WHERE user_id = v_user_id
    RETURNING * INTO v_card;
    RETURN v_card;
  END IF;

  INSERT INTO public.virtual_cards (
    user_id,
    cardholder_name,
    card_username,
    card_number,
    expiry_month,
    expiry_year,
    cvc
  )
  VALUES (
    v_user_id,
    COALESCE(NULLIF(TRIM(v_profile_name), ''), 'OpenPay User'),
    COALESCE(NULLIF(TRIM(v_profile_username), ''), 'openpay'),
    public.generate_openpay_card_number(),
    EXTRACT(MONTH FROM v_now)::INT,
    (EXTRACT(YEAR FROM v_now)::INT + 4),
    public.generate_openpay_cvc()
  )
  RETURNING * INTO v_card;

  RETURN v_card;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_virtual_card_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.virtual_cards
  SET cardholder_name = COALESCE(NULLIF(TRIM(NEW.full_name), ''), cardholder_name),
      card_username = COALESCE(NULLIF(TRIM(COALESCE(NEW.username, '')), ''), card_username)
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_virtual_card ON public.profiles;
CREATE TRIGGER trg_profiles_sync_virtual_card
AFTER UPDATE OF full_name, username
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_virtual_card_from_profile();

