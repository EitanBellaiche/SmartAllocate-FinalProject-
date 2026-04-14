import express from "express";
import pool from "../db.js";
import { evaluateRules } from "../rulesEngine.js";

const router = express.Router();
const DEFAULT_AUTO_WINDOW = { start_time: "08:00", end_time: "20:00" };

async function ensureAvailabilityTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_availability (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      start_date DATE,
      end_date DATE,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_availability_overrides (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      is_available BOOLEAN NOT NULL DEFAULT false,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

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

function normalizeTimeKey(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nextH = Math.floor(total / 60);
  const nextM = total % 60;
  return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  if (!sorted.length) return [];

  const merged = [sorted[0]];
  for (const current of sorted.slice(1)) {
    const prev = merged[merged.length - 1];
    if (current.start <= prev.end) {
      prev.end = Math.max(prev.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function subtractInterval(interval, exclusion) {
  if (exclusion.end <= interval.start || exclusion.start >= interval.end) {
    return [interval];
  }
  const result = [];
  if (exclusion.start > interval.start) {
    result.push({ start: interval.start, end: exclusion.start });
  }
  if (exclusion.end < interval.end) {
    result.push({ start: exclusion.end, end: interval.end });
  }
  return result;
}

function getDayAvailabilityWindows(baseAvailability, overrides, dayKey, dayOfWeek) {
  let intervals = baseAvailability
    .filter((slot) => {
      if (Number(slot.day_of_week) !== dayOfWeek) return false;
      const startKey = normalizeDateKey(slot.start_date);
      const endKey = normalizeDateKey(slot.end_date);
      if (startKey && startKey > dayKey) return false;
      if (endKey && endKey < dayKey) return false;
      return true;
    })
    .map((slot) => ({
      start: timeToMinutes(normalizeTimeKey(slot.start_time)),
      end: timeToMinutes(normalizeTimeKey(slot.end_time)),
    }));

  const dayOverrides = overrides.filter(
    (override) => normalizeDateKey(override.date) === dayKey
  );

  for (const override of dayOverrides) {
    const startTime = normalizeTimeKey(override.start_time);
    const endTime = normalizeTimeKey(override.end_time);
    const isAvailable = Boolean(override.is_available);

    if (!isAvailable && !startTime && !endTime) {
      intervals = [];
      continue;
    }

    if (!startTime || !endTime) {
      if (isAvailable) {
        intervals.push({ start: 0, end: 24 * 60 });
      }
      continue;
    }

    const overrideInterval = {
      start: timeToMinutes(startTime),
      end: timeToMinutes(endTime),
    };

    if (isAvailable) {
      intervals.push(overrideInterval);
      continue;
    }

    intervals = intervals.flatMap((interval) => subtractInterval(interval, overrideInterval));
  }

  return mergeIntervals(intervals).map((interval) => ({
    start_time: addMinutes("00:00", interval.start),
    end_time: addMinutes("00:00", interval.end),
  }));
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

function buildFallbackAvailability() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    start_time: DEFAULT_AUTO_WINDOW.start_time,
    end_time: DEFAULT_AUTO_WINDOW.end_time,
    start_date: null,
    end_date: null,
  }));
}

async function pickLockedSlot({
  availability,
  availabilityOverrides,
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
  excludedDayOfWeeks = [],
  }) {
  const weekStarts = getWeekStartsInRange(startDate, endDate);
  const candidatesMap = new Map();
  let lastFailure = "No available slot found";
  let firstCandidateFailure = null;
  const excluded = new Set((excludedDayOfWeeks || []).map((d) => Number(d)));

  for (let day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
    const dayKey = formatDate(day);
    const dayOfWeek = day.getDay();
    if (excluded.has(dayOfWeek)) continue;
    const windows = getDayAvailabilityWindows(availability, availabilityOverrides, dayKey, dayOfWeek);
    for (const window of windows) {
      const slotStartMin = timeToMinutes(window.start_time);
      const slotEndMin = timeToMinutes(window.end_time);
      for (
        let candidate = slotStartMin;
        candidate + durationMinutes <= slotEndMin;
        candidate += 30
      ) {
        const startTime = addMinutes("00:00", candidate);
        const endTime = addMinutes("00:00", candidate + durationMinutes);
        const key = `${dayOfWeek}-${startTime}-${endTime}`;
        candidatesMap.set(key, {
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
        });
      }
    }
  }

  for (const candidate of candidatesMap.values()) {
    const occurrences = [];
    for (const weekStart of weekStarts) {
      const dateObj = new Date(weekStart);
      dateObj.setDate(weekStart.getDate() + candidate.day_of_week);
      if (dateObj < startDate || dateObj > endDate) continue;
      const dayKey = formatDate(dateObj);
      const windows = getDayAvailabilityWindows(
        availability,
        availabilityOverrides,
        dayKey,
        candidate.day_of_week
      );
      const covered = windows.some(
        (window) =>
          candidate.start_time >= window.start_time && candidate.end_time <= window.end_time
      );
      if (!covered) continue;
      occurrences.push(dayKey);
    }

    if (occurrences.length === 0) {
      lastFailure = "No availability in range";
      continue;
    }

    let conflictReason = null;
    for (const dayKey of occurrences) {
      if (responsibleId) {
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

async function findResourceConflictDetails(client, resourceIds, date, startTime, endTime, orgId) {
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

async function loadResourceRowsByIds(client, resourceIds, orgId) {
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

async function loadCandidateRowsByTypeIds(
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

async function buildAlternativeSuggestions({
  client,
  orgId,
  bookingDate,
  startTime,
  endTime,
  resources,
  rules,
  booking,
  roles,
  limit = 3,
}) {
  if (!Array.isArray(resources) || resources.length === 0) return [];

  const suggestions = [];
  const seenKeys = new Set();

  for (let index = 0; index < resources.length; index += 1) {
    const original = resources[index];
    if (!original?.type_id) continue;
    if (["Courses", "Exam"].includes(String(original.type_name || ""))) continue;

    const excludedIds = resources
      .map((resource) => Number(resource.id))
      .filter((id) => Number.isFinite(id) && id !== Number(original.id));

    const candidates = await loadCandidateRowsByTypeIds(
      client,
      [Number(original.type_id)],
      orgId,
      bookingDate,
      startTime,
      endTime,
      excludedIds
    );

    for (const candidate of candidates) {
      if (Number(candidate.id) === Number(original.id)) continue;

      const nextResources = resources.map((resource, resourceIndex) =>
        resourceIndex === index ? candidate : resource
      );
      const resourceIds = nextResources
        .map((resource) => Number(resource.id))
        .filter((id) => Number.isFinite(id));
      const combinationKey = resourceIds.slice().sort((a, b) => a - b).join(",");
      if (!combinationKey || seenKeys.has(combinationKey)) continue;

      if (
        await hasResourceConflict(client, resourceIds, bookingDate, startTime, endTime, orgId)
      ) {
        continue;
      }

      const evaluation = evaluateRules({
        rules,
        booking,
        resources: nextResources,
        roles,
      });
      if (evaluation.hardViolations.length > 0) continue;

      suggestions.push({
        type: "resource",
        score: evaluation.score,
        resource_ids: resourceIds,
        date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        summary: `${original.name} -> ${candidate.name}`,
        why: `Replace ${original.name} with ${candidate.name} and keep the same time slot.`,
        replaced_resource: {
          id: Number(original.id),
          name: original.name,
          type_id: Number(original.type_id),
          type_name: original.type_name || "",
        },
        suggested_resource: {
          id: Number(candidate.id),
          name: candidate.name,
          type_id: Number(candidate.type_id),
          type_name: candidate.type_name || "",
        },
        resources: nextResources.map((resource) => ({
          id: Number(resource.id),
          name: resource.name,
          type_id: Number(resource.type_id),
          type_name: resource.type_name || "",
        })),
        rule_summary: {
          score: evaluation.score,
          soft_matches: (evaluation.softMatches || []).map((match) => ({
            id: match?.id ?? null,
            name: match?.name || "",
            description: match?.description || "",
            delta: Number(match?.delta || 0),
            resource_id: match?.resource_id ?? null,
          })),
        },
      });
      seenKeys.add(combinationKey);
    }
  }

  return suggestions
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.summary || "").localeCompare(String(b.summary || ""));
    })
    .slice(0, limit);
}

async function buildTimeSlotSuggestions({
  client,
  orgId,
  bookingDate,
  startTime,
  endTime,
  userId,
  fixedResources,
  candidateTypeIds,
  rules,
  roles,
  limit = 3,
}) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return [];
  }

  const duration = endMinutes - startMinutes;
  const preferredOffsets = [-120, -90, -60, -30, 30, 60, 90, 120, -150, 150, -180, 180];
  const slots = [];
  const seenSlots = new Set();

  for (const offset of preferredOffsets) {
    const candidateStart = startMinutes + offset;
    const candidateEnd = candidateStart + duration;
    if (candidateStart < 0 || candidateEnd > 24 * 60) continue;
    if (candidateStart === startMinutes && candidateEnd === endMinutes) continue;
    const key = `${candidateStart}-${candidateEnd}`;
    if (seenSlots.has(key)) continue;
    seenSlots.add(key);
    slots.push({
      start_time: minutesToTime(candidateStart),
      end_time: minutesToTime(candidateEnd),
      distance: Math.abs(offset),
    });
  }

  const suggestions = [];

  for (const slot of slots) {
    if (userId) {
      const userConflict = await findUserConflict(
        client,
        userId,
        bookingDate,
        slot.start_time,
        slot.end_time,
        orgId
      );
      if (userConflict) continue;
    }

    let resolvedResourceRows = [...fixedResources];
    let resolvedResourceIds = resolvedResourceRows
      .map((resource) => Number(resource.id))
      .filter((id) => Number.isFinite(id));

    if (
      resolvedResourceIds.length > 0 &&
      (await hasResourceConflict(
        client,
        resolvedResourceIds,
        bookingDate,
        slot.start_time,
        slot.end_time,
        orgId
      ))
    ) {
      continue;
    }

    if (candidateTypeIds.length > 0) {
      const candidateRows = await loadCandidateRowsByTypeIds(
        client,
        candidateTypeIds,
        orgId,
        bookingDate,
        slot.start_time,
        slot.end_time,
        resolvedResourceIds
      );
      const candidatePools = candidateTypeIds.map((typeId) => ({
        typeId,
        candidates: candidateRows.filter(
          (resource) => Number(resource.type_id) === Number(typeId)
        ),
      }));
      if (candidatePools.some((pool) => pool.candidates.length === 0)) continue;

      const { best } = pickBestResourceCombination({
        fixedResources: resolvedResourceRows,
        candidatePools,
        rules,
        booking: {
          date: bookingDate,
          start_time: slot.start_time,
          end_time: slot.end_time,
          user_id: userId,
        },
        roles,
      });
      if (!best) continue;

      resolvedResourceRows = [...resolvedResourceRows, ...best.resources];
      resolvedResourceIds = resolvedResourceRows
        .map((resource) => Number(resource.id))
        .filter((id) => Number.isFinite(id));
    }

    const evaluation = evaluateRules({
      rules,
      booking: {
        date: bookingDate,
        start_time: slot.start_time,
        end_time: slot.end_time,
        user_id: userId,
      },
      resources: resolvedResourceRows,
      roles,
    });
    if (evaluation.hardViolations.length > 0) continue;

    suggestions.push({
      type: "timeslot",
      score: evaluation.score,
      distance_from_original: slot.distance,
      date: bookingDate,
      start_time: slot.start_time,
      end_time: slot.end_time,
      resource_ids: resolvedResourceIds,
      summary: `${bookingDate} ${slot.start_time}-${slot.end_time}`,
      why: "Try a nearby time slot that keeps the booking valid with the current rule set.",
      resources: resolvedResourceRows.map((resource) => ({
        id: Number(resource.id),
        name: resource.name,
        type_id: Number(resource.type_id),
        type_name: resource.type_name || "",
      })),
      rule_summary: {
        score: evaluation.score,
        soft_matches: (evaluation.softMatches || []).map((match) => ({
          id: match?.id ?? null,
          name: match?.name || "",
          description: match?.description || "",
          delta: Number(match?.delta || 0),
          resource_id: match?.resource_id ?? null,
        })),
      },
    });
  }

  return suggestions
    .sort((a, b) => {
      const aDistance = Number(a.distance_from_original ?? 9999);
      const bDistance = Number(b.distance_from_original ?? 9999);
      if (aDistance !== bDistance) return aDistance - bDistance;
      if (b.score !== a.score) return b.score - a.score;
      return String(a.summary || "").localeCompare(String(b.summary || ""));
    })
    .slice(0, limit);
}

async function buildAutoScheduleFailureSuggestions({
  client,
  orgId,
  bookingDate,
  startTime,
  endTime,
  userId,
  resources,
  candidateTypeIds,
  rules,
  roles,
}) {
  const [resourceSuggestions, timeSuggestions] = await Promise.all([
    buildAlternativeSuggestions({
      client,
      orgId,
      bookingDate,
      startTime,
      endTime,
      resources,
      rules,
      booking: {
        date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        user_id: userId,
      },
      roles,
    }),
    buildTimeSlotSuggestions({
      client,
      orgId,
      bookingDate,
      startTime,
      endTime,
      userId,
      fixedResources: resources,
      candidateTypeIds,
      rules,
      roles,
    }),
  ]);

  return [...resourceSuggestions, ...timeSuggestions]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.summary || "").localeCompare(String(b.summary || ""));
    })
    .slice(0, 5);
}

async function diagnoseGroupFailure({
  client,
  group,
  startDate,
  endDate,
  orgId,
  ruleRows,
}) {
  const resourceIds = Array.isArray(group?.resource_ids)
    ? group.resource_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const typeIds = Array.isArray(group?.type_ids)
    ? group.type_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const responsibleId = String(group?.responsible_user_id || "").trim();
  const rawUserIds = Array.isArray(group?.user_ids) ? group.user_ids : [];
  const userIds = Array.from(
    new Set(rawUserIds.map((id) => String(id).trim()).filter(Boolean))
  ).filter((id) => id && id !== responsibleId);
  const weeklyHours = Number(group?.weekly_hours || 0);
  const daysPerWeek = clampDaysPerWeek(group?.days_per_week ?? 1);
  const perSessionHours =
    (Number.isFinite(weeklyHours) && weeklyHours > 0 ? weeklyHours : 3) / daysPerWeek;
  const durationMinutes = roundDurationToGrid(Math.round(perSessionHours * 60));

  let resourceRows = [];
  if (resourceIds.length > 0) {
    resourceRows = await loadResourceRowsByIds(client, resourceIds, orgId);
  }

  let availability = [];
  let availabilityOverrides = [];
  if (responsibleId) {
    const availParams = [responsibleId];
    let availWhere = "WHERE user_id = $1";
    if (orgId) {
      availParams.push(orgId);
      availWhere += ` AND organization_id = $${availParams.length}`;
    }
    const availabilityResult = await client.query(
      `
      SELECT *
      FROM user_availability
      ${availWhere}
      ORDER BY day_of_week, start_time
      `,
      availParams
    );
    const overridesResult = await client.query(
      `
      SELECT *
      FROM user_availability_overrides
      ${availWhere}
      ORDER BY date, start_time NULLS FIRST
      `,
      availParams
    );
    availability = availabilityResult.rows;
    availabilityOverrides = overridesResult.rows;
    if (availability.length === 0 && availabilityOverrides.length === 0) {
      return {
        group_id: group?.group_id || null,
        reason: "No availability defined for the responsible user.",
        failure_type: "missing_availability",
        suggestions: [],
      };
    }
  } else {
    availability = buildFallbackAvailability();
  }

  for (const weekStart of getWeekStartsInRange(startDate, endDate)) {
    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    const weekStartBound = new Date(Math.max(weekStart.getTime(), startDate.getTime()));
    const weekEndBound = new Date(Math.min(weekEnd.getTime(), endDate.getTime()));

    for (let day = new Date(weekStartBound); day <= weekEndBound; day.setDate(day.getDate() + 1)) {
      const dayKey = formatDate(day);
      const dayOfWeek = day.getDay();
      const windows = getDayAvailabilityWindows(
        availability,
        availabilityOverrides,
        dayKey,
        dayOfWeek
      );
      for (const window of windows) {
        const slotStartMin = timeToMinutes(window.start_time);
        const slotEndMin = timeToMinutes(window.end_time);
        for (
          let candidate = slotStartMin;
          candidate + durationMinutes <= slotEndMin;
          candidate += 30
        ) {
          const startTime = addMinutes("00:00", candidate);
          const endTime = addMinutes("00:00", candidate + durationMinutes);

          if (responsibleId) {
            const responsibleConflict = await findUserConflict(
              client,
              responsibleId,
              dayKey,
              startTime,
              endTime,
              orgId
            );
            if (responsibleConflict) {
              const suggestions = await buildAutoScheduleFailureSuggestions({
                client,
                orgId,
                bookingDate: dayKey,
                startTime,
                endTime,
                userId: responsibleId,
                resources: resourceRows,
                candidateTypeIds: typeIds,
                rules: ruleRows,
                roles: {},
              });
              return {
                group_id: group?.group_id || null,
                reason: `The responsible user is already booked on ${dayKey} ${startTime}-${endTime}.`,
                failure_type: "responsible_conflict",
                failed_slot: { date: dayKey, start_time: startTime, end_time: endTime },
                occupied_by: responsibleConflict,
                suggestions,
              };
            }
          }

          for (const userId of userIds) {
            const userConflict = await findUserConflict(
              client,
              userId,
              dayKey,
              startTime,
              endTime,
              orgId
            );
            if (userConflict) {
              const suggestions = await buildAutoScheduleFailureSuggestions({
                client,
                orgId,
                bookingDate: dayKey,
                startTime,
                endTime,
                userId: responsibleId,
                resources: resourceRows,
                candidateTypeIds: typeIds,
                rules: ruleRows,
                roles: {},
              });
              return {
                group_id: group?.group_id || null,
                reason: `One of the assigned users is already booked on ${dayKey} ${startTime}-${endTime}.`,
                failure_type: "user_conflict",
                failed_slot: { date: dayKey, start_time: startTime, end_time: endTime },
                occupied_by: userConflict,
                suggestions,
              };
            }
          }

          if (resourceIds.length > 0) {
            const resourceConflict = await findResourceConflictDetails(
              client,
              resourceIds,
              dayKey,
              startTime,
              endTime,
              orgId
            );
            if (resourceConflict) {
              const suggestions = await buildAutoScheduleFailureSuggestions({
                client,
                orgId,
                bookingDate: dayKey,
                startTime,
                endTime,
                userId: responsibleId,
                resources: resourceRows,
                candidateTypeIds: typeIds,
                rules: ruleRows,
                roles: {},
              });
              return {
                group_id: group?.group_id || null,
                reason: `${resourceConflict.resource_name} is occupied on ${dayKey} ${startTime}-${endTime}.`,
                failure_type: "resource_conflict",
                failed_slot: { date: dayKey, start_time: startTime, end_time: endTime },
                occupied_by: {
                  booking_id: resourceConflict.id,
                  user_id: resourceConflict.user_id,
                  resource_id: resourceConflict.resource_id,
                  resource_name: resourceConflict.resource_name,
                  resource_type_name: resourceConflict.resource_type_name,
                  date: resourceConflict.date,
                  start_time: resourceConflict.start_time,
                  end_time: resourceConflict.end_time,
                },
                suggestions,
              };
            }
          }
        }
      }
    }
  }

  return {
    group_id: group?.group_id || null,
    reason: "No matching slot was found in the selected range.",
    failure_type: "no_slot_found",
    suggestions: [],
  };
}

function pickBestResourceCombination({ fixedResources, candidatePools, rules, booking, roles }) {
  if (!candidatePools.length) {
    const evaluation = evaluateRules({ rules, booking, resources: fixedResources, roles });
    return evaluation.hardViolations.length > 0
      ? { best: null, bestBlocked: evaluation }
      : { best: { resources: [], evaluation } };
  }

  const preparedPools = candidatePools.map((pool) => {
    const scored = pool.candidates
      .map((candidate) => {
        const evaluation = evaluateRules({
          rules,
          booking,
          resources: [...fixedResources, candidate],
          roles,
        });
        return { candidate, evaluation };
      })
      .filter((entry) => entry.evaluation.hardViolations.length === 0)
      .sort((a, b) => {
        if (b.evaluation.score !== a.evaluation.score) {
          return b.evaluation.score - a.evaluation.score;
        }
        return Number(a.candidate.id) - Number(b.candidate.id);
      })
      .slice(0, 25)
      .map((entry) => entry.candidate);

    return {
      ...pool,
      candidates: scored.length > 0 ? scored : pool.candidates.slice(0, 25),
    };
  });

  let best = null;
  let bestBlocked = null;

  const search = (index, chosen) => {
    if (index >= preparedPools.length) {
      const resources = [...fixedResources, ...chosen];
      const evaluation = evaluateRules({ rules, booking, resources, roles });
      if (evaluation.hardViolations.length > 0) {
        if (!bestBlocked || evaluation.hardViolations.length < bestBlocked.hardViolations.length) {
          bestBlocked = evaluation;
        }
        return;
      }
      if (
        !best ||
        evaluation.score > best.evaluation.score ||
        (evaluation.score === best.evaluation.score &&
          resources.map((resource) => Number(resource.id)).join(",") <
            best.resources.map((resource) => Number(resource.id)).join(","))
      ) {
        best = { resources: [...chosen], evaluation };
      }
      return;
    }

    for (const candidate of preparedPools[index].candidates) {
      search(index + 1, [...chosen, candidate]);
    }
  };

  search(0, []);
  return { best, bestBlocked };
}

function clampDaysPerWeek(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(7, Math.max(1, Math.round(n)));
}

function roundDurationToGrid(durationMinutes) {
  const min = Number.isFinite(durationMinutes) ? durationMinutes : 0;
  const rounded = Math.round(min / 30) * 30;
  return Math.max(30, rounded);
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

router.post("/diagnose", async (req, res) => {
  const startDateValue = String(req.body?.start_date || "").trim();
  const endDateValue = String(req.body?.end_date || "").trim();
  const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
  const orgId = getOrgId(req);

  const startDate = parseDate(startDateValue);
  const endDate = parseDate(endDateValue);
  if (!startDate || !endDate || startDate > endDate) {
    return res.status(400).json({ error: "Invalid date range" });
  }
  if (!groups.length) {
    return res.status(400).json({ error: "No resource groups provided" });
  }

  const client = await pool.connect();
  try {
    await ensureAvailabilityTables(client);
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

    const skipped = [];
    for (const group of groups) {
      skipped.push(
        await diagnoseGroupFailure({
          client,
          group,
          startDate,
          endDate,
          orgId,
          ruleRows,
        })
      );
    }

    res.json({ scheduled: [], skipped });
  } catch (err) {
    console.error("Auto schedule diagnose failed:", err);
    res.status(500).json({ error: "Auto schedule diagnose failed" });
  } finally {
    client.release();
  }
});

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
    await ensureAvailabilityTables(client);
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
      const typeIds = Array.isArray(group?.type_ids)
        ? group.type_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
      const responsibleId = String(group?.responsible_user_id || "").trim();
      const rawUserIds = Array.isArray(group?.user_ids) ? group.user_ids : [];
      const userIds = rawUserIds.map((id) => String(id).trim()).filter(Boolean);
      const uniqueUserIds = Array.from(new Set(userIds)).filter(
        (id) => id && id !== responsibleId
      );
      const weeklyHours = Number(group?.weekly_hours || 0);
      const daysPerWeek = clampDaysPerWeek(group?.days_per_week ?? 1);
      const perSessionHours =
        (Number.isFinite(weeklyHours) && weeklyHours > 0 ? weeklyHours : 3) / daysPerWeek;
      const durationMinutes = roundDurationToGrid(Math.round(perSessionHours * 60));

      if (resourceIds.length === 0 && typeIds.length === 0) {
        skipped.push({ group_id: group?.group_id || null, reason: "No resources or resource types selected" });
        continue;
      }
      if (durationMinutes <= 0) {
        skipped.push({ group_id: group?.group_id || null, reason: "Invalid weekly hours" });
        continue;
      }

      let resourceRows = [];
      if (resourceIds.length > 0) {
        const resourceParams = [resourceIds];
        let resourceWhere = "WHERE r.id = ANY($1)";
        if (orgId) {
          resourceParams.push(orgId);
          resourceWhere += ` AND r.organization_id = $${resourceParams.length}`;
        }
        const resourceResult = await client.query(
          `
          SELECT r.*, rt.name AS type_name
          FROM resources r
          JOIN resource_types rt ON rt.id = r.type_id
          ${resourceWhere}
          `,
          resourceParams
        );
        resourceRows = resourceResult.rows;

        if (resourceRows.length !== resourceIds.length) {
          skipped.push({ group_id: group?.group_id || null, reason: "Missing resources" });
          continue;
        }
      }

      let availability = [];
      let availabilityOverrides = [];
      if (responsibleId) {
        const availParams = [responsibleId];
        let availWhere = "WHERE user_id = $1";
        if (orgId) {
          availParams.push(orgId);
          availWhere += ` AND organization_id = $${availParams.length}`;
        }
        const availabilityResult = await client.query(
          `
          SELECT *
          FROM user_availability
          ${availWhere}
          ORDER BY day_of_week, start_time
          `,
          availParams
        );
        const overridesResult = await client.query(
          `
          SELECT *
          FROM user_availability_overrides
          ${availWhere}
          ORDER BY date, start_time NULLS FIRST
          `,
          availParams
        );
        availability = availabilityResult.rows;
        availabilityOverrides = overridesResult.rows;

        if (availability.length === 0 && availabilityOverrides.length === 0) {
          skipped.push({ group_id: group?.group_id || null, reason: "No availability for responsible" });
          continue;
        }
      } else {
        availability = buildFallbackAvailability();
      }

      const groupScheduled = [];
      let lastFailure = "No available slot found";
      let availabilityDays = 0;
      let attemptedSlots = 0;
      let responsibleConflicts = 0;
      let userConflicts = 0;
      let resourceConflicts = 0;
      let ruleConflicts = 0;
      let lockedSlots = [];
      let failureContext = null;

      for (let lockIndex = 0; lockIndex < daysPerWeek; lockIndex += 1) {
        const lockedCandidate = await pickLockedSlot({
          availability,
          availabilityOverrides,
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
          excludedDayOfWeeks: lockedSlots.map((slot) => slot.day_of_week),
        });
        if (lockedCandidate?.slot) {
          lockedSlots = [...lockedSlots, lockedCandidate.slot];
          continue;
        }
        if (lockedCandidate?.reason) {
          lastFailure = lockedCandidate.reason;
        }
        break;
      }

      const weekStarts = getWeekStartsInRange(startDate, endDate);
      for (const weekStart of weekStarts) {
        if (resourceIds.length > 0 && typeIds.length === 0 && await weekAlreadyScheduled(client, resourceIds, weekStart, new Date(weekStart.getTime() + 6 * 86400000), orgId)) {
          lastFailure = "Already scheduled this week";
          continue;
        }

        const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
        const weekStartBound = new Date(Math.max(weekStart.getTime(), startDate.getTime()));
        const weekEndBound = new Date(Math.min(weekEnd.getTime(), endDate.getTime()));

        let scheduledThisWeekCount = 0;
        let weekFailure = lastFailure;
        let weekSlots = 0;
        for (let day = new Date(weekStartBound); day <= weekEndBound; day.setDate(day.getDate() + 1)) {
          const dayOfWeek = day.getDay();
          const dayKey = formatDate(day);
          const dayAvailability = getDayAvailabilityWindows(
            availability,
            availabilityOverrides,
            dayKey,
            dayOfWeek
          );

          if (dayAvailability.length === 0) continue;
          availabilityDays += 1;

          if (lockedSlots.length > 0) {
            const dayLocks = lockedSlots.filter((slot) => slot.day_of_week === dayOfWeek);
            if (dayLocks.length === 0) continue;
            const matchesWindow = dayLocks.some((locked) =>
              dayAvailability.some((slot) => {
                const slotStart = String(slot.start_time).slice(0, 5);
                const slotEnd = String(slot.end_time).slice(0, 5);
                return locked.start_time >= slotStart && locked.end_time <= slotEnd;
              })
            );
            if (!matchesWindow) continue;
          }

          for (const slot of dayAvailability) {
            const slotStart = normalizeTimeKey(slot.start_time);
            const slotEnd = normalizeTimeKey(slot.end_time);
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
              if (lockedSlots.length > 0) {
                const matchesAnyLock = lockedSlots.some(
                  (locked) =>
                    locked.day_of_week === dayOfWeek &&
                    locked.start_time === startTime &&
                    locked.end_time === endTime
                );
                if (!matchesAnyLock) continue;
              }

              attemptedSlots += 1;
              if (responsibleId) {
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
                  if (!failureContext) {
                    failureContext = {
                      type: "responsible_conflict",
                      bookingDate: dayKey,
                      startTime,
                      endTime,
                      resources: [...resourceRows],
                      candidateTypeIds: [...typeIds],
                    };
                  }
                  continue;
                }
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
                if (!failureContext) {
                  failureContext = {
                    type: "user_conflict",
                    bookingDate: dayKey,
                    startTime,
                    endTime,
                    resources: [...resourceRows],
                    candidateTypeIds: [...typeIds],
                  };
                }
                continue;
              }

              let resolvedResourceRows = [...resourceRows];
              let resolvedResourceIds = resolvedResourceRows
                .map((resource) => Number(resource.id))
                .filter((id) => Number.isFinite(id));

              if (typeIds.length > 0) {
                const candidateRows = await loadCandidateRowsByTypeIds(
                  client,
                  typeIds,
                  orgId,
                  dayKey,
                  startTime,
                  endTime,
                  resolvedResourceIds
                );
                const candidatePools = typeIds.map((typeId) => ({
                  typeId,
                  candidates: candidateRows.filter((resource) => Number(resource.type_id) === Number(typeId)),
                }));
                const emptyPool = candidatePools.find((pool) => pool.candidates.length === 0);
                if (emptyPool) {
                  weekFailure = `No available resource for type ${emptyPool.typeId}`;
                  resourceConflicts += 1;
                  if (!failureContext) {
                    failureContext = {
                      type: "missing_type_resource",
                      bookingDate: dayKey,
                      startTime,
                      endTime,
                      resources: [...resolvedResourceRows],
                      candidateTypeIds: [...typeIds],
                    };
                  }
                  continue;
                }
                const { best } = pickBestResourceCombination({
                  fixedResources: resolvedResourceRows,
                  candidatePools,
                  rules: ruleRows,
                  booking: {
                    date: dayKey,
                    start_time: startTime,
                    end_time: endTime,
                    user_id: responsibleId,
                  },
                  roles: {},
                });
                if (!best) {
                  weekFailure = `No matching resources satisfy the active rules at ${dayKey} ${startTime}-${endTime}`;
                  ruleConflicts += 1;
                  if (!failureContext) {
                    failureContext = {
                      type: "rule_conflict",
                      bookingDate: dayKey,
                      startTime,
                      endTime,
                      resources: [...resolvedResourceRows],
                      candidateTypeIds: [...typeIds],
                    };
                  }
                  continue;
                }
                resolvedResourceRows = [...resolvedResourceRows, ...best.resources];
                resolvedResourceIds = resolvedResourceRows
                  .map((resource) => Number(resource.id))
                  .filter((id) => Number.isFinite(id));
              }

              const resourceConflict = await hasResourceConflict(
                client,
                resolvedResourceIds,
                dayKey,
                startTime,
                endTime,
                orgId
              );
              if (resourceConflict) {
                weekFailure = `Resource conflict at ${dayKey} ${startTime}-${endTime}`;
                resourceConflicts += 1;
                if (!failureContext) {
                  failureContext = {
                    type: "resource_conflict",
                    bookingDate: dayKey,
                    startTime,
                    endTime,
                    resources: [...resolvedResourceRows],
                    candidateTypeIds: [...typeIds],
                  };
                }
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
                resources: resolvedResourceRows,
                roles: {},
              });
              if (ruleEval.hardViolations.length > 0) {
                const violation = ruleEval.hardViolations[0];
                const ruleLabel = violation?.name ? ` (${violation.name})` : "";
                weekFailure = `Rule violation${ruleLabel} at ${dayKey} ${startTime}-${endTime}`;
                ruleConflicts += 1;
                if (!failureContext) {
                  failureContext = {
                    type: "rule_conflict",
                    bookingDate: dayKey,
                    startTime,
                    endTime,
                    resources: [...resolvedResourceRows],
                    candidateTypeIds: [...typeIds],
                  };
                }
                continue;
              }

              if (responsibleId) {
                const alreadyExists = await hasExactBooking(
                  client,
                  responsibleId,
                  resolvedResourceIds,
                  dayKey,
                  startTime,
                  endTime,
                  orgId
                );
                if (alreadyExists) {
                  scheduledThisWeekCount += 1;
                  if (scheduledThisWeekCount >= daysPerWeek) break;
                  continue;
                }
              }

              const bookingResult = await client.query(
                `
                INSERT INTO bookings (user_id, date, start_time, end_time)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                `,
                [responsibleId || null, dayKey, startTime, endTime]
              );
              const booking = bookingResult.rows[0];

              for (const resourceId of resolvedResourceIds) {
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
                  resolvedResourceIds,
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
                for (const resourceId of resolvedResourceIds) {
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
                resource_ids: resolvedResourceIds,
              });
              if (lockedSlots.length === 0) {
                lockedSlots = [
                  {
                    day_of_week: dayOfWeek,
                    start_time: startTime,
                    end_time: endTime,
                  },
                ];
              }
              scheduledThisWeekCount += 1;
              if (scheduledThisWeekCount >= daysPerWeek) break;
            }
            if (scheduledThisWeekCount >= daysPerWeek) break;
          }
          if (scheduledThisWeekCount >= daysPerWeek) break;
        }

        if (scheduledThisWeekCount === 0 && weekSlots > 0) {
          lastFailure = weekFailure;
        }

        if (scheduledThisWeekCount > 0) {
          continue;
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
        let suggestions = [];
        if (failureContext?.bookingDate && failureContext?.startTime && failureContext?.endTime) {
          suggestions = await buildAutoScheduleFailureSuggestions({
            client,
            orgId,
            bookingDate: failureContext.bookingDate,
            startTime: failureContext.startTime,
            endTime: failureContext.endTime,
            userId: responsibleId,
            resources: Array.isArray(failureContext.resources) ? failureContext.resources : resourceRows,
            candidateTypeIds: Array.isArray(failureContext.candidateTypeIds)
              ? failureContext.candidateTypeIds
              : typeIds,
            rules: ruleRows,
            roles: {},
          });
        }
        skipped.push({
          group_id: group?.group_id || null,
          reason,
          failure_type: failureContext?.type || null,
          failed_slot:
            failureContext?.bookingDate && failureContext?.startTime && failureContext?.endTime
              ? {
                  date: failureContext.bookingDate,
                  start_time: failureContext.startTime,
                  end_time: failureContext.endTime,
                }
              : null,
          suggestions,
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
