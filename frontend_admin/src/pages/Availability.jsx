import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPut } from "../api/api";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);

export default function Availability() {
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [currentDate, setCurrentDate] = useState(new Date());
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
  });
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

  /* ----------------------------------
     Create events for the calendar
  ------------------------------------- */
  function buildCalendarEvents(list) {
    const ev = [];
    list.forEach((b) => {
      const dateStr = moment(b.date).format("YYYY-MM-DD");
      const start = moment(`${dateStr} ${b.start_time}`).toDate();
      const end = moment(`${dateStr} ${b.end_time}`).toDate();

      (b.resources || []).forEach((r) => {
        ev.push({
          id: `${b.id}-${r.id}`,
          booking_id: b.id,
          resource_id: r.id,
          title: `${r.name} (Booking #${b.id})`,
          start,
          end,
          allDay: false,
        });
      });
    });

    setEvents(ev);
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
      });
    } catch (err) {
      setModalMessage(err?.message || "Failed to update booking.");
    }
  }

  async function deleteBooking() {
    try {
      await apiDelete(`/bookings/${editModal.bookingId}`);
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
      });
    } catch (err) {
      setModalMessage(err?.message || "Failed to delete booking.");
    }
  }

  const resourceOptions = useMemo(() => {
    return resources
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [resources]);

  const selectedBookingResources = useMemo(() => {
    return editModal.selectedResources
      .map((id) => resources.find((r) => r.id === id))
      .filter(Boolean);
  }, [editModal.selectedResources, resources]);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">Bookings Calendar</h1>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Resource</label>
          <select
            className="p-2 border rounded bg-white"
            value={selectedResource}
            onChange={(e) => setSelectedResource(e.target.value)}
          >
            <option value="">All resources</option>
            {resourceOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-xl">
        <h2 className="text-xl font-semibold mb-4">Calendar View</h2>

        <Calendar
          localizer={localizer}
          events={events}
          date={currentDate}
          onNavigate={(date) => setCurrentDate(date)}
          onSelectEvent={openEditModal}
          startAccessor="start"
          endAccessor="end"
          views={["month", "week", "day", "agenda"]}
          defaultView="month"
          style={{ height: 600 }}
          toolbar={true}
          popup
          eventPropGetter={() => ({
            style: {
              backgroundColor: "#2563eb",
              color: "white",
              borderRadius: "6px",
              padding: "4px",
              border: "none",
            },
          })}
        />
      </div>

      {editModal.open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center">
          <div className="relative z-50 bg-white p-6 rounded-lg w-[680px] shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl mb-4 font-semibold">Edit Booking</h3>

            {modalMessage && (
              <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">
                {modalMessage}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  className="p-2 border w-full rounded bg-white"
                  value={editModal.date}
                  onChange={(e) => setEditModal((p) => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start</label>
                <input
                  type="time"
                  className="p-2 border w-full rounded bg-white"
                  value={editModal.start_time}
                  onChange={(e) => setEditModal((p) => ({ ...p, start_time: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End</label>
                <input
                  type="time"
                  className="p-2 border w-full rounded bg-white"
                  value={editModal.end_time}
                  onChange={(e) => setEditModal((p) => ({ ...p, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">User ID</label>
              <input
                type="number"
                className="p-2 border w-full rounded bg-white"
                value={editModal.user_id}
                onChange={(e) => setEditModal((p) => ({ ...p, user_id: e.target.value }))}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Resources</label>
              <div className="max-h-64 overflow-y-auto border rounded p-3 bg-gray-50">
                {resourceOptions.map((r) => {
                  const type = resourceTypes.find((t) => t.id === r.type_id);
                  const typeRoles = Array.isArray(type?.roles) ? type.roles : [];
                  const checked = editModal.selectedResources.includes(r.id);
                  return (
                    <div key={r.id} className="flex items-center justify-between mb-2">
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
                          className="border rounded px-2 py-1"
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
              <div className="mb-4 text-sm text-gray-600">
                Selected: {selectedBookingResources.map((r) => r.name).join(", ")}
              </div>
            )}

            <div className="flex justify-between gap-2">
              <button
                onClick={deleteBooking}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>

              <div className="flex gap-2">
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
                    })
                  }
                  className="px-4 py-2 border rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
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
