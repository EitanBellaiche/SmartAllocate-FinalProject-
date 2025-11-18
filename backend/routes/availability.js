import express from "express";
import db from "../db.js";

const router = express.Router();

/* ---------------------------------------------------
   GET ALL availability (list)
--------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
          a.*,
          r.name AS resource_name
       FROM availability a
       JOIN resources r ON r.id = a.resource_id
       ORDER BY r.name, a.day_of_week, a.start_time`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ GET /availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   GET availability for a specific resource (calendar)
--------------------------------------------------- */
router.get("/resource/:id", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * 
       FROM availability
       WHERE resource_id = $1
       ORDER BY start_date, day_of_week, start_time`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ GET /availability/resource:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   POST single-day availability
--------------------------------------------------- */
router.post("/", async (req, res) => {
  const { resource_id, day_of_week, start_time, end_time } = req.body;

  if (!resource_id || !day_of_week || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const result = await db.query(
      `INSERT INTO availability
         (resource_id, type, day_of_week, start_time, end_time, start_date, end_date)
       VALUES ($1, 'single', $2, $3, $4, CURRENT_DATE, CURRENT_DATE)
       RETURNING *`,
      [resource_id, day_of_week, start_time, end_time]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ POST single availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   POST recurring availability
--------------------------------------------------- */
router.post("/recurring", async (req, res) => {
  const { resource_id, days, start_time, end_time, start_date, end_date } = req.body;

  if (!resource_id || !days?.length || !start_time || !end_time || !start_date || !end_date) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const inserted = [];

    for (const day of days) {
      const result = await db.query(
        `INSERT INTO availability
           (resource_id, type, day_of_week, start_time, end_time, start_date, end_date)
         VALUES ($1, 'recurring', $2, $3, $4, $5, $6)
         RETURNING *`,
        [resource_id, day, start_time, end_time, start_date, end_date]
      );

      inserted.push(result.rows[0]);
    }

    res.json(inserted);
  } catch (err) {
    console.error("❌ POST recurring:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   DELETE availability
--------------------------------------------------- */
router.post("/delete", async (req, res) => {
  const { id } = req.body;

  try {
    await db.query(`DELETE FROM availability WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   UPDATE availability (edit)
--------------------------------------------------- */
router.post("/update", async (req, res) => {
  const { id, start_time, end_time } = req.body;

  try {
    await db.query(
      `UPDATE availability
       SET start_time=$1, end_time=$2
       WHERE id=$3`,
      [start_time, end_time, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ UPDATE availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
