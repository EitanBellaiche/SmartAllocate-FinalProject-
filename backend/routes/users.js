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

function normalizeNationalIds(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
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
      department TEXT,
      organization_id TEXT,
      password TEXT
    )
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT`);
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
      SELECT id, full_name, email, role, national_id, department, organization_id
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

router.post("/bulk-lookup", async (req, res) => {
  const orgId = getOrgId(req);
  const nationalIds = normalizeNationalIds(req.body?.national_ids);

  if (nationalIds.length === 0) {
    return res.status(400).json({ error: "national_ids array is required" });
  }

  try {
    const params = [nationalIds];
    let where = "WHERE national_id = ANY($1)";
    if (orgId) {
      params.push(orgId);
      where += ` AND organization_id = $2`;
    }

    const result = await pool.query(
      `
      SELECT id, full_name, email, role, national_id, department, organization_id
      FROM users
      ${where}
      ORDER BY id
      `,
      params
    );

    const matchedUsers = result.rows;
    const foundIds = new Set(
      matchedUsers
        .map((user) => String(user?.national_id || "").trim())
        .filter(Boolean)
    );
    const missingNationalIds = nationalIds.filter((nationalId) => !foundIds.has(nationalId));

    res.json({
      matched_users: matchedUsers,
      missing_national_ids: missingNationalIds,
      requested_count: nationalIds.length,
      matched_count: matchedUsers.length,
    });
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
      SELECT id, full_name, email, role, national_id, department, organization_id, password
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
    const { role, q, department } = req.query;
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
    if (department) {
      params.push(String(department));
      conditions.push(`department = $${params.length}`);
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
      SELECT id, full_name, email, role, national_id, department, organization_id
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
  const { full_name, email, role, national_id, department, organization_id, password } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO users (full_name, email, role, national_id, department, organization_id, password) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [
        full_name,
        email,
        role,
        national_id || null,
        department || null,
        organization_id || null,
        password || null,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE existing user
router.put("/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const orgId = getOrgId(req);

  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const existingParams = [userId];
    let where = "WHERE id = $1";
    if (orgId) {
      existingParams.push(orgId);
      where += ` AND organization_id = $2`;
    }

    const existingResult = await pool.query(
      `
      SELECT id, full_name, email, role, national_id, department, organization_id, password
      FROM users
      ${where}
      LIMIT 1
      `,
      existingParams
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const existing = existingResult.rows[0];
    const nextOrganizationId =
      req.body?.organization_id !== undefined
        ? String(req.body.organization_id || "").trim() || null
        : existing.organization_id || null;

    if (orgId && nextOrganizationId && nextOrganizationId !== orgId) {
      return res.status(400).json({ error: "Cannot move user to a different organization" });
    }

    const nextPassword =
      req.body?.password !== undefined && String(req.body.password || "").trim() !== ""
        ? String(req.body.password)
        : existing.password;

    const result = await pool.query(
      `
      UPDATE users
      SET
        full_name = $2,
        email = $3,
        role = $4,
        national_id = $5,
        department = $6,
        organization_id = $7,
        password = $8
      WHERE id = $1
      RETURNING id, full_name, email, role, national_id, department, organization_id
      `,
      [
        userId,
        req.body?.full_name !== undefined ? String(req.body.full_name || "").trim() || null : existing.full_name,
        req.body?.email !== undefined ? String(req.body.email || "").trim() || null : existing.email,
        req.body?.role !== undefined ? String(req.body.role || "").trim() || null : existing.role,
        req.body?.national_id !== undefined
          ? String(req.body.national_id || "").trim() || null
          : existing.national_id,
        req.body?.department !== undefined
          ? String(req.body.department || "").trim() || null
          : existing.department,
        nextOrganizationId,
        nextPassword,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
