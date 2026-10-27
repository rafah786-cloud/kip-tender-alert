import { getRequest } from "@tanstack/react-start/server";

export const ADMIN_SESSION_COOKIE = "__Host-tender_watch_admin";
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_ADMIN_TOKEN_LENGTH = 32;

function configuredAdminToken(): string | null {
  const token = process.env.TENDER_WATCH_ADMIN_TOKEN?.trim();
  return token && token.length >= MIN_ADMIN_TOKEN_LENGTH ? token : null;
}

export function isAdminTokenConfigured(): boolean {
  return configuredAdminToken() !== null;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacBase64Url(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return encodeBase64Url(new Uint8Array(signature));
}

// Hash both inputs first so equality checking does not reveal the supplied
// token's length. The configured administrator token must be random and >=32 chars.
async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function verifyAdminToken(candidate: unknown): Promise<boolean> {
  const token = configuredAdminToken();
  if (!token || typeof candidate !== "string" || candidate.length < MIN_ADMIN_TOKEN_LENGTH || candidate.length > 512) {
    return false;
  }
  return constantTimeEqual(candidate, token);
}

export async function createAdminSessionCookieValue(): Promise<string> {
  const token = configuredAdminToken();
  if (!token) throw new Error("TENDER_WATCH_ADMIN_TOKEN is not configured");

  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payload = `${Math.floor(Date.now() / 1000)}.${encodeBase64Url(nonce)}`;
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(payload));
  const signature = await hmacBase64Url(encodedPayload, token);
  return `${encodedPayload}.${signature}`;
}

export function adminSessionCookieHeader(value: string): string {
  return `${ADMIN_SESSION_COOKIE}=${value}; Path=/; Max-Age=${ADMIN_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAdminSessionCookieHeader(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

export async function isAdminSession(request: Request): Promise<boolean> {
  const secret = configuredAdminToken();
  if (!secret) return false;

  const session = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!session) return false;

  const parts = session.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [encodedPayload, signature] = parts;

  let payload: string;
  try {
    payload = new TextDecoder().decode(decodeBase64Url(encodedPayload));
  } catch {
    return false;
  }

  const payloadParts = payload.split(".");
  if (payloadParts.length !== 2 || !payloadParts[1]) return false;
  const issuedAt = Number(payloadParts[0]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 60 || now - issuedAt > ADMIN_SESSION_TTL_SECONDS) {
    return false;
  }

  const expectedSignature = await hmacBase64Url(encodedPayload, secret);
  return constantTimeEqual(signature, expectedSignature);
}

export async function assertAdminSession(): Promise<void> {
  const request = getRequest();
  if (!request || !(await isAdminSession(request))) {
    throw new Error("Unauthorized: administrator access required");
  }
}
