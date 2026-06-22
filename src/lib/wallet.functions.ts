import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wallet").select("balance,sms_credits,currency").eq("owner_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      await context.supabase.from("wallet").insert({ owner_id: context.userId });
      return { balance: 0, sms_credits: 0, currency: "KES" };
    }
    return data;
  });

export const getFeeSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fee_settings").select("*").eq("id", true).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { withdraw_fee_pct: 2, withdraw_fee_flat: 0, sms_price_per_credit: 1, min_withdraw: 100 };
  });

export const saveFeeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    withdraw_fee_pct: z.number().min(0).max(100),
    withdraw_fee_flat: z.number().min(0),
    sms_price_per_credit: z.number().min(0),
    min_withdraw: z.number().min(0),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("fee_settings").update(data).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
