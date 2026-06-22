
-- ============ WALLET ============
CREATE TABLE public.wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  sms_credits integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'KES',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.wallet TO authenticated;
GRANT ALL ON public.wallet TO service_role;
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet owner read" ON public.wallet FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "wallet owner write" ON public.wallet FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "wallet self insert" ON public.wallet FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_wallet_updated BEFORE UPDATE ON public.wallet FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ SMS CREDIT PURCHASES (history) ============
CREATE TABLE public.sms_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits integer NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  payment_method text NOT NULL DEFAULT 'wallet',
  status text NOT NULL DEFAULT 'completed',
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sms_credit_purchases TO authenticated;
GRANT ALL ON public.sms_credit_purchases TO service_role;
ALTER TABLE public.sms_credit_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms purchases owner read" ON public.sms_credit_purchases FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "sms purchases owner insert" ON public.sms_credit_purchases FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- ============ SMS MESSAGES (history) ============
CREATE TABLE public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  body text NOT NULL,
  parts integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'sent',
  provider_ref text,
  error text,
  kind text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms msgs owner" ON public.sms_messages FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============ SMS TEMPLATES ============
CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_templates TO authenticated;
GRANT ALL ON public.sms_templates TO service_role;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms tpl owner" ON public.sms_templates FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER trg_sms_tpl_updated BEFORE UPDATE ON public.sms_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CONTACTS ============
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  phone text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts owner" ON public.contacts FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============ WITHDRAWALS ============
CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  fee numeric(14,2) NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL,
  method text NOT NULL DEFAULT 'mpesa',
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals owner read" ON public.withdrawals FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "withdrawals owner insert" ON public.withdrawals FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "withdrawals admin update" ON public.withdrawals FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_withdrawals_updated BEFORE UPDATE ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ FEE WITHDRAWALS (admin fee account) ============
CREATE TABLE public.fee_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  method text NOT NULL DEFAULT 'mpesa',
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fee_withdrawals TO authenticated;
GRANT ALL ON public.fee_withdrawals TO service_role;
ALTER TABLE public.fee_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee wd admin only" ON public.fee_withdrawals FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ FEE SETTINGS (singleton) ============
CREATE TABLE public.fee_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  withdraw_fee_pct numeric(5,2) NOT NULL DEFAULT 2.00,
  withdraw_fee_flat numeric(14,2) NOT NULL DEFAULT 0,
  sms_price_per_credit numeric(8,4) NOT NULL DEFAULT 1.0,
  min_withdraw numeric(14,2) NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.fee_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
GRANT SELECT ON public.fee_settings TO authenticated;
GRANT INSERT, UPDATE ON public.fee_settings TO authenticated;
GRANT ALL ON public.fee_settings TO service_role;
ALTER TABLE public.fee_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fees read auth" ON public.fee_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "fees admin write" ON public.fee_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_fee_settings_updated BEFORE UPDATE ON public.fee_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ GATEWAYS (sms, payment, email, domain) ============
CREATE TABLE public.gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateways TO authenticated;
GRANT ALL ON public.gateways TO service_role;
ALTER TABLE public.gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gateways owner" ON public.gateways FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER trg_gateways_updated BEFORE UPDATE ON public.gateways FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ TELEGRAM BOTS ============
CREATE TABLE public.telegram_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  chat_id text,
  token_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, bot_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_bots TO authenticated;
GRANT ALL ON public.telegram_bots TO service_role;
ALTER TABLE public.telegram_bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg owner" ON public.telegram_bots FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER trg_tg_updated BEFORE UPDATE ON public.telegram_bots FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ PORTAL SETTINGS (captive portal singleton per owner) ============
CREATE TABLE public.portal_settings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  template text NOT NULL DEFAULT 'a',
  business_name text,
  logo_url text,
  primary_color text DEFAULT '#2563eb',
  welcome_text text,
  video_url text,
  video_required boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.portal_settings TO authenticated;
GRANT ALL ON public.portal_settings TO service_role;
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal owner" ON public.portal_settings FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER trg_portal_updated BEFORE UPDATE ON public.portal_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ BUSINESS SETTINGS (singleton per owner) ============
CREATE TABLE public.business_settings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  address text,
  currency text NOT NULL DEFAULT 'KES',
  timezone text NOT NULL DEFAULT 'Africa/Nairobi',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biz owner" ON public.business_settings FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER trg_biz_updated BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ VOUCHER PREFIX RULES ============
CREATE TABLE public.voucher_prefix_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_prefix_rules TO authenticated;
GRANT ALL ON public.voucher_prefix_rules TO service_role;
ALTER TABLE public.voucher_prefix_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vpr owner" ON public.voucher_prefix_rules FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============ PRINT BATCHES ============
CREATE TABLE public.print_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.voucher_batches(id) ON DELETE SET NULL,
  design text NOT NULL DEFAULT 'template-a',
  size_preset text NOT NULL DEFAULT 'standard',
  per_page integer NOT NULL DEFAULT 8,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.print_batches TO authenticated;
GRANT ALL ON public.print_batches TO service_role;
ALTER TABLE public.print_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "print owner" ON public.print_batches FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============ RECYCLE BIN (soft-deleted vouchers / batches) ============
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.voucher_batches ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ============ ACTIVITY FEED ============
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "act owner read" ON public.activity_log FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "act owner insert" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- Helper: auto-create wallet on first profile insert
CREATE OR REPLACE FUNCTION public.ensure_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.wallet (owner_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_wallet ON public.profiles;
CREATE TRIGGER trg_ensure_wallet AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_wallet();

-- Backfill wallets for existing profiles
INSERT INTO public.wallet (owner_id) SELECT id FROM public.profiles ON CONFLICT DO NOTHING;
