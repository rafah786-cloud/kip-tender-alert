import { describe, expect, test } from "bun:test";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  adminSessionCookieHeader,
  clearAdminSessionCookieHeader,
  isAdminSessionTimestampValid,
} from "../src/lib/admin-session.server.ts";

describe("Revocable administrator session safeguards", () => {
  test("accepts a fresh session but rejects an expired session", () => {
    const now = 1_900_000_000;
    expect(isAdminSessionTimestampValid(now - 60, now)).toBe(true);
    expect(isAdminSessionTimestampValid(now - ADMIN_SESSION_TTL_SECONDS, now)).toBe(true);
    expect(isAdminSessionTimestampValid(now - ADMIN_SESSION_TTL_SECONDS - 1, now)).toBe(false);
  });

  test("rejects invalid and implausibly future issue times", () => {
    const now = 1_900_000_000;
    expect(isAdminSessionTimestampValid(0, now)).toBe(false);
    expect(isAdminSessionTimestampValid(Number.NaN, now)).toBe(false);
    expect(isAdminSessionTimestampValid(now + 61, now)).toBe(false);
    expect(isAdminSessionTimestampValid(now + 30, now)).toBe(true);
  });

  test("uses a host-only HttpOnly, Secure, SameSite=Strict session cookie", () => {
    const header = adminSessionCookieHeader("signed-value");
    expect(header.startsWith(ADMIN_SESSION_COOKIE + "=")).toBe(true);
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
    expect(header).not.toContain("Domain=");
  });

  test("clears the same host-only cookie with an immediate expiry", () => {
    const header = clearAdminSessionCookieHeader();
    expect(header.startsWith(ADMIN_SESSION_COOKIE + "=")).toBe(true);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
  });
});
