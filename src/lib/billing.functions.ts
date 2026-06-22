import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("*, customers(full_name,phone), plans(name,price,currency), routers(name)")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("invoices")
      .select("*, customers(full_name,phone)")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payments")
      .select("*, customers(full_name,phone), invoices(invoice_number)")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

const paymentInput = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  invoice_id: z.string().uuid().nullable().optional(),
  amount: z.number().min(0),
  currency: z.string().default("KES"),
  method: z.enum(["mpesa", "stripe", "manual", "cash"]).default("manual"),
  reference: z.string().max(120).optional().nullable(),
  status: z.enum(["pending", "success", "failed", "refunded"]).default("success"),
});

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paymentInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: ins, error } = await context.supabase.from("payments").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    if (data.status === "success" && data.invoice_id) {
      await context.supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", data.invoice_id);
    }
    return { id: ins.id };
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("hotspot_sessions").select("*, routers(name)")
      .order("started_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data;
  });
