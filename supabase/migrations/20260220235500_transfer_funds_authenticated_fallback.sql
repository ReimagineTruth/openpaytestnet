CREATE OR REPLACE FUNCTION public.transfer_funds_authenticated(
  p_receiver_id UUID,
  p_amount NUMERIC,
  p_note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID := auth.uid();
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN public.transfer_funds(
    v_sender_id,
    p_receiver_id,
    p_amount,
    COALESCE(p_note, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_funds_authenticated(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_funds_authenticated(UUID, NUMERIC, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
