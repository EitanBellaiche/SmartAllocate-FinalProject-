import express from "express";
import pool from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM resource_types ORDER BY id");

    // Convert fields to JSON if they come as text
    const cleaned = result.rows.map((row) => ({
      ...row,
      fields: typeof row.fields === "string"
        ? JSON.parse(row.fields)
        : row.fields,
    }));

    res.json(cleaned);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post("/", async (req, res) => {
  const { name, description, fields } = req.body;

  const jsonFields = JSON.stringify(fields);

  const result = await pool.query(
    `INSERT INTO resource_types (name, description, fields)
     VALUES ($1, $2, $3::jsonb) RETURNING *`,
    [name, description, jsonFields]
  );

  res.json(result.rows[0]);
});



// DELETE a resource type
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // optional: prevent deleting if related resources exist
    const check = await pool.query(
      `SELECT COUNT(*) FROM resources WHERE type_id = $1`,
      [id]
    );

    if (Number(check.rows[0].count) > 0) {
      return res.status(400).json({
        error: "Cannot delete this resource type because resources use it."
      });
    }

    const result = await pool.query(
      `DELETE FROM resource_types WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Type not found" });
    }

    res.json({ success: true, deleted: result.rows[0] });

  } catch (err) {
    console.error("Error deleting resource type:", err);
    res.status(500).json({ error: err.message });
  }
});


export default router;
