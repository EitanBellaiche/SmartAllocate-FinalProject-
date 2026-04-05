-- Top up Shenkar courses to a total of 300.
-- Adds 276 courses: 69 per department
-- software_engineering, electrical_engineering,
-- industrial_engineering_management, design

WITH course_type AS (
  SELECT id
  FROM resource_types
  WHERE name = 'Courses' AND organization_id = 'shenkar'
  LIMIT 1
),
departments AS (
  SELECT *
  FROM (
    VALUES
      ('software_engineering', 'Software Engineering', 'SE', 'Mitchel', true),
      ('electrical_engineering', 'Electrical Engineering', 'EE', 'C', true),
      ('industrial_engineering_management', 'Industrial Engineering and Management', 'IEM', 'Fernic', true),
      ('design', 'Design', 'DES', 'Workshops', false)
  ) AS d(department_key, department_label, department_code, building_name, projector_default)
),
generated_courses AS (
  SELECT
    d.department_key,
    d.department_label,
    d.department_code,
    d.building_name,
    d.projector_default,
    gs AS seq,
    (CASE
      WHEN d.department_key = 'software_engineering' THEN
        CASE ((gs - 1) % 10)
          WHEN 0 THEN 'Algorithms Studio'
          WHEN 1 THEN 'Backend Systems'
          WHEN 2 THEN 'Frontend Engineering'
          WHEN 3 THEN 'Cloud Applications'
          WHEN 4 THEN 'Quality Assurance'
          WHEN 5 THEN 'DevOps Workshop'
          WHEN 6 THEN 'Software Architecture'
          WHEN 7 THEN 'Agile Product Development'
          WHEN 8 THEN 'Mobile App Engineering'
          ELSE 'Data Structures Lab'
        END
      WHEN d.department_key = 'electrical_engineering' THEN
        CASE ((gs - 1) % 10)
          WHEN 0 THEN 'Circuit Design'
          WHEN 1 THEN 'Digital Electronics'
          WHEN 2 THEN 'Signal Processing'
          WHEN 3 THEN 'Embedded Systems'
          WHEN 4 THEN 'Control Systems'
          WHEN 5 THEN 'Power Electronics'
          WHEN 6 THEN 'Communication Networks'
          WHEN 7 THEN 'Microcontrollers Lab'
          WHEN 8 THEN 'Electromagnetics'
          ELSE 'VLSI Fundamentals'
        END
      WHEN d.department_key = 'industrial_engineering_management' THEN
        CASE ((gs - 1) % 10)
          WHEN 0 THEN 'Operations Research'
          WHEN 1 THEN 'Production Planning'
          WHEN 2 THEN 'Supply Chain Analytics'
          WHEN 3 THEN 'Project Management'
          WHEN 4 THEN 'Decision Support Systems'
          WHEN 5 THEN 'Business Process Design'
          WHEN 6 THEN 'Quality Engineering'
          WHEN 7 THEN 'Optimization Models'
          WHEN 8 THEN 'Service Systems'
          ELSE 'Data Analysis for Managers'
        END
      ELSE
        CASE ((gs - 1) % 10)
          WHEN 0 THEN 'Visual Communication'
          WHEN 1 THEN 'Typography Studio'
          WHEN 2 THEN 'User Experience Design'
          WHEN 3 THEN 'Product Form Workshop'
          WHEN 4 THEN 'Brand Identity'
          WHEN 5 THEN 'Design Research'
          WHEN 6 THEN 'Interactive Media'
          WHEN 7 THEN 'Packaging Design'
          WHEN 8 THEN 'Digital Illustration'
          ELSE 'Creative Coding for Design'
        END
    END) AS base_name,
    100 + gs + (
      CASE d.department_key
        WHEN 'software_engineering' THEN 0
        WHEN 'electrical_engineering' THEN 100
        WHEN 'industrial_engineering_management' THEN 200
        ELSE 300
      END
    ) AS course_number,
    18 + ((gs * 3 + LENGTH(d.department_key)) % 38) AS students_number,
    CASE
      WHEN d.department_key = 'design' THEN (gs % 3 = 0)
      ELSE (gs % 4 <> 0)
    END AS need_projector
  FROM departments d
  CROSS JOIN generate_series(1, 69) AS gs
)
INSERT INTO resources (name, type_id, metadata, active, organization_id)
SELECT
  gc.base_name || ' ' || gc.department_code || ' ' || gc.course_number AS name,
  ct.id AS type_id,
  jsonb_build_object(
    'students_number', gc.students_number,
    'need_projector', gc.need_projector,
    'building', gc.building_name,
    'department', gc.department_key
  ) AS metadata,
  true AS active,
  'shenkar' AS organization_id
FROM generated_courses gc
CROSS JOIN course_type ct
WHERE NOT EXISTS (
  SELECT 1
  FROM resources r
  WHERE r.name = gc.base_name || ' ' || gc.department_code || ' ' || gc.course_number
    AND r.organization_id = 'shenkar'
);
