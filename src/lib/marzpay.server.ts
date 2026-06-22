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

function normalizePhone(phone: string) {
  const d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) return "256" + d.slice(1);
  if (d.startsWith("7") && d.length === 9) return "256" + d;
  return d;
}

export async function initiateMarzpayStk(args: {
  ownerId: string;
  amount: number;
  phone: string;
  reference: string;
  description?: string;
  callbackUrl: string;
}): Promise<StkResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Platform-wide MarsPay first.
    const { data: pg } = await supabaseAdmin
      .from("platform_gateways")
      .select("enabled,config,secret_encrypted,provider")
      .eq("kind", "payment")
      .maybeSingle();
    let gw = pg as { enabled: boolean; config: Record<string, unknown> | null; secret_encrypted: string | null; provider?: string } | null;
    if (!gw || !gw.enabled || (gw.provider && gw.provider !== "marzpay")) {
      const { data: tg } = await supabaseAdmin
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
    const base = (cfg.base_url || "https://wallet.marzpay.com/api/v1").replace(/\/+$/, "");
    const auth = "Basic " + Buffer.from(`${cfg.username || cfg.business_id || "api"}:${apiKey}`).toString("base64");

    const res = await fetch(`${base}/collections/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: auth },
      body: JSON.stringify({
        amount: Math.round(args.amount),
        phone_number: normalizePhone(args.phone),
        reference: args.reference,
        description: args.description || `Voucher ${args.reference}`,
        callback_url: args.callbackUrl,
      }),
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: (raw as { message?: string })?.message || `http_${res.status}`, raw };
    }
    const ref = (raw as { reference?: string; uuid?: string; data?: { reference?: string } })?.reference
      ?? (raw as { uuid?: string }).uuid
      ?? (raw as { data?: { reference?: string } }).data?.reference
      ?? args.reference;
    return { ok: true, provider_ref: String(ref), raw };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
