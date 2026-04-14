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
  return (
    <aside
      className={`app-sidebar ${isOpen ? "open" : ""}`}
      style={{
        width: 220,
        background: isCinema
          ? "linear-gradient(180deg,#09090b 0%,#120a19 100%)"
          : "#0f172a",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 12,
        boxShadow: isCinema ? "inset -1px 0 0 rgba(196,181,253,0.14)" : "none",
      }}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            alignSelf: "flex-end",
            border: "1px solid rgba(226,232,240,0.16)",
            background: "rgba(255,255,255,0.06)",
            color: "#e2e8f0",
            borderRadius: 12,
            padding: "8px 10px",
            cursor: "pointer",
            fontWeight: 800,
          }}
          aria-label="Close menu"
        >
          Close
        </button>
      )}
      <div
        style={{
          fontWeight: 900,
          fontSize: 18,
          color: isCinema ? "#f5f3ff" : undefined,
          letterSpacing: isCinema ? "0.02em" : undefined,
        }}
      >
        SmartAllocate
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <div
          style={{
            fontSize: 10,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Role
        </div>
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: isCinema ? "1px solid rgba(196,181,253,0.24)" : "1px solid #1e293b",
            background: isCinema
              ? "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(196,181,253,0.08))"
              : "#0b1120",
            color: "#e2e8f0",
            fontWeight: 800,
            textTransform: "capitalize",
            textAlign: "center",
          }}
        >
          {role === "manager" ? labels.manager : labels.user}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#cbd5e1" }}>
        {labels.userId}: {currentUserId}
      </div>

      <button
        onClick={() => {
          setSection("schedule");
          onClose?.();
        }}
        className="app-nav-button"
        style={{
          textAlign: "left",
          padding: "12px 14px",
          borderRadius: 14,
          border: isCinema && section === "schedule" ? "1px solid transparent" : "none",
          background:
            section === "schedule"
              ? isCinema
                ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                : "#1d4ed8"
              : "transparent",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 800,
          boxShadow:
            isCinema && section === "schedule"
              ? "0 14px 30px rgba(79,70,229,0.22)"
              : "none",
        }}
      >
        My Schedule
      </button>

      <button
        onClick={() => {
          setSection("search");
          onClose?.();
        }}
        className="app-nav-button"
        style={{
          textAlign: "left",
          padding: "12px 14px",
          borderRadius: 14,
          border: isCinema && section === "search" ? "1px solid transparent" : "none",
          background:
            section === "search"
              ? isCinema
                ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                : "#1d4ed8"
              : "transparent",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 800,
          boxShadow:
            isCinema && section === "search"
              ? "0 14px 30px rgba(79,70,229,0.22)"
              : "none",
        }}
      >
        {role === "user" ? `My ${labels.resources}` : `Find ${labels.resource}`}
      </button>

      {role === "manager" && (
        <button
          onClick={() => {
            setSection("requests");
            onClose?.();
          }}
          className="app-nav-button"
          style={{
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: 14,
            border: isCinema && section === "requests" ? "1px solid transparent" : "none",
            background:
              section === "requests"
                ? isCinema
                  ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                  : "#1d4ed8"
                : "transparent",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
            boxShadow:
              isCinema && section === "requests"
                ? "0 14px 30px rgba(79,70,229,0.22)"
                : "none",
          }}
        >
          {`${labels.resource} ${labels.requests}`}
        </button>
      )}

      <button
        onClick={() => {
          setSection("notifications");
          onClose?.();
        }}
        className="app-nav-button"
        style={{
          textAlign: "left",
          padding: "12px 14px",
          borderRadius: 14,
          border: isCinema && section === "notifications" ? "1px solid transparent" : "none",
          background:
            section === "notifications"
              ? isCinema
                ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                : "#1d4ed8"
              : "transparent",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontWeight: 800,
          boxShadow:
            isCinema && section === "notifications"
              ? "0 14px 30px rgba(79,70,229,0.22)"
              : "none",
        }}
      >
        <span>{role === "user" ? "Notifications" : "Request Updates"}</span>
        {unreadNotificationCount > 0 && role === "user" && (
          <span
            style={{
              minWidth: 22,
              height: 22,
              borderRadius: 999,
              background: "#ef4444",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 6px",
            }}
          >
            {unreadNotificationCount}
          </span>
        )}
      </button>

      {role === "manager" && (
        <button
          onClick={() => {
            setSection("availability");
            onClose?.();
          }}
          className="app-nav-button"
          style={{
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: 14,
            border: isCinema && section === "availability" ? "1px solid transparent" : "none",
            background:
              section === "availability"
                ? isCinema
                  ? "linear-gradient(135deg,#4f46e5,#7c3aed)"
                  : "#971dd8ff"
                : "transparent",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
            boxShadow:
              isCinema && section === "availability"
                ? "0 14px 30px rgba(79,70,229,0.22)"
                : "none",
          }}
        >
          My Availability
        </button>
      )}

      <button
        onClick={() => {
          handleLogout();
          onClose?.();
        }}
        className="app-nav-button"
        style={{
          marginTop: 8,
          textAlign: "left",
          padding: "12px 14px",
          borderRadius: 14,
          border: isCinema ? "1px solid rgba(196,181,253,0.2)" : "1px solid #1e293b",
          background: isCinema
            ? "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(196,181,253,0.06))"
            : "#0b1120",
          color: "#e2e8f0",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Sign out
      </button>

      <div style={{ marginTop: "auto", fontSize: 12, color: "#94a3b8" }}>
        Powered by SmartAllocate
      </div>
    </aside>
  );
}
