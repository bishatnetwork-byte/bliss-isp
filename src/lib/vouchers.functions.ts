import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateVoucherCode } from "@/lib/voucher";

export const listVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vouchers")
      .select("*, plans(name,price,currency,duration_minutes), customers:used_by_customer_id(full_name,phone)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

const generateInput = z.object({
  plan_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(500),
  length: z.number().int().min(4).max(16).default(8),
  batch_name: z.string().min(1).max(80).default("Manual batch"),
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
        quantity: data.quantity, created_by: context.userId,
      })
      .select("id").single();
    if (bErr) throw new Error(bErr.message);

    const expires_at = data.expires_in_days > 0
      ? new Date(Date.now() + data.expires_in_days * 86400_000).toISOString()
      : null;

    const rows = Array.from({ length: data.quantity }, () => ({
      code: generateVoucherCode(data.length),
      plan_id: data.plan_id,
      batch_id: batch.id,
      expires_at,
      created_by: context.userId,
      status: "unused",
    }));

    const { error } = await context.supabase.from("vouchers").insert(rows);
    if (error) throw new Error(error.message);
    return { batch_id: batch.id, count: rows.length, codes: rows.map(r => r.code) };
  });

export const revokeVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vouchers").update({ status: "revoked" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const softDeleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vouchers")
      .update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const sellInput = z.object({
  plan_id: z.string().uuid(),
  customer_name: z.string().min(1).max(120),
  customer_phone: z.string().min(1).max(40),
  method: z.enum(["MTN MoMo", "Airtel Money", "Cash"]),
  reference: z.string().max(120).optional().nullable(),
});

export const sellVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sellInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: plan, error: pErr } = await supabase.from("plans")
      .select("id,name,price,currency,duration_minutes").eq("id", data.plan_id).single();
    if (pErr || !plan) throw new Error("Plan not found");

    // Upsert customer by phone
    const { data: existing } = await supabase.from("customers")
      .select("id").eq("phone", data.customer_phone).maybeSingle();
    let customer_id = existing?.id;
    if (!customer_id) {
      const { data: ins, error: cErr } = await supabase.from("customers")
        .insert({ full_name: data.customer_name, phone: data.customer_phone })
        .select("id").single();
      if (cErr) throw new Error(cErr.message);
      customer_id = ins.id;
    }

    const code = generateVoucherCode(8);
    const expires_at = new Date(Date.now() + plan.duration_minutes * 60_000).toISOString();
    const { data: voucher, error: vErr } = await supabase.from("vouchers").insert({
      code, plan_id: plan.id, status: "paid",
      expires_at, created_by: context.userId, used_by_customer_id: customer_id,
    }).select("id,code").single();
    if (vErr) throw new Error(vErr.message);

    const methodMap = { "MTN MoMo": "mpesa", "Airtel Money": "mpesa", "Cash": "cash" } as const;
    const { error: payErr } = await supabase.from("payments").insert({
      customer_id, amount: plan.price, currency: plan.currency,
      method: methodMap[data.method], status: "success",
      reference: data.reference ?? `${data.method.replace(/\s+/g, "").toUpperCase()}-${Date.now()}`,
    });
    if (payErr) throw new Error(payErr.message);

    return {
      voucher_id: voucher.id, code: voucher.code,
      plan_name: plan.name, price: plan.price, currency: plan.currency, expires_at,
    };
  });
