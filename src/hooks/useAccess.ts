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

const VIEWER_HIDDEN = new Set(["/withdraw", "/admin", "/smscredit", "/bulksms", "/sell"]);
const STAFF_HIDDEN = new Set(["/admin", "/withdraw"]);

/** Returns whether a sidebar route should be visible for the given access. */
export function canSeeRoute(access: Access | undefined, to: string): boolean {
  if (!access) return true;
  const { tenantRole, isPlatformAdmin, allowedTabs } = access;
  if (isPlatformAdmin || tenantRole === "owner") return true;
  if (allowedTabs && allowedTabs.length > 0) {
    // explicit allowlist (route path without leading slash)
    return allowedTabs.includes(to.replace(/^\//, ""));
  }
  if (tenantRole === "admin") return to !== "/admin" || isPlatformAdmin;
  if (tenantRole === "staff") return !STAFF_HIDDEN.has(to);
  if (tenantRole === "viewer") return !VIEWER_HIDDEN.has(to);
  return true;
}
