// Customer-facing auto-renewal subscriptions.
// Public actions use admin client with strict (owner, phone) filters.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function normalizePhone(p: string) {
  return p.replace(/[^\d+]/g, "");
}

export const subscribeCustomer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    owner: z.string().uuid(),
    phone: z.string().min(5).max(40),
    name: z.string().max(120).optional().nullable(),
    email: z.string().email().max(160).optional().nullable(),
    plan_id: z.string().uuid(),
    interval_days: z.number().int().min(1).max(365).default(30),
  }).parse(d))
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("id,owner_id,is_active,is_public,duration_minutes")
      .eq("id", data.plan_id).maybeSingle();
    if (!plan || plan.owner_id !== data.owner || !plan.is_active || !plan.is_public) {
      throw new Error("invalid_plan");
    }

    const intervalDays = data.interval_days
      ?? Math.max(1, Math.round((plan.duration_minutes ?? 1440) / 1440));
    const next = new Date(Date.now() + intervalDays * 24 * 3600 * 1000).toISOString();

    const { data: row, error } = await supabaseAdmin
      .from("customer_subscriptions")
      .upsert({
        owner_id: data.owner,
        customer_phone: phone,
        customer_name: data.name ?? null,
        customer_email: data.email ?? null,
        plan_id: data.plan_id,
        interval_days: intervalDays,
        next_renewal_at: next,
        status: "active",
      }, { onConflict: "owner_id,customer_phone,plan_id" })
      .select("id,next_renewal_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id, next_renewal_at: row!.next_renewal_at };
  });

export const listMySubscriptions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    owner: z.string().uuid(),
    phone: z.string().min(5).max(40),
  }).parse(d))
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("customer_subscriptions")
      .select("id,plan_id,interval_days,next_renewal_at,status,plans(name,price,currency)")
      .eq("owner_id", data.owner)
      .eq("customer_phone", phone)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const cancelMySubscription = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    owner: z.string().uuid(),
    phone: z.string().min(5).max(40),
    id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("customer_subscriptions")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("owner_id", data.owner)
      .eq("customer_phone", phone);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
