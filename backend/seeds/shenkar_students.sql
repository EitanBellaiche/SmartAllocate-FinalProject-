-- Seed 300 student users for organization_id = 'shenkar'.
-- Login in this app is by national_id + password.
-- Generated users:
--   full_name: realistic first/last name combinations
--   national_id: 970300001..970300300
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
    (SELECT items[((gs - 1) / 20) + 1] FROM last_names) AS last_name
  FROM generate_series(1, 300) AS gs
)
INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT
  first_name || ' ' || last_name AS full_name,
  LOWER(first_name || '.' || last_name || LPAD(gs::text, 3, '0') || '@shenkar.local') AS email,
  'user' AS role,
  (970300000 + gs)::text AS national_id,
  'shenkar' AS organization_id,
  'shenkar123' AS password
FROM generated_students
WHERE NOT EXISTS (
  SELECT 1
  FROM users u
  WHERE u.national_id = (970300000 + gs)::text
);
