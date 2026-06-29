BEGIN;

WITH course_type AS (
  SELECT id
  FROM resource_types
  WHERE organization_id = 'shenkar'
    AND name = 'Courses'
  LIMIT 1
),
courses(name) AS (
  VALUES
    ('Advanced Calculus 2 SE'),
    ('Linear Algebra SE'),
    ('Low-Level Languages SE'),
    ('Discrete Mathematics and Combinatorics SE'),
    ('Programming 2 - Introduction to Systems Programming SE'),
    ('Mathematical Logic and Set Theory SE'),
    ('Introduction to Probability and Statistics SE')
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
    'semester', 'B'
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
    'Advanced Calculus 2 SE',
    'Linear Algebra SE',
    'Low-Level Languages SE',
    'Discrete Mathematics and Combinatorics SE',
    'Programming 2 - Introduction to Systems Programming SE',
    'Mathematical Logic and Set Theory SE',
    'Introduction to Probability and Statistics SE'
  )
ORDER BY name;

COMMIT;
