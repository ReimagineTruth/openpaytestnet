CREATE OR REPLACE FUNCTION public.get_my_merchant_analytics(
  p_mode TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mode TEXT := LOWER(NULLIF(TRIM(COALESCE(p_mode, '')), ''));
  v_days INTEGER := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_mode IS NOT NULL AND v_mode NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'Mode must be sandbox or live';
  END IF;

  WITH filtered AS (
    SELECT
      mp.*,
      COALESCE(mcs.paid_at, mp.created_at) AS paid_at
    FROM public.merchant_payments mp
    LEFT JOIN public.merchant_checkout_sessions mcs
      ON mcs.id = mp.session_id
    WHERE mp.merchant_user_id = v_user_id
      AND (v_mode IS NULL OR mp.key_mode = v_mode)
      AND mp.created_at >= (now() - make_interval(days => v_days))
  ),
  summary AS (
    SELECT
      COUNT(*)::INTEGER AS total_payments,
      COUNT(*) FILTER (WHERE status = 'succeeded')::INTEGER AS succeeded_payments,
      COUNT(*) FILTER (WHERE status = 'failed')::INTEGER AS failed_payments,
      COUNT(*) FILTER (WHERE status = 'refunded')::INTEGER AS refunded_payments,
      COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0)::NUMERIC(14,2) AS gross_revenue,
      COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::NUMERIC(14,2) AS refunds,
      GREATEST(
        0,
        COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0)
        - COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)
      )::NUMERIC(14,2) AS net_revenue,
      COALESCE(AVG(amount) FILTER (WHERE status = 'succeeded'), 0)::NUMERIC(14,2) AS avg_ticket,
      COUNT(DISTINCT buyer_user_id) FILTER (WHERE status = 'succeeded')::INTEGER AS unique_customers
    FROM filtered
  )
  SELECT jsonb_build_object(
    'period_days', v_days,
    'mode', COALESCE(v_mode, 'all'),
    'summary',
      jsonb_build_object(
        'total_payments', s.total_payments,
        'succeeded_payments', s.succeeded_payments,
        'failed_payments', s.failed_payments,
        'refunded_payments', s.refunded_payments,
        'gross_revenue', s.gross_revenue,
        'refunds', s.refunds,
        'net_revenue', s.net_revenue,
        'avg_ticket', s.avg_ticket,
        'unique_customers', s.unique_customers,
        'success_rate',
          CASE WHEN s.total_payments = 0 THEN 0
               ELSE ROUND((s.succeeded_payments::NUMERIC / s.total_payments::NUMERIC) * 100, 2)
          END,
        'failure_rate',
          CASE WHEN s.total_payments = 0 THEN 0
               ELSE ROUND((s.failed_payments::NUMERIC / s.total_payments::NUMERIC) * 100, 2)
          END
      ),
    'currency_breakdown',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'currency', x.currency,
            'payments', x.payments,
            'gross_revenue', x.gross_revenue,
            'net_revenue', x.net_revenue
          )
          ORDER BY x.net_revenue DESC, x.currency ASC
        )
        FROM (
          SELECT
            f.currency,
            COUNT(*)::INTEGER AS payments,
            COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'succeeded'), 0)::NUMERIC(14,2) AS gross_revenue,
            GREATEST(
              0,
              COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'succeeded'), 0)
              - COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'refunded'), 0)
            )::NUMERIC(14,2) AS net_revenue
          FROM filtered f
          GROUP BY f.currency
        ) x
      ), '[]'::JSONB),
    'top_customers',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'buyer_user_id', x.buyer_user_id,
            'customer_name', x.customer_name,
            'customer_username', x.customer_username,
            'payments', x.payments,
            'total_spent', x.total_spent,
            'last_payment_at', x.last_payment_at
          )
          ORDER BY x.total_spent DESC, x.payments DESC
        )
        FROM (
          SELECT
            f.buyer_user_id,
            COALESCE(NULLIF(TRIM(p.full_name), ''), 'OpenPay Customer') AS customer_name,
            COALESCE(NULLIF(TRIM(p.username), ''), '') AS customer_username,
            COUNT(*)::INTEGER AS payments,
            COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'succeeded'), 0)::NUMERIC(14,2) AS total_spent,
            MAX(f.paid_at) AS last_payment_at
          FROM filtered f
          LEFT JOIN public.profiles p
            ON p.id = f.buyer_user_id
          GROUP BY f.buyer_user_id, p.full_name, p.username
          ORDER BY total_spent DESC, payments DESC
          LIMIT 10
        ) x
      ), '[]'::JSONB),
    'top_products',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'item_name', x.item_name,
            'quantity_sold', x.quantity_sold,
            'gross_revenue', x.gross_revenue
          )
          ORDER BY x.gross_revenue DESC, x.quantity_sold DESC, x.item_name ASC
        )
        FROM (
          SELECT
            mcsi.item_name,
            COALESCE(SUM(mcsi.quantity), 0)::INTEGER AS quantity_sold,
            COALESCE(SUM(mcsi.line_total), 0)::NUMERIC(14,2) AS gross_revenue
          FROM filtered f
          JOIN public.merchant_checkout_session_items mcsi
            ON mcsi.session_id = f.session_id
          WHERE f.status = 'succeeded'
          GROUP BY mcsi.item_name
          ORDER BY gross_revenue DESC, quantity_sold DESC, mcsi.item_name ASC
          LIMIT 10
        ) x
      ), '[]'::JSONB),
    'revenue_timeline',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'date', x.day,
            'payments', x.payments,
            'gross_revenue', x.gross_revenue,
            'net_revenue', x.net_revenue
          )
          ORDER BY x.day ASC
        )
        FROM (
          SELECT
            to_char(date_trunc('day', f.paid_at), 'YYYY-MM-DD') AS day,
            COUNT(*)::INTEGER AS payments,
            COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'succeeded'), 0)::NUMERIC(14,2) AS gross_revenue,
            GREATEST(
              0,
              COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'succeeded'), 0)
              - COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'refunded'), 0)
            )::NUMERIC(14,2) AS net_revenue
          FROM filtered f
          GROUP BY date_trunc('day', f.paid_at)
        ) x
      ), '[]'::JSONB),
    'hourly_activity',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'hour', x.hour,
            'payments', x.payments
          )
          ORDER BY x.hour ASC
        )
        FROM (
          SELECT
            EXTRACT(HOUR FROM f.paid_at)::INTEGER AS hour,
            COUNT(*)::INTEGER AS payments
          FROM filtered f
          GROUP BY EXTRACT(HOUR FROM f.paid_at)
        ) x
      ), '[]'::JSONB)
  )
  INTO v_result
  FROM summary s;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_merchant_analytics(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_merchant_analytics(TEXT, INTEGER) TO authenticated;
