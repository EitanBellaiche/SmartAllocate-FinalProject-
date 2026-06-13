BEGIN;

CREATE TEMP TABLE tmp_shenkar_course_resources AS
SELECT r.id
FROM resources r
JOIN resource_types rt ON rt.id = r.type_id
WHERE r.organization_id = 'shenkar'
  AND rt.organization_id = 'shenkar'
  AND rt.name = 'Courses';

CREATE TEMP TABLE tmp_shenkar_course_bookings AS
SELECT DISTINCT br.booking_id AS id
FROM booking_resources br
WHERE br.resource_id IN (SELECT id FROM tmp_shenkar_course_resources);

CREATE TEMP TABLE tmp_shenkar_course_counts AS
SELECT
  (SELECT COUNT(*) FROM tmp_shenkar_course_resources) AS courses_to_delete,
  (SELECT COUNT(*) FROM tmp_shenkar_course_bookings) AS bookings_to_delete,
  (
    SELECT COUNT(*)
    FROM resource_requests
    WHERE organization_id = 'shenkar'
      AND resource_id IN (SELECT id FROM tmp_shenkar_course_resources)
  ) AS resource_requests_to_delete,
  (
    SELECT COUNT(*)
    FROM booking_resources
    WHERE resource_id IN (SELECT id FROM tmp_shenkar_course_resources)
  ) AS booking_resource_links_to_delete;

DELETE FROM resource_requests
WHERE organization_id = 'shenkar'
  AND resource_id IN (SELECT id FROM tmp_shenkar_course_resources);

DELETE FROM bookings
WHERE id IN (SELECT id FROM tmp_shenkar_course_bookings);

DELETE FROM resources
WHERE id IN (SELECT id FROM tmp_shenkar_course_resources);

SELECT * FROM tmp_shenkar_course_counts;

COMMIT;
