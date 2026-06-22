import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Ping every router for the caller's tenant and persist status. */
export const probeAllRouters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("routers")
      .select("id,name,host,port,username,password_encrypted,use_tls");
    if (error) throw new Error(error.message);
    const { decryptSecret } = await import("@/lib/crypto.server");
    const { ros } = await import("@/lib/routeros.server");

    const results: { id: string; name: string; ok: boolean; error?: string }[] = [];
    for (const r of rows ?? []) {
      try {
        const password = await decryptSecret(r.password_encrypted);
        await ros.ping({
          host: r.host, port: r.port, username: r.username, password, use_tls: r.use_tls,
        });
        await supabase
          .from("routers")
          .update({ status: "online", last_seen: new Date().toISOString() })
          .eq("id", r.id);
        results.push({ id: r.id, name: r.name, ok: true });
      } catch (e) {
        await supabase.from("routers").update({ status: "error" }).eq("id", r.id);
        results.push({ id: r.id, name: r.name, ok: false, error: (e as Error).message });
      }
    }
    return { count: results.length, results };
  });
