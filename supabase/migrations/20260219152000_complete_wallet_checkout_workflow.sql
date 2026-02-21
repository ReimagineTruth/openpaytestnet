CREATE OR REPLACE FUNCTION public.complete_merchant_checkout_with_transaction(
  p_session_token TEXT,
  p_transaction_id UUID,
  p_note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_user_id UUID := auth.uid();
  v_session public.merchant_checkout_sessions;
  v_tx public.transactions;
  v_existing_tx UUID;
BEGIN
  IF v_buyer_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Transaction id is required';
  END IF;

  SELECT *
  INTO v_session
  FROM public.merchant_checkout_sessions mcs
  WHERE mcs.session_token = TRIM(COALESCE(p_session_token, ''))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout session not found';
  END IF;

  IF v_session.status = 'paid' THEN
    SELECT mp.transaction_id
    INTO v_existing_tx
    FROM public.merchant_payments mp
    WHERE mp.session_id = v_session.id
    LIMIT 1;

    RETURN COALESCE(v_existing_tx, p_transaction_id);
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Checkout session is not open';
  END IF;

  IF v_session.expires_at < now() THEN
    UPDATE public.merchant_checkout_sessions
    SET status = 'expired'
    WHERE id = v_session.id;
    RAISE EXCEPTION 'Checkout session expired';
  END IF;

  IF v_session.merchant_user_id = v_buyer_user_id THEN
    RAISE EXCEPTION 'Merchant cannot pay own checkout';
  END IF;

  SELECT *
  INTO v_tx
  FROM public.transactions t
  WHERE t.id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'Transaction is not completed';
  END IF;

  IF v_tx.sender_id <> v_buyer_user_id THEN
    RAISE EXCEPTION 'Transaction sender does not match buyer';
  END IF;

  IF v_tx.receiver_id <> v_session.merchant_user_id THEN
    RAISE EXCEPTION 'Transaction receiver does not match merchant';
  END IF;

  IF ABS(COALESCE(v_tx.amount, 0) - COALESCE(v_session.total_amount, 0)) > 0.02 THEN
    RAISE EXCEPTION 'Transaction amount does not match checkout amount';
  END IF;

  INSERT INTO public.merchant_payments (
    session_id,
    merchant_user_id,
    buyer_user_id,
    transaction_id,
    amount,
    currency,
    key_mode,
    status
  )
  VALUES (
    v_session.id,
    v_session.merchant_user_id,
    v_buyer_user_id,
    v_tx.id,
    v_session.total_amount,
    v_session.currency,
    v_session.key_mode,
    'succeeded'
  )
  ON CONFLICT (session_id) DO NOTHING;

  UPDATE public.merchant_checkout_sessions
  SET status = 'paid',
      paid_at = now()
  WHERE id = v_session.id;

  IF COALESCE(TRIM(p_note), '') <> '' THEN
    UPDATE public.transactions
    SET note = CONCAT(COALESCE(note, ''), ' | ', TRIM(p_note))
    WHERE id = v_tx.id;
  END IF;

  RETURN v_tx.id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_merchant_checkout_with_transaction(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_merchant_checkout_with_transaction(TEXT, UUID, TEXT) TO authenticated;
