import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../api/api";
import { getOrgLabels } from "../orgConfig";
import {
  formatIsraelDate as formatDate,
  formatIsraelDateTime as formatDateTime,
  formatIsraelTime,
} from "../utils/datetime";

const STATUS_OPTIONS = ["all", "pending", "approved", "rejected", "handled"];

function formatTimeRange(start, end) {
  if (!start || !end) return "-";
  return `${formatIsraelTime(start)} - ${formatIsraelTime(end)}`;
}

export default function ResourceRequests() {
  const labels = getOrgLabels();
  const labelsLower = {
    user: String(labels.user || "").toLowerCase(),
    users: String(labels.users || "").toLowerCase(),
  };

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
        req.user_id,
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
    if (selectedResourceKey && !groupedRequests.some((group) => group.key === selectedResourceKey)) {
      setSelectedResourceKey(null);
    }
  }, [groupedRequests, selectedResourceKey]);

  useEffect(() => {
    if (searchQuery.trim()) {
      setSelectedResourceKey(null);
    }
  }, [searchQuery]);

  const selectedGroup = groupedRequests.find((group) => group.key === selectedResourceKey);

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
      <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f9fbff_0%,#eef5ff_52%,#ffffff_100%)] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              Review Inbox
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Resource Requests
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Review and respond to {labelsLower.user} resource requests with a cleaner queue and
              easier navigation between resources and request history.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search by resource, ${labelsLower.user}, note...`}
              className="min-w-[240px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
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
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-400"
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        {loading ? (
          <div className="px-6 py-8 text-sm text-slate-500">Loading requests...</div>
        ) : groupedRequests.length === 0 ? (
          <div className="px-6 py-10">
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <div className="text-lg font-semibold text-slate-800">No requests found</div>
              <div className="mt-2 text-sm text-slate-500">
                New resource requests will appear here once users start submitting them.
              </div>
            </div>
          </div>
        ) : !selectedGroup ? (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Resources Queue</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Pick a resource to review all related requests together.
                </p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                {groupedRequests.length} resources
              </div>
            </div>

            <div className="space-y-3">
              {groupedRequests.map((group) => {
                const pendingCount = group.requests.filter(
                  (req) => (req.status || "pending") === "pending"
                ).length;

                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setSelectedResourceKey(group.key)}
                    className="flex w-full items-center gap-4 rounded-[22px] border border-slate-200 bg-slate-50/70 px-5 py-5 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div className="flex-1">
                      <div className="text-base font-semibold text-slate-900">
                        {group.resource_name || `Resource #${group.resource_id}`}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {group.resource_type || "Resource"}
                      </div>
                    </div>
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      {group.requests.length} requests
                    </div>
                    {pendingCount > 0 && (
                      <span className="ml-auto inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-semibold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-5">
            <button
              type="button"
              onClick={() => setSelectedResourceKey(null)}
              className="mb-4 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700"
            >
              Back to resources
            </button>

            <div className="mb-5 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
              <div className="text-lg font-semibold text-slate-900">
                {selectedGroup.resource_name || `Resource #${selectedGroup.resource_id}`}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {selectedGroup.resource_type || "Resource"} · {selectedGroup.requests.length} requests
              </div>
            </div>

            <div className="grid gap-3">
              {selectedGroup.requests.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-wrap items-center gap-4 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="min-w-[220px]">
                    <div className="text-sm font-semibold text-slate-900">{req.user_id}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatDate(req.request_date)} · {formatTimeRange(req.start_time, req.end_time)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {formatDateTime(req.created_at)}
                    </div>
                  </div>

                  <div className="flex-1 text-sm text-slate-600">
                    {req.note || "No note provided."}
                  </div>

                  <div className="min-w-[150px]">
                    <select
                      value={req.status || "pending"}
                      onChange={(e) => updateStatus(req.id, e.target.value)}
                      disabled={updatingId === req.id}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
                    >
                      {STATUS_OPTIONS.filter((opt) => opt !== "all").map((option) => (
                        <option key={option} value={option}>
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
