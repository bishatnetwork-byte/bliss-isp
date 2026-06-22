import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/admin.html?raw";

export const Route = createFileRoute("/_authenticated/admin")({
  component: () => <MockupPage title="Admin Panel" html={html} />,
});
