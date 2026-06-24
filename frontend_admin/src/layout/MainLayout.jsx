import { useEffect, useMemo, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { clearAdminSession } from "../api/api";
import BrandLockup from "../components/BrandLockup";
import { getOrgConfig } from "../orgConfig";
import "./MainLayout.css";

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

function getUserLogoutUrl() {
  try {
    const url = new URL(getUserUrl());
    url.searchParams.set("logout", "1");
    return url.toString();
  } catch {
    return `${DEFAULT_USER_URL}?logout=1`;
  }
}

const NAV_ITEMS = [
  {
    to: "/",
    key: "dashboard",
    fallback: "Dashboard",
    description: "Pulse and KPIs",
    icon: DashboardIcon,
  },
  {
    to: "/resource-types",
    key: "resourceTypes",
    fallback: "Resource Types",
    description: "Data structure",
    icon: LayersIcon,
  },
  {
    to: "/resources",
    key: "resources",
    fallback: "Resources",
    description: "Inventory control",
    icon: ResourceIcon,
  },
  {
    to: "/availability",
    key: "availability",
    fallback: "Calendar",
    description: "Capacity planning",
    icon: CalendarIcon,
  },
  {
    to: "/bookings",
    key: "bookings",
    fallback: "Bookings",
    description: "Requests and flow",
    icon: BookingIcon,
  },
  {
    to: "/user-bookings",
    key: "userBookings",
    fallback: "User Bookings",
    description: "People activity",
    icon: UsersIcon,
  },
  {
    to: "/user-groups",
    key: "userGroups",
    fallback: "User Groups",
    description: "Shared cohorts",
    icon: GroupGridIcon,
  },
  {
    to: "/requests",
    key: "requests",
    fallback: "Requests",
    description: "Incoming demand",
    icon: InboxIcon,
  },
  {
    to: "/rules",
    key: "rules",
    fallback: "Rules",
    description: "Automation logic",
    icon: SparkIcon,
  },
];

export default function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const config = getOrgConfig();
  const currentItem = useMemo(() => {
    return (
      NAV_ITEMS.find((item) =>
        item.to === "/"
          ? location.pathname === "/"
          : location.pathname.startsWith(item.to)
      ) || NAV_ITEMS[0]
    );
  }, [location.pathname]);

  function closeMenu() {
    setMenuOpen(false);
  }

  const currentTitle =
    config.navigation?.[currentItem.key] || currentItem.fallback;
  const pageSubtitle = `Manage ${String(currentTitle).toLowerCase()} with a calmer, clearer administrative workspace.`;
  const showTopbar = !location.pathname.startsWith("/availability");

  useEffect(() => {
    document.title = `${currentTitle} | SmartAllocate Admin`;
  }, [currentTitle]);

  return (
    <div className={`admin-shell admin-shell--${config.domain || "generic"}`}>
      <button
        type="button"
        aria-label="Close menu overlay"
        className={`admin-shell__backdrop ${menuOpen ? "admin-shell__backdrop--open" : ""}`}
        onClick={closeMenu}
      />

      <aside className={`admin-sidebar ${menuOpen ? "admin-sidebar--open" : ""}`}>
        <div className="admin-sidebar__brand">
          <BrandLockup
            eyebrow="Admin Console"
            titleAs="h1"
            className="admin-sidebar__brand-lockup"
          />

          <p className="admin-sidebar__subtitle">
            Resource allocation, approvals, and scheduling operations in one structured workspace.
          </p>

          <div className="admin-sidebar__status">
            <span className="admin-sidebar__status-dot" aria-hidden="true" />
            Live workspace
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          <p className="admin-sidebar__section-label">Workspace</p>
          <div className="admin-sidebar__nav-list">
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                label={config.navigation?.[item.key] || item.fallback}
                description={item.description}
                onClick={closeMenu}
                Icon={item.icon}
              />
            ))}
          </div>
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__spotlight">
            <p className="admin-sidebar__spotlight-label">Why This Matters</p>
            <p className="admin-sidebar__spotlight-text">
              Turn scheduling, requests, and resource rules into one operational system that is easier to trust.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              clearAdminSession();
              window.location.assign(getUserLogoutUrl());
            }}
            className="admin-sidebar__signout"
          >
            Sign out
          </button>

          <div className="admin-sidebar__copyright">
            © {new Date().getFullYear()} SmartAllocate
          </div>
        </div>
      </aside>

      <div className="admin-workspace">
        <div className="admin-mobilebar">
          <BrandLockup
            eyebrow="Admin Console"
            compact
            className="admin-mobilebar__lockup"
          />
          <button
            type="button"
            className="admin-mobilebar__toggle"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
        </div>

        {showTopbar && (
          <header className="admin-topbar">
            <div>
              <p className="admin-topbar__label">Control Surface</p>
              <h2 className="admin-topbar__title">{currentTitle}</h2>
              <p className="admin-topbar__subtitle">{pageSubtitle}</p>
            </div>

            <div className="admin-topbar__right">
              <div className="admin-topbar__pill">
                <span className="admin-topbar__pill-label">Workspace</span>
                <span className="admin-topbar__pill-value">{config.businessName}</span>
              </div>
              <div className="admin-topbar__pill">
                <span className="admin-topbar__pill-label">Current Area</span>
                <span className="admin-topbar__pill-value">{currentItem.description}</span>
              </div>
            </div>
          </header>
        )}

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, label, description, onClick, Icon }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) => `admin-nav-item ${isActive ? "admin-nav-item--active" : ""}`}
    >
      <span className="admin-nav-item__icon" aria-hidden="true">
        <Icon />
      </span>
      <span>
        <span className="admin-nav-item__label">{label}</span>
        <span className="admin-nav-item__meta">{description}</span>
      </span>
    </NavLink>
  );
}

function DashboardIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 13h6V4H4v9Z" />
      <path d="M14 20h6v-6h-6v6Z" />
      <path d="M14 10h6V4h-6v6Z" />
      <path d="M4 20h6v-3H4v3Z" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </svg>
  );
}

function ResourceIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" />
      <path d="M12 4v16" />
      <path d="m4 7.5 8 4 8-4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16" />
    </svg>
  );
}

function BookingIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h10v4H7z" />
      <path d="M5 7h14v13H5z" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a3 3 0 0 1 0 5.74" />
    </svg>
  );
}

function GroupGridIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M17 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M6 13c-2.2 0-4 1.8-4 4v1h12v-1c0-2.2-1.8-4-4-4H6Z" />
      <path d="M16 13c2 0 3.5 1.6 3.5 3.5V18H22v-1.5c0-2-1.6-3.5-3.5-3.5H16Z" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h16v11H15l-3 3-3-3H4V5Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3Z" />
      <path d="m19 14 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
    </svg>
  );
}
