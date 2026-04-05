-- Seed rules for Shenkar college

-- 1) Classroom must have projector
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1) AS lab_id,
    (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1) AS studio_id,
    (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1) AS meeting_id,
    (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1) AS equipment_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Classroom must have projector',
  'Block classrooms without a projector',
  'resource',
  true,
  true,
  0,
  0,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.classroom_id),
      jsonb_build_object('field','resource.metadata.projector','op','==','value', true)
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.classroom_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Classroom must have projector' AND organization_id = 'shenkar'
  );

-- 2) Course size must fit classroom capacity (pair)
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1) AS lab_id,
    (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1) AS studio_id,
    (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1) AS meeting_id,
    (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1) AS equipment_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Course must fit classroom capacity',
  'Block when course size exceeds classroom capacity',
  'pair',
  true,
  true,
  0,
  1,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.classroom_id),
      jsonb_build_object(
        'field','resource.metadata.capacity',
        'op','<',
        'value', jsonb_build_object('ref', CONCAT('resources_by_type_id.', t.course_id, '.metadata.students_number'))
      )
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.classroom_id IS NOT NULL AND t.course_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Course must fit classroom capacity' AND organization_id = 'shenkar'
  );

-- 3) Lab must include PC equipment
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1) AS lab_id,
    (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1) AS studio_id,
    (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1) AS meeting_id,
    (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1) AS equipment_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Lab must include PCs',
  'Block labs without PC equipment',
  'resource',
  true,
  true,
  0,
  2,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.lab_id),
      jsonb_build_object('not', jsonb_build_object('field','resource.metadata.equipment','op','contains','value','PC'))
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.lab_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Lab must include PCs' AND organization_id = 'shenkar'
  );

-- 4) Meeting room requires whiteboard
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1) AS lab_id,
    (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1) AS studio_id,
    (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1) AS meeting_id,
    (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1) AS equipment_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Meeting room requires whiteboard',
  'Block meeting rooms without a whiteboard',
  'resource',
  true,
  true,
  0,
  3,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.meeting_id),
      jsonb_build_object('field','resource.metadata.whiteboard','op','!=','value', true)
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.meeting_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Meeting room requires whiteboard' AND organization_id = 'shenkar'
  );

-- 5) Prefer classrooms in Building A (score)
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1) AS lab_id,
    (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1) AS studio_id,
    (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1) AS meeting_id,
    (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1) AS equipment_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Prefer Building A classrooms',
  'Add score to classrooms in building A',
  'resource',
  false,
  true,
  10,
  4,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.classroom_id),
      jsonb_build_object('field','resource.metadata.building','op','==','value','A')
    )
  ),
  jsonb_build_object('effect','score','delta',10),
  'shenkar'
FROM t
WHERE t.classroom_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Prefer Building A classrooms' AND organization_id = 'shenkar'
  );

-- 6) Projector kits must have quantity >= 1
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1) AS lab_id,
    (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1) AS studio_id,
    (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1) AS meeting_id,
    (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1) AS equipment_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Projector kit must be available',
  'Block projector kits with zero quantity',
  'resource',
  true,
  true,
  0,
  5,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.equipment_id),
      jsonb_build_object('field','resource.metadata.category','op','==','value','projector'),
      jsonb_build_object('field','resource.metadata.quantity','op','<','value',1)
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.equipment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Projector kit must be available' AND organization_id = 'shenkar'
  );

-- 7) Studio must have equipment field
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Lab' AND organization_id = 'shenkar' LIMIT 1) AS lab_id,
    (SELECT id FROM resource_types WHERE name = 'Studio' AND organization_id = 'shenkar' LIMIT 1) AS studio_id,
    (SELECT id FROM resource_types WHERE name = 'Meeting Room' AND organization_id = 'shenkar' LIMIT 1) AS meeting_id,
    (SELECT id FROM resource_types WHERE name = 'Equipment' AND organization_id = 'shenkar' LIMIT 1) AS equipment_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Studio must list equipment',
  'Block studios without equipment metadata',
  'resource',
  true,
  true,
  0,
  6,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.studio_id),
      jsonb_build_object('not', jsonb_build_object('field','resource.metadata.equipment','op','exists','value', true))
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.studio_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Studio must list equipment' AND organization_id = 'shenkar'
  );

