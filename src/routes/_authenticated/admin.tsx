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
import {
  listPlatformGateways,
  savePlatformGateway,
  getPlatformSmsRevenue,
  getPlatformMikrotikOverview,
} from "@/lib/platform-gateways.functions";
import { useAccess } from "@/hooks/useAccess";

const setText = (id: string, v: string | number) => {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v);
};

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
  const [section, setSection] = useState<"all" | "users" | "gateways" | "fees" | "mikrotik">("all");

  // Tag mockup cards into sections so the dropdown can filter them.
  useEffect(() => {
    const root = document.querySelector("[data-mockup-page]") as HTMLElement | null;
    if (!root) return;
    const map: Record<string, string> = {
      "platform users": "users",
      "email gateway": "gateways",
      "domain provider": "gateways",
      "chr mikrotik": "mikrotik",
      "remote access": "mikrotik",
      "winbox": "mikrotik",
      "platform fee rates": "fees",
      "withdraw platform fees": "fees",
      "fee withdrawal history": "fees",
      "fee breakdown log": "fees",
      "billing system wallet": "fees",
      "voucher prefix": "fees",
    };
    const cards = root.querySelectorAll<HTMLElement>(".card");
    cards.forEach((c) => {
      const title = (c.querySelector(".card-title")?.textContent ?? "").toLowerCase();
      let tag = "fees";
      for (const k in map) if (title.includes(k)) { tag = map[k]; break; }
      c.setAttribute("data-admin-section", tag);
    });
    const feeStats = document.getElementById("ad-fee-stats");
    if (feeStats) feeStats.setAttribute("data-admin-section", "fees");
  }, []);

  // Apply section filter
  useEffect(() => {
    const root = document.querySelector("[data-mockup-page]") as HTMLElement | null;
    document.querySelectorAll<HTMLElement>("[data-admin-section]").forEach((el) => {
      el.style.display = section === "all" || el.getAttribute("data-admin-section") === section ? "" : "none";
    });
    document.querySelectorAll<HTMLElement>("[data-admin-extra]").forEach((el) => {
      const tag = el.getAttribute("data-admin-extra")!;
      el.style.display = section === "all" || tag === section ? "" : "none";
    });
    void root;
  }, [section, members.data, overview.data]);

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
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label className="fl" style={{ margin: 0, fontWeight: 700 }}>📂 Admin Section</label>
          <select
            className="fc"
            style={{ maxWidth: 280 }}
            value={section}
            onChange={(e) => setSection(e.target.value as typeof section)}
          >
            <option value="all">All sections</option>
            <option value="users">👥 Users</option>
            <option value="gateways">🔌 Gateways</option>
            <option value="fees">💰 Platform Fees</option>
            <option value="mikrotik">📡 MikroTik Overview</option>
          </select>
          <span className="badge bg-blue" style={{ marginLeft: "auto" }}>
            {section === "all" ? "Showing everything" : `Filtered: ${section}`}
          </span>
        </div>
      </div>
      <MockupPage title="Admin Panel" html={html} />
      {canManage ? (
        <div className="card" data-admin-extra="users" style={{ marginTop: 16 }}>

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
      {access?.isPlatformAdmin ? <div data-admin-extra="gateways"><PlatformGatewaysCard /></div> : null}
      {access?.isPlatformAdmin ? <div data-admin-extra="fees"><PlatformSmsRevenueCard /></div> : null}
      <MikrotikOverviewCard />
      <div className="card" data-admin-extra="fees" style={{ marginTop: 16 }}>

        <div className="card-hd">
          <span className="card-title">📜 Activity Log</span>
          <span className="badge bg-blue">{audit.data?.length ?? 0} events</span>
        </div>
        <div className="tbl-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
          <table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {audit.isLoading ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 18, color: "var(--t3)" }}>Loading…</td></tr>
              ) : (audit.data?.length ?? 0) === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 18, color: "var(--t3)" }}>No events yet</td></tr>
              ) : (
                audit.data!.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap" }}>
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td>{r.actor?.display_name ?? r.actor_id?.slice(0, 8) ?? "system"}</td>
                    <td><span className="badge bg-purple">{r.action}</span></td>
                    <td style={{ fontSize: 12 }}>{r.entity ?? "—"}</td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--t3)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.metadata ? JSON.stringify(r.metadata) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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

type PGForm = { provider: string; enabled: boolean; config: Record<string, string>; secret: string };

function PlatformGatewaysCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlatformGateways);
  const saveFn = useServerFn(savePlatformGateway);
  const list = useQuery({ queryKey: ["platform-gateways"], queryFn: () => listFn() });
  const save = useMutation({
    mutationFn: saveFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-gateways"] }),
  });

  const findGw = (kind: "payment" | "sms") => list.data?.find((g) => g.kind === kind);
  const pay = findGw("payment");
  const sms = findGw("sms");

  const [payForm, setPayForm] = useState<PGForm>({
    provider: "marzpay", enabled: false, config: { business_id: "", username: "", base_url: "" }, secret: "",
  });
  const [smsForm, setSmsForm] = useState<PGForm>({
    provider: "wizasms", enabled: false, config: { username: "", sender_id: "WIFIZONE", base_url: "" }, secret: "",
  });

  useEffect(() => {
    if (pay) setPayForm((f) => ({
      ...f, provider: pay.provider || "marzpay", enabled: pay.enabled,
      config: { ...f.config, ...(pay.config as Record<string, string> ?? {}) },
    }));
  }, [pay]);
  useEffect(() => {
    if (sms) setSmsForm((f) => ({
      ...f, provider: sms.provider || "wizasms", enabled: sms.enabled,
      config: { ...f.config, ...(sms.config as Record<string, string> ?? {}) },
    }));
  }, [sms]);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-hd">
        <span className="card-title">🔌 Platform Gateways (shared by all tenants)</span>
        <span className="badge bg-purple">Platform Admin</span>
      </div>
      <div className="card-body">
        <div className="alert ai" style={{ marginBottom: 12 }}>
          <span className="al-ico">ℹ️</span>
          These credentials are used by every tenant in the platform. Per-tenant gateway settings
          (under Settings → Gateways) are ignored when the matching platform gateway is enabled.
        </div>
        <div className="g2" style={{ alignItems: "start" }}>
          <GwForm
            title="💳 Payment (MarzPay)"
            form={payForm}
            setForm={setPayForm}
            hasSecret={!!pay?.has_secret}
            saving={save.isPending}
            fields={[
              { key: "business_id", label: "Business ID" },
              { key: "username", label: "API Key", placeholder: "MarzPay API Key (public identifier)" },
              { key: "base_url", label: "Base URL (optional)", placeholder: "https://wallet.marzpay.com/api/v1" },
            ]}
            secretLabel="API Secret"
            showBase64Preview
            base64User={payForm.config.username || payForm.config.business_id || ""}
            onSave={() => save.mutate({ data: { kind: "payment", provider: payForm.provider, enabled: payForm.enabled, config: payForm.config, secret: payForm.secret || undefined } })}
          />
          <GwForm
            title="📨 SMS (WizaSMS)"
            form={smsForm}
            setForm={setSmsForm}
            hasSecret={!!sms?.has_secret}
            saving={save.isPending}
            fields={[
              { key: "username", label: "WizaSMS Username" },
              { key: "sender_id", label: "Sender ID", placeholder: "WIFIZONE" },
              { key: "base_url", label: "Base URL (optional)", placeholder: "https://wizasms.ug/API/V1" },
            ]}
            secretLabel="API Password"
            onSave={() => save.mutate({ data: { kind: "sms", provider: smsForm.provider, enabled: smsForm.enabled, config: smsForm.config, secret: smsForm.secret || undefined } })}
          />
        </div>
        {save.isError ? <div className="alert ar" style={{ marginTop: 10 }}>{(save.error as Error).message}</div> : null}
        {save.isSuccess ? <div className="alert ag" style={{ marginTop: 10 }}>Saved.</div> : null}
      </div>
    </div>
  );
}

