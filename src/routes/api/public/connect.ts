// Public API: after a voucher is redeemed on the captive portal, push the user
// onto the MikroTik hotspot. Anonymous because the captive page (and the
// router's own HTML template) hit it. Validates by re-checking the voucher
// state via the same anon RPC the page used.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ros, type RouterCreds } from "@/lib/routeros.server";

type Body = {
  owner?: string;
  voucher_id?: string;
  mac?: string;
  ip?: string;
};

export const Route = createFileRoute("/api/public/connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body;
        try { body = (await request.json()) as Body; }
        catch { return Response.json({ ok: false, error: "bad_json" }, { status: 400 }); }

        if (!body.owner || !body.voucher_id) {
          return Response.json({ ok: false, error: "missing_fields" }, { status: 400 });
        }

        const sb = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: v, error: vErr } = await sb.from("vouchers")
          .select("id,code,owner_id,plan_id,router_id,activated_at,status,customer_phone,customer_name,plans(name,duration_minutes)")
          .eq("id", body.voucher_id).maybeSingle();
        if (vErr || !v) return Response.json({ ok: false, error: "voucher_not_found" }, { status: 404 });
        if (v.owner_id !== body.owner) return Response.json({ ok: false, error: "owner_mismatch" }, { status: 403 });
        if (v.status !== "active" || !v.activated_at) {
          return Response.json({ ok: false, error: "not_active" }, { status: 409 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let router = null as null | { host: string; port: number; username: string; password_encrypted: string; use_tls: boolean };
        if (v.router_id) {
          const { data } = await supabaseAdmin.from("routers")
            .select("host,port,username,password_encrypted,use_tls").eq("id", v.router_id).maybeSingle();
          router = data ?? null;
        }
        if (!router) {
          const { data } = await supabaseAdmin.from("routers")
            .select("host,port,username,password_encrypted,use_tls")
            .eq("owner_id", body.owner).limit(1).maybeSingle();
          router = data ?? null;
        }

        const { notifyTelegram } = await import("@/lib/telegram.server");
        const planName = (v.plans as { name?: string } | null)?.name ?? "-";
        notifyTelegram(body.owner, "wifiActivity",
          `📶 <b>Voucher connected</b>\nCode: ${v.code}\nPlan: ${planName}\nPhone: ${v.customer_phone ?? "-"}\nMAC: ${body.mac ?? "-"}`
        ).catch(() => {});

        await supabaseAdmin.from("audit_logs").insert({
          owner_id: body.owner, action: "voucher_connect", entity: "voucher",
          metadata: { code: v.code, mac: body.mac, ip: body.ip, router_id: v.router_id } as never,
        });

        if (!router) return Response.json({ ok: true, pushed: false, reason: "no_router" });

        const creds: RouterCreds = {
          host: router.host, port: router.port,
          username: router.username, password: router.password_encrypted,
          use_tls: router.use_tls,
        };
        try {
          await ros.addHotspotUser(creds, { name: v.code, password: v.code });
          return Response.json({ ok: true, pushed: true });
        } catch (e) {
          return Response.json({ ok: true, pushed: false, error: (e as Error).message });
        }
      },
    },
  },
});
