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

-- Additional courses
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Cyber Security 101',
  (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1),
  '{"students_number":42,"department":"cyber"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Cyber Security 101' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Intro to AI 204',
  (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1),
  '{"students_number":30,"department":"ai"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Intro to AI 204' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Data Science 310',
  (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1),
  '{"students_number":55,"department":"data"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Data Science 310' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar'
  );

-- Additional classrooms
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Classroom 110',
  (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":25,"building":"A","floor":1,"projector":true}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Classroom 110' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Classroom 410',
  (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":60,"building":"B","floor":4,"projector":true}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Classroom 410' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar'
  );

-- Additional labs
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Networking Lab',
  (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":24,"building":"C","floor":2,"equipment":"Routers, Switches"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Networking Lab' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'AI Lab',
  (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":20,"building":"C","floor":3,"equipment":"GPU Workstations"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'AI Lab' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar'
  );

-- Additional studios
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Media Studio 1',
  (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":16,"building":"D","floor":1,"equipment":"Cameras, Lights"}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Media Studio 1' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar'
  );

-- Additional equipment
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Projector Kit B',
  (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1),
  '{"category":"projector","model":"BenQ MX550","quantity":2}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Projector Kit B' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Audio Kit 1',
  (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1),
  '{"category":"audio","model":"Shure SM58","quantity":6}'::jsonb,
  true,
  'shenkar'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Audio Kit 1' AND organization_id = 'shenkar'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar'
  );

-- Additional resource types for college
INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Auditorium',
  'Large lecture hall',
  '[{"name":"capacity","label":"Capacity","type":"number"},{"name":"building","label":"Building","type":"text"},{"name":"projector","label":"Projector","type":"boolean"},{"name":"sound_system","label":"Sound System","type":"boolean"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Auditorium' AND organization_id = 'shenkar'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Exam Room',
  'Exam room with accessibility',
  '[{"name":"capacity","label":"Capacity","type":"number"},{"name":"building","label":"Building","type":"text"},{"name":"accessible","label":"Accessible","type":"boolean"},{"name":"quiet","label":"Quiet","type":"boolean"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Exam Room' AND organization_id = 'shenkar'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Library Room',
  'Library study room',
  '[{"name":"capacity","label":"Capacity","type":"number"},{"name":"building","label":"Building","type":"text"},{"name":"silent","label":"Silent","type":"boolean"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Library Room' AND organization_id = 'shenkar'
);

-- Additional resources for new types
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Auditorium A',
  (SELECT id FROM resource_types WHERE name = 'Auditorium' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":180,"building":"A","projector":true,"sound_system":true}'::jsonb,
  true,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Auditorium A' AND organization_id = 'shenkar'
) AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Auditorium' AND organization_id = 'shenkar'
);

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Auditorium B',
  (SELECT id FROM resource_types WHERE name = 'Auditorium' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":120,"building":"B","projector":false,"sound_system":true}'::jsonb,
  true,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Auditorium B' AND organization_id = 'shenkar'
) AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Auditorium' AND organization_id = 'shenkar'
);

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Exam Room 1',
  (SELECT id FROM resource_types WHERE name = 'Exam Room' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":40,"building":"A","accessible":true,"quiet":true}'::jsonb,
  true,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Exam Room 1' AND organization_id = 'shenkar'
) AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Exam Room' AND organization_id = 'shenkar'
);

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Exam Room 2',
  (SELECT id FROM resource_types WHERE name = 'Exam Room' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":30,"building":"B","accessible":false,"quiet":true}'::jsonb,
  true,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Exam Room 2' AND organization_id = 'shenkar'
) AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Exam Room' AND organization_id = 'shenkar'
);

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Library Room 1',
  (SELECT id FROM resource_types WHERE name = 'Library Room' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":8,"building":"A","silent":true}'::jsonb,
  true,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Library Room 1' AND organization_id = 'shenkar'
) AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Library Room' AND organization_id = 'shenkar'
);

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Library Room 2',
  (SELECT id FROM resource_types WHERE name = 'Library Room' AND organization_id = 'shenkar' LIMIT 1),
  '{"capacity":6,"building":"B","silent":false}'::jsonb,
  true,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Library Room 2' AND organization_id = 'shenkar'
) AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Library Room' AND organization_id = 'shenkar'
);

-- Exam resource type (computerized exam)
INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Exam',
  'Exam resource (computerized or not)',
  '[{"name":"computerized","label":"Computerized","type":"boolean"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Exam' AND organization_id = 'shenkar'
);

-- Add computer_lab field to Classroom type definition (if not already there)
UPDATE resource_types
SET fields = (
  CASE
    WHEN fields::text ILIKE '%computer_lab%' THEN fields
    ELSE (fields || '[{"name":"computer_lab","label":"Computer Lab","type":"boolean"}]'::jsonb)
  END
)
WHERE name = 'Classroom' AND organization_id = 'shenkar';

-- Ensure existing classrooms have computer_lab default
UPDATE resources
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('computer_lab', false)
WHERE organization_id = 'shenkar'
  AND type_id = (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1)
  AND (metadata ? 'computer_lab') IS NOT TRUE;

-- Exam resources
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Exam - Intro to CS (Computerized)',
  (SELECT id FROM resource_types WHERE name = 'Exam' AND organization_id = 'shenkar' LIMIT 1),
  '{"computerized":true}'::jsonb,
  true,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Exam - Intro to CS (Computerized)' AND organization_id = 'shenkar'
) AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Exam' AND organization_id = 'shenkar'
);

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Exam - History 101 (Paper)',
  (SELECT id FROM resource_types WHERE name = 'Exam' AND organization_id = 'shenkar' LIMIT 1),
  '{"computerized":false}'::jsonb,
  true,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE name = 'Exam - History 101 (Paper)' AND organization_id = 'shenkar'
) AND EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Exam' AND organization_id = 'shenkar'
);

-- Mark one classroom as computer lab for demo
UPDATE resources
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('computer_lab', true)
WHERE organization_id = 'shenkar'
  AND name = 'Computer Lab 1';
