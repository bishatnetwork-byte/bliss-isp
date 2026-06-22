// Public (anonymous) server functions for the captive portal.
// All reads/writes go through SECURITY DEFINER RPCs scoped by tenant.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type PortalPayload = {
  settings: {
    owner_id: string;
    template: string;
    business_name: string | null;
    logo_url: string | null;
    primary_color: string;
    welcome_text: string | null;
    video_url: string | null;
    config: Json;
  } | null;
  plans: Array<{
    id: string; name: string; price: number; currency: string;
    duration_minutes: number; data_limit_mb: number | null;
    rate_limit_up_kbps: number | null; rate_limit_down_kbps: number | null;
  }>;
};

export type RedeemResult =
  | { ok: true; voucher_id: string; code: string; plan_name: string;
      duration_minutes: number; data_limit_mb: number | null;
      rate_limit_up_kbps: number | null; rate_limit_down_kbps: number | null;
      session_expires_at: string; activated_at: string; }
  | { ok: false; error: string };

export const getPortalPayload = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ owner: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<PortalPayload> => {
    const sb = publicClient();
    const { data: payload, error } = await (sb as unknown as {
      rpc: <T>(n: string, a: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }>;
    }).rpc<PortalPayload>("rpc_get_portal", { _owner: data.owner });
    if (error) throw new Error(error.message);
    return (payload ?? { settings: null, plans: [] }) as PortalPayload;
  });

export const redeemVoucherPublic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    owner: z.string().uuid(),
    code: z.string().min(3).max(40),
    mac: z.string().max(40).optional().nullable(),
    ip: z.string().max(64).optional().nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<RedeemResult> => {
    const sb = publicClient();
    const { data: res, error } = await (sb as unknown as {
      rpc: <T>(n: string, a: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }>;
    }).rpc<RedeemResult>("rpc_redeem_voucher_public", {
      _owner: data.owner,
      _code: data.code.trim().toUpperCase(),
      _mac: data.mac ?? null,
      _ip: data.ip ?? null,
    });
    if (error) throw new Error(error.message);
    return res as RedeemResult;
  });
