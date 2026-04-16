export function parseDateValue(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

export function normalizeMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function getBookingResources(booking) {
  return booking?.all_resources || booking?.resources || [];
}

export function getSeatLabelFromBooking(booking) {
  const resources = getBookingResources(booking);
  const seats = resources.filter((r) => {
    const meta = normalizeMetadata(r?.metadata);
    return meta.row || meta.number || meta.seat_number || meta.seatNumber;
  });

  if (seats.length === 0) return "";

  return seats
    .map((seat) => {
      const meta = normalizeMetadata(seat?.metadata);
      const row = meta.row || "";
      const num = meta.number || meta.seat_number || meta.seatNumber || "";
      return `${row}${num}`;
    })
    .join(", ");
}

export function isCinemaHallResource(resource) {
  const name = String(resource?.name || "").toLowerCase();
  const typeName = String(resource?.type_name || "").toLowerCase();
  const meta = normalizeMetadata(resource?.metadata);
  const hasSeatObjects = Array.isArray(meta?.seatObjects) && meta.seatObjects.length > 0;
  const capacity = Number(meta.capacity || meta.Capacity || 0);

  return (
    hasSeatObjects ||
    (capacity > 0 &&
      /(hall|auditorium|screen|theatre|theater|cinema area|imax)/.test(
        `${name} ${typeName}`
      ))
  );
}

export function getSeatObjects(resource) {
  const meta = normalizeMetadata(resource?.metadata);
  return Array.isArray(meta?.seatObjects) ? meta.seatObjects : [];
}

export function splitSeatRowIntoSections(rowItems) {
  if (!Array.isArray(rowItems) || rowItems.length === 0) {
    return { left: [], center: [], right: [] };
  }

  const hasSectionData = rowItems.some((seat) => seat?.section);
  if (!hasSectionData) {
    return { left: [], center: rowItems, right: [] };
  }

  const frontOnly = rowItems.every((seat) => seat?.section === "front_center");
  if (frontOnly) {
    return { left: [], center: rowItems, right: [] };
  }

  return {
    left: rowItems.filter((seat) => seat?.section === "left"),
    center: rowItems.filter(
      (seat) => seat?.section === "center" || seat?.section === "front_center"
    ),
    right: rowItems.filter((seat) => seat?.section === "right"),
  };
}

export function getHallSeatRows(resource) {
  const seats = getSeatObjects(resource);
  const byRow = seats.reduce((acc, seat) => {
    const row = String(seat?.row || "?");
    acc[row] = acc[row] || [];
    acc[row].push(seat);
    return acc;
  }, {});

  return Object.entries(byRow)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([rowLabel, items]) => ({
      rowLabel,
      items: [...items].sort(
        (a, b) => Number(a?.number || 0) - Number(b?.number || 0)
      ),
    }));
}

export function getUserSeatIdsForHall(hallResource, bookings) {
  if (!hallResource) return new Set();
  const seatIds = new Set();

  bookings.forEach((booking) => {
    const resources = getBookingResources(booking);
    const bookingHasHall = resources.some((resource) => {
      if (!isCinemaHallResource(resource)) return false;
      return (
        String(resource?.id) === String(hallResource?.id) ||
        String(resource?.name || "") === String(hallResource?.name || "")
      );
    });

    resources.forEach((resource) => {
      const meta = normalizeMetadata(resource?.metadata);
      const seatId =
        meta.seatId ||
        `${meta.row || ""}${meta.number || meta.seat_number || meta.seatNumber || ""}`;
      const linkedHallName =
        meta.hallName || meta.hall || meta.auditorium || meta.screen || "";
      if (!seatId) return;
      if (
        bookingHasHall ||
        String(linkedHallName) === String(hallResource?.name || "")
      ) {
        seatIds.add(String(seatId));
      }
    });
  });

  return seatIds;
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = parseDateValue(dateStr);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTime(t) {
  return t ? t.slice(0, 5) : "";
}

export function weekdayLabel(dayValue) {
  const labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return labels[Number(dayValue)] || `Day ${dayValue}`;
}

export function extractAssignedUserIds(meta) {
  if (!meta || typeof meta !== "object") return [];
  const raw = meta.user_ids ?? meta.userIds ?? meta.users;
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(/[\s,]+/).map((v) => String(v).trim()).filter(Boolean);
  }
  return [];
}

export function isResourceAssignedToUser(resource, userId) {
  if (!resource || !userId) return false;
  const meta = resource.metadata || {};
  const list = extractAssignedUserIds(meta);
  if (list.includes(String(userId))) return true;
  const responsible =
    meta.responsible_user_id ||
    meta.responsibleUserId ||
    meta.responsible_id ||
    meta.responsibleId;
  return String(responsible || "").trim() === String(userId).trim();
}

