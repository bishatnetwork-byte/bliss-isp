
# HotspotPro Backend — Implementation Plan

You uploaded a 5,121-line single-file admin UI for a MikroTik billing system. Below is what I'll build to turn it into a deployable full-stack app on TanStack Start + Lovable Cloud.

You didn't specify routers/payment provider, so I'm proposing sensible defaults. Tell me if any of these need to change.

## 1. Architecture

```text
Browser (React app)
   │  fetch / server fns
   ▼
TanStack Start server (Cloudflare Workers)
   │
   ├── Lovable Cloud (Postgres + Auth + Storage)
   ├── RouterOS REST API  (HTTPS to each router)
   └── M-Pesa Daraja API  (default payment provider)
```

**Important constraint:** TanStack Start runs on Cloudflare Workers, which **cannot open raw TCP sockets** to the classic RouterOS API on port 8728/8729. So the backend will talk to routers over the **RouterOS REST API (HTTPS, RouterOS v7.1+)**. Each router must have `/ip/service` `www-ssl` enabled and be reachable from the internet (public IP, DDNS, or a tunnel like Cloudflare Tunnel / Tailscale).

If you have older RouterOS or routers behind NAT with no tunnel, we'd instead need a small self-hosted "agent" container per site that proxies API calls. I'll skip that for now and assume REST.

## 2. Scope (what I'll build this turn)

### Database (Lovable Cloud / Postgres)
- `profiles` — admin/operator users, linked to `auth.users`
- `user_roles` + `app_role` enum (`admin`, `operator`, `viewer`) with `has_role()` security-definer function
- `routers` — name, host, username, encrypted password, port, status, last_seen
- `plans` — name, price, duration, rate-limits, shared-users, validity
- `customers` — hotspot end-users (name, phone, email, address)
- `vouchers` — code, plan_id, status, used_by, expires_at, created_by, router_id
- `subscriptions` — customer_id, plan_id, start/end, status
- `invoices` + `payments` — amount, method, mpesa receipt, status
- `sessions` — uptime/bytes, cached from RouterOS for reporting
- `audit_logs` — who did what
- `settings` — company info, branding, M-Pesa creds reference, SMS reference

All tables: RLS on, `GRANT`s for `authenticated` + `service_role`, policies scoped to `has_role()`.

### Server functions (`createServerFn`)
- Auth-gated CRUD for every table above
- `routers.test()` — ping RouterOS REST `/system/resource`
- `routers.sync()` — pull active hotspot users + sessions
- `vouchers.generate()` — batch-create codes, push to selected router
- `vouchers.revoke()` — remove from router + mark used
- `hotspot.disconnectActive()` — kick a session
- `plans.applyToRouter()` — create matching user profile on RouterOS
- `payments.mpesaSTK()` — initiate STK Push
- `reports.dashboard()` — KPIs for the dashboard cards

### Public routes (`/api/public/*`)
- `POST /api/public/webhooks/mpesa` — Daraja callback (signature/shortcode check)
- `POST /api/public/portal/purchase` — captive-portal buy flow
- `POST /api/public/portal/redeem` — voucher redemption
- `GET  /api/public/plans` — public plan list for the portal

### Frontend (port the HTML to React routes)
- `_authenticated/` admin app: Dashboard, Routers, Plans, Customers, Vouchers, Sessions, Invoices, Payments, Reports, Settings, Users
- Shared sidebar + dark theme matching your HTML (`#2563eb` accent, GitHub-dark palette)
- Recharts for the chart blocks in the HTML
- TanStack Query + suspense loaders
- `/auth` login/signup
- `/portal` public captive portal (buy plan / redeem voucher / pay with M-Pesa)
- `404` + error boundaries

### Notifications
- Email via Lovable AI Gateway is not for email — I'll wire **Resend** (you add `RESEND_API_KEY` later) for receipts and voucher delivery.
- SMS: stub interface; African Talking or Twilio can be plugged in later — left as a `notifications.sms()` adapter with a no-op default so it doesn't block deployment.

### Deployment readiness
- Sitemap + robots
- SEO meta on public routes
- Security scan before publish
- Env validation at boot (fail loudly if `MPESA_*` missing in prod)

## 3. Defaults I'm assuming (override any of these)

| Decision | Default | Override by saying… |
|---|---|---|
| Router protocol | RouterOS REST (HTTPS) | "use the classic API via agent" |
| Number of routers | many (multi-tenant per operator) | "single router only" |
| Payments | **M-Pesa Daraja (STK Push)** | "use Stripe" / "use Paystack" / "skip payments" |
| Currency | KES | "use USD" / other |
| Notifications | Email (Resend) only, SMS stub | "wire Twilio SMS too" |
| Roles | admin / operator / viewer | tell me the role set you want |

## 4. What I'll need from you after the build

1. **Enable Lovable Cloud** — I'll prompt this first.
2. **M-Pesa Daraja creds** (Consumer Key, Consumer Secret, Shortcode, Passkey) — added via secrets, not committed.
3. **Resend API key** for email.
4. **For each router**: host (IP/DDNS), HTTPS port (default 443), username, password — entered through the Routers UI, password stored encrypted at rest.

## 5. Out of scope for this turn (call out if you want them now)

- RADIUS/Coova integration
- PPPoE/DHCP lease billing (only hotspot)
- Mobile app
- Multi-currency / multi-language
- White-label tenant isolation across separate domains
- Live RouterOS firmware upgrade orchestration

---

If this matches what you want, reply "go" (or with any overrides) and I'll start by enabling Lovable Cloud and laying down the schema + auth, then build outward from there. Expect this to be built across multiple turns — it's a lot of surface area.
