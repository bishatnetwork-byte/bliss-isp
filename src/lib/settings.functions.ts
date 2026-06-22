import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBusinessSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("business_settings").select("*").eq("owner_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { name: "", phone: "", email: "", address: "", currency: "KES", timezone: "Africa/Nairobi", config: {} };
  });

export const saveBusinessSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().max(120).optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    email: z.string().email().max(255).optional().nullable().or(z.literal("")),
    address: z.string().max(500).optional().nullable(),
    currency: z.string().max(8).default("KES"),
    timezone: z.string().max(60).default("Africa/Nairobi"),
    config: z.record(z.string(), z.unknown()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("business_settings").upsert({
      owner_id: context.userId, ...data, email: data.email || null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPortalSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("portal_settings").select("*").eq("owner_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? {
      template: "a", business_name: "", logo_url: "", primary_color: "#2563eb",
      welcome_text: "", video_url: "", video_required: false, config: {},
    };
  });

export const savePortalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    template: z.string().max(20).default("a"),
    business_name: z.string().max(120).optional().nullable(),
    logo_url: z.string().max(500).optional().nullable(),
    primary_color: z.string().max(20).default("#2563eb"),
    welcome_text: z.string().max(500).optional().nullable(),
    video_url: z.string().max(500).optional().nullable(),
    video_required: z.boolean().default(false),
    config: z.record(z.string(), z.unknown()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("portal_settings").upsert({
      owner_id: context.userId, ...data,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Voucher prefix rules (one row per tenant) ----
export const getPrefixRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as never as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    }).rpc("rpc_ensure_prefix_rules", { _owner: context.userId });
    if (error) throw new Error(error.message);
    return data;
  });

export const savePrefixRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    online_mode: z.enum(["buyer", "custom"]).default("buyer"),
    online_custom_prefix: z.string().max(20).optional().nullable(),
    offline_mode: z.string().min(2).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("voucher_prefix_rules").upsert({
      owner_id: context.userId,
      online_mode: data.online_mode,
      online_custom_prefix: data.online_custom_prefix || null,
      offline_mode: data.offline_mode.toUpperCase(),
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Recycle bin ----
export const softDeleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vouchers").update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vouchers").update({ deleted_at: null }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecycleBin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vouchers").select("*, plans(name)").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const purgeVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vouchers").delete().eq("id", data.id).not("deleted_at", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
