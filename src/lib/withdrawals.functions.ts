import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("withdrawals").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    amount: z.number().positive(),
    method: z.enum(["mpesa", "airtel", "bank", "manual"]).default("mpesa"),
    destination: z.string().min(3).max(120),
    notes: z.string().max(500).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wallet } = await context.supabase
      .from("wallet").select("balance").eq("owner_id", context.userId).maybeSingle();
    const balance = Number(wallet?.balance ?? 0);

    const { data: fees } = await context.supabase
      .from("fee_settings").select("withdraw_fee_pct,withdraw_fee_flat,min_withdraw").eq("id", true).maybeSingle();
    const pct = Number(fees?.withdraw_fee_pct ?? 0) / 100;
    const flat = Number(fees?.withdraw_fee_flat ?? 0);
    const minW = Number(fees?.min_withdraw ?? 0);

    if (data.amount < minW) throw new Error(`Minimum withdrawal is ${minW}`);
    if (data.amount > balance) throw new Error("Insufficient wallet balance");

    const fee = data.amount * pct + flat;
    const net = data.amount - fee;

    // Reserve funds immediately
    await context.supabase.from("wallet").update({ balance: balance - data.amount }).eq("owner_id", context.userId);

    const { data: ins, error } = await context.supabase.from("withdrawals").insert({
      owner_id: context.userId, amount: data.amount, fee, net,
      method: data.method, destination: data.destination, status: "pending", notes: data.notes ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);

    return { id: ins!.id, fee, net };
  });

export const updateWithdrawalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["pending", "processing", "completed", "failed"]),
    reference: z.string().max(120).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: w } = await context.supabase.from("withdrawals").select("owner_id,amount,status").eq("id", data.id).single();
    const { error } = await context.supabase.from("withdrawals").update({
      status: data.status, reference: data.reference ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Refund on failure
    if (data.status === "failed" && w && w.status !== "failed") {
      const { data: wallet } = await context.supabase.from("wallet").select("balance").eq("owner_id", w.owner_id).maybeSingle();
      if (wallet) {
        await context.supabase.from("wallet").update({
          balance: Number(wallet.balance) + Number(w.amount),
        }).eq("owner_id", w.owner_id);
      }
    }
    return { ok: true };
  });

// ---- Fee withdrawals (admin) ----
export const listFeeWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("fee_withdrawals").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const doFeeWithdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    amount: z.number().positive(),
    method: z.enum(["mpesa", "airtel", "bank"]).default("mpesa"),
    destination: z.string().min(3).max(120),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("fee_withdrawals").insert({
      admin_id: context.userId, amount: data.amount, method: data.method, destination: data.destination, status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
