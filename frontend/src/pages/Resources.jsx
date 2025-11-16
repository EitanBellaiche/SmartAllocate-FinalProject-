import { useEffect, useState } from "react";
import { apiGet } from "../api/api";

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiGet("/resources");
        setResources(data);
      } catch (err) {
        console.error("Failed loading resources:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Resources</h1>

      {/* Table */}
      <div className="bg-white shadow rounded-lg border border-gray-200 p-4">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Projector</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-2">{r.id}</td>
                <td>{r.name}</td>
                <td>{r.type_name || r.type_id}</td>
                <td>{r.capacity}</td>
                <td>{r.metadata?.projector ? "Yes" : "No"}</td>
                <td>
                  <span
                    className={
                      r.active
                        ? "text-green-600 font-semibold"
                        : "text-red-600 font-semibold"
                    }
                  >
                    {r.active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
