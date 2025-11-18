import express from "express";
import pool from "../db.js";

const router = express.Router();

// GET all users
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new user
router.post("/", async (req, res) => {
  const { full_name, email, role } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO users (full_name, email, role) VALUES ($1, $2, $3) RETURNING *",
      [full_name, email, role]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
