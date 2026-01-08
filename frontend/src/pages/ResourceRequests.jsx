import { useEffect, useState } from "react";
import { apiGet, apiPut } from "../api/api";

const STATUS_OPTIONS = ["all", "pending", "approved", "rejected", "handled"];

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

export default function ResourceRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);

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
        <div className="flex items-center gap-3">
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

      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Resource</th>
              <th className="px-4 py-3 text-left font-semibold">Type</th>
              <th className="px-4 py-3 text-left font-semibold">Student</th>
              <th className="px-4 py-3 text-left font-semibold">Note</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-gray-500" colSpan={6}>
                  Loading requests...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-gray-500" colSpan={6}>
                  No requests found.
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="border-t">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {req.resource_name || `#${req.resource_id}`}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {req.resource_type || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {req.student_id}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {req.note}
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDateTime(req.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
