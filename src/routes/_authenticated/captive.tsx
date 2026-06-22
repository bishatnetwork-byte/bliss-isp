import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/captive.html?raw";

export const Route = createFileRoute("/_authenticated/captive")({
  component: () => <MockupPage title="Captive Portal" html={html} />,
});
