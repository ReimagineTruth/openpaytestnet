ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS qr_print_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
