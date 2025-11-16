const express = require("express");
const router = express.Router();
const pool = require("../db");

// get availability for a specific resource
router.get("/:resource_id", async (req, res) => {
  const { resource_id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM availability WHERE resource_id = $1 ORDER BY day_of_week, start_time",
      [resource_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// create availability entry
router.post("/", async (req, res) => {
  const { resource_id, day_of_week, start_time, end_time } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO availability (resource_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING *",
      [resource_id, day_of_week, start_time, end_time]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
