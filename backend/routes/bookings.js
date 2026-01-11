import express from "express";
import pool from "../db.js";
import { evaluateRules } from "../rulesEngine.js";

const router = express.Router();
let tableReady = false;

async function ensureTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_cancellations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      cancelled_reason TEXT,
      cancelled_by TEXT,
      cancelled_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_locations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      location TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      course_name TEXT,
      sender_name TEXT,
      target_user_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS course_name TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sender_name TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_user_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTables();
    next();
  } catch (err) {
    console.error("Failed to init booking tables:", err);
    res.status(500).json({ error: "Booking service unavailable" });
  }
});

// GET bookings (optional filter by resource_id)
router.get("/", async (req, res) => {
  try {
    const { resource_id, include_details } = req.query;
    const params = [];
    let where = "";
    const wantsDetails = include_details === "1" || include_details === "true";

    if (resource_id) {
      params.push(Number(resource_id));
      if (!Number.isFinite(params[0])) {
        return res.status(400).json({ error: "Invalid resource_id" });
      }
      where = "WHERE r.id = $1";
    }

    const { rows } = await pool.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        bc.cancelled_at,
        bc.cancelled_reason,
        bc.cancelled_by,
        bl.location,
        json_agg(
          json_build_object(
            'id', r.id,
            'name', r.name,
            'type_id', r.type_id,
            'type_name', rt.name,
            'metadata', r.metadata,
            'role', br.role
          )
          ORDER BY r.id
        ) AS resources
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      LEFT JOIN booking_locations bl ON bl.booking_id = b.id
      ${where}
      GROUP BY b.id, bc.cancelled_at, bc.cancelled_reason, bc.cancelled_by, bl.location
      ORDER BY b.date ASC, b.start_time ASC, b.id ASC
      `,
      params
    );

    if (!wantsDetails) {
      const compact = rows.map((row) => ({
        ...row,
        resources: (row.resources || []).map((r) => ({
          id: r.id,
          name: r.name,
          type_id: r.type_id,
          role: r.role,
        })),
      }));
      return res.json(compact);
    }

    return res.json(rows);
  } catch (err) {
    console.error("Error getting bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

router.post("/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || "").trim();
  const senderName = String(req.body?.sender_name || "Lecturer").trim();
  const targetUserIdRaw = String(req.body?.target_user_id || "").trim();
  const targetUserId = targetUserIdRaw || null;

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid booking id" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: bookingRows } = await client.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        r.name AS resource_name,
        rt.name AS type_name
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      WHERE b.id = $1
      `,
      [id]
    );

    if (bookingRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const { rows: existing } = await client.query(
      `SELECT id FROM booking_cancellations WHERE booking_id = $1`,
      [id]
    );
    if (existing.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Booking already cancelled" });
    }

    const courseNames = bookingRows
      .filter((r) => String(r.type_name || "").toLowerCase() === "courses")
      .map((r) => r.resource_name)
      .filter(Boolean);
    const fallbackNames = bookingRows
      .map((r) => r.resource_name)
      .filter(Boolean);
    const courseLabel = courseNames.length > 0 ? courseNames.join(" / ") : fallbackNames.join(" / ");
    const booking = bookingRows[0];

    await client.query(
      `
      INSERT INTO booking_cancellations (booking_id, cancelled_reason, cancelled_by)
      VALUES ($1, $2, $3)
      `,
      [id, reason || null, senderName || null]
    );

    const baseMessage = `Class cancelled: ${courseLabel} on ${booking.date} ${booking.start_time} - ${booking.end_time}.`;
    const message = reason ? `${baseMessage} Reason: ${reason}.` : baseMessage;
    await client.query(
      `
      INSERT INTO announcements (title, message, course_name, sender_name, target_user_id)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        "Class cancelled",
        message,
        courseLabel || null,
        senderName || null,
        targetUserId || (booking.user_id ? String(booking.user_id) : null),
      ]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error cancelling booking:", err);
    res.status(500).json({ error: "Failed to cancel booking" });
  } finally {
    client.release();
  }
});

router.post("/:id/reschedule", async (req, res) => {
  const id = Number(req.params.id);
  const date = String(req.body?.date || "").trim();
  const startTime = String(req.body?.start_time || "").trim();
  const endTime = String(req.body?.end_time || "").trim();
  const location = String(req.body?.location || "classroom").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  const senderName = String(req.body?.sender_name || "Lecturer").trim();
  const targetUserIdRaw = String(req.body?.target_user_id || "").trim();
  const targetUserId = targetUserIdRaw || null;

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: "Date and time are required" });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: bookingRows } = await client.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        r.id AS resource_id,
        r.name AS resource_name,
        rt.name AS type_name
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      WHERE b.id = $1
      `,
      [id]
    );

    if (bookingRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingRows[0];

    const resourceIds = bookingRows.map((r) => r.resource_id);
    const conflictCheck = await client.query(
      `
      SELECT br.resource_id, b.*
      FROM booking_resources br
      JOIN bookings b ON b.id = br.booking_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      WHERE br.resource_id = ANY($1)
      AND b.date = $2
      AND b.id <> $5
      AND bc.booking_id IS NULL
      AND (
        ($3 >= b.start_time AND $3 < b.end_time) OR
        ($4 > b.start_time AND $4 <= b.end_time) OR
        ($3 <= b.start_time AND $4 >= b.end_time)
      )
    `,
      [resourceIds, date, startTime, endTime, id]
    );

    if (conflictCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Resources conflict" });
    }

    await client.query(
      `
      UPDATE bookings
      SET date = $1, start_time = $2, end_time = $3
      WHERE id = $4
      `,
      [date, startTime, endTime, id]
    );

    if (location === "zoom") {
      await client.query(
        `
        INSERT INTO booking_locations (booking_id, location)
        VALUES ($1, $2)
        ON CONFLICT (booking_id) DO UPDATE
        SET location = EXCLUDED.location, updated_at = NOW()
        `,
        [id, "zoom"]
      );
    } else {
      await client.query(`DELETE FROM booking_locations WHERE booking_id = $1`, [id]);
    }

    const courseNames = bookingRows
      .filter((r) => String(r.type_name || "").toLowerCase() === "courses")
      .map((r) => r.resource_name)
      .filter(Boolean);
    const fallbackNames = bookingRows
      .map((r) => r.resource_name)
      .filter(Boolean);
    const courseLabel = courseNames.length > 0 ? courseNames.join(" / ") : fallbackNames.join(" / ");
    const locationLabel = location === "zoom" ? "Zoom" : "Classroom";
    const baseMessage = `Class rescheduled: ${courseLabel} moved from ${booking.date} ${booking.start_time} - ${booking.end_time} to ${date} ${startTime} - ${endTime}.`;
    const message = reason
      ? `${baseMessage} Reason: ${reason}. Location: ${locationLabel}.`
      : `${baseMessage} Location: ${locationLabel}.`;

    await client.query(
      `
      INSERT INTO announcements (title, message, course_name, sender_name, target_user_id)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        "Class rescheduled",
        message,
        courseLabel || null,
        senderName || null,
        targetUserId || (booking.user_id ? String(booking.user_id) : null),
      ]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error rescheduling booking:", err);
    res.status(500).json({ error: "Failed to reschedule booking" });
  } finally {
    client.release();
  }
});

/* -----------------------------
   CREATE BOOKING WITH RESOURCES
--------------------------------*/
router.post("/", async (req, res) => {
  const { resources, roles, date, start_time, end_time, user_id } = req.body;

  if (!resources || resources.length === 0) {
    return res.status(400).json({ error: "No resources provided" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* 1. Check availability for all selected resources */
    const conflictCheck = await client.query(
      `
      SELECT br.resource_id, b.*
      FROM booking_resources br
      JOIN bookings b ON b.id = br.booking_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      WHERE br.resource_id = ANY($1)
      AND b.date = $2
      AND bc.booking_id IS NULL
      AND (
        ($3 >= b.start_time AND $3 < b.end_time) OR
        ($4 > b.start_time AND $4 <= b.end_time) OR
        ($3 <= b.start_time AND $4 >= b.end_time)
      )
    `,
      [resources, date, start_time, end_time]
    );

    if (conflictCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Resources conflict",
        conflicts: conflictCheck.rows
      });
    }

    /* 2. Load resources + rules for evaluation */
    const { rows: resourceRows } = await client.query(
      `
      SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
      FROM resources r
      JOIN resource_types rt ON rt.id = r.type_id
      WHERE r.id = ANY($1)
      `,
      [resources]
    );

    if (resourceRows.length !== resources.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "One or more resources not found" });
    }

    const { rows: ruleRows } = await client.query(
      `SELECT * FROM rules WHERE is_active = true ORDER BY sort_order ASC, id ASC`
    );

    const ruleEval = evaluateRules({
      rules: ruleRows,
      booking: {
        date,
        start_time,
        end_time,
        user_id,
      },
      resources: resourceRows,
      roles,
    });

    if (ruleEval.hardViolations.length > 0) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: "Rule violations",
        violations: ruleEval.hardViolations,
        alerts: ruleEval.alerts,
      });
    }

    /* 3. Create booking */
    const bookingResult = await client.query(
      `
      INSERT INTO bookings (user_id, date, start_time, end_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [user_id, date, start_time, end_time]
    );

    const booking = bookingResult.rows[0];

    /* 3. Insert into booking_resources */
    for (let r of resources) {
      await client.query(
        `
        INSERT INTO booking_resources (booking_id, resource_id, role)
        VALUES ($1, $2, $3)
      `,
        [booking.id, r, roles?.[r] || null]
      );
    }

    await client.query("COMMIT");

    res.json({
      message: "Booking created",
      booking,
      rule_summary: {
        score: ruleEval.score,
        soft_matches: ruleEval.softMatches,
        alerts: ruleEval.alerts,
      },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Booking error:", err);
    res.status(500).json({ error: "Booking failed" });
  } finally {
    client.release();
  }
});

// UPDATE booking
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { resources, roles, date, start_time, end_time, user_id } = req.body;

  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid booking id" });
  if (!resources || resources.length === 0) {
    return res.status(400).json({ error: "No resources provided" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const conflictCheck = await client.query(
      `
      SELECT br.resource_id, b.*
      FROM booking_resources br
      JOIN bookings b ON b.id = br.booking_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      WHERE br.resource_id = ANY($1)
      AND b.date = $2
      AND b.id <> $5
      AND bc.booking_id IS NULL
      AND (
        ($3 >= b.start_time AND $3 < b.end_time) OR
        ($4 > b.start_time AND $4 <= b.end_time) OR
        ($3 <= b.start_time AND $4 >= b.end_time)
      )
    `,
      [resources, date, start_time, end_time, id]
    );

    if (conflictCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Resources conflict",
        conflicts: conflictCheck.rows
      });
    }

    const { rows: resourceRows } = await client.query(
      `
      SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
      FROM resources r
      JOIN resource_types rt ON rt.id = r.type_id
      WHERE r.id = ANY($1)
      `,
      [resources]
    );

    if (resourceRows.length !== resources.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "One or more resources not found" });
    }

    const { rows: ruleRows } = await client.query(
      `SELECT * FROM rules WHERE is_active = true ORDER BY sort_order ASC, id ASC`
    );

    const ruleEval = evaluateRules({
      rules: ruleRows,
      booking: {
        date,
        start_time,
        end_time,
        user_id,
      },
      resources: resourceRows,
      roles,
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
      UPDATE bookings
      SET user_id = $1, date = $2, start_time = $3, end_time = $4
      WHERE id = $5
      RETURNING *
      `,
      [user_id, date, start_time, end_time, id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    await client.query(`DELETE FROM booking_resources WHERE booking_id = $1`, [id]);

    for (const r of resources) {
      await client.query(
        `
        INSERT INTO booking_resources (booking_id, resource_id, role)
        VALUES ($1, $2, $3)
      `,
        [id, r, roles?.[r] || null]
      );
    }

    await client.query("COMMIT");

    res.json({
      message: "Booking updated",
      booking: bookingResult.rows[0],
      rule_summary: {
        score: ruleEval.score,
        soft_matches: ruleEval.softMatches,
        alerts: ruleEval.alerts,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Booking update error:", err);
    res.status(500).json({ error: "Booking update failed" });
  } finally {
    client.release();
  }
});

// DELETE booking
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid booking id" });

  try {
    const { rowCount } = await pool.query(`DELETE FROM bookings WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: "Booking not found" });
    res.status(204).send();
  } catch (err) {
    console.error("Booking delete error:", err);
    res.status(500).json({ error: "Booking delete failed" });
  }
});

export default router;
