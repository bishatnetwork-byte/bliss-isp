// Public server functions (no auth) for captive portal and plan listings.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const portalPlans = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb.from("plans")
    .select("id,name,description,price,currency,duration_minutes,data_limit_mb,rate_limit_down_kbps,rate_limit_up_kbps")
    .eq("is_active", true).eq("is_public", true).order("price");
  if (error) throw new Error(error.message);
  return data ?? [];
});

const redeemInput = z.object({
  code: z.string().min(4).max(32),
  phone: z.string().min(5).max(40).optional(),
});

export const redeemVoucher = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => redeemInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.trim().toUpperCase();
    const { data: voucher, error } = await supabaseAdmin
      .from("vouchers")
      .select("id,status,plan_id,router_id,expires_at,plans(name,duration_minutes,price,currency)")
      .eq("code", code).maybeSingle();
    if (error) throw new Error(error.message);
    if (!voucher) return { ok: false, error: "Invalid code" };
    if (voucher.status !== "unused") return { ok: false, error: `Voucher ${voucher.status}` };
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      return { ok: false, error: "Voucher expired" };
    }
    // Mark as used (real-world: also create hotspot user on the router)
    await supabaseAdmin.from("vouchers").update({ status: "used", used_at: new Date().toISOString() }).eq("id", voucher.id);
    return {
      ok: true,
      plan: voucher.plans,
      message: "Voucher accepted. Connect to the WiFi and use this code as your username and password.",
      username: code, password: code,
    };
  });
