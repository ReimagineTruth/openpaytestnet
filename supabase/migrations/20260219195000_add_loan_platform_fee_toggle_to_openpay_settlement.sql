CREATE TABLE IF NOT EXISTS public.openpay_runtime_settings (
  setting_key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.openpay_runtime_settings (setting_key, value_json)
VALUES (
  'loan_wallet_platform_fee',
  jsonb_build_object('enabled', false, 'rate', 0)
)
ON CONFLICT (setting_key) DO NOTHING;

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
  v_openpay_user_id UUID;
  v_openpay_wallet_balance NUMERIC(12,2);
  v_platform_fee_enabled BOOLEAN := false;
  v_platform_fee_rate NUMERIC := 0;
  v_platform_fee_amount NUMERIC(12,2) := 0;
  v_total_debit NUMERIC(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_method NOT IN ('wallet', 'pi') THEN
    RAISE EXCEPTION 'Payment method must be wallet or pi';
  END IF;

  SELECT ua.user_id
  INTO v_openpay_user_id
  FROM public.user_accounts ua
  WHERE LOWER(TRIM(COALESCE(ua.account_username, ''))) = 'openpay'
  ORDER BY
    CASE
      WHEN UPPER(TRIM(COALESCE(ua.account_number, ''))) = 'OPEA68BB7A9F964994A199A15786D680FA' THEN 0
      ELSE 1
    END,
    ua.created_at ASC
  LIMIT 1;

  IF v_openpay_user_id IS NULL THEN
    RAISE EXCEPTION 'OpenPay settlement account not found';
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

  SELECT
    COALESCE((ors.value_json ->> 'enabled')::BOOLEAN, false),
    GREATEST(0, LEAST(COALESCE((ors.value_json ->> 'rate')::NUMERIC, 0), 1))
  INTO v_platform_fee_enabled, v_platform_fee_rate
  FROM public.openpay_runtime_settings ors
  WHERE ors.setting_key = 'loan_wallet_platform_fee'
  LIMIT 1;

  IF v_platform_fee_enabled AND v_method = 'wallet' AND v_platform_fee_rate > 0 THEN
    v_platform_fee_amount := ROUND(v_due * v_platform_fee_rate, 2);
  ELSE
    v_platform_fee_amount := 0;
  END IF;

  v_total_debit := v_due + v_platform_fee_amount;

  SELECT w.balance INTO v_wallet_balance
  FROM public.wallets w
  WHERE w.user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_wallet_balance < v_total_debit THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  v_principal_component := ROUND(LEAST(v_loan.outstanding_amount, v_due / (1 + v_loan.monthly_fee_rate)), 2);
  v_fee_component := ROUND(v_due - v_principal_component, 2);

  UPDATE public.wallets
  SET balance = v_wallet_balance - v_total_debit,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance INTO v_wallet_balance;

  SELECT w.balance INTO v_openpay_wallet_balance
  FROM public.wallets w
  WHERE w.user_id = v_openpay_user_id
  FOR UPDATE;

  IF v_openpay_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'OpenPay settlement wallet not found';
  END IF;

  UPDATE public.wallets
  SET balance = v_openpay_wallet_balance + v_total_debit,
      updated_at = now()
  WHERE user_id = v_openpay_user_id;

  UPDATE public.user_loans ul
  SET outstanding_amount = GREATEST(0, ul.outstanding_amount - v_principal_component),
      paid_months = ul.paid_months + 1,
      next_due_date = (ul.next_due_date + INTERVAL '1 month')::DATE,
      status = CASE
        WHEN GREATEST(0, ul.outstanding_amount - v_principal_component) = 0 THEN 'paid'
        ELSE v_loan.status
      END
  WHERE ul.id = v_loan.id
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
    v_openpay_user_id,
    v_due,
    CONCAT(
      'OpenPay loan repayment | To OPEA68BB7A9F964994A199A15786D680FA @openpay | Loan ',
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

  IF v_platform_fee_amount > 0 THEN
    INSERT INTO public.transactions (sender_id, receiver_id, amount, note, status)
    VALUES (
      v_user_id,
      v_openpay_user_id,
      v_platform_fee_amount,
      CONCAT(
        'OpenPay loan platform fee | To OPEA68BB7A9F964994A199A15786D680FA @openpay | Loan ',
        v_loan.id,
        ' | Rate ',
        ROUND(v_platform_fee_rate * 100, 4),
        '%'
      ),
      'completed'
    );
  END IF;

  RETURN QUERY
  SELECT v_loan.id, v_loan.outstanding_amount, v_loan.paid_months, v_loan.status, v_wallet_balance;
END;
$$;