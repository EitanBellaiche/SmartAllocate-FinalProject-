import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api/api";
import IsraelDateInput from "../components/IsraelDateInput";
import { formatIsraelDate, formatIsraelDateRange, formatIsraelTime } from "../utils/datetime";

const DEFAULT_SEMESTER_MONTHS = 3;
const DEFAULT_HOURS_PER_DAY = 3;
const DEFAULT_DAYS_PER_WEEK = 1;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toDateValue(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIds(raw) {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildGroupId() {
  return `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractGroupSuggestions(item) {
  return Array.isArray(item?.suggestions) ? item.suggestions : [];
}

export default function AutoScheduler({ embedded = false }) {
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [responsibleUsers, setResponsibleUsers] = useState([]);
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [responsibleOptions, setResponsibleOptions] = useState([]);
  const [responsibleLoading, setResponsibleLoading] = useState(false);
  const [responsibleError, setResponsibleError] = useState("");
  const [responsibleUser, setResponsibleUser] = useState(null);
  const [responsibleAvailability, setResponsibleAvailability] = useState([]);
  const [responsibleOverrides, setResponsibleOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");
  const [resourceTypeQuery, setResourceTypeQuery] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceFilterTypeId, setResourceFilterTypeId] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [rangeStart, setRangeStart] = useState(() => toDateValue(new Date()));
  const [rangeEnd, setRangeEnd] = useState(() =>
    toDateValue(addMonths(new Date(), DEFAULT_SEMESTER_MONTHS))
  );
  const [selection, setSelection] = useState({
    typeIds: [],
    resourceIds: [],
    responsibleId: "",
    userIds: "",
    hoursPerDay: String(DEFAULT_HOURS_PER_DAY),
    daysPerWeek: String(DEFAULT_DAYS_PER_WEEK),
  });
  const [groups, setGroups] = useState([]);
  const [lastRun, setLastRun] = useState({ scheduled: [], skipped: [] });
  const [allocations, setAllocations] = useState([]);
  const [allocationsLoading, setAllocationsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [resourceData, typeData, availabilityData, usersData] = await Promise.all([
          apiGet("/resources"),
          apiGet("/resource-types"),
          apiGet("/user-availability"),
          apiGet("/users?role=responsible"),
        ]);
        setResources(Array.isArray(resourceData) ? resourceData : []);
        setResourceTypes(Array.isArray(typeData) ? typeData : []);
        setAvailability(Array.isArray(availabilityData) ? availabilityData : []);
        setResponsibleUsers(Array.isArray(usersData) ? usersData : []);
      } catch (err) {
        setMessageTone("error");
        setMessage(err?.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
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
  }, [responsibleQuery]);

  useEffect(() => {
    const responsibleId = String(responsibleUser?.national_id || "").trim();
    if (!responsibleId) {
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
  }, [responsibleUser]);

  const availabilityByUser = useMemo(() => {
    return availability.reduce((acc, row) => {
      const key = String(row.user_id || "").trim();
      if (!key) return acc;
      acc[key] = acc[key] || [];
      acc[key].push(row);
      return acc;
    }, {});
  }, [availability]);

  const responsibleById = useMemo(() => {
    return responsibleUsers.reduce((acc, user) => {
      const key = String(user?.national_id || user?.id || "").trim();
      if (!key) return acc;
      acc[key] = user;
      return acc;
    }, {});
  }, [responsibleUsers]);

  const resourceById = useMemo(() => {
    return resources.reduce((acc, resource) => {
      acc[resource.id] = resource;
      return acc;
    }, {});
  }, [resources]);

  const filteredResourceTypes = useMemo(() => {
    const query = resourceTypeQuery.trim().toLowerCase();
    return resourceTypes.filter((type) => {
      if (!query) return true;
      return String(type.name || "").toLowerCase().includes(query);
    });
  }, [resourceTypes, resourceTypeQuery]);

  const filteredResources = useMemo(() => {
    const query = resourceQuery.trim().toLowerCase();
    return resources.filter((resource) => {
      const matchesQuery =
        !query ||
        String(resource.name || "").toLowerCase().includes(query) ||
        String(resource.type_name || "").toLowerCase().includes(query);
      const matchesType =
        !resourceFilterTypeId || String(resource.type_id) === String(resourceFilterTypeId);
      const matchesSelected =
        !showSelectedOnly || selection.resourceIds.includes(resource.id);
      return matchesQuery && matchesType && matchesSelected;
    });
  }, [resources, resourceQuery, resourceFilterTypeId, showSelectedOnly, selection.resourceIds]);

  function toggleResource(resourceId) {
    setSelection((prev) => {
      const exists = prev.resourceIds.includes(resourceId);
      const next = exists
        ? prev.resourceIds.filter((id) => id !== resourceId)
        : [...prev.resourceIds, resourceId];
      return { ...prev, resourceIds: next };
    });
  }

  function toggleType(typeId) {
    setSelection((prev) => {
      const exists = prev.typeIds.includes(typeId);
      const next = exists
        ? prev.typeIds.filter((id) => id !== typeId)
        : [...prev.typeIds, typeId];
      return { ...prev, typeIds: next };
    });
  }

  function addGroup() {
    if (selection.resourceIds.length === 0 && selection.typeIds.length === 0) {
      setMessage("Select at least one resource or resource type for the allocation.");
      return;
    }
    const group = {
      group_id: buildGroupId(),
      type_ids: selection.typeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
      resource_ids: selection.resourceIds,
      responsible_user_id: selection.responsibleId.trim(),
      user_ids: parseIds(selection.userIds),
      hours_per_day: Number(selection.hoursPerDay) || DEFAULT_HOURS_PER_DAY,
      days_per_week: Math.min(
        7,
        Math.max(1, Number(selection.daysPerWeek) || DEFAULT_DAYS_PER_WEEK)
      ),
    };
    setGroups((prev) => [...prev, group]);
    setSelection({
      typeIds: [],
      resourceIds: [],
      responsibleId: "",
      userIds: "",
      hoursPerDay: String(DEFAULT_HOURS_PER_DAY),
      daysPerWeek: String(DEFAULT_DAYS_PER_WEEK),
    });
    setResponsibleQuery("");
    setResponsibleOptions([]);
    setResponsibleUser(null);
    setMessage("");
  }

  function updateGroup(groupId, patch) {
    setGroups((prev) =>
      prev.map((g) => (g.group_id === groupId ? { ...g, ...patch } : g))
    );
  }

  function removeGroup(groupId) {
    setGroups((prev) => prev.filter((g) => g.group_id !== groupId));
  }

  function applyAutoSuggestion(groupId, suggestion) {
    if (!groupId || !Array.isArray(suggestion?.resource_ids) || suggestion.resource_ids.length === 0) {
      return;
    }
    updateGroup(groupId, {
      resource_ids: suggestion.resource_ids,
      type_ids: [],
    });
    setMessageTone("success");
    setMessage(`Loaded alternative for allocation: ${suggestion.summary || "resource suggestion"}.`);
  }

  async function loadAllocations() {
    setAllocationsLoading(true);
    try {
      const qs = new URLSearchParams({
        start_date: rangeStart,
        end_date: rangeEnd,
      });
      const data = await apiGet(`/auto-schedule/allocations?${qs.toString()}`);
      setAllocations(Array.isArray(data) ? data : []);
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to load allocations.");
      setAllocations([]);
    } finally {
      setAllocationsLoading(false);
    }
  }

  async function runAutoSchedule() {
    if (running) return;
    if (groups.length === 0) {
      setMessageTone("error");
      setMessage("Add at least one allocation before running auto schedule.");
      return;
    }
    if (!rangeStart || !rangeEnd) {
      setMessageTone("error");
      setMessage("Choose both range start and range end.");
      return;
    }
    setRunning(true);
    setMessage("");
    try {
      const data = await apiPost("/auto-schedule", {
        start_date: rangeStart,
        end_date: rangeEnd,
        groups,
      }, {
        timeoutMs: 20000,
        timeoutMessage:
          "Auto schedule did not return within 20 seconds. The request likely got stuck on the server or no valid slot could be resolved. Check the selected room/course combination or inspect the backend logs.",
      });
      const scheduledCount = data?.scheduled?.length || 0;
      const skippedCount = data?.skipped?.length || 0;
      setLastRun({
        scheduled: Array.isArray(data?.scheduled) ? data.scheduled : [],
        skipped: Array.isArray(data?.skipped) ? data.skipped : [],
      });
      setMessageTone(skippedCount > 0 && scheduledCount === 0 ? "error" : "success");
      setMessage(
        skippedCount > 0 && scheduledCount === 0
          ? `Auto schedule completed without results. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
          : `Auto schedule completed. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
      );
      await loadAllocations();
    } catch (err) {
      if (err?.code === "REQUEST_TIMEOUT") {
        try {
          const diagnostic = await apiPost(
            "/auto-schedule/diagnose",
            {
              start_date: rangeStart,
              end_date: rangeEnd,
              groups,
            },
            {
              timeoutMs: 10000,
              timeoutMessage: "Could not analyze the scheduling conflict in time.",
            }
          );
          const skipped = Array.isArray(diagnostic?.skipped) ? diagnostic.skipped : [];
          setLastRun({ scheduled: [], skipped });
          const first = skipped[0];
          setMessageTone("error");
          setMessage(
            first?.reason ||
              "Auto schedule timed out, but a conflict analysis was returned below."
          );
        } catch (diagnosticErr) {
          setMessageTone("error");
          setMessage(diagnosticErr?.message || err?.message || "Auto schedule failed.");
        }
      } else {
        setMessageTone("error");
        setMessage(err?.message || "Auto schedule failed.");
      }
    } finally {
      setRunning(false);
    }
  }

  async function removeAllocation(allocation) {
    if (!allocation) return;
    setMessage("");
    try {
      await apiPost("/auto-schedule/allocations/delete", {
        start_date: rangeStart,
        end_date: rangeEnd,
        start_time: allocation.start_time,
        end_time: allocation.end_time,
        resource_ids: allocation.resource_ids,
        responsible_user_id: allocation.responsible_user_id,
      });
      setMessageTone("success");
      setMessage("Allocation removed.");
      await loadAllocations();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to remove allocation.");
    }
  }

  return (
    <div className={embedded ? "" : "p-6"}>
      {!embedded && (
        <div className="mb-6 rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_50%,#ffffff_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div>
            <div className="inline-flex rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              Auto Planner
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Auto Scheduler
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Build allocations by picking resources together, then schedule by teacher availability.
            </p>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mb-5 rounded-2xl px-4 py-3 text-sm ${
            messageTone === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : messageTone === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {message}
        </div>
      )}

      <div className="mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Range start</label>
            <IsraelDateInput
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              value={rangeStart}
              onChange={setRangeStart}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Range end</label>
            <IsraelDateInput
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              value={rangeEnd}
              onChange={setRangeEnd}
            />
          </div>
          <button
            type="button"
            onClick={runAutoSchedule}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.26)] transition hover:bg-blue-700 disabled:bg-slate-400 disabled:shadow-none"
            disabled={groups.length === 0 || running}
          >
            {running ? "Running..." : "Run auto schedule"}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Responsible availability</h2>
        {availability.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No availability found.
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(availabilityByUser).map(([userId, slots]) => {
              const user = responsibleById[userId];
              return (
                <div key={userId} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="font-semibold text-slate-900">
                    {user?.full_name || "Responsible"} - {userId}
                  </div>
                  <div className="mt-1 text-xs leading-6 text-slate-600">
                    {slots
                      .map(
                        (slot) =>
                          `Day ${slot.day_of_week} ${slot.start_time?.slice?.(0, 5) || slot.start_time}-${
                            slot.end_time?.slice?.(0, 5) || slot.end_time
                          }`
                      )
                      .join(" | ")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Build allocation</h2>
        <div className="mb-4 text-sm text-slate-600">
          You can combine specific resources and whole resource types in the same allocation.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="mb-2 text-base font-semibold text-slate-900">Whole resource types</div>
            <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="text"
                className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500"
                value={resourceTypeQuery}
                onChange={(e) => setResourceTypeQuery(e.target.value)}
                placeholder="Search resource types..."
              />
              {filteredResourceTypes.map((type) => (
                <label key={type.id} className="mb-2 flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm text-slate-700 shadow-sm">
                  <input
                    type="checkbox"
                    checked={selection.typeIds.includes(type.id)}
                    onChange={() => toggleType(type.id)}
                  />
                  <span>{type.name}</span>
                </label>
              ))}
              {filteredResourceTypes.length === 0 && (
                <div className="text-xs text-slate-500">No resource types found.</div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-base font-semibold text-slate-900">Specific resources</div>
            <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 grid gap-3">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500"
                  placeholder="Search resources..."
                  value={resourceQuery}
                  onChange={(e) => setResourceQuery(e.target.value)}
                />
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500"
                    value={resourceFilterTypeId}
                    onChange={(e) => setResourceFilterTypeId(e.target.value)}
                  >
                    <option value="">All resource types</option>
                    {resourceTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={showSelectedOnly}
                      onChange={(e) => setShowSelectedOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Selected only</span>
                  </label>
                </div>
              </div>
              {filteredResources.map((resource) => {
                const type = resourceTypes.find((t) => t.id === resource.type_id);
                const typeName = type?.name || resource.type_name || "Resource";
                return (
                  <label key={resource.id} className="mb-2 flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm text-slate-700 shadow-sm">
                    <input
                      type="checkbox"
                      checked={selection.resourceIds.includes(resource.id)}
                      onChange={() => toggleResource(resource.id)}
                    />
                    <span>{resource.name}</span>
                    <span className="text-xs text-slate-500">({typeName})</span>
                  </label>
                );
              })}
              {filteredResources.length === 0 && (
                <div className="text-xs text-slate-500">No resources match.</div>
              )}
            </div>
          </div>
          <div className="grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">People assignment</h3>
              <p className="mt-1 text-sm text-slate-500">
                Keep this optional. Pick a responsible user only when this allocation should be tied to one, and optionally add additional user IDs.
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Responsible user (optional)
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={responsibleQuery}
                onChange={(e) => {
                  setResponsibleQuery(e.target.value);
                  setResponsibleUser(null);
                  setSelection((prev) => ({ ...prev, responsibleId: "" }));
                }}
                placeholder="Search by name, email, or ID"
              />
              {responsibleLoading && (
                <div className="mt-2 text-sm text-slate-500">Loading users...</div>
              )}
              {responsibleError && (
                <div className="mt-2 text-sm text-red-600">{responsibleError}</div>
              )}
              {responsibleOptions.length > 0 && (
                <div className="mt-3 max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  {responsibleOptions.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="w-full rounded-xl px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        const nextId = String(user.national_id || user.id || "").trim();
                        setResponsibleUser(user);
                        setResponsibleQuery(
                          user.full_name || user.email || user.national_id || ""
                        );
                        setSelection((prev) => ({ ...prev, responsibleId: nextId }));
                      }}
                    >
                      {user.full_name || "User"} · {user.national_id || "No ID"} · {user.email}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">
                Selected: {responsibleUser?.national_id || selection.responsibleId || "None"}
              </div>
            </div>

            {responsibleUser && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-slate-700">
                <div className="mb-2 font-semibold text-slate-900">Responsible availability</div>
                {responsibleAvailability.length === 0 && responsibleOverrides.length === 0 ? (
                  <div>No availability defined yet.</div>
                ) : (
                  <>
                    {responsibleAvailability.length > 0 && (
                      <div className="space-y-1">
                        {responsibleAvailability.map((slot) => (
                          <div key={slot.id}>
                            {DAY_LABELS[Number(slot.day_of_week)] || `Day ${slot.day_of_week}`}{" "}
                            {formatIsraelTime(slot.start_time)}-{formatIsraelTime(slot.end_time)}
                            {slot.start_date || slot.end_date
                              ? ` | ${formatIsraelDateRange(slot.start_date, slot.end_date)}`
                              : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {responsibleOverrides.length > 0 && (
                      <div className="mt-3 border-t border-emerald-100 pt-3 text-xs text-slate-500">
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

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Assigned user IDs
              </label>
              <textarea
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={selection.userIds}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, userIds: e.target.value }))
                }
                placeholder="e.g. 12345, 67890"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Hours per day
              </label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={selection.hoursPerDay}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, hoursPerDay: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Days per week
              </label>
              <input
                type="number"
                min="1"
                max="7"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={selection.daysPerWeek}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, daysPerWeek: e.target.value }))
                }
              />
              <div className="mt-1 text-xs text-slate-500">
                Auto schedule will split the weekly hours into this many sessions.
              </div>
            </div>
            <button
              type="button"
              className="rounded-2xl border border-blue-200 bg-white px-4 py-3 font-medium text-blue-700 transition hover:bg-blue-50"
              onClick={addGroup}
            >
              Add allocation
            </button>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs text-slate-600">
              {selection.resourceIds.length > 0 || selection.typeIds.length > 0
                ? `${selection.resourceIds.length} fixed resources selected. ${selection.typeIds.length} resource types selected for automatic matching.`
                : "No resources selected yet."}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Allocations</h2>
        {groups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">No allocations yet.</div>
        )}
        {groups.length > 0 && (
          <div className="space-y-4">
            {groups.map((group) => {
              const typeNames = Array.isArray(group.type_ids)
                ? group.type_ids
                    .map((typeId) => resourceTypes.find((type) => Number(type.id) === Number(typeId))?.name || `Type ${typeId}`)
                    .join(", ")
                : "";
              const resourceNames = (group.resource_ids || [])
                .map((id) => resourceById[id]?.name || `Resource ${id}`)
                .join(", ");
              const title = typeNames
                ? `${typeNames}${resourceNames ? ` + ${resourceNames}` : ""}`
                : resourceNames;
              return (
                <div key={group.group_id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-2 font-semibold text-slate-900">{title}</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Responsible user ID
                      </label>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={group.responsible_user_id}
                        onChange={(e) =>
                          updateGroup(group.group_id, { responsible_user_id: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Assigned user IDs</label>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={group.user_ids.join(", ")}
                        onChange={(e) =>
                          updateGroup(group.group_id, { user_ids: parseIds(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Hours per day</label>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={
                          group.hours_per_day ??
                          (Number(group.weekly_hours || 0) > 0
                            ? Number(group.weekly_hours) / (Number(group.days_per_week || 1) || 1)
                            : DEFAULT_HOURS_PER_DAY)
                        }
                        onChange={(e) =>
                          updateGroup(group.group_id, {
                            hours_per_day: Number(e.target.value) || DEFAULT_HOURS_PER_DAY,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Days per week
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="7"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={group.days_per_week ?? DEFAULT_DAYS_PER_WEEK}
                        onChange={(e) =>
                          updateGroup(group.group_id, {
                            days_per_week: Math.min(7, Math.max(1, Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="w-full rounded-2xl border border-red-200 bg-white px-3 py-2.5 text-red-600 transition hover:bg-red-50"
                        onClick={() => removeGroup(group.group_id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {group.responsible_user_id &&
                    availabilityByUser[group.responsible_user_id]?.length > 0 && (
                      <div className="mt-3 text-xs text-slate-600">
                        Availability records:{" "}
                        {availabilityByUser[group.responsible_user_id].length}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Allocations in range</h2>
          <button
            type="button"
            onClick={loadAllocations}
            className="rounded-2xl border border-blue-200 bg-white px-4 py-2.5 font-medium text-blue-700 transition hover:bg-blue-50"
            disabled={allocationsLoading}
          >
            {allocationsLoading ? "Loading..." : "Refresh list"}
          </button>
        </div>
        {allocationsLoading ? (
          <div className="text-sm text-slate-500">Loading allocations...</div>
        ) : allocations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">No allocations found in this range.</div>
        ) : (
          <div className="space-y-3">
            {allocations.map((item, idx) => {
              const resourcesLabel = Array.isArray(item.resource_names)
                ? item.resource_names.join(", ")
                : Array.isArray(item.resource_ids)
                  ? item.resource_ids.join(", ")
                  : "Resources";
              const dayLabel =
                DAY_LABELS[item.day_of_week] || `Day ${item.day_of_week}`;
              return (
                <div key={`${item.responsible_user_id}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="font-semibold text-slate-900">{resourcesLabel}</div>
                  <div className="mt-1 text-xs leading-6 text-slate-600">
                    Responsible: {item.responsible_user_id} | {dayLabel} |{" "}
                    {formatIsraelTime(item.start_time)}-{formatIsraelTime(item.end_time)} |{" "}
                    {formatIsraelDate(item.start_date)} {"->"} {formatIsraelDate(item.end_date)} | {item.occurrences} weeks
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-red-600 transition hover:bg-red-50"
                    onClick={() => removeAllocation(item)}
                  >
                    Remove allocation
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lastRun.scheduled.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
            Scheduled summary
          </div>
          <div className="text-xs text-slate-600">
            {lastRun.scheduled.length} sessions scheduled. See allocations in range for the full
            recurring blocks.
          </div>
        </div>
      )}
      {lastRun.skipped.length > 0 && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
            Skipped details
          </div>
          <div className="space-y-3">
            {lastRun.skipped.slice(0, 10).map((item, idx) => {
              const suggestions = extractGroupSuggestions(item);
              const failedSlot = item?.failed_slot;
              const occupiedBy = item?.occupied_by;
              return (
                <div
                  key={`${item.group_id || idx}`}
                  className="rounded-2xl border border-red-200 bg-white/75 p-4"
                >
                  <div className="text-sm font-semibold text-red-800">{item.reason}</div>
                  {failedSlot?.date && failedSlot?.start_time && failedSlot?.end_time && (
                    <div className="mt-1 text-xs text-red-700">
                      Failed slot: {failedSlot.date} {failedSlot.start_time} - {failedSlot.end_time}
                    </div>
                  )}
                  {occupiedBy?.resource_name && (
                    <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                      <div className="font-semibold">Blocking booking</div>
                      <div className="mt-1">
                        Resource: {occupiedBy.resource_name}
                        {occupiedBy.resource_type_name ? ` (${occupiedBy.resource_type_name})` : ""}
                      </div>
                      <div>
                        Booking #{occupiedBy.id ?? occupiedBy.booking_id} | {occupiedBy.date} {occupiedBy.start_time}-
                        {occupiedBy.end_time}
                        {occupiedBy.user_id ? ` | User ${occupiedBy.user_id}` : ""}
                      </div>
                    </div>
                  )}
                  {suggestions.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                        Suggested alternatives
                      </div>
                      {suggestions.map((suggestion, suggestionIndex) => (
                        <div
                          key={`${item.group_id || idx}-suggestion-${suggestionIndex}`}
                          className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                              {suggestion.type === "timeslot" ? "Time Alternative" : "Resource Alternative"}
                            </span>
                            {Number.isFinite(Number(suggestion?.score)) && (
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                                Score {Number(suggestion.score)}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 text-sm font-semibold text-slate-900">
                            {suggestion.summary || "Alternative"}
                          </div>
                          {suggestion.why && (
                            <div className="mt-1 text-sm text-slate-600">{suggestion.why}</div>
                          )}
                          {suggestion.type === "timeslot" && (
                            <div className="mt-2 text-xs text-slate-600">
                              Suggested slot: {suggestion.date} {suggestion.start_time} - {suggestion.end_time}
                            </div>
                          )}
                          {Array.isArray(suggestion.resources) && suggestion.resources.length > 0 && (
                            <div className="mt-2 text-xs text-slate-600">
                              Resources: {suggestion.resources.map((resource) => resource.name).join(", ")}
                            </div>
                          )}
                          {suggestion.type === "resource" && Array.isArray(suggestion.resource_ids) && suggestion.resource_ids.length > 0 && (
                            <button
                              type="button"
                              className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                              onClick={() => applyAutoSuggestion(item.group_id, suggestion)}
                            >
                              Use resource suggestion
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {lastRun.skipped.length > 10 && (
              <div className="text-xs text-red-700">+{lastRun.skipped.length - 10} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
