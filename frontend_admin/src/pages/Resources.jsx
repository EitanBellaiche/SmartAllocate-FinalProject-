import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";

function sortResourcesAlphabetically(items) {
  return [...items].sort(
    (a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
        sensitivity: "base",
      }) || Number(a?.id || 0) - Number(b?.id || 0)
  );
}

function getTypeFieldNames(type) {
  return new Set(Array.isArray(type?.fields) ? type.fields.map((field) => field.name) : []);
}

function getCustomMetadataEntries(metadata, type) {
  const typeFieldNames = getTypeFieldNames(type);
  return Object.entries(metadata || {}).filter(([key]) => !typeFieldNames.has(key));
}

function normalizeCustomFieldValue(value, fieldType) {
  if (fieldType === "boolean") return Boolean(value);
  if (fieldType === "number") return value === "" ? "" : Number(value);
  return String(value ?? "");
}

function SummaryPill({ label, value, tone = "slate" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone] || tones.slate}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [types, setTypes] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm] = useState({
    name: "",
    type_id: "",
    metadata: {},
  });
  const [customFieldDraft, setCustomFieldDraft] = useState({
    name: "",
    type: "text",
  });

  const [detailsModal, setDetailsModal] = useState({
    open: false,
    item: null,
  });

  const [showEdit, setShowEdit] = useState(false);
  const [editSelectedType, setEditSelectedType] = useState(null);
  const [editForm, setEditForm] = useState({
    id: null,
    name: "",
    type_id: "",
    metadata: {},
  });
  const [editCustomFieldDraft, setEditCustomFieldDraft] = useState({
    name: "",
    type: "text",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [resData, typeData] = await Promise.all([
        apiGet("/resources"),
        apiGet("/resource-types"),
      ]);
      setResources(sortResourcesAlphabetically(resData));
      setTypes(typeData);
    } catch (err) {
      console.error("Error loading resources:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectType(typeId) {
    const type = types.find((t) => t.id === Number(typeId));
    setSelectedType(type || null);

    if (!type || !Array.isArray(type.fields)) {
      setForm({
        name: "",
        type_id: typeId,
        metadata: {},
      });
      setCustomFieldDraft({ name: "", type: "text" });
      return;
    }

    const meta = {};
    type.fields.forEach((field) => {
      meta[field.name] = field.default || (field.type === "boolean" ? false : "");
    });

    setForm({
      name: "",
      type_id: typeId,
      metadata: meta,
    });
    setCustomFieldDraft({ name: "", type: "text" });
  }

  function handleEditSelectType(typeId) {
    const type = types.find((t) => t.id === Number(typeId));
    setEditSelectedType(type || null);

    if (!type || !Array.isArray(type.fields)) {
      setEditForm((prev) => ({
        ...prev,
        type_id: typeId,
        metadata: {},
      }));
      setEditCustomFieldDraft({ name: "", type: "text" });
      return;
    }

    const meta = {};
    type.fields.forEach((field) => {
      const existing = editForm.metadata?.[field.name];
      meta[field.name] =
        existing !== undefined ? existing : field.default || (field.type === "boolean" ? false : "");
    });

    setEditForm((prev) => ({
      ...prev,
      type_id: typeId,
      metadata: meta,
    }));
    setEditCustomFieldDraft({ name: "", type: "text" });
  }

  function handleMetadataChange(field, value) {
    setForm((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [field]: value },
    }));
  }

  function handleEditMetadataChange(field, value) {
    setEditForm((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [field]: value },
    }));
  }

  function addCustomField() {
    const fieldName = customFieldDraft.name.trim();
    if (!fieldName) return;

    setForm((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev.metadata, fieldName)) {
        return prev;
      }

      return {
        ...prev,
        metadata: {
          ...prev.metadata,
          [fieldName]: normalizeCustomFieldValue("", customFieldDraft.type),
        },
      };
    });

    setCustomFieldDraft({ name: "", type: "text" });
  }

  function addEditCustomField() {
    const fieldName = editCustomFieldDraft.name.trim();
    if (!fieldName) return;

    setEditForm((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev.metadata, fieldName)) {
        return prev;
      }

      return {
        ...prev,
        metadata: {
          ...prev.metadata,
          [fieldName]: normalizeCustomFieldValue("", editCustomFieldDraft.type),
        },
      };
    });

    setEditCustomFieldDraft({ name: "", type: "text" });
  }

  function removeCustomField(fieldName) {
    setForm((prev) => {
      const metadata = { ...prev.metadata };
      delete metadata[fieldName];
      return { ...prev, metadata };
    });
  }

  function removeEditCustomField(fieldName) {
    setEditForm((prev) => {
      const metadata = { ...prev.metadata };
      delete metadata[fieldName];
      return { ...prev, metadata };
    });
  }

  async function saveResource() {
    try {
      await apiPost("/resources", form);
      setShowAdd(false);
      setSelectedType(null);
      setForm({ name: "", type_id: "", metadata: {} });
      setCustomFieldDraft({ name: "", type: "text" });
      loadData();
    } catch (err) {
      console.error("Error creating resource:", err);
    }
  }

  function openEdit(resource) {
    const type = types.find((t) => t.id === Number(resource.type_id));
    setEditSelectedType(type || null);
    setEditForm({
      id: resource.id,
      name: resource.name || "",
      type_id: resource.type_id || "",
      metadata: resource.metadata || {},
    });
    setEditCustomFieldDraft({ name: "", type: "text" });
    setShowEdit(true);
  }

  async function saveEdit() {
    try {
      if (!editForm.id) return;
      const payload = {
        name: editForm.name,
        type_id: editForm.type_id,
        metadata: editForm.metadata,
      };
      await apiPut(`/resources/${editForm.id}`, payload);
      setShowEdit(false);
      setEditSelectedType(null);
      setEditForm({ id: null, name: "", type_id: "", metadata: {} });
      setEditCustomFieldDraft({ name: "", type: "text" });
      loadData();
    } catch (err) {
      console.error("Error updating resource:", err);
    }
  }

  async function deleteResource(id) {
    if (!confirm("Are you sure you want to delete this resource?")) return;

    try {
      await apiDelete(`/resources/${id}`);
      loadData();
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading resources...</p>;
  }

  const normalizedNameFilter = nameFilter.trim().toLowerCase();
  const hasNameFilter = normalizedNameFilter.length > 0;
  const hasTypeFilter = String(typeFilter).trim().length > 0;
  const hasActiveFilter = hasNameFilter || hasTypeFilter;

  const filteredResources = sortResourcesAlphabetically(resources).filter((resource) => {
    const matchesType = !typeFilter || String(resource.type_id) === typeFilter;
    const matchesName =
      !hasNameFilter || String(resource.name || "").toLowerCase().includes(normalizedNameFilter);

    return matchesType && matchesName;
  });

  const selectedTypeName =
    types.find((type) => String(type.id) === String(typeFilter))?.name || "All types";

  return (
    <div className="space-y-6">
      <section className="overflow-visible rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Resource Directory
            </div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Resources</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Browse, filter, and manage resources from one polished control panel.
            </p>
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex h-fit items-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
          >
            + Add Resource
          </button>
        </div>

        <div className="mt-8 rounded-[24px] border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Filter by type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              >
                <option value="">All types</option>
                {sortResourcesAlphabetically(types).map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Search by resource name
              </label>
              <input
                type="text"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Type a resource name..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryPill
              label="Matched Results"
              value={hasActiveFilter ? filteredResources.length : 0}
              tone="blue"
            />
            <SummaryPill label="Selected Filter" value={selectedTypeName} tone="slate" />
            <SummaryPill label="Total Resources" value={resources.length} tone="emerald" />
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-6">
        {!hasActiveFilter ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
            <div className="text-lg font-semibold text-slate-800">Choose a type or search to reveal resources</div>
            <div className="mt-2 text-sm text-slate-500">
              Select a resource type, search by name, or combine both filters.
            </div>
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
            <div className="text-lg font-semibold text-slate-800">No matching resources</div>
            <div className="mt-2 text-sm text-slate-500">
              Try a different keyword or change the selected type filter.
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredResources.map((resource) => (
              <article
                key={resource.id}
                className="rounded-[22px] border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-bold text-slate-900">{resource.name}</h3>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                        {resource.type_name || "Resource"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        ID #{resource.id}
                      </span>
                      {Object.entries(resource.metadata || {})
                        .slice(0, 3)
                        .map(([key, value]) => (
                          <span
                            key={`${resource.id}-${key}`}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                          >
                            {key}: {String(value)}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                    <button
                      onClick={() => setDetailsModal({ open: true, item: resource })}
                      className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEdit(resource)}
                      className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteResource(resource.id)}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-[600px] overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="mb-4 text-xl font-bold">Add Resource</h2>

            <label className="mb-2 block font-medium">Select Type</label>
            <select
              className="mb-4 w-full rounded border p-2"
              value={form.type_id}
              onChange={(e) => handleSelectType(e.target.value)}
            >
              <option value="">-- Select Type --</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Resource name"
              className="mb-4 w-full rounded border p-2"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />

            {selectedType && Array.isArray(selectedType.fields) && (
              <>
                <h3 className="mb-2 font-semibold">Resource Fields</h3>
                {selectedType.fields.map((field, index) => (
                  <div key={index} className="mb-3">
                    <label className="mb-1 block text-sm font-medium">
                      {field.name} ({field.type})
                    </label>

                    {field.type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={form.metadata[field.name] || false}
                        onChange={(e) => handleMetadataChange(field.name, e.target.checked)}
                      />
                    ) : (
                      <input
                        type={field.type === "number" ? "number" : "text"}
                        className="w-full rounded border p-2"
                        value={form.metadata[field.name]}
                        onChange={(e) => handleMetadataChange(field.name, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </>
            )}

            {selectedType && (
              <>
                <h3 className="mb-2 mt-6 font-semibold">Custom Fields For This Resource</h3>
                <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <input
                    type="text"
                    placeholder="Field name"
                    className="w-full rounded border p-2"
                    value={customFieldDraft.name}
                    onChange={(e) =>
                      setCustomFieldDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                  <select
                    className="w-full rounded border p-2"
                    value={customFieldDraft.type}
                    onChange={(e) =>
                      setCustomFieldDraft((prev) => ({ ...prev, type: e.target.value }))
                    }
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-800"
                  >
                    Add Field
                  </button>
                </div>

                {getCustomMetadataEntries(form.metadata, selectedType).map(([fieldName, fieldValue]) => {
                  const fieldType =
                    typeof fieldValue === "boolean"
                      ? "boolean"
                      : typeof fieldValue === "number"
                      ? "number"
                      : "text";

                  return (
                    <div key={fieldName} className="mb-3 rounded border p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {fieldName} ({fieldType})
                        </label>
                        <button
                          type="button"
                          onClick={() => removeCustomField(fieldName)}
                          className="rounded bg-red-600 px-2 py-1 text-sm text-white hover:bg-red-700"
                        >
                          Remove
                        </button>
                      </div>

                      {fieldType === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(fieldValue)}
                          onChange={(e) => handleMetadataChange(fieldName, e.target.checked)}
                        />
                      ) : (
                        <input
                          type={fieldType === "number" ? "number" : "text"}
                          className="w-full rounded border p-2"
                          value={fieldValue ?? ""}
                          onChange={(e) =>
                            handleMetadataChange(
                              fieldName,
                              fieldType === "number"
                                ? e.target.value === ""
                                  ? ""
                                  : Number(e.target.value)
                                : e.target.value
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setSelectedType(null);
                  setCustomFieldDraft({ name: "", type: "text" });
                }}
                className="rounded border px-4 py-2"
              >
                Cancel
              </button>

              <button
                onClick={saveResource}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Save Resource
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-[600px] overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="mb-4 text-xl font-bold">Edit Resource</h2>

            <label className="mb-2 block font-medium">Select Type</label>
            <select
              className="mb-4 w-full rounded border p-2"
              value={editForm.type_id}
              onChange={(e) => handleEditSelectType(e.target.value)}
            >
              <option value="">-- Select Type --</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Resource name"
              className="mb-4 w-full rounded border p-2"
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />

            {editSelectedType && Array.isArray(editSelectedType.fields) && (
              <>
                <h3 className="mb-2 font-semibold">Resource Fields</h3>
                {editSelectedType.fields.map((field, index) => (
                  <div key={index} className="mb-3">
                    <label className="mb-1 block text-sm font-medium">
                      {field.name} ({field.type})
                    </label>

                    {field.type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={editForm.metadata[field.name] || false}
                        onChange={(e) =>
                          handleEditMetadataChange(field.name, e.target.checked)
                        }
                      />
                    ) : (
                      <input
                        type={field.type === "number" ? "number" : "text"}
                        className="w-full rounded border p-2"
                        value={editForm.metadata[field.name] ?? ""}
                        onChange={(e) => handleEditMetadataChange(field.name, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </>
            )}

            {editSelectedType && (
              <>
                <h3 className="mb-2 mt-6 font-semibold">Custom Fields For This Resource</h3>
                <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <input
                    type="text"
                    placeholder="Field name"
                    className="w-full rounded border p-2"
                    value={editCustomFieldDraft.name}
                    onChange={(e) =>
                      setEditCustomFieldDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                  <select
                    className="w-full rounded border p-2"
                    value={editCustomFieldDraft.type}
                    onChange={(e) =>
                      setEditCustomFieldDraft((prev) => ({ ...prev, type: e.target.value }))
                    }
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <button
                    type="button"
                    onClick={addEditCustomField}
                    className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-800"
                  >
                    Add Field
                  </button>
                </div>

                {getCustomMetadataEntries(editForm.metadata, editSelectedType).map(
                  ([fieldName, fieldValue]) => {
                    const fieldType =
                      typeof fieldValue === "boolean"
                        ? "boolean"
                        : typeof fieldValue === "number"
                        ? "number"
                        : "text";

                    return (
                      <div key={fieldName} className="mb-3 rounded border p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <label className="text-sm font-medium">
                            {fieldName} ({fieldType})
                          </label>
                          <button
                            type="button"
                            onClick={() => removeEditCustomField(fieldName)}
                            className="rounded bg-red-600 px-2 py-1 text-sm text-white hover:bg-red-700"
                          >
                            Remove
                          </button>
                        </div>

                        {fieldType === "boolean" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(fieldValue)}
                            onChange={(e) =>
                              handleEditMetadataChange(fieldName, e.target.checked)
                            }
                          />
                        ) : (
                          <input
                            type={fieldType === "number" ? "number" : "text"}
                            className="w-full rounded border p-2"
                            value={fieldValue ?? ""}
                            onChange={(e) =>
                              handleEditMetadataChange(
                                fieldName,
                                fieldType === "number"
                                  ? e.target.value === ""
                                    ? ""
                                    : Number(e.target.value)
                                  : e.target.value
                              )
                            }
                          />
                        )}
                      </div>
                    );
                  }
                )}
              </>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowEdit(false);
                  setEditSelectedType(null);
                  setEditCustomFieldDraft({ name: "", type: "text" });
                }}
                className="rounded border px-4 py-2"
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-[500px] overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="mb-4 text-xl font-bold">
              Resource Details - {detailsModal.item?.name}
            </h2>

            <p className="mb-2 text-sm">
              <strong>Type:</strong> {detailsModal.item?.type_name}
            </p>

            <h3 className="mb-2 mt-4 font-semibold">Fields</h3>

            <pre className="rounded border bg-gray-100 p-4 text-sm">
              {JSON.stringify(detailsModal.item?.metadata, null, 2)}
            </pre>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setDetailsModal({ open: false, item: null })}
                className="rounded border px-4 py-2"
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
