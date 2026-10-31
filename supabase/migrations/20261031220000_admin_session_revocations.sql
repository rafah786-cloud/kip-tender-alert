-- Server-side administrator session revocation.
-- Store only hashed session identifiers; no raw cookie or access token is retained.
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  session_id_hash text PRIMARY KEY
    CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_sessions_expiry_after_issue_check
    CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
  ON public.admin_sessions (expires_at);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_sessions TO service_role;

COMMENT ON TABLE public.admin_sessions IS
  'Opaque hashed administrator session identifiers; revoked rows immediately invalidate copied admin cookies.';
