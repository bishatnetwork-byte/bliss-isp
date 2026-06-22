import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/reports.html?raw";

export const Route = createFileRoute("/_authenticated/reports")({
  component: () => <MockupPage title="Reports" html={html} />,
});
