import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { MockupPage } from "@/components/MockupPage";
import { toast } from "sonner";
import html from "@/mockup-pages/settings.html?raw";
import { getBusinessSettings, saveBusinessSettings } from "@/lib/settings.functions";

type BizConfig = {
  default_expiry_days?: number;
  login_url?: string;
};

function SettingsPage() {
  // Payments + SMS gateways are platform-wide (admin-only). Hide those tabs
  // and panes from regular users' Settings page.
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

        const nameEl = q<HTMLInputElement>("#set-biz-name");
        const curEl = q<HTMLSelectElement>("#set-biz-cur");
        const expEl = q<HTMLInputElement>("#set-biz-exp");
        const tzEl = q<HTMLSelectElement>("#set-biz-tz");
        const urlEl = q<HTMLInputElement>("#set-biz-url");
        const indicator = document.getElementById("autosave-indicator");

        const flashSaved = () => {
          if (!indicator) return;
          indicator.style.opacity = "1";
          window.clearTimeout((flashSaved as unknown as { _t?: number })._t);
          (flashSaved as unknown as { _t?: number })._t = window.setTimeout(() => {
            indicator.style.opacity = "0";
          }, 1500);
        };

        // Load existing settings
        let loading = true;
        getBusinessSettings()
          .then((data) => {
            const cfg = ((data as { config?: BizConfig })?.config ?? {}) as BizConfig;
            if (nameEl && data.name) nameEl.value = data.name;
            if (curEl && data.currency) curEl.value = data.currency;
            if (tzEl && data.timezone) tzEl.value = data.timezone;
            if (urlEl && cfg.login_url) urlEl.value = cfg.login_url;
            if (expEl && cfg.default_expiry_days != null) expEl.value = String(cfg.default_expiry_days);
          })
          .catch((e) => {
            console.error("getBusinessSettings failed", e);
            toast.error("Couldn't load business settings");
          })
          .finally(() => { loading = false; });

        const collect = () => ({
          name: nameEl?.value?.trim() || null,
          currency: curEl?.value || "KES",
          timezone: tzEl?.value || "Africa/Nairobi",
          phone: null,
          email: "",
          address: null,
          config: {
            default_expiry_days: Number(expEl?.value || 7) || 7,
            login_url: urlEl?.value?.trim() || "",
          } as BizConfig,
        });

        let timer: number | undefined;
        let saving = false;
        const queueSave = () => {
          if (loading) return;
          window.clearTimeout(timer);
          timer = window.setTimeout(async () => {
            if (saving) return;
            saving = true;
            try {
              await saveBusinessSettings({ data: collect() });
              flashSaved();
            } catch (e) {
              console.error("saveBusinessSettings failed", e);
              toast.error(e instanceof Error ? e.message : "Save failed");
            } finally {
              saving = false;
            }
          }, 600);
        };

        const inputs: (HTMLElement | null)[] = [nameEl, curEl, expEl, tzEl, urlEl];
        inputs.forEach((el) => {
          if (!el) return;
          el.addEventListener("input", queueSave);
          el.addEventListener("change", queueSave);
        });

        return () => {
          window.clearTimeout(timer);
          inputs.forEach((el) => {
            if (!el) return;
            el.removeEventListener("input", queueSave);
            el.removeEventListener("change", queueSave);
          });
        };
      }}
    />
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});
