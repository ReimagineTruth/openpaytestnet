CREATE OR REPLACE FUNCTION public.get_my_pos_dashboard(
  p_mode TEXT DEFAULT 'live'
)
RETURNS TABLE (
  merchant_name TEXT,
  merchant_username TEXT,
  wallet_balance NUMERIC,
  today_total_received NUMERIC,
  today_transactions INTEGER,
  refunded_transactions INTEGER,
  key_mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, 'live')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  PERFORM public.upsert_my_merchant_profile(NULL, NULL, NULL, NULL);

  RETURN QUERY
  SELECT
    mpf.merchant_name,
    mpf.merchant_username,
    COALESCE(w.balance, 0)::NUMERIC AS wallet_balance,
    COALESCE(SUM(CASE WHEN p.status = 'succeeded' THEN p.amount ELSE 0 END), 0)::NUMERIC AS today_total_received,
    COUNT(*) FILTER (WHERE p.status = 'succeeded')::INTEGER AS today_transactions,
    COUNT(*) FILTER (WHERE p.status = 'refunded')::INTEGER AS refunded_transactions,
    v_mode AS key_mode
  FROM public.merchant_profiles mpf
  LEFT JOIN public.wallets w
    ON w.user_id = mpf.user_id
  LEFT JOIN public.merchant_payments p
    ON p.merchant_user_id = mpf.user_id
   AND p.key_mode = v_mode
   AND p.created_at >= date_trunc('day', now())
  WHERE mpf.user_id = v_user_id
  GROUP BY mpf.merchant_name, mpf.merchant_username, w.balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_my_pos_checkout_session(
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'USD',
  p_mode TEXT DEFAULT 'live',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_qr_style TEXT DEFAULT 'dynamic',
  p_expires_in_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  session_id UUID,
  session_token TEXT,
  total_amount NUMERIC,
  currency TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  qr_payload TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, 'live')));
  v_currency TEXT := UPPER(TRIM(COALESCE(p_currency, 'USD')));
  v_qr_style TEXT := LOWER(TRIM(COALESCE(p_qr_style, 'dynamic')));
  v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  v_expires_minutes INTEGER := GREATEST(5, LEAST(COALESCE(p_expires_in_minutes, 30), 10080));
  v_session public.merchant_checkout_sessions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  IF char_length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be 3 letters';
  END IF;

  IF v_qr_style NOT IN ('dynamic', 'static') THEN
    RAISE EXCEPTION 'QR style must be dynamic or static';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  PERFORM public.upsert_my_merchant_profile(NULL, NULL, NULL, v_currency);

  IF v_qr_style = 'static' THEN
    v_expires_minutes := GREATEST(v_expires_minutes, 1440);
  END IF;

  INSERT INTO public.merchant_checkout_sessions (
    merchant_user_id,
    key_mode,
    session_token,
    status,
    currency,
    subtotal_amount,
    fee_amount,
    total_amount,
    customer_email,
    customer_name,
    metadata,
    expires_at
  )
  VALUES (
    v_user_id,
    v_mode,
    'opsess_' || public.random_token_hex(24),
    'open',
    v_currency,
    v_amount,
    0,
    v_amount,
    NULLIF(TRIM(COALESCE(p_customer_email, '')), ''),
    NULLIF(TRIM(COALESCE(p_customer_name, '')), ''),
    jsonb_strip_nulls(
      jsonb_build_object(
        'channel', 'pos',
        'qr_style', v_qr_style,
        'reference', NULLIF(TRIM(COALESCE(p_reference, '')), '')
      )
    ),
    now() + make_interval(mins => v_expires_minutes)
  )
  RETURNING * INTO v_session;

  INSERT INTO public.merchant_checkout_session_items (
    session_id,
    product_id,
    item_name,
    unit_amount,
    quantity,
    line_total
  )
  VALUES (
    v_session.id,
    NULL,
    'POS Payment',
    v_amount,
    1,
    v_amount
  );

  RETURN QUERY
  SELECT
    v_session.id,
    v_session.session_token,
    v_session.total_amount,
    v_session.currency,
    v_session.status,
    v_session.expires_at,
    'openpay-pos://checkout/' || v_session.session_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_pos_transactions(
  p_mode TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  payment_id UUID,
  payment_created_at TIMESTAMPTZ,
  payment_status TEXT,
  amount NUMERIC,
  currency TEXT,
  payer_user_id UUID,
  payer_name TEXT,
  payer_username TEXT,
  transaction_id UUID,
  transaction_note TEXT,
  session_token TEXT,
  customer_name TEXT,
  customer_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, '')));
  v_status TEXT := LOWER(TRIM(COALESCE(p_status, '')));
  v_search TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode = '' THEN
    v_mode := NULL;
  END IF;
  IF v_status = '' THEN
    v_status := NULL;
  END IF;

  RETURN QUERY
  SELECT
    mp.id AS payment_id,
    mp.created_at AS payment_created_at,
    mp.status AS payment_status,
    mp.amount,
    mp.currency,
    mp.buyer_user_id AS payer_user_id,
    COALESCE(NULLIF(TRIM(COALESCE(mcs.customer_name, '')), ''), pr.full_name, 'OpenPay Customer') AS payer_name,
    pr.username AS payer_username,
    mp.transaction_id,
    tx.note AS transaction_note,
    mcs.session_token,
    mcs.customer_name,
    mcs.customer_email
  FROM public.merchant_payments mp
  JOIN public.merchant_checkout_sessions mcs
    ON mcs.id = mp.session_id
  LEFT JOIN public.transactions tx
    ON tx.id = mp.transaction_id
  LEFT JOIN public.profiles pr
    ON pr.id = mp.buyer_user_id
  WHERE mp.merchant_user_id = v_user_id
    AND (v_mode IS NULL OR mp.key_mode = v_mode)
    AND (v_status IS NULL OR LOWER(mp.status) = v_status)
    AND (
      v_search IS NULL
      OR mp.transaction_id::TEXT ILIKE ('%' || v_search || '%')
      OR mcs.session_token ILIKE ('%' || v_search || '%')
      OR COALESCE(mcs.customer_name, '') ILIKE ('%' || v_search || '%')
      OR COALESCE(mcs.customer_email, '') ILIKE ('%' || v_search || '%')
      OR COALESCE(pr.username, '') ILIKE ('%' || v_search || '%')
      OR COALESCE(pr.full_name, '') ILIKE ('%' || v_search || '%')
    )
  ORDER BY mp.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 300)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_my_pos_transaction(
  p_payment_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS TABLE (
  refund_transaction_id UUID,
  new_status TEXT,
  refunded_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_payment public.merchant_payments;
  v_session public.merchant_checkout_sessions;
  v_merchant_balance NUMERIC(12,2);
  v_buyer_balance NUMERIC(12,2);
  v_refund_tx_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment ID is required';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.merchant_payments
  WHERE id = p_payment_id
    AND merchant_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.status = 'refunded' THEN
    RAISE EXCEPTION 'Payment already refunded';
  END IF;

  IF v_payment.status <> 'succeeded' THEN
    RAISE EXCEPTION 'Only succeeded payments can be refunded';
  END IF;

  SELECT *
  INTO v_session
  FROM public.merchant_checkout_sessions
  WHERE id = v_payment.session_id
  FOR UPDATE;

  SELECT w.balance
  INTO v_merchant_balance
  FROM public.wallets w
  WHERE w.user_id = v_user_id
  FOR UPDATE;

  SELECT w.balance
  INTO v_buyer_balance
  FROM public.wallets w
  WHERE w.user_id = v_payment.buyer_user_id
  FOR UPDATE;

  IF v_merchant_balance IS NULL OR v_buyer_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_merchant_balance < v_payment.amount THEN
    RAISE EXCEPTION 'Insufficient merchant wallet balance for refund';
  END IF;

  UPDATE public.wallets
  SET balance = v_merchant_balance - v_payment.amount,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE public.wallets
  SET balance = v_buyer_balance + v_payment.amount,
      updated_at = now()
  WHERE user_id = v_payment.buyer_user_id;

  INSERT INTO public.transactions (
    sender_id,
    receiver_id,
    amount,
    note,
    status
  )
  VALUES (
    v_user_id,
    v_payment.buyer_user_id,
    v_payment.amount,
    CONCAT(
      'POS refund for payment ',
      v_payment.id::TEXT,
      CASE WHEN NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN '' ELSE ' | ' || TRIM(p_reason) END
    ),
    'refunded'
  )
  RETURNING id INTO v_refund_tx_id;

  UPDATE public.merchant_payments
  SET status = 'refunded'
  WHERE id = v_payment.id;

  UPDATE public.merchant_checkout_sessions
  SET metadata = COALESCE(v_session.metadata, '{}'::jsonb) || jsonb_build_object(
    'refunded_at', now(),
    'refund_transaction_id', v_refund_tx_id::TEXT
  ),
      updated_at = now()
  WHERE id = v_session.id;

  RETURN QUERY
  SELECT
    v_refund_tx_id,
    'refunded'::TEXT,
    now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_pos_dashboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_my_pos_checkout_session(NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_pos_transactions(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_my_pos_transaction(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_pos_dashboard(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_my_pos_checkout_session(NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_pos_transactions(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_my_pos_transaction(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
