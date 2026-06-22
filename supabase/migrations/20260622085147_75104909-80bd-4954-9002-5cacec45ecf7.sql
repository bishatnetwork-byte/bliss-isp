
-- 1) Platform-wide shared gateways (admin only)
CREATE TABLE IF NOT EXISTS public.platform_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL UNIQUE,                -- 'payment' | 'sms'
  provider text NOT NULL,                   -- 'marzpay' | 'wizasms' | ...
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_encrypted text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_gateways TO authenticated;
GRANT ALL ON public.platform_gateways TO service_role;

ALTER TABLE public.platform_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage platform gateways"
  ON public.platform_gateways FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_platform_gateways_updated
  BEFORE UPDATE ON public.platform_gateways
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) New signups: give them OPERATOR (not viewer) so they get every tab
--    except the Admin Panel (which only platform-admin can reach).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _count INT;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  SELECT COUNT(*) INTO _count FROM public.user_roles;
  IF _count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator');
  END IF;
  RETURN NEW;
END; $function$;

-- 3) Helper used by server fns to read the active platform gateway
CREATE OR REPLACE FUNCTION public.rpc_get_platform_gateway(_kind text)
RETURNS public.platform_gateways
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.platform_gateways WHERE kind = _kind AND enabled = true LIMIT 1;
$$;
