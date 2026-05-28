import express from "express";
import pool from "../db.js";
import {
  clampDaysPerWeek,
  formatDate,
  parseDate,
  roundDurationToGrid,
} from "./autoSchedule/timeUtils.js";
import {
  ensureAutoScheduleIndexes,
  ensureAvailabilityTables,
} from "./autoSchedule/availabilityUtils.js";
import { diagnoseGroupFailure } from "./autoSchedule/core.js";
import { executeAutoSchedule, normalizeOrgId } from "../services/autoScheduleService.js";
import {
  cancelAutoScheduleJob,
  createAutoScheduleJob,
  deleteAutoScheduleJob,
  getOrgSchedulingDeadlineInfo,
  getResponsibleSchedulingDeadlineInfo,
  listAutoScheduleJobs,
  recordCompletedAutoScheduleRun,
} from "../services/autoScheduleJobs.js";

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

function getCreatedBy(req) {
  const value = req.body?.created_by || req.query?.created_by;
  const trimmed = String(value || "").trim();
  return trimmed || null;
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
    await ensureAutoScheduleIndexes(client);
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
          durationMinutes: (() => {
            const daysPerWeek = clampDaysPerWeek(group?.days_per_week ?? 1);
            const hoursPerDay = Number(group?.hours_per_day);
            const weeklyHours = Number(group?.weekly_hours || 0);
            const perSessionHours = Number.isFinite(hoursPerDay) && hoursPerDay > 0
              ? hoursPerDay
              : (Number.isFinite(weeklyHours) && weeklyHours > 0 ? weeklyHours : 3) / daysPerWeek;
            return roundDurationToGrid(Math.round(perSessionHours * 60));
          })(),
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
  try {
    const orgId = getOrgId(req);
    const data = await executeAutoSchedule({
      start_date: req.body?.start_date,
      end_date: req.body?.end_date,
      groups: req.body?.groups,
      orgId,
    });
    await recordCompletedAutoScheduleRun({
      start_date: req.body?.start_date,
      end_date: req.body?.end_date,
      groups: req.body?.groups,
      orgId,
      createdBy: getCreatedBy(req),
      result: data,
    });
    res.json(data);
  } catch (err) {
    console.error("Auto scheduling failed:", err);
    const code = Number(err?.statusCode) || 500;
    res.status(code).json({ error: err?.message || "Auto schedule failed" });
  }
});

router.get("/jobs", async (req, res) => {
  try {
    const orgId = normalizeOrgId(getOrgId(req));
    const status = String(req.query?.status || "").trim() || null;
    const limit = Number(req.query?.limit);
    const jobs = await listAutoScheduleJobs({ status, orgId, limit });
    res.json(jobs);
  } catch (err) {
    console.error("Failed to list auto schedule jobs:", err);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

router.post("/jobs", async (req, res) => {
  try {
    const orgId = normalizeOrgId(getOrgId(req));
    const createdBy = getCreatedBy(req);
    const job = await createAutoScheduleJob({
      run_at: req.body?.run_at,
      start_date: req.body?.start_date,
      end_date: req.body?.end_date,
      groups: req.body?.groups,
      orgId,
      createdBy,
    });
    res.status(201).json(job);
  } catch (err) {
    console.error("Failed to create auto schedule job:", err);
    const code = Number(err?.statusCode) || 500;
    res.status(code).json({ error: err?.message || "Failed to create job" });
  }
});

router.post("/jobs/:id/cancel", async (req, res) => {
  try {
    const orgId = normalizeOrgId(getOrgId(req));
    const job = await cancelAutoScheduleJob({ id: req.params.id, orgId });
    res.json(job);
  } catch (err) {
    console.error("Failed to cancel auto schedule job:", err);
    const code = Number(err?.statusCode) || 500;
    res.status(code).json({ error: err?.message || "Failed to cancel job" });
  }
});

router.delete("/jobs/:id", async (req, res) => {
  try {
    const orgId = normalizeOrgId(getOrgId(req));
    const job = await deleteAutoScheduleJob({ id: req.params.id, orgId });
    res.json(job);
  } catch (err) {
    console.error("Failed to delete auto schedule job:", err);
    const code = Number(err?.statusCode) || 500;
    res.status(code).json({ error: err?.message || "Failed to delete job" });
  }
});

router.get("/responsible-deadline", async (req, res) => {
  try {
    const orgId = normalizeOrgId(getOrgId(req));
    const responsibleUserId = String(req.query?.responsible_user_id || "").trim();
    const info = await getResponsibleSchedulingDeadlineInfo({ orgId, responsibleUserId });
    res.json(info);
  } catch (err) {
    console.error("Failed to load responsible deadline:", err);
    res.status(500).json({ error: "Failed to load scheduling deadline" });
  }
});

router.get("/deadline", async (req, res) => {
  try {
    const orgId = normalizeOrgId(getOrgId(req));
    const responsibleUserId = String(req.query?.responsible_user_id || "").trim();
    const info = await getOrgSchedulingDeadlineInfo({ orgId, responsibleUserId });
    res.json(info);
  } catch (err) {
    console.error("Failed to load org deadline:", err);
    res.status(500).json({ error: "Failed to load scheduling deadline" });
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
