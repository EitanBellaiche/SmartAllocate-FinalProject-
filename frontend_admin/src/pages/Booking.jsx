import { useState, useEffect, useMemo } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";
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
  const [bookings, setBookings] = useState([]);
  const [editingBooking, setEditingBooking] = useState(null);
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
  const [updatingBooking, setUpdatingBooking] = useState(false);
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
      const [resourceData, typeData, bookingData] = await Promise.all([
        apiGet("/resources"),
        apiGet("/resource-types"),
        apiGet("/bookings?include_details=1"),
      ]);
      setResources(resourceData);
      setResourceTypes(typeData);
      setBookings(Array.isArray(bookingData) ? bookingData : []);
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
      await loadResources();

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

  function openEditBooking(booking) {
    setEditingBooking({
      id: booking.id,
      date: booking.date || "",
      start_time: booking.start_time || "",
      end_time: booking.end_time || "",
      user_id: booking.user_id || "",
      resources: (booking.resources || []).map((resource) => resource.id),
    });
  }

  function toggleEditingBookingResource(resourceId) {
    setEditingBooking((prev) => {
      if (!prev) return prev;
      const exists = prev.resources.includes(resourceId);
      return {
        ...prev,
        resources: exists
          ? prev.resources.filter((id) => id !== resourceId)
          : [...prev.resources, resourceId],
      };
    });
  }

  async function saveBookingEdit() {
    if (!editingBooking) return;
    if (!editingBooking.date || !editingBooking.start_time || !editingBooking.end_time) {
      setMessage("❗ Please fill date, start time, and end time.");
      return;
    }
    if (!editingBooking.resources || editingBooking.resources.length === 0) {
      setMessage("❗ Please select at least one resource.");
      return;
    }
    if (editingBooking.start_time >= editingBooking.end_time) {
      setMessage("❗ End time must be after start time.");
      return;
    }

    setUpdatingBooking(true);
    try {
      await apiPut(`/bookings/${editingBooking.id}`, {
        resources: editingBooking.resources,
        date: editingBooking.date,
        start_time: editingBooking.start_time,
        end_time: editingBooking.end_time,
        user_id: editingBooking.user_id || undefined,
      });
      setEditingBooking(null);
      setMessage("✔ Booking updated successfully!");
      await loadResources();
    } catch (err) {
      setMessage(`❌ ${err?.message || "Failed to update booking."}`);
    } finally {
      setUpdatingBooking(false);
    }
  }

  async function deleteBooking(id) {
    if (!confirm("Are you sure you want to delete this booking?")) return;

    try {
      await apiDelete(`/bookings/${id}`);
      setMessage("✔ Booking deleted successfully!");
      await loadResources();
    } catch (err) {
      setMessage(`❌ ${err?.message || "Failed to delete booking."}`);
    }
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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

      <div className="mt-10">
        <h2 className="text-xl font-bold mb-4">Existing Bookings</h2>
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div key={booking.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-semibold">
                  {formatIsraelDate(booking.date)} | {formatIsraelTime(booking.start_time)} - {formatIsraelTime(booking.end_time)}
                </div>
                <div className="text-sm text-gray-500">
                  Booking #{booking.id}
                </div>
              </div>

              <div className="mt-2 text-sm text-gray-600">
                {booking.user_id ? `User: ${booking.user_id}` : "No user assigned"}
              </div>

              {booking.location && (
                <div className="mt-1 text-sm text-gray-600">
                  Location: {booking.location}
                </div>
              )}

              {booking.cancelled_at && (
                <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                  Cancelled
                  {booking.cancelled_reason ? `: ${booking.cancelled_reason}` : ""}
                </div>
              )}

              <div className="mt-3">
                <div className="mb-2 text-sm font-medium text-gray-700">Resources</div>
                <div className="flex flex-wrap gap-2">
                  {(booking.resources || []).map((resource) => (
                    <span
                      key={`${booking.id}-${resource.id}`}
                      className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                    >
                      {resource.name}
                      {resource.type_name ? ` · ${resource.type_name}` : ""}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditBooking(booking)}
                  className="rounded bg-yellow-500 px-3 py-1 text-sm text-white hover:bg-yellow-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteBooking(booking.id)}
                  className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {bookings.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
              No bookings have been created yet.
            </div>
          )}
        </div>
      </div>

      {editingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[520px] rounded-lg bg-white p-4 shadow-xl">
            <h2 className="mb-4 text-xl font-bold">Edit Booking</h2>

            <div className="mb-4">
              <label className="mb-1 block font-semibold">Date</label>
              <IsraelDateInput
                className="w-full rounded border px-3 py-2"
                value={editingBooking.date}
                onChange={(value) =>
                  setEditingBooking((prev) => ({ ...prev, date: value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block font-semibold">Start Time</label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={editingBooking.start_time}
                  onChange={(e) =>
                    setEditingBooking((prev) => ({ ...prev, start_time: e.target.value }))
                  }
                >
                  <option value="">Select time</option>
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold">End Time</label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={editingBooking.end_time}
                  onChange={(e) =>
                    setEditingBooking((prev) => ({ ...prev, end_time: e.target.value }))
                  }
                >
                  <option value="">Select time</option>
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              Select the resources that should stay attached to this booking.
            </div>

            <div className="mt-3">
              <div className="mb-2 text-sm font-medium text-gray-700">Resources</div>
              <div className="max-h-64 overflow-y-auto rounded border p-3">
                {resources.map((resource) => (
                  <label key={resource.id} className="mb-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingBooking.resources.includes(resource.id)}
                      onChange={() => toggleEditingBookingResource(resource.id)}
                    />
                    <span>
                      {resource.name}
                      {resource.type_name ? ` · ${resource.type_name}` : ""}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2 text-sm text-gray-500">
                {editingBooking.resources.length} resources selected.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingBooking(null)}
                className="rounded border px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveBookingEdit}
                disabled={updatingBooking}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-500"
              >
                {updatingBooking ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
