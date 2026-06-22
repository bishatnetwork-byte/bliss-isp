import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Platform-wide earnings + wallet snapshot. Owner / platform admin / tenant admin. */
export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: ownerData } = await supabase.rpc("effective_owner_for", { _uid: userId });
    const ownerId = (ownerData as unknown as string) ?? userId;

    const [paymentsRes, withdrawalsRes, smsRes, walletRes, feeWdRes] = await Promise.all([
      supabase
        .from("payments")
        .select("amount,method,status,purpose,plan_name,created_at")
        .eq("owner_id", ownerId)
        .in("status", ["success", "completed"])
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("withdrawals")
        .select("amount,fee,net,status,created_at")
        .eq("owner_id", ownerId),
      supabase
        .from("sms_credit_purchases")
        .select("amount,credits,status,created_at")
        .eq("owner_id", ownerId)
        .eq("status", "completed"),
      supabase.from("wallet").select("balance,sms_credits").eq("owner_id", ownerId).maybeSingle(),
      supabase
        .from("fee_withdrawals")
        .select("id,amount,method,destination,status,created_at,reference")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const payments = paymentsRes.data ?? [];
    const withdrawals = withdrawalsRes.data ?? [];
    const sms = smsRes.data ?? [];

    // Use existing system fee-rate defaults (per admin mockup)
    const RATE_ONLINE = 0.02;
    const RATE_OFFLINE = 0.01;
    const RATE_SMS = 0.05;

    let onlineGross = 0, offlineGross = 0, onlineFee = 0, offlineFee = 0;
    const feeLog: { source: string; transaction: string; gross: number; rate: number; fee: number; date: string }[] = [];
    for (const p of payments) {
      const amt = Number(p.amount || 0);
      const m = (p.method || "").toLowerCase();
      const online = m === "mpesa" || m === "marzpay" || m === "mtn" || m === "airtel" || m === "mobile_money";
      const rate = online ? RATE_ONLINE : RATE_OFFLINE;
      const fee = Math.round(amt * rate);
      if (online) { onlineGross += amt; onlineFee += fee; }
      else { offlineGross += amt; offlineFee += fee; }
      if (feeLog.length < 100) {
        feeLog.push({
          source: online ? "Online" : "Offline",
          transaction: p.plan_name ?? p.purpose ?? "Sale",
          gross: amt,
          rate: rate * 100,
          fee,
          date: p.created_at as string,
        });
      }
    }
    let smsGross = 0, smsFee = 0;
    for (const s of sms) {
      const amt = Number(s.amount || 0);
      const fee = Math.round(amt * RATE_SMS);
      smsGross += amt;
      smsFee += fee;
    }
    const totalWithdrawnFees = (withdrawals ?? []).reduce(
      (a, w) => a + (w.status === "completed" || w.status === "success" ? Number(w.fee || 0) : 0),
      0,
    );
    const totalFeesCollected = onlineFee + offlineFee + smsFee + totalWithdrawnFees;
    const totalPaidOut = (feeWdRes.data ?? []).reduce(
      (a, x) => a + (x.status === "completed" ? Number(x.amount || 0) : 0),
      0,
    );
    const feeAvailable = Math.max(0, totalFeesCollected - totalPaidOut);
    const totalWithdrawnWallet = (withdrawals ?? []).reduce(
      (a, w) => a + (w.status === "completed" || w.status === "success" ? Number(w.amount || 0) : 0),
      0,
    );
    const grossRevenue = onlineGross + offlineGross + smsGross;
    const netRevenue = grossRevenue - totalFeesCollected;

    return {
      ownerId,
      platformFees: {
        total: totalFeesCollected,
        online: onlineFee,
        offline: offlineFee,
        sms: smsFee,
        withdrawals: totalWithdrawnFees,
        available: feeAvailable,
        paidOut: totalPaidOut,
      },
      wallet: {
        balance: Number(walletRes.data?.balance ?? 0),
        smsCredits: Number(walletRes.data?.sms_credits ?? 0),
        totalWithdrawn: totalWithdrawnWallet,
        netRevenue,
      },
      feeLog,
      feeWithdrawals: feeWdRes.data ?? [],
    };
  });

/** Audit logs for the caller's tenant. */
export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ownerData } = await supabase.rpc("effective_owner_for", { _uid: userId });
    const ownerId = (ownerData as unknown as string) ?? userId;
    const { data: rows, error } = await supabase
      .from("audit_logs")
      .select("id,actor_id,action,entity,entity_id,metadata,created_at,owner_id")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean) as string[]));
    let actorMap = new Map<string, { display_name: string | null; phone: string | null }>();
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,display_name,phone")
        .in("id", actorIds);
      actorMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    }
    return (rows ?? []).map((r) => ({
      ...r,
      actor: r.actor_id ? actorMap.get(r.actor_id) ?? null : null,
    }));
  });
