const API_BASE = "http://localhost:3000/api";

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error("API GET failed");
  return res.json();
}
