-- Immutable ledger for transparent admin history
CREATE TABLE IF NOT EXISTS public.ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  related_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC(12,2),
  status TEXT,
  note TEXT DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_events_occurred_at ON public.ledger_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_events_source ON public.ledger_events (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_actor ON public.ledger_events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_related ON public.ledger_events (related_user_id);

ALTER TABLE public.ledger_events ENABLE ROW LEVEL SECURITY;

-- No read policy for regular users. Admin dashboard reads via service role edge function.

CREATE OR REPLACE FUNCTION public.log_transaction_insert_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ledger_events (
    source_table,
    source_id,
    event_type,
    actor_user_id,
    related_user_id,
    amount,
    status,
    note,
    payload,
    occurred_at
  )
  VALUES (
    'transactions',
    NEW.id,
    'transaction_created',
    NEW.sender_id,
    NEW.receiver_id,
    NEW.amount,
    NEW.status,
    COALESCE(NEW.note, ''),
    jsonb_build_object(
      'sender_id', NEW.sender_id,
      'receiver_id', NEW.receiver_id
    ),
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_transaction_update_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.note IS DISTINCT FROM OLD.note THEN
    INSERT INTO public.ledger_events (
      source_table,
      source_id,
      event_type,
      actor_user_id,
      related_user_id,
      amount,
      status,
      note,
      payload,
      occurred_at
    )
    VALUES (
      'transactions',
      NEW.id,
      'transaction_updated',
      NEW.sender_id,
      NEW.receiver_id,
      NEW.amount,
      NEW.status,
      COALESCE(NEW.note, ''),
      jsonb_build_object(
        'old_amount', OLD.amount,
        'new_amount', NEW.amount,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_note', COALESCE(OLD.note, ''),
        'new_note', COALESCE(NEW.note, '')
      ),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_payment_request_insert_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ledger_events (
    source_table,
    source_id,
    event_type,
    actor_user_id,
    related_user_id,
    amount,
    status,
    note,
    payload,
    occurred_at
  )
  VALUES (
    'payment_requests',
    NEW.id,
    'payment_request_created',
    NEW.requester_id,
    NEW.payer_id,
    NEW.amount,
    NEW.status,
    COALESCE(NEW.note, ''),
    '{}'::jsonb,
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_payment_request_update_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.note IS DISTINCT FROM OLD.note THEN
    INSERT INTO public.ledger_events (
      source_table,
      source_id,
      event_type,
      actor_user_id,
      related_user_id,
      amount,
      status,
      note,
      payload,
      occurred_at
    )
    VALUES (
      'payment_requests',
      NEW.id,
      'payment_request_updated',
      NEW.requester_id,
      NEW.payer_id,
      NEW.amount,
      NEW.status,
      COALESCE(NEW.note, ''),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_amount', OLD.amount,
        'new_amount', NEW.amount
      ),
      COALESCE(NEW.updated_at, now())
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_invoice_insert_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ledger_events (
    source_table,
    source_id,
    event_type,
    actor_user_id,
    related_user_id,
    amount,
    status,
    note,
    payload,
    occurred_at
  )
  VALUES (
    'invoices',
    NEW.id,
    'invoice_created',
    NEW.sender_id,
    NEW.recipient_id,
    NEW.amount,
    NEW.status,
    COALESCE(NEW.description, ''),
    jsonb_build_object('due_date', NEW.due_date),
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_invoice_update_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.ledger_events (
      source_table,
      source_id,
      event_type,
      actor_user_id,
      related_user_id,
      amount,
      status,
      note,
      payload,
      occurred_at
    )
    VALUES (
      'invoices',
      NEW.id,
      'invoice_updated',
      NEW.sender_id,
      NEW.recipient_id,
      NEW.amount,
      NEW.status,
      COALESCE(NEW.description, ''),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_due_date', OLD.due_date,
        'new_due_date', NEW.due_date
      ),
      COALESCE(NEW.updated_at, now())
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_wallet_update_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta NUMERIC(12,2);
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance THEN
    delta := NEW.balance - OLD.balance;
    INSERT INTO public.ledger_events (
      source_table,
      source_id,
      event_type,
      actor_user_id,
      amount,
      note,
      payload,
      occurred_at
    )
    VALUES (
      'wallets',
      NEW.id,
      'wallet_balance_changed',
      NEW.user_id,
      delta,
      '',
      jsonb_build_object(
        'old_balance', OLD.balance,
        'new_balance', NEW.balance,
        'delta', delta
      ),
      COALESCE(NEW.updated_at, now())
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_transactions_insert ON public.transactions;
CREATE TRIGGER trg_ledger_transactions_insert
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.log_transaction_insert_to_ledger();

DROP TRIGGER IF EXISTS trg_ledger_transactions_update ON public.transactions;
CREATE TRIGGER trg_ledger_transactions_update
AFTER UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.log_transaction_update_to_ledger();

DROP TRIGGER IF EXISTS trg_ledger_payment_requests_insert ON public.payment_requests;
CREATE TRIGGER trg_ledger_payment_requests_insert
AFTER INSERT ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.log_payment_request_insert_to_ledger();

DROP TRIGGER IF EXISTS trg_ledger_payment_requests_update ON public.payment_requests;
CREATE TRIGGER trg_ledger_payment_requests_update
AFTER UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.log_payment_request_update_to_ledger();

DROP TRIGGER IF EXISTS trg_ledger_invoices_insert ON public.invoices;
CREATE TRIGGER trg_ledger_invoices_insert
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.log_invoice_insert_to_ledger();

DROP TRIGGER IF EXISTS trg_ledger_invoices_update ON public.invoices;
CREATE TRIGGER trg_ledger_invoices_update
AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.log_invoice_update_to_ledger();

DROP TRIGGER IF EXISTS trg_ledger_wallets_update ON public.wallets;
CREATE TRIGGER trg_ledger_wallets_update
AFTER UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.log_wallet_update_to_ledger();

-- Backfill current records for historical transparency
INSERT INTO public.ledger_events (
  source_table,
  source_id,
  event_type,
  actor_user_id,
  related_user_id,
  amount,
  status,
  note,
  payload,
  occurred_at
)
SELECT
  'transactions',
  t.id,
  'transaction_created',
  t.sender_id,
  t.receiver_id,
  t.amount,
  t.status,
  COALESCE(t.note, ''),
  jsonb_build_object('sender_id', t.sender_id, 'receiver_id', t.receiver_id),
  t.created_at
FROM public.transactions t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ledger_events le
  WHERE le.source_table = 'transactions'
    AND le.source_id = t.id
    AND le.event_type = 'transaction_created'
);

INSERT INTO public.ledger_events (
  source_table,
  source_id,
  event_type,
  actor_user_id,
  related_user_id,
  amount,
  status,
  note,
  payload,
  occurred_at
)
SELECT
  'payment_requests',
  pr.id,
  'payment_request_created',
  pr.requester_id,
  pr.payer_id,
  pr.amount,
  pr.status,
  COALESCE(pr.note, ''),
  '{}'::jsonb,
  pr.created_at
FROM public.payment_requests pr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ledger_events le
  WHERE le.source_table = 'payment_requests'
    AND le.source_id = pr.id
    AND le.event_type = 'payment_request_created'
);

INSERT INTO public.ledger_events (
  source_table,
  source_id,
  event_type,
  actor_user_id,
  related_user_id,
  amount,
  status,
  note,
  payload,
  occurred_at
)
SELECT
  'invoices',
  i.id,
  'invoice_created',
  i.sender_id,
  i.recipient_id,
  i.amount,
  i.status,
  COALESCE(i.description, ''),
  jsonb_build_object('due_date', i.due_date),
  i.created_at
FROM public.invoices i
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ledger_events le
  WHERE le.source_table = 'invoices'
    AND le.source_id = i.id
    AND le.event_type = 'invoice_created'
);

