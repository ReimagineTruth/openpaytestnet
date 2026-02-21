-- Finalize remittance merchant schema and storage

ALTER TABLE public.remittance_merchants
ADD COLUMN IF NOT EXISTS merchant_logo_url TEXT NOT NULL DEFAULT '';

ALTER TABLE public.remittance_merchants
ADD CONSTRAINT remittance_merchants_qr_accent_hex_chk
CHECK (qr_accent ~* '^#[0-9a-f]{6}$');

ALTER TABLE public.remittance_merchants
ADD CONSTRAINT remittance_merchants_qr_background_hex_chk
CHECK (qr_background ~* '^#[0-9a-f]{6}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_remittance_merchants_username_unique
ON public.remittance_merchants (LOWER(merchant_username))
WHERE merchant_username <> '';

CREATE INDEX IF NOT EXISTS idx_remittance_merchants_updated_at
ON public.remittance_merchants (updated_at DESC);

-- Dedicated logo bucket for remittance stores/tarpaulins
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'remittance-logos',
  'remittance-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Remittance logos are publicly readable'
  ) THEN
    CREATE POLICY "Remittance logos are publicly readable"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'remittance-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload own remittance logos'
  ) THEN
    CREATE POLICY "Users can upload own remittance logos"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'remittance-logos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can update own remittance logos'
  ) THEN
    CREATE POLICY "Users can update own remittance logos"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'remittance-logos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'remittance-logos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can delete own remittance logos'
  ) THEN
    CREATE POLICY "Users can delete own remittance logos"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'remittance-logos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
