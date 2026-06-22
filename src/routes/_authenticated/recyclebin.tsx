import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/recyclebin.html?raw";
import { listRecycleBin, restoreVoucher, purgeVoucher } from "@/lib/settings.functions";
import { setHTML, esc, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/recyclebin")({
  component: RecycleBinPage,
});

function RecycleBinPage() {
  const qc = useQueryClient();
  const lst = useServerFn(listRecycleBin);
  const rest = useServerFn(restoreVoucher);
  const purge = useServerFn(purgeVoucher);

  const { data: items } = useQuery({ queryKey: ["recycle-bin"], queryFn: () => lst() });

  return (
    <MockupPage
      title="Recycle Bin"
      html={html}
      deps={[items]}
      hydrate={(root) => {
        const list = items ?? [];
        setHTML(root, "bin-tbody", list.length ? list.map(v => `<tr>
          <td>${esc(v.code)}</td>
          <td>${esc((v.plans as { name?: string } | null)?.name ?? "—")}</td>
          <td>${esc(v.status)}</td>
          <td>${v.deleted_at ? new Date(v.deleted_at).toLocaleString() : "—"}</td>
          <td>
            <button class="btn btn-sm" data-rest="${esc(v.id)}">Restore</button>
            <button class="btn btn-sm btn-danger" data-purge="${esc(v.id)}">Purge</button>
          </td>
        </tr>`).join("") : `<tr><td colspan="5"><div class="empty">Recycle bin is empty</div></td></tr>`);

        root.querySelectorAll<HTMLButtonElement>("[data-rest]").forEach(b =>
          b.addEventListener("click", async () => {
            try { await rest({ data: { id: b.dataset.rest! } }); notify("Restored", "success"); qc.invalidateQueries({ queryKey: ["recycle-bin"] }); qc.invalidateQueries({ queryKey: ["vouchers"] }); }
            catch (e) { notify((e as Error).message, "error"); }
          }));
        root.querySelectorAll<HTMLButtonElement>("[data-purge]").forEach(b =>
          b.addEventListener("click", async () => {
            if (!confirm("Permanently delete?")) return;
            try { await purge({ data: { id: b.dataset.purge! } }); notify("Purged", "success"); qc.invalidateQueries({ queryKey: ["recycle-bin"] }); }
            catch (e) { notify((e as Error).message, "error"); }
          }));
      }}
    />
  );
}
