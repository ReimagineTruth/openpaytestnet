CREATE TABLE IF NOT EXISTS public.merchant_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL DEFAULT 'OpenPay Merchant',
  merchant_username TEXT NOT NULL DEFAULT '',
  merchant_logo_url TEXT,
  default_currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(default_currency) = 3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_mode TEXT NOT NULL CHECK (key_mode IN ('sandbox', 'live')),
  key_name TEXT NOT NULL DEFAULT 'Default key',
  publishable_key TEXT NOT NULL UNIQUE,
  secret_key_hash TEXT NOT NULL UNIQUE,
  secret_key_last4 TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  unit_amount NUMERIC(12,2) NOT NULL CHECK (unit_amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_user_id, product_code)
);

CREATE TABLE IF NOT EXISTS public.merchant_checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_mode TEXT NOT NULL CHECK (key_mode IN ('sandbox', 'live')),
  session_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'expired', 'canceled')),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  customer_email TEXT,
  customer_name TEXT,
  success_url TEXT,
  cancel_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_checkout_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.merchant_checkout_sessions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.merchant_products(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit_amount NUMERIC(12,2) NOT NULL CHECK (unit_amount > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (line_total = ROUND(unit_amount * quantity, 2))
);

CREATE TABLE IF NOT EXISTS public.merchant_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES public.merchant_checkout_sessions(id) ON DELETE RESTRICT,
  merchant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  key_mode TEXT NOT NULL CHECK (key_mode IN ('sandbox', 'live')),
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_owner_mode
ON public.merchant_api_keys (merchant_user_id, key_mode, is_active);

CREATE INDEX IF NOT EXISTS idx_merchant_products_owner_active
ON public.merchant_products (merchant_user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_merchant_checkout_sessions_owner_status
ON public.merchant_checkout_sessions (merchant_user_id, status, key_mode);

CREATE INDEX IF NOT EXISTS idx_merchant_checkout_sessions_expires
ON public.merchant_checkout_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_merchant_checkout_items_session
ON public.merchant_checkout_session_items (session_id);

CREATE INDEX IF NOT EXISTS idx_merchant_payments_merchant
ON public.merchant_payments (merchant_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_payments_buyer
ON public.merchant_payments (buyer_user_id, created_at DESC);

ALTER TABLE public.merchant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_checkout_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_profiles' AND policyname = 'Users can view own merchant profile'
  ) THEN
    CREATE POLICY "Users can view own merchant profile"
      ON public.merchant_profiles
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_profiles' AND policyname = 'Users can insert own merchant profile'
  ) THEN
    CREATE POLICY "Users can insert own merchant profile"
      ON public.merchant_profiles
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_profiles' AND policyname = 'Users can update own merchant profile'
  ) THEN
    CREATE POLICY "Users can update own merchant profile"
      ON public.merchant_profiles
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_api_keys' AND policyname = 'Users can view own merchant api keys'
  ) THEN
    CREATE POLICY "Users can view own merchant api keys"
      ON public.merchant_api_keys
      FOR SELECT TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_api_keys' AND policyname = 'Users can insert own merchant api keys'
  ) THEN
    CREATE POLICY "Users can insert own merchant api keys"
      ON public.merchant_api_keys
      FOR INSERT TO authenticated
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_api_keys' AND policyname = 'Users can update own merchant api keys'
  ) THEN
    CREATE POLICY "Users can update own merchant api keys"
      ON public.merchant_api_keys
      FOR UPDATE TO authenticated
      USING (merchant_user_id = auth.uid())
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_products' AND policyname = 'Users can view own merchant products'
  ) THEN
    CREATE POLICY "Users can view own merchant products"
      ON public.merchant_products
      FOR SELECT TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_products' AND policyname = 'Users can insert own merchant products'
  ) THEN
    CREATE POLICY "Users can insert own merchant products"
      ON public.merchant_products
      FOR INSERT TO authenticated
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_products' AND policyname = 'Users can update own merchant products'
  ) THEN
    CREATE POLICY "Users can update own merchant products"
      ON public.merchant_products
      FOR UPDATE TO authenticated
      USING (merchant_user_id = auth.uid())
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_products' AND policyname = 'Users can delete own merchant products'
  ) THEN
    CREATE POLICY "Users can delete own merchant products"
      ON public.merchant_products
      FOR DELETE TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_checkout_sessions' AND policyname = 'Users can view own merchant checkout sessions'
  ) THEN
    CREATE POLICY "Users can view own merchant checkout sessions"
      ON public.merchant_checkout_sessions
      FOR SELECT TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_checkout_sessions' AND policyname = 'Users can insert own merchant checkout sessions'
  ) THEN
    CREATE POLICY "Users can insert own merchant checkout sessions"
      ON public.merchant_checkout_sessions
      FOR INSERT TO authenticated
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_checkout_sessions' AND policyname = 'Users can update own merchant checkout sessions'
  ) THEN
    CREATE POLICY "Users can update own merchant checkout sessions"
      ON public.merchant_checkout_sessions
      FOR UPDATE TO authenticated
      USING (merchant_user_id = auth.uid())
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_checkout_session_items' AND policyname = 'Users can view own merchant checkout items'
  ) THEN
    CREATE POLICY "Users can view own merchant checkout items"
      ON public.merchant_checkout_session_items
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.merchant_checkout_sessions mcs
          WHERE mcs.id = session_id
            AND mcs.merchant_user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_checkout_session_items' AND policyname = 'Users can insert own merchant checkout items'
  ) THEN
    CREATE POLICY "Users can insert own merchant checkout items"
      ON public.merchant_checkout_session_items
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.merchant_checkout_sessions mcs
          WHERE mcs.id = session_id
            AND mcs.merchant_user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_checkout_session_items' AND policyname = 'Users can delete own merchant checkout items'
  ) THEN
    CREATE POLICY "Users can delete own merchant checkout items"
      ON public.merchant_checkout_session_items
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.merchant_checkout_sessions mcs
          WHERE mcs.id = session_id
            AND mcs.merchant_user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_payments' AND policyname = 'Merchant or buyer can view merchant payments'
  ) THEN
    CREATE POLICY "Merchant or buyer can view merchant payments"
      ON public.merchant_payments
      FOR SELECT TO authenticated
      USING (merchant_user_id = auth.uid() OR buyer_user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_merchant_profiles_updated_at ON public.merchant_profiles;
CREATE TRIGGER trg_merchant_profiles_updated_at
BEFORE UPDATE ON public.merchant_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

DROP TRIGGER IF EXISTS trg_merchant_api_keys_updated_at ON public.merchant_api_keys;
CREATE TRIGGER trg_merchant_api_keys_updated_at
BEFORE UPDATE ON public.merchant_api_keys
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

DROP TRIGGER IF EXISTS trg_merchant_products_updated_at ON public.merchant_products;
CREATE TRIGGER trg_merchant_products_updated_at
BEFORE UPDATE ON public.merchant_products
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

DROP TRIGGER IF EXISTS trg_merchant_checkout_sessions_updated_at ON public.merchant_checkout_sessions;
CREATE TRIGGER trg_merchant_checkout_sessions_updated_at
BEFORE UPDATE ON public.merchant_checkout_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

CREATE OR REPLACE FUNCTION public.generate_merchant_api_key(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate TEXT;
BEGIN
  LOOP
    v_candidate := p_prefix || encode(gen_random_bytes(24), 'hex');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.merchant_api_keys WHERE publishable_key = v_candidate)
          AND NOT EXISTS (SELECT 1 FROM public.merchant_checkout_sessions WHERE session_token = v_candidate);
  END LOOP;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_merchant_profile(
  p_merchant_name TEXT DEFAULT NULL,
  p_merchant_username TEXT DEFAULT NULL,
  p_merchant_logo_url TEXT DEFAULT NULL,
  p_default_currency TEXT DEFAULT NULL
)
RETURNS public.merchant_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_name TEXT;
  v_profile_username TEXT;
  v_profile_logo TEXT;
  v_profile public.merchant_profiles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT full_name, COALESCE(username, ''), avatar_url
  INTO v_profile_name, v_profile_username, v_profile_logo
  FROM public.profiles
  WHERE id = v_user_id;

  INSERT INTO public.merchant_profiles (
    user_id,
    merchant_name,
    merchant_username,
    merchant_logo_url,
    default_currency
  )
  VALUES (
    v_user_id,
    COALESCE(NULLIF(TRIM(p_merchant_name), ''), NULLIF(TRIM(v_profile_name), ''), 'OpenPay Merchant'),
    COALESCE(NULLIF(TRIM(p_merchant_username), ''), NULLIF(TRIM(v_profile_username), ''), 'openpay-merchant'),
    COALESCE(NULLIF(TRIM(p_merchant_logo_url), ''), v_profile_logo),
    UPPER(COALESCE(NULLIF(TRIM(p_default_currency), ''), 'USD'))
  )
  ON CONFLICT (user_id) DO UPDATE
  SET merchant_name = COALESCE(NULLIF(TRIM(p_merchant_name), ''), public.merchant_profiles.merchant_name),
      merchant_username = COALESCE(NULLIF(TRIM(p_merchant_username), ''), public.merchant_profiles.merchant_username),
      merchant_logo_url = COALESCE(NULLIF(TRIM(p_merchant_logo_url), ''), public.merchant_profiles.merchant_logo_url),
      default_currency = UPPER(COALESCE(NULLIF(TRIM(p_default_currency), ''), public.merchant_profiles.default_currency)),
      is_active = true
  RETURNING * INTO v_profile;

  RETURN v_profile;
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
  v_secret_key := 'osk_' || v_mode || '_' || encode(gen_random_bytes(32), 'hex');

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
    encode(digest(v_secret_key, 'sha256'), 'hex'),
    RIGHT(v_secret_key, 4)
  )
  RETURNING * INTO v_row;

  RETURN QUERY
  SELECT v_row.id, v_row.key_mode, v_row.publishable_key, v_secret_key, v_row.key_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_my_merchant_api_key(p_key_id UUID)
