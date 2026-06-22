// Cron: SMS reminder ~24h before voucher expiry to customers with a phone.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/voucher-expiry-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchSms, mergePlaceholders } = await import("@/lib/sms-dispatch.server");

        const now = new Date();
        const horizon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("vouchers")
          .select("id,code,owner_id,customer_phone,customer_name,expires_at,plans(name)")
          .is("reminder_sent_at", null)
          .not("customer_phone", "is", null)
          .in("status", ["active", "paid", "issued"])
          .lte("expires_at", horizon)
          .gte("expires_at", now.toISOString())
          .limit(200);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        let sent = 0, failed = 0;
        for (const v of rows ?? []) {
          const phone = v.customer_phone as string;
          const { data: biz } = await supabaseAdmin
            .from("business_settings").select("name").eq("owner_id", v.owner_id).maybeSingle();
          const text = mergePlaceholders(
            "Hi {name}, your {plan} voucher {code} expires on {expires}. Reply to renew. — {business}",
            {
              name: (v.customer_name as string) ?? "there",
              plan: (v.plans as { name?: string } | null)?.name ?? "Wi-Fi",
              code: v.code as string,
              expires: new Date(v.expires_at as string).toLocaleString(),
              business: (biz?.name as string) ?? "",
            },
          );
          const res = await dispatchSms(v.owner_id, phone, text);
          if (res.status === "sent") sent += 1; else failed += 1;
          await supabaseAdmin.from("vouchers")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", v.id);
          await supabaseAdmin.from("sms_messages").insert({
            owner_id: v.owner_id, phone, name: v.customer_name ?? null,
            body: text, parts: text.length <= 160 ? 1 : Math.ceil(text.length / 153),
            status: res.status === "sent" ? "sent" : "failed",
            kind: "expiry_reminder",
            provider_ref: res.provider_ref ?? null,
            error: res.error ?? null,
          } as never);
        }
        return Response.json({ checked: (rows ?? []).length, sent, failed });
      },
    },
  },
});
