import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { portalPlans, redeemVoucher } from "@/lib/portal.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wifi, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/portal")({
  ssr: true,
  head: () => ({ meta: [
    { title: "WiFi Access — HotspotPro" },
    { name: "description", content: "Buy WiFi access or redeem a voucher code." },
    { property: "og:title", content: "WiFi Access" },
    { property: "og:description", content: "Buy a plan or redeem a voucher to connect." },
    { property: "og:type", content: "website" },
  ]}),
  component: PortalPage,
});

function PortalPage() {
  const fn = useServerFn(portalPlans);
  const fnRedeem = useServerFn(redeemVoucher);
  const { data: plans } = useQuery({ queryKey: ["portal-plans"], queryFn: () => fn() });
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ username: string; password: string; message: string } | null>(null);

  async function redeem() {
    try {
      const r = await fnRedeem({ data: { code } });
      if (!r.ok) { toast.error(r.error ?? "Failed"); return; }
      setResult({ username: r.username!, password: r.password!, message: r.message! });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Wifi className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">WiFi Access</h1>
          <p className="text-sm text-muted-foreground">Connect in seconds</p>
        </div>
      </div>

      <div className="w-full max-w-2xl">
        <Tabs defaultValue="redeem">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="redeem">Redeem voucher</TabsTrigger>
            <TabsTrigger value="buy">Buy a plan</TabsTrigger>
          </TabsList>

          <TabsContent value="redeem">
            <Card>
              <CardContent className="p-6 space-y-4">
                {result ? (
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-full bg-success/20 flex items-center justify-center">
                      <Check className="w-6 h-6 text-success" />
                    </div>
                    <p>{result.message}</p>
                    <div className="bg-muted p-4 rounded-lg font-mono text-lg">{result.username}</div>
                    <Button onClick={() => { setResult(null); setCode(""); }}>Done</Button>
                  </div>
                ) : (
                  <>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter voucher code" className="text-center text-lg font-mono uppercase" />
                    <Button className="w-full" onClick={redeem} disabled={!code}>Redeem</Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="buy">
            <div className="grid gap-3 md:grid-cols-2">
              {(plans ?? []).length === 0 && (
                <Card className="md:col-span-2"><CardContent className="p-6 text-center text-muted-foreground">No plans available yet.</CardContent></Card>
              )}
              {plans?.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-5">
                    <div className="text-lg font-bold">{p.name}</div>
                    <div className="text-xs text-muted-foreground mb-3">{p.description}</div>
                    <div className="text-2xl font-bold text-primary">{p.currency} {Number(p.price).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground mt-1">{p.duration_minutes} minutes</div>
                    {p.rate_limit_down_kbps && <div className="text-xs">{p.rate_limit_down_kbps}↓ / {p.rate_limit_up_kbps}↑ kbps</div>}
                    <Button className="w-full mt-3" onClick={() => toast.info("M-Pesa STK Push activates once Daraja credentials are added in Settings.")}>Buy with M-Pesa</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
