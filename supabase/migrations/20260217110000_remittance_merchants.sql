CREATE TABLE IF NOT EXISTS public.remittance_merchants (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL DEFAULT 'OpenPay Remittance Center',
  merchant_username TEXT NOT NULL DEFAULT '',
  merchant_city TEXT NOT NULL DEFAULT '',
  merchant_country TEXT NOT NULL DEFAULT 'United States',
  business_note TEXT NOT NULL DEFAULT 'Cash deposit and payout available.',
  fee_title TEXT NOT NULL DEFAULT 'Remittance Fee Card',
  deposit_fee_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (deposit_fee_percent >= 0 AND deposit_fee_percent <= 100),
  payout_fee_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (payout_fee_percent >= 0 AND payout_fee_percent <= 100),
  flat_service_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (flat_service_fee >= 0),
  fee_notes TEXT NOT NULL DEFAULT 'Rates are set by merchant and may vary by amount/currency.',
  qr_tagline TEXT NOT NULL DEFAULT 'SCAN TO DEPOSIT / PAYOUT',
  qr_accent TEXT NOT NULL DEFAULT '#2148ff',
  qr_background TEXT NOT NULL DEFAULT '#ffffff',
  banner_title TEXT NOT NULL DEFAULT 'OpenPay Remittance Center',
  banner_subtitle TEXT NOT NULL DEFAULT 'Powered by Pi Network',
  min_operating_balance NUMERIC(12,2) NOT NULL DEFAULT 25 CHECK (min_operating_balance >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remittance_merchants_active
ON public.remittance_merchants (is_active);

CREATE INDEX IF NOT EXISTS idx_remittance_merchants_location
ON public.remittance_merchants (merchant_country, merchant_city);

ALTER TABLE public.remittance_merchants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'remittance_merchants'
      AND policyname = 'Users can view active remittance merchants'
  ) THEN
    CREATE POLICY "Users can view active remittance merchants"
      ON public.remittance_merchants
      FOR SELECT TO authenticated
      USING (is_active = true OR user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'remittance_merchants'
      AND policyname = 'Users can insert own remittance merchant profile'
  ) THEN
    CREATE POLICY "Users can insert own remittance merchant profile"
      ON public.remittance_merchants
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'remittance_merchants'
      AND policyname = 'Users can update own remittance merchant profile'
  ) THEN
    CREATE POLICY "Users can update own remittance merchant profile"
      ON public.remittance_merchants
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_remittance_merchants_updated_at ON public.remittance_merchants;
CREATE TRIGGER trg_remittance_merchants_updated_at
BEFORE UPDATE ON public.remittance_merchants
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

INSERT INTO public.remittance_merchants (user_id, merchant_name, merchant_username)
SELECT p.id, COALESCE(NULLIF(p.full_name, ''), 'OpenPay Remittance Center'), COALESCE(NULLIF(p.username, ''), '')
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;
