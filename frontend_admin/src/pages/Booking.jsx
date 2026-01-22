import { useState, useEffect } from "react";
import { apiGet, apiPost, apiPut } from "../api/api";
import { getOrgLabels } from "../orgConfig";

export default function Booking() {
  const labels = getOrgLabels();
  const labelsLower = {
    userId: String(labels.userId || "").toLowerCase(),
  };
  const userIdPlural = `${labels.userId}s`;
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [selectedResources, setSelectedResources] = useState([]);
  const [roles, setRoles] = useState({});

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [assignUsers, setAssignUsers] = useState(false);
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [responsibleOptions, setResponsibleOptions] = useState([]);
  const [responsibleLoading, setResponsibleLoading] = useState(false);
  const [responsibleError, setResponsibleError] = useState("");
  const [responsibleUser, setResponsibleUser] = useState(null);
  const [userIdsInput, setUserIdsInput] = useState("");
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

  useEffect(() => {
    if (!assignUsers) return;
    let active = true;
    const timeout = setTimeout(async () => {
      setResponsibleLoading(true);
      setResponsibleError("");
      try {
        const q = responsibleQuery.trim();
        const query = q ? `&q=${encodeURIComponent(q)}` : "";
        const data = await apiGet(`/users?role=responsible${query}`);
        if (!active) return;
        setResponsibleOptions(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!active) return;
        setResponsibleError(err?.message || "Failed to load responsible users.");
      } finally {
        if (active) setResponsibleLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [assignUsers, responsibleQuery]);

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

  function parseUserIds(raw) {
    const items = raw
      .split(/[\s,]+/)
      .map((val) => val.trim())
      .filter(Boolean);
    return Array.from(new Set(items));
  }

  async function updateResourceAssignments(responsibleId, userIds) {
    const targetResources = resources.filter((r) => selectedResources.includes(r.id));
    if (targetResources.length === 0) return;

    await Promise.all(
      targetResources.map(async (resource) => {
        const meta =
          resource.metadata && typeof resource.metadata === "object"
            ? { ...resource.metadata }
            : {};
        meta.responsible_user_id = responsibleId || meta.responsible_user_id || "";
        meta.user_ids = userIds;
        meta.users = userIds.length;
        await apiPut(`/resources/${resource.id}`, {
          name: resource.name,
          type_id: resource.type_id,
          metadata: meta,
        });
      })
    );
  }

  async function submitBooking() {
    if (!startTime || !endTime || selectedResources.length === 0) {
      setMessage("❗ Please select time and at least one resource.");
      return;
    }
    if (startTime >= endTime) {
      setMessage("❗ End time must be after start time.");
      return;
    }
    if (assignUsers && !responsibleUser) {
      setMessage("❗ Please choose a responsible user.");
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
      const basePayload = {
        resources: selectedResources,
        roles,
        start_time: startTime,
        end_time: endTime,
      };

      if (recurring) {
        basePayload.recurrence = {
          start_date: rangeStart,
          end_date: rangeEnd,
          days_of_week: weekdays,
        };
      } else {
        basePayload.date = date;
      }

      const userIds = assignUsers ? parseUserIds(userIdsInput) : [];
      const responsibleId = String(responsibleUser?.national_id || "").trim();
      const targetIds = assignUsers
        ? Array.from(new Set([responsibleId, ...userIds].filter(Boolean)))
        : [null];

      if (assignUsers && !responsibleId) {
        setMessage("❗ Responsible user must have a national ID.");
        return;
      }

      if (assignUsers && responsibleId) {
        await updateResourceAssignments(responsibleId, userIds);
      }

      if (targetIds.length === 0) {
        await apiPost("/bookings", basePayload);
      } else {
        const results = await Promise.allSettled(
          targetIds.map((id) =>
            apiPost("/bookings", {
              ...basePayload,
              user_id: id ? String(id).trim() : undefined,
            })
          )
        );
        const failures = results.filter((r) => r.status === "rejected");
        if (failures.length > 0) {
          throw new Error(
            `Created ${results.length - failures.length} bookings; ${failures.length} failed.`
          );
        }
      }

      setMessage("✔ Booking created successfully!");

      setSelectedResources([]);
      setRoles({});
      setDate("");
      setStartTime("");
      setEndTime("");
      setAssignUsers(false);
      setResponsibleQuery("");
      setResponsibleOptions([]);
      setResponsibleUser(null);
      setUserIdsInput("");
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

      {/* USERS */}
      <div className="mb-4 flex items-center gap-2">
        <input
          id="assign-users-toggle"
          type="checkbox"
          checked={assignUsers}
          onChange={(e) => {
            setAssignUsers(e.target.checked);
            setResponsibleUser(null);
            setUserIdsInput("");
          }}
        />
        <label htmlFor="assign-users-toggle" className="font-semibold">
          Assign to users
        </label>
      </div>

      {assignUsers && (
        <div className="mb-4">
          <label className="block font-semibold mb-1">Responsible user</label>
          <input
            type="text"
            className="border px-3 py-2 rounded w-full"
            value={responsibleQuery}
            onChange={(e) => {
              setResponsibleQuery(e.target.value);
              setResponsibleUser(null);
            }}
            placeholder={`Search by name, email, or ${labelsLower.userId}`}
          />
          {responsibleLoading && (
            <div className="text-sm text-gray-500 mt-2">Loading users...</div>
          )}
          {responsibleError && (
            <div className="text-sm text-red-600 mt-2">{responsibleError}</div>
          )}
          {responsibleOptions.length > 0 && (
            <div className="border rounded mt-2 max-h-48 overflow-auto bg-white">
              {responsibleOptions.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-gray-100"
                  onClick={() => {
                    setResponsibleUser(u);
                    setResponsibleQuery(u.full_name || u.email || u.national_id || "");
                  }}
                >
                  {u.full_name || "User"} · {u.national_id || `No ${labels.userId}`} · {u.email}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 text-sm text-gray-600">
            Selected: {responsibleUser?.national_id || "None"}
          </div>
        </div>
      )}

      {assignUsers && (
        <div className="mb-4">
          <label className="block font-semibold mb-1">
            {userIdPlural} (comma or space separated)
          </label>
          <textarea
            rows={3}
            className="border px-3 py-2 rounded w-full"
            value={userIdsInput}
            onChange={(e) => setUserIdsInput(e.target.value)}
            placeholder="e.g. 12345, 67890"
          />
        </div>
      )}

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
