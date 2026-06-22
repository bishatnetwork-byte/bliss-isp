
-- ── Tenant memberships (multi-staff on one business) ──
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff', -- owner|admin|staff|viewer
  allowed_tabs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_owner_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_tm_member ON public.tenant_memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_tm_tenant ON public.tenant_memberships(tenant_owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_memberships TO authenticated;
GRANT ALL ON public.tenant_memberships TO service_role;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- Helpers (SECURITY DEFINER to avoid recursive RLS on this table from its own policies)
CREATE OR REPLACE FUNCTION public.has_tenant_access(_uid uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid = _owner
      OR public.is_admin(_uid)
      OR EXISTS (SELECT 1 FROM public.tenant_memberships
                  WHERE tenant_owner_id = _owner AND member_id = _uid)
$$;

CREATE OR REPLACE FUNCTION public.effective_owner_for(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT tenant_owner_id FROM public.tenant_memberships
       WHERE member_id = _uid ORDER BY created_at LIMIT 1),
    _uid
  )
$$;

CREATE POLICY "tm self read" ON public.tenant_memberships
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR tenant_owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "tm owner manage" ON public.tenant_memberships
  FOR ALL TO authenticated
  USING (tenant_owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (tenant_owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- ── Security settings (withdraw passcode) ──
CREATE TABLE IF NOT EXISTS public.security_settings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  passcode_enabled boolean NOT NULL DEFAULT false,
  passcode_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_settings TO authenticated;
GRANT ALL ON public.security_settings TO service_role;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sec owner" ON public.security_settings
  FOR ALL TO authenticated
  USING (public.has_tenant_access(auth.uid(), owner_id))
  WITH CHECK (public.has_tenant_access(auth.uid(), owner_id));
CREATE TRIGGER trg_sec_updated BEFORE UPDATE ON public.security_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ── Withdrawals: new columns ──
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'wallet',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_owner_idem
  ON public.withdrawals(owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── Atomic RPCs ──

-- Withdraw: passcode-verified, idempotent, race-safe.
-- Always returns a withdrawals row id; on failure status='failed' + failure_reason set.
CREATE OR REPLACE FUNCTION public.rpc_request_withdrawal(
  _amount numeric,
  _phone text,
  _method text,
  _passcode text,
  _idempotency_key text,
  _type text DEFAULT 'wallet'
) RETURNS public.withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid := public.effective_owner_for(auth.uid());
  _existing public.withdrawals;
  _sec public.security_settings;
  _fee_pct numeric;
  _fee_flat numeric;
  _fee numeric;
  _net numeric;
  _bal numeric;
  _row public.withdrawals;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- idempotency
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO _existing FROM public.withdrawals
      WHERE owner_id = _owner AND idempotency_key = _idempotency_key LIMIT 1;
    IF FOUND THEN RETURN _existing; END IF;
  END IF;

  -- validation + record-failure helper inline
  IF _amount IS NULL OR _amount < 1000 THEN
    INSERT INTO public.withdrawals(owner_id, type, amount, fee, net, method, destination,
      status, failure_reason, idempotency_key)
    VALUES (_owner, _type, COALESCE(_amount,0), 0, 0, COALESCE(_method,'mpesa'),
            COALESCE(_phone,''), 'failed', 'invalid_amount', _idempotency_key)
    RETURNING * INTO _row; RETURN _row;
  END IF;
  IF _phone IS NULL OR _phone = '' THEN
    INSERT INTO public.withdrawals(owner_id, type, amount, fee, net, method, destination,
      status, failure_reason, idempotency_key)
    VALUES (_owner, _type, _amount, 0, 0, COALESCE(_method,'mpesa'), '',
            'failed', 'missing_phone', _idempotency_key)
    RETURNING * INTO _row; RETURN _row;
  END IF;

  -- passcode check
  SELECT * INTO _sec FROM public.security_settings WHERE owner_id = _owner;
  IF _sec.passcode_enabled IS NOT TRUE OR _sec.passcode_hash IS NULL THEN
    INSERT INTO public.withdrawals(owner_id, type, amount, fee, net, method, destination,
      status, failure_reason, idempotency_key)
    VALUES (_owner, _type, _amount, 0, 0, _method, _phone,
            'failed', 'passcode_not_set_up', _idempotency_key)
    RETURNING * INTO _row; RETURN _row;
  END IF;
  IF _passcode IS NULL OR extensions.crypt(_passcode, _sec.passcode_hash) <> _sec.passcode_hash THEN
    INSERT INTO public.withdrawals(owner_id, type, amount, fee, net, method, destination,
      status, failure_reason, idempotency_key)
    VALUES (_owner, _type, _amount, 0, 0, _method, _phone,
            'failed', 'wrong_passcode', _idempotency_key)
    RETURNING * INTO _row; RETURN _row;
  END IF;

  -- fee
  SELECT COALESCE(withdraw_fee_pct, 1.5), COALESCE(withdraw_fee_flat, 0)
    INTO _fee_pct, _fee_flat
    FROM public.fee_settings WHERE owner_id = _owner;
  IF _fee_pct IS NULL THEN _fee_pct := 1.5; _fee_flat := 0; END IF;
  _fee := round(_amount * _fee_pct / 100.0) + _fee_flat;
  _net := _amount - _fee;
  IF _net <= 0 THEN
    INSERT INTO public.withdrawals(owner_id, type, amount, fee, net, method, destination,
      status, failure_reason, idempotency_key)
    VALUES (_owner, _type, _amount, _fee, 0, _method, _phone,
            'failed', 'amount_too_small_after_fees', _idempotency_key)
    RETURNING * INTO _row; RETURN _row;
  END IF;

  IF _type = 'wallet' THEN
    -- atomic balance check + deduct under row lock
    SELECT balance INTO _bal FROM public.wallet WHERE owner_id = _owner FOR UPDATE;
    IF _bal IS NULL OR _bal < _amount THEN
      INSERT INTO public.withdrawals(owner_id, type, amount, fee, net, method, destination,
        status, failure_reason, idempotency_key)
      VALUES (_owner, _type, _amount, _fee, _net, _method, _phone,
              'failed', 'insufficient_balance', _idempotency_key)
      RETURNING * INTO _row; RETURN _row;
    END IF;
    UPDATE public.wallet SET balance = balance - _amount WHERE owner_id = _owner;
  END IF;

  INSERT INTO public.withdrawals(owner_id, type, amount, fee, net, method, destination,
    status, idempotency_key, completed_at)
  VALUES (_owner, _type, _amount, _fee, _net, _method, _phone,
          'completed', _idempotency_key, now())
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_request_withdrawal(numeric,text,text,text,text,text) TO authenticated;

-- Wallet → SMS credit transfer (atomic)
CREATE OR REPLACE FUNCTION public.rpc_transfer_wallet_to_sms(_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _bal numeric;
  _rate numeric := 65;
  _credits integer;
  _cfg jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _amount IS NULL OR _amount < 1000 THEN RAISE EXCEPTION 'amount must be at least 1000'; END IF;

  SELECT config INTO _cfg FROM public.gateways WHERE owner_id = _owner AND kind = 'sms' LIMIT 1;
  IF _cfg ? 'credit_rate_ugx' THEN _rate := (_cfg->>'credit_rate_ugx')::numeric; END IF;
  _credits := floor(_amount / _rate);

  SELECT balance INTO _bal FROM public.wallet WHERE owner_id = _owner FOR UPDATE;
  IF _bal IS NULL OR _bal < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE public.wallet
    SET balance = balance - _amount, sms_credits = sms_credits + _credits
    WHERE owner_id = _owner;

  INSERT INTO public.sms_credit_purchases(owner_id, amount, credits, method, status, completed_at)
  VALUES (_owner, _amount, _credits, 'wallet_transfer', 'completed', now());

  RETURN jsonb_build_object('credited', _credits, 'rate', _rate);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_transfer_wallet_to_sms(numeric) TO authenticated;

-- Reserve / refund SMS credits
CREATE OR REPLACE FUNCTION public.rpc_reserve_sms_credits(_n integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _bal integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _n IS NULL OR _n <= 0 THEN RAISE EXCEPTION 'invalid count'; END IF;
  SELECT sms_credits INTO _bal FROM public.wallet WHERE owner_id = _owner FOR UPDATE;
  IF _bal IS NULL OR _bal < _n THEN RAISE EXCEPTION 'insufficient_sms_credits'; END IF;
  UPDATE public.wallet SET sms_credits = sms_credits - _n WHERE owner_id = _owner;
  RETURN _bal - _n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_reserve_sms_credits(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_refund_sms_credits(_n integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid := public.effective_owner_for(auth.uid());
  _bal integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _n IS NULL OR _n <= 0 THEN RETURN 0; END IF;
  UPDATE public.wallet SET sms_credits = sms_credits + _n WHERE owner_id = _owner
    RETURNING sms_credits INTO _bal;
  RETURN _bal;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_refund_sms_credits(integer) TO authenticated;

-- Webhook-callable atomic voucher payment completion
CREATE OR REPLACE FUNCTION public.rpc_complete_voucher_payment(
  _payment_id uuid,
  _provider_ref text DEFAULT NULL
) RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payments;
BEGIN
  SELECT * INTO _p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF _p.status = 'completed' THEN RETURN _p; END IF; -- idempotent re-delivery

  UPDATE public.payments
    SET status = 'completed',
        provider_ref = COALESCE(_provider_ref, provider_ref),
        completed_at = now()
    WHERE id = _payment_id
    RETURNING * INTO _p;

  IF _p.voucher_id IS NOT NULL THEN
    UPDATE public.vouchers SET status = 'paid' WHERE id = _p.voucher_id AND status IN ('unused','pending');
  END IF;
  IF _p.purpose = 'wallet_topup' THEN
    UPDATE public.wallet SET balance = balance + _p.amount WHERE owner_id = _p.owner_id;
  END IF;
  RETURN _p;
END;
$$;
-- service_role only (called from webhook handler, never the client)
REVOKE ALL ON FUNCTION public.rpc_complete_voucher_payment(uuid,text) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_complete_voucher_payment(uuid,text) TO service_role;

-- pgcrypto for bcrypt-style passcode hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Convenience: set/clear withdraw passcode
CREATE OR REPLACE FUNCTION public.rpc_set_withdraw_passcode(_passcode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid := public.effective_owner_for(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _passcode IS NULL OR length(_passcode) < 4 THEN RAISE EXCEPTION 'passcode_too_short'; END IF;
  INSERT INTO public.security_settings(owner_id, passcode_enabled, passcode_hash)
  VALUES (_owner, true, extensions.crypt(_passcode, extensions.gen_salt('bf')))
  ON CONFLICT (owner_id) DO UPDATE
    SET passcode_enabled = true,
        passcode_hash = extensions.crypt(_passcode, extensions.gen_salt('bf')),
        updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_set_withdraw_passcode(text) TO authenticated;
