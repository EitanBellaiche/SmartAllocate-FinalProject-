import express from "express";
import db from "../db.js";

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
  await db.query(`ALTER TABLE rules ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error("Failed to init rules table:", err);
    res.status(500).json({ error: "Rules service unavailable" });
  }
});

// GET all rules
router.get("/", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const params = [];
    let where = "";
    if (orgId) {
      params.push(orgId);
      where = "WHERE organization_id = $1";
    }
    const { rows } = await db.query(
      `SELECT id, name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, created_at
       FROM rules
       ${where}
       ORDER BY is_active DESC, sort_order ASC, id ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/rules error:", err);
    res.status(500).json({ error: "Failed to fetch rules" });
  }
});

// CREATE
router.post("/", async (req, res) => {
  try {
    const {
      name,
      description = "",
      target_type = "pair",
      is_hard = false,
      is_active = true,
      weight = 0,
      sort_order = 0,
      condition = {},
      action = {},
    } = req.body ?? {};

    if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
    if (!["resource", "booking", "pair"].includes(target_type)) return res.status(400).json({ error: "invalid target_type" });
    if (typeof is_hard !== "boolean") return res.status(400).json({ error: "is_hard must be boolean" });
    if (typeof is_active !== "boolean") return res.status(400).json({ error: "is_active must be boolean" });
    if (!Number.isFinite(Number(weight))) return res.status(400).json({ error: "weight must be number" });
    if (!Number.isFinite(Number(sort_order))) return res.status(400).json({ error: "sort_order must be number" });
    if (typeof condition !== "object" || condition === null) return res.status(400).json({ error: "condition must be json" });
    if (typeof action !== "object" || action === null) return res.status(400).json({ error: "action must be json" });

    const orgId = getOrgId(req);
    const { rows } = await db.query(
      `INSERT INTO rules (name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
       RETURNING id, name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, created_at`,
      [
        name,
        description,
        target_type,
        is_hard,
        is_active,
        Number(weight),
        Number(sort_order),
        condition,
        action,
        orgId,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /api/rules error:", err);
    res.status(500).json({ error: "Failed to create rule" });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

    const {
      name,
      description = "",
      target_type,
      is_hard,
      is_active,
      weight,
      sort_order,
      condition,
      action,
    } = req.body ?? {};

    if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
    if (!["resource", "booking", "pair"].includes(target_type)) return res.status(400).json({ error: "invalid target_type" });
    if (typeof is_hard !== "boolean") return res.status(400).json({ error: "is_hard must be boolean" });
    if (typeof is_active !== "boolean") return res.status(400).json({ error: "is_active must be boolean" });
    if (!Number.isFinite(Number(weight))) return res.status(400).json({ error: "weight must be number" });
    if (!Number.isFinite(Number(sort_order))) return res.status(400).json({ error: "sort_order must be number" });
    if (typeof condition !== "object" || condition === null) return res.status(400).json({ error: "condition must be json" });
    if (typeof action !== "object" || action === null) return res.status(400).json({ error: "action must be json" });

    const orgId = getOrgId(req);
    const params = [
      name,
      description,
      target_type,
      is_hard,
      is_active,
      Number(weight),
      Number(sort_order),
      condition,
      action,
      id,
    ];
    let where = "WHERE id=$10";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id=$10 AND organization_id=$11";
    }
    const { rows } = await db.query(
      `UPDATE rules
       SET name=$1, description=$2, target_type=$3, is_hard=$4, is_active=$5, weight=$6, sort_order=$7,
           condition=$8::jsonb, action=$9::jsonb
       ${where}
       RETURNING id, name, description, target_type, is_hard, is_active, weight, sort_order, condition, action, created_at`,
      params
    );

    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /api/rules/:id error:", err);
    res.status(500).json({ error: "Failed to update rule" });
  }
});

// TOGGLE active
router.patch("/:id/active", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { is_active } = req.body ?? {};
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    if (typeof is_active !== "boolean") return res.status(400).json({ error: "is_active must be boolean" });

    const orgId = getOrgId(req);
    const params = [is_active, id];
    let where = "WHERE id=$2";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id=$2 AND organization_id=$3";
    }
    const { rows } = await db.query(
      `UPDATE rules SET is_active=$1 ${where} RETURNING id, is_active`,
      params
    );

    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/rules/:id/active error:", err);
    res.status(500).json({ error: "Failed to toggle is_active" });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

    const orgId = getOrgId(req);
    const params = [id];
    let where = "WHERE id=$1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id=$1 AND organization_id=$2";
    }
    const { rowCount } = await db.query(`DELETE FROM rules ${where}`, params);
    if (!rowCount) return res.status(404).json({ error: "not found" });

    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/rules/:id error:", err);
    res.status(500).json({ error: "Failed to delete rule" });
  }
});

export default router;
