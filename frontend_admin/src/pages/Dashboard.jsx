import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../api/api";
import { formatIsraelDate, getIsraelDateValue } from "../utils/datetime";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [resources, setResources] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [editModal, setEditModal] = useState({
    open: false,
    item: null,
  });
  const [selectedType, setSelectedType] = useState(null);
  const [editForm, setEditForm] = useState({
    id: null,
    name: "",
    type_id: "",
    metadata: {},
  });
  const [viewModal, setViewModal] = useState({
    open: false,
    item: null,
    bookings: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const [resourcesData, bookings, typeData] = await Promise.all([
          apiGet("/resources"),
          apiGet("/bookings"),
          apiGet("/resource-types"),
        ]);

        const today = getIsraelDateValue();

        // ממיינים הזמנות לפי היום
        const bookingsToday = bookings.filter(
          (b) => b.date.startsWith(today)
        );

        const pending = bookings.filter(
          (b) => b.status === "pending"
        );

        setStats({
          totalResources: resourcesData.length,
          bookingsToday: bookingsToday.length,
          pending: pending.length,
          totalBookings: bookings.length,
          totalResourceTypes: typeData.length,
        });
        setResources(resourcesData);
        setTypes(typeData);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;

  const filteredResources = useMemo(() => {
    if (!hasSearchQuery) return [];

    return resources.filter((r) => {
      const haystack = [
        r.id,
        r.name,
        r.type_name,
        JSON.stringify(r.metadata || {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearchQuery);
    });
  }, [hasSearchQuery, normalizedSearchQuery, resources]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!stats) return <p className="text-red-500">Failed to load data.</p>;

  function openEdit(resource) {
    const type = types.find((t) => t.id === Number(resource.type_id));
    setSelectedType(type || null);
    setEditForm({
      id: resource.id,
      name: resource.name || "",
      type_id: resource.type_id || "",
      metadata: resource.metadata || {},
    });
    setEditModal({ open: true, item: resource });
  }

  function handleEditTypeChange(typeId) {
    const type = types.find((t) => t.id === Number(typeId));
    setSelectedType(type || null);

    const meta = {};
    if (type && Array.isArray(type.fields)) {
      type.fields.forEach((f) => {
        const existing = editForm.metadata?.[f.name];
        meta[f.name] =
          existing !== undefined
            ? existing
            : f.default || (f.type === "boolean" ? false : "");
      });
    }

    setEditForm((prev) => ({
      ...prev,
      type_id: typeId,
      metadata: meta,
    }));
  }

  function handleEditMetadataChange(field, value) {
    setEditForm((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [field]: value },
    }));
  }

  async function saveEdit() {
    try {
      const payload = {
        name: editForm.name,
        type_id: Number(editForm.type_id),
        metadata: editForm.metadata,
      };

      const updated = await apiPut(
        `/resources/${editForm.id}`,
        payload
      );

      setResources((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setEditModal({ open: false, item: null });
    } catch (err) {
      console.error("Error updating resource:", err);
    }
  }

  function metadataSummary(metadata) {
    if (!metadata || Object.keys(metadata).length === 0) return "—";
    return Object.entries(metadata)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(", ");
  }

  function formatMetadataList(metadata) {
    if (!metadata || Object.keys(metadata).length === 0) return [];
    return Object.entries(metadata).map(
      ([key, value]) => `${key}: ${String(value)}`
    );
  }

  function formatDate(date) {
    if (!date) return "—";
    return formatIsraelDate(date);
  }

  async function openView(resource) {
    setViewModal({
      open: true,
      item: resource,
      bookings: [],
      loading: true,
      error: null,
    });

    try {
      const bookings = await apiGet(`/bookings?resource_id=${resource.id}`);
      setViewModal((prev) => ({
        ...prev,
        bookings,
        loading: false,
      }));
    } catch (err) {
      console.error("Error loading resource bookings:", err);
      setViewModal((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to load bookings.",
      }));
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-sky-100 bg-[linear-gradient(135deg,#ffffff,#f8fbff,#eef6ff)] p-6 shadow-[0_18px_45px_rgba(59,130,246,0.08)] sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Executive Overview
            </div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Dashboard</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              A clean operational snapshot of resources, activity, and booking volume across the system.
            </p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm">
            System overview updated from live resources and bookings.
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Total Resources" value={stats.totalResources} tone="blue" />
          <StatCard title="Resource Types" value={stats.totalResourceTypes} tone="sky" />
          <StatCard title="Bookings Today" value={stats.bookingsToday} tone="emerald" />
          <StatCard title="Pending Approvals" value={stats.pending} tone="amber" />
          <StatCard title="Total Bookings" value={stats.totalBookings} tone="violet" />
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Find Resources</h2>
            <div className="mt-1 text-sm text-slate-500">
              Search the resource inventory without overwhelming the page by default.
            </div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
            {hasSearchQuery
              ? `Showing ${filteredResources.length} of ${resources.length}`
              : `Search across ${resources.length} resources`}
          </div>
        </div>

        <div className="mb-5 rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
          <input
            type="text"
            placeholder="Search by name, type, id, or metadata..."
            className="w-full rounded-2xl border border-transparent bg-white px-5 py-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-200 focus:ring-4 focus:ring-sky-100"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[920px] w-full text-left">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Metadata</th>
                <th className="p-3 w-[170px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!hasSearchQuery && (
                <tr>
                  <td
                    colSpan="5"
                    className="px-6 py-16 text-center text-slate-500"
                  >
                    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8">
                      <div className="text-lg font-semibold text-slate-800">Search to reveal results</div>
                      <div className="mt-2 text-sm text-slate-500">
                        Start typing to search for a resource and keep the dashboard focused.
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {hasSearchQuery && filteredResources.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-3 text-slate-600">{r.id}</td>
                  <td className="p-3 font-semibold text-slate-900">{r.name}</td>
                  <td className="p-3">
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                      {r.type_name}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-slate-600">
                    {metadataSummary(r.metadata)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <button
                        onClick={() => openView(r)}
                        className="min-w-[72px] rounded-xl bg-slate-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                      >
                        View
                      </button>
                      <button
                        onClick={() => openEdit(r)}
                        className="min-w-[72px] rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {hasSearchQuery && filteredResources.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    className="p-10 text-center text-slate-500"
                  >
                    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8">
                      No resources match your search.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editModal.open && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg w-full max-w-[600px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Edit Resource – {editForm.name || "Untitled"}
            </h2>

            <label className="block mb-2 font-medium">Resource Name</label>
            <input
              type="text"
              className="w-full p-2 border rounded mb-4"
              value={editForm.name}
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
            />

            <label className="block mb-2 font-medium">Resource Type</label>
            <select
              className="w-full p-2 border rounded mb-4"
              value={editForm.type_id}
              onChange={(e) => handleEditTypeChange(e.target.value)}
            >
              <option value="">-- Select Type --</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            {selectedType &&
              selectedType.fields &&
              Array.isArray(selectedType.fields) && (
                <>
                  <h3 className="font-semibold mb-2">Resource Fields</h3>

                  {selectedType.fields.map((field, i) => (
                    <div key={i} className="mb-3">
                      <label className="block text-sm font-medium mb-1">
                        {field.name} ({field.type})
                      </label>

                      {field.type === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={editForm.metadata[field.name] || false}
                          onChange={(e) =>
                            handleEditMetadataChange(
                              field.name,
                              e.target.checked
                            )
                          }
                        />
                      ) : (
                        <input
                          type={field.type === "number" ? "number" : "text"}
                          className="w-full p-2 border rounded"
                          value={editForm.metadata[field.name] ?? ""}
                          onChange={(e) =>
                            handleEditMetadataChange(
                              field.name,
                              e.target.value
                            )
                          }
                        />
                      )}
                    </div>
                  ))}
                </>
              )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setEditModal({ open: false, item: null });
                  setSelectedType(null);
                }}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {viewModal.open && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg w-full max-w-[700px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Resource Details – {viewModal.item?.name || "Untitled"}
            </h2>

            <div className="text-sm text-gray-700 mb-4">
              <div>
                <strong>ID:</strong> {viewModal.item?.id}
              </div>
              {viewModal.item?.type_name && (
                <div>
                  <strong>Type:</strong> {viewModal.item.type_name}
                </div>
              )}
              {viewModal.item?.metadata &&
                Object.keys(viewModal.item.metadata).length > 0 && (
                  <div>
                    <strong>Metadata:</strong>{" "}
                    {metadataSummary(viewModal.item.metadata)}
                  </div>
                )}
            </div>

            <h3 className="font-semibold mb-2">Bookings</h3>

            {viewModal.loading && (
              <p className="text-gray-500">Loading bookings...</p>
            )}
            {viewModal.error && (
              <p className="text-red-600">{viewModal.error}</p>
            )}

            {!viewModal.loading && !viewModal.error && (
              <div className="space-y-4 max-h-[420px] overflow-auto pr-1">
                {viewModal.bookings.map((b) => (
                  <div key={b.id} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex flex-wrap justify-between gap-2 text-sm mb-3">
                      <div>
                        <strong>Booking ID:</strong> {b.id}
                      </div>
                      <div>
                        <strong>Date:</strong> {formatDate(b.date)}
                      </div>
                      {b.start_time && b.end_time && (
                        <div>
                          <strong>Time:</strong> {b.start_time} - {b.end_time}
                        </div>
                      )}
                      {b.user_id && (
                        <div>
                          <strong>User:</strong> {b.user_id}
                        </div>
                      )}
                    </div>

                    <div className="mb-3">
                      <div className="text-xs font-semibold text-gray-600 mb-1">
                        Resources
                      </div>
                      <div className="grid gap-2 text-sm">
                        {(b.resources || []).map((r) => (
                          <div key={r.id} className="border rounded p-2 bg-white">
                            <div className="font-medium">
                              {r.name}
                              {r.type_name && (
                                <span className="text-xs text-gray-500">
                                  {" "}
                                  ({r.type_name})
                                </span>
                              )}
                            </div>
                            {r.role && (
                              <div className="text-xs text-gray-500">
                                Role: {r.role}
                              </div>
                            )}
                            {formatMetadataList(r.metadata).length > 0 && (
                              <div className="text-xs text-gray-600 mt-1">
                                {formatMetadataList(r.metadata).map((line, idx) => (
                                  <div key={`${r.id}-${idx}`}>{line}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                ))}

                {viewModal.bookings.length === 0 && (
                  <div className="text-center p-4 text-gray-500">
                    No bookings for this resource.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() =>
                  setViewModal({
                    open: false,
                    item: null,
                    bookings: [],
                    loading: false,
                    error: null,
                  })
                }
                className="px-4 py-2 border rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, tone = "blue" }) {
  const tones = {
    blue: "border-blue-100 bg-white text-blue-600 shadow-blue-100/60",
    sky: "border-sky-100 bg-white text-sky-600 shadow-sky-100/60",
    emerald: "border-emerald-100 bg-white text-emerald-600 shadow-emerald-100/60",
    amber: "border-amber-100 bg-white text-amber-600 shadow-amber-100/60",
    violet: "border-violet-100 bg-white text-violet-600 shadow-violet-100/60",
  };

  return (
    <div className={`rounded-[24px] border p-5 shadow-[0_14px_30px] ${tones[tone] || tones.blue}`}>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-4xl font-black">{value}</p>
    </div>
  );
}
