-- Independent keyword sets with the old Mattress list preserved.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS keyword_sets jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS matched_keyword_sets text[] NOT NULL DEFAULT '{}'::text[];
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.settings'::regclass
      AND conname = 'settings_keyword_sets_array_check'
  ) THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_keyword_sets_array_check
      CHECK (jsonb_typeof(keyword_sets) = 'array');
  END IF;
END $$;
UPDATE public.settings
SET keyword_sets = jsonb_build_array(
  jsonb_build_object(
    'id','mattress','name','Mattress','enabled',true,
    'match_mode',COALESCE(match_mode,'any'),
    'include_keywords',to_jsonb(COALESCE(keywords,ARRAY[]::text[])),
    'exclude_keywords',COALESCE(exclude_keywords,'[]'::jsonb),
    'ai_scope','Tenders for supply of mattresses and directly related bedding products: foam, coir, spring, medical and hospital mattresses; mattress covers and protectors; bed linen, bedsheets, pillows, bolsters, blankets, quilts, bedding kits and bed-rolls. Count beds only when a mattress is explicitly included.'
  ),
  jsonb_build_object(
    'id','construction-pwd','name','Construction / PWD','enabled',false,'match_mode','any',
    'include_keywords',jsonb_build_array(
      'PWD','Public Works Department','civil works','civil construction','construction',
      'building construction','road construction','road work','road works','road improvement',
      'road widening','bridge construction','bridge works','culvert','drainage works',
      'storm water drain','footpath','paving works','bitumen work','asphalt work','re-tarring',
      're carpeting','building maintenance','renovation works','repair works','electrical works',
      'plumbing works','painting works','water supply works','sewerage works','canal works',
      'irrigation works','school building','hospital building','public building','structural repair',
      'compound wall','boundary wall','roofing works','general civil work','works contract',
      'construction tender','NIT'
    ),
    'exclude_keywords','[]'::jsonb,
    'ai_scope','Public works and construction contracts: roads, bridges, buildings, culverts, drainage, water supply, sewerage, canals, irrigation, electrical and plumbing works, painting, roofing, repairs, renovation and maintenance. Evaluate the actual works scope and BOQ; do not require mattress or product-supply relevance.'
  )
)
WHERE id=1 AND (keyword_sets IS NULL OR jsonb_typeof(keyword_sets)<>'array' OR jsonb_array_length(keyword_sets)=0);
