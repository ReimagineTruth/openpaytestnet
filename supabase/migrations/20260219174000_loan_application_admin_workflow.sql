CREATE TABLE IF NOT EXISTS public.user_loan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_amount NUMERIC(12,2) NOT NULL CHECK (requested_amount >= 10 AND requested_amount <= 50000),
  requested_term_months INTEGER NOT NULL CHECK (requested_term_months >= 1 AND requested_term_months <= 60),
  credit_score_snapshot INTEGER NOT NULL DEFAULT 620 CHECK (credit_score_snapshot >= 300 AND credit_score_snapshot <= 900),
  full_name TEXT NOT NULL DEFAULT '',
  contact_number TEXT NOT NULL DEFAULT '',
  address_line TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  openpay_account_number TEXT NOT NULL DEFAULT '',
  openpay_account_username TEXT NOT NULL DEFAULT '',
  agreement_accepted BOOLEAN NOT NULL DEFAULT false,
  agreement_accepted_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note TEXT NOT NULL DEFAULT '',
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_loan_applications_user_created
ON public.user_loan_applications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_loan_applications_status_created
ON public.user_loan_applications(status, created_at DESC);

ALTER TABLE public.user_loan_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_loan_applications' AND policyname = 'Users can view own loan applications'
  ) THEN
    CREATE POLICY "Users can view own loan applications"
      ON public.user_loan_applications
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_user_loan_applications_updated_at ON public.user_loan_applications;
CREATE TRIGGER trg_user_loan_applications_updated_at
BEFORE UPDATE ON public.user_loan_applications
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

ALTER TABLE public.user_loan_payments
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'wallet' CHECK (payment_method IN ('wallet', 'pi')),
ADD COLUMN IF NOT EXISTS payment_reference TEXT;

