import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/wifiusers.html?raw";

export const Route = createFileRoute("/_authenticated/wifiusers")({
  component: () => <MockupPage title="WiFi Users" html={html} />,
});
