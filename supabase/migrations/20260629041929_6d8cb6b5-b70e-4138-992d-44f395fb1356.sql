ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS ai_min_confidence numeric NOT NULL DEFAULT 0.6
    CHECK (ai_min_confidence >= 0 AND ai_min_confidence <= 1),
  ADD COLUMN IF NOT EXISTS ai_include_maybe boolean NOT NULL DEFAULT false;