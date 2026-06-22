import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, setUserRole } from "@/lib/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — HotspotPro" }] }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listUsers);
  const fnSet = useServerFn(setUserRole);
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => fn() });

  async function changeRole(user_id: string, role: "admin" | "operator" | "viewer") {
    try {
      await fnSet({ data: { user_id, role } });
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Users & Roles</h1><p className="text-sm text-muted-foreground">Manage team members. Only admins can change roles.</p></div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border"><tr><th className="p-3">Name</th><th>Phone</th><th>Joined</th><th>Role</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {data?.map((u) => {
                const rolesArr = u.user_roles as unknown as Array<{ role: string }> | null;
                const role = (rolesArr?.[0]?.role ?? "viewer") as "admin" | "operator" | "viewer";
                return (
                  <tr key={u.id} className="border-t border-border">
                    <td className="p-3 font-medium">{u.display_name ?? "—"}</td>
                    <td>{u.phone ?? "—"}</td>
                    <td className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      <Select value={role} onValueChange={(v) => changeRole(u.id, v as never)}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
