import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { getPortalPayload, redeemVoucherPublic, type RedeemResult } from "@/lib/portal.functions";
import { initiateVoucherStk, checkVoucherPaymentStatus } from "@/lib/payments.functions";
import { PortalClassic } from "@/components/portal/PortalClassic";
import { PortalModern } from "@/components/portal/PortalModern";
import { PortalBishat } from "@/components/portal/PortalBishat";

const searchSchema = z.object({
  mac: z.string().optional(),
  ip: z.string().optional(),
  // MikroTik's hotspot template forwards link-orig / dst as the original URL.
  "link-orig": z.string().optional(),
  dst: z.string().optional(),
});

export const Route = createFileRoute("/p/$tenant")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: "WiFi access" },
      { name: "description", content: "Connect to WiFi with a voucher code." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "WiFi access" },
    ],
    links: [{ rel: "canonical", href: `/p/${params.tenant}` }],
  }),
  component: CaptivePortalPage,
});

function CaptivePortalPage() {
  const { tenant } = Route.useParams();
  const search = useSearch({ from: "/p/$tenant" });
  const getPayload = useServerFn(getPortalPayload);
  const redeemFn = useServerFn(redeemVoucherPublic);

  const { data } = useQuery({
    queryKey: ["portal-payload", tenant],
    queryFn: () => getPayload({ data: { owner: tenant } }),
  });

  const [voucherCode, setVoucherCode] = useState("");
  const [voucherPhone, setVoucherPhone] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyStatus, setBuyStatus] = useState<{ state: "idle" | "pending" | "paid" | "failed"; message?: string; code?: string | null }>({ state: "idle" });

  const initStk = useServerFn(initiateVoucherStk);
  const checkStatus = useServerFn(checkVoucherPaymentStatus);

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!data.settings) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <h1 className="text-xl font-bold">Portal not configured</h1>
          <p className="text-muted-foreground mt-2">This business hasn't published a captive portal yet.</p>
        </div>
      </div>
    );
  }

  const settings = data.settings;
  const template = (settings.template || "classic").toLowerCase();

  const onConnect = async () => {
    setConnecting(true);
    try {
      const r = await redeemFn({ data: {
        owner: tenant, code: voucherCode,
        mac: search.mac ?? null, ip: search.ip ?? null,
      } });
      setResult(r);
      if (r.ok) {
        fetch(`/api/public/connect`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner: tenant, voucher_id: r.voucher_id, mac: search.mac, ip: search.ip }),
        }).catch(() => {});
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setConnecting(false);
    }
  };

  const onBuy = async (planId: string) => {
    if (!voucherPhone || voucherPhone.length < 7) {
      setBuyStatus({ state: "failed", message: "Enter your mobile money phone first" });
      return;
    }
    setBuying(true);
    setBuyStatus({ state: "pending", message: "Sending payment prompt to your phone…" });
    try {
      const r = await initStk({ data: {
        owner: tenant, plan_id: planId, phone: voucherPhone,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
      } });
      if (!r.ok) { setBuyStatus({ state: "failed", message: r.error }); setBuying(false); return; }
      const paymentId = r.payment_id;
      // poll up to 120s
      const started = Date.now();
      const poll = async () => {
        try {
          const s = await checkStatus({ data: { payment_id: paymentId } });
          if (s.status === "completed") {
            setBuyStatus({ state: "paid", message: "Payment received", code: s.code ?? null });
            if (s.code) setVoucherCode(s.code);
            setBuying(false); return;
          }
          if (s.status === "failed") { setBuyStatus({ state: "failed", message: "Payment failed" }); setBuying(false); return; }
        } catch { /* ignore transient */ }
        if (Date.now() - started > 120_000) { setBuyStatus({ state: "failed", message: "Timed out waiting for payment" }); setBuying(false); return; }
        setTimeout(poll, 3000);
      };
      setTimeout(poll, 3000);
    } catch (e) {
      setBuyStatus({ state: "failed", message: (e as Error).message });
      setBuying(false);
    }
  };

  const onReset = () => { setResult(null); setVoucherCode(""); setBuyStatus({ state: "idle" }); };

  const props = {
    settings, plans: data.plans,
    voucherCode, setVoucherCode, voucherPhone, setVoucherPhone,
    connecting, result, onConnect, onReset,
    currency: data.plans[0]?.currency || "UGX",
    onBuy, buying, buyStatus,
  };

  if (template === "modern") return <PortalModern {...props} />;
  if (template === "bishat" || template === "b") return <PortalBishat {...props} />;
  return <PortalClassic {...props} />;
}
