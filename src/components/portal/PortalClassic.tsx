import { Wifi, Loader2, CheckCircle, Shield, Clock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PortalDesignProps } from "./types";
import { fmtDuration, fmtData, fmtSpeed } from "./types";

export function PortalClassic(p: PortalDesignProps) {
  const { settings, plans, voucherCode, setVoucherCode, voucherPhone, setVoucherPhone,
    connecting, result, onConnect, onReset, currency, onBuy, buying, buyStatus } = p;
  const primary = settings.primary_color || "#2563eb";

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{
        background: `linear-gradient(135deg, ${primary}20 0%, hsl(var(--background)) 50%, ${primary}10 100%)`,
      }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="" className="h-20 mx-auto mb-4 object-contain" />
          ) : (
            <div className="h-20 w-20 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg"
              style={{ backgroundColor: primary }}>
              <Wifi className="h-10 w-10 text-white" />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-2" style={{ color: primary }}>
            {settings.business_name || "WiFi Access"}
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            {settings.welcome_text || "Enter your voucher code to connect."}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-xl border-2" style={{ borderColor: `${primary}30` }}>
            <CardHeader className="text-center" style={{ backgroundColor: `${primary}10` }}>
              <CardTitle className="flex items-center justify-center gap-2">
                <Shield className="h-5 w-5" style={{ color: primary }} />
                Have a voucher?
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {result?.ok ? (
                <div className="text-center space-y-4">
                  <CheckCircle className="h-16 w-16 mx-auto text-emerald-500" />
                  <h2 className="text-xl font-bold text-emerald-600">Connected!</h2>
                  <div className="rounded-lg p-4 space-y-1" style={{ backgroundColor: `${primary}10` }}>
                    <p className="font-semibold">{result.plan_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {fmtDuration(result.duration_minutes)} · {fmtSpeed(result.rate_limit_down_kbps)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(result.session_expires_at).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={onReset}>Use another code</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Voucher code</label>
                    <input
                      type="text" value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                      placeholder="WIFI-XXXX"
                      autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                      className="w-full h-12 px-4 rounded-lg border-2 bg-background text-center text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2"
                      style={{ borderColor: `${primary}40` }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone (optional)</label>
                    <input
                      type="tel" value={voucherPhone}
                      onChange={(e) => setVoucherPhone(e.target.value)}
                      placeholder="0771234567"
                      className="w-full h-12 px-4 rounded-lg border-2 bg-background focus:outline-none focus:ring-2"
                      style={{ borderColor: `${primary}40` }}
                    />
                  </div>
                  {result && !result.ok && (
                    <p className="text-sm text-destructive">Could not connect: {result.error}</p>
                  )}
                  <button
                    onClick={onConnect} disabled={connecting || !voucherCode}
                    className="w-full h-12 rounded-lg text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: primary }}
                  >
                    {connecting
                      ? <><Loader2 className="h-5 w-5 animate-spin" /> Connecting...</>
                      : <><Wifi className="h-5 w-5" /> Connect now</>}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-xl border-2" style={{ borderColor: `${primary}30` }}>
            <CardHeader className="text-center" style={{ backgroundColor: `${primary}10` }}>
              <CardTitle className="flex items-center justify-center gap-2">
                <Zap className="h-5 w-5" style={{ color: primary }} />
                Buy WiFi access
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-2 max-h-[420px] overflow-y-auto">
              {plans.length === 0 && (
                <p className="text-center text-muted-foreground py-6">No plans available.</p>
              )}
              {plans.map((pl) => (
                <div key={pl.id} className="p-3 rounded-lg border-2 border-transparent hover:shadow-md transition-all">
                  <div className="flex justify-between items-center gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{pl.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Clock className="h-3 w-3" />{fmtDuration(pl.duration_minutes)} · {fmtSpeed(pl.rate_limit_down_kbps)} · {fmtData(pl.data_limit_mb)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg" style={{ color: primary }}>
                        {pl.price.toLocaleString()} <span className="text-xs">{pl.currency || currency}</span>
                      </p>
                      {onBuy && (
                        <button
                          onClick={() => onBuy(pl.id)} disabled={buying}
                          className="mt-1 text-xs px-2 py-1 rounded font-semibold text-white disabled:opacity-60"
                          style={{ backgroundColor: primary }}
                        >Buy</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {buyStatus && buyStatus.state !== "idle" && (
                <div className="mt-3 p-3 rounded-lg text-sm" style={{ backgroundColor: `${primary}10` }}>
                  {buyStatus.state === "pending" && <><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />{buyStatus.message}</>}
                  {buyStatus.state === "paid" && <>✅ {buyStatus.message}{buyStatus.code ? ` — code ${buyStatus.code}` : ""}</>}
                  {buyStatus.state === "failed" && <span className="text-destructive">⚠️ {buyStatus.message}</span>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
