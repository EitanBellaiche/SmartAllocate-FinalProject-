import React, { useEffect, useMemo, useState } from "react";
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
} from "./api";

function parseDateValue(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = parseDateValue(dateStr);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(t) {
  return t ? t.slice(0, 5) : "";
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

function isCourseResource(resource) {
  const type = String(resource?.type_name || "").trim().toLowerCase();
  return type === "courses" || type === "course";
}

function isClassroomResource(resource) {
  return String(resource?.type_name || "").toLowerCase() === "classroom";
}

function getBookingResources(booking) {
  return booking?.all_resources || booking?.resources || [];
}

function getBookingRoomLine(booking) {
  if (String(booking?.location || "").toLowerCase() === "zoom") {
    return "Room: Zoom";
  }
  const resources = getBookingResources(booking);
  const room = resources.find(isClassroomResource);
  if (!room) return "";
  const name = room.name || "Classroom";
  const meta =
    room.metadata && Object.keys(room.metadata).length > 0
      ? Object.entries(room.metadata)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" | ")
      : "";
  return meta ? `Room: ${name} (${meta})` : `Room: ${name}`;
}

function filterBookingsToCourses(bookings) {
  return bookings
    .map((booking) => {
      const courseResources = (booking.resources || []).filter(isCourseResource);
      if (courseResources.length === 0) return null;
      return { ...booking, resources: courseResources, all_resources: booking.resources || [] };
    })
    .filter(Boolean);
}

export default function App() {
  const [studentId, setStudentId] = useState("");
  const [role, setRole] = useState("student");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState("month"); // month | list
  const [monthDate, setMonthDate] = useState(new Date());
  const [hasStudent, setHasStudent] = useState(false);

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
    course: "",
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
  const [rescheduleLocation, setRescheduleLocation] = useState("classroom");

  async function loadBookings() {
    if (!studentId.trim()) {
      setError("Please enter a student ID.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await getBookingsByUser(studentId.trim());
      if (Array.isArray(data) && data.length > 0) {
        setBookings(data);
      } else {
        const fallback = await getBookingsByUser("");
        setBookings(Array.isArray(fallback) ? fallback : []);
      }
      setHasStudent(true);
    } catch (err) {
      setError(err?.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }

  const activeBookings = useMemo(() => {
    return bookings.filter((b) => !b.cancelled_at);
  }, [bookings]);

  const scheduleBookings = useMemo(
    () => filterBookingsToCourses(activeBookings),
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
    month: "long",
    year: "numeric",
  });
  const availabilityMonthLabel = availabilityMonthDate.toLocaleDateString(
    "en-GB",
    {
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
    if (!resourceQuery.trim()) return [];
    return resources.filter((r) => {
      if (role === "lecturer" && isCourseResource(r)) return false;
      return resourceMatchesQuery(r, resourceQuery);
    });
  }, [resources, resourceQuery, role]);

  const filteredRequestResources = useMemo(() => {
    return resources.filter((r) => {
      if (role === "lecturer" && isCourseResource(r)) return false;
      if (!resourceMatchesQuery(r, requestQuery)) return false;
      if (onlyAvailable && !isResourceAvailable(r)) return false;
      return true;
    });
  }, [resources, requestQuery, onlyAvailable, role]);

  const studentCourses = useMemo(() => {
    if (role !== "student") return [];
    const map = new Map();
    bookings.forEach((booking) => {
      (booking.resources || []).forEach((r) => {
        if (!isCourseResource(r)) return;
        if (!map.has(r.id)) {
          map.set(r.id, r);
        }
      });
    });
    return Array.from(map.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  }, [role, bookings]);

  const selectedResource = useMemo(() => {
    if (!selectedResourceId) return null;
    return resources.find((r) => r.id === selectedResourceId) || null;
  }, [resources, selectedResourceId]);

  const selectedRequestResource = useMemo(() => {
    if (!requestResourceId) return null;
    return resources.find((r) => r.id === requestResourceId) || null;
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
      setResourceError(err?.message || "Failed to load resources.");
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
    if (!hasStudent || !studentId.trim()) return;
    let active = true;

    async function refreshUserData() {
      try {
        const tasks = [getBookingsByUser(studentId.trim())];
        if (role === "lecturer") {
          tasks.push(getResourceRequests());
        } else {
          tasks.push(Promise.resolve([]));
        }
        if (role === "student") {
          tasks.push(getAnnouncements({ userId: studentId.trim() }));
        }
        const [bookingsData, requestsData, announcementsData] =
          await Promise.all(tasks);
        if (!active) return;
        setBookings(Array.isArray(bookingsData) ? bookingsData : []);
        setUserRequests(Array.isArray(requestsData) ? requestsData : []);
        if (role === "student") {
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
  }, [hasStudent, studentId, role]);

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
    const requester = studentId.trim();
    if (!availabilityResource) return;
    if (!requester) {
      setBookingError("Please enter your student ID first.");
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
    if (!availabilityResource || !studentId.trim()) return;
    let active = true;

    async function refreshStatus() {
      try {
        const [bookingsData, userBookings] = await Promise.all([
          getBookingsByResource(availabilityResource.id),
          getBookingsByUser(studentId.trim()),
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
  }, [availabilityResource, studentId]);

  async function submitResourceRequest() {
    if (!selectedRequestResource) return;
    const note = requestNote.trim();
    const requester = studentId.trim();
    if (!requester) {
      setRequestError("Please enter your student ID first.");
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

  // Sidebar selection
  const [section, setSection] = useState("schedule"); // schedule | search | requests | notifications

  async function loadUserRequests() {
    const userId = studentId.trim();
    if (role === "student" && !userId) return;
    setUserRequestsError("");
    setUserRequestsLoading(true);
    try {
      const data =
        role === "lecturer"
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
    const userId = studentId.trim();
    if (role === "student" && !userId) return;
    setAnnouncementsError("");
    setAnnouncementsLoading(true);
    try {
      const data = await getAnnouncements({
        userId: role === "student" ? userId : undefined,
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
    const course = announcementForm.course.trim();
    const targetUserId = announcementForm.targetUserId.trim();
    const senderName =
      announcementForm.senderName.trim() || studentId.trim() || "Lecturer";

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
        course_name: course,
        sender_name: senderName,
        target_user_id: targetUserId || null,
      });
      setAnnouncementSent("Announcement sent.");
      setAnnouncementForm((prev) => ({
        ...prev,
        title: "",
        message: "",
        course: "",
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
    if (role !== "student") return;
    const userId = studentId.trim();
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
    setRescheduleLocation("classroom");
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
          sender_name: cancelSenderName.trim() || studentId.trim() || "Lecturer",
          target_user_id: studentId.trim(),
        });
        setCancelSuccess("Class rescheduled.");
      } else {
        await cancelBooking(booking.id, {
          reason: cancelReason.trim(),
          sender_name: cancelSenderName.trim() || studentId.trim() || "Lecturer",
          target_user_id: studentId.trim(),
        });
        setCancelSuccess("Class cancelled.");
      }
      const data = await getBookingsByUser(studentId.trim());
      setBookings(Array.isArray(data) ? data : []);
      setCancelDialog({ open: false, booking: null });
    } catch (err) {
      setCancelError(
        err?.message || (rescheduleMode ? "Failed to reschedule class." : "Failed to cancel class.")
      );
    } finally {
      setCancelSubmitting(false);
    }
  }

  useEffect(() => {
    const userId = studentId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_${userId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      setSeenRequestIds(Array.isArray(stored) ? stored : []);
    } catch {
      setSeenRequestIds([]);
    }
  }, [studentId]);

  useEffect(() => {
    const userId = studentId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_announcements_${userId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      setSeenAnnouncementIds(Array.isArray(stored) ? stored : []);
    } catch {
      setSeenAnnouncementIds([]);
    }
  }, [studentId]);

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
    if (role !== "student") return 0;
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
      const haystack = [a.title, a.message, a.course_name, a.sender_name]
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
      const aName = a.resource_name || `Resource #${a.resource_id || ""}`;
      const bName = b.resource_name || `Resource #${b.resource_id || ""}`;
      return aName.localeCompare(bName);
    });
  }, [filteredUserRequests]);

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
    if (role === "lecturer") {
      setNotificationTab("requests");
    } else if (role === "student") {
      setNotificationTab("announcements");
      setUserRequests([]);
    }
  }, [role]);

  useEffect(() => {
    if (role === "student" && section === "requests") {
      setSection("schedule");
    }
  }, [role, section]);

  const selectedUserGroup = groupedUserRequests.find(
    (group) => group.key === selectedUserRequestKey
  );

  function markRequestsSeen(resourceId) {
    const userId = studentId.trim();
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
    if (role === "lecturer") {
      loadUserRequests();
    }
    if (role === "student") {
      loadAnnouncements();
    }
  }, [section, studentId, role]);

  useEffect(() => {
    if (section !== "notifications") return;
    if (role !== "student" || !studentId.trim()) return;
    let active = true;

    async function refreshAnnouncements() {
      try {
        const data = await getAnnouncements({
          userId: role === "student" ? studentId.trim() : undefined,
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
  }, [section, studentId, role]);

  if (!hasStudent) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-greeting">
            <div className="login-greeting-title">Welcome</div>
            <div className="login-greeting-sub">
              Sign in to manage your bookings with SmartAllocate.
            </div>
          </div>

          <div className="login-divider" />

          <div className="login-form">
            <label className="login-label">Student ID</label>
            <input
              className="login-input"
              type="password"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. 123456789"
            />
            <button
              className="login-button"
              onClick={loadBookings}
              disabled={loading}
            >
              {loading ? "Loading..." : "Sign in"}
            </button>
            {error && <div className="login-error">{error}</div>}
          </div>
        </div>
      </div>
    );
  }
  const requestDisabled = bookingSubmitting;
  const requestButtonLabel = "Send request";
  const requestButtonBackground = bookingSubmitting ? "#94a3b8" : "#2563eb";
  const requestButtonColor = "#fff";

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#f8fafc" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: "#0f172a",
          color: "#e2e8f0",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18 }}>SmartAllocate</div>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              fontSize: 10,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Role
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setRole("student")}
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #1e293b",
                background: role === "student" ? "#2563eb" : "transparent",
                color: role === "student" ? "#fff" : "#cbd5e1",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Student
            </button>
            <button
              onClick={() => setRole("lecturer")}
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #1e293b",
                background: role === "lecturer" ? "#2563eb" : "transparent",
                color: role === "lecturer" ? "#fff" : "#cbd5e1",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Lecturer
            </button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#cbd5e1" }}>
          Student ID: {studentId}
        </div>
        <button
          onClick={() => setSection("schedule")}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: section === "schedule" ? "#1d4ed8" : "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          My Schedule
        </button>
        <button
          onClick={() => setSection("search")}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: section === "search" ? "#1d4ed8" : "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {role === "student" ? "My Courses" : "Find Resource"}
        </button>
        {role === "lecturer" && (
          <button
            onClick={() => setSection("requests")}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: section === "requests" ? "#1d4ed8" : "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Resource Requests
          </button>
        )}
        <button
          onClick={() => setSection("notifications")}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: section === "notifications" ? "#1d4ed8" : "transparent",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>{role === "student" ? "Notifications" : "Request Updates"}</span>
          {unreadNotificationCount > 0 && role === "student" && (
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
        <div style={{ marginTop: "auto", fontSize: 12, color: "#94a3b8" }}>
          Powered by SmartAllocate
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {section === "schedule" ? (
          <>
            <header
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>My Schedule</h1>
              <p style={{ margin: 0, color: "#475569" }}>
                Month or list view of your courses.
              </p>
            </header>

            <div
              className="glass"
              style={{
                padding: 16,
                borderRadius: 18,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <h3 style={{ margin: 0, color: "#0f172a" }}>My Courses</h3>
                <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
                  Search by resource or tag. Switch between month grid and list.
                </p>
              </div>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search..."
                style={{
                  width: 220,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#0f172a",
                }}
              />
              <div
                className="glass"
                style={{
                  display: "flex",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
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
                      padding: "10px 14px",
                      border: "none",
                      background:
                        viewMode === opt.key
                          ? "rgba(37,99,235,0.1)"
                          : "transparent",
                      color: "#0f172a",
                      cursor: "pointer",
                      fontWeight: 700,
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
                No courses yet. Enter an ID and click "Load bookings".
              </div>
            ) : (
              <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
                {viewMode === "month" ? (
                  <MonthGrid
                    monthLabel={monthLabel}
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
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            background:
                              "linear-gradient(135deg,#2563eb,#1d4ed8)",
                            color: "#fff",
                            fontSize: 12,
                            boxShadow: "0 6px 18px rgba(37,99,235,0.25)",
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {(b.resources || [])
                              .map((r) => r.name)
                              .filter(Boolean)
                              .join(" / ")}
                          </div>
                          <div style={{ opacity: 0.9 }}>
                            {formatTime(b.start_time)} - {formatTime(b.end_time)}
                          </div>
                          {roomLine && (
                            <div style={{ fontSize: 11, fontWeight: 700 }}>
                              {roomLine}
                            </div>
                          )}
                          {role === "lecturer" && (
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
                                border: "1px solid rgba(255,255,255,0.6)",
                                background: past ? "rgba(255,255,255,0.3)" : "#fff",
                                color: past ? "#e2e8f0" : "#1d4ed8",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: past ? "not-allowed" : "pointer",
                              }}
                            >
                              Cancel class
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
                      onCancel={openCancelDialog}
                    />
                    <Section
                      title="Past"
                      color="#94a3b8"
                      items={past}
                      role={role}
                      onCancel={openCancelDialog}
                    />
                  </>
                )}
              </div>
            )}
          </>
        ) : section === "search" ? (
          <>
            {role === "student" ? (
              <>
                <header
                  style={{
                    padding: "12px 0",
                    borderBottom: "1px solid #e2e8f0",
                    marginBottom: 16,
                  }}
                >
                  <h1 style={{ margin: 0, color: "#0f172a" }}>My Courses</h1>
                  <p style={{ margin: 0, color: "#475569" }}>
                    Your enrolled courses and session details.
                  </p>
                </header>

                <div className="glass" style={{ padding: 16, borderRadius: 18 }}>
                  {studentCourses.length === 0 ? (
                    <div style={{ color: "#475569" }}>
                      No courses available yet.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {studentCourses.map((course) => {
                        const sessions = allResourceSessions[course.id] || [];
                        const upcomingSessions = sessions.filter(
                          (s) =>
                            new Date(`${s.date}T${s.start}`) >= new Date()
                        );
                        const nextSession =
                          upcomingSessions[0] || sessions[0] || null;
                        return (
                          <div
                            key={course.id}
                            className="glass"
                            style={{
                              padding: 16,
                              borderRadius: 16,
                              border: "1px solid #e2e8f0",
                              background: "#fff",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 10,
                                marginBottom: 6,
                              }}
                            >
                              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                                {course.name}
                              </div>
                              <span
                                style={{
                                  fontSize: 12,
                                  background: "#e0e7ff",
                                  color: "#1d4ed8",
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontWeight: 700,
                                }}
                              >
                                {course.type_name || "Course"}
                              </span>
                            </div>
                            {course.metadata &&
                              Object.keys(course.metadata).length > 0 && (
                                <div
                                  style={{
                                    color: "#64748b",
                                    fontSize: 12,
                                    marginBottom: 8,
                                  }}
                                >
                                  {Object.entries(course.metadata)
                                    .slice(0, 4)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(" | ")}
                                </div>
                              )}
                            <div style={{ fontSize: 12, color: "#475569" }}>
                              {nextSession ? (
                                <>
                                  Next session: {formatDate(nextSession.date)}{" "}
                                  {formatTime(nextSession.start)} -{" "}
                                  {formatTime(nextSession.end)}
                                </>
                              ) : (
                                "No upcoming sessions scheduled."
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
            <header
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>Find a resource</h1>
              <p style={{ margin: 0, color: "#475569" }}>
                Search by name or tags, then expand to see your dates & times.
              </p>
            </header>

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
                  value={resourceQuery}
                  onChange={(e) => setResourceQuery(e.target.value)}
                  placeholder="e.g. projector, room 103, prep station..."
                  style={{
                    flex: 1,
                    minWidth: 280,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                />
                <button
                  onClick={loadResources}
                  disabled={resourceLoading}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: resourceLoading ? "#94a3b8" : "#2563eb",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: resourceLoading ? "default" : "pointer",
                    boxShadow: "0 10px 30px rgba(37,99,235,0.25)",
                  }}
                >
                  {resourceLoading ? "Searching..." : "Search"}
                </button>
              </div>

              {resourceError && (
                <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
                  {resourceError}
                </div>
              )}

              {resourceQuery.trim() &&
                filteredResources.length === 0 &&
                !resourceLoading && (
                  <div
                    style={{
                      marginTop: 16,
                      color: "#475569",
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
                    background:
                      "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(14,116,144,0.12))",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <button
                    onClick={() => setSelectedResourceId(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#1d4ed8",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                      marginBottom: 12,
                    }}
                  >
                    Back to results
                  </button>
                  <div
                    className="glass"
                    style={{
                      padding: 16,
                      borderRadius: 16,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          Resource
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                          {selectedResource.name}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          background: "#e0e7ff",
                          color: "#1d4ed8",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontWeight: 700,
                        }}
                      >
                        {selectedResource.type_name || "Resource"}
                      </span>
                    </div>

                    {selectedResource.metadata &&
                      Object.keys(selectedResource.metadata).length > 0 && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#475569",
                            lineHeight: 1.6,
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            marginBottom: 14,
                          }}
                        >
                          {Object.entries(selectedResource.metadata)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" | ")}
                        </div>
                      )}

                    <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
                      Sessions
                    </div>
                    {(resourceSessions[selectedResource.id] || []).length === 0 && (
                      <div style={{ color: "#475569" }}>
                        No sessions found for this resource.
                      </div>
                    )}
                    {(resourceSessions[selectedResource.id] || []).length > 0 && (
                      <div style={{ display: "grid", gap: 10 }}>
                        {(resourceSessions[selectedResource.id] || []).map((s) => (
                          <div
                            key={`${s.bookingId}-${s.start}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "6px 1fr",
                              gap: 12,
                              alignItems: "stretch",
                            }}
                          >
                            <div
                              style={{
                                borderRadius: 999,
                                background: "linear-gradient(180deg,#2563eb,#0ea5a5)",
                              }}
                            />
                            <div
                              style={{
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              <div style={{ fontWeight: 700 }}>
                                {formatDate(s.date)}
                              </div>
                              <div style={{ color: "#475569", fontSize: 12 }}>
                                {formatTime(s.start)} - {formatTime(s.end)} - Booking #{s.bookingId}
                              </div>
                              {s.role && (
                                <div style={{ color: "#1d4ed8", fontWeight: 700 }}>
                                  Role: {s.role}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                filteredResources.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {filteredResources.slice(0, 20).map((r) => {
                      const sessions = resourceSessions[r.id] || [];
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedResourceId(r.id)}
                          className="glass"
                          style={{
                            textAlign: "left",
                            borderRadius: 16,
                            padding: 14,
                            border: "1px solid #e2e8f0",
                            background: "#fff",
                            cursor: "pointer",
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div style={{ fontWeight: 800, color: "#0f172a" }}>
                              {r.name}
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                background: "#e0e7ff",
                                color: "#1d4ed8",
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontWeight: 700,
                              }}
                            >
                              {r.type_name || "Resource"}
                            </span>
                          </div>
                          <div style={{ color: "#475569", fontSize: 12 }}>
                            {sessions.length} session{sessions.length === 1 ? "" : "s"}
                          </div>
                          {r.metadata && Object.keys(r.metadata).length > 0 && (
                            <div style={{ color: "#64748b", fontSize: 12 }}>
                              {Object.entries(r.metadata)
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" | ")}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </div>
              </>
            )}
          </>
        ) : section === "requests" ? (
          <>
            <header
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>
                Request a resource
              </h1>
              <p style={{ margin: 0, color: "#475569" }}>
                Browse resources and send a request to your admin.
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
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#0f172a",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Back to resources
                  </button>
                </div>

                {selectedRequestResource ? (
                  <>
                    <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>
                      {selectedRequestResource.name}{" "}
                      {selectedRequestResource.type_name
                        ? `(${selectedRequestResource.type_name})`
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
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "none",
                          background: requestSubmitting ? "#94a3b8" : "#2563eb",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: requestSubmitting ? "default" : "pointer",
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
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          color: "#0f172a",
                          fontWeight: 700,
                          cursor: requestSubmitting ? "default" : "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 12, color: "#475569" }}>
                    Pick a resource to continue.
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
                    placeholder="Search resources..."
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
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: "none",
                      background: resourceLoading ? "#94a3b8" : "#2563eb",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: resourceLoading ? "default" : "pointer",
                      boxShadow: "0 10px 30px rgba(37,99,235,0.25)",
                    }}
                  >
                    {resourceLoading ? "Loading..." : "Load resources"}
                  </button>
                </div>

                {resourceError && (
                  <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
                    {resourceError}
                  </div>
                )}

                {resources.length === 0 && !resourceLoading && (
                  <div style={{ marginTop: 16, color: "#475569" }}>
                    Load resources to get started.
                  </div>
                )}

                {resources.length > 0 &&
                  filteredRequestResources.length === 0 &&
                  !resourceLoading && (
                    <div style={{ marginTop: 16, color: "#475569" }}>
                      No resources match your filters.
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
                    {filteredRequestResources.slice(0, 20).map((r) => {
                      const available = isResourceAvailable(r);
                      return (
                        <div
                          key={r.id}
                          className="glass"
                          style={{
                            borderRadius: 16,
                            padding: 14,
                            border: "1px solid #e2e8f0",
                            background: "#fff",
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                                {r.name}
                              </div>
                              <div style={{ color: "#475569", fontSize: 12 }}>
                                {r.type_name ? `Type: ${r.type_name}` : "Resource"}
                              </div>
                            </div>
                          <button
                            type="button"
                            onClick={() => openAvailability(r)}
                            style={{
                              fontSize: 12,
                              background: available ? "#dcfce7" : "#e2e8f0",
                              color: available ? "#166534" : "#475569",
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontWeight: 700,
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            {available ? "Available" : "Check availability"}
                          </button>
                          </div>

                          {r.metadata && Object.keys(r.metadata).length > 0 && (
                            <div style={{ color: "#64748b", fontSize: 12 }}>
                              {Object.entries(r.metadata)
                                .slice(0, 4)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" | ")}
                            </div>
                          )}

                          <div>
                            <button
                              onClick={() => {
                                setRequestResourceId(r.id);
                                setRequestSent("");
                                setRequestError("");
                                setRequestNote("");
                                setRequestView("form");
                              }}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "none",
                                background: "#0f172a",
                                color: "#fff",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Request this resource
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
        ) : (
          <>
            <header
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>
                {role === "student" ? "Notifications" : "Request Updates"}
              </h1>
              <p style={{ margin: 0, color: "#475569" }}>
                {role === "student"
                  ? "Updates from lecturers about cancelled classes."
                  : "Track the status of allocation requests."}
              </p>
            </header>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {role === "lecturer" && (
                <button
                  type="button"
                  onClick={() => setNotificationTab("requests")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background:
                      notificationTab === "requests" ? "#2563eb" : "#fff",
                    color: notificationTab === "requests" ? "#fff" : "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Request Updates
                </button>
              )}
              {role === "student" && (
                <button
                  type="button"
                  onClick={() => setNotificationTab("announcements")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background:
                      notificationTab === "announcements" ? "#2563eb" : "#fff",
                    color:
                      notificationTab === "announcements" ? "#fff" : "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Lecturer Messages
                </button>
              )}
            </div>

            <div
              className="glass"
              style={{
                padding: 16,
                borderRadius: 18,
                display:
                  role === "lecturer" && notificationTab === "requests"
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
                  placeholder="Search by resource, date, or status..."
                  style={{
                    flex: 1,
                    minWidth: 220,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                />
                <button
                  onClick={loadUserRequests}
                  disabled={userRequestsLoading}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: userRequestsLoading ? "#94a3b8" : "#2563eb",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: userRequestsLoading ? "default" : "pointer",
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
                <div className="bg-white shadow rounded-lg overflow-hidden">
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
                              padding: "16px 18px",
                              borderRadius: 14,
                              border: "1px solid #e2e8f0",
                              background: "#fff",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: "#0f172a",
                                }}
                              >
                                {group.resource_name ||
                                  `Resource #${group.resource_id}`}
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b" }}>
                                {group.resource_type || "Resource"}
                              </div>
                            </div>
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
                          border: "none",
                          background: "transparent",
                          color: "#1d4ed8",
                          fontWeight: 700,
                          cursor: "pointer",
                          padding: 0,
                          marginBottom: 12,
                        }}
                      >
                        Back to resources
                      </button>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>
                        {selectedUserGroup.resource_name ||
                          `Resource #${selectedUserGroup.resource_id}`}
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
                                padding: 14,
                                borderRadius: 14,
                                border: "1px solid #e2e8f0",
                                background: "#fff",
                                display: "flex",
                                gap: 12,
                                alignItems: "center",
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
                padding: 16,
                borderRadius: 18,
                display:
                  role === "student" && notificationTab === "announcements"
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
                  value={announcementsQuery}
                  onChange={(e) => setAnnouncementsQuery(e.target.value)}
                  placeholder="Search announcements..."
                  style={{
                    flex: 1,
                    minWidth: 220,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                />
                <button
                  onClick={loadAnnouncements}
                  disabled={announcementsLoading}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: announcementsLoading ? "#94a3b8" : "#2563eb",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: announcementsLoading ? "default" : "pointer",
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

              {role === "lecturer" && (
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
                      value={announcementForm.course}
                      onChange={(e) =>
                        setAnnouncementForm((prev) => ({
                          ...prev,
                          course: e.target.value,
                        }))
                      }
                      placeholder="Course name (optional)"
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
                      placeholder="Student ID (optional)"
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
                <div style={{ color: "#475569" }}>
                  No announcements yet.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {filteredAnnouncements.map((a) => {
                    const isUnread =
                      role === "student" &&
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
                          padding: "16px 18px",
                          borderRadius: 14,
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          display: "grid",
                          gap: 6,
                          boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
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
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>
                            {a.title}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {a.course_name ? `${a.course_name} • ` : ""}
                          {a.sender_name || "Lecturer"} •{" "}
                          {formatDate(a.created_at)}
                        </div>
                        {isSelected && (
                          <div style={{ color: "#475569", fontSize: 14 }}>
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
                Cancel class
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
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
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
                        <option value="classroom">Classroom</option>
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
                      ? `(${availabilityResource.type_name})`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!availabilityResource || !studentId.trim()) return;
                    setAvailabilityLoading(true);
                    Promise.all([
                      getBookingsByResource(availabilityResource.id),
                      getBookingsByUser(studentId.trim()),
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
                      No bookings yet for this resource.
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
                      Request this resource
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

function Section({ title, color, items, role, onCancel }) {
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
            <BookingCard key={b.id} booking={b} role={role} onCancel={onCancel} />
          ))}
        </div>
      )}
    </section>
  );
}

function BookingCard({ booking, role, onCancel }) {
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
            background: "rgba(37, 99, 235, 0.1)",
            color: "#1d4ed8",
            fontSize: 13,
            border: "1px solid rgba(37,99,235,0.25)",
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
      {role === "lecturer" && (
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
          Cancel class
        </button>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {(booking.resources || []).map((r) => (
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
              {r.type_name ? `Type: ${r.type_name}` : ""}
              {r.role ? ` - Role: ${r.role}` : ""}
            </div>
              {r.metadata && Object.keys(r.metadata).length > 0 && (
                <div
                  style={{
                    color: "#64748b",
                    fontSize: 12,
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {Object.entries(r.metadata)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" | ")}
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
    <div className="glass" style={{ padding: 16, borderRadius: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onPrev}
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            &lt;
          </button>
          <button
            onClick={onNext}
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            &gt;
          </button>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>{monthLabel}</div>
        </div>
        <div className="badge">
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

