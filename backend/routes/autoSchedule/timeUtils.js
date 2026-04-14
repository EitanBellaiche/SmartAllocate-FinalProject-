export function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((p) => Number(p));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

export function formatDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeDateKey(value) {
  if (!value) return "";
  if (value instanceof Date) return formatDate(value);
  const raw = String(value);
  const trimmed = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed);
  return "";
}

export function normalizeTimeKey(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

export function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nextH = Math.floor(total / 60);
  const nextM = total % 60;
  return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
}

export function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function getWeekStart(dateObj) {
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

export function getWeekStartsInRange(startDate, endDate) {
  const weeks = [];
  const cursor = getWeekStart(startDate);
  while (cursor <= endDate) {
    weeks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function clampDaysPerWeek(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(7, Math.max(1, Math.round(n)));
}

export function roundDurationToGrid(durationMinutes) {
  const min = Number.isFinite(durationMinutes) ? durationMinutes : 0;
  const rounded = Math.round(min / 30) * 30;
  return Math.max(30, rounded);
}

