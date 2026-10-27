-- Tender monitoring health and separately stored scheduled-job token.
-- The service-role application backend owns these records; browser roles must not access them.

CREATE TABLE IF NOT EXISTS public.tender_source_health (
  source_key text PRIMARY KEY,
  source_label text NOT NULL,
  source_url text NOT NULL,
  last_checked_at timestamptz,
  last_status text NOT NULL DEFAULT 'ok' CHECK (last_status IN ('ok', 'error')),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tender_source_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tender_source_health FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.tender_source_health TO service_role;

-- Expand only the untouched original seed list. Preserve any user's custom keywords.
UPDATE public.settings
SET keywords = ARRAY[
  'mattress', 'mattresses', 'foam mattress', 'spring mattress', 'coir mattress',
  'rubberised coir', 'rubberized coir', 'hospital mattress', 'medical mattress',
  'orthopaedic mattress', 'orthopedic mattress', 'latex mattress', 'folding mattress',
  'mattress cover', 'mattress protector', 'pillow', 'pillows', 'bedding', 'bed linen',
  'bedsheet', 'bed sheet', 'bedroll', 'bed roll', 'sleeping mat', 'sleeping mattress',
  'cot mattress', 'patient mattress', 'pressure relief mattress'
]
WHERE id = 1
  AND keywords = ARRAY[
    'mattress','mattresses','bed','beds','spring mattress','medicated mattress',
    'coir mattress','pillow','bedding'
  ];

-- Validates a high-entropy scheduler token without exposing the Vault secret to
-- callers. The route still checks its configured CRON_SECRET for manual calls.
CREATE OR REPLACE FUNCTION public.is_valid_tender_cron_secret(candidate_secret text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT candidate_secret IS NOT NULL
     AND length(candidate_secret) >= 48
     AND EXISTS (
       SELECT 1
       FROM vault.decrypted_secrets
       WHERE name = 'tender_watch_cron_token'
         AND decrypted_secret = candidate_secret
     );
$$;

REVOKE ALL ON FUNCTION public.is_valid_tender_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_tender_cron_secret(text) TO service_role;
 
-- Replace the stale/dev scheduler URL and unauthenticated anon-key header with
-- the production site and dedicated Vault token. The token is not embedded in
-- the cron command or committed to Git.
DO $scheduler$
DECLARE
  old_job record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
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
          url := 'https://kip-tender-alert.lovable.app/api/public/hooks/check-tenders',
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
  END IF;
END
$scheduler$;

