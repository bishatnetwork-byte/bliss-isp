// Nightly cron endpoint. Configure an external scheduler (e.g. cron-job.org)
// to POST here with header `x-cron-secret: $CRON_SECRET`.
// Permanently deletes vouchers that have been in the recycle bin > N days.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/purge-vouchers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const got = request.headers.get("x-cron-secret");
          if (got !== secret) return new Response("forbidden", { status: 403 });
        }
        const days = Number(new URL(request.url).searchParams.get("days") ?? "30");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("rpc_purge_old_vouchers" as never, { _days: days } as never);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        await supabaseAdmin.from("audit_logs").insert({
          action: "cron_purge_vouchers", entity: "voucher",
          metadata: { days, deleted: Number(data ?? 0) } as never,
        });
        return Response.json({ ok: true, deleted: Number(data ?? 0), days });
      },
      GET: async () => new Response("POST with x-cron-secret"),
    },
  },
});
