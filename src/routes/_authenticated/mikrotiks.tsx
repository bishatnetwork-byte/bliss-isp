import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/mikrotiks.html?raw";

export const Route = createFileRoute("/_authenticated/mikrotiks")({
  component: () => <MockupPage title="MikroTik Devices" html={html} />,
});
