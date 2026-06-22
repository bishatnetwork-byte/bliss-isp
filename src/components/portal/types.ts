import type { PortalPayload, RedeemResult } from "@/lib/portal.functions";

export type PortalDesignProps = {
  settings: NonNullable<PortalPayload["settings"]>;
  plans: PortalPayload["plans"];
  voucherCode: string;
  setVoucherCode: (v: string) => void;
  voucherPhone: string;
  setVoucherPhone: (v: string) => void;
  connecting: boolean;
  result: RedeemResult | null;
  onConnect: () => void;
  onReset: () => void;
  currency: string;
};

export function fmtDuration(mins: number) {
  if (!mins) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (mins < 1440) return m ? `${h}h ${m}m` : `${h} hour${h !== 1 ? "s" : ""}`;
  const d = Math.floor(mins / 1440);
  return `${d} day${d !== 1 ? "s" : ""}`;
}

export function fmtData(mb: number | null) {
  if (!mb) return "Unlimited";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function fmtSpeed(downKbps: number | null) {
  if (!downKbps) return "Standard";
  if (downKbps >= 1000) return `${(downKbps / 1000).toFixed(0)} Mbps`;
  return `${downKbps} Kbps`;
}
