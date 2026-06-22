// Public server functions for initiating online STK payments from the captive portal.
// Creates a pending payment + pending voucher, triggers MarzPay STK, and
// returns a reference the portal can poll until the webhook completes it.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type StkInitResult =
  | { ok: true; payment_id: string; reference: string; status: "pending" }
  | { ok: false; error: string };

export const initiateVoucherStk = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    owner: z.string().uuid(),
    plan_id: z.string().uuid(),
    phone: z.string().min(7).max(20),
    customer_name: z.string().max(120).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, request }): Promise<StkInitResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan } = await supabaseAdmin
      .from("plans").select("id,name,price,currency,duration_minutes,is_active,is_public,owner_id")
      .eq("id", data.plan_id).maybeSingle();
    if (!plan || plan.owner_id !== data.owner || !plan.is_active || !plan.is_public) {
      return { ok: false, error: "invalid_plan" };
    }

    // Generate voucher code (online source, buyer-prefix when configured)
    const { data: code, error: codeErr } = await supabaseAdmin.rpc("rpc_generate_voucher_code" as never, {
      _owner: data.owner, _source: "online", _phone: data.phone,
    } as never);
    if (codeErr || !code) return { ok: false, error: codeErr?.message || "code_failed" };

    const { data: voucher, error: vErr } = await supabaseAdmin.from("vouchers").insert({
      owner_id: data.owner, code: code as unknown as string, plan_id: plan.id,
      status: "pending", source: "online",
      customer_name: data.customer_name ?? null, customer_phone: data.phone,
    } as never).select("id,code").single();
    if (vErr || !voucher) return { ok: false, error: vErr?.message || "voucher_failed" };

    const reference = `VC-${(voucher as { code: string }).code}-${Date.now().toString(36).toUpperCase()}`;

    const { data: payment, error: pErr } = await supabaseAdmin.from("payments").insert({
      owner_id: data.owner, voucher_id: (voucher as { id: string }).id,
      amount: plan.price, currency: plan.currency ?? "UGX",
      method: "marzpay", reference, status: "pending", purpose: "voucher",
      customer_phone: data.phone, customer_name: data.customer_name ?? null,
      plan_name: plan.name,
    } as never).select("id").single();
    if (pErr || !payment) return { ok: false, error: pErr?.message || "payment_failed" };

    const url = new URL(request.url);
    const callbackUrl = `${url.protocol}//${url.host}/api/public/webhooks/marzpay`;
    const { initiateMarzpayStk } = await import("@/lib/marzpay.server");
    const stk = await initiateMarzpayStk({
      ownerId: data.owner, amount: Number(plan.price), phone: data.phone,
      reference, description: `${plan.name} voucher`, callbackUrl,
    });
    if (!stk.ok) {
      await supabaseAdmin.from("payments").update({
        status: "failed", failure_reason: stk.error,
      } as never).eq("id", (payment as { id: string }).id);
      return { ok: false, error: stk.error };
    }
    return { ok: true, payment_id: (payment as { id: string }).id, reference, status: "pending" };
  });

export const checkVoucherPaymentStatus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ payment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pay } = await supabaseAdmin
      .from("payments").select("status,voucher_id,reference")
      .eq("id", data.payment_id).maybeSingle();
    if (!pay) return { status: "not_found" as const };
    let code: string | null = null;
    if (pay.voucher_id) {
      const { data: v } = await supabaseAdmin
        .from("vouchers").select("code,status").eq("id", pay.voucher_id).maybeSingle();
      code = (v?.code as string) ?? null;
    }
    return { status: pay.status as string, code, reference: pay.reference as string | null };
  });
