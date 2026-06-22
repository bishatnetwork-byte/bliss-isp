import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { listSettings, updateSetting } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — HotspotPro" }] }),
  component: SettingsPage,
});

type Settings = Record<string, Record<string, unknown>>;

function SettingsPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listSettings);
  const fnSave = useServerFn(updateSetting);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => fn() });
  const [s, setS] = useState<Settings>({});
  useEffect(() => {
    if (data) {
      const map: Settings = {};
      for (const row of data) map[row.key] = row.value as Record<string, unknown>;
      setS(map);
    }
  }, [data]);

  async function save(key: string) {
    try {
      await fnSave({ data: { key, value: s[key] ?? {} } });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  function setVal(group: string, key: string, value: unknown) {
    setS({ ...s, [group]: { ...(s[group] ?? {}), [key]: value } });
  }

  const company = s.company ?? {};
  const branding = s.branding ?? {};
  const portal = s.portal ?? {};
  const payments = s.payments ?? {};

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader><CardTitle>Company</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Name</Label><Input value={String(company.name ?? "")} onChange={(e) => setVal("company", "name", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Email</Label><Input value={String(company.email ?? "")} onChange={(e) => setVal("company", "email", e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={String(company.phone ?? "")} onChange={(e) => setVal("company", "phone", e.target.value)} /></div>
          </div>
          <div><Label>Address</Label><Input value={String(company.address ?? "")} onChange={(e) => setVal("company", "address", e.target.value)} /></div>
          <Button onClick={() => save("company")}>Save company</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Portal</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Title</Label><Input value={String(portal.title ?? "")} onChange={(e) => setVal("portal", "title", e.target.value)} /></div>
          <div><Label>Tagline</Label><Input value={String(portal.tagline ?? "")} onChange={(e) => setVal("portal", "tagline", e.target.value)} /></div>
          <Button onClick={() => save("portal")}>Save portal</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Primary color</Label><Input value={String(branding.primary ?? "")} onChange={(e) => setVal("branding", "primary", e.target.value)} /></div>
          <div><Label>Logo URL</Label><Input value={String(branding.logo_url ?? "")} onChange={(e) => setVal("branding", "logo_url", e.target.value)} /></div>
          <Button onClick={() => save("branding")}>Save branding</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={!!payments.mpesa_enabled} onCheckedChange={(v) => setVal("payments", "mpesa_enabled", v)} />
            <Label>Enable M-Pesa STK Push</Label>
          </div>
          <div><Label>Currency</Label><Input value={String(payments.currency ?? "KES")} onChange={(e) => setVal("payments", "currency", e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">
            To accept live M-Pesa payments, add <code>MPESA_CONSUMER_KEY</code>, <code>MPESA_CONSUMER_SECRET</code>, <code>MPESA_SHORTCODE</code>, and <code>MPESA_PASSKEY</code> as project secrets.
          </p>
          <Button onClick={() => save("payments")}>Save payments</Button>
        </CardContent>
      </Card>
    </div>
  );
}
