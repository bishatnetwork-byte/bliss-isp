import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { MockupPage } from "@/components/MockupPage";
import { toast } from "sonner";
import html from "@/mockup-pages/settings.html?raw";
import { getBusinessSettings, saveBusinessSettings } from "@/lib/settings.functions";
import { listRouters, upsertRouter, testRouter } from "@/lib/routers.functions";
import { listTelegramBots, saveTelegramBot } from "@/lib/gateways.functions";
import { setWithdrawPasscode, getSecuritySettings } from "@/lib/withdrawals.functions";

type BizConfig = {
  default_expiry_days?: number;
  login_url?: string;
  mtn_ussd?: string;
  mtn_paybill?: string;
  airtel_ussd?: string;
  airtel_paybill?: string;
};

type TgKey = "payments" | "wifiActivity" | "withdraw";
const TG_DOM: Record<TgKey, { tok: string; cid: string; badge: string; saveBtn: string }> = {
  payments:     { tok: "#tg-pay-tok",  cid: "#tg-pay-cid",  badge: "#tg-pay-badge",  saveBtn: "#tg-pay-save-btn" },
  wifiActivity: { tok: "#tg-wifi-tok", cid: "#tg-wifi-cid", badge: "#tg-wifi-badge", saveBtn: "#tg-wifiActivity-save-btn" },
  withdraw:     { tok: "#tg-wd-tok",   cid: "#tg-wd-cid",   badge: "#tg-wd-badge",   saveBtn: "#tg-withdraw-save-btn" },
};

function setBadge(el: HTMLElement | null, ok: boolean, label: string) {
  if (!el) return;
  el.textContent = label;
  el.style.background = ok ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)";
  el.style.color = ok ? "var(--green)" : "var(--red)";
  el.style.border = `1px solid ${ok ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)"}`;
}

