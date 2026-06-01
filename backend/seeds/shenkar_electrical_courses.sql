INSERT INTO resource_types (name, description, fields, roles, organization_id)
SELECT
  'Courses',
  'Academic courses for scheduling and allocation',
  '[{"name":"students_number","label":"Students","type":"number"},{"name":"need_projector","label":"Need Projector","type":"boolean"},{"name":"building","label":"Preferred Building","type":"text"},{"name":"department","label":"Department","type":"text"}]'::jsonb,
  '["user","manager"]'::jsonb,
  'shenkar'
WHERE NOT EXISTS (
  SELECT 1
  FROM resource_types
  WHERE name = 'Courses' AND organization_id = 'shenkar'
);

INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  course_name,
  course_type.id,
  jsonb_build_object(
    'students_number', students_number,
    'need_projector', need_projector,
    'building', building_name,
    'department', 'electrical_engineering'
  ),
  true,
  'shenkar'
FROM (
  VALUES
    ('Circuit Design EE 201', 36, true, 'C'),
    ('Digital Electronics EE 202', 34, true, 'C'),
    ('Signal Processing EE 203', 38, true, 'C'),
    ('Embedded Systems EE 204', 30, true, 'C'),
    ('Control Systems EE 205', 32, true, 'C'),
    ('Power Electronics EE 206', 28, true, 'C'),
    ('Communication Networks EE 207', 35, true, 'C'),
    ('Microcontrollers Lab EE 208', 24, false, 'C'),
    ('Electromagnetics EE 209', 29, true, 'C'),
    ('VLSI Fundamentals EE 210', 26, true, 'C'),
    ('Sensors and Instrumentation EE 211', 27, true, 'C'),
    ('Renewable Energy Systems EE 212', 31, true, 'C')
) AS electrical_courses(course_name, students_number, need_projector, building_name)
CROSS JOIN LATERAL (
  SELECT id
  FROM resource_types
  WHERE name = 'Courses' AND organization_id = 'shenkar'
  LIMIT 1
) AS course_type
WHERE NOT EXISTS (
  SELECT 1
  FROM resources existing
  WHERE existing.name = electrical_courses.course_name
    AND existing.organization_id = 'shenkar'
);
