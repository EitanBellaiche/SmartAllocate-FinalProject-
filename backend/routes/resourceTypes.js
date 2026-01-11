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
  await pool.query(`ALTER TABLE resource_types ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error("Failed to init resource_types table:", err);
    res.status(500).json({ error: "Resource types service unavailable" });
  }
});

router.get("/", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const params = [];
    let where = "";

    if (orgId) {
      params.push(orgId);
      where = "WHERE organization_id = $1";
    }

    const result = await pool.query(
      `SELECT * FROM resource_types ${where} ORDER BY id`,
      params
    );

    // Convert fields to JSON if they come as text
    const cleaned = result.rows.map((row) => ({
      ...row,
      fields: typeof row.fields === "string"
        ? JSON.parse(row.fields)
        : row.fields,
      roles: typeof row.roles === "string"
        ? JSON.parse(row.roles)
        : row.roles,
    }));

    res.json(cleaned);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post("/", async (req, res) => {
  const { name, description, fields, roles } = req.body;
  const orgId = getOrgId(req);

  const jsonFields = JSON.stringify(fields);
  const jsonRoles = JSON.stringify(roles ?? []);

  const result = await pool.query(
    `INSERT INTO resource_types (name, description, fields, roles, organization_id)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5) RETURNING *`,
    [name, description, jsonFields, jsonRoles, orgId]
  );

  res.json(result.rows[0]);
});

// UPDATE a resource type
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, fields, roles } = req.body;

  try {
    const orgId = getOrgId(req);
    const params = [
      name,
      description,
      JSON.stringify(fields),
      JSON.stringify(roles ?? []),
      id,
    ];
    let where = "WHERE id = $5";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $5 AND organization_id = $6";
    }

    const result = await pool.query(
      `UPDATE resource_types
       SET name = $1, description = $2, fields = $3::jsonb, roles = $4::jsonb
       ${where}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Type not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating resource type:", err);
    res.status(500).json({ error: err.message });
  }
});


// DELETE a resource type
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // optional: prevent deleting if related resources exist
    const orgId = getOrgId(req);
    const checkParams = [id];
    let checkWhere = "WHERE type_id = $1";
    if (orgId) {
      checkParams.push(orgId);
      checkWhere = "WHERE type_id = $1 AND organization_id = $2";
    }
    const check = await pool.query(
      `SELECT COUNT(*) FROM resources ${checkWhere}`,
      checkParams
    );

    if (Number(check.rows[0].count) > 0) {
      return res.status(400).json({
        error: "Cannot delete this resource type because resources use it."
      });
    }

    const params = [id];
    let where = "WHERE id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $1 AND organization_id = $2";
    }
    const result = await pool.query(
      `DELETE FROM resource_types ${where} RETURNING *`,
      params
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
