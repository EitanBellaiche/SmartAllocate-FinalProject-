import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api/api";

export default function Availability() {
  const [availability, setAvailability] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);

  const [form, setForm] = useState({
    resource_id: "",
    day_of_week: "",
    start_time: "",
    end_time: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [av, res] = await Promise.all([
        apiGet("/availability"),
        apiGet("/resources")
      ]);

      setAvailability(av);
      setResources(res);
    } catch (err) {
      console.error("Error loading availability:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveAvailability() {
    try {
      await apiPost("/availability", form);
      setShowAdd(false);
      setForm({
        resource_id: "",
        day_of_week: "",
        start_time: "",
        end_time: ""
      });
      loadData();
    } catch (error) {
      console.error("Error saving availability:", error);
    }
  }

  async function removeAvailability(id) {
    if (!confirm("Are you sure?")) return;

    try {
      await apiDelete(`/availability/${id}`);
      loadData();
    } catch (err) {
      console.error("Error deleting:", err);
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Availability</h1>

        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Add Availability
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow border rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">Resource</th>
              <th className="p-3">Day</th>
              <th className="p-3">Start</th>
              <th className="p-3">End</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {availability.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3">{a.resource_name}</td>
                <td className="p-3">{a.day_of_week}</td>
                <td className="p-3">{a.start_time}</td>
                <td className="p-3">{a.end_time}</td>
                <td className="p-3">
                  <button
                    onClick={() => removeAvailability(a.id)}
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

      {/* ADD MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[450px] shadow-xl">
            <h2 className="text-xl font-bold mb-4">Add Availability</h2>

            {/* Resource */}
            <select
              className="w-full p-2 border rounded mb-3"
              value={form.resource_id}
              onChange={(e) =>
                setForm((p) => ({ ...p, resource_id: e.target.value }))
              }
            >
              <option value="">-- Select Resource --</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            {/* Day */}
            <select
              className="w-full p-2 border rounded mb-3"
              value={form.day_of_week}
              onChange={(e) =>
                setForm((p) => ({ ...p, day_of_week: e.target.value }))
              }
            >
              <option value="">-- Select Day --</option>
              <option value="sun">Sunday</option>
              <option value="mon">Monday</option>
              <option value="tue">Tuesday</option>
              <option value="wed">Wednesday</option>
              <option value="thu">Thursday</option>
              <option value="fri">Friday</option>
              <option value="sat">Saturday</option>
            </select>

            {/* Times */}
            <input
              type="time"
              className="w-full p-2 border rounded mb-3"
              value={form.start_time}
              onChange={(e) =>
                setForm((p) => ({ ...p, start_time: e.target.value }))
              }
            />

            <input
              type="time"
              className="w-full p-2 border rounded mb-4"
              value={form.end_time}
              onChange={(e) =>
                setForm((p) => ({ ...p, end_time: e.target.value }))
              }
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={saveAvailability}
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
