import { deflate, inflate } from "pako";
import type { LanguageId } from "@/adapters/types";

export interface SharePayload {
  v: 1;
  lang: LanguageId;
  source: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeShare(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const compressed = deflate(json);
  return base64UrlEncode(compressed);
}

export function decodeShare(encoded: string): SharePayload | null {
  try {
    const bytes = base64UrlDecode(encoded);
    const json = inflate(bytes, { to: "string" });
    const parsed = JSON.parse(json) as Partial<SharePayload>;
    if (parsed.v !== 1 || !parsed.lang || typeof parsed.source !== "string") return null;
    return parsed as SharePayload;
  } catch {
    return null;
  }
}
