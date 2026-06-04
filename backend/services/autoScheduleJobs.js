import pool from "../db.js";
import {
  executeAutoScheduleWithClient,
  normalizeOrgId,
  serializeAutoSchedulePayload,
  validateAndNormalizeAutoScheduleInput,
} from "./autoScheduleService.js";

const JOBS_TABLE = "auto_schedule_jobs_v2";
let tableReady = false;

function normalizeMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractUserIds(meta) {
  if (!meta || typeof meta !== "object") return [];
  const candidates = [meta.user_ids, meta.userIds];
  if (Array.isArray(meta.users)) {
    candidates.push(meta.users);
  } else if (typeof meta.users === "string") {
    const trimmed = meta.users.trim();
    if (/[,\s]/.test(trimmed) || /^\d{6,}$/.test(trimmed)) {
      candidates.push(trimmed);
    }
  }
  const list = [];
  for (const value of candidates) {
    if (!value) continue;
    if (Array.isArray(value)) {
      list.push(...value);
    } else if (typeof value === "string") {
      list.push(...value.split(/[\s,]+/));
    }
  }
  return list.map((v) => String(v).trim()).filter(Boolean);
}

function extractResponsibleUserIds(meta) {
  if (!meta || typeof meta !== "object") return [];
  return Array.from(
    new Set(
      [
        meta.responsible_user_id,
        meta.responsibleUserId,
        meta.responsible_id,
        meta.responsibleId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function hasAssignedUsers(meta) {
  return extractUserIds(meta).length > 0 || extractResponsibleUserIds(meta).length > 0;
}

function getPrimaryResourceRows(rows) {
  const primary = rows.filter((row) => hasAssignedUsers(normalizeMetadata(row.resource_metadata)));
  return primary.length > 0 ? primary : rows;
}

function getDayOfWeekFromDateString(value) {
  const parts = String(value || "").split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day).getDay();
}

async function getAutoScheduleJobOrThrow({ id, orgId }) {
  await ensureAutoScheduleJobsTable();
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) {
    const err = new Error("Invalid job id");
    err.statusCode = 400;
    throw err;
  }
  const params = [jobId];
  let where = "WHERE id = $1";
  if (orgId) {
    params.push(String(orgId));
    where += ` AND organization_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `
    SELECT *
    FROM ${JOBS_TABLE}
    ${where}
    LIMIT 1
    `,
    params
  );
  if (rows.length === 0) {
    const err = new Error("Job not found");
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

async function loadBookingRowsForCancellation(client, { bookingId, orgId }) {
  const params = [bookingId];
  let where = "WHERE b.id = $1 AND bc.booking_id IS NULL";
  if (orgId) {
    params.push(String(orgId));
    where += ` AND r.organization_id = $2`;
  }
  const { rows } = await client.query(
    `
    SELECT
      b.id,
      b.date,
      b.start_time,
      b.end_time,
      b.user_id,
      r.id AS resource_id,
      r.name AS resource_name,
      r.metadata AS resource_metadata
    FROM bookings b
    JOIN booking_resources br ON br.booking_id = b.id
    JOIN resources r ON r.id = br.resource_id
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    ${where}
    `,
    params
  );
  return rows;
}

async function collectSimilarBookingIds(client, { bookingRows, orgId }) {
  if (!Array.isArray(bookingRows) || bookingRows.length === 0) return [];
  const booking = bookingRows[0];
  const resourceIds = bookingRows.map((row) => row.resource_id).filter(Boolean);
  const primaryRows = getPrimaryResourceRows(bookingRows);
  const primaryResourceIds = primaryRows.map((row) => row.resource_id).filter(Boolean);
  const bookingDayOfWeek = getDayOfWeekFromDateString(booking.date);

  let targetBookings = [{ id: booking.id, user_id: booking.user_id }];
  if (resourceIds.length > 0) {
    const targetParams = [
      resourceIds,
      bookingDayOfWeek,
      booking.start_time,
      booking.end_time,
      resourceIds.length,
    ];
    let targetOrg = "";
    if (orgId) {
      targetParams.push(String(orgId));
      targetOrg = `AND r.organization_id = $${targetParams.length}`;
    }
    const { rows: targetRows } = await client.query(
      `
      SELECT b.id, b.user_id
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      WHERE br.resource_id = ANY($1)
      AND ($2::int IS NULL OR EXTRACT(DOW FROM b.date::date) = $2)
      AND b.start_time = $3
      AND b.end_time = $4
      AND bc.booking_id IS NULL
      ${targetOrg}
      GROUP BY b.id, b.user_id
      HAVING COUNT(DISTINCT br.resource_id) = $5
         AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($1) THEN br.resource_id END) = $5
      `,
      targetParams
    );
    if (targetRows.length > 0) {
      targetBookings = targetRows;
    } else if (orgId) {
      const retryParams = [
        resourceIds,
        bookingDayOfWeek,
        booking.start_time,
        booking.end_time,
        resourceIds.length,
      ];
      const { rows: retryRows } = await client.query(
        `
        SELECT b.id, b.user_id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        WHERE br.resource_id = ANY($1)
        AND ($2::int IS NULL OR EXTRACT(DOW FROM b.date::date) = $2)
        AND b.start_time = $3
        AND b.end_time = $4
        AND bc.booking_id IS NULL
        GROUP BY b.id, b.user_id
        HAVING COUNT(DISTINCT br.resource_id) = $5
           AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($1) THEN br.resource_id END) = $5
        `,
        retryParams
      );
      if (retryRows.length > 0) {
        targetBookings = retryRows;
      }
    }

    if (targetBookings.length === 1 && primaryResourceIds.length > 0) {
      const fallbackParams = [
        primaryResourceIds,
        bookingDayOfWeek,
        booking.start_time,
        booking.end_time,
      ];
      let fallbackOrg = "";
      if (orgId) {
        fallbackParams.push(String(orgId));
        fallbackOrg = `AND r.organization_id = $${fallbackParams.length}`;
      }
      const { rows: fallbackRows } = await client.query(
        `
        SELECT DISTINCT b.id, b.user_id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        WHERE br.resource_id = ANY($1)
        AND ($2::int IS NULL OR EXTRACT(DOW FROM b.date::date) = $2)
        AND b.start_time = $3
        AND b.end_time = $4
        AND bc.booking_id IS NULL
        ${fallbackOrg}
        `,
        fallbackParams
      );
      if (fallbackRows.length > 0) {
        targetBookings = fallbackRows;
      } else if (orgId) {
        const retryFallbackParams = [
          primaryResourceIds,
          bookingDayOfWeek,
          booking.start_time,
          booking.end_time,
        ];
        const { rows: retryFallbackRows } = await client.query(
          `
          SELECT DISTINCT b.id, b.user_id
          FROM bookings b
          JOIN booking_resources br ON br.booking_id = b.id
          JOIN resources r ON r.id = br.resource_id
          LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
          WHERE br.resource_id = ANY($1)
          AND ($2::int IS NULL OR EXTRACT(DOW FROM b.date::date) = $2)
          AND b.start_time = $3
          AND b.end_time = $4
          AND bc.booking_id IS NULL
          `,
          retryFallbackParams
        );
        if (retryFallbackRows.length > 0) {
          targetBookings = retryFallbackRows;
        }
      }
    }
  }

  return targetBookings
    .map((item) => Number(item.id))
    .filter((value) => Number.isFinite(value));
}

export async function ensureAutoScheduleJobsTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${JOBS_TABLE} (
      id SERIAL PRIMARY KEY,
      organization_id TEXT,
      created_by TEXT,
      run_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      result JSONB,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_${JOBS_TABLE}_due ON ${JOBS_TABLE} (status, run_at)`
  );
  tableReady = true;
}

