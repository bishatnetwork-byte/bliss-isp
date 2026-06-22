
-- Permanently delete vouchers that have been in the recycle bin longer than _days.
CREATE OR REPLACE FUNCTION public.rpc_purge_old_vouchers(_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  WITH d AS (
    DELETE FROM public.vouchers
      WHERE deleted_at IS NOT NULL
        AND deleted_at < now() - (greatest(1, COALESCE(_days, 30)) || ' days')::interval
    RETURNING 1
  )
  SELECT count(*)::int INTO _n FROM d;
  RETURN _n;
END $$;

-- Generic audit log helper (writes as caller's tenant where possible).
CREATE OR REPLACE FUNCTION public.rpc_log_event(_action text, _entity text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.audit_logs(actor_id, owner_id, action, entity, metadata)
  VALUES (auth.uid(), public.effective_owner_for(auth.uid()), _action, _entity, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_purge_old_vouchers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_purge_old_vouchers(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_log_event(text, text, jsonb) TO authenticated, service_role;
