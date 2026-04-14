export const API_BASE =
  (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "") +
  "/api";
const SESSION_KEY = "smartallocate.admin.session";

// helper: safely parse JSON
async function safeJson(res) {
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return res.json();
  }
  return null; // no JSON body
}

async function safeText(res) {
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return "";
  }
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    timeoutMs = 0,
    timeoutMessage,
  } = options;

  const controller = new AbortController();
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    const requestPath =
      method === "GET" || method === "DELETE" ? withOrgQuery(path) : path;
    const payload =
      body && method !== "GET" && method !== "DELETE"
        ? JSON.stringify(withOrgBody(body))
        : undefined;

    const res = await fetch(API_BASE + requestPath, {
      method,
      headers:
        payload !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
      body: payload,
      signal: controller.signal,
    });

    const data = await safeJson(res);
    const text = data ? "" : await safeText(res);

    if (!res.ok) {
      const err = new Error(
        data?.error || text || (method === "DELETE" ? "Delete failed" : "Request failed")
      );
      err.data = data;
      err.status = res.status;
      throw err;
    }

    return data;
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutError = new Error(
        timeoutMessage ||
          `Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
      );
      timeoutError.code = "REQUEST_TIMEOUT";
      throw timeoutError;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
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

export function clearAdminSession() {
  localStorage.removeItem(SESSION_KEY);
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
export async function apiGet(path, options = {}) {
  return request(path, { ...options, method: "GET" });
}

// POST
export async function apiPost(path, body, options = {}) {
  return request(path, { ...options, method: "POST", body });
}

// PUT
export async function apiPut(path, body, options = {}) {
  return request(path, { ...options, method: "PUT", body });
}

// DELETE
export async function apiDelete(path, options = {}) {
  return request(path, { ...options, method: "DELETE" });
}
