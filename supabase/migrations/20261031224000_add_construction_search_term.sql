-- Include the generic construction term in the disabled Construction / PWD set.
-- It remains disabled; Mattress stays the only active search category.
UPDATE public.settings
SET keyword_sets = (
  SELECT jsonb_agg(
    CASE
      WHEN item->>'id' = 'construction-pwd'
        AND NOT (item->'include_keywords' @> '["construction"]'::jsonb)
      THEN jsonb_set(
        item,
        '{include_keywords}',
        (item->'include_keywords') || '["construction"]'::jsonb,
        true
      )
      ELSE item
    END
    ORDER BY ordinal
  )
  FROM jsonb_array_elements(keyword_sets) WITH ORDINALITY AS entries(item, ordinal)
)
WHERE id = 1;
