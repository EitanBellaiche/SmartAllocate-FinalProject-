import express from "express";
import pool from "../db.js";

const router = express.Router();

// GET all bookings
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bookings.*, 
              resources.name AS resource_name, 
              users.full_name AS user_name
       FROM bookings
       JOIN resources ON bookings.resource_id = resources.id
       JOIN users ON bookings.user_id = users.id
       ORDER BY date, start_time`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create booking (WITH CONFLICT + AVAILABILITY CHECK)
router.post("/", async (req, res) => {
  const { resource_id, user_id, date, start_time, end_time } = req.body;

  try {
    // 1) Availability window check
    const availability = await pool.query(
      `SELECT * FROM availability
       WHERE resource_id = $1
       AND day_of_week = TO_CHAR($2::date, 'dy')
       AND start_time <= $3
       AND end_time >= $4`,
      [resource_id, date, start_time, end_time]
    );

    if (availability.rows.length === 0) {
      return res.status(400).json({
        error: "This resource is not available during the requested time",
      });
    }

    // 2) Booking conflict
    const conflictCheck = await pool.query(
      `SELECT *
       FROM bookings
       WHERE resource_id = $1
       AND date = $2
       AND (
          ($3 >= start_time AND $3 < end_time) OR
          ($4 > start_time AND $4 <= end_time) OR
          ($3 <= start_time AND $4 >= end_time)
       )`,
      [resource_id, date, start_time, end_time]
    );

    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({
        error: "Time conflict – resource is already booked",
      });
    }

    // 3) Insert booking
    const result = await pool.query(
      `INSERT INTO bookings (resource_id, user_id, date, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [resource_id, user_id, date, start_time, end_time]
    );

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REJECT booking
router.put("/:id/reject", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "UPDATE bookings SET status = 'rejected' WHERE id = $1 RETURNING *",
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
