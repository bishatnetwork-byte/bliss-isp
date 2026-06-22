import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/withdraw.html?raw";

export const Route = createFileRoute("/_authenticated/withdraw")({
  component: () => <MockupPage title="Withdraw" html={html} />,
});
