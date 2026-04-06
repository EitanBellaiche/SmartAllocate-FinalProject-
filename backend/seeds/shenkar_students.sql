-- Seed 300 student users for organization_id = 'shenkar'.
-- Login in this app is by national_id + password.
-- Generated users:
--   full_name: realistic first/last name combinations
--   national_id: 970300001..970300300
--   department: evenly distributed across Shenkar departments
--   role: user
--   password: shenkar123

WITH first_names AS (
  SELECT ARRAY[
    'Noam', 'Daniel', 'Omer', 'Amit', 'Lior',
    'Yarden', 'Maya', 'Tamar', 'Shira', 'Yael',
    'Neta', 'Roni', 'Alon', 'Itay', 'Yonatan',
    'Ariel', 'Gal', 'Or', 'Adi', 'Michal'
  ] AS items
),
last_names AS (
  SELECT ARRAY[
    'Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton',
    'Avraham', 'Malka', 'Haddad', 'Azoulay', 'Naim',
    'Sharabi', 'Ohayon', 'Amar', 'Mor', 'Dahan'
  ] AS items
),
generated_students AS (
  SELECT
    gs,
    (SELECT items[((gs - 1) % 20) + 1] FROM first_names) AS first_name,
    (SELECT items[((gs - 1) / 20) + 1] FROM last_names) AS last_name,
    (ARRAY[
      'software_engineering',
      'electrical_engineering',
      'industrial_engineering_management',
      'design'
    ])[((gs - 1) % 4) + 1] AS department
  FROM generate_series(1, 300) AS gs
)
INSERT INTO users (full_name, email, role, national_id, department, organization_id, password)
SELECT
  first_name || ' ' || last_name AS full_name,
  LOWER(first_name || '.' || last_name || LPAD(gs::text, 3, '0') || '@shenkar.local') AS email,
  'user' AS role,
  (970300000 + gs)::text AS national_id,
  department,
  'shenkar' AS organization_id,
  'shenkar123' AS password
FROM generated_students
WHERE NOT EXISTS (
  SELECT 1
  FROM users u
  WHERE u.national_id = (970300000 + gs)::text
);

WITH generated_students AS (
  SELECT
    gs,
    (ARRAY[
      'software_engineering',
      'electrical_engineering',
      'industrial_engineering_management',
      'design'
    ])[((gs - 1) % 4) + 1] AS department
  FROM generate_series(1, 300) AS gs
)
UPDATE users
SET department = gs.department
FROM generated_students gs
WHERE users.national_id = (970300000 + gs.gs)::text
  AND users.organization_id = 'shenkar'
  AND COALESCE(users.department, '') <> gs.department;
