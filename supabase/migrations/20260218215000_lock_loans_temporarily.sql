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
BEGIN
  RAISE EXCEPTION 'OpenPay loans are temporarily locked. Please try again later.';
END;
$$;
