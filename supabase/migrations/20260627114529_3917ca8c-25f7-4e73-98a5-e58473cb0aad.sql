
CREATE TABLE public.settings (
  id INT PRIMARY KEY DEFAULT 1,
  keywords TEXT[] NOT NULL DEFAULT ARRAY['mattress','mattresses','bed','beds','spring mattress','medicated mattress','coir mattress','pillow','bedding'],
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_message TEXT,
  notify_email TEXT,
  CONSTRAINT settings_single CHECK (id = 1)
);
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open settings read" ON public.settings FOR SELECT USING (true);
CREATE POLICY "open settings update" ON public.settings FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  organisation TEXT,
  published_at TEXT,
  closing_at TEXT,
  tender_url TEXT,
  matched_keywords TEXT[] NOT NULL DEFAULT '{}',
  raw_excerpt TEXT,
  seen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tenders_created_idx ON public.tenders (created_at DESC);
CREATE INDEX tenders_seen_idx ON public.tenders (seen);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenders TO anon, authenticated;
GRANT ALL ON public.tenders TO service_role;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open tenders read" ON public.tenders FOR SELECT USING (true);
CREATE POLICY "open tenders insert" ON public.tenders FOR INSERT WITH CHECK (true);
CREATE POLICY "open tenders update" ON public.tenders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "open tenders delete" ON public.tenders FOR DELETE USING (true);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
