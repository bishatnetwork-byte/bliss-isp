import { Wifi, Loader2, CheckCircle, Clock, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { PortalDesignProps } from "./types";
import { fmtDuration } from "./types";

function CountdownPill({ expiresAt }: { expiresAt: string }) {
  const [s, setS] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) return setS("Expired");
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setS(h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [expiresAt]);
  return (
    <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-mono text-lg mt-2">
      <Clock className="h-5 w-5" /><span>{s}</span>
    </div>
  );
}

export function PortalBishat(p: PortalDesignProps) {
  const { settings, plans, voucherCode, setVoucherCode,
    connecting, result, onConnect, onReset, currency } = p;
  const primary = settings.primary_color || "#2563eb";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-800">
      <div className="bg-white dark:bg-slate-800 shadow-sm py-4 px-4">
        <div className="max-w-md mx-auto flex justify-center">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="" className="h-12 object-contain" />
          ) : (
            <div className="bg-black text-white px-4 py-2 rounded font-bold text-sm">
              {(settings.business_name || "WIFI").split(" ")[0]}
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
            {settings.business_name || "WiFi Access"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {settings.welcome_text || "Connect with a voucher code"}
          </p>
        </div>

        {result?.ok ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg text-center space-y-4">
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 animate-ping opacity-20" />
              <div className="relative w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-emerald-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-emerald-600">Connected!</h2>
            <p className="text-muted-foreground">Enjoy your WiFi session</p>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-lg">{result.plan_name}</p>
              <p className="text-sm text-muted-foreground">{fmtDuration(result.duration_minutes)}</p>
              <CountdownPill expiresAt={result.session_expires_at} />
            </div>
            <button onClick={onReset}
              className="w-full text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: primary }}>
              <ExternalLink className="h-5 w-5" /> Use another code
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder="Voucher code"
                  autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  className="text-base border-2 border-slate-200 dark:border-slate-600 flex-1 py-3 px-4 rounded-xl bg-background text-center font-mono uppercase focus:outline-none focus:ring-2"
                  style={{ minHeight: 48 }} />
                <button onClick={onConnect} disabled={connecting || !voucherCode}
                  className="text-white py-3 px-6 rounded-xl font-semibold text-base sm:w-auto w-full disabled:opacity-60"
                  style={{ backgroundColor: primary, minHeight: 48 }}>
                  {connecting ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Login"}
                </button>
              </div>
              {result && !result.ok && (
                <p className="text-sm text-destructive text-center">Could not connect: {result.error}</p>
              )}
            </div>

            {plans.length > 0 && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  <span className="text-xs text-muted-foreground font-medium">🛒 Choose a WiFi package</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {plans.map((pl) => (
                    <div key={pl.id}
                      className="rounded-xl overflow-hidden shadow-lg border-2 border-transparent bg-white dark:bg-slate-800 hover:shadow-xl hover:scale-[1.02] transition-all">
                      <div className="h-1 w-full"
                        style={{ background: `linear-gradient(to right, ${primary}, ${primary}cc)` }} />
                      <div className="p-3 flex flex-col items-center text-center">
                        <h3 className="font-bold text-slate-800 dark:text-white text-sm leading-tight">{pl.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{fmtDuration(pl.duration_minutes)}</p>
                        <p className="font-bold text-lg mt-1" style={{ color: primary }}>
                          {pl.currency || currency} {pl.price.toLocaleString()}
                        </p>
                        <button
                          className="w-full mt-2 text-white rounded-lg py-2 px-3 font-semibold text-sm hover:opacity-90"
                          style={{ backgroundColor: primary }}>
                          BUY NOW
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm text-center">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Accepted payment methods</p>
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center text-[10px] font-bold text-black">MTN</div>
                      <span>MTN MoMo</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">AM</div>
                      <span>Airtel Money</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          <Wifi className="h-3 w-3 inline mr-1" /> Powered by HotspotPro
        </p>
      </div>
    </div>
  );
}
