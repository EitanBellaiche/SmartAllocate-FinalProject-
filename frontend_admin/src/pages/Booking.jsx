import { useState, useEffect } from "react";
import { apiGet, apiPost } from "../api/api";

export default function Booking() {
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [selectedResources, setSelectedResources] = useState([]);
  const [roles, setRoles] = useState({});

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [userId, setUserId] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [weekdays, setWeekdays] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const weekdayOptions = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
  ];

  useEffect(() => {
    loadResources();
  }, []);

  async function loadResources() {
    try {
      const [resourceData, typeData] = await Promise.all([
        apiGet("/resources"),
        apiGet("/resource-types"),
      ]);
      setResources(resourceData);
      setResourceTypes(typeData);
    } catch (err) {
      console.error("Error loading resources:", err);
    }
  }

  function toggleResource(id) {
    if (selectedResources.includes(id)) {
      setSelectedResources(selectedResources.filter(r => r !== id));

      const updated = { ...roles };
      delete updated[id];
      setRoles(updated);
    } else {
      setSelectedResources([...selectedResources, id]);
    }
  }

  function updateRole(id, value) {
    setRoles(prev => ({
      ...prev,
      [id]: value
    }));
  }

  function toggleWeekday(dayValue) {
    setWeekdays((prev) => {
      if (prev.includes(dayValue)) {
        return prev.filter((d) => d !== dayValue);
      }
      return [...prev, dayValue];
    });
  }

  async function submitBooking() {
    if (!startTime || !endTime || selectedResources.length === 0 || !userId) {
      setMessage("❗ Please select time, user and at least one resource.");
      return;
    }
    if (startTime >= endTime) {
      setMessage("❗ End time must be after start time.");
      return;
    }
    if (recurring) {
      if (!rangeStart || !rangeEnd || weekdays.length === 0) {
        setMessage("❗ Please select a date range and at least 1 weekday.");
        return;
      }
    } else if (!date) {
      setMessage("❗ Please select a date.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const payload = {
        resources: selectedResources,
        roles,
        start_time: startTime,
        end_time: endTime,
        user_id: String(userId).trim()
      };

      if (recurring) {
        payload.recurrence = {
          start_date: rangeStart,
          end_date: rangeEnd,
          days_of_week: weekdays,
        };
      } else {
        payload.date = date;
      }

      await apiPost("/bookings", payload);

      setMessage("✔ Booking created successfully!");

      setSelectedResources([]);
      setRoles({});
      setDate("");
      setStartTime("");
      setEndTime("");
      setUserId("");
      setRecurring(false);
      setRangeStart("");
      setRangeEnd("");
      setWeekdays([]);

    } catch (err) {
      setMessage(`❌ ${err?.message || "Failed to create booking."}`);
      console.error(err);
    }

    setSubmitting(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Booking</h1>

      {message && (
        <div className="mb-4 p-2 bg-gray-800 text-white rounded">
          {message}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <input
          id="recurring-toggle"
          type="checkbox"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
        />
        <label htmlFor="recurring-toggle" className="font-semibold">
          Recurring schedule
        </label>
      </div>

      {/* DATE */}
      <div className="mb-4">
        {!recurring ? (
          <>
            <label className="block font-semibold mb-1">Date</label>
            <input
              type="date"
              className="border px-3 py-2 rounded w-full"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Start Date</label>
              <input
                type="date"
                className="border px-3 py-2 rounded w-full"
                value={rangeStart}
                max={rangeEnd || undefined}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">End Date</label>
              <input
                type="date"
                className="border px-3 py-2 rounded w-full"
                value={rangeEnd}
                min={rangeStart || undefined}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {recurring && (
        <div className="mb-4">
          <div className="font-semibold mb-2">Weekdays</div>
          <div className="flex flex-wrap gap-3">
            {weekdayOptions.map((day) => (
              <label key={day.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={weekdays.includes(day.value)}
                  onChange={() => toggleWeekday(day.value)}
                />
                <span>{day.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* TIME */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block font-semibold mb-1">Start Time</label>
          <input
            type="time"
            className="border px-3 py-2 rounded w-full"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">End Time</label>
          <input
            type="time"
            className="border px-3 py-2 rounded w-full"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
          />
        </div>
      </div>

      {/* USER */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">National ID</label>
        <input
          type="text"
          className="border px-3 py-2 rounded w-full"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
      </div>

      {/* RESOURCES */}
      <div className="mb-6">
        <label className="block font-semibold mb-2">Select Resources</label>

        <div className="max-h-64 overflow-y-auto border rounded p-3">
          {resources.map((r) => {
            const type = resourceTypes.find((t) => t.id === r.type_id);
            const typeRoles = Array.isArray(type?.roles) ? type.roles : [];
            return (
              <div key={r.id} className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedResources.includes(r.id)}
                    onChange={() => toggleResource(r.id)}
                  />
                  <span>{r.name}</span>
                </div>

                {/* ROLE SELECTOR */}
                {selectedResources.includes(r.id) && typeRoles.length > 0 && (
                  <select
                    className="border rounded px-2 py-1"
                    value={roles[r.id] || ""}
                    onChange={e => updateRole(r.id, e.target.value)}
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

      {/* SUBMIT BUTTON */}
      <button
        onClick={submitBooking}
        disabled={submitting}
        className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700 disabled:bg-gray-500"
      >
        {submitting ? "Creating booking..." : "Create Booking"}
      </button>
    </div>
  );
}
