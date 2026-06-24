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

function parseAssignedIds(raw) {
  return Array.from(
    new Set(
      (Array.isArray(raw) ? raw : String(raw || "").split(/[\s,]+/))
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

export default function UserGroups() {
  const config = getOrgConfig();
  const theme = config.theme;
  const [groups, setGroups] = useState([]);
  const [resources, setResources] = useState([]);
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
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState(null);
  const [assigningResource, setAssigningResource] = useState(false);
  const [selectedResourceUsers, setSelectedResourceUsers] = useState([]);
  const [selectedResourceMissingIds, setSelectedResourceMissingIds] = useState([]);
  const [selectedResourceUsersLoading, setSelectedResourceUsersLoading] = useState(false);
  const [selectedResourceUserSearch, setSelectedResourceUserSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  useEffect(() => {
    loadGroups();
  }, []);

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
    return () => {
      active = false;
    };
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
  const selectedGroupNationalIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedMembers
            .map((user) => String(user?.national_id || "").trim())
            .filter(Boolean)
        )
      ),
    [selectedMembers]
  );
  const resourceTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          resources
            .map((resource) => String(resource?.type_name || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [resources]
  );
  const filteredResources = useMemo(() => {
    const query = resourceSearch.trim().toLowerCase();
    const scored = resources
      .map((resource) => {
        const name = String(resource?.name || "").trim();
        const typeName = String(resource?.type_name || "").trim();
        const resourceId = String(resource?.id || "").trim();
        const metadataText = JSON.stringify(resource?.metadata || {}).toLowerCase();
        if (resourceTypeFilter && typeName !== resourceTypeFilter) {
          return null;
        }
        const haystack = [name, typeName, metadataText, resourceId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!query) {
          return { resource, score: 0 };
        }
        if (resourceId === query) {
          return { resource, score: 0 };
        }

        const lowerName = name.toLowerCase();
        const lowerType = typeName.toLowerCase();
        if (lowerName === query) {
          return { resource, score: 1 };
        }
        if (lowerName.startsWith(query)) {
          return { resource, score: 2 };
        }
        if (lowerType.startsWith(query)) {
          return { resource, score: 3 };
        }
        if (lowerName.includes(query)) {
          return { resource, score: 4 };
        }
        if (lowerType.includes(query)) {
          return { resource, score: 5 };
        }
        if (haystack.includes(query)) {
          return { resource, score: 6 };
        }
        return null;
      })
      .filter(Boolean);

    return scored
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return String(a.resource?.name || "").localeCompare(String(b.resource?.name || ""), undefined, {
          sensitivity: "base",
        });
      })
      .map((entry) => entry.resource);
  }, [resourceSearch, resourceTypeFilter, resources]);
  const selectedResource = useMemo(
    () => resources.find((resource) => Number(resource.id) === Number(selectedResourceId)) || null,
    [resources, selectedResourceId]
  );
  const selectedResourceAssignedIds = useMemo(
    () => parseAssignedIds(selectedResource?.metadata?.user_ids ?? selectedResource?.metadata?.userIds),
    [selectedResource]
  );
  const linkedResourcesForSelectedGroup = useMemo(() => {
    if (selectedGroupNationalIds.length === 0) return [];

    return resources
      .map((resource) => {
        const assignedIds = parseAssignedIds(resource?.metadata?.user_ids ?? resource?.metadata?.userIds);
        if (assignedIds.length === 0) return null;

        const assignedSet = new Set(assignedIds);
        const matchedCount = selectedGroupNationalIds.filter((nationalId) => assignedSet.has(nationalId)).length;
        if (matchedCount === 0) return null;

        return {
          resource,
          assignedCount: assignedIds.length,
          matchedCount,
          fullyLinked: matchedCount === selectedGroupNationalIds.length,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.fullyLinked !== b.fullyLinked) return a.fullyLinked ? -1 : 1;
        if (a.matchedCount !== b.matchedCount) return b.matchedCount - a.matchedCount;
        return String(a.resource?.name || "").localeCompare(String(b.resource?.name || ""), undefined, {
          sensitivity: "base",
        });
      });
  }, [resources, selectedGroupNationalIds]);
  const filteredSelectedResourceUsers = useMemo(() => {
    const query = selectedResourceUserSearch.trim().toLowerCase();
    if (!query) return selectedResourceUsers;
    return selectedResourceUsers.filter((user) => {
      const haystack = [user?.full_name, user?.email, user?.national_id, user?.department]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [selectedResourceUserSearch, selectedResourceUsers]);
  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return selectedMembers;
    return selectedMembers.filter((user) => {
      const haystack = [user?.full_name, user?.email, user?.national_id, user?.department]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [memberSearch, selectedMembers]);

  useEffect(() => {
    setSelectedResourceUserSearch("");

    if (!selectedResource?.id || selectedResourceAssignedIds.length === 0) {
      setSelectedResourceUsers([]);
      setSelectedResourceMissingIds([]);
      setSelectedResourceUsersLoading(false);
      return;
    }

    let active = true;
    setSelectedResourceUsersLoading(true);
    apiPost("/users/bulk-lookup", {
      national_ids: selectedResourceAssignedIds,
    })
      .then((data) => {
        if (!active) return;
        setSelectedResourceUsers(Array.isArray(data?.matched_users) ? data.matched_users : []);
        setSelectedResourceMissingIds(
          Array.isArray(data?.missing_national_ids) ? data.missing_national_ids : []
        );
      })
      .catch(() => {
        if (!active) return;
        setSelectedResourceUsers([]);
        setSelectedResourceMissingIds([]);
      })
      .finally(() => {
        if (!active) return;
        setSelectedResourceUsersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedResource?.id, selectedResourceAssignedIds]);

  async function loadGroups(nextSelectedId = null) {
    try {
      setLoading(true);
      const data = await apiGet("/user-groups");
      const nextGroups = Array.isArray(data) ? data : [];
      setGroups(nextGroups);
      if (nextSelectedId !== null && nextSelectedId !== undefined) {
        const preferredId = Number(nextSelectedId);
        if (preferredId && nextGroups.some((group) => Number(group.id) === preferredId)) {
          setSelectedGroupId(preferredId);
          return;
        }
        setSelectedGroupId(null);
        return;
      }

      if (
        selectedGroupId !== null &&
        selectedGroupId !== undefined &&
        nextGroups.some((group) => Number(group.id) === Number(selectedGroupId))
      ) {
        setSelectedGroupId(Number(selectedGroupId));
        return;
      }

      setSelectedGroupId(null);
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

  async function assignGroupToResource() {
    if (!selectedGroup?.id || !selectedResource?.id) return;

    const groupUserIds = selectedMembers
      .map((user) => String(user?.national_id || "").trim())
      .filter(Boolean);
    const existingUserIds = parseAssignedIds(
      selectedResource?.metadata?.user_ids ?? selectedResource?.metadata?.userIds
    );
    const nextUserIds = Array.from(new Set([...existingUserIds, ...groupUserIds]));

    if (nextUserIds.length === 0) {
      setMessageTone("error");
      setMessage("Selected group has no users with a national ID.");
      return;
    }

    const confirmed = window.confirm(
      `Assign group "${selectedGroup.name}" to resource "${selectedResource.name}"?\n\nThis will add the group's members to the resource's existing assigned user IDs without removing current users.`
    );
    if (!confirmed) return;

    try {
      setAssigningResource(true);
      const metadata =
        selectedResource.metadata && typeof selectedResource.metadata === "object"
          ? { ...selectedResource.metadata }
          : {};
      metadata.user_ids = nextUserIds;
      delete metadata.userIds;
      delete metadata.users;

      const updated = await apiPut(`/resources/${selectedResource.id}`, {
        name: selectedResource.name,
        type_id: selectedResource.type_id,
        metadata,
      });

      setResources((prev) =>
        prev.map((resource) =>
          Number(resource.id) === Number(updated?.id || selectedResource.id)
            ? { ...resource, ...updated }
            : resource
        )
      );
      const addedCount = Math.max(0, nextUserIds.length - existingUserIds.length);
      setMessageTone("success");
      setMessage(
        addedCount > 0
          ? `Added ${addedCount} users from group ${selectedGroup.name} to resource ${selectedResource.name}.`
          : `All users from group ${selectedGroup.name} were already assigned to resource ${selectedResource.name}.`
      );
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to assign group to resource.");
    } finally {
      setAssigningResource(false);
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
                  <div>
                    <div className={`text-sm font-semibold ${theme.textStrong}`}>Resources linked to this group</div>
                    <div className={`mt-1 text-sm ${theme.textSoft}`}>
                      Resources whose assigned users already include this group's participants.
                    </div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
                    {linkedResourcesForSelectedGroup.length} matched
                  </div>
                </div>

                {selectedGroupNationalIds.length === 0 ? (
                  <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                    Add users with IDs to this group to detect linked resources.
                  </div>
                ) : linkedResourcesForSelectedGroup.length === 0 ? (
                  <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                    No linked resources were found for this group yet.
                  </div>
                ) : (
                  <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {linkedResourcesForSelectedGroup.map(({ resource, assignedCount, matchedCount, fullyLinked }) => {
                      const isSelected = Number(resource.id) === Number(selectedResourceId);
                      return (
                        <button
                          key={`linked-resource-${resource.id}`}
                          type="button"
                          onClick={() => setSelectedResourceId(resource.id)}
                          className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                            isSelected ? `${theme.highlightTag} shadow-sm` : `${theme.card} hover:border-slate-300`
                          }`}
                        >
                          <div>
                            <div className={`font-semibold ${theme.textStrong}`}>{resource.name}</div>
                            <div className={`text-sm ${theme.textSoft}`}>
                              {resource.type_name || "Resource"} · {matchedCount}/{selectedGroupNationalIds.length} from this group · {assignedCount} assigned
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${fullyLinked ? theme.highlightTag : theme.tagMuted}`}>
                              {fullyLinked ? "Full match" : "Partial match"}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
                              ID #{resource.id}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={`rounded-2xl border p-4 ${theme.modalSurface}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className={`text-sm font-semibold ${theme.textStrong}`}>Assign group to resource</div>
                    <div className={`mt-1 text-sm ${theme.textSoft}`}>
                      Choose one resource and add this group's members to the users already assigned to it.
                    </div>
                  </div>
                  {selectedResource && (
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
                      {selectedResourceAssignedIds.length} assigned now
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={resourceSearch}
                  onChange={(e) => setResourceSearch(e.target.value)}
                  placeholder="Search resource by name, type, or ID"
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <select
                    value={resourceTypeFilter}
                    onChange={(e) => setResourceTypeFilter(e.target.value)}
                    className={`min-w-[220px] rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                  >
                    <option value="">All resource types</option>
                    {resourceTypeOptions.map((typeName) => (
                      <option key={typeName} value={typeName}>
                        {typeName}
                      </option>
                    ))}
                  </select>
                  {resourceTypeFilter && (
                    <button
                      type="button"
                      onClick={() => setResourceTypeFilter("")}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${theme.buttonGhost}`}
                    >
                      Clear type filter
                    </button>
                  )}
                </div>

                <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {filteredResources.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                      No resources match your search.
                    </div>
                  ) : (
                    filteredResources.slice(0, 40).map((resource) => {
                      const isSelected = Number(resource.id) === Number(selectedResourceId);
                      const assignedCount = parseAssignedIds(
                        resource?.metadata?.user_ids ?? resource?.metadata?.userIds
                      ).length;
                      return (
                        <button
                          key={resource.id}
                          type="button"
                          onClick={() => setSelectedResourceId(resource.id)}
                          className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                            isSelected ? `${theme.highlightTag} shadow-sm` : `${theme.card} hover:border-slate-300`
                          }`}
                        >
                          <div>
                            <div className={`font-semibold ${theme.textStrong}`}>{resource.name}</div>
                            <div className={`text-sm ${theme.textSoft}`}>
                              {resource.type_name || "Resource"} · {assignedCount} assigned
                            </div>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
                            ID #{resource.id}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className={`text-xs ${theme.textSoft}`}>
                    {selectedResource
                      ? `Selected resource: ${selectedResource.name}`
                      : "Select a resource first."}
                  </div>
                  <button
                    type="button"
                    onClick={assignGroupToResource}
                    disabled={!selectedResource || assigningResource}
                    className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${theme.buttonPrimary} disabled:bg-slate-300`}
                  >
                    {assigningResource ? "Assigning..." : "Assign group to resource"}
                  </button>
                </div>

                <div className={`mt-4 rounded-2xl border p-4 ${theme.card}`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className={`text-sm font-semibold ${theme.textStrong}`}>Assigned participants</div>
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
                      {filteredSelectedResourceUsers.length} / {selectedResourceAssignedIds.length}
                    </div>
                  </div>

                  {!selectedResource ? (
                    <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
                      Select a course or resource to see its participants.
                    </div>
                  ) : selectedResourceUsersLoading ? (
                    <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
                      Loading assigned participants...
                    </div>
                  ) : selectedResourceAssignedIds.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
                      No participants are assigned to this resource yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={selectedResourceUserSearch}
                        onChange={(e) => setSelectedResourceUserSearch(e.target.value)}
                        placeholder="Search assigned participants by name, email, ID, or department"
                        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                      />
                      {selectedResourceMissingIds.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                          {selectedResourceMissingIds.length} assigned IDs were not found in the system:{" "}
                          {selectedResourceMissingIds.slice(0, 8).join(", ")}
                          {selectedResourceMissingIds.length > 8 ? "..." : ""}
                        </div>
                      )}
                      <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                        {filteredSelectedResourceUsers.length === 0 ? (
                          <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.modalSurface} ${theme.textSoft}`}>
                            No assigned participants match your search.
                          </div>
                        ) : (
                          filteredSelectedResourceUsers.map((user) => (
                            <div
                              key={user.id}
                              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${theme.modalSurface}`}
                            >
                              <div>
                                <div className={`font-semibold ${theme.textStrong}`}>{user.full_name || "User"}</div>
                                <div className={`text-sm ${theme.textSoft}`}>
                                  {user.national_id || "No ID"}
                                  {user.email ? ` · ${user.email}` : ""}
                                  {user.department ? ` · ${user.department}` : ""}
                                </div>
                              </div>
                              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.highlightTag}`}>
                                Assigned
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${theme.modalSurface}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className={`text-sm font-semibold ${theme.textStrong}`}>Current group members</div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.tagMuted}`}>
                    {filteredMembers.length} / {selectedMembers.length}
                  </div>
                </div>
                {selectedMembers.length === 0 ? (
                  <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                    No members in this group yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search students by name, email, ID, or department"
                      className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${theme.input}`}
                    />
                    <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                      {filteredMembers.length === 0 ? (
                        <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${theme.card} ${theme.textSoft}`}>
                          No group members match your search.
                        </div>
                      ) : (
                        filteredMembers.map((user) => (
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
                        ))
                      )}
                    </div>
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
