import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = ["payment", "sms"] as const;

async function assertAdmin(supabase: ReturnType<typeof Object>, userId: string) {
  // narrow types lost in unknown signature — use any here intentionally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const listPlatformGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_gateways")
      .select("id,kind,provider,enabled,config,secret_encrypted,updated_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((g) => ({
      id: g.id, kind: g.kind, provider: g.provider, enabled: g.enabled,
      config: g.config, has_secret: !!g.secret_encrypted, updated_at: g.updated_at,
    }));
  });

export const savePlatformGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      kind: z.enum(KINDS),
      provider: z.string().min(1).max(60),
      enabled: z.boolean().default(false),
      config: z.record(z.string(), z.unknown()).default({}),
      secret: z.string().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const update: Record<string, unknown> = {
      kind: data.kind, provider: data.provider, enabled: data.enabled,
      config: data.config, updated_by: context.userId, updated_at: new Date().toISOString(),
    };
    if (data.secret) {
      const { encryptSecret } = await import("@/lib/crypto.server");
      update.secret_encrypted = await encryptSecret(data.secret);
    }
    const { error } = await supabaseAdmin
      .from("platform_gateways")
      .upsert(update as never, { onConflict: "kind" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Aggregate SMS revenue across all tenants — admin only. */
export const getPlatformSmsRevenue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("sms_credit_purchases")
      .select("owner_id,amount,credits,method,status,created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const totals = rows.reduce(
      (acc, r) => {
        acc.amount += Number(r.amount || 0);
        acc.credits += Number(r.credits || 0);
        acc.count += 1;
        return acc;
      },
      { amount: 0, credits: 0, count: 0 },
    );
    return { totals, rows };
  });
