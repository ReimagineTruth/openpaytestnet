CREATE OR REPLACE FUNCTION public.transfer_funds(
  p_sender_id UUID,
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
  v_sender_balance NUMERIC(12,2);
  v_receiver_balance NUMERIC(12,2);
  v_transaction_id UUID;
BEGIN
  IF p_sender_id IS NULL OR p_receiver_id IS NULL THEN
    RAISE EXCEPTION 'Missing sender or receiver';
  END IF;

  IF p_sender_id = p_receiver_id THEN
    RAISE EXCEPTION 'Cannot send to yourself';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT balance INTO v_sender_balance
  FROM public.wallets
  WHERE user_id = p_sender_id
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
  WHERE user_id = p_sender_id;

  UPDATE public.wallets
  SET balance = v_receiver_balance + p_amount,
      updated_at = now()
  WHERE user_id = p_receiver_id;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
  VALUES (p_sender_id, p_receiver_id, p_amount, COALESCE(p_note, ''), 'completed')
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_funds(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_funds(UUID, UUID, NUMERIC, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.admin_self_send_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  reviewed_by_email TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_self_send_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_refund_self_send(
  p_transaction_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT '',
  p_admin_email TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_refund_tx_id UUID;
  v_wallet_balance NUMERIC(12,2);
BEGIN
  IF p_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Transaction ID is required';
  END IF;

  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT *
  INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_tx.sender_id IS DISTINCT FROM v_tx.receiver_id THEN
    RAISE EXCEPTION 'Only self-send transactions can be reviewed here';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_self_send_reviews
    WHERE transaction_id = p_transaction_id
  ) THEN
    RAISE EXCEPTION 'Transaction already reviewed';
  END IF;

  IF p_decision = 'approve' THEN
    SELECT balance INTO v_wallet_balance
    FROM public.wallets
    WHERE user_id = v_tx.sender_id
    FOR UPDATE;

    IF v_wallet_balance IS NULL THEN
      RAISE EXCEPTION 'Wallet not found';
    END IF;

    UPDATE public.wallets
    SET balance = v_wallet_balance + v_tx.amount,
        updated_at = now()
    WHERE user_id = v_tx.sender_id;

    INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
    VALUES (
      v_tx.sender_id,
      v_tx.receiver_id,
      v_tx.amount,
      CONCAT('Admin self-send refund for transaction ', v_tx.id::TEXT, '. ', COALESCE(p_reason, '')),
      'refunded'
    )
    RETURNING id INTO v_refund_tx_id;
  END IF;

  INSERT INTO public.admin_self_send_reviews (transaction_id, reviewed_by_email, decision, reason)
  VALUES (p_transaction_id, COALESCE(NULLIF(p_admin_email, ''), 'unknown-admin'), p_decision, COALESCE(p_reason, ''));

  RETURN jsonb_build_object(
    'success', true,
    'decision', p_decision,
    'transaction_id', p_transaction_id,
    'refunded_transaction_id', v_refund_tx_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_self_send(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_refund_self_send(UUID, TEXT, TEXT, TEXT) TO service_role;
