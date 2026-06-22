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
import { getPlatformOverview, listAuditLogs } from "@/lib/platform.functions";
import { useAccess } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Role = "admin" | "staff" | "viewer";

const TAB_OPTIONS: { value: string; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "sell", label: "Sell / Create" },
  { value: "vouchers", label: "Voucher Manager" },
  { value: "printcenter", label: "Print Center" },
  { value: "captive", label: "Captive Portal" },
  { value: "wifiprices", label: "WiFi Prices" },
  { value: "payments", label: "Payments" },
  { value: "clients", label: "Live Clients" },
  { value: "wifiusers", label: "WiFi Users" },
  { value: "smscredit", label: "SMS Credit" },
  { value: "bulksms", label: "Bulk SMS" },
  { value: "withdraw", label: "Withdraw" },
  { value: "mikrotiks", label: "MikroTik Devices" },
  { value: "reports", label: "Reports" },
  { value: "settings", label: "Settings" },
];

function AdminPage() {
  const { data: access } = useAccess();
  const qc = useQueryClient();
  const listFn = useServerFn(listTenantMembers);
  const inviteFn = useServerFn(inviteTenantMember);
  const updateFn = useServerFn(updateTenantMember);
  const removeFn = useServerFn(removeTenantMember);
  const overviewFn = useServerFn(getPlatformOverview);
  const auditFn = useServerFn(listAuditLogs);

  const members = useQuery({
    queryKey: ["tenant-members"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });
  const overview = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 30_000,
  });
  const audit = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => auditFn({ data: { limit: 100 } }),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant-members"] });
  const invite = useMutation({ mutationFn: inviteFn, onSuccess: invalidate });
  const update = useMutation({ mutationFn: updateFn, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: removeFn, onSuccess: invalidate });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [editing, setEditing] = useState<{ memberId: string; name: string; tabs: string[] } | null>(null);

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
      const tabsList = (m.allowed_tabs as string[] | null) ?? [];
      const tabsLabel = tabsList.length > 0 ? tabsList.join(", ") : "Role default";
      rows.push(`<tr data-member-id="${m.member_id}" data-member-name="${escapeHtml(m.profile?.display_name ?? "Member")}" data-tabs='${escapeHtml(JSON.stringify(tabsList))}'>
        <td><b>${escapeHtml(m.profile?.display_name ?? "—")}</b></td>
        <td>${escapeHtml(m.profile?.phone ?? "—")}</td>
        <td>
          <select class="fc fc-sm" data-act="role" ${canManage ? "" : "disabled"}>
            <option value="admin"${m.role === "admin" ? " selected" : ""}>Admin</option>
            <option value="staff"${m.role === "staff" ? " selected" : ""}>Staff</option>
            <option value="viewer"${m.role === "viewer" ? " selected" : ""}>Viewer</option>
          </select>
        </td>
        <td style="font-size:11px;color:var(--t3)">${escapeHtml(tabsLabel)} ${canManage ? '<button class="btn btn-s btn-sm" data-act="tabs" style="margin-left:6px">Edit</button>' : ""}</td>
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
      } else if (act === "tabs") {
        const name = row.getAttribute("data-member-name") ?? "Member";
        let tabs: string[] = [];
        try { tabs = JSON.parse(row.getAttribute("data-tabs") || "[]"); } catch { /* ignore */ }
        setEditing({ memberId, name, tabs });
      }
    };
    tbody.addEventListener("click", handler);
    tbody.addEventListener("change", handler);
    return () => {
      tbody.removeEventListener("click", handler);
      tbody.removeEventListener("change", handler);
    };
  }, [members.data, members.isLoading, members.isError, members.error, canManage, remove, update]);

  // Hydrate platform fee/wallet cards + fee log
  useEffect(() => {
    const o = overview.data;
    if (!o) return;
    const cur = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;
    setText("ad-platform-bal", cur(o.platformFees.total));
    setText("ad-platform-sub", `Online ${cur(o.platformFees.online)} • Offline ${cur(o.platformFees.offline)} • SMS ${cur(o.platformFees.sms)} • Withdraw ${cur(o.platformFees.withdrawals)}`);
    setText("ad-fee-avail", cur(o.platformFees.available));
    setText("ad-main-wallet", cur(o.wallet.balance));
    setText("ad-sms-wallet", `${o.wallet.smsCredits.toLocaleString()} credits`);
    setText("ad-total-wd", cur(o.wallet.totalWithdrawn));
    setText("ad-net-rev", cur(o.wallet.netRevenue));

    const stats = document.getElementById("ad-fee-stats");
    if (stats) {
      const cards = [
        { lbl: "Online Fees", val: o.platformFees.online, color: "var(--blue)" },
        { lbl: "Offline Fees", val: o.platformFees.offline, color: "var(--green)" },
        { lbl: "SMS Fees", val: o.platformFees.sms, color: "var(--purple)" },
        { lbl: "Paid Out", val: o.platformFees.paidOut, color: "var(--orange)" },
      ];
      stats.innerHTML = cards.map(c => `<div class="card" style="margin-bottom:0">
        <div class="card-body" style="padding:14px">
          <div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${c.lbl}</div>
          <div style="font-size:22px;font-weight:800;color:${c.color};margin-top:4px">${cur(c.val)}</div>
        </div></div>`).join("");
    }

    const log = document.getElementById("ad-fee-log");
    if (log) {
      log.innerHTML = o.feeLog.length ? o.feeLog.slice(0, 100).map(r => `<tr>
        <td><span class="badge ${r.source === "Online" ? "bg-blue" : "bg-green"}">${r.source}</span></td>
        <td>${escapeHtml(r.transaction)}</td>
        <td>${cur(r.gross)}</td>
        <td>${r.rate.toFixed(1)}%</td>
        <td><b>${cur(r.fee)}</b></td>
      </tr>`).join("") : '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--t3)">No fee activity yet</td></tr>';
    }

    const fwd = document.getElementById("fwd-tbody");
    if (fwd) {
      fwd.innerHTML = o.feeWithdrawals.length ? o.feeWithdrawals.map(w => `<tr>
        <td class="mono" style="font-size:11px">${w.id.slice(0, 8)}</td>
        <td><b>${cur(Number(w.amount))}</b></td>
        <td>${escapeHtml(w.method)}</td>
        <td>${escapeHtml(w.destination)}</td>
        <td><span class="badge ${w.status === "completed" ? "bg-green" : w.status === "failed" ? "bg-red" : "bg-blue"}">${w.status}</span></td>
        <td style="font-size:11px;color:var(--t3)">${new Date(w.created_at).toLocaleString()}</td>
      </tr>`).join("") : '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--t3)">No platform-fee withdrawals yet</td></tr>';
    }
  }, [overview.data]);


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
      {editing ? (
        <AllowedTabsModal
          memberName={editing.name}
          initial={editing.tabs}
          onClose={() => setEditing(null)}
          onSave={(tabs) => {
            update.mutate(
              { data: { member_id: editing.memberId, allowed_tabs: tabs } },
              { onSuccess: () => setEditing(null) },
            );
          }}
          saving={update.isPending}
        />
      ) : null}
    </>
  );
}

function AllowedTabsModal({
  memberName,
  initial,
  onClose,
  onSave,
  saving,
}: {
  memberName: string;
  initial: string[];
  onClose: () => void;
  onSave: (tabs: string[]) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const toggle = (v: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 560, width: "100%", margin: 0 }}
      >
        <div className="card-hd">
          <span className="card-title">🔐 Allowed Tabs — {memberName}</span>
          <button className="btn btn-s btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="card-body">
          <div className="fhint" style={{ marginBottom: 10 }}>
            Leave all unchecked to fall back to role defaults. Selected tabs override the role.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
            {TAB_OPTIONS.map((t) => (
              <label key={t.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={selected.has(t.value)}
                  onChange={() => toggle(t.value)}
                />
                {t.label}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
            <button className="btn btn-s" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-p"
              disabled={saving}
              onClick={() => onSave(Array.from(selected))}
            >{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}
