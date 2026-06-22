import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/wifiprices.html?raw";
import { listPlans, upsertPlan, deletePlan } from "@/lib/plans.functions";
import { setHTML, setText, setVal, getVal, on, esc, fmt, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/wifiprices")({ component: WifiPricesPage });

function parseDuration(s: string): number {
  // Accept "24h", "7d", "30m"
  const m = s.trim().match(/^(\d+)\s*([dhm])?$/i);
  if (!m) return 1440;
  const n = parseInt(m[1], 10);
  const u = (m[2] ?? "h").toLowerCase();
  return u === "d" ? n * 1440 : u === "m" ? n : n * 60;
}
function fmtDur(mins: number) {
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}
function parseSpeed(s: string): { down: number; up: number } {
  // "10M/10M" → kbps
  const m = s.trim().match(/^(\d+)\s*M\/(\d+)\s*M$/i);
  if (m) return { down: parseInt(m[1], 10) * 1000, up: parseInt(m[2], 10) * 1000 };
  return { down: 0, up: 0 };
}
function fmtSpeed(d: number | null, u: number | null) {
  if (!d && !u) return "—";
  return `${Math.round((d ?? 0) / 1000)}M/${Math.round((u ?? 0) / 1000)}M`;
}

function WifiPricesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlans);
  const saveFn = useServerFn(upsertPlan);
  const delFn = useServerFn(deletePlan);
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => listFn() });

  return (
    <MockupPage
      title="WiFi Prices"
      html={html}
      deps={[plans]}
      hydrate={(root) => {
        const list = plans ?? [];
        setText(root, "plan-count-badge", `${list.length} plan${list.length !== 1 ? "s" : ""}`);

        setHTML(root, "plans-tbl", list.length ? list.map(p => `
          <tr data-id="${p.id}">
            <td><strong>${esc(p.name)}</strong><div style="font-size:10px;color:var(--t4)">${esc(p.description ?? "")}</div></td>
            <td>${fmt(Number(p.price), p.currency)}</td>
            <td>${fmtDur(p.duration_minutes)}</td>
            <td>${fmtSpeed(p.rate_limit_down_kbps, p.rate_limit_up_kbps)}</td>
            <td>—</td>
            <td>
              <button class="btn btn-s btn-sm" data-act="edit">✏️</button>
              <button class="btn btn-r btn-sm" data-act="delete">🗑</button>
            </td>
          </tr>`).join("") : '<tr><td colspan="6"><div class="empty">No plans yet</div></td></tr>');

        setHTML(root, "plan-portal-preview", list.filter(p => p.is_public).map(p => `
          <div class="plan-card"><div class="plan-price">${Math.round(Number(p.price)).toLocaleString()}</div>
            <div class="plan-nm">${esc(p.name)}</div>
            <div class="plan-spd">${fmtDur(p.duration_minutes)} · ${fmtSpeed(p.rate_limit_down_kbps, p.rate_limit_up_kbps)}</div></div>`).join("") ||
          '<div class="empty">No public plans</div>');

        const clearForm = () => {
          ["ep-id", "ep-name", "ep-price", "ep-duration", "ep-speed", "ep-profile", "ep-desc"].forEach(id => setVal(root, id, ""));
          setVal(root, "ep-color", "#3b82f6");
        };

        on(root, "ep-save-btn", "click", async () => {
          const id = getVal(root, "ep-id");
          const name = getVal(root, "ep-name");
          const price = parseFloat(getVal(root, "ep-price") || "0");
          const duration_minutes = parseDuration(getVal(root, "ep-duration") || "24h");
          const speed = parseSpeed(getVal(root, "ep-speed") || "");
          if (!name) return notify("Plan name is required", "warning");
          try {
            await saveFn({ data: {
              id: id || undefined, name, price, currency: "UGX",
              duration_minutes, rate_limit_down_kbps: speed.down || null,
              rate_limit_up_kbps: speed.up || null, shared_users: 1,
              description: getVal(root, "ep-desc") || null,
              is_active: true, is_public: true,
            } });
            notify(id ? "Plan updated" : "Plan saved", "success");
            clearForm();
            qc.invalidateQueries({ queryKey: ["plans"] });
          } catch (e) {
            notify((e as Error).message, "error");
          }
        });

        root.querySelectorAll<HTMLButtonElement>("button.btn-s").forEach(b => {
          if (b.textContent?.includes("Clear")) b.addEventListener("click", clearForm);
        });

        root.querySelector("#plans-tbl")?.addEventListener("click", async (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
          if (!btn) return;
          const id = btn.closest<HTMLElement>("[data-id]")?.dataset.id;
          if (!id) return;
          const plan = list.find(p => p.id === id);
          if (!plan) return;
          if (btn.dataset.act === "edit") {
            setVal(root, "ep-id", plan.id);
            setVal(root, "ep-name", plan.name);
            setVal(root, "ep-price", String(plan.price));
            setVal(root, "ep-duration", fmtDur(plan.duration_minutes));
            setVal(root, "ep-speed", fmtSpeed(plan.rate_limit_down_kbps, plan.rate_limit_up_kbps).replace("—", ""));
            setVal(root, "ep-desc", plan.description ?? "");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (btn.dataset.act === "delete") {
            if (!confirm(`Delete plan "${plan.name}"?`)) return;
            try {
              await delFn({ data: { id: plan.id } });
              notify("Deleted", "success");
              qc.invalidateQueries({ queryKey: ["plans"] });
            } catch (err) {
              notify((err as Error).message, "error");
            }
          }
        });
      }}
    />
  );
}
