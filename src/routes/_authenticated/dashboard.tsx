import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/dashboard.html?raw";
import { getDashboardStats } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const CUR = "UGX";
const fmtM = (n: number) => `${CUR} ${Math.round(n).toLocaleString()}`;
const setText = (id: string, v: string | number) => {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v);
};
const setHTML = (id: string, v: string) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = v;
};

const PERIOD_LABELS: Record<string, string> = {
  today: "Today", yesterday: "Yesterday",
  thisWeek: "This Week", lastWeek: "Last Week",
  thisMonth: "This Month", lastMonth: "Last Month",
};

function buildTrendChartSvg(trend: { date: string; cash: number; mobileMoney: number; total: number }[]) {
  if (!trend.length) return '<div class="empty">No payment data in this range yet</div>';
  const W = Math.max(600, trend.length * 46), H = 200, padB = 34, padT = 10, padL = 10, padR = 10;
  const chartH = H - padB - padT;
  const maxTotal = Math.max(1, ...trend.map(d => d.total));
  const barW = Math.min(28, (W - padL - padR) / trend.length - 10);
  const gap = (W - padL - padR - barW * trend.length) / Math.max(1, trend.length - 1 || 1);
  let bars = "", labels = "";
  trend.forEach((d, i) => {
    const x = padL + i * (barW + gap);
    const cashH = Math.round((d.cash / maxTotal) * chartH);
    const mmH = Math.round((d.mobileMoney / maxTotal) * chartH);
    const totalH = cashH + mmH;
    const yTop = padT + (chartH - totalH);
    bars += "<g>" +
      (mmH > 0 ? `<rect x="${x}" y="${yTop}" width="${barW}" height="${mmH}" fill="#3b82f6" rx="2"/>` : "") +
      (cashH > 0 ? `<rect x="${x}" y="${yTop + mmH}" width="${barW}" height="${cashH}" fill="#10b981" rx="2"/>` : "") +
      `<title>${d.date}: ${fmtM(d.total)} (Cash ${fmtM(d.cash)}, Mobile Money ${fmtM(d.mobileMoney)})</title></g>`;
    const shortLabel = d.date.slice(5).replace("-", "/");
    labels += `<text x="${x + barW / 2}" y="${H - 12}" font-size="9" fill="var(--t4)" text-anchor="middle">${shortLabel}</text>`;
  });
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="min-width:100%">${bars}${labels}</svg></div>` +
    `<div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--t3)">` +
      `<span><span class="period-split-dot" style="background:#10b981"></span> Cash</span>` +
      `<span><span class="period-split-dot" style="background:#3b82f6"></span> Mobile Money</span>` +
    `</div>`;
}

function DashboardPage() {
  const fetchStats = useServerFn(getDashboardStats);
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
    refetchInterval: 30_000,
  });
  const [trendDays, setTrendDays] = useState(14);

  useEffect(() => {
    if (!data) return;
    setText("d-av", data.activeVouchers);
    setText("d-on", `${data.onlineSessions} online`);
    setText("d-sms", data.smsCredits);
    setText("d-online-badge", `${data.onlineSessions} live`);

    const t = data.periods.today;
    setText("d-today", fmtM(t.total));
    setText("d-ts", `${t.count} sale${t.count !== 1 ? "s" : ""}`);

    // Sales by Period — exact mockup markup
    setHTML("d-period-summary",
      '<div class="period-summary-grid">' +
      Object.keys(PERIOD_LABELS).map(key => {
        const p = (data.periods as Record<string, typeof t>)[key] ?? { cash: 0, mobileMoney: 0, total: 0, count: 0 };
        return `<div class="period-card">
          <div class="period-card-label">${PERIOD_LABELS[key]}</div>
          <div class="period-card-total">${fmtM(p.total)}</div>
          <div class="period-card-split">
            <div class="period-split-row"><span class="period-split-dot" style="background:#10b981"></span>Cash<span class="period-split-val">${fmtM(p.cash)}</span></div>
            <div class="period-split-row"><span class="period-split-dot" style="background:#3b82f6"></span>Mobile Money<span class="period-split-val">${fmtM(p.mobileMoney)}</span></div>
          </div>
          <div class="period-card-count">${p.count} sale${p.count !== 1 ? "s" : ""}</div>
        </div>`;
      }).join("") + "</div>"
    );

    // Trend chart
    const cutoff = Date.now() - trendDays * 86400_000;
    const buckets: Record<string, { cash: number; mobileMoney: number; total: number }> = {};
    for (let i = trendDays - 1; i >= 0; i--) {
      const k = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      buckets[k] = { cash: 0, mobileMoney: 0, total: 0 };
    }
    for (const p of data.trendPayments) {
      if (new Date(p.date).getTime() < cutoff) continue;
      if (!buckets[p.date]) continue;
      if (p.cash) buckets[p.date].cash += p.amount;
      else buckets[p.date].mobileMoney += p.amount;
      buckets[p.date].total += p.amount;
    }
    const trend = Object.entries(buckets).map(([date, v]) => ({ date, ...v }));
    setHTML("d-trend-chart", buildTrendChartSvg(trend));

    // Online clients placeholder (live data wired separately)
    setHTML("d-clients-list", data.onlineSessions
      ? `<div class="fhint" style="padding:12px 0">${data.onlineSessions} session${data.onlineSessions !== 1 ? "s" : ""} online — see Live Clients</div>`
      : '<div class="empty"><span class="empty-ico">📡</span>No active sessions</div>');

    // Activity feed empty for now
    setHTML("d-activity", '<div class="empty"><span class="empty-ico">🕐</span>No activity yet</div>');

    // Revenue by plan — empty until plans/sales wired
    setHTML("d-revchart", '<div class="empty">No revenue data yet</div>');

    // Router status
    if (!data.routers.length) {
      setHTML("d-router-status", '<div class="empty"><span class="empty-ico">📡</span>No routers configured yet — add one in MikroTiks</div>');
    } else {
      setHTML("d-router-status", data.routers.map(r => {
        const online = r.status === "online";
        return `<div class="router-status-card${online ? "" : " offline"}">
          <div class="router-status-name">${r.is_chr ? "☁️ " : "📡 "}${r.name}<span class="badge ${online ? "bg-green" : "bg-red"}" style="margin-left:8px">${r.status ?? "unknown"}</span></div>
          <div class="fhint" style="margin-top:6px">${r.host}${r.last_seen ? " · last seen " + new Date(r.last_seen).toLocaleString() : ""}</div>
        </div>`;
      }).join(""));
      setText("d-router-status-updated", "Updated " + new Date().toLocaleTimeString());
    }
  }, [data, trendDays]);

  // Wire the trend days selector
  useEffect(() => {
    const sel = document.getElementById("d-trend-days") as HTMLSelectElement | null;
    if (!sel) return;
    const handler = () => setTrendDays(parseInt(sel.value || "14", 10));
    sel.addEventListener("change", handler);
    return () => sel.removeEventListener("change", handler);
  }, [data]);

  return <MockupPage title="Dashboard" html={html} />;
}