CREATE OR REPLACE FUNCTION public.is_openpay_core_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT LOWER(COALESCE(p.username, ''))
  INTO v_username
  FROM public.profiles p
  WHERE p.id = v_user_id;

  RETURN v_username IN ('openpay', 'wainfoundation');
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_my_loan_application(
  p_requested_amount NUMERIC,
  p_requested_term_months INTEGER,
  p_full_name TEXT,
  p_contact_number TEXT,
  p_address_line TEXT,
  p_city TEXT,
  p_country TEXT,
  p_openpay_account_number TEXT,
  p_openpay_account_username TEXT,
  p_agreement_accepted BOOLEAN DEFAULT false
)
RETURNS public.user_loan_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_app public.user_loan_applications;
  v_existing_id UUID;
  v_credit_score INTEGER := 620;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF COALESCE(p_agreement_accepted, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'You must accept loan agreement before submitting';
  END IF;

  IF COALESCE(TRIM(p_full_name), '') = '' OR COALESCE(TRIM(p_contact_number), '') = '' OR COALESCE(TRIM(p_address_line), '') = '' OR
     COALESCE(TRIM(p_city), '') = '' OR COALESCE(TRIM(p_country), '') = '' OR
     COALESCE(TRIM(p_openpay_account_number), '') = '' OR COALESCE(TRIM(p_openpay_account_username), '') = '' THEN
    RAISE EXCEPTION 'Complete all required loan form fields';
  END IF;

  SELECT ula.id INTO v_existing_id
  FROM public.user_loan_applications ula
  WHERE ula.user_id = v_user_id
    AND ula.status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a pending loan application';
  END IF;

  SELECT ul.id INTO v_existing_id
  FROM public.user_loans ul
  WHERE ul.user_id = v_user_id
    AND ul.status IN ('pending', 'active')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have an active or pending loan';
  END IF;

  BEGIN
    v_credit_score := public.calculate_user_activity_credit_score(v_user_id);
  EXCEPTION
    WHEN OTHERS THEN
      v_credit_score := 620;
  END;

  INSERT INTO public.user_loan_applications (
    user_id,
    requested_amount,
    requested_term_months,
    credit_score_snapshot,
    full_name,
    contact_number,
    address_line,
    city,
    country,
    openpay_account_number,
    openpay_account_username,
    agreement_accepted,
    agreement_accepted_at,
    status
  )
  VALUES (
    v_user_id,
    ROUND(COALESCE(p_requested_amount, 0), 2),
    GREATEST(1, LEAST(COALESCE(p_requested_term_months, 6), 60)),
    GREATEST(300, LEAST(v_credit_score, 900)),
    LEFT(TRIM(p_full_name), 120),
    LEFT(TRIM(p_contact_number), 60),
    LEFT(TRIM(p_address_line), 180),
    LEFT(TRIM(p_city), 120),
    LEFT(TRIM(p_country), 120),
    LEFT(TRIM(p_openpay_account_number), 80),
    LEFT(TRIM(p_openpay_account_username), 80),
    true,
    now(),
    'pending'
  )
  RETURNING * INTO v_app;

  RETURN v_app;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_latest_loan_application()
RETURNS public.user_loan_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.user_loan_applications;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_row
  FROM public.user_loan_applications
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_loan_payment_history(
  p_loan_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 24
)
RETURNS TABLE (
  id UUID,
  loan_id UUID,
  amount NUMERIC,
  principal_component NUMERIC,
  fee_component NUMERIC,
  payment_method TEXT,
  payment_reference TEXT,
  note TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_target_loan UUID := p_loan_id;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_target_loan IS NULL THEN
    SELECT ul.id
    INTO v_target_loan
    FROM public.user_loans ul
    WHERE ul.user_id = v_user_id
    ORDER BY ul.created_at DESC
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    ulp.id,
    ulp.loan_id,
    ulp.amount,
    ulp.principal_component,
    ulp.fee_component,
    ulp.payment_method,
    ulp.payment_reference,
    ulp.note,
    ulp.created_at
  FROM public.user_loan_payments ulp
  WHERE ulp.user_id = v_user_id
    AND (v_target_loan IS NULL OR ulp.loan_id = v_target_loan)
  ORDER BY ulp.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_my_loan_monthly_with_method(
  p_loan_id UUID,
  p_amount NUMERIC DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'wallet',
  p_note TEXT DEFAULT 'Loan monthly payment',
  p_payment_reference TEXT DEFAULT NULL
)
RETURNS TABLE (
  loan_id UUID,
  remaining_balance NUMERIC,
  paid_months INTEGER,
  status TEXT,
  wallet_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_loan public.user_loans;
  v_due NUMERIC(12,2);
  v_wallet_balance NUMERIC(12,2);
  v_principal_component NUMERIC(12,2);
  v_fee_component NUMERIC(12,2);
  v_method TEXT := LOWER(TRIM(COALESCE(p_payment_method, 'wallet')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_method NOT IN ('wallet', 'pi') THEN
    RAISE EXCEPTION 'Payment method must be wallet or pi';
  END IF;

  SELECT * INTO v_loan
  FROM public.user_loans
  WHERE id = p_loan_id
    AND user_id = v_user_id
    AND public.user_loans.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active loan not found';
  END IF;

  v_due := ROUND(COALESCE(p_amount, LEAST(v_loan.outstanding_amount, v_loan.monthly_payment_amount)), 2);
  IF v_due <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0';
  END IF;

  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_wallet_balance < v_due THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  v_principal_component := ROUND(LEAST(v_loan.outstanding_amount, v_due / (1 + v_loan.monthly_fee_rate)), 2);
  v_fee_component := ROUND(v_due - v_principal_component, 2);

  UPDATE public.wallets
  SET balance = v_wallet_balance - v_due,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance INTO v_wallet_balance;

  UPDATE public.user_loans
  SET outstanding_amount = GREATEST(0, outstanding_amount - v_principal_component),
      paid_months = paid_months + 1,
      next_due_date = (next_due_date + INTERVAL '1 month')::DATE,
      status = CASE
        WHEN GREATEST(0, outstanding_amount - v_principal_component) = 0 THEN 'paid'
        ELSE v_loan.status
      END
  WHERE id = v_loan.id
  RETURNING * INTO v_loan;

  INSERT INTO public.user_loan_payments (
    loan_id,
    user_id,
    amount,
    principal_component,
    fee_component,
    payment_method,
    payment_reference,
    note
  )
  VALUES (
    v_loan.id,
    v_user_id,
    v_due,
    v_principal_component,
    v_fee_component,
    v_method,
    NULLIF(TRIM(COALESCE(p_payment_reference, '')), ''),
    COALESCE(p_note, 'Loan monthly payment')
  );

  INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
  VALUES (
    v_user_id,
    v_user_id,
    v_due,
    CONCAT(
      'OpenPay loan repayment | Loan ',
      v_loan.id,
      ' | Method ',
      UPPER(v_method),
      CASE
        WHEN NULLIF(TRIM(COALESCE(p_payment_reference, '')), '') IS NOT NULL
          THEN CONCAT(' | Ref ', LEFT(TRIM(p_payment_reference), 80))
        ELSE ''
      END
    ),
    'completed'
  );

  RETURN QUERY
  SELECT v_loan.id, v_loan.outstanding_amount, v_loan.paid_months, v_loan.status, v_wallet_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_my_loan_monthly(
  p_loan_id UUID,
  p_amount NUMERIC DEFAULT NULL,
  p_note TEXT DEFAULT 'Loan monthly payment'
)
RETURNS TABLE (
  loan_id UUID,
  remaining_balance NUMERIC,
  paid_months INTEGER,
  status TEXT,
  wallet_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.pay_my_loan_monthly_with_method(
    p_loan_id => p_loan_id,
    p_amount => p_amount,
    p_payment_method => 'wallet',
    p_note => p_note,
    p_payment_reference => NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_loan_applications(
  p_status TEXT DEFAULT 'pending',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  requested_amount NUMERIC,
  requested_term_months INTEGER,
  credit_score_snapshot INTEGER,
  full_name TEXT,
  contact_number TEXT,
  address_line TEXT,
  city TEXT,
  country TEXT,
  openpay_account_number TEXT,
  openpay_account_username TEXT,
  agreement_accepted BOOLEAN,
  status TEXT,
  admin_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  applicant_display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT := LOWER(TRIM(COALESCE(p_status, 'pending')));
BEGIN
  IF public.is_openpay_core_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    ula.id,
    ula.user_id,
    ula.requested_amount,
    ula.requested_term_months,
    ula.credit_score_snapshot,
    ula.full_name,
    ula.contact_number,
    ula.address_line,
    ula.city,
    ula.country,
    ula.openpay_account_number,
    ula.openpay_account_username,
    ula.agreement_accepted,
    ula.status,
    ula.admin_note,
    ula.reviewed_at,
    ula.created_at,
    COALESCE(NULLIF(p.full_name, ''), CONCAT('@', NULLIF(p.username, '')), LEFT(ula.user_id::TEXT, 8))
  FROM public.user_loan_applications ula
  LEFT JOIN public.profiles p ON p.id = ula.user_id
  WHERE (v_status = 'all' OR ula.status = v_status)
  ORDER BY ula.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_loan_application(
  p_application_id UUID,
  p_decision TEXT,
  p_admin_note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_user_id UUID := auth.uid();
  v_decision TEXT := LOWER(TRIM(COALESCE(p_decision, '')));
  v_app public.user_loan_applications;
  v_fee_rate NUMERIC(6,4);
  v_monthly NUMERIC(12,2);
  v_wallet_balance NUMERIC(12,2);
  v_loan public.user_loans;
  v_existing UUID;
BEGIN
  IF public.is_openpay_core_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'Application id is required';
  END IF;

  IF v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Decision must be approve or reject';
  END IF;

  SELECT * INTO v_app
  FROM public.user_loan_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan application not found';
  END IF;

  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'Loan application already processed';
  END IF;

  IF v_decision = 'reject' THEN
    UPDATE public.user_loan_applications
    SET status = 'rejected',
        admin_note = COALESCE(p_admin_note, ''),
        reviewed_by = v_admin_user_id,
        reviewed_at = now()
    WHERE id = v_app.id;

    RETURN NULL;
  END IF;

  SELECT ul.id INTO v_existing
  FROM public.user_loans ul
  WHERE ul.user_id = v_app.user_id
    AND ul.status IN ('pending', 'active')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'User already has active or pending loan';
  END IF;

  v_fee_rate := CASE
    WHEN v_app.credit_score_snapshot >= 750 THEN 0.0100
    WHEN v_app.credit_score_snapshot >= 680 THEN 0.0150
    WHEN v_app.credit_score_snapshot >= 620 THEN 0.0200
    ELSE 0.0300
  END;

  v_monthly := ROUND((v_app.requested_amount / v_app.requested_term_months) + (v_app.requested_amount * v_fee_rate), 2);

  INSERT INTO public.user_loans (
    user_id,
    principal_amount,
    outstanding_amount,
    monthly_payment_amount,
    monthly_fee_rate,
    term_months,
    credit_score,
    status,
    next_due_date
  )
  VALUES (
    v_app.user_id,
    v_app.requested_amount,
    v_app.requested_amount,
    v_monthly,
    v_fee_rate,
    v_app.requested_term_months,
    v_app.credit_score_snapshot,
    'active',
    (CURRENT_DATE + INTERVAL '1 month')::DATE
  )
  RETURNING * INTO v_loan;

  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_app.user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  UPDATE public.wallets
  SET balance = v_wallet_balance + v_app.requested_amount,
      updated_at = now()
  WHERE user_id = v_app.user_id;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
  VALUES (
    v_app.user_id,
    v_app.user_id,
    v_app.requested_amount,
    CONCAT('OpenPay loan disbursement (admin approved) | Loan ', v_loan.id),
    'completed'
  );

  UPDATE public.user_loan_applications
  SET status = 'approved',
      admin_note = COALESCE(p_admin_note, ''),
      reviewed_by = v_admin_user_id,
      reviewed_at = now()
  WHERE id = v_app.id;

  RETURN v_loan.id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_openpay_core_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_my_loan_application(NUMERIC, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_latest_loan_application() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_loan_payment_history(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_my_loan_monthly_with_method(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_loan_applications(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_loan_application(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_openpay_core_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_loan_application(NUMERIC, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_latest_loan_application() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_loan_payment_history(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_my_loan_monthly_with_method(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_loan_applications(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_loan_application(UUID, TEXT, TEXT) TO authenticated;
