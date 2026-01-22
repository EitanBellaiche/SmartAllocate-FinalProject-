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

function getWeekStartsInRange(startDate, endDate) {
  const weeks = [];
  const cursor = getWeekStart(startDate);
  while (cursor <= endDate) {
    weeks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

function availabilityCoversDate(slot, dateKey) {
  const startKey = normalizeDateKey(slot?.start_date);
  const endKey = normalizeDateKey(slot?.end_date);
  if (startKey && startKey > dateKey) return false;
  if (endKey && endKey < dateKey) return false;
  return true;
}

function buildCandidateSlots(availability, durationMinutes) {
  const candidates = [];
  availability.forEach((slot) => {
    const slotStart = String(slot.start_time).slice(0, 5);
    const slotEnd = String(slot.end_time).slice(0, 5);
    const slotStartMin = timeToMinutes(slotStart);
    const slotEndMin = timeToMinutes(slotEnd);
    for (
      let candidate = slotStartMin;
      candidate + durationMinutes <= slotEndMin;
      candidate += 30
    ) {
      candidates.push({
        availability: slot,
        day_of_week: Number(slot.day_of_week),
        start_time: addMinutes("00:00", candidate),
        end_time: addMinutes("00:00", candidate + durationMinutes),
      });
    }
  });
  return candidates.sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
  });
}

