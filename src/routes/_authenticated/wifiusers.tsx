import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/wifiusers.html?raw";
import { listPayments } from "@/lib/billing.functions";
import { setHTML, setText, on, esc, fmt } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/wifiusers")({ component: WifiUsersPage });

type Pay = {
  amount: number | string; created_at: string; status: string;
  customers: { full_name?: string; phone?: string } | null;
};

function WifiUsersPage() {
  const fn = useServerFn(listPayments);
  const { data: payments } = useQuery({ queryKey: ["payments"], queryFn: () => fn() });

  return (
    <MockupPage
      title="WiFi Users"
      html={html}
      deps={[payments]}
      hydrate={(root) => {
        const all = (payments ?? []) as Pay[];
        const map = new Map<string, { name: string; phone: string; count: number; total: number; last: string }>();
        for (const p of all) {
          if (p.status !== "success") continue;
          const phone = p.customers?.phone ?? "—";
          const name = p.customers?.full_name ?? "Guest";
          const key = phone === "—" ? name : phone;
          const cur = map.get(key) ?? { name, phone, count: 0, total: 0, last: p.created_at };
          cur.count++;
          cur.total += Number(p.amount || 0);
          if (new Date(p.created_at) > new Date(cur.last)) cur.last = p.created_at;
          map.set(key, cur);
        }
        const rows = [...map.values()].sort((a, b) => b.total - a.total);
        const repeats = rows.filter(r => r.count >= 2).length;
        const top = rows[0];

        setText(root, "wu-total", rows.length);
        setText(root, "wu-repeat", repeats);
        setText(root, "wu-top", top ? fmt(top.total) : "UGX 0");
        setText(root, "wu-top-name", top?.name ?? "—");

        const render = (q = "") => {
          const ql = q.toLowerCase();
          const list = rows.filter(r => !q || r.name.toLowerCase().includes(ql) || r.phone.includes(q));
          setHTML(root, "wu-tbody", list.length ? list.map((r, i) => `
            <tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.phone)}</td>
            <td>${r.count}</td><td>${fmt(r.total)}</td>
            <td>${new Date(r.last).toLocaleDateString()}</td>
            <td><button class="btn btn-s btn-sm">📞</button></td></tr>`).join("") :
            '<tr><td colspan="7"><div class="empty">No customers yet</div></td></tr>');
        };
        render();
        on(root, "wu-search", "input", (e) => render((e.target as HTMLInputElement).value));
      }}
    />
  );
}
