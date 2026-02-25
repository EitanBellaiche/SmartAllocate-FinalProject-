-- Seed data for Shenkar college resources
-- Organization ID: shenkar

-- Resource types
INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Classroom',
  'Standard classroom with projector',
  '[{"name":"capacity","label":"Capacity","type":"number"},{"name":"building","label":"Building","type":"text"},{"name":"floor","label":"Floor","type":"number"},{"name":"projector","label":"Projector","type":"boolean"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Lab',
  'Computer or electronics lab',
  '[{"name":"capacity","label":"Capacity","type":"number"},{"name":"building","label":"Building","type":"text"},{"name":"floor","label":"Floor","type":"number"},{"name":"equipment","label":"Equipment","type":"text"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Studio',
  'Design / fashion studio',
  '[{"name":"capacity","label":"Capacity","type":"number"},{"name":"building","label":"Building","type":"text"},{"name":"floor","label":"Floor","type":"number"},{"name":"equipment","label":"Equipment","type":"text"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Meeting Room',
  'Small meeting room',
  '[{"name":"capacity","label":"Capacity","type":"number"},{"name":"building","label":"Building","type":"text"},{"name":"floor","label":"Floor","type":"number"},{"name":"whiteboard","label":"Whiteboard","type":"boolean"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Equipment',
  'Borrowable equipment',
  '[{"name":"category","label":"Category","type":"text"},{"name":"model","label":"Model","type":"text"},{"name":"quantity","label":"Quantity","type":"number"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar'
);

-- Resources
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Classroom 201',
  (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":40,"building":"A","floor":2,"projector":true}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Classroom 201' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Classroom 305',
  (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":32,"building":"B","floor":3,"projector":true}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Classroom 305' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Computer Lab 1',
  (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":28,"building":"A","floor":1,"equipment":"Windows PCs"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Computer Lab 1' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Electronics Lab',
  (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":20,"building":"C","floor":1,"equipment":"Oscilloscopes"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Electronics Lab' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Design Studio A',
  (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":24,"building":"D","floor":2,"equipment":"Large tables"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Design Studio A' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Fashion Studio 2',
  (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":18,"building":"D","floor":3,"equipment":"Sewing machines"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Fashion Studio 2' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Meeting Room 101',
  (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":10,"building":"A","floor":1,"whiteboard":true}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Meeting Room 101' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Meeting Room 404',
  (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":8,"building":"B","floor":4,"whiteboard":false}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Meeting Room 404' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Projector Kit A',
  (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1),
  '{"category":"projector","model":"Epson EB-X41","quantity":3}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Projector Kit A' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Camera Kit 1',
  (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1),
  '{"category":"camera","model":"Canon EOS 90D","quantity":2}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Camera Kit 1' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar'
  );