export function isPastBooking(booking) {
  if (!booking?.date || !booking?.start_time) return false;
  return new Date(`${booking.date}T${booking.start_time}`) < new Date();
}

export function toDateKey(dateStr) {
  const d = parseDateValue(dateStr);
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toDateKeyFromDate(dateObj) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return "";
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildMonthGrid(baseDate, bookings) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - gridStart.getDay());
  const gridEnd = new Date(end);
  gridEnd.setDate(end.getDate() + (6 - gridEnd.getDay()));

  const byDate = bookings.reduce((acc, b) => {
    const key = toDateKey(b.date);
    acc[key] = acc[key] || [];
    acc[key].push(b);
    return acc;
  }, {});

  const days = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const key = toDateKeyFromDate(d);
    days.push({
      date: new Date(d),
      key,
      inMonth: d.getMonth() === baseDate.getMonth(),
      bookings: byDate[key] || [],
    });
  }
  return days;
}

export function hasAssignedUsers(resource) {
  const meta = normalizeMetadata(resource?.metadata);
  if (extractAssignedUserIds(meta).length > 0) return true;
  const responsible =
    meta.responsible_user_id ||
    meta.responsibleUserId ||
    meta.responsible_id ||
    meta.responsibleId;
  return Boolean(responsible);
}

export function isPrimaryResource(resource) {
  return hasAssignedUsers(resource);
}

export function formatTypeLabel(typeName, labels, fallback) {
  const resolvedFallback = fallback || labels?.resource || "Resource";
  return typeName || labels?.resource || resolvedFallback;
}

export function getBookingRoomLine(booking) {
  if (String(booking?.location || "").toLowerCase() === "zoom") {
    return "Location: Zoom";
  }
  const resources = getBookingResources(booking);
  const room = resources.find((r) => {
    const meta = normalizeMetadata(r?.metadata);
    return (
      meta.room ||
      meta.location ||
      meta.site ||
      meta.space ||
      meta.building ||
      meta.floor
    );
  });
  if (!room) return "";
  const name = room.name || "On-site";
  const meta =
    room.metadata && Object.keys(room.metadata).length > 0
      ? Object.entries(room.metadata)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" | ")
      : "";
  return meta ? `Location: ${name} (${meta})` : `Location: ${name}`;
}

export function getBookingShortLocation(booking) {
  if (String(booking?.location || "").toLowerCase() === "zoom") {
    return "Zoom";
  }
  const resources = getBookingResources(booking);
  const room = resources.find((r) => {
    const meta = normalizeMetadata(r?.metadata);
    return meta.room || meta.location || meta.site || meta.space || meta.building;
  });
  if (!room) return "";
  return room.name || room.metadata?.building || "On-site";
}

function dedupeResources(resources) {
  const list = Array.isArray(resources) ? resources.filter(Boolean) : [];
  const seen = new Set();
  const deduped = [];
  for (const resource of list) {
    const key = [
      String(resource?.id ?? ""),
      String(resource?.name || "").trim().toLowerCase(),
      String(resource?.type_name || "").trim().toLowerCase(),
      String(resource?.role || "").trim().toLowerCase(),
    ].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(resource);
  }
  return deduped;
}

function buildBookingDisplaySignature(booking, resources) {
  const resourceSignature = dedupeResources(resources)
    .map((resource) =>
      [
        String(resource?.id ?? ""),
        String(resource?.name || "").trim().toLowerCase(),
        String(resource?.type_name || "").trim().toLowerCase(),
      ].join(":")
    )
    .sort()
    .join("|");

  return [
    String(booking?.date || ""),
    String(booking?.start_time || ""),
    String(booking?.end_time || ""),
    String(booking?.location || "").trim().toLowerCase(),
    resourceSignature,
  ].join("##");
}

export function filterBookingsToPrimaryResources(bookings) {
  const list = Array.isArray(bookings) ? bookings : [];
  const seen = new Set();
  const dedupedBookings = [];

  for (const booking of list) {
    const allResources = dedupeResources(booking?.resources || []);
    const primaryResources = allResources.filter(isPrimaryResource);
    const resources = primaryResources.length > 0 ? primaryResources : allResources;
    const normalizedBooking = { ...booking, resources, all_resources: allResources };
    const signature = buildBookingDisplaySignature(normalizedBooking, resources);
    if (seen.has(signature)) continue;
    seen.add(signature);
    dedupedBookings.push(normalizedBooking);
  }

  return dedupedBookings;
}

export function normalizeRole(value) {
  const roleValue = String(value || "").trim().toLowerCase();
  if (["admin", "manager", "administrator"].includes(roleValue)) return "admin";
  if (["responsible", "manager", "staff", "supervisor", "lead"].includes(roleValue)) {
    return "manager";
  }
  if (["user", "member", "employee", "worker", "staff_member"].includes(roleValue)) {
    return "user";
  }
  return "user";
}
