import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn, createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/reports.html?raw";
import { listPayments } from "@/lib/billing.functions";
import { listVouchers } from "@/lib/vouchers.functions";
import { setHTML, setText, esc, fmt } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

const getReportExtras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [smsRes, payRes] = await Promise.all([
      context.supabase.from("sms_messages").select("id", { count: "exact", head: true }),
      context.supabase
        .from("payments")
        .select("amount,created_at,status")
        .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
    ]);
    const byDay = new Map<string, number>();
    for (const p of payRes.data ?? []) {
      if (p.status !== "success" && p.status !== "completed") continue;
      const k = (p.created_at as string).slice(0, 10);
      byDay.set(k, (byDay.get(k) ?? 0) + Number(p.amount || 0));
    }
    const days: { date: string; amount: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const k = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      days.push({ date: k, amount: byDay.get(k) ?? 0 });
    }
    return { smsCount: smsRes.count ?? 0, days };
  });

function spark(days: { date: string; amount: number }[]): string {
  const max = Math.max(1, ...days.map((d) => d.amount));
  const W = 600, H = 80, padB = 14;
  const bw = W / days.length - 2;
  const bars = days.map((d, i) => {
    const h = Math.round((d.amount / max) * (H - padB));
    const x = i * (bw + 2);
    const y = H - padB - h;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="#3b82f6" rx="2"><title>${d.date}: ${fmt(d.amount)}</title></rect>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${bars}</svg>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--t4);margin-top:4px">
      <span>${days[0].date}</span><span>${days[days.length - 1].date}</span>
    </div>`;
}

function ReportsPage() {
  const pFn = useServerFn(listPayments);
  const vFn = useServerFn(listVouchers);
  const eFn = useServerFn(getReportExtras);
  const { data: payments } = useQuery({ queryKey: ["payments"], queryFn: () => pFn() });
  const { data: vouchers } = useQuery({ queryKey: ["vouchers"], queryFn: () => vFn() });
  const { data: extras } = useQuery({ queryKey: ["report-extras"], queryFn: () => eFn(), refetchInterval: 60_000 });

  return (
    <MockupPage
      title="Reports"
      html={html}
      deps={[payments, vouchers, extras]}
      hydrate={(root) => {
        const allP = (payments ?? []).filter((p) => p.status === "success" || p.status === "completed");
        const allV = vouchers ?? [];
        const rev = allP.reduce((s, p) => s + Number(p.amount || 0), 0);
        const avg = allP.length ? rev / allP.length : 0;
        const vAct = allV.filter((v) => v.status === "active" || v.status === "paid").length;

        setText(root, "rp-rev", fmt(rev));
        setText(root, "rp-txn", `${allP.length} transactions`);
        setText(root, "rp-vsold", allV.length);
        setText(root, "rp-vact", `${vAct} active`);
        setText(root, "rp-avg", fmt(avg));
        setText(root, "rp-sms", extras?.smsCount ?? 0);

        const byMethod = new Map<string, number>();
        for (const p of allP) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount || 0));
        const methodHTML = [...byMethod.entries()].map(([m, v]) =>
          `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bg0);font-size:12px">
            <span>${esc(m)}</span><span style="font-weight:700">${fmt(v)}</span></div>`).join("");
        const trendHTML = extras?.days?.length
          ? `<div style="margin-top:12px"><div class="fhint" style="margin-bottom:6px">Revenue — last 30 days</div>${spark(extras.days)}</div>`
          : "";
        setHTML(root, "rp-method", (methodHTML || '<div class="empty">No revenue yet</div>') + trendHTML);

        const byStatus = new Map<string, number>();
        for (const v of allV) byStatus.set(v.status, (byStatus.get(v.status) ?? 0) + 1);
        setHTML(root, "rp-vstatus", [...byStatus.entries()].map(([s, n]) =>
          `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bg0);font-size:12px">
            <span>${esc(s)}</span><span style="font-weight:700">${n}</span></div>`).join("") || '<div class="empty">No vouchers yet</div>');

        setHTML(root, "rp-tbody", allP.length ? allP.map((p, i) => {
          const c = p.customers as { full_name?: string; phone?: string } | null;
          return `<tr>
            <td>TXN-${String(i + 1).padStart(4, "0")}</td>
            <td>${esc(c?.full_name ?? "Guest")}</td>
            <td>${esc(c?.phone ?? "—")}</td>
            <td>—</td>
            <td>${fmt(Number(p.amount), p.currency)}</td>
            <td><span class="badge">${esc(p.method)}</span></td>
            <td>—</td>
            <td><span class="badge bg-green">${esc(p.status)}</span></td>
            <td>${new Date(p.created_at).toLocaleString()}</td></tr>`;
        }).join("") : '<tr><td colspan="9"><div class="empty">No transactions</div></td></tr>');
      }}
    />
  );
}
