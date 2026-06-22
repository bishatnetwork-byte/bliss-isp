import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySupabase = {
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export const listVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.string().optional(),
    includeDeleted: z.boolean().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("vouchers")
      .select("*, plans(name,price,currency,duration_minutes)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!data.includeDeleted) q = q.is("deleted_at", null);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("print_batches").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    plan_id: z.string().uuid(),
    customer_name: z.string().max(120).optional().nullable(),
    customer_phone: z.string().max(40).optional().nullable(),
    is_paid: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_create_voucher_single", {
        _plan_id: data.plan_id,
        _customer_name: data.customer_name ?? null,
        _customer_phone: data.customer_phone ?? null,
        _is_paid: data.is_paid,
      });
    if (error) throw new Error(error.message);
    return row;
  });

export const createVoucherBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    plan_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(500),
    label: z.string().max(80).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_create_voucher_batch", {
        _plan_id: data.plan_id,
        _quantity: data.quantity,
        _label: data.label ?? null,
      });
    if (error) throw new Error(error.message);
    return res as { batch_id: string; count: number; codes: string[] };
  });

export const revokeVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_revoke_voucher", { _code: data.code });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const connectVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    code: z.string().min(1),
    mac: z.string().optional().nullable(),
    ip: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_connect_voucher", {
        _code: data.code, _mac: data.mac ?? null, _ip: data.ip ?? null,
      });
    if (error) throw new Error(error.message);
    return row;
  });

export const softDeleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_soft_delete_voucher", { _code: data.code });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_restore_voucher", { _code: data.code });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const emptyVoucherBin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_empty_voucher_bin", {});
    if (error) throw new Error(error.message);
    return { deleted: Number(data ?? 0) };
  });

export const markBatchPrinted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    batch_id: z.string().uuid(),
    count: z.number().int().min(0),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_mark_batch_printed", { _batch_id: data.batch_id, _count: data.count });
    if (error) throw new Error(error.message);
    return row;
  });

// Sell a voucher (Sell page): creates voucher + payment in one shot.
// Implemented via rpc_create_voucher_single with is_paid=true, then patches
// the payment method/reference to match the Sell screen's chosen method.
export const sellVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    plan_id: z.string().uuid(),
    customer_name: z.string().min(1).max(120),
    customer_phone: z.string().min(1).max(40),
    method: z.string().min(1).max(40),
    reference: z.string().max(120).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: vRow, error } = await (context.supabase as unknown as AnySupabase)
      .rpc("rpc_create_voucher_single", {
        _plan_id: data.plan_id,
        _customer_name: data.customer_name,
        _customer_phone: data.customer_phone,
        _is_paid: true,
      });
    if (error) throw new Error(error.message);
    const v = vRow as { id: string; code: string };

    const ref = data.reference ?? `${data.method.replace(/\s+/g, "").toUpperCase()}-${Date.now()}`;
    await context.supabase.from("payments")
      .update({ method: data.method, reference: ref } as never)
      .eq("voucher_id", v.id);

    return { voucher_id: v.id, code: v.code, method: data.method, reference: ref };
  });