-- Additional rules for new types

-- 8) Auditorium must have projector
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Auditorium' AND organization_id = 'shenkar' LIMIT 1) AS auditorium_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Auditorium must have projector',
  'Block auditoriums without a projector',
  'resource',
  true,
  true,
  0,
  7,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.auditorium_id),
      jsonb_build_object('field','resource.metadata.projector','op','==','value', true)
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.auditorium_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Auditorium must have projector' AND organization_id = 'shenkar'
  );

-- 9) Auditorium must have sound system
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Auditorium' AND organization_id = 'shenkar' LIMIT 1) AS auditorium_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Auditorium must have sound system',
  'Block auditoriums without sound system',
  'resource',
  true,
  true,
  0,
  8,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.auditorium_id),
      jsonb_build_object('field','resource.metadata.sound_system','op','==','value', true)
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.auditorium_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Auditorium must have sound system' AND organization_id = 'shenkar'
  );

-- 10) Exam rooms must be quiet
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Exam Room' AND organization_id = 'shenkar' LIMIT 1) AS exam_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Exam room must be quiet',
  'Block exam rooms that are not quiet',
  'resource',
  true,
  true,
  0,
  9,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.exam_id),
      jsonb_build_object('field','resource.metadata.quiet','op','==','value', true)
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.exam_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Exam room must be quiet' AND organization_id = 'shenkar'
  );

-- 11) Exam rooms should be accessible (score)
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Exam Room' AND organization_id = 'shenkar' LIMIT 1) AS exam_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Prefer accessible exam rooms',
  'Add score for accessible exam rooms',
  'resource',
  false,
  true,
  5,
  10,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.exam_id),
      jsonb_build_object('field','resource.metadata.accessible','op','==','value', true)
    )
  ),
  jsonb_build_object('effect','score','delta',5),
  'shenkar'
FROM t
WHERE t.exam_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Prefer accessible exam rooms' AND organization_id = 'shenkar'
  );

-- 12) Library rooms must be silent
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Library Room' AND organization_id = 'shenkar' LIMIT 1) AS library_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Library room must be silent',
  'Block library rooms that are not silent',
  'resource',
  true,
  true,
  0,
  11,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.library_id),
      jsonb_build_object('field','resource.metadata.silent','op','==','value', true)
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.library_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Library room must be silent' AND organization_id = 'shenkar'
  );

-- 13) Prefer smaller library rooms for quiet study (score)
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Library Room' AND organization_id = 'shenkar' LIMIT 1) AS library_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Prefer smaller library rooms',
  'Add score to library rooms with capacity <= 6',
  'resource',
  false,
  true,
  5,
  12,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.library_id),
      jsonb_build_object('field','resource.metadata.capacity','op','<=','value', 6)
    )
  ),
  jsonb_build_object('effect','score','delta',5),
  'shenkar'
FROM t
WHERE t.library_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Prefer smaller library rooms' AND organization_id = 'shenkar'
  );

-- Exam computerized requires computer lab classroom (pair)
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Exam' AND organization_id = 'shenkar' LIMIT 1) AS exam_id,
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Computerized exam requires computer lab',
  'Block computerized exams unless classroom is a computer lab',
  'pair',
  true,
  true,
  0,
  20,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.classroom_id),
      jsonb_build_object(
        'field', CONCAT('resources_by_type_id.', t.exam_id, '.metadata.computerized'),
        'op','==',
        'value', true
      ),
      jsonb_build_object(
        'field','resource.metadata.computer_lab',
        'op','!=',
        'value', true
      )
    )
  ),
  jsonb_build_object('effect','forbid'),
  'shenkar'
FROM t
WHERE t.exam_id IS NOT NULL AND t.classroom_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Computerized exam requires computer lab' AND organization_id = 'shenkar'
  );

