ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS ai_verdict text,
  ADD COLUMN IF NOT EXISTS ai_reason text,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric;
CREATE INDEX IF NOT EXISTS tenders_ai_verdict_idx ON public.tenders (ai_verdict);