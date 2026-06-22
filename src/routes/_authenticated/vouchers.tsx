import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/vouchers.html?raw";
import { listVouchers, generateVouchers, revokeVoucher, softDeleteVoucher } from "@/lib/vouchers.functions";
import { listPlans } from "@/lib/plans.functions";
import { setHTML, setText, getVal, on, esc, fmt, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/vouchers")({ component: VouchersPage });

type Voucher = {
  id: string; code: string; status: string;
  created_at: string; expires_at: string | null; used_at: string | null;
  plans: { name: string; price: number; currency: string; duration_minutes: number } | null;
  customers: { full_name: string; phone: string | null } | null;
};

function VouchersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listVouchers);
  const plansFn = useServerFn(listPlans);
  const genFn = useServerFn(generateVouchers);
  const revokeFn = useServerFn(revokeVoucher);
  const delFn = useServerFn(softDeleteVoucher);

  const { data: vouchers } = useQuery({ queryKey: ["vouchers"], queryFn: () => listFn(), refetchInterval: 30_000 });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => plansFn() });

  return (
    <MockupPage
      title="Vouchers"
      html={html}
      deps={[vouchers, plans]}
      hydrate={(root) => {
        const all = (vouchers ?? []) as Voucher[];
        const allPlans = plans ?? [];

        // Populate plan select
        const planSel = root.querySelector<HTMLSelectElement>("#sv-plan");
        if (planSel) {
          planSel.innerHTML = '<option value="">— Choose a plan —</option>' +
            allPlans.map(p => `<option value="${p.id}">${esc(p.name)} — ${fmt(Number(p.price), p.currency)}</option>`).join("");
        }

        const updateBatchCalc = () => {
          const qty = parseInt(getVal(root, "bv-qty") || "0", 10);
          const plan = allPlans.find(p => p.id === getVal(root, "sv-plan"));
          const calc = root.querySelector<HTMLElement>("#batch-calc");
          const isBatch = (root.querySelector<HTMLInputElement>("#v-batch-toggle"))?.checked;
          if (isBatch && qty > 0 && plan) {
            calc!.style.display = "";
            setText(root, "batch-calc-text", `${qty} vouchers × ${fmt(Number(plan.price), plan.currency)} = ${fmt(qty * Number(plan.price), plan.currency)} value`);
          } else if (calc) calc.style.display = "none";
        };

        on(root, "v-batch-toggle", "change", () => {
          const on = (root.querySelector<HTMLInputElement>("#v-batch-toggle"))?.checked;
          root.querySelector<HTMLElement>("#v-single-fields")!.style.display = on ? "none" : "";
          root.querySelector<HTMLElement>("#v-batch-fields")!.style.display = on ? "" : "none";
          root.querySelector<HTMLElement>("#v-paid-row")!.style.display = on ? "none" : "";
          root.querySelector<HTMLElement>("#v-paid-hint")!.style.display = on ? "none" : "";
          root.querySelector<HTMLElement>("#v-sms-row")!.style.display = on ? "none" : "";
          const btn = root.querySelector<HTMLElement>("#v-create-btn")!;
          btn.textContent = on ? "⚡ Generate Batch" : "⚡ Generate Voucher";
          updateBatchCalc();
        });
        on(root, "bv-qty", "input", updateBatchCalc);
        on(root, "sv-plan", "change", updateBatchCalc);

        on(root, "v-create-btn", "click", async () => {
          const planId = getVal(root, "sv-plan");
          if (!planId) return notify("Select a plan", "warning");
          const isBatch = (root.querySelector<HTMLInputElement>("#v-batch-toggle"))?.checked;
          const qty = isBatch ? parseInt(getVal(root, "bv-qty") || "0", 10) : 1;
          if (qty < 1) return notify("Invalid quantity", "warning");
          try {
            const res = await genFn({ data: { plan_id: planId, quantity: qty, length: 8, batch_name: `Batch ${new Date().toLocaleString()}`, expires_in_days: 0 } });
            notify(`Generated ${res.count} voucher${res.count !== 1 ? "s" : ""}`, "success");
            qc.invalidateQueries({ queryKey: ["vouchers"] });
          } catch (e) {
            notify((e as Error).message, "error");
          }
        });

        // Filter tabs + search
        let curFilter: string = "all";
        let curSearch = "";

        const matches = (v: Voucher) => {
          if (curFilter !== "all" && v.status !== curFilter) return false;
          if (!curSearch) return true;
          const q = curSearch.toLowerCase();
          return v.code.toLowerCase().includes(q) || (v.customers?.phone ?? "").includes(q);
        };

        const render = () => {
          const counts = { all: all.length, unused: 0, paid: 0, active: 0, expired: 0 };
          for (const v of all) {
            if (v.status === "unused") counts.unused++;
            else if (v.status === "paid") counts.paid++;
            else if (v.status === "active") counts.active++;
            else if (v.status === "expired") counts.expired++;
          }
          root.querySelectorAll<HTMLElement>(".vc-all").forEach(e => e.textContent = String(counts.all));
          root.querySelectorAll<HTMLElement>(".vc-unused").forEach(e => e.textContent = String(counts.unused));
          root.querySelectorAll<HTMLElement>(".vc-paid").forEach(e => e.textContent = String(counts.paid));
          root.querySelectorAll<HTMLElement>(".vc-active").forEach(e => e.textContent = String(counts.active));
          root.querySelectorAll<HTMLElement>(".vc-expired").forEach(e => e.textContent = String(counts.expired));

          const list = all.filter(matches);
          setHTML(root, "vtbody", list.length ? list.map(v => {
            const badge = v.status === "active" ? "bg-green" : v.status === "paid" ? "bg-blue" : v.status === "expired" ? "bg-red" : v.status === "revoked" ? "bg-gray" : "bg-yellow";
            return `<tr data-id="${v.id}">
              <td><input type="checkbox" class="vchk"/></td>
              <td class="mono" style="font-weight:700">${esc(v.code)}</td>
              <td>${esc(v.customers?.full_name ?? "—")}</td>
              <td>${esc(v.customers?.phone ?? "—")}</td>
              <td>${esc(v.plans?.name ?? "—")}</td>
              <td>${v.plans ? fmt(Number(v.plans.price), v.plans.currency) : "—"}</td>
              <td><span class="badge ${badge}">${esc(v.status)}</span></td>
              <td>${v.used_at ? new Date(v.used_at).toLocaleString() : "—"}</td>
              <td>${v.expires_at ? new Date(v.expires_at).toLocaleString() : "—"}</td>
              <td>
                <button class="btn btn-s btn-sm" data-act="revoke">⛔</button>
                <button class="btn btn-r btn-sm" data-act="delete">🗑</button>
              </td>
            </tr>`;
          }).join("") : '<tr><td colspan="10"><div class="empty">No vouchers</div></td></tr>');
        };
        render();

        on(root, "v-search", "input", (e) => { curSearch = (e.target as HTMLInputElement).value; render(); });
        root.querySelectorAll<HTMLElement>("#vtabs .tab").forEach(t => {
          t.addEventListener("click", () => {
            root.querySelectorAll("#vtabs .tab").forEach(x => x.classList.remove("act"));
            t.classList.add("act");
            curFilter = t.dataset.f ?? "all";
            render();
          });
        });

        // Action buttons (event delegation)
        const tbody = root.querySelector<HTMLElement>("#vtbody");
        tbody?.addEventListener("click", async (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
          if (!btn) return;
          const tr = btn.closest<HTMLElement>("tr[data-id]");
          const id = tr?.dataset.id;
          if (!id) return;
          try {
            if (btn.dataset.act === "revoke") {
              if (!confirm("Revoke this voucher?")) return;
              await revokeFn({ data: { id } });
              notify("Revoked", "success");
            } else if (btn.dataset.act === "delete") {
              if (!confirm("Move this voucher to the recycle bin?")) return;
              await delFn({ data: { id } });
              notify("Moved to bin", "success");
            }
            qc.invalidateQueries({ queryKey: ["vouchers"] });
          } catch (err) {
            notify((err as Error).message, "error");
          }
        });
      }}
    />
  );
}
