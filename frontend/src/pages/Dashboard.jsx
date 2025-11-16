export default function Dashboard() {
  return (
    <div className="space-y-6">
      {}
      <header>
        <h1 className="text-3xl font-bold text-gray-900">
          Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of rooms, resources and bookings in SmartAllocate.
        </p>
      </header>

      {}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Resources" value="–" note="(coming from API)" />
        <StatCard label="Bookings Today" value="–" note="(coming from API)" />
        <StatCard label="Pending Approvals" value="–" note="(coming from API)" />
      </section>

      {}
      <section className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-semibold mb-2">
          Upcoming bookings (POC)
        </h2>
        <p className="text-sm text-gray-500">
          Soon we&apos;ll show here a table of the next bookings fetched from the backend.
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value, note }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-1">
      <span className="text-xs uppercase text-gray-400">{label}</span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {note && <span className="text-xs text-gray-400">{note}</span>}
    </div>
  );
}
