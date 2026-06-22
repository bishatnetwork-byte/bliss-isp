// Public cron entrypoint that pings every router and updates its status.
// Schedule externally: POST https://.../api/public/cron/probe-routers with header x-cron-secret.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/probe-routers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { decryptSecret } = await import("@/lib/crypto.server");
        const { ros } = await import("@/lib/routeros.server");

        const { data: rows, error } = await supabaseAdmin
          .from("routers")
          .select("id,host,port,username,password_encrypted,use_tls");
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        let ok = 0, fail = 0;
        for (const r of rows ?? []) {
          try {
            const password = await decryptSecret(r.password_encrypted);
            await ros.ping({
              host: r.host, port: r.port, username: r.username, password, use_tls: r.use_tls,
            });
            await supabaseAdmin
              .from("routers")
              .update({ status: "online", last_seen: new Date().toISOString() })
              .eq("id", r.id);
            ok += 1;
          } catch {
            await supabaseAdmin.from("routers").update({ status: "error" }).eq("id", r.id);
            fail += 1;
          }
        }
        return Response.json({ probed: (rows ?? []).length, ok, fail });
      },
    },
  },
});
