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

async function ensureUsersTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT,
      email TEXT,
      role TEXT,
      national_id TEXT,
      organization_id TEXT,
      password TEXT
    )
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureUsersTable();
    next();
  } catch (err) {
    console.error("Failed to init users table:", err);
    res.status(500).json({ error: "Users service unavailable" });
  }
});

// LOOKUP user by national id / id
router.get("/lookup", async (req, res) => {
  const rawId = String(req.query.national_id || req.query.id || "").trim();
  if (!rawId) {
    return res.status(400).json({ error: "national_id is required" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, full_name, email, role, national_id, organization_id
      FROM users
      WHERE national_id = $1 OR id::text = $1
      LIMIT 1
      `,
      [rawId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN user by national id + password
router.post("/login", async (req, res) => {
  const nationalId = String(req.body?.national_id || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!nationalId || !password) {
    return res.status(400).json({ error: "national_id and password are required" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, full_name, email, role, national_id, organization_id, password
      FROM users
      WHERE national_id = $1
      LIMIT 1
      `,
      [nationalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    if (String(user.password || "") !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { password: _pw, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all users
router.get("/", async (req, res) => {
  try {
    const { role, q } = req.query;
    const orgId = getOrgId(req);
    const params = [];
    const conditions = [];

    if (role) {
      params.push(String(role));
      conditions.push(`role = $${params.length}`);
    }
    if (orgId) {
      params.push(orgId);
      conditions.push(`organization_id = $${params.length}`);
    }
    const search = String(q || "").trim();
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(
        `(LOWER(full_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR national_id LIKE $${params.length})`
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `
      SELECT id, full_name, email, role, national_id, organization_id
      FROM users
      ${where}
      ORDER BY id
      `,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new user
router.post("/", async (req, res) => {
  const { full_name, email, role, national_id, organization_id, password } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO users (full_name, email, role, national_id, organization_id, password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [full_name, email, role, national_id || null, organization_id || null, password || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
