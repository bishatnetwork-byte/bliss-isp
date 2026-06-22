import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/clients.html?raw";
import { listSessions } from "@/lib/billing.functions";
import { setText, setHTML, esc } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  const fn = useServerFn(listSessions);
  const { data: sessions } = useQuery({
    queryKey: ["sessions"], queryFn: () => fn(), refetchInterval: 10000,
  });

  return (
    <MockupPage
      title="Live Clients"
      html={html}
      deps={[sessions]}
      hydrate={(root) => {
        const active = (sessions ?? []).filter((s: { ended_at?: string | null }) => !s.ended_at);
        setText(root, "cl-cnt", `${active.length} online`);
        setHTML(root, "cl-tbody", active.length ? active.map((s: {
          username?: string | null; mac_address?: string | null; ip_address?: string | null;
          started_at?: string | null; bytes_in?: number; bytes_out?: number; routers?: { name?: string } | null;
        }) => `<tr>
          <td>${esc(s.username ?? "—")}</td>
          <td>${esc(s.mac_address ?? "—")}</td>
          <td>${esc(s.ip_address ?? "—")}</td>
          <td>${esc(s.routers?.name ?? "—")}</td>
          <td>${s.started_at ? new Date(s.started_at).toLocaleString() : "—"}</td>
          <td>${((s.bytes_in ?? 0) / 1024 / 1024).toFixed(1)} MB ↓ / ${((s.bytes_out ?? 0) / 1024 / 1024).toFixed(1)} MB ↑</td>
        </tr>`).join("") : `<tr><td colspan="6"><div class="empty"><span class="empty-ico">📡</span>No active sessions</div></td></tr>`);
      }}
    />
  );
}
