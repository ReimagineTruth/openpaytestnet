CREATE TABLE IF NOT EXISTS public.virtual_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cardholder_name TEXT NOT NULL DEFAULT '',
  card_username TEXT NOT NULL DEFAULT '',
  card_number TEXT NOT NULL UNIQUE,
  expiry_month INTEGER NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year INTEGER NOT NULL CHECK (expiry_year >= 2026),
  cvc TEXT NOT NULL CHECK (char_length(cvc) = 3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_cards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'virtual_cards'
      AND policyname = 'Users can view own virtual card'
  ) THEN
    CREATE POLICY "Users can view own virtual card"
      ON public.virtual_cards
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'virtual_cards'
      AND policyname = 'Users can insert own virtual card'
  ) THEN
    CREATE POLICY "Users can insert own virtual card"
      ON public.virtual_cards
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'virtual_cards'
      AND policyname = 'Users can update own virtual card'
  ) THEN
    CREATE POLICY "Users can update own virtual card"
      ON public.virtual_cards
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_virtual_cards_updated_at ON public.virtual_cards;
CREATE TRIGGER trg_virtual_cards_updated_at
BEFORE UPDATE ON public.virtual_cards
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

CREATE OR REPLACE FUNCTION public.generate_openpay_card_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate TEXT;
BEGIN
  LOOP
    v_candidate := '5599' || LPAD((FLOOR(random() * 1000000000000))::BIGINT::TEXT, 12, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.virtual_cards WHERE card_number = v_candidate);
  END LOOP;
  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_openpay_cvc()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT LPAD((FLOOR(random() * 1000))::INT::TEXT, 3, '0');
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_virtual_card(
  p_cardholder_name TEXT DEFAULT NULL,
  p_card_username TEXT DEFAULT NULL
)
RETURNS public.virtual_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_name TEXT;
  v_profile_username TEXT;
  v_card public.virtual_cards;
  v_now DATE := CURRENT_DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT full_name, COALESCE(username, '')
  INTO v_profile_name, v_profile_username
  FROM public.profiles
  WHERE id = v_user_id;

  SELECT *
  INTO v_card
  FROM public.virtual_cards
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.virtual_cards
    SET cardholder_name = COALESCE(NULLIF(TRIM(p_cardholder_name), ''), cardholder_name),
        card_username = COALESCE(NULLIF(TRIM(p_card_username), ''), card_username),
        is_active = true
    WHERE user_id = v_user_id
    RETURNING * INTO v_card;
    RETURN v_card;
  END IF;

  INSERT INTO public.virtual_cards (
    user_id,
    cardholder_name,
    card_username,
    card_number,
    expiry_month,
    expiry_year,
    cvc
  )
  VALUES (
    v_user_id,
    COALESCE(NULLIF(TRIM(p_cardholder_name), ''), NULLIF(TRIM(v_profile_name), ''), 'OpenPay User'),
    COALESCE(NULLIF(TRIM(p_card_username), ''), NULLIF(TRIM(v_profile_username), ''), 'openpay'),
    public.generate_openpay_card_number(),
    EXTRACT(MONTH FROM v_now)::INT,
    (EXTRACT(YEAR FROM v_now)::INT + 4),
    public.generate_openpay_cvc()
  )
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
  ) THEN
    RAISE EXCEPTION 'Invalid virtual card details';
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

REVOKE ALL ON FUNCTION public.upsert_my_virtual_card(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_with_virtual_card_checkout(TEXT, INTEGER, INTEGER, TEXT, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_virtual_card(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_with_virtual_card_checkout(TEXT, INTEGER, INTEGER, TEXT, UUID, NUMERIC, TEXT) TO authenticated;

