BEGIN;

WITH electrical_students AS (
  SELECT
    u.national_id,
    ROW_NUMBER() OVER (ORDER BY u.national_id) AS student_rank
  FROM users u
  WHERE u.organization_id = 'shenkar'
    AND u.department = 'electrical_engineering'
),
student_stats AS (
  SELECT COUNT(*)::int AS student_count
  FROM electrical_students
),
electrical_courses AS (
  SELECT
    r.id,
    ROW_NUMBER() OVER (ORDER BY LOWER(r.name), r.id) AS course_rank,
    30 + ((ROW_NUMBER() OVER (ORDER BY LOWER(r.name), r.id) - 1) % 16) AS target_size
  FROM resources r
  JOIN resource_types rt ON rt.id = r.type_id
  WHERE r.organization_id = 'shenkar'
    AND rt.name = 'Courses'
    AND COALESCE(r.metadata->>'department', '') = 'electrical_engineering'
),
course_assignments AS (
  SELECT
    ec.id,
    COALESCE(
      jsonb_agg(es.national_id ORDER BY es.national_id),
      '[]'::jsonb
    ) AS user_ids,
    COUNT(es.national_id)::int AS assigned_count
  FROM electrical_courses ec
  CROSS JOIN student_stats ss
  LEFT JOIN LATERAL (
    SELECT s.national_id
    FROM generate_series(0, GREATEST(ec.target_size - 1, 0)) AS gs(offset_index)
    JOIN electrical_students s
      ON s.student_rank = (((ec.course_rank - 1) * 9 + gs.offset_index) % NULLIF(ss.student_count, 0)) + 1
    WHERE ss.student_count > 0
  ) es ON TRUE
  GROUP BY ec.id
),
updated_courses AS (
  UPDATE resources r
  SET metadata = (COALESCE(r.metadata, '{}'::jsonb) - 'users') || jsonb_build_object(
    'user_ids', ca.user_ids,
    'students_number', ca.assigned_count
  )
  FROM course_assignments ca
  WHERE r.id = ca.id
  RETURNING r.id, r.name, ca.assigned_count
)
SELECT COUNT(*) AS updated_courses
FROM updated_courses;

COMMIT;
