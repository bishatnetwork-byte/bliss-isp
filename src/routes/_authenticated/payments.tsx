import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/payments.html?raw";
import { listPayments } from "@/lib/billing.functions";
import { setHTML, on, esc, fmt } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const fn = useServerFn(listPayments);
  const { data: payments } = useQuery({
    queryKey: ["payments"], queryFn: () => fn(), refetchInterval: 20000,
  });

  return (
    <MockupPage
      title="Payments"
      html={html}
      deps={[payments]}
      hydrate={(root) => {
        const all = payments ?? [];
        const render = (filter = "", tab = "all") => {
          const f = filter.toLowerCase();
          const list = all.filter(p => {
            if (tab !== "all" && p.status !== tab) return false;
            if (!f) return true;
            return (
              (p.reference ?? "").toLowerCase().includes(f) ||
              ((p.customers as { full_name?: string } | null)?.full_name ?? "").toLowerCase().includes(f) ||
              ((p.customers as { phone?: string } | null)?.phone ?? "").includes(f)
            );
          });
          setHTML(root, "ptbody", list.length ? list.map(p => {
            const cls = p.status === "success" ? "bg-green" : p.status === "pending" ? "bg-yellow" : p.status === "failed" ? "bg-red" : "bg-gray";
            const cust = (p.customers as { full_name?: string; phone?: string } | null);
            return `<tr>
              <td>${new Date(p.created_at).toLocaleString()}</td>
              <td>${esc(cust?.full_name ?? "Guest")}<div style="font-size:10px;color:var(--muted)">${esc(cust?.phone ?? "")}</div></td>
              <td>${fmt(Number(p.amount), p.currency)}</td>
              <td><span class="badge">${esc(p.method)}</span></td>
              <td><span class="badge ${cls}">${esc(p.status)}</span></td>
              <td>${esc(p.reference ?? "—")}</td>
            </tr>`;
          }).join("") : `<tr><td colspan="6"><div class="empty">No payments</div></td></tr>`);
        };
        render();

        on(root, "p-search", "input", (e) => render((e.target as HTMLInputElement).value));
        root.querySelectorAll<HTMLElement>("#ptabs [data-tab]").forEach(t =>
          t.addEventListener("click", () => {
            root.querySelectorAll("#ptabs [data-tab]").forEach(x => x.classList.remove("active"));
            t.classList.add("active");
            render("", t.dataset.tab!);
          }));
      }}
    />
  );
}
