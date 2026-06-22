import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPortalPayload } from "@/lib/portal.functions";
import { getCustomerHistory } from "@/lib/customer-portal.functions";
import { initiateVoucherStk, checkVoucherPaymentStatus } from "@/lib/payments.functions";

export const Route = createFileRoute("/c/$tenant")({
  head: () => ({
    meta: [
      { title: "My WiFi · Account" },
      { name: "description", content: "View your vouchers and renew your WiFi plan." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerPortal,
});

type RenewState = { state: "idle" | "pending" | "paid" | "failed"; message?: string; code?: string | null };

function CustomerPortal() {
  const { tenant } = Route.useParams();
  const getHistory = useServerFn(getCustomerHistory);
  const getPortal = useServerFn(getPortalPayload);
  const initStk = useServerFn(initiateVoucherStk);
  const checkStatus = useServerFn(checkVoucherPaymentStatus);

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getCustomerHistory>> | null>(null);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof getPortalPayload>>["plans"]>([]);
  const [renew, setRenew] = useState<RenewState>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);

  const onLookup = async () => {
    setError(null);
    if (phone.replace(/\D/g, "").length < 7) { setError("Enter a valid phone number"); return; }
    setLoading(true);
    try {
      const [h, p] = await Promise.all([
        getHistory({ data: { owner: tenant, phone } }),
        getPortal({ data: { owner: tenant } }),
      ]);
      setHistory(h);
      setPlans(p.plans);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const onRenew = async (planId: string) => {
    setRenew({ state: "pending", message: "Sending payment prompt…" });
    try {
      const r = await initStk({ data: {
        owner: tenant, plan_id: planId, phone,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
      } });
      if (!r.ok) { setRenew({ state: "failed", message: r.error }); return; }
      const paymentId = r.payment_id;
      const started = Date.now();
      const poll = async () => {
        try {
          const s = await checkStatus({ data: { payment_id: paymentId } });
          if (s.status === "completed") {
            setRenew({ state: "paid", message: "Payment received", code: s.code ?? null });
            await onLookup();
            return;
          }
          if (s.status === "failed") { setRenew({ state: "failed", message: "Payment failed" }); return; }
        } catch { /* transient */ }
        if (Date.now() - started > 120_000) { setRenew({ state: "failed", message: "Timed out" }); return; }
        setTimeout(poll, 3000);
      };
      setTimeout(poll, 3000);
    } catch (e) { setRenew({ state: "failed", message: (e as Error).message }); }
  };

  const brand = history?.business;
  const accent = brand?.primary_color || "#2563eb";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {brand?.logo_url ? <img src={brand.logo_url} alt="" className="h-8" /> : null}
          <h1 className="text-lg font-semibold">{brand?.name ?? "My WiFi Account"}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-white rounded-lg border p-5">
          <h2 className="font-semibold mb-1">Look up your account</h2>
          <p className="text-sm text-slate-500 mb-3">Enter the mobile number you used to buy WiFi.</p>
          <div className="flex gap-2">
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
              className="flex-1 px-3 py-2 border rounded-md text-sm"
              onKeyDown={e => { if (e.key === "Enter") onLookup(); }}
            />
            <button
              onClick={onLookup}
              disabled={loading}
              className="px-4 py-2 rounded-md text-white text-sm font-medium disabled:opacity-50"
              style={{ background: accent }}
            >
              {loading ? "Loading…" : "Find"}
            </button>
          </div>
          {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
        </section>

        {history ? (
          <>
            <section className="bg-white rounded-lg border p-5">
              <h2 className="font-semibold mb-3">Your vouchers</h2>
              {history.vouchers.length === 0 ? (
                <p className="text-sm text-slate-500">No vouchers found for this number yet.</p>
              ) : (
                <ul className="divide-y">
                  {history.vouchers.map(v => (
                    <li key={v.id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-mono font-semibold tracking-wider">{v.code}</div>
                        <div className="text-slate-500 text-xs">
                          {v.plan_name ?? "—"} · {v.status}
                          {v.expires_at ? ` · expires ${new Date(v.expires_at).toLocaleString()}` : ""}
                        </div>
                      </div>
                      <Link
                        to="/p/$tenant"
                        params={{ tenant }}
                        className="text-xs underline"
                        style={{ color: accent }}
                      >
                        Connect
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white rounded-lg border p-5">
              <h2 className="font-semibold mb-1">Renew with M-Pesa</h2>
              <p className="text-sm text-slate-500 mb-3">
                Pick a plan — we'll send the payment prompt to <strong>{phone}</strong>.
              </p>
              {renew.state !== "idle" ? (
                <div className={`mb-3 px-3 py-2 rounded-md text-sm ${
                  renew.state === "paid" ? "bg-green-50 text-green-700" :
                  renew.state === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {renew.message}
                  {renew.code ? <div className="font-mono mt-1">Your code: <strong>{renew.code}</strong></div> : null}
                </div>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-2">
                {plans.map(p => {
                  const isLast = p.id === history.last_plan_id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onRenew(p.id)}
                      disabled={renew.state === "pending"}
                      className="border rounded-md p-3 text-left hover:border-slate-400 disabled:opacity-50 relative"
                    >
                      {isLast ? (
                        <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wide text-white px-1.5 py-0.5 rounded"
                              style={{ background: accent }}>Last used</span>
                      ) : null}
                      <div className="font-medium">{p.name}</div>
                      <div className="text-sm text-slate-500">{p.currency} {p.price}</div>
                    </button>
                  );
                })}
                {plans.length === 0 ? <p className="text-sm text-slate-500">No plans available.</p> : null}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
