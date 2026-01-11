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
  await pool.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error("Failed to init resources table:", err);
    res.status(500).json({ error: "Resources service unavailable" });
  }
});

// ✅ GET resources (supports optional filter: ?type_id=1)
router.get("/", async (req, res) => {
  try {
    const { type_id } = req.query;
    const orgId = getOrgId(req);

    let query = `
      SELECT resources.*, resource_types.name AS type_name
      FROM resources
      JOIN resource_types ON resources.type_id = resource_types.id
    `;
    const params = [];
    const conditions = [];

    if (type_id) {
      params.push(Number(type_id));
      conditions.push(`resources.type_id = $${params.length}`);
    }

    if (orgId) {
      params.push(orgId);
      conditions.push(`resources.organization_id = $${params.length}`);
    }

    if (conditions.length) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY resources.id`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error getting resources:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: GET one resource by id  (/api/resources/:id)
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid resource id" });
  const orgId = getOrgId(req);

  try {
    const params = [id];
    let where = "WHERE resources.id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE resources.id = $1 AND resources.organization_id = $2";
    }
    const result = await pool.query(
      `
      SELECT resources.*, resource_types.name AS type_name
      FROM resources
      JOIN resource_types ON resources.type_id = resource_types.id
      ${where}
      LIMIT 1
      `,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Resource not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error getting resource by id:", err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE resource
router.post("/", async (req, res) => {
  const { name, type_id, metadata } = req.body;
  const orgId = getOrgId(req);

  try {
    const result = await pool.query(
      `INSERT INTO resources (name, type_id, metadata, active, organization_id)
       VALUES ($1, $2, $3, true, $4)
       RETURNING *`,
      [name, type_id, metadata, orgId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error creating resource:", err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE resource
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, type_id, metadata } = req.body;
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid resource id" });
  }

  try {
    const params = [name, type_id, metadata, id];
    let where = "WHERE id = $4";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $4 AND organization_id = $5";
    }
    const updateResult = await pool.query(
      `UPDATE resources
       SET name = $1, type_id = $2, metadata = $3
       ${where}
       RETURNING *`,
      params
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: "Resource not found" });
    }

    const resource = updateResult.rows[0];
    const withTypeParams = [resource.id];
    let withTypeWhere = "WHERE resources.id = $1";
    if (orgId) {
      withTypeParams.push(orgId);
      withTypeWhere = "WHERE resources.id = $1 AND resources.organization_id = $2";
    }
    const withType = await pool.query(
      `
      SELECT resources.*, resource_types.name AS type_name
      FROM resources
      JOIN resource_types ON resources.type_id = resource_types.id
      ${withTypeWhere}
      LIMIT 1
      `,
      withTypeParams
    );

    res.json(withType.rows[0] || resource);
  } catch (err) {
    console.error("Error updating resource:", err);
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
