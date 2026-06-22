import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/bulksms.html?raw";
import { getWallet } from "@/lib/wallet.functions";
import { listContacts, listSmsTemplates, listSmsHistory, sendBulkSms, addContact } from "@/lib/sms.functions";
import { setText, setHTML, getVal, on, esc, notify } from "@/lib/mockup-dom";

export const Route = createFileRoute("/_authenticated/bulksms")({
  component: BulkSmsPage,
});

const bulkChips: string[] = [];

function BulkSmsPage() {
  const qc = useQueryClient();
  const w = useServerFn(getWallet);
  const c = useServerFn(listContacts);
  const t = useServerFn(listSmsTemplates);
  const h = useServerFn(listSmsHistory);
  const sendFn = useServerFn(sendBulkSms);
  const addC = useServerFn(addContact);

  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: () => w(), refetchInterval: 15000 });
  const { data: contacts } = useQuery({ queryKey: ["contacts"], queryFn: () => c() });
  const { data: templates } = useQuery({ queryKey: ["sms-templates"], queryFn: () => t() });
  const { data: history } = useQuery({ queryKey: ["sms-history"], queryFn: () => h() });

  return (
    <MockupPage
      title="Bulk SMS"
      html={html}
      deps={[wallet, contacts, templates, history]}
      hydrate={(root) => {
        setText(root, "sms-cr-avail", wallet?.sms_credits ?? 0);

        const renderChips = () => {
          setHTML(root, "sms-chips",
            bulkChips.map(p => `<span class="chip" data-phone="${esc(p)}" style="display:inline-flex;align-items:center;gap:4px;background:var(--bg2);padding:3px 8px;border-radius:12px;font-size:11px;margin:2px">${esc(p)} <button data-rm="${esc(p)}" style="background:none;border:0;color:var(--muted);cursor:pointer">×</button></span>`).join(""));
          root.querySelectorAll<HTMLButtonElement>("[data-rm]").forEach(b =>
            b.addEventListener("click", () => {
              const i = bulkChips.indexOf(b.dataset.rm!);
              if (i >= 0) bulkChips.splice(i, 1);
              renderChips(); updateSmsCount();
            }));
        };

        const updateSmsCount = () => {
          const body = getVal(root, "sms-msg");
          const len = body.length;
          const parts = len <= 160 ? 1 : Math.ceil(len / 153);
          const cost = parts * bulkChips.length;
          setText(root, "sms-char-count", `${len} chars · ${parts} part(s)`);
          setText(root, "sms-send-cost", `${cost} credits`);
        };

        on(root, "sms-msg", "input", updateSmsCount);
        on(root, "sms-chip-input", "keydown", (e) => {
          const ev = e as KeyboardEvent;
          if (ev.key === "Enter" || ev.key === ",") {
            ev.preventDefault();
            const input = ev.target as HTMLInputElement;
            const v = input.value.trim().replace(/,$/, "");
            if (v && !bulkChips.includes(v)) bulkChips.push(v);
            input.value = "";
            renderChips(); updateSmsCount();
          }
        });

        // Templates
        setHTML(root, "sms-templates-list",
          (templates ?? []).map(tpl => `<div class="template-sms" data-tpl="${esc(tpl.body)}" style="cursor:pointer;padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px">
            <div class="template-sms-title" style="font-weight:600;font-size:12px">${esc(tpl.title)}</div>
            <div class="template-sms-body" style="font-size:11px;color:var(--muted)">${esc(tpl.body.slice(0, 80))}…</div>
          </div>`).join("") || `<div class="empty">No templates yet</div>`);
        root.querySelectorAll<HTMLElement>("[data-tpl]").forEach(el =>
          el.addEventListener("click", () => {
            const ta = root.querySelector<HTMLTextAreaElement>("#sms-msg");
            if (ta) { ta.value = el.dataset.tpl!; updateSmsCount(); }
          }));

        // Contacts table
        const renderContacts = (filter = "") => {
          const list = (contacts ?? []).filter(ct => !filter ||
            (ct.name?.toLowerCase().includes(filter)) || ct.phone.includes(filter));
          setHTML(root, "contacts-tbody",
            list.map(ct => `<tr>
              <td><input type="checkbox" data-add="${esc(ct.phone)}" data-name="${esc(ct.name ?? "")}"></td>
              <td>${esc(ct.name ?? "")}</td><td>${esc(ct.phone)}</td><td><span class="badge">${esc(ct.source)}</span></td>
            </tr>`).join("") || `<tr><td colspan="4"><div class="empty">No contacts</div></td></tr>`);
          root.querySelectorAll<HTMLInputElement>("[data-add]").forEach(cb =>
            cb.addEventListener("change", () => {
              const p = cb.dataset.add!;
              if (cb.checked && !bulkChips.includes(p)) bulkChips.push(p);
              if (!cb.checked) {
                const i = bulkChips.indexOf(p);
                if (i >= 0) bulkChips.splice(i, 1);
              }
              renderChips(); updateSmsCount();
            }));
        };
        renderContacts();
        on(root, "contact-search", "input", (e) => renderContacts((e.target as HTMLInputElement).value.toLowerCase()));

        // History
        setHTML(root, "sms-history-tbody",
          (history ?? []).slice(0, 50).map(m => `<tr>
            <td>${new Date(m.created_at).toLocaleString()}</td>
            <td>${esc(m.phone)}</td><td>${esc((m.body ?? "").slice(0, 60))}…</td>
            <td>${m.parts}</td><td><span class="badge ${m.status === "sent" ? "bg-green" : "bg-red"}">${esc(m.status)}</span></td>
          </tr>`).join("") || `<tr><td colspan="5"><div class="empty">No messages yet</div></td></tr>`);

        // Send
        on(root, "sms-send-btn", "click", async () => {
          const body = getVal(root, "sms-msg");
          if (!body) return notify("Enter a message", "warning");
          if (bulkChips.length === 0) return notify("Add at least one recipient", "warning");
          const recipients = bulkChips.map(phone => {
            const ct = contacts?.find(c => c.phone === phone);
            return { phone, name: ct?.name ?? "Customer" };
          });
          try {
            const r = await sendFn({ data: { recipients, body } });
            notify(`Sent ${r.sent} SMS — ${r.smsCreditsRemaining} credits left`, "success");
            bulkChips.length = 0;
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["sms-history"] });
            qc.invalidateQueries({ queryKey: ["contacts"] });
          } catch (e) { notify((e as Error).message, "error"); }
        });

        // Single SMS
        on(root, "sms-s-send-btn", "click", async () => {
          const phone = getVal(root, "sms-s-phone");
          const name = getVal(root, "sms-s-name");
          const body = getVal(root, "sms-msg");
          if (!phone || !body) return notify("Phone & message required", "warning");
          try {
            const r = await sendFn({ data: { recipients: [{ phone, name }], body } });
            notify(`Sent — ${r.smsCreditsRemaining} credits left`, "success");
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["sms-history"] });
          } catch (e) { notify((e as Error).message, "error"); }
        });

        // Add contact
        on(root, "nc-add-btn", "click", async () => {
          const phone = getVal(root, "nc-phone");
          const name = getVal(root, "nc-name");
          if (!phone) return notify("Phone required", "warning");
          try {
            await addC({ data: { phone, name, source: "manual" } });
            qc.invalidateQueries({ queryKey: ["contacts"] });
            notify("Contact added", "success");
          } catch (e) { notify((e as Error).message, "error"); }
        });

        renderChips(); updateSmsCount();
      }}
    />
  );
}
