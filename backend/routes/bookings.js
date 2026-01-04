import express from "express";
import pool from "../db.js";
import { evaluateRules } from "../rulesEngine.js";

const router = express.Router();

// GET bookings (optional filter by resource_id)
router.get("/", async (req, res) => {
  try {
    const { resource_id } = req.query;
    const params = [];
    let where = "";

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
        json_agg(
          json_build_object(
            'id', r.id,
            'name', r.name,
            'type_id', r.type_id,
            'role', br.role
          )
          ORDER BY r.id
        ) AS resources
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      ${where}
      GROUP BY b.id
      ORDER BY b.date ASC, b.start_time ASC, b.id ASC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error getting bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
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
      WHERE br.resource_id = ANY($1)
      AND b.date = $2
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
      WHERE br.resource_id = ANY($1)
      AND b.date = $2
      AND b.id <> $5
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
