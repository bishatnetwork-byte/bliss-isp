
ALTER TABLE public.wallet ALTER COLUMN sms_credits SET DEFAULT 2;

UPDATE public.wallet w
SET sms_credits = 2
WHERE w.sms_credits = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.sms_credit_purchases p
    WHERE p.owner_id = w.owner_id AND p.status = 'completed'
  );
