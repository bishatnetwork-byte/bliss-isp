// Customer self-service public lookups by phone within a tenant.
// Uses service role inside the handler with strict (owner_id, phone) filters.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function normalizePhone(p: string) {
  return p.replace(/[^\d+]/g, "");
}

export type CustomerHistory = {
  business: { name: string | null; logo_url: string | null; primary_color: string | null } | null;
  vouchers: Array<{
    id: string;
    code: string;
    status: string;
    plan_id: string | null;
    plan_name: string | null;
    activated_at: string | null;
    expires_at: string | null;
    created_at: string;
  }>;
  last_plan_id: string | null;
};

export const getCustomerHistory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    owner: z.string().uuid(),
    phone: z.string().min(5).max(40),
  }).parse(d))
  .handler(async ({ data }): Promise<CustomerHistory> => {
    const phone = normalizePhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: biz } = await supabaseAdmin
      .from("business_settings")
      .select("name")
      .eq("owner_id", data.owner)
      .maybeSingle();

    const { data: portal } = await supabaseAdmin
      .from("portal_settings")
      .select("logo_url,primary_color")
      .eq("owner_id", data.owner)
      .maybeSingle();

    const { data: rows, error } = await supabaseAdmin
      .from("vouchers")
      .select("id,code,status,plan_id,activated_at,expires_at,created_at,plans(name)")
      .eq("owner_id", data.owner)
      .eq("customer_phone", phone)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);

    const vouchers = (rows ?? []).map(r => ({
      id: r.id as string,
      code: r.code as string,
      status: r.status as string,
      plan_id: (r.plan_id as string | null) ?? null,
      plan_name: ((r.plans as { name?: string } | null)?.name) ?? null,
      activated_at: (r.activated_at as string | null) ?? null,
      expires_at: (r.expires_at as string | null) ?? null,
      created_at: r.created_at as string,
    }));

    return {
      business: biz || portal ? {
        name: (biz?.name as string) ?? null,
        logo_url: (portal?.logo_url as string) ?? null,
        primary_color: (portal?.primary_color as string) ?? null,
      } : null,
      vouchers,
      last_plan_id: vouchers.find(v => v.plan_id)?.plan_id ?? null,
    };
  });
