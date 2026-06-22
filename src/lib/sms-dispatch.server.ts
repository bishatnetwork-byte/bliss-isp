// SMS dispatcher. Reads the tenant's configured SMS gateway and sends one
// message. Supports two minimal providers:
//   - provider="http"            (generic HTTP POST/GET)
//   - provider="africastalking"  (AT bulk SMS)
// Falls back to a no-op "delivered" result when no gateway is enabled (dev).
import { decryptSecret } from "@/lib/crypto.server";

type GatewayRow = {
  enabled: boolean;
  provider: string | null;
  config: Record<string, unknown> | null;
  secret_encrypted: string | null;
};
type GatewayQuery = {
  eq: (column: string, value: unknown) => GatewayQuery;
  maybeSingle: () => Promise<{ data: unknown }>;
};
type GatewayDb = {
  from: (table: "platform_gateways" | "gateways") => { select: (columns: string) => GatewayQuery };
};

export type DispatchResult = { status: "sent" | "failed"; provider_ref?: string; error?: string };

export async function dispatchSms(
  _ownerId: string,
  to: string,
  body: string,
  db?: GatewayDb,
): Promise<DispatchResult> {
  const client = db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  // Platform-wide shared gateway first (admin-managed).
  const { data: pg } = await client
    .from("platform_gateways")
    .select("enabled,provider,config,secret_encrypted")
    .eq("kind", "sms")
    .maybeSingle();
  let gw = pg as GatewayRow | null;
  if (!gw || !gw.enabled) {
    // Legacy fallback: per-tenant gateway (kept for transition).
    const { data: tg } = await client
      .from("gateways")
      .select("enabled,provider,config,secret_encrypted")
      .eq("owner_id", _ownerId)
      .eq("kind", "sms")
      .maybeSingle();
    gw = tg as GatewayRow | null;
  }
  if (!gw || !gw.enabled) {
    return { status: "sent", provider_ref: "noop" };
  }
  try {
    if (gw.provider === "africastalking") return await sendAfricasTalking(gw, to, body);
    if (gw.provider === "wizasms") return await sendWizaSms(gw, to, body);
    if (gw.provider === "http" || !gw.provider) return await sendGenericHttp(gw, to, body);
    return { status: "failed", error: `unsupported_provider:${gw.provider}` };
  } catch (e) {
    return {
      status: "failed",
      error: e instanceof Error ? e.message.slice(0, 200) : "send_failed",
    };
  }
}

async function sendWizaSms(gw: GatewayRow, to: string, body: string): Promise<DispatchResult> {
  // WizaSMS — https://api.wizasms.ug/v1/sms/send
  // Auth: Basic base64(username:password). Body JSON: { contacts:[+256…], message, sender_id }.
  const cfg = (gw.config ?? {}) as { username?: string; sender_id?: string; base_url?: string };
  const pwd = gw.secret_encrypted ? await decryptSecret(gw.secret_encrypted) : "";
  if (!pwd || !cfg.username) return { status: "failed", error: "missing_credentials" };
  const base = (cfg.base_url || "https://api.wizasms.ug").replace(/\/+$/, "");
  // Accept any of: https://api.wizasms.ug | https://wizasms.ug | .../v1 | .../API/V1
  // and route to <base>/sms/send when base already includes a version segment,
  // otherwise <base>/v1/sms/send.
  const url = /\/(v1|API\/V1)$/i.test(base) ? `${base}/sms/send` : `${base}/v1/sms/send`;
  const phone = normalizePhoneIntl(to);
  const auth = "Basic " + btoa(`${cfg.username}:${pwd}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({
      contacts: [phone],
      message: body,
      sender_id: cfg.sender_id || "WizaSMS",
    }),
  });
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    /* keep raw text */
  }
  const status = (raw as { status?: string }).status;
  const ok = res.ok && status !== "error" && status !== "failed";
  if (!ok) {
    const msg = (raw as { message?: string }).message ?? text.slice(0, 160) ?? `http_${res.status}`;
    return { status: "failed", error: `http_${res.status}:${msg}` };
  }
  const data = (raw as { data?: { uuid?: string; id?: string; reference?: string } }).data ?? {};
  const ref = data.uuid ?? data.reference ?? data.id ?? (raw as { messageId?: string }).messageId;
  return { status: "sent", provider_ref: ref };
}

function normalizePhoneIntl(p: string): string {
  const d = (p || "").replace(/\D/g, "");
  if (d.startsWith("0")) return "+256" + d.slice(1);
  if (d.startsWith("256")) return "+" + d;
  if (d.length === 9 && /^[7]/.test(d)) return "+256" + d;
  return p.startsWith("+") ? p : "+" + d;
}

async function sendAfricasTalking(
  gw: GatewayRow,
  to: string,
  body: string,
): Promise<DispatchResult> {
  const cfg = (gw.config ?? {}) as { username?: string; sender_id?: string; sandbox?: boolean };
  const apiKey = gw.secret_encrypted ? await decryptSecret(gw.secret_encrypted) : "";
  if (!apiKey || !cfg.username) return { status: "failed", error: "missing_credentials" };
  const base = cfg.sandbox
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";
  const form = new URLSearchParams({ username: cfg.username, to, message: body });
  if (cfg.sender_id) form.set("from", cfg.sender_id);
  const res = await fetch(`${base}/version1/messaging`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      apiKey,
    },
    body: form.toString(),
  });
  const raw = await res.json().catch(() => ({}));
  const rec = (
    raw as { SMSMessageData?: { Recipients?: Array<{ status?: string; messageId?: string }> } }
  )?.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !rec || (rec.status && rec.status !== "Success")) {
    return { status: "failed", error: rec?.status || `http_${res.status}` };
  }
  return { status: "sent", provider_ref: rec.messageId };
}

async function sendGenericHttp(gw: GatewayRow, to: string, body: string): Promise<DispatchResult> {
  // Config shape:
  //   { url, method?, phone_param?, body_param?, sender_id?, sender_param?,
  //     extra?: {...}, auth_header?: "Bearer xxx" | "Basic xxx" }
  const cfg = (gw.config ?? {}) as Record<string, unknown>;
  const url = String(cfg.url ?? "");
  if (!url) return { status: "failed", error: "missing_url" };
  const method = String(cfg.method ?? "POST").toUpperCase();
  const phoneParam = String(cfg.phone_param ?? "to");
  const bodyParam = String(cfg.body_param ?? "message");
  const payload: Record<string, unknown> = {
    [phoneParam]: to,
    [bodyParam]: body,
    ...((cfg.extra as object) ?? {}),
  };
  if (cfg.sender_id) payload[String(cfg.sender_param ?? "from")] = cfg.sender_id;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (gw.secret_encrypted) {
    const sec = await decryptSecret(gw.secret_encrypted);
    const authHeader = String(cfg.auth_header ?? "Bearer {secret}").replace("{secret}", sec);
    headers["Authorization"] = authHeader;
  }
  let res: Response;
  if (method === "GET") {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])),
    );
    res = await fetch(`${url}${url.includes("?") ? "&" : "?"}${q.toString()}`, { headers });
  } else {
    headers["Content-Type"] = "application/json";
    res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) return { status: "failed", error: `http_${res.status}:${text.slice(0, 120)}` };
  return { status: "sent", provider_ref: text.slice(0, 80) || undefined };
}

export function mergePlaceholders(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}
