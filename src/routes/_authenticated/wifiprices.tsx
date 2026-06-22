import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/wifiprices.html?raw";

export const Route = createFileRoute("/_authenticated/wifiprices")({
  component: () => <MockupPage title="WiFi Prices" html={html} />,
});
