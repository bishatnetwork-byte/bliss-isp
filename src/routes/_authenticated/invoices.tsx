import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInvoices } from "@/lib/billing.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({ meta: [{ title: "Invoices — HotspotPro" }] }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const fn = useServerFn(listInvoices);
  const { data, isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => fn() });
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Invoices</h1><p className="text-sm text-muted-foreground">All billing records.</p></div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border"><tr><th className="p-3">Number</th><th>Customer</th><th>Amount</th><th>Status</th><th>Due</th><th>Created</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No invoices yet.</td></tr>}
              {data?.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{i.invoice_number}</td>
                  <td>{i.customers?.full_name ?? "—"}</td>
                  <td>{i.currency} {Number(i.amount).toLocaleString()}</td>
                  <td><Badge variant={i.status === "paid" ? "default" : "secondary"} className="capitalize">{i.status}</Badge></td>
                  <td className="text-xs">{i.due_date ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
