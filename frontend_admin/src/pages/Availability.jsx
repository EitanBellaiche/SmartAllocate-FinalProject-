import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./AvailabilityCalendar.css";
import { getOrgConfig, rememberPresentation } from "../orgConfig";
const localizer = momentLocalizer(moment);

const DEFAULT_MOVIES = [
  "Dune: Part Two",
  "Inside Out 2",
  "Oppenheimer",
  "Barbie",
  "Spider-Man: Across the Spider-Verse",
  "The Batman",
  "Interstellar",
];

const EMPTY_DAY_MODAL = {
  open: false,
  date: "",
};

const SHENKAR_EVENT_PALETTE = [
  {
    bg: "linear-gradient(135deg, #e7ddd0 0%, #d7c7b1 100%)",
    fg: "#3f3327",
    border: "rgba(122, 107, 86, 0.45)",
    shadow: "0 8px 16px rgba(95, 86, 73, 0.14)",
  },
  {
    bg: "linear-gradient(135deg, #dfe9e6 0%, #c7d8d2 100%)",
    fg: "#2f4a45",
    border: "rgba(102, 124, 117, 0.44)",
    shadow: "0 8px 16px rgba(81, 105, 97, 0.14)",
  },
  {
    bg: "linear-gradient(135deg, #e8d7d7 0%, #d8bfc0 100%)",
    fg: "#523b3c",
    border: "rgba(138, 105, 107, 0.42)",
    shadow: "0 8px 16px rgba(117, 84, 86, 0.14)",
  },
  {
    bg: "linear-gradient(135deg, #e7e1d2 0%, #d8cfb8 100%)",
    fg: "#4e442f",
    border: "rgba(131, 119, 90, 0.42)",
    shadow: "0 8px 16px rgba(111, 99, 70, 0.14)",
  },
];

function normalizeResourceMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isLocationLikeResource(resource) {
  const meta = normalizeResourceMetadata(resource?.metadata);
  return Boolean(
    meta.room ||
    meta.location ||
    meta.site ||
    meta.space ||
    meta.building ||
    meta.floor
  );
}

function buildCompactBookingResources(resources) {
  const list = Array.isArray(resources) ? resources.filter(Boolean) : [];
  const locationResources = list.filter(isLocationLikeResource);
  if (locationResources.length > 0) return locationResources;
  return list;
}

function getMovieStorageKey() {
  const raw = localStorage.getItem("smartallocate.admin.session");
  try {
    const session = raw ? JSON.parse(raw) : {};
    const orgId = String(session?.organization_id || "default").trim() || "default";
    return `smartallocate.movies.${orgId}`;
  } catch {
    return "smartallocate.movies.default";
  }
}

