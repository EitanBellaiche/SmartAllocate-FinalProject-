export const API_BASE = "http://localhost:3000/api";

// helper: safely parse JSON
async function safeJson(res) {
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return res.json();
  }
  return null; // no JSON body
}

// GET
export async function apiGet(path) {
  const res = await fetch(API_BASE + path);

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
    body: JSON.stringify(body),
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
    body: JSON.stringify(body),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

// DELETE
export async function apiDelete(path) {
  const res = await fetch(API_BASE + path, {
    method: "DELETE",
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.error || "Delete failed");
  }

  return data;
}
