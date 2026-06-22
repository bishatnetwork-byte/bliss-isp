// M-Pesa Daraja callback webhook.
// Configure your Daraja app's confirmation URL to point here.
// We accept any payload, log it, and best-effort record a successful payment.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/mpesa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try { payload = await request.json(); } catch { payload = await request.text(); }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const p = payload as { Body?: { stkCallback?: { ResultCode?: number; CallbackMetadata?: { Item?: Array<{ Name: string; Value: unknown }> } } } };
          const cb = p?.Body?.stkCallback;
          const items = cb?.CallbackMetadata?.Item ?? [];
          const get = (n: string) => items.find((i) => i.Name === n)?.Value;
          const amount = Number(get("Amount") ?? 0);
          const receipt = String(get("MpesaReceiptNumber") ?? "");
          const phone = String(get("PhoneNumber") ?? "");
          const status = cb?.ResultCode === 0 ? "success" : "failed";

          if (receipt) {
            await supabaseAdmin.from("payments").insert({
              amount, method: "mpesa", reference: receipt, status,
              raw_payload: payload as never,
            });
          } else {
            await supabaseAdmin.from("audit_logs").insert({
              action: "mpesa_callback", entity: "payment", metadata: { phone, payload } as never,
            });
          }
        } catch (e) {
          console.error("mpesa webhook error", e);
        }
        // Daraja expects an ACK
        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});
