import React from "react";
import { formatDate, formatTime } from "../utils/appHelpers";

export default function NotificationsSection({
  role,
  isCinema,
  labels,
  labelsLower,
  cinemaPrimaryButton,
  cinemaSecondaryButton,
  notificationTab,
  setNotificationTab,
  userRequestsQuery,
  setUserRequestsQuery,
  loadUserRequests,
  userRequestsLoading,
  userRequestsError,
  userRequests,
  filteredUserRequests,
  groupedUserRequests,
  getUnreadCountForGroup,
  setSelectedUserRequestKey,
  markRequestsSeen,
  selectedUserGroup,
  announcementsQuery,
  setAnnouncementsQuery,
  loadAnnouncements,
  announcementsLoading,
  announcementsError,
  announcementForm,
  setAnnouncementForm,
  submitAnnouncement,
  announcementSubmitting,
  announcementError,
  announcementSent,
  filteredAnnouncements,
  seenAnnouncementSet,
  selectedAnnouncementId,
  setSelectedAnnouncementId,
  markAnnouncementSeen,
}) {
  return (
    <>
      <header className="user-page-header notifications-page-header">
        <div>
          <h1 className="user-page-title">
            {role === "user" ? "Notifications" : "Request Updates"}
          </h1>
          <p className="user-page-subtitle">
            {role === "user"
              ? `Stay current with messages from ${labelsLower.managers} about schedule changes.`
              : "Track the status of allocation requests."}
          </p>
        </div>
        <div className="user-page-pill">Message center</div>
      </header>

      <div
        className="notifications-tabs"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        {role === "manager" && (
          <button
            type="button"
            onClick={() => setNotificationTab("requests")}
            className={`notifications-tab ${notificationTab === "requests" ? "active" : ""}`}
            style={{
              padding: "12px 18px",
              borderRadius: 16,
              cursor: "pointer",
              ...(notificationTab === "requests"
                ? isCinema
                  ? cinemaPrimaryButton
                  : {
                      border: "1px solid #e2e8f0",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 700,
                    }
                : isCinema
                  ? cinemaSecondaryButton
                  : {
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#0f172a",
                      fontWeight: 700,
                    }),
            }}
          >
            Request Updates
          </button>
        )}
        {role === "user" && (
          <button
            type="button"
            onClick={() => setNotificationTab("announcements")}
            className={`notifications-tab ${notificationTab === "announcements" ? "active" : ""}`}
            style={{
              padding: "12px 18px",
              borderRadius: 16,
              cursor: "pointer",
              ...(notificationTab === "announcements"
                ? isCinema
                  ? cinemaPrimaryButton
                  : {
                      border: "1px solid #e2e8f0",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 700,
                    }
                : isCinema
                  ? cinemaSecondaryButton
                  : {
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#0f172a",
                      fontWeight: 700,
                    }),
            }}
          >
            {labels.manager} Messages
          </button>
        )}
      </div>

      <div
        className="glass notifications-panel"
        style={{
          padding: 16,
          borderRadius: 18,
          display: role === "manager" && notificationTab === "requests" ? "block" : "none",
        }}
      >
        <div
          className="notifications-toolbar"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <input
            className="notifications-search-input"
            value={userRequestsQuery}
            onChange={(e) => setUserRequestsQuery(e.target.value)}
            placeholder={`Search by ${labelsLower.resource}, date, or status...`}
            style={{
              flex: 1,
              minWidth: 220,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
            }}
          />
          <button
            className="notifications-refresh-button"
            onClick={loadUserRequests}
            disabled={userRequestsLoading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "none",
              background: userRequestsLoading ? "#94a3b8" : "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: userRequestsLoading ? "default" : "pointer",
            }}
          >
            {userRequestsLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {userRequestsError && (
          <div style={{ color: "#b91c1c", marginBottom: 12 }}>{userRequestsError}</div>
        )}
        {userRequestsLoading ? (
          <div style={{ color: "#475569" }}>Loading requests...</div>
        ) : userRequests.length === 0 ? (
          <div style={{ color: "#475569" }}>
            No requests yet. Submit one to start the approval flow.
          </div>
        ) : filteredUserRequests.length === 0 ? (
          <div style={{ color: "#475569" }}>No requests match your search.</div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {!selectedUserGroup ? (
              <div style={{ padding: 16, display: "grid", gap: 12 }}>
                {groupedUserRequests.map((group) => {
                  const unreadCount = getUnreadCountForGroup(group);
                  return (
                    <button
                      key={group.key}
                      type="button"
                      className="notifications-resource-card"
                      onClick={() => {
                        setSelectedUserRequestKey(group.key);
                        markRequestsSeen(group.resource_id);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "16px 18px",
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: "#0f172a",
                          }}
                        >
                          {group.resource_name || `${labels.resource} #${group.resource_id}`}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {group.resource_type || labels.resource}
                        </div>
                      </div>
                      {unreadCount > 0 && (
                        <span
                          style={{
                            marginLeft: "auto",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            background: "#ef4444",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-4">
                <button
                  type="button"
                  onClick={() => setSelectedUserRequestKey(null)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#1d4ed8",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                    marginBottom: 12,
                  }}
                >
                  Back to {labels.resources}
                </button>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {selectedUserGroup.resource_name ||
                    `${labels.resource} #${selectedUserGroup.resource_id}`}
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {selectedUserGroup.requests.map((req) => {
                    const status = req.status || "pending";
                    let statusBg = "#fef9c3";
                    let statusColor = "#92400e";
                    if (status === "approved") {
                      statusBg = "#dcfce7";
                      statusColor = "#166534";
                    } else if (status === "rejected") {
                      statusBg = "#fee2e2";
                      statusColor = "#991b1b";
                    }
                    return (
                      <div
                        key={req.id}
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          display: "flex",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#64748b", fontSize: 13 }}>
                            {formatDate(req.request_date)} {formatTime(req.start_time)} -{" "}
                            {formatTime(req.end_time)}
                          </div>
                          {req.note && (
                            <div style={{ color: "#94a3b8", fontSize: 12 }}>{req.note}</div>
                          )}
                        </div>
                        <div
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: statusBg,
                            color: statusColor,
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: "capitalize",
                          }}
                        >
                          {status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="glass notifications-panel"
        style={{
          padding: 16,
          borderRadius: 18,
          display: role === "user" && notificationTab === "announcements" ? "block" : "none",
        }}
      >
        <div
          className="notifications-toolbar"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <input
            className="notifications-search-input"
            value={announcementsQuery}
            onChange={(e) => setAnnouncementsQuery(e.target.value)}
            placeholder="Search announcements..."
            style={{
              flex: 1,
              minWidth: 220,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
            }}
          />
          <button
            className="notifications-refresh-button"
            onClick={loadAnnouncements}
            disabled={announcementsLoading}
            style={{
              padding: "12px 18px",
              borderRadius: 16,
              cursor: announcementsLoading ? "default" : "pointer",
              ...(announcementsLoading
                ? {
                    border: "none",
                    background: "#94a3b8",
                    color: "#fff",
                    fontWeight: 800,
                    boxShadow: "none",
                  }
                : isCinema
                  ? cinemaPrimaryButton
                  : {
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 700,
                    }),
            }}
          >
            {announcementsLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {announcementsError && (
          <div style={{ color: "#b91c1c", marginBottom: 12 }}>{announcementsError}</div>
        )}

        {role === "manager" && (
          <div
            className="glass"
            style={{
              padding: 14,
              borderRadius: 14,
              marginBottom: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Send announcement</div>
            <input
              value={announcementForm.title}
              onChange={(e) =>
                setAnnouncementForm((prev) => ({
                  ...prev,
                  title: e.target.value,
                }))
              }
              placeholder="Title"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
              }}
            />
            <textarea
              value={announcementForm.message}
              onChange={(e) =>
                setAnnouncementForm((prev) => ({
                  ...prev,
                  message: e.target.value,
                }))
              }
              placeholder="Message"
              rows={4}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                value={announcementForm.resource}
                onChange={(e) =>
                  setAnnouncementForm((prev) => ({
                    ...prev,
                    resource: e.target.value,
                  }))
                }
                placeholder={`${labels.resource} name (optional)`}
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                }}
              />
              <input
                value={announcementForm.targetUserId}
                onChange={(e) =>
                  setAnnouncementForm((prev) => ({
                    ...prev,
                    targetUserId: e.target.value,
                  }))
                }
                placeholder={`${labels.userId} (optional)`}
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                }}
              />
              <input
                value={announcementForm.senderName}
                onChange={(e) =>
                  setAnnouncementForm((prev) => ({
                    ...prev,
                    senderName: e.target.value,
                  }))
                }
                placeholder="Your name"
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                }}
              />
            </div>
            <button
              type="button"
              onClick={submitAnnouncement}
              disabled={announcementSubmitting}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: announcementSubmitting ? "#94a3b8" : "#0f172a",
                color: "#fff",
                fontWeight: 700,
                cursor: announcementSubmitting ? "default" : "pointer",
                width: "fit-content",
              }}
            >
              {announcementSubmitting ? "Sending..." : "Send"}
            </button>
            {announcementError && <div style={{ color: "#b91c1c" }}>{announcementError}</div>}
            {announcementSent && <div style={{ color: "#166534" }}>{announcementSent}</div>}
          </div>
        )}

        {announcementsLoading ? (
          <div style={{ color: "#475569" }}>Loading announcements...</div>
        ) : filteredAnnouncements.length === 0 ? (
          <div style={{ color: "#475569" }}>No announcements yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredAnnouncements.map((announcement) => {
              const isUnread =
                role === "user" && !seenAnnouncementSet.has(Number(announcement.id));
              const isSelected = selectedAnnouncementId === announcement.id;
              return (
                <button
                  key={announcement.id}
                  type="button"
                  className={`notification-card ${isUnread ? "notification-card--unread" : ""} ${
                    isSelected ? "notification-card--selected" : ""
                  }`}
                  onClick={() => {
                    setSelectedAnnouncementId(announcement.id);
                    if (isUnread) {
                      markAnnouncementSeen(announcement.id);
                    }
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "16px 18px",
                    borderRadius: 14,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    display: "grid",
                    gap: 6,
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    {isUnread && (
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: "#ef4444",
                          display: "inline-block",
                        }}
                      />
                    )}
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{announcement.title}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {announcement.resource_name ? `${announcement.resource_name} - ` : ""}
                    {announcement.sender_name || labels.manager} - {formatDate(announcement.created_at)}
                  </div>
                  {isSelected && (
                    <div style={{ color: "#475569", fontSize: 14 }}>{announcement.message}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
