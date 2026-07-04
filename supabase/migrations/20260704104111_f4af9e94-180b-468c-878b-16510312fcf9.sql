
CREATE OR REPLACE FUNCTION public.trigger_tender_check(secret text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE req_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://project--a3b53314-b358-42e3-b88f-fd9ac65af656.lovable.app/api/public/hooks/check-tenders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_tender_check(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_tender_check(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_tender_check(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_tender_check(text) TO service_role;
