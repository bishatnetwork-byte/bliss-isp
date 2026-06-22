// Node adapter for the TanStack Start / Cloudflare-shaped server bundle.
// Imports the `{ fetch }` default export from dist/server/server.js and
// serves it over a real Node HTTP listener so PM2 + nginx can reach it.
//
// Run: node scripts/vps-node-adapter.mjs   (PORT defaults to 3001)

import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(__dirname, "..", "dist", "server", "server.js");

const mod = await import(ENTRY);
const handler = mod.default ?? mod;
if (typeof handler?.fetch !== "function") {
  console.error("[adapter] dist/server/server.js has no default.fetch export");
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "127.0.0.1";

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
