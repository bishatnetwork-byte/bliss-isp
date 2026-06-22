import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const recipientSchema = z.object({
  phone: z.string().min(3),
  name: z.string().optional().nullable(),
});

export const listSmsCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_campaigns")
      .select("*")
      .order("scheduled_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createSmsCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(1000),
    recipients: z.array(recipientSchema).min(1).max(2000),
    scheduled_at: z.string().min(10), // ISO
  }).parse(d))
  .handler(async ({ data, context }) => {
    const when = new Date(data.scheduled_at);
    if (Number.isNaN(when.getTime())) throw new Error("Invalid scheduled_at");
    const { data: row, error } = await context.supabase
      .from("sms_campaigns")
      .insert({
        owner_id: context.userId,
        title: data.title,
        body: data.body,
        recipients: data.recipients,
        scheduled_at: when.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const cancelSmsCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sms_campaigns")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
