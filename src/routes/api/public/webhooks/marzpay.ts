// MarzPay collection callback.
// On success completes the linked payment (idempotent) which marks the voucher paid.
import { createFileRoute } from "@tanstack/react-router";
import { notifyTelegram, fmtMoney } from "@/lib/telegram.server";

type Payload = {
  status?: string;
  reference?: string;
  amount?: number | string;
  data?: { status?: string; reference?: string; amount?: number | string };
};

export const Route = createFileRoute("/api/public/webhooks/marzpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Payload = {};
        try { payload = (await request.json()) as Payload; }
        catch { /* ignore */ }

        const status = String(payload.status ?? payload.data?.status ?? "").toLowerCase();
        const reference = String(payload.reference ?? payload.data?.reference ?? "");
        const amount = Number(payload.amount ?? payload.data?.amount ?? 0);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("audit_logs").insert({
            action: "marzpay_callback", entity: "payment",
            metadata: { status, reference, amount, payload } as never,
          });

          if (reference && (status === "successful" || status === "success" || status === "completed")) {
            const { data: pay } = await supabaseAdmin
              .from("payments").select("id,owner_id,amount,currency,customer_phone,plan_name")
              .eq("reference", reference).maybeSingle();
            if (pay) {
              await supabaseAdmin.rpc("rpc_complete_voucher_payment" as never, {
                _payment_id: pay.id, _provider_ref: reference,
              } as never);
              await notifyTelegram(
                pay.owner_id as string, "payments",
                `💰 <b>Payment received</b>\n${fmtMoney(Number(pay.amount), pay.currency ?? "UGX")}\nPlan: ${pay.plan_name ?? "-"}\nPhone: ${pay.customer_phone ?? "-"}\nRef: ${reference}`,
              );
            }
          }
        } catch (e) { console.error("marzpay webhook error", e); }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});
