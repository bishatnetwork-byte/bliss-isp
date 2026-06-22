// Admin-only integration test helpers: live-fire a single SMS and a single
// MarzPay STK push using the saved platform/tenant gateways.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    phone: z.string().min(3).max(40),
    body: z.string().min(1).max(320).default("HotspotPro test ✅"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase
      .rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("forbidden");
    const { dispatchSms } = await import("@/lib/sms-dispatch.server");
    const res = await dispatchSms(context.userId, data.phone, data.body);
    return res;
  });

export const sendTestStk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    phone: z.string().min(3).max(40),
    amount: z.number().int().min(500).max(50000).default(500),
  }).parse(d))
  .handler(async ({ data, context, request }) => {
    const { data: isStaff } = await context.supabase
      .rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("forbidden");
    const { initiateMarzpayStk } = await import("@/lib/marzpay.server");
    const origin = new URL(request.url).origin;
    const reference = `TEST-${Date.now()}`;
    const res = await initiateMarzpayStk({
      ownerId: context.userId,
      amount: data.amount,
      phone: data.phone,
      reference,
      description: "HotspotPro test STK push",
      callbackUrl: `${origin}/api/public/webhooks/marzpay`,
    });
    return { reference, ...res };
  });
