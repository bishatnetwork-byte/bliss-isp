import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess } from "@/lib/memberships.functions";

export type Access = Awaited<ReturnType<typeof getMyAccess>>;

export function useAccess() {
  const fn = useServerFn(getMyAccess);
  return useQuery({
    queryKey: ["my-access"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
}

/** Returns whether a sidebar route should be visible for the given access. */
export function canSeeRoute(access: Access | undefined, to: string): boolean {
  if (!access) return true;
  const { isPlatformAdmin, allowedTabs } = access;
  // Admin Panel is platform-admin only.
  if (to === "/admin") return !!isPlatformAdmin;
  // Per-user tab allowlist (set by admin) takes precedence.
  if (allowedTabs && allowedTabs.length > 0) {
    return allowedTabs.includes(to.replace(/^\//, ""));
  }
  // Default: every signed-in user sees every non-admin tab.
  return true;
}
