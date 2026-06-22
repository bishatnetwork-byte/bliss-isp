import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Router, Users, Ticket, DollarSign, Activity, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { dashboardStats } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — HotspotPro" }] }),
  component: () => <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}><DashboardPage /></Suspense>,
});

function DashboardPage() {
  const fn = useServerFn(dashboardStats);
  const { data } = useSuspenseQuery({ queryKey: ["dashboard"], queryFn: () => fn() });

  const stats = [
    { label: "Routers online", value: `${data.routersOnline}/${data.totalRouters}`, icon: Router, color: "text-info" },
    { label: "Customers", value: data.customers, icon: Users, color: "text-primary" },
    { label: "Active subscriptions", value: data.activeSubs, icon: Activity, color: "text-success" },
    { label: "Unused vouchers", value: data.vouchersUnused, icon: Ticket, color: "text-warning" },
    { label: "Revenue (30d)", value: `KES ${data.revenue30d.toLocaleString()}`, icon: DollarSign, color: "text-success" },
    { label: "Total vouchers", value: data.vouchers, icon: TrendingUp, color: "text-accent" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Operational overview of your hotspot network.</p>
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Revenue — last 30 days</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
              <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent payments</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2">Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.recentPayments.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No payments yet.</td></tr>
                )}
                {data.recentPayments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2">{new Date(p.created_at).toLocaleString()}</td>
                    <td>{p.currency} {Number(p.amount).toLocaleString()}</td>
                    <td className="capitalize">{p.method}</td>
                    <td className="font-mono text-xs">{p.reference ?? "—"}</td>
                    <td><span className="capitalize text-xs">{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
