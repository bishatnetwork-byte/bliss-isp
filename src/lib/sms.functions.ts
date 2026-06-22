import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- Templates ----
export const listSmsTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_templates").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveSmsTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase.from("sms_templates").update({ title: data.title, body: data.body }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("sms_templates").insert({
      owner_id: context.userId, title: data.title, body: data.body,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

export const deleteSmsTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sms_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Contacts ----
export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contacts").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().max(120).optional().nullable(),
    phone: z.string().min(3).max(40),
    source: z.string().max(40).default("manual"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contacts").upsert({
      owner_id: context.userId, name: data.name ?? null, phone: data.phone, source: data.source,
    }, { onConflict: "owner_id,phone" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contacts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- SMS history ----
export const listSmsHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_messages").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Wallet → SMS credit transfer (atomic via RPC, ports /api/sms/transfer-from-wallet) ----
export const transferWalletToSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ amount: z.number().int().min(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("rpc_transfer_wallet_to_sms", { _amount: data.amount });
    if (error) throw new Error(error.message);
    return res as { credited: number; rate: number };
  });

// Legacy alias the UI calls (buys credits by transferring from wallet)
export const buySmsCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ amount: z.number().int().min(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("rpc_transfer_wallet_to_sms", { _amount: data.amount });
    if (error) throw new Error(error.message);
    const { data: w } = await context.supabase.from("wallet").select("balance,sms_credits").maybeSingle();
    return { ok: true, credited: (res as { credited?: number })?.credited ?? 0,
             balance: w?.balance ?? 0, sms_credits: w?.sms_credits ?? 0 };
  });

export const listSmsPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_credit_purchases").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Send bulk SMS — atomic reserve/refund pattern, ported from /api/sms/send ----
function calcParts(body: string) {
  return body.length <= 160 ? 1 : Math.ceil(body.length / 153);
}

export const sendBulkSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    recipients: z.array(z.object({
      phone: z.string().min(3),
      name: z.string().optional().nullable(),
      vars: z.record(z.string(), z.string()).optional(),
    })).min(1).max(500),
    body: z.string().min(1).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Per-recipient merge — parts can vary, so we estimate worst-case parts
    // up-front to reserve, then refund the difference at the end.
    const { mergePlaceholders, dispatchSms } = await import("@/lib/sms-dispatch.server");
    const { data: biz } = await context.supabase
      .from("business_settings").select("name").eq("owner_id", context.userId).maybeSingle();
    const businessName = (biz?.name as string) ?? "";

    const rendered = data.recipients.map(r => {
      const text = mergePlaceholders(data.body, {
        name: r.name ?? "", phone: r.phone, business: businessName, ...(r.vars ?? {}),
      });
      return { phone: r.phone, name: r.name ?? null, text, parts: calcParts(text) };
    });
    const reservedParts = rendered.reduce((s, r) => s + r.parts, 0);

    const { error: reserveErr } = await context.supabase.rpc("rpc_reserve_sms_credits", { _n: reservedParts });
    if (reserveErr) throw new Error(reserveErr.message);

    const results: { phone: string; status: "delivered" | "failed"; reason?: string; provider_ref?: string }[] = [];
    let refundParts = 0;
    type SmsLogRow = {
      owner_id: string; phone: string; name: string | null; body: string;
      parts: number; status: string; kind: string; error?: string; provider_ref?: string;
    };
    const logs: SmsLogRow[] = [];

    for (const r of rendered) {
      const res = await dispatchSms(context.userId, r.phone, r.text);
      if (res.status === "sent") {
        logs.push({
          owner_id: context.userId, phone: r.phone, name: r.name,
          body: r.text, parts: r.parts, status: "sent", kind: "bulk", provider_ref: res.provider_ref,
        });
        results.push({ phone: r.phone, status: "delivered", provider_ref: res.provider_ref });
      } else {
        logs.push({
          owner_id: context.userId, phone: r.phone, name: r.name,
          body: r.text, parts: r.parts, status: "failed", error: res.error ?? "send_failed", kind: "bulk",
        });
        refundParts += r.parts;
        results.push({ phone: r.phone, status: "failed", reason: res.error });
      }
    }

    if (logs.length) await context.supabase.from("sms_messages").insert(logs);
    if (refundParts > 0) await context.supabase.rpc("rpc_refund_sms_credits", { _n: refundParts });

    await context.supabase.from("contacts").upsert(
      data.recipients.map(r => ({
        owner_id: context.userId, phone: r.phone, name: r.name ?? null, source: "bulk_sms",
      })),
      { onConflict: "owner_id,phone", ignoreDuplicates: true },
    );

    const { data: w } = await context.supabase.from("wallet").select("sms_credits").maybeSingle();
    return {
      ok: true,
      sent: results.filter(r => r.status === "delivered").length,
      failed: refundParts / parts,
      smsCreditsRemaining: w?.sms_credits ?? 0,
      results,
    };
  });