function GwForm({
  title, form, setForm, hasSecret, saving, fields, secretLabel, onSave,
  showBase64Preview = false, base64User = "",
}: {
  title: string;
  form: PGForm;
  setForm: (f: PGForm) => void;
  hasSecret: boolean;
  saving: boolean;
  fields: { key: string; label: string; placeholder?: string }[];
  secretLabel: string;
  onSave: () => void;
  showBase64Preview?: boolean;
  base64User?: string;
}) {
  const b64 = showBase64Preview && base64User && form.secret
    ? (typeof window !== "undefined" ? window.btoa(`${base64User}:${form.secret}`) : "")
    : "";
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-hd"><span className="card-title">{title}</span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Enabled
        </label>
      </div>
      <div className="card-body">
        {fields.map((f) => (
          <div className="form-group" key={f.key}>
            <label className="fl">{f.label}</label>
            <input
              className="fc"
              value={form.config[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setForm({ ...form, config: { ...form.config, [f.key]: e.target.value } })}
            />
          </div>
        ))}
        <div className="form-group">
          <label className="fl">{secretLabel} {hasSecret ? <span className="badge bg-green" style={{ marginLeft: 6 }}>set</span> : null}</label>
          <input
            className="fc"
            type="password"
            placeholder={hasSecret ? "•••••••• (leave blank to keep)" : "Paste secret"}
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
          />
        </div>
        {showBase64Preview ? (
          <div className="form-group">
            <label className="fl">Base64 Authorization Header <span style={{ fontWeight: 400, color: "var(--t4)" }}>(auto-generated)</span></label>
            <input
              className="fc mono"
              readOnly
              value={b64 ? `Basic ${b64}` : ""}
              placeholder={hasSecret && !form.secret ? "Re-enter API Secret to preview" : "Fill API Key + API Secret above"}
              style={{ fontSize: 11 }}
            />
            <div className="fhint">Base64(API Key : API Secret). The server sends this on every MarzPay request — you don't need to paste it anywhere.</div>
          </div>
        ) : null}
        <button className="btn btn-p" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

function PlatformSmsRevenueCard() {
  const fn = useServerFn(getPlatformSmsRevenue);
  const q = useQuery({ queryKey: ["platform-sms-revenue"], queryFn: () => fn(), refetchInterval: 60_000 });
  const cur = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-hd">
        <span className="card-title">💬 SMS Revenue (all tenants)</span>
        <span className="badge bg-purple">Platform Admin</span>
      </div>
      <div className="card-body">
        <div className="g2" style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <Stat label="Total Collected" value={cur(q.data?.totals.amount ?? 0)} color="var(--green)" />
          <Stat label="Credits Sold" value={(q.data?.totals.credits ?? 0).toLocaleString()} color="var(--blue)" />
          <Stat label="Transactions" value={(q.data?.totals.count ?? 0).toLocaleString()} color="var(--purple)" />
        </div>
        <div className="tbl-wrap" style={{ marginTop: 12, maxHeight: 280, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Credits</th></tr></thead>
            <tbody>
              {q.isLoading ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 14, color: "var(--t3)" }}>Loading…</td></tr>
              ) : (q.data?.rows.length ?? 0) === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 14, color: "var(--t3)" }}>No SMS purchases yet</td></tr>
              ) : (
                q.data!.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11, color: "var(--t3)" }}>{new Date(r.created_at as string).toLocaleString()}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{(r.owner_id as string).slice(0, 8)}</td>
                    <td><b>{cur(Number(r.amount))}</b></td>
                    <td>{Number(r.credits).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-body" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
      </div>
    </div>
  );
}

function MikrotikOverviewCard() {
  const { data: access } = useAccess();
  const fn = useServerFn(getPlatformMikrotikOverview);
  const q = useQuery({
    queryKey: ["platform-mikrotik-overview"],
    queryFn: () => fn(),
    enabled: !!access?.isPlatformAdmin,
    refetchInterval: 60_000,
  });
  if (!access?.isPlatformAdmin) return null;
  return (
    <div className="card" data-admin-extra="mikrotik" style={{ marginTop: 16 }}>
      <div className="card-hd">
        <span className="card-title">📡 MikroTik Overview (all tenants)</span>
        <span className="badge bg-purple">Platform Admin</span>
      </div>
      <div className="card-body">
        <div className="g2" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <Stat label="Total Routers" value={(q.data?.totals.total ?? 0).toLocaleString()} color="var(--blue)" />
          <Stat label="Online" value={(q.data?.totals.online ?? 0).toLocaleString()} color="var(--green)" />
          <Stat label="Offline / Error" value={(q.data?.totals.offline ?? 0).toLocaleString()} color="var(--red)" />
          <Stat label="Unknown" value={(q.data?.totals.unknown ?? 0).toLocaleString()} color="var(--t3)" />
        </div>
        <div className="tbl-wrap" style={{ marginTop: 12, maxHeight: 320, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Name</th><th>Host</th><th>Status</th><th>Last Seen</th><th>Tenant</th></tr></thead>
            <tbody>
              {q.isLoading ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 14, color: "var(--t3)" }}>Loading…</td></tr>
              ) : (q.data?.rows.length ?? 0) === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 14, color: "var(--t3)" }}>No routers registered yet</td></tr>
              ) : (
                q.data!.rows.map((r) => {
                  const s = (r.status ?? "unknown").toString().toLowerCase();
                  const badge = s === "online" || s === "connected" ? "bg-green" : s === "error" || s === "offline" ? "bg-red" : "bg-blue";
                  return (
                    <tr key={r.id as string}>
                      <td><b>{(r.name as string) || "—"}</b></td>
                      <td className="mono" style={{ fontSize: 11 }}>{(r.host as string) || "—"}</td>
                      <td><span className={`badge ${badge}`}>{r.status ?? "unknown"}</span></td>
                      <td style={{ fontSize: 11, color: "var(--t3)" }}>{r.last_seen ? new Date(r.last_seen as string).toLocaleString() : "—"}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{(r.owner_id as string)?.slice(0, 8) ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
