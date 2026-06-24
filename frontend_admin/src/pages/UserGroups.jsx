import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";
import { getOrgConfig } from "../orgConfig";

function emptyDraft() {
  return {
    name: "",
    description: "",
  };
}

function normalizeMembers(group) {
  return Array.isArray(group?.members) ? group.members : [];
}

function parseNationalIds(raw) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export default function UserGroups() {
  const config = getOrgConfig();
  const theme = config.theme;
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [bulkIdsText, setBulkIdsText] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    const selectedGroup = groups.find((group) => Number(group.id) === Number(selectedGroupId)) || null;
    setDraft(
      selectedGroup
        ? {
            name: String(selectedGroup.name || ""),
            description: String(selectedGroup.description || ""),
          }
        : emptyDraft()
    );
  }, [groups, selectedGroupId]);

  useEffect(() => {
    const trimmed = userQuery.trim();
    if (trimmed.length < 2) {
      setUserResults([]);
      return;
    }
    let active = true;
    setUserLoading(true);
    apiGet(`/users?q=${encodeURIComponent(trimmed)}`)
      .then((data) => {
        if (!active) return;
        setUserResults(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setUserResults([]);
      })
      .finally(() => {
        if (!active) return;
        setUserLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userQuery]);

  const selectedGroup = useMemo(
    () => groups.find((group) => Number(group.id) === Number(selectedGroupId)) || null,
    [groups, selectedGroupId]
  );
  const selectedMembers = normalizeMembers(selectedGroup);
  const selectedMemberIds = new Set(selectedMembers.map((user) => Number(user?.id)).filter(Number.isFinite));

  async function loadGroups(nextSelectedId = null) {
    try {
      setLoading(true);
      const data = await apiGet("/user-groups");
      const nextGroups = Array.isArray(data) ? data : [];
      setGroups(nextGroups);
      const preferredId = nextSelectedId !== null ? Number(nextSelectedId) : Number(selectedGroupId);
      if (preferredId && nextGroups.some((group) => Number(group.id) === preferredId)) {
        setSelectedGroupId(preferredId);
      } else {
        setSelectedGroupId(nextGroups[0]?.id ?? null);
      }
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to load user groups.");
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    const name = String(draft.name || "").trim();
    if (!name) {
      setMessageTone("error");
      setMessage("Group name is required.");
      return;
    }
    try {
      setCreating(true);
      const created = await apiPost("/user-groups", {
        name,
        description: String(draft.description || "").trim(),
      });
      setMessageTone("success");
      setMessage(`Group ${created?.name || name} created.`);
      await loadGroups(created?.id ?? null);
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to create group.");
    } finally {
      setCreating(false);
    }
  }

  async function saveGroup() {
    if (!selectedGroup?.id) return;
    const name = String(draft.name || "").trim();
    if (!name) {
      setMessageTone("error");
      setMessage("Group name is required.");
      return;
    }
    try {
      setSaving(true);
      const updated = await apiPut(`/user-groups/${selectedGroup.id}`, {
        name,
        description: String(draft.description || "").trim(),
      });
      setGroups((prev) =>
        prev.map((group) => (Number(group.id) === Number(updated.id) ? updated : group))
      );
      setMessageTone("success");
      setMessage(`Group ${updated?.name || name} updated.`);
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to save group.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(group) {
    if (!group?.id) return;
    const confirmed = window.confirm(`Delete group "${group.name}"?`);
    if (!confirmed) return;
    try {
      setSaving(true);
      await apiDelete(`/user-groups/${group.id}`);
      setMessageTone("success");
      setMessage(`Group ${group.name} deleted.`);
      await loadGroups();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to delete group.");
    } finally {
      setSaving(false);
    }
  }

  async function replaceMembers(nextMembers) {
    if (!selectedGroup?.id) return;
    try {
      setSaving(true);
      const updated = await apiPut(`/user-groups/${selectedGroup.id}/members`, {
        user_ids: nextMembers.map((user) => Number(user.id)).filter(Number.isFinite),
      });
      setGroups((prev) =>
        prev.map((group) => (Number(group.id) === Number(updated.id) ? updated : group))
      );
      setMessageTone("success");
      setMessage(`Members updated for ${updated?.name || selectedGroup.name}.`);
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to update group members.");
    } finally {
      setSaving(false);
    }
  }

  function addMember(user) {
    if (!selectedGroup?.id || !user?.id) return;
    if (selectedMemberIds.has(Number(user.id))) return;
    replaceMembers([...selectedMembers, user]);
  }

  function removeMember(userId) {
    if (!selectedGroup?.id) return;
    replaceMembers(selectedMembers.filter((user) => Number(user.id) !== Number(userId)));
  }

  async function addPastedIds() {
    if (!selectedGroup?.id) return;
    const nationalIds = parseNationalIds(bulkIdsText);
    if (nationalIds.length === 0) {
      setMessageTone("error");
      setMessage("Paste at least one ID first.");
      return;
    }

    try {
      setBulkAdding(true);
      const result = await apiPost("/users/bulk-lookup", {
        national_ids: nationalIds,
      });
      const matchedUsers = Array.isArray(result?.matched_users) ? result.matched_users : [];
      const missingIds = Array.isArray(result?.missing_national_ids) ? result.missing_national_ids : [];

      const mergedMembers = [...selectedMembers];
      const seenIds = new Set(selectedMembers.map((user) => Number(user?.id)).filter(Number.isFinite));
      for (const user of matchedUsers) {
        const numericId = Number(user?.id);
        if (!Number.isFinite(numericId) || seenIds.has(numericId)) continue;
        seenIds.add(numericId);
        mergedMembers.push(user);
      }

      if (mergedMembers.length !== selectedMembers.length) {
        await replaceMembers(mergedMembers);
      }

      const addedCount = mergedMembers.length - selectedMembers.length;
      if (addedCount > 0 && missingIds.length > 0) {
        setMessageTone("success");
        setMessage(
          `Added ${addedCount} users to ${selectedGroup.name}. ${missingIds.length} IDs were not found: ${missingIds.slice(0, 8).join(", ")}${missingIds.length > 8 ? "..." : ""}`
        );
      } else if (addedCount > 0) {
        setMessageTone("success");
        setMessage(`Added ${addedCount} users to ${selectedGroup.name}.`);
      } else if (missingIds.length > 0) {
        setMessageTone("error");
        setMessage(
          `No new users were added. ${missingIds.length} IDs were not found: ${missingIds.slice(0, 8).join(", ")}${missingIds.length > 8 ? "..." : ""}`
        );
      } else {
        setMessageTone("info");
        setMessage("All pasted IDs are already in this group.");
      }
      setBulkIdsText("");
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to add pasted IDs.");
    } finally {
      setBulkAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={`overflow-hidden rounded-[28px] border p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ${theme.heroDark}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${theme.heroEyebrow}`}>
              Generic grouping
            </div>
            <h1 className={`mt-4 text-3xl font-black tracking-tight ${theme.textStrong}`}>
              User Groups
            </h1>
            <p className={`mt-2 text-sm leading-6 ${theme.textSoft}`}>
              Create reusable user groups for any purpose: year cohorts, operating-room participants,
              workshop attendees, departments, or ad-hoc working sets.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
            <MetricCard label="Groups" value={groups.length} tone={theme.tag} />
            <MetricCard
              label="Members"
              value={groups.reduce((sum, group) => sum + Number(group?.member_count || 0), 0)}
              tone={theme.highlightTag}
            />
            <MetricCard
              label="Selected"
              value={selectedGroup ? Number(selectedGroup.member_count || 0) : 0}
              tone={theme.tagMuted}
            />
          </div>
        </div>
      </section>

      {message && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
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

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className={`rounded-[24px] border p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] ${theme.card}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className={`text-xl font-bold ${theme.textStrong}`}>All groups</h3>
              <p className={`mt-1 text-sm ${theme.textSoft}`}>
                Pick an existing group or create a new generic group.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedGroupId(null);
                setDraft(emptyDraft());
                setMessage("");
              }}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${theme.buttonGhost}`}
            >
              New group
            </button>
          </div>

          <div className="space-y-3">
            <div className={`rounded-2xl border p-4 ${theme.modalSurface}`}>
              <label className="block">
                <div className={`mb-2 text-sm font-semibold ${theme.textStrong}`}>Group name</div>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                  placeholder="Examples: Software Engineering Year B, OR Session Participants"
                />
              </label>
              <label className="mt-4 block">
                <div className={`mb-2 text-sm font-semibold ${theme.textStrong}`}>Description</div>
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                  placeholder="Optional context for what this group is used for."
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                {selectedGroup ? (
                  <>
                    <button
                      type="button"
                      onClick={saveGroup}
                      disabled={saving}
                      className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${theme.buttonPrimary} disabled:bg-slate-300`}
                    >
                      {saving ? "Saving..." : "Save group"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGroup(selectedGroup)}
                      disabled={saving}
                      className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${theme.buttonDanger} disabled:bg-slate-300`}
                    >
                      Delete group
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={createGroup}
                    disabled={creating}
                    className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${theme.buttonPrimary} disabled:bg-slate-300`}
                  >
                    {creating ? "Creating..." : "Create group"}
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
                  Loading groups...
                </div>
              ) : groups.length === 0 ? (
                <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
                  No groups yet. Create the first one.
                </div>
              ) : (
                groups.map((group) => {
                  const active = Number(group.id) === Number(selectedGroupId);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(group.id);
                        setMessage("");
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        active
                          ? `${theme.highlightTag} shadow-sm`
                          : `${theme.modalSurface} hover:border-slate-300`
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`text-base font-bold ${theme.textStrong}`}>{group.name}</div>
                          {group.description && (
                            <div className={`mt-1 text-sm ${theme.textSoft}`}>{group.description}</div>
                          )}
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
                          {Number(group.member_count || 0)} members
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className={`rounded-[24px] border p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] ${theme.card}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className={`text-xl font-bold ${theme.textStrong}`}>Members</h3>
              <p className={`mt-1 text-sm ${theme.textSoft}`}>
                Add or remove users from the selected group.
              </p>
            </div>
            {selectedGroup && (
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.highlightTag}`}>
                {selectedMembers.length} linked
              </div>
            )}
          </div>

          {!selectedGroup ? (
            <div className={`rounded-2xl border border-dashed px-4 py-10 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
              Select a group to manage its members.
            </div>
          ) : (
            <div className="space-y-5">
              <div className={`rounded-2xl border p-4 ${theme.modalSurface}`}>
                <div className={`text-sm font-semibold ${theme.textStrong}`}>Search users to add</div>
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search by name, email, or ID"
                  className={`mt-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                />
                <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {userLoading ? (
                    <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                      Loading users...
                    </div>
                  ) : userQuery.trim().length < 2 ? (
                    <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                      Type at least 2 characters to search users.
                    </div>
                  ) : userResults.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                      No users match your search.
                    </div>
                  ) : (
                    userResults.map((user) => {
                      const isLinked = selectedMemberIds.has(Number(user.id));
                      return (
                        <div
                          key={user.id}
                          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${theme.card}`}
                        >
                          <div>
                            <div className={`font-semibold ${theme.textStrong}`}>{user.full_name || "User"}</div>
                            <div className={`text-sm ${theme.textSoft}`}>
                              {user.national_id || "No ID"}
                              {user.email ? ` · ${user.email}` : ""}
                              {user.department ? ` · ${user.department}` : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addMember(user)}
                            disabled={saving || isLinked}
                            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                              isLinked ? theme.tagMuted : theme.buttonSecondary
                            } disabled:cursor-not-allowed disabled:opacity-70`}
                          >
                            {isLinked ? "Already added" : "Add"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${theme.modalSurface}`}>
                <div className={`text-sm font-semibold ${theme.textStrong}`}>Paste many IDs at once</div>
                <p className={`mt-1 text-sm ${theme.textSoft}`}>
                  Paste IDs separated by commas, spaces, or new lines. Only users found in the current organization will be added.
                </p>
                <textarea
                  rows={8}
                  value={bulkIdsText}
                  onChange={(e) => setBulkIdsText(e.target.value)}
                  placeholder={"971010001,\n971010002,\n971010003"}
                  className={`mt-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className={`text-xs ${theme.textSoft}`}>
                    Parsed IDs: {parseNationalIds(bulkIdsText).length}
                  </div>
                  <button
                    type="button"
                    onClick={addPastedIds}
                    disabled={bulkAdding || saving}
                    className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary} disabled:bg-slate-300`}
                  >
                    {bulkAdding ? "Adding..." : "Add pasted IDs"}
                  </button>
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${theme.modalSurface}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className={`text-sm font-semibold ${theme.textStrong}`}>Current group members</div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
                    {selectedMembers.length}
                  </div>
                </div>
                {selectedMembers.length === 0 ? (
                  <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                    No members in this group yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedMembers.map((user) => (
                      <div
                        key={user.id}
                        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${theme.card}`}
                      >
                        <div>
                          <div className={`font-semibold ${theme.textStrong}`}>{user.full_name || "User"}</div>
                          <div className={`text-sm ${theme.textSoft}`}>
                            {user.national_id || "No ID"}
                            {user.email ? ` · ${user.email}` : ""}
                            {user.department ? ` · ${user.department}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(user.id)}
                          disabled={saving}
                          className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${theme.buttonDanger} disabled:bg-slate-300`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}