async function pickLockedSlot({
  availability,
  durationMinutes,
  startDate,
  endDate,
  responsibleId,
  userIds,
  resourceIds,
  resourceRows,
  ruleRows,
  orgId,
  client,
  }) {
    const candidates = buildCandidateSlots(availability, durationMinutes);
    const weekStarts = getWeekStartsInRange(startDate, endDate);
    let lastFailure = "No available slot found";
    let firstCandidateFailure = null;

  for (const candidate of candidates) {
    const occurrences = [];
    for (const weekStart of weekStarts) {
      const dateObj = new Date(weekStart);
      dateObj.setDate(weekStart.getDate() + candidate.day_of_week);
      if (dateObj < startDate || dateObj > endDate) continue;
      const dateKey = formatDate(dateObj);
      if (!availabilityCoversDate(candidate.availability, dateKey)) continue;
      occurrences.push(dateKey);
    }

    if (occurrences.length === 0) {
      lastFailure = "No availability in range";
      continue;
    }

    let conflictReason = null;
    for (const dayKey of occurrences) {
      const responsibleConflict = await findUserConflict(
        client,
        responsibleId,
        dayKey,
        candidate.start_time,
        candidate.end_time,
        orgId
      );
      if (responsibleConflict) {
        conflictReason = `Responsible conflict with booking #${responsibleConflict.id} at ${responsibleConflict.date} ${responsibleConflict.start_time}-${responsibleConflict.end_time}`;
        break;
      }

      let userConflict = null;
      for (const userId of userIds) {
        userConflict = await findUserConflict(
          client,
          userId,
          dayKey,
          candidate.start_time,
          candidate.end_time,
          orgId
        );
        if (userConflict) break;
      }
      if (userConflict) {
        conflictReason = `User conflict with booking #${userConflict.id} at ${userConflict.date} ${userConflict.start_time}-${userConflict.end_time}`;
        break;
      }

      const resourceConflict = await hasResourceConflict(
        client,
        resourceIds,
        dayKey,
        candidate.start_time,
        candidate.end_time,
        orgId
      );
      if (resourceConflict) {
        conflictReason = `Resource conflict at ${dayKey} ${candidate.start_time}-${candidate.end_time}`;
        break;
      }

      const ruleEval = evaluateRules({
        rules: ruleRows,
        booking: {
          date: dayKey,
          start_time: candidate.start_time,
          end_time: candidate.end_time,
          user_id: responsibleId,
        },
        resources: resourceRows,
        roles: {},
      });
      if (ruleEval.hardViolations.length > 0) {
        const violation = ruleEval.hardViolations[0];
        const ruleLabel = violation?.name ? ` (${violation.name})` : "";
        conflictReason = `Rule violation${ruleLabel} at ${dayKey} ${candidate.start_time}-${candidate.end_time}`;
        break;
      }
    }

      if (!conflictReason) {
        return {
          slot: {
            day_of_week: candidate.day_of_week,
            start_time: candidate.start_time,
            end_time: candidate.end_time,
          },
        };
      }
      if (!firstCandidateFailure) {
        firstCandidateFailure = conflictReason;
      }
      lastFailure = conflictReason;
    }

    return { slot: null, reason: firstCandidateFailure || lastFailure };
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

async function findUserConflict(client, userId, date, startTime, endTime, orgId) {
  if (!userId) return null;
  const params = [String(userId), date, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT b.id, b.date, b.start_time, b.end_time
    FROM bookings b
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    LEFT JOIN booking_resources br ON br.booking_id = b.id
    LEFT JOIN resources r ON r.id = br.resource_id
    WHERE b.user_id::text = $1
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
  return rows[0] || null;
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
      const rawUserIds = Array.isArray(group?.user_ids) ? group.user_ids : [];
      const userIds = rawUserIds.map((id) => String(id).trim()).filter(Boolean);
      const uniqueUserIds = Array.from(new Set(userIds)).filter(
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
      let lastFailure = "No available slot found";
      let availabilityDays = 0;
      let attemptedSlots = 0;
      let responsibleConflicts = 0;
      let userConflicts = 0;
      let resourceConflicts = 0;
      let ruleConflicts = 0;
      let lockedSlot = null;

      const lockedCandidate = await pickLockedSlot({
        availability,
        durationMinutes,
        startDate,
        endDate,
        responsibleId,
        userIds: uniqueUserIds,
        resourceIds,
        resourceRows,
        ruleRows,
        orgId,
        client,
      });
      if (lockedCandidate?.slot) {
        lockedSlot = lockedCandidate.slot;
      } else if (lockedCandidate?.reason) {
        lastFailure = lockedCandidate.reason;
      }

      for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
        const weekStart = getWeekStart(cursor);
        if (await weekAlreadyScheduled(client, resourceIds, weekStart, new Date(weekStart.getTime() + 6 * 86400000), orgId)) {
          lastFailure = "Already scheduled this week";
          continue;
        }

        const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
        const weekStartBound = new Date(Math.max(weekStart.getTime(), startDate.getTime()));
        const weekEndBound = new Date(Math.min(weekEnd.getTime(), endDate.getTime()));

        let scheduledThisWeek = false;
        let weekFailure = lastFailure;
        let weekSlots = 0;
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
          availabilityDays += 1;

          if (lockedSlot) {
            if (lockedSlot.day_of_week !== dayOfWeek) continue;
            const matchesWindow = dayAvailability.some((slot) => {
              const slotStart = String(slot.start_time).slice(0, 5);
              const slotEnd = String(slot.end_time).slice(0, 5);
              return lockedSlot.start_time >= slotStart && lockedSlot.end_time <= slotEnd;
            });
            if (!matchesWindow) continue;
          }

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
              weekSlots += 1;
              const startTime = addMinutes("00:00", candidate);
              const endTime = addMinutes("00:00", candidate + durationMinutes);
              if (lockedSlot) {
                if (lockedSlot.start_time !== startTime || lockedSlot.end_time !== endTime) {
                  continue;
                }
              }

              attemptedSlots += 1;
              const responsibleConflict = await findUserConflict(
                client,
                responsibleId,
                dayKey,
                startTime,
                endTime,
                orgId
              );
              if (responsibleConflict) {
                weekFailure = `Responsible conflict with booking #${responsibleConflict.id} at ${responsibleConflict.date} ${responsibleConflict.start_time}-${responsibleConflict.end_time}`;
                responsibleConflicts += 1;
                continue;
              }

              let userConflict = null;
              if (uniqueUserIds.length > 0) {
                for (const userId of uniqueUserIds) {
                  userConflict = await findUserConflict(
                    client,
                    userId,
                    dayKey,
                    startTime,
                    endTime,
                    orgId
                  );
                  if (userConflict) break;
                }
              }
              if (userConflict) {
                weekFailure = `User conflict with booking #${userConflict.id} at ${userConflict.date} ${userConflict.start_time}-${userConflict.end_time}`;
                userConflicts += 1;
                continue;
              }

              const resourceConflict = await hasResourceConflict(
                client,
                resourceIds,
                dayKey,
                startTime,
                endTime,
                orgId
              );
              if (resourceConflict) {
                weekFailure = `Resource conflict at ${dayKey} ${startTime}-${endTime}`;
                resourceConflicts += 1;
                continue;
              }

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
                const violation = ruleEval.hardViolations[0];
                const ruleLabel = violation?.name ? ` (${violation.name})` : "";
                weekFailure = `Rule violation${ruleLabel} at ${dayKey} ${startTime}-${endTime}`;
                ruleConflicts += 1;
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

              for (const userId of uniqueUserIds) {
                const userExists = await hasExactBooking(
                  client,
                  userId,
                  resourceIds,
                  dayKey,
                  startTime,
                  endTime,
                  orgId
                );
                if (userExists) {
                  continue;
                }
                const userBookingResult = await client.query(
                  `
                  INSERT INTO bookings (user_id, date, start_time, end_time)
                  VALUES ($1, $2, $3, $4)
                  RETURNING *
                  `,
                  [userId, dayKey, startTime, endTime]
                );
                const userBooking = userBookingResult.rows[0];
                for (const resourceId of resourceIds) {
                  await client.query(
                    `
                    INSERT INTO booking_resources (booking_id, resource_id, role)
                    VALUES ($1, $2, $3)
                    `,
                    [userBooking.id, resourceId, null]
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
              if (!lockedSlot) {
                lockedSlot = {
                  day_of_week: dayOfWeek,
                  start_time: startTime,
                  end_time: endTime,
                };
              }
              scheduledThisWeek = true;
              break;
            }
            if (scheduledThisWeek) break;
          }
          if (scheduledThisWeek) break;
        }

        if (!scheduledThisWeek && weekSlots > 0) {
          lastFailure = weekFailure;
        }

        if (scheduledThisWeek) {
          cursor = new Date(weekEnd);
        }
      }

      if (groupScheduled.length === 0) {
        let reason = lastFailure || "No available slot found";
        if (availabilityDays === 0) {
          reason = "No availability in range";
        } else if (attemptedSlots === 0) {
          reason = "No time slot fits the required duration";
        } else if (responsibleConflicts === attemptedSlots) {
          reason = "Responsible conflict for all available slots";
        } else if (userConflicts === attemptedSlots) {
          reason = "User conflict for all available slots";
        } else if (resourceConflicts === attemptedSlots) {
          reason = "Resource conflict for all available slots";
        } else if (ruleConflicts === attemptedSlots) {
          reason = "Rule violations for all available slots";
        }
        skipped.push({
          group_id: group?.group_id || null,
          reason
        });
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

router.get("/allocations", async (req, res) => {
  const startDateValue = String(req.query?.start_date || "").trim();
  const endDateValue = String(req.query?.end_date || "").trim();
  const responsibleId = String(req.query?.responsible_user_id || "").trim();
  const orgId = getOrgId(req);

  const startDate = parseDate(startDateValue);
  const endDate = parseDate(endDateValue);
  if (!startDate || !endDate || startDate > endDate) {
    return res.status(400).json({ error: "Invalid date range" });
  }

  try {
    const params = [formatDate(startDate), formatDate(endDate)];
    let where = "WHERE b.date BETWEEN $1 AND $2 AND bc.booking_id IS NULL";

    if (responsibleId) {
      params.push(responsibleId);
      where += ` AND b.user_id::text = $${params.length}`;
    }
    if (orgId) {
      params.push(orgId);
      where += ` AND r.organization_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
      WITH booking_sets AS (
        SELECT
          b.id,
          b.user_id,
          b.date,
          b.start_time,
          b.end_time,
          array_agg(br.resource_id ORDER BY br.resource_id) AS resource_ids,
          array_agg(r.name ORDER BY br.resource_id) AS resource_names
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        ${where}
        GROUP BY b.id
      )
      SELECT
        user_id AS responsible_user_id,
        start_time,
        end_time,
        EXTRACT(DOW FROM date)::int AS day_of_week,
        MIN(date) AS start_date,
        MAX(date) AS end_date,
        resource_ids,
        resource_names,
        COUNT(*)::int AS occurrences
      FROM booking_sets
      GROUP BY user_id, start_time, end_time, day_of_week, resource_ids, resource_names
      ORDER BY user_id, day_of_week, start_time
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Failed to load allocations:", err);
    res.status(500).json({ error: "Failed to load allocations" });
  }
});

router.post("/allocations/delete", async (req, res) => {
  const startDateValue = String(req.body?.start_date || "").trim();
  const endDateValue = String(req.body?.end_date || "").trim();
  const startTime = String(req.body?.start_time || "").trim();
  const endTime = String(req.body?.end_time || "").trim();
  const responsibleId = String(req.body?.responsible_user_id || "").trim();
  const orgId = getOrgId(req);
  const resourceIds = Array.isArray(req.body?.resource_ids)
    ? req.body.resource_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];

  const startDate = parseDate(startDateValue);
  const endDate = parseDate(endDateValue);
  if (!startDate || !endDate || startDate > endDate) {
    return res.status(400).json({ error: "Invalid date range" });
  }
  if (!startTime || !endTime || startTime >= endTime) {
    return res.status(400).json({ error: "Invalid time range" });
  }
  if (resourceIds.length === 0) {
    return res.status(400).json({ error: "Missing resources" });
  }
  if (!responsibleId) {
    return res.status(400).json({ error: "Missing responsible user" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const params = [
      formatDate(startDate),
      formatDate(endDate),
      startTime,
      endTime,
      resourceIds,
      resourceIds.length,
      responsibleId,
    ];
    let orgWhere = "";
    if (orgId) {
      params.push(orgId);
      orgWhere = `AND r.organization_id = $${params.length}`;
    }

    const { rows } = await client.query(
      `
      WITH responsible_dates AS (
        SELECT b.id, b.date
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        WHERE b.date BETWEEN $1 AND $2
        AND b.start_time = $3
        AND b.end_time = $4
        AND bc.booking_id IS NULL
        AND b.user_id::text = $7
        ${orgWhere}
        GROUP BY b.id, b.date
        HAVING COUNT(DISTINCT br.resource_id) = $6
           AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($5) THEN br.resource_id END) = $6
      ),
      target AS (
        SELECT b.id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        WHERE b.date IN (SELECT date FROM responsible_dates)
        AND b.start_time = $3
        AND b.end_time = $4
        ${orgWhere}
        GROUP BY b.id
        HAVING COUNT(DISTINCT br.resource_id) = $6
           AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($5) THEN br.resource_id END) = $6
      )
      DELETE FROM bookings
      WHERE id IN (SELECT id FROM target)
      RETURNING id
      `,
      params
    );

    await client.query("COMMIT");
    res.json({ removed: rows.map((row) => row.id) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to delete allocations:", err);
    res.status(500).json({ error: "Failed to delete allocation" });
  } finally {
    client.release();
  }
});

export default router;
