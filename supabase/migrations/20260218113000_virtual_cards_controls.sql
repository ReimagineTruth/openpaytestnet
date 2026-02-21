ALTER TABLE public.virtual_cards
ADD COLUMN IF NOT EXISTS hide_details BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS card_settings JSONB NOT NULL DEFAULT '{"allow_checkout": true}'::jsonb;

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.upsert_my_virtual_card(NULL, NULL);

  UPDATE public.virtual_cards
  SET hide_details = COALESCE(p_hide_details, hide_details),
      is_locked = COALESCE(p_lock_card, is_locked),
      locked_at = CASE
        WHEN p_lock_card IS TRUE THEN now()
        WHEN p_lock_card IS FALSE THEN NULL
        ELSE locked_at
      END,
      card_settings = CASE
        WHEN p_card_settings IS NULL THEN card_settings
        ELSE COALESCE(card_settings, '{}'::jsonb) || p_card_settings
      END
  WHERE user_id = v_user_id
  RETURNING * INTO v_card;

  RETURN v_card;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_with_virtual_card_checkout(
  p_card_number TEXT,
  p_expiry_month INTEGER,
  p_expiry_year INTEGER,
  p_cvc TEXT,
  p_receiver_id UUID,
  p_amount NUMERIC,
  p_note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sender_balance NUMERIC(12,2);
  v_receiver_balance NUMERIC(12,2);
  v_transaction_id UUID;
  v_sanitized_card_number TEXT := regexp_replace(COALESCE(p_card_number, ''), '\D', '', 'g');
  v_sanitized_cvc TEXT := regexp_replace(COALESCE(p_cvc, ''), '\D', '', 'g');
  v_expiry_end DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_receiver_id IS NULL THEN
    RAISE EXCEPTION 'Receiver required';
  END IF;

  IF p_receiver_id = v_user_id THEN
    RAISE EXCEPTION 'Cannot pay your own checkout link';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF char_length(v_sanitized_card_number) <> 16 THEN
    RAISE EXCEPTION 'Card number must be 16 digits';
  END IF;

  IF p_expiry_month IS NULL OR p_expiry_month < 1 OR p_expiry_month > 12 THEN
    RAISE EXCEPTION 'Invalid expiry month';
  END IF;

  IF p_expiry_year IS NULL OR p_expiry_year < 2026 THEN
    RAISE EXCEPTION 'Invalid expiry year';
  END IF;

  IF char_length(v_sanitized_cvc) <> 3 THEN
    RAISE EXCEPTION 'Invalid CVC';
  END IF;

  v_expiry_end := (make_date(p_expiry_year, p_expiry_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  IF v_expiry_end < CURRENT_DATE THEN
    RAISE EXCEPTION 'Card expired';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.virtual_cards vc
    WHERE vc.user_id = v_user_id
      AND vc.card_number = v_sanitized_card_number
      AND vc.expiry_month = p_expiry_month
      AND vc.expiry_year = p_expiry_year
      AND vc.cvc = v_sanitized_cvc
      AND vc.is_active = true
      AND vc.is_locked = false
      AND COALESCE((vc.card_settings ->> 'allow_checkout')::BOOLEAN, true) = true
  ) THEN
    RAISE EXCEPTION 'Card locked, disabled, or invalid details';
  END IF;

  SELECT balance INTO v_sender_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_sender_balance IS NULL THEN
    RAISE EXCEPTION 'Sender wallet not found';
  END IF;

  SELECT balance INTO v_receiver_balance
  FROM public.wallets
  WHERE user_id = p_receiver_id
  FOR UPDATE;

  IF v_receiver_balance IS NULL THEN
    RAISE EXCEPTION 'Recipient wallet not found';
  END IF;

  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.wallets
  SET balance = v_sender_balance - p_amount,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE public.wallets
  SET balance = v_receiver_balance + p_amount,
      updated_at = now()
  WHERE user_id = p_receiver_id;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
  VALUES (
    v_user_id,
    p_receiver_id,
    p_amount,
    CONCAT('Virtual card payment | ', COALESCE(p_note, '')),
    'completed'
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_virtual_card_controls(BOOLEAN, BOOLEAN, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_virtual_card_controls(BOOLEAN, BOOLEAN, JSONB) TO authenticated;

