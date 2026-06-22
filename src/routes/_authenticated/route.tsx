import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, canSeeRoute } from "@/hooks/useAccess";
import { getDashboardStats } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AdminShell,
});

type NavItem = { to: string; label: string; icon: string; badgeId?: string };
type NavGroup = { section: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { section: "Overview", items: [
    { to: "/dashboard", label: "Dashboard", icon: "🏠" },
    { to: "/sell", label: "Sell / Create", icon: "🛒" },
  ]},
  { section: "Vouchers", items: [
    { to: "/vouchers", label: "Voucher Manager", icon: "🎫", badgeId: "nb-v" },
    { to: "/printcenter", label: "Print Center", icon: "🖨️" },
    { to: "/captive", label: "Captive Portal", icon: "🌐" },
    { to: "/wifiprices", label: "WiFi Prices", icon: "💰" },
  ]},
  { section: "Clients & Payments", items: [
    { to: "/payments", label: "Payments", icon: "💳", badgeId: "nb-p" },
    { to: "/clients", label: "Live Clients", icon: "👥" },
    { to: "/wifiusers", label: "WiFi Users", icon: "🏆" },
  ]},
  { section: "Messaging", items: [
    { to: "/smscredit", label: "SMS Credit", icon: "💳" },
    { to: "/bulksms", label: "Bulk SMS", icon: "📨" },
  ]},
  { section: "Wallet", items: [
    { to: "/withdraw", label: "Withdraw", icon: "🏧" },
  ]},
  { section: "System", items: [
    { to: "/mikrotiks", label: "MikroTik Devices", icon: "📡" },
    { to: "/reports", label: "Reports", icon: "📊" },
    { to: "/settings", label: "Settings", icon: "⚙️" },
  ]},
  { section: "Admin", items: [
    { to: "/admin", label: "Admin Panel", icon: "🛡️" },
  ]},
];

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard", "/sell": "Sell / Create", "/vouchers": "Voucher Manager",
  "/printcenter": "Print Center", "/captive": "Captive Portal", "/wifiprices": "WiFi Prices",
  "/payments": "Payments", "/clients": "Live Clients", "/wifiusers": "WiFi Users",
  "/smscredit": "SMS Credit", "/bulksms": "Bulk SMS", "/withdraw": "Withdraw",
  "/mikrotiks": "MikroTik Devices", "/reports": "Reports", "/settings": "Settings",
  "/admin": "Admin Panel", "/recyclebin": "Recycle Bin", "/routerinfo": "Router Info",
};

function AdminShell() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [email, setEmail] = useState("");
  const [qaOpen, setQaOpen] = useState(false);
  const qaRef = useRef<HTMLDivElement | null>(null);
  const { data: access } = useAccess();

  const statsFn = useServerFn(getDashboardStats);
  const { data: stats } = useQuery({
    queryKey: ["topbar-stats"],
    queryFn: () => statsFn(),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const online = stats?.onlineSessions ?? 0;

  useEffect(() => {
    if (!qaOpen) return;
    const handler = (e: MouseEvent) => {
      if (qaRef.current && !qaRef.current.contains(e.target as Node)) setQaOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [qaOpen]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.navigate({ to: "/auth", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => { setOpen(false); }, [pathname]);

  async function signOut() { await supabase.auth.signOut(); }

  const pageTitle = TITLES[pathname] ?? "HotspotPro";
  const avatarInitial = (email[0] ?? "U").toUpperCase();

  return (
    <>
      <nav id="sidebar" className={open ? "open" : ""}>
        <div className="logo-wrap">
          <div className="logo-mark">📡</div>
          <div>
            <div className="logo-name">HotspotPro</div>
            <div className="logo-tag">MikroTik Billing v2</div>
          </div>
        </div>
        <nav>
          {NAV.map((group) => {
            const visible = group.items.filter((it) => canSeeRoute(access, it.to));
            if (visible.length === 0) return null;
            return (
              <div key={group.section}>
                <div className="nav-section">{group.section}</div>
                {visible.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`nav-item${active ? " active" : ""}`}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="mk-status">
            <div className="mk-dot" />
            <span style={{ color: "rgba(255,255,255,.5)" }}>MikroTik:</span>
            <span style={{ color: "#10b981", fontWeight: 700, marginLeft: 3 }}>Online</span>
          </div>
          <div className="mk-host">{email || "—"}</div>
        </div>
      </nav>

      <div id="sidebar-backdrop" className={open ? "open" : ""} onClick={() => setOpen(false)} />

      <div id="main">
        <div id="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="menu-btn"
              style={{ display: "inline-flex" }}
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle menu"
            >☰</button>
            <div className="page-title">{pageTitle}</div>
          </div>
          <div className="topbar-right">
            <button
              className="theme-btn"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="Toggle theme"
              title="Toggle theme"
            >{theme === "dark" ? "🌙" : "☀️"}</button>
            <button className="tb-btn" onClick={signOut} title="Sign out">
              <span>⎋</span> Sign out
            </button>
            <div className="avatar" title={email}>{avatarInitial}</div>
          </div>
        </div>
        <div id="content">
          <Outlet />
        </div>
      </div>
    </>
  );
}
