CREATE TABLE IF NOT EXISTS public.merchant_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_mode TEXT NOT NULL CHECK (key_mode IN ('sandbox', 'live')),
  link_token TEXT NOT NULL UNIQUE,
  link_type TEXT NOT NULL CHECK (link_type IN ('products', 'custom_amount')),
  title TEXT NOT NULL DEFAULT 'OpenPay Payment',
  description TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  custom_amount NUMERIC(12,2),
  collect_customer_name BOOLEAN NOT NULL DEFAULT true,
  collect_customer_email BOOLEAN NOT NULL DEFAULT true,
  collect_phone BOOLEAN NOT NULL DEFAULT false,
  collect_address BOOLEAN NOT NULL DEFAULT false,
  after_payment_type TEXT NOT NULL DEFAULT 'confirmation' CHECK (after_payment_type IN ('confirmation', 'redirect')),
  confirmation_message TEXT NOT NULL DEFAULT 'Thanks for your payment.',
  redirect_url TEXT,
  call_to_action TEXT NOT NULL DEFAULT 'Pay',
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (custom_amount IS NULL OR custom_amount > 0)
);

CREATE TABLE IF NOT EXISTS public.merchant_payment_link_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.merchant_payment_links(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.merchant_products(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit_amount NUMERIC(12,2) NOT NULL CHECK (unit_amount > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (line_total = ROUND(unit_amount * quantity, 2))
);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_owner_mode
ON public.merchant_payment_links (merchant_user_id, key_mode, is_active);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_links_token
ON public.merchant_payment_links (link_token);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_link_items_link
ON public.merchant_payment_link_items (link_id);

ALTER TABLE public.merchant_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payment_link_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_payment_links' AND policyname = 'Users can view own merchant payment links'
  ) THEN
    CREATE POLICY "Users can view own merchant payment links"
      ON public.merchant_payment_links
      FOR SELECT TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_payment_links' AND policyname = 'Users can insert own merchant payment links'
  ) THEN
    CREATE POLICY "Users can insert own merchant payment links"
      ON public.merchant_payment_links
      FOR INSERT TO authenticated
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_payment_links' AND policyname = 'Users can update own merchant payment links'
  ) THEN
    CREATE POLICY "Users can update own merchant payment links"
      ON public.merchant_payment_links
      FOR UPDATE TO authenticated
      USING (merchant_user_id = auth.uid())
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_payment_links' AND policyname = 'Users can delete own merchant payment links'
  ) THEN
    CREATE POLICY "Users can delete own merchant payment links"
      ON public.merchant_payment_links
      FOR DELETE TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_payment_link_items' AND policyname = 'Users can view own merchant payment link items'
  ) THEN
    CREATE POLICY "Users can view own merchant payment link items"
      ON public.merchant_payment_link_items
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.merchant_payment_links mpl
          WHERE mpl.id = link_id
            AND mpl.merchant_user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_payment_link_items' AND policyname = 'Users can insert own merchant payment link items'
  ) THEN
    CREATE POLICY "Users can insert own merchant payment link items"
      ON public.merchant_payment_link_items
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.merchant_payment_links mpl
          WHERE mpl.id = link_id
            AND mpl.merchant_user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'merchant_payment_link_items' AND policyname = 'Users can delete own merchant payment link items'
  ) THEN
    CREATE POLICY "Users can delete own merchant payment link items"
      ON public.merchant_payment_link_items
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.merchant_payment_links mpl
          WHERE mpl.id = link_id
            AND mpl.merchant_user_id = auth.uid()
        )
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_merchant_payment_links_updated_at ON public.merchant_payment_links;
CREATE TRIGGER trg_merchant_payment_links_updated_at
BEFORE UPDATE ON public.merchant_payment_links
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

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
  v_secret_hash TEXT := encode(digest(COALESCE(p_secret_key, ''), 'sha256'), 'hex');
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
    'oplink_' || encode(gen_random_bytes(24), 'hex'),
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

CREATE OR REPLACE FUNCTION public.get_public_merchant_payment_link(
  p_link_token TEXT
)
RETURNS TABLE (
  link_id UUID,
  link_token TEXT,
  mode TEXT,
  link_type TEXT,
  title TEXT,
  description TEXT,
  currency TEXT,
  total_amount NUMERIC,
  collect_customer_name BOOLEAN,
  collect_customer_email BOOLEAN,
  collect_phone BOOLEAN,
  collect_address BOOLEAN,
  after_payment_type TEXT,
  confirmation_message TEXT,
  redirect_url TEXT,
  call_to_action TEXT,
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
  v_link public.merchant_payment_links;
  v_total NUMERIC(12,2) := 0;
BEGIN
  SELECT *
  INTO v_link
  FROM public.merchant_payment_links mpl
  WHERE mpl.link_token = TRIM(COALESCE(p_link_token, ''))
    AND mpl.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN;
  END IF;

  IF v_link.link_type = 'custom_amount' THEN
    v_total := COALESCE(v_link.custom_amount, 0);
  ELSE
    SELECT COALESCE(SUM(mpli.line_total), 0)
    INTO v_total
    FROM public.merchant_payment_link_items mpli
    WHERE mpli.link_id = v_link.id;
  END IF;

  RETURN QUERY
  SELECT
    v_link.id,
    v_link.link_token,
    v_link.key_mode,
    v_link.link_type,
    v_link.title,
    v_link.description,
    v_link.currency,
    v_total,
    v_link.collect_customer_name,
    v_link.collect_customer_email,
    v_link.collect_phone,
    v_link.collect_address,
    v_link.after_payment_type,
    v_link.confirmation_message,
    v_link.redirect_url,
    v_link.call_to_action,
    v_link.expires_at,
    mp.user_id,
    mp.merchant_name,
    mp.merchant_username,
    mp.merchant_logo_url,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'item_name', mpli.item_name,
            'quantity', mpli.quantity,
            'unit_amount', mpli.unit_amount,
            'line_total', mpli.line_total
          )
          ORDER BY mpli.created_at ASC
        )
        FROM public.merchant_payment_link_items mpli
        WHERE mpli.link_id = v_link.id
      ),
      '[]'::jsonb
    )
  FROM public.merchant_profiles mp
  WHERE mp.user_id = v_link.merchant_user_id;
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
    'opsess_' || encode(gen_random_bytes(24), 'hex'),
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

REVOKE ALL ON FUNCTION public.create_merchant_payment_link(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, JSONB, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_merchant_payment_link(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_checkout_session_from_payment_link(TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_merchant_payment_link(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, JSONB, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_merchant_payment_link(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_session_from_payment_link(TEXT, TEXT, TEXT) TO anon, authenticated;
