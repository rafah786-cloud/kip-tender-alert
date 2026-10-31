import { getRequest } from "@tanstack/react-start/server";
import { getServerRuntimeEnv, createServerSupabaseClient } from "./runtime-env.server";

export const ADMIN_SESSION_COOKIE = "__Host-tender_watch_admin";
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_ADMIN_TOKEN_LENGTH = 32;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredAdminToken(): string | null {
  const token = getServerRuntimeEnv("TENDER_WATCH_ADMIN_TOKEN");
  return token && token.length >= MIN_ADMIN_TOKEN_LENGTH ? token : null;
}

function getAdminSessionStore() {
  const url = getServerRuntimeEnv("SUPABASE_URL");
  const serviceRoleKey = getServerRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Administrator session store is not configured.");
  return createServerSupabaseClient(url, serviceRoleKey);
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
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return encodeBase64Url(new Uint8Array(signature));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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

export function isAdminSessionTimestampValid(issuedAt: number, now: number): boolean {
  return Number.isSafeInteger(issuedAt)
    && issuedAt > 0
    && issuedAt <= now + 60
    && now - issuedAt <= ADMIN_SESSION_TTL_SECONDS;
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

  // The signed payload carries a unique session ID; only its hash is persisted.
  const sessionId = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((issuedAt + ADMIN_SESSION_TTL_SECONDS) * 1000).toISOString();
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(`${issuedAt}.${sessionId}`));
  const signature = await hmacBase64Url(encodedPayload, token);
  const cookieValue = `${encodedPayload}.${signature}`;
  const sessionIdHash = await sha256Hex(sessionId);

  const store = getAdminSessionStore();
  const { error } = await store.from("admin_sessions").insert({
    session_id_hash: sessionIdHash,
    issued_at: new Date(issuedAt * 1000).toISOString(),
    expires_at: expiresAt,
  });
  if (error) {
    console.error("[admin-session] session registration failed", { code: error.code });
    throw new Error("Could not register a secure administrator session.");
  }

  // Prune old expired records opportunistically without compromising sign-in.
  const pruneBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: pruneError } = await store.from("admin_sessions").delete().lt("expires_at", pruneBefore);
  if (pruneError) console.warn("[admin-session] expired session cleanup skipped", { code: pruneError.code });

  return cookieValue;
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
    if (item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim() || null;
  }
  return null;
}

interface VerifiedAdminSession {
  sessionIdHash: string;
  issuedAt: number;
}

async function verifyAdminSessionCookie(
  request: Request,
  allowExpiredForRevocation = false,
): Promise<VerifiedAdminSession | null> {
  const secret = configuredAdminToken();
  if (!secret) return null;
  const session = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!session || session.length > 2048) return null;

  const parts = session.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encodedPayload, signature] = parts;
  let payload: string;
  try {
    payload = new TextDecoder().decode(decodeBase64Url(encodedPayload));
  } catch {
    return null;
  }

  const payloadParts = payload.split(".");
  if (payloadParts.length !== 2 || !payloadParts[1]) return null;
  const issuedAt = Number(payloadParts[0]);
  const sessionId = payloadParts[1];
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0 || issuedAt > now + 60) return null;
  if (!SESSION_ID_PATTERN.test(sessionId)) return null;
  if (!allowExpiredForRevocation && !isAdminSessionTimestampValid(issuedAt, now)) return null;

  const expectedSignature = await hmacBase64Url(encodedPayload, secret);
  if (!(await constantTimeEqual(signature, expectedSignature))) return null;
  return { sessionIdHash: await sha256Hex(sessionId), issuedAt };
}

/**
 * Checks the signed cookie and its live server-side record. A revoked, expired,
 * unknown or uncheckable session is never authorised.
 */
export async function isAdminSession(request: Request): Promise<boolean> {
  const verified = await verifyAdminSessionCookie(request);
  if (!verified) return false;
  try {
    const { data, error } = await getAdminSessionStore()
      .from("admin_sessions")
      .select("session_id_hash")
      .eq("session_id_hash", verified.sessionIdHash)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) {
      console.error("[admin-session] session validation unavailable", { code: error.code });
      return false;
    }
    return Boolean(data);
  } catch (error) {
    console.error("[admin-session] session validation failed closed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

/**
 * Revokes the current session before clearing the browser cookie. Any copied
 * cookie stops authenticating immediately after this database update succeeds.
 */
export async function revokeAdminSession(request: Request): Promise<void> {
  const verified = await verifyAdminSessionCookie(request, true);
  if (!verified) return;
  const { error } = await getAdminSessionStore()
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_id_hash", verified.sessionIdHash)
    .is("revoked_at", null);
  if (error) {
    console.error("[admin-session] server-side revocation failed", { code: error.code });
    throw new Error("Could not confirm administrator session revocation.");
  }
}

export async function assertAdminSession(): Promise<void> {
  const request = getRequest();
  if (!request || !(await isAdminSession(request))) {
    throw new Error("Unauthorized: administrator access required");
  }
}
