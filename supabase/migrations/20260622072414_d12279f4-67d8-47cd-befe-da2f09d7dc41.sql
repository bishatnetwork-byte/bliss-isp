
-- ============ PLANS: tenancy + public read ============
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Staff read plans" ON public.plans;
DROP POLICY IF EXISTS "Staff write plans" ON public.plans;
DROP POLICY IF EXISTS "Public read public plans" ON public.plans;
DROP POLICY IF EXISTS "plans tenant" ON public.plans;
DROP POLICY IF EXISTS "plans public read" ON public.plans;

CREATE POLICY "plans tenant" ON public.plans FOR ALL TO authenticated
  USING (owner_id IS NULL OR public.has_tenant_access(auth.uid(), owner_id))
  WITH CHECK (public.has_tenant_access(auth.uid(), owner_id));
CREATE POLICY "plans public read" ON public.plans FOR SELECT TO anon
  USING (is_active = true AND is_public = true);
GRANT SELECT ON public.plans TO anon;
CREATE INDEX IF NOT EXISTS idx_plans_owner_active ON public.plans(owner_id, is_active);

-- ============ ROUTERS: tenancy ============
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
UPDATE public.routers SET owner_id = created_by WHERE owner_id IS NULL AND created_by IS NOT NULL;

DROP POLICY IF EXISTS "Staff read routers" ON public.routers;
DROP POLICY IF EXISTS "Staff write routers" ON public.routers;
DROP POLICY IF EXISTS "routers tenant" ON public.routers;
CREATE POLICY "routers tenant" ON public.routers FOR ALL TO authenticated
  USING (owner_id IS NULL OR public.has_tenant_access(auth.uid(), owner_id))
  WITH CHECK (public.has_tenant_access(auth.uid(), owner_id));

-- ============ PORTAL_SETTINGS: public read ============
DROP POLICY IF EXISTS "portal public read" ON public.portal_settings;
CREATE POLICY "portal public read" ON public.portal_settings FOR SELECT TO anon USING (true);
GRANT SELECT ON public.portal_settings TO anon;

-- ============ Public RPC: get portal payload ============
-- Combines settings + plans for a tenant in one query, callable anonymously.
CREATE OR REPLACE FUNCTION public.rpc_get_portal(_owner uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'settings', (
      SELECT jsonb_build_object(
        'owner_id', ps.owner_id,
        'template', COALESCE(ps.template, 'classic'),
        'business_name', ps.business_name,
        'logo_url', ps.logo_url,
        'primary_color', COALESCE(ps.primary_color, '#2563eb'),
        'welcome_text', ps.welcome_text,
        'video_url', ps.video_url,
        'config', COALESCE(ps.config, '{}'::jsonb)
      )
      FROM public.portal_settings ps WHERE ps.owner_id = _owner
    ),
    'plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'price', p.price,
        'currency', COALESCE(p.currency, 'UGX'),
        'duration_minutes', p.duration_minutes,
        'data_limit_mb', p.data_limit_mb,
        'rate_limit_up_kbps', p.rate_limit_up_kbps,
        'rate_limit_down_kbps', p.rate_limit_down_kbps
      ) ORDER BY p.price)
      FROM public.plans p
      WHERE p.owner_id = _owner AND p.is_active = true AND p.is_public = true
    ), '[]'::jsonb)
  );
$$;
GRANT EXECUTE ON FUNCTION public.rpc_get_portal(uuid) TO anon, authenticated;

-- ============ Public RPC: redeem voucher (captive connect) ============
-- Anonymous: a customer on the captive page hands us a code; we validate it,
-- mark it active, store mac/ip, and return session info. Server-side RouterOS
-- call is layered on top of this in TypeScript.
CREATE OR REPLACE FUNCTION public.rpc_redeem_voucher_public(
  _owner uuid, _code text, _mac text DEFAULT NULL, _ip text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v public.vouchers;
  _plan public.plans;
  _now timestamptz := now();
  _expires timestamptz;
BEGIN
  SELECT * INTO _v FROM public.vouchers
    WHERE owner_id = _owner AND code = upper(_code) AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;
  IF _v.status IN ('expired','revoked') THEN
    RETURN jsonb_build_object('ok', false, 'error', _v.status);
  END IF;
  IF _v.expires_at IS NOT NULL AND _v.expires_at < _now THEN
    UPDATE public.vouchers SET status='expired' WHERE id = _v.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF _v.status NOT IN ('unused','paid','active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_payable');
  END IF;

  SELECT * INTO _plan FROM public.plans WHERE id = _v.plan_id;

  IF _v.activated_at IS NULL THEN
    _expires := COALESCE(_v.expires_at, _now + (COALESCE(_plan.duration_minutes, 60) || ' minutes')::interval);
    UPDATE public.vouchers
      SET status = 'active', activated_at = _now,
          expires_at = _expires,
          mac_address = COALESCE(_mac, mac_address),
          ip_address  = COALESCE(_ip, ip_address)
      WHERE id = _v.id
      RETURNING * INTO _v;
  ELSE
    UPDATE public.vouchers
      SET mac_address = COALESCE(_mac, mac_address),
          ip_address  = COALESCE(_ip, ip_address)
      WHERE id = _v.id RETURNING * INTO _v;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'voucher_id', _v.id,
    'code', _v.code,
    'plan_name', _plan.name,
    'duration_minutes', _plan.duration_minutes,
    'data_limit_mb', _plan.data_limit_mb,
    'rate_limit_up_kbps', _plan.rate_limit_up_kbps,
    'rate_limit_down_kbps', _plan.rate_limit_down_kbps,
    'session_expires_at', _v.expires_at,
    'activated_at', _v.activated_at
  );
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_redeem_voucher_public(uuid, text, text, text) TO anon, authenticated;
