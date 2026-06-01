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
    SELECT DISTINCT b.id, b.user_id, b.date, b.start_time, b.end_time
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
          CASE
            WHEN jsonb_typeof(r_user.metadata->'user_ids') = 'array' THEN r_user.metadata->'user_ids'
            ELSE '[]'::jsonb
          END ?| $1
          OR CASE
            WHEN jsonb_typeof(r_user.metadata->'userIds') = 'array' THEN r_user.metadata->'userIds'
            ELSE '[]'::jsonb
          END ?| $1
          OR CASE
            WHEN jsonb_typeof(r_user.metadata->'users') = 'array' THEN r_user.metadata->'users'
            ELSE '[]'::jsonb
          END ?| $1
          OR COALESCE(r_user.metadata->>'responsible_user_id', '') = ANY($1)
          OR COALESCE(r_user.metadata->>'responsibleUserId', '') = ANY($1)
          OR COALESCE(r_user.metadata->>'responsible_id', '') = ANY($1)
          OR COALESCE(r_user.metadata->>'responsibleId', '') = ANY($1)
        )
      )
    )
    ORDER BY b.date, b.start_time, b.id
    LIMIT 1
    `,
    params
  );

  return rows[0] || null;
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
