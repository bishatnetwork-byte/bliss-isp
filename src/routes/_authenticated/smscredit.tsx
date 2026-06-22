import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/smscredit.html?raw";
import { getWallet, getFeeSettings } from "@/lib/wallet.functions";
import { buySmsCredits, listSmsPurchases } from "@/lib/sms.functions";
import { setText, setHTML, getVal, on, esc, fmt, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/smscredit")({
  component: SmsCreditPage,
});

function SmsCreditPage() {
  const qc = useQueryClient();
  const w = useServerFn(getWallet);
  const f = useServerFn(getFeeSettings);
  const buy = useServerFn(buySmsCredits);
  const hist = useServerFn(listSmsPurchases);

  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: () => w(), refetchInterval: 15000 });
  const { data: fees } = useQuery({ queryKey: ["fees"], queryFn: () => f() });
  const { data: purchases } = useQuery({ queryKey: ["sms-purchases"], queryFn: () => hist() });

  return (
    <MockupPage
      title="SMS Credit"
      html={html}
      deps={[wallet, fees, purchases]}
      hydrate={(root) => {
        setText(root, "sms-balance", (wallet?.sms_credits ?? 0).toLocaleString());
        setText(root, "wallet-bal-display", Number(wallet?.balance ?? 0).toLocaleString());
        setText(root, "sms-sent-total", "—");
        setText(root, "sms-sent-today", "—");

        const price = Number(fees?.sms_price_per_credit ?? 1);
        setText(root, "sms-cost-display", `${price} per SMS`);

        // Top-up method toggle (Mobile Money / Main Wallet)
        const momoFields = root.querySelector<HTMLElement>("#credit-momo-fields");
        const walFields = root.querySelector<HTMLElement>("#credit-wallet-fields");
        root.querySelectorAll<HTMLElement>("[data-cm]").forEach(opt => {
          opt.removeAttribute("onclick");
          opt.addEventListener("click", () => {
            const m = opt.dataset.cm;
            root.querySelectorAll<HTMLElement>("[data-cm]").forEach(o => o.classList.toggle("sel", o === opt));
            if (momoFields) momoFields.style.display = m === "momo" ? "" : "none";
            if (walFields) walFields.style.display = m === "wallet" ? "" : "none";
          });
        });

        const recalcMomo = () => {
          const amt = Number(getVal(root, "cr-momo-amount")) || 0;
          const credits = Math.floor(amt / price);
          const el = root.querySelector<HTMLElement>("#cr-momo-calc");
          if (el) el.style.display = amt > 0 ? "" : "none";
          setText(root, "cr-momo-calc-text", `${credits.toLocaleString()} credits`);
        };
        const recalcWal = () => {
          const amt = Number(getVal(root, "cr-wal-amount")) || 0;
          const credits = Math.floor(amt / price);
          const el = root.querySelector<HTMLElement>("#cr-wal-calc");
          if (el) el.style.display = amt > 0 ? "" : "none";
          setText(root, "cr-wal-calc-text", `${credits.toLocaleString()} credits`);
        };
        on(root, "cr-momo-amount", "input", recalcMomo);
        on(root, "cr-wal-amount", "input", recalcWal);
        recalcMomo(); recalcWal();


        on(root, "cr-wal-btn", "click", async () => {
          const amt = Number(getVal(root, "cr-wal-amount")) || 0;
          const credits = Math.floor(amt / price);
          if (credits < 1) return notify("Enter a valid amount", "warning");
          try {
            await buy({ data: { credits, payment_method: "wallet" } });
            notify(`Purchased ${credits} SMS credits`, "success");
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["sms-purchases"] });
          } catch (e) { notify((e as Error).message, "error"); }
        });

        on(root, "cr-momo-btn", "click", async () => {
          const amt = Number(getVal(root, "cr-momo-amount")) || 0;
          const credits = Math.floor(amt / price);
          if (credits < 1) return notify("Enter a valid amount", "warning");
          try {
            await buy({ data: { credits, payment_method: "mpesa" } });
            notify(`Purchased ${credits} SMS credits via M-Pesa`, "success");
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["sms-purchases"] });
          } catch (e) { notify((e as Error).message, "error"); }
        });

        const rows = (purchases ?? []).map(p => `<tr>
          <td>${new Date(p.created_at).toLocaleString()}</td>
          <td>${p.credits.toLocaleString()}</td>
          <td>${fmt(Number(p.amount))}</td>
          <td>${esc(p.payment_method)}</td>
          <td><span class="badge bg-green">${esc(p.status)}</span></td>
        </tr>`).join("");
        setHTML(root, "credit-history-tbody", rows || `<tr><td colspan="5"><div class="empty">No purchases yet</div></td></tr>`);
      }}
    />
  );
}
