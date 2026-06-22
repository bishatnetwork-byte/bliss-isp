import { createFileRoute } from "@tanstack/react-router";
import { MockupPage } from "@/components/MockupPage";
import html from "@/mockup-pages/sell.html?raw";

export const Route = createFileRoute("/_authenticated/sell")({
  component: () => <MockupPage title="Sell / Create" html={html} />,
});
