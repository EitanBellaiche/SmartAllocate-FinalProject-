import { addMinutes, formatDate, normalizeDateKey, normalizeTimeKey, timeToMinutes } from "./timeUtils.js";

const DEFAULT_AUTO_WINDOW = { start_time: "08:00", end_time: "20:00" };

export async function ensureAvailabilityTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_availability (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      start_date DATE,
      end_date DATE,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_availability_overrides (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      is_available BOOLEAN NOT NULL DEFAULT false,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  if (!sorted.length) return [];

  const merged = [sorted[0]];
  for (const current of sorted.slice(1)) {
    const prev = merged[merged.length - 1];
    if (current.start <= prev.end) {
      prev.end = Math.max(prev.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function subtractInterval(interval, exclusion) {
  if (exclusion.end <= interval.start || exclusion.start >= interval.end) {
    return [interval];
  }
  const result = [];
  if (exclusion.start > interval.start) {
    result.push({ start: interval.start, end: exclusion.start });
  }
  if (exclusion.end < interval.end) {
    result.push({ start: exclusion.end, end: interval.end });
  }
  return result;
}

export function getDayAvailabilityWindows(baseAvailability, overrides, dayKey, dayOfWeek) {
  let intervals = baseAvailability
    .filter((slot) => {
      if (Number(slot.day_of_week) !== dayOfWeek) return false;
      const startKey = normalizeDateKey(slot.start_date);
      const endKey = normalizeDateKey(slot.end_date);
      if (startKey && startKey > dayKey) return false;
      if (endKey && endKey < dayKey) return false;
      return true;
    })
    .map((slot) => ({
      start: timeToMinutes(normalizeTimeKey(slot.start_time)),
      end: timeToMinutes(normalizeTimeKey(slot.end_time)),
    }));

  const dayOverrides = overrides.filter(
    (override) => normalizeDateKey(override.date) === dayKey
  );

  for (const override of dayOverrides) {
    const startTime = normalizeTimeKey(override.start_time);
    const endTime = normalizeTimeKey(override.end_time);
    const isAvailable = Boolean(override.is_available);

    if (!isAvailable && !startTime && !endTime) {
      intervals = [];
      continue;
    }

    if (!startTime || !endTime) {
      if (isAvailable) {
        intervals.push({ start: 0, end: 24 * 60 });
      }
      continue;
    }

    const overrideInterval = {
      start: timeToMinutes(startTime),
      end: timeToMinutes(endTime),
    };

    if (isAvailable) {
      intervals.push(overrideInterval);
      continue;
    }

    intervals = intervals.flatMap((interval) => subtractInterval(interval, overrideInterval));
  }

  return mergeIntervals(intervals).map((interval) => ({
    start_time: addMinutes("00:00", interval.start),
    end_time: addMinutes("00:00", interval.end),
  }));
}

export function buildFallbackAvailability() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    start_time: DEFAULT_AUTO_WINDOW.start_time,
    end_time: DEFAULT_AUTO_WINDOW.end_time,
    start_date: null,
    end_date: null,
  }));
}

export function availabilityCoversDate(slot, dateKey) {
  const startKey = normalizeDateKey(slot?.start_date);
  const endKey = normalizeDateKey(slot?.end_date);
  if (startKey && startKey > dateKey) return false;
  if (endKey && endKey < dateKey) return false;
  return true;
}

export function normalizeDateKeyFromAny(value) {
  if (!value) return "";
  if (value instanceof Date) return formatDate(value);
  return normalizeDateKey(value);
}

