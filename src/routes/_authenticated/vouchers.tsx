import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listVouchers, generateVouchers, revokeVoucher } from "@/lib/vouchers.functions";
import { listPlans } from "@/lib/plans.functions";
import { listRouters } from "@/lib/routers.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Ban, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vouchers")({
  head: () => ({ meta: [{ title: "Vouchers — HotspotPro" }] }),
  component: VouchersPage,
});

function VouchersPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listVouchers);
  const fnGen = useServerFn(generateVouchers);
  const fnRev = useServerFn(revokeVoucher);
  const fnPlans = useServerFn(listPlans);
  const fnRouters = useServerFn(listRouters);
  const { data, isLoading } = useQuery({ queryKey: ["vouchers"], queryFn: () => fnList() });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => fnPlans() });
  const { data: routers } = useQuery({ queryKey: ["routers"], queryFn: () => fnRouters() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ batch_name: "", plan_id: "", router_id: "", quantity: 10, length: 8, expires_in_days: 30 });

  async function generate() {
    try {
      const r = await fnGen({ data: {
        batch_name: form.batch_name || `Batch ${new Date().toLocaleDateString()}`,
        plan_id: form.plan_id,
        router_id: form.router_id || null,
        quantity: form.quantity, length: form.length, expires_in_days: form.expires_in_days,
      }});
      toast.success(`Generated ${r.count} vouchers`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["vouchers"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke voucher?")) return;
    await fnRev({ data: { id } });
    qc.invalidateQueries({ queryKey: ["vouchers"] });
  }

  function exportCsv() {
    const rows = (data ?? []).map((v) => `${v.code},${v.status},${v.plans?.name ?? ""},${v.expires_at ?? ""}`);
    const blob = new Blob([`code,status,plan,expires_at\n${rows.join("\n")}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "vouchers.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Vouchers</h1><p className="text-sm text-muted-foreground">Prepaid codes for hotspot access.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> Generate batch</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generate voucher batch</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Batch name</Label><Input value={form.batch_name} onChange={(e) => setForm({ ...form, batch_name: e.target.value })} placeholder="e.g. Friday giveaway" /></div>
                <div><Label>Plan</Label>
                  <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                    <SelectContent>{plans?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.currency} {p.price}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Router (optional)</Label>
                  <Select value={form.router_id} onValueChange={(v) => setForm({ ...form, router_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>{routers?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
                  <div><Label>Code length</Label><Input type="number" value={form.length} onChange={(e) => setForm({ ...form, length: Number(e.target.value) })} /></div>
                  <div><Label>Expires in days</Label><Input type="number" value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: Number(e.target.value) })} /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={generate} disabled={!form.plan_id}>Generate</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border"><tr><th className="p-3">Code</th><th>Plan</th><th>Router</th><th>Status</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No vouchers yet.</td></tr>}
              {data?.map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="p-3 font-mono">{v.code}</td>
                  <td>{v.plans?.name ?? "—"}</td>
                  <td>{v.routers?.name ?? "—"}</td>
                  <td><Badge variant={v.status === "unused" ? "default" : "secondary"} className="capitalize">{v.status}</Badge></td>
                  <td className="text-xs text-muted-foreground">{v.expires_at ? new Date(v.expires_at).toLocaleDateString() : "—"}</td>
                  <td className="text-right pr-3">
                    {v.status === "unused" && <Button size="sm" variant="ghost" onClick={() => revoke(v.id)}><Ban className="w-4 h-4" /></Button>}
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
