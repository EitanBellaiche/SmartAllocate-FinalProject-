import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api/api";

const DEFAULT_SEMESTER_MONTHS = 3;
const DEFAULT_WEEKLY_HOURS = 3;
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

export default function AutoScheduler() {
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [responsibleUsers, setResponsibleUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [rangeStart, setRangeStart] = useState(() => toDateValue(new Date()));
  const [rangeEnd, setRangeEnd] = useState(() =>
    toDateValue(addMonths(new Date(), DEFAULT_SEMESTER_MONTHS))
  );
  const [selection, setSelection] = useState({
    typeIds: [],
    resourceIds: [],
    responsibleId: "",
    userIds: "",
    weeklyHours: String(DEFAULT_WEEKLY_HOURS),
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
        setMessage(err?.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const typeOptions = useMemo(() => {
    const set = new Set();
    resourceTypes.forEach((t) => {
      const key = String(t?.name || "").trim().toLowerCase();
      if (key) set.add(key);
    });
    return ["all", ...Array.from(set)];
  }, [resourceTypes]);

  const filteredResources = useMemo(() => {
    const q = resourceQuery.trim().toLowerCase();
    const typeKey = String(typeFilter || "").trim().toLowerCase();
    return resources.filter((r) => {
      const type = resourceTypes.find((t) => t.id === r.type_id);
      const typeName = String(type?.name || r.type_name || "").toLowerCase();
      const matchesQuery = !q || `${r.name} ${typeName}`.toLowerCase().includes(q);
      const matchesType = typeKey === "all" || typeName === typeKey;
      return matchesQuery && matchesType;
    });
  }, [resources, resourceTypes, resourceQuery, typeFilter]);

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

  const effectiveResourceIds = useMemo(() => {
    const fromTypes = resources
      .filter((resource) =>
        selection.typeIds.some((typeId) => String(typeId) === String(resource.type_id))
      )
      .map((resource) => resource.id);
    return Array.from(new Set([...(selection.resourceIds || []), ...fromTypes]));
  }, [resources, selection.resourceIds, selection.typeIds]);

  function addGroup() {
    if (effectiveResourceIds.length === 0) {
      setMessage("Select at least one resource or resource type for the allocation.");
      return;
    }
    if (!selection.responsibleId.trim()) {
      setMessage("Responsible user ID is required.");
      return;
    }
    const group = {
      group_id: buildGroupId(),
      type_ids: selection.typeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
      resource_ids: effectiveResourceIds,
      responsible_user_id: selection.responsibleId.trim(),
      user_ids: parseIds(selection.userIds),
      weekly_hours: Number(selection.weeklyHours) || DEFAULT_WEEKLY_HOURS,
    };
    setGroups((prev) => [...prev, group]);
    setSelection({
      typeIds: [],
      resourceIds: [],
      responsibleId: "",
      userIds: "",
      weeklyHours: String(DEFAULT_WEEKLY_HOURS),
    });
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
      setMessage(err?.message || "Failed to load allocations.");
      setAllocations([]);
    } finally {
      setAllocationsLoading(false);
    }
  }

  async function runAutoSchedule() {
    if (running) return;
    setRunning(true);
    setMessage("");
    try {
      const data = await apiPost("/auto-schedule", {
        start_date: rangeStart,
        end_date: rangeEnd,
        groups,
      });
      const scheduledCount = data?.scheduled?.length || 0;
      const skippedCount = data?.skipped?.length || 0;
      setLastRun({
        scheduled: Array.isArray(data?.scheduled) ? data.scheduled : [],
        skipped: Array.isArray(data?.skipped) ? data.skipped : [],
      });
      setMessage(
        `Auto schedule completed. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
      );
      await loadAllocations();
    } catch (err) {
      setMessage(err?.message || "Auto schedule failed.");
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
      setMessage("Allocation removed.");
      await loadAllocations();
    } catch (err) {
      setMessage(err?.message || "Failed to remove allocation.");
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Auto Scheduler</h1>
          <p className="text-sm text-gray-600">
            Build allocations by picking resources together, then schedule by teacher availability.
          </p>
        </div>
      </div>

      {message && (
        <div className="mb-4 p-2 rounded bg-blue-50 text-blue-700 border border-blue-100">
          {message}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Range start</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Range end</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={runAutoSchedule}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            disabled={groups.length === 0 || running}
          >
            {running ? "Running..." : "Run auto schedule"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 border mb-6">
        <h2 className="text-lg font-semibold mb-4">Responsible availability</h2>
        {availability.length === 0 ? (
          <div className="text-sm text-gray-500">No availability found.</div>
        ) : (
          <div className="space-y-3">
            {Object.entries(availabilityByUser).map(([userId, slots]) => {
              const user = responsibleById[userId];
              return (
                <div key={userId} className="border rounded-lg p-3">
                  <div className="font-semibold">
                    {user?.full_name || "Responsible"} - {userId}
                  </div>
                  <div className="text-xs text-gray-600">
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

      <div className="bg-white rounded-lg shadow-sm p-4 border mb-6">
        <h2 className="text-lg font-semibold mb-4">Build allocation</h2>
        <div className="mb-3 text-sm text-gray-600">
          You can combine specific resources and whole resource types in the same allocation.
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            className="border rounded px-3 py-2"
            placeholder="Search resources..."
            value={resourceQuery}
            onChange={(e) => setResourceQuery(e.target.value)}
          />
          <select
            className="border rounded px-3 py-2"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {typeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all" ? "All types" : opt}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-medium mb-2">Whole resource types</div>
            <div className="border rounded p-3 max-h-48 overflow-y-auto">
              {resourceTypes.map((type) => (
                <label key={type.id} className="flex items-center gap-2 mb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selection.typeIds.includes(type.id)}
                    onChange={() => toggleType(type.id)}
                  />
                  <span>{type.name}</span>
                </label>
              ))}
              {resourceTypes.length === 0 && (
                <div className="text-xs text-gray-500">No resource types found.</div>
              )}
            </div>
          </div>
          <div>
            <div className="font-medium mb-2">Specific resources</div>
            <div className="border rounded p-3 max-h-64 overflow-y-auto">
              {filteredResources.map((resource) => {
                const type = resourceTypes.find((t) => t.id === resource.type_id);
                const typeName = type?.name || resource.type_name || "Resource";
                return (
                  <label key={resource.id} className="flex items-center gap-2 mb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selection.resourceIds.includes(resource.id)}
                      onChange={() => toggleResource(resource.id)}
                    />
                    <span>{resource.name}</span>
                    <span className="text-xs text-gray-500">({typeName})</span>
                  </label>
                );
              })}
              {filteredResources.length === 0 && (
                <div className="text-xs text-gray-500">No resources match.</div>
              )}
            </div>
          </div>
          <div className="grid gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Responsible user ID</label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={selection.responsibleId}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, responsibleId: e.target.value }))
                }
                list="responsible-list"
                placeholder="e.g. 12345"
              />
              <datalist id="responsible-list">
                {responsibleUsers.map((user) => (
                  <option
                    key={user.id}
                    value={user.national_id || ""}
                    label={user.full_name || user.email || ""}
                  />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Assigned user IDs</label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={selection.userIds}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, userIds: e.target.value }))
                }
                placeholder="123, 456"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Hours per week</label>
              <input
                type="number"
                min="1"
                className="border rounded px-2 py-1 w-full"
                value={selection.weeklyHours}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, weeklyHours: e.target.value }))
                }
              />
            </div>
            <button
              type="button"
              className="border border-blue-200 text-blue-700 px-3 py-2 rounded hover:bg-blue-50"
              onClick={addGroup}
            >
              Add allocation
            </button>
            <div className="text-xs text-gray-600">
              {effectiveResourceIds.length > 0
                ? `${effectiveResourceIds.length} unique resources will be included in this allocation.`
                : "No resources selected yet."}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 border">
        <h2 className="text-lg font-semibold mb-4">Allocations</h2>
        {groups.length === 0 && (
          <div className="text-sm text-gray-500">No allocations yet.</div>
        )}
        {groups.length > 0 && (
          <div className="space-y-4">
            {groups.map((group) => {
              const typeNames = Array.isArray(group.type_ids)
                ? group.type_ids
                    .map((typeId) => resourceTypes.find((type) => Number(type.id) === Number(typeId))?.name || `Type ${typeId}`)
                    .join(", ")
                : "";
              const resourceNames = group.resource_ids
                .map((id) => resourceById[id]?.name || `Resource ${id}`)
                .join(", ");
              const title = typeNames
                ? `${typeNames}${resourceNames ? ` + ${resourceNames}` : ""}`
                : resourceNames;
              return (
                <div key={group.group_id} className="border rounded-lg p-4">
                  <div className="font-semibold mb-2">{title}</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Responsible user ID
                      </label>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={group.responsible_user_id}
                        onChange={(e) =>
                          updateGroup(group.group_id, { responsible_user_id: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Assigned user IDs</label>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={group.user_ids.join(", ")}
                        onChange={(e) =>
                          updateGroup(group.group_id, { user_ids: parseIds(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Hours per week</label>
                      <input
                        type="number"
                        min="1"
                        className="border rounded px-2 py-1 w-full"
                        value={group.weekly_hours}
                        onChange={(e) =>
                          updateGroup(group.group_id, {
                            weekly_hours: Number(e.target.value) || DEFAULT_WEEKLY_HOURS,
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="border px-3 py-2 rounded text-red-600 hover:bg-red-50 w-full"
                        onClick={() => removeGroup(group.group_id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {group.responsible_user_id &&
                    availabilityByUser[group.responsible_user_id]?.length > 0 && (
                      <div className="mt-3 text-xs text-gray-600">
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

      <div className="mt-6 bg-white rounded-lg shadow-sm p-4 border">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold">Allocations in range</h2>
          <button
            type="button"
            onClick={loadAllocations}
            className="border border-blue-200 text-blue-700 px-3 py-2 rounded hover:bg-blue-50"
            disabled={allocationsLoading}
          >
            {allocationsLoading ? "Loading..." : "Refresh list"}
          </button>
        </div>
        {allocationsLoading ? (
          <div className="text-sm text-gray-500">Loading allocations...</div>
        ) : allocations.length === 0 ? (
          <div className="text-sm text-gray-500">No allocations found in this range.</div>
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
                <div key={`${item.responsible_user_id}-${idx}`} className="border rounded-lg p-3">
                  <div className="font-semibold">{resourcesLabel}</div>
                  <div className="text-xs text-gray-600">
                    Responsible: {item.responsible_user_id} | {dayLabel} |{" "}
                    {String(item.start_time).slice(0, 5)}-{String(item.end_time).slice(0, 5)} |{" "}
                    {item.start_date} -> {item.end_date} | {item.occurrences} weeks
                  </div>
                  <button
                    type="button"
                    className="mt-2 border px-3 py-1 rounded text-red-600 hover:bg-red-50"
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
        <div className="mt-6 border rounded p-3 bg-gray-50">
          <div className="text-xs font-semibold text-gray-700 mb-1">
            Scheduled summary
          </div>
          <div className="text-xs text-gray-600">
            {lastRun.scheduled.length} sessions scheduled. See allocations in range for the full
            recurring blocks.
          </div>
        </div>
      )}
      {lastRun.skipped.length > 0 && (
        <div className="mt-4 border rounded p-3 bg-red-50">
          <div className="text-xs font-semibold text-red-700 mb-2">
            Skipped details
          </div>
          <div className="text-xs text-red-700 space-y-1">
            {lastRun.skipped.slice(0, 10).map((item, idx) => (
              <div key={`${item.group_id || idx}`}>
                {item.reason}
              </div>
            ))}
            {lastRun.skipped.length > 10 && (
              <div>+{lastRun.skipped.length - 10} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
