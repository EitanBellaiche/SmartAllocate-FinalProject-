import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPut } from "../api/api";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import IsraelDateInput from "../components/IsraelDateInput";

const localizer = momentLocalizer(moment);

const EMPTY_EDIT_MODAL = {
  open: false,
  bookingId: null,
  date: "",
  start_time: "",
  end_time: "",
  user_id: "",
  selectedResources: [],
  roles: {},
};

const EMPTY_DAY_MODAL = {
  open: false,
  date: "",
};

export default function Availability() {
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedResource, setSelectedResource] = useState("");
  const [editModal, setEditModal] = useState(EMPTY_EDIT_MODAL);
  const [dayModal, setDayModal] = useState(EMPTY_DAY_MODAL);
  const [modalMessage, setModalMessage] = useState("");

  useEffect(() => {
    (async () => {
      const [resourcesData, typesData] = await Promise.all([
        apiGet("/resources"),
        apiGet("/resource-types"),
      ]);
      setResources(Array.isArray(resourcesData) ? resourcesData : []);
      setResourceTypes(Array.isArray(typesData) ? typesData : []);
    })();
  }, []);

  useEffect(() => {
    loadBookings();
  }, [selectedResource]);

  async function loadBookings() {
    const qs = selectedResource ? `?resource_id=${selectedResource}` : "";
    const data = await apiGet(`/bookings${qs}`);
    const list = Array.isArray(data) ? data : [];
    setBookings(list);
    buildCalendarEvents(list);
  }

  function buildCalendarEvents(list) {
    const nextEvents = [];
    list.forEach((booking) => {
      const dateStr = moment(booking.date).format("YYYY-MM-DD");
      const start = moment(`${dateStr} ${booking.start_time}`).toDate();
      const end = moment(`${dateStr} ${booking.end_time}`).toDate();
      const resourcesList = Array.isArray(booking.resources) ? booking.resources : [];
      const filteredResources = selectedResource
        ? resourcesList.filter((resource) => String(resource.id) === String(selectedResource))
        : resourcesList;
      if (selectedResource && filteredResources.length === 0) return;
      const resourceNames =
        filteredResources.length > 0
          ? filteredResources.map((resource) => resource.name).join(" / ")
          : "Resources";

      nextEvents.push({
        id: `booking-${booking.id}`,
        booking_id: booking.id,
        resource_id: selectedResource || null,
        title: `${resourceNames} (Booking #${booking.id})`,
        start,
        end,
        allDay: false,
      });
    });

    setEvents(nextEvents);
  }

  function openEditModal(event) {
    const booking = bookings.find((item) => item.id === event.booking_id);
    if (!booking) return;

    const selectedResources = (booking.resources || []).map((resource) => resource.id);
    const roles = {};
    (booking.resources || []).forEach((resource) => {
      if (resource.role) roles[resource.id] = resource.role;
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
    });
    setModalMessage("");
  }

  function closeEditModal() {
    setEditModal(EMPTY_EDIT_MODAL);
    setModalMessage("");
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
        ? prev.selectedResources.filter((resourceId) => resourceId !== id)
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
      await loadBookings();
      closeEditModal();
    } catch (err) {
      setModalMessage(err?.message || "Failed to update booking.");
    }
  }

  async function deleteBooking() {
    try {
      await apiDelete(`/bookings/${editModal.bookingId}`);
      await loadBookings();
      closeEditModal();
    } catch (err) {
      setModalMessage(err?.message || "Failed to delete booking.");
    }
  }

  const resourceOptions = useMemo(() => {
    return resources.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [resources]);

  const selectedBookingResources = useMemo(() => {
    return editModal.selectedResources
      .map((id) => resources.find((resource) => resource.id === id))
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
          : bookingResources;

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

  const calendarEventStyle = {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "4px 8px",
    border: "1px solid rgba(37, 99, 235, 0.2)",
    boxShadow: "0 8px 20px rgba(37, 99, 235, 0.2)",
    fontWeight: 600,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#f2f6ff_55%,#ffffff_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
              Calendar Studio
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Bookings Calendar
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              Same calendar workflow, just with cleaner hierarchy, a softer shell, and controls
              that feel more polished and easier to scan.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Resource</label>
            <select
              className="min-w-[280px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
              value={selectedResource}
              onChange={(e) => setSelectedResource(e.target.value)}
            >
              <option value="">All resources</option>
              {resourceOptions.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Calendar View</h2>
            <p className="mt-1 text-sm text-slate-500">
              Navigate bookings by month, week, day, or agenda and open any event directly for
              editing.
            </p>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Live schedule
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-3 shadow-inner sm:p-4">
          <div className="[&_.rbc-toolbar]:mb-5 [&_.rbc-toolbar]:flex-wrap [&_.rbc-toolbar]:gap-3 [&_.rbc-toolbar-label]:text-2xl [&_.rbc-toolbar-label]:font-semibold [&_.rbc-toolbar-label]:text-slate-900 [&_.rbc-btn-group]:overflow-hidden [&_.rbc-btn-group]:rounded-2xl [&_.rbc-btn-group]:border [&_.rbc-btn-group]:border-slate-200 [&_.rbc-btn-group]:bg-white [&_.rbc-btn-group_button]:border-0 [&_.rbc-btn-group_button]:px-4 [&_.rbc-btn-group_button]:py-2.5 [&_.rbc-btn-group_button]:text-sm [&_.rbc-btn-group_button]:font-medium [&_.rbc-btn-group_button]:text-slate-600 [&_.rbc-btn-group_button:hover]:bg-slate-50 [&_.rbc-active]:bg-blue-600 [&_.rbc-active]:text-white [&_.rbc-month-view]:overflow-hidden [&_.rbc-month-view]:rounded-[22px] [&_.rbc-month-view]:border [&_.rbc-month-view]:border-slate-200 [&_.rbc-month-view]:bg-white [&_.rbc-header]:border-b [&_.rbc-header]:border-slate-200 [&_.rbc-header]:bg-slate-50 [&_.rbc-header]:py-3 [&_.rbc-header]:font-semibold [&_.rbc-header]:text-slate-800 [&_.rbc-date-cell]:px-2 [&_.rbc-date-cell]:pt-2 [&_.rbc-date-cell]:text-slate-700 [&_.rbc-off-range-bg]:bg-slate-100 [&_.rbc-today]:bg-blue-50 [&_.rbc-day-bg+_.rbc-day-bg]:border-l-slate-200 [&_.rbc-month-row+_.rbc-month-row]:border-t-slate-200 [&_.rbc-time-view]:overflow-hidden [&_.rbc-time-view]:rounded-[22px] [&_.rbc-time-view]:border [&_.rbc-time-view]:border-slate-200 [&_.rbc-time-view]:bg-white [&_.rbc-time-header]:border-b-slate-200 [&_.rbc-timeslot-group]:border-b-slate-100 [&_.rbc-agenda-view]:rounded-[22px] [&_.rbc-agenda-view]:border [&_.rbc-agenda-view]:border-slate-200 [&_.rbc-agenda-view]:bg-white [&_.rbc-agenda-view_table]:w-full [&_.rbc-agenda-view_table]:text-sm [&_.rbc-agenda-date-cell]:font-medium [&_.rbc-current-time-indicator]:bg-red-400">
            <Calendar
              localizer={localizer}
              events={events}
              date={currentDate}
              onNavigate={(date) => setCurrentDate(date)}
              onSelectEvent={openEditModal}
              onSelectSlot={openDayModal}
              startAccessor="start"
              endAccessor="end"
              views={["month", "week", "day", "agenda"]}
              defaultView="month"
              style={{ height: 640 }}
              toolbar
              popup
              selectable
              eventPropGetter={() => ({
                style: calendarEventStyle,
              })}
            />
          </div>
        </div>
      </section>

      {dayModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="relative z-40 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Daily Schedule
                </div>
                <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                  {moment(dayModal.date).format("DD.MM.YYYY")}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  All bookings for the selected date, sorted by start time.
                </p>
              </div>
              <button
                onClick={closeDayModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-slate-700"
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
                    className="block w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">
                          {String(booking.start_time || "").slice(0, 5)} - {String(booking.end_time || "").slice(0, 5)}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          User: {booking.user_id || "Not assigned"}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {dayResources.map((resource) => (
                            <span
                              key={`${booking.id}-${resource.id}`}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                            >
                              {resource.name}
                              {resource.type_name ? ` • ${resource.type_name}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="relative z-50 max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                  Edit Event
                </div>
                <h3 className="mt-3 text-2xl font-semibold text-slate-900">Edit Booking</h3>
              </div>
            </div>

            {modalMessage && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {modalMessage}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Date</label>
                <IsraelDateInput
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  value={editModal.date}
                  onChange={(nextDate) => setEditModal((prev) => ({ ...prev, date: nextDate }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Start</label>
                <input
                  type="time"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  value={editModal.start_time}
                  onChange={(e) =>
                    setEditModal((prev) => ({ ...prev, start_time: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">End</label>
                <input
                  type="time"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  value={editModal.end_time}
                  onChange={(e) =>
                    setEditModal((prev) => ({ ...prev, end_time: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700">User ID</label>
              <input
                type="number"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                value={editModal.user_id}
                onChange={(e) => setEditModal((prev) => ({ ...prev, user_id: e.target.value }))}
              />
            </div>

            <div className="mt-5">
              <label className="mb-3 block text-sm font-semibold text-slate-700">Resources</label>
              <div className="max-h-64 overflow-y-auto rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                {resourceOptions.map((resource) => {
                  const type = resourceTypes.find((item) => item.id === resource.type_id);
                  const typeRoles = Array.isArray(type?.roles) ? type.roles : [];
                  const checked = editModal.selectedResources.includes(resource.id);

                  return (
                    <div
                      key={resource.id}
                      className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-transparent bg-white px-3 py-3 shadow-sm"
                    >
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleResource(resource.id)}
                        />
                        <span>{resource.name}</span>
                      </label>

                      {checked && typeRoles.length > 0 && (
                        <select
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                          value={editModal.roles[resource.id] || ""}
                          onChange={(e) => updateRole(resource.id, e.target.value)}
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
              <div className="mb-4 text-sm text-gray-600">
                Selected: {selectedBookingResources.map((resource) => resource.name).join(", ")}
              </div>
            )}

            <div className="mt-6 flex justify-between gap-2">
              <button
                onClick={deleteBooking}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-white transition hover:bg-red-700"
              >
                Delete
              </button>

              <div className="flex gap-2">
                <button
                  onClick={closeEditModal}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-white transition hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
