import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/withdraw.html?raw";
import { getWallet, getFeeSettings } from "@/lib/wallet.functions";
import { listWithdrawals, requestWithdrawal } from "@/lib/withdrawals.functions";
import { setText, setHTML, getVal, on, esc, fmt, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/withdraw")({
  component: WithdrawPage,
});

function WithdrawPage() {
  const qc = useQueryClient();
  const w = useServerFn(getWallet);
  const f = useServerFn(getFeeSettings);
  const lst = useServerFn(listWithdrawals);
  const req = useServerFn(requestWithdrawal);

  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: () => w(), refetchInterval: 15000 });
  const { data: fees } = useQuery({ queryKey: ["fees"], queryFn: () => f() });
  const { data: withdrawals } = useQuery({ queryKey: ["withdrawals"], queryFn: () => lst() });

  return (
    <MockupPage
      title="Withdraw"
      html={html}
      deps={[wallet, fees, withdrawals]}
      hydrate={(root) => {
        const bal = Number(wallet?.balance ?? 0);
        setText(root, "wd-balance", fmt(bal));
        const pct = Number(fees?.withdraw_fee_pct ?? 0);
        const flat = Number(fees?.withdraw_fee_flat ?? 0);
        setText(root, "wd-fee-note", `Fee: ${pct}% + ${fmt(flat)} flat per withdrawal · Min ${fmt(Number(fees?.min_withdraw ?? 0))}`);

        const recalc = () => {
          const amt = Number(getVal(root, "wd-amount")) || 0;
          const fee = amt * pct / 100 + flat;
          const net = Math.max(0, amt - fee);
          setText(root, "wd-calc-text", `Fee ${fmt(fee)} · You receive ${fmt(net)}`);
        };
        on(root, "wd-amount", "input", recalc);
        recalc();

        on(root, "wd-submit-btn", "click", async () => {
          const amount = Number(getVal(root, "wd-amount"));
          const phone = getVal(root, "wd-phone");
          if (!amount || !phone) return notify("Amount and destination required", "warning");
          try {
            await req({ data: { amount, method: "mpesa", destination: phone } });
            notify("Withdrawal requested", "success");
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["withdrawals"] });
          } catch (e) { notify((e as Error).message, "error"); }
        });

        const list = withdrawals ?? [];
        const ok = list.filter(x => x.status === "completed").length;
        const fail = list.filter(x => x.status === "failed").length;
        setText(root, "wd-attempt-summary", `${list.length} total · ${ok} completed · ${fail} failed`);

        setHTML(root, "wd-tbody", list.length ? list.map(x => {
          const cls = x.status === "completed" ? "bg-green" : x.status === "failed" ? "bg-red" : "bg-yellow";
          return `<tr>
            <td>${new Date(x.created_at).toLocaleString()}</td>
            <td>${esc(x.method)}</td><td>${esc(x.destination)}</td>
            <td>${fmt(Number(x.amount))}</td><td>${fmt(Number(x.fee))}</td>
            <td>${fmt(Number(x.net))}</td>
            <td><span class="badge ${cls}">${esc(x.status)}</span></td>
            <td>${esc(x.reference ?? "—")}</td>
          </tr>`;
        }).join("") : `<tr><td colspan="8"><div class="empty">No withdrawals yet</div></td></tr>`);
      }}
    />
  );
}
