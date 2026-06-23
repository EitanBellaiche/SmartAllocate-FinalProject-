function buildAssignedUserIdsArraySql(resourceAlias) {
  return `ARRAY(
    SELECT assigned_user_id
    FROM (
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(${resourceAlias}.metadata->'user_ids') = 'array' THEN ${resourceAlias}.metadata->'user_ids'
          ELSE '[]'::jsonb
        END
      ) AS assigned_user_id
      UNION ALL
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(${resourceAlias}.metadata->'userIds') = 'array' THEN ${resourceAlias}.metadata->'userIds'
          ELSE '[]'::jsonb
        END
      ) AS assigned_user_id
      UNION ALL
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(${resourceAlias}.metadata->'users') = 'array' THEN ${resourceAlias}.metadata->'users'
          ELSE '[]'::jsonb
        END
      ) AS assigned_user_id
      UNION ALL
      SELECT regexp_split_to_table(COALESCE(${resourceAlias}.metadata->>'user_ids', ''), E'[\\\\s,]+') AS assigned_user_id
      UNION ALL
      SELECT regexp_split_to_table(COALESCE(${resourceAlias}.metadata->>'userIds', ''), E'[\\\\s,]+') AS assigned_user_id
      UNION ALL
      SELECT regexp_split_to_table(
        CASE
          WHEN jsonb_typeof(${resourceAlias}.metadata->'users') = 'string' THEN COALESCE(${resourceAlias}.metadata->>'users', '')
          ELSE ''
        END,
        E'[\\\\s,]+'
      ) AS assigned_user_id
    ) assigned_user_ids
    WHERE assigned_user_id <> ''
  )`;
}

function buildResponsibleUserIdsArraySql(resourceAlias) {
  return `ARRAY(
    SELECT responsible_user_id
    FROM (
      SELECT COALESCE(${resourceAlias}.metadata->>'responsible_user_id', '') AS responsible_user_id
      UNION ALL
      SELECT COALESCE(${resourceAlias}.metadata->>'responsibleUserId', '') AS responsible_user_id
      UNION ALL
      SELECT COALESCE(${resourceAlias}.metadata->>'responsible_id', '') AS responsible_user_id
      UNION ALL
      SELECT COALESCE(${resourceAlias}.metadata->>'responsibleId', '') AS responsible_user_id
    ) responsible_user_ids
    WHERE responsible_user_id <> ''
  )`;
}

async function findAnyUserConflict(client, userIds, date, startTime, endTime, orgId) {
  const normalizedUserIds = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  if (normalizedUserIds.length === 0) return null;

  const params = [normalizedUserIds, date, startTime, endTime];
  let orgWhere = "";
  let assignedOrgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
    assignedOrgWhere = `AND r_user.organization_id = $${params.length}`;
  }

  const { rows } = await client.query(
    `
    WITH conflicting_bookings AS (
      SELECT DISTINCT b.id, b.user_id::text AS user_id, b.date, b.start_time, b.end_time
      FROM bookings b
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      LEFT JOIN booking_resources br ON br.booking_id = b.id
      LEFT JOIN resources r ON r.id = br.resource_id
      WHERE b.date = $2
      AND bc.booking_id IS NULL
      ${orgWhere}
      AND (
        ($3 >= b.start_time AND $3 < b.end_time) OR
        ($4 > b.start_time AND $4 <= b.end_time) OR
        ($3 <= b.start_time AND $4 >= b.end_time)
      )
      AND (
        b.user_id::text = ANY($1)
        OR EXISTS (
          SELECT 1
          FROM booking_resources br_user
          JOIN resources r_user ON r_user.id = br_user.resource_id
          WHERE br_user.booking_id = b.id
          ${assignedOrgWhere}
          AND (
            ${buildAssignedUserIdsArraySql("r_user")} && $1::text[]
            OR ${buildResponsibleUserIdsArraySql("r_user")} && $1::text[]
          )
        )
      )
    )
    SELECT
      cb.id,
      cb.user_id,
      cb.date,
      cb.start_time,
      cb.end_time,
      COALESCE(match_info.matched_user_id, cb.user_id) AS matched_user_id,
      u.full_name AS matched_user_full_name,
      u.email AS matched_user_email
    FROM conflicting_bookings cb
    LEFT JOIN LATERAL (
      SELECT matched_user_id
      FROM (
        SELECT cb.user_id AS matched_user_id
        WHERE cb.user_id = ANY($1)

        UNION ALL

        SELECT matched.assigned_user_id AS matched_user_id
        FROM booking_resources br_user
        JOIN resources r_user ON r_user.id = br_user.resource_id
        CROSS JOIN LATERAL (
          SELECT assigned_user_id
          FROM unnest(${buildAssignedUserIdsArraySql("r_user")}) AS assigned_users(assigned_user_id)
          WHERE assigned_user_id = ANY($1)

          UNION ALL

          SELECT responsible_user_id AS assigned_user_id
          FROM unnest(${buildResponsibleUserIdsArraySql("r_user")}) AS responsible_users(responsible_user_id)
          WHERE responsible_user_id = ANY($1)
        ) matched
        WHERE br_user.booking_id = cb.id
        ${assignedOrgWhere}
      ) matched_candidates
      WHERE matched_user_id <> ''
      LIMIT 1
    ) match_info ON TRUE
    LEFT JOIN users u
      ON u.national_id = COALESCE(match_info.matched_user_id, cb.user_id)
      OR u.id::text = COALESCE(match_info.matched_user_id, cb.user_id)
    ORDER BY cb.date, cb.start_time, cb.id
    LIMIT 1
    `,
    params
  );

  return rows[0] || null;
}