function SettingsPage() {
  useEffect(() => {
    const hide = () => {
      const tabs = document.querySelectorAll<HTMLElement>('#stabs .tab[data-s="s-pay"], #stabs .tab[data-s="s-sms"]');
      tabs.forEach((t) => (t.style.display = "none"));
      const panes = document.querySelectorAll<HTMLElement>('#s-pay, #s-sms');
      panes.forEach((p) => (p.style.display = "none"));
    };
    hide();
    const id = window.setInterval(hide, 500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <MockupPage
      title="Settings"
      html={html}
      hydrate={(root) => {
        const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
        const indicator = document.getElementById("autosave-indicator");
        const flashSaved = () => {
          if (!indicator) return;
          indicator.style.opacity = "1";
          window.clearTimeout((flashSaved as unknown as { _t?: number })._t);
          (flashSaved as unknown as { _t?: number })._t = window.setTimeout(() => {
            indicator.style.opacity = "0";
          }, 1500);
        };
        const cleanups: Array<() => void> = [];

        // -------- Business tab --------
        const bizEls = {
          name: q<HTMLInputElement>("#set-biz-name"),
          cur: q<HTMLSelectElement>("#set-biz-cur"),
          exp: q<HTMLInputElement>("#set-biz-exp"),
          tz: q<HTMLSelectElement>("#set-biz-tz"),
          url: q<HTMLInputElement>("#set-biz-url"),
          mtnUssd: q<HTMLInputElement>("#set-mtn-ussd"),
          mtnPb: q<HTMLInputElement>("#set-mtn-pb"),
          airUssd: q<HTMLInputElement>("#set-air-ussd"),
          airPb: q<HTMLInputElement>("#set-air-pb"),
        };
        let bizLoaded = false;
        getBusinessSettings()
          .then((data) => {
            const cfg = ((data as { config?: BizConfig })?.config ?? {}) as BizConfig;
            if (bizEls.name && data.name) bizEls.name.value = data.name;
            if (bizEls.cur && data.currency) bizEls.cur.value = data.currency;
            if (bizEls.tz && data.timezone) bizEls.tz.value = data.timezone;
            if (bizEls.url && cfg.login_url) bizEls.url.value = cfg.login_url;
            if (bizEls.exp && cfg.default_expiry_days != null) bizEls.exp.value = String(cfg.default_expiry_days);
            if (bizEls.mtnUssd && cfg.mtn_ussd) bizEls.mtnUssd.value = cfg.mtn_ussd;
            if (bizEls.mtnPb && cfg.mtn_paybill) bizEls.mtnPb.value = cfg.mtn_paybill;
            if (bizEls.airUssd && cfg.airtel_ussd) bizEls.airUssd.value = cfg.airtel_ussd;
            if (bizEls.airPb && cfg.airtel_paybill) bizEls.airPb.value = cfg.airtel_paybill;
          })
          .catch((e) => { console.error(e); toast.error("Couldn't load business settings"); })
          .finally(() => { bizLoaded = true; });

        const collectBiz = () => ({
          name: bizEls.name?.value?.trim() || null,
          currency: bizEls.cur?.value || "KES",
          timezone: bizEls.tz?.value || "Africa/Nairobi",
          phone: null,
          email: "",
          address: null,
          config: {
            default_expiry_days: Number(bizEls.exp?.value || 7) || 7,
            login_url: bizEls.url?.value?.trim() || "",
            mtn_ussd: bizEls.mtnUssd?.value?.trim() || "",
            mtn_paybill: bizEls.mtnPb?.value?.trim() || "",
            airtel_ussd: bizEls.airUssd?.value?.trim() || "",
            airtel_paybill: bizEls.airPb?.value?.trim() || "",
          } as BizConfig,
        });

        let bizTimer: number | undefined;
        let bizSaving = false;
        const queueBizSave = () => {
          if (!bizLoaded) return;
          window.clearTimeout(bizTimer);
          bizTimer = window.setTimeout(async () => {
            if (bizSaving) return;
            bizSaving = true;
            try { await saveBusinessSettings({ data: collectBiz() }); flashSaved(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            finally { bizSaving = false; }
          }, 600);
        };
        Object.values(bizEls).forEach((el) => {
          if (!el) return;
          el.addEventListener("input", queueBizSave);
          el.addEventListener("change", queueBizSave);
          cleanups.push(() => {
            el.removeEventListener("input", queueBizSave);
            el.removeEventListener("change", queueBizSave);
          });
        });
        cleanups.push(() => window.clearTimeout(bizTimer));

        // -------- MikroTik tab --------
        const mkEls = {
          host: q<HTMLInputElement>("#set-mk-host"),
          port: q<HTMLInputElement>("#set-mk-port"),
          user: q<HTMLInputElement>("#set-mk-user"),
          pass: q<HTMLInputElement>("#set-mk-pass"),
          hs: q<HTMLInputElement>("#set-mk-hs"),
        };
        let routerId: string | null = null;
        listRouters()
          .then((rows) => {
            const first = (rows ?? [])[0];
            if (!first) return;
            routerId = first.id as string;
            if (mkEls.host) mkEls.host.value = first.host ?? "";
            if (mkEls.port) mkEls.port.value = String(first.port ?? 443);
            if (mkEls.user) mkEls.user.value = first.username ?? "admin";
            const notes = ((first as { notes?: string }).notes ?? "");
            const m = notes.match(/hotspot:([^\s,]+)/);
            if (mkEls.hs && m) mkEls.hs.value = m[1];
          })
          .catch((e) => console.error("listRouters", e));

        const mkBtn = root.querySelector<HTMLButtonElement>('#s-mk button[onclick="saveMkSettings()"]');
        if (mkBtn) {
          mkBtn.removeAttribute("onclick");
          const onClick = async () => {
            const host = mkEls.host?.value?.trim();
            const user = mkEls.user?.value?.trim();
            const port = Number(mkEls.port?.value || 443);
            const password = mkEls.pass?.value || "";
            const hs = mkEls.hs?.value?.trim() || "hotspot1";
            if (!host || !user) { toast.error("Host and username required"); return; }
            if (!routerId && !password) { toast.error("Password required for new router"); return; }
            mkBtn.disabled = true;
            const orig = mkBtn.textContent;
            mkBtn.textContent = "Connecting…";
            try {
              const res = await upsertRouter({ data: {
                id: routerId ?? undefined,
                name: "Primary MikroTik",
                host, port, username: user,
                ...(password ? { password } : {}),
                use_tls: port === 443 || port === 8729,
                notes: `hotspot:${hs}`,
              } });
              routerId = (res as { id: string }).id;
              const tr = await testRouter({ data: { id: routerId } });
              if ((tr as { ok: boolean }).ok) { toast.success("Router connected"); flashSaved(); }
              else { toast.error("Connect failed: " + ((tr as { error?: string }).error ?? "unknown")); }
              if (mkEls.pass) mkEls.pass.value = "";
            } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            finally { mkBtn.disabled = false; mkBtn.textContent = orig; }
          };
          mkBtn.addEventListener("click", onClick);
          cleanups.push(() => mkBtn.removeEventListener("click", onClick));
        }

        // -------- Telegram tab --------
        listTelegramBots().then((rows) => {
          for (const row of rows ?? []) {
            const key = row.bot_key as TgKey;
            const dom = TG_DOM[key]; if (!dom) continue;
            const cid = q<HTMLInputElement>(dom.cid);
            if (cid && row.chat_id) cid.value = row.chat_id;
            const badge = q<HTMLElement>(dom.badge);
            setBadge(badge, !!row.enabled, row.enabled ? "Active" : "Inactive");
          }
        }).catch((e) => console.error("listTelegramBots", e));

        (Object.keys(TG_DOM) as TgKey[]).forEach((key) => {
          const dom = TG_DOM[key];
          const tok = q<HTMLInputElement>(dom.tok);
          const cid = q<HTMLInputElement>(dom.cid);
          const badge = q<HTMLElement>(dom.badge);
          const saveBtn = q<HTMLButtonElement>(dom.saveBtn);
          const card = saveBtn?.closest(".card");
          const testBtn = card?.querySelector<HTMLButtonElement>('button[onclick^="testTg"]');
          const disBtn = card?.querySelector<HTMLButtonElement>('button[onclick^="disableTg"]');
          [saveBtn, testBtn, disBtn].forEach((b) => b?.removeAttribute("onclick"));

          const doSave = async (enabled: boolean) => {
            const token = tok?.value?.trim() || null;
            const chat = cid?.value?.trim() || null;
            if (enabled && !chat) { toast.error("Chat ID required"); return; }
            try {
              await saveTelegramBot({ data: { bot_key: key, enabled, chat_id: chat, token } });
              setBadge(badge, enabled, enabled ? "Active" : "Inactive");
              if (tok) tok.value = "";
              flashSaved();
              toast.success(enabled ? "Telegram bot saved" : "Telegram bot disabled");
            } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
          };
          const onSave = () => doSave(true);
          const onDis = () => doSave(false);
          const onTest = () => toast.message("Send a /start to your bot from the target chat, then save.");
          saveBtn?.addEventListener("click", onSave);
          disBtn?.addEventListener("click", onDis);
          testBtn?.addEventListener("click", onTest);
          cleanups.push(() => {
            saveBtn?.removeEventListener("click", onSave);
            disBtn?.removeEventListener("click", onDis);
            testBtn?.removeEventListener("click", onTest);
          });
        });

        // -------- Security tab (withdraw passcode) --------
        const passStep = q<HTMLElement>("#sec-step-passcode");
        const enabledStep = q<HTMLElement>("#sec-step-enabled");
        const secBadge = q<HTMLElement>("#sec-status-badge");
        const showSec = (enabled: boolean) => {
          if (passStep) passStep.style.display = enabled ? "none" : "";
          if (enabledStep) enabledStep.style.display = enabled ? "" : "none";
          setBadge(secBadge, enabled, enabled ? "Active" : "Not Set Up");
        };
        getSecuritySettings().then((s) => showSec(!!(s as { passcode_enabled?: boolean }).passcode_enabled)).catch(() => showSec(false));

        const secBtn = q<HTMLButtonElement>("#sec-save-btn");
        const newPass = q<HTMLInputElement>("#sec-new-pass");
        const newPass2 = q<HTMLInputElement>("#sec-new-pass2");
        if (secBtn) {
          secBtn.removeAttribute("onclick");
          const onSec = async () => {
            const p1 = newPass?.value || "";
            const p2 = newPass2?.value || "";
            if (p1.length < 4) { toast.error("Passcode must be at least 4 digits"); return; }
            if (p1 !== p2) { toast.error("Passcodes don't match"); return; }
            try {
              await setWithdrawPasscode({ data: { passcode: p1 } });
              if (newPass) newPass.value = "";
              if (newPass2) newPass2.value = "";
              showSec(true);
              flashSaved();
              toast.success("Withdraw passcode enabled");
            } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
          };
          secBtn.addEventListener("click", onSec);
          cleanups.push(() => secBtn.removeEventListener("click", onSec));
        }

        const changeBtn = root.querySelector<HTMLButtonElement>('button[onclick="showChangePasscodeForm()"]');
        if (changeBtn) {
          changeBtn.removeAttribute("onclick");
          const onChange = () => { showSec(false); newPass?.focus(); };
          changeBtn.addEventListener("click", onChange);
          cleanups.push(() => changeBtn.removeEventListener("click", onChange));
        }

        return () => { cleanups.forEach((fn) => fn()); };
      }}
    />
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});
