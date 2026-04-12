import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../api/api";
import { getOrgConfig, getOrgLabels } from "../orgConfig";
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
  const config = getOrgConfig();
  const theme = config.theme;
  const isCinema = config.domain === "cinema";
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
      <section className={`rounded-[28px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8 ${theme.heroDark}`}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${theme.heroEyebrow}`}>
              Review Inbox
            </div>
            <h1 className={`mt-4 text-3xl font-semibold tracking-tight ${isCinema ? "text-white" : theme.textStrong} sm:text-4xl`}>
              Resource Requests
            </h1>
            <p className={`mt-2 text-sm leading-6 ${isCinema ? theme.textSoft : theme.textSoft} sm:text-base`}>
              Review and respond to {labelsLower.user} resource requests with a cleaner queue and
              easier navigation between resources and request history.
            </p>
          </div>

          <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 shadow-sm ${theme.panelSoft}`}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search by resource, ${labelsLower.user}, note...`}
              className={`min-w-[240px] rounded-xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`rounded-xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
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
              className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${theme.buttonPrimary} disabled:bg-slate-400`}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${theme.buttonDanger.replace("bg-red-600 hover:bg-red-700 text-white", "border-red-200 bg-red-50 text-red-700").replace("bg-red-700 hover:bg-red-800 text-white", "border-red-200 bg-red-50 text-red-700")}`}>
          {error}
        </div>
      )}

      <section className={`overflow-hidden rounded-[28px] border shadow-[0_18px_45px_rgba(15,23,42,0.08)] ${theme.card}`}>
        {loading ? (
          <div className={`px-6 py-8 text-sm ${theme.textSoft}`}>Loading requests...</div>
        ) : groupedRequests.length === 0 ? (
          <div className="px-6 py-10">
            <div className={`rounded-[24px] border border-dashed px-6 py-10 text-center ${theme.modalSurface}`}>
              <div className={`text-lg font-semibold ${theme.textStrong}`}>No requests found</div>
              <div className={`mt-2 text-sm ${theme.textSoft}`}>
                New resource requests will appear here once users start submitting them.
              </div>
            </div>
          </div>
        ) : !selectedGroup ? (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className={`text-xl font-semibold ${theme.textStrong}`}>Resources Queue</h2>
                <p className={`mt-1 text-sm ${theme.textSoft}`}>
                  Pick a resource to review all related requests together.
                </p>
              </div>
              <div className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${theme.tagMuted}`}>
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
                    className={`flex w-full items-center gap-4 rounded-[22px] border px-5 py-5 text-left transition hover:bg-white ${theme.modalSurface}`}
                  >
                    <div className="flex-1">
                      <div className={`text-base font-semibold ${theme.textStrong}`}>
                        {group.resource_name || `Resource #${group.resource_id}`}
                      </div>
                      <div className={`mt-1 text-sm ${theme.textSoft}`}>
                        {group.resource_type || "Resource"}
                      </div>
                    </div>
                    <div className={`text-xs font-medium uppercase tracking-[0.16em] ${theme.modalMuted}`}>
                      {group.requests.length} requests
                    </div>
                    {pendingCount > 0 && (
                      <span className={`ml-auto inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${theme.buttonDanger}`}>
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
              className={`mb-4 inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold ${theme.buttonGhost}`}
            >
              Back to resources
            </button>

            <div className={`mb-5 rounded-[24px] border p-5 ${theme.modalSurface}`}>
              <div className={`text-lg font-semibold ${theme.textStrong}`}>
                {selectedGroup.resource_name || `Resource #${selectedGroup.resource_id}`}
              </div>
              <div className={`mt-1 text-sm ${theme.textSoft}`}>
                {selectedGroup.resource_type || "Resource"} · {selectedGroup.requests.length} requests
              </div>
            </div>

            <div className="grid gap-3">
              {selectedGroup.requests.map((req) => (
                <div
                  key={req.id}
                  className={`flex flex-wrap items-center gap-4 rounded-[22px] border p-5 shadow-sm ${theme.card}`}
                >
                  <div className="min-w-[220px]">
                    <div className={`text-sm font-semibold ${theme.textStrong}`}>{req.user_id}</div>
                    <div className={`mt-1 text-xs ${theme.textSoft}`}>
                      {formatDate(req.request_date)} · {formatTimeRange(req.start_time, req.end_time)}
                    </div>
                    <div className={`mt-1 text-xs ${theme.modalMuted}`}>
                      {formatDateTime(req.created_at)}
                    </div>
                  </div>

                  <div className={`flex-1 text-sm ${theme.textSoft}`}>
                    {req.note || "No note provided."}
                  </div>

                  <div className="min-w-[150px]">
                    <select
                      value={req.status || "pending"}
                      onChange={(e) => updateStatus(req.id, e.target.value)}
                      disabled={updatingId === req.id}
                      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${theme.input}`}
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
