CREATE OR REPLACE FUNCTION public.handle_virtual_card_tx_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount TEXT := to_char(COALESCE(NEW.amount, 0), 'FM999999999990D00');
  v_note TEXT := COALESCE(NEW.note, '');
BEGIN
  IF NEW.sender_id = NEW.receiver_id THEN
    RETURN NEW;
  END IF;

  IF v_note ILIKE 'Virtual card payment%'
     OR v_note ILIKE '%| Card ****%' THEN
    PERFORM public.create_app_notification(
      NEW.sender_id,
      'virtual_card_payment_sent',
      'Virtual card payment sent',
      format('$%s was paid using your OpenPay virtual card.', v_amount),
      jsonb_build_object(
        'transaction_id', NEW.id,
        'amount', NEW.amount,
        'receiver_id', NEW.receiver_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_notifications_virtual_card_tx_insert ON public.transactions;
CREATE TRIGGER trg_app_notifications_virtual_card_tx_insert
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_virtual_card_tx_notification();

