import React from "react";

export default function AppSidebar({
  isCinema,
  role,
  labels,
  labelsLower,
  currentUserId,
  section,
  setSection,
  unreadNotificationCount,
  handleLogout,
  isOpen = true,
  onClose,
}) {
  const navItems = [
    {
      key: "schedule",
      label: "My Schedule",
      meta: "Upcoming allocation",
      icon: "SC",
      visible: true,
    },
    {
      key: "search",
      label: role === "user" ? `My ${labels.resources}` : `Find ${labels.resource}`,
      meta: role === "user" ? "Assigned resources" : "Resource lookup",
      icon: "RS",
      visible: true,
    },
    {
      key: "requests",
      label: `${labels.resource} ${labels.requests}`,
      meta: "Request queue",
      icon: "RQ",
      visible: role === "manager",
    },
    {
      key: "notifications",
      label: role === "user" ? "Notifications" : "Request Updates",
      meta: "Messages and updates",
      icon: "NT",
      visible: true,
    },
    {
      key: "availability",
      label: "My Availability",
      meta: "Scheduling windows",
      icon: "AV",
      visible: role === "manager",
    },
  ];

  return (
    <aside
      className={`app-sidebar user-sidebar ${isCinema ? "user-sidebar--cinema" : ""} ${
        isOpen ? "open" : ""
      }`}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="user-sidebar__close"
          aria-label="Close menu"
        >
          Close
        </button>
      )}

      <div className="user-sidebar__brand">
        <div className="user-sidebar__brand-top">
          <div className="user-sidebar__mark" aria-hidden="true">
            SA
          </div>
          <div>
            <p className="user-sidebar__eyebrow">User Workspace</p>
            <h1 className="user-sidebar__title">SmartAllocate</h1>
          </div>
        </div>
        <p className="user-sidebar__subtitle">
          Your schedule, assigned resources, and operational updates in one clean workspace.
        </p>
        <div className="user-sidebar__status">
          <span className="user-sidebar__status-dot" aria-hidden="true" />
          Active session
        </div>
      </div>

      <div className="user-sidebar__identity">
        <span className="user-sidebar__identity-label">{labels.userId}</span>
        <strong>{currentUserId}</strong>
        <span>{role === "manager" ? labels.manager : labels.user}</span>
      </div>

      <nav className="user-sidebar__nav" aria-label="User workspace navigation">
        <p className="user-sidebar__section-label">Workspace</p>
        <div className="user-sidebar__nav-list">
          {navItems
            .filter((item) => item.visible)
            .map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setSection(item.key);
                  onClose?.();
                }}
                className={`app-nav-button user-nav-item ${
                  section === item.key ? "user-nav-item--active" : ""
                }`}
              >
                <span className="user-nav-item__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="user-nav-item__copy">
                  <span className="user-nav-item__label">{item.label}</span>
                  <span className="user-nav-item__meta">{item.meta}</span>
                </span>
                {item.key === "notifications" && unreadNotificationCount > 0 && role === "user" && (
                  <span className="user-nav-item__count">{unreadNotificationCount}</span>
                )}
              </button>
            ))}
        </div>
      </nav>

      <button
        onClick={() => {
          handleLogout();
          onClose?.();
        }}
        className="app-nav-button user-sidebar__signout"
      >
        Sign out
      </button>

      <div className="user-sidebar__footer">
        Powered by SmartAllocate
      </div>
    </aside>
  );
}
