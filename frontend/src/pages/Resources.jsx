import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/api";

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    type_id: "",
    capacity: "",
    projector: false,
  });

  useEffect(() => {
    loadResources();
  }, []);

  async function loadResources() {
    try {
      const data = await apiGet("/resources");
      setResources(data);
    } catch (err) {
      console.error("Error loading resources:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function submitNewResource() {
    try {
      await apiPost("/resources", {
        name: form.name,
        type_id: Number(form.type_id),
        capacity: Number(form.capacity),
        metadata: { projector: form.projector },
      });

      setShowModal(false);
      setForm({ name: "", type_id: "", capacity: "", projector: false });
      loadResources(); // refresh table
    } catch (err) {
      console.error("Create resource error:", err);
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Resources</h1>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Add Resource
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow rounded-lg border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Type</th>
              <th className="p-3">Capacity</th>
              <th className="p-3">Projector</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.id}</td>
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.type_name}</td>
                <td className="p-3">{r.capacity}</td>
                <td className="p-3">{r.metadata?.projector ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add Resource</h2>

            <div className="space-y-3">
              <input
                name="name"
                type="text"
                placeholder="Resource name"
                value={form.name}
                onChange={handleFormChange}
                className="w-full p-2 border rounded"
              />

              <input
                name="type_id"
                type="number"
                placeholder="Type ID (1 = Classroom)"
                value={form.type_id}
                onChange={handleFormChange}
                className="w-full p-2 border rounded"
              />

              <input
                name="capacity"
                type="number"
                placeholder="Capacity"
                value={form.capacity}
                onChange={handleFormChange}
                className="w-full p-2 border rounded"
              />

              <label className="flex items-center gap-2">
                <input
                  name="projector"
                  type="checkbox"
                  checked={form.projector}
                  onChange={handleFormChange}
                />
                Projector included
              </label>
            </div>

            <div className="flex justify-end mt-6 gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={submitNewResource}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
