import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/settings.html?raw";

export const Route = createFileRoute("/_authenticated/settings")({
  component: () => <MockupPage title="Settings" html={html} />,
});
