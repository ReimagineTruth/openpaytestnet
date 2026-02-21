ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS welcome_bonus_claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_username TEXT;
  final_username TEXT;
BEGIN
  requested_username := NULLIF(BTRIM(NEW.raw_user_meta_data->>'username'), '');

  IF requested_username IS NOT NULL THEN
    final_username := requested_username;

    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = final_username) THEN
      final_username := requested_username || '_' || REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', '');
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    final_username
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id, balance, welcome_bonus_claimed_at)
  VALUES (NEW.id, 1.00, now())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_welcome_bonus()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wallet_balance NUMERIC(12,2);
  v_claimed_at TIMESTAMPTZ;
  v_new_balance NUMERIC(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.wallets (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, welcome_bonus_claimed_at
  INTO v_wallet_balance, v_claimed_at
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'amount', 0,
      'balance', v_wallet_balance
    );
  END IF;

  UPDATE public.wallets
  SET balance = v_wallet_balance + 1.00,
      welcome_bonus_claimed_at = now(),
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'claimed', true,
    'amount', 1,
    'balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus() TO authenticated;
