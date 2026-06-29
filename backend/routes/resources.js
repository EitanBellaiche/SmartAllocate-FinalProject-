import express from "express";
import pool from "../db.js";

const router = express.Router();
let tableReady = false;
let legacyAutoUserCountBackfilled = false;

function getOrgId(req) {
  const value =
    req.query?.org_id ||
    req.query?.organization_id ||
    req.body?.org_id ||
    req.body?.organization_id;
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function normalizeAssignedUserIds(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[\s,]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }

  return value;
}

function normalizeTypeFields(fields) {
  if (typeof fields === "string") {
    try {
      const parsed = JSON.parse(fields);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return Array.isArray(fields) ? fields : [];
}

function getAssignedUserIdsFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];

  if (Array.isArray(metadata.user_ids)) return metadata.user_ids;
  if (Array.isArray(metadata.userIds)) return metadata.userIds;

  return [];
}

function syncLegacyAssignedStudentsCount(metadata, assignedUserIds) {
  if (!Object.prototype.hasOwnProperty.call(metadata, "students_number")) return metadata;

  metadata.students_number =
    typeof metadata.students_number === "string"
      ? String(assignedUserIds.length)
      : assignedUserIds.length;

  return metadata;
}

function syncAutoAssignedUserCountFields(metadata, typeFields) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;

  const assignedUserIds = getAssignedUserIdsFromMetadata(metadata);
  const autoCountFields = normalizeTypeFields(typeFields).filter(
    (field) => field && typeof field === "object" && field.type === "number" && field.auto_user_count && field.name
  );

  if (autoCountFields.length === 0) {
    return syncLegacyAssignedStudentsCount(metadata, assignedUserIds);
  }

  for (const field of autoCountFields) {
    metadata[field.name] =
      typeof metadata[field.name] === "string"
        ? String(assignedUserIds.length)
        : assignedUserIds.length;
  }

  return metadata;
}

function normalizeResourceMetadata(rawMetadata, typeFields = []) {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    return rawMetadata ?? {};
  }

  const metadata = { ...rawMetadata };

  if (Object.prototype.hasOwnProperty.call(metadata, "user_ids")) {
    metadata.user_ids = normalizeAssignedUserIds(metadata.user_ids);
  }

  if (Object.prototype.hasOwnProperty.call(metadata, "userIds")) {
    metadata.userIds = normalizeAssignedUserIds(metadata.userIds);
  }

  return syncAutoAssignedUserCountFields(metadata, typeFields);
}

async function getResourceTypeFields(typeId, orgId) {
  const numericTypeId = Number(typeId);
  if (!Number.isFinite(numericTypeId)) return [];

  const params = [numericTypeId];
  let where = "WHERE id = $1";
  if (orgId) {
    params.push(orgId);
    where = "WHERE id = $1 AND organization_id = $2";
  }

  const result = await pool.query(
    `SELECT fields FROM resource_types ${where} LIMIT 1`,
    params
  );

  if (result.rows.length === 0) return [];

  return normalizeTypeFields(result.rows[0].fields);
}

function hasLegacyStudentsNumberField(typeFields) {
  return normalizeTypeFields(typeFields).some(
    (field) =>
      field &&
      typeof field === "object" &&
      field.name === "students_number" &&
      field.type === "number"
  );
}

function enableLegacyStudentsNumberAutoCount(typeFields) {
  let changed = false;
  const nextFields = normalizeTypeFields(typeFields).map((field) => {
    if (
      field &&
      typeof field === "object" &&
      field.name === "students_number" &&
      field.type === "number" &&
      !field.auto_user_count
    ) {
      changed = true;
      return { ...field, auto_user_count: true };
    }
    return field;
  });

  return { changed, fields: nextFields };
}

async function backfillLegacyAutoUserCountData() {
  if (legacyAutoUserCountBackfilled) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: typeRows } = await client.query(
      `SELECT id, fields FROM resource_types ORDER BY id`
    );

    const eligibleTypes = [];

    for (const row of typeRows) {
      if (!hasLegacyStudentsNumberField(row.fields)) continue;

      const updated = enableLegacyStudentsNumberAutoCount(row.fields);
      if (updated.changed) {
        await client.query(
          `UPDATE resource_types SET fields = $1::jsonb WHERE id = $2`,
          [JSON.stringify(updated.fields), row.id]
        );
      }

      eligibleTypes.push({
        id: row.id,
        fields: updated.fields,
      });
    }

    for (const type of eligibleTypes) {
      const { rows: resourceRows } = await client.query(
        `SELECT id, metadata FROM resources WHERE type_id = $1`,
        [type.id]
      );

      for (const resource of resourceRows) {
        const normalizedMetadata = normalizeResourceMetadata(resource.metadata, type.fields);
        if (JSON.stringify(normalizedMetadata) === JSON.stringify(resource.metadata || {})) {
          continue;
        }

        await client.query(
          `UPDATE resources SET metadata = $1 WHERE id = $2`,
          [normalizedMetadata, resource.id]
        );
      }
    }

    await client.query("COMMIT");
    legacyAutoUserCountBackfilled = true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function ensureTable() {
  if (tableReady) return;
  await pool.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  await backfillLegacyAutoUserCountData();
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

    query += ` ORDER BY LOWER(resources.name), resources.id`;

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
    const typeFields = await getResourceTypeFields(type_id, orgId);
    const normalizedMetadata = normalizeResourceMetadata(metadata, typeFields);
    const result = await pool.query(
      `INSERT INTO resources (name, type_id, metadata, active, organization_id)
       VALUES ($1, $2, $3, true, $4)
       RETURNING *`,
      [name, type_id, normalizedMetadata, orgId]
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
    const typeFields = await getResourceTypeFields(type_id, orgId);
    const normalizedMetadata = normalizeResourceMetadata(metadata, typeFields);
    const params = [name, type_id, normalizedMetadata, id];
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
