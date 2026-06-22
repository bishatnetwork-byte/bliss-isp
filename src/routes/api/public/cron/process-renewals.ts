// Cron: charge due customer subscriptions via M-Pesa STK + SMS notice.
// POST https://.../api/public/cron/process-renewals with x-cron-secret.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/process-renewals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { initiateVoucherStk } = await import("@/lib/payments.functions");
        const { dispatchSms } = await import("@/lib/sms-dispatch.server");

        const { data: due, error } = await supabaseAdmin
          .from("customer_subscriptions")
          .select("id,owner_id,customer_phone,customer_name,plan_id,interval_days,plans(name)")
          .eq("status", "active")
          .lte("next_renewal_at", new Date().toISOString())
          .limit(50);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        let charged = 0, failed = 0;
        for (const s of due ?? []) {
          try {
            const r = await initiateVoucherStk({
              data: {
                owner: s.owner_id, plan_id: s.plan_id,
                phone: s.customer_phone, customer_name: s.customer_name,
              },
            });
            const planName = (s.plans as { name?: string } | null)?.name ?? "Wi-Fi";
            if (r.ok) {
              charged += 1;
              const next = new Date(Date.now() + (s.interval_days ?? 30) * 24 * 3600 * 1000).toISOString();
              await supabaseAdmin.from("customer_subscriptions").update({
                next_renewal_at: next,
                last_attempt_at: new Date().toISOString(),
                last_error: null,
              }).eq("id", s.id);
              const msg = `Your ${planName} renewal — please confirm the M-Pesa prompt on your phone.`;
              await dispatchSms(s.owner_id, s.customer_phone, msg).catch(() => {});
            } else {
              failed += 1;
              await supabaseAdmin.from("customer_subscriptions").update({
                last_attempt_at: new Date().toISOString(),
                last_error: r.error,
              }).eq("id", s.id);
            }
          } catch (e) {
            failed += 1;
            await supabaseAdmin.from("customer_subscriptions").update({
              last_attempt_at: new Date().toISOString(),
              last_error: (e as Error).message,
            }).eq("id", s.id);
          }
        }
        return Response.json({ due: (due ?? []).length, charged, failed });
      },
    },
  },
});
