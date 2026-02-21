-- Ensure pgcrypto is available. Supabase usually installs extensions in schema "extensions".
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Compatibility wrapper: existing functions call digest(...) with search_path=public.
-- This wrapper forwards to extensions.digest(...) so those functions keep working.
CREATE OR REPLACE FUNCTION public.digest(data TEXT, algorithm TEXT)
RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT extensions.digest(data, algorithm);
$$;

-- Compatibility wrapper for random byte generation used by merchant key/link/session functions.
CREATE OR REPLACE FUNCTION public.gen_random_bytes(length INTEGER)
RETURNS BYTEA
LANGUAGE sql
VOLATILE
STRICT
AS $$
  SELECT extensions.gen_random_bytes(length);
$$;
