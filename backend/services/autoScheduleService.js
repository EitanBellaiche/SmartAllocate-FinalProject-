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

export function normalizeAllowSaturday(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return true;
}

export function normalizeBlockedDates(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )
  ).sort();
}

export function validateAndNormalizeAutoScheduleInput({
  start_date,
  end_date,
  groups,
  allow_saturday,
  blocked_dates,
}) {
  const startDateValue = String(start_date || "").trim();
  const endDateValue = String(end_date || "").trim();
  const normalizedGroups = Array.isArray(groups) ? groups : [];
  const allowSaturday = normalizeAllowSaturday(allow_saturday);
  const blockedDates = normalizeBlockedDates(blocked_dates);

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

  return { startDate, endDate, groups: normalizedGroups, allowSaturday, blockedDates };
}

export async function executeAutoScheduleWithClient({
  client,
  startDate,
  endDate,
  groups,
  orgId,
  allowSaturday = true,
  blockedDates = [],
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
        allowSaturday,
        blockedDates,
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

export async function executeAutoSchedule({
  start_date,
  end_date,
  groups,
  orgId,
  allow_saturday,
  blocked_dates,
}) {
  const {
    startDate,
    endDate,
    groups: normalizedGroups,
    allowSaturday,
    blockedDates,
  } = validateAndNormalizeAutoScheduleInput({
    start_date,
    end_date,
    groups,
    allow_saturday,
    blocked_dates,
  });

  const client = await pool.connect();
  try {
    return await executeAutoScheduleWithClient({
      client,
      startDate,
      endDate,
      groups: normalizedGroups,
      orgId,
      allowSaturday,
      blockedDates,
    });
  } finally {
    client.release();
  }
}

export function serializeAutoSchedulePayload({
  start_date,
  end_date,
  groups,
  orgId,
  allow_saturday,
  blocked_dates,
}) {
  return {
    start_date: String(start_date || "").trim(),
    end_date: String(end_date || "").trim(),
    groups: Array.isArray(groups) ? groups : [],
    allow_saturday: normalizeAllowSaturday(allow_saturday),
    blocked_dates: normalizeBlockedDates(blocked_dates),
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
