// Hotspot session lifecycle ingestion.
// Called from MikroTik's hotspot "on-login" / "on-logout" scripts or from
// a router-side agent. Authenticates by the voucher code (must exist for the
// tenant and be active or recently active).
//
// Payload:
//   { owner: uuid, code: "WIFI-XXXX", mac?, ip?, kind: "start"|"stop"|"update",
//     bytes_in?, bytes_out?, uptime_seconds? }
import { createFileRoute } from "@tanstack/react-router";

type Body = {
  owner?: string; code?: string; mac?: string; ip?: string;
  kind?: "start" | "stop" | "update";
  bytes_in?: number; bytes_out?: number; uptime_seconds?: number;
};

export const Route = createFileRoute("/api/public/sessions/event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body;
        try { body = (await request.json()) as Body; }
        catch { return Response.json({ ok: false, error: "bad_json" }, { status: 400 }); }
        if (!body.owner || !body.code || !body.kind) {
          return Response.json({ ok: false, error: "missing_fields" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: v } = await supabaseAdmin.from("vouchers")
          .select("id,code,owner_id,router_id,customer_phone,plans(name)")
          .eq("owner_id", body.owner).eq("code", body.code.toUpperCase()).maybeSingle();
        if (!v) return Response.json({ ok: false, error: "voucher_not_found" }, { status: 404 });

        const now = new Date().toISOString();
        const matchMac = body.mac ?? null;

        if (body.kind === "start") {
          // Close any stale open session for the same MAC on the same router.
          if (matchMac && v.router_id) {
            await supabaseAdmin.from("hotspot_sessions").update({
              ended_at: now, is_active: false,
            } as never)
              .eq("router_id", v.router_id).eq("mac", matchMac).is("ended_at", null);
          }
          await supabaseAdmin.from("hotspot_sessions").insert({
            router_id: v.router_id, username: v.code,
            mac: matchMac, ip: body.ip ?? null,
            bytes_in: body.bytes_in ?? 0, bytes_out: body.bytes_out ?? 0,
            uptime_seconds: body.uptime_seconds ?? 0,
            started_at: now, is_active: true,
          } as never);

          const { notifyTelegram } = await import("@/lib/telegram.server");
          notifyTelegram(body.owner, "wifiActivity",
            `🟢 <b>Session started</b>\n${v.code} · ${(v.plans as { name?: string } | null)?.name ?? "-"}\nIP ${body.ip ?? "-"} · MAC ${matchMac ?? "-"}`
          ).catch(() => {});
          return Response.json({ ok: true });
        }

        // update / stop — find newest open session for this voucher
        let q = supabaseAdmin.from("hotspot_sessions").select("id,started_at")
          .eq("username", v.code).is("ended_at", null).order("started_at", { ascending: false }).limit(1);
        if (v.router_id) q = q.eq("router_id", v.router_id);
        const { data: openSess } = await q.maybeSingle();
        if (!openSess) return Response.json({ ok: true, note: "no_open_session" });

        const patch: Record<string, unknown> = {
          bytes_in: body.bytes_in ?? undefined,
          bytes_out: body.bytes_out ?? undefined,
          uptime_seconds: body.uptime_seconds ?? undefined,
        };
        if (body.kind === "stop") { patch.ended_at = now; patch.is_active = false; }
        Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);
        await supabaseAdmin.from("hotspot_sessions").update(patch as never).eq("id", openSess.id);

        if (body.kind === "stop") {
          const { notifyTelegram } = await import("@/lib/telegram.server");
          const mb = ((body.bytes_in ?? 0) + (body.bytes_out ?? 0)) / 1048576;
          notifyTelegram(body.owner, "wifiActivity",
            `🔴 <b>Session ended</b>\n${v.code} · ${(v.plans as { name?: string } | null)?.name ?? "-"}\nUsed: ${mb.toFixed(1)} MB · Uptime: ${Math.round((body.uptime_seconds ?? 0) / 60)} min`
          ).catch(() => {});
        }
        return Response.json({ ok: true });
      },
      GET: async () => new Response("POST {owner,code,kind,...}"),
    },
  },
});
