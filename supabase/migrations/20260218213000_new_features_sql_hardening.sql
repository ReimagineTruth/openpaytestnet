-- Final hardening for newly added features:
-- - Open Partner lead intake validation + RPC
-- - Additional explicit insert policies for savings/loan journals

ALTER TABLE public.open_partner_leads
  ADD CONSTRAINT open_partner_leads_contact_email_format_chk
  CHECK (position('@' in contact_email) > 1);

ALTER TABLE public.open_partner_leads
  ADD CONSTRAINT open_partner_leads_company_name_len_chk
  CHECK (char_length(trim(company_name)) BETWEEN 2 AND 120);

ALTER TABLE public.open_partner_leads
  ADD CONSTRAINT open_partner_leads_contact_name_len_chk
  CHECK (char_length(trim(contact_name)) BETWEEN 2 AND 120);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_savings_transfers' AND policyname = 'Users can insert own savings transfers'
  ) THEN
    CREATE POLICY "Users can insert own savings transfers"
      ON public.user_savings_transfers
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_loans' AND policyname = 'Users can insert own loans'
  ) THEN
    CREATE POLICY "Users can insert own loans"
      ON public.user_loans
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_loan_payments' AND policyname = 'Users can insert own loan payments'
  ) THEN
    CREATE POLICY "Users can insert own loan payments"
      ON public.user_loan_payments
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_open_partner_lead(
  p_company_name TEXT,
  p_contact_name TEXT,
  p_contact_email TEXT,
  p_country TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_business_type TEXT DEFAULT NULL,
  p_integration_type TEXT DEFAULT NULL,
  p_estimated_monthly_volume TEXT DEFAULT NULL,
  p_use_case_summary TEXT DEFAULT '',
  p_message TEXT DEFAULT NULL
)
RETURNS public.open_partner_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.open_partner_leads;
  v_company_name TEXT := trim(COALESCE(p_company_name, ''));
  v_contact_name TEXT := trim(COALESCE(p_contact_name, ''));
  v_contact_email TEXT := lower(trim(COALESCE(p_contact_email, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF char_length(v_company_name) < 2 THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  IF char_length(v_contact_name) < 2 THEN
    RAISE EXCEPTION 'Contact name is required';
  END IF;

  IF position('@' in v_contact_email) <= 1 THEN
    RAISE EXCEPTION 'Valid contact email is required';
  END IF;

  INSERT INTO public.open_partner_leads (
    requester_user_id,
    company_name,
    contact_name,
    contact_email,
    country,
    website_url,
    business_type,
    integration_type,
    estimated_monthly_volume,
    use_case_summary,
    message,
    status
  )
  VALUES (
    v_user_id,
    v_company_name,
    v_contact_name,
    v_contact_email,
    NULLIF(trim(COALESCE(p_country, '')), ''),
    NULLIF(trim(COALESCE(p_website_url, '')), ''),
    NULLIF(trim(COALESCE(p_business_type, '')), ''),
    NULLIF(trim(COALESCE(p_integration_type, '')), ''),
    NULLIF(trim(COALESCE(p_estimated_monthly_volume, '')), ''),
    trim(COALESCE(p_use_case_summary, '')),
    NULLIF(trim(COALESCE(p_message, '')), ''),
    'new'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_open_partner_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_open_partner_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
