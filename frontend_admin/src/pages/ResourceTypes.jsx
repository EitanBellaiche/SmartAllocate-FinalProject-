import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";
import { getOrgConfig } from "../orgConfig";
import "./ResourceTypes.css";

function ModalPortal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function sortTypesAlphabetically(items) {
  return [...items].sort(
    (a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
        sensitivity: "base",
      }) || Number(a?.id || 0) - Number(b?.id || 0)
  );
}

function MetricCard({ label, value, tone = "slate", theme }) {
  const tones = {
    blue: theme.metricCards?.blue || theme.card,
    slate: theme.card,
    amber: theme.metricCards?.amber || theme.modalSurface,
  };

  return (
    <div className={`resource-types-metric resource-types-metric--${tone} rounded-2xl border px-4 py-3 ${tones[tone] || tones.slate}`}>
      <div className="resource-types-metric__label text-xs font-semibold uppercase tracking-[0.16em]">{label}</div>
      <div className="resource-types-metric__value mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}

function FieldTable({ rows, onChange, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-purple-900/40 bg-black/20">
      <table className="min-w-[640px] w-full text-left">
        <thead className="bg-black/40 text-slate-200">
          <tr>
            <th className="border-b border-slate-200 px-3 py-3">Name</th>
            <th className="border-b border-slate-200 px-3 py-3">Type</th>
            <th className="border-b border-slate-200 px-3 py-3">Required</th>
            <th className="border-b border-slate-200 px-3 py-3">Default</th>
            <th className="border-b border-slate-200 px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((field, index) => (
            <tr key={index} className="bg-transparent">
              <td className="border-b border-slate-100 px-3 py-3">
                <input
                  type="text"
                  value={field.name}
                  onChange={(e) => onChange(index, "name", e.target.value)}
                  className="w-full rounded-xl border border-purple-900/40 bg-black/40 px-3 py-2 text-slate-100 outline-none focus:border-red-700 focus:bg-black/50 focus:ring-4 focus:ring-red-950/40"
                />
              </td>
              <td className="border-b border-slate-100 px-3 py-3">
                <select
                  value={field.type}
                  onChange={(e) => onChange(index, "type", e.target.value)}
                  className="w-full rounded-xl border border-purple-900/40 bg-black/40 px-3 py-2 text-slate-100 outline-none focus:border-red-700 focus:bg-black/50 focus:ring-4 focus:ring-red-950/40"
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                </select>
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => onChange(index, "required", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </td>
              <td className="border-b border-slate-100 px-3 py-3">
                <input
                  type="text"
                  value={field.default}
                  onChange={(e) => onChange(index, "default", e.target.value)}
                  className="w-full rounded-xl border border-purple-900/40 bg-black/40 px-3 py-2 text-slate-100 outline-none focus:border-red-700 focus:bg-black/50 focus:ring-4 focus:ring-red-950/40"
                />
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-center">
                <button
                  onClick={() => onDelete(index)}
                  className="rounded-lg bg-red-900/40 px-3 py-1.5 text-sm font-semibold text-red-200 transition hover:bg-red-900/60"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                No fields yet. Add the first field below.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RoleEditor({ roles, roleInput, setRoleInput, onAddRole, onRemoveRole }) {
  return (
    <>
      <div className="mb-3 flex gap-2">
        <input
          type="text"
          placeholder="Role name"
          value={roleInput}
          onChange={(e) => setRoleInput(e.target.value)}
          className="flex-1 rounded-2xl border border-purple-900/40 bg-black/40 px-4 py-3 text-slate-100 outline-none focus:border-red-700 focus:bg-black/50 focus:ring-4 focus:ring-red-950/40"
        />
        <button
          onClick={onAddRole}
          className="rounded-2xl bg-red-700 px-4 py-3 font-semibold text-white transition hover:bg-red-800"
        >
          Add Role
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {roles.map((role, index) => (
          <span
            key={`${role}-${index}`}
            className="inline-flex items-center rounded-full border border-purple-900/40 bg-black/30 px-3 py-1.5 text-sm font-medium text-slate-200"
          >
            {role}
            <button
              onClick={() => onRemoveRole(index)}
              className="ml-2 text-red-300 transition hover:text-red-200"
            >
              x
            </button>
          </span>
        ))}
        {roles.length === 0 && <div className="text-sm text-slate-400">No roles defined yet.</div>}
      </div>
    </>
  );
}

export default function ResourceTypes() {
  const config = getOrgConfig();
  const theme = config.theme;
  const isCinema = config.domain === "cinema";
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editModal, setEditModal] = useState({
    open: false,
    type: null,
    fields: [],
    roles: [],
    roleInput: "",
  });
  const [form, setForm] = useState({
    name: "",
    description: "",
    fields: [],
    roles: [],
  });
  const [roleInput, setRoleInput] = useState("");

  useEffect(() => {
    loadTypes();
  }, []);

  async function loadTypes() {
    try {
      const data = await apiGet("/resource-types");
      setTypes(sortTypesAlphabetically(data));
    } catch (err) {
      console.error("Error loading resource types:", err);
    } finally {
      setLoading(false);
    }
  }

  async function deleteType(id) {
    if (!confirm("Are you sure you want to delete this resource type?")) return;

    try {
      const res = await apiDelete(`/resource-types/${id}`);
      if (res?.error) {
        alert(res.error);
        return;
      }
      loadTypes();
    } catch (err) {
      console.error("Error deleting type:", err);
      alert("Delete failed");
    }
  }

  function addFieldRow() {
    setForm((prev) => ({
      ...prev,
      fields: [...prev.fields, { name: "", type: "string", required: false, default: "" }],
    }));
  }

  function deleteFieldRow(index) {
    const updated = [...form.fields];
    updated.splice(index, 1);
    setForm((prev) => ({ ...prev, fields: updated }));
  }

  function handleAddFieldChange(index, key, value) {
    const updated = [...form.fields];
    updated[index][key] = value;
    setForm((prev) => ({ ...prev, fields: updated }));
  }

  async function saveNewType() {
    try {
      await apiPost("/resource-types", form);
      setShowAdd(false);
      setForm({ name: "", description: "", fields: [], roles: [] });
      setRoleInput("");
      loadTypes();
    } catch (err) {
      console.error("Error creating type:", err);
    }
  }

  function openEditModal(typeData) {
    setEditModal({
      open: true,
      type: { ...typeData },
      fields: JSON.parse(JSON.stringify(typeData.fields || [])),
      roles: Array.isArray(typeData.roles) ? [...typeData.roles] : [],
      roleInput: "",
    });
  }

  function handleEditFieldChange(index, key, value) {
    const updated = [...editModal.fields];
    updated[index][key] = value;
    setEditModal((prev) => ({ ...prev, fields: updated }));
  }

  function addEditFieldRow() {
    setEditModal((prev) => ({
      ...prev,
      fields: [...prev.fields, { name: "", type: "string", required: false, default: "" }],
    }));
  }

  function deleteEditFieldRow(index) {
    const updated = [...editModal.fields];
    updated.splice(index, 1);
    setEditModal((prev) => ({ ...prev, fields: updated }));
  }

  async function saveEditType() {
    try {
      await apiPut(`/resource-types/${editModal.type.id}`, {
        name: editModal.type.name,
        description: editModal.type.description,
        fields: editModal.fields,
        roles: editModal.roles,
      });

      setEditModal({ open: false, type: null, fields: [], roles: [], roleInput: "" });
      loadTypes();
    } catch (err) {
      console.error("Error editing type:", err);
    }
  }

  const totalFields = types.reduce((sum, type) => sum + (type.fields?.length || 0), 0);
  const totalRoles = types.reduce((sum, type) => sum + (type.roles?.length || 0), 0);

  if (loading) return <p className={theme.textSoft}>Loading...</p>;

  return (
    <div className="resource-types-page space-y-6">
      <section className={`resource-types-hero resource-types-toolbar rounded-[28px] border p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-8 ${theme.heroDark}`}>
        <div className="resource-types-toolbar__top">
          <div>
            <div className={`resource-types-eyebrow mb-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${theme.heroEyebrow}`}>
              Schema Manager
            </div>
            <p className={`resource-types-toolbar__subtitle mt-3 text-base leading-7 ${isCinema ? theme.textSoft : theme.textSoft}`}>
              Define blueprints, fields, and role assignments used by allocation rules.
            </p>
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className={`resource-types-add-button inline-flex h-fit items-center rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg transition ${theme.buttonPrimary}`}
          >
            + Add Type
          </button>
        </div>

        <div className="resource-types-toolbar__metrics mt-8 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Total Types" value={types.length} tone="blue" theme={theme} />
          <MetricCard label="Total Fields" value={totalFields} tone="slate" theme={theme} />
          <MetricCard label="Total Roles" value={totalRoles} tone="amber" theme={theme} />
        </div>
      </section>

      <section className={`resource-types-list rounded-[26px] border p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-6 ${theme.card}`}>
        <div className="resource-types-grid grid gap-4">
          {sortTypesAlphabetically(types).map((type) => {
            const fieldPreview = Array.isArray(type.fields) ? type.fields.slice(0, 3) : [];
            const extraFields = Math.max((type.fields?.length || 0) - fieldPreview.length, 0);
            const rolePreview = Array.isArray(type.roles) ? type.roles.slice(0, 3) : [];
            const extraRoles = Math.max((type.roles?.length || 0) - rolePreview.length, 0);

            return (
              <article
                key={type.id}
                className={`resource-type-card rounded-[24px] border p-5 shadow-sm transition hover:shadow-md ${theme.card}`}
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className={`text-2xl font-bold ${theme.textStrong}`}>{type.name}</h2>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${theme.tag}`}>
                        Blueprint
                      </span>
                    </div>

                    <p className={`mt-3 max-w-3xl text-sm leading-7 ${theme.textSoft}`}>
                      {type.description || "No description provided."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tagMuted}`}>
                        {type.fields?.length || 0} fields
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tagMuted}`}>
                        {type.roles?.length || 0} roles
                      </span>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className={`rounded-2xl border p-4 ${theme.modalSurface}`}>
                        <div className={`mb-3 text-xs font-semibold uppercase tracking-[0.16em] ${theme.modalMuted}`}>
                          Field Preview
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {fieldPreview.map((field, index) => (
                            <span
                              key={`${type.id}-field-${index}`}
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tag}`}
                            >
                              {field.name || "Unnamed"}: {field.type || "string"}
                            </span>
                          ))}
                          {extraFields > 0 && (
                            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tagMuted}`}>
                              +{extraFields} more
                            </span>
                          )}
                          {fieldPreview.length === 0 && (
                            <div className={`text-sm ${theme.modalMuted}`}>No fields defined.</div>
                          )}
                        </div>
                      </div>

                      <div className={`rounded-2xl border p-4 ${theme.modalSurface}`}>
                        <div className={`mb-3 text-xs font-semibold uppercase tracking-[0.16em] ${theme.modalMuted}`}>
                          Role Preview
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {rolePreview.map((role, index) => (
                            <span
                              key={`${type.id}-role-${index}`}
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.highlightTag}`}
                            >
                              {role}
                            </span>
                          ))}
                          {extraRoles > 0 && (
                            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tagMuted}`}>
                              +{extraRoles} more
                            </span>
                          )}
                          {rolePreview.length === 0 && (
                            <div className={`text-sm ${theme.modalMuted}`}>No roles assigned.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="resource-type-card__actions flex flex-wrap items-center gap-2 whitespace-nowrap">
                    <button
                      onClick={() => openEditModal(type)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${theme.buttonWarning}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteType(type.id)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${theme.buttonDanger}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {showAdd && (
        <ModalPortal>
          <div className={`resource-types-modal-backdrop resource-types-modal-backdrop--${config.domain} fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4`}>
            <div className={`resource-types-modal resource-types-modal--${config.domain} max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] border p-5 shadow-xl sm:p-6 ${theme.modalCard}`}>
            <h2 className={`mb-4 text-2xl font-bold ${theme.textStrong}`}>Add Resource Type</h2>

            <div className="mb-6 space-y-3">
              <input
                type="text"
                placeholder="Type name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={`w-full rounded-2xl border px-4 py-3 outline-none ${theme.input}`}
              />

              <input
                type="text"
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={`w-full rounded-2xl border px-4 py-3 outline-none ${theme.input}`}
              />
            </div>

            <h3 className={`mb-2 text-lg font-semibold ${theme.textStrong}`}>Fields</h3>
            <FieldTable rows={form.fields} onChange={handleAddFieldChange} onDelete={deleteFieldRow} />

            <button
              onClick={addFieldRow}
              className={`mb-6 mt-3 rounded-2xl px-4 py-2 font-semibold transition ${theme.buttonNeutral}`}
            >
              + Add Field
            </button>

            <h3 className={`mb-2 text-lg font-semibold ${theme.textStrong}`}>Roles</h3>
            <RoleEditor
              roles={form.roles}
              roleInput={roleInput}
              setRoleInput={setRoleInput}
              onAddRole={() => {
                if (!roleInput.trim()) return;
                setForm((prev) => ({
                  ...prev,
                  roles: [...prev.roles, roleInput.trim()],
                }));
                setRoleInput("");
              }}
              onRemoveRole={(index) =>
                setForm((prev) => ({
                  ...prev,
                  roles: prev.roles.filter((_, idx) => idx !== index),
                }))
              }
            />

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className={`rounded-2xl border px-4 py-2 font-semibold ${theme.buttonGhost}`}
                >
                  Cancel
                </button>

                <button
                  onClick={saveNewType}
                  className={`rounded-2xl px-4 py-2 font-semibold transition ${theme.buttonPrimary}`}
                >
                  Save Type
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {editModal.open && (
        <ModalPortal>
          <div className={`resource-types-modal-backdrop resource-types-modal-backdrop--${config.domain} fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4`}>
            <div className={`resource-types-modal resource-types-modal--${config.domain} max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] border p-5 shadow-xl sm:p-6 ${theme.modalCard}`}>
            <h2 className={`mb-4 text-2xl font-bold ${theme.textStrong}`}>
              Edit Resource Type - {editModal.type.name}
            </h2>

            <div className="mb-6 space-y-3">
              <input
                type="text"
                value={editModal.type.name}
                onChange={(e) =>
                  setEditModal((prev) => ({
                    ...prev,
                    type: { ...prev.type, name: e.target.value },
                  }))
                }
                className={`w-full rounded-2xl border px-4 py-3 outline-none ${theme.input}`}
              />

              <input
                type="text"
                value={editModal.type.description}
                onChange={(e) =>
                  setEditModal((prev) => ({
                    ...prev,
                    type: { ...prev.type, description: e.target.value },
                  }))
                }
                className={`w-full rounded-2xl border px-4 py-3 outline-none ${theme.input}`}
              />
            </div>

            <h3 className={`mb-2 text-lg font-semibold ${theme.textStrong}`}>Fields</h3>
            <FieldTable
              rows={editModal.fields}
              onChange={handleEditFieldChange}
              onDelete={deleteEditFieldRow}
            />

            <button
              onClick={addEditFieldRow}
              className={`mb-6 mt-3 rounded-2xl px-4 py-2 font-semibold transition ${theme.buttonNeutral}`}
            >
              + Add Field
            </button>

            <h3 className={`mb-2 text-lg font-semibold ${theme.textStrong}`}>Roles</h3>
            <RoleEditor
              roles={editModal.roles}
              roleInput={editModal.roleInput}
              setRoleInput={(value) =>
                setEditModal((prev) => ({
                  ...prev,
                  roleInput: value,
                }))
              }
              onAddRole={() => {
                const value = editModal.roleInput.trim();
                if (!value) return;
                setEditModal((prev) => ({
                  ...prev,
                  roles: [...prev.roles, value],
                  roleInput: "",
                }));
              }}
              onRemoveRole={(index) =>
                setEditModal((prev) => ({
                  ...prev,
                  roles: prev.roles.filter((_, idx) => idx !== index),
                }))
              }
            />

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() =>
                    setEditModal({ open: false, type: null, fields: [], roles: [], roleInput: "" })
                  }
                  className={`rounded-2xl border px-4 py-2 font-semibold ${theme.buttonGhost}`}
                >
                  Cancel
                </button>

                <button
                  onClick={saveEditType}
                  className={`rounded-2xl px-4 py-2 font-semibold transition ${theme.buttonPrimary}`}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
