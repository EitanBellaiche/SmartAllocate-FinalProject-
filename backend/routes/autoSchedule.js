import express from "express";
import pool from "../db.js";
import { evaluateRules } from "../rulesEngine.js";

const router = express.Router();

function getOrgId(req) {
  const value =
    req.query?.org_id ||
    req.query?.organization_id ||
    req.body?.org_id ||
    req.body?.organization_id;
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((p) => Number(p));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function formatDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateKey(value) {
  if (!value) return "";
  if (value instanceof Date) return formatDate(value);
  const raw = String(value);
  const trimmed = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed);
  return "";
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nextH = Math.floor(total / 60);
  const nextM = total % 60;
  return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function getWeekStart(dateObj) {
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

async function hasUserConflict(client, userIds, date, startTime, endTime, orgId) {
  if (!userIds.length) return false;
  const params = [userIds, date, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT b.id
    FROM bookings b
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    LEFT JOIN booking_resources br ON br.booking_id = b.id
    LEFT JOIN resources r ON r.id = br.resource_id
    WHERE b.user_id = ANY($1)
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

async function hasResourceConflict(client, resourceIds, date, startTime, endTime, orgId) {
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

async function hasExactBooking(client, userId, resourceIds, date, startTime, endTime, orgId) {
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

async function weekAlreadyScheduled(client, resourceIds, weekStart, weekEnd, orgId) {
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

router.post("/", async (req, res) => {
  const startDateValue = String(req.body?.start_date || "").trim();
  const endDateValue = String(req.body?.end_date || "").trim();
  const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
  const orgId = getOrgId(req);

  const startDate = parseDate(startDateValue);
  const endDate = parseDate(endDateValue);
  if (!startDate || !endDate || startDate > endDate) {
    return res.status(400).json({ error: "Invalid date range" });
  }
  if (!Array.isArray(groups) || groups.length === 0) {
    return res.status(400).json({ error: "No resource groups provided" });
  }

  const client = await pool.connect();
  try {
    const ruleParams = [];
    let ruleWhere = "WHERE is_active = true";
    if (orgId) {
      ruleParams.push(orgId);
      ruleWhere += ` AND organization_id = $${ruleParams.length}`;
    }
    const { rows: ruleRows } = await client.query(
      `SELECT * FROM rules ${ruleWhere} ORDER BY sort_order ASC, id ASC`,
      ruleParams
    );

    const scheduled = [];
    const skipped = [];

    await client.query("BEGIN");

    for (const group of groups) {
      const resourceIds = Array.isArray(group?.resource_ids)
        ? group.resource_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
      const responsibleId = String(group?.responsible_user_id || "").trim();
      const studentIds = Array.isArray(group?.student_ids)
        ? group.student_ids.map((id) => String(id).trim()).filter(Boolean)
        : [];
      const uniqueStudentIds = Array.from(new Set(studentIds)).filter(
        (id) => id && id !== responsibleId
      );
      const weeklyHours = Number(group?.weekly_hours || 0);
      const durationMinutes = Math.round((Number.isFinite(weeklyHours) && weeklyHours > 0
        ? weeklyHours
        : 3) * 60);

      if (resourceIds.length === 0) {
        skipped.push({ group_id: group?.group_id || null, reason: "No resources selected" });
        continue;
      }
      if (!responsibleId) {
        skipped.push({ group_id: group?.group_id || null, reason: "Missing responsible user" });
        continue;
      }
      if (durationMinutes <= 0) {
        skipped.push({ group_id: group?.group_id || null, reason: "Invalid weekly hours" });
        continue;
      }

      const resourceParams = [resourceIds];
      let resourceWhere = "WHERE r.id = ANY($1)";
      if (orgId) {
        resourceParams.push(orgId);
        resourceWhere += ` AND r.organization_id = $${resourceParams.length}`;
      }
      const { rows: resourceRows } = await client.query(
        `
        SELECT r.*, rt.name AS type_name
        FROM resources r
        JOIN resource_types rt ON rt.id = r.type_id
        ${resourceWhere}
        `,
        resourceParams
      );

      if (resourceRows.length !== resourceIds.length) {
        skipped.push({ group_id: group?.group_id || null, reason: "Missing resources" });
        continue;
      }

      const availParams = [responsibleId];
      let availWhere = "WHERE user_id = $1";
      if (orgId) {
        availParams.push(orgId);
        availWhere += ` AND organization_id = $${availParams.length}`;
      }
      const { rows: availability } = await client.query(
        `
        SELECT *
        FROM user_availability
        ${availWhere}
        ORDER BY day_of_week, start_time
        `,
        availParams
      );

      if (availability.length === 0) {
        skipped.push({ group_id: group?.group_id || null, reason: "No availability for responsible" });
        continue;
      }

      const groupScheduled = [];
      for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
        const weekStart = getWeekStart(cursor);
        if (await weekAlreadyScheduled(client, resourceIds, weekStart, new Date(weekStart.getTime() + 6 * 86400000), orgId)) {
          continue;
        }

        const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
        const weekStartBound = new Date(Math.max(weekStart.getTime(), startDate.getTime()));
        const weekEndBound = new Date(Math.min(weekEnd.getTime(), endDate.getTime()));

        let scheduledThisWeek = false;
        for (let day = new Date(weekStartBound); day <= weekEndBound; day.setDate(day.getDate() + 1)) {
          const dayOfWeek = day.getDay();
          const dayKey = formatDate(day);
          const dayAvailability = availability.filter((a) => {
            if (Number(a.day_of_week) !== dayOfWeek) return false;
            const startKey = normalizeDateKey(a.start_date);
            const endKey = normalizeDateKey(a.end_date);
            if (startKey && startKey > dayKey) return false;
            if (endKey && endKey < dayKey) return false;
            return true;
          });

          if (dayAvailability.length === 0) continue;

          for (const slot of dayAvailability) {
            const slotStart = String(slot.start_time).slice(0, 5);
            const slotEnd = String(slot.end_time).slice(0, 5);
            const slotStartMin = timeToMinutes(slotStart);
            const slotEndMin = timeToMinutes(slotEnd);
            for (
              let candidate = slotStartMin;
              candidate + durationMinutes <= slotEndMin;
              candidate += 30
            ) {
              const startTime = addMinutes("00:00", candidate);
              const endTime = addMinutes("00:00", candidate + durationMinutes);

              const hasResponsibleConflict = await hasUserConflict(
                client,
                [responsibleId],
                dayKey,
                startTime,
                endTime,
                orgId
              );
              if (hasResponsibleConflict) continue;

              const hasStudentConflict = uniqueStudentIds.length
                ? await hasUserConflict(
                    client,
                    uniqueStudentIds,
                    dayKey,
                    startTime,
                    endTime,
                    orgId
                  )
                : false;
              if (hasStudentConflict) continue;

              const resourceConflict = await hasResourceConflict(
                client,
                resourceIds,
                dayKey,
                startTime,
                endTime,
                orgId
              );
              if (resourceConflict) continue;

              const ruleEval = evaluateRules({
                rules: ruleRows,
                booking: {
                  date: dayKey,
                  start_time: startTime,
                  end_time: endTime,
                  user_id: responsibleId,
                },
                resources: resourceRows,
                roles: {},
              });
              if (ruleEval.hardViolations.length > 0) {
                continue;
              }

              const alreadyExists = await hasExactBooking(
                client,
                responsibleId,
                resourceIds,
                dayKey,
                startTime,
                endTime,
                orgId
              );
              if (alreadyExists) {
                scheduledThisWeek = true;
                break;
              }

              const bookingResult = await client.query(
                `
                INSERT INTO bookings (user_id, date, start_time, end_time)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                `,
                [responsibleId, dayKey, startTime, endTime]
              );
              const booking = bookingResult.rows[0];

              for (const resourceId of resourceIds) {
                await client.query(
                  `
                  INSERT INTO booking_resources (booking_id, resource_id, role)
                  VALUES ($1, $2, $3)
                  `,
                  [booking.id, resourceId, null]
                );
              }

              for (const studentId of uniqueStudentIds) {
                const studentExists = await hasExactBooking(
                  client,
                  studentId,
                  resourceIds,
                  dayKey,
                  startTime,
                  endTime,
                  orgId
                );
                if (studentExists) {
                  continue;
                }
                const studentBookingResult = await client.query(
                  `
                  INSERT INTO bookings (user_id, date, start_time, end_time)
                  VALUES ($1, $2, $3, $4)
                  RETURNING *
                  `,
                  [studentId, dayKey, startTime, endTime]
                );
                const studentBooking = studentBookingResult.rows[0];
                for (const resourceId of resourceIds) {
                  await client.query(
                    `
                    INSERT INTO booking_resources (booking_id, resource_id, role)
                    VALUES ($1, $2, $3)
                    `,
                    [studentBooking.id, resourceId, null]
                  );
                }
              }

              groupScheduled.push({
                group_id: group?.group_id || null,
                booking_id: booking.id,
                date: dayKey,
                start_time: startTime,
                end_time: endTime,
              });
              scheduledThisWeek = true;
              break;
            }
            if (scheduledThisWeek) break;
          }
          if (scheduledThisWeek) break;
        }

        if (scheduledThisWeek) {
          cursor = new Date(weekEnd);
        }
      }

      if (groupScheduled.length === 0) {
        skipped.push({ group_id: group?.group_id || null, reason: "No available slot found" });
      } else {
        scheduled.push(...groupScheduled);
      }
    }

    await client.query("COMMIT");
    res.json({ scheduled, skipped });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Auto scheduling failed:", err);
    res.status(500).json({ error: "Auto schedule failed" });
  } finally {
    client.release();
  }
});

export default router;
