-- Expand tender discovery vocabulary without replacing administrator-customised terms.
-- The scanner matches any include term by default; AI/BOQ review remains the relevance filter.
UPDATE public.settings
SET keywords = ARRAY(
  SELECT DISTINCT term
  FROM unnest(
    COALESCE(keywords, ARRAY[]::text[]) || ARRAY[
      'mattress supply','mattress set','PU foam mattress','polyurethane foam mattress',
      'memory foam mattress','rebonded foam mattress','bonnell spring mattress',
      'pocket spring mattress','ICU mattress','pressure-relief mattress','anti-decubitus mattress',
      'air mattress','water mattress','portable mattress','camping mattress','hostel mattress',
      'mattress topper','mattress pad','hospital bed','patient bed','ward bed','ICU bed',
      'bunk bed','cot','cots','bed frame','bed base','bedstead','sleeping pad','sleeping bag',
      'pillow cover','pillow case','pillowcase','bolster','blanket','blankets','comforter',
      'quilt','duvet','bedspread','hospital linen','linen','foam sheet','PU foam'
    ]::text[]
  ) AS terms(term)
  WHERE length(trim(term)) > 0
  ORDER BY term
)
WHERE id = 1;
