BEGIN;

CREATE TEMP TABLE tmp_shenkar_target_users AS
SELECT
  id,
  national_id
FROM users
WHERE organization_id = 'shenkar'
  AND LOWER(COALESCE(role, '')) <> 'admin';

CREATE TEMP TABLE tmp_reset_counts AS
SELECT
  (SELECT COUNT(*) FROM tmp_shenkar_target_users) AS users_to_delete,
  (SELECT COUNT(*) FROM bookings WHERE user_id IN (SELECT national_id FROM tmp_shenkar_target_users)) AS bookings_to_delete,
  (SELECT COUNT(*) FROM user_availability WHERE organization_id = 'shenkar' AND user_id IN (SELECT national_id FROM tmp_shenkar_target_users)) AS user_availability_to_delete,
  (SELECT COUNT(*) FROM user_availability_overrides WHERE organization_id = 'shenkar' AND user_id IN (SELECT national_id FROM tmp_shenkar_target_users)) AS user_availability_overrides_to_delete,
  (SELECT COUNT(*) FROM resource_requests WHERE organization_id = 'shenkar' AND (requester_id IN (SELECT national_id FROM tmp_shenkar_target_users) OR user_id IN (SELECT national_id FROM tmp_shenkar_target_users))) AS resource_requests_to_delete,
  (SELECT COUNT(*) FROM announcements WHERE organization_id = 'shenkar' AND target_user_id IN (SELECT national_id FROM tmp_shenkar_target_users)) AS targeted_announcements_to_delete,
  (
    SELECT COUNT(*)
    FROM resources r
    WHERE r.organization_id = 'shenkar'
      AND (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(r.metadata->'user_ids') = 'array' THEN r.metadata->'user_ids'
              ELSE '[]'::jsonb
            END
          ) AS uid(value)
          WHERE uid.value IN (SELECT national_id FROM tmp_shenkar_target_users)
        )
        OR COALESCE(r.metadata->>'responsible_user_id', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
        OR COALESCE(r.metadata->>'responsibleUserId', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
        OR COALESCE(r.metadata->>'responsible_id', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
        OR COALESCE(r.metadata->>'responsibleId', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
      )
  ) AS resources_to_clean;

DELETE FROM booking_cancellations
WHERE booking_id IN (
  SELECT id FROM bookings WHERE user_id IN (SELECT national_id FROM tmp_shenkar_target_users)
);

DELETE FROM booking_locations
WHERE booking_id IN (
  SELECT id FROM bookings WHERE user_id IN (SELECT national_id FROM tmp_shenkar_target_users)
);

DELETE FROM bookings
WHERE user_id IN (SELECT national_id FROM tmp_shenkar_target_users);

DELETE FROM user_availability
WHERE organization_id = 'shenkar'
  AND user_id IN (SELECT national_id FROM tmp_shenkar_target_users);

DELETE FROM user_availability_overrides
WHERE organization_id = 'shenkar'
  AND user_id IN (SELECT national_id FROM tmp_shenkar_target_users);

DELETE FROM resource_requests
WHERE organization_id = 'shenkar'
  AND (
    requester_id IN (SELECT national_id FROM tmp_shenkar_target_users)
    OR user_id IN (SELECT national_id FROM tmp_shenkar_target_users)
  );

DELETE FROM announcements
WHERE organization_id = 'shenkar'
  AND target_user_id IN (SELECT national_id FROM tmp_shenkar_target_users);

UPDATE resources r
SET metadata = cleaned.final_meta
FROM (
  WITH RECURSIVE affected_resources AS (
    SELECT
      r.id,
      CASE
        WHEN jsonb_typeof(r.metadata) = 'object' THEN r.metadata
        ELSE '{}'::jsonb
      END AS meta,
      ARRAY(
        SELECT field->>'name'
        FROM jsonb_array_elements(COALESCE(rt.fields, '[]'::jsonb)) AS field
        WHERE field->>'type' = 'number'
          AND COALESCE(field->>'name', '') <> ''
          AND (
            COALESCE(field->>'auto_user_count', 'false') = 'true'
            OR field->>'name' = 'students_number'
          )
      ) AS auto_count_fields
    FROM resources r
    JOIN resource_types rt ON rt.id = r.type_id
    WHERE r.organization_id = 'shenkar'
      AND (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(r.metadata->'user_ids') = 'array' THEN r.metadata->'user_ids'
              ELSE '[]'::jsonb
            END
          ) AS uid(value)
          WHERE uid.value IN (SELECT national_id FROM tmp_shenkar_target_users)
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(r.metadata->'userIds') = 'array' THEN r.metadata->'userIds'
              ELSE '[]'::jsonb
            END
          ) AS uid(value)
          WHERE uid.value IN (SELECT national_id FROM tmp_shenkar_target_users)
        )
        OR COALESCE(r.metadata->>'responsible_user_id', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
        OR COALESCE(r.metadata->>'responsibleUserId', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
        OR COALESCE(r.metadata->>'responsible_id', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
        OR COALESCE(r.metadata->>'responsibleId', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
      )
  ),
  prepared AS (
    SELECT
      ar.id,
      ar.auto_count_fields,
      COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(uid.value))
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(ar.meta->'user_ids') = 'array' THEN ar.meta->'user_ids'
              ELSE '[]'::jsonb
            END
          ) AS uid(value)
          WHERE uid.value NOT IN (SELECT national_id FROM tmp_shenkar_target_users)
        ),
        '[]'::jsonb
      ) AS filtered_user_ids,
      COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(uid.value))
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(ar.meta->'userIds') = 'array' THEN ar.meta->'userIds'
              ELSE '[]'::jsonb
            END
          ) AS uid(value)
          WHERE uid.value NOT IN (SELECT national_id FROM tmp_shenkar_target_users)
        ),
        '[]'::jsonb
      ) AS filtered_userIds,
      CASE
        WHEN jsonb_typeof(ar.meta->'user_ids') = 'array'
          THEN jsonb_set(ar.meta, '{user_ids}', COALESCE(
            (
              SELECT jsonb_agg(to_jsonb(uid.value))
              FROM jsonb_array_elements_text(ar.meta->'user_ids') AS uid(value)
              WHERE uid.value NOT IN (SELECT national_id FROM tmp_shenkar_target_users)
            ),
            '[]'::jsonb
          ), true)
        ELSE ar.meta
      END AS meta_with_filtered_user_ids
    FROM affected_resources ar
  ),
  prepared_with_legacy_key AS (
    SELECT
      p.id,
      p.auto_count_fields,
      p.filtered_user_ids,
      CASE
        WHEN jsonb_typeof(p.meta_with_filtered_user_ids->'userIds') = 'array'
          THEN jsonb_set(p.meta_with_filtered_user_ids, '{userIds}', p.filtered_userIds, true)
        ELSE p.meta_with_filtered_user_ids
      END AS meta_after_user_lists
    FROM prepared p
  ),
  prepared_without_responsibles AS (
    SELECT
      step3.id,
      step3.auto_count_fields,
      step3.filtered_user_ids,
      CASE
        WHEN COALESCE(step3.meta->>'responsibleId', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
          THEN step3.meta - 'responsibleId'
        ELSE step3.meta
      END AS base_meta
    FROM (
      SELECT
        step2.id,
        step2.auto_count_fields,
        step2.filtered_user_ids,
        CASE
          WHEN COALESCE(step2.meta->>'responsible_id', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
            THEN step2.meta - 'responsible_id'
          ELSE step2.meta
        END AS meta
      FROM (
        SELECT
          step1.id,
          step1.auto_count_fields,
          step1.filtered_user_ids,
          CASE
            WHEN COALESCE(step1.meta->>'responsibleUserId', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
              THEN step1.meta - 'responsibleUserId'
            ELSE step1.meta
          END AS meta
        FROM (
          SELECT
            p.id,
            p.auto_count_fields,
            p.filtered_user_ids,
            CASE
              WHEN COALESCE(p.meta_after_user_lists->>'responsible_user_id', '') IN (SELECT national_id FROM tmp_shenkar_target_users)
                THEN p.meta_after_user_lists - 'responsible_user_id'
              ELSE p.meta_after_user_lists
            END AS meta
          FROM prepared_with_legacy_key p
        ) AS step1
      ) AS step2
    ) AS step3
  ),
  apply_auto_counts AS (
    SELECT
      p.id,
      p.auto_count_fields,
      1 AS idx,
      p.base_meta AS meta,
      jsonb_array_length(p.filtered_user_ids) AS assigned_count
    FROM prepared_without_responsibles p
    UNION ALL
    SELECT
      a.id,
      a.auto_count_fields,
      a.idx + 1,
      CASE
        WHEN a.idx <= COALESCE(array_length(a.auto_count_fields, 1), 0)
          THEN jsonb_set(
            a.meta,
            ARRAY[a.auto_count_fields[a.idx]],
            to_jsonb(a.assigned_count),
            true
          )
        ELSE a.meta
      END AS meta,
      a.assigned_count
    FROM apply_auto_counts a
    WHERE a.idx <= COALESCE(array_length(a.auto_count_fields, 1), 0)
  )
  SELECT DISTINCT ON (aac.id)
    aac.id,
    aac.meta AS final_meta
  FROM apply_auto_counts aac
  ORDER BY aac.id, aac.idx DESC
) AS cleaned
WHERE r.id = cleaned.id;

DELETE FROM users
WHERE organization_id = 'shenkar'
  AND LOWER(COALESCE(role, '')) <> 'admin';

SELECT * FROM tmp_reset_counts;

COMMIT;
