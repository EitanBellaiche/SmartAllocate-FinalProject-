import { useState, useEffect } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/api";

export default function ResourceTypes() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Modal
  const [showAdd, setShowAdd] = useState(false);

  // Edit Modal
  const [editModal, setEditModal] = useState({
    open: false,
    type: null,
    fields: [],
    roles: [],
    roleInput: "",
  });

  // Form for new type
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
      setTypes(data);
    } catch (err) {
      console.error("Error loading resource types:", err);
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // DELETE TYPE
  // -----------------------------
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

  // -----------------------------
  // ADD TYPE LOGIC
  // -----------------------------
  function addFieldRow() {
    setForm((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        { name: "", type: "string", required: false, default: "" },
      ],
    }));
  }

  function deleteFieldRow(i) {
    const updated = [...form.fields];
    updated.splice(i, 1);
    setForm((prev) => ({ ...prev, fields: updated }));
  }

  function handleAddFieldChange(i, key, value) {
    const updated = [...form.fields];
    updated[i][key] = value;
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

  // -----------------------------
  // EDIT TYPE LOGIC
  // -----------------------------
  function openEditModal(typeData) {
    setEditModal({
      open: true,
      type: { ...typeData },
      fields: JSON.parse(JSON.stringify(typeData.fields || [])),
      roles: Array.isArray(typeData.roles) ? [...typeData.roles] : [],
      roleInput: "",
    });
  }

  function handleEditFieldChange(i, key, value) {
    const updated = [...editModal.fields];
    updated[i][key] = value;
    setEditModal((p) => ({ ...p, fields: updated }));
  }

  function addEditFieldRow() {
    setEditModal((p) => ({
      ...p,
      fields: [
        ...p.fields,
        { name: "", type: "string", required: false, default: "" },
      ],
    }));
  }

  function deleteEditFieldRow(i) {
    const updated = [...editModal.fields];
    updated.splice(i, 1);
    setEditModal((p) => ({ ...p, fields: updated }));
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

  // -----------------------------
  // RENDER
  // -----------------------------

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Resource Types</h1>

        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Add Type
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow rounded-lg border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Description</th>
              <th className="p-3">Fields</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {types.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-3">{t.id}</td>
                <td className="p-3 font-medium">{t.name}</td>
                <td className="p-3">{t.description}</td>
                <td className="p-3">{t.fields?.length || 0}</td>
                <td className="p-3">{t.roles?.length || 0}</td>
                <td className="p-3 flex gap-2">
                  <button
                    onClick={() => openEditModal(t)}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteType(t.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------ */}
      {/* ADD TYPE MODAL */}
      {/* ------------------------------------------------ */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[600px] shadow-xl">
            <h2 className="text-xl font-bold mb-4">Add Resource Type</h2>

            {/* BASIC INFO */}
            <div className="space-y-3 mb-6">
              <input
                type="text"
                placeholder="Type name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full p-2 border rounded"
              />

              <input
                type="text"
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="w-full p-2 border rounded"
              />
            </div>

            {/* FIELDS TABLE */}
            <h3 className="text-lg font-semibold mb-2">Fields</h3>

            <table className="w-full border mb-3">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-2 border">Name</th>
                  <th className="p-2 border">Type</th>
                  <th className="p-2 border">Required</th>
                  <th className="p-2 border">Default</th>
                  <th className="p-2 border">Actions</th>
                </tr>
              </thead>

              <tbody>
                {form.fields.map((f, i) => (
                  <tr key={i} className="border">
                    <td className="p-2 border">
                      <input
                        type="text"
                        value={f.name}
                        onChange={(e) =>
                          handleAddFieldChange(i, "name", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    </td>

                    <td className="p-2 border">
                      <select
                        value={f.type}
                        onChange={(e) =>
                          handleAddFieldChange(i, "type", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </td>

                    <td className="p-2 border text-center">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) =>
                          handleAddFieldChange(i, "required", e.target.checked)
                        }
                      />
                    </td>

                    <td className="p-2 border">
                      <input
                        type="text"
                        value={f.default}
                        onChange={(e) =>
                          handleAddFieldChange(i, "default", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    </td>

                    <td className="p-2 border text-center">
                      <button
                        onClick={() => deleteFieldRow(i)}
                        className="text-red-600 hover:text-red-800 font-bold"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ADD FIELD BUTTON */}
            <button
              onClick={addFieldRow}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 mb-4"
            >
              + Add Field
            </button>

            {/* ROLES */}
            <h3 className="text-lg font-semibold mb-2">Roles</h3>

            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Role name"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                className="flex-1 p-2 border rounded"
              />
              <button
                onClick={() => {
                  if (!roleInput.trim()) return;
                  setForm((prev) => ({
                    ...prev,
                    roles: [...prev.roles, roleInput.trim()],
                  }));
                  setRoleInput("");
                }}
                className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Add Role
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {form.roles.map((role, i) => (
                <span
                  key={`${role}-${i}`}
                  className="bg-gray-100 px-2 py-1 rounded text-sm"
                >
                  {role}
                  <button
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        roles: prev.roles.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="ml-2 text-red-600"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={saveNewType}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Type
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* EDIT TYPE MODAL */}
      {/* ------------------------------------------------ */}
      {editModal.open && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[600px] shadow-xl">
            <h2 className="text-xl font-bold mb-4">
              Edit Resource Type – {editModal.type.name}
            </h2>

            {/* BASIC INFO */}
            <div className="space-y-3 mb-6">
              <input
                type="text"
                value={editModal.type.name}
                onChange={(e) =>
                  setEditModal((p) => ({
                    ...p,
                    type: { ...p.type, name: e.target.value },
                  }))
                }
                className="w-full p-2 border rounded"
              />

              <input
                type="text"
                value={editModal.type.description}
                onChange={(e) =>
                  setEditModal((p) => ({
                    ...p,
                    type: { ...p.type, description: e.target.value },
                  }))
                }
                className="w-full p-2 border rounded"
              />
            </div>

            {/* FIELDS TABLE */}
            <h3 className="text-lg font-semibold mb-2">Fields</h3>

            <table className="w-full border mb-3">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-2 border">Name</th>
                  <th className="p-2 border">Type</th>
                  <th className="p-2 border">Required</th>
                  <th className="p-2 border">Default</th>
                  <th className="p-2 border">Actions</th>
                </tr>
              </thead>

              <tbody>
                {editModal.fields.map((f, i) => (
                  <tr key={i} className="border">
                    <td className="p-2 border">
                      <input
                        type="text"
                        value={f.name}
                        onChange={(e) =>
                          handleEditFieldChange(i, "name", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    </td>

                    <td className="p-2 border">
                      <select
                        value={f.type}
                        onChange={(e) =>
                          handleEditFieldChange(i, "type", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </td>

                    <td className="p-2 border text-center">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) =>
                          handleEditFieldChange(i, "required", e.target.checked)
                        }
                      />
                    </td>

                    <td className="p-2 border">
                      <input
                        type="text"
                        value={f.default}
                        onChange={(e) =>
                          handleEditFieldChange(i, "default", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    </td>

                    <td className="p-2 border text-center">
                      <button
                        onClick={() => deleteEditFieldRow(i)}
                        className="text-red-600 hover:text-red-800 font-bold"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ADD FIELD BUTTON */}
            <button
              onClick={addEditFieldRow}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 mb-4"
            >
              + Add Field
            </button>

            {/* ROLES */}
            <h3 className="text-lg font-semibold mb-2">Roles</h3>

            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Role name"
                value={editModal.roleInput}
                onChange={(e) =>
                  setEditModal((p) => ({ ...p, roleInput: e.target.value }))
                }
                className="flex-1 p-2 border rounded"
              />
              <button
                onClick={() => {
                  const value = editModal.roleInput.trim();
                  if (!value) return;
                  setEditModal((p) => ({
                    ...p,
                    roles: [...p.roles, value],
                    roleInput: "",
                  }));
                }}
                className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Add Role
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {editModal.roles.map((role, i) => (
                <span
                  key={`${role}-${i}`}
                  className="bg-gray-100 px-2 py-1 rounded text-sm"
                >
                  {role}
                  <button
                    onClick={() =>
                      setEditModal((p) => ({
                        ...p,
                        roles: p.roles.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="ml-2 text-red-600"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() =>
                  setEditModal({ open: false, type: null, fields: [], roles: [], roleInput: "" })
                }
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={saveEditType}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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
