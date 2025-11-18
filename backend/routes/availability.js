import express from "express";
import db from "../db.js";

const router = express.Router();

// DEBUG LOG
console.log("➡ availability.js REAL PATH:", import.meta.url);

// GET all availability
router.get("/", async (req, res) => {
  console.log("📡 HIT: GET /api/availability");

  try {
    const result = await db.query(
      `SELECT a.id, a.day_of_week, a.start_time, a.end_time,
              r.name AS resource_name
       FROM availability a
       JOIN resources r ON a.resource_id = r.id
       ORDER BY a.id ASC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE
router.post("/", async (req, res) => {
  const { resource_id, day_of_week, start_time, end_time } = req.body;

  if (!resource_id || !day_of_week || !start_time || !end_time)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const result = await db.query(
      `INSERT INTO availability (resource_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [resource_id, day_of_week, start_time, end_time]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM availability WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error deleting availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ⬅️⬅️⬅️ הדבר שהיה חסר!!
export default router;
