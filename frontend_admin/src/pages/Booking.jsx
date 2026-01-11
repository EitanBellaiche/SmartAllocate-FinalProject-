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

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

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

  async function submitBooking() {
    if (!date || !startTime || !endTime || selectedResources.length === 0 || !userId) {
      setMessage("❗ Please select date, time, user and at least one resource.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      await apiPost("/bookings", {
        resources: selectedResources,
        roles,
        date,
        start_time: startTime,
        end_time: endTime,
        user_id: String(userId).trim()
      });

      setMessage("✔ Booking created successfully!");

      setSelectedResources([]);
      setRoles({});
      setDate("");
      setStartTime("");
      setEndTime("");
      setUserId("");

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

      {/* DATE */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">Date</label>
        <input
          type="date"
          className="border px-3 py-2 rounded w-full"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

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
