import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/vouchers.html?raw";

export const Route = createFileRoute("/_authenticated/vouchers")({
  component: () => <MockupPage title="Voucher Manager" html={html} />,
});
