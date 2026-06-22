
-- ============ VOUCHERS: add owner + clone-mockup columns ============
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS mac_address text,
  ADD COLUMN IF NOT EXISTS ip_address text;

UPDATE public.vouchers SET owner_id = created_by WHERE owner_id IS NULL AND created_by IS NOT NULL;
ALTER TABLE public.vouchers ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_owner_code ON public.vouchers(owner_id, code);
CREATE INDEX IF NOT EXISTS idx_vouchers_owner_status ON public.vouchers(owner_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_owner_deleted ON public.vouchers(owner_id) WHERE deleted_at IS NOT NULL;

-- Refresh RLS for vouchers to use tenant access
DROP POLICY IF EXISTS "Staff read vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Staff write vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers tenant read" ON public.vouchers;
DROP POLICY IF EXISTS "vouchers tenant write" ON public.vouchers;
CREATE POLICY "vouchers tenant read" ON public.vouchers FOR SELECT TO authenticated
  USING (public.has_tenant_access(auth.uid(), owner_id));
CREATE POLICY "vouchers tenant write" ON public.vouchers FOR ALL TO authenticated
  USING (public.has_tenant_access(auth.uid(), owner_id))
  WITH CHECK (public.has_tenant_access(auth.uid(), owner_id));

-- ============ PAYMENTS: add owner + voucher tie-in ============
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'voucher',
  ADD COLUMN IF NOT EXISTS provider_ref text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS plan_name text;

CREATE INDEX IF NOT EXISTS idx_payments_owner_created ON public.payments(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_voucher ON public.payments(voucher_id);

DROP POLICY IF EXISTS "Staff read payments" ON public.payments;
DROP POLICY IF EXISTS "Staff write payments" ON public.payments;
DROP POLICY IF EXISTS "payments tenant read" ON public.payments;
DROP POLICY IF EXISTS "payments tenant write" ON public.payments;
CREATE POLICY "payments tenant read" ON public.payments FOR SELECT TO authenticated
  USING (owner_id IS NULL OR public.has_tenant_access(auth.uid(), owner_id));
CREATE POLICY "payments tenant write" ON public.payments FOR ALL TO authenticated
  USING (public.has_tenant_access(auth.uid(), owner_id))
  WITH CHECK (public.has_tenant_access(auth.uid(), owner_id));

-- ============ PRINT BATCHES: label + plan + printed_count tracking ============
ALTER TABLE public.print_batches
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_name text,
  ADD COLUMN IF NOT EXISTS qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS printed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_printed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_print_batches_owner_created ON public.print_batches(owner_id, created_at DESC);

-- ============ VOUCHER PREFIX RULES: one row per tenant ============
-- Existing table has (owner_id, plan_id, prefix, enabled) which we replace with
-- the reference's (online_mode, online_custom_prefix, offline_mode) per-tenant shape.
DROP TABLE IF EXISTS public.voucher_prefix_rules CASCADE;
CREATE TABLE public.voucher_prefix_rules (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  online_mode text NOT NULL DEFAULT 'buyer',           -- 'buyer' | 'custom'
  online_custom_prefix text DEFAULT 'PAY',
  offline_mode text NOT NULL DEFAULT 'WIFI',           -- the tenant's unique offline prefix
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_prefix_rules TO authenticated;
GRANT ALL ON public.voucher_prefix_rules TO service_role;
ALTER TABLE public.voucher_prefix_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vpr tenant" ON public.voucher_prefix_rules FOR ALL TO authenticated
  USING (public.has_tenant_access(auth.uid(), owner_id))
  WITH CHECK (public.has_tenant_access(auth.uid(), owner_id));
CREATE TRIGGER trg_vpr_updated BEFORE UPDATE ON public.voucher_prefix_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE UNIQUE INDEX idx_vpr_offline_unique ON public.voucher_prefix_rules(upper(offline_mode));

-- ============ FUNCTIONS ============

-- Random 4-char suffix with confusion-free alphabet
CREATE OR REPLACE FUNCTION public.voucher_random_suffix(_len int DEFAULT 4)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
BEGIN
  FOR i IN 1.._len LOOP
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN out;
END $$;

-- Parse plan duration_minutes into a timestamptz expiry
CREATE OR REPLACE FUNCTION public.plan_expiry(_minutes int)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT now() + (COALESCE(_minutes, 1440) || ' minutes')::interval
$$;

-- Ensure tenant has prefix rules, assigning a unique offline prefix on first use.
CREATE OR REPLACE FUNCTION public.rpc_ensure_prefix_rules(_owner uuid)
RETURNS public.voucher_prefix_rules
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _r public.voucher_prefix_rules;
  _candidate text;
  _attempt int := 0;
BEGIN
  SELECT * INTO _r FROM public.voucher_prefix_rules WHERE owner_id = _owner;
  IF FOUND THEN RETURN _r; END IF;

  LOOP
    _attempt := _attempt + 1;
    -- Try 3-digit prefixes 100..999, fall back to random 4 chars
    IF _attempt < 50 THEN
      _candidate := lpad((100 + floor(random() * 900)::int)::text, 3, '0');
    ELSE
      _candidate := public.voucher_random_suffix(4);
    END IF;
    BEGIN
      INSERT INTO public.voucher_prefix_rules(owner_id, offline_mode)
        VALUES (_owner, _candidate) RETURNING * INTO _r;
      RETURN _r;
    EXCEPTION WHEN unique_violation THEN
      -- try again
    END;
    EXIT WHEN _attempt > 200;
  END LOOP;
  RAISE EXCEPTION 'could_not_assign_offline_prefix';
END $$;

-- Generate a unique voucher code for this tenant
CREATE OR REPLACE FUNCTION public.rpc_generate_voucher_code(_owner uuid, _source text, _phone text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _r public.voucher_prefix_rules;
  _prefix text;
  _digits text;
  _code text;
  _i int := 0;
BEGIN
  _r := public.rpc_ensure_prefix_rules(_owner);
  IF _source = 'online' THEN
    IF _r.online_mode = 'buyer' AND _phone IS NOT NULL THEN
      _digits := regexp_replace(_phone, '\D', '', 'g');
      _prefix := COALESCE(NULLIF(substring(_digits FROM greatest(1, length(_digits)-8) FOR 3), ''), substr(_digits, 1, 3));
      IF _prefix IS NULL OR _prefix = '' THEN _prefix := 'PAY'; END IF;
    ELSE
      _prefix := COALESCE(_r.online_custom_prefix, 'PAY');
    END IF;
  ELSE
    _prefix := COALESCE(_r.offline_mode, 'WIFI');
  END IF;

  LOOP
    _i := _i + 1;
    _code := upper(_prefix) || '-' || public.voucher_random_suffix(4);
    PERFORM 1 FROM public.vouchers WHERE owner_id = _owner AND code = _code;
    IF NOT FOUND THEN RETURN _code; END IF;
    EXIT WHEN _i > 50;
  END LOOP;
  RAISE EXCEPTION 'code_generation_failed';
END $$;

-- Single voucher (mockup "Generate Voucher" with optional paid checkbox)
CREATE OR REPLACE FUNCTION public.rpc_create_voucher_single(
  _plan_id uuid, _customer_name text, _customer_phone text, _is_paid boolean DEFAULT true
) RETURNS public.vouchers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _plan public.plans;
  _code text;
  _v public.vouchers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO _plan FROM public.plans WHERE id = _plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;

  _code := public.rpc_generate_voucher_code(_owner, 'offline', NULL);

  INSERT INTO public.vouchers(owner_id, code, plan_id, status, source,
    customer_name, customer_phone, expires_at, created_by)
  VALUES (_owner, _code, _plan.id,
    CASE WHEN _is_paid THEN 'paid' ELSE 'unused' END,
    'offline', _customer_name, _customer_phone,
    public.plan_expiry(_plan.duration_minutes), auth.uid())
  RETURNING * INTO _v;

  IF _is_paid THEN
    INSERT INTO public.payments(owner_id, voucher_id, amount, currency, method,
      status, purpose, customer_name, customer_phone, plan_name, completed_at)
    VALUES (_owner, _v.id, _plan.price, COALESCE(_plan.currency,'UGX'), 'Cash',
      'completed', 'voucher', COALESCE(_customer_name,'Customer'),
      _customer_phone, _plan.name, now());
  END IF;
  RETURN _v;
END $$;

-- Batch generation + print batch record
CREATE OR REPLACE FUNCTION public.rpc_create_voucher_batch(
  _plan_id uuid, _quantity int, _label text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _plan public.plans;
  _qty int := greatest(1, least(500, COALESCE(_quantity,0)));
  _batch_id uuid;
  _code text;
  _i int;
  _codes text[] := ARRAY[]::text[];
  _exp timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO _plan FROM public.plans WHERE id = _plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;

  INSERT INTO public.voucher_batches(name, plan_id, quantity, created_by)
    VALUES (COALESCE(_label, _plan.name || ' x ' || _qty), _plan.id, _qty, auth.uid())
    RETURNING id INTO _batch_id;

  _exp := public.plan_expiry(_plan.duration_minutes);

  FOR _i IN 1.._qty LOOP
    _code := public.rpc_generate_voucher_code(_owner, 'offline', NULL);
    INSERT INTO public.vouchers(owner_id, code, plan_id, batch_id, status, source,
      expires_at, created_by)
    VALUES (_owner, _code, _plan.id, _batch_id, 'unused', 'offline', _exp, auth.uid());
    _codes := array_append(_codes, _code);
  END LOOP;

  INSERT INTO public.print_batches(owner_id, batch_id, label, plan_id, plan_name, qty, count)
    VALUES (_owner, _batch_id, COALESCE(_label, _plan.name || ' × ' || _qty),
            _plan.id, _plan.name, _qty, _qty);

  RETURN jsonb_build_object('batch_id', _batch_id, 'count', _qty, 'codes', _codes);
END $$;

-- Connect / activate
CREATE OR REPLACE FUNCTION public.rpc_connect_voucher(_code text, _mac text DEFAULT NULL, _ip text DEFAULT NULL)
RETURNS public.vouchers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _v public.vouchers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO _v FROM public.vouchers
    WHERE owner_id = _owner AND code = _code AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voucher_not_found'; END IF;
  IF _v.status = 'active' THEN RETURN _v; END IF;

  UPDATE public.vouchers
    SET status='active', activated_at = now(), mac_address = _mac, ip_address = _ip
    WHERE id = _v.id RETURNING * INTO _v;
  RETURN _v;
END $$;

-- Revoke
CREATE OR REPLACE FUNCTION public.rpc_revoke_voucher(_code text)
RETURNS public.vouchers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _v public.vouchers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.vouchers SET status='expired'
    WHERE owner_id = _owner AND code = _code AND deleted_at IS NULL
    RETURNING * INTO _v;
  IF NOT FOUND THEN RAISE EXCEPTION 'voucher_not_found'; END IF;
  RETURN _v;
END $$;

-- Soft delete / restore / empty bin
CREATE OR REPLACE FUNCTION public.rpc_soft_delete_voucher(_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid := public.effective_owner_for(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.vouchers SET deleted_at = now()
    WHERE owner_id = _owner AND code = _code AND deleted_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_restore_voucher(_code text)
RETURNS public.vouchers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _v public.vouchers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.vouchers SET deleted_at = NULL
    WHERE owner_id = _owner AND code = _code AND deleted_at IS NOT NULL
    RETURNING * INTO _v;
  IF NOT FOUND THEN RAISE EXCEPTION 'voucher_not_found'; END IF;
  RETURN _v;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_empty_voucher_bin()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid := public.effective_owner_for(auth.uid()); _n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  WITH d AS (DELETE FROM public.vouchers
              WHERE owner_id = _owner AND deleted_at IS NOT NULL RETURNING 1)
    SELECT count(*)::int INTO _n FROM d;
  RETURN _n;
END $$;

-- Mark batch printed
CREATE OR REPLACE FUNCTION public.rpc_mark_batch_printed(_batch_id uuid, _count int)
RETURNS public.print_batches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _b public.print_batches;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.print_batches
    SET printed_count = printed_count + greatest(0, COALESCE(_count,0)),
        last_printed_at = now()
    WHERE owner_id = _owner AND batch_id = _batch_id
    RETURNING * INTO _b;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  RETURN _b;
END $$;
