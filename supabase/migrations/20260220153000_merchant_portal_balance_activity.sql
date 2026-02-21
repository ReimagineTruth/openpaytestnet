CREATE TABLE IF NOT EXISTS public.merchant_balance_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_mode TEXT NOT NULL CHECK (key_mode IN ('sandbox', 'live')),
  destination TEXT NOT NULL CHECK (destination IN ('wallet', 'savings')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_balance_transfers_user_mode_created
ON public.merchant_balance_transfers (merchant_user_id, key_mode, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_pos_api_settings (
  merchant_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sandbox_api_key_id UUID REFERENCES public.merchant_api_keys(id) ON DELETE SET NULL,
  live_api_key_id UUID REFERENCES public.merchant_api_keys(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_balance_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_pos_api_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_balance_transfers'
      AND policyname = 'Users can view own merchant balance transfers'
  ) THEN
    CREATE POLICY "Users can view own merchant balance transfers"
      ON public.merchant_balance_transfers
      FOR SELECT TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_balance_transfers'
      AND policyname = 'Users can insert own merchant balance transfers'
  ) THEN
    CREATE POLICY "Users can insert own merchant balance transfers"
      ON public.merchant_balance_transfers
      FOR INSERT TO authenticated
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_pos_api_settings'
      AND policyname = 'Users can view own merchant pos api settings'
  ) THEN
    CREATE POLICY "Users can view own merchant pos api settings"
      ON public.merchant_pos_api_settings
      FOR SELECT TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_pos_api_settings'
      AND policyname = 'Users can insert own merchant pos api settings'
  ) THEN
    CREATE POLICY "Users can insert own merchant pos api settings"
      ON public.merchant_pos_api_settings
      FOR INSERT TO authenticated
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_pos_api_settings'
      AND policyname = 'Users can update own merchant pos api settings'
  ) THEN
    CREATE POLICY "Users can update own merchant pos api settings"
      ON public.merchant_pos_api_settings
      FOR UPDATE TO authenticated
      USING (merchant_user_id = auth.uid())
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE public.merchant_checkout_sessions
ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES public.merchant_api_keys(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.upsert_my_pos_api_key(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.upsert_my_pos_api_key(
  p_mode TEXT,
  p_secret_key TEXT
)
RETURNS TABLE (
  mode TEXT,
  api_key_id UUID,
  key_name TEXT,
  publishable_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, '')));
  v_secret_hash TEXT := md5(COALESCE(p_secret_key, ''));
  v_key public.merchant_api_keys;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_secret_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Secret key is required';
  END IF;

  SELECT *
  INTO v_key
  FROM public.merchant_api_keys mak
  WHERE mak.merchant_user_id = v_user_id
    AND mak.key_mode = v_mode
    AND mak.is_active = true
    AND mak.secret_key_hash = v_secret_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or inactive API key for mode %', v_mode;
  END IF;

  INSERT INTO public.merchant_pos_api_settings (merchant_user_id, sandbox_api_key_id, live_api_key_id, updated_at)
  VALUES (
    v_user_id,
    CASE WHEN v_mode = 'sandbox' THEN v_key.id ELSE NULL END,
    CASE WHEN v_mode = 'live' THEN v_key.id ELSE NULL END,
    now()
  )
  ON CONFLICT (merchant_user_id) DO UPDATE
  SET
    sandbox_api_key_id = CASE
      WHEN v_mode = 'sandbox' THEN v_key.id
      ELSE public.merchant_pos_api_settings.sandbox_api_key_id
    END,
    live_api_key_id = CASE
      WHEN v_mode = 'live' THEN v_key.id
      ELSE public.merchant_pos_api_settings.live_api_key_id
    END,
    updated_at = now();

  RETURN QUERY
  SELECT v_mode, v_key.id, v_key.key_name, v_key.publishable_key;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_pos_api_key_settings();
