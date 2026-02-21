ALTER TABLE public.virtual_cards
ALTER COLUMN card_settings
SET DEFAULT '{"allow_checkout": true, "signature": ""}'::jsonb;

UPDATE public.virtual_cards
SET card_settings = COALESCE(card_settings, '{}'::jsonb) || jsonb_build_object(
  'signature',
  LEFT(COALESCE(NULLIF(TRIM(cardholder_name), ''), ''), 32)
)
WHERE COALESCE(card_settings, '{}'::jsonb) ? 'signature' = false;

CREATE OR REPLACE FUNCTION public.update_my_virtual_card_controls(
  p_hide_details BOOLEAN DEFAULT NULL,
  p_lock_card BOOLEAN DEFAULT NULL,
  p_card_settings JSONB DEFAULT NULL
)
RETURNS public.virtual_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_card public.virtual_cards;
  v_settings_patch JSONB := p_card_settings;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.upsert_my_virtual_card(NULL, NULL);

  IF v_settings_patch IS NOT NULL
     AND jsonb_typeof(v_settings_patch) = 'object'
     AND v_settings_patch ? 'signature' THEN
    v_settings_patch := jsonb_set(
      v_settings_patch,
      '{signature}',
      to_jsonb(LEFT(TRIM(COALESCE(v_settings_patch ->> 'signature', '')), 32)),
      true
    );
  END IF;

  UPDATE public.virtual_cards
  SET hide_details = COALESCE(p_hide_details, hide_details),
      is_locked = COALESCE(p_lock_card, is_locked),
      locked_at = CASE
        WHEN p_lock_card IS TRUE THEN now()
        WHEN p_lock_card IS FALSE THEN NULL
        ELSE locked_at
      END,
      card_settings = CASE
        WHEN v_settings_patch IS NULL THEN card_settings
        ELSE COALESCE(card_settings, '{}'::jsonb) || v_settings_patch
      END
  WHERE user_id = v_user_id
  RETURNING * INTO v_card;

  RETURN v_card;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_virtual_card_controls(BOOLEAN, BOOLEAN, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_virtual_card_controls(BOOLEAN, BOOLEAN, JSONB) TO authenticated;
