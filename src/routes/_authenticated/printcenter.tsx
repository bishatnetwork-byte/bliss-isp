import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/printcenter.html?raw";

export const Route = createFileRoute("/_authenticated/printcenter")({
  component: () => <MockupPage title="Print Center" html={html} />,
});
