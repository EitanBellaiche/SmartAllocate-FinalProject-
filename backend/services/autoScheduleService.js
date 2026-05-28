import pool from "../db.js";
import {
  ensureAutoScheduleIndexes,
  ensureAvailabilityTables,
} from "../routes/autoSchedule/availabilityUtils.js";
import {
  clampDaysPerWeek,
  formatDate,
  parseDate,
  roundDurationToGrid,
} from "../routes/autoSchedule/timeUtils.js";
import { scheduleGroup } from "../routes/autoSchedule/core.js";

async function loadActiveRules(client, orgId) {
  const ruleParams = [];
  let ruleWhere = "WHERE is_active = true";
  if (orgId) {
    ruleParams.push(orgId);
    ruleWhere += ` AND organization_id = $${ruleParams.length}`;
  }
  const { rows } = await client.query(
    `SELECT * FROM rules ${ruleWhere} ORDER BY sort_order ASC, id ASC`,
    ruleParams
  );
  return rows;
}

export function validateAndNormalizeAutoScheduleInput({ start_date, end_date, groups }) {
  const startDateValue = String(start_date || "").trim();
  const endDateValue = String(end_date || "").trim();
  const normalizedGroups = Array.isArray(groups) ? groups : [];

  const startDate = parseDate(startDateValue);
  const endDate = parseDate(endDateValue);
  if (!startDate || !endDate || startDate > endDate) {
    const err = new Error("Invalid date range");
    err.statusCode = 400;
    throw err;
  }
  if (normalizedGroups.length === 0) {
    const err = new Error("No resource groups provided");
    err.statusCode = 400;
    throw err;
  }

  return { startDate, endDate, groups: normalizedGroups };
}

export async function executeAutoScheduleWithClient({
  client,
  startDate,
  endDate,
  groups,
  orgId,
}) {
  await ensureAvailabilityTables(client);
  await ensureAutoScheduleIndexes(client);
  const ruleRows = await loadActiveRules(client, orgId);

  const scheduled = [];
  const skipped = [];

  await client.query("BEGIN");
  try {
    for (const group of groups) {
      const daysPerWeek = clampDaysPerWeek(group?.days_per_week ?? 1);
      const hoursPerDay = Number(group?.hours_per_day);
      const weeklyHours = Number(group?.weekly_hours || 0);
      const perSessionHours =
        Number.isFinite(hoursPerDay) && hoursPerDay > 0
          ? hoursPerDay
          : (Number.isFinite(weeklyHours) && weeklyHours > 0 ? weeklyHours : 3) / daysPerWeek;
      const durationMinutes = roundDurationToGrid(Math.round(perSessionHours * 60));

      const result = await scheduleGroup({
        client,
        group,
        startDate,
        endDate,
        orgId,
        ruleRows,
        durationMinutes,
        daysPerWeek,
      });

      if (Array.isArray(result?.scheduled) && result.scheduled.length > 0) {
        scheduled.push(...result.scheduled);
      }
      if (result?.skipped) {
        skipped.push(result.skipped);
      }
    }

    await client.query("COMMIT");
    return { scheduled, skipped };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function executeAutoSchedule({ start_date, end_date, groups, orgId }) {
  const { startDate, endDate, groups: normalizedGroups } = validateAndNormalizeAutoScheduleInput({
    start_date,
    end_date,
    groups,
  });

  const client = await pool.connect();
  try {
    return await executeAutoScheduleWithClient({
      client,
      startDate,
      endDate,
      groups: normalizedGroups,
      orgId,
    });
  } finally {
    client.release();
  }
}

export function serializeAutoSchedulePayload({ start_date, end_date, groups, orgId }) {
  return {
    start_date: String(start_date || "").trim(),
    end_date: String(end_date || "").trim(),
    groups: Array.isArray(groups) ? groups : [],
    org_id: orgId || null,
  };
}

export function normalizeOrgId(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function toJobSummary({ startDate, endDate, groups }) {
  return {
    range: `${formatDate(startDate)} -> ${formatDate(endDate)}`,
    allocations: Array.isArray(groups) ? groups.length : 0,
  };
}
