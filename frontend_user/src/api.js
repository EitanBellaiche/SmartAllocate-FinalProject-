export const API_BASE = "http://localhost:3000/api";

async function safeJson(res) {
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return res.json();
  return null;
}

export async function getBookingsByUser(userIdOrNationalId) {
  const res = await fetch(
    `${API_BASE}/bookings?national_id=${encodeURIComponent(
      userIdOrNationalId
    )}&include_details=1`
  );
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load bookings");
  }
  return Array.isArray(data) ? data : [];
}

export async function getAllResources() {
  const res = await fetch(`${API_BASE}/resources`);
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to load resources");
  }
  return Array.isArray(data) ? data : [];
}