RETURNS BOOLEAN
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

  UPDATE public.merchant_api_keys
  SET is_active = false,
      revoked_at = now()
  WHERE id = p_key_id
    AND merchant_user_id = v_user_id
    AND is_active = true;

  RETURN FOUND;
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
  v_secret_hash TEXT := encode(digest(COALESCE(p_secret_key, ''), 'sha256'), 'hex');
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
    'opsess_' || encode(gen_random_bytes(24), 'hex'),
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

CREATE OR REPLACE FUNCTION public.get_public_merchant_checkout_session(
  p_session_token TEXT
)
RETURNS TABLE (
  session_id UUID,
  status TEXT,
  mode TEXT,
  currency TEXT,
  amount NUMERIC,
  expires_at TIMESTAMPTZ,
  merchant_user_id UUID,
  merchant_name TEXT,
  merchant_username TEXT,
  merchant_logo_url TEXT,
  items JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.merchant_checkout_sessions;
BEGIN
  SELECT *
  INTO v_session
  FROM public.merchant_checkout_sessions mcs
  WHERE mcs.session_token = TRIM(COALESCE(p_session_token, ''))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_session.status = 'open' AND v_session.expires_at < now() THEN
    UPDATE public.merchant_checkout_sessions
    SET status = 'expired'
    WHERE id = v_session.id
      AND status = 'open';

    SELECT *
    INTO v_session
    FROM public.merchant_checkout_sessions
    WHERE id = v_session.id;
  END IF;

  RETURN QUERY
  SELECT
    v_session.id,
    v_session.status,
    v_session.key_mode,
    v_session.currency,
    v_session.total_amount,
    v_session.expires_at,
    mp.user_id,
    mp.merchant_name,
    mp.merchant_username,
    mp.merchant_logo_url,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'item_name', mcsi.item_name,
            'quantity', mcsi.quantity,
            'unit_amount', mcsi.unit_amount,
            'line_total', mcsi.line_total
          )
          ORDER BY mcsi.created_at ASC
        )
        FROM public.merchant_checkout_session_items mcsi
        WHERE mcsi.session_id = v_session.id
      ),
      '[]'::jsonb
    )
  FROM public.merchant_profiles mp
  WHERE mp.user_id = v_session.merchant_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_merchant_checkout_with_virtual_card(
  p_session_token TEXT,
  p_card_number TEXT,
  p_expiry_month INTEGER,
  p_expiry_year INTEGER,
  p_cvc TEXT,
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
  v_sender_balance NUMERIC(12,2);
  v_receiver_balance NUMERIC(12,2);
  v_transaction_id UUID;
  v_payment_id UUID;
  v_card_number TEXT := regexp_replace(COALESCE(p_card_number, ''), '\D', '', 'g');
  v_cvc TEXT := regexp_replace(COALESCE(p_cvc, ''), '\D', '', 'g');
  v_expiry_end DATE;
BEGIN
  IF v_buyer_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_session
  FROM public.merchant_checkout_sessions mcs
  WHERE mcs.session_token = TRIM(COALESCE(p_session_token, ''))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout session not found';
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

  IF char_length(v_card_number) <> 16 THEN
    RAISE EXCEPTION 'Card number must be 16 digits';
  END IF;

  IF p_expiry_month IS NULL OR p_expiry_month < 1 OR p_expiry_month > 12 THEN
    RAISE EXCEPTION 'Invalid expiry month';
  END IF;

  IF p_expiry_year IS NULL OR p_expiry_year < 2026 THEN
    RAISE EXCEPTION 'Invalid expiry year';
  END IF;

  IF char_length(v_cvc) <> 3 THEN
    RAISE EXCEPTION 'Invalid CVC';
  END IF;

  v_expiry_end := (make_date(p_expiry_year, p_expiry_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  IF v_expiry_end < CURRENT_DATE THEN
    RAISE EXCEPTION 'Card expired';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.virtual_cards vc
    WHERE vc.user_id = v_buyer_user_id
      AND vc.card_number = v_card_number
      AND vc.expiry_month = p_expiry_month
      AND vc.expiry_year = p_expiry_year
      AND vc.cvc = v_cvc
      AND vc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid virtual card details';
  END IF;

  SELECT balance INTO v_sender_balance
  FROM public.wallets
  WHERE user_id = v_buyer_user_id
  FOR UPDATE;

  IF v_sender_balance IS NULL THEN
    RAISE EXCEPTION 'Buyer wallet not found';
  END IF;

  SELECT balance INTO v_receiver_balance
  FROM public.wallets
  WHERE user_id = v_session.merchant_user_id
  FOR UPDATE;

  IF v_receiver_balance IS NULL THEN
    RAISE EXCEPTION 'Merchant wallet not found';
  END IF;

  IF v_sender_balance < v_session.total_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.wallets
  SET balance = v_sender_balance - v_session.total_amount,
      updated_at = now()
  WHERE user_id = v_buyer_user_id;

  UPDATE public.wallets
  SET balance = v_receiver_balance + v_session.total_amount,
      updated_at = now()
  WHERE user_id = v_session.merchant_user_id;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
  VALUES (
    v_buyer_user_id,
    v_session.merchant_user_id,
    v_session.total_amount,
    CONCAT('Merchant checkout ', v_session.session_token, ' | ', COALESCE(p_note, '')),
    'completed'
  )
  RETURNING id INTO v_transaction_id;

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
    v_transaction_id,
    v_session.total_amount,
    v_session.currency,
    v_session.key_mode,
    'succeeded'
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.merchant_checkout_sessions
  SET status = 'paid',
      paid_at = now()
  WHERE id = v_session.id;

  RETURN v_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_merchant_profile_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.merchant_profiles (user_id, merchant_name, merchant_username, merchant_logo_url)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.full_name), ''), 'OpenPay Merchant'),
    COALESCE(NULLIF(TRIM(COALESCE(NEW.username, '')), ''), 'openpay-merchant'),
    NEW.avatar_url
  )
  ON CONFLICT (user_id) DO UPDATE
  SET merchant_name = EXCLUDED.merchant_name,
      merchant_username = EXCLUDED.merchant_username,
      merchant_logo_url = COALESCE(EXCLUDED.merchant_logo_url, public.merchant_profiles.merchant_logo_url);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_merchant_profile ON public.profiles;
