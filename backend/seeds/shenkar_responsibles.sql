-- Seed 40 responsible users for organization_id = 'shenkar'.
-- Login in this app is by national_id + password.
-- Generated users:
--   full_name: realistic lecturer-style names
--   national_id: 980400001..980400040
--   role: responsible
--   password: shenkar123

WITH first_names AS (
  SELECT ARRAY[
    'Amir', 'Eyal', 'Gilad', 'Ran', 'Yuval',
    'Sharon', 'Hila', 'Michal', 'Anat', 'Keren'
  ] AS items
),
last_names AS (
  SELECT ARRAY[
    'Cohen', 'Levi', 'Mizrahi', 'Peretz'
  ] AS items
),
generated_responsibles AS (
  SELECT
    gs,
    (SELECT items[((gs - 1) % 10) + 1] FROM first_names) AS first_name,
    (SELECT items[((gs - 1) / 10) + 1] FROM last_names) AS last_name
  FROM generate_series(1, 40) AS gs
)
INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT
  first_name || ' ' || last_name AS full_name,
  LOWER(first_name || '.' || last_name || LPAD(gs::text, 3, '0') || '@shenkar.local') AS email,
  'responsible' AS role,
  (980400000 + gs)::text AS national_id,
  'shenkar' AS organization_id,
  'shenkar123' AS password
FROM generated_responsibles
WHERE NOT EXISTS (
  SELECT 1
  FROM users u
  WHERE u.national_id = (980400000 + gs)::text
);
