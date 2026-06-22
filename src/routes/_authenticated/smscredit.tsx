import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/smscredit.html?raw";

export const Route = createFileRoute("/_authenticated/smscredit")({
  component: () => <MockupPage title="SMS Credit" html={html} />,
});
