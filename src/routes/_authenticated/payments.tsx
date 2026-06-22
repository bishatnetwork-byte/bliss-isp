import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPayments, recordPayment } from "@/lib/billing.functions";
import { listCustomers } from "@/lib/customers.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments — HotspotPro" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listPayments);
  const fnSave = useServerFn(recordPayment);
  const fnCust = useServerFn(listCustomers);
  const { data, isLoading } = useQuery({ queryKey: ["payments"], queryFn: () => fn() });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => fnCust() });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ customer_id: "", amount: 0, method: "manual" as const, reference: "" });

  async function save() {
    try {
      await fnSave({ data: {
        customer_id: f.customer_id || null, amount: f.amount,
        method: f.method, reference: f.reference || null, status: "success",
      }});
      toast.success("Payment recorded"); setOpen(false);
      qc.invalidateQueries({ queryKey: ["payments"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Payments</h1><p className="text-sm text-muted-foreground">M-Pesa, manual, and gateway payments.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> Record payment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record manual payment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Customer</Label>
                <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Amount (KES)</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></div>
              <div><Label>Method</Label>
                <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v as typeof f.method })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reference</Label><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="M-Pesa receipt / txn id" /></div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border"><tr><th className="p-3">Date</th><th>Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No payments yet.</td></tr>}
              {data?.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3 text-xs">{new Date(p.created_at).toLocaleString()}</td>
                  <td>{p.customers?.full_name ?? "—"}</td>
                  <td>{p.currency} {Number(p.amount).toLocaleString()}</td>
                  <td className="capitalize">{p.method}</td>
                  <td className="font-mono text-xs">{p.reference ?? "—"}</td>
                  <td><Badge variant={p.status === "success" ? "default" : "secondary"} className="capitalize">{p.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
