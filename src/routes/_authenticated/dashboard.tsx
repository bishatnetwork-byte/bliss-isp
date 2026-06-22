import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/dashboard.html?raw";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: () => <MockupPage title="Dashboard" html={html} />,
});
