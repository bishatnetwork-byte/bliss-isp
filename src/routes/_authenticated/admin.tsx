import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/admin.html?raw";
import {
  listTenantMembers,
  inviteTenantMember,
  updateTenantMember,
  removeTenantMember,
} from "@/lib/memberships.functions";
import { useAccess } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Role = "admin" | "staff" | "viewer";

function AdminPage() {
  const { data: access } = useAccess();
  const qc = useQueryClient();
  const listFn = useServerFn(listTenantMembers);
  const inviteFn = useServerFn(inviteTenantMember);
  const updateFn = useServerFn(updateTenantMember);
  const removeFn = useServerFn(removeTenantMember);

  const members = useQuery({
    queryKey: ["tenant-members"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant-members"] });
  const invite = useMutation({ mutationFn: inviteFn, onSuccess: invalidate });
  const update = useMutation({ mutationFn: updateFn, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: removeFn, onSuccess: invalidate });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");

  const canManage =
    access?.isPlatformAdmin || access?.tenantRole === "owner" || access?.tenantRole === "admin";

  useEffect(() => {
    const tbody = document.getElementById("ad-users-tbody");
    if (!tbody) return;
    if (members.isLoading) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--t3)">Loading members…</td></tr>';
      return;
    }
    if (members.isError) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--red)">Error: ${escapeHtml((members.error as Error).message)}</td></tr>`;
      return;
    }
    const data = members.data;
    if (!data) return;
    const rows: string[] = [];
    if (data.owner) {
      rows.push(`<tr>
        <td><b>${escapeHtml(data.owner.display_name ?? "Owner")}</b></td>
        <td>${escapeHtml(data.owner.phone ?? "—")}</td>
        <td><span class="badge bg-purple">Owner</span></td>
        <td>All tabs</td>
        <td><span class="badge bg-green">Active</span></td>
        <td>—</td>
        <td></td>
      </tr>`);
    }
    for (const m of data.members) {
      const tabs = Array.isArray(m.allowed_tabs) && (m.allowed_tabs as unknown[]).length > 0
        ? (m.allowed_tabs as string[]).join(", ")
        : "Role default";
      rows.push(`<tr data-member-id="${m.member_id}">
        <td><b>${escapeHtml(m.profile?.display_name ?? "—")}</b></td>
        <td>${escapeHtml(m.profile?.phone ?? "—")}</td>
        <td>
          <select class="fc fc-sm" data-act="role" ${canManage ? "" : "disabled"}>
            <option value="admin"${m.role === "admin" ? " selected" : ""}>Admin</option>
            <option value="staff"${m.role === "staff" ? " selected" : ""}>Staff</option>
            <option value="viewer"${m.role === "viewer" ? " selected" : ""}>Viewer</option>
          </select>
        </td>
        <td style="font-size:11px;color:var(--t3)">${escapeHtml(tabs)}</td>
        <td><span class="badge bg-green">Active</span></td>
        <td style="font-size:11px;color:var(--t3)">${new Date(m.created_at).toLocaleDateString()}</td>
        <td>${canManage ? '<button class="btn btn-s btn-sm" data-act="remove">Remove</button>' : ""}</td>
      </tr>`);
    }
    if (rows.length === 1) {
      rows.push('<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--t3)">No team members yet — invite one below.</td></tr>');
    }
    tbody.innerHTML = rows.join("");

    if (!canManage) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      const row = target.closest("tr[data-member-id]") as HTMLElement | null;
      if (!row) return;
      const memberId = row.getAttribute("data-member-id")!;
      const act = target.getAttribute("data-act");
      if (act === "remove") {
        if (confirm("Remove this member?")) remove.mutate({ data: { member_id: memberId } });
      } else if (act === "role" && target instanceof HTMLSelectElement) {
        update.mutate({ data: { member_id: memberId, role: target.value as Role } });
      }
    };
    tbody.addEventListener("click", handler);
    tbody.addEventListener("change", handler);
    return () => {
      tbody.removeEventListener("click", handler);
      tbody.removeEventListener("change", handler);
    };
  }, [members.data, members.isLoading, members.isError, members.error, canManage, remove, update]);

  return (
    <>
      <MockupPage title="Admin Panel" html={html} />
      {canManage ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-hd"><span className="card-title">✉️ Invite Team Member</span></div>
          <div className="card-body">
            <div className="fg c2">
              <div className="form-group">
                <label className="fl frq">Email</label>
                <input
                  className="fc"
                  type="email"
                  placeholder="teammate@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="fl">Role</label>
                <select className="fc" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="admin">Admin — full access (no platform admin)</option>
                  <option value="staff">Staff — daily ops, no withdraws/admin</option>
                  <option value="viewer">Viewer — read only</option>
                </select>
              </div>
            </div>
            {invite.isError ? (
              <div className="alert ar" style={{ marginTop: 8 }}>
                {(invite.error as Error).message}
              </div>
            ) : null}
            {invite.isSuccess ? (
              <div className="alert ag" style={{ marginTop: 8 }}>Invite sent / member added.</div>
            ) : null}
            <button
              className="btn btn-p"
              style={{ marginTop: 10 }}
              disabled={!email || invite.isPending}
              onClick={() => {
                invite.mutate(
                  { data: { email, role, allowed_tabs: [] } },
                  { onSuccess: () => setEmail("") },
                );
              }}
            >
              {invite.isPending ? "Inviting…" : "Send Invite"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}
