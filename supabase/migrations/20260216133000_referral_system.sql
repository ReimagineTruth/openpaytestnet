ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT,
ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_no_self_referral;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_no_self_referral
CHECK (referred_by_user_id IS NULL OR referred_by_user_id <> id);

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by_user_id
ON public.profiles (referred_by_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code_unique
ON public.profiles (LOWER(referral_code))
WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_amount NUMERIC(12,2) NOT NULL DEFAULT 1.00 CHECK (reward_amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referral_rewards'
      AND policyname = 'Users can view own referral rewards'
  ) THEN
    CREATE POLICY "Users can view own referral rewards"
      ON public.referral_rewards
      FOR SELECT
      TO authenticated
      USING (
        referrer_user_id = auth.uid() OR referred_user_id = auth.uid()
      );
  END IF;
END;
$$;

DO $$
DECLARE
  rec RECORD;
  base_code TEXT;
  candidate_code TEXT;
  code_counter INTEGER;
BEGIN
  FOR rec IN
    SELECT p.id, p.username
    FROM public.profiles p
    WHERE p.referral_code IS NULL
  LOOP
    base_code := LOWER(
      REGEXP_REPLACE(
        COALESCE(NULLIF(BTRIM(rec.username), ''), 'user_' || REPLACE(SUBSTRING(rec.id::text, 1, 8), '-', '')),
        '[^a-z0-9_]',
        '',
        'g'
      )
    );

    IF base_code IS NULL OR base_code = '' THEN
      base_code := 'user_' || REPLACE(SUBSTRING(rec.id::text, 1, 8), '-', '');
    END IF;

    candidate_code := base_code;
    code_counter := 0;

    WHILE EXISTS (
      SELECT 1
      FROM public.profiles p2
      WHERE p2.id <> rec.id
        AND LOWER(p2.referral_code) = candidate_code
    ) LOOP
      code_counter := code_counter + 1;
      candidate_code := base_code || code_counter::text;
    END LOOP;

    UPDATE public.profiles
    SET referral_code = candidate_code
    WHERE id = rec.id;
  END LOOP;
END;
$$;

ALTER TABLE public.profiles
ALTER COLUMN referral_code SET NOT NULL;

UPDATE public.profiles
SET referral_code = LOWER(referral_code)
WHERE referral_code IS NOT NULL;

INSERT INTO public.referral_rewards (referrer_user_id, referred_user_id, reward_amount, status)
SELECT p.referred_by_user_id, p.id, 1.00, 'pending'
FROM public.profiles p
WHERE p.referred_by_user_id IS NOT NULL
ON CONFLICT (referred_user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_username TEXT;
  final_username TEXT;
  requested_referral_code TEXT;
  referred_by_id UUID;
  base_referral_code TEXT;
  final_referral_code TEXT;
  referral_suffix INTEGER := 0;
BEGIN
  requested_username := NULLIF(BTRIM(NEW.raw_user_meta_data->>'username'), '');

  IF requested_username IS NOT NULL THEN
    final_username := requested_username;

    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = final_username) THEN
      final_username := requested_username || '_' || REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', '');
    END IF;
  END IF;

  requested_referral_code := LOWER(NULLIF(BTRIM(NEW.raw_user_meta_data->>'referral_code'), ''));

  IF requested_referral_code IS NOT NULL THEN
    SELECT p.id
    INTO referred_by_id
    FROM public.profiles p
    WHERE LOWER(p.referral_code) = requested_referral_code
      AND p.id <> NEW.id
    LIMIT 1;
  END IF;

  base_referral_code := LOWER(
    REGEXP_REPLACE(
      COALESCE(final_username, 'user_' || REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', '')),
      '[^a-z0-9_]',
      '',
      'g'
    )
  );

  IF base_referral_code IS NULL OR base_referral_code = '' THEN
    base_referral_code := 'user_' || REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', '');
  END IF;

  final_referral_code := base_referral_code;

  WHILE EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE LOWER(p.referral_code) = final_referral_code
  ) LOOP
    referral_suffix := referral_suffix + 1;
    final_referral_code := base_referral_code || referral_suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, full_name, username, referral_code, referred_by_user_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    final_username,
    final_referral_code,
    referred_by_id
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id, balance, welcome_bonus_claimed_at)
  VALUES (NEW.id, 1.00, now())
  ON CONFLICT (user_id) DO NOTHING;

  IF referred_by_id IS NOT NULL THEN
    INSERT INTO public.referral_rewards (referrer_user_id, referred_user_id, reward_amount, status)
    VALUES (referred_by_id, NEW.id, 1.00, 'pending')
    ON CONFLICT (referred_user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_referral_rewards()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_claim_count INTEGER := 0;
  v_claim_amount NUMERIC(12,2) := 0;
  v_balance NUMERIC(12,2) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH claimed AS (
    UPDATE public.referral_rewards rr
    SET status = 'claimed',
        claimed_at = now()
    WHERE rr.referrer_user_id = v_user_id
      AND rr.status = 'pending'
    RETURNING rr.reward_amount
  )
  SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(reward_amount), 0)
  INTO v_claim_count, v_claim_amount
  FROM claimed;

  IF v_claim_count = 0 OR v_claim_amount <= 0 THEN
    INSERT INTO public.wallets (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT w.balance INTO v_balance
    FROM public.wallets w
    WHERE w.user_id = v_user_id;

    RETURN jsonb_build_object(
      'claimed', false,
      'count', 0,
      'amount', 0,
      'balance', COALESCE(v_balance, 0)
    );
  END IF;

  INSERT INTO public.wallets (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets w
  SET balance = w.balance + v_claim_amount,
      updated_at = now()
  WHERE w.user_id = v_user_id
  RETURNING w.balance INTO v_balance;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
  VALUES (
    v_user_id,
    v_user_id,
    v_claim_amount,
    format('Affiliate referral rewards (%s invite%s)', v_claim_count, CASE WHEN v_claim_count = 1 THEN '' ELSE 's' END),
    'completed'
  );

  RETURN jsonb_build_object(
    'claimed', true,
    'count', v_claim_count,
    'amount', v_claim_amount,
    'balance', v_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_referral_rewards() TO authenticated;
