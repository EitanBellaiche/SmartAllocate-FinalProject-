import { useEffect, useState } from "react";
import { apiGet } from "../api/api";

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBookings() {
      try {
        const data = await apiGet("/bookings");
        setBookings(data);
      } catch (err) {
        console.error("Error loading bookings:", err);
      } finally {
        setLoading(false);
      }
    }

    loadBookings();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Bookings</h1>

        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          + Add Booking
        </button>
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Resource</th>
              <th className="p-3">User</th>
              <th className="p-3">Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {bookings.map((bk) => (
              <tr key={bk.id} className="border-t">
                <td className="p-3">{bk.id}</td>
                <td className="p-3">{bk.resource_id}</td>
                <td className="p-3">{bk.user_id}</td>
                <td className="p-3">{bk.date?.split("T")[0]}</td>

                <td className="p-3">
                  <span
                    className={
                      "px-2 py-1 rounded text-sm font-medium " +
                      (bk.status === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : bk.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700")
                    }
                  >
                    {bk.status || "pending"}
                  </span>
                </td>

                <td className="p-3">
                  <button className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 mr-2">
                    Edit
                  </button>
                  <button className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600">
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {bookings.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center p-5 text-gray-500">
                  No bookings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
