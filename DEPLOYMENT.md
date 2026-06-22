# HotspotPro — VPS Deployment (same droplet as Bliss-ISP)

HotspotPro runs as a **Node SSR service** behind Nginx, sharing the existing
Bliss-ISP DigitalOcean droplet. Every outbound call (MarsPay, WizaSMS,
MikroTik REST) leaves from the VPS public IP because the Node process owns
all server functions — no extra proxy needed.

---

## 1. One-paste bootstrap (run once on the VPS)

SSH into the same droplet that hosts bliss-isp, then paste **one** block:

```bash
sudo DOMAIN=app.bliss-isp.com \
     GITHUB_REPO=https://github.com/<OWNER>/<REPO>.git \
     ADMIN_EMAIL=admin@bliss-isp.com \
     bash <(curl -fsSL https://raw.githubusercontent.com/<OWNER>/<REPO>/main/scripts/vps-bootstrap.sh)
```

What it does:

1. Installs Node 20, Nginx, PM2, Certbot (skips anything already there — won't disturb bliss-isp).
2. Clones the repo to `/var/www/hotspotpro` and writes a placeholder `.env`.
3. Builds TanStack Start with `NITRO_PRESET=node-server`.
4. Registers a PM2 app `hotspotpro` listening on `127.0.0.1:3001`.
5. Drops an Nginx site `hotspotpro.conf` reverse-proxying your domain → port 3001.
6. Issues a Let's Encrypt cert if DNS already points at the droplet.

Then edit secrets and restart:

```bash
sudo nano /var/www/hotspotpro/.env       # fill Supabase + MarzPay + WizaSMS keys
pm2 restart hotspotpro --update-env
```

---

## 2. DNS

Add an **A record** (or CNAME → `bliss-isp.com`) for `app.bliss-isp.com` pointing at the same VPS IP. The bootstrap will obtain SSL on the next run.

---

## 3. Continuous deploy via GitHub Actions

Add these **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DO_VPS_HOST` | droplet IP (same as bliss-isp) |
| `DO_VPS_USER` | usually `root` |
| `DO_VPS_SSH_KEY` | private SSH key (same as bliss-isp) |
| `DO_VPS_DEPLOY_PATH` *(optional)* | defaults to `/var/www/hotspotpro` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` *(optional)* | deploy notifications |

Every push to `main` runs `.github/workflows/deploy-digitalocean.yml`:
rsync → `npm install` → `npm run build` → `pm2 reload hotspotpro`.

---

## 4. Why all outbound calls hit the VPS IP

`createServerFn` handlers (MarzPay STK Push, WizaSMS, MikroTik REST, router
sync, etc.) execute **inside the Node process running on the droplet**.
Any `fetch(...)` they make leaves the VPS interface, so providers see a
single static IP — whitelist that IP once on:

* **MarsPay** dashboard → API IP allowlist
* **WizaSMS** dashboard → IP restrictions
* **Each tenant's MikroTik** → only accept REST from `<VPS_IP>` on the
  `www-ssl` service.

Clients still talk to `https://app.bliss-isp.com`; Nginx
terminates TLS and proxies to the Node app on `127.0.0.1:3001`.

---

## 5. Useful commands

```bash
pm2 status                       # process list
pm2 logs hotspotpro              # tail logs
pm2 restart hotspotpro           # restart after .env edit
sudo bash /var/www/hotspotpro/scripts/vps-deploy.sh   # manual redeploy
sudo nginx -t && sudo systemctl reload nginx          # after editing nginx
sudo certbot renew --dry-run                          # test SSL renewal
```

---

## 6. Coexistence with Bliss-ISP

* Bliss-ISP static site keeps serving on its own domain (no changes).
* HotspotPro nginx site is scoped to `server_name app.bliss-isp.com` only.
* Different deploy paths, different PM2 app names, different ports — zero overlap.
