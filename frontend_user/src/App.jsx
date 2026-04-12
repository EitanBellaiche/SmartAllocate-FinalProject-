import React, { useEffect, useMemo, useState } from "react";
import IsraelDateInput from "./IsraelDateInput";
import {
  getBookingsByUser,
  getAllResources,
  createResourceRequest,
  getBookingsByResource,
  getResourceRequests,
  getAnnouncements,
  createAnnouncement,
  cancelBooking,
  rescheduleBooking,
  loginUser,
  getUserAvailability,
  createUserAvailability,
  deleteUserAvailability,
} from "./api";
import { getOrgLabels, getSessionOrgId } from "./orgConfig";

function parseDateValue(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}
function getSeatLabelFromBooking(booking) {
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

// ---- Cinema helpers (used by search view and seat explorer) ----
function isCinemaHallResource(resource) {
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

function getSeatObjects(resource) {
  const meta = normalizeMetadata(resource?.metadata);
  return Array.isArray(meta?.seatObjects) ? meta.seatObjects : [];
}

function splitSeatRowIntoSections(rowItems) {
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

function getHallSeatRows(resource) {
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

function getUserSeatIdsForHall(hallResource, bookings) {
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
        `${meta.row || ""}${meta.number || meta.seat_number || meta.seatNumber || ""
        }`;
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
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = parseDateValue(dateStr);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(t) {
  return t ? t.slice(0, 5) : "";
}

function weekdayLabel(dayValue) {
  const labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return labels[Number(dayValue)] || `Day ${dayValue}`;
}

function extractAssignedUserIds(meta) {
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

function isResourceAssignedToUser(resource, userId) {
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

function isPastBooking(booking) {
  if (!booking?.date || !booking?.start_time) return false;
  return new Date(`${booking.date}T${booking.start_time}`) < new Date();
}

function toDateKey(dateStr) {
  const d = parseDateValue(dateStr);
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateKeyFromDate(dateObj) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return "";
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildMonthGrid(baseDate, bookings) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  // start from Sunday
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

function normalizeMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function hasAssignedUsers(resource) {
  const meta = normalizeMetadata(resource?.metadata);
  if (extractAssignedUserIds(meta).length > 0) return true;
  const responsible =
    meta.responsible_user_id ||
    meta.responsibleUserId ||
    meta.responsible_id ||
    meta.responsibleId;
  return Boolean(responsible);
}

function isPrimaryResource(resource) {
  return hasAssignedUsers(resource);
}

function formatTypeLabel(typeName, labels, fallback) {
  const resolvedFallback = fallback || labels?.resource || "Resource";
  return typeName || labels?.resource || resolvedFallback;
}

function getBookingResources(booking) {
  return booking?.all_resources || booking?.resources || [];
}

function getBookingRoomLine(booking) {
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
  const meta = getResourcePreviewDetails(room);
  return meta ? `Location: ${name} (${meta})` : `Location: ${name}`;
}

function getResourcePreviewDetails(resource) {
  const metadata = normalizeMetadata(resource?.metadata);
  if (!metadata || typeof metadata !== "object") return "";

  const preferredKeys = [
    "building",
    "floor",
    "capacity",
    "projector",
    "whiteboard",
    "equipment",
    "category",
    "model",
  ];

  const formatValue = (value) => {
    if (typeof value === "boolean") return value ? "yes" : "no";
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value) || typeof value === "object") return "";
    return String(value);
  };

  const details = preferredKeys
    .map((key) => {
      const value = formatValue(metadata[key]);
      return value ? `${key}: ${value}` : "";
    })
    .filter(Boolean);

  return details.slice(0, 4).join(" | ");
}

function filterBookingsToPrimaryResources(bookings) {
  return bookings.map((booking) => {
    const allResources = booking.resources || [];
    const primaryResources = allResources.filter(isPrimaryResource);
    const resources = primaryResources.length > 0 ? primaryResources : allResources;
    return { ...booking, resources, all_resources: allResources };
  });
}

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || "http://localhost:5174";
const SESSION_KEY = "smartallocate.session";

function normalizeRole(value) {
  const roleValue = String(value || "").trim().toLowerCase();
  if (["admin", "manager", "administrator"].includes(roleValue)) return "admin";
  if (
    [
      "responsible",
      "manager",
      "staff",
      "supervisor",
      "lead",
    ].includes(roleValue)
  ) {
    return "manager";
  }
  if (["user", "member", "employee", "worker", "staff_member"].includes(roleValue)) {
    return "user";
  }
  return "user";
}

export default function App() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState("month"); // month | list
  const [monthDate, setMonthDate] = useState(new Date());
  const [hasUser, setHasUser] = useState(false);

  // resource search
  const [resources, setResources] = useState([]);
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState(null);
  const [requestQuery, setRequestQuery] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestResourceId, setRequestResourceId] = useState(null);
  const [requestSent, setRequestSent] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestView, setRequestView] = useState("list"); // list | form
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [availabilityResource, setAvailabilityResource] = useState(null);
  const [availabilityBookings, setAvailabilityBookings] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityMonthDate, setAvailabilityMonthDate] = useState(
    () => new Date()
  );
  const [bookingDraft, setBookingDraft] = useState({
    date: "",
    start: "09:00",
    end: "10:00",
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");
  const [userRequests, setUserRequests] = useState([]);
  const [userRequestsLoading, setUserRequestsLoading] = useState(false);
  const [userRequestsError, setUserRequestsError] = useState("");
  const [userRequestsQuery, setUserRequestsQuery] = useState("");
  const [selectedUserRequestKey, setSelectedUserRequestKey] = useState(null);
  const [seenRequestIds, setSeenRequestIds] = useState([]);
  const [notificationTab, setNotificationTab] = useState("requests"); // requests | announcements
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState("");
  const [announcementsQuery, setAnnouncementsQuery] = useState("");
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState(null);
  const [seenAnnouncementIds, setSeenAnnouncementIds] = useState([]);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    message: "",
    resource: "",
    targetUserId: "",
    senderName: "",
  });
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);
  const [announcementSent, setAnnouncementSent] = useState("");
  const [announcementError, setAnnouncementError] = useState("");
  const [cancelDialog, setCancelDialog] = useState({ open: false, booking: null });
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSenderName, setCancelSenderName] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelSuccess, setCancelSuccess] = useState("");
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStart, setRescheduleStart] = useState("09:00");
  const [rescheduleEnd, setRescheduleEnd] = useState("10:00");
  const [rescheduleLocation, setRescheduleLocation] = useState("onsite");
  const [userAvailability, setUserAvailability] = useState([]);
  const [availabilityForm, setAvailabilityForm] = useState({
    day_of_week: ["1"],
    start_time: "09:00",
    end_time: "12:00",
    start_date: "",
    end_date: "",
  });
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const labels = useMemo(
    () => getOrgLabels(getSessionOrgId(SESSION_KEY)),
    [role, hasUser]
  );
  const labelsLower = useMemo(
    () => ({
      user: String(labels.user || "").toLowerCase(),
      users: String(labels.users || "").toLowerCase(),
      manager: String(labels.manager || "").toLowerCase(),
      managers: String(labels.managers || "").toLowerCase(),
      resource: String(labels.resource || "").toLowerCase(),
      resources: String(labels.resources || "").toLowerCase(),
      userId: String(labels.userId || "").toLowerCase(),
      request: String(labels.request || "").toLowerCase(),
    }),
    [labels]
  );

  const orgId = String(getSessionOrgId(SESSION_KEY) || "").trim().toLowerCase();
  const isShenkarResponsible = orgId === "shenkar" && role === "manager";
  const isShenkarUser = orgId === "shenkar" && role === "user";
  const isShenkarTheme = isShenkarResponsible || isShenkarUser;
  const isCinema = !isShenkarTheme;

  const cinemaPrimaryButton = {
    border: "none",
    background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
    color: "#fff",
    fontWeight: 800,
    boxShadow: "0 14px 30px rgba(79,70,229,0.22)",
  };

  const cinemaSecondaryButton = {
    border: "1px solid #c4b5fd",
    background: "#ffffff",
    color: "#5b21b6",
    fontWeight: 800,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  };

  const shenkarResponsiblePrimaryButton = {
    border: "1px solid #2f7c7e",
    background: "linear-gradient(135deg,#2f7c7e,#4ea8a4)",
    color: "#fff",
    fontWeight: 800,
    boxShadow: "0 14px 28px rgba(47,124,126,0.18)",
  };

  const shenkarResponsibleSecondaryButton = {
    border: "1px solid #b9ded8",
    background: "#ffffff",
    color: "#2b6d70",
    fontWeight: 800,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  };

  const responsibleHeaderCardStyle = {
    padding: "18px 20px",
    borderRadius: 22,
    border: "1px solid #d9ebe7",
    background: "linear-gradient(180deg,#ffffff 0%,#f5fbfa 100%)",
    boxShadow: "0 18px 42px rgba(20,83,78,0.08)",
    marginBottom: 18,
  };

  const responsiblePanelStyle = {
    padding: 18,
    borderRadius: 22,
    border: "1px solid #d9ebe7",
    background: "linear-gradient(180deg,#ffffff 0%,#f7fbfa 100%)",
    boxShadow: "0 18px 42px rgba(20,83,78,0.06)",
  };

  const responsibleFieldStyle = {
    border: "1px solid #d4e9e4",
    background: "#ffffff",
    color: "#0f172a",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  };

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw);
      const storedId = String(stored?.id || "").trim();
      if (!storedId) return;
      setCurrentUserId(storedId);
      setRole(normalizeRole(stored?.role));
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  async function handleLogin() {
    const id = currentUserId.trim();
    if (!id) {
      setError(`Please enter your ${labels.userId}.`);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const user = await loginUser(id, password);
      const normalizedRole = normalizeRole(user?.role);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          id,
          role: normalizedRole,
          organization_id: user?.organization_id || null,
          full_name: user?.full_name || "",
        })
      );
      if (normalizedRole === "admin") {
        const params = new URLSearchParams();
        params.set("national_id", id);
        if (user?.organization_id) {
          params.set("organization_id", String(user.organization_id));
        }
        if (user?.full_name) {
          params.set("full_name", String(user.full_name));
        }
        params.set("role", "admin");
        const query = `?${params.toString()}`;
        window.location.assign(`${ADMIN_URL}${query}`);
        return;
      }
      setRole(normalizedRole);
      setHasUser(true);
    } catch (err) {
      setError(err?.message || "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setHasUser(false);
    setCurrentUserId("");
    setPassword("");
    setRole("user");
    setSection("schedule");
    setBookings([]);
    setUserRequests([]);
    setAnnouncements([]);
  }

  const activeBookings = useMemo(() => {
    return bookings.filter((b) => !b.cancelled_at);
  }, [bookings]);

  const scheduleBookings = useMemo(
    () => filterBookingsToPrimaryResources(activeBookings),
    [activeBookings]
  );

  const filteredBookings = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return scheduleBookings;
    return scheduleBookings.filter((b) => {
      const resourcesTxt = (b.resources || [])
        .map((r) => `${r.name} ${r.type_name || ""}`)
        .join(" ");
      const haystack = `${b.id} ${b.date} ${resourcesTxt}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [scheduleBookings, filter]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return filteredBookings.filter(
      (b) => new Date(`${b.date}T${b.start_time}`) >= now
    );
  }, [filteredBookings]);

  const past = useMemo(() => {
    const now = new Date();
    return filteredBookings.filter(
      (b) => new Date(`${b.date}T${b.start_time}`) < now
    );
  }, [filteredBookings]);

  const monthDays = useMemo(
    () => buildMonthGrid(monthDate, filteredBookings),
    [monthDate, filteredBookings]
  );
  const availabilityDays = useMemo(
    () => buildMonthGrid(availabilityMonthDate, availabilityBookings),
    [availabilityMonthDate, availabilityBookings]
  );

  const monthLabel = monthDate.toLocaleDateString("en-GB", {
    timeZone: "Asia/Jerusalem",
    month: "long",
    year: "numeric",
  });
  const availabilityMonthLabel = availabilityMonthDate.toLocaleDateString(
    "en-GB",
    {
      timeZone: "Asia/Jerusalem",
      month: "long",
      year: "numeric",
    }
  );

  function isResourceAvailable(resource) {
    const meta = resource?.metadata || {};
    if (meta.available === true) return true;
    const status = `${meta.status || meta.availability || ""}`.toLowerCase();
    return status === "available" || status === "free" || status === "open";
  }

  function resourceMatchesQuery(resource, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${resource.name} ${resource.type_name || ""} ${JSON.stringify(
      resource.metadata || {}
    )}`.toLowerCase();
    return hay.includes(q);
  }

  const filteredResources = useMemo(() => {
    const visibleResources = resources.filter((r) => {
      if (role === "manager" && !isShenkarResponsible && isPrimaryResource(r)) return false;
      return true;
    });
    const sortedResources = [...visibleResources].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
    if (role === "user" && !resourceQuery.trim()) return sortedResources;
    if (!resourceQuery.trim()) return [];
    return sortedResources.filter((r) => resourceMatchesQuery(r, resourceQuery));
  }, [resources, resourceQuery, role, isShenkarResponsible]);

  const filteredRequestResources = useMemo(() => {
    return resources.filter((r) => {
      if (role === "manager" && !isShenkarResponsible && isPrimaryResource(r)) return false;
      if (!resourceMatchesQuery(r, requestQuery)) return false;
      if (onlyAvailable && !isResourceAvailable(r)) return false;
      return true;
    });
  }, [resources, requestQuery, onlyAvailable, role, isShenkarResponsible]);

  const selectedResource = useMemo(() => {
    if (!selectedResourceId) return null;
    return resources.find((r) => String(r.id) === String(selectedResourceId)) || null;
  }, [resources, selectedResourceId]);

  const selectedRequestResource = useMemo(() => {
    if (!requestResourceId) return null;
    return resources.find((r) => String(r.id) === String(requestResourceId)) || null;
  }, [resources, requestResourceId]);

  async function loadResources(options = {}) {
    const { allowEmptyQuery = false } = options;
    if (!allowEmptyQuery && !resourceQuery.trim()) return;
    setResourceError("");
    setResourceLoading(true);
    try {
      const data = await getAllResources();
      setResources(Array.isArray(data) ? data : []);
    } catch (err) {
      setResourceError(
        err?.message || `Failed to load ${labelsLower.resources}.`
      );
    } finally {
      setResourceLoading(false);
    }
  }

  useEffect(() => {
    if (!resourceQuery.trim()) return;
    if (resources.length > 0) return;
    const timer = setTimeout(() => {
      loadResources();
    }, 200);
    return () => clearTimeout(timer);
  }, [resourceQuery, resources.length]);

  useEffect(() => {
    if (!requestQuery.trim()) return;
    if (resources.length > 0) return;
    loadResources({ allowEmptyQuery: true });
  }, [requestQuery, resources.length]);

  useEffect(() => {
    if (!hasUser || !currentUserId.trim()) return;
    let active = true;

    async function refreshUserData() {
      try {
        const userId = currentUserId.trim();
        const tasks = [getBookingsByUser(userId), getAllResources()];
        if (role === "manager") {
          tasks.push(getResourceRequests());
        } else {
          tasks.push(Promise.resolve([]));
        }
        if (role === "user") {
          tasks.push(getAnnouncements({ userId: currentUserId.trim() }));
        }
        const [bookingsData, allResources, requestsData, announcementsData] =
          await Promise.all(tasks);
        if (!active) return;
        const baseBookings = Array.isArray(bookingsData) ? bookingsData : [];
        const resourcesList = Array.isArray(allResources) ? allResources : [];
        setResources(resourcesList);
        const assignedResources = resourcesList.filter((r) =>
          isResourceAssignedToUser(r, userId)
        );
        let mergedBookings = baseBookings;
        if (assignedResources.length > 0) {
          const extra = await Promise.all(
            assignedResources.map((r) => getBookingsByResource(r.id).catch(() => []))
          );
          const all = new Map();
          for (const b of baseBookings) {
            if (b?.id != null) all.set(String(b.id), b);
          }
          for (const list of extra) {
            for (const b of list || []) {
              if (b?.id != null && !all.has(String(b.id))) {
                all.set(String(b.id), b);
              }
            }
          }
          mergedBookings = Array.from(all.values());
        }
        setBookings(mergedBookings);
        setUserRequests(Array.isArray(requestsData) ? requestsData : []);
        if (role === "user") {
          setAnnouncements(
            Array.isArray(announcementsData) ? announcementsData : []
          );
        }
      } catch {
        if (!active) return;
      }
    }

    refreshUserData();
    const timer = setInterval(refreshUserData, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hasUser, currentUserId, role]);

  async function openAvailability(resource) {
    if (!resource) return;
    setAvailabilityResource(resource);
    setAvailabilityMonthDate(new Date());
    setAvailabilityError("");
    setBookingDraft({ date: "", start: "09:00", end: "10:00" });
    setBookingError("");
    setBookingSuccess("");
    setAvailabilityLoading(true);
    try {
      const [bookingsData] = await Promise.all([
        getBookingsByResource(resource.id),
      ]);
      setAvailabilityBookings(Array.isArray(bookingsData) ? bookingsData : []);
    } catch (err) {
      setAvailabilityError(err?.message || "Failed to load availability.");
      setAvailabilityBookings([]);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  function pickBookingDate(day) {
    if (!day?.key) return;
    setBookingDraft((prev) => ({ ...prev, date: day.key }));
    setBookingError("");
    setBookingSuccess("");
  }

  async function submitBookingRequest(dateOverride) {
    const requester = currentUserId.trim();
    if (!availabilityResource) return;
    if (!requester) {
      setBookingError(`Please enter your ${labels.userId} first.`);
      return;
    }
    const requestDate = dateOverride || bookingDraft.date;
    if (dateOverride && bookingDraft.date !== dateOverride) {
      setBookingDraft((prev) => ({ ...prev, date: dateOverride }));
    }
    if (!requestDate) {
      setBookingError("Please choose a date in the calendar.");
      return;
    }
    if (!bookingDraft.start || !bookingDraft.end) {
      setBookingError("Please select start and end times.");
      return;
    }
    if (bookingDraft.start >= bookingDraft.end) {
      setBookingError("End time must be after start time.");
      return;
    }

    setBookingSubmitting(true);
    setBookingError("");
    setBookingSuccess("");
    try {
      await createResourceRequest({
        resource_id: availabilityResource.id,
        user_id: requester,
        note: `Booking request for ${requestDate} ${bookingDraft.start}-${bookingDraft.end}`,
        request_date: requestDate,
        start_time: bookingDraft.start,
        end_time: bookingDraft.end,
      });
      setBookingSuccess("Request sent to the admin for approval.");
    } catch (err) {
      setBookingError(err?.message || "Failed to send request.");
    } finally {
      setBookingSubmitting(false);
    }
  }

  useEffect(() => {
    if (!availabilityResource || !currentUserId.trim()) return;
    let active = true;

    async function refreshStatus() {
      try {
        const [bookingsData, userBookings] = await Promise.all([
          getBookingsByResource(availabilityResource.id),
          getBookingsByUser(currentUserId.trim()),
        ]);
        if (!active) return;
        setAvailabilityBookings(
          Array.isArray(bookingsData) ? bookingsData : []
        );
        setBookings(Array.isArray(userBookings) ? userBookings : []);
      } catch {
        if (!active) return;
      }
    }

    refreshStatus();
    const timer = setInterval(refreshStatus, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [availabilityResource, currentUserId]);

  async function submitResourceRequest() {
    if (!selectedRequestResource) return;
    const note = requestNote.trim();
    const requester = currentUserId.trim();
    if (!requester) {
      setRequestError(`Please enter your ${labels.userId} first.`);
      return;
    }
    if (!note) {
      setRequestError("Please add a short reason for the request.");
      return;
    }
    setRequestError("");
    setRequestSubmitting(true);
    try {
      await createResourceRequest({
        resource_id: selectedRequestResource.id,
        user_id: requester,
        note,
      });
      setRequestSent(`Request sent for ${selectedRequestResource.name}.`);
      setRequestNote("");
      setRequestResourceId(null);
      setRequestView("list");
    } catch (err) {
      setRequestError(err?.message || "Failed to send request.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  // map resource id -> sessions for active bookings
  const resourceSessions = useMemo(() => {
    const byId = {};
    for (const b of activeBookings) {
      for (const r of getBookingResources(b)) {
        const resourceId = String(r?.id ?? "");
        if (!resourceId) continue;
        byId[resourceId] = byId[resourceId] || [];
        byId[resourceId].push({
          bookingId: b.id,
          date: b.date,
          start: b.start_time,
          end: b.end_time,
          role: r.role || null,
        });
      }
    }
    Object.values(byId).forEach((list) =>
      list.sort(
        (a, b) =>
          new Date(`${a.date}T${a.start}`) - new Date(`${b.date}T${b.start}`)
      )
    );
    return byId;
  }, [activeBookings]);

  // map resource id -> sessions for all bookings (including cancelled)
  const allResourceSessions = useMemo(() => {
    const byId = {};
    for (const b of bookings) {
      for (const r of getBookingResources(b)) {
        const resourceId = String(r?.id ?? "");
        if (!resourceId) continue;
        byId[resourceId] = byId[resourceId] || [];
        byId[resourceId].push({
          bookingId: b.id,
          date: b.date,
          start: b.start_time,
          end: b.end_time,
          role: r.role || null,
          cancelled: Boolean(b.cancelled_at),
        });
      }
    }
    Object.values(byId).forEach((list) =>
      list.sort(
        (a, b) =>
          new Date(`${a.date}T${a.start}`) - new Date(`${b.date}T${b.start}`)
      )
    );
    return byId;
  }, [bookings]);

  const selectedResourceSessions = useMemo(() => {
    if (!selectedResourceId) return [];
    return resourceSessions[String(selectedResourceId)] || [];
  }, [resourceSessions, selectedResourceId]);

  // Sidebar selection
  const [section, setSection] = useState("schedule"); // schedule | search | requests | availability | notifications

  async function loadUserRequests() {
    const userId = currentUserId.trim();
    if (role === "user" && !userId) return;
    setUserRequestsError("");
    setUserRequestsLoading(true);
    try {
      const data =
        role === "manager"
          ? await getResourceRequests()
          : await getResourceRequests({ userId });
      setUserRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setUserRequestsError(err?.message || "Failed to load requests.");
      setUserRequests([]);
    } finally {
      setUserRequestsLoading(false);
    }
  }

  async function loadAnnouncements() {
    const userId = currentUserId.trim();
    if (role === "user" && !userId) return;
    setAnnouncementsError("");
    setAnnouncementsLoading(true);
    try {
      const data = await getAnnouncements({
        userId: role === "user" ? userId : undefined,
      });
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (err) {
      setAnnouncementsError(err?.message || "Failed to load announcements.");
      setAnnouncements([]);
    } finally {
      setAnnouncementsLoading(false);
    }
  }

  async function submitAnnouncement() {
    const title = announcementForm.title.trim();
    const message = announcementForm.message.trim();
    const resource = announcementForm.resource.trim();
    const targetUserId = announcementForm.targetUserId.trim();
    const senderName =
      announcementForm.senderName.trim() || currentUserId.trim() || labels.manager;

    if (!title) {
      setAnnouncementError("Please add a title.");
      return;
    }
    if (!message) {
      setAnnouncementError("Please add a message.");
      return;
    }

    setAnnouncementSubmitting(true);
    setAnnouncementError("");
    setAnnouncementSent("");
    try {
      await createAnnouncement({
        title,
        message,
        resource_name: resource,
        sender_name: senderName,
        target_user_id: targetUserId || null,
      });
      setAnnouncementSent("Announcement sent.");
      setAnnouncementForm((prev) => ({
        ...prev,
        title: "",
        message: "",
        resource: "",
        targetUserId: "",
      }));
      loadAnnouncements();
    } catch (err) {
      setAnnouncementError(err?.message || "Failed to send announcement.");
    } finally {
      setAnnouncementSubmitting(false);
    }
  }

  function markAnnouncementSeen(announcementId) {
    if (role !== "user") return;
    const userId = currentUserId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_announcements_${userId}`;
    const next = new Set([...seenAnnouncementIds, Number(announcementId)]);
    const nextList = Array.from(next);
    setSeenAnnouncementIds(nextList);
    localStorage.setItem(key, JSON.stringify(nextList));
  }

  function openCancelDialog(booking) {
    if (!booking) return;
    setCancelDialog({ open: true, booking });
    setCancelReason("");
    setCancelSenderName("");
    setCancelError("");
    setCancelSuccess("");
    setRescheduleMode(false);
    setRescheduleDate(booking.date || "");
    setRescheduleStart(booking.start_time || "09:00");
    setRescheduleEnd(booking.end_time || "10:00");
    setRescheduleLocation("onsite");
  }

  async function submitCancellation() {
    const booking = cancelDialog.booking;
    if (!booking) return;
    setCancelSubmitting(true);
    setCancelError("");
    setCancelSuccess("");
    try {
      if (rescheduleMode) {
        if (!rescheduleDate || !rescheduleStart || !rescheduleEnd) {
          setCancelError("Please select a new date and time.");
          setCancelSubmitting(false);
          return;
        }
        if (rescheduleStart >= rescheduleEnd) {
          setCancelError("End time must be after start time.");
          setCancelSubmitting(false);
          return;
        }
        await rescheduleBooking(booking.id, {
          date: rescheduleDate,
          start_time: rescheduleStart,
          end_time: rescheduleEnd,
          location: rescheduleLocation,
          reason: cancelReason.trim(),
          sender_name: cancelSenderName.trim() || currentUserId.trim() || labels.manager,
          target_user_id: currentUserId.trim(),
        });
        setCancelSuccess(`${labels.resource} rescheduled.`);
      } else {
        await cancelBooking(booking.id, {
          reason: cancelReason.trim(),
          sender_name: cancelSenderName.trim() || currentUserId.trim() || labels.manager,
          target_user_id: currentUserId.trim(),
        });
        setCancelSuccess(`${labels.resource} cancelled.`);
      }
      const data = await getBookingsByUser(currentUserId.trim());
      setBookings(Array.isArray(data) ? data : []);
      setCancelDialog({ open: false, booking: null });
    } catch (err) {
      setCancelError(
        err?.message ||
        (rescheduleMode
          ? `Failed to reschedule ${labelsLower.resource}.`
          : `Failed to cancel ${labelsLower.resource}.`)
      );
    } finally {
      setCancelSubmitting(false);
    }
  }

  useEffect(() => {
    const userId = currentUserId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_${userId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      setSeenRequestIds(Array.isArray(stored) ? stored : []);
    } catch {
      setSeenRequestIds([]);
    }
  }, [currentUserId]);

  useEffect(() => {
    const userId = currentUserId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_announcements_${userId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      setSeenAnnouncementIds(Array.isArray(stored) ? stored : []);
    } catch {
      setSeenAnnouncementIds([]);
    }
  }, [currentUserId]);

  const seenRequestSet = useMemo(
    () => new Set(seenRequestIds.map((id) => Number(id))),
    [seenRequestIds]
  );

  const seenAnnouncementSet = useMemo(
    () => new Set(seenAnnouncementIds.map((id) => Number(id))),
    [seenAnnouncementIds]
  );

  const unreadRequestCount = useMemo(() => {
    return userRequests.filter(
      (req) =>
        req.status && req.status !== "pending" && !seenRequestSet.has(Number(req.id))
    ).length;
  }, [userRequests, seenRequestSet]);

  const unreadAnnouncementCount = useMemo(() => {
    if (role !== "user") return 0;
    return announcements.filter((a) => !seenAnnouncementSet.has(Number(a.id))).length;
  }, [announcements, role, seenAnnouncementSet]);

  const unreadNotificationCount = unreadRequestCount + unreadAnnouncementCount;

  const filteredUserRequests = useMemo(() => {
    const q = userRequestsQuery.trim().toLowerCase();
    if (!q) return userRequests;
    return userRequests.filter((req) => {
      const haystack = [
        req.resource_name,
        req.resource_type,
        req.status,
        req.request_date,
        req.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [userRequests, userRequestsQuery]);

  const filteredAnnouncements = useMemo(() => {
    const q = announcementsQuery.trim().toLowerCase();
    if (!q) return announcements;
    return announcements.filter((a) => {
      const haystack = [a.title, a.message, a.resource_name, a.sender_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [announcements, announcementsQuery]);

  const groupedUserRequests = useMemo(() => {
    const groups = new Map();
    filteredUserRequests.forEach((req) => {
      const key = String(req.resource_id ?? req.resource_name ?? req.id);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          resource_id: req.resource_id,
          resource_name: req.resource_name,
          resource_type: req.resource_type,
          requests: [],
        });
      }
      groups.get(key).requests.push(req);
    });
    return Array.from(groups.values()).sort((a, b) => {
      const aName = a.resource_name || `${labels.resource} #${a.resource_id || ""}`;
      const bName = b.resource_name || `${labels.resource} #${b.resource_id || ""}`;
      return aName.localeCompare(bName);
    });
  }, [filteredUserRequests, labels.resource]);

  useEffect(() => {
    if (selectedUserRequestKey && !groupedUserRequests.some((g) => g.key === selectedUserRequestKey)) {
      setSelectedUserRequestKey(null);
    }
  }, [groupedUserRequests, selectedUserRequestKey]);

  useEffect(() => {
    if (selectedAnnouncementId && !filteredAnnouncements.some((a) => a.id === selectedAnnouncementId)) {
      setSelectedAnnouncementId(null);
    }
  }, [filteredAnnouncements, selectedAnnouncementId]);

  useEffect(() => {
    if (userRequestsQuery.trim()) {
      setSelectedUserRequestKey(null);
    }
  }, [userRequestsQuery]);

  useEffect(() => {
    if (role === "manager") {
      setNotificationTab("requests");
    } else if (role === "user") {
      setNotificationTab("announcements");
      setUserRequests([]);
    }
  }, [role]);

  useEffect(() => {
    if (role === "user" && (section === "requests" || section === "availability")) {
      setSection("schedule");
    }
  }, [role, section]);

  const selectedUserGroup = groupedUserRequests.find(
    (group) => group.key === selectedUserRequestKey
  );

  function markRequestsSeen(resourceId) {
    const userId = currentUserId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_${userId}`;
    const toMark = userRequests
      .filter(
        (req) =>
          String(req.resource_id) === String(resourceId) &&
          req.status &&
          req.status !== "pending"
      )
      .map((req) => Number(req.id));
    if (toMark.length === 0) return;
    const next = new Set([...seenRequestSet, ...toMark]);
    const nextList = Array.from(next);
    setSeenRequestIds(nextList);
    localStorage.setItem(key, JSON.stringify(nextList));
  }

  useEffect(() => {
    if (section !== "notifications") return;
    if (role === "manager") {
      loadUserRequests();
    }
    if (role === "user") {
      loadAnnouncements();
    }
  }, [section, currentUserId, role]);

  useEffect(() => {
    if (section !== "notifications") return;
    if (role !== "user" || !currentUserId.trim()) return;
    let active = true;

    async function refreshAnnouncements() {
      try {
        const data = await getAnnouncements({
          userId: role === "user" ? currentUserId.trim() : undefined,
        });
        if (!active) return;
        setAnnouncements(Array.isArray(data) ? data : []);
      } catch {
        if (!active) return;
      }
    }

    refreshAnnouncements();
    const timer = setInterval(refreshAnnouncements, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [section, currentUserId, role]);

  useEffect(() => {
    if (!hasUser || role !== "manager") return;
    const id = currentUserId.trim();
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const data = await getUserAvailability(id);
        if (active) setUserAvailability(data);
      } catch {
        if (active) setUserAvailability([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [hasUser, role, currentUserId]);

  if (!hasUser) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <section className="login-showcase">
            <div className="login-brand-badge">SmartAllocate</div>

            <div className="login-greeting">
              <div className="login-greeting-title">Welcome back</div>
              <div className="login-greeting-sub">
                Sign in to manage your {labelsLower.resources}, review your activity, and stay
                aligned with your organization from one elegant workspace.
              </div>
            </div>

            <div className="login-showcase-panel">
              <div className="login-showcase-label">Personal workspace</div>
              <div className="login-showcase-text">
                Review bookings, follow updates from your {labelsLower.managers}, and request the
                next {labelsLower.resource} with a calm, focused workflow.
              </div>
            </div>
          </section>

          <section className="login-form-wrap">
            <div className="login-form">
              <div className="login-form-header">
                <div className="login-form-title">Sign in</div>
                <div className="login-form-subtitle">
                  Enter your details to access your personal dashboard.
                </div>
              </div>

              <label className="login-label">{labels.userId}</label>
              <input
                className="login-input"
                type="text"
                inputMode="numeric"
                value={currentUserId}
                onChange={(e) => setCurrentUserId(e.target.value)}
                placeholder={`Enter your ${labelsLower.userId}`}
              />
              <label className="login-label">Password</label>
              <input
                className="login-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
              <button
                className="login-button"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? "Loading..." : "Sign in"}
              </button>
              {error && <div className="login-error">{error}</div>}
            </div>
          </section>
        </div>
      </div>
    );
  }
  const requestDisabled = bookingSubmitting;
  const requestButtonLabel = "Send request";
  const requestButtonBackground = bookingSubmitting ? "#94a3b8" : "#2563eb";
  const requestButtonColor = "#fff";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: isShenkarTheme ? "#f7fbfa" : isCinema ? "#f1f5f9" : "#f8fafc",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: isCinema
            ? "linear-gradient(180deg,#09090b 0%,#120a19 100%)"
            : isShenkarTheme
              ? "linear-gradient(180deg,#24555a 0%,#2f6d73 46%,#3f878b 100%)"
              : "#0f172a",
          color: "#e2e8f0",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          gap: 12,
          boxShadow: isCinema
            ? "inset -1px 0 0 rgba(196,181,253,0.14)"
            : isShenkarTheme
              ? "inset -1px 0 0 rgba(235,250,247,0.14)"
              : "none",
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 18,
            color: isCinema ? "#f5f3ff" : isShenkarTheme ? "#f2fdfa" : undefined,
            letterSpacing: isCinema || isShenkarTheme ? "0.02em" : undefined,
          }}
        >
          SmartAllocate
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              fontSize: 10,
              color: isShenkarTheme ? "rgba(236,253,250,0.72)" : "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Role
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: isCinema
                ? "1px solid rgba(196,181,253,0.24)"
                : isShenkarTheme
                  ? "1px solid rgba(233,250,246,0.18)"
                  : "1px solid #1e293b",
              background: isCinema
                ? "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(196,181,253,0.08))"
                : isShenkarTheme
                  ? "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.08))"
                  : "#0b1120",
              color: "#e2e8f0",
              fontWeight: 800,
              textTransform: "capitalize",
              textAlign: "center",
            }}
          >
            {role === "manager" ? labels.manager : labels.user}
          </div>
        </div>
        <div style={{ fontSize: 12, color: isShenkarTheme ? "rgba(240,253,250,0.88)" : "#cbd5e1" }}>
          {labels.userId}: {currentUserId}
        </div>
        <button
          onClick={() => setSection("schedule")}
          style={{
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: 14,
            border:
              (isCinema || isShenkarTheme) && section === "schedule"
                ? "1px solid transparent"
                : "none",
            background:
              section === "schedule"
                ? isCinema
                  ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                  : isShenkarTheme
                    ? "linear-gradient(135deg,#2f7c7e,#4ea8a4)"
                  : "#1d4ed8"
                : "transparent",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
            boxShadow:
              section === "schedule"
                ? isCinema
                  ? "0 14px 30px rgba(79,70,229,0.22)"
                  : isShenkarTheme
                    ? "0 14px 30px rgba(47,124,126,0.18)"
                    : "none"
                : "none",
          }}
        >
          My Schedule
        </button>
        <button
          onClick={() => setSection("search")}
          style={{
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: 14,
            border:
              (isCinema || isShenkarTheme) && section === "search"
                ? "1px solid transparent"
                : "none",
            background:
              section === "search"
                ? isCinema
                  ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                  : isShenkarTheme
                    ? "linear-gradient(135deg,#2f7c7e,#4ea8a4)"
                  : "#1d4ed8"
                : "transparent",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
            boxShadow:
              section === "search"
                ? isCinema
                  ? "0 14px 30px rgba(79,70,229,0.22)"
                  : isShenkarTheme
                    ? "0 14px 30px rgba(47,124,126,0.18)"
                    : "none"
                : "none",
          }}
        >
          {role === "user" ? `My ${labels.resources}` : `Find ${labels.resource}`}
        </button>
        {role === "manager" && (
          <button
            onClick={() => setSection("requests")}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 14,
              border:
                (isCinema || isShenkarTheme) && section === "requests"
                  ? "1px solid transparent"
                  : "none",
              background:
                section === "requests"
                  ? isCinema
                    ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                    : isShenkarTheme
                      ? "linear-gradient(135deg,#2f7c7e,#4ea8a4)"
                    : "#1d4ed8"
                  : "transparent",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 800,
              boxShadow:
                section === "requests"
                  ? isCinema
                    ? "0 14px 30px rgba(79,70,229,0.22)"
                    : isShenkarTheme
                      ? "0 14px 30px rgba(47,124,126,0.18)"
                      : "none"
                  : "none",
            }}
          >
            {`${labels.resource} ${labels.requests}`}
          </button>
        )}
        <button
          onClick={() => setSection("notifications")}
          style={{
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: 14,
            border:
              (isCinema || isShenkarTheme) && section === "notifications"
                ? "1px solid transparent"
                : "none",
            background:
              section === "notifications"
                ? isCinema
                  ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                  : isShenkarTheme
                    ? "linear-gradient(135deg,#2f7c7e,#4ea8a4)"
                  : "#1d4ed8"
                : "transparent",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontWeight: 800,
            boxShadow:
              section === "notifications"
                ? isCinema
                  ? "0 14px 30px rgba(79,70,229,0.22)"
                  : isShenkarTheme
                    ? "0 14px 30px rgba(47,124,126,0.18)"
                    : "none"
                : "none",
          }}
        >
          <span>{role === "user" ? "Notifications" : "Request Updates"}</span>
          {unreadNotificationCount > 0 && role === "user" && (
            <span
              style={{
                minWidth: 22,
                height: 22,
                borderRadius: 999,
                background: "#ef4444",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 6px",
              }}
            >
              {unreadNotificationCount}
            </span>
          )}
        </button>
        {role === "manager" && (
          <button
            onClick={() => setSection("availability")}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 14,
              border:
                (isCinema || isShenkarTheme) && section === "availability"
                  ? "1px solid transparent"
                  : "none",
              background:
                section === "availability"
                  ? isCinema
                    ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                    : isShenkarTheme
                      ? "linear-gradient(135deg,#2f7c7e,#4ea8a4)"
                    : "#971dd8ff"
                  : "transparent",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 800,
              boxShadow:
                section === "availability"
                  ? isCinema
                    ? "0 14px 30px rgba(79,70,229,0.22)"
                    : isShenkarTheme
                      ? "0 14px 30px rgba(47,124,126,0.18)"
                      : "none"
                  : "none",
            }}
          >
            My Availability
          </button>
        )}
        <button
          onClick={handleLogout}
          style={{
            marginTop: 8,
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: 14,
            border: isCinema
              ? "1px solid rgba(196,181,253,0.2)"
              : isShenkarTheme
                ? "1px solid rgba(233,250,246,0.18)"
                : "1px solid #1e293b",
            background: isCinema
              ? "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(196,181,253,0.06))"
              : isShenkarTheme
                ? "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.08))"
                : "#0b1120",
            color: "#e2e8f0",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Sign out
        </button>
        <div style={{ marginTop: "auto", fontSize: 12, color: isShenkarTheme ? "rgba(236,253,250,0.72)" : "#94a3b8" }}>
          Powered by SmartAllocate
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {section === "schedule" ? (
          <>
            <header
              style={{
                padding: isShenkarTheme ? "16px 18px" : "12px 0",
                borderBottom: isShenkarTheme ? "none" : "1px solid #e2e8f0",
                marginBottom: 18,
                borderRadius: isShenkarTheme ? 22 : 0,
                background: isShenkarTheme
                  ? "linear-gradient(180deg,#ffffff 0%,#f7fbfa 100%)"
                  : undefined,
                border: isShenkarTheme ? "1px solid #d7e4e1" : undefined,
                boxShadow: isShenkarTheme
                  ? "0 16px 34px rgba(15,23,42,0.05)"
                  : undefined,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>
                {isCinema ? "My Screenings" : "My Schedule"}
              </h1>
              <p style={{ margin: 0, color: "#475569" }}>
                {isCinema
                  ? "Follow your upcoming screenings in month or list view."
                  : `Month or list view of your ${labelsLower.resources}.`}
              </p>
            </header>

            <div
              className="glass"
              style={{
                padding: isShenkarTheme ? 18 : 16,
                borderRadius: isShenkarTheme ? 22 : 18,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                border: isShenkarTheme ? "1px solid #d7e4e1" : undefined,
                boxShadow: isShenkarTheme ? "0 16px 34px rgba(15,23,42,0.05)" : undefined,
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <h3 style={{ margin: 0, color: "#0f172a" }}>My {labels.resources}</h3>
                <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
                  Search by {labelsLower.resource} or tag. Switch between month grid and list.
                </p>
              </div>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search..."
                style={{
                  width: 220,
                  padding: "11px 14px",
                  borderRadius: 14,
                  border: "1px solid #d7e4e1",
                  background: "#fff",
                  color: "#0f172a",
                  boxShadow: "inset 0 1px 2px rgba(15,23,42,0.04)",
                }}
              />
              <div
                className="glass"
                style={{
                  display: "flex",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid #d7e4e1",
                  background: "#f8fbfb",
                }}
              >
                {[
                  { key: "month", label: "Month" },
                  { key: "list", label: "List" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setViewMode(opt.key)}
                    style={{
                      padding: "10px 16px",
                      border: "none",
                      background:
                        viewMode === opt.key
                          ? isShenkarTheme
                            ? "linear-gradient(135deg,#e8f6f3,#d8efea)"
                            : "rgba(37,99,235,0.1)"
                          : "transparent",
                      color: viewMode === opt.key && isShenkarTheme ? "#1f5d5c" : "#0f172a",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {scheduleBookings.length === 0 && !loading ? (
              <div
                className="glass"
                style={{
                  marginTop: 18,
                  padding: 16,
                  borderRadius: 16,
                  color: "#475569",
                  textAlign: "center",
                }}
              >
                No {labelsLower.resources} yet. Enter an ID and click "Load bookings".
              </div>
            ) : (
              <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
                {viewMode === "month" ? (
                  <MonthGrid
                    monthLabel={monthLabel}
                    isShenkarResponsible={isShenkarTheme}
                    onPrev={() =>
                      setMonthDate(
                        (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                      )
                    }
                    onNext={() =>
                      setMonthDate(
                        (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                      )
                    }
                    days={monthDays}
                    renderBooking={(b) => {
                      const past = isPastBooking(b);
                      const roomLine = getBookingRoomLine(b);
                      return (
                        <div
                          className={isShenkarTheme ? "month-booking-card shenkar-booking-card" : "month-booking-card"}
                          style={{
                            padding: "10px 11px",
                            borderRadius: 14,
                            background: isShenkarTheme
                              ? "linear-gradient(180deg,#edf2f5 0%,#d7e0e6 100%)"
                              : "linear-gradient(135deg,#2563eb,#1d4ed8)",
                            color: isShenkarTheme ? "#0f172a" : "#fff",
                            fontSize: 12,
                            boxShadow: isShenkarTheme
                              ? "0 14px 28px rgba(15,23,42,0.12)"
                              : "0 6px 18px rgba(37,99,235,0.25)",
                            border: isShenkarTheme ? "1px solid #c7d1d8" : "none",
                            display: "grid",
                            gap: 6,
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              insetInlineStart: 0,
                              top: 0,
                              bottom: 0,
                              width: 4,
                              borderRadius: "14px 0 0 14px",
                              background: isShenkarTheme
                                ? "linear-gradient(180deg,#5fa7a4,#2f7c7e)"
                                : "rgba(255,255,255,0.5)",
                            }}
                          />
                          <div className="month-booking-title" style={{ fontWeight: 800, paddingInlineStart: 6 }}>
                            {getBookingResources(b)
                              .map((r) => r.name)
                              .filter(Boolean)
                              .join(" / ")}
                          </div>
                          <div
                            className="month-booking-time"
                            style={{
                              opacity: isShenkarTheme ? 1 : 0.9,
                              color: isShenkarTheme ? "#334155" : undefined,
                              paddingInlineStart: 6,
                              fontWeight: 700,
                            }}
                          >
                            {formatTime(b.start_time)} - {formatTime(b.end_time)}
                          </div>
                          {roomLine && (
                            <div
                              className="month-booking-location"
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: isShenkarTheme ? "#475569" : undefined,
                                paddingInlineStart: 6,
                                lineHeight: 1.45,
                              }}
                            >
                              {roomLine}
                            </div>
                          )}
                          {role === "manager" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCancelDialog(b);
                              }}
                              disabled={past}
                              style={{
                                marginTop: 2,
                                padding: "4px 6px",
                                borderRadius: 8,
                                border: isShenkarResponsible
                                  ? "1px solid #cbd5db"
                                  : "1px solid rgba(255,255,255,0.6)",
                                background: past
                                  ? (isShenkarResponsible ? "#e5eaee" : "rgba(255,255,255,0.3)")
                                  : "#fff",
                                color: past
                                  ? (isShenkarResponsible ? "#94a3b8" : "#e2e8f0")
                                  : (isShenkarResponsible ? "#475569" : "#1d4ed8"),
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: past ? "not-allowed" : "pointer",
                                justifySelf: "start",
                              }}
                            >
                              Cancel {labelsLower.resource}
                            </button>
                          )}
                        </div>
                      );
                    }}
                  />
                ) : (
                  <>
                    <Section
                      title="Upcoming"
                      color="#2563eb"
                      items={upcoming}
                      role={role}
                      labels={labels}
                      labelsLower={labelsLower}
                      onCancel={openCancelDialog}
                    />
                    <Section
                      title="Past"
                      color="#94a3b8"
                      items={past}
                      role={role}
                      labels={labels}
                      labelsLower={labelsLower}
                      onCancel={openCancelDialog}
                    />
                  </>
                )}
              </div>
            )}
          </>
        ) : section === "search" ? (
          <>
            <header
              style={{
                padding: isShenkarTheme ? "16px 18px" : "12px 0",
                borderBottom: isShenkarTheme ? "none" : "1px solid #e2e8f0",
                marginBottom: 18,
                borderRadius: isShenkarTheme ? 22 : 0,
                background: isShenkarTheme
                  ? "linear-gradient(180deg,#ffffff 0%,#f7fbfa 100%)"
                  : undefined,
                border: isShenkarTheme ? "1px solid #d7e4e1" : undefined,
                boxShadow: isShenkarTheme
                  ? "0 16px 34px rgba(15,23,42,0.05)"
                  : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 18,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ maxWidth: 720 }}>
                  {isShenkarTheme && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 11px",
                        borderRadius: 999,
                        background: "#f2faf8",
                        color: "#216b68",
                        border: "1px solid #cbe6e0",
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        marginBottom: 12,
                      }}
                    >
                      Resource Explorer
                    </div>
                  )}
                  <h1 style={{ margin: 0, color: "#0f172a", fontSize: isShenkarTheme ? 40 : undefined, lineHeight: isShenkarTheme ? 1.05 : undefined }}>
                    {isCinema ? "Seat Explorer" : `Find a ${labelsLower.resource}`}
                  </h1>
                  <p style={{ margin: "10px 0 0", color: "#475569", fontSize: isShenkarTheme ? 16 : undefined, maxWidth: 680 }}>
                    {isCinema
                      ? role === "user"
                        ? "Browse available seats in the hall and inspect their booking sessions."
                        : "Search seats by row, number, hall, or metadata to manage assignments."
                      : role === "user"
                        ? `Browse all ${labelsLower.resources}, then expand one to see your assignments.`
                        : "Search by name or tags, then expand any result to review your assigned dates and times."}
                  </p>
                </div>
                {isShenkarTheme && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(150px, 1fr))",
                      gap: 10,
                      minWidth: 320,
                      flex: "1 1 320px",
                      maxWidth: 380,
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 18,
                        background: "#ffffff",
                        border: "1px solid #dcebe8",
                        boxShadow: "0 10px 22px rgba(15,23,42,0.04)",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#6b7f7d", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                        Search Focus
                      </div>
                      <div style={{ marginTop: 8, color: "#0f172a", fontWeight: 800 }}>
                        Rooms, labs, projectors, courses
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 18,
                        background: "#fcfefd",
                        border: "1px solid #dcebe8",
                        boxShadow: "0 10px 22px rgba(15,23,42,0.04)",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#6b7f7d", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                        Search Tip
                      </div>
                      <div style={{ marginTop: 8, color: "#0f172a", fontWeight: 800 }}>
                        Try building names or room numbers
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </header>

            <div
              className="glass"
              style={{
                padding: isShenkarTheme ? 20 : 16,
                borderRadius: isShenkarTheme ? 24 : 18,
                border: isShenkarTheme ? "1px solid #d7e4e1" : undefined,
                boxShadow: isShenkarTheme ? "0 18px 36px rgba(15,23,42,0.06)" : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <input
                  value={resourceQuery}
                  onChange={(e) => setResourceQuery(e.target.value)}
                  placeholder={isCinema ? "e.g. seat A12, row B, hall 1, VIP..." : "e.g. projector, room 103, prep station..."}
                  style={{
                    flex: 1,
                    minWidth: 280,
                    padding: isShenkarTheme ? "14px 16px" : "10px 12px",
                    borderRadius: isShenkarTheme ? 16 : 12,
                    border: isShenkarTheme ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                    boxShadow: isShenkarTheme ? "inset 0 1px 2px rgba(15,23,42,0.04)" : undefined,
                  }}
                />
                <button
                  onClick={() => loadResources({ allowEmptyQuery: role === "user" })}
                  disabled={resourceLoading}
                  style={{
                    padding: isShenkarTheme ? "13px 22px" : "10px 16px",
                    borderRadius: isShenkarTheme ? 16 : 12,
                    border: "none",
                    background: resourceLoading
                      ? "#94a3b8"
                      : isShenkarTheme
                        ? "linear-gradient(135deg,#2f7c7e,#4ea8a4)"
                        : "linear-gradient(135deg, rgb(79, 70, 229), rgb(124, 58, 237))",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: resourceLoading ? "default" : "pointer",
                    boxShadow: isShenkarTheme
                      ? "0 10px 30px rgba(47,124,126,0.22)"
                      : "0 10px 30px rgba(37,99,235,0.25)",
                  }}
                >
                  {resourceLoading ? "Searching..." : "Search"}
                </button>
              </div>
              {role !== "user" &&
                resourceQuery.trim() &&
                filteredResources.length === 0 &&
                !resourceLoading && (
                  <div
                    style={{
                      marginTop: 18,
                      color: "#475569",
                      borderRadius: 18,
                      border: isShenkarTheme ? "1px dashed #d7e4e1" : "1px dashed #e2e8f0",
                      background: isShenkarTheme ? "#f8fbfb" : "#fff",
                      padding: 20,
                      textAlign: "center",
                    }}
                  >
                    No matches found. Try another keyword.
                  </div>
                )}
              {selectedResource ? (
                <div
                  style={{
                    marginTop: 18,
                    padding: 18,
                    borderRadius: 18,
                    background: isShenkarResponsible
                      ? "linear-gradient(180deg,#ffffff 0%,#f4fbfa 100%)"
                      : "linear-gradient(180deg,#ffffff 0%,#f5f3ff 100%)",
                    border: `1px solid ${isShenkarResponsible ? "#d8ece7" : "#ddd6fe"}`,
                  }}
                >
                  <button
                    onClick={() => setSelectedResourceId(null)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 14,
                      cursor: "pointer",
                      marginBottom: 12,
                      ...(isShenkarResponsible
                        ? shenkarResponsibleSecondaryButton
                        : cinemaSecondaryButton),
                    }}
                  >
                    Back to results
                  </button>

                  <div
                    className="glass"
                    style={{
                      padding: 20,
                      borderRadius: 22,
                      border: `1px solid ${isShenkarResponsible ? "#d8ece7" : "#ddd6fe"}`,
                      background: "#fff",
                      display: "grid",
                      gap: 18,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            color: isShenkarResponsible ? "#0f766e" : "#7c3aed",
                            textTransform: "uppercase",
                            letterSpacing: "0.14em",
                            fontWeight: 800,
                          }}
                        >
                          {isShenkarResponsible ? "Assigned sessions" : "Hall overview"}
                        </div>
                        <div
                          style={{
                            fontSize: 28,
                            fontWeight: 900,
                            color: "#0f172a",
                            marginTop: 4,
                          }}
                        >
                          {selectedResource.name}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: 12,
                          background: isShenkarResponsible ? "#ecfdfa" : "#ede9fe",
                          color: isShenkarResponsible ? "#0f766e" : "#5b21b6",
                          padding: "8px 12px",
                          borderRadius: 999,
                          fontWeight: 800,
                        }}
                      >
                        {formatTypeLabel(selectedResource.type_name, labels)}
                      </span>
                    </div>
                    {getResourcePreviewDetails(selectedResource) && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        {getResourcePreviewDetails(selectedResource)
                          .split(" | ")
                          .filter(Boolean)
                          .map((detail) => (
                            <span
                              key={detail}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 999,
                                border: `1px solid ${isShenkarResponsible ? "#bfe3dc" : "#ddd6fe"}`,
                                background: isShenkarResponsible ? "#f3fbf9" : "#faf5ff",
                                color: isShenkarResponsible ? "#216b68" : "#5b21b6",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {detail}
                            </span>
                          ))}
                        <span
                          style={{
                            padding: "8px 12px",
                            borderRadius: 999,
                            border: `1px solid ${isShenkarResponsible ? "#d8ece7" : "#e9d5ff"}`,
                            background: "#ffffff",
                            color: "#475569",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Resource ID: {selectedResource.id}
                        </span>
                      </div>
                    )}

                    {isShenkarResponsible ? (
                      <div
                        style={{
                          borderRadius: 22,
                          border: "1px solid #d8ece7",
                          background: "linear-gradient(180deg,#ffffff 0%,#f4fbfa 100%)",
                          padding: 20,
                        }}
                      >
                        {selectedResourceSessions.length === 0 ? (
                          <div
                            style={{
                              padding: "18px 16px",
                              borderRadius: 18,
                              border: "1px dashed #c7e5df",
                              background: "#f8fcfb",
                              color: "#475569",
                              textAlign: "center",
                            }}
                          >
                            No bookings assigned to you for this resource.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 12 }}>
                            {selectedResourceSessions.map((session) => (
                              <div
                                key={`${selectedResource.id}-${session.bookingId}-${session.date}-${session.start}`}
                                style={{
                                  padding: 16,
                                  borderRadius: 18,
                                  border: "1px solid #d8ece7",
                                  background: "#ffffff",
                                  boxShadow: "0 10px 24px rgba(20,83,78,0.05)",
                                  display: "grid",
                                  gap: 6,
                                }}
                              >
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                                  <span
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      background: "#ecfdfa",
                                      color: "#0f766e",
                                      fontSize: 12,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {formatDate(session.date)}
                                  </span>
                                  <span style={{ color: "#0f172a", fontWeight: 700 }}>
                                    {formatTime(session.start)} - {formatTime(session.end)}
                                  </span>
                                  {session.role && (
                                    <span style={{ color: "#64748b", fontSize: 12 }}>
                                      Role: {session.role}
                                    </span>
                                  )}
                                </div>
                                <div style={{ color: "#64748b", fontSize: 12 }}>
                                  Booking ID: {session.bookingId}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          borderRadius: 22,
                          border: "1px solid #ddd6fe",
                          background: "linear-gradient(180deg,#ffffff 0%,#f5f3ff 100%)",
                          padding: 20,
                          maxWidth: 1180,
                          width: "100%",
                          margin: "0 auto",
                        }}
                      >
                      <div
                        style={{
                          textAlign: "center",
                          padding: "16px 18px",
                          borderRadius: 18,
                          background: "linear-gradient(180deg,#f8fafc,#e2e8f0)",
                          fontWeight: 900,
                          letterSpacing: "0.16em",
                          color: "#312e81",
                          marginBottom: 18,
                          maxWidth: 980,
                          width: "100%",
                          marginLeft: "auto",
                          marginRight: "auto",
                        }}
                      >
                        SCREEN
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          flexWrap: "wrap",
                          marginBottom: 22,
                          justifyContent: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            background: "#ecfdf5",
                            border: "1px solid #86efac",
                            color: "#166534",
                            padding: "8px 12px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: "#22c55e",
                              display: "inline-block",
                            }}
                          />
                          Your seat
                        </div>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            background: "#fef3c7",
                            border: "1px solid #fcd34d",
                            color: "#92400e",
                            padding: "8px 12px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: "#facc15",
                              display: "inline-block",
                            }}
                          />
                          Focus / center seat
                        </div>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            background: "#fef2f2",
                            border: "1px solid #fca5a5",
                            color: "#991b1b",
                            padding: "8px 12px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: "#fca5a5",
                              display: "inline-block",
                            }}
                          />
                          Broken seat
                        </div>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            background: "#f5f3ff",
                            border: "1px solid #c4b5fd",
                            color: "#5b21b6",
                            padding: "8px 12px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: "#c4b5fd",
                              display: "inline-block",
                            }}
                          />
                          Available seat
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 14,
                          overflowX: "auto",
                          paddingBottom: 4,
                          justifyContent: "center",
                        }}
                      >
                        {getHallSeatRows(selectedResource).map(({ rowLabel, items }) => {
                          const sections = splitSeatRowIntoSections(items);
                          const userSeatIds = getUserSeatIdsForHall(selectedResource, bookings);

                          return (
                            <div
                              key={rowLabel}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "64px auto",
                                gap: 14,
                                alignItems: "center",
                                minWidth: "max-content",
                                margin: "0 auto",
                              }}
                            >
                              <div
                                style={{
                                  height: 38,
                                  width: 56,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 12,
                                  background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
                                  color: "#fff",
                                  fontWeight: 900,
                                  boxShadow: "0 10px 24px rgba(79,70,229,0.18)",
                                  flex: "0 0 auto",
                                }}
                              >
                                {rowLabel}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "flex-start",
                                  gap: 18,
                                  flexWrap: "nowrap",
                                  minWidth: "max-content",
                                }}
                              >
                                {[sections.left, sections.center, sections.right].map(
                                  (sectionItems, sectionIdx) => (
                                    <React.Fragment key={`${rowLabel}-${sectionIdx}`}>
                                      {sectionItems.length > 0 && (
                                        <div
                                          style={{
                                            display: "grid",
                                            gridAutoFlow: "column",
                                            gridAutoColumns: "36px",
                                            gap: 8,
                                          }}
                                        >
                                          {sectionItems.map((seat) => {
                                            const seatId = String(
                                              seat?.seatId || `${seat?.row || ""}${seat?.number || ""}`
                                            );
                                            const isMine = userSeatIds.has(seatId);
                                            const isBroken = Boolean(seat?.isBroken);
                                            const isFocus =
                                              seat?.section === "center" ||
                                              seat?.section === "front_center";

                                            return (
                                              <div
                                                key={seatId}
                                                title={`${selectedResource.name} • Seat ${seatId}`}
                                                style={{
                                                  width: 36,
                                                  height: 36,
                                                  borderRadius: 12,
                                                  display: "flex",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                  fontSize: 11,
                                                  fontWeight: 900,
                                                  color: isMine
                                                    ? "#14532d"
                                                    : isBroken
                                                      ? "#991b1b"
                                                      : isFocus
                                                        ? "#92400e"
                                                        : "#312e81",
                                                  background: isMine
                                                    ? "linear-gradient(180deg,#bbf7d0,#86efac)"
                                                    : isBroken
                                                      ? "linear-gradient(180deg,#fee2e2,#fecaca)"
                                                      : isFocus
                                                        ? "linear-gradient(180deg,#fef3c7,#fde68a)"
                                                        : "linear-gradient(180deg,#ede9fe,#ddd6fe)",
                                                  border: isMine
                                                    ? "1px solid #22c55e"
                                                    : isBroken
                                                      ? "1px solid #fca5a5"
                                                      : isFocus
                                                        ? "1px solid #fcd34d"
                                                        : "1px solid #c4b5fd",
                                                  boxShadow: isMine
                                                    ? "0 10px 20px rgba(34,197,94,0.18)"
                                                    : isBroken
                                                      ? "0 10px 20px rgba(239,68,68,0.12)"
                                                      : isFocus
                                                        ? "0 10px 20px rgba(250,204,21,0.18)"
                                                        : "0 10px 20px rgba(109,40,217,0.12)",
                                                }}
                                              >
                                                {seat?.number}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {sectionIdx < 2 && sections.center.length > 0 && (
                                        <div
                                          style={{
                                            width: 16,
                                            height: 52,
                                            borderRadius: 999,
                                            background: "rgba(148,163,184,0.2)",
                                            flex: "0 0 auto",
                                          }}
                                        />
                                      )}
                                    </React.Fragment>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  {filteredResources.map((r) => {
                    const userSeats = getUserSeatIdsForHall(r, bookings);
                    const assignedSessions = resourceSessions[r.id] || [];

                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedResourceId(r.id)}
                        style={{
                          padding: isShenkarTheme ? 20 : 16,
                          border: isShenkarTheme ? "1px solid #d7e4e1" : "1px solid #e5e7eb",
                          borderRadius: isShenkarTheme ? 22 : 12,
                          marginBottom: 12,
                          cursor: "pointer",
                          background: isShenkarTheme
                            ? "linear-gradient(135deg,#ffffff 0%,#f8fbfb 100%)"
                            : "#fff",
                          boxShadow: isShenkarTheme
                            ? "0 18px 34px rgba(15,23,42,0.06)"
                            : "none",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                          }}
                        >
                            <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, color: "#0f172a", fontSize: isShenkarTheme ? 24 : undefined }}>
                              {r.name}
                            </div>
                            <div style={{ fontSize: 13, color: "#5b726f", marginTop: 4 }}>
                              {r.type_name ? formatTypeLabel(r.type_name, labels) : labels.resource}
                            </div>
                          </div>
                          {isShenkarTheme && (
                            <div
                              style={{
                                padding: "8px 12px",
                                borderRadius: 999,
                                background: "#ecf7f5",
                                border: "1px solid #cde4df",
                                color: "#256b68",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {assignedSessions.length > 0
                                ? `${assignedSessions.length} assigned session${assignedSessions.length > 1 ? "s" : ""}`
                                : "No assigned sessions"}
                            </div>
                          )}
                        </div>
                        {isShenkarTheme && getResourcePreviewDetails(r) && (
                          <div style={{ color: "#64748b", fontSize: 13 }}>
                            {getResourcePreviewDetails(r)}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "#666" }}>
                          {isShenkarTheme
                            ? "Open to review your dates, times, and assignment details."
                            : userSeats.size > 0
                              ? `${userSeats.size} seats yours`
                              : "No seats assigned"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>

        ) : section === "requests" ? (
          <>
            <header
              style={
                isShenkarResponsible
                  ? responsibleHeaderCardStyle
                  : {
                      padding: "12px 0",
                      borderBottom: "1px solid #e2e8f0",
                      marginBottom: 16,
                    }
              }
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>
                Request a {labelsLower.resource}
              </h1>
              <p style={{ margin: 0, color: "#475569" }}>
                Browse {labelsLower.resources} and send a request to your admin.
              </p>
            </header>

            {requestSent && (
              <div
                className="glass"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  color: "#166534",
                  marginBottom: 12,
                }}
              >
                {requestSent}
              </div>
            )}

            {requestView === "form" ? (
              <div
                className="glass"
                style={{
                  padding: 18,
                  borderRadius: 18,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>
                      Request details
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                      Fill in the request and send it to your admin.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setRequestView("list");
                      setRequestResourceId(null);
                      setRequestError("");
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 14,
                      cursor: "pointer",
                      ...(isShenkarResponsible
                        ? shenkarResponsibleSecondaryButton
                        : isCinema
                        ? cinemaSecondaryButton
                        : {
                            border: "1px solid #e2e8f0",
                            background: "#fff",
                            color: "#0f172a",
                            fontWeight: 700,
                          }),
                    }}
                  >
                    Back to {labels.resources}
                  </button>
                </div>

                {selectedRequestResource ? (
                  <>
                    <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>
                      {selectedRequestResource.name}{" "}
                      {selectedRequestResource.type_name
                        ? `(${formatTypeLabel(selectedRequestResource.type_name, labels)})`
                        : ""}
                    </div>
                    {requestError && (
                      <div style={{ marginTop: 10, color: "#b91c1c" }}>
                        {requestError}
                      </div>
                    )}
                    <textarea
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder="Reason for the request..."
                      disabled={requestSubmitting}
                      style={{
                        width: "100%",
                        minHeight: 110,
                        marginTop: 10,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        color: "#0f172a",
                      }}
                    />
                    <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                      <button
                        onClick={submitResourceRequest}
                        disabled={requestSubmitting}
                        style={{
                          padding: "12px 18px",
                          borderRadius: 16,
                          cursor: requestSubmitting ? "default" : "pointer",
                          ...(requestSubmitting
                            ? {
                              border: "none",
                              background: "#94a3b8",
                              color: "#fff",
                              fontWeight: 800,
                          boxShadow: "none",
                        }
                        : isShenkarResponsible
                          ? shenkarResponsiblePrimaryButton
                          : isCinema
                          ? cinemaPrimaryButton
                          : {
                              border: "none",
                              background: "#2563eb",
                              color: "#fff",
                              fontWeight: 700,
                            }),
                        }}
                      >
                        {requestSubmitting ? "Sending..." : "Send request"}
                      </button>
                      <button
                        onClick={() => {
                          setRequestResourceId(null);
                          setRequestView("list");
                          setRequestError("");
                        }}
                        disabled={requestSubmitting}
                        style={{
                          marginTop: 2,
                          padding: "6px 10px",
                          borderRadius: 10,
                          cursor: requestSubmitting ? "default" : "pointer",
                          ...(isShenkarResponsible
                            ? shenkarResponsibleSecondaryButton
                            : isCinema
                            ? cinemaSecondaryButton
                            : {
                                border: "1px solid #dbe5ea",
                                background: "#fff",
                                color: "#475569",
                                fontWeight: 700,
                              }),
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 12, color: "#475569" }}>
                    Pick a {labelsLower.resource} to continue.
                  </div>
                )}
              </div>
            ) : (
              <div
                className="glass"
                style={{
                  padding: 16,
                  borderRadius: 18,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <input
                    value={requestQuery}
                    onChange={(e) => setRequestQuery(e.target.value)}
                    placeholder={`Search ${labelsLower.resources}...`}
                    style={{
                      flex: 1,
                      minWidth: 240,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#0f172a",
                    }}
                  />
                  <label style={{ display: "flex", gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={onlyAvailable}
                      onChange={(e) => setOnlyAvailable(e.target.checked)}
                    />
                    Only available
                  </label>
                  <button
                    onClick={() => loadResources({ allowEmptyQuery: true })}
                    disabled={resourceLoading}
                    style={{
                      padding: "12px 18px",
                      borderRadius: 16,
                      cursor: resourceLoading ? "default" : "pointer",
                      ...(resourceLoading
                        ? {
                          border: "none",
                          background: "#94a3b8",
                          color: "#fff",
                          fontWeight: 800,
                          boxShadow: "none",
                        }
                        : isShenkarResponsible
                          ? shenkarResponsiblePrimaryButton
                          : isCinema
                          ? cinemaPrimaryButton
                          : {
                              border: "none",
                              background: "#2563eb",
                              color: "#fff",
                              fontWeight: 700,
                              boxShadow: "0 10px 30px rgba(37,99,235,0.25)",
                            }),
                    }}
                  >
                    {resourceLoading ? "Loading..." : `Load ${labelsLower.resources}`}
                  </button>
                </div>

                {resourceError && (
                  <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
                    {resourceError}
                  </div>
                )}

                {resources.length === 0 && !resourceLoading && (
                  <div style={{ marginTop: 16, color: "#475569" }}>
                    Load {labelsLower.resources} to get started.
                  </div>
                )}

                {resources.length > 0 &&
                  filteredRequestResources.length === 0 &&
                  !resourceLoading && (
                    <div style={{ marginTop: 16, color: "#475569" }}>
                      No {labelsLower.resources} match your filters.
                    </div>
                  )}

                {filteredRequestResources.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {filteredRequestResources.map((r) => {
                      const available = isResourceAvailable(r);
                      return (
                        <div
                          key={r.id}
                          className="glass"
                          style={{
                            borderRadius: 18,
                            padding: 16,
                            border: isCinema
                                ? "1px solid #d1d5db"
                                : "1px solid #e2e8f0",
                            background: "#fff",
                            display: "grid",
                            gap: 10,
                            boxShadow: isCinema
                                ? "0 10px 24px rgba(15,23,42,0.06)"
                                : "none",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, color: "#0f172a" }}>{r.name}</div>
                              <div style={{ color: "#475569", fontSize: 12 }}>
                                {r.type_name
                                  ? `Type: ${formatTypeLabel(r.type_name, labels)}`
                                  : labels.resource}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openAvailability(r)}
                              style={{
                                fontSize: 12,
                                padding: "8px 12px",
                                borderRadius: 999,
                                fontWeight: 800,
                                cursor: "pointer",
                                ...(isShenkarResponsible
                                  ? available
                                    ? {
                                        border: "1px solid #bfe3dc",
                                        background: "#eef8f6",
                                        color: "#216b68",
                                        boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                                      }
                                    : {
                                        border: "1px solid #d7e4e1",
                                        background: "#f8fbfb",
                                        color: "#54716f",
                                        boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                                      }
                                  : isCinema
                                  ? available
                                    ? {
                                        border: "1px solid #86efac",
                                        background: "#ecfdf5",
                                        color: "#166534",
                                        boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                                      }
                                    : cinemaSecondaryButton
                                  : {
                                      border: "none",
                                      background: available ? "#dcfce7" : "#e2e8f0",
                                      color: available ? "#166534" : "#475569",
                                    }),
                              }}
                            >
                              {available ? "Available" : "Check availability"}
                            </button>
                          </div>

                          {getResourcePreviewDetails(r) && (
                            <div style={{ color: "#64748b", fontSize: 12 }}>
                              {getResourcePreviewDetails(r)}
                            </div>
                          )}

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ color: "#475569", fontSize: 12 }}>Resource ID: {r.id}</div>
                            <button
                              onClick={() => {
                                setRequestResourceId(r.id);
                                setRequestSent("");
                                setRequestError("");
                                setRequestNote("");
                                setRequestView("form");
                              }}
                              style={{
                                padding: "12px 18px",
                                borderRadius: 16,
                                cursor: "pointer",
                                ...(isShenkarResponsible
                                  ? shenkarResponsiblePrimaryButton
                                  : isCinema
                                  ? cinemaPrimaryButton
                                  : {
                                      border: "none",
                                      background: "#0f172a",
                                      color: "#fff",
                                      fontWeight: 700,
                                    }),
                              }}
                            >
                              Request this {labelsLower.resource}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        ) : section === "availability" ? (
          <>
            <header
              style={{
                padding: isShenkarResponsible ? "16px 18px" : "12px 0",
                borderBottom: isShenkarResponsible ? "none" : "1px solid #e2e8f0",
                marginBottom: 18,
                borderRadius: isShenkarResponsible ? 22 : 0,
                background: isShenkarResponsible
                  ? "linear-gradient(180deg,#ffffff 0%,#f7fbfa 100%)"
                  : undefined,
                border: isShenkarResponsible ? "1px solid #d7e4e1" : undefined,
                boxShadow: isShenkarResponsible
                  ? "0 16px 34px rgba(15,23,42,0.05)"
                  : undefined,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>My Availability</h1>
              <p style={{ margin: "8px 0 0", color: "#475569" }}>
                Share the hours you can support so the admin can schedule your {labelsLower.resources}.
              </p>
            </header>

            {availabilityMessage && (
              <div
                className="glass"
                style={{
                  marginBottom: 16,
                  padding: 14,
                  borderRadius: 16,
                  color: isShenkarResponsible ? "#216b68" : "#1d4ed8",
                  border: isShenkarResponsible ? "1px solid #d7e4e1" : undefined,
                  background: isShenkarResponsible ? "#f6fbfa" : undefined,
                }}
              >
                {availabilityMessage}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isShenkarResponsible ? "minmax(0, 1.15fr) minmax(280px, 0.85fr)" : "minmax(0, 1fr)",
                gap: 18,
                alignItems: "start",
              }}
            >
              <div
                className="glass"
                style={{
                  padding: isShenkarResponsible ? 22 : 16,
                  borderRadius: isShenkarResponsible ? 24 : 16,
                  display: "grid",
                  gap: 16,
                  border: isShenkarResponsible ? "1px solid #d7e4e1" : undefined,
                  boxShadow: isShenkarResponsible ? "0 18px 38px rgba(15,23,42,0.06)" : undefined,
                }}
              >
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a", fontSize: isShenkarResponsible ? 28 : undefined }}>
                      Add availability
                    </div>
                    <div style={{ color: "#5d7370", fontSize: 14 }}>
                      Choose the days and time range you can cover, then optionally limit the range with start and end dates.
                    </div>
                  </div>
                  <label style={{ fontSize: 12, color: "#475569" }}>
                    Days of week
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 10,
                        marginTop: 10,
                      }}
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const checked = availabilityForm.day_of_week.includes(String(day));
                        return (
                          <label
                            key={day}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "11px 12px",
                              borderRadius: 14,
                              border: checked ? "1px solid #a9d7cf" : "1px solid #dbe5ea",
                              background: checked ? "#eff8f6" : "#fff",
                              color: checked ? "#185f5d" : "#0f172a",
                              boxShadow: checked ? "0 8px 16px rgba(47,124,126,0.08)" : "none",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setAvailabilityForm((prev) => {
                                  const exists = prev.day_of_week.includes(String(day));
                                  const nextDays = exists
                                    ? prev.day_of_week.filter((value) => value !== String(day))
                                    : [...prev.day_of_week, String(day)];
                                  return { ...prev, day_of_week: nextDays };
                                })
                              }
                            />
                            <span style={{ fontWeight: 700 }}>{weekdayLabel(day)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      Start time
                      <input
                        type="time"
                        value={availabilityForm.start_time}
                        onChange={(e) =>
                          setAvailabilityForm((prev) => ({
                            ...prev,
                            start_time: e.target.value,
                          }))
                        }
                        style={{
                          display: "block",
                          marginTop: 6,
                          padding: "11px 12px",
                          borderRadius: 12,
                          border: "1px solid #dbe5ea",
                          width: "100%",
                          background: "#fff",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      End time
                      <input
                        type="time"
                        value={availabilityForm.end_time}
                        onChange={(e) =>
                          setAvailabilityForm((prev) => ({
                            ...prev,
                            end_time: e.target.value,
                          }))
                        }
                        style={{
                          display: "block",
                          marginTop: 6,
                          padding: "11px 12px",
                          borderRadius: 12,
                          border: "1px solid #dbe5ea",
                          width: "100%",
                          background: "#fff",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      Start date (optional)
                      <IsraelDateInput
                        value={availabilityForm.start_date}
                        onChange={(nextDate) =>
                          setAvailabilityForm((prev) => ({
                            ...prev,
                            start_date: nextDate,
                          }))
                        }
                        style={{
                          display: "block",
                          marginTop: 6,
                          padding: "11px 12px",
                          borderRadius: 12,
                          border: "1px solid #dbe5ea",
                          width: "100%",
                          background: "#fff",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      End date (optional)
                      <IsraelDateInput
                        value={availabilityForm.end_date}
                        onChange={(nextDate) =>
                          setAvailabilityForm((prev) => ({
                            ...prev,
                            end_date: nextDate,
                          }))
                        }
                        style={{
                          display: "block",
                          marginTop: 6,
                          padding: "11px 12px",
                          borderRadius: 12,
                          border: "1px solid #dbe5ea",
                          width: "100%",
                          background: "#fff",
                        }}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={availabilitySaving}
                    onClick={async () => {
                      const userId = currentUserId.trim();
                      if (!userId) return;
                      if (!availabilityForm.day_of_week.length) {
                        setAvailabilityMessage("Choose at least one day.");
                        return;
                      }
                      setAvailabilitySaving(true);
                      setAvailabilityMessage("");
                      try {
                        const created = await Promise.all(
                          availabilityForm.day_of_week.map((day) =>
                            createUserAvailability({
                              user_id: userId,
                              day_of_week: Number(day),
                              start_time: availabilityForm.start_time,
                              end_time: availabilityForm.end_time,
                              start_date: availabilityForm.start_date || null,
                              end_date: availabilityForm.end_date || null,
                            })
                          )
                        );
                        setUserAvailability((prev) => [...prev, ...created]);
                        setAvailabilityMessage("Availability saved.");
                      } catch (err) {
                        setAvailabilityMessage(err?.message || "Failed to save availability.");
                      } finally {
                        setAvailabilitySaving(false);
                      }
                    }}
                    style={{
                      padding: "13px 18px",
                      borderRadius: 16,
                      cursor: availabilitySaving ? "default" : "pointer",
                      width: isShenkarResponsible ? "100%" : isCinema ? "fit-content" : undefined,
                      ...(availabilitySaving
                        ? {
                            border: "none",
                            background: "#94a3b8",
                            color: "#fff",
                            fontWeight: 800,
                            boxShadow: "none",
                          }
                        : isShenkarResponsible
                          ? shenkarResponsiblePrimaryButton
                          : isCinema
                            ? cinemaPrimaryButton
                            : {
                                border: "none",
                                background: "#1d4ed8",
                                color: "#fff",
                                fontWeight: 700,
                              }),
                    }}
                  >
                    {availabilitySaving ? "Saving..." : "Save availability"}
                  </button>
                </div>

              {isShenkarResponsible && (
                <div
                  className="glass"
                  style={{
                    padding: 22,
                    borderRadius: 24,
                    display: "grid",
                    gap: 14,
                    border: "1px solid #d7e4e1",
                    boxShadow: "0 18px 38px rgba(15,23,42,0.06)",
                    background: "linear-gradient(180deg,#ffffff 0%,#f8fbfb 100%)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#6b7f7d", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 800 }}>
                    Planning Guide
                  </div>
                  <div style={{ fontSize: 24, lineHeight: 1.12, fontWeight: 900, color: "#0f172a" }}>
                    Keep your schedule clear and easy to plan around.
                  </div>
                  <div style={{ color: "#5f7471", fontSize: 14, lineHeight: 1.6 }}>
                    Add recurring availability for the days you usually support, then use date limits for temporary schedule changes.
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      "Choose one or more weekdays for recurring support.",
                      "Set a clear start and end time window.",
                      "Use optional dates when availability applies only for part of the month.",
                    ].map((tip) => (
                      <div
                        key={tip}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 16,
                          border: "1px solid #dcebe8",
                          background: "#ffffff",
                          color: "#355552",
                          fontSize: 13,
                        }}
                      >
                        {tip}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              <h3 style={{ marginBottom: 10, color: "#0f172a", fontSize: isShenkarResponsible ? 32 : undefined }}>
                Saved availability
              </h3>
              {userAvailability.length === 0 ? (
                <div
                  className="glass"
                  style={{
                    padding: 18,
                    borderRadius: 18,
                    border: isShenkarResponsible ? "1px solid #d7e4e1" : undefined,
                    background: isShenkarResponsible ? "#fbfdfd" : undefined,
                  }}
                >
                  No availability saved yet.
                </div>
              ) : (
                <div className="grid-auto">
                  {userAvailability.map((slot) => (
                    <div
                      key={slot.id}
                      className="glass"
                      style={{
                        padding: isShenkarResponsible ? 18 : 12,
                        borderRadius: isShenkarResponsible ? 20 : 12,
                        border: isShenkarResponsible ? "1px solid #d7e4e1" : undefined,
                        background: isShenkarResponsible
                          ? "linear-gradient(135deg,#ffffff 0%,#f8fbfb 100%)"
                          : undefined,
                        boxShadow: isShenkarResponsible
                          ? "0 16px 30px rgba(15,23,42,0.05)"
                          : undefined,
                      }}
                    >
                      <div style={{ fontWeight: 800, color: "#0f172a", fontSize: isShenkarResponsible ? 18 : undefined }}>
                        {weekdayLabel(slot.day_of_week)}
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          marginTop: 8,
                          padding: "7px 10px",
                          borderRadius: 999,
                          background: isShenkarResponsible ? "#eef8f6" : "#f1f5f9",
                          border: isShenkarResponsible ? "1px solid #d4e7e2" : "1px solid #e2e8f0",
                          color: isShenkarResponsible ? "#216b68" : "#475569",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                      </div>
                      {(slot.start_date || slot.end_date) && (
                        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>
                          {slot.start_date ? formatDate(slot.start_date) : "Any date"} → {slot.end_date ? formatDate(slot.end_date) : "Any date"}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          setAvailabilityMessage("");
                          try {
                            await deleteUserAvailability(slot.id);
                            setUserAvailability((prev) =>
                              prev.filter((item) => item.id !== slot.id)
                            );
                          } catch (err) {
                            setAvailabilityMessage(
                              err?.message || "Failed to delete availability."
                            );
                          }
                        }}
                        style={{
                          marginTop: 14,
                          padding: "8px 12px",
                          borderRadius: 12,
                          ...(isShenkarResponsible
                            ? shenkarResponsibleSecondaryButton
                            : {
                                border: "1px solid #e2e8f0",
                                background: "#fff",
                                color: "#0f172a",
                              }),
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <header
              style={{
                padding: isShenkarResponsible ? "16px 18px" : "12px 0",
                borderBottom: isShenkarResponsible ? "none" : "1px solid #e2e8f0",
                marginBottom: 18,
                borderRadius: isShenkarResponsible ? 22 : 0,
                background: isShenkarResponsible
                  ? "linear-gradient(180deg,#ffffff 0%,#f7fbfa 100%)"
                  : undefined,
                border: isShenkarResponsible ? "1px solid #d7e4e1" : undefined,
                boxShadow: isShenkarResponsible
                  ? "0 16px 34px rgba(15,23,42,0.05)"
                  : undefined,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>
                {role === "user" ? "Notifications" : "Request Updates"}
              </h1>
              <p style={{ margin: 0, color: "#475569" }}>
                {role === "user"
                  ? `Updates from ${labelsLower.managers} about cancelled ${labelsLower.resource}.`
                  : "Track the status of allocation requests."}
              </p>
            </header>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: role === "user" ? 14 : 0,
              }}
            >
              {role === "user" && (
                <button
                  type="button"
                  onClick={() => setNotificationTab("announcements")}
                  style={{
                    padding: "12px 18px",
                    borderRadius: 16,
                    cursor: "pointer",
                    ...(notificationTab === "announcements"
                      ? isShenkarTheme
                        ? shenkarResponsiblePrimaryButton
                        : isCinema
                        ? cinemaPrimaryButton
                        : {
                            border: "1px solid #e2e8f0",
                            background: "#2563eb",
                            color: "#fff",
                            fontWeight: 700,
                          }
                      : isShenkarTheme
                        ? shenkarResponsibleSecondaryButton
                      : isCinema
                        ? cinemaSecondaryButton
                        : {
                            border: "1px solid #e2e8f0",
                            background: "#fff",
                            color: "#0f172a",
                            fontWeight: 700,
                          }),
                  }}
                >
                  {labels.manager} Messages
                </button>
              )}
            </div>

            <div
              className="glass"
              style={{
                padding: isShenkarResponsible ? 20 : 16,
                borderRadius: isShenkarResponsible ? 24 : 18,
                border: isShenkarResponsible ? "1px solid #d7e4e1" : undefined,
                boxShadow: isShenkarResponsible ? "0 18px 36px rgba(15,23,42,0.06)" : undefined,
                display:
                  role === "manager" && notificationTab === "requests"
                    ? "block"
                    : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <input
                  value={userRequestsQuery}
                  onChange={(e) => setUserRequestsQuery(e.target.value)}
                  placeholder={`Search by ${labelsLower.resource}, date, or status...`}
                  style={{
                    flex: 1,
                    minWidth: 220,
                    padding: isShenkarResponsible ? "12px 14px" : "10px 12px",
                    borderRadius: isShenkarResponsible ? 14 : 12,
                    border: isShenkarResponsible ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                />
                <button
                  onClick={loadUserRequests}
                  disabled={userRequestsLoading}
                  style={{
                    padding: isShenkarResponsible ? "12px 18px" : "10px 14px",
                    borderRadius: isShenkarResponsible ? 14 : 12,
                    cursor: userRequestsLoading ? "default" : "pointer",
                    ...(userRequestsLoading
                      ? {
                          border: "none",
                          background: "#94a3b8",
                          color: "#fff",
                          fontWeight: 800,
                          boxShadow: "none",
                        }
                      : isShenkarResponsible
                        ? shenkarResponsiblePrimaryButton
                        : {
                            border: "none",
                            background: "#2563eb",
                            color: "#fff",
                            fontWeight: 700,
                          }),
                  }}
                >
                  {userRequestsLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
              {userRequestsError && (
                <div style={{ color: "#b91c1c", marginBottom: 12 }}>
                  {userRequestsError}
                </div>
              )}
              {userRequestsLoading ? (
                <div style={{ color: "#475569" }}>Loading requests...</div>
              ) : userRequests.length === 0 ? (
                <div style={{ color: "#475569" }}>
                  No requests yet. Submit one to start the approval flow.
                </div>
              ) : filteredUserRequests.length === 0 ? (
                <div style={{ color: "#475569" }}>
                  No requests match your search.
                </div>
              ) : (
                <div
                  style={{
                    borderRadius: 22,
                    overflow: "hidden",
                    border: isShenkarResponsible ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
                    background: "#fff",
                    boxShadow: isShenkarResponsible
                      ? "0 16px 32px rgba(15,23,42,0.06)"
                      : "0 10px 24px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  {!selectedUserGroup ? (
                    <div style={{ padding: 16, display: "grid", gap: 12 }}>
                      {groupedUserRequests.map((group) => {
                        const unreadCount = group.requests.filter(
                          (req) =>
                            req.status &&
                            req.status !== "pending" &&
                            !seenRequestSet.has(Number(req.id))
                        ).length;
                        return (
                          <button
                            key={group.key}
                            type="button"
                            onClick={() => {
                              setSelectedUserRequestKey(group.key);
                              markRequestsSeen(group.resource_id);
                            }}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: isShenkarResponsible ? "18px 20px" : "16px 18px",
                              borderRadius: isShenkarResponsible ? 18 : 14,
                              border: isShenkarResponsible ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
                              background: isShenkarResponsible
                                ? "linear-gradient(135deg,#ffffff 0%,#f8fbfb 100%)"
                                : "#fff",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              boxShadow: isShenkarResponsible
                                ? "0 14px 28px rgba(15,23,42,0.05)"
                                : "0 10px 24px rgba(15, 23, 42, 0.06)",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: isShenkarResponsible ? 18 : 15,
                                  fontWeight: 800,
                                  color: "#0f172a",
                                }}
                              >
                                {group.resource_name ||
                                  `${labels.resource} #${group.resource_id}`}
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b" }}>
                                {group.resource_type || labels.resource}
                              </div>
                            </div>
                            {isShenkarResponsible && (
                              <div
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 999,
                                  background: "#eff8f6",
                                  border: "1px solid #d3e6e1",
                                  color: "#2a6d69",
                                  fontSize: 12,
                                  fontWeight: 800,
                                }}
                              >
                                {group.requests.length} update{group.requests.length > 1 ? "s" : ""}
                              </div>
                            )}
                            {unreadCount > 0 && (
                              <span
                                style={{
                                  marginLeft: "auto",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 26,
                                  height: 26,
                                  borderRadius: 999,
                                  background: "#ef4444",
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                {unreadCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4">
                      <button
                        type="button"
                        onClick={() => setSelectedUserRequestKey(null)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 14,
                          cursor: "pointer",
                          marginBottom: 14,
                          ...(isShenkarResponsible
                            ? shenkarResponsibleSecondaryButton
                            : {
                                border: "none",
                                background: "transparent",
                                color: "#1d4ed8",
                                fontWeight: 700,
                                padding: 0,
                              }),
                        }}
                      >
                        Back to {labels.resources}
                      </button>
                      <div style={{ fontWeight: 800, marginBottom: 8, fontSize: isShenkarResponsible ? 22 : undefined }}>
                        {selectedUserGroup.resource_name ||
                          `${labels.resource} #${selectedUserGroup.resource_id}`}
                      </div>
                      <div style={{ display: "grid", gap: 12 }}>
                        {selectedUserGroup.requests.map((req) => {
                          const status = req.status || "pending";
                          let statusBg = "#fef9c3";
                          let statusColor = "#92400e";
                          if (status === "approved") {
                            statusBg = "#dcfce7";
                            statusColor = "#166534";
                          } else if (status === "rejected") {
                            statusBg = "#fee2e2";
                            statusColor = "#991b1b";
                          }
                          return (
                            <div
                              key={req.id}
                              style={{
                                padding: isShenkarResponsible ? 16 : 14,
                                borderRadius: isShenkarResponsible ? 18 : 14,
                                border: isShenkarResponsible ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
                                background: isShenkarResponsible
                                  ? "linear-gradient(135deg,#ffffff 0%,#f8fbfb 100%)"
                                  : "#fff",
                                display: "flex",
                                gap: 12,
                                alignItems: "center",
                                boxShadow: isShenkarResponsible
                                  ? "0 10px 22px rgba(15,23,42,0.04)"
                                  : "none",
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ color: "#64748b", fontSize: 13 }}>
                                  {formatDate(req.request_date)}{" "}
                                  {formatTime(req.start_time)} -{" "}
                                  {formatTime(req.end_time)}
                                </div>
                                {req.note && (
                                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                                    {req.note}
                                  </div>
                                )}
                              </div>
                              <div
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: statusBg,
                                  color: statusColor,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  textTransform: "capitalize",
                                }}
                              >
                                {status}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              className="glass"
              style={{
                padding: isShenkarTheme ? 22 : 16,
                borderRadius: isShenkarTheme ? 26 : 18,
                border: isShenkarTheme ? "1px solid #d7e4e1" : undefined,
                boxShadow: isShenkarTheme ? "0 22px 44px rgba(15,23,42,0.06)" : undefined,
                display:
                  role === "user" && notificationTab === "announcements"
                    ? "block"
                    : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 16,
                  paddingBottom: isShenkarTheme ? 14 : 0,
                  borderBottom: isShenkarTheme ? "1px solid #e6efed" : "none",
                }}
              >
                <input
                  value={announcementsQuery}
                  onChange={(e) => setAnnouncementsQuery(e.target.value)}
                  placeholder="Search announcements..."
                  style={{
                    flex: 1,
                    minWidth: 220,
                    padding: isShenkarTheme ? "12px 14px" : "10px 12px",
                    borderRadius: isShenkarTheme ? 14 : 12,
                    border: isShenkarTheme ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                />
                <button
                  onClick={loadAnnouncements}
                  disabled={announcementsLoading}
                  style={{
                    padding: isShenkarTheme ? "12px 18px" : "12px 18px",
                    borderRadius: isShenkarTheme ? 16 : 16,
                    cursor: announcementsLoading ? "default" : "pointer",
                    ...(announcementsLoading
                      ? {
                        border: "none",
                        background: "#94a3b8",
                        color: "#fff",
                        fontWeight: 800,
                        boxShadow: "none",
                      }
                      : isShenkarTheme
                        ? shenkarResponsiblePrimaryButton
                      : isCinema
                        ? cinemaPrimaryButton
                        : {
                            border: "none",
                            background: "#2563eb",
                            color: "#fff",
                            fontWeight: 700,
                          }),
                  }}

                >
                  {announcementsLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              {announcementsError && (
                <div style={{ color: "#b91c1c", marginBottom: 12 }}>
                  {announcementsError}
                </div>
              )}

              {role === "manager" && (
                <div
                  className="glass"
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    marginBottom: 14,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>
                    Send announcement
                  </div>
                  <input
                    value={announcementForm.title}
                    onChange={(e) =>
                      setAnnouncementForm((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    placeholder="Title"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                    }}
                  />
                  <textarea
                    value={announcementForm.message}
                    onChange={(e) =>
                      setAnnouncementForm((prev) => ({
                        ...prev,
                        message: e.target.value,
                      }))
                    }
                    placeholder="Message"
                    rows={4}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input
                      value={announcementForm.resource}
                      onChange={(e) =>
                        setAnnouncementForm((prev) => ({
                          ...prev,
                          resource: e.target.value,
                        }))
                      }
                      placeholder={`${labels.resource} name (optional)`}
                      style={{
                        flex: 1,
                        minWidth: 160,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                      }}
                    />
                    <input
                      value={announcementForm.targetUserId}
                      onChange={(e) =>
                        setAnnouncementForm((prev) => ({
                          ...prev,
                          targetUserId: e.target.value,
                        }))
                      }
                      placeholder={`${labels.userId} (optional)`}
                      style={{
                        flex: 1,
                        minWidth: 160,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                      }}
                    />
                    <input
                      value={announcementForm.senderName}
                      onChange={(e) =>
                        setAnnouncementForm((prev) => ({
                          ...prev,
                          senderName: e.target.value,
                        }))
                      }
                      placeholder="Your name"
                      style={{
                        flex: 1,
                        minWidth: 160,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={submitAnnouncement}
                    disabled={announcementSubmitting}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: announcementSubmitting ? "#94a3b8" : "#0f172a",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: announcementSubmitting ? "default" : "pointer",
                      width: "fit-content",
                    }}
                  >
                    {announcementSubmitting ? "Sending..." : "Send"}
                  </button>
                  {announcementError && (
                    <div style={{ color: "#b91c1c" }}>{announcementError}</div>
                  )}
                  {announcementSent && (
                    <div style={{ color: "#166534" }}>{announcementSent}</div>
                  )}
                </div>
              )}

              {announcementsLoading ? (
                <div style={{ color: "#475569" }}>Loading announcements...</div>
              ) : filteredAnnouncements.length === 0 ? (
                <div
                  style={{
                    color: "#475569",
                    borderRadius: isShenkarTheme ? 24 : 12,
                    border: isShenkarTheme ? "1px dashed #d7e4e1" : "1px dashed #e2e8f0",
                    background: isShenkarTheme ? "linear-gradient(180deg,#fbfdfd 0%,#f4faf8 100%)" : "#fff",
                    padding: isShenkarTheme ? 30 : 14,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#0f172a", fontSize: isShenkarTheme ? 22 : undefined }}>
                    No announcements yet.
                  </div>
                  {isShenkarTheme && (
                    <div style={{ marginTop: 8, color: "#607572", fontSize: 14 }}>
                      Updates from your managers will appear here as soon as they are published.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {filteredAnnouncements.map((a) => {
                    const isUnread =
                      role === "user" &&
                      !seenAnnouncementSet.has(Number(a.id));
                    const isSelected = selectedAnnouncementId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setSelectedAnnouncementId(a.id);
                          if (isUnread) {
                            markAnnouncementSeen(a.id);
                          }
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: isShenkarTheme ? "20px 22px" : "16px 18px",
                          borderRadius: isShenkarTheme ? 22 : 14,
                          border: isShenkarTheme ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
                          background: isShenkarTheme
                            ? "linear-gradient(135deg,#ffffff 0%,#f8fbfb 100%)"
                            : "#fff",
                          display: "grid",
                          gap: 6,
                          boxShadow: isShenkarTheme
                            ? "0 16px 32px rgba(15, 23, 42, 0.05)"
                            : "0 10px 24px rgba(15, 23, 42, 0.06)",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {isUnread && (
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 999,
                                  background: "#ef4444",
                                  display: "inline-block",
                                }}
                              />
                            )}
                            <div style={{ fontWeight: 800, color: "#0f172a", fontSize: isShenkarTheme ? 18 : undefined }}>
                              {a.title}
                            </div>
                          </div>
                          {isShenkarTheme && (
                            <span
                              style={{
                                padding: "7px 10px",
                                borderRadius: 999,
                                border: "1px solid #d5e7e2",
                                background: "#eef8f6",
                                color: "#216b68",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {isSelected ? "Open" : "Message"}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {a.resource_name ? `${a.resource_name} • ` : ""}
                          {a.sender_name || labels.manager} •{" "}
                          {formatDate(a.created_at)}
                        </div>
                        {isSelected && (
                          <div style={{ color: "#475569", fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>
                            {a.message}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {cancelDialog.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 60,
            }}
            onClick={() => setCancelDialog({ open: false, booking: null })}
          >
            <div
              className="glass"
              style={{
                width: "min(560px, 92vw)",
                padding: 20,
                borderRadius: 18,
                background: "#fff",
                border: "1px solid #e2e8f0",
                display: "grid",
                gap: 12,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                Cancel {labelsLower.resource}
              </div>
              {cancelDialog.booking && (
                <div style={{ color: "#475569", fontSize: 12 }}>
                  {formatDate(cancelDialog.booking.date)} •{" "}
                  {formatTime(cancelDialog.booking.start_time)} -{" "}
                  {formatTime(cancelDialog.booking.end_time)}
                </div>
              )}
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={rescheduleMode}
                  onChange={(e) => setRescheduleMode(e.target.checked)}
                />
                Reschedule instead of cancel
              </label>
              {rescheduleMode && (
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ fontSize: 12, color: "#475569" }}>
                    New date
                    <IsraelDateInput
                      value={rescheduleDate}
                      onChange={setRescheduleDate}
                      style={{
                        width: "100%",
                        marginTop: 6,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                      }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      Start
                      <input
                        type="time"
                        value={rescheduleStart}
                        onChange={(e) => setRescheduleStart(e.target.value)}
                        style={{
                          marginTop: 6,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      End
                      <input
                        type="time"
                        value={rescheduleEnd}
                        onChange={(e) => setRescheduleEnd(e.target.value)}
                        style={{
                          marginTop: 6,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: "#475569" }}>
                      Location
                      <select
                        value={rescheduleLocation}
                        onChange={(e) => setRescheduleLocation(e.target.value)}
                        style={{
                          marginTop: 6,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <option value="onsite">On-site</option>
                        <option value="zoom">Zoom</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (optional)"
                rows={3}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <input
                value={cancelSenderName}
                onChange={(e) => setCancelSenderName(e.target.value)}
                placeholder="Your name (optional)"
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                }}
              />
              {cancelError && (
                <div style={{ color: "#b91c1c" }}>{cancelError}</div>
              )}
              {cancelSuccess && (
                <div style={{ color: "#166534" }}>{cancelSuccess}</div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setCancelDialog({ open: false, booking: null })}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={submitCancellation}
                  disabled={cancelSubmitting}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: cancelSubmitting ? "#94a3b8" : "#b91c1c",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: cancelSubmitting ? "default" : "pointer",
                  }}
                >
                  {cancelSubmitting
                    ? rescheduleMode
                      ? "Rescheduling..."
                      : "Cancelling..."
                    : rescheduleMode
                      ? "Confirm reschedule"
                      : "Confirm cancel"}
                </button>
              </div>
            </div>
          </div>
        )}

        {availabilityResource && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 50,
            }}
            onClick={() => setAvailabilityResource(null)}
          >
            <div
              className="glass"
              style={{
                width: "min(980px, 96vw)",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: 20,
                borderRadius: 18,
                background: "#fff",
                border: "1px solid #e2e8f0",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    Availability calendar
                  </div>
                  <div style={{ color: "#475569", fontSize: 12 }}>
                    {availabilityResource.name}{" "}
                    {availabilityResource.type_name
                      ? `(${formatTypeLabel(availabilityResource.type_name, labels)})`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!availabilityResource || !currentUserId.trim()) return;
                    setAvailabilityLoading(true);
                    Promise.all([
                      getBookingsByResource(availabilityResource.id),
                      getBookingsByUser(currentUserId.trim()),
                    ])
                      .then(([bookingsData, userBookings]) => {
                        setAvailabilityBookings(
                          Array.isArray(bookingsData) ? bookingsData : []
                        );
                        setBookings(
                          Array.isArray(userBookings) ? userBookings : []
                        );
                      })
                      .catch((err) => {
                        setAvailabilityError(
                          err?.message || "Failed to load availability."
                        );
                      })
                      .finally(() => setAvailabilityLoading(false));
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Refresh status
                </button>
                <button
                  type="button"
                  onClick={() => setAvailabilityResource(null)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>

              {availabilityError && (
                <div style={{ marginBottom: 10, color: "#b91c1c" }}>
                  {availabilityError}
                </div>
              )}

              {availabilityLoading ? (
                <div style={{ color: "#475569" }}>Loading availability...</div>
              ) : (
                <>
                  <MonthGrid
                    monthLabel={availabilityMonthLabel}
                    onPrev={() =>
                      setAvailabilityMonthDate(
                        (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                      )
                    }
                    onNext={() =>
                      setAvailabilityMonthDate(
                        (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                      )
                    }
                    days={availabilityDays}
                    maxItems={null}
                    renderBooking={(b) => (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "linear-gradient(135deg,#0f172a,#1e293b)",
                          color: "#fff",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {formatTime(b.start_time)} - {formatTime(b.end_time)}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          Reserved by: {b.user_id}
                        </div>
                      </div>
                    )}
                    renderDayAction={(day) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isPast = day.date < today;
                      const isSelected = bookingDraft.date === day.key;
                      const disabled =
                        !day.inMonth || isPast || bookingSubmitting;

                      let label = "Select";
                      let background = "#fff";
                      let color = "#0f172a";

                      if (isSelected) {
                        label = "Send request";
                        background = "#2563eb";
                        color = "#fff";
                      }

                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (!day?.key) return;
                            if (!isSelected) {
                              pickBookingDate(day);
                              return;
                            }
                            submitBookingRequest(day.key);
                          }}
                          disabled={disabled}
                          style={{
                            marginTop: 6,
                            padding: "4px 8px",
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            background: disabled ? "#f1f5f9" : background,
                            color: disabled ? "#94a3b8" : color,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                        >
                          {label}
                        </button>
                      );
                    }}
                  />
                  {availabilityBookings.length === 0 && (
                    <div style={{ marginTop: 12, color: "#475569" }}>
                      No bookings yet for this {labelsLower.resource}.
                    </div>
                  )}
                  <div
                    className="glass"
                    style={{
                      marginTop: 16,
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>
                      Request this {labelsLower.resource}
                    </div>
                    <div style={{ marginTop: 6, color: "#475569", fontSize: 12 }}>
                      Selected date:{" "}
                      {bookingDraft.date ? formatDate(bookingDraft.date) : "None"}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <label style={{ fontSize: 12, color: "#475569" }}>
                        Start
                        <input
                          type="time"
                          value={bookingDraft.start}
                          onChange={(e) =>
                            setBookingDraft((prev) => ({
                              ...prev,
                              start: e.target.value,
                            }))
                          }
                          style={{
                            marginLeft: 6,
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                          }}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: "#475569" }}>
                        End
                        <input
                          type="time"
                          value={bookingDraft.end}
                          onChange={(e) =>
                            setBookingDraft((prev) => ({
                              ...prev,
                              end: e.target.value,
                            }))
                          }
                          style={{
                            marginLeft: 6,
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => submitBookingRequest()}
                        disabled={requestDisabled}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "none",
                          background: requestDisabled
                            ? requestButtonBackground
                            : requestButtonBackground,
                          color: requestButtonColor,
                          fontWeight: 700,
                          cursor: requestDisabled ? "default" : "pointer",
                        }}
                      >
                        {bookingSubmitting ? "Sending..." : requestButtonLabel}
                      </button>
                    </div>
                    {bookingError && (
                      <div style={{ marginTop: 8, color: "#b91c1c" }}>
                        {bookingError}
                      </div>
                    )}
                    {bookingSuccess && (
                      <div style={{ marginTop: 8, color: "#166534" }}>
                        {bookingSuccess}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, color, items, role, labels, labelsLower, onCancel }) {
  return (
    <section>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: color,
            display: "inline-block",
          }}
        />
        <h3 style={{ margin: 0, color: "#0f172a" }}>{title}</h3>
      </div>

      {items.length === 0 ? (
        <div
          className="glass"
          style={{
            padding: 14,
            borderRadius: 14,
            color: "#475569",
            fontSize: 14,
          }}
        >
          No bookings in this category.
        </div>
      ) : (
        <div className="grid-auto">
          {items.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              role={role}
              labels={labels}
              labelsLower={labelsLower}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BookingCard({ booking, role, labels, labelsLower, onCancel }) {
  const past = isPastBooking(booking);
  const roomLine = getBookingRoomLine(booking);
  return (
    <div
      className="glass"
      style={{
        padding: 16,
        borderRadius: 16,
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ color: "#475569", fontSize: 12 }}>
            Booking #{booking.id}
          </div>
          <div style={{ color: "#0f172a", fontWeight: 600 }}>
            {formatDate(booking.date)}
          </div>
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "#e3e9ed",
            color: "#334155",
            fontSize: 13,
            border: "1px solid #c5d0d8",
          }}
        >
          {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
        </div>
      </div>
      {roomLine && (
        <div style={{ marginBottom: 8, color: "#0f172a", fontWeight: 700 }}>
          {roomLine}
        </div>
      )}
      {role === "manager" && (
        <button
          type="button"
          onClick={() => onCancel?.(booking)}
          disabled={past}
          style={{
            marginBottom: 10,
            alignSelf: "flex-start",
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: past ? "#e2e8f0" : "#0f172a",
            color: past ? "#64748b" : "#fff",
            fontWeight: 700,
            cursor: past ? "not-allowed" : "pointer",
          }}
        >
          Cancel {labelsLower.resource}
        </button>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {getBookingResources(booking).map((r) => (
          <div
            key={r.id}
            style={{
              padding: 10,
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ color: "#0f172a", fontWeight: 600 }}>{r.name}</div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>
              {r.type_name ? `Type: ${formatTypeLabel(r.type_name, labels)}` : ""}
              {r.role ? ` - Role: ${r.role}` : ""}
            </div>
            {getResourcePreviewDetails(r) && (
              <div
                style={{
                  color: "#64748b",
                  fontSize: 12,
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                {getResourcePreviewDetails(r)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({
  monthLabel,
  isShenkarResponsible,
  onPrev,
  onNext,
  days,
  renderBooking,
  maxItems = 3,
  renderDayAction,
}) {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div
      className="glass"
      style={{
        padding: 18,
        borderRadius: 24,
        border: isShenkarResponsible ? "1px solid #d7e4e1" : undefined,
        boxShadow: isShenkarResponsible
          ? "0 22px 48px rgba(15,23,42,0.08)"
          : undefined,
        background: isShenkarResponsible
          ? "linear-gradient(180deg,#ffffff 0%,#fbfdfd 100%)"
          : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: isShenkarResponsible ? "1px solid #e4efec" : "1px solid #eef2f7",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onPrev}
            style={{
              border: isShenkarResponsible ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
              background: isShenkarResponsible ? "#f8fbfb" : "#fff",
              color: "#0f172a",
              borderRadius: 12,
              padding: "8px 11px",
              cursor: "pointer",
              boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
            }}
          >
            &lt;
          </button>
          <button
            onClick={onNext}
            style={{
              border: isShenkarResponsible ? "1px solid #d7e4e1" : "1px solid #e2e8f0",
              background: isShenkarResponsible ? "#f8fbfb" : "#fff",
              color: "#0f172a",
              borderRadius: 12,
              padding: "8px 11px",
              cursor: "pointer",
              boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
            }}
          >
            &gt;
          </button>
          <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 18 }}>{monthLabel}</div>
        </div>
        <div
          className="badge"
          style={
            isShenkarResponsible
              ? {
                  background: "linear-gradient(135deg,#e8f6f3,#d9eeea)",
                  color: "#236765",
                  border: "1px solid #c7e2dc",
                }
              : undefined
          }
        >
          <span role="img" aria-label="calendar">
            CAL
          </span>
          Month view
        </div>
      </div>

      <div className="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontWeight: 700,
              color: "#475569",
            }}
          >
            {d}
          </div>
        ))}

        {weeks.map((week, wi) =>
          week.map((day, di) => (
            <div
              key={`${wi}-${di}`}
              className="calendar-day"
              style={{
                opacity: day.inMonth ? 1 : 0.45,
                border: isShenkarResponsible ? "1px solid #dfe8ee" : undefined,
                background: isShenkarResponsible
                  ? "linear-gradient(180deg,#ffffff 0%,#fbfcfd 100%)"
                  : undefined,
                boxShadow: isShenkarResponsible
                  ? "0 10px 22px rgba(15,23,42,0.05)"
                  : undefined,
              }}
            >
              <div className="date">{day.date.getDate()}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(typeof maxItems === "number"
                  ? day.bookings.slice(0, maxItems)
                  : day.bookings
                ).map((b) => (
                  <div key={b.id}>
                    {renderBooking ? (
                      renderBooking(b)
                    ) : (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                          color: "#fff",
                          fontSize: 12,
                          boxShadow: "0 6px 18px rgba(37,99,235,0.25)",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {(b.resources || [])
                            .map((r) => r.name)
                            .filter(Boolean)
                            .join(" / ")}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          {formatTime(b.start_time)} - {formatTime(b.end_time)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {typeof maxItems === "number" &&
                  day.bookings.length > maxItems && (
                    <div style={{ fontSize: 11, color: "#475569" }}>
                      +{day.bookings.length - maxItems} more
                    </div>
                  )}
                {renderDayAction ? renderDayAction(day) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
