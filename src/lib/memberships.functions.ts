import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MemberRole = z.enum(["owner", "admin", "staff", "viewer"]);

/** Returns the caller's effective role for their active tenant. */
export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: roles }, { data: memberships }, { data: ownerId }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("tenant_memberships")
        .select("tenant_owner_id, role, allowed_tabs, created_at")
        .eq("member_id", userId)
        .order("created_at", { ascending: true }),
      supabase.rpc("effective_owner_for", { _uid: userId }),
    ]);
    const platformRoles = (roles ?? []).map((r) => r.role as string);
    const isPlatformAdmin = platformRoles.includes("admin");
    const effectiveOwnerId = (ownerId as unknown as string) ?? userId;
    const isOwner = effectiveOwnerId === userId;
    const m = (memberships ?? []).find((mm) => mm.tenant_owner_id === effectiveOwnerId);
    const tenantRole = isOwner ? "owner" : (m?.role as string | undefined) ?? "viewer";
    const allowedTabs = (m?.allowed_tabs as string[] | null) ?? null;
    return {
      userId,
      isPlatformAdmin,
      platformRoles,
      effectiveOwnerId,
      tenantRole,
      allowedTabs,
      memberships: memberships ?? [],
    };
  });

/** Lists the members of the caller's tenant. Owner or platform admin only. */
export const listTenantMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: ownerData } = await supabase.rpc("effective_owner_for", { _uid: userId });
    const ownerId = (ownerData as unknown as string) ?? userId;
    const { data, error } = await supabase
      .from("tenant_memberships")
      .select("id, tenant_owner_id, member_id, role, allowed_tabs, created_at")
      .eq("tenant_owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    // Look up profiles for nice display
    const memberIds = (data ?? []).map((d) => d.member_id);
    const ids = Array.from(new Set([...memberIds, ownerId]));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, phone")
      .in("id", ids);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return {
      ownerId,
      owner: profileMap.get(ownerId) ?? null,
      members: (data ?? []).map((m) => ({
        ...m,
        profile: profileMap.get(m.member_id) ?? null,
      })),
    };
  });

/** Invite by existing user email. Caller must be the tenant owner or platform admin. */
export const inviteTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        role: MemberRole.exclude(["owner"]),
        allowed_tabs: z.array(z.string()).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Authorization
    const { data: ownerData } = await supabase.rpc("effective_owner_for", { _uid: userId });
    const ownerId = (ownerData as unknown as string) ?? userId;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin && ownerId !== userId) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find or create the auth user by email
    let memberId: string | null = null;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
    );
    if (existing) {
      memberId = existing.id;
    } else {
      const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.email,
      );
      if (inviteErr) throw new Error(inviteErr.message);
      memberId = invited.user?.id ?? null;
    }
    if (!memberId) throw new Error("Could not resolve member id");

    const { data: row, error } = await supabaseAdmin
      .from("tenant_memberships")
      .upsert(
        {
          tenant_owner_id: ownerId,
          member_id: memberId,
          role: data.role,
          allowed_tabs: data.allowed_tabs,
        },
        { onConflict: "tenant_owner_id,member_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await supabase.rpc("rpc_log_event", {
      _action: "member_invited",
      _entity: "tenant_memberships",
      _metadata: { member_id: memberId, role: data.role, email: data.email },
    });
    return row;
  });

export const updateTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        member_id: z.string().uuid(),
        role: MemberRole.exclude(["owner"]).optional(),
        allowed_tabs: z.array(z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ownerData } = await supabase.rpc("effective_owner_for", { _uid: userId });
    const ownerId = (ownerData as unknown as string) ?? userId;
    if (ownerId !== userId) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Forbidden");
    }
    const patch: Record<string, unknown> = {};
    if (data.role) patch.role = data.role;
    if (data.allowed_tabs) patch.allowed_tabs = data.allowed_tabs;
    const { error } = await supabase
      .from("tenant_memberships")
      .update(patch)
      .eq("tenant_owner_id", ownerId)
      .eq("member_id", data.member_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ member_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ownerData } = await supabase.rpc("effective_owner_for", { _uid: userId });
    const ownerId = (ownerData as unknown as string) ?? userId;
    if (ownerId !== userId) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Forbidden");
    }
    const { error } = await supabase
      .from("tenant_memberships")
      .delete()
      .eq("tenant_owner_id", ownerId)
      .eq("member_id", data.member_id);
    if (error) throw new Error(error.message);
    await supabase.rpc("rpc_log_event", {
      _action: "member_removed",
      _entity: "tenant_memberships",
      _metadata: { member_id: data.member_id },
    });
    return { ok: true };
  });
