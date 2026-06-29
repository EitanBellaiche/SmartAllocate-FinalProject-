BEGIN;

WITH generated_students AS (
  SELECT
    gs,
    'SE Year A Student ' || LPAD(gs::text, 2, '0') AS full_name,
    'se.yeara' || LPAD(gs::text, 3, '0') || '@shenkar.local' AS email,
    (971010000 + gs)::text AS national_id
  FROM generate_series(1, 33) AS gs
)
INSERT INTO users (
  full_name,
  email,
  role,
  national_id,
  department,
  organization_id,
  password
)
SELECT
  gs.full_name,
  gs.email,
  'user',
  gs.national_id,
  'software_engineering',
  'shenkar',
  'shenkar123'
FROM generated_students gs
WHERE NOT EXISTS (
  SELECT 1
  FROM users u
  WHERE u.organization_id = 'shenkar'
    AND (u.national_id = gs.national_id OR u.email = gs.email)
);

SELECT id, full_name, role, national_id, department
FROM users
WHERE organization_id = 'shenkar'
  AND department = 'software_engineering'
  AND national_id BETWEEN '971010001' AND '971010033'
ORDER BY national_id;

COMMIT;
