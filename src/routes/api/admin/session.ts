import { createFileRoute } from "@tanstack/react-router";
import {
  adminSessionCookieHeader,
  clearAdminSessionCookieHeader,
  isAdminSession,
  isAdminTokenConfigured,
  isSameOriginRequest,
  verifyAdminToken,
  createAdminSessionCookieValue,
  revokeAdminSession,
} from "@/lib/admin-session.server";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
};

export const Route = createFileRoute("/api/admin/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const configured = isAdminTokenConfigured();
        const authenticated = configured && (await isAdminSession(request));
        return Response.json({ configured, authenticated }, { headers: noStoreHeaders });
      },
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request)) {
          return Response.json({ error: "Forbidden" }, { status: 403, headers: noStoreHeaders });
        }
        if (!isAdminTokenConfigured()) {
          return Response.json({ error: "Administrator access is not configured" }, { status: 503, headers: noStoreHeaders });
        }

        let candidate: unknown;
        try {
          const body = await request.json();
          candidate = body && typeof body === "object" ? (body as { token?: unknown }).token : null;
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400, headers: noStoreHeaders });
        }

        if (!(await verifyAdminToken(candidate))) {
          return Response.json({ error: "Invalid access token" }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const cookieValue = await createAdminSessionCookieValue();
          return Response.json(
            { ok: true },
            { headers: { ...noStoreHeaders, "Set-Cookie": adminSessionCookieHeader(cookieValue) } },
          );
        } catch {
          return Response.json(
            { error: "Secure administrator session storage is unavailable. Try again." },
            { status: 503, headers: noStoreHeaders },
          );
        }
      },
      DELETE: async ({ request }) => {
        if (!isSameOriginRequest(request)) {
          return Response.json({ error: "Forbidden" }, { status: 403, headers: noStoreHeaders });
        }

        try {
          await revokeAdminSession(request);
        } catch {
          // Never claim logout or clear the local cookie unless copied-session
          // revocation has been confirmed by the server.
          return Response.json(
            { error: "Server could not confirm logout. Please retry; your session remains active." },
            { status: 503, headers: noStoreHeaders },
          );
        }

        return Response.json(
          { ok: true, revoked: true },
          { headers: { ...noStoreHeaders, "Set-Cookie": clearAdminSessionCookieHeader() } },
        );
      },
    },
  },
});
