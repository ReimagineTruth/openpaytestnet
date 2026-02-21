-- USD-based FX rates for the app.
-- Product rule: 1 PI = 1 USD.

CREATE TABLE IF NOT EXISTS public.supported_currencies (
  iso_code TEXT PRIMARY KEY,
  display_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  flag TEXT NOT NULL,
  usd_rate NUMERIC(20, 8) NOT NULL CHECK (usd_rate > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalize and relax iso_code checks so PI (2 letters) is valid.
UPDATE public.supported_currencies
SET iso_code = upper(trim(iso_code))
WHERE iso_code IS NOT NULL;

ALTER TABLE public.supported_currencies
DROP CONSTRAINT IF EXISTS supported_currencies_iso_code_check;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  FOR v_constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.supported_currencies'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%iso_code%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.supported_currencies DROP CONSTRAINT IF EXISTS %I',
      v_constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.supported_currencies
ADD CONSTRAINT supported_currencies_iso_code_check
CHECK (iso_code ~ '^[A-Z]{2,3}$');

ALTER TABLE public.supported_currencies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supported_currencies'
      AND policyname = 'Anyone can read supported currencies'
  ) THEN
    CREATE POLICY "Anyone can read supported currencies"
      ON public.supported_currencies
      FOR SELECT
      USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_supported_currencies_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supported_currencies_updated_at ON public.supported_currencies;
CREATE TRIGGER trg_supported_currencies_updated_at
BEFORE UPDATE ON public.supported_currencies
FOR EACH ROW
EXECUTE FUNCTION public.set_supported_currencies_updated_at();

INSERT INTO public.supported_currencies (
  iso_code, display_code, display_name, symbol, flag, usd_rate, is_active
)
SELECT
  v.code,
  v.code,
  v.code,
  v.code,
  '🏳️',
  CASE WHEN v.code IN ('PI', 'USD') THEN 1 ELSE 1 END,
  true
FROM (
  VALUES
  ('PI'), ('USD'), ('CAD'), ('MXN'), ('BRL'), ('ARS'), ('CLP'), ('COP'), ('PEN'), ('BOB'),
  ('UYU'), ('PYG'), ('VES'), ('GTQ'), ('HNL'), ('NIO'), ('CRC'), ('PAB'), ('DOP'), ('CUP'),
  ('JMD'), ('TTD'), ('BBD'), ('BSD'), ('XCD'),
  ('EUR'), ('GBP'), ('CHF'), ('SEK'), ('NOK'), ('DKK'), ('PLN'), ('CZK'), ('HUF'), ('RON'),
  ('BGN'), ('RSD'), ('MKD'), ('ALL'), ('ISK'), ('UAH'), ('BYN'), ('RUB'), ('TRY'), ('BAM'), ('MDL'),
  ('JPY'), ('CNY'), ('KRW'), ('INR'), ('PKR'), ('BDT'), ('LKR'), ('NPR'), ('IDR'), ('MYR'),
  ('THB'), ('PHP'), ('SGD'), ('VND'), ('KHR'), ('LAK'), ('MMK'), ('BND'), ('HKD'), ('MOP'),
  ('TWD'), ('MNT'), ('KZT'), ('UZS'), ('TJS'), ('TMT'), ('KGS'), ('IRR'), ('IQD'), ('SAR'),
  ('AED'), ('QAR'), ('KWD'), ('OMR'), ('BHD'), ('ILS'), ('JOD'), ('LBP'), ('SYP'), ('YER'), ('AFN'),
  ('ZAR'), ('EGP'), ('NGN'), ('KES'), ('TZS'), ('UGX'), ('ETB'), ('GHS'), ('ZMW'), ('MWK'),
  ('MZN'), ('BWP'), ('NAD'), ('SZL'), ('LSL'), ('AOA'), ('CDF'), ('RWF'), ('BIF'), ('DJF'),
  ('SOS'), ('SDG'), ('SSP'), ('DZD'), ('MAD'), ('TND'), ('LYD'), ('XOF'), ('XAF'), ('MUR'), ('SCR'),
  ('AUD'), ('NZD'), ('PGK'), ('FJD'), ('SBD'), ('VUV'), ('WST'), ('TOP')
) AS v(code)
ON CONFLICT (iso_code) DO UPDATE
SET
  is_active = true,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.apply_usd_exchange_rates(p_rates JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_code TEXT;
  v_rate_text TEXT;
  v_rate NUMERIC;
BEGIN
  IF jsonb_typeof(p_rates) <> 'object' THEN
    RAISE EXCEPTION 'p_rates must be a JSON object keyed by currency code';
  END IF;

  -- Hard business rule.
  UPDATE public.supported_currencies
  SET usd_rate = 1, updated_at = now()
  WHERE iso_code IN ('PI', 'USD');

  FOR v_code, v_rate_text IN
    SELECT key, value
    FROM jsonb_each_text(p_rates)
  LOOP
    v_code := upper(v_code);
    IF v_code IN ('PI', 'USD') THEN
      CONTINUE;
    END IF;

    BEGIN
      v_rate := v_rate_text::numeric;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_rate IS NULL OR v_rate <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.supported_currencies
    SET usd_rate = v_rate, updated_at = now()
    WHERE iso_code = v_code;

    IF FOUND THEN
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_usd_exchange_rates(JSONB) TO service_role;
