ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS docs_checked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doc_excerpt text,
  ADD COLUMN IF NOT EXISTS stage1_verdict text;