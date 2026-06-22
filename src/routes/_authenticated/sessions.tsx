import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSessions } from "@/lib/billing.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({ meta: [{ title: "Sessions — HotspotPro" }] }),
  component: SessionsPage,
});

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function SessionsPage() {
  const fn = useServerFn(listSessions);
  const { data, isLoading } = useQuery({ queryKey: ["sessions"], queryFn: () => fn() });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Hotspot Sessions</h1>
        <p className="text-sm text-muted-foreground">Cached from routers. Active sync coming in the next phase.</p>
      </div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border"><tr><th className="p-3">User</th><th>Router</th><th>IP / MAC</th><th>Uptime</th><th>Data</th><th>Status</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No sessions yet.</td></tr>}
              {data?.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3 font-medium">{s.username ?? "—"}</td>
                  <td>{s.routers?.name ?? "—"}</td>
                  <td className="font-mono text-xs">{s.ip ?? "—"}<br />{s.mac ?? ""}</td>
                  <td>{Math.round((s.uptime_seconds ?? 0) / 60)} min</td>
                  <td className="text-xs">{fmtBytes(Number(s.bytes_in ?? 0))} ↓ {fmtBytes(Number(s.bytes_out ?? 0))} ↑</td>
                  <td>{s.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Ended</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