CREATE TRIGGER trg_profiles_sync_merchant_profile
AFTER INSERT OR UPDATE OF full_name, username, avatar_url
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_merchant_profile_from_profile();

INSERT INTO public.merchant_profiles (user_id, merchant_name, merchant_username, merchant_logo_url)
SELECT
  p.id,
  COALESCE(NULLIF(TRIM(p.full_name), ''), 'OpenPay Merchant'),
  COALESCE(NULLIF(TRIM(COALESCE(p.username, '')), ''), 'openpay-merchant'),
  p.avatar_url
FROM public.profiles p
ON CONFLICT (user_id) DO UPDATE
SET merchant_name = EXCLUDED.merchant_name,
    merchant_username = EXCLUDED.merchant_username,
    merchant_logo_url = COALESCE(EXCLUDED.merchant_logo_url, public.merchant_profiles.merchant_logo_url);

REVOKE ALL ON FUNCTION public.upsert_my_merchant_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_my_merchant_api_key(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_my_merchant_api_key(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_merchant_checkout_session(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_merchant_checkout_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_merchant_checkout_with_virtual_card(TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_my_merchant_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_merchant_api_key(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_my_merchant_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_merchant_checkout_session(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_merchant_checkout_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_merchant_checkout_with_virtual_card(TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;
