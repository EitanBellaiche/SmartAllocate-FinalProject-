import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut, getAdminSession, setAdminSession } from "../api/api";

function formatDateValue(dateStr) {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function UserBookings() {
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userId, setUserId] = useState("");
  const [userBookings, setUserBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState([]);
  const [assignedResources, setAssignedResources] = useState([]);
  const [savingResources, setSavingResources] = useState(false);
  const [resourceMessage, setResourceMessage] = useState("");
  const activeBookings = useMemo(
    () => userBookings.filter((booking) => !booking?.cancelled_at),
    [userBookings]
  );
  const cancelledCount = userBookings.length - activeBookings.length;

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
    apiGet(`/users?q=${encodeURIComponent(trimmed)}`)
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

  useEffect(() => {
    let active = true;
    apiGet("/resources")
      .then((data) => {
        if (!active) return;
        setResources(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setResources([]);
      });
    apiGet("/resource-types")
      .then((data) => {
        if (!active) return;
        setResourceTypes(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setResourceTypes([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const id = String(userId || "").trim();
    if (!id) {
      setSelectedResourceIds([]);
      setAssignedResources([]);
      return;
    }
    const assigned = resources
      .filter((r) => {
        const meta = r?.metadata || {};
        const list = Array.isArray(meta.user_ids)
          ? meta.user_ids
          : typeof meta.user_ids === "string"
          ? meta.user_ids.split(/[\s,]+/)
          : [];
        return list.map((v) => String(v).trim()).includes(id);
      })
      .map((r) => r.id);
    setSelectedResourceIds(assigned);
    setAssignedResources(resources.filter((r) => assigned.includes(r.id)));
  }, [userId, resources]);

  function selectUser(user) {
    const existing = getAdminSession() || {};
    const existingOrg = String(existing?.organization_id || "").trim();
    const nextOrg = String(user?.organization_id || "").trim();
    if (!existingOrg && nextOrg) {
      setAdminSession({ ...existing, organization_id: nextOrg });
    }
    setUserId(String(user?.national_id || "").trim());
    setUserQuery(user?.full_name || user?.national_id || "");
    setUserOptions([]);
    setResourceMessage("");
  }

  function toggleResource(id) {
    setSelectedResourceIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  async function saveUserResources() {
    const id = String(userId || "").trim();
    if (!id) return;
    setSavingResources(true);
    setResourceMessage("");

    try {
      await Promise.all(
        resources.map(async (resource) => {
          const meta =
            resource.metadata && typeof resource.metadata === "object"
              ? { ...resource.metadata }
              : {};
          const currentList = Array.isArray(meta.user_ids)
            ? meta.user_ids.map((v) => String(v).trim()).filter(Boolean)
            : typeof meta.user_ids === "string"
            ? meta.user_ids.split(/[\s,]+/).map((v) => String(v).trim()).filter(Boolean)
            : [];

          const wants = selectedResourceIds.includes(resource.id);
          const nextSet = new Set(currentList);
          if (wants) nextSet.add(id);
          else nextSet.delete(id);

          const nextList = Array.from(nextSet);
          if (
            nextList.length === currentList.length &&
            nextList.every((v) => currentList.includes(v))
          ) {
            return;
          }

          meta.user_ids = nextList;
          meta.users = nextList.length;

          await apiPut(`/resources/${resource.id}`, {
            name: resource.name,
            type_id: resource.type_id,
            metadata: meta,
          });
        })
      );

      const refreshed = await apiGet("/resources");
      setResources(Array.isArray(refreshed) ? refreshed : []);
      setResourceMessage("✅ Resources updated for this user.");
    } catch (err) {
      setResourceMessage(`❌ ${err?.message || "Failed to update resources."}`);
    } finally {
      setSavingResources(false);
    }
  }

  async function removeAssignedResource(resource) {
    const id = String(userId || "").trim();
    if (!id || !resource) return;
    setSavingResources(true);
    setResourceMessage("");
    try {
      const meta =
        resource.metadata && typeof resource.metadata === "object"
          ? { ...resource.metadata }
          : {};
      const currentList = Array.isArray(meta.user_ids)
        ? meta.user_ids.map((v) => String(v).trim()).filter(Boolean)
        : typeof meta.user_ids === "string"
        ? meta.user_ids.split(/[\s,]+/).map((v) => String(v).trim()).filter(Boolean)
        : [];
      const nextList = currentList.filter((v) => v !== id);
      meta.user_ids = nextList;
      meta.users = nextList.length;

      await apiPut(`/resources/${resource.id}`, {
        name: resource.name,
        type_id: resource.type_id,
        metadata: meta,
      });

      setAssignedResources((prev) => prev.filter((r) => r.id !== resource.id));
      setSelectedResourceIds((prev) => prev.filter((rid) => rid !== resource.id));
      setResourceMessage("✅ Resource removed from this user.");
    } catch (err) {
      setResourceMessage(`❌ ${err?.message || "Failed to remove resource."}`);
    } finally {
      setSavingResources(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">User Bookings</h1>
      <p className="text-sm text-gray-600 mb-4">
        Search a user to review their bookings.
      </p>

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
                {u.full_name || "User"} | {u.national_id} | {u.email}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 text-sm text-gray-600">
          Selected: {userId ? userId : "None"}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Current Bookings</h3>
        {bookingsLoading ? (
          <div className="text-sm text-gray-500">Loading bookings...</div>
        ) : activeBookings.length === 0 ? (
          <div className="text-sm text-gray-500">
            {cancelledCount > 0
              ? "No active bookings. Some bookings were cancelled."
              : "No bookings for this user."}
          </div>
        ) : (
          <div className="space-y-3">
            {activeBookings.map((b) => (
              <div key={b.id} className="border rounded p-3">
                <div>
                  <div className="font-semibold">
                    {formatDateValue(b.date)} | {b.start_time} - {b.end_time}
                  </div>
                  <div className="text-sm text-gray-600">
                    {(b.resources || [])
                      .map((r) => r?.name || "Resource")
                      .join(" / ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Assigned Resources</h3>
        {userId ? (
          assignedResources.length === 0 ? (
            <div className="text-sm text-gray-500">No assigned resources.</div>
          ) : (
            <div className="space-y-2">
              {assignedResources.map((r) => {
                const type = resourceTypes.find((t) => t.id === r.type_id);
                return (
                  <div key={r.id} className="border rounded p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">
                        {type?.name || r.type_name || ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAssignedResource(r)}
                      disabled={savingResources}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="text-sm text-gray-500">Select a user to see assigned resources.</div>
        )}
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Assign Resources to User</h3>
        <p className="text-sm text-gray-600 mb-3">
          Select resources the user belongs to. This updates each resource's user list.
        </p>
        {resourceMessage && (
          <div className="mb-3 text-sm">{resourceMessage}</div>
        )}
        <div className="max-h-64 overflow-y-auto border rounded p-3 mb-3 bg-white">
          {resources.map((r) => {
            const type = resourceTypes.find((t) => t.id === r.type_id);
            return (
              <label key={r.id} className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={selectedResourceIds.includes(r.id)}
                  onChange={() => toggleResource(r.id)}
                  disabled={!userId}
                />
                <span>{r.name}</span>
                <span className="text-xs text-gray-500">
                  {type?.name || r.type_name || ""}
                </span>
              </label>
            );
          })}
          {resources.length === 0 && (
            <div className="text-sm text-gray-500">No resources found.</div>
          )}
        </div>
        <button
          type="button"
          onClick={saveUserResources}
          disabled={!userId || savingResources}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {savingResources ? "Saving..." : "Save User Resources"}
        </button>
      </div>
    </div>
  );
}