CREATE OR REPLACE FUNCTION public.get_my_pos_api_key_settings()
RETURNS TABLE (
  sandbox_api_key_id UUID,
  sandbox_key_name TEXT,
  sandbox_publishable_key TEXT,
  live_api_key_id UUID,
  live_key_name TEXT,
  live_publishable_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    cfg.cfg_sandbox_api_key_id AS sandbox_api_key_id,
    sk.key_name,
    sk.publishable_key,
    cfg.cfg_live_api_key_id AS live_api_key_id,
    lk.key_name,
    lk.publishable_key
  FROM (
    SELECT
      mps.sandbox_api_key_id AS cfg_sandbox_api_key_id,
      mps.live_api_key_id AS cfg_live_api_key_id
    FROM public.merchant_pos_api_settings mps
    WHERE mps.merchant_user_id = v_user_id
    LIMIT 1
  ) cfg
  FULL JOIN (SELECT 1 AS keep_row) k ON TRUE
  LEFT JOIN public.merchant_api_keys sk ON sk.id = cfg.cfg_sandbox_api_key_id
  LEFT JOIN public.merchant_api_keys lk ON lk.id = cfg.cfg_live_api_key_id
  LIMIT 1;
END;
$$;

DROP FUNCTION IF EXISTS public.create_my_pos_checkout_session(NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.create_my_pos_checkout_session(NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.create_my_pos_checkout_session(
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'USD',
  p_mode TEXT DEFAULT 'live',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_qr_style TEXT DEFAULT 'dynamic',
  p_expires_in_minutes INTEGER DEFAULT 30,
  p_secret_key TEXT DEFAULT NULL
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
  v_secret_hash TEXT := md5(COALESCE(p_secret_key, ''));
  v_api_key_id UUID;
  v_api_key_ok BOOLEAN := false;
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

  IF NULLIF(TRIM(COALESCE(p_secret_key, '')), '') IS NOT NULL THEN
    SELECT mak.id
    INTO v_api_key_id
    FROM public.merchant_api_keys mak
    WHERE mak.merchant_user_id = v_user_id
      AND mak.key_mode = v_mode
      AND mak.is_active = true
      AND mak.secret_key_hash = v_secret_hash
    LIMIT 1;
  ELSE
    SELECT
      CASE
        WHEN v_mode = 'sandbox' THEN s.sandbox_api_key_id
        ELSE s.live_api_key_id
      END
    INTO v_api_key_id
    FROM public.merchant_pos_api_settings s
    WHERE s.merchant_user_id = v_user_id
    LIMIT 1;
  END IF;

  IF v_api_key_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.merchant_api_keys mak
      WHERE mak.id = v_api_key_id
        AND mak.merchant_user_id = v_user_id
        AND mak.key_mode = v_mode
        AND mak.is_active = true
    )
    INTO v_api_key_ok;
  END IF;

  IF NOT v_api_key_ok THEN
    RAISE EXCEPTION 'Set your % POS API key in Settings first (from Merchant Portal / API keys)', v_mode;
  END IF;

  PERFORM public.upsert_my_merchant_profile(NULL, NULL, NULL, v_currency);

  IF v_qr_style = 'static' THEN
    v_expires_minutes := GREATEST(v_expires_minutes, 1440);
  END IF;

  INSERT INTO public.merchant_checkout_sessions (
    merchant_user_id,
    api_key_id,
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
    v_api_key_id,
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
        'source', 'merchant_pos',
        'api_key_id', v_api_key_id::TEXT,
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

DROP FUNCTION IF EXISTS public.get_my_merchant_balance_overview(TEXT);
CREATE OR REPLACE FUNCTION public.get_my_merchant_balance_overview(
  p_mode TEXT DEFAULT 'live'
)
RETURNS TABLE (
  gross_volume NUMERIC,
  refunded_total NUMERIC,
  transferred_total NUMERIC,
  available_balance NUMERIC,
  wallet_balance NUMERIC,
  savings_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, 'live')));
  v_gross NUMERIC(14,2) := 0;
  v_refunded NUMERIC(14,2) := 0;
  v_transferred NUMERIC(14,2) := 0;
  v_wallet NUMERIC(14,2) := 0;
  v_savings NUMERIC(14,2) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN mp.status = 'succeeded' THEN mp.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN mp.status = 'refunded' THEN mp.amount ELSE 0 END), 0)
  INTO v_gross, v_refunded
  FROM public.merchant_payments mp
  WHERE mp.merchant_user_id = v_user_id
    AND mp.key_mode = v_mode;

  SELECT COALESCE(SUM(mbt.amount), 0)
  INTO v_transferred
  FROM public.merchant_balance_transfers mbt
  WHERE mbt.merchant_user_id = v_user_id
    AND mbt.key_mode = v_mode;

  SELECT COALESCE(w.balance, 0)
  INTO v_wallet
  FROM public.wallets w
  WHERE w.user_id = v_user_id;

  PERFORM public.upsert_my_savings_account();
  SELECT COALESCE(usa.balance, 0)
  INTO v_savings
  FROM public.user_savings_accounts usa
  WHERE usa.user_id = v_user_id;

  RETURN QUERY
  SELECT
    v_gross,
    v_refunded,
    v_transferred,
    GREATEST(v_gross - v_refunded - v_transferred, 0),
    v_wallet,
    v_savings;
