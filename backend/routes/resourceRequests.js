import express from "express";
import pool from "../db.js";
import { evaluateRules } from "../rulesEngine.js";

const router = express.Router();
let tableReady = false;

function getOrgId(req) {
  const value =
    req.query?.org_id ||
    req.query?.organization_id ||
    req.body?.org_id ||
    req.body?.organization_id;
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resource_requests (
      id SERIAL PRIMARY KEY,
      resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
      student_id TEXT NOT NULL,
      user_id TEXT,
      note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      request_date DATE,
      start_time TIME,
      end_time TIME,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS request_date DATE`);
  await pool.query(`ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS start_time TIME`);
  await pool.query(`ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS end_time TIME`);
  await pool.query(`ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS booking_id INTEGER`);
  await pool.query(`ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await pool.query(`ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error("Failed to init resource_requests table:", err);
    res.status(500).json({ error: "Request service unavailable" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, resource_id, student_id, user_id } = req.query;
    const orgId = getOrgId(req);
    const params = [];
    const conditions = [];

    if (status) {
      params.push(String(status));
      conditions.push(`rr.status = $${params.length}`);
    }

    if (resource_id) {
      params.push(Number(resource_id));
      if (!Number.isFinite(params[params.length - 1])) {
        return res.status(400).json({ error: "Invalid resource_id" });
      }
      conditions.push(`rr.resource_id = $${params.length}`);
    }

    if (student_id) {
      params.push(String(student_id));
      conditions.push(`rr.student_id = $${params.length}`);
    }

    if (user_id) {
      params.push(String(user_id));
      conditions.push(`rr.user_id = $${params.length}`);
    }

    if (orgId) {
      params.push(orgId);
      conditions.push(`rr.organization_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      SELECT
        rr.id,
        rr.resource_id,
        rr.student_id,
        rr.user_id,
        rr.note,
        rr.status,
        rr.request_date,
        rr.start_time,
        rr.end_time,
        rr.booking_id,
        rr.created_at,
        r.name AS resource_name,
        rt.name AS resource_type
      FROM resource_requests rr
      LEFT JOIN resources r ON r.id = rr.resource_id
      LEFT JOIN resource_types rt ON rt.id = r.type_id
      ${where}
      ORDER BY rr.created_at DESC, rr.id DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching resource requests:", err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

router.post("/", async (req, res) => {
  const resourceId = Number(req.body?.resource_id);
  const studentIdRaw = String(req.body?.student_id || "").trim();
  const userIdRaw = String(req.body?.user_id || "").trim();
  const userId = userIdRaw || studentIdRaw;
  const studentId = studentIdRaw || userId;
  const note = String(req.body?.note || "").trim();
  const orgId = getOrgId(req);
  const requestDate = req.body?.request_date
    ? String(req.body.request_date).trim()
    : "";
  const startTime = req.body?.start_time
    ? String(req.body.start_time).trim()
    : "";
  const endTime = req.body?.end_time ? String(req.body.end_time).trim() : "";

  if (!Number.isFinite(resourceId)) {
    return res.status(400).json({ error: "Invalid resource_id" });
  }
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }
  if (!note && !requestDate) {
    return res.status(400).json({ error: "Request note is required" });
  }
  if (requestDate || startTime || endTime) {
    if (!requestDate || !startTime || !endTime) {
      return res.status(400).json({ error: "Date and time are required" });
    }
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO resource_requests (resource_id, student_id, user_id, note, request_date, start_time, end_time, organization_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        resourceId,
        studentId,
        userId,
        note,
        requestDate || null,
        startTime || null,
        endTime || null,
        orgId,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error creating resource request:", err);
    res.status(500).json({ error: "Failed to create request" });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "").trim();
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid request id" });
  }
  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const params = [status, id];
    let where = "WHERE id = $2";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $2 AND organization_id = $3";
    }
    const { rows } = await client.query(
      `
      UPDATE resource_requests
      SET status = $1
      ${where}
      RETURNING *
      `,
      params
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Request not found" });
    }

    const request = rows[0];

    if (status === "approved" && !request.booking_id) {
      const { resource_id, student_id, user_id, request_date, start_time, end_time } =
        request;
      const bookingUserId = user_id || student_id;

      if (!resource_id || !bookingUserId || !request_date || !start_time || !end_time) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "Request is missing date/time details" });
      }

      const conflictParams = [resource_id, request_date, start_time, end_time];
      let conflictOrg = "";
      if (orgId) {
        conflictParams.push(orgId);
        conflictOrg = `AND r.organization_id = $${conflictParams.length}`;
      }
      const conflictCheck = await client.query(
        `
      SELECT br.resource_id, b.*
      FROM booking_resources br
      JOIN bookings b ON b.id = br.booking_id
      JOIN resources r ON r.id = br.resource_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      WHERE br.resource_id = $1
      AND b.date = $2
      AND bc.booking_id IS NULL
      ${conflictOrg}
      AND (
        ($3 >= b.start_time AND $3 < b.end_time) OR
        ($4 > b.start_time AND $4 <= b.end_time) OR
        ($3 <= b.start_time AND $4 >= b.end_time)
      )
      `,
        conflictParams
      );

      if (conflictCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Resources conflict",
          conflicts: conflictCheck.rows,
        });
      }

      const resourceParams = [resource_id];
      let resourceWhere = "WHERE r.id = $1";
      if (orgId) {
        resourceParams.push(orgId);
        resourceWhere = "WHERE r.id = $1 AND r.organization_id = $2";
      }
      const { rows: resourceRows } = await client.query(
        `
        SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
        FROM resources r
        JOIN resource_types rt ON rt.id = r.type_id
        ${resourceWhere}
        `,
        resourceParams
      );

      if (resourceRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Resource not found" });
      }

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

      const ruleEval = evaluateRules({
        rules: ruleRows,
        booking: {
          date: request_date,
          start_time,
          end_time,
          user_id: bookingUserId,
        },
        resources: resourceRows,
        roles: null,
      });

      if (ruleEval.hardViolations.length > 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          error: "Rule violations",
          violations: ruleEval.hardViolations,
          alerts: ruleEval.alerts,
        });
      }

      const bookingResult = await client.query(
        `
        INSERT INTO bookings (user_id, date, start_time, end_time)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [bookingUserId, request_date, start_time, end_time]
      );

      const booking = bookingResult.rows[0];

      await client.query(
        `
        INSERT INTO booking_resources (booking_id, resource_id, role)
        VALUES ($1, $2, $3)
        `,
        [booking.id, resource_id, null]
      );

      await client.query(
        `
        UPDATE resource_requests
        SET booking_id = $1
        WHERE id = $2
        `,
        [booking.id, id]
      );

      request.booking_id = booking.id;
    }

    await client.query("COMMIT");
    res.json(request);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error updating request:", err);
    res.status(500).json({ error: "Failed to update request" });
  } finally {
    client.release();
  }
});

export default router;