export async function findUsersConflict(client, userIds, date, startTime, endTime, orgId) {
  return findAnyUserConflict(client, userIds, date, startTime, endTime, orgId);
}

export async function hasUserConflict(client, userIds, date, startTime, endTime, orgId) {
  const conflict = await findAnyUserConflict(client, userIds, date, startTime, endTime, orgId);
  return Boolean(conflict);
}

export async function findUserConflict(client, userId, date, startTime, endTime, orgId) {
  return findAnyUserConflict(
    client,
    userId ? [String(userId)] : [],
    date,
    startTime,
    endTime,
    orgId
  );
}

export async function hasResourceConflict(client, resourceIds, date, startTime, endTime, orgId) {
  if (!resourceIds.length) return false;
  const params = [resourceIds, date, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT b.id
    FROM booking_resources br
    JOIN bookings b ON b.id = br.booking_id
    JOIN resources r ON r.id = br.resource_id
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    WHERE br.resource_id = ANY($1)
    AND b.date = $2
    AND bc.booking_id IS NULL
    ${orgWhere}
    AND (
      ($3 >= b.start_time AND $3 < b.end_time) OR
      ($4 > b.start_time AND $4 <= b.end_time) OR
      ($3 <= b.start_time AND $4 >= b.end_time)
    )
    LIMIT 1
    `,
    params
  );
  return rows.length > 0;
}

export async function findResourceConflictDetails(client, resourceIds, date, startTime, endTime, orgId) {
  if (!resourceIds.length) return null;
  const params = [resourceIds, date, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT
      b.id,
      b.user_id,
      b.date,
      b.start_time,
      b.end_time,
      r.id AS resource_id,
      r.name AS resource_name,
      rt.name AS resource_type_name
    FROM booking_resources br
    JOIN bookings b ON b.id = br.booking_id
    JOIN resources r ON r.id = br.resource_id
    JOIN resource_types rt ON rt.id = r.type_id
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    WHERE br.resource_id = ANY($1)
    AND b.date = $2
    AND bc.booking_id IS NULL
    ${orgWhere}
    AND (
      ($3 >= b.start_time AND $3 < b.end_time) OR
      ($4 > b.start_time AND $4 <= b.end_time) OR
      ($3 <= b.start_time AND $4 >= b.end_time)
    )
    ORDER BY b.date, b.start_time, b.id
    LIMIT 1
    `,
    params
  );
  return rows[0] || null;
}

export async function hasExactBooking(client, userId, resourceIds, date, startTime, endTime, orgId) {
  if (!userId || resourceIds.length === 0) return false;
  const params = [userId, date, startTime, endTime, resourceIds, resourceIds.length];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT b.id
    FROM bookings b
    JOIN booking_resources br ON br.booking_id = b.id
    JOIN resources r ON r.id = br.resource_id
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    WHERE b.user_id = $1
    AND b.date = $2
    AND b.start_time = $3
    AND b.end_time = $4
    AND bc.booking_id IS NULL
    ${orgWhere}
    GROUP BY b.id
    HAVING COUNT(DISTINCT br.resource_id) = $6
       AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($5) THEN br.resource_id END) = $6
    LIMIT 1
    `,
    params
  );
  return rows.length > 0;
}

import { formatDate } from "./timeUtils.js";

export async function weekAlreadyScheduled(client, resourceIds, weekStart, weekEnd, orgId) {
  if (!resourceIds.length) return false;
  const params = [resourceIds, formatDate(weekStart), formatDate(weekEnd), resourceIds.length];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT b.id
    FROM booking_resources br
    JOIN bookings b ON b.id = br.booking_id
    JOIN resources r ON r.id = br.resource_id
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    WHERE br.resource_id = ANY($1)
    AND b.date BETWEEN $2 AND $3
    AND bc.booking_id IS NULL
    ${orgWhere}
    GROUP BY b.id
    HAVING COUNT(DISTINCT br.resource_id) = $4
    LIMIT 1
    `,
    params
  );
  return rows.length > 0;
}
