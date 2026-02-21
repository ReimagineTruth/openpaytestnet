CREATE OR REPLACE FUNCTION public.save_my_virtual_card_signature(
  p_signature TEXT
)
RETURNS public.virtual_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_signature TEXT := LEFT(TRIM(COALESCE(p_signature, '')), 32);
  v_card public.virtual_cards;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.upsert_my_virtual_card(NULL, NULL);

  UPDATE public.virtual_cards vc
  SET card_settings = jsonb_set(
    COALESCE(vc.card_settings, '{}'::jsonb),
    '{signature}',
    to_jsonb(v_signature),
    true
  ),
  updated_at = now()
  WHERE vc.user_id = v_user_id
  RETURNING * INTO v_card;

  RETURN v_card;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_virtual_card_signature(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_my_virtual_card_signature(TEXT) TO authenticated;
