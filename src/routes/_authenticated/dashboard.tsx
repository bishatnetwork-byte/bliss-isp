import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const fmt = (n: number) => "KES " + Math.round(n).toLocaleString();
const fmtShort = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function DashboardPage() {
  const fetchStats = useServerFn(getDashboardStats);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
    refetchInterval: 30_000,
  });

  if (typeof document !== "undefined") document.title = "Dashboard — HotspotPro";

  const stats = data;
  const maxTrend = stats ? Math.max(1, ...stats.trend.map(t => t.cash + t.mobile)) : 1;

  return (
    <div className="page active">
      <div className="stats-row">
        <div className="stat green">
          <div className="stat-lbl">Active Vouchers</div>
          <div className="stat-val">{stats?.activeVouchers ?? 0}</div>
          <div className="stat-sub">{stats?.onlineSessions ?? 0} online</div>
          <div className="stat-ico">🎫</div>
        </div>
        <div className="stat yellow">
          <div className="stat-lbl">Today Revenue</div>
          <div className="stat-val">{stats ? fmt(stats.todayRevenue) : "KES 0"}</div>
          <div className="stat-sub">{stats?.todaySales ?? 0} sales</div>
          <div className="stat-ico">📈</div>
        </div>
        <div className="stat purple">
          <div className="stat-lbl">SMS Credits</div>
          <div className="stat-val">{stats?.smsCredits ?? 0}</div>
          <div className="stat-sub">Available credits</div>
          <div className="stat-ico">📱</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">💰 Sales by Period</span>
          <span className="fhint" style={{ margin: 0 }}>Cash vs Mobile Money</span>
        </div>
        <div className="card-body">
          {isLoading ? (
            <div className="empty"><span className="empty-ico">⏳</span>Loading…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div className="fhint">Cash today</div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>{fmt(stats?.todayCash ?? 0)}</div>
              </div>
              <div>
                <div className="fhint">Mobile Money today</div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>{fmt(stats?.todayMobile ?? 0)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">📉 Payment Trends</span>
          <span className="fhint" style={{ margin: 0 }}>Last 14 days</span>
        </div>
        <div className="card-body" style={{ minHeight: 220 }}>
          {isLoading || !stats ? (
            <div className="empty"><span className="empty-ico">⏳</span>Loading…</div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 180 }}>
              {stats.trend.map(t => {
                const total = t.cash + t.mobile;
                const h = (total / maxTrend) * 100;
                const cashH = total ? (t.cash / total) * h : 0;
                const mobH = total ? (t.mobile / total) * h : 0;
                return (
                  <div key={t.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                      <div title={`Mobile: ${fmt(t.mobile)}`} style={{ height: `${mobH}%`, background: "#2563eb", borderRadius: "2px 2px 0 0" }} />
                      <div title={`Cash: ${fmt(t.cash)}`} style={{ height: `${cashH}%`, background: "#10b981" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>{fmtShort(t.date)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-hd">
            <span className="card-title">🟢 Online Clients</span>
            <span className="badge bg-green">{stats?.onlineSessions ?? 0} live</span>
          </div>
          <div className="card-body" style={{ padding: "8px 18px" }}>
            {(stats?.onlineSessions ?? 0) === 0 ? (
              <div className="empty"><span className="empty-ico">📡</span>No active sessions</div>
            ) : (
              <div className="fhint">{stats?.onlineSessions} active session(s) — see Live Clients page</div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">⚡ Activity Feed</span></div>
          <div className="card-body" style={{ padding: "8px 18px" }}>
            {!stats?.recentPayments?.length ? (
              <div className="empty"><span className="empty-ico">🕐</span>No activity yet</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {stats.recentPayments.map((p, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>
                      <span className={`badge ${p.status === "success" ? "bg-green" : "bg-yellow"}`}>{p.method}</span>{" "}
                      {(p.customers as { full_name?: string } | null)?.full_name ?? "Guest"}
                    </span>
                    <span style={{ fontWeight: 600 }}>{fmt(Number(p.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">🖥️ Router Status</span>
          <span className="fhint" style={{ margin: 0 }}>{stats?.routers?.length ?? 0} configured</span>
        </div>
        <div className="card-body">
          {!stats?.routers?.length ? (
            <div className="empty"><span className="empty-ico">📡</span>No routers configured yet</div>
          ) : (
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "6px 0" }}>Name</th>
                  <th>Host</th>
                  <th>Status</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {stats.routers.map(r => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 0" }}>{r.name}</td>
                    <td>{r.host}</td>
                    <td>
                      <span className={`badge ${r.status === "online" ? "bg-green" : r.status === "error" ? "bg-red" : "bg-yellow"}`}>
                        {r.status ?? "unknown"}
                      </span>
                    </td>
                    <td>{r.last_seen ? new Date(r.last_seen).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
