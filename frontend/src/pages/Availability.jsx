import { useState, useEffect } from "react";
import { apiGet, apiPost } from "../api/api";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);

export default function Availability() {
  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState("");
  const [availability, setAvailability] = useState([]);
  const [events, setEvents] = useState([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [editItem, setEditItem] = useState(null);

  const [form, setForm] = useState({
    days: [],
    start_date: "",
    end_date: "",
    start_time: "",
    end_time: "",
  });

  useEffect(() => {
    apiGet("/resources").then(setResources);
  }, []);

  useEffect(() => {
    if (!selectedResource) return;
    loadAvailability();
  }, [selectedResource]);

  async function loadAvailability() {
    const data = await apiGet(`/availability/resource/${selectedResource}`);
    setAvailability(data);
    buildCalendarEvents(data);
  }

  /* ----------------------------------
     Create events for the calendar
  ------------------------------------- */
  function buildCalendarEvents(list) {
    const ev = [];
    const end = moment().add(1, "year");

    const dayMap = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };

    list.forEach((a) => {
      if (a.type === "recurring") {
        let cursor = moment(a.start_date);

        while (cursor.isBefore(a.end_date) && cursor.isBefore(end)) {
          if (cursor.day() === dayMap[a.day_of_week]) {
            ev.push({
              title: "Available",
              start: moment(cursor.format("YYYY-MM-DD") + " " + a.start_time).toDate(),
              end: moment(cursor.format("YYYY-MM-DD") + " " + a.end_time).toDate(),
              allDay: false,
            });
          }
          cursor.add(1, "day");
        }
      } else {
        ev.push({
          title: "Available",
          start: moment(a.start_date + " " + a.start_time).toDate(),
          end: moment(a.start_date + " " + a.end_time).toDate(),
          allDay: false,
        });
      }
    });

    setEvents(ev);
  }

  /* ----------------------------------
     Day selection in recurring form
  ------------------------------------- */
  function toggleDay(day) {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  }

  /* ----------------------------------
     Save recurring availability
  ------------------------------------- */
  async function saveRecurring() {
    await apiPost("/availability/recurring", {
      resource_id: selectedResource,
      ...form,
    });

    setForm({
      days: [],
      start_date: "",
      end_date: "",
      start_time: "",
      end_time: "",
    });

    loadAvailability();
  }

  /* ----------------------------------
     Delete availability
  ------------------------------------- */
  async function deleteAvailability(id) {
    if (!confirm("Are you sure?")) return;
    await apiPost("/availability/delete", { id });
    loadAvailability();
  }

  /* ----------------------------------
     Editing an availability entry
  ------------------------------------- */
  function editAvailability(item) {
    setEditItem(item);
  }

  async function saveEdit() {
    await apiPost("/availability/update", editItem);
    setEditItem(null);
    loadAvailability();
  }

  /* ----------------------------------
     Get all days in current month
  ------------------------------------- */
  function getMonthDays(date) {
    const start = moment(date).startOf("month");
    const end = moment(date).endOf("month");

    const result = [];
    let cursor = start.clone();

    while (cursor.isSameOrBefore(end)) {
      result.push(cursor.clone());
      cursor.add(1, "day");
    }
    return result;
  }

  /* ----------------------------------
     Build list of availability by day
  ------------------------------------- */
  function getAvailabilityForMonth() {
    const days = getMonthDays(currentDate);

    return days.map((day) => {
      const dateStr = day.format("YYYY-MM-DD");

      const todays = availability.filter((a) => {
        // Single event
        if (a.type === "single") {
          return a.start_date === dateStr;
        }

        // Recurring
        const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const dayName = dayNames[day.day()];

        return (
          a.type === "recurring" &&
          a.day_of_week === dayName &&
          day.isBetween(a.start_date, a.end_date, undefined, "[]")
        );
      });

      return {
        date: day,
        entries: todays,
      };
    });
  }

  return (
    <div className="flex gap-6 p-6">
      {/* LEFT SIDEBAR */}
      <div className="w-1/4 bg-white p-5 rounded-xl shadow-lg h-fit">

        <h2 className="text-xl font-bold mb-4">Select Resource</h2>

        <select
          className="w-full p-2 border rounded mb-6 bg-gray-50"
          value={selectedResource}
          onChange={(e) => setSelectedResource(e.target.value)}
        >
          <option value="">-- Choose --</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        {/* Recurring Form */}
        {selectedResource && (
          <div className="bg-gray-50 border rounded-xl p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Long-Term Availability</h3>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (
                <label
                  key={d}
                  className={`px-2 py-1 border rounded cursor-pointer text-center ${
                    form.days.includes(d) ? "bg-blue-600 text-white" : "bg-white"
                  }`}
                  onClick={() => toggleDay(d)}
                >
                  {d.toUpperCase()}
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <input
                type="date"
                className="p-2 border rounded"
                value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
              />
              <input
                type="date"
                className="p-2 border rounded"
                value={form.end_date}
                onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 mb-4">
              <input
                type="time"
                className="p-2 border rounded w-full"
                value={form.start_time}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
              />
              <input
                type="time"
                className="p-2 border rounded w-full"
                value={form.end_time}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
              />
            </div>

            <button
              onClick={saveRecurring}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Save
            </button>
          </div>
        )}

        {/* List for current month */}
        <div className="mt-8 bg-white p-4 rounded-xl shadow">
          <h3 className="text-lg font-bold mb-3">
            Availability for {moment(currentDate).format("MMMM YYYY")}
          </h3>

          {getAvailabilityForMonth().map((day) => (
            <div
              key={day.date.format("YYYY-MM-DD")}
              className="border-b py-3 flex justify-between items-center"
            >
              <div className="font-medium">
                {day.date.format("ddd, MMM DD")}
              </div>

              <div className="flex gap-3 items-center">
                {day.entries.length === 0 ? (
                  <span className="text-gray-400">No availability</span>
                ) : (
                  day.entries.map((e) => (
                    <span key={e.id} className="px-3 py-1 bg-blue-100 text-blue-800 rounded">
                      {e.start_time}–{e.end_time}
                    </span>
                  ))
                )}

                {day.entries.length > 0 && (
                  <>
                    <button
                      onClick={() => editAvailability(day.entries[0])}
                      className="px-3 py-1 bg-yellow-500 text-white rounded"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteAvailability(day.entries[0].id)}
                      className="px-3 py-1 bg-red-600 text-white rounded"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CALENDAR */}
      <div className="flex-1 bg-white p-6 rounded-xl shadow-xl">
        <h2 className="text-2xl font-bold mb-4">Calendar View</h2>

        <Calendar
          localizer={localizer}
          events={events}
          date={currentDate}
          onNavigate={(date) => setCurrentDate(date)}
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

      {/* EDIT MODAL */}
      {editItem && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[400px] shadow-xl">
            <h3 className="text-xl mb-4 font-semibold">Edit Availability</h3>

            <input
              type="time"
              className="p-2 border w-full rounded mb-3"
              value={editItem.start_time}
              onChange={(e) => setEditItem({ ...editItem, start_time: e.target.value })}
            />

            <input
              type="time"
              className="p-2 border w-full rounded mb-3"
              value={editItem.end_time}
              onChange={(e) => setEditItem({ ...editItem, end_time: e.target.value })}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditItem(null)}
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
      )}
    </div>
  );
}
