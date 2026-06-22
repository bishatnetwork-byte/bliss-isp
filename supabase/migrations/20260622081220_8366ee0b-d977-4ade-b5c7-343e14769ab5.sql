
CREATE TABLE public.customer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  customer_phone text NOT NULL,
  customer_name text,
  customer_email text,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  interval_days int NOT NULL DEFAULT 30,
  next_renewal_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_voucher_id uuid,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, customer_phone, plan_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_subscriptions TO authenticated;
GRANT ALL ON public.customer_subscriptions TO service_role;

ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff manage subscriptions"
  ON public.customer_subscriptions FOR ALL TO authenticated
  USING (public.has_tenant_access(auth.uid(), owner_id))
  WITH CHECK (public.has_tenant_access(auth.uid(), owner_id));

CREATE INDEX idx_cust_subs_due
  ON public.customer_subscriptions (next_renewal_at)
  WHERE status = 'active';

CREATE TRIGGER update_customer_subscriptions_updated_at
  BEFORE UPDATE ON public.customer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
