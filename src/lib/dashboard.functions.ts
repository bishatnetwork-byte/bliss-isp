import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const [routers, customers, vouchers, activeSubs, paymentsAgg, recent] = await Promise.all([
      sb.from("routers").select("id,status", { count: "exact", head: false }),
      sb.from("customers").select("id", { count: "exact", head: true }),
      sb.from("vouchers").select("id,status", { count: "exact", head: false }),
      sb.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb.from("payments").select("amount,status,created_at").eq("status", "success").gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
      sb.from("payments").select("id,amount,currency,method,reference,status,created_at").order("created_at", { ascending: false }).limit(10),
    ]);

    const routersOnline = (routers.data ?? []).filter((r) => r.status === "online").length;
    const totalRouters = (routers.data ?? []).length;
    const vouchersUnused = (vouchers.data ?? []).filter((v) => v.status === "unused").length;
    const revenue30d = (paymentsAgg.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

    // Build daily series for last 30 days
    const days: { date: string; revenue: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, revenue: 0 });
    }
    for (const p of paymentsAgg.data ?? []) {
      const key = new Date(p.created_at).toISOString().slice(0, 10);
      const row = days.find((d) => d.date === key);
      if (row) row.revenue += Number(p.amount);
    }

    return {
      routersOnline, totalRouters,
      customers: customers.count ?? 0,
      vouchers: vouchers.data?.length ?? 0,
      vouchersUnused,
      activeSubs: activeSubs.count ?? 0,
      revenue30d,
      revenueSeries: days,
      recentPayments: recent.data ?? [],
    };
  });
