import express from "express";
import pool from "../db.js";

const router = express.Router();
let tableReady = false;

function getOrgId(req) {
  const value =
    req.query?.org_id ||
    req.query?.organization_id ||
    req.body?.org_id ||
    req.body?.organization_id;
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_availability (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      start_date DATE,
      end_date DATE,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE user_availability ADD COLUMN IF NOT EXISTS start_date DATE`);
  await pool.query(`ALTER TABLE user_availability ADD COLUMN IF NOT EXISTS end_date DATE`);
  await pool.query(`ALTER TABLE user_availability ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_availability_overrides (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      is_available BOOLEAN NOT NULL DEFAULT false,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE user_availability_overrides ADD COLUMN IF NOT EXISTS start_time TIME`);
  await pool.query(`ALTER TABLE user_availability_overrides ADD COLUMN IF NOT EXISTS end_time TIME`);
  await pool.query(`ALTER TABLE user_availability_overrides ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE user_availability_overrides ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error("Failed to init user_availability table:", err);
    res.status(500).json({ error: "User availability service unavailable" });
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = String(req.query?.user_id || "").trim();
    const orgId = getOrgId(req);
    const params = [];
    const conditions = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }
    if (orgId) {
      params.push(orgId);
      conditions.push(`organization_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `
      SELECT *
      FROM user_availability
      ${where}
      ORDER BY user_id, day_of_week, start_time
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching user availability:", err);
    res.status(500).json({ error: "Failed to fetch availability" });
  }
});

router.post("/", async (req, res) => {
  const userId = String(req.body?.user_id || "").trim();
  const dayOfWeek = Number(req.body?.day_of_week);
  const startTime = String(req.body?.start_time || "").trim();
  const endTime = String(req.body?.end_time || "").trim();
  const startDate = req.body?.start_date ? String(req.body.start_date).trim() : "";
  const endDate = req.body?.end_date ? String(req.body.end_date).trim() : "";
  const orgId = getOrgId(req);

  if (!userId || !Number.isFinite(dayOfWeek) || !startTime || !endTime) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO user_availability
        (user_id, day_of_week, start_time, end_time, start_date, end_date, organization_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [userId, dayOfWeek, startTime, endTime, startDate || null, endDate || null, orgId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating user availability:", err);
    res.status(500).json({ error: "Failed to create availability" });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const userId = String(req.body?.user_id || "").trim();
  const dayOfWeek = Number(req.body?.day_of_week);
  const startTime = String(req.body?.start_time || "").trim();
  const endTime = String(req.body?.end_time || "").trim();
  const startDate = req.body?.start_date ? String(req.body.start_date).trim() : "";
  const endDate = req.body?.end_date ? String(req.body.end_date).trim() : "";
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid availability id" });
  if (!userId || !Number.isFinite(dayOfWeek) || !startTime || !endTime) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  try {
    const params = [userId, dayOfWeek, startTime, endTime, startDate || null, endDate || null, id];
    let where = "WHERE id = $7";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $7 AND organization_id = $8";
    }
    const result = await pool.query(
      `
      UPDATE user_availability
      SET user_id = $1, day_of_week = $2, start_time = $3, end_time = $4, start_date = $5, end_date = $6
      ${where}
      RETURNING *
      `,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Availability not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating user availability:", err);
    res.status(500).json({ error: "Failed to update availability" });
  }
});

router.get("/overrides", async (req, res) => {
  try {
    const userId = String(req.query?.user_id || "").trim();
    const orgId = getOrgId(req);
    const params = [];
    const conditions = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }
    if (orgId) {
      params.push(orgId);
      conditions.push(`organization_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `
      SELECT *
      FROM user_availability_overrides
      ${where}
      ORDER BY user_id, date, start_time NULLS FIRST
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching user availability overrides:", err);
    res.status(500).json({ error: "Failed to fetch availability overrides" });
  }
});

router.post("/overrides", async (req, res) => {
  const userId = String(req.body?.user_id || "").trim();
  const date = String(req.body?.date || "").trim();
  const startTime = req.body?.start_time ? String(req.body.start_time).trim() : "";
  const endTime = req.body?.end_time ? String(req.body.end_time).trim() : "";
  const isAvailable = Boolean(req.body?.is_available);
  const orgId = getOrgId(req);

  if (!userId || !date) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if ((startTime && !endTime) || (!startTime && endTime)) {
    return res.status(400).json({ error: "Start and end time must both be provided" });
  }
  if (startTime && endTime && startTime >= endTime) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO user_availability_overrides
        (user_id, date, start_time, end_time, is_available, organization_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [userId, date, startTime || null, endTime || null, isAvailable, orgId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating user availability override:", err);
    res.status(500).json({ error: "Failed to create availability override" });
  }
});

router.put("/overrides/:id", async (req, res) => {
  const id = Number(req.params.id);
  const userId = String(req.body?.user_id || "").trim();
  const date = String(req.body?.date || "").trim();
  const startTime = req.body?.start_time ? String(req.body.start_time).trim() : "";
  const endTime = req.body?.end_time ? String(req.body.end_time).trim() : "";
  const isAvailable = Boolean(req.body?.is_available);
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid override id" });
  if (!userId || !date) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if ((startTime && !endTime) || (!startTime && endTime)) {
    return res.status(400).json({ error: "Start and end time must both be provided" });
  }
  if (startTime && endTime && startTime >= endTime) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  try {
    const params = [userId, date, startTime || null, endTime || null, isAvailable, id];
    let where = "WHERE id = $6";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $6 AND organization_id = $7";
    }
    const result = await pool.query(
      `
      UPDATE user_availability_overrides
      SET user_id = $1, date = $2, start_time = $3, end_time = $4, is_available = $5
      ${where}
      RETURNING *
      `,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Availability override not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating user availability override:", err);
    res.status(500).json({ error: "Failed to update availability override" });
  }
});

router.delete("/overrides/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid override id" });
  }
  const orgId = getOrgId(req);

  try {
    const params = [id];
    let where = "WHERE id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $1 AND organization_id = $2";
    }
    const result = await pool.query(
      `DELETE FROM user_availability_overrides ${where} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Availability override not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting user availability override:", err);
    res.status(500).json({ error: "Failed to delete availability override" });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid availability id" });
  }
  const orgId = getOrgId(req);

  try {
    const params = [id];
    let where = "WHERE id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $1 AND organization_id = $2";
    }
    const result = await pool.query(`DELETE FROM user_availability ${where} RETURNING *`, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Availability not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting user availability:", err);
    res.status(500).json({ error: "Failed to delete availability" });
  }
});

export default router;
