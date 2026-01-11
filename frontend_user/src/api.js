export const API_BASE = "http://localhost:3000/api";
const SESSION_KEY = "smartallocate.session";

function getSessionOrgId() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return "";
  try {
    const data = JSON.parse(raw);
    return String(data?.organization_id || "").trim();
  } catch {
    return "";
  }
}

function withOrgQuery(path) {
  const orgId = getSessionOrgId();
  if (!orgId) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}org_id=${encodeURIComponent(orgId)}`;
}

function withOrgBody(payload) {
  const orgId = getSessionOrgId();
  if (!orgId || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  if ("org_id" in payload || "organization_id" in payload) return payload;
  return { ...payload, org_id: orgId };
}

async function safeJson(res) {
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return res.json();
  return null;
}

export async function loginUser(nationalId, password) {
  const id = String(nationalId || "").trim();
  const pw = String(password || "").trim();
  if (!id || !pw) {
    throw new Error("National ID and password are required");
  }
  const res = await fetch(`${API_BASE}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ national_id: id, password: pw }),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to find user");
  }
  return data;
}

export async function getBookingsByUser(userIdOrNationalId) {
  const id = String(userIdOrNationalId || "").trim();
  const path = id
    ? `${API_BASE}/bookings?user_id=${encodeURIComponent(id)}&include_details=1`
    : `${API_BASE}/bookings?include_details=1`;
  const res = await fetch(withOrgQuery(path));
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load bookings");
  }
  return Array.isArray(data) ? data : [];
}

export async function getAllResources() {
  const res = await fetch(withOrgQuery(`${API_BASE}/resources`));
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load resources");
  }
  return Array.isArray(data) ? data : [];
}

export async function getBookingsByResource(resourceId) {
  const res = await fetch(
    withOrgQuery(
      `${API_BASE}/bookings?resource_id=${encodeURIComponent(
        resourceId
      )}&include_details=1`
    )
  );
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load availability");
  }
  return Array.isArray(data) ? data : [];
}

export async function createResourceRequest(payload) {
  const res = await fetch(`${API_BASE}/resource-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withOrgBody(payload)),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to send request");
  }
  return data;
}

export async function createBooking(payload) {
  const res = await fetch(`${API_BASE}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withOrgBody(payload)),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to create booking");
  }
  return data;
}

export async function cancelBooking(bookingId, payload = {}) {
  const res = await fetch(`${API_BASE}/bookings/${bookingId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withOrgBody(payload)),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to cancel booking");
  }
  return data;
}

export async function rescheduleBooking(bookingId, payload = {}) {
  const res = await fetch(`${API_BASE}/bookings/${bookingId}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withOrgBody(payload)),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to reschedule booking");
  }
  return data;
}

export async function getResourceRequests(params = {}) {
  const { resourceId, studentId, userId } = params;
  const qs = new URLSearchParams();
  if (resourceId) qs.set("resource_id", resourceId);
  if (userId || studentId) qs.set("user_id", userId || studentId);
  const path = qs.toString()
    ? `${API_BASE}/resource-requests?${qs.toString()}`
    : `${API_BASE}/resource-requests`;
  const res = await fetch(withOrgQuery(path));
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load requests");
  }
  return Array.isArray(data) ? data : [];
}

export async function getAnnouncements(params = {}) {
  const { userId } = params;
  const qs = new URLSearchParams();
  if (userId) qs.set("user_id", userId);
  const path = qs.toString()
    ? `${API_BASE}/announcements?${qs.toString()}`
    : `${API_BASE}/announcements`;
  const res = await fetch(withOrgQuery(path));
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load announcements");
  }
  return Array.isArray(data) ? data : [];
}

export async function createAnnouncement(payload) {
  const res = await fetch(`${API_BASE}/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withOrgBody(payload)),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to send announcement");
  }
  return data;
}
