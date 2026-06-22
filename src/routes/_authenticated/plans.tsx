import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPlans, upsertPlan, deletePlan } from "@/lib/plans.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [{ title: "Plans — HotspotPro" }] }),
  component: PlansPage,
});

type Row = { id?: string; name: string; description: string | null; price: number; currency: string; duration_minutes: number; data_limit_mb: number | null; rate_limit_up_kbps: number | null; rate_limit_down_kbps: number | null; shared_users: number; is_active: boolean; is_public: boolean };

const empty: Row = { name: "", description: "", price: 0, currency: "KES", duration_minutes: 60, data_limit_mb: null, rate_limit_up_kbps: null, rate_limit_down_kbps: null, shared_users: 1, is_active: true, is_public: true };

function PlansPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listPlans);
  const fnSave = useServerFn(upsertPlan);
  const fnDel = useServerFn(deletePlan);
  const { data, isLoading } = useQuery({ queryKey: ["plans"], queryFn: () => fnList() });
  const [edit, setEdit] = useState<Row | null>(null);

  async function save() {
    if (!edit) return;
    try {
      await fnSave({ data: edit });
      toast.success("Plan saved"); setEdit(null);
      qc.invalidateQueries({ queryKey: ["plans"] });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function remove(id: string) {
    if (!confirm("Delete plan?")) return;
    await fnDel({ data: { id } });
    qc.invalidateQueries({ queryKey: ["plans"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plans</h1>
          <p className="text-sm text-muted-foreground">Hotspot packages customers can buy or redeem.</p>
        </div>
        <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
          <DialogTrigger asChild><Button onClick={() => setEdit({ ...empty })}><Plus className="w-4 h-4 mr-1" /> New plan</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{edit?.id ? "Edit plan" : "New plan"}</DialogTitle></DialogHeader>
            {edit && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2"><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Description</Label><Input value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
                  <div><Label>Price</Label><Input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></div>
                  <div><Label>Currency</Label><Input value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })} /></div>
                  <div><Label>Duration (minutes)</Label><Input type="number" value={edit.duration_minutes} onChange={(e) => setEdit({ ...edit, duration_minutes: Number(e.target.value) })} /></div>
                  <div><Label>Shared users</Label><Input type="number" value={edit.shared_users} onChange={(e) => setEdit({ ...edit, shared_users: Number(e.target.value) })} /></div>
                  <div><Label>Data limit MB (blank = unlimited)</Label><Input type="number" value={edit.data_limit_mb ?? ""} onChange={(e) => setEdit({ ...edit, data_limit_mb: e.target.value ? Number(e.target.value) : null })} /></div>
                  <div><Label>Rate up kbps</Label><Input type="number" value={edit.rate_limit_up_kbps ?? ""} onChange={(e) => setEdit({ ...edit, rate_limit_up_kbps: e.target.value ? Number(e.target.value) : null })} /></div>
                  <div><Label>Rate down kbps</Label><Input type="number" value={edit.rate_limit_down_kbps ?? ""} onChange={(e) => setEdit({ ...edit, rate_limit_down_kbps: e.target.value ? Number(e.target.value) : null })} /></div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2"><Switch checked={edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} /><Label>Active</Label></div>
                  <div className="flex items-center gap-2"><Switch checked={edit.is_public} onCheckedChange={(v) => setEdit({ ...edit, is_public: v })} /><Label>Show on portal</Label></div>
                </div>
              </div>
            )}
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border">
              <tr><th className="p-3">Plan</th><th>Price</th><th>Duration</th><th>Speed</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No plans yet.</td></tr>}
              {data?.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.description}</div></td>
                  <td>{p.currency} {Number(p.price).toLocaleString()}</td>
                  <td>{p.duration_minutes} min</td>
                  <td className="text-xs">{p.rate_limit_down_kbps ?? "—"}↓ / {p.rate_limit_up_kbps ?? "—"}↑ kbps</td>
                  <td>{p.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(p as Row)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="w-4 h-4" /></Button>
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
