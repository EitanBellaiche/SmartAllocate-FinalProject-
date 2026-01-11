import express from "express";
import pool from "../db.js";

const router = express.Router();
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      course_name TEXT,
      sender_name TEXT,
      target_user_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS course_name TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sender_name TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_user_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error("Failed to init announcements table:", err);
    res.status(500).json({ error: "Announcements service unavailable" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { user_id } = req.query;
    const params = [];
    let where = "";

    if (user_id) {
      params.push(String(user_id));
      where = "WHERE target_user_id IS NULL OR target_user_id = $1";
    }

    const { rows } = await pool.query(
      `
      SELECT id, title, message, course_name, sender_name, target_user_id, created_at
      FROM announcements
      ${where}
      ORDER BY created_at DESC, id DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching announcements:", err);
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

router.post("/", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const message = String(req.body?.message || "").trim();
  const courseName = String(req.body?.course_name || "").trim();
  const senderName = String(req.body?.sender_name || "Lecturer").trim();
  const targetUserIdRaw = String(req.body?.target_user_id || "").trim();
  const targetUserId = targetUserIdRaw || null;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO announcements (title, message, course_name, sender_name, target_user_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [title, message, courseName || null, senderName || null, targetUserId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error creating announcement:", err);
    res.status(500).json({ error: "Failed to create announcement" });
  }
});

export default router;
