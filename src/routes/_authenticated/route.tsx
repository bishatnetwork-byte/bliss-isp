import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Router as RouterIcon, Package, Users, Ticket, Activity,
  FileText, CreditCard, Settings as SettingsIcon, Shield, LogOut, Wifi, Menu, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AdminShell,
});

const nav = [
  { section: "Overview", items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ]},
  { section: "Network", items: [
    { to: "/routers", label: "Routers", icon: RouterIcon },
    { to: "/sessions", label: "Active Sessions", icon: Activity },
  ]},
  { section: "Billing", items: [
    { to: "/plans", label: "Plans", icon: Package },
    { to: "/customers", label: "Customers", icon: Users },
    { to: "/vouchers", label: "Vouchers", icon: Ticket },
    { to: "/invoices", label: "Invoices", icon: FileText },
    { to: "/payments", label: "Payments", icon: CreditCard },
  ]},
  { section: "Admin", items: [
    { to: "/users", label: "Users & Roles", icon: Shield },
    { to: "/settings", label: "Settings", icon: SettingsIcon },
  ]},
] as const;

function AdminShell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.navigate({ to: "/auth", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-4 py-4 border-b border-sidebar-border flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Wifi className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-sidebar-foreground">HotspotPro</div>
            <div className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wider">MikroTik Billing</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {nav.map((g) => (
            <div key={g.section} className="mb-2">
              <div className="px-4 py-1 text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-wider">{g.section}</div>
              {g.items.map((it) => (
                <Link key={it.to} to={it.to} onClick={() => setOpen(false)}
                  activeProps={{ className: "bg-sidebar-accent text-sidebar-foreground border-l-primary" }}
                  className="flex items-center gap-3 mx-2 my-0.5 px-3 py-2 text-sm rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent border-l-2 border-transparent transition">
                  <it.icon className="w-4 h-4" />
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/60 truncate mb-2">{email}</div>
          <Button size="sm" variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 lg:ml-60 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
          <button onClick={() => setOpen(!open)} className="text-foreground">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="text-sm font-semibold">HotspotPro</span>
          <span className="w-5" />
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
