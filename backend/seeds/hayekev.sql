-- Demo restaurant org data for SmartAllocate.
-- Organization ID: hayekev

-- Users
INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Dana Romano', 'dana.manager@hayekev', 'manager', '910000110', 'hayekev', 'manager123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '910000110' AND organization_id = 'hayekev'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Lior Ben Ami', 'lior.staff@hayekev', 'user', '910000111', 'hayekev', 'user123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '910000111' AND organization_id = 'hayekev'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Hayekev Admin', 'admin@hayekev', 'admin', '910000101', 'hayekev', 'admin123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '910000101' AND organization_id = 'hayekev'
);

-- Resource types
INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Shift',
  'Restaurant work shift',
  '[{"name":"team_size","label":"Team size","type":"number"},{"name":"area","label":"Area","type":"text"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'hayekev'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Station',
  'Kitchen or floor station',
  '[{"name":"zone","label":"Zone","type":"text"},{"name":"capacity","label":"Capacity","type":"number"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'hayekev'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
);

-- Resources
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Lunch Shift',
  (SELECT id FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev' LIMIT 1),
  '{"team_size":6,"area":"dining room"}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Lunch Shift' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Dinner Shift',
  (SELECT id FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev' LIMIT 1),
  '{"team_size":8,"area":"kitchen"}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Dinner Shift' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Weekend Brunch Shift',
  (SELECT id FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev' LIMIT 1),
  '{"team_size":7,"area":"brunch service"}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Weekend Brunch Shift' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Closing Shift',
  (SELECT id FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev' LIMIT 1),
  '{"team_size":4,"area":"closing duties"}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Closing Shift' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Shift' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Pizza Station',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"kitchen","capacity":2}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Pizza Station' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Bar Counter',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"front","capacity":1}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Bar Counter' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Cold Prep Station',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"kitchen","capacity":2}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Cold Prep Station' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Dessert Station',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"pastry","capacity":1}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Dessert Station' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Host Stand',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"entrance","capacity":1}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Host Stand' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Outdoor Patio Section',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"patio","capacity":3}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Outdoor Patio Section' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Table 1',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"dining room","capacity":4}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Table 1' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Table 2',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"dining room","capacity":2}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Table 2' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Table 3',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"dining room","capacity":6}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Table 3' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Table 4',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"dining room","capacity":4}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Table 4' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Table 5',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"patio","capacity":4}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Table 5' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Table 6',
  (SELECT id FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev' LIMIT 1),
  '{"zone":"patio","capacity":2}'::jsonb,
  true,
  'hayekev'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Table 6' AND organization_id = 'hayekev'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Station' AND organization_id = 'hayekev'
  );
