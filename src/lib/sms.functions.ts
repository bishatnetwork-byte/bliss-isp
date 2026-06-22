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

// ---- Buy SMS credits ----
export const buySmsCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    credits: z.number().int().min(1).max(100000),
    payment_method: z.enum(["wallet", "mpesa", "manual"]).default("wallet"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: fees } = await context.supabase.from("fee_settings").select("sms_price_per_credit").eq("id", true).maybeSingle();
    const price = Number(fees?.sms_price_per_credit ?? 1);
    const amount = data.credits * price;

    const { data: wallet, error: wErr } = await context.supabase
      .from("wallet").select("balance,sms_credits").eq("owner_id", context.userId).maybeSingle();
    if (wErr) throw new Error(wErr.message);
    if (!wallet) throw new Error("Wallet not found");

    if (data.payment_method === "wallet") {
      if (Number(wallet.balance) < amount) throw new Error("Insufficient wallet balance");
      const { error: uErr } = await context.supabase.from("wallet").update({
        balance: Number(wallet.balance) - amount,
        sms_credits: wallet.sms_credits + data.credits,
      }).eq("owner_id", context.userId);
      if (uErr) throw new Error(uErr.message);
    } else {
      // For mpesa/manual: credit immediately (real STK push wiring is its own gateway step)
      const { error: uErr } = await context.supabase.from("wallet").update({
        sms_credits: wallet.sms_credits + data.credits,
      }).eq("owner_id", context.userId);
      if (uErr) throw new Error(uErr.message);
    }

    await context.supabase.from("sms_credit_purchases").insert({
      owner_id: context.userId, credits: data.credits, amount, payment_method: data.payment_method, status: "completed",
    });

    const { data: latest } = await context.supabase
      .from("wallet").select("balance,sms_credits").eq("owner_id", context.userId).maybeSingle();

    return { ok: true, balance: latest?.balance ?? 0, sms_credits: latest?.sms_credits ?? 0 };
  });

export const listSmsPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_credit_purchases").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Send bulk SMS ----
function calcParts(body: string) {
  const len = body.length;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

export const sendBulkSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    recipients: z.array(z.object({ phone: z.string().min(3), name: z.string().optional().nullable() })).min(1).max(2000),
    body: z.string().min(1).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const parts = calcParts(data.body);
    const cost = parts * data.recipients.length;

    const { data: wallet } = await context.supabase
      .from("wallet").select("sms_credits").eq("owner_id", context.userId).maybeSingle();
    if (!wallet || wallet.sms_credits < cost) {
      throw new Error(`Insufficient SMS credits. Need ${cost}, have ${wallet?.sms_credits ?? 0}`);
    }

    // Deduct credits
    await context.supabase.from("wallet").update({ sms_credits: wallet.sms_credits - cost }).eq("owner_id", context.userId);

    // Insert message rows (status=sent — actual provider dispatch happens when SMS gateway is wired)
    const rows = data.recipients.map(r => ({
      owner_id: context.userId,
      phone: r.phone,
      name: r.name ?? null,
      body: data.body,
      parts,
      status: "sent" as const,
      kind: "bulk",
    }));
    const { error } = await context.supabase.from("sms_messages").insert(rows);
    if (error) throw new Error(error.message);

    // Auto-add to contacts
    const contactRows = data.recipients.map(r => ({
      owner_id: context.userId, phone: r.phone, name: r.name ?? null, source: "bulk_sms",
    }));
    await context.supabase.from("contacts").upsert(contactRows, { onConflict: "owner_id,phone", ignoreDuplicates: true });

    return { ok: true, sent: data.recipients.length, smsCreditsRemaining: wallet.sms_credits - cost };
  });
