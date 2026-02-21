CREATE OR REPLACE FUNCTION public.calculate_user_activity_credit_score(
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topup_count INTEGER := 0;
  v_send_count INTEGER := 0;
  v_receive_count INTEGER := 0;
  v_invoice_count INTEGER := 0;
  v_request_count INTEGER := 0;
  v_paid_invoice_count INTEGER := 0;
  v_paid_request_count INTEGER := 0;
  v_score NUMERIC := 500;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 500;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_topup_count
  FROM public.transactions t
  WHERE t.sender_id = p_user_id
    AND t.receiver_id = p_user_id
    AND t.status = 'completed';

  SELECT COUNT(*)::INTEGER
  INTO v_send_count
  FROM public.transactions t
  WHERE t.sender_id = p_user_id
    AND t.receiver_id <> p_user_id
    AND t.status = 'completed';

  SELECT COUNT(*)::INTEGER
  INTO v_receive_count
  FROM public.transactions t
  WHERE t.receiver_id = p_user_id
    AND t.sender_id <> p_user_id
    AND t.status = 'completed';

  SELECT COUNT(*)::INTEGER
  INTO v_invoice_count
  FROM public.invoices i
  WHERE i.sender_id = p_user_id
     OR i.recipient_id = p_user_id;

  SELECT COUNT(*)::INTEGER
  INTO v_paid_invoice_count
  FROM public.invoices i
  WHERE (i.sender_id = p_user_id OR i.recipient_id = p_user_id)
    AND i.status = 'paid';

  SELECT COUNT(*)::INTEGER
  INTO v_request_count
  FROM public.payment_requests pr
  WHERE pr.requester_id = p_user_id
     OR pr.payer_id = p_user_id;

  SELECT COUNT(*)::INTEGER
  INTO v_paid_request_count
  FROM public.payment_requests pr
  WHERE (pr.requester_id = p_user_id OR pr.payer_id = p_user_id)
    AND pr.status = 'paid';

  -- Core activity score (caps prevent farming score with spam actions).
  v_score := v_score
    + LEAST(v_topup_count, 50) * 2
    + LEAST(v_send_count, 120) * 1.2
    + LEAST(v_receive_count, 120) * 1.0
    + LEAST(v_invoice_count, 80) * 0.8
    + LEAST(v_request_count, 80) * 0.8
    + LEAST(v_paid_invoice_count, 80) * 0.6
    + LEAST(v_paid_request_count, 80) * 0.6;

  -- Clamp to the app score range.
  RETURN GREATEST(300, LEAST(900, ROUND(v_score)::INTEGER));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_credit_score()
RETURNS INTEGER
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

  RETURN public.calculate_user_activity_credit_score(v_user_id);
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
  v_credit_score INTEGER;
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

  IF p_credit_score IS NULL THEN
    v_credit_score := public.calculate_user_activity_credit_score(v_user_id);
  ELSE
    v_credit_score := GREATEST(300, LEAST(COALESCE(p_credit_score, 620), 900));
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

REVOKE ALL ON FUNCTION public.calculate_user_activity_credit_score(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_credit_score() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_my_openpay_loan(NUMERIC, INTEGER, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_credit_score() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_openpay_loan(NUMERIC, INTEGER, INTEGER) TO authenticated;
