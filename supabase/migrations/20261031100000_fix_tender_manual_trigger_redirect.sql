-- Keep the manual trigger on the canonical production host.
-- The previous Lovable hostname redirects cross-domain and can drop Authorization.
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
