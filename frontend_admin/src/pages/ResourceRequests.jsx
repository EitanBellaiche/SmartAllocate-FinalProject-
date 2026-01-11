import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../api/api";

const STATUS_OPTIONS = ["all", "pending", "approved", "rejected", "handled"];

function parseDateOnly(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return parsed;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "-";
  const d = parseDateOnly(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeRange(start, end) {
  if (!start || !end) return "-";
  return `${String(start).slice(0, 5)} - ${String(end).slice(0, 5)}`;
}

export default function ResourceRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedResourceKey, setSelectedResourceKey] = useState(null);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((req) => {
      const haystack = [
        req.resource_name,
        req.resource_type,
        req.student_id,
        req.note,
        req.status,
        req.request_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [requests, searchQuery]);

  const groupedRequests = useMemo(() => {
    const groups = new Map();
    filteredRequests.forEach((req) => {
      const key = String(req.resource_id ?? req.resource_name ?? req.id);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          resource_id: req.resource_id,
          resource_name: req.resource_name,
          resource_type: req.resource_type,
          requests: [],
        });
      }
      groups.get(key).requests.push(req);
    });
    return Array.from(groups.values()).sort((a, b) => {
      const aName = a.resource_name || `Resource #${a.resource_id || ""}`;
      const bName = b.resource_name || `Resource #${b.resource_id || ""}`;
      return aName.localeCompare(bName);
    });
  }, [filteredRequests]);

  useEffect(() => {
    if (
      selectedResourceKey &&
      !groupedRequests.some((g) => g.key === selectedResourceKey)
    ) {
      setSelectedResourceKey(null);
    }
  }, [groupedRequests, selectedResourceKey]);

  useEffect(() => {
    if (searchQuery.trim()) {
      setSelectedResourceKey(null);
    }
  }, [searchQuery]);

  const selectedGroup = groupedRequests.find(
    (group) => group.key === selectedResourceKey
  );

  async function loadRequests() {
    setLoading(true);
    setError("");
    try {
      const path =
        statusFilter === "all"
          ? "/resource-requests"
          : `/resource-requests?status=${encodeURIComponent(statusFilter)}`;
      const data = await apiGet(path);
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await apiPut(`/resource-requests/${id}`, { status });
      setRequests((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updated } : item))
      );
    } catch (err) {
      setError(err?.message || "Failed to update request.");
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Resource Requests
          </h1>
          <p className="text-sm text-gray-500">
            Review and respond to student resource requests.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by resource, student, note..."
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all"
                  ? "All statuses"
                  : option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={loadRequests}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="px-6 py-6 text-sm text-gray-500">
            Loading requests...
          </div>
        ) : groupedRequests.length === 0 ? (
          <div className="px-6 py-6 text-sm text-gray-500">
            No requests found.
          </div>
        ) : !selectedGroup ? (
          <div className="p-4 space-y-3">
            {groupedRequests.map((group) => {
              const pendingCount = group.requests.filter(
                (req) => (req.status || "pending") === "pending"
              ).length;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setSelectedResourceKey(group.key)}
                  className="w-full text-left px-4 py-4 flex items-center gap-3 rounded-xl border border-gray-200 shadow-sm bg-white"
                >
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-900">
                      {group.resource_name || `Resource #${group.resource_id}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {group.resource_type || "Resource"}
                    </div>
                  </div>
                  {pendingCount > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold w-6 h-6">
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4">
            <button
              type="button"
              onClick={() => setSelectedResourceKey(null)}
              className="text-blue-600 font-semibold text-sm mb-4"
            >
              Back to resources
            </button>
            <div className="text-base font-semibold text-gray-900 mb-3">
              {selectedGroup.resource_name ||
                `Resource #${selectedGroup.resource_id}`}
            </div>
            <div className="grid gap-3">
              {selectedGroup.requests.map((req) => (
                <div
                  key={req.id}
                  className="border border-gray-200 rounded-lg p-4 flex flex-wrap gap-4 items-center"
                >
                  <div className="min-w-[180px]">
                    <div className="text-sm font-semibold text-gray-900">
                      {req.student_id}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(req.request_date)} ·{" "}
                      {formatTimeRange(req.start_time, req.end_time)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatDateTime(req.created_at)}
                    </div>
                  </div>
                  <div className="flex-1 text-sm text-gray-600">
                    {req.note}
                  </div>
                  <div>
                    <select
                      value={req.status || "pending"}
                      onChange={(e) => updateStatus(req.id, e.target.value)}
                      disabled={updatingId === req.id}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs"
                    >
                      {STATUS_OPTIONS.filter((opt) => opt !== "all").map(
                        (option) => (
                          <option key={option} value={option}>
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
