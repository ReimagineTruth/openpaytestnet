CREATE OR REPLACE FUNCTION public.random_token_hex(p_bytes INTEGER DEFAULT 24)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_len INTEGER := GREATEST(1, COALESCE(p_bytes, 24)) * 2;
  v_out TEXT := '';
BEGIN
  WHILE char_length(v_out) < v_target_len LOOP
    v_out := v_out || md5(random()::TEXT || clock_timestamp()::TEXT || txid_current()::TEXT);
  END LOOP;
  RETURN SUBSTRING(v_out FROM 1 FOR v_target_len);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_merchant_api_key(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate TEXT;
BEGIN
  LOOP
    v_candidate := p_prefix || public.random_token_hex(24);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.merchant_api_keys WHERE publishable_key = v_candidate)
          AND NOT EXISTS (SELECT 1 FROM public.merchant_checkout_sessions WHERE session_token = v_candidate);
  END LOOP;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_my_merchant_api_key(
  p_mode TEXT,
  p_key_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  key_mode TEXT,
  publishable_key TEXT,
  secret_key TEXT,
  key_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, '')));
  v_key_name TEXT := COALESCE(NULLIF(TRIM(p_key_name), ''), 'Default key');
  v_publishable_key TEXT;
  v_secret_key TEXT;
  v_row public.merchant_api_keys;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  PERFORM public.upsert_my_merchant_profile();

  v_publishable_key := public.generate_merchant_api_key('opk_' || v_mode || '_');
  v_secret_key := 'osk_' || v_mode || '_' || public.random_token_hex(32);

  INSERT INTO public.merchant_api_keys (
    merchant_user_id,
    key_mode,
    key_name,
    publishable_key,
    secret_key_hash,
    secret_key_last4
  )
  VALUES (
    v_user_id,
    v_mode,
    v_key_name,
    v_publishable_key,
    md5(v_secret_key),
    RIGHT(v_secret_key, 4)
  )
  RETURNING * INTO v_row;

  RETURN QUERY
  SELECT v_row.id, v_row.key_mode, v_row.publishable_key, v_secret_key, v_row.key_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_merchant_checkout_session(
  p_secret_key TEXT,
  p_mode TEXT,
  p_currency TEXT,
  p_items JSONB,
  p_customer_email TEXT DEFAULT NULL,
  p_customer_name TEXT DEFAULT NULL,
  p_success_url TEXT DEFAULT NULL,
  p_cancel_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_expires_in_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
  session_id UUID,
  session_token TEXT,
  total_amount NUMERIC,
  currency TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, '')));
  v_currency TEXT := UPPER(TRIM(COALESCE(p_currency, 'USD')));
  v_secret_hash TEXT := md5(COALESCE(p_secret_key, ''));
  v_merchant_user_id UUID;
  v_api_key_id UUID;
  v_session public.merchant_checkout_sessions;
  v_item JSONB;
  v_product public.merchant_products;
  v_quantity INTEGER;
  v_line_total NUMERIC(12,2);
  v_total NUMERIC(12,2) := 0;
  v_expires_minutes INTEGER := GREATEST(5, LEAST(COALESCE(p_expires_in_minutes, 60), 10080));
