-- Prevent numeric overflow in admin history totals and ledger amount storage.
ALTER TABLE public.ledger_events
  ALTER COLUMN amount TYPE NUMERIC(20,2);

CREATE OR REPLACE FUNCTION public.admin_dashboard_history(
  p_limit INTEGER,
  p_offset INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_limit INTEGER;
  v_offset INTEGER;
  v_total_history BIGINT;
  v_total_users BIGINT;
  v_page_amount_sum NUMERIC;
  v_history JSONB;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RAISE EXCEPTION 'Email sign-in required'
      USING ERRCODE = '42501';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  SELECT COUNT(*) INTO v_total_history
  FROM public.ledger_events;

  SELECT COUNT(*) INTO v_total_users
  FROM public.profiles;

  SELECT COALESCE(SUM(t.amount), 0) INTO v_page_amount_sum
  FROM (
    SELECT le.amount
    FROM public.ledger_events le
    ORDER BY le.occurred_at DESC
    OFFSET v_offset
    LIMIT v_limit
  ) AS t;

  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_history
  FROM (
    SELECT
      le.id,
      le.source_table,
      le.source_id,
      le.event_type,
      le.actor_user_id,
      le.related_user_id,
      le.amount,
      le.status,
      le.note,
      le.payload,
      le.occurred_at,
      le.recorded_at,
      CASE
        WHEN le.actor_user_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'full_name', COALESCE(actor_profile.full_name, ''),
          'username', COALESCE(actor_profile.username, '')
        )
      END AS actor_profile,
      CASE
        WHEN le.related_user_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'full_name', COALESCE(related_profile.full_name, ''),
          'username', COALESCE(related_profile.username, '')
        )
      END AS related_profile
    FROM public.ledger_events le
    LEFT JOIN public.profiles actor_profile ON actor_profile.id = le.actor_user_id
    LEFT JOIN public.profiles related_profile ON related_profile.id = le.related_user_id
    ORDER BY le.occurred_at DESC
    OFFSET v_offset
    LIMIT v_limit
  ) AS r;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'summary', jsonb_build_object(
        'total_history_events', v_total_history,
        'total_users', v_total_users,
        'page_amount_sum', v_page_amount_sum,
        'page_limit', v_limit,
        'page_offset', v_offset
      ),
      'history', v_history
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_history()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.admin_dashboard_history(50, 0);
$$;

NOTIFY pgrst, 'reload schema';

