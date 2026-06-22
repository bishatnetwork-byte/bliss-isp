// Telegram event-alert helper.
// Sends a message via a tenant-configured bot (token stored encrypted).
// Best-effort: never throws — failures are logged so callers don't break.
import { decryptSecret } from "@/lib/crypto.server";

export type TelegramBotKey = "payments" | "wifiActivity" | "withdraw";

export async function notifyTelegram(
  ownerId: string,
  botKey: TelegramBotKey,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bot } = await supabaseAdmin
      .from("telegram_bots")
      .select("enabled,chat_id,token_encrypted")
      .eq("owner_id", ownerId)
      .eq("bot_key", botKey)
      .maybeSingle();

    if (!bot || !bot.enabled || !bot.chat_id || !bot.token_encrypted) {
      return { ok: false, error: "bot_not_configured" };
    }
    const token = await decryptSecret(bot.token_encrypted);
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: bot.chat_id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("telegram send failed", res.status, body);
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("telegram notify error", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export function fmtMoney(amount: number, currency = "UGX") {
  try { return `${currency} ${amount.toLocaleString()}`; } catch { return `${currency} ${amount}`; }
}
