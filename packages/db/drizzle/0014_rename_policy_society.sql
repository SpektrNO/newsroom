-- One-shot: catalog leaf renamed Policy & society → Policy & rules.
-- Merge when both exist for a user; otherwise rename the orphan row.

-- 1) Merge: remap matched_topic_ids from old topic id → keep id
WITH pairs AS (
  SELECT
    old_t.id AS old_id,
    old_t.user_id AS user_id,
    keep_t.id AS keep_id
  FROM topics AS old_t
  INNER JOIN topics AS keep_t
    ON keep_t.user_id = old_t.user_id
   AND lower(keep_t.name) = lower('Policy & rules')
  WHERE lower(old_t.name) = lower('Policy & society')
)
UPDATE user_article_scores AS uas
SET
  matched_topic_ids = (
    SELECT coalesce(jsonb_agg(to_jsonb(v.elem) ORDER BY v.ord), '[]'::jsonb)
    FROM (
      SELECT
        CASE WHEN e.elem = p.old_id THEN p.keep_id ELSE e.elem END AS elem,
        min(e.ord) AS ord
      FROM jsonb_array_elements_text(uas.matched_topic_ids)
        WITH ORDINALITY AS e(elem, ord)
      GROUP BY 1
    ) AS v
  ),
  updated_at = now()
FROM pairs AS p
WHERE uas.user_id = p.user_id
  AND uas.matched_topic_ids IS NOT NULL
  AND uas.matched_topic_ids @> jsonb_build_array(p.old_id);
--> statement-breakpoint

-- 2) Merge: fold keywords / flags into keep, then delete old
WITH pairs AS (
  SELECT
    old_t.id AS old_id,
    keep_t.id AS keep_id,
    old_t.keywords AS old_keywords,
    old_t.enabled AS old_enabled,
    old_t.weight AS old_weight
  FROM topics AS old_t
  INNER JOIN topics AS keep_t
    ON keep_t.user_id = old_t.user_id
   AND lower(keep_t.name) = lower('Policy & rules')
  WHERE lower(old_t.name) = lower('Policy & society')
),
merged AS (
  UPDATE topics AS keep_t
  SET
    keywords = (
      SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k), '[]'::jsonb)
      FROM (
        SELECT DISTINCT trim(both FROM x.k) AS k
        FROM (
          SELECT jsonb_array_elements_text(keep_t.keywords) AS k
          UNION ALL
          SELECT jsonb_array_elements_text(p.old_keywords) AS k
        ) AS x
        WHERE trim(both FROM x.k) <> ''
      ) AS d
    ),
    enabled = keep_t.enabled OR p.old_enabled,
    weight = greatest(keep_t.weight, p.old_weight),
    updated_at = now()
  FROM pairs AS p
  WHERE keep_t.id = p.keep_id
  RETURNING p.old_id
)
DELETE FROM topics
WHERE id IN (SELECT old_id FROM merged);
--> statement-breakpoint

-- 3) Rename remaining orphans (no Policy & rules yet for that user)
UPDATE topics
SET
  name = 'Policy & rules',
  updated_at = now()
WHERE lower(name) = lower('Policy & society')
  AND NOT EXISTS (
    SELECT 1
    FROM topics AS t2
    WHERE t2.user_id = topics.user_id
      AND lower(t2.name) = lower('Policy & rules')
  );
