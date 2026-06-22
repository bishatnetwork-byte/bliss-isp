import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/sell.html?raw";
import { listPlans } from "@/lib/plans.functions";
import { sellVoucher } from "@/lib/vouchers.functions";
import { setHTML, setText, getVal, setVal, on, esc, fmt, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/sell")({ component: SellPage });

function fmtDuration(mins: number) {
  if (mins >= 1440) return `${Math.round(mins / 1440)}d`;
  if (mins >= 60) return `${Math.round(mins / 60)}h`;
  return `${mins}m`;
}

function SellPage() {
  const qc = useQueryClient();
  const plansFn = useServerFn(listPlans);
  const sellFn = useServerFn(sellVoucher);
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => plansFn() });

  return (
    <MockupPage
      title="Sell"
      html={html}
      deps={[plans]}
      hydrate={(root) => {
        const allPlans = (plans ?? []).filter(p => p.is_active);
        let selPlanId: string | null = null;
        let selMethod: "MTN MoMo" | "Airtel Money" | "Cash" = "MTN MoMo";
        const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

        const renderPlans = () => {
          setHTML(root, "sell-plans", allPlans.map((p, i) => {
            const color = colors[i % colors.length];
            const isSel = selPlanId === p.id;
            return `<div class="plan-card${isSel ? " sel" : ""}" data-plan="${p.id}">
              <div class="plan-price" style="color:${color}">${Math.round(Number(p.price)).toLocaleString()}</div>
              <div class="plan-nm">${esc(p.name)}</div>
              <div class="plan-spd">${fmtDuration(p.duration_minutes)}${p.rate_limit_down_kbps ? ` · ${Math.round(p.rate_limit_down_kbps / 1000)}M` : ""}</div>
            </div>`;
          }).join("") || '<div class="empty">No active plans — add some in WiFi Prices</div>');
          root.querySelectorAll<HTMLElement>("[data-plan]").forEach(el => {
            el.addEventListener("click", () => {
              selPlanId = el.dataset.plan!;
              renderPlans();
              updateSummary();
            });
          });
        };

        const updateSummary = () => {
          const card = root.querySelector<HTMLElement>("#sell-summary");
          if (!card) return;
          if (!selPlanId) { card.style.display = "none"; return; }
          card.style.display = "block";
          const plan = allPlans.find(p => p.id === selPlanId);
          if (!plan) return;
          const rows: [string, string][] = [
            ["Customer", getVal(root, "s-name") || "—"],
            ["Phone", getVal(root, "s-phone") || "—"],
            ["Plan", plan.name],
            ["Duration", fmtDuration(plan.duration_minutes)],
            ["Payment", selMethod],
            ["Amount", fmt(Number(plan.price), plan.currency)],
          ];
          setHTML(root, "sell-summary-rows", rows.map(([k, v]) =>
            `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--bg0);font-size:12px"><span style="color:var(--t3)">${esc(k)}</span><span style="color:var(--t1);font-weight:700">${esc(v)}</span></div>`
          ).join(""));
        };

        renderPlans();

        // Payment method toggle
        root.querySelectorAll<HTMLElement>(".pay-opt").forEach(el => {
          el.addEventListener("click", () => {
            root.querySelectorAll(".pay-opt").forEach(x => x.classList.remove("sel"));
            el.classList.add("sel");
            selMethod = (el.dataset.m as typeof selMethod) ?? "Cash";
            const refRow = root.querySelector<HTMLElement>("#ref-row");
            if (refRow) refRow.style.display = selMethod === "Cash" ? "none" : "block";
            updateSummary();
          });
        });

        on(root, "s-name", "input", updateSummary);
        on(root, "s-phone", "input", updateSummary);

        // Confirm sale
        const confirmBtn = root.querySelector<HTMLButtonElement>("#sell-summary .btn-g");
        confirmBtn?.addEventListener("click", async () => {
          const name = getVal(root, "s-name");
          const phone = getVal(root, "s-phone");
          if (!selPlanId) return notify("Select a plan", "warning");
          if (!name) return notify("Enter customer name", "warning");
          if (!phone) return notify("Enter phone number", "warning");
          try {
            const res = await sellFn({ data: {
              plan_id: selPlanId, customer_name: name, customer_phone: phone,
              method: selMethod, reference: getVal(root, "s-ref") || null,
            } });
            // Show result panel
            root.querySelector<HTMLElement>("#sell-form")!.style.display = "none";
            root.querySelector<HTMLElement>("#sell-result")!.style.display = "block";
            setText(root, "r-cust", `${name} · ${phone}`);
            setText(root, "r-plan", `${res.plan_name} · ${fmt(Number(res.price), res.currency)}`);
            setText(root, "r-code", res.code);
            setText(root, "r-exp", `Valid until: ${new Date(res.expires_at).toLocaleString()}`);
            const smsEl = root.querySelector<HTMLElement>("#r-sms");
            if (smsEl) smsEl.textContent = `Dear ${name}, your code is ${res.code}. Plan: ${res.plan_name}. Valid until ${new Date(res.expires_at).toLocaleDateString()}.`;
            qc.invalidateQueries({ queryKey: ["vouchers"] });
            qc.invalidateQueries({ queryKey: ["payments"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
            notify(`Voucher ${res.code} created!`, "success");
          } catch (e) {
            notify((e as Error).message, "error");
          }
        });

        // Reset / Print / SMS buttons in result view
        const result = root.querySelector<HTMLElement>("#sell-result");
        result?.addEventListener("click", (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
          if (!btn) return;
          const t = btn.textContent ?? "";
          if (t.includes("New Sale")) {
            selPlanId = null;
            root.querySelector<HTMLElement>("#sell-form")!.style.display = "block";
            result.style.display = "none";
            setVal(root, "s-name", ""); setVal(root, "s-phone", ""); setVal(root, "s-ref", "");
            renderPlans(); updateSummary();
          } else if (t.includes("Print")) {
            window.print();
          } else if (t.includes("Send SMS")) {
            notify("SMS sending not yet wired — configure in Settings → SMS", "info");
          }
        });
      }}
    />
  );
}
