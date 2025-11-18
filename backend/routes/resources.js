import express from "express";
import pool from "../db.js";

const router = express.Router();

// GET all resources
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT resources.*, resource_types.name AS type_name
       FROM resources
       JOIN resource_types ON resources.type_id = resource_types.id
       ORDER BY resources.id`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error getting resources:", err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE a new resource
router.post("/", async (req, res) => {
  const { name, type_id, capacity, metadata } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO resources (name, type_id, capacity, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, type_id, capacity, metadata]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error creating resource:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
