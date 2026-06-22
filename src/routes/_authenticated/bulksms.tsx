import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/bulksms.html?raw";

export const Route = createFileRoute("/_authenticated/bulksms")({
  component: () => <MockupPage title="Bulk SMS" html={html} />,
});
