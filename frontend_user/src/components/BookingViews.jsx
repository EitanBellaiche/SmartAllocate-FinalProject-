import React from "react";
import {
  formatDate,
  formatTime,
  formatTypeLabel,
  getBookingRoomLine,
  isPastBooking,
} from "../utils/appHelpers";

function MobileMonthAgenda({
  monthLabel,
  days,
  onPrev,
  onNext,
  selectedDayKey,
  onSelectDay,
  getDotCount,
  renderAgendaItem,
  renderSelectedDayFooter,
  emptyAgendaText = "No items for this day.",
  weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  locale = "en-US",
  className = "",
}) {
  const selectedDay =
    (Array.isArray(days) ? days : []).find((d) => d?.key === selectedDayKey) || null;

  const selectedLabel = (() => {
    if (!selectedDay?.date) return "";
    try {
      return selectedDay.date.toLocaleDateString(locale);
    } catch {
      return "";
    }
  })();

  return (
    <div className={`mobile-calendar glass ${className}`.trim()}>
      <div className="mobile-calendar__top">
        <div className="mobile-calendar__top-row">
          <div className="mobile-calendar__nav">
            <button type="button" onClick={onPrev} aria-label="Previous month">
              ‹
            </button>
            <button type="button" onClick={onNext} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="mobile-calendar__month">{monthLabel}</div>
          <div
            className="badge-soft"
            style={{
              background: "rgba(255,255,255,0.18)",
              borderColor: "rgba(255,255,255,0.25)",
              color: "#fff",
            }}
          >
            Month
          </div>
        </div>
        <div className="mobile-calendar__weekdays">
          {weekdays.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
      </div>

      <div className="mobile-calendar__body">
        <div className="mobile-calendar__grid">
          {(Array.isArray(days) ? days : []).map((day) => {
            const inMonth = Boolean(day?.inMonth);
            const isSelected = Boolean(selectedDayKey && day?.key === selectedDayKey);
            const dotCountRaw =
              typeof getDotCount === "function"
                ? getDotCount(day)
                : Array.isArray(day?.bookings)
                  ? day.bookings.length
                  : 0;
            const hasAny = (Number(dotCountRaw) || 0) > 0;
            const dotCount = hasAny ? 1 : 0;

            return (
              <div
                key={day.key}
                className={`mobile-day ${isSelected ? "selected" : ""}`}
                role="button"
                tabIndex={inMonth ? 0 : -1}
                aria-disabled={!inMonth}
                onClick={() => {
                  if (!inMonth) return;
                  onSelectDay?.(day);
                }}
                onKeyDown={(e) => {
                  if (!inMonth) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectDay?.(day);
                  }
                }}
              >
                <div className="mobile-day__num">{day.date.getDate()}</div>
                <div className="mobile-day__dots" aria-hidden="true">
                  {Array.from({ length: dotCount }).map((_, idx) => (
                    <span key={idx} className="mobile-dot" />
                  ))}
                </div>
                {hasAny ? (
                  <div className="mobile-day__count">
                    {Number(dotCountRaw) > 9 ? "9+" : Number(dotCountRaw)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mobile-agenda">
          <div className="mobile-agenda__header">
            <div>{selectedLabel ? `Agenda • ${selectedLabel}` : "Agenda"}</div>
            <div className="badge-soft">Tap a day</div>
          </div>

          {selectedDay ? (
            <>
              {(Array.isArray(selectedDay.bookings) ? selectedDay.bookings : []).length ===
              0 ? (
                <div className="glass" style={{ padding: 12, borderRadius: 14 }}>
                  <div style={{ color: "#475569", fontWeight: 700 }}>{emptyAgendaText}</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {(Array.isArray(selectedDay.bookings) ? selectedDay.bookings : []).map(
                    (b) => (
                      <div key={b.id}>{renderAgendaItem ? renderAgendaItem(b, selectedDay) : null}</div>
                    )
                  )}
                </div>
              )}

              {renderSelectedDayFooter ? (
                <div style={{ marginTop: 10 }}>{renderSelectedDayFooter(selectedDay)}</div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Section({ title, color, items, role, onCancel, labels, labelsLower }) {
  return (
    <section>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: color,
            display: "inline-block",
          }}
        />
        <h3 style={{ margin: 0, color: "#0f172a" }}>{title}</h3>
      </div>

      {items.length === 0 ? (
        <div
          className="glass"
          style={{
            padding: 14,
            borderRadius: 14,
            color: "#475569",
            fontSize: 14,
          }}
        >
          No bookings in this category.
        </div>
      ) : (
        <div className="grid-auto">
          {items.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              role={role}
              onCancel={onCancel}
              labels={labels}
              labelsLower={labelsLower}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function BookingCard({ booking, role, onCancel, labels, labelsLower }) {
  const past = isPastBooking(booking);
  const roomLine = getBookingRoomLine(booking);
  return (
    <div
      className="glass"
      style={{
        padding: 16,
        borderRadius: 16,
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ color: "#475569", fontSize: 12 }}>
            Booking #{booking.id}
          </div>
          <div style={{ color: "#0f172a", fontWeight: 600 }}>
            {formatDate(booking.date)}
          </div>
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(37, 99, 235, 0.1)",
            color: "#1d4ed8",
            fontSize: 13,
            border: "1px solid rgba(37,99,235,0.25)",
          }}
        >
          {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
        </div>
      </div>
      {roomLine && (
        <div style={{ marginBottom: 8, color: "#0f172a", fontWeight: 700 }}>
          {roomLine}
        </div>
      )}
      {role === "manager" && (
        <button
          type="button"
          onClick={() => onCancel?.(booking)}
          disabled={past}
          style={{
            marginBottom: 10,
            alignSelf: "flex-start",
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: past ? "#e2e8f0" : "#0f172a",
            color: past ? "#64748b" : "#fff",
            fontWeight: 700,
            cursor: past ? "not-allowed" : "pointer",
          }}
        >
          Cancel {labelsLower.resource}
        </button>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {(booking.resources || []).map((r) => (
          <div
            key={r.id}
            style={{
              padding: 10,
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ color: "#0f172a", fontWeight: 600 }}>{r.name}</div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>
              {r.type_name ? `Type: ${formatTypeLabel(r.type_name, labels)}` : ""}
              {r.role ? ` - Role: ${r.role}` : ""}
            </div>
            {r.metadata && Object.keys(r.metadata).length > 0 && (
              <div
                style={{
                  color: "#64748b",
                  fontSize: 12,
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                {Object.entries(r.metadata)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" | ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthGrid({
  monthLabel,
  onPrev,
  onNext,
  days,
  renderBooking,
  maxItems = 3,
  renderDayAction,
  onDaySelect,
}) {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="glass" style={{ padding: 16, borderRadius: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onPrev}
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            &lt;
          </button>
          <button
            onClick={onNext}
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            &gt;
          </button>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>{monthLabel}</div>
        </div>
        <div className="badge">
          <span role="img" aria-label="calendar">
            CAL
          </span>
          Month view
        </div>
      </div>

      <div className="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontWeight: 700,
              color: "#475569",
            }}
          >
            {d}
          </div>
        ))}

        {weeks.map((week, wi) =>
          week.map((day, di) => (
            <div
              key={`${wi}-${di}`}
              className="calendar-day"
              role={onDaySelect ? "button" : undefined}
              tabIndex={onDaySelect ? 0 : undefined}
              onClick={() => {
                if (!onDaySelect) return;
                onDaySelect(day);
              }}
              onKeyDown={(e) => {
                if (!onDaySelect) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDaySelect(day);
                }
              }}
              style={{
                opacity: day.inMonth ? 1 : 0.45,
                cursor: onDaySelect ? "pointer" : undefined,
              }}
            >
              <div className="date">{day.date.getDate()}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(typeof maxItems === "number"
                  ? day.bookings.slice(0, maxItems)
                  : day.bookings
                ).map((b) => (
                  <div key={b.id}>
                    {renderBooking ? (
                      renderBooking(b)
                    ) : (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                          color: "#fff",
                          fontSize: 12,
                          boxShadow: "0 6px 18px rgba(37,99,235,0.25)",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {(b.resources || [])
                            .map((r) => r.name)
                            .filter(Boolean)
                            .join(" / ")}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          {formatTime(b.start_time)} - {formatTime(b.end_time)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {typeof maxItems === "number" &&
                  day.bookings.length > maxItems && (
                    <div style={{ fontSize: 11, color: "#475569" }}>
                      +{day.bookings.length - maxItems} more
                    </div>
                  )}
                {renderDayAction ? renderDayAction(day) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export { MobileMonthAgenda };
