import express from "express";
import pool from "../db.js";

const router = express.Router();

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

    /* 2. Create booking */
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
      booking
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Booking error:", err);
    res.status(500).json({ error: "Booking failed" });
  } finally {
    client.release();
  }
});

export default router;
