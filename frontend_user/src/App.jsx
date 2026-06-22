import React, { useEffect, useMemo, useState } from "react";
import AvailabilitySection from "./components/AvailabilitySection";
import AppSidebar from "./components/AppSidebar";
import BrandLockup from "./components/BrandLockup";
import BookingDetailsModal from "./components/BookingDetailsModal";
import CancelDialog from "./components/CancelDialog";
import LoginView from "./components/LoginView";
import NotificationsSection from "./components/NotificationsSection";
import RequestsSection from "./components/RequestsSection";
import ResourceAvailabilityModal from "./components/ResourceAvailabilityModal";
import ScheduleSection from "./components/ScheduleSection";
import SearchSection from "./components/SearchSection";
import useNotificationsState from "./hooks/useNotificationsState";
import useResourceExplorerState from "./hooks/useResourceExplorerState";
import useSessionAuth, { SESSION_KEY } from "./hooks/useSessionAuth";
import {
  getBookingsByUser,
  getAllResources,
  createResourceRequest,
  getBookingsByResource,
  cancelBooking,
  rescheduleBooking,
  getUserAvailability,
  createUserAvailability,
  deleteUserAvailability,
  getResponsibleSchedulingDeadline,
} from "./api";
import { getOrgConfig, getSessionOrgId } from "./orgConfig";
import {
  buildMonthGrid,
  filterBookingsToPrimaryResources,
  getSeatLabelFromBooking,
  hasAssignedUsers,
  isCinemaHallResource,
  isResourceAssignedToUser,
  normalizeMetadata,
  parseDateValue,
  weekdayLabel,
} from "./utils/appHelpers";

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || "http://localhost:5174";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatCountdown(msLeft) {
  if (!Number.isFinite(msLeft)) return "";
  if (msLeft <= 0) return "00:00:00";
  const totalSeconds = Math.floor(msLeft / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const hh = pad2(hours);
  const mm = pad2(minutes);
  const ss = pad2(seconds);
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

const DEFAULT_SECTION = "schedule";
const VALID_SECTIONS = new Set([
  "schedule",
  "search",
  "requests",
  "availability",
  "notifications",
]);

function getSectionFromHash() {
  if (typeof window === "undefined") return DEFAULT_SECTION;
  const section = String(window.location.hash || "")
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
  return VALID_SECTIONS.has(section) ? section : DEFAULT_SECTION;
}

function isSectionAllowed(section, role, hasUser = true) {
  if (!hasUser) return VALID_SECTIONS.has(section);
  if (role === "user" && (section === "requests" || section === "availability")) {
    return false;
  }
  return VALID_SECTIONS.has(section);
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState("");
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState("month"); // month | list
  const [monthDate, setMonthDate] = useState(new Date());

  const [requestQuery, setRequestQuery] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestResourceId, setRequestResourceId] = useState(null);
  const [requestSent, setRequestSent] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestView, setRequestView] = useState("list"); // list | form
  const [onlyAvailable, setOnlyAvailable] = useState(false);
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
  const [selectedScheduleBooking, setSelectedScheduleBooking] = useState(null);
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
  const [section, setSection] = useState(getSectionFromHash); // schedule | search | requests | availability | notifications
  const [deadlineInfo, setDeadlineInfo] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const sessionOrgId = getSessionOrgId(SESSION_KEY);
  const sessionConfig = useMemo(() => getOrgConfig(sessionOrgId), [sessionOrgId]);
  const sessionLabels = sessionConfig.labels;
  const {
    currentUserId,
    setCurrentUserId,
    password,
    setPassword,
    role,
    hasUser,
    loading,
    error,
    handleLogin,
    handleLogout,
  } = useSessionAuth({
    userIdLabel: sessionLabels.userId,
    adminUrl: ADMIN_URL,
    onLogoutReset: () => {
      setSection("schedule");
      setBookings([]);
      setBookingsError("");
      setUserRequests([]);
      setAnnouncements([]);
    },
  });
  const loginPreviewConfig = useMemo(
    () => getOrgConfig(sessionOrgId || currentUserId),
    [sessionOrgId, currentUserId]
  );
  const activeConfig = hasUser ? sessionConfig : loginPreviewConfig;
  const labels = activeConfig.labels;
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
  const {
    resources,
    setResources,
    resourceQuery,
    setResourceQuery,
    resourceLoading,
    resourceError,
    selectedResourceId,
    setSelectedResourceId,
    availabilityResource,
    setAvailabilityResource,
    availabilityBookings,
    availabilityLoading,
    setAvailabilityLoading,
    availabilityError,
    availabilityMonthDate,
    setAvailabilityMonthDate,
    bookingDraft,
    setBookingDraft,
    bookingSubmitting,
    bookingError,
    bookingSuccess,
    availabilityDays,
    availabilityMonthLabel,
    filteredResources,
    filteredRequestResources,
    selectedResource,
    selectedRequestResource,
    loadResources,
    openAvailability,
    pickBookingDate,
    submitBookingRequest,
    refreshAvailabilityStatus,
    isResourceAvailable,
  } = useResourceExplorerState({
    role,
    currentUserId,
    isCinema: activeConfig.domain === "cinema",
    labels,
    labelsLower,
    bookings,
    setBookings,
    requestQuery,
    onlyAvailable,
    requestResourceId,
  });
  const {
    userRequests,
    setUserRequests,
    userRequestsLoading,
    userRequestsError,
    userRequestsQuery,
    setUserRequestsQuery,
    selectedUserRequestKey,
    setSelectedUserRequestKey,
    notificationTab,
    setNotificationTab,
    announcements,
    setAnnouncements,
    announcementsLoading,
    announcementsError,
    announcementsQuery,
    setAnnouncementsQuery,
    selectedAnnouncementId,
    setSelectedAnnouncementId,
    announcementForm,
    setAnnouncementForm,
    announcementSubmitting,
    announcementSent,
    announcementError,
    unreadNotificationCount,
    filteredUserRequests,
    filteredAnnouncements,
    groupedUserRequests,
    selectedUserGroup,
    seenAnnouncementSet,
    loadUserRequests,
    loadAnnouncements,
    submitAnnouncement,
    markAnnouncementSeen,
    markRequestsSeen,
    getUnreadCountForGroup,
  } = useNotificationsState({
    role,
    section,
    currentUserId,
    labels,
  });

  const isCinema = activeConfig.domain === "cinema";
  const isClinic = activeConfig.domain === "clinic";
  const compactOrgId = String(sessionOrgId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isShenkar = compactOrgId === "shenkar";
  const canAccessAvailability =
    role === "manager" ||
    section === "availability" ||
    userAvailability.length > 0 ||
    Boolean(deadlineInfo?.has_deadline);

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
  const monthLabel = monthDate.toLocaleDateString("en-US", {
    timeZone: "Asia/Jerusalem",
    month: "long",
    year: "numeric",
  });
  useEffect(() => {
    if (!hasUser || !currentUserId.trim()) return;
    let active = true;

    async function refreshUserData() {
      if (bookings.length === 0) setBookingsLoading(true);
      setBookingsError("");
      try {
        const userId = currentUserId.trim();
        const [bookingsResult, resourcesResult] = await Promise.allSettled([
          getBookingsByUser(userId),
          getAllResources(),
        ]);
        if (!active) return;

        if (bookingsResult.status === "rejected") {
          setBookingsError(bookingsResult.reason?.message || "Failed to load your schedule.");
          setBookings([]);
          setResources([]);
          return;
        }

        const rawBookings = Array.isArray(bookingsResult.value) ? bookingsResult.value : [];
        const scopedBaseBookings =
          role === "user" && sessionConfig.domain !== "cinema"
            ? rawBookings
                .map((booking) => {
                  if (String(booking?.user_id || "").trim() === userId) return booking;
                  const scopedResources = (booking.resources || []).filter((resource) =>
                    isResourceAssignedToUser(resource, userId)
                  );
                  return scopedResources.length > 0
                    ? { ...booking, resources: scopedResources, all_resources: booking.resources || [] }
                    : null;
                })
                .filter(Boolean)
            : rawBookings;
        const resourcesList =
          resourcesResult.status === "fulfilled" && Array.isArray(resourcesResult.value)
            ? resourcesResult.value
            : [];
        setResources(resourcesList);
        const assignedResources = resourcesList.filter((r) =>
          isResourceAssignedToUser(r, userId)
        );
        let mergedBookings = scopedBaseBookings;
        if (assignedResources.length > 0) {
          const extra = await Promise.all(
            assignedResources.map((r) => getBookingsByResource(r.id).catch(() => []))
          );
          const all = new Map();
          for (const b of scopedBaseBookings) {
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
        if (resourcesResult.status === "rejected") {
          setBookingsError(
            "Your schedule loaded, but the full resource directory is temporarily unavailable."
          );
        }
      } catch (err) {
        if (!active) return;
        setBookingsError(err?.message || "Failed to load your schedule.");
      }
      finally {
        if (active) setBookingsLoading(false);
      }
    }

    refreshUserData();
    const timer = setInterval(refreshUserData, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hasUser, currentUserId, role, sessionConfig.domain, bookings.length, setResources]);

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
      for (const r of b.resources || []) {
        byId[r.id] = byId[r.id] || [];
        byId[r.id].push({
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
      for (const r of b.resources || []) {
        byId[r.id] = byId[r.id] || [];
        byId[r.id].push({
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
    if (hasUser && role === "user" && section === "requests") {
      setSection("schedule");
    }
  }, [hasUser, role, section]);

  useEffect(() => {
    const nextSection = isSectionAllowed(section, role, hasUser) ? section : DEFAULT_SECTION;
    const nextHash = nextSection === DEFAULT_SECTION ? "" : `#${nextSection}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, [hasUser, role, section]);

  useEffect(() => {
    const handleHashChange = () => {
      const nextSection = getSectionFromHash();
      setSection((prev) => {
        const allowedSection = isSectionAllowed(nextSection, role, hasUser)
          ? nextSection
          : DEFAULT_SECTION;
        return prev === allowedSection ? prev : allowedSection;
      });
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [hasUser, role]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!hasUser || (!canAccessAvailability && role !== "manager")) {
      setDeadlineInfo(null);
      return;
    }
    const id = currentUserId.trim();
    if (!id) return;
    let active = true;

    const load = async () => {
      try {
        const info = await getResponsibleSchedulingDeadline(id);
        if (active) setDeadlineInfo(info);
      } catch {
        if (active) setDeadlineInfo(null);
      }
    };

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasUser, role, currentUserId, canAccessAvailability]);

  useEffect(() => {
    if (!deadlineInfo?.scheduling_range) return;
    if (!canAccessAvailability) return;
    const { start_date, end_date } = deadlineInfo.scheduling_range || {};
    if (!start_date || !end_date) return;
    setAvailabilityForm((prev) => {
      // Only auto-fill when the user hasn't picked custom dates yet.
      const nextStart = prev.start_date || start_date;
      const nextEnd = prev.end_date || end_date;
      if (nextStart === prev.start_date && nextEnd === prev.end_date) return prev;
      return { ...prev, start_date: nextStart, end_date: nextEnd };
    });
  }, [deadlineInfo, canAccessAvailability]);

  useEffect(() => {
    if (!hasUser || !canAccessAvailability) return;
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
  }, [hasUser, canAccessAvailability, currentUserId]);

  if (!hasUser) {
    return (
      <LoginView
        labels={labels}
        labelsLower={labelsLower}
        domain={activeConfig.domain}
        currentUserId={currentUserId}
        setCurrentUserId={setCurrentUserId}
        password={password}
        setPassword={setPassword}
        handleLogin={handleLogin}
        loading={loading}
        error={error}
      />
    );
  }

  const deadlineRunAt = deadlineInfo?.run_at ? new Date(deadlineInfo.run_at) : null;
  const hasDeadline =
    Boolean(deadlineInfo?.has_deadline) &&
    deadlineRunAt &&
    !Number.isNaN(deadlineRunAt.getTime());
  const lockedAvailability = Boolean(deadlineInfo?.locked);
  const mustFillAvailability = Boolean(deadlineInfo?.must_fill_availability);
  const deadlineCountdown = hasDeadline
    ? formatCountdown(deadlineRunAt.getTime() - nowTick)
    : "";

  return (
    <div
      className={`user-app-shell ${
        isCinema ? "user-app-shell--cinema" : isClinic ? "user-app-shell--clinic" : "user-app-shell--generic"
      }`}
      style={{
        minHeight: "100vh",
        display: "flex",
      }}
    >
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <AppSidebar
        isCinema={isCinema}
        role={role}
        labels={labels}
        labelsLower={labelsLower}
        currentUserId={currentUserId}
        section={section}
        canAccessAvailability={canAccessAvailability}
        setSection={setSection}
        unreadNotificationCount={unreadNotificationCount}
        handleLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main */}
      <div className="app-main">
        <div className="mobile-topbar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            Menu
          </button>
          <BrandLockup eyebrow="User Workspace" compact className="mobile-topbar__lockup" />
          <div className="badge-soft badge-info" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentUserId}
          </div>
        </div>
        {canAccessAvailability && hasDeadline && !lockedAvailability && (
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 30,
              marginBottom: 16,
            }}
          >
            <div
              className="glass"
              style={{
                padding: 14,
                borderRadius: 16,
                border: mustFillAvailability
                  ? "1px solid rgba(239,68,68,0.25)"
                  : "1px solid rgba(59,130,246,0.25)",
                background: mustFillAvailability
                  ? "linear-gradient(135deg, rgba(239,68,68,0.10), rgba(249,115,22,0.08))"
                  : "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(99,102,241,0.08))",
              }}
            >
              <div style={{ fontWeight: 900, color: "#0f172a" }}>
                Scheduling will start at {deadlineRunAt.toLocaleString()}.
              </div>
              <div style={{ marginTop: 6, color: "#334155", fontWeight: 600 }}>
                Time left to fill availability:{" "}
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900 }}>
                  {deadlineCountdown || "—"}
                </span>
              </div>
              <div style={{ marginTop: 6, color: "#475569" }}>
                {mustFillAvailability
                  ? "Please set your availability now. After the deadline, availability will be locked."
                  : "You can still update availability until the deadline. After that it will be locked."}
              </div>
              {section !== "availability" && (
                <button
                  type="button"
                  onClick={() => setSection("availability")}
                  style={{
                    marginTop: 10,
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: "none",
                    background: mustFillAvailability ? "#ef4444" : "#2563eb",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Go to My Availability
                </button>
              )}
            </div>
          </div>
        )}

        {canAccessAvailability && hasDeadline && mustFillAvailability && section !== "availability" && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              background: "rgba(15, 23, 42, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              className="glass"
              style={{
                width: "min(560px, 100%)",
                borderRadius: 20,
                padding: 18,
                border: "1px solid rgba(239,68,68,0.25)",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.75), rgba(254,226,226,0.55))",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>
                Action required: fill your availability
              </div>
              <div style={{ marginTop: 8, color: "#334155", fontWeight: 700 }}>
                Scheduling starts at {deadlineRunAt.toLocaleString()}.
              </div>
              <div style={{ marginTop: 6, color: "#0f172a", fontWeight: 900, fontSize: 24, fontVariantNumeric: "tabular-nums" }}>
                {deadlineCountdown || "—"}
              </div>
              <div style={{ marginTop: 8, color: "#475569" }}>
                The admin will start scheduling at the deadline. After that, you won’t be able to edit availability.
              </div>
              <button
                type="button"
                onClick={() => setSection("availability")}
                style={{
                  marginTop: 12,
                  padding: "12px 16px",
                  borderRadius: 16,
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Open My Availability
              </button>
            </div>
          </div>
        )}

        {section === "schedule" ? (
          <ScheduleSection
            isCinema={isCinema}
            isShenkar={isShenkar}
            isClinic={isClinic}
            labels={labels}
            labelsLower={labelsLower}
            filter={filter}
            setFilter={setFilter}
            viewMode={viewMode}
            setViewMode={setViewMode}
            scheduleBookings={scheduleBookings}
            loading={loading || bookingsLoading}
            error={bookingsError}
            monthLabel={monthLabel}
            setMonthDate={setMonthDate}
            monthDays={monthDays}
            setSelectedScheduleBooking={setSelectedScheduleBooking}
            role={role}
            openCancelDialog={openCancelDialog}
            upcoming={upcoming}
            past={past}
          />
        ) : section === "search" ? (
          <SearchSection
            isCinema={isCinema}
            role={role}
            currentUserId={currentUserId}
            labels={labels}
            labelsLower={labelsLower}
            bookings={bookings}
            resourceQuery={resourceQuery}
            setResourceQuery={setResourceQuery}
            loadResources={loadResources}
            resourceLoading={resourceLoading}
            filteredResources={filteredResources}
            selectedResource={selectedResource}
            setSelectedResourceId={setSelectedResourceId}
            cinemaSecondaryButton={cinemaSecondaryButton}
          />

        ) : section === "requests" ? (
          <RequestsSection
            labels={labels}
            labelsLower={labelsLower}
            isCinema={isCinema}
            cinemaPrimaryButton={cinemaPrimaryButton}
            cinemaSecondaryButton={cinemaSecondaryButton}
            requestSent={requestSent}
            requestView={requestView}
            setRequestView={setRequestView}
            setRequestResourceId={setRequestResourceId}
            setRequestError={setRequestError}
            selectedRequestResource={selectedRequestResource}
            requestError={requestError}
            requestNote={requestNote}
            setRequestNote={setRequestNote}
            requestSubmitting={requestSubmitting}
            submitResourceRequest={submitResourceRequest}
            requestQuery={requestQuery}
            setRequestQuery={setRequestQuery}
            onlyAvailable={onlyAvailable}
            setOnlyAvailable={setOnlyAvailable}
            loadResources={loadResources}
            resourceLoading={resourceLoading}
            resourceError={resourceError}
            resources={resources}
            filteredRequestResources={filteredRequestResources}
            isResourceAvailable={isResourceAvailable}
            openAvailability={openAvailability}
            setRequestSent={setRequestSent}
          />
        ) : section === "availability" ? (
          <AvailabilitySection
            labelsLower={labelsLower}
            availabilityMessage={availabilityMessage}
            availabilityForm={availabilityForm}
            setAvailabilityForm={setAvailabilityForm}
            availabilitySaving={availabilitySaving}
            setAvailabilitySaving={setAvailabilitySaving}
            isCinema={isCinema}
            cinemaPrimaryButton={cinemaPrimaryButton}
            currentUserId={currentUserId}
            createUserAvailability={createUserAvailability}
            setUserAvailability={setUserAvailability}
            setAvailabilityMessage={setAvailabilityMessage}
            userAvailability={userAvailability}
            deleteUserAvailability={deleteUserAvailability}
            deadlineInfo={deadlineInfo}
            lockedAvailability={lockedAvailability}
          />
        ) : (
          <NotificationsSection
            role={role}
            isCinema={isCinema}
            labels={labels}
            labelsLower={labelsLower}
            cinemaPrimaryButton={cinemaPrimaryButton}
            cinemaSecondaryButton={cinemaSecondaryButton}
            notificationTab={notificationTab}
            setNotificationTab={setNotificationTab}
            userRequestsQuery={userRequestsQuery}
            setUserRequestsQuery={setUserRequestsQuery}
            loadUserRequests={loadUserRequests}
            userRequestsLoading={userRequestsLoading}
            userRequestsError={userRequestsError}
            userRequests={userRequests}
            filteredUserRequests={filteredUserRequests}
            groupedUserRequests={groupedUserRequests}
            getUnreadCountForGroup={getUnreadCountForGroup}
            setSelectedUserRequestKey={setSelectedUserRequestKey}
            markRequestsSeen={markRequestsSeen}
            selectedUserGroup={selectedUserGroup}
            announcementsQuery={announcementsQuery}
            setAnnouncementsQuery={setAnnouncementsQuery}
            loadAnnouncements={loadAnnouncements}
            announcementsLoading={announcementsLoading}
            announcementsError={announcementsError}
            announcementForm={announcementForm}
            setAnnouncementForm={setAnnouncementForm}
            submitAnnouncement={submitAnnouncement}
            announcementSubmitting={announcementSubmitting}
            announcementError={announcementError}
            announcementSent={announcementSent}
            filteredAnnouncements={filteredAnnouncements}
            seenAnnouncementSet={seenAnnouncementSet}
            selectedAnnouncementId={selectedAnnouncementId}
            setSelectedAnnouncementId={setSelectedAnnouncementId}
            markAnnouncementSeen={markAnnouncementSeen}
          />
        )}

        <CancelDialog
          cancelDialog={cancelDialog}
          setCancelDialog={setCancelDialog}
          labelsLower={labelsLower}
          rescheduleMode={rescheduleMode}
          setRescheduleMode={setRescheduleMode}
          rescheduleDate={rescheduleDate}
          setRescheduleDate={setRescheduleDate}
          rescheduleStart={rescheduleStart}
          setRescheduleStart={setRescheduleStart}
          rescheduleEnd={rescheduleEnd}
          setRescheduleEnd={setRescheduleEnd}
          rescheduleLocation={rescheduleLocation}
          setRescheduleLocation={setRescheduleLocation}
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          cancelSenderName={cancelSenderName}
          setCancelSenderName={setCancelSenderName}
          cancelError={cancelError}
          cancelSuccess={cancelSuccess}
          submitCancellation={submitCancellation}
          cancelSubmitting={cancelSubmitting}
        />

        <ResourceAvailabilityModal
          availabilityResource={availabilityResource}
          setAvailabilityResource={setAvailabilityResource}
          labels={labels}
          labelsLower={labelsLower}
          currentUserId={currentUserId}
          refreshAvailabilityStatus={refreshAvailabilityStatus}
          availabilityError={availabilityError}
          availabilityLoading={availabilityLoading}
          availabilityMonthLabel={availabilityMonthLabel}
          setAvailabilityMonthDate={setAvailabilityMonthDate}
          availabilityDays={availabilityDays}
          bookingDraft={bookingDraft}
          bookingSubmitting={bookingSubmitting}
          pickBookingDate={pickBookingDate}
          submitBookingRequest={submitBookingRequest}
          availabilityBookings={availabilityBookings}
          setBookingDraft={setBookingDraft}
          bookingError={bookingError}
          bookingSuccess={bookingSuccess}
        />

        <BookingDetailsModal
          selectedScheduleBooking={selectedScheduleBooking}
          setSelectedScheduleBooking={setSelectedScheduleBooking}
          labels={labels}
        />
      </div>
    </div>
  );
}
