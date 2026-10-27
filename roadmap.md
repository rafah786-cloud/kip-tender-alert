# Roadmap — sync repo changes into Tender Finder Pro

- [x] Check Firecrawl connection + secrets in new workspace — MISSING, user must reconnect
- [x] Inspect current DB schema + existing cron jobs (read-only)
- [x] Expanded government portal registry (added defproc.gov.in + GeM)
- [x] Broader mattress/bedding keywords (applied to live settings)
- [x] Portal-health panel in dashboard
- [x] Skip repeated AI review of already-saved tenders
- [x] Secure 2-hour scheduler using Supabase Vault token (hook validates vault token; migration route blocked by secret-access policy, existing cron job reused)
- [x] Updated email dashboard URL (kip-tender-alert.lovable.app)
- [x] Build/typecheck + manual scan test (pipeline runs; scrapes fail until Firecrawl reconnected)
- [x] Publish to production (scheduled; URL serves HTTP 200)
