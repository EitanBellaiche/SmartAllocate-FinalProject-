BEGIN;

WITH target_type AS (
  SELECT id, fields
  FROM resource_types
  WHERE organization_id = 'shenkar'
    AND name = 'Courses'
  LIMIT 1
),
updated_fields AS (
  SELECT
    id,
    (
      CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(fields, '[]'::jsonb)) AS field
          WHERE field->>'name' = 'year'
        )
          THEN COALESCE(fields, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'name', 'year',
              'label', 'Year',
              'type', 'string',
              'default', '',
              'required', false
            )
          )
        ELSE COALESCE(fields, '[]'::jsonb)
      END
    ) AS fields_after_year
  FROM target_type
),
final_fields AS (
  SELECT
    id,
    (
      CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(fields_after_year) AS field
          WHERE field->>'name' = 'semester'
        )
          THEN fields_after_year || jsonb_build_array(
            jsonb_build_object(
              'name', 'semester',
              'label', 'Semester',
              'type', 'string',
              'default', '',
              'required', false
            )
          )
        ELSE fields_after_year
      END
    ) AS fields
  FROM updated_fields
)
UPDATE resource_types rt
SET fields = ff.fields
FROM final_fields ff
WHERE rt.id = ff.id;

WITH course_type AS (
  SELECT id
  FROM resource_types
  WHERE organization_id = 'shenkar'
    AND name = 'Courses'
  LIMIT 1
),
courses(name) AS (
  VALUES
    ('Advanced Calculus 1 SE'),
    ('Digital Systems SE'),
    ('Physics 1 SE'),
    ('Programming 1 - Introduction to Computer Science SE')
)
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  c.name,
  ct.id,
  jsonb_build_object(
    'students_number', 0,
    'need_projector', false,
    'building', '',
    'software_engineering', true,
    'electrical_engineering', false,
    'industrial_engineering_management', false,
    'design', false,
    'year', 'A',
    'semester', 'A'
  ),
  true,
  'shenkar'
FROM courses c
CROSS JOIN course_type ct
WHERE NOT EXISTS (
  SELECT 1
  FROM resources r
  WHERE r.organization_id = 'shenkar'
    AND r.name = c.name
);

SELECT id, name, metadata
FROM resources
WHERE organization_id = 'shenkar'
  AND name IN (
    'Advanced Calculus 1 SE',
    'Digital Systems SE',
    'Physics 1 SE',
    'Programming 1 - Introduction to Computer Science SE'
  )
ORDER BY name;

COMMIT;
