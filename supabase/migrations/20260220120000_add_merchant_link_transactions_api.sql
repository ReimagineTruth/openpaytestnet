CREATE OR REPLACE FUNCTION public.get_my_merchant_link_transactions(
  p_mode TEXT DEFAULT NULL,
  p_payment_link_token TEXT DEFAULT NULL,
  p_session_token TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  payment_id UUID,
  payment_created_at TIMESTAMPTZ,
  payment_status TEXT,
  payment_amount NUMERIC,
  payment_currency TEXT,
  payment_mode TEXT,
  transaction_id UUID,
  transaction_status TEXT,
  transaction_note TEXT,
  transaction_created_at TIMESTAMPTZ,
  checkout_session_id UUID,
  checkout_session_token TEXT,
  checkout_status TEXT,
  checkout_paid_at TIMESTAMPTZ,
  payment_link_id UUID,
  payment_link_token TEXT,
  payment_link_title TEXT,
  payment_link_description TEXT,
  payment_link_type TEXT,
  customer_user_id UUID,
  customer_name TEXT,
  customer_username TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  api_key_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, '')));
  v_link_token TEXT := NULLIF(TRIM(COALESCE(p_payment_link_token, '')), '');
  v_session_token TEXT := NULLIF(TRIM(COALESCE(p_session_token, '')), '');
  v_status TEXT := LOWER(TRIM(COALESCE(p_status, '')));
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
    mp.amount AS payment_amount,
    mp.currency AS payment_currency,
    mp.key_mode AS payment_mode,
    tx.id AS transaction_id,
    tx.status AS transaction_status,
    tx.note AS transaction_note,
    tx.created_at AS transaction_created_at,
    mcs.id AS checkout_session_id,
    mcs.session_token AS checkout_session_token,
    mcs.status AS checkout_status,
    mcs.paid_at AS checkout_paid_at,
    mpl.id AS payment_link_id,
    mp.payment_link_token AS payment_link_token,
    mpl.title AS payment_link_title,
    mpl.description AS payment_link_description,
    mpl.link_type AS payment_link_type,
    mp.buyer_user_id AS customer_user_id,
    COALESCE(NULLIF(TRIM(COALESCE(mcs.customer_name, '')), ''), buyer.full_name, 'OpenPay Customer') AS customer_name,
    buyer.username AS customer_username,
    mcs.customer_email AS customer_email,
    NULLIF(TRIM(COALESCE(mcs.metadata->>'customer_phone', '')), '') AS customer_phone,
    NULLIF(TRIM(COALESCE(mcs.metadata->>'customer_address', '')), '') AS customer_address,
    mp.api_key_id AS api_key_id
  FROM public.merchant_payments mp
  JOIN public.merchant_checkout_sessions mcs
    ON mcs.id = mp.session_id
  LEFT JOIN public.transactions tx
    ON tx.id = mp.transaction_id
  LEFT JOIN public.merchant_payment_links mpl
    ON mpl.id = mp.payment_link_id
  LEFT JOIN public.profiles buyer
    ON buyer.id = mp.buyer_user_id
  WHERE mp.merchant_user_id = v_user_id
    AND (v_mode IS NULL OR mp.key_mode = v_mode)
    AND (v_status IS NULL OR LOWER(mp.status) = v_status)
    AND (v_link_token IS NULL OR mp.payment_link_token = v_link_token)
    AND (v_session_token IS NULL OR mcs.session_token = v_session_token)
  ORDER BY mp.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_merchant_link_transactions(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_merchant_link_transactions(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
