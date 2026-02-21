CREATE TABLE IF NOT EXISTS public.merchant_payment_link_share_settings (
  link_id UUID PRIMARY KEY REFERENCES public.merchant_payment_links(id) ON DELETE CASCADE,
  merchant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  button_label TEXT NOT NULL DEFAULT 'Pay with OpenPay',
  button_style TEXT NOT NULL DEFAULT 'default' CHECK (button_style IN ('default', 'soft', 'dark')),
  button_size TEXT NOT NULL DEFAULT 'medium' CHECK (button_size IN ('small', 'medium', 'large')),
  widget_theme TEXT NOT NULL DEFAULT 'light' CHECK (widget_theme IN ('light', 'dark')),
  iframe_height INTEGER NOT NULL DEFAULT 720 CHECK (iframe_height BETWEEN 320 AND 2000),
  direct_open_new_tab BOOLEAN NOT NULL DEFAULT true,
  qr_size INTEGER NOT NULL DEFAULT 240 CHECK (qr_size BETWEEN 160 AND 1024),
  qr_logo_enabled BOOLEAN NOT NULL DEFAULT true,
  qr_logo_url TEXT NOT NULL DEFAULT '/openpay-o.svg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_link_share_settings_owner
ON public.merchant_payment_link_share_settings (merchant_user_id, updated_at DESC);

ALTER TABLE public.merchant_payment_link_share_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_payment_link_share_settings'
      AND policyname = 'Users can view own merchant payment link share settings'
  ) THEN
    CREATE POLICY "Users can view own merchant payment link share settings"
      ON public.merchant_payment_link_share_settings
      FOR SELECT TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_payment_link_share_settings'
      AND policyname = 'Users can insert own merchant payment link share settings'
  ) THEN
    CREATE POLICY "Users can insert own merchant payment link share settings"
      ON public.merchant_payment_link_share_settings
      FOR INSERT TO authenticated
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_payment_link_share_settings'
      AND policyname = 'Users can update own merchant payment link share settings'
  ) THEN
    CREATE POLICY "Users can update own merchant payment link share settings"
      ON public.merchant_payment_link_share_settings
      FOR UPDATE TO authenticated
      USING (merchant_user_id = auth.uid())
      WITH CHECK (merchant_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merchant_payment_link_share_settings'
      AND policyname = 'Users can delete own merchant payment link share settings'
  ) THEN
    CREATE POLICY "Users can delete own merchant payment link share settings"
      ON public.merchant_payment_link_share_settings
      FOR DELETE TO authenticated
      USING (merchant_user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_merchant_payment_link_share_settings_updated_at ON public.merchant_payment_link_share_settings;
CREATE TRIGGER trg_merchant_payment_link_share_settings_updated_at
BEFORE UPDATE ON public.merchant_payment_link_share_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_my_payment_link_share_settings(
  p_link_id UUID,
  p_button_label TEXT DEFAULT NULL,
  p_button_style TEXT DEFAULT NULL,
  p_button_size TEXT DEFAULT NULL,
  p_widget_theme TEXT DEFAULT NULL,
  p_iframe_height INTEGER DEFAULT NULL,
  p_direct_open_new_tab BOOLEAN DEFAULT NULL,
  p_qr_size INTEGER DEFAULT NULL,
  p_qr_logo_enabled BOOLEAN DEFAULT NULL,
  p_qr_logo_url TEXT DEFAULT NULL
)
RETURNS public.merchant_payment_link_share_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_link public.merchant_payment_links;
  v_row public.merchant_payment_link_share_settings;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_link
  FROM public.merchant_payment_links mpl
  WHERE mpl.id = p_link_id
    AND mpl.merchant_user_id = v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment link not found';
  END IF;

  INSERT INTO public.merchant_payment_link_share_settings (
    link_id,
    merchant_user_id,
    button_label,
    button_style,
    button_size,
    widget_theme,
    iframe_height,
    direct_open_new_tab,
    qr_size,
    qr_logo_enabled,
    qr_logo_url
  )
  VALUES (
    v_link.id,
    v_user_id,
    COALESCE(NULLIF(TRIM(COALESCE(p_button_label, '')), ''), 'Pay with OpenPay'),
    COALESCE(NULLIF(TRIM(COALESCE(p_button_style, '')), ''), 'default'),
    COALESCE(NULLIF(TRIM(COALESCE(p_button_size, '')), ''), 'medium'),
    COALESCE(NULLIF(TRIM(COALESCE(p_widget_theme, '')), ''), 'light'),
    COALESCE(p_iframe_height, 720),
    COALESCE(p_direct_open_new_tab, true),
    COALESCE(p_qr_size, 240),
    COALESCE(p_qr_logo_enabled, true),
    COALESCE(NULLIF(TRIM(COALESCE(p_qr_logo_url, '')), ''), '/openpay-o.svg')
  )
  ON CONFLICT (link_id)
  DO UPDATE SET
    button_label = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.button_label, '')), ''), public.merchant_payment_link_share_settings.button_label),
    button_style = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.button_style, '')), ''), public.merchant_payment_link_share_settings.button_style),
    button_size = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.button_size, '')), ''), public.merchant_payment_link_share_settings.button_size),
    widget_theme = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.widget_theme, '')), ''), public.merchant_payment_link_share_settings.widget_theme),
    iframe_height = COALESCE(EXCLUDED.iframe_height, public.merchant_payment_link_share_settings.iframe_height),
    direct_open_new_tab = COALESCE(EXCLUDED.direct_open_new_tab, public.merchant_payment_link_share_settings.direct_open_new_tab),
    qr_size = COALESCE(EXCLUDED.qr_size, public.merchant_payment_link_share_settings.qr_size),
    qr_logo_enabled = COALESCE(EXCLUDED.qr_logo_enabled, public.merchant_payment_link_share_settings.qr_logo_enabled),
    qr_logo_url = COALESCE(NULLIF(TRIM(COALESCE(EXCLUDED.qr_logo_url, '')), ''), public.merchant_payment_link_share_settings.qr_logo_url),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_payment_link_share_settings(
  p_link_id UUID
)
RETURNS public.merchant_payment_link_share_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.merchant_payment_link_share_settings;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_row
  FROM public.merchant_payment_link_share_settings s
  WHERE s.link_id = p_link_id
    AND s.merchant_user_id = v_user_id
  LIMIT 1;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_payment_link_share_settings(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, INTEGER, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_payment_link_share_settings(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_my_payment_link_share_settings(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, INTEGER, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_payment_link_share_settings(UUID) TO authenticated;
