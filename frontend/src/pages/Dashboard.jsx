import { useEffect, useState } from "react";
import { apiGet } from "../api/api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        // מושך נתונים מהשרת
        const resources = await apiGet("/resources");
console.log("RESOURCES FROM API:", resources);

const bookings = await apiGet("/bookings");
console.log("BOOKINGS FROM API:", bookings);


        // היום בפורמט YYYY-MM-DD
        const today = new Date().toISOString().split("T")[0];

        // ממיינים הזמנות לפי היום
        const bookingsToday = bookings.filter(
          (b) => b.date.startsWith(today)
        );

        const pending = bookings.filter(
          (b) => b.status === "pending"
        );

        setStats({
          totalResources: resources.length,
          bookingsToday: bookingsToday.length,
          pending: pending.length,
          totalBookings: bookings.length,
        });
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!stats) return <p className="text-red-500">Failed to load data.</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Resources" value={stats.totalResources} />
        <StatCard title="Bookings Today" value={stats.bookingsToday} />
        <StatCard title="Pending Approvals" value={stats.pending} />
        <StatCard title="Total Bookings" value={stats.totalBookings} />
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="p-5 bg-white shadow rounded-lg border border-gray-200">
      <p className="text-gray-500 text-sm">{title}</p>
      <p className="text-3xl font-bold text-blue-600">{value}</p>
    </div>
  );
}
