CREATE TABLE IF NOT EXISTS public.open_partner_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  country TEXT,
  website_url TEXT,
  business_type TEXT,
  integration_type TEXT,
  estimated_monthly_volume TEXT,
  use_case_summary TEXT NOT NULL DEFAULT '',
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'approved', 'rejected', 'closed')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_open_partner_leads_requester_created
ON public.open_partner_leads (requester_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_open_partner_leads_status_created
ON public.open_partner_leads (status, created_at DESC);

ALTER TABLE public.open_partner_leads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'open_partner_leads' AND policyname = 'Users can view own partner leads'
  ) THEN
    CREATE POLICY "Users can view own partner leads"
      ON public.open_partner_leads
      FOR SELECT TO authenticated
      USING (requester_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'open_partner_leads' AND policyname = 'Users can create own partner leads'
  ) THEN
    CREATE POLICY "Users can create own partner leads"
      ON public.open_partner_leads
      FOR INSERT TO authenticated
      WITH CHECK (requester_user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_open_partner_leads_updated_at ON public.open_partner_leads;
CREATE TRIGGER trg_open_partner_leads_updated_at
BEFORE UPDATE ON public.open_partner_leads
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();
