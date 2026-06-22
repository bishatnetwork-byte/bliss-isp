
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS owner_id UUID;
CREATE INDEX IF NOT EXISTS audit_logs_owner_created_idx
  ON public.audit_logs (owner_id, created_at DESC);

DROP POLICY IF EXISTS "Admins read audit" ON public.audit_logs;
CREATE POLICY "Tenant owners and admins read audit"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid())
         OR (owner_id IS NOT NULL
             AND public.has_tenant_access(auth.uid(), owner_id)));
