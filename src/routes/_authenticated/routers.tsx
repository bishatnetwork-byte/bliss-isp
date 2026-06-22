import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listRouters, upsertRouter, deleteRouter, testRouter } from "@/lib/routers.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/routers")({
  head: () => ({ meta: [{ title: "Routers — HotspotPro" }] }),
  component: RoutersPage,
});

type Row = { id: string; name: string; host: string; port: number; username: string; use_tls: boolean; status: string; last_seen: string | null; notes: string | null };

function RoutersPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listRouters);
  const fnSave = useServerFn(upsertRouter);
  const fnDel = useServerFn(deleteRouter);
  const fnTest = useServerFn(testRouter);
  const { data, isLoading } = useQuery({ queryKey: ["routers"], queryFn: () => fnList() });
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [pwd, setPwd] = useState("");

  async function save() {
    if (!editing) return;
    try {
      await fnSave({ data: {
        id: editing.id,
        name: editing.name ?? "",
        host: editing.host ?? "",
        port: editing.port ?? 443,
        username: editing.username ?? "admin",
        use_tls: editing.use_tls ?? true,
        notes: editing.notes ?? null,
        password: pwd || undefined,
      }});
      toast.success("Router saved");
      setEditing(null); setPwd("");
      qc.invalidateQueries({ queryKey: ["routers"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete router?")) return;
    await fnDel({ data: { id } });
    qc.invalidateQueries({ queryKey: ["routers"] });
  }

  async function test(id: string) {
    toast.info("Pinging router…");
    const res = await fnTest({ data: { id } });
    if (res.ok) toast.success("Router online");
    else toast.error(res.error ?? "Failed");
    qc.invalidateQueries({ queryKey: ["routers"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Routers</h1>
          <p className="text-sm text-muted-foreground">MikroTik devices managed via RouterOS REST API.</p>
        </div>
        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setPwd(""); } }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ port: 443, use_tls: true, username: "admin" })}>
              <Plus className="w-4 h-4 mr-1" /> Add router
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing?.id ? "Edit router" : "Add router"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing!, name: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><Label>Host (IP or DNS)</Label><Input value={editing?.host ?? ""} onChange={(e) => setEditing({ ...editing!, host: e.target.value })} /></div>
                <div><Label>Port</Label><Input type="number" value={editing?.port ?? 443} onChange={(e) => setEditing({ ...editing!, port: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Username</Label><Input value={editing?.username ?? ""} onChange={(e) => setEditing({ ...editing!, username: e.target.value })} /></div>
              <div><Label>Password {editing?.id && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
              <div className="flex items-center gap-2"><Switch checked={editing?.use_tls ?? true} onCheckedChange={(v) => setEditing({ ...editing!, use_tls: v })} /><Label>Use HTTPS (TLS)</Label></div>
              <p className="text-xs text-muted-foreground">RouterOS v7.1+ required. Enable <code>/ip/service www-ssl</code> on the router and ensure it's reachable.</p>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border">
              <tr><th className="p-3">Name</th><th>Host</th><th>Status</th><th>Last seen</th><th></th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {data?.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No routers yet. Add one to get started.</td></tr>}
              {data?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="font-mono text-xs">{r.use_tls ? "https" : "http"}://{r.host}:{r.port}</td>
                  <td><Badge variant={r.status === "online" ? "default" : "secondary"} className="capitalize">{r.status}</Badge></td>
                  <td className="text-xs text-muted-foreground">{r.last_seen ? new Date(r.last_seen).toLocaleString() : "—"}</td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => test(r.id)}><Wifi className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r as Row); setPwd(""); }}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
