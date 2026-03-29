-- Demo cinema org data for SmartAllocate.
-- Organization ID: yesPlanetRamatGan

-- Users
INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Maya Azulay', 'maya.manager@yesplanetramatgan', 'manager', '920000210', 'yesPlanetRamatGan', 'manager123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000210' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Omer Ben David', 'omer.staff@yesplanetramatgan', 'user', '920000211', 'yesPlanetRamatGan', 'user123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000211' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Yes Planet Admin', 'admin@yesplanetramatgan', 'admin', '920000201', 'yesPlanetRamatGan', 'admin123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000201' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Amit Cohen', 'amit.cohen@yesplanetramatgan', 'responsible', '920000301', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000301' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Noa Levi', 'noa.levi@yesplanetramatgan', 'responsible', '920000302', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000302' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Yonatan Mizrahi', 'yonatan.mizrahi@yesplanetramatgan', 'responsible', '920000303', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000303' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Shira Peretz', 'shira.peretz@yesplanetramatgan', 'responsible', '920000304', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000304' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Omer Biton', 'omer.biton@yesplanetramatgan', 'responsible', '920000305', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000305' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Maya Haddad', 'maya.haddad@yesplanetramatgan', 'responsible', '920000306', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000306' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Eyal Amar', 'eyal.amar@yesplanetramatgan', 'responsible', '920000307', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000307' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Tamar Dahan', 'tamar.dahan@yesplanetramatgan', 'responsible', '920000308', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000308' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Gal Naim', 'gal.naim@yesplanetramatgan', 'responsible', '920000309', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000309' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT 'Roni Avraham', 'roni.avraham@yesplanetramatgan', 'responsible', '920000310', 'yesPlanetRamatGan', 'responsible123'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE national_id = '920000310' AND organization_id = 'yesPlanetRamatGan'
);

-- Resource types
INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Screening',
  'Cinema screening slot',
  '[{"name":"movie_title","label":"Movie title","type":"text"},{"name":"auditorium","label":"Auditorium","type":"text"},{"name":"language","label":"Language","type":"text"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'yesPlanetRamatGan'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan'
);

INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Cinema Area',
  'Operational cinema area',
  '[{"name":"zone","label":"Zone","type":"text"},{"name":"capacity","label":"Capacity","type":"number"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'yesPlanetRamatGan'
WHERE NOT EXISTS (
  SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
);

-- Resources
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Screening - Dune Part Two 19:00',
  (SELECT id FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"movie_title":"Dune Part Two","auditorium":"Hall 1","language":"English"}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Screening - Dune Part Two 19:00' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Screening - Kung Fu Panda 16:30',
  (SELECT id FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"movie_title":"Kung Fu Panda","auditorium":"Hall 3","language":"Hebrew"}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Screening - Kung Fu Panda 16:30' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Screening - Inside Out 2 18:10',
  (SELECT id FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"movie_title":"Inside Out 2","auditorium":"Hall 5","language":"Hebrew"}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Screening - Inside Out 2 18:10' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Screening - Mission Impossible 21:15',
  (SELECT id FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"movie_title":"Mission Impossible","auditorium":"Hall 2","language":"English"}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Screening - Mission Impossible 21:15' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Screening - Moana 2 17:00',
  (SELECT id FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"movie_title":"Moana 2","auditorium":"Hall 4","language":"Hebrew"}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Screening - Moana 2 17:00' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Screening - Gladiator II 22:00',
  (SELECT id FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"movie_title":"Gladiator II","auditorium":"IMAX Hall","language":"English"}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Screening - Gladiator II 22:00' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Screening - Wicked 20:30',
  (SELECT id FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"movie_title":"Wicked","auditorium":"Hall 6","language":"English"}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Screening - Wicked 20:30' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Screening' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Hall 1',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"screening hall","capacity":220}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Hall 1' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Hall 3',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"screening hall","capacity":180}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Hall 3' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Hall 2',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"screening hall","capacity":200}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Hall 2' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Hall 4',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"screening hall","capacity":160}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Hall 4' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Hall 5',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"screening hall","capacity":140}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Hall 5' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Hall 6',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"screening hall","capacity":130}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Hall 6' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'IMAX Hall',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"imax","capacity":280}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'IMAX Hall' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'VIP Lounge',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"vip","capacity":40}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'VIP Lounge' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  'Snack Bar',
  (SELECT id FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan' LIMIT 1),
  '{"zone":"concessions","capacity":6}'::jsonb,
  true,
  'yesPlanetRamatGan'
WHERE
  NOT EXISTS (
    SELECT 1 FROM resources WHERE name = 'Snack Bar' AND organization_id = 'yesPlanetRamatGan'
  )
  AND EXISTS (
    SELECT 1 FROM resource_types WHERE name = 'Cinema Area' AND organization_id = 'yesPlanetRamatGan'
  );
