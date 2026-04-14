import pool from "../db.js";
import {
  executeAutoScheduleWithClient,
  normalizeOrgId,
  serializeAutoSchedulePayload,
  validateAndNormalizeAutoScheduleInput,
} from "./autoScheduleService.js";

const JOBS_TABLE = "auto_schedule_jobs_v2";
let tableReady = false;

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
}) {
  await ensureAutoScheduleJobsTable();

  const runAt = parseRunAt(run_at);
  if (!runAt) {
    const err = new Error("Invalid run_at date/time");
    err.statusCode = 400;
    throw err;
  }

  // Validate scheduling payload early so jobs don't fail later.
  validateAndNormalizeAutoScheduleInput({ start_date, end_date, groups });

  const payload = serializeAutoSchedulePayload({ start_date, end_date, groups, orgId });
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

        const { startDate, endDate, groups } = validateAndNormalizeAutoScheduleInput({
          start_date: startDateValue,
          end_date: endDateValue,
          groups: groupsValue,
        });

        const result = await executeAutoScheduleWithClient({
          client,
          startDate,
          endDate,
          groups,
          orgId,
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

