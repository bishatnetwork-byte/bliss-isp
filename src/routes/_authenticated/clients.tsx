import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/clients.html?raw";

export const Route = createFileRoute("/_authenticated/clients")({
  component: () => <MockupPage title="Live Clients" html={html} />,
});
