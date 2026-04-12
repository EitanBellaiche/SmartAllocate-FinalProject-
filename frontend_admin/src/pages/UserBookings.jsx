import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut, getAdminSession, setAdminSession } from "../api/api";
import { getOrgConfig } from "../orgConfig";

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

function formatUserType(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized === "responsible") return "Responsible";
  if (normalized === "user") return "User";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
  const [resourceSearch, setResourceSearch] = useState("");
  const activeBookings = useMemo(
    () => userBookings.filter((booking) => !booking?.cancelled_at),
    [userBookings]
  );
  const cancelledCount = userBookings.length - activeBookings.length;
  const selectedUser = useMemo(() => {
    const id = String(userId || "").trim();
    if (!id) return null;
    return userOptions.find((user) => String(user?.national_id || "").trim() === id) || null;
  }, [userId, userOptions]);
  const filteredAssignableResources = useMemo(() => {
    const query = resourceSearch.trim().toLowerCase();
    return resources.filter((resource) => {
      if (!query) return true;
      const type = resourceTypes.find((item) => item.id === resource.type_id);
      const haystack = [
        resource.name,
        resource.type_name,
        type?.name,
        JSON.stringify(resource.metadata || {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [resourceSearch, resourceTypes, resources]);

  const config = getOrgConfig();
  const theme = config.theme;
  const isCinema = config.domain === "cinema";

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
    <div className="space-y-6">
      <section className={`overflow-visible rounded-[28px] border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-6 ${theme.heroDark}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <div className={`mb-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${theme.heroEyebrow}`}>
              Admin Review
            </div>
            <h1 className={`text-3xl font-black tracking-tight ${isCinema ? "text-white" : theme.textStrong}`}>
              User Bookings
            </h1>
            <p className={`mt-2 text-sm leading-6 ${theme.textSoft}`}>
              Review one user at a time, inspect their active bookings, and manage the
              resources assigned to them from one place.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-3 lg:max-w-[560px]">
            <MetricCard label="Active Bookings" value={activeBookings.length} tone="blue" theme={theme} />
            <MetricCard label="Cancelled" value={cancelledCount} tone="slate" theme={theme} />
            <MetricCard label="Assigned Resources" value={assignedResources.length} tone="emerald" theme={theme} />
          </div>
        </div>

        <div className={`mt-5 rounded-[22px] border p-3.5 shadow-sm backdrop-blur sm:p-4 ${theme.panelSoft}`}>
          <label className={`mb-2 block text-sm font-semibold ${isCinema ? "text-slate-100" : theme.textStrong}`}>
            Find User
          </label>
          <div className="relative">
            <input
              type="text"
              className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
              value={userQuery}
              onChange={(e) => {
                setUserQuery(e.target.value);
                setUserId("");
              }}
              placeholder="Search by name, email, or national ID"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              Selected: {userId ? userId : "None"}
            </div>
            {selectedUser?.full_name && (
              <div className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                {selectedUser.full_name}
              </div>
            )}
            {selectedUser?.email && (
              <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                {selectedUser.email}
              </div>
            )}
            {selectedUser?.role && (
              <div className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700">
                {formatUserType(selectedUser.role)}
              </div>
            )}
          </div>

          {userLoading && <div className="mt-3 text-sm text-slate-500">Loading users...</div>}
          {userError && (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {userError}
            </div>
          )}
          {userOptions.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="max-h-56 overflow-auto">
                {userOptions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition last:border-b-0 hover:bg-slate-50"
                    onClick={() => selectUser(u)}
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{u.full_name || "User"}</div>
                      <div className="text-sm text-slate-500">
                        {u.email || "No email"}
                        {u.role ? ` · ${formatUserType(u.role)}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-slate-500">{u.national_id}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <section className={`rounded-[24px] border p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] ${theme.card}`}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className={`text-xl font-bold ${theme.textStrong}`}>Current Bookings</h3>
              <p className={`mt-1 text-sm ${theme.textSoft}`}>
                Active reservations for the selected user.
              </p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
              {activeBookings.length} active
            </div>
          </div>

          {bookingsLoading ? (
            <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
              Loading bookings...
            </div>
          ) : activeBookings.length === 0 ? (
            <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
              {cancelledCount > 0
                ? "No active bookings. Some bookings were cancelled."
                : "No bookings for this user."}
            </div>
          ) : (
            <div className="space-y-4">
              {activeBookings.map((b) => (
                <article
                  key={b.id}
                  className={`rounded-2xl border p-3.5 shadow-sm ${theme.modalSurface}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className={`text-base font-bold ${theme.textStrong}`}>
                        {formatDateValue(b.date)}
                      </div>
                      <div className={`mt-1 text-sm font-medium ${theme.textStrong}`}>
                        {b.start_time} - {b.end_time}
                      </div>
                    </div>
                    <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${theme.tag}`}>
                      Booking #{b.id}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(b.resources || []).map((r, index) => (
                      <span
                        key={`${b.id}-${r?.id || index}`}
                        className={`rounded-full border px-3 py-1 text-xs ${theme.tagMuted}`}
                      >
                        {r?.name || "Resource"}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className={`rounded-[24px] border p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] ${theme.card}`}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className={`text-xl font-bold ${theme.textStrong}`}>Assigned Resources</h3>
                <p className={`mt-1 text-sm ${theme.textSoft}`}>
                  Resources already linked to this user.
                </p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.highlightTag}`}>
                {assignedResources.length} assigned
              </div>
            </div>

            {userId ? (
              assignedResources.length === 0 ? (
                <div className={`rounded-2xl border border-dashed px-4 py-7 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
                  No assigned resources.
                </div>
              ) : (
                <div className="space-y-3">
                  {assignedResources.map((r) => {
                    const type = resourceTypes.find((t) => t.id === r.type_id);
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 ${theme.modalSurface}`}
                      >
                        <div>
                          <div className={`font-semibold ${theme.textStrong}`}>{r.name}</div>
                          <div className={`text-[11px] uppercase tracking-[0.14em] ${theme.textSoft}`}>
                            {type?.name || r.type_name || ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAssignedResource(r)}
                          disabled={savingResources}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${theme.buttonDanger} disabled:bg-slate-300`}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className={`rounded-2xl border border-dashed px-4 py-7 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
                Select a user to see assigned resources.
              </div>
            )}
          </div>

          <div className={`rounded-[24px] border p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] ${theme.card}`}>
            <div className="mb-4">
              <h3 className={`text-xl font-bold ${theme.textStrong}`}>Assign Resources</h3>
              <p className={`mt-1 text-sm ${theme.textSoft}`}>
                Search and select resources to update this user's access.
              </p>
            </div>

            {resourceMessage && (
              <div
                className={`mb-4 rounded-2xl px-4 py-3 text-sm font-medium ${
                  resourceMessage.includes("Failed") || resourceMessage.includes("❌")
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {resourceMessage}
              </div>
            )}

            <div className="mb-4">
              <input
                type="text"
                value={resourceSearch}
                onChange={(e) => setResourceSearch(e.target.value)}
                placeholder="Search resources by name, type, or metadata..."
                className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                disabled={!userId}
              />
            </div>

            <div className={`mb-4 max-h-[360px] overflow-y-auto rounded-2xl border p-2.5 ${theme.modalSurface}`}>
              <div className="grid gap-3">
                {filteredAssignableResources.map((r) => {
                  const type = resourceTypes.find((t) => t.id === r.type_id);
                  const checked = selectedResourceIds.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-2.5 transition ${
                        checked
                          ? `${theme.highlightTag} shadow-sm`
                          : `${theme.card} hover:border-slate-300`
                      } ${!userId ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleResource(r.id)}
                        disabled={!userId}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <div className="min-w-0">
                        <div className={`font-semibold ${theme.textStrong}`}>{r.name}</div>
                        <div className={`mt-1 text-[11px] uppercase tracking-[0.14em] ${theme.textSoft}`}>
                          {type?.name || r.type_name || "Resource"}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {filteredAssignableResources.length === 0 && (
                  <div className={`rounded-2xl border border-dashed px-4 py-7 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                    {resources.length === 0
                      ? "No resources found."
                      : "No resources match your search."}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={saveUserResources}
              disabled={!userId || savingResources}
              className={`inline-flex items-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${theme.buttonPrimary} disabled:bg-slate-300`}
            >
              {savingResources ? "Saving..." : "Save User Resources"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone, theme }) {
  const tones = {
    blue: theme.tag,
    slate: theme.tagMuted,
    emerald: theme.highlightTag,
  };

  return (
    <div className={`rounded-2xl border px-4 py-2.5 ${tones[tone] || tones.slate}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</div>
      <div className="mt-1.5 text-2xl font-black">{value}</div>
    </div>
  );
}
