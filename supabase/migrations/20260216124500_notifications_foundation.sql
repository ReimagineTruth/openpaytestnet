-- Notification foundation for in-app + optional web push pipeline.
-- Works with existing tables: transactions, payment_requests, invoices, support_tickets.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME NULL,
  quiet_hours_end TIME NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can view own notification preferences'
  ) THEN
    CREATE POLICY "Users can view own notification preferences"
      ON public.notification_preferences
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can upsert own notification preferences'
  ) THEN
    CREATE POLICY "Users can upsert own notification preferences"
      ON public.notification_preferences
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can update own notification preferences'
  ) THEN
    CREATE POLICY "Users can update own notification preferences"
      ON public.notification_preferences
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_created
  ON public.app_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_unread
  ON public.app_notifications (user_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_notifications'
      AND policyname = 'Users can view own app notifications'
  ) THEN
    CREATE POLICY "Users can view own app notifications"
      ON public.app_notifications
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_notifications'
      AND policyname = 'Users can update own app notifications'
  ) THEN
    CREATE POLICY "Users can update own app notifications"
      ON public.app_notifications
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Optional table for browser push subscriptions (if web push is supported).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'Users can view own push subscriptions'
  ) THEN
    CREATE POLICY "Users can view own push subscriptions"
      ON public.push_subscriptions
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'Users can manage own push subscriptions'
  ) THEN
    CREATE POLICY "Users can manage own push subscriptions"
      ON public.push_subscriptions
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_common_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_common_updated_at();

CREATE OR REPLACE FUNCTION public.create_app_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_enabled BOOLEAN := true;
BEGIN
  SELECT np.in_app_enabled
  INTO v_enabled
  FROM public.notification_preferences np
  WHERE np.user_id = p_user_id;

  IF v_enabled IS FALSE THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.app_notifications (user_id, type, title, body, data)
  VALUES (p_user_id, p_type, p_title, p_body, COALESCE(p_data, '{}'::jsonb))
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_app_notification(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_tx_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount TEXT := to_char(COALESCE(NEW.amount, 0), 'FM999999999990D00');
BEGIN
  IF NEW.sender_id = NEW.receiver_id THEN
    PERFORM public.create_app_notification(
      NEW.receiver_id,
      'top_up_success',
      'Top up successful',
      format('$%s was added to your balance.', v_amount),
      jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount)
    );
  ELSE
    PERFORM public.create_app_notification(
      NEW.receiver_id,
      'payment_received',
      'Payment received',
      format('$%s was added to your balance.', v_amount),
      jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount, 'sender_id', NEW.sender_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_notifications_tx_insert ON public.transactions;
CREATE TRIGGER trg_app_notifications_tx_insert
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_tx_notification();

CREATE OR REPLACE FUNCTION public.handle_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount TEXT := to_char(COALESCE(NEW.amount, 0), 'FM999999999990D00');
BEGIN
  PERFORM public.create_app_notification(
    NEW.payer_id,
    'money_request_received',
    'Money request',
    format('You received a request for $%s.', v_amount),
    jsonb_build_object('request_id', NEW.id, 'amount', NEW.amount, 'requester_id', NEW.requester_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_notifications_request_insert ON public.payment_requests;
CREATE TRIGGER trg_app_notifications_request_insert
AFTER INSERT ON public.payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_request_notification();

CREATE OR REPLACE FUNCTION public.handle_invoice_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount TEXT := to_char(COALESCE(NEW.amount, 0), 'FM999999999990D00');
BEGIN
  PERFORM public.create_app_notification(
    NEW.recipient_id,
    'invoice_received',
    'Invoice received',
    format('New invoice for $%s.', v_amount),
    jsonb_build_object('invoice_id', NEW.id, 'amount', NEW.amount, 'sender_id', NEW.sender_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_notifications_invoice_insert ON public.invoices;
CREATE TRIGGER trg_app_notifications_invoice_insert
AFTER INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.handle_invoice_notification();

CREATE OR REPLACE FUNCTION public.handle_support_status_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.create_app_notification(
      NEW.user_id,
      'support_ticket_update',
      'Support update',
      format('Your ticket status is now %s.', replace(COALESCE(NEW.status, 'updated'), '_', ' ')),
      jsonb_build_object('ticket_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_notifications_support_update ON public.support_tickets;
CREATE TRIGGER trg_app_notifications_support_update
AFTER UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.handle_support_status_notification();

-- Realtime availability for app_notifications stream.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications';
  END IF;
END $$;
