import React from "react";
import {
  formatTime,
  formatTypeLabel,
  getBookingResources,
  getHallSeatRows,
  getUserSeatIdsForHall,
  isResourceAssignedToUser,
  normalizeMetadata,
  splitSeatRowIntoSections,
} from "../utils/appHelpers";

export default function SearchSection({
  isCinema,
  role,
  currentUserId,
  labels,
  labelsLower,
  bookings,
  resourceQuery,
  setResourceQuery,
  loadResources,
  resourceLoading,
  filteredResources,
  selectedResource,
  setSelectedResourceId,
  cinemaSecondaryButton,
}) {
  const [selectedDayByMonth, setSelectedDayByMonth] = React.useState({});
  const selectedResourceSessions = selectedResource
    ? getResourceBookingSessions(selectedResource, bookings)
    : [];
  const selectedResourceSessionGroups = groupSessionsByMonth(selectedResourceSessions);

  return (
    <>
      <header className="search-section__header">
        <h1 className="search-section__title">
          {isCinema
            ? "Seat Explorer"
            : role === "user"
              ? `My ${labels.resources}`
              : `Find a ${labelsLower.resource}`}
        </h1>
        <p className="search-section__subtitle">
          {isCinema
            ? role === "user"
              ? "Browse available seats in the hall and inspect their booking sessions."
              : "Search seats by row, number, hall, or metadata to manage assignments."
            : role === "user"
              ? "Review your assigned resources, upcoming sessions, and booking details."
              : "Search by name or tags, then expand to see your dates & times."}
        </p>
      </header>

      <div className="glass search-section__panel">
        <div className="search-section__toolbar">
          <input
            className="search-section__input"
            value={resourceQuery}
            onChange={(e) => setResourceQuery(e.target.value)}
            placeholder={
              isCinema
                ? "e.g. seat A12, row B, hall 1, VIP..."
                : "e.g. projector, room 103, prep station..."
            }
          />
          <button
            className="search-section__search-button"
            onClick={() => loadResources({ allowEmptyQuery: role === "user" })}
            disabled={resourceLoading}
          >
            {resourceLoading ? "Searching..." : "Search"}
          </button>
        </div>

        {role === "user" && !isCinema && filteredResources.length === 0 && !resourceLoading && (
          <div className="search-section__empty-hint">
            You do not have scheduled {labelsLower.resources} yet.
          </div>
        )}

        {role !== "user" &&
          resourceQuery.trim() &&
          filteredResources.length === 0 &&
          !resourceLoading && (
            <div className="search-section__empty-hint">
              No matches found. Try another keyword.
            </div>
          )}

        {selectedResource ? (
          <div className="search-section__selected-wrap">
            <button
              onClick={() => setSelectedResourceId(null)}
              className="search-section__back-button"
            >
              Back to results
            </button>

            <div className="glass search-section__details-card">
              <div className="search-section__details-head">
                <div>
                  <div className="search-section__eyebrow">
                    {isCinema ? "Hall overview" : `${labels.resource} overview`}
                  </div>
                  <div className="search-section__resource-name">{selectedResource.name}</div>
                </div>

                <span className="search-section__type-badge">
                  {formatTypeLabel(selectedResource.type_name, labels)}
                </span>
              </div>

              {role !== "user" &&
                selectedResource.metadata &&
                Object.keys(selectedResource.metadata).length > 0 && (
                  <div className="search-section__meta-list">
                    {Object.entries(normalizeMetadata(selectedResource.metadata))
                      .filter(([key, value]) => shouldShowMetadataChip(key, value))
                      .map(([key, value]) => (
                        <span key={key} className="search-section__meta-chip">
                          {key}: {formatMetadataValue(value)}
                        </span>
                      ))}
                  </div>
                )}

              {isCinema ? (
                <div className="search-section__hall-card">
                  <div className="search-section__screen">SCREEN</div>

                  <div className="search-section__legend">
                    <LegendChip bg="#ecfdf5" border="#86efac" color="#166534" dot="#22c55e" label="Your seat" />
                    <LegendChip bg="#fef3c7" border="#fcd34d" color="#92400e" dot="#facc15" label="Focus / center seat" />
                    <LegendChip bg="#fef2f2" border="#fca5a5" color="#991b1b" dot="#fca5a5" label="Broken seat" />
                    <LegendChip bg="#f5f3ff" border="#c4b5fd" color="#5b21b6" dot="#c4b5fd" label="Available seat" />
                  </div>

                  <div className="search-section__seat-map">
                    {getHallSeatRows(selectedResource).map(({ rowLabel, items }) => {
                      const sections = splitSeatRowIntoSections(items);
                      const userSeatIds = getUserSeatIdsForHall(selectedResource, bookings);

                      return (
                        <div key={rowLabel} className="search-section__seat-row">
                          <div className="search-section__row-label">
                            {rowLabel}
                          </div>

                          <div className="search-section__row-sections">
                            {[sections.left, sections.center, sections.right].map(
                              (sectionItems, sectionIdx) => (
                                <React.Fragment key={`${rowLabel}-${sectionIdx}`}>
                                  {sectionItems.length > 0 && (
                                    <div className="search-section__seat-cluster">
                                      {sectionItems.map((seat) => {
                                        const seatId = String(
                                          seat?.seatId || `${seat?.row || ""}${seat?.number || ""}`
                                        );
                                        const isMine = userSeatIds.has(seatId);
                                        const isBroken = Boolean(seat?.isBroken);
                                        const isFocus =
                                          seat?.section === "center" ||
                                          seat?.section === "front_center";

                                        return (
                                          <div
                                            key={seatId}
                                            title={`${selectedResource.name} • Seat ${seatId}`}
                                            style={{
                                              width: 36,
                                              height: 36,
                                              borderRadius: 12,
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              fontSize: 11,
                                              fontWeight: 900,
                                              color: isMine
                                                ? "#14532d"
                                                : isBroken
                                                  ? "#991b1b"
                                                  : isFocus
                                                    ? "#92400e"
                                                    : "#312e81",
                                              background: isMine
                                                ? "linear-gradient(180deg,#bbf7d0,#86efac)"
                                                : isBroken
                                                  ? "linear-gradient(180deg,#fee2e2,#fecaca)"
                                                  : isFocus
                                                    ? "linear-gradient(180deg,#fef3c7,#fde68a)"
                                                    : "linear-gradient(180deg,#ede9fe,#ddd6fe)",
                                              border: isMine
                                                ? "1px solid #22c55e"
                                                : isBroken
                                                  ? "1px solid #fca5a5"
                                                  : isFocus
                                                    ? "1px solid #fcd34d"
                                                    : "1px solid #c4b5fd",
                                              boxShadow: isMine
                                                ? "0 10px 20px rgba(34,197,94,0.18)"
                                                : isBroken
                                                  ? "0 10px 20px rgba(239,68,68,0.12)"
                                                  : isFocus
                                                    ? "0 10px 20px rgba(250,204,21,0.18)"
                                                    : "0 10px 20px rgba(109,40,217,0.12)",
                                            }}
                                          >
                                            {seat?.number}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {sectionIdx < 2 && sections.center.length > 0 && (
                                    <div className="search-section__aisle" />
                                  )}
                                </React.Fragment>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : role === "user" ? (
                <div className="search-section__assignments">
                  <div className="search-section__assignments-head">
                    <div className="search-section__assignments-title">
                      Scheduled assignments
                    </div>
                    <div className="search-section__assignments-count">
                      {selectedResourceSessions.length} sessions grouped by month
                    </div>
                  </div>
                  {selectedResourceSessions.length === 0 ? (
                    <div className="search-section__empty-hint">
                      No scheduled assignments found for this {labelsLower.resource}.
                    </div>
                  ) : (
                    <div className="search-section__assignments-list">
                      {selectedResourceSessionGroups.map((monthGroup) => (
                        <MonthSessionGroup
                          key={monthGroup.key}
                          monthGroup={monthGroup}
                          selectedDayKey={selectedDayByMonth[monthGroup.key]}
                          onSelectDay={(dayKey) =>
                            setSelectedDayByMonth((prev) => ({
                              ...prev,
                              [monthGroup.key]: dayKey,
                            }))
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="search-section__results-list">
            {filteredResources.map((resource) => {
              const userSeats = getUserSeatIdsForHall(resource, bookings);
              const isAssigned = isResourceAssignedToUser(resource, currentUserId);
              const sessionCount = getResourceBookingSessions(resource, bookings).length;

              return (
                <div
                  key={resource.id}
                  onClick={() => setSelectedResourceId(resource.id)}
                  className="search-section__result-card"
                >
                  <div className="search-section__result-name">{resource.name}</div>
                  <div className="search-section__result-meta">
                    {isCinema
                      ? userSeats.size > 0
                        ? `${userSeats.size} seats yours`
                        : "No seats assigned"
                      : sessionCount === 1
                          ? "1 scheduled assignment"
                          : sessionCount > 1
                            ? `${sessionCount} scheduled assignments`
                            : isAssigned
                              ? `Assigned ${labelsLower.resource}`
                              : "No scheduled assignments"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function MonthSessionGroup({ monthGroup, selectedDayKey, onSelectDay }) {
  const activeDay =
    monthGroup.days.find((day) => day.key === selectedDayKey) || monthGroup.days[0];

  return (
    <details className="search-section__month-group">
      <summary className="search-section__month-summary">
        <span>
          <strong>{monthGroup.label}</strong>
          <span>{monthGroup.rangeLabel}</span>
        </span>
        <em>{monthGroup.sessions.length} sessions</em>
      </summary>

      <div className="search-section__month-body">
        <div className="search-section__day-picker" aria-label={`${monthGroup.label} days`}>
          {monthGroup.days.map((dayGroup) => (
            <button
              key={dayGroup.key}
              type="button"
              className={`search-section__day-pill ${
                activeDay?.key === dayGroup.key ? "search-section__day-pill--active" : ""
              }`}
              onClick={() => onSelectDay(dayGroup.key)}
            >
              <span>{formatShortDayLabel(dayGroup.label)}</span>
              <strong>{dayGroup.sessions.length}</strong>
            </button>
          ))}
        </div>

        {activeDay ? (
          <div className="search-section__day-detail">
            <div className="search-section__day-detail-header">
              <span>{activeDay.label}</span>
              <em>
                {activeDay.sessions.length}{" "}
                {activeDay.sessions.length === 1 ? "session" : "sessions"}
              </em>
            </div>
            <div className="search-section__day-sessions">
              {activeDay.sessions.map((session) => (
                <div
                  key={`${session.bookingId}-${session.date}-${session.start}-${session.end}`}
                  className="search-section__assignment-row"
                >
                  <div>
                    <div className="search-section__assignment-booking">
                      Booking #{session.bookingId}
                    </div>
                  </div>
                  <div className="search-section__assignment-time">
                    {formatTime(session.start)} - {formatTime(session.end)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function formatShortDayLabel(label) {
  const parts = String(label || "").split(",");
  if (parts.length >= 2) return `${parts[0]},${parts[1]}`;
  return label;
}

function shouldShowMetadataChip(key, value) {
  const hiddenKeys = new Set(["seatObjects", "user_ids", "schedule_slots"]);
  if (hiddenKeys.has(key)) return false;
  if (value && typeof value === "object") return false;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatMetadataValue(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function getResourceBookingSessions(resource, bookings) {
  if (!resource) return [];
  const resourceId = String(resource?.id ?? "");
  const resourceName = String(resource?.name || "").trim().toLowerCase();
  const sessions = [];

  for (const booking of Array.isArray(bookings) ? bookings : []) {
    if (booking?.cancelled_at) continue;
    const hasResource = getBookingResources(booking).some((bookingResource) => {
      const bookingResourceId = String(bookingResource?.id ?? "");
      const bookingResourceName = String(bookingResource?.name || "").trim().toLowerCase();
      return (
        (resourceId && bookingResourceId === resourceId) ||
        (!resourceId && resourceName && bookingResourceName === resourceName)
      );
    });
    if (!hasResource) continue;
    sessions.push({
      bookingId: booking.id,
      date: booking.date,
      start: booking.start_time,
      end: booking.end_time,
    });
  }

  return sessions.sort(
    (a, b) => new Date(`${a.date}T${a.start}`) - new Date(`${b.date}T${b.start}`)
  );
}

function groupSessionsByMonth(sessions) {
  const monthMap = new Map();

  for (const session of sessions) {
    const date = parseResourceDate(session.date);
    const monthKey = Number.isNaN(date.getTime())
      ? "unknown"
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const dayKey = Number.isNaN(date.getTime())
      ? String(session.date || "unknown")
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
          date.getDate()
        ).padStart(2, "0")}`;

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        key: monthKey,
        label: formatResourceMonth(session.date),
        sessions: [],
        dayMap: new Map(),
      });
    }

    const monthGroup = monthMap.get(monthKey);
    monthGroup.sessions.push(session);
    if (!monthGroup.dayMap.has(dayKey)) {
      monthGroup.dayMap.set(dayKey, {
        key: dayKey,
        label: formatResourceDate(session.date),
        sessions: [],
      });
    }
    monthGroup.dayMap.get(dayKey).sessions.push(session);
  }

  return Array.from(monthMap.values()).map((monthGroup) => {
    const days = Array.from(monthGroup.dayMap.values());
    return {
      ...monthGroup,
      days,
      rangeLabel:
        days.length > 1
          ? `${days[0].label} - ${days[days.length - 1].label}`
          : days[0]?.label || "",
    };
  });
}

function parseResourceDate(dateStr) {
  if (!dateStr) return new Date(Number.NaN);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(`${dateStr}T00:00:00`)
    : new Date(dateStr);
}

function formatResourceDate(dateStr) {
  const date = parseResourceDate(dateStr);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatResourceMonth(dateStr) {
  const date = parseResourceDate(dateStr);
  if (Number.isNaN(date.getTime())) return "Unscheduled";

  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Jerusalem",
    month: "long",
    year: "numeric",
  });
}

function LegendChip({ bg, border, color, dot, label }) {
  return (
    <div
      className="search-section__legend-chip"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <span
        className="search-section__legend-dot"
        style={{ background: dot }}
      />
      {label}
    </div>
  );
}
