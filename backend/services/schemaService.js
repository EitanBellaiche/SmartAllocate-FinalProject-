import db from "../db.js";

const CACHE_TTL_MS = 30000;
const cache = new Map();

function cacheKey(orgId) {
  return orgId ? `org:${orgId}` : "org:all";
}

function buildResourceTypeSchema(typeRows, resourceRows) {
  const byType = new Map();

  for (const row of typeRows) {
    const typeId = Number(row.id);
    if (!Number.isFinite(typeId)) continue;
    byType.set(typeId, {
      type_id: typeId,
      name: row.name || "",
      allowed_keys: new Set(),
    });
  }

  for (const row of resourceRows) {
    const typeId = Number(row.type_id);
    if (!Number.isFinite(typeId)) continue;
    const entry = byType.get(typeId) || {
      type_id: typeId,
      name: "",
      allowed_keys: new Set(),
    };
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    for (const key of Object.keys(metadata)) {
      entry.allowed_keys.add(key);
    }
    byType.set(typeId, entry);
  }

  return Array.from(byType.values())
    .map((entry) => ({
      type_id: entry.type_id,
      name: entry.name,
      allowed_keys: Array.from(entry.allowed_keys).sort(),
    }))
    .sort((a, b) => Number(a.type_id) - Number(b.type_id));
}

function assertValidSchemaOutput(list) {
  if (!Array.isArray(list)) throw new Error("Schema output must be an array");
  for (const item of list) {
    if (!item || typeof item !== "object") throw new Error("Schema item must be an object");
    if (!Number.isFinite(Number(item.type_id))) throw new Error("Schema item type_id must be number");
    if (typeof item.name !== "string") throw new Error("Schema item name must be string");
    if (!Array.isArray(item.allowed_keys)) throw new Error("Schema item allowed_keys must be array");
    for (const key of item.allowed_keys) {
      if (typeof key !== "string") throw new Error("Schema item allowed_keys values must be strings");
    }
  }
}

export async function getResourceTypeSchema({ orgId } = {}) {
  const key = cacheKey(orgId);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const typeParams = [];
  let typeWhere = "";
  if (orgId) {
    typeParams.push(orgId);
    typeWhere = "WHERE organization_id = $1";
  }

  const resourceParams = [];
  let resourceWhere = "";
  if (orgId) {
    resourceParams.push(orgId);
    resourceWhere = "WHERE organization_id = $1";
  }

  const [typeResult, resourceResult] = await Promise.all([
    db.query(`SELECT id, name FROM resource_types ${typeWhere} ORDER BY id`, typeParams),
    db.query(`SELECT type_id, metadata FROM resources ${resourceWhere}`, resourceParams),
  ]);

  const schema = buildResourceTypeSchema(typeResult.rows || [], resourceResult.rows || []);
  assertValidSchemaOutput(schema);

  cache.set(key, { at: now, data: schema });
  return schema;
}