BEGIN
  IF v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  IF char_length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be 3 letters';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  SELECT mak.merchant_user_id, mak.id
  INTO v_merchant_user_id, v_api_key_id
  FROM public.merchant_api_keys mak
  WHERE mak.secret_key_hash = v_secret_hash
    AND mak.key_mode = v_mode
    AND mak.is_active = true
  LIMIT 1;

  IF v_merchant_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid merchant API key for mode %', v_mode;
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
    success_url,
    cancel_url,
    metadata,
    expires_at
  )
  VALUES (
    v_merchant_user_id,
    v_mode,
    'opsess_' || public.random_token_hex(24),
    'open',
    v_currency,
    0,
    0,
    0,
    NULLIF(TRIM(COALESCE(p_customer_email, '')), ''),
    NULLIF(TRIM(COALESCE(p_customer_name, '')), ''),
    NULLIF(TRIM(COALESCE(p_success_url, '')), ''),
    NULLIF(TRIM(COALESCE(p_cancel_url, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb),
    now() + make_interval(mins => v_expires_minutes)
  )
  RETURNING * INTO v_session;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT *
    INTO v_product
    FROM public.merchant_products mp
    WHERE mp.id = (v_item->>'product_id')::UUID
      AND mp.merchant_user_id = v_merchant_user_id
      AND mp.is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid product_id in items payload';
    END IF;

    v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
    IF v_quantity < 1 OR v_quantity > 1000 THEN
      RAISE EXCEPTION 'Quantity must be between 1 and 1000';
    END IF;

    IF UPPER(v_product.currency) <> v_currency THEN
      RAISE EXCEPTION 'Product currency mismatch for product %', v_product.id;
    END IF;

    v_line_total := ROUND(v_product.unit_amount * v_quantity, 2);

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
      v_product.id,
      v_product.product_name,
      v_product.unit_amount,
      v_quantity,
      v_line_total
    );

    v_total := v_total + v_line_total;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Session total must be positive';
  END IF;

  UPDATE public.merchant_checkout_sessions
  SET subtotal_amount = v_total,
      total_amount = v_total
  WHERE id = v_session.id
  RETURNING * INTO v_session;

  UPDATE public.merchant_api_keys
  SET last_used_at = now()
  WHERE id = v_api_key_id;

  RETURN QUERY
  SELECT v_session.id, v_session.session_token, v_session.total_amount, v_session.currency, v_session.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_merchant_payment_link(
  p_secret_key TEXT,
  p_mode TEXT,
  p_link_type TEXT,
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'USD',
  p_custom_amount NUMERIC DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_collect_customer_name BOOLEAN DEFAULT true,
  p_collect_customer_email BOOLEAN DEFAULT true,
  p_collect_phone BOOLEAN DEFAULT false,
  p_collect_address BOOLEAN DEFAULT false,
  p_after_payment_type TEXT DEFAULT 'confirmation',
  p_confirmation_message TEXT DEFAULT NULL,
  p_redirect_url TEXT DEFAULT NULL,
  p_call_to_action TEXT DEFAULT 'Pay',
  p_expires_in_minutes INTEGER DEFAULT NULL
)
RETURNS TABLE (
  link_id UUID,
  link_token TEXT,
  total_amount NUMERIC,
  currency TEXT,
  key_mode TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, '')));
  v_link_type TEXT := LOWER(TRIM(COALESCE(p_link_type, '')));
  v_after_payment_type TEXT := LOWER(TRIM(COALESCE(p_after_payment_type, 'confirmation')));
  v_currency TEXT := UPPER(TRIM(COALESCE(p_currency, 'USD')));
  v_secret_hash TEXT := md5(COALESCE(p_secret_key, ''));
  v_merchant_user_id UUID;
  v_link public.merchant_payment_links;
  v_item JSONB;
  v_product public.merchant_products;
  v_quantity INTEGER;
  v_line_total NUMERIC(12,2);
  v_total NUMERIC(12,2) := 0;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  IF v_link_type NOT IN ('products', 'custom_amount') THEN
    RAISE EXCEPTION 'Link type must be products or custom_amount';
  END IF;

  IF v_after_payment_type NOT IN ('confirmation', 'redirect') THEN
    RAISE EXCEPTION 'After payment type must be confirmation or redirect';
  END IF;

  IF char_length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be 3 letters';
  END IF;

  SELECT mak.merchant_user_id
  INTO v_merchant_user_id
  FROM public.merchant_api_keys mak
  WHERE mak.secret_key_hash = v_secret_hash
    AND mak.key_mode = v_mode
    AND mak.is_active = true
  LIMIT 1;

  IF v_merchant_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid merchant API key for mode %', v_mode;
  END IF;

  IF p_expires_in_minutes IS NOT NULL THEN
    v_expires_at := now() + make_interval(mins => GREATEST(5, LEAST(p_expires_in_minutes, 525600)));
  END IF;

  INSERT INTO public.merchant_payment_links (
    merchant_user_id,
    key_mode,
    link_token,
    link_type,
    title,
    description,
    currency,
    custom_amount,
    collect_customer_name,
    collect_customer_email,
    collect_phone,
    collect_address,
    after_payment_type,
    confirmation_message,
    redirect_url,
    call_to_action,
    expires_at
  )
  VALUES (
    v_merchant_user_id,
    v_mode,
    'oplink_' || public.random_token_hex(24),
    v_link_type,
    COALESCE(NULLIF(TRIM(p_title), ''), 'OpenPay Payment'),
    COALESCE(NULLIF(TRIM(p_description), ''), ''),
    v_currency,
    p_custom_amount,
    COALESCE(p_collect_customer_name, true),
    COALESCE(p_collect_customer_email, true),
    COALESCE(p_collect_phone, false),
    COALESCE(p_collect_address, false),
    v_after_payment_type,
    COALESCE(NULLIF(TRIM(p_confirmation_message), ''), 'Thanks for your payment.'),
    NULLIF(TRIM(COALESCE(p_redirect_url, '')), ''),
    COALESCE(NULLIF(TRIM(p_call_to_action), ''), 'Pay'),
    v_expires_at
  )
  RETURNING * INTO v_link;

  IF v_link_type = 'custom_amount' THEN
    IF p_custom_amount IS NULL OR p_custom_amount <= 0 THEN
      RAISE EXCEPTION 'Custom amount must be greater than 0';
    END IF;
    v_total := ROUND(p_custom_amount, 2);
  ELSE
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
      RAISE EXCEPTION 'At least one product item is required';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      SELECT *
      INTO v_product
      FROM public.merchant_products mp
      WHERE mp.id = (v_item->>'product_id')::UUID
        AND mp.merchant_user_id = v_merchant_user_id
        AND mp.is_active = true
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid product_id in items payload';
      END IF;

      v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
      IF v_quantity < 1 OR v_quantity > 1000 THEN
        RAISE EXCEPTION 'Quantity must be between 1 and 1000';
      END IF;

      IF UPPER(v_product.currency) <> v_currency THEN
        RAISE EXCEPTION 'Product currency mismatch for product %', v_product.id;
      END IF;

      v_line_total := ROUND(v_product.unit_amount * v_quantity, 2);

      INSERT INTO public.merchant_payment_link_items (
        link_id,
        product_id,
        item_name,
        unit_amount,
        quantity,
        line_total
      )
      VALUES (
        v_link.id,
        v_product.id,
        v_product.product_name,
        v_product.unit_amount,
        v_quantity,
        v_line_total
      );

      v_total := v_total + v_line_total;
    END LOOP;
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Payment link total must be positive';
  END IF;

  RETURN QUERY
  SELECT v_link.id, v_link.link_token, v_total, v_link.currency, v_link.key_mode, v_link.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_checkout_session_from_payment_link(
  p_link_token TEXT,
  p_customer_email TEXT DEFAULT NULL,
  p_customer_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id UUID,
  session_token TEXT,
  total_amount NUMERIC,
  currency TEXT,
  expires_at TIMESTAMPTZ,
  after_payment_type TEXT,
  confirmation_message TEXT,
  redirect_url TEXT,
  call_to_action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.merchant_payment_links;
  v_session public.merchant_checkout_sessions;
  v_total NUMERIC(12,2) := 0;
BEGIN
  SELECT *
  INTO v_link
  FROM public.merchant_payment_links mpl
  WHERE mpl.link_token = TRIM(COALESCE(p_link_token, ''))
    AND mpl.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment link not found';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION 'Payment link expired';
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
    success_url,
    cancel_url,
    metadata,
    expires_at
  )
  VALUES (
    v_link.merchant_user_id,
    v_link.key_mode,
    'opsess_' || public.random_token_hex(24),
    'open',
    v_link.currency,
    0,
    0,
    0,
    NULLIF(TRIM(COALESCE(p_customer_email, '')), ''),
    NULLIF(TRIM(COALESCE(p_customer_name, '')), ''),
    NULL,
    NULL,
    jsonb_build_object(
      'payment_link_id', v_link.id,
      'payment_link_token', v_link.link_token,
      'after_payment_type', v_link.after_payment_type,
      'confirmation_message', v_link.confirmation_message,
      'redirect_url', v_link.redirect_url,
      'call_to_action', v_link.call_to_action
    ),
    now() + INTERVAL '60 minutes'
  )
  RETURNING * INTO v_session;

  IF v_link.link_type = 'custom_amount' THEN
    v_total := COALESCE(v_link.custom_amount, 0);

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
      v_link.title,
      v_total,
      1,
      v_total
    );
  ELSE
    INSERT INTO public.merchant_checkout_session_items (
      session_id,
      product_id,
      item_name,
      unit_amount,
      quantity,
      line_total
    )
    SELECT
      v_session.id,
      mpli.product_id,
      mpli.item_name,
      mpli.unit_amount,
      mpli.quantity,
      mpli.line_total
    FROM public.merchant_payment_link_items mpli
    WHERE mpli.link_id = v_link.id;

    SELECT COALESCE(SUM(mpli.line_total), 0)
    INTO v_total
    FROM public.merchant_payment_link_items mpli
    WHERE mpli.link_id = v_link.id;
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Payment link total must be positive';
  END IF;

  UPDATE public.merchant_checkout_sessions
  SET subtotal_amount = v_total,
      total_amount = v_total
  WHERE id = v_session.id
  RETURNING * INTO v_session;

  RETURN QUERY
  SELECT
    v_session.id,
    v_session.session_token,
    v_session.total_amount,
    v_session.currency,
    v_session.expires_at,
    v_link.after_payment_type,
    v_link.confirmation_message,
    v_link.redirect_url,
    v_link.call_to_action;
END;
$$;
