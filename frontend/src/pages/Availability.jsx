import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/api";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);

export default function Availability() {
  const [resources, setResources] = useState([]);
  const [events, setEvents] = useState([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedResource, setSelectedResource] = useState("");

  useEffect(() => {
    (async () => {
      const data = await apiGet("/resources");
      setResources(Array.isArray(data) ? data : []);
    })();
  }, []);

  useEffect(() => {
    loadBookings();
  }, [selectedResource]);

  async function loadBookings() {
    const qs = selectedResource ? `?resource_id=${selectedResource}` : "";
    const data = await apiGet(`/bookings${qs}`);
    buildCalendarEvents(Array.isArray(data) ? data : []);
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

  const resourceOptions = useMemo(() => {
    return resources
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [resources]);

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
    </div>
  );
}
