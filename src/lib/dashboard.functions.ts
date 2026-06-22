import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startIso = startOfDay.toISOString();

    const [vouchersRes, sessionsRes, paymentsTodayRes, routersRes, paymentsTrendRes, recentPaymentsRes] = await Promise.all([
      supabase.from("vouchers").select("id,status", { count: "exact" }),
      supabase.from("hotspot_sessions").select("id", { count: "exact" }).is("ended_at", null),
      supabase.from("payments").select("amount,method,status").gte("created_at", startIso),
      supabase.from("routers").select("id,name,host,status,last_seen"),
      supabase.from("payments").select("amount,method,created_at,status").gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString()),
      supabase.from("payments").select("amount,currency,method,status,created_at,customers(full_name)").order("created_at", { ascending: false }).limit(8),
    ]);

    const vouchers = vouchersRes.data ?? [];
    const activeVouchers = vouchers.filter(v => v.status === "active" || v.status === "unused").length;
    const onlineSessions = sessionsRes.count ?? 0;

    const todayPayments = (paymentsTodayRes.data ?? []).filter(p => p.status === "success");
    const todayRevenue = todayPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const todayCash = todayPayments.filter(p => p.method === "cash" || p.method === "manual").reduce((s, p) => s + Number(p.amount || 0), 0);
    const todayMobile = todayPayments.filter(p => p.method === "mpesa" || p.method === "stripe").reduce((s, p) => s + Number(p.amount || 0), 0);

    // Trend by day
    const trend: Record<string, { cash: number; mobile: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const k = d.toISOString().slice(0, 10);
      trend[k] = { cash: 0, mobile: 0 };
    }
    for (const p of paymentsTrendRes.data ?? []) {
      if (p.status !== "success") continue;
      const k = (p.created_at as string).slice(0, 10);
      if (!trend[k]) continue;
      const amt = Number(p.amount || 0);
      if (p.method === "mpesa" || p.method === "stripe") trend[k].mobile += amt;
      else trend[k].cash += amt;
    }

    return {
      activeVouchers,
      onlineSessions,
      todayRevenue,
      todaySales: todayPayments.length,
      todayCash,
      todayMobile,
      smsCredits: 0,
      routers: routersRes.data ?? [],
      trend: Object.entries(trend).map(([date, v]) => ({ date, ...v })),
      recentPayments: recentPaymentsRes.data ?? [],
    };
  });
