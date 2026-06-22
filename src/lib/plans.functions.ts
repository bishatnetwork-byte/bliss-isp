import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const planInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().nullable(),
  price: z.number().min(0),
  currency: z.string().min(3).max(8).default("KES"),
  duration_minutes: z.number().int().min(1),
  data_limit_mb: z.number().int().min(0).nullable().optional(),
  rate_limit_up_kbps: z.number().int().min(0).nullable().optional(),
  rate_limit_down_kbps: z.number().int().min(0).nullable().optional(),
  shared_users: z.number().int().min(1).default(1),
  is_active: z.boolean().default(true),
  is_public: z.boolean().default(true),
});

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("plans").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("plans").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: ins, error } = await context.supabase.from("plans").insert(rest).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