-- 21) Prefer Fernic classrooms for software and electrical engineering courses
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Prefer Fernic classrooms for engineering courses',
  'Add score when software engineering or electrical engineering courses are assigned to Fernic classrooms',
  'pair',
  false,
  true,
  7,
  27,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.classroom_id),
      jsonb_build_object('field','resource.metadata.building','op','==','value', 'Fernic'),
      jsonb_build_object(
        'any', jsonb_build_array(
          jsonb_build_object(
            'field', CONCAT('resources_by_type_id.', t.course_id, '.metadata.software_engineering'),
            'op','==',
            'value', true
          ),
          jsonb_build_object(
            'field', CONCAT('resources_by_type_id.', t.course_id, '.metadata.electrical_engineering'),
            'op','==',
            'value', true
          )
        )
      )
    )
  ),
  jsonb_build_object('effect','score','delta',7),
  'shenkar'
FROM t
WHERE t.course_id IS NOT NULL
  AND t.classroom_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Prefer Fernic classrooms for engineering courses' AND organization_id = 'shenkar'
  );

-- 22) Prefer Mitchel and Workshops classrooms for design courses
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Prefer Mitchel and Workshops classrooms for design courses',
  'Add score when design courses are assigned to classrooms in Mitchel or Workshops',
  'pair',
  false,
  true,
  7,
  28,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.classroom_id),
      jsonb_build_object(
        'any', jsonb_build_array(
          jsonb_build_object('field','resource.metadata.building','op','==','value', 'Mitchel'),
          jsonb_build_object('field','resource.metadata.building','op','==','value', 'Workshops')
        )
      ),
      jsonb_build_object(
        'field', CONCAT('resources_by_type_id.', t.course_id, '.metadata.design'),
        'op','==',
        'value', true
      )
    )
  ),
  jsonb_build_object('effect','score','delta',7),
  'shenkar'
FROM t
WHERE t.course_id IS NOT NULL
  AND t.classroom_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Prefer Mitchel and Workshops classrooms for design courses' AND organization_id = 'shenkar'
  );

-- 23) Discourage Fernic classrooms for design courses
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Discourage Fernic classrooms for design courses',
  'Reduce score when design courses are assigned to Fernic classrooms',
  'pair',
  false,
  true,
  -4,
  29,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.classroom_id),
      jsonb_build_object('field','resource.metadata.building','op','==','value', 'Fernic'),
      jsonb_build_object(
        'field', CONCAT('resources_by_type_id.', t.course_id, '.metadata.design'),
        'op','==',
        'value', true
      )
    )
  ),
  jsonb_build_object('effect','score','delta',-4),
  'shenkar'
FROM t
WHERE t.course_id IS NOT NULL
  AND t.classroom_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Discourage Fernic classrooms for design courses' AND organization_id = 'shenkar'
  );

-- 24) Discourage Mitchel and Workshops classrooms for engineering courses
WITH t AS (
  SELECT
    (SELECT id FROM resource_types WHERE name = 'Classroom' AND organization_id = 'shenkar' LIMIT 1) AS classroom_id,
    (SELECT id FROM resource_types WHERE name = 'Courses' AND organization_id = 'shenkar' LIMIT 1) AS course_id
)
INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
SELECT
  'Discourage Mitchel and Workshops classrooms for engineering courses',
  'Reduce score when software engineering or electrical engineering courses are assigned to classrooms in Mitchel or Workshops',
  'pair',
  false,
  true,
  -4,
  30,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('field','resource.type_id','op','==','value', t.classroom_id),
      jsonb_build_object(
        'any', jsonb_build_array(
          jsonb_build_object('field','resource.metadata.building','op','==','value', 'Mitchel'),
          jsonb_build_object('field','resource.metadata.building','op','==','value', 'Workshops')
        )
      ),
      jsonb_build_object(
        'any', jsonb_build_array(
          jsonb_build_object(
            'field', CONCAT('resources_by_type_id.', t.course_id, '.metadata.software_engineering'),
            'op','==',
            'value', true
          ),
          jsonb_build_object(
            'field', CONCAT('resources_by_type_id.', t.course_id, '.metadata.electrical_engineering'),
            'op','==',
            'value', true
          )
        )
      )
    )
  ),
  jsonb_build_object('effect','score','delta',-4),
  'shenkar'
FROM t
WHERE t.course_id IS NOT NULL
  AND t.classroom_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM rules WHERE name = 'Discourage Mitchel and Workshops classrooms for engineering courses' AND organization_id = 'shenkar'
  );
