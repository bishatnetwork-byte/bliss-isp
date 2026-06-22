// Simple AES-GCM encryption for stored router passwords.
// Uses ROUTER_SECRET_KEY (any string) — derives a 32-byte key via SHA-256.
import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";

const crypto: Crypto = (globalThis.crypto as Crypto) ?? (webcrypto as unknown as Crypto);

async function getKey() {
  const secret = process.env.ROUTER_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-fallback-key-change-me";
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `v1:${Buffer.from(iv).toString("base64")}:${Buffer.from(new Uint8Array(ct)).toString("base64")}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [v, ivB64, ctB64] = payload.split(":");
  if (v !== "v1") throw new Error("Unsupported cipher version");
  const key = await getKey();
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
