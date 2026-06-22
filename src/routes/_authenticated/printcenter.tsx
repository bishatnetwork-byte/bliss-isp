import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listBatches, listBatchVouchers, markBatchPrinted } from "@/lib/vouchers.functions";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/printcenter.html?raw";
import { setHTML, esc, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/printcenter")({
  component: PrintCenterPage,
});

function PrintCenterPage() {
  const qc = useQueryClient();
  const batchesFn = useServerFn(listBatches);
  const vouchersFn = useServerFn(listBatchVouchers);
  const markFn = useServerFn(markBatchPrinted);

  const { data: batches } = useQuery({ queryKey: ["print-batches"], queryFn: () => batchesFn() });
  const [preview, setPreview] = useState<{ batch_id: string; codes: { code: string; plan: string }[] } | null>(null);

  return (
    <MockupPage
      title="Print Center"
      html={html}
      deps={[batches, preview]}
      hydrate={(root) => {
        const list = batches ?? [];
        // History table
        setHTML(root, "pc-history-tbody", list.length
          ? list.map(b => `<tr>
              <td><strong>${esc(b.label ?? b.plan_name ?? "Batch")}</strong><br><span class="muted">${esc(b.plan_name ?? "")}</span></td>
              <td>${b.qty}</td>
              <td>${b.printed_count ?? 0}</td>
              <td>${b.last_printed_at ? new Date(b.last_printed_at).toLocaleString() : "—"}</td>
              <td>
                <button class="btn btn-sm" data-reprint="${esc(b.batch_id ?? "")}">Reprint</button>
                <button class="btn btn-sm btn-ghost" data-marked="${esc(b.id)}" data-qty="${b.qty}">Mark printed</button>
              </td>
            </tr>`).join("")
          : `<tr><td colspan="5"><div class="empty">No batches yet — generate one from Vouchers.</div></td></tr>`);
        const empty = root.querySelector<HTMLElement>("#pc-history-empty");
        if (empty) empty.style.display = list.length ? "none" : "";

        // Reprint preview
        const wrap = root.querySelector<HTMLElement>("#pc-preview-wrap");
        const count = root.querySelector<HTMLElement>("#pc-preview-count");
        if (wrap && count) {
          if (preview) {
            count.textContent = `${preview.codes.length} tickets`;
            wrap.innerHTML = preview.codes.map(c => `
              <div style="background:#fff;border:1px dashed #cbd5e1;border-radius:8px;padding:14px 18px;min-width:160px;text-align:center">
                <div style="font-size:11px;color:#64748b;margin-bottom:4px">${esc(c.plan)}</div>
                <div style="font-family:ui-monospace,monospace;font-weight:700;font-size:18px;letter-spacing:2px">${esc(c.code)}</div>
              </div>`).join("");
          } else {
            count.textContent = "0 tickets";
            wrap.innerHTML = `<div class="muted" style="padding:32px;text-align:center;width:100%">Click <b>Reprint</b> on a batch to preview tickets.</div>`;
          }
        }

        root.querySelectorAll<HTMLButtonElement>("[data-reprint]").forEach(btn =>
          btn.addEventListener("click", async () => {
            const id = btn.dataset.reprint!;
            if (!id) return;
            try {
              const rows = await vouchersFn({ data: { batch_id: id } });
              setPreview({
                batch_id: id,
                codes: rows.map(r => ({
                  code: r.code as string,
                  plan: (r.plans as { name?: string } | null)?.name ?? "",
                })),
              });
              notify(`Loaded ${rows.length} vouchers`, "success");
            } catch (e) { notify((e as Error).message, "error"); }
          }));

        root.querySelectorAll<HTMLButtonElement>("[data-marked]").forEach(btn =>
          btn.addEventListener("click", async () => {
            const id = btn.dataset.marked!;
            const qty = Number(btn.dataset.qty ?? 0);
            try {
              await markFn({ data: { batch_id: id, count: qty } });
              notify("Marked printed", "success");
              qc.invalidateQueries({ queryKey: ["print-batches"] });
            } catch (e) { notify((e as Error).message, "error"); }
          }));

        const openPdf = () => {
          if (!preview || !preview.codes.length) return notify("Load a batch first", "warning");
          const tickets = preview.codes.map(c => `
            <div class="t">
              <div class="p">${esc(c.plan)}</div>
              <div class="c">${esc(c.code)}</div>
            </div>`).join("");
          const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Vouchers ${esc(preview.batch_id)}</title>
            <style>
              @page { size: A4; margin: 10mm; }
              body { font-family: system-ui, sans-serif; margin: 0; }
              .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
              .t { border: 1.5px dashed #94a3b8; border-radius: 8px; padding: 10mm 6mm; text-align: center; page-break-inside: avoid; }
              .p { font-size: 11px; color: #475569; margin-bottom: 4mm; text-transform: uppercase; letter-spacing: 1px; }
              .c { font-family: ui-monospace, monospace; font-weight: 700; font-size: 20px; letter-spacing: 3px; }
            </style></head>
            <body><div class="grid">${tickets}</div>
            <script>window.onload=()=>window.print()</script>
            </body></html>`;
          const w = window.open("", "_blank");
          if (!w) return notify("Allow popups to download PDF", "error");
          w.document.write(doc); w.document.close();
        };

        const printBtn = root.querySelector<HTMLButtonElement>("#pc-print-btn, [data-action=print]");
        if (printBtn) printBtn.onclick = openPdf;
        const pdfBtn = root.querySelector<HTMLButtonElement>("#pc-pdf-btn, [data-action=pdf]");
        if (pdfBtn) pdfBtn.onclick = openPdf;

        // Inject PDF button into the preview header if missing
        const headerCount = root.querySelector<HTMLElement>("#pc-preview-count");
        if (headerCount && !root.querySelector("#pc-pdf-btn")) {
          const b = document.createElement("button");
          b.id = "pc-pdf-btn";
          b.className = "btn btn-sm btn-primary";
          b.style.marginLeft = "8px";
          b.textContent = "Download PDF";
          b.onclick = openPdf;
          headerCount.parentElement?.appendChild(b);
        }
      }}
    />
  );
}
