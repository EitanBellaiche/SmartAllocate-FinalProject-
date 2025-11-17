import { Outlet, NavLink } from "react-router-dom";


export default function MainLayout() {
  return (
    <div className="flex min-h-screen bg-gray-100 text-gray-900">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white shadow-lg flex flex-col">
        <div className="px-6 py-4 border-b">
          <h1 className="text-2xl font-bold text-blue-600">
            SmartAllocate
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Resource & room scheduling
          </p>
        </div>

        <nav className="flex-1 px-4 pt-4 space-y-2">
          <NavItem to="/resource-types">Resource Types</NavItem>
          <NavItem to="/">Dashboard</NavItem>
          <NavItem to="/resources">Resources</NavItem>
          <NavItem to="/bookings">Bookings</NavItem>
          <NavItem to="/users">Users</NavItem>
        </nav>

        <div className="px-4 py-3 text-xs text-gray-400 border-t">
          © {new Date().getFullYear()} SmartAllocate
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        [
          "block px-3 py-2 rounded-md text-sm font-medium",
          isActive
            ? "bg-blue-50 text-blue-600 border border-blue-100"
            : "text-gray-700 hover:bg-gray-100 hover:text-blue-600",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
