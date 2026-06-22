import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/reports.html?raw";
import { listPayments } from "@/lib/billing.functions";
import { listVouchers } from "@/lib/vouchers.functions";
import { setHTML, setText, esc, fmt } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

function ReportsPage() {
  const pFn = useServerFn(listPayments);
  const vFn = useServerFn(listVouchers);
  const { data: payments } = useQuery({ queryKey: ["payments"], queryFn: () => pFn() });
  const { data: vouchers } = useQuery({ queryKey: ["vouchers"], queryFn: () => vFn() });

  return (
    <MockupPage
      title="Reports"
      html={html}
      deps={[payments, vouchers]}
      hydrate={(root) => {
        const allP = (payments ?? []).filter((p) => p.status === "success");
        const allV = vouchers ?? [];
        const rev = allP.reduce((s, p) => s + Number(p.amount || 0), 0);
        const avg = allP.length ? rev / allP.length : 0;
        const vAct = allV.filter((v) => v.status === "active" || v.status === "paid").length;

        setText(root, "rp-rev", fmt(rev));
        setText(root, "rp-txn", `${allP.length} transactions`);
        setText(root, "rp-vsold", allV.length);
        setText(root, "rp-vact", `${vAct} active`);
        setText(root, "rp-avg", fmt(avg));
        setText(root, "rp-sms", 0);

        // Revenue by method
        const byMethod = new Map<string, number>();
        for (const p of allP) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount || 0));
        setHTML(root, "rp-method", [...byMethod.entries()].map(([m, v]) =>
          `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bg0);font-size:12px">
            <span>${esc(m)}</span><span style="font-weight:700">${fmt(v)}</span></div>`).join("") || '<div class="empty">No revenue yet</div>');

        // Vouchers by status
        const byStatus = new Map<string, number>();
        for (const v of allV) byStatus.set(v.status, (byStatus.get(v.status) ?? 0) + 1);
        setHTML(root, "rp-vstatus", [...byStatus.entries()].map(([s, n]) =>
          `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bg0);font-size:12px">
            <span>${esc(s)}</span><span style="font-weight:700">${n}</span></div>`).join("") || '<div class="empty">No vouchers yet</div>');

        // Transaction log
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
