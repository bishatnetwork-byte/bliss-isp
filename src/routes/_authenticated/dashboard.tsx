import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/dashboard.html?raw";
import { getDashboardStats } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const fmt = (n: number) => "KES " + Math.round(n).toLocaleString();
const setText = (id: string, v: string | number) => {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v);
};
const setHTML = (id: string, v: string) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = v;
};

function DashboardPage() {
  const fetchStats = useServerFn(getDashboardStats);
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!data) return;
    setText("d-av", data.activeVouchers);
    setText("d-on", `${data.onlineSessions} online`);
    setText("d-today", fmt(data.todayRevenue));
    setText("d-ts", `${data.todaySales} sales`);
    setText("d-sms", data.smsCredits);
    setText("d-online-badge", `${data.onlineSessions} live`);

    // Sales by period
    setHTML("d-period-summary", `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div><div class="fhint">Cash today</div><div style="font-size:22px;font-weight:600">${fmt(data.todayCash)}</div></div>
        <div><div class="fhint">Mobile Money today</div><div style="font-size:22px;font-weight:600">${fmt(data.todayMobile)}</div></div>
      </div>`);

    // Trend chart (bars)
    const max = Math.max(1, ...data.trend.map(t => t.cash + t.mobile));
    setHTML("d-trend-chart", `
      <div style="display:flex;align-items:flex-end;gap:6px;height:180px">
        ${data.trend.map(t => {
          const total = t.cash + t.mobile;
          const h = (total / max) * 100;
          const cH = total ? (t.cash / total) * h : 0;
          const mH = total ? (t.mobile / total) * h : 0;
          const d = new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
            <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
              <div title="Mobile: ${fmt(t.mobile)}" style="height:${mH}%;background:#2563eb;border-radius:2px 2px 0 0"></div>
              <div title="Cash: ${fmt(t.cash)}" style="height:${cH}%;background:#10b981"></div>
            </div>
            <div style="font-size:10px;color:var(--muted)">${d}</div>
          </div>`;
        }).join("")}
      </div>`);

    // Activity feed
    if (data.recentPayments.length === 0) {
      setHTML("d-activity", `<div class="empty"><span class="empty-ico">🕐</span>No activity yet</div>`);
    } else {
      setHTML("d-activity", `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px">
        ${data.recentPayments.map(p => {
          const name = (p.customers as { full_name?: string } | null)?.full_name ?? "Guest";
          const cls = p.status === "success" ? "bg-green" : "bg-yellow";
          return `<li style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)">
            <span><span class="badge ${cls}">${p.method}</span> ${name}</span>
            <span style="font-weight:600">${fmt(Number(p.amount))}</span></li>`;
        }).join("")}
      </ul>`);
    }

    // Router status
    if (!data.routers.length) {
      setHTML("d-router-status", `<div class="empty"><span class="empty-ico">📡</span>No routers configured yet</div>`);
    } else {
      setHTML("d-router-status", `<table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr style="text-align:left;color:var(--muted)"><th style="padding:6px 0">Name</th><th>Host</th><th>Status</th><th>Last seen</th></tr></thead>
        <tbody>${data.routers.map(r => {
          const cls = r.status === "online" ? "bg-green" : r.status === "error" ? "bg-red" : "bg-yellow";
          return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 0">${r.name}</td><td>${r.host}</td>
            <td><span class="badge ${cls}">${r.status ?? "unknown"}</span></td>
            <td>${r.last_seen ? new Date(r.last_seen).toLocaleString() : "—"}</td></tr>`;
        }).join("")}</tbody></table>`);
    }
  }, [data]);

  return <MockupPage title="Dashboard" html={html} />;
}
