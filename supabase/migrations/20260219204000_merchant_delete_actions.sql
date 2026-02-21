CREATE OR REPLACE FUNCTION public.delete_my_merchant_api_key(
  p_key_id UUID
)
RETURNS BOOLEAN
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

  DELETE FROM public.merchant_api_keys
  WHERE id = p_key_id
    AND merchant_user_id = v_user_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_merchant_payment_link(
  p_link_id UUID
)
RETURNS BOOLEAN
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

  DELETE FROM public.merchant_payment_links
  WHERE id = p_link_id
    AND merchant_user_id = v_user_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_merchant_checkout_link(
  p_session_id UUID
)
RETURNS BOOLEAN
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

  DELETE FROM public.merchant_checkout_sessions mcs
  WHERE mcs.id = p_session_id
    AND mcs.merchant_user_id = v_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.merchant_payments mp
      WHERE mp.session_id = mcs.id
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_merchant_api_key(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_merchant_payment_link(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_merchant_checkout_link(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_my_merchant_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_merchant_payment_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_merchant_checkout_link(UUID) TO authenticated;
