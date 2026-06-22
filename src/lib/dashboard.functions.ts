import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PeriodKey = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth";
type PeriodAgg = { cash: number; mobileMoney: number; total: number; count: number };

function tzOffsetMinutes(tz: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).reduce<Record<string, string>>((a, p) => { if (p.type !== "literal") a[p.type] = p.value; return a; }, {});
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch { return 0; }
}
function startOfDayTz(d: Date, tz: string): Date {
  const off = tzOffsetMinutes(tz, d);
  const local = new Date(d.getTime() + off * 60000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - off * 60000);
}
function startOfWeekTz(d: Date, tz: string): Date {
  const sd = startOfDayTz(d, tz);
  const localDow = new Date(sd.getTime() + tzOffsetMinutes(tz, sd) * 60000).getUTCDay();
  const back = (localDow + 6) % 7;
  return new Date(sd.getTime() - back * 86400000);
}
function startOfMonthTz(d: Date, tz: string): Date {
  const off = tzOffsetMinutes(tz, d);
  const local = new Date(d.getTime() + off * 60000);
  local.setUTCDate(1); local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - off * 60000);
}

function isCash(method: string | null) {
  const m = (method || "").toLowerCase();
  return m === "cash" || m === "manual";
}

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: biz } = await supabase
      .from("business_settings").select("timezone").eq("owner_id", context.userId).maybeSingle();
    const tz = (biz?.timezone as string) || "Africa/Nairobi";
    const now = new Date();
    const todayStart = startOfDayTz(now, tz);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const thisWeekStart = startOfWeekTz(now, tz);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000);
    const thisMonthStart = startOfMonthTz(now, tz);
    const lastMonthStart = startOfMonthTz(new Date(thisMonthStart.getTime() - 86400000), tz);

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
