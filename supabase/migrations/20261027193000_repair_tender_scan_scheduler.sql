-- Repair manual Scan Now and the two-hour tender scheduler after the
-- deployment switched away from the temporary Lovable dev host.

BEGIN;

CREATE OR REPLACE FUNCTION public.trigger_tender_check(secret text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  req_id bigint;
  scheduler_token text;
BEGIN
  SELECT decrypted_secret
    INTO scheduler_token
  FROM vault.decrypted_secrets
  WHERE name = 'tender_watch_cron_token';

  IF scheduler_token IS NULL OR length(scheduler_token) < 48 THEN
    RAISE EXCEPTION 'Tender scanner token is missing or invalid in Supabase Vault';
  END IF;

  SELECT net.http_post(
    url := 'https://tenders.zizzmattress.com/api/public/hooks/check-tenders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || scheduler_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) INTO req_id;

  RETURN req_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_tender_check(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_tender_check(text) TO service_role;

DO $scheduler$
DECLARE
  old_job record;
  scheduler_token text;
BEGIN
  SELECT decrypted_secret
    INTO scheduler_token
  FROM vault.decrypted_secrets
  WHERE name = 'tender_watch_cron_token';

  IF scheduler_token IS NULL OR length(scheduler_token) < 48 THEN
    RAISE EXCEPTION 'Tender scanner token is missing or invalid in Supabase Vault';
  END IF;

  FOR old_job IN
    SELECT jobid
    FROM cron.job
    WHERE command LIKE '%/api/public/hooks/check-tenders%'
  LOOP
    PERFORM cron.unschedule(old_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'tender-watch-every-two-hours',
    '0 */2 * * *',
    $task$
      SELECT net.http_post(
        url := 'https://tenders.zizzmattress.com/api/public/hooks/check-tenders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'tender_watch_cron_token'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
      );
    $task$
  );
END
$scheduler$;

COMMIT;
