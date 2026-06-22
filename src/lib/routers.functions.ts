import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- ROUTERS ----------
const routerInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(443),
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(255).optional(),
  use_tls: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

export const listRouters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("routers")
      .select("id,name,host,port,username,use_tls,status,last_seen,notes,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => routerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { encryptSecret } = await import("@/lib/crypto.server");
    const password_encrypted = data.password ? await encryptSecret(data.password) : undefined;
    if (data.id) {
      const update: Record<string, unknown> = {
        name: data.name, host: data.host, port: data.port,
        username: data.username, use_tls: data.use_tls, notes: data.notes ?? null,
      };
      if (password_encrypted) update.password_encrypted = password_encrypted;
      const { error } = await (context.supabase.from("routers") as never as { update: (v: unknown) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } })
        .update(update).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    if (!password_encrypted) throw new Error("Password required for new router");
    const insert = {
      name: data.name, host: data.host, port: data.port,
      username: data.username, use_tls: data.use_tls, notes: data.notes ?? null,
      created_by: context.userId, password_encrypted,
    };
    const { data: ins, error } = await context.supabase.from("routers").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

export const deleteRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("routers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase
      .from("routers").select("host,port,username,password_encrypted,use_tls").eq("id", data.id).single();
    if (error || !r) throw new Error(error?.message ?? "Router not found");
    const { decryptSecret } = await import("@/lib/crypto.server");
    const { ros } = await import("@/lib/routeros.server");
    const creds = {
      host: r.host, port: r.port, username: r.username,
      password: await decryptSecret(r.password_encrypted), use_tls: r.use_tls,
    };
    try {
      const info = await ros.ping(creds);
      await context.supabase.from("routers")
        .update({ status: "online", last_seen: new Date().toISOString() }).eq("id", data.id);
      return { ok: true, info: JSON.stringify(info) };
    } catch (e) {
      await context.supabase.from("routers").update({ status: "error" }).eq("id", data.id);
      return { ok: false, error: (e as Error).message };
    }
  });
