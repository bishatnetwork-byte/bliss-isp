// Node adapter for the TanStack Start / Cloudflare-shaped server bundle.
// Imports the `{ fetch }` default export from dist/server/server.js and
// serves it over a real Node HTTP listener so PM2 + nginx can reach it.
//
// Run: node scripts/vps-node-adapter.mjs   (PORT defaults to 3001)

import { createServer } from "node:http";
import { createReadStream, readFileSync, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { resolve, dirname, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root BEFORE importing the server bundle.
// PM2's `env_file` option is not real — without this, SUPABASE_URL etc. are undefined.
const ENV_PATH = resolve(__dirname, "..", ".env");
if (existsSync(ENV_PATH)) {
  const raw = readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
  console.log(`[adapter] loaded env from ${ENV_PATH}`);
}

// The VPS .env template includes both browser build keys (VITE_*) and server
// runtime keys. If only one side is filled in, mirror it before the server
// bundle initializes so authenticated backend calls can still boot correctly.
const mirrorEnv = (serverKey, viteKey) => {
  if (!process.env[serverKey] && process.env[viteKey]) process.env[serverKey] = process.env[viteKey];
  if (!process.env[viteKey] && process.env[serverKey]) process.env[viteKey] = process.env[serverKey];
};

mirrorEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
mirrorEnv("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");

const ENTRY = resolve(__dirname, "..", "dist", "server", "server.js");

const mod = await import(ENTRY);
const handler = mod.default ?? mod;
if (typeof handler?.fetch !== "function") {
  console.error("[adapter] dist/server/server.js has no default.fetch export");
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "127.0.0.1";
const STATIC_ROOTS = [
  resolve(__dirname, "..", "dist", "client"),
  resolve(__dirname, "..", "dist", "public"),
  resolve(__dirname, "..", ".output", "public"),
  resolve(__dirname, "..", "public"),
];
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function toWebRequest(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `${HOST}:${PORT}`;
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, String(v));
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function tryServeStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  for (const root of STATIC_ROOTS) {
    const filePath = resolve(root, relativePath);
    if (!filePath.startsWith(root)) continue;
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;
      res.statusCode = 200;
      res.setHeader("Content-Type", CONTENT_TYPES[extname(filePath)] || "application/octet-stream");
      if (pathname.startsWith("/assets/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "public, max-age=300");
      if (req.method === "HEAD") return res.end(), true;
      createReadStream(filePath).pipe(res);
      return true;
    } catch {
      // Try the next static root, then fall back to SSR.
    }
  }
  return false;
}

async function sendWebResponse(res, webRes) {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  if (!webRes.body) return res.end();
  const nodeStream = Readable.fromWeb(webRes.body);
  nodeStream.pipe(res);
}

const env = { ...process.env };

const server = createServer(async (req, res) => {
  try {
    if (await tryServeStatic(req, res)) return;
    const webReq = toWebRequest(req);
    const webRes = await handler.fetch(webReq, env, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });
    await sendWebResponse(res, webRes);
  } catch (err) {
    console.error("[adapter] request error:", err);
    if (!res.headersSent) res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[adapter] hotspotpro listening on http://${HOST}:${PORT}`);
});
