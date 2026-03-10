import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/api";

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [types, setTypes] = useState([]);

  const [loading, setLoading] = useState(true);

  // Add Resource Modal
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm] = useState({
    name: "",
    type_id: "",
    metadata: {},
  });

  // View Details Modal
  const [detailsModal, setDetailsModal] = useState({
    open: false,
    item: null,
  });

  // Edit Resource Modal
  const [showEdit, setShowEdit] = useState(false);
  const [editSelectedType, setEditSelectedType] = useState(null);
  const [editForm, setEditForm] = useState({
    id: null,
    name: "",
    type_id: "",
    metadata: {},
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

      setResources(resData);
      setTypes(typeData);
    } catch (err) {
      console.error("Error loading resources:", err);
    } finally {
      setLoading(false);
    }
  }
  // ---------------------------
  // ADD RESOURCE
  // ---------------------------

function handleSelectType(typeId) {
  const type = types.find((t) => t.id === Number(typeId));
  setSelectedType(type);

  if (!type || !Array.isArray(type.fields)) {
    setForm({
      name: "",
      type_id: typeId,
      metadata: {},
    });
    return;
  }

  // Reset metadata dynamically based on fields
  const meta = {};
  type.fields.forEach((f) => {
    meta[f.name] = f.default || (f.type === "boolean" ? false : "");
  });

  setForm({
    name: "",
    type_id: typeId,
    metadata: meta,
  });
}

  function handleEditSelectType(typeId) {
    const type = types.find((t) => t.id === Number(typeId));
    setEditSelectedType(type);

    if (!type || !Array.isArray(type.fields)) {
      setEditForm((prev) => ({
        ...prev,
        type_id: typeId,
        metadata: {},
      }));
      return;
    }

    const meta = {};
    type.fields.forEach((f) => {
      const existing = editForm.metadata?.[f.name];
      meta[f.name] = existing !== undefined ? existing : (f.default || (f.type === "boolean" ? false : ""));
    });

    setEditForm((prev) => ({
      ...prev,
      type_id: typeId,
      metadata: meta,
    }));
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

  async function saveResource() {
    try {
      await apiPost("/resources", form);
      setShowAdd(false);
      setSelectedType(null);
      setForm({ name: "", type_id: "", metadata: {} });
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
      loadData();
    } catch (err) {
      console.error("Error updating resource:", err);
    }
  }

  // ---------------------------
  // DELETE RESOURCE
  // ---------------------------
  async function deleteResource(id) {
    if (!confirm("Are you sure you want to delete this resource?")) return;

    try {
      await apiDelete(`/resources/${id}`);
      loadData();
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  // ---------------------------
  //   RENDER
  // ---------------------------

  if (loading)
    return <p className="text-gray-500">Loading resources...</p>;

  return (
    <div>
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <h1 className="text-3xl font-bold">Resources</h1>

        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Add Resource
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Type</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.id}</td>
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3">{r.type_name}</td>

                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      setDetailsModal({ open: true, item: r })
                    }
                    className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                  >
                    View
                  </button>

                  <button
                    onClick={() => openEdit(r)}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteResource(r.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------ */}
      {/* ADD RESOURCE MODAL */}
      {/* ------------------------------------------------ */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-center items-center p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg w-full max-w-[600px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Add Resource</h2>

            <label className="block mb-2 font-medium">Select Type</label>
            <select
              className="w-full p-2 border rounded mb-4"
              value={form.type_id}
              onChange={(e) => handleSelectType(e.target.value)}
            >
              <option value="">-- Select Type --</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Resource name"
              className="w-full p-2 border rounded mb-4"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />

            {selectedType && selectedType.fields && Array.isArray(selectedType.fields) && (
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
                        checked={form.metadata[field.name] || false}
                        onChange={(e) =>
                          handleMetadataChange(field.name, e.target.checked)
                        }
                      />
                    ) : (
                      <input
                        type={field.type === "number" ? "number" : "text"}
                        className="w-full p-2 border rounded"
                        value={form.metadata[field.name]}
                        onChange={(e) =>
                          handleMetadataChange(field.name, e.target.value)
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
                  setShowAdd(false);
                  setSelectedType(null);
                }}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={saveResource}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Resource
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* EDIT RESOURCE MODAL */}
      {/* ------------------------------------------------ */}
      {showEdit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-center items-center p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg w-full max-w-[600px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit Resource</h2>

            <label className="block mb-2 font-medium">Select Type</label>
            <select
              className="w-full p-2 border rounded mb-4"
              value={editForm.type_id}
              onChange={(e) => handleEditSelectType(e.target.value)}
            >
              <option value="">-- Select Type --</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Resource name"
              className="w-full p-2 border rounded mb-4"
              value={editForm.name}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />

            {editSelectedType && editSelectedType.fields && Array.isArray(editSelectedType.fields) && (
              <>
                <h3 className="font-semibold mb-2">Resource Fields</h3>
                {editSelectedType.fields.map((field, i) => (
                  <div key={i} className="mb-3">
                    <label className="block text-sm font-medium mb-1">
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
                        className="w-full p-2 border rounded"
                        value={editForm.metadata[field.name] ?? ""}
                        onChange={(e) =>
                          handleEditMetadataChange(field.name, e.target.value)
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
                  setShowEdit(false);
                  setEditSelectedType(null);
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

      {/* ------------------------------------------------ */}
      {/* VIEW DETAILS MODAL */}
      {/* ------------------------------------------------ */}
      {detailsModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-center items-center p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg w-full max-w-[500px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Resource Details – {detailsModal.item.name}
            </h2>

            <p className="text-sm mb-2">
              <strong>Type:</strong> {detailsModal.item.type_name}
            </p>

            <h3 className="font-semibold mt-4 mb-2">Fields</h3>

            <pre className="bg-gray-100 p-4 rounded text-sm border">
              {JSON.stringify(detailsModal.item.metadata, null, 2)}
            </pre>

            <div className="flex justify-end mt-4">
              <button
                onClick={() =>
                  setDetailsModal({ open: false, item: null })
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
