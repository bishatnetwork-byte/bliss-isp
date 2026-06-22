import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/mikrotiks.html?raw";
import { listRouters, upsertRouter, deleteRouter, testRouter } from "@/lib/routers.functions";
import { probeAllRouters } from "@/lib/router-health.functions";
import { setHTML, esc, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/mikrotiks")({ component: MikrotiksPage });

const CMD_REF = `# Enable REST/HTTPS API on MikroTik (RouterOS v7+)
/ip service set www-ssl disabled=no port=443
/certificate add name=local-ssl common-name=router.local key-usage=tls-server
/certificate sign local-ssl
/ip service set www-ssl certificate=local-ssl
# Create read-write user for HotspotPro
/user add name=hotspotpro password=CHANGE_ME group=full`;

function MikrotiksPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRouters);
  const saveFn = useServerFn(upsertRouter);
  const delFn = useServerFn(deleteRouter);
  const testFn = useServerFn(testRouter);
  const probeAllFn = useServerFn(probeAllRouters);
  const { data: routers } = useQuery({ queryKey: ["routers"], queryFn: () => listFn(), refetchInterval: 60_000 });

  return (
    <MockupPage
      title="MikroTiks"
      html={html}
      deps={[routers]}
      hydrate={(root) => {
        const list = routers ?? [];
        const cmdRef = root.querySelector<HTMLElement>("#mk-cmd-ref");
        if (cmdRef) cmdRef.textContent = CMD_REF;

        const headerBar = root.querySelector<HTMLElement>("#mk-devices-list");
        if (headerBar && !root.querySelector("#mk-probe-all")) {
          const bar = document.createElement("div");
          bar.style.cssText = "display:flex;justify-content:flex-end;margin-bottom:10px";
          bar.innerHTML = '<button id="mk-probe-all" class="btn btn-s btn-sm">🔄 Probe all routers</button>';
          headerBar.parentElement?.insertBefore(bar, headerBar);
          bar.querySelector("button")!.addEventListener("click", async (e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.disabled = true; btn.textContent = "Probing…";
            try {
              const res = await probeAllFn();
              const okN = res.results.filter(r => r.ok).length;
              notify(`Probed ${res.count} — ${okN} online, ${res.count - okN} offline`, okN === res.count ? "success" : "info");
              qc.invalidateQueries({ queryKey: ["routers"] });
            } catch (err) {
              notify((err as Error).message, "error");
            } finally {
              btn.disabled = false; btn.textContent = "🔄 Probe all routers";
            }
          });
        }

        setHTML(root, "mk-devices-list", list.length ? list.map(r => {
          const online = r.status === "online";
          const badge = online ? "bg-green" : r.status === "error" ? "bg-red" : "bg-yellow";
          return `<div class="card" data-id="${r.id}">
            <div class="card-hd"><span class="card-title">📡 ${esc(r.name)}</span>
              <span class="badge ${badge}">${esc(r.status ?? "unknown")}</span></div>
            <div class="card-body">
              <div class="fg c2" style="font-size:12px">
                <div><div class="fhint">Host</div><div>${esc(r.host)}:${r.port}</div></div>
                <div><div class="fhint">User</div><div>${esc(r.username)}</div></div>
                <div><div class="fhint">TLS</div><div>${r.use_tls ? "Yes" : "No"}</div></div>
                <div><div class="fhint">Last seen</div><div>${r.last_seen ? new Date(r.last_seen).toLocaleString() : "—"}</div></div>
              </div>
              <div class="btn-row" style="margin-top:12px">
                <button class="btn btn-p btn-sm" data-act="test">🔌 Test Connection</button>
                <button class="btn btn-r btn-sm" data-act="delete">🗑 Delete</button>
              </div>
            </div>
          </div>`;
        }).join("") : '<div class="empty"><span class="empty-ico">📡</span>No routers yet — click "Add Existing Router"</div>');

        // Action buttons
        root.querySelector("#mk-devices-list")?.addEventListener("click", async (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
          if (!btn) return;
          const id = btn.closest<HTMLElement>("[data-id]")?.dataset.id;
          if (!id) return;
          try {
            if (btn.dataset.act === "test") {
              btn.disabled = true; btn.textContent = "Testing…";
              const res = await testFn({ data: { id } });
              notify(res.ok ? "Router online ✓" : `Failed: ${res.error}`, res.ok ? "success" : "error");
              qc.invalidateQueries({ queryKey: ["routers"] });
            } else if (btn.dataset.act === "delete") {
              if (!confirm("Delete this router?")) return;
              await delFn({ data: { id } });
              notify("Deleted", "success");
              qc.invalidateQueries({ queryKey: ["routers"] });
            }
          } catch (err) {
            notify((err as Error).message, "error");
          }
        });

        // Add router buttons (open a simple prompt-based flow for now)
        const promptAdd = async () => {
          const name = prompt("Router name (e.g. Main Office)"); if (!name) return;
          const host = prompt("Host / IP address"); if (!host) return;
          const portStr = prompt("Port (default 443)", "443") || "443";
          const username = prompt("Username", "admin") || "admin";
          const password = prompt("Password"); if (!password) return;
          try {
            await saveFn({ data: { name, host, port: parseInt(portStr, 10), username, password, use_tls: true } });
            notify("Router added", "success");
            qc.invalidateQueries({ queryKey: ["routers"] });
          } catch (err) {
            notify((err as Error).message, "error");
          }
        };
        root.querySelectorAll<HTMLButtonElement>(".btn.btn-p, .btn.btn-v").forEach(b => {
          if (b.textContent?.includes("Add")) b.addEventListener("click", promptAdd);
        });
      }}
    />
  );
}
