-- Ensure transaction-related screens can show counterparty email
-- and prepare an email outbox pipeline for transaction notifications.

CREATE TABLE IF NOT EXISTS public.email_notifications_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_outbox_status_created
ON public.email_notifications_outbox (status, created_at);

CREATE INDEX IF NOT EXISTS idx_email_notifications_outbox_user_created
ON public.email_notifications_outbox (user_id, created_at DESC);

ALTER TABLE public.email_notifications_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_notifications_outbox'
      AND policyname = 'Service role manages email outbox'
  ) THEN
    CREATE POLICY "Service role manages email outbox"
      ON public.email_notifications_outbox
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_email_notifications_outbox_updated_at ON public.email_notifications_outbox;
CREATE TRIGGER trg_email_notifications_outbox_updated_at
BEFORE UPDATE ON public.email_notifications_outbox
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

CREATE OR REPLACE FUNCTION public.queue_transaction_email_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_email TEXT;
  v_receiver_email TEXT;
  v_sender_name TEXT;
  v_receiver_name TEXT;
  v_amount_text TEXT := to_char(COALESCE(NEW.amount, 0), 'FM999999999990D00');
  v_sender_pref BOOLEAN := true;
  v_receiver_pref BOOLEAN := true;
BEGIN
  SELECT email INTO v_sender_email FROM auth.users WHERE id = NEW.sender_id;
  SELECT email INTO v_receiver_email FROM auth.users WHERE id = NEW.receiver_id;

  SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), p.username, 'OpenPay user')
  INTO v_sender_name
  FROM public.profiles p
  WHERE p.id = NEW.sender_id;

  SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), p.username, 'OpenPay user')
  INTO v_receiver_name
  FROM public.profiles p
  WHERE p.id = NEW.receiver_id;

  SELECT COALESCE(np.email_enabled, true)
  INTO v_sender_pref
  FROM public.notification_preferences np
  WHERE np.user_id = NEW.sender_id;

  SELECT COALESCE(np.email_enabled, true)
  INTO v_receiver_pref
  FROM public.notification_preferences np
  WHERE np.user_id = NEW.receiver_id;

  IF NEW.sender_id = NEW.receiver_id THEN
    IF NULLIF(TRIM(COALESCE(v_receiver_email, '')), '') IS NOT NULL AND COALESCE(v_receiver_pref, true) THEN
      INSERT INTO public.email_notifications_outbox (user_id, transaction_id, to_email, subject, body, payload)
      VALUES (
        NEW.receiver_id,
        NEW.id,
        v_receiver_email,
        'OpenPay transaction confirmation',
        format('Your balance was updated by %s. Amount: $%s.', v_sender_name, v_amount_text),
        jsonb_build_object('type', 'self_transfer', 'transaction_id', NEW.id::TEXT, 'amount', NEW.amount)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NULLIF(TRIM(COALESCE(v_receiver_email, '')), '') IS NOT NULL AND COALESCE(v_receiver_pref, true) THEN
    INSERT INTO public.email_notifications_outbox (user_id, transaction_id, to_email, subject, body, payload)
    VALUES (
      NEW.receiver_id,
      NEW.id,
      v_receiver_email,
      'OpenPay payment received',
      format('You received $%s from %s via OpenPay.', v_amount_text, COALESCE(v_sender_name, 'OpenPay user')),
      jsonb_build_object('type', 'payment_received', 'transaction_id', NEW.id::TEXT, 'amount', NEW.amount, 'sender_id', NEW.sender_id::TEXT)
    );
  END IF;

  IF NULLIF(TRIM(COALESCE(v_sender_email, '')), '') IS NOT NULL AND COALESCE(v_sender_pref, true) THEN
    INSERT INTO public.email_notifications_outbox (user_id, transaction_id, to_email, subject, body, payload)
    VALUES (
      NEW.sender_id,
      NEW.id,
      v_sender_email,
      'OpenPay payment sent',
      format('You sent $%s to %s via OpenPay.', v_amount_text, COALESCE(v_receiver_name, 'OpenPay user')),
      jsonb_build_object('type', 'payment_sent', 'transaction_id', NEW.id::TEXT, 'amount', NEW.amount, 'receiver_id', NEW.receiver_id::TEXT)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_transaction_email_notifications ON public.transactions;
CREATE TRIGGER trg_queue_transaction_email_notifications
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.queue_transaction_email_notifications();

DROP FUNCTION IF EXISTS public.get_my_pos_transactions(TEXT, TEXT, TEXT, INTEGER, INTEGER);
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
    COALESCE(NULLIF(TRIM(COALESCE(mcs.customer_email, '')), ''), buyer_auth.email) AS customer_email
  FROM public.merchant_payments mp
  JOIN public.merchant_checkout_sessions mcs
    ON mcs.id = mp.session_id
  LEFT JOIN public.transactions tx
    ON tx.id = mp.transaction_id
  LEFT JOIN public.profiles pr
    ON pr.id = mp.buyer_user_id
  LEFT JOIN auth.users buyer_auth
    ON buyer_auth.id = mp.buyer_user_id
  WHERE mp.merchant_user_id = v_user_id
    AND (v_mode IS NULL OR mp.key_mode = v_mode)
    AND (v_status IS NULL OR LOWER(mp.status) = v_status)
    AND (
      v_search IS NULL
      OR mp.transaction_id::TEXT ILIKE ('%' || v_search || '%')
      OR mcs.session_token ILIKE ('%' || v_search || '%')
      OR COALESCE(mcs.customer_name, '') ILIKE ('%' || v_search || '%')
      OR COALESCE(mcs.customer_email, '') ILIKE ('%' || v_search || '%')
      OR COALESCE(buyer_auth.email, '') ILIKE ('%' || v_search || '%')
      OR COALESCE(pr.username, '') ILIKE ('%' || v_search || '%')
      OR COALESCE(pr.full_name, '') ILIKE ('%' || v_search || '%')
    )
  ORDER BY mp.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 300)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
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
  counterparty_email TEXT,
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
      COALESCE(NULLIF(TRIM(COALESCE(mcs.customer_email, '')), ''), buyer_auth.email) AS counterparty_email,
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
    LEFT JOIN auth.users buyer_auth
      ON buyer_auth.id = mp.buyer_user_id
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
      NULL::TEXT AS counterparty_email,
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
  v_buyer_email TEXT;
BEGIN
  IF v_buyer_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Transaction id is required';
  END IF;

  SELECT email INTO v_buyer_email
  FROM auth.users
  WHERE id = v_buyer_user_id;

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
        customer_email = COALESCE(v_customer_email, v_buyer_email, mcs.customer_email),
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
      customer_email = COALESCE(v_customer_email, v_buyer_email, mcs.customer_email),
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

REVOKE ALL ON FUNCTION public.get_my_pos_transactions(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_merchant_activity(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_merchant_checkout_with_transaction(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_pos_transactions(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_merchant_activity(TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_merchant_checkout_with_transaction(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