END;
$$;

DROP FUNCTION IF EXISTS public.transfer_my_merchant_balance(NUMERIC, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.transfer_my_merchant_balance(
  p_amount NUMERIC,
  p_mode TEXT DEFAULT 'live',
  p_destination TEXT DEFAULT 'wallet',
  p_note TEXT DEFAULT ''
)
RETURNS TABLE (
  transfer_id UUID,
  available_balance NUMERIC,
  wallet_balance NUMERIC,
  savings_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, 'live')));
  v_destination TEXT := LOWER(TRIM(COALESCE(p_destination, 'wallet')));
  v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  v_gross NUMERIC(14,2) := 0;
  v_refunded NUMERIC(14,2) := 0;
  v_transferred NUMERIC(14,2) := 0;
  v_available NUMERIC(14,2) := 0;
  v_wallet NUMERIC(14,2) := 0;
  v_savings NUMERIC(14,2) := 0;
  v_transfer_id UUID;
  v_tx_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  IF v_destination NOT IN ('wallet', 'savings') THEN
    RAISE EXCEPTION 'Destination must be wallet or savings';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::TEXT || ':' || v_mode));

  SELECT
    COALESCE(SUM(CASE WHEN mp.status = 'succeeded' THEN mp.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN mp.status = 'refunded' THEN mp.amount ELSE 0 END), 0)
  INTO v_gross, v_refunded
  FROM public.merchant_payments mp
  WHERE mp.merchant_user_id = v_user_id
    AND mp.key_mode = v_mode;

  SELECT COALESCE(SUM(mbt.amount), 0)
  INTO v_transferred
  FROM public.merchant_balance_transfers mbt
  WHERE mbt.merchant_user_id = v_user_id
    AND mbt.key_mode = v_mode;

  v_available := GREATEST(v_gross - v_refunded - v_transferred, 0);
  IF v_available < v_amount THEN
    RAISE EXCEPTION 'Insufficient merchant available balance';
  END IF;

  INSERT INTO public.merchant_balance_transfers (
    merchant_user_id,
    key_mode,
    destination,
    amount,
    currency,
    note
  )
  VALUES (
    v_user_id,
    v_mode,
    v_destination,
    v_amount,
    'USD',
    COALESCE(p_note, '')
  )
  RETURNING id INTO v_transfer_id;

  SELECT COALESCE(w.balance, 0)
  INTO v_wallet
  FROM public.wallets w
  WHERE w.user_id = v_user_id
  FOR UPDATE;

  IF v_destination = 'wallet' THEN
    UPDATE public.wallets
    SET balance = v_wallet + v_amount,
        updated_at = now()
    WHERE user_id = v_user_id
    RETURNING balance INTO v_wallet;
  ELSE
    PERFORM public.upsert_my_savings_account();

    UPDATE public.user_savings_accounts
    SET balance = balance + v_amount,
        updated_at = now()
    WHERE user_id = v_user_id
    RETURNING balance INTO v_savings;

    INSERT INTO public.user_savings_transfers (user_id, direction, amount, fee_amount, note)
    VALUES (
      v_user_id,
      'wallet_to_savings',
      v_amount,
      0,
      CONCAT('Merchant balance transfer (', v_mode, ')')
    );
  END IF;

  IF v_destination = 'wallet' THEN
    INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
    VALUES (
      v_user_id,
      v_user_id,
      v_amount,
      CONCAT('Merchant balance transfer to wallet (', v_mode, ')'),
      'completed'
    )
    RETURNING id INTO v_tx_id;
  ELSE
    INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
    VALUES (
      v_user_id,
      v_user_id,
      v_amount,
      CONCAT('Merchant balance transfer to savings (', v_mode, ')'),
      'completed'
    )
    RETURNING id INTO v_tx_id;
  END IF;

  PERFORM public.create_app_notification(
    v_user_id,
    'merchant_activity',
    'Merchant balance transferred',
    CONCAT('Moved ', v_amount::TEXT, ' to ', v_destination, ' (', v_mode, ').'),
    jsonb_build_object(
      'transfer_id', v_transfer_id::TEXT,
      'transaction_id', v_tx_id::TEXT,
      'mode', v_mode,
      'destination', v_destination,
      'amount', v_amount
    )
  );

  SELECT COALESCE(w.balance, 0)
  INTO v_wallet
  FROM public.wallets w
  WHERE w.user_id = v_user_id;

  SELECT COALESCE(usa.balance, 0)
  INTO v_savings
  FROM public.user_savings_accounts usa
  WHERE usa.user_id = v_user_id;

  RETURN QUERY
  SELECT
    v_transfer_id,
    GREATEST(v_available - v_amount, 0),
    v_wallet,
    v_savings;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_merchant_activity(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.get_my_merchant_activity(
  p_mode TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  activity_id TEXT,
  activity_type TEXT,
  amount NUMERIC,
  currency TEXT,
  status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ,
  counterparty_name TEXT,
  counterparty_username TEXT,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(TRIM(COALESCE(p_mode, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode = '' THEN
    v_mode := NULL;
  END IF;

  RETURN QUERY
  WITH payment_rows AS (
    SELECT
      'mp_' || mp.id::TEXT AS activity_id,
      CASE
        WHEN mp.status = 'refunded' THEN 'refund'
        ELSE 'payment'
      END AS activity_type,
      mp.amount,
      mp.currency,
      mp.status,
      COALESCE(tx.note, 'Merchant payment') AS note,
      mp.created_at,
      COALESCE(NULLIF(TRIM(COALESCE(mcs.customer_name, '')), ''), pr.full_name, 'OpenPay Customer') AS counterparty_name,
      pr.username AS counterparty_username,
      CASE
        WHEN COALESCE(mcs.metadata->>'channel', '') = 'pos' THEN 'pos'
        WHEN mp.payment_link_id IS NOT NULL OR COALESCE(mp.payment_link_token, '') <> '' THEN 'payment_link'
        ELSE 'checkout'
      END AS source
    FROM public.merchant_payments mp
    JOIN public.merchant_checkout_sessions mcs
      ON mcs.id = mp.session_id
    LEFT JOIN public.transactions tx
      ON tx.id = mp.transaction_id
    LEFT JOIN public.profiles pr
      ON pr.id = mp.buyer_user_id
    WHERE mp.merchant_user_id = v_user_id
      AND (v_mode IS NULL OR mp.key_mode = v_mode)
  ),
  transfer_rows AS (
    SELECT
      'mbt_' || mbt.id::TEXT AS activity_id,
      CASE
        WHEN mbt.destination = 'wallet' THEN 'transfer_to_wallet'
        ELSE 'transfer_to_savings'
      END AS activity_type,
      mbt.amount,
      mbt.currency,
      'completed'::TEXT AS status,
      COALESCE(NULLIF(TRIM(mbt.note), ''), CONCAT('Merchant balance transfer to ', mbt.destination)) AS note,
      mbt.created_at,
      'Merchant account'::TEXT AS counterparty_name,
      NULL::TEXT AS counterparty_username,
      'merchant_portal'::TEXT AS source
    FROM public.merchant_balance_transfers mbt
    WHERE mbt.merchant_user_id = v_user_id
      AND (v_mode IS NULL OR mbt.key_mode = v_mode)
  )
  SELECT *
  FROM (
    SELECT * FROM payment_rows
    UNION ALL
    SELECT * FROM transfer_rows
  ) rows
  ORDER BY rows.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 300)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

DROP FUNCTION IF EXISTS public.complete_merchant_checkout_with_transaction(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.complete_merchant_checkout_with_transaction(
  p_session_token TEXT,
  p_transaction_id UUID,
  p_note TEXT DEFAULT '',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_address TEXT DEFAULT NULL
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
  v_payment_link_id UUID;
  v_payment_link_token TEXT;
  v_customer_name TEXT := NULLIF(TRIM(COALESCE(p_customer_name, '')), '');
  v_customer_email TEXT := NULLIF(TRIM(COALESCE(p_customer_email, '')), '');
  v_customer_phone TEXT := NULLIF(TRIM(COALESCE(p_customer_phone, '')), '');
  v_customer_address TEXT := NULLIF(TRIM(COALESCE(p_customer_address, '')), '');
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

    UPDATE public.merchant_checkout_sessions mcs
    SET customer_name = COALESCE(v_customer_name, mcs.customer_name),
        customer_email = COALESCE(v_customer_email, mcs.customer_email),
        metadata = COALESCE(mcs.metadata, '{}'::jsonb) || jsonb_strip_nulls(
          jsonb_build_object(
            'customer_phone', v_customer_phone,
            'customer_address', v_customer_address
          )
        ),
        updated_at = now()
    WHERE mcs.id = v_session.id;

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

  v_payment_link_id := NULLIF((v_session.metadata->>'payment_link_id')::UUID, NULL);
  v_payment_link_token := NULLIF(TRIM(COALESCE(v_session.metadata->>'payment_link_token', '')), '');

  INSERT INTO public.merchant_payments (
    session_id,
    merchant_user_id,
    buyer_user_id,
    transaction_id,
    amount,
    currency,
    api_key_id,
    key_mode,
    payment_link_id,
    payment_link_token,
    status
  )
  VALUES (
    v_session.id,
    v_session.merchant_user_id,
    v_buyer_user_id,
    v_tx.id,
    v_session.total_amount,
    v_session.currency,
    v_session.api_key_id,
    v_session.key_mode,
    v_payment_link_id,
    v_payment_link_token,
    'succeeded'
  )
  ON CONFLICT (session_id) DO NOTHING;

  UPDATE public.merchant_checkout_sessions mcs
  SET status = 'paid',
      paid_at = now(),
      customer_name = COALESCE(v_customer_name, mcs.customer_name),
      customer_email = COALESCE(v_customer_email, mcs.customer_email),
      metadata = COALESCE(mcs.metadata, '{}'::jsonb) || jsonb_strip_nulls(
        jsonb_build_object(
          'customer_phone', v_customer_phone,
          'customer_address', v_customer_address
        )
      ),
      updated_at = now()
  WHERE mcs.id = v_session.id;

  IF COALESCE(TRIM(p_note), '') <> '' THEN
    UPDATE public.transactions
    SET note = CONCAT(COALESCE(note, ''), ' | ', TRIM(p_note))
    WHERE id = v_tx.id;
  END IF;

  RETURN v_tx.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_merchant_balance_overview(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_my_merchant_balance(NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_merchant_activity(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_my_pos_api_key(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_pos_api_key_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_my_pos_checkout_session(NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_merchant_checkout_with_transaction(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_merchant_balance_overview(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_my_merchant_balance(NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_merchant_activity(TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_my_pos_api_key(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_pos_api_key_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_my_pos_checkout_session(NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_merchant_checkout_with_transaction(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
