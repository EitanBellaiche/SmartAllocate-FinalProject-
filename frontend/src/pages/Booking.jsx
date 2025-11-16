import { useEffect, useState } from "react";
import { apiGet } from "../api/api";

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiGet("/bookings");
        setBookings(data);
      } catch (err) {
        console.error("Failed loading bookings:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Bookings</h1>

      <div className="bg-white shadow rounded-lg border border-gray-200 p-4">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">ID</th>
              <th>Resource</th>
              <th>User</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b hover:bg-gray-50">
                <td className="py-2">{b.id}</td>
                <td>{b.resource_id}</td>
                <td>{b.user_id}</td>
                <td>{b.date?.split("T")[0]}</td>
                <td>
                  <span
                    className={
                      b.status === "pending"
                        ? "text-yellow-600 font-medium"
                        : "text-green-600 font-medium"
                    }
                  >
                    {b.status}
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
