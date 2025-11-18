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

router.post("/", async (req, res) => {
  const { name, type_id, metadata } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO resources (name, type_id, metadata, active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [name, type_id, metadata]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Error creating resource:", err);
    res.status(500).json({ error: err.message });
  }
});


// DELETE a resource
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `DELETE FROM booking_resources WHERE resource_id = $1`,
      [id]
    );

    const result = await pool.query(
      `DELETE FROM resources WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Resource not found" });
    }

    res.json({ success: true, deleted: result.rows[0] });

  } catch (err) {
    console.error("Error deleting resource:", err);
    res.status(500).json({ error: err.message });
  }
});


export default router;
