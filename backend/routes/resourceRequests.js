import express from "express";
import pool from "../db.js";

const router = express.Router();
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resource_requests (
      id SERIAL PRIMARY KEY,
      resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
      student_id TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error("Failed to init resource_requests table:", err);
    res.status(500).json({ error: "Request service unavailable" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";

    if (status) {
      params.push(String(status));
      where = "WHERE rr.status = $1";
    }

    const { rows } = await pool.query(
      `
      SELECT
        rr.id,
        rr.resource_id,
        rr.student_id,
        rr.note,
        rr.status,
        rr.created_at,
        r.name AS resource_name,
        rt.name AS resource_type
      FROM resource_requests rr
      LEFT JOIN resources r ON r.id = rr.resource_id
      LEFT JOIN resource_types rt ON rt.id = r.type_id
      ${where}
      ORDER BY rr.created_at DESC, rr.id DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching resource requests:", err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

router.post("/", async (req, res) => {
  const resourceId = Number(req.body?.resource_id);
  const studentId = String(req.body?.student_id || "").trim();
  const note = String(req.body?.note || "").trim();

  if (!Number.isFinite(resourceId)) {
    return res.status(400).json({ error: "Invalid resource_id" });
  }
  if (!studentId) {
    return res.status(400).json({ error: "Student ID is required" });
  }
  if (!note) {
    return res.status(400).json({ error: "Request note is required" });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO resource_requests (resource_id, student_id, note)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [resourceId, studentId, note]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error creating resource request:", err);
    res.status(500).json({ error: "Failed to create request" });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "").trim();

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid request id" });
  }
  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE resource_requests
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating request:", err);
    res.status(500).json({ error: "Failed to update request" });
  }
});

export default router;
