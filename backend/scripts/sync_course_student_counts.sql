BEGIN;

WITH course_counts AS (
  SELECT
    r.id,
    CASE
      WHEN jsonb_typeof(r.metadata->'user_ids') = 'array' THEN jsonb_array_length(r.metadata->'user_ids')
      WHEN jsonb_typeof(r.metadata->'userIds') = 'array' THEN jsonb_array_length(r.metadata->'userIds')
      WHEN COALESCE(BTRIM(r.metadata->>'user_ids'), '') <> '' THEN cardinality(regexp_split_to_array(BTRIM(r.metadata->>'user_ids'), E'[\\s,]+'))
      WHEN COALESCE(BTRIM(r.metadata->>'userIds'), '') <> '' THEN cardinality(regexp_split_to_array(BTRIM(r.metadata->>'userIds'), E'[\\s,]+'))
      ELSE 0
    END AS assigned_count
  FROM resources r
  JOIN resource_types rt ON rt.id = r.type_id
  WHERE r.organization_id = 'shenkar'
    AND rt.name = 'Courses'
),
updated AS (
  UPDATE resources r
  SET metadata = (COALESCE(r.metadata, '{}'::jsonb) - 'users') || jsonb_build_object(
    'students_number', cc.assigned_count
  )
  FROM course_counts cc
  WHERE r.id = cc.id
  RETURNING r.id
)
SELECT COUNT(*) AS updated_courses
FROM updated;

COMMIT;
