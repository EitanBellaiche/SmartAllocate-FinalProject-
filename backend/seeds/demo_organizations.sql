-- Demo org data for SmartAllocate (generic template).
-- Organization ID: demo.restaurant (example business)

-- Users
INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Rina Cohen', 'rina.manager@demo.restaurant', 'shift_manager', '900000010', 'demo.restaurant', 'shift123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '900000010' AND organization_id = 'demo.restaurant'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Eli Peretz', 'eli.employee@demo.restaurant', 'employee', '900000011', 'demo.restaurant', 'employee123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '900000011' AND organization_id = 'demo.restaurant'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Demo Admin', 'admin@demo.restaurant', 'admin', '900000001', 'demo.restaurant', 'admin123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '900000001' AND organization_id = 'demo.restaurant'
);

-- Resource types
INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Course',
  'Shift template for employee schedules',
  '[{"name":"team_size","label":"Team size","type":"number"}]'::jsonb,
  '["employee","shift_manager"]'::jsonb,
  'demo.restaurant'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Course' AND organization_id = 'demo.restaurant'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Station',
  'Kitchen or service station',
  '[{"name":"zone","label":"Zone","type":"text"}]'::jsonb,
  '["employee","shift_manager"]'::jsonb,
  'demo.restaurant'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'demo.restaurant'
);

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Morning Shift',
  (SELECT id FROM resource_types WHERE name = 'Course' AND organization_id = 'demo.restaurant' LIMIT 1),
  '{"team_size":6,"area":"front"}'::jsonb,
  true,
  'demo.restaurant'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Morning Shift' AND organization_id = 'demo.restaurant'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Course' AND organization_id = 'demo.restaurant'
  );

WITH course_type AS (
  SELECT id FROM resource_types
  WHERE name = 'Course' AND organization_id = 'demo.restaurant'
)
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Evening Shift',
  (SELECT id FROM resource_types WHERE name = 'Course' AND organization_id = 'demo.restaurant' LIMIT 1),
  '{"team_size":5,"area":"kitchen"}'::jsonb,
  true,
  'demo.restaurant'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Evening Shift' AND organization_id = 'demo.restaurant'
)
AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Course' AND organization_id = 'demo.restaurant'
);

WITH station_type AS (
  SELECT id FROM resource_types
  WHERE name = 'Station' AND organization_id = 'demo.restaurant'
)
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Grill Station A',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'demo.restaurant' LIMIT 1),
  '{"zone":"kitchen"}'::jsonb,
  true,
  'demo.restaurant'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Grill Station A' AND organization_id = 'demo.restaurant'
)
AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'demo.restaurant'
);
