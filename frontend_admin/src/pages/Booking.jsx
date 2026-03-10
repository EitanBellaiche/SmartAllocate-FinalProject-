import { useState, useEffect, useMemo } from "react";
import { apiGet, apiPost, apiPut } from "../api/api";
import { getOrgLabels } from "../orgConfig";
import AutoScheduler from "./AutoScheduler";
import IsraelDateInput from "../components/IsraelDateInput";
import { formatIsraelDate, formatIsraelDateRange, formatIsraelTime } from "../utils/datetime";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Booking() {
  const labels = getOrgLabels();
  const labelsLower = {
    userId: String(labels.userId || "").toLowerCase(),
  };
  const userIdPlural = `${labels.userId}s`;
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState([]);
  const [selectedResources, setSelectedResources] = useState([]);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [assignUsers, setAssignUsers] = useState(false);
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [responsibleOptions, setResponsibleOptions] = useState([]);
  const [responsibleLoading, setResponsibleLoading] = useState(false);
  const [responsibleError, setResponsibleError] = useState("");
  const [responsibleUser, setResponsibleUser] = useState(null);
  const [responsibleAvailability, setResponsibleAvailability] = useState([]);
  const [responsibleOverrides, setResponsibleOverrides] = useState([]);
  const [userIdsInput, setUserIdsInput] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [weekdays, setWeekdays] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("booking");

  const weekdayOptions = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
  ];
  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 5) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        options.push(`${hh}:${mm}`);
      }
    }
    return options;
  }, []);

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

  useEffect(() => {
    const responsibleId = String(responsibleUser?.national_id || "").trim();
    if (!assignUsers || !responsibleId) {
      setResponsibleAvailability([]);
      setResponsibleOverrides([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const [availabilityData, overrideData] = await Promise.all([
          apiGet(`/user-availability?user_id=${encodeURIComponent(responsibleId)}`),
          apiGet(`/user-availability/overrides?user_id=${encodeURIComponent(responsibleId)}`),
        ]);
        if (!active) return;
        setResponsibleAvailability(Array.isArray(availabilityData) ? availabilityData : []);
        setResponsibleOverrides(Array.isArray(overrideData) ? overrideData : []);
      } catch {
        if (!active) return;
        setResponsibleAvailability([]);
        setResponsibleOverrides([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [assignUsers, responsibleUser]);

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
    } else {
      setSelectedResources([...selectedResources, id]);
    }
  }

  function toggleResourceType(id) {
    if (selectedTypeIds.includes(id)) {
      setSelectedTypeIds(selectedTypeIds.filter((typeId) => typeId !== id));
    } else {
      setSelectedTypeIds([...selectedTypeIds, id]);
    }
  }

  const effectiveResourceIds = useMemo(() => {
    const byType = resources
      .filter((resource) =>
        selectedTypeIds.some((typeId) => String(typeId) === String(resource.type_id))
      )
      .map((resource) => resource.id);
    return Array.from(new Set([...selectedResources, ...byType]));
  }, [resources, selectedResources, selectedTypeIds]);

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

  function normalizeTo5Minutes(value) {
    if (!value || typeof value !== "string") return value;
    const parts = value.split(":");
    if (parts.length !== 2) return value;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
    const total = h * 60 + m;
    const rounded = Math.round(total / 5) * 5;
    const nextH = Math.floor(rounded / 60) % 24;
    const nextM = rounded % 60;
    return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
  }

  async function updateResourceAssignments(responsibleId, userIds) {
    const targetResources = resources.filter((r) => effectiveResourceIds.includes(r.id));
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
    if (!startTime || !endTime || effectiveResourceIds.length === 0) {
      setMessage("❗ Please select time and at least one resource.");
      return;
    }
    if (normalizeTo5Minutes(startTime) !== startTime || normalizeTo5Minutes(endTime) !== endTime) {
      setMessage("❗ Times must be in 5-minute increments.");
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
        resources: effectiveResourceIds,
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
          const violations = failures
            .map((f) => f?.reason?.data?.violations || [])
            .flat();
          if (violations.length > 0) {
            const names = violations
              .map((v) => v?.name)
              .filter(Boolean)
              .join(", ");
            setMessage(`❌ Rule blocked: ${names || "Unknown rule"}`);
          } else {
            setMessage(
              `❌ Created ${results.length - failures.length} bookings; ${failures.length} failed.`
            );
          }
          setSubmitting(false);
          return;
        }
      }

      setMessage("✔ Booking created successfully!");

      setSelectedResources([]);
      setSelectedTypeIds([]);
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
      const violations = Array.isArray(err?.data?.violations)
        ? err.data.violations
        : [];
      if (violations.length > 0) {
        const names = violations
          .map((v) => v?.name)
          .filter(Boolean)
          .join(", ");
        setMessage(`❌ Rule blocked: ${names || "Unknown rule"}`);
      } else {
        setMessage(`❌ ${err?.message || "Failed to create booking."}`);
      }
      console.error(err);
    }

    setSubmitting(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">
          {mode === "booking" ? "Create New Booking" : "Auto Scheduling"}
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            className={`px-4 py-2 rounded border ${mode === "booking" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-700"}`}
            onClick={() => setMode("booking")}
          >
            Booking
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded border ${mode === "auto" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-700"}`}
            onClick={() => setMode("auto")}
          >
            Auto
          </button>
        </div>
      </div>

      {mode === "auto" ? (
        <AutoScheduler embedded />
      ) : (
        <>

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
            <IsraelDateInput
              className="border px-3 py-2 rounded w-full"
              value={date}
              onChange={setDate}
            />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Start Date</label>
              <IsraelDateInput
                className="border px-3 py-2 rounded w-full"
                value={rangeStart}
                max={rangeEnd || undefined}
                onChange={setRangeStart}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">End Date</label>
              <IsraelDateInput
                className="border px-3 py-2 rounded w-full"
                value={rangeEnd}
                min={rangeStart || undefined}
                onChange={setRangeEnd}
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
          <select
            className="border px-3 py-2 rounded w-full"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          >
            <option value="">Select time</option>
            {timeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">End Time</label>
          <select
            className="border px-3 py-2 rounded w-full"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
          >
            <option value="">Select time</option>
            {timeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
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
          {responsibleUser && (
            <div className="mt-3 p-3 border rounded bg-gray-50 text-sm text-gray-700">
              <div className="font-semibold mb-2">Responsible availability</div>
              {responsibleAvailability.length === 0 && responsibleOverrides.length === 0 ? (
                <div>No availability defined yet.</div>
              ) : (
                <>
                  {responsibleAvailability.length > 0 && (
                    <div className="mb-2">
                      {responsibleAvailability.map((slot) => (
                        <div key={slot.id}>
                          {WEEKDAY_LABELS[Number(slot.day_of_week)] || `Day ${slot.day_of_week}`} {" "}
                          {formatIsraelTime(slot.start_time)}-{formatIsraelTime(slot.end_time)}
                          {slot.start_date || slot.end_date
                            ? ` | ${formatIsraelDateRange(slot.start_date, slot.end_date)}`
                            : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  {responsibleOverrides.length > 0 && (
                    <div className="text-xs text-gray-500">
                      Overrides:
                      {responsibleOverrides.map((slot) => (
                        <div key={slot.id}>
                          {formatIsraelDate(slot.date)} | {slot.is_available ? "Available" : "Blocked"}
                          {slot.start_time && slot.end_time
                            ? ` | ${formatIsraelTime(slot.start_time)}-${formatIsraelTime(slot.end_time)}`
                            : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
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
        <div className="mb-3 text-sm text-gray-600">
          You can combine specific resources and whole resource types in the same booking.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-medium mb-2">Whole resource types</div>
            <div className="max-h-48 overflow-y-auto border rounded p-3">
              {resourceTypes.map((type) => (
                <div key={type.id} className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={selectedTypeIds.includes(type.id)}
                    onChange={() => toggleResourceType(type.id)}
                  />
                  <span>{type.name}</span>
                </div>
              ))}
              {resourceTypes.length === 0 && (
                <div className="text-sm text-gray-500">No resource types found.</div>
              )}
            </div>
          </div>
          <div>
            <div className="font-medium mb-2">Specific resources</div>
            <div className="max-h-64 overflow-y-auto border rounded p-3">
              {resources.map((r) => (
                <div key={r.id} className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={selectedResources.includes(r.id)}
                    onChange={() => toggleResource(r.id)}
                  />
                  <span>{r.name}</span>
                </div>
              ))}
              {resources.length === 0 && (
                <div className="text-sm text-gray-500">No resources found.</div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          {effectiveResourceIds.length > 0
            ? `${effectiveResourceIds.length} unique resources will be included in this booking.`
            : "No resources selected yet."}
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
        </>
      )}
    </div>
  );
}
