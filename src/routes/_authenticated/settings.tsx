import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/settings.html?raw";

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
  return <MockupPage title="Settings" html={html} />;
}

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});
