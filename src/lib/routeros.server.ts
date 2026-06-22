// MikroTik RouterOS REST API helper.
// Requires RouterOS v7.1+ with /ip/service www-ssl enabled (or www if use_tls=false).
import { Buffer } from "node:buffer";

export interface RouterCreds {
  host: string;
  port: number;
  username: string;
  password: string;
  use_tls: boolean;
}

function baseUrl(c: RouterCreds) {
  const scheme = c.use_tls ? "https" : "http";
  return `${scheme}://${c.host}:${c.port}/rest`;
}

function authHeader(c: RouterCreds) {
  return "Basic " + Buffer.from(`${c.username}:${c.password}`).toString("base64");
}

async function call(c: RouterCreds, method: string, path: string, body?: unknown) {
  const res = await fetch(baseUrl(c) + path, {
    method,
    headers: {
      Authorization: authHeader(c),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    // Workers honor a small fetch timeout via AbortSignal:
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    throw new Error(`RouterOS ${method} ${path} ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

export const ros = {
  ping: (c: RouterCreds) => call(c, "GET", "/system/resource"),
  identity: (c: RouterCreds) => call(c, "GET", "/system/identity"),
  hotspotActive: (c: RouterCreds) => call(c, "GET", "/ip/hotspot/active"),
  hotspotUsers: (c: RouterCreds) => call(c, "GET", "/ip/hotspot/user"),
  addHotspotUser: (c: RouterCreds, u: { name: string; password: string; profile?: string; "limit-uptime"?: string; "limit-bytes-total"?: string }) =>
    call(c, "PUT", "/ip/hotspot/user", u),
  removeHotspotUser: (c: RouterCreds, id: string) =>
    call(c, "DELETE", `/ip/hotspot/user/${encodeURIComponent(id)}`),
  disconnectActive: (c: RouterCreds, id: string) =>
    call(c, "DELETE", `/ip/hotspot/active/${encodeURIComponent(id)}`),
  hotspotProfiles: (c: RouterCreds) => call(c, "GET", "/ip/hotspot/user/profile"),
  addProfile: (c: RouterCreds, p: { name: string; "rate-limit"?: string; "shared-users"?: string; "session-timeout"?: string }) =>
    call(c, "PUT", "/ip/hotspot/user/profile", p),
};
