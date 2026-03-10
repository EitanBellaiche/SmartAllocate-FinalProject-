import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { clearAdminSession } from "../api/api";

const DEFAULT_USER_URL = "http://localhost:4173";
const RAW_USER_URL = import.meta.env.VITE_USER_URL;
function getUserUrl() {
  if (!RAW_USER_URL) return DEFAULT_USER_URL;
  try {
    return new URL(RAW_USER_URL).toString();
  } catch {
    return DEFAULT_USER_URL;
  }
}

export default function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 lg:flex">
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-white border-b px-4 py-3 shadow-sm">
        <div>
          <div className="text-lg font-bold text-blue-600">SmartAllocate</div>
          <div className="text-xs text-gray-500">Resource & room scheduling</div>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium text-gray-700"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
      </div>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu overlay"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={closeMenu}
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-white shadow-lg flex flex-col transform transition-transform duration-200 lg:static lg:w-64 lg:max-w-none lg:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="px-6 py-4 border-b">
          <h1 className="text-2xl font-bold text-blue-600">
            SmartAllocate
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Resource & room scheduling
          </p>
        </div>

        <nav className="flex-1 px-4 pt-4 space-y-2">
          <NavItem to="/" onClick={closeMenu}>Dashboard</NavItem>
          <NavItem to="/resource-types" onClick={closeMenu}>Resource Types</NavItem>
          <NavItem to="/resources" onClick={closeMenu}>Resources</NavItem>
          <NavItem to="/availability" onClick={closeMenu}>Calendar</NavItem>
          <NavItem to="/bookings" onClick={closeMenu}>Bookings</NavItem>
          <NavItem to="/user-bookings" onClick={closeMenu}>User Bookings</NavItem>
          <NavItem to="/requests" onClick={closeMenu}>Requests</NavItem>

          {/* ⭐ הוספת דף החוקים */}
          <NavItem to="/rules" onClick={closeMenu}>Rules</NavItem>
        </nav>

        <div className="px-4 py-3 border-t">
          <button
            type="button"
            onClick={() => {
              clearAdminSession();
              window.location.assign(getUserUrl());
            }}
            className="w-full text-left text-sm font-medium text-gray-600 hover:text-blue-600"
          >
            Sign out
          </button>
          <div className="mt-2 text-xs text-gray-400">
          © {new Date().getFullYear()} SmartAllocate
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children, onClick }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
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
