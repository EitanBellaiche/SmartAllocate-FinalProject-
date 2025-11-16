const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET all resource types
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM resource_types ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new resource type
router.post("/", async (req, res) => {
  const { name, description } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO resource_types (name, description) VALUES ($1, $2) RETURNING *",
      [name, description]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
