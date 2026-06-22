import { Wifi, Loader2, CheckCircle, Clock, Zap, HardDrive } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { PortalDesignProps } from "./types";
import { fmtDuration, fmtData, fmtSpeed } from "./types";

export function PortalModern(p: PortalDesignProps) {
  const { settings, plans, voucherCode, setVoucherCode, voucherPhone, setVoucherPhone,
    connecting, result, onConnect, onReset, currency } = p;
  const primary = settings.primary_color || "#2563eb";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted">
      <div className="w-full max-w-lg">
        <Card className="shadow-2xl">
          <CardContent className="p-6">
            {result?.ok ? (
              <div className="text-center">
                <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto mb-6 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-bold text-emerald-600 mb-2">Connected!</h1>
                <p className="text-muted-foreground mb-6">You're online. Enjoy the WiFi.</p>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-left">
                  <h3 className="font-semibold text-center mb-3">{result.plan_name}</h3>
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5" style={{ color: primary }} />
                    <div>
                      <p className="text-sm font-medium">Duration</p>
                      <p className="text-sm text-muted-foreground">{fmtDuration(result.duration_minutes)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5" style={{ color: primary }} />
                    <div>
                      <p className="text-sm font-medium">Speed</p>
                      <p className="text-sm text-muted-foreground">{fmtSpeed(result.rate_limit_down_kbps)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-5 w-5" style={{ color: primary }} />
                    <div>
                      <p className="text-sm font-medium">Data</p>
                      <p className="text-sm text-muted-foreground">{fmtData(result.data_limit_mb)}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground text-center">
                      Session expires: {new Date(result.session_expires_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button onClick={onReset}
                  className="w-full mt-6 h-12 rounded-lg text-white font-semibold"
                  style={{ backgroundColor: primary }}>
                  Use another code
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  {settings.logo_url ? (
                    <img src={settings.logo_url} alt="" className="h-16 mx-auto mb-4 object-contain" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl mx-auto mb-4 flex items-center justify-center"
                      style={{ backgroundColor: primary }}>
                      <Wifi className="h-8 w-8 text-white" />
                    </div>
                  )}
                  <h1 className="text-2xl font-bold">{settings.business_name || "WiFi Access"}</h1>
                  <p className="text-muted-foreground mt-2">{settings.welcome_text || "Enter your voucher code"}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Voucher code</label>
                    <input type="text" value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                      placeholder="WIFI-XXXX"
                      autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                      className="w-full h-12 px-4 rounded-lg border bg-background text-center text-lg tracking-widest font-mono uppercase focus:outline-none focus:ring-2"
                      style={{ outlineColor: primary }} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone (optional)</label>
                    <input type="tel" value={voucherPhone}
                      onChange={(e) => setVoucherPhone(e.target.value)}
                      placeholder="0771234567"
                      className="w-full h-12 px-4 rounded-lg border bg-background text-center focus:outline-none focus:ring-2" />
                  </div>
                  {result && !result.ok && (
                    <p className="text-sm text-destructive text-center">Could not connect: {result.error}</p>
                  )}
                  <button onClick={onConnect} disabled={connecting || !voucherCode}
                    className="w-full h-12 rounded-lg text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: primary }}>
                    {connecting
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Validating...</>
                      : <><Wifi className="h-4 w-4" /> Connect</>}
                  </button>
                </div>

                {plans.length > 0 && (
                  <>
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Plans</span>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {plans.map((pl) => (
                        <div key={pl.id} className="p-3 rounded-lg border-2 border-border">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold">{pl.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {fmtDuration(pl.duration_minutes)} · {fmtSpeed(pl.rate_limit_down_kbps)} · {fmtData(pl.data_limit_mb)}
                              </p>
                            </div>
                            <p className="font-bold" style={{ color: primary }}>
                              {pl.price.toLocaleString()} <span className="text-xs font-normal">{pl.currency || currency}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
