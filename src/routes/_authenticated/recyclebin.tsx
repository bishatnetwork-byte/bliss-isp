import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/recyclebin.html?raw";

export const Route = createFileRoute("/_authenticated/recyclebin")({
  component: () => <MockupPage title="Recycle Bin" html={html} />,
});
