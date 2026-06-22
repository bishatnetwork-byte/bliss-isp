import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PeriodKey = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth";
type PeriodAgg = { cash: number; mobileMoney: number; total: number; count: number };

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d: Date) {
  // Monday-based week
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
function startOfMonth(d: Date) { const x = startOfDay(d); x.setDate(1); return x; }

function isCash(method: string | null) {
  const m = (method || "").toLowerCase();
  return m === "cash" || m === "manual";
}

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const now = new Date();
    const todayStart = startOfDay(now);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = new Date(thisMonthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    const fromIso = lastMonthStart.toISOString();
    const trendFromIso = new Date(Date.now() - 90 * 86400_000).toISOString();

    const [vouchersRes, sessionsRes, periodRes, routersRes, trendRes, walletRes] = await Promise.all([
      supabase.from("vouchers").select("status,deleted_at"),
      supabase.from("hotspot_sessions").select("id", { count: "exact", head: true }).is("ended_at", null),
      supabase.from("payments").select("amount,method,status,created_at").gte("created_at", fromIso),
      supabase.from("routers").select("id,name,host,status,last_seen"),
      supabase.from("payments").select("amount,method,status,created_at").gte("created_at", trendFromIso),
      supabase.from("wallet").select("sms_credits").eq("owner_id", context.userId).maybeSingle(),
    ]);

    const vouchers = vouchersRes.data ?? [];
    const activeVouchers = vouchers.filter(v => (v.status === "active" || v.status === "unused") && !v.deleted_at).length;

    const empty = (): PeriodAgg => ({ cash: 0, mobileMoney: 0, total: 0, count: 0 });
    const periods: Record<PeriodKey, PeriodAgg> = {
      today: empty(), yesterday: empty(), thisWeek: empty(),
      lastWeek: empty(), thisMonth: empty(), lastMonth: empty(),
    };

    const add = (k: PeriodKey, amt: number, cash: boolean) => {
      periods[k].total += amt;
      periods[k].count += 1;
      if (cash) periods[k].cash += amt; else periods[k].mobileMoney += amt;
    };

    for (const p of periodRes.data ?? []) {
      if (p.status !== "success" && p.status !== "completed") continue;
      const t = new Date(p.created_at as string);
      const amt = Number(p.amount || 0);
      const cash = isCash(p.method);
      if (t >= todayStart) add("today", amt, cash);
      else if (t >= yesterdayStart) add("yesterday", amt, cash);
      if (t >= thisWeekStart) add("thisWeek", amt, cash);
      else if (t >= lastWeekStart) add("lastWeek", amt, cash);
      if (t >= thisMonthStart) add("thisMonth", amt, cash);
      else if (t >= lastMonthStart) add("lastMonth", amt, cash);
    }

    return {
      activeVouchers,
      onlineSessions: sessionsRes.count ?? 0,
      smsCredits: walletRes.data?.sms_credits ?? 0,
      periods,
      routers: routersRes.data ?? [],
      trendPayments: (trendRes.data ?? []).filter(p => p.status === "success" || p.status === "completed").map(p => ({
        amount: Number(p.amount || 0),
        cash: isCash(p.method),
        date: (p.created_at as string).slice(0, 10),
      })),
    };
  });