function parseRunAt(raw) {
  if (!raw) return null;
  const dt = new Date(String(raw));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export async function createAutoScheduleJob({
  run_at,
  start_date,
  end_date,
  groups,
  orgId,
  createdBy,
  allow_saturday,
  blocked_dates,
}) {
  await ensureAutoScheduleJobsTable();

  const runAt = parseRunAt(run_at);
  if (!runAt) {
    const err = new Error("Invalid run_at date/time");
    err.statusCode = 400;
    throw err;
  }

  // Validate scheduling payload early so jobs don't fail later.
  validateAndNormalizeAutoScheduleInput({ start_date, end_date, groups, allow_saturday, blocked_dates });

  const payload = serializeAutoSchedulePayload({
    start_date,
    end_date,
    groups,
    orgId,
    allow_saturday,
    blocked_dates,
  });
  const { rows } = await pool.query(
    `
    INSERT INTO ${JOBS_TABLE} (organization_id, created_by, run_at, payload)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING *
    `,
    [
      orgId,
      createdBy || null,
      runAt.toISOString(),
      JSON.stringify(payload),
    ]
  );
  return rows[0];
}

export async function recordCompletedAutoScheduleRun({
  start_date,
  end_date,
  groups,
  orgId,
  createdBy,
  allow_saturday,
  blocked_dates,
  result,
}) {
  await ensureAutoScheduleJobsTable();
  validateAndNormalizeAutoScheduleInput({ start_date, end_date, groups, allow_saturday, blocked_dates });

  const payload = serializeAutoSchedulePayload({
    start_date,
    end_date,
    groups,
    orgId,
    allow_saturday,
    blocked_dates,
  });
  const { rows } = await pool.query(
    `
    INSERT INTO ${JOBS_TABLE} (
      organization_id,
      created_by,
      run_at,
      payload,
      status,
      started_at,
      finished_at,
      result
    )
    VALUES ($1, $2, NOW(), $3::jsonb, 'completed', NOW(), NOW(), $4::jsonb)
    RETURNING *
    `,
    [
      orgId,
      createdBy || null,
      JSON.stringify(payload),
      JSON.stringify(result || { scheduled: [], skipped: [] }),
    ]
  );
  return rows[0];
}

export async function listAutoScheduleJobs({ status, orgId, limit = 50 } = {}) {
  await ensureAutoScheduleJobsTable();
  const params = [];
  const conditions = [];

  if (status) {
    params.push(String(status));
    conditions.push(`status = $${params.length}`);
  }
  if (orgId) {
    params.push(String(orgId));
    conditions.push(`organization_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(Math.min(200, Math.max(1, Number(limit) || 50)));

  const { rows } = await pool.query(
    `
    SELECT *
    FROM ${JOBS_TABLE}
    ${where}
    ORDER BY run_at DESC, id DESC
    LIMIT $${params.length}
    `,
    params
  );
  return rows;
}

export async function cancelAutoScheduleJob({ id, orgId } = {}) {
  await ensureAutoScheduleJobsTable();
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) {
    const err = new Error("Invalid job id");
    err.statusCode = 400;
    throw err;
  }
  const params = [jobId];
  let where = "WHERE id = $1";
  if (orgId) {
    params.push(String(orgId));
    where += ` AND organization_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `
    UPDATE ${JOBS_TABLE}
    SET status = 'cancelled', finished_at = NOW()
    ${where}
    AND status = 'scheduled'
    RETURNING *
    `,
    params
  );

  if (rows.length === 0) {
    const err = new Error("Job not found or cannot be cancelled");
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function rerunAutoScheduleJob({ id, orgId, createdBy } = {}) {
  const job = await getAutoScheduleJobOrThrow({ id, orgId });
  if (String(job.status || "").trim() === "running") {
    const err = new Error("Running job cannot be rerun yet");
    err.statusCode = 409;
    throw err;
  }
  const payload = job.payload || {};
  return createAutoScheduleJob({
    run_at: new Date().toISOString(),
    start_date: payload.start_date,
    end_date: payload.end_date,
    groups: Array.isArray(payload.groups) ? payload.groups : [],
    orgId: normalizeOrgId(payload.org_id || job.organization_id),
    createdBy: createdBy || job.created_by || null,
    allow_saturday: payload.allow_saturday,
    blocked_dates: payload.blocked_dates,
  });
}

export async function revertAutoScheduleJob({ id, orgId } = {}) {
  const job = await getAutoScheduleJobOrThrow({ id, orgId });
  if (String(job.status || "").trim() !== "completed") {
    const err = new Error("Only completed jobs can be reverted");
    err.statusCode = 409;
    throw err;
  }

  const scheduled = Array.isArray(job?.result?.scheduled) ? job.result.scheduled : [];
  const seedBookingIds = Array.from(
    new Set(
      scheduled
        .map((item) => Number(item?.booking_id))
        .filter((value) => Number.isFinite(value))
    )
  );
  if (seedBookingIds.length === 0) {
    const err = new Error("This job has no created bookings to cancel");
    err.statusCode = 409;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const allTargetIds = new Set();
    for (const bookingId of seedBookingIds) {
      const bookingRows = await loadBookingRowsForCancellation(client, { bookingId, orgId });
      if (bookingRows.length === 0) continue;
      const familyIds = await collectSimilarBookingIds(client, { bookingRows, orgId });
      familyIds.forEach((value) => allTargetIds.add(value));
    }

    const targetIds = Array.from(allTargetIds);
    for (const bookingId of targetIds) {
      await client.query(
        `
        INSERT INTO booking_cancellations (booking_id, cancelled_reason, cancelled_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (booking_id) DO NOTHING
        `,
        [bookingId, `Auto schedule job #${job.id} reverted`, "Auto Scheduler"]
      );
    }

    const revertMeta = JSON.stringify({
      reverted_at: new Date().toISOString(),
      cancelled_count: targetIds.length,
    });
    const { rows } = await client.query(
      `
      UPDATE ${JOBS_TABLE}
      SET result = jsonb_set(COALESCE(result, '{}'::jsonb), '{revert}', $2::jsonb, true)
      WHERE id = $1
      RETURNING *
      `,
      [job.id, revertMeta]
    );

    await client.query("COMMIT");
    return {
      ...(rows[0] || job),
      reverted_count: targetIds.length,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteAutoScheduleJob({ id, orgId } = {}) {
  await ensureAutoScheduleJobsTable();
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) {
    const err = new Error("Invalid job id");
    err.statusCode = 400;
    throw err;
  }

  const params = [jobId];
  let where = "WHERE id = $1";
  if (orgId) {
    params.push(String(orgId));
    where += ` AND organization_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `
    DELETE FROM ${JOBS_TABLE}
    ${where}
    AND status <> 'running'
    RETURNING *
    `,
    params
  );

  if (rows.length === 0) {
    const err = new Error("Job not found or cannot be deleted");
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function processDueAutoScheduleJobs({ maxPerTick = 1 } = {}) {
  await ensureAutoScheduleJobsTable();

  const client = await pool.connect();
  try {
    for (let i = 0; i < maxPerTick; i += 1) {
      let job = null;

      await client.query("BEGIN");
      try {
        const { rows } = await client.query(
          `
          SELECT *
          FROM ${JOBS_TABLE}
          WHERE status = 'scheduled'
          AND run_at <= NOW()
          ORDER BY run_at ASC, id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
          `
        );

        if (rows.length === 0) {
          await client.query("COMMIT");
          return { processed: i, last_job_id: null };
        }

        job = rows[0];
        await client.query(
          `
          UPDATE ${JOBS_TABLE}
          SET status = 'running', started_at = NOW(), error = NULL
          WHERE id = $1
          `,
          [job.id]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }

      const orgId = normalizeOrgId(job.organization_id);
      const payload = job.payload || {};

      try {
        const startDateValue = payload.start_date || null;
        const endDateValue = payload.end_date || null;
        const groupsValue = payload.groups || [];

        const { startDate, endDate, groups, allowSaturday, blockedDates } = validateAndNormalizeAutoScheduleInput({
          start_date: startDateValue,
          end_date: endDateValue,
          groups: groupsValue,
          allow_saturday: payload.allow_saturday,
          blocked_dates: payload.blocked_dates,
        });

        const result = await executeAutoScheduleWithClient({
          client,
          startDate,
          endDate,
          groups,
          orgId,
          allowSaturday,
          blockedDates,
        });

        await client.query(
          `
          UPDATE ${JOBS_TABLE}
          SET status = 'completed',
              finished_at = NOW(),
              result = $2::jsonb
          WHERE id = $1
          `,
          [job.id, JSON.stringify(result)]
        );
      } catch (err) {
        await client.query(
          `
          UPDATE ${JOBS_TABLE}
          SET status = 'failed',
              finished_at = NOW(),
              error = $2
          WHERE id = $1
          `,
          [job.id, String(err?.message || err)]
        );
      }
    }

    return { processed: maxPerTick, last_job_id: null };
  } finally {
    client.release();
  }
}

async function findNextScheduledJobForResponsible({ orgId, responsibleUserId }) {
  await ensureAutoScheduleJobsTable();
  const rid = String(responsibleUserId || "").trim();
  if (!rid) return null;

  const params = [rid];
  let orgWhere = "";
  if (orgId) {
    params.push(String(orgId));
    orgWhere = `AND organization_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `
    SELECT *
    FROM ${JOBS_TABLE} j
    WHERE j.status = 'scheduled'
    ${orgWhere}
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(j.payload->'groups') AS g
      WHERE COALESCE(g->>'responsible_user_id','') = $1
    )
    ORDER BY j.run_at ASC, j.id ASC
    LIMIT 1
    `,
    params
  );

  return rows[0] || null;
}

async function findNextScheduledJobForOrg({ orgId }) {
  await ensureAutoScheduleJobsTable();
  const params = [];
  let where = "WHERE status = 'scheduled'";
  if (orgId) {
    params.push(String(orgId));
    where += ` AND organization_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `
    SELECT *
    FROM ${JOBS_TABLE}
    ${where}
    ORDER BY run_at ASC, id ASC
    LIMIT 1
    `,
    params
  );
  return rows[0] || null;
}

export async function getOrgSchedulingDeadlineInfo({ orgId, responsibleUserId }) {
  const job = await findNextScheduledJobForOrg({ orgId });
  if (!job?.run_at) {
    return {
      has_deadline: false,
      job_id: null,
      run_at: null,
      locked: false,
      must_fill_availability: false,
      scheduling_range: null,
      time_windows: [],
      scope: "org",
    };
  }

  const runAt = new Date(job.run_at);
  const locked = !Number.isNaN(runAt.getTime()) && Date.now() >= runAt.getTime();
  const payload = job.payload || {};
  const startDate = payload?.start_date ? String(payload.start_date) : null;
  const endDate = payload?.end_date ? String(payload.end_date) : null;
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  const windows = [];
  for (const g of groups) {
    const list = Array.isArray(g?.preferred_time_windows) ? g.preferred_time_windows : [];
    for (const w of list) {
      const s = w?.start_time ? String(w.start_time).slice(0, 5) : "";
      const e = w?.end_time ? String(w.end_time).slice(0, 5) : "";
      if (!s || !e || s >= e) continue;
      windows.push({ start_time: s, end_time: e });
    }
  }
  const uniqKey = new Set();
  const uniqueWindows = windows.filter((w) => {
    const key = `${w.start_time}-${w.end_time}`;
    if (uniqKey.has(key)) return false;
    uniqKey.add(key);
    return true;
  });

  return {
    has_deadline: true,
    job_id: job.id,
    run_at: job.run_at,
    locked,
    must_fill_availability: false,
    scheduling_range: startDate && endDate ? { start_date: startDate, end_date: endDate } : null,
    time_windows: uniqueWindows,
    scope: "org",
  };
}

export async function getResponsibleSchedulingDeadlineInfo({ orgId, responsibleUserId }) {
  const job = await findNextScheduledJobForResponsible({ orgId, responsibleUserId });
  if (!job?.run_at) {
    return {
      has_deadline: false,
      job_id: null,
      run_at: null,
      locked: false,
      must_fill_availability: false,
      scope: "responsible",
    };
  }

  const runAt = new Date(job.run_at);
  const locked = !Number.isNaN(runAt.getTime()) && Date.now() >= runAt.getTime();
  return {
    has_deadline: true,
    job_id: job.id,
    run_at: job.run_at,
    locked,
    must_fill_availability: false,
    scope: "responsible",
  };
}

export async function assertAvailabilityNotLocked({ orgId, responsibleUserId }) {
  const info = await getOrgSchedulingDeadlineInfo({ orgId, responsibleUserId });
  if (info?.locked) {
    const err = new Error(
      `Availability is locked because scheduling started at ${info.run_at}.`
    );
    err.statusCode = 423;
    throw err;
  }
}
