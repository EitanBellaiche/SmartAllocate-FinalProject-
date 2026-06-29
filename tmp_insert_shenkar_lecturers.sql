BEGIN;

WITH lecturers(full_name, national_id, email) AS (
  VALUES
    ('אביבית לוי', '980500001', 'lecturer001@shenkar.local'),
    ('ערן קאופמן', '980500002', 'lecturer002@shenkar.local'),
    ('דביר רוס', '980500003', 'lecturer003@shenkar.local'),
    ('ריבה שלום', '980500004', 'lecturer004@shenkar.local'),
    ('עמית רש', '980500005', 'lecturer005@shenkar.local'),
    ('ערן בינט', '980500006', 'lecturer006@shenkar.local'),
    ('יובל עוזרי', '980500007', 'lecturer007@shenkar.local'),
    ('מיכל חלמיש', '980500008', 'lecturer008@shenkar.local'),
    ('יגאל הופנר', '980500009', 'lecturer009@shenkar.local'),
    ('יצחק נודלר', '980500010', 'lecturer010@shenkar.local'),
    ('מרסלו שיכמן', '980500011', 'lecturer011@shenkar.local'),
    ('אורי שילד', '980500012', 'lecturer012@shenkar.local'),
    ('רונן פורת', '980500013', 'lecturer013@shenkar.local'),
    ('בועז שניידר', '980500014', 'lecturer014@shenkar.local')
)
INSERT INTO users (full_name, email, role, national_id, organization_id, password)
SELECT
  l.full_name,
  l.email,
  'responsible',
  l.national_id,
  'shenkar',
  'shenkar123'
FROM lecturers l
WHERE NOT EXISTS (
  SELECT 1
  FROM users u
  WHERE u.organization_id = 'shenkar'
    AND (u.national_id = l.national_id OR u.full_name = l.full_name)
);

SELECT id, full_name, role, national_id, email
FROM users
WHERE organization_id = 'shenkar'
  AND national_id BETWEEN '980500001' AND '980500014'
ORDER BY national_id;

COMMIT;
