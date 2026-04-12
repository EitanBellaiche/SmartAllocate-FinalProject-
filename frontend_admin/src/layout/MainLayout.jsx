import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { clearAdminSession } from "../api/api";
import { getOrgConfig } from "../orgConfig";

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
  const config = getOrgConfig();
  const theme = config.theme;
  const isCinema = config.domain === "cinema";

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div
      className={`min-h-screen lg:flex ${theme.pageBg || "bg-gray-100"} ${theme.textStrong || "text-gray-900"}`}
    >
      <div
        className={`lg:hidden sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 shadow-sm ${theme.card}`}
      >
        <div>
          <div className={`text-lg font-bold ${isCinema ? "text-indigo-600" : theme.textStrong}`}>
            SmartAllocate
          </div>
          <div className={`text-xs ${theme.textSoft}`}>Resource & room scheduling</div>
        </div>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium ${theme.buttonGhost}`}
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
          `fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r backdrop-blur flex flex-col transform transition-transform duration-200 lg:static lg:w-64 lg:max-w-none lg:translate-x-0 ${theme.card}`,
          menuOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className={`px-6 py-4 border-b ${theme.card}`}>
          <h1 className={`text-2xl font-semibold ${isCinema ? "text-indigo-600" : theme.textStrong}`}>
            SmartAllocate
          </h1>
          <p className={`text-xs -mt-1 ${theme.textSoft}`}>
            Resource & room scheduling
          </p>
        </div>

        <nav className="flex-1 px-3 pt-3 space-y-1">
          <NavItem to="/" onClick={closeMenu}>Dashboard</NavItem>
          <NavItem to="/resource-types" onClick={closeMenu}>Resource Types</NavItem>
          <NavItem to="/resources" onClick={closeMenu}>Resources</NavItem>
          <NavItem to="/availability" onClick={closeMenu}>Calendar</NavItem>
          <NavItem to="/bookings" onClick={closeMenu}>Bookings</NavItem>
          <NavItem to="/user-bookings" onClick={closeMenu}>User Bookings</NavItem>
          <NavItem to="/requests" onClick={closeMenu}>Requests</NavItem>
          <NavItem to="/rules" onClick={closeMenu}>Rules</NavItem>
        </nav>

        <div className={`px-4 py-3 border-t ${theme.card}`}>
          <button
            type="button"
            onClick={() => {
              clearAdminSession();
              window.location.assign(getUserUrl());
            }}
            className={`w-full text-left text-sm font-medium ${theme.textSoft} ${theme.hoverText || "hover:text-indigo-600"}`}
          >
            Sign out
          </button>
          <div className={`mt-2 text-xs ${theme.textSoft}`}>
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
  const config = getOrgConfig();
  const theme = config.theme;
  const isCinema = config.domain === "cinema";

  const activeClass = isCinema
    ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
    : `${theme.tagMuted || "bg-blue-100 text-blue-700"} border border-slate-200`;

  const inactiveClass = isCinema
    ? "text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
    : `${theme.textStrong || "text-slate-700"} ${theme.hoverBg || "hover:bg-slate-100"}`;

  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        [
          "block px-4 py-3 rounded-2xl text-[15px] font-medium transition",
          isActive ? activeClass : inactiveClass,
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
