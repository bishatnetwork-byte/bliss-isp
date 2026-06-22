import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateVoucherCode } from "@/lib/voucher";

export const listVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vouchers")
      .select("*, plans(name,price,currency), routers(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

const generateInput = z.object({
  plan_id: z.string().uuid(),
  router_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(500),
  length: z.number().int().min(4).max(16).default(8),
  batch_name: z.string().min(1).max(80),
  expires_in_days: z.number().int().min(0).max(3650).default(0),
});

export const generateVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: batch, error: bErr } = await context.supabase
      .from("voucher_batches")
      .insert({
        name: data.batch_name, plan_id: data.plan_id,
        router_id: data.router_id ?? null, quantity: data.quantity,
        created_by: context.userId,
      })
      .select("id").single();
    if (bErr) throw new Error(bErr.message);

    const expires_at = data.expires_in_days > 0
      ? new Date(Date.now() + data.expires_in_days * 86400_000).toISOString()
      : null;

    const rows = Array.from({ length: data.quantity }, () => ({
      code: generateVoucherCode(data.length),
      plan_id: data.plan_id,
      router_id: data.router_id ?? null,
      batch_id: batch.id,
      expires_at,
      created_by: context.userId,
    }));

    const { error } = await context.supabase.from("vouchers").insert(rows);
    if (error) throw new Error(error.message);
    return { batch_id: batch.id, count: rows.length };
  });

export const revokeVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vouchers").update({ status: "revoked" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
