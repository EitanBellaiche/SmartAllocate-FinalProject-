export const API_BASE = "http://localhost:3000/api";
const SESSION_KEY = "smartallocate.admin.session";

// helper: safely parse JSON
async function safeJson(res) {
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return res.json();
  }
  return null; // no JSON body
}

export function getAdminSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function setAdminSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function withOrgQuery(path) {
  const session = getAdminSession();
  const orgId = String(session?.organization_id || "").trim();
  if (!orgId) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}org_id=${encodeURIComponent(orgId)}`;
}

function withOrgBody(body) {
  const session = getAdminSession();
  const orgId = String(session?.organization_id || "").trim();
  if (!orgId) return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if ("org_id" in body || "organization_id" in body) return body;
  return { ...body, org_id: orgId };
}

// GET
export async function apiGet(path) {
  const res = await fetch(API_BASE + withOrgQuery(path));

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

// POST
export async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withOrgBody(body)),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

// PUT
export async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withOrgBody(body)),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

// DELETE
export async function apiDelete(path) {
  const res = await fetch(API_BASE + withOrgQuery(path), {
    method: "DELETE",
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.error || "Delete failed");
  }

  return data;
}
