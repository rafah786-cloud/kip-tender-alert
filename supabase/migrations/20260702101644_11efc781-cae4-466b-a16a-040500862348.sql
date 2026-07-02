
-- Drop overly-permissive public policies; server code uses service_role which bypasses RLS.
DROP POLICY IF EXISTS "open settings read" ON public.settings;
DROP POLICY IF EXISTS "open settings update" ON public.settings;
DROP POLICY IF EXISTS "open tenders read" ON public.tenders;
DROP POLICY IF EXISTS "open tenders insert" ON public.tenders;
DROP POLICY IF EXISTS "open tenders update" ON public.tenders;
DROP POLICY IF EXISTS "open tenders delete" ON public.tenders;

-- Revoke Data API access from anon/authenticated on sensitive tables.
REVOKE ALL ON public.settings FROM anon, authenticated;
REVOKE ALL ON public.tenders FROM anon, authenticated;
REVOKE ALL ON public.email_send_log FROM anon, authenticated;
REVOKE ALL ON public.email_send_state FROM anon, authenticated;
REVOKE ALL ON public.suppressed_emails FROM anon, authenticated;
REVOKE ALL ON public.email_unsubscribe_tokens FROM anon, authenticated;

GRANT ALL ON public.settings TO service_role;
GRANT ALL ON public.tenders TO service_role;
GRANT ALL ON public.email_send_log TO service_role;
GRANT ALL ON public.email_send_state TO service_role;
GRANT ALL ON public.suppressed_emails TO service_role;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

-- Recreate SECURITY DEFINER helpers with a fixed search_path, then lock down EXECUTE.
CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
