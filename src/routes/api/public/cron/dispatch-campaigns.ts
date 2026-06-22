// Cron: dispatch SMS campaigns whose scheduled_at has passed.
// POST https://.../api/public/cron/dispatch-campaigns with header x-cron-secret.
import { createFileRoute } from "@tanstack/react-router";

type Recipient = { phone: string; name?: string | null };

function calcParts(body: string) {
  return body.length <= 160 ? 1 : Math.ceil(body.length / 153);
}

export const Route = createFileRoute("/api/public/cron/dispatch-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchSms, mergePlaceholders } = await import("@/lib/sms-dispatch.server");

        const { data: due, error } = await supabaseAdmin
          .from("sms_campaigns")
          .select("id,owner_id,title,body,recipients,scheduled_at")
          .eq("status", "pending")
          .lte("scheduled_at", new Date().toISOString())
          .limit(20);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        let processed = 0;
        for (const c of due ?? []) {
          await supabaseAdmin.from("sms_campaigns").update({ status: "running" }).eq("id", c.id);
          const { data: biz } = await supabaseAdmin
            .from("business_settings").select("name").eq("owner_id", c.owner_id).maybeSingle();
          const businessName = (biz?.name as string) ?? "";

          let sent = 0, failed = 0, lastError: string | undefined;
          const logs: Array<Record<string, unknown>> = [];
          const recipients = (c.recipients as Recipient[]) ?? [];

          for (const r of recipients) {
            const text = mergePlaceholders(c.body, {
              name: r.name ?? "", phone: r.phone, business: businessName,
            });
            const parts = calcParts(text);
            // Reserve per-message so a single tenant's empty wallet doesn't poison the batch
            const { error: resErr } = await supabaseAdmin.rpc("rpc_reserve_sms_credits_for", {
              _owner: c.owner_id, _n: parts,
            } as never);
            if (resErr) {
              failed += 1;
              lastError = resErr.message;
              logs.push({
                owner_id: c.owner_id, phone: r.phone, name: r.name ?? null,
                body: text, parts, status: "failed", error: "insufficient_credits", kind: "campaign",
              });
              continue;
            }
            const res = await dispatchSms(c.owner_id, r.phone, text);
            if (res.status === "sent") {
              sent += 1;
              logs.push({
                owner_id: c.owner_id, phone: r.phone, name: r.name ?? null,
                body: text, parts, status: "sent", kind: "campaign", provider_ref: res.provider_ref,
              });
            } else {
              failed += 1;
              lastError = res.error;
              await supabaseAdmin.rpc("rpc_refund_sms_credits_for", { _owner: c.owner_id, _n: parts } as never);
              logs.push({
                owner_id: c.owner_id, phone: r.phone, name: r.name ?? null,
                body: text, parts, status: "failed", error: res.error ?? "send_failed", kind: "campaign",
              });
            }
          }
          if (logs.length) await supabaseAdmin.from("sms_messages").insert(logs as never);

          await supabaseAdmin.from("sms_campaigns").update({
            status: "sent",
            sent_count: sent,
            failed_count: failed,
            last_error: lastError ?? null,
            dispatched_at: new Date().toISOString(),
          }).eq("id", c.id);
          processed += 1;
        }
        return Response.json({ processed });
      },
    },
  },
});
