import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";

function sortTypesAlphabetically(items) {
  return [...items].sort(
    (a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
        sensitivity: "base",
      }) || Number(a?.id || 0) - Number(b?.id || 0)
  );
}

function MetricCard({ label, value, tone = "slate" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone] || tones.slate}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}

function FieldTable({ rows, onChange, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-[640px] w-full text-left">
        <thead className="bg-slate-100 text-slate-700">
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
            <tr key={index} className="bg-white">
              <td className="border-b border-slate-100 px-3 py-3">
                <input
                  type="text"
                  value={field.name}
                  onChange={(e) => onChange(index, "name", e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </td>
              <td className="border-b border-slate-100 px-3 py-3">
                <select
                  value={field.type}
                  onChange={(e) => onChange(index, "type", e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
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
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-center">
                <button
                  onClick={() => onDelete(index)}
                  className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
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
          className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
        />
        <button
          onClick={onAddRole}
          className="rounded-2xl bg-slate-200 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-300"
        >
          Add Role
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {roles.map((role, index) => (
          <span
            key={`${role}-${index}`}
            className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            {role}
            <button
              onClick={() => onRemoveRole(index)}
              className="ml-2 text-red-600 transition hover:text-red-700"
            >
              x
            </button>
          </span>
        ))}
        {roles.length === 0 && <div className="text-sm text-slate-500">No roles defined yet.</div>}
      </div>
    </>
  );
}

export default function ResourceTypes() {
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

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-amber-50 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Schema Manager
            </div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Resource Types</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Define the resource blueprints used across the platform, including their
              fields, rules, and role assignments.
            </p>
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex h-fit items-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
          >
            + Add Type
          </button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Total Types" value={types.length} tone="blue" />
          <MetricCard label="Total Fields" value={totalFields} tone="slate" />
          <MetricCard label="Total Roles" value={totalRoles} tone="amber" />
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="grid gap-4">
          {sortTypesAlphabetically(types).map((type) => {
            const fieldPreview = Array.isArray(type.fields) ? type.fields.slice(0, 3) : [];
            const extraFields = Math.max((type.fields?.length || 0) - fieldPreview.length, 0);
            const rolePreview = Array.isArray(type.roles) ? type.roles.slice(0, 3) : [];
            const extraRoles = Math.max((type.roles?.length || 0) - rolePreview.length, 0);

            return (
              <article
                key={type.id}
                className="rounded-[24px] border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-bold text-slate-900">{type.name}</h2>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                        Blueprint
                      </span>
                    </div>

                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                      {type.description || "No description provided."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {type.fields?.length || 0} fields
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {type.roles?.length || 0} roles
                      </span>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Field Preview
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {fieldPreview.map((field, index) => (
                            <span
                              key={`${type.id}-field-${index}`}
                              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                            >
                              {field.name || "Unnamed"}: {field.type || "string"}
                            </span>
                          ))}
                          {extraFields > 0 && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                              +{extraFields} more
                            </span>
                          )}
                          {fieldPreview.length === 0 && (
                            <div className="text-sm text-slate-500">No fields defined.</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Role Preview
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {rolePreview.map((role, index) => (
                            <span
                              key={`${type.id}-role-${index}`}
                              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                            >
                              {role}
                            </span>
                          ))}
                          {extraRoles > 0 && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                              +{extraRoles} more
                            </span>
                          )}
                          {rolePreview.length === 0 && (
                            <div className="text-sm text-slate-500">No roles assigned.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                    <button
                      onClick={() => openEditModal(type)}
                      className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteType(type.id)}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] bg-white p-5 shadow-xl sm:p-6">
            <h2 className="mb-4 text-2xl font-bold text-slate-900">Add Resource Type</h2>

            <div className="mb-6 space-y-3">
              <input
                type="text"
                placeholder="Type name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />

              <input
                type="text"
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <h3 className="mb-2 text-lg font-semibold text-slate-900">Fields</h3>
            <FieldTable rows={form.fields} onChange={handleAddFieldChange} onDelete={deleteFieldRow} />

            <button
              onClick={addFieldRow}
              className="mb-6 mt-3 rounded-2xl bg-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-300"
            >
              + Add Field
            </button>

            <h3 className="mb-2 text-lg font-semibold text-slate-900">Roles</h3>
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
                className="rounded-2xl border border-slate-200 px-4 py-2 font-semibold text-slate-700"
              >
                Cancel
              </button>

              <button
                onClick={saveNewType}
                className="rounded-2xl bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
              >
                Save Type
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] bg-white p-5 shadow-xl sm:p-6">
            <h2 className="mb-4 text-2xl font-bold text-slate-900">
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
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
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
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <h3 className="mb-2 text-lg font-semibold text-slate-900">Fields</h3>
            <FieldTable
              rows={editModal.fields}
              onChange={handleEditFieldChange}
              onDelete={deleteEditFieldRow}
            />

            <button
              onClick={addEditFieldRow}
              className="mb-6 mt-3 rounded-2xl bg-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-300"
            >
              + Add Field
            </button>

            <h3 className="mb-2 text-lg font-semibold text-slate-900">Roles</h3>
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
                className="rounded-2xl border border-slate-200 px-4 py-2 font-semibold text-slate-700"
              >
                Cancel
              </button>

              <button
                onClick={saveEditType}
                className="rounded-2xl bg-green-600 px-4 py-2 font-semibold text-white transition hover:bg-green-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
