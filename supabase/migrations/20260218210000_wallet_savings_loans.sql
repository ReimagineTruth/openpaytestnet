CREATE TABLE IF NOT EXISTS public.user_savings_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  apy NUMERIC(5,2) NOT NULL DEFAULT 4.50 CHECK (apy >= 0 AND apy <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_savings_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('wallet_to_savings', 'savings_to_wallet')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  principal_amount NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
  outstanding_amount NUMERIC(12,2) NOT NULL CHECK (outstanding_amount >= 0),
  monthly_payment_amount NUMERIC(12,2) NOT NULL CHECK (monthly_payment_amount > 0),
  monthly_fee_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0200 CHECK (monthly_fee_rate >= 0 AND monthly_fee_rate <= 1),
  term_months INTEGER NOT NULL CHECK (term_months >= 1 AND term_months <= 120),
  paid_months INTEGER NOT NULL DEFAULT 0 CHECK (paid_months >= 0),
  credit_score INTEGER NOT NULL DEFAULT 620 CHECK (credit_score >= 300 AND credit_score <= 900),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'paid', 'rejected', 'defaulted')),
  next_due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.user_loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  principal_component NUMERIC(12,2) NOT NULL CHECK (principal_component >= 0),
  fee_component NUMERIC(12,2) NOT NULL CHECK (fee_component >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_savings_transfers_user_created
ON public.user_savings_transfers (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_loans_user_status
ON public.user_loans (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_loan_payments_loan_created
ON public.user_loan_payments (loan_id, created_at DESC);

ALTER TABLE public.user_savings_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_savings_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_loan_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_savings_accounts' AND policyname = 'Users can view own savings account'
  ) THEN
    CREATE POLICY "Users can view own savings account"
      ON public.user_savings_accounts
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_savings_accounts' AND policyname = 'Users can insert own savings account'
  ) THEN
    CREATE POLICY "Users can insert own savings account"
      ON public.user_savings_accounts
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_savings_accounts' AND policyname = 'Users can update own savings account'
  ) THEN
    CREATE POLICY "Users can update own savings account"
      ON public.user_savings_accounts
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_savings_transfers' AND policyname = 'Users can view own savings transfers'
  ) THEN
    CREATE POLICY "Users can view own savings transfers"
      ON public.user_savings_transfers
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_loans' AND policyname = 'Users can view own loans'
  ) THEN
    CREATE POLICY "Users can view own loans"
      ON public.user_loans
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_loan_payments' AND policyname = 'Users can view own loan payments'
  ) THEN
    CREATE POLICY "Users can view own loan payments"
      ON public.user_loan_payments
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_user_savings_accounts_updated_at ON public.user_savings_accounts;
CREATE TRIGGER trg_user_savings_accounts_updated_at
BEFORE UPDATE ON public.user_savings_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

