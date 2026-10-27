-- Harden all Tender Watch data tables and queue/security-definer RPCs.
-- Server-only code connects with service_role; browsers do not need direct table/RPC access.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.settings,
  public.tenders,
  public.tender_source_health,
  public.email_send_log,
  public.email_send_state,
  public.email_unsubscribe_tokens,
  public.suppressed_emails
FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.settings,
  public.tenders,
  public.tender_source_health,
  public.email_send_log,
  public.email_send_state,
  public.email_unsubscribe_tokens,
  public.suppressed_emails
TO service_role;

-- Queue dispatcher has no arguments and must never be callable by public API roles.
REVOKE ALL PRIVILEGES ON FUNCTION public.email_queue_dispatch()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

-- Trigger helper should only be invoked through its trigger, not as an RPC.
REVOKE ALL PRIVILEGES ON FUNCTION public.email_queue_wake()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;

-- Preserve/ensure service-role-only access for all SECURITY DEFINER queue and scanner RPCs.
REVOKE ALL PRIVILEGES ON FUNCTION public.enqueue_email(text, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.read_email_batch(text, integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.delete_email(text, bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.trigger_tender_check(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_tender_check(text) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.is_valid_tender_cron_secret(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_tender_cron_secret(text) TO service_role;

COMMIT;
