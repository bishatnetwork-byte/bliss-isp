import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/payments.html?raw";

export const Route = createFileRoute("/_authenticated/payments")({
  component: () => <MockupPage title="Payments" html={html} />,
});
