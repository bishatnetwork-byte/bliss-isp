// MarzPay STK Push helper.
// Reads tenant gateway config (kind='payment', provider='marzpay') and pushes
// a payment prompt to the buyer's phone. Webhook confirms via
// /api/public/webhooks/marzpay and calls rpc_complete_voucher_payment.
import { Buffer } from "node:buffer";
import { decryptSecret } from "@/lib/crypto.server";

export type MarzpayConfig = {
  base_url?: string;     // override (default https://api.marzpay.com)
  business_id?: string;  // merchant identifier
  username?: string;     // basic-auth user
};

export type StkResult =
  | { ok: true; provider_ref: string; raw: unknown }
  | { ok: false; error: string; raw?: unknown };

type GatewayQuery = {
  eq: (column: string, value: unknown) => GatewayQuery;
  maybeSingle: () => Promise<{ data: unknown }>;
};
type GatewayDb = { from: (table: "platform_gateways" | "gateways") => { select: (columns: string) => GatewayQuery } };

function normalizePhone(phone: string) {
  const d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) return "+256" + d.slice(1);
  if (d.startsWith("256")) return "+" + d;
  if (d.length === 9 && /^[7]/.test(d)) return "+256" + d;
  return phone.startsWith("+") ? phone : "+" + d;
}

function toUuidReference(input: string): string {
  // MarzPay requires UUID v4 references. Hash input to a deterministic UUID
  // when caller passes a human-readable code (e.g. TEST-1234 or VCH-ABC).
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) return input;
  // Fall back to a fresh UUID; preserve uniqueness across retries.
  return crypto.randomUUID();
}

export async function initiateMarzpayStk(args: {
  ownerId: string;
  amount: number;
  phone: string;
  reference: string;
  description?: string;
  callbackUrl: string;
  db?: GatewayDb;
}): Promise<StkResult> {
  try {
    const client = args.db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    // Platform-wide MarzPay first.
    const { data: pg } = await client
      .from("platform_gateways")
      .select("enabled,config,secret_encrypted,provider")
      .eq("kind", "payment")
      .maybeSingle();
    let gw = pg as { enabled: boolean; config: Record<string, unknown> | null; secret_encrypted: string | null; provider?: string } | null;
    if (!gw || !gw.enabled || (gw.provider && gw.provider !== "marzpay")) {
      const { data: tg } = await client
        .from("gateways")
        .select("enabled,config,secret_encrypted")
        .eq("owner_id", args.ownerId)
        .eq("kind", "payment")
        .eq("provider", "marzpay")
        .maybeSingle();
      gw = tg as typeof gw;
    }

    if (!gw || !gw.enabled) return { ok: false, error: "gateway_disabled" };
    if (!gw.secret_encrypted) return { ok: false, error: "missing_credentials" };

    const cfg = (gw.config ?? {}) as MarzpayConfig;
    const apiKey = await decryptSecret(gw.secret_encrypted);
    const base = (cfg.base_url || "https://wallet.wearemarz.com/api/v1").replace(/\/+$/, "");
    // Auth format: base64(api_key:api_secret). `username` field stores the API key.
    const auth = "Basic " + Buffer.from(`${cfg.username || cfg.business_id || "api"}:${apiKey}`).toString("base64");
    const reference = toUuidReference(args.reference);

    const res = await fetch(`${base}/collect-money`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: auth },
      body: JSON.stringify({
        amount: Math.round(args.amount),
        phone_number: normalizePhone(args.phone),
        country: "UG",
        reference,
        description: (args.description || `Voucher ${args.reference}`).slice(0, 255),
        callback_url: args.callbackUrl,
      }),
    });

    const text = await res.text();
    let raw: Record<string, unknown> = {};
    try { raw = text ? JSON.parse(text) : {}; } catch { /* keep raw text */ }
    if (!res.ok || (raw as { status?: string }).status === "error") {
      const msg = (raw as { message?: string }).message || text.slice(0, 200) || `http_${res.status}`;
      return { ok: false, error: `http_${res.status}:${msg}`, raw };
    }
    const data = (raw as { data?: { transaction?: { uuid?: string; reference?: string } } }).data;
    const ref = data?.transaction?.uuid ?? data?.transaction?.reference ?? reference;
    return { ok: true, provider_ref: String(ref), raw };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
