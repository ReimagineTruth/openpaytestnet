CREATE OR REPLACE FUNCTION public.get_public_ledger(
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  amount NUMERIC,
  note TEXT,
  status TEXT,
  occurred_at TIMESTAMPTZ,
  event_type TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    le.amount,
    le.note,
    COALESCE(le.status, 'completed') AS status,
    le.occurred_at,
    le.event_type
  FROM public.ledger_events le
  WHERE le.source_table = 'transactions'
    AND le.amount IS NOT NULL
  ORDER BY le.occurred_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.get_public_ledger(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_ledger(INTEGER, INTEGER) TO anon, authenticated;
