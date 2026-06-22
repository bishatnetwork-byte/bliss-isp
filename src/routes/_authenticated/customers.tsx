import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listCustomers, upsertCustomer, deleteCustomer } from "@/lib/customers.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — HotspotPro" }] }),
  component: CustomersPage,
});

type Row = { id?: string; full_name: string; phone: string | null; email: string | null; address: string | null; notes: string | null };

function CustomersPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listCustomers);
  const fnSave = useServerFn(upsertCustomer);
  const fnDel = useServerFn(deleteCustomer);
  const { data, isLoading } = useQuery({ queryKey: ["customers"], queryFn: () => fnList() });
  const [edit, setEdit] = useState<Row | null>(null);

  async function save() {
    if (!edit) return;
    try {
      await fnSave({ data: { ...edit, email: edit.email || null } });
      toast.success("Saved"); setEdit(null);
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function remove(id: string) {
    if (!confirm("Delete customer?")) return;
    await fnDel({ data: { id } });
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Customers</h1><p className="text-sm text-muted-foreground">End-users you bill for service.</p></div>
        <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
          <DialogTrigger asChild><Button onClick={() => setEdit({ full_name: "", phone: "", email: "", address: "", notes: "" })}><Plus className="w-4 h-4 mr-1" /> New customer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit?.id ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
            {edit && <div className="space-y-3">
              <div><Label>Full name</Label><Input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Phone</Label><Input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              </div>
              <div><Label>Address</Label><Input value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
              <div><Label>Notes</Label><Input value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            </div>}
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border"><tr><th className="p-3">Name</th><th>Phone</th><th>Email</th><th>Address</th><th></th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {data?.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No customers yet.</td></tr>}
              {data?.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3 font-medium">{c.full_name}</td>
                  <td>{c.phone ?? "—"}</td>
                  <td>{c.email ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">{c.address ?? "—"}</td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(c as Row)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="w-4 h-4" /></Button>
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
