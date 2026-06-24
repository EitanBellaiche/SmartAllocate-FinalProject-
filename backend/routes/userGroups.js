import express from "express";
import pool from "../db.js";

const router = express.Router();
let tablesReady = false;

function getOrgId(req) {
  const value =
    req.query?.org_id ||
    req.query?.organization_id ||
    req.body?.org_id ||
    req.body?.organization_id;
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

async function ensureTables() {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      organization_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(group_id, user_id)
    )
  `);
  await pool.query(`ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  await pool.query(`ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_groups_org_name ON user_groups (organization_id, name)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_group_members_group ON user_group_members (group_id)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_group_members_user ON user_group_members (user_id)`
  );
  tablesReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTables();
    next();
  } catch (err) {
    console.error("Failed to init user groups tables:", err);
    res.status(500).json({ error: "User groups service unavailable" });
  }
});

function normalizeMemberUserIds(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    )
  );
}

async function getGroupById(client, groupId, orgId) {
  const params = [groupId];
  let where = "WHERE g.id = $1";
  if (orgId) {
    params.push(orgId);
    where += ` AND g.organization_id = $2`;
  }
  const { rows } = await client.query(
    `
    SELECT
      g.id,
      g.name,
      g.description,
      g.organization_id,
      g.created_at,
      g.updated_at,
      COUNT(u.id)::int AS member_count,
      COALESCE(
        json_agg(
          json_build_object(
            'id', u.id,
            'full_name', u.full_name,
            'email', u.email,
            'role', u.role,
            'national_id', u.national_id,
            'department', u.department,
            'organization_id', u.organization_id
          )
          ORDER BY COALESCE(NULLIF(u.full_name, ''), NULLIF(u.email, ''), NULLIF(u.national_id, ''), u.id::text)
        ) FILTER (WHERE u.id IS NOT NULL),
        '[]'::json
      ) AS members
    FROM user_groups g
    LEFT JOIN user_group_members gm ON gm.group_id = g.id
    LEFT JOIN users u ON u.id = gm.user_id
    ${where}
    GROUP BY g.id
    LIMIT 1
    `,
    params
  );
  return rows[0] || null;
}

router.get("/", async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const params = [];
    const conditions = [];
    if (orgId) {
      params.push(orgId);
      conditions.push(`g.organization_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `
      SELECT
        g.id,
        g.name,
        g.description,
        g.organization_id,
        g.created_at,
        g.updated_at,
        COUNT(u.id)::int AS member_count,
        COALESCE(
          json_agg(
            json_build_object(
              'id', u.id,
              'full_name', u.full_name,
              'email', u.email,
              'role', u.role,
              'national_id', u.national_id,
              'department', u.department,
              'organization_id', u.organization_id
            )
            ORDER BY COALESCE(NULLIF(u.full_name, ''), NULLIF(u.email, ''), NULLIF(u.national_id, ''), u.id::text)
          ) FILTER (WHERE u.id IS NOT NULL),
          '[]'::json
        ) AS members
      FROM user_groups g
      LEFT JOIN user_group_members gm ON gm.group_id = g.id
      LEFT JOIN users u ON u.id = gm.user_id
      ${where}
      GROUP BY g.id
      ORDER BY LOWER(g.name) ASC, g.id ASC
      `,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  const orgId = getOrgId(req);
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Group name is required" });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO user_groups (name, description, organization_id)
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [name, description || null, orgId]
    );
    const group = await getGroupById(pool, rows[0].id, orgId);
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  const groupId = Number(req.params.id);
  const orgId = getOrgId(req);
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();

  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: "Invalid group id" });
  }
  if (!name) {
    return res.status(400).json({ error: "Group name is required" });
  }

  try {
    const existing = await getGroupById(pool, groupId, orgId);
    if (!existing) {
      return res.status(404).json({ error: "Group not found" });
    }

    await pool.query(
      `
      UPDATE user_groups
      SET name = $2,
          description = $3,
          updated_at = NOW()
      WHERE id = $1
      `,
      [groupId, name, description || null]
    );

    const group = await getGroupById(pool, groupId, orgId);
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id/members", async (req, res) => {
  const groupId = Number(req.params.id);
  const orgId = getOrgId(req);
  const memberUserIds = normalizeMemberUserIds(req.body?.user_ids);

  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: "Invalid group id" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await getGroupById(client, groupId, orgId);
    if (!existing) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Group not found" });
    }

    if (memberUserIds.length > 0) {
      const params = [memberUserIds];
      let where = "WHERE id = ANY($1)";
      if (orgId) {
        params.push(orgId);
        where += ` AND organization_id = $2`;
      }
      const { rows } = await client.query(
        `
        SELECT id
        FROM users
        ${where}
        `,
        params
      );
      if (rows.length !== memberUserIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "One or more selected users were not found in this organization" });
      }
    }

    await client.query(`DELETE FROM user_group_members WHERE group_id = $1`, [groupId]);
    for (const userId of memberUserIds) {
      await client.query(
        `
        INSERT INTO user_group_members (group_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (group_id, user_id) DO NOTHING
        `,
        [groupId, userId]
      );
    }
    await client.query(
      `UPDATE user_groups SET updated_at = NOW() WHERE id = $1`,
      [groupId]
    );

    await client.query("COMMIT");
    const group = await getGroupById(pool, groupId, orgId);
    res.json(group);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const groupId = Number(req.params.id);
  const orgId = getOrgId(req);
  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: "Invalid group id" });
  }

  try {
    const existing = await getGroupById(pool, groupId, orgId);
    if (!existing) {
      return res.status(404).json({ error: "Group not found" });
    }

    const params = [groupId];
    let where = "WHERE id = $1";
    if (orgId) {
      params.push(orgId);
      where += ` AND organization_id = $2`;
    }
    await pool.query(`DELETE FROM user_groups ${where}`, params);
    res.json({ success: true, deleted_group_id: groupId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
