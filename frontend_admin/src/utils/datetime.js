const ISRAEL_LOCALE = "he-IL";
const ISRAEL_TIMEZONE = "Asia/Jerusalem";

function parseDateOnly(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatIsraelDate(value) {
  if (!value) return "-";
  const date = parseDateOnly(value);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(ISRAEL_LOCALE, {
    timeZone: ISRAEL_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatIsraelDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(ISRAEL_LOCALE, {
    timeZone: ISRAEL_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatIsraelTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

export function formatIsraelDateRange(start, end) {
  if (!start && !end) return "";
  return `${start ? formatIsraelDate(start) : "כל תאריך"} -> ${end ? formatIsraelDate(end) : "כל תאריך"}`;
}

export function getIsraelDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}
