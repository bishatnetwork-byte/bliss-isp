import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/routerinfo.html?raw";

export const Route = createFileRoute("/_authenticated/routerinfo")({
  component: () => <MockupPage title="Router Info" html={html} />,
});
