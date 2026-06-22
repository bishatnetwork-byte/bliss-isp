import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = ["sms", "payment", "email", "domain"] as const;

export const listGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("gateways").select("id,kind,provider,enabled,config,created_at,updated_at,secret_encrypted");
    if (error) throw new Error(error.message);
    return (data ?? []).map(g => ({
      id: g.id, kind: g.kind, provider: g.provider, enabled: g.enabled, config: g.config,
      has_secret: !!g.secret_encrypted, created_at: g.created_at, updated_at: g.updated_at,
    }));
  });

export const saveGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(KINDS),
    provider: z.string().min(1).max(60),
    enabled: z.boolean().default(false),
    config: z.record(z.string(), z.unknown()).default({}),
    secret: z.string().max(2000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const update: Record<string, unknown> = {
      owner_id: context.userId, kind: data.kind, provider: data.provider,
      enabled: data.enabled, config: data.config,
    };
    if (data.secret) {
      const { encryptSecret } = await import("@/lib/crypto.server");
      update.secret_encrypted = await encryptSecret(data.secret);
    }
    const { error } = await context.supabase.from("gateways").upsert(update as never, { onConflict: "owner_id,kind" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Telegram bots ----
const BOT_KEYS = ["payments", "wifiActivity", "withdraw"] as const;

export const listTelegramBots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("telegram_bots").select("bot_key,enabled,chat_id,token_encrypted");
    if (error) throw new Error(error.message);
    return (data ?? []).map(b => ({
      bot_key: b.bot_key, enabled: b.enabled, chat_id: b.chat_id, has_token: !!b.token_encrypted,
    }));
  });

export const saveTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    bot_key: z.enum(BOT_KEYS),
    enabled: z.boolean(),
    chat_id: z.string().max(80).optional().nullable(),
    token: z.string().max(500).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const update: Record<string, unknown> = {
      owner_id: context.userId, bot_key: data.bot_key,
      enabled: data.enabled, chat_id: data.chat_id ?? null,
    };
    if (data.token) {
      const { encryptSecret } = await import("@/lib/crypto.server");
      update.token_encrypted = await encryptSecret(data.token);
    }
    const { error } = await context.supabase.from("telegram_bots").upsert(update as never, { onConflict: "owner_id,bot_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
