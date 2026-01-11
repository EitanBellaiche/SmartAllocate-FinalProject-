import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [resources, setResources] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [userId, setUserId] = useState("");
  const [userBookings, setUserBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [assignDate, setAssignDate] = useState("");
  const [assignStartTime, setAssignStartTime] = useState("");
  const [assignEndTime, setAssignEndTime] = useState("");
  const [assignResources, setAssignResources] = useState([]);
  const [assignRoles, setAssignRoles] = useState({});
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignMessage, setAssignMessage] = useState("");

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

        // היום בפורמט YYYY-MM-DD
        const today = new Date().toISOString().split("T")[0];

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

  useEffect(() => {
    const trimmed = userQuery.trim();
    if (trimmed.length < 2) {
      setUserOptions([]);
      setUserError("");
      return;
    }
    let active = true;
    setUserLoading(true);
    setUserError("");
    apiGet(`/users?role=user&q=${encodeURIComponent(trimmed)}`)
      .then((data) => {
        if (!active) return;
        setUserOptions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!active) return;
        setUserError(err?.message || "Failed to load users");
      })
      .finally(() => {
        if (!active) return;
        setUserLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userQuery]);

  useEffect(() => {
    const id = String(userId || "").trim();
    if (!id) {
      setUserBookings([]);
      return;
    }
    let active = true;
    setBookingsLoading(true);
    apiGet(`/bookings?user_id=${encodeURIComponent(id)}&include_details=1`)
      .then((data) => {
        if (!active) return;
        setUserBookings(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setUserBookings([]);
      })
      .finally(() => {
        if (!active) return;
        setBookingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const filteredResources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return resources;

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

      return haystack.includes(query);
    });
  }, [resources, searchQuery]);

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

  function selectUser(user) {
    setSelectedUser(user);
    setUserId(String(user?.national_id || "").trim());
    setUserQuery(user?.full_name || user?.national_id || "");
    setUserOptions([]);
  }

  function toggleAssignResource(id) {
    if (assignResources.includes(id)) {
      setAssignResources(assignResources.filter((r) => r !== id));
      const updated = { ...assignRoles };
      delete updated[id];
      setAssignRoles(updated);
    } else {
      setAssignResources([...assignResources, id]);
    }
  }

  function updateAssignRole(id, value) {
    setAssignRoles((prev) => ({
      ...prev,
      [id]: value,
    }));
  }

  async function removeBooking(bookingId) {
    if (!bookingId) return;
    try {
      await apiDelete(`/bookings/${bookingId}`);
      const id = String(userId || "").trim();
      if (id) {
        const data = await apiGet(
          `/bookings?user_id=${encodeURIComponent(id)}&include_details=1`
        );
        setUserBookings(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setAssignMessage(err?.message || "Failed to delete booking.");
    }
  }

  async function submitAssignment() {
    if (!assignDate || !assignStartTime || !assignEndTime || assignResources.length === 0 || !userId) {
      setAssignMessage("❗ Please select date, time, user and at least one resource.");
      return;
    }
    setAssignSubmitting(true);
    setAssignMessage("");
    try {
      await apiPost("/bookings", {
        resources: assignResources,
        roles: assignRoles,
        date: assignDate,
        start_time: assignStartTime,
        end_time: assignEndTime,
        user_id: String(userId).trim(),
      });
      const data = await apiGet(
        `/bookings?user_id=${encodeURIComponent(userId)}&include_details=1`
      );
      setUserBookings(Array.isArray(data) ? data : []);
      setAssignResources([]);
      setAssignRoles({});
      setAssignDate("");
      setAssignStartTime("");
      setAssignEndTime("");
      if (!selectedUser) {
        setUserId("");
        setUserQuery("");
      }
      setAssignMessage("✔ Assignment created successfully!");
    } catch (err) {
      setAssignMessage(`❌ ${err?.message || "Failed to create assignment."}`);
    } finally {
      setAssignSubmitting(false);
    }
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
    return String(date).split("T")[0];
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
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <StatCard title="Total Resources" value={stats.totalResources} />
        <StatCard title="Resource Types" value={stats.totalResourceTypes} />
        <StatCard title="Bookings Today" value={stats.bookingsToday} />
        <StatCard title="Pending Approvals" value={stats.pending} />
        <StatCard title="Total Bookings" value={stats.totalBookings} />
      </div>

      <div className="mt-10">
        <h2 className="text-xl font-bold mb-1">Assign Resources to Users</h2>
        <p className="text-sm text-gray-600 mb-4">
          Search a user, review current assignments, and create new ones.
        </p>
        {assignMessage && (
          <div className="mb-4 p-2 bg-gray-800 text-white rounded">
            {assignMessage}
          </div>
        )}
        <div className="mb-4">
          <label className="block font-semibold mb-1">
            Find User (name, email, or national ID)
          </label>
          <input
            type="text"
            className="w-full p-3 border rounded-lg"
            value={userQuery}
            onChange={(e) => {
              setUserQuery(e.target.value);
              setSelectedUser(null);
              setUserId("");
            }}
            placeholder="Search by name, email, or national ID"
          />
          {userLoading && <div className="text-sm text-gray-500 mt-2">Loading users...</div>}
          {userError && <div className="text-sm text-red-600 mt-2">{userError}</div>}
          {userOptions.length > 0 && (
            <div className="border rounded mt-2 max-h-48 overflow-auto bg-white">
              {userOptions.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-gray-100"
                  onClick={() => selectUser(u)}
                >
                  {u.full_name || "User"} · {u.national_id} · {u.email}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 text-sm text-gray-600">
            Selected: {userId ? userId : "None"}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Current Assignments</h3>
          {bookingsLoading ? (
            <div className="text-sm text-gray-500">Loading assignments...</div>
          ) : userBookings.length === 0 ? (
            <div className="text-sm text-gray-500">No assignments for this user.</div>
          ) : (
            <div className="space-y-3">
              {userBookings.map((b) => (
                <div key={b.id} className="border rounded p-3 flex items-start justify-between">
                  <div>
                    <div className="font-semibold">
                      {b.date} · {b.start_time} - {b.end_time}
                    </div>
                    <div className="text-sm text-gray-600">
                      {(b.resources || [])
                        .map((r) => r?.name || "Resource")
                        .join(" / ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBooking(b.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Create Assignment</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-semibold mb-1">Date</label>
              <input
                type="date"
                className="border px-3 py-2 rounded w-full"
                value={assignDate}
                onChange={(e) => setAssignDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Start Time</label>
              <input
                type="time"
                className="border px-3 py-2 rounded w-full"
                value={assignStartTime}
                onChange={(e) => setAssignStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">End Time</label>
              <input
                type="time"
                className="border px-3 py-2 rounded w-full"
                value={assignEndTime}
                onChange={(e) => setAssignEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block font-semibold mb-2">Choose Resources</label>
            <div className="max-h-64 overflow-y-auto border rounded p-3 bg-white">
              {resources.map((r) => {
                const type = types.find((t) => t.id === r.type_id);
                const typeRoles = Array.isArray(type?.roles) ? type.roles : [];
                return (
                  <div key={r.id} className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={assignResources.includes(r.id)}
                        onChange={() => toggleAssignResource(r.id)}
                      />
                      <span>{r.name}</span>
                    </div>

                    {assignResources.includes(r.id) && typeRoles.length > 0 && (
                      <select
                        className="border rounded px-2 py-1"
                        value={assignRoles[r.id] || ""}
                        onChange={(e) => updateAssignRole(r.id, e.target.value)}
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

          <button
            onClick={submitAssignment}
            disabled={assignSubmitting}
            className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700 disabled:bg-gray-500"
          >
            {assignSubmitting ? "Creating assignment..." : "Create Assignment"}
          </button>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">Find Resources</h2>
          <div className="text-sm text-gray-500">
            Showing {filteredResources.length} of {resources.length}
          </div>
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name, type, id, or metadata..."
            className="w-full p-3 border rounded-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="bg-white shadow rounded-lg border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Metadata</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredResources.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.id}</td>
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3">{r.type_name}</td>
                  <td className="p-3 text-sm text-gray-600">
                    {metadataSummary(r.metadata)}
                  </td>
                  <td className="p-3 flex gap-2">
                    <button
                      onClick={() => openView(r)}
                      className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEdit(r)}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}

              {filteredResources.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    className="text-center p-5 text-gray-500"
                  >
                    No resources match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editModal.open && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[600px] shadow-xl">
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
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[700px] shadow-xl">
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

function StatCard({ title, value }) {
  return (
    <div className="p-5 bg-white shadow rounded-lg border border-gray-200">
      <p className="text-gray-500 text-sm">{title}</p>
      <p className="text-3xl font-bold text-blue-600">{value}</p>
    </div>
  );
}
