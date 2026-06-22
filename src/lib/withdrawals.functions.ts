// Ported from reference hotspot-backend/src/routes/withdrawals.js
// Atomicity + idempotency + recorded-failure pattern moved into the
// rpc_request_withdrawal Postgres function — see migration. This file is a thin
// authenticated RPC caller so the race-safety and passcode check live in ONE place
// (the DB) regardless of how many clients call concurrently.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      type: z.enum(["all", "wallet", "platform_fee"]).default("all"),
      status: z.enum(["all", "pending", "completed", "failed"]).default("all"),
    }).partial().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("withdrawals").select("*")
      .order("created_at", { ascending: false }).limit(200);
    if (data.type && data.type !== "all") q = q.eq("type", data.type);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    amount: z.number().positive(),
    phone: z.string().min(3).max(40),
    method: z.string().min(2).max(40).default("Mobile Money"),
    passcode: z.string().min(4).max(40),
    idempotencyKey: z.string().min(8).max(80),
    type: z.enum(["wallet", "platform_fee"]).default("wallet"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("rpc_request_withdrawal", {
      _amount: data.amount,
      _phone: data.phone,
      _method: data.method,
      _passcode: data.passcode,
      _idempotency_key: data.idempotencyKey,
      _type: data.type,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const setWithdrawPasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ passcode: z.string().min(4).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("rpc_set_withdraw_passcode", { _passcode: data.passcode });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSecuritySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("security_settings").select("passcode_enabled,updated_at").maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { passcode_enabled: false, updated_at: null };
  });
