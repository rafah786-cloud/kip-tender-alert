
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS exclude_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS match_mode text NOT NULL DEFAULT 'any';

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_match_mode_check;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_match_mode_check CHECK (match_mode IN ('any','all','phrase'));