DROP TRIGGER IF EXISTS trg_user_loans_updated_at ON public.user_loans;
CREATE TRIGGER trg_user_loans_updated_at
BEFORE UPDATE ON public.user_loans
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_my_savings_account()
RETURNS public.user_savings_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.user_savings_accounts;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.user_savings_accounts (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO UPDATE
  SET user_id = EXCLUDED.user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_savings_dashboard()
RETURNS TABLE (
  wallet_balance NUMERIC,
  savings_balance NUMERIC,
  apy NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wallet_balance NUMERIC(12,2);
  v_savings public.user_savings_accounts;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.upsert_my_savings_account();

  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id;

  SELECT * INTO v_savings
  FROM public.user_savings_accounts
  WHERE user_id = v_user_id;

  RETURN QUERY
  SELECT COALESCE(v_wallet_balance, 0), COALESCE(v_savings.balance, 0), COALESCE(v_savings.apy, 4.50);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_my_wallet_to_savings(
  p_amount NUMERIC,
  p_note TEXT DEFAULT ''
)
RETURNS TABLE (
  wallet_balance NUMERIC,
  savings_balance NUMERIC,
  transfer_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_wallet_balance NUMERIC(12,2);
  v_savings public.user_savings_accounts;
  v_transfer_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  PERFORM public.upsert_my_savings_account();

  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  SELECT * INTO v_savings
  FROM public.user_savings_accounts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_wallet_balance < v_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.wallets
  SET balance = v_wallet_balance - v_amount,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance INTO v_wallet_balance;

  UPDATE public.user_savings_accounts
  SET balance = v_savings.balance + v_amount
  WHERE user_id = v_user_id
  RETURNING * INTO v_savings;

  INSERT INTO public.user_savings_transfers (user_id, direction, amount, fee_amount, note)
  VALUES (v_user_id, 'wallet_to_savings', v_amount, 0, COALESCE(p_note, ''))
  RETURNING id INTO v_transfer_id;

  RETURN QUERY
  SELECT v_wallet_balance, v_savings.balance, v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_my_savings_to_wallet(
  p_amount NUMERIC,
  p_note TEXT DEFAULT ''
)
RETURNS TABLE (
  wallet_balance NUMERIC,
  savings_balance NUMERIC,
  transfer_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_wallet_balance NUMERIC(12,2);
  v_savings public.user_savings_accounts;
  v_transfer_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  PERFORM public.upsert_my_savings_account();

  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  SELECT * INTO v_savings
  FROM public.user_savings_accounts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF COALESCE(v_savings.balance, 0) < v_amount THEN
    RAISE EXCEPTION 'Insufficient savings balance';
  END IF;

  UPDATE public.user_savings_accounts
  SET balance = v_savings.balance - v_amount
  WHERE user_id = v_user_id
  RETURNING * INTO v_savings;

  UPDATE public.wallets
  SET balance = v_wallet_balance + v_amount,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance INTO v_wallet_balance;

  INSERT INTO public.user_savings_transfers (user_id, direction, amount, fee_amount, note)
  VALUES (v_user_id, 'savings_to_wallet', v_amount, 0, COALESCE(p_note, ''))
  RETURNING id INTO v_transfer_id;

  RETURN QUERY
  SELECT v_wallet_balance, v_savings.balance, v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_my_openpay_loan(
  p_principal_amount NUMERIC,
  p_term_months INTEGER DEFAULT 6,
  p_credit_score INTEGER DEFAULT NULL
)
RETURNS public.user_loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_principal NUMERIC(12,2) := ROUND(COALESCE(p_principal_amount, 0), 2);
  v_term INTEGER := GREATEST(1, LEAST(COALESCE(p_term_months, 6), 60));
  v_credit_score INTEGER := GREATEST(300, LEAST(COALESCE(p_credit_score, 620), 900));
  v_fee_rate NUMERIC(6,4);
  v_wallet_balance NUMERIC(12,2);
  v_monthly NUMERIC(12,2);
  v_existing UUID;
  v_loan public.user_loans;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_principal < 10 OR v_principal > 50000 THEN
    RAISE EXCEPTION 'Loan amount must be between 10 and 50000';
  END IF;

  SELECT id INTO v_existing
  FROM public.user_loans
  WHERE user_id = v_user_id
    AND status IN ('pending', 'active')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'You already have an active or pending loan';
  END IF;

  v_fee_rate := CASE
    WHEN v_credit_score >= 750 THEN 0.0100
    WHEN v_credit_score >= 680 THEN 0.0150
    WHEN v_credit_score >= 620 THEN 0.0200
    ELSE 0.0300
  END;

  v_monthly := ROUND((v_principal / v_term) + (v_principal * v_fee_rate), 2);

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
    v_user_id,
    v_principal,
    v_principal,
    v_monthly,
    v_fee_rate,
    v_term,
    v_credit_score,
    'active',
    (CURRENT_DATE + INTERVAL '1 month')::DATE
  )
  RETURNING * INTO v_loan;

  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  UPDATE public.wallets
  SET balance = v_wallet_balance + v_principal,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
  VALUES (
    v_user_id,
    v_user_id,
    v_principal,
    CONCAT('OpenPay loan disbursement | Loan ', v_loan.id),
    'completed'
  );

  RETURN v_loan;
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
DECLARE
  v_user_id UUID := auth.uid();
  v_loan public.user_loans;
  v_due NUMERIC(12,2);
  v_wallet_balance NUMERIC(12,2);
  v_principal_component NUMERIC(12,2);
  v_fee_component NUMERIC(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_loan
  FROM public.user_loans
  WHERE id = p_loan_id
    AND user_id = v_user_id
    AND status = 'active'
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
    note
  )
  VALUES (
    v_loan.id,
    v_user_id,
    v_due,
    v_principal_component,
    v_fee_component,
    COALESCE(p_note, 'Loan monthly payment')
  );

  INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
  VALUES (
    v_user_id,
    v_user_id,
    v_due,
    CONCAT('OpenPay loan repayment | Loan ', v_loan.id),
    'completed'
  );

  RETURN QUERY
  SELECT v_loan.id, v_loan.outstanding_amount, v_loan.paid_months, v_loan.status, v_wallet_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_latest_loan()
RETURNS TABLE (
  id UUID,
  principal_amount NUMERIC,
  outstanding_amount NUMERIC,
  monthly_payment_amount NUMERIC,
  monthly_fee_rate NUMERIC,
  term_months INTEGER,
  paid_months INTEGER,
  credit_score INTEGER,
  status TEXT,
  next_due_date DATE,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    ul.id,
    ul.principal_amount,
    ul.outstanding_amount,
    ul.monthly_payment_amount,
    ul.monthly_fee_rate,
    ul.term_months,
    ul.paid_months,
    ul.credit_score,
    ul.status,
    ul.next_due_date,
    ul.created_at
  FROM public.user_loans ul
  WHERE ul.user_id = v_user_id
  ORDER BY ul.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_savings_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_savings_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_my_wallet_to_savings(NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_my_savings_to_wallet(NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_my_openpay_loan(NUMERIC, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_my_loan_monthly(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_latest_loan() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_my_savings_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_savings_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_my_wallet_to_savings(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_my_savings_to_wallet(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_openpay_loan(NUMERIC, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_my_loan_monthly(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_latest_loan() TO authenticated;
