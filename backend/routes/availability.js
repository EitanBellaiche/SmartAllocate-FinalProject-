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
  await db.query(`ALTER TABLE availability ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error("Failed to init availability table:", err);
    res.status(500).json({ error: "Availability service unavailable" });
  }
});

/* ---------------------------------------------------
   GET ALL availability (list)
--------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const params = [];
    let where = "";
    if (orgId) {
      params.push(orgId);
      where = "WHERE r.organization_id = $1";
    }
    const result = await db.query(
      `SELECT 
          a.*,
          r.name AS resource_name
       FROM availability a
       JOIN resources r ON r.id = a.resource_id
       ${where}
       ORDER BY r.name, a.day_of_week, a.start_time`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ GET /availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   GET availability for a specific resource (calendar)
--------------------------------------------------- */
router.get("/resource/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const params = [req.params.id];
    let where = "WHERE a.resource_id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE a.resource_id = $1 AND r.organization_id = $2";
    }
    const result = await db.query(
      `SELECT * 
       FROM availability a
       JOIN resources r ON r.id = a.resource_id
       ${where}
       ORDER BY start_date, day_of_week, start_time`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ GET /availability/resource:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   POST single-day availability
--------------------------------------------------- */
router.post("/", async (req, res) => {
  const { resource_id, day_of_week, start_time, end_time } = req.body;
  const orgId = getOrgId(req);

  if (!resource_id || !day_of_week || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const result = await db.query(
      `INSERT INTO availability
         (resource_id, type, day_of_week, start_time, end_time, start_date, end_date, organization_id)
       VALUES ($1, 'single', $2, $3, $4, CURRENT_DATE, CURRENT_DATE, $5)
       RETURNING *`,
      [resource_id, day_of_week, start_time, end_time, orgId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ POST single availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   POST recurring availability
--------------------------------------------------- */
router.post("/recurring", async (req, res) => {
  const { resource_id, days, start_time, end_time, start_date, end_date } = req.body;
  const orgId = getOrgId(req);

  if (!resource_id || !days?.length || !start_time || !end_time || !start_date || !end_date) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const inserted = [];

    for (const day of days) {
      const result = await db.query(
        `INSERT INTO availability
           (resource_id, type, day_of_week, start_time, end_time, start_date, end_date, organization_id)
         VALUES ($1, 'recurring', $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [resource_id, day, start_time, end_time, start_date, end_date, orgId]
      );

      inserted.push(result.rows[0]);
    }

    res.json(inserted);
  } catch (err) {
    console.error("❌ POST recurring:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   DELETE availability
--------------------------------------------------- */
router.post("/delete", async (req, res) => {
  const { id } = req.body;
  const orgId = getOrgId(req);

  try {
    const params = [id];
    let where = "WHERE id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $1 AND organization_id = $2";
    }
    await db.query(`DELETE FROM availability ${where}`, params);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------
   UPDATE availability (edit)
--------------------------------------------------- */
router.post("/update", async (req, res) => {
  const { id, start_time, end_time } = req.body;
  const orgId = getOrgId(req);

  try {
    const params = [start_time, end_time, id];
    let where = "WHERE id = $3";
    if (orgId) {
      params.push(orgId);
      where = "WHERE id = $3 AND organization_id = $4";
    }
    await db.query(
      `UPDATE availability
       SET start_time=$1, end_time=$2
       ${where}`,
      params
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ UPDATE availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
