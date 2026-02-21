CREATE TABLE IF NOT EXISTS public.pi_payment_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(20,2) NOT NULL CHECK (amount > 0),
  txid TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pi_payment_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pi payment credits"
  ON public.pi_payment_credits
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

