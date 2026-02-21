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
  FROM public.user_loans ul
  WHERE ul.id = p_loan_id
    AND ul.user_id = v_user_id
    AND ul.status = 'active'
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
