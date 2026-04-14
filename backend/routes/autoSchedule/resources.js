export async function loadResourceRowsByIds(client, resourceIds, orgId) {
  if (!resourceIds.length) return [];
  const params = [resourceIds];
  let where = "WHERE r.id = ANY($1)";
  if (orgId) {
    params.push(orgId);
    where += ` AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT r.*, rt.name AS type_name
    FROM resources r
    JOIN resource_types rt ON rt.id = r.type_id
    ${where}
    ORDER BY r.id
    `,
    params
  );
  return rows;
}

export async function loadCandidateRowsByTypeIds(
  client,
  typeIds,
  orgId,
  bookingDate,
  startTime,
  endTime,
  excludedResourceIds
) {
  if (!typeIds.length) return [];
  const params = [typeIds, bookingDate, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  let exclusionWhere = "";
  if (excludedResourceIds.length > 0) {
    params.push(excludedResourceIds);
    exclusionWhere = `AND r.id <> ALL($${params.length})`;
  }
  const { rows } = await client.query(
    `
    SELECT r.*, rt.name AS type_name
    FROM resources r
    JOIN resource_types rt ON rt.id = r.type_id
    WHERE r.type_id = ANY($1)
      AND COALESCE(r.active, true) = true
      ${orgWhere}
      ${exclusionWhere}
      AND NOT EXISTS (
        SELECT 1
        FROM booking_resources br
        JOIN bookings b ON b.id = br.booking_id
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        WHERE br.resource_id = r.id
          AND b.date = $2
          AND bc.booking_id IS NULL
          AND (
            ($3 >= b.start_time AND $3 < b.end_time) OR
            ($4 > b.start_time AND $4 <= b.end_time) OR
            ($3 <= b.start_time AND $4 >= b.end_time)
          )
      )
    ORDER BY r.type_id ASC, LOWER(r.name) ASC, r.id ASC
    `,
    params
  );
  return rows;
}