export default function Availability() {
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("month");
  const [selectedResource, setSelectedResource] = useState("");
  const [editModal, setEditModal] = useState({
    open: false,
    bookingId: null,
    date: "",
    start_time: "",
    end_time: "",
    user_id: "",
    selectedResources: [],
    roles: {},
    movie: DEFAULT_MOVIES[0],
  });
  const [dayModal, setDayModal] = useState(EMPTY_DAY_MODAL);
  const [modalMessage, setModalMessage] = useState("");

  const config = getOrgConfig();
  const isCinema = config.domain === "cinema";
  const isShenkar = config.domain === "shenkar";
  const theme = config.theme;
  const [movieAssignments, setMovieAssignments] = useState(() => {
    const raw = localStorage.getItem(getMovieStorageKey());
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [movieDraft, setMovieDraft] = useState("");
  const [createModal, setCreateModal] = useState({
    open: false,
    date: "",
    start_time: "",
    end_time: "",
    user_id: "",
    selectedResources: [],
    roles: {},
    movie: DEFAULT_MOVIES[0],
  });

  function persistMovieAssignments(nextAssignments) {
    setMovieAssignments(nextAssignments);
    localStorage.setItem(getMovieStorageKey(), JSON.stringify(nextAssignments));
  }

  function closeCreateModal() {
    setCreateModal({
      open: false,
      date: "",
      start_time: "",
      end_time: "",
      user_id: "",
      selectedResources: [],
      roles: {},
      movie: DEFAULT_MOVIES[0],
    });
    setModalMessage("");
  }

  function toggleCreateResource(id) {
    setCreateModal((prev) => {
      const selected = prev.selectedResources.includes(id);
      const nextResources = selected
        ? prev.selectedResources.filter((r) => r !== id)
        : [...prev.selectedResources, id];

      const nextRoles = { ...prev.roles };
      if (selected) delete nextRoles[id];
      return { ...prev, selectedResources: nextResources, roles: nextRoles };
    });
  }

  function updateCreateRole(id, value) {
    setCreateModal((prev) => ({
      ...prev,
      roles: { ...prev.roles, [id]: value },
    }));
  }

  function openDayModal(slotInfo) {
    const rawDate = slotInfo?.start || slotInfo;
    const nextDate = moment(rawDate).format("YYYY-MM-DD");
    if (!nextDate || nextDate === "Invalid date") return;
    setDayModal({ open: true, date: nextDate });
  }

  function closeDayModal() {
    setDayModal(EMPTY_DAY_MODAL);
  }

  function toggleResource(id) {
    setEditModal((prev) => {
      const selected = prev.selectedResources.includes(id);
      const nextResources = selected
        ? prev.selectedResources.filter((r) => r !== id)
        : [...prev.selectedResources, id];

      const nextRoles = { ...prev.roles };
      if (selected) delete nextRoles[id];
      return { ...prev, selectedResources: nextResources, roles: nextRoles };
    });
  }

  function updateRole(id, value) {
    setEditModal((prev) => ({
      ...prev,
      roles: { ...prev.roles, [id]: value },
    }));
  }

useEffect(() => {
  (async () => {
    const [resourcesData, typesData] = await Promise.all([
      apiGet("/resources"),
      apiGet("/resource-types"),
    ]);

    const safeResources = Array.isArray(resourcesData) ? resourcesData : [];
    const safeTypes = Array.isArray(typesData) ? typesData : [];

    setResources(safeResources);
    setResourceTypes(safeTypes);

    rememberPresentation(safeTypes, safeResources);
  })();
}, []);

  const buildCalendarEvents = useCallback((list) => {
    const ev = [];
    list.forEach((b) => {
      const dateStr = moment(b.date).format("YYYY-MM-DD");
      const start = moment(`${dateStr} ${b.start_time}`).toDate();
      const end = moment(`${dateStr} ${b.end_time}`).toDate();
      const resourcesList = Array.isArray(b.resources) ? b.resources : [];
      const visibleResources = selectedResource
        ? resourcesList
        : buildCompactBookingResources(resourcesList);
      const filteredResources = selectedResource
        ? visibleResources.filter((r) => String(r.id) === String(selectedResource))
        : visibleResources;
      if (selectedResource && filteredResources.length === 0) return;

      const resourceNames =
        filteredResources.length > 0
          ? filteredResources.map((r) => r.name).join(" / ")
          : isCinema
            ? "Hall"
            : "Resources";

      const assignedMovie = movieAssignments[b.id];

      ev.push({
        id: `booking-${b.id}`,
        booking_id: b.id,
        resource_id: selectedResource || null,
        title: assignedMovie
          ? `${assignedMovie} · ${resourceNames}`
          : `${resourceNames} (${isCinema ? "Screening" : `Booking #${b.id}`})`,
        movie: assignedMovie || "",
        start,
        end,
        allDay: false,
      });
    });

    setEvents(ev);
  }, [isCinema, movieAssignments, selectedResource]);

  const loadBookings = useCallback(async () => {
    const qs = selectedResource ? `?resource_id=${selectedResource}` : "";
    const data = await apiGet(`/bookings${qs}`);
    const list = Array.isArray(data) ? data : [];
    setBookings(list);
    buildCalendarEvents(list);
  }, [buildCalendarEvents, selectedResource]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qs = selectedResource ? `?resource_id=${selectedResource}` : "";
      const data = await apiGet(`/bookings${qs}`);
      if (cancelled) return;
      const list = Array.isArray(data) ? data : [];
      setBookings(list);
      buildCalendarEvents(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [buildCalendarEvents, selectedResource]);

  function openEditModal(event) {
    const booking = bookings.find((b) => b.id === event.booking_id);
    if (!booking) return;

    const selectedResources = (booking.resources || []).map((r) => r.id);
    const roles = {};
    (booking.resources || []).forEach((r) => {
      if (r.role) roles[r.id] = r.role;
    });

    setEditModal({
      open: true,
      bookingId: booking.id,
      date: moment(booking.date).format("YYYY-MM-DD"),
      start_time: booking.start_time,
      end_time: booking.end_time,
      user_id: booking.user_id ?? "",
      selectedResources,
      roles,
      movie: movieAssignments[booking.id] || DEFAULT_MOVIES[0],
    });
    setModalMessage("");
  }

  async function saveEdit() {
    if (!editModal.date || !editModal.start_time || !editModal.end_time) {
      setModalMessage("Date and time are required.");
      return;
    }
    if (!editModal.user_id) {
      setModalMessage("User ID is required.");
      return;
    }
    if (editModal.selectedResources.length === 0) {
      setModalMessage("Select at least one resource.");
      return;
    }

    const userId = Number(editModal.user_id);
    if (!Number.isFinite(userId)) {
      setModalMessage("User ID must be a number.");
      return;
    }

    try {
      await apiPut(`/bookings/${editModal.bookingId}`, {
        resources: editModal.selectedResources,
        roles: editModal.roles,
        date: editModal.date,
        start_time: editModal.start_time,
        end_time: editModal.end_time,
        user_id: userId,
      });

      persistMovieAssignments({
        ...movieAssignments,
        [editModal.bookingId]: editModal.movie || DEFAULT_MOVIES[0],
      });

      await loadBookings();
      setEditModal({
        open: false,
        bookingId: null,
        date: "",
        start_time: "",
        end_time: "",
        user_id: "",
        selectedResources: [],
        roles: {},
        movie: DEFAULT_MOVIES[0],
      });
      setModalMessage("");
    } catch (err) {
      setModalMessage(err?.message || "Failed to update booking.");
    }
  }

  async function deleteBooking() {
    try {
      await apiDelete(`/bookings/${editModal.bookingId}`);

      const nextAssignments = { ...movieAssignments };
      delete nextAssignments[editModal.bookingId];
      persistMovieAssignments(nextAssignments);

      await loadBookings();
      setEditModal({
        open: false,
        bookingId: null,
        date: "",
        start_time: "",
        end_time: "",
        user_id: "",
        selectedResources: [],
        roles: {},
        movie: DEFAULT_MOVIES[0],
      });
      setModalMessage("");
    } catch (err) {
      setModalMessage(err?.message || "Failed to delete booking.");
    }
  }

  async function createScreening() {
    if (!createModal.date || !createModal.start_time || !createModal.end_time) {
      setModalMessage("Date and time are required.");
      return;
    }
    if (createModal.selectedResources.length === 0) {
      setModalMessage(isCinema ? "Select at least one hall or seat resource." : "Select at least one resource.");
      return;
    }

    try {
      const created = await apiPost("/bookings", {
        resources: createModal.selectedResources,
        roles: createModal.roles,
        date: createModal.date,
        start_time: createModal.start_time,
        end_time: createModal.end_time,
        user_id: createModal.user_id ? Number(createModal.user_id) : undefined,
      });

      const createdId = created?.id;
      if (createdId) {
        persistMovieAssignments({
          ...movieAssignments,
          [createdId]: createModal.movie || DEFAULT_MOVIES[0],
        });
      }

      await loadBookings();
      closeCreateModal();
    } catch (err) {
      setModalMessage(err?.message || "Failed to create screening.");
    }
  }

  function openCreateModalFromSlot(slotInfo) {
    const startMoment = moment(slotInfo.start);
    const endMoment = moment(slotInfo.end);
    setCreateModal((prev) => ({
      ...prev,
      open: true,
      date: startMoment.format("YYYY-MM-DD"),
      start_time: startMoment.format("HH:mm"),
      end_time: endMoment.format("HH:mm"),
      movie: prev.movie || DEFAULT_MOVIES[0],
    }));
    setModalMessage("");
  }

  const resourceOptions = useMemo(() => {
    return resources.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [resources]);

  const selectedBookingResources = useMemo(() => {
    return editModal.selectedResources
      .map((id) => resources.find((r) => r.id === id))
      .filter(Boolean);
  }, [editModal.selectedResources, resources]);

  const selectedDayBookings = useMemo(() => {
    if (!dayModal.open || !dayModal.date) return [];

    return bookings
      .filter((booking) => moment(booking.date).format("YYYY-MM-DD") === dayModal.date)
      .map((booking) => {
        const bookingResources = Array.isArray(booking.resources) ? booking.resources : [];
        const filteredResources = selectedResource
          ? bookingResources.filter((resource) => String(resource.id) === String(selectedResource))
          : buildCompactBookingResources(bookingResources);

        return {
          ...booking,
          filteredResources,
        };
      })
      .filter((booking) => booking.filteredResources.length > 0 || !selectedResource)
      .sort((a, b) => {
        const startCompare = String(a.start_time || "").localeCompare(String(b.start_time || ""));
        if (startCompare !== 0) return startCompare;
        return Number(a.id) - Number(b.id);
      });
  }, [bookings, dayModal, selectedResource]);

  const bookingCountsByDate = useMemo(() => {
    return bookings.reduce((acc, booking) => {
      const bookingDate = moment(booking.date).format("YYYY-MM-DD");
      if (!bookingDate || bookingDate === "Invalid date") return acc;

      const bookingResources = Array.isArray(booking.resources) ? booking.resources : [];
      const filteredResources = selectedResource
        ? bookingResources.filter((resource) => String(resource.id) === String(selectedResource))
        : bookingResources;
      if (selectedResource && filteredResources.length === 0) return acc;

      acc[bookingDate] = (acc[bookingDate] || 0) + 1;
      return acc;
    }, {});
  }, [bookings, selectedResource]);

  const calendarMetrics = useMemo(() => {
    const monthKey = moment(currentDate).format("YYYY-MM");
    const monthBookings = bookings.filter((booking) => moment(booking.date).format("YYYY-MM") === monthKey);
    return {
      totalBookings: bookings.length,
      monthBookings: monthBookings.length,
      activeDays: Object.keys(bookingCountsByDate).length,
      resourceCount: selectedResource ? 1 : resources.length,
    };
  }, [bookingCountsByDate, bookings, currentDate, resources.length, selectedResource]);

  const selectedResourceName = useMemo(() => {
    if (!selectedResource) return isCinema ? "All halls and seats" : "All resources";
    return resources.find((resource) => String(resource.id) === String(selectedResource))?.name || "Selected resource";
  }, [isCinema, resources, selectedResource]);

  const displayedEvents = useMemo(() => {
    return calendarView === "month" ? [] : events;
  }, [calendarView, events]);

  function handleSelectSlot(slotInfo) {
    if (calendarView === "month") {
      openDayModal(slotInfo);
      return;
    }
    if (isCinema) {
      openCreateModalFromSlot(slotInfo);
      return;
    }
    openDayModal(slotInfo);
  }

  function handleSelectEvent(event) {
    if (calendarView === "month") {
      openDayModal(event?.start || event);
      return;
    }
    openEditModal(event);
  }

  function MonthDateHeader({ date, label }) {
    const dateKey = moment(date).format("YYYY-MM-DD");
    const hasEvents = Number(bookingCountsByDate[dateKey] || 0) > 0;
    return (
      <button
        type="button"
        onClick={(evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          openDayModal(date);
        }}
        className="availability-month-date-header"
      >
        <span>{label}</span>
        {hasEvents && <span className="availability-month-date-dot" aria-hidden="true" />}
      </button>
    );
  }

  const calendarComponents = {
    month: {
      dateHeader: MonthDateHeader,
    },
  };

  const calendarEventStyle = {
    background: isCinema
      ? "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)"
      : isShenkar
        ? "linear-gradient(135deg, #d8cec0 0%, #c6b59e 100%)"
        : "linear-gradient(135deg, #2563eb 0%, #0f766e 100%)",
    color: isShenkar ? "#3b3025" : "#ffffff",
    borderRadius: "10px",
    padding: "4px 8px",
    border: isCinema
      ? "1px solid rgba(167, 139, 250, 0.42)"
      : isShenkar
        ? "1px solid rgba(118, 104, 83, 0.42)"
        : "1px solid rgba(37, 99, 235, 0.2)",
    boxShadow: isCinema
      ? "0 8px 20px rgba(124, 58, 237, 0.14)"
      : isShenkar
        ? "0 8px 18px rgba(95, 86, 73, 0.14)"
        : "0 8px 20px rgba(37, 99, 235, 0.2)",
    fontWeight: 600,
  };

  function getShenkarEventStyle(event) {
    const seed = Number(event?.booking_id || event?.id || 0);
    const safeSeed = Number.isFinite(seed) ? Math.abs(seed) : 0;
    const swatch = SHENKAR_EVENT_PALETTE[safeSeed % SHENKAR_EVENT_PALETTE.length];
    return {
      background: swatch.bg,
      color: swatch.fg,
      borderRadius: "10px",
      padding: "4px 8px",
      border: `1px solid ${swatch.border}`,
      boxShadow: swatch.shadow,
      fontWeight: 600,
      "--availability-event-bg": swatch.bg,
      "--availability-event-fg": swatch.fg,
      "--availability-event-border": swatch.border,
      "--availability-event-shadow": swatch.shadow,
    };
  }

  return (
    <div className={`availability-page ${isCinema ? "availability-page--cinema" : ""} ${isShenkar ? "availability-page--shenkar" : ""}`}>
      {isCinema && (
        <style>{`
          .rbc-calendar {
            color: #1e293b;
          }
          .rbc-toolbar {
            margin-bottom: 1rem;
            color: #1e293b;
          }
          .rbc-toolbar button {
            color: #5b21b6;
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid rgba(196, 181, 253, 0.9);
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          }
          .rbc-toolbar button:hover,
          .rbc-toolbar button:focus {
            background: #f5f3ff;
            color: #4c1d95;
          }
          .rbc-toolbar button.rbc-active {
            background: #8b5cf6;
            border-color: #a78bfa;
            color: #fff;
            box-shadow: none;
          }
          .rbc-toolbar-label {
            color: #312e81;
            font-weight: 700;
          }
          .rbc-month-view,
          .rbc-time-view,
          .rbc-agenda-view {
            border: 1px solid rgba(196, 181, 253, 0.75);
            border-radius: 18px;
            overflow: hidden;
            background: linear-gradient(180deg, #ffffff 0%, #faf7ff 100%);
          }
          .rbc-header {
            background: rgba(245, 243, 255, 0.95);
            color: #a21caf;
            border-bottom: 1px solid rgba(196, 181, 253, 0.75);
            padding: 10px 6px;
            font-weight: 700;
          }
          .rbc-month-row + .rbc-month-row,
          .rbc-day-bg + .rbc-day-bg,
          .rbc-header + .rbc-header,
          .rbc-time-header-content,
          .rbc-time-content,
          .rbc-time-view,
          .rbc-timeslot-group,
          .rbc-time-header.rbc-overflowing,
          .rbc-time-header-content .rbc-header {
            border-color: rgba(196, 181, 253, 0.6) !important;
          }
          .rbc-day-bg {
            background: rgba(255, 255, 255, 0.94);
          }
          .rbc-off-range-bg {
            background: rgba(241, 245, 249, 0.9);
          }
          .rbc-today {
            background: rgba(238, 242, 255, 0.8) !important;
          }
          .rbc-date-cell {
            color: #334155;
            padding-right: 8px;
            font-weight: 700;
          }
          .rbc-off-range .rbc-date-cell,
          .rbc-off-range {
            color: #94a3b8;
          }
          .rbc-current {
            color: #111827;
          }
          .rbc-event {
            border: none;
            border-radius: 10px;
            padding: 4px 8px;
            box-shadow: 0 8px 20px rgba(124, 58, 237, 0.18);
          }
          .rbc-row-segment {
            padding: 0 4px 4px 4px;
          }
          .rbc-show-more {
            color: #7c3aed;
            background: transparent;
          }
          .rbc-time-slot,
          .rbc-label,
          .rbc-agenda-date-cell,
          .rbc-agenda-time-cell,
          .rbc-agenda-event-cell {
            color: #334155;
          }
          .rbc-agenda-view table.rbc-agenda-table {
            background: linear-gradient(180deg, #ffffff 0%, #faf7ff 100%);
          }
          .rbc-agenda-view table.rbc-agenda-table tbody > tr > td,
          .rbc-agenda-view table.rbc-agenda-table thead > tr > th {
            border-color: rgba(196, 181, 253, 0.6);
          }
        `}</style>
      )}
      <section className="availability-calendar-hero">
        <div className="availability-calendar-hero__copy">
          <span className="availability-eyebrow">{isCinema ? "Screening planner" : "Capacity planning"}</span>
          <h1>{isCinema ? "Screening Calendar" : "Bookings Calendar"}</h1>
          <p>
            {isCinema
              ? "Choose movies, halls, and time slots from one clear scheduling surface."
              : "Review bookings, compare capacity, and jump into daily assignments without visual noise."}
          </p>
        </div>

        <div className="availability-filter-card">
          <label htmlFor="availability-resource-filter">{isCinema ? "Hall / Seat" : "Resource"}</label>
          <select
            id="availability-resource-filter"
            value={selectedResource}
            onChange={(e) => setSelectedResource(e.target.value)}
          >
            <option value="">{isCinema ? "All halls and seats" : "All resources"}</option>
            {resourceOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span>{selectedResourceName}</span>
          {isCinema && (
            <button
              type="button"
              onClick={() => setCreateModal((prev) => ({ ...prev, open: true }))}
              className="availability-primary-action"
            >
              + Add Screening
            </button>
          )}
        </div>
      </section>

      <section className="availability-metrics">
        <article>
          <span>Total bookings</span>
          <strong>{calendarMetrics.totalBookings}</strong>
        </article>
        <article>
          <span>This month</span>
          <strong>{calendarMetrics.monthBookings}</strong>
        </article>
        <article>
          <span>Active days</span>
          <strong>{calendarMetrics.activeDays}</strong>
        </article>
        <article>
          <span>Resources in view</span>
          <strong>{calendarMetrics.resourceCount}</strong>
        </article>
      </section>

      <section className="availability-calendar-panel">
        <div className="availability-calendar-panel__header">
          <div>
            <span className="availability-eyebrow">Calendar view</span>
            <h2>{isCinema ? "Now Showing Planner" : "Allocation Timeline"}</h2>
          </div>
          <div className="availability-calendar-panel__hint">
            Month cells open daily details. Week and day views open editable bookings.
          </div>
        </div>

        <div className="availability-calendar-shell">
          <div className="availability-rbc">
            <Calendar
              localizer={localizer}
              events={displayedEvents}
              date={currentDate}
              view={calendarView}
              onNavigate={(date) => setCurrentDate(date)}
              onView={setCalendarView}
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              startAccessor="start"
              endAccessor="end"
              views={["month", "week", "day", "agenda"]}
              defaultView="month"
              style={{ height: 640 }}
              toolbar
              popup
              selectable
              components={calendarComponents}
              eventPropGetter={(event) => ({
                style: isCinema
                  ? {
                      backgroundColor: "#7c3aed",
                      color: "white",
                      borderRadius: "6px",
                      padding: "4px",
                      border: "none",
                    }
                  : isShenkar
                    ? getShenkarEventStyle(event)
                    : calendarEventStyle,
              })}
            />
          </div>
        </div>
      </section>

      {dayModal.open && (
        <div className={`availability-day-modal__backdrop fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm ${isShenkar ? "availability-day-modal__backdrop--shenkar" : ""}`}>
          <div className={`availability-day-modal relative z-40 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-7 ${isShenkar ? "availability-day-modal--shenkar" : ""}`}>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Daily Schedule
                </div>
                <h3 className="availability-day-modal__title mt-3 text-2xl font-semibold text-slate-900">
                  {moment(dayModal.date).format("DD.MM.YYYY")}
                </h3>
                <p className="availability-day-modal__subtitle mt-1 text-sm text-slate-500">
                  All bookings for the selected date, sorted by start time.
                </p>
              </div>
              <button
                onClick={closeDayModal}
                className="availability-day-modal__close rounded-xl border border-slate-200 px-4 py-2 text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {selectedDayBookings.map((booking) => {
                const dayResources = booking.filteredResources || [];
                return (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() =>
                      openEditModal({
                        booking_id: booking.id,
                      })
                    }
                    className={`availability-day-modal__booking block w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left shadow-sm transition ${isShenkar ? "availability-day-modal__booking--shenkar" : "hover:border-blue-300 hover:bg-blue-50"}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="availability-day-modal__time text-lg font-semibold text-slate-900">
                          {String(booking.start_time || "").slice(0, 5)} - {String(booking.end_time || "").slice(0, 5)}
                        </div>
                        <div className="availability-day-modal__user mt-1 text-sm text-slate-600">
                          User: {booking.user_id || "Not assigned"}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {dayResources.map((resource) => (
                            <span
                              key={`${booking.id}-${resource.id}`}
                              className="availability-day-modal__chip rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                            >
                              {resource.name}
                              {resource.type_name ? ` • ${resource.type_name}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="availability-day-modal__booking-id text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Booking #{booking.id}
                      </div>
                    </div>
                  </button>
                );
              })}

              {selectedDayBookings.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No bookings found for this date.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editModal.open && (
        <div className={`availability-edit-modal__backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 ${isShenkar ? "availability-edit-modal__backdrop--shenkar" : ""}`}>
          <div className={`availability-edit-modal relative z-50 max-h-[90vh] w-full max-w-[680px] overflow-y-auto rounded-[24px] border p-4 shadow-2xl sm:p-6 ${theme.modalCard} ${isShenkar ? "availability-edit-modal--shenkar" : ""}`}>
            <h3 className={`mb-4 text-xl font-semibold ${theme.textStrong}`}>{isCinema ? "Edit Screening" : "Edit Booking"}</h3>

            {modalMessage && (
              <div className="mb-3 rounded bg-red-100 p-2 text-red-700">
                {modalMessage}
              </div>
            )}

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>Date</label>
                <input
                  type="date"
                  className={`w-full rounded border p-2 ${theme.input}`}
                  value={editModal.date}
                  onChange={(e) => setEditModal((p) => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>Start</label>
                <input
                  type="time"
                  className={`w-full rounded border p-2 ${theme.input}`}
                  value={editModal.start_time}
                  onChange={(e) => setEditModal((p) => ({ ...p, start_time: e.target.value }))}
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>End</label>
                <input
                  type="time"
                  className={`w-full rounded border p-2 ${theme.input}`}
                  value={editModal.end_time}
                  onChange={(e) => setEditModal((p) => ({ ...p, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>User ID</label>
              <input
                type="number"
                className={`w-full rounded border p-2 ${theme.input}`}
                value={editModal.user_id}
                onChange={(e) => setEditModal((p) => ({ ...p, user_id: e.target.value }))}
              />
            </div>

            {isCinema && (
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
                <div>
                  <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>Movie</label>
                  <select
                    className={`w-full rounded border p-2 ${theme.input}`}
                    value={editModal.movie || DEFAULT_MOVIES[0]}
                    onChange={(e) => setEditModal((p) => ({ ...p, movie: e.target.value }))}
                  >
                    {DEFAULT_MOVIES.map((movie) => (
                      <option key={movie} value={movie}>
                        {movie}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>Custom Movie Title</label>
                  <input
                    type="text"
                    className={`w-full rounded border p-2 ${theme.input}`}
                    value={movieDraft}
                    onChange={(e) => setMovieDraft(e.target.value)}
                    placeholder="Type a custom movie title..."
                  />
                  <button
                    type="button"
                    className="availability-edit-modal__custom-title mt-2 rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800"
                    onClick={() => {
                      if (!movieDraft.trim()) return;
                      setEditModal((p) => ({ ...p, movie: movieDraft.trim() }));
                      setMovieDraft("");
                    }}
                  >
                    Use Custom Title
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className={`mb-2 block text-sm font-medium ${theme.textStrong}`}>{isCinema ? "Hall / Seat Resources" : "Resources"}</label>
              <div className={`max-h-64 overflow-y-auto rounded border p-3 ${theme.modalSurface}`}>
                {resourceOptions.map((r) => {
                  const type = resourceTypes.find((t) => t.id === r.type_id);
                  const typeRoles = Array.isArray(type?.roles) ? type.roles : [];
                  const checked = editModal.selectedResources.includes(r.id);
                  return (
                <div key={r.id} className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleResource(r.id)}
                    />
                    <span>{r.name}</span>
                  </label>

                      {checked && typeRoles.length > 0 && (
                        <select
                          className={`rounded border px-2 py-1 ${theme.input}`}
                          value={editModal.roles[r.id] || ""}
                          onChange={(e) => updateRole(r.id, e.target.value)}
                        >
                          <option value="">Role (optional)</option>
                          {typeRoles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      )}
                </div>
                  );
                })}
              </div>
            </div>

            {selectedBookingResources.length > 0 && (
              <div className={`mb-4 text-sm ${isCinema ? "text-slate-300" : "text-gray-600"}`}>
                {isCinema ? "Assigned to:" : "Selected:"} {selectedBookingResources.map((r) => r.name).join(", ")}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={deleteBooking}
                className={`availability-edit-modal__delete rounded px-4 py-2 ${theme.buttonDanger}`}
              >
                Delete
              </button>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() =>
                    setEditModal({
                      open: false,
                      bookingId: null,
                      date: "",
                      start_time: "",
                      end_time: "",
                      user_id: "",
                      selectedResources: [],
                      roles: {},
                      movie: DEFAULT_MOVIES[0],
                    })
                  }
                  className={`availability-edit-modal__cancel rounded border px-4 py-2 ${theme.buttonGhost}`}
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className={`availability-edit-modal__save rounded px-4 py-2 ${theme.buttonPrimary}`}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {createModal.open && (
        <div className={`availability-create-modal__backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 ${isShenkar ? "availability-create-modal__backdrop--shenkar" : ""}`}>
          <div className={`availability-create-modal relative z-50 max-h-[90vh] w-full max-w-[680px] overflow-y-auto rounded-[24px] border p-4 shadow-2xl sm:p-6 ${theme.modalCard} ${isShenkar ? "availability-create-modal--shenkar" : ""}`}>
            <h3 className={`mb-4 text-xl font-semibold ${theme.textStrong}`}>{isCinema ? "Create Screening" : "Create Booking"}</h3>

            {modalMessage && (
              <div className="mb-3 rounded bg-red-100 p-2 text-red-700">
                {modalMessage}
              </div>
            )}

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>Date</label>
                <input
                  type="date"
                  className={`w-full rounded border p-2 ${theme.input}`}
                  value={createModal.date}
                  onChange={(e) => setCreateModal((p) => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>Start</label>
                <input
                  type="time"
                  className={`w-full rounded border p-2 ${theme.input}`}
                  value={createModal.start_time}
                  onChange={(e) => setCreateModal((p) => ({ ...p, start_time: e.target.value }))}
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>End</label>
                <input
                  type="time"
                  className={`w-full rounded border p-2 ${theme.input}`}
                  value={createModal.end_time}
                  onChange={(e) => setCreateModal((p) => ({ ...p, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
              <div>
                <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>Movie</label>
                <select
                  className={`w-full rounded border p-2 ${theme.input}`}
                  value={createModal.movie || DEFAULT_MOVIES[0]}
                  onChange={(e) => setCreateModal((p) => ({ ...p, movie: e.target.value }))}
                >
                  {DEFAULT_MOVIES.map((movie) => (
                    <option key={movie} value={movie}>
                      {movie}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`mb-1 block text-sm font-medium ${theme.textStrong}`}>User ID (optional)</label>
                <input
                  type="number"
                  className={`w-full rounded border p-2 ${theme.input}`}
                  value={createModal.user_id}
                  onChange={(e) => setCreateModal((p) => ({ ...p, user_id: e.target.value }))}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className={`mb-2 block text-sm font-medium ${theme.textStrong}`}>{isCinema ? "Hall / Seat Resources" : "Resources"}</label>
              <div className={`max-h-64 overflow-y-auto rounded border p-3 ${theme.modalSurface}`}>
                {resourceOptions.map((r) => {
                  const type = resourceTypes.find((t) => t.id === r.type_id);
                  const typeRoles = Array.isArray(type?.roles) ? type.roles : [];
                  const checked = createModal.selectedResources.includes(r.id);
                  return (
                    <div key={r.id} className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCreateResource(r.id)}
                        />
                        <span>{r.name}</span>
                      </label>

                      {checked && typeRoles.length > 0 && (
                        <select
                          className={`rounded border px-2 py-1 ${theme.input}`}
                          value={createModal.roles[r.id] || ""}
                          onChange={(e) => updateCreateRole(r.id, e.target.value)}
                        >
                          <option value="">Role (optional)</option>
                          {typeRoles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button onClick={closeCreateModal} className={`availability-create-modal__cancel rounded border px-4 py-2 ${theme.buttonGhost}`}>
                Cancel
              </button>
              <button
                onClick={createScreening}
                className={`availability-create-modal__save rounded px-4 py-2 ${theme.buttonPrimary}`}
              >
                {isCinema ? "Create Screening" : "Create Booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
