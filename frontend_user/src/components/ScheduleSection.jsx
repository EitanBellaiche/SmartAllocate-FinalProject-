import React, { useEffect, useMemo, useState } from "react";
import { MobileMonthAgenda, MonthGrid, Section } from "./BookingViews";
import { formatTime, getBookingShortLocation, isPastBooking } from "../utils/appHelpers";

export default function ScheduleSection({
  isCinema,
  labels,
  labelsLower,
  filter,
  setFilter,
  viewMode,
  setViewMode,
  scheduleBookings,
  loading,
  error,
  monthLabel,
  setMonthDate,
  monthDays,
  setSelectedScheduleBooking,
  role,
  openCancelDialog,
  upcoming,
  past,
}) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [mobileMonthKey, setMobileMonthKey] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const selectedDayKey = selectedDay?.key || "";
  const selectedDayLabel = useMemo(() => {
    if (!selectedDay?.date) return "";
    try {
      return selectedDay.date.toLocaleDateString("en-US");
    } catch {
      return "";
    }
  }, [selectedDay]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(Boolean(mq.matches));
    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(monthDays) || monthDays.length === 0) return;
    // Reset the selected day when month changes.
    const firstInMonth = monthDays.find((d) => d.inMonth) || monthDays[0];
    const key = `${firstInMonth?.date?.getFullYear?.() || ""}-${firstInMonth?.date?.getMonth?.() || ""}`;
    if (key && key !== mobileMonthKey) {
      setMobileMonthKey(key);
      setSelectedDay(null);
    }
  }, [monthDays, mobileMonthKey]);

  return (
    <>
      <header className="user-page-header">
        <div>
          <h1 className="user-page-title">
            {isCinema ? "My Screenings" : "My Schedule"}
          </h1>
          <p className="user-page-subtitle">
            {isCinema
              ? "Follow your upcoming screenings in month or list view."
              : `Plan, search, and review your scheduled ${labelsLower.resources}.`}
          </p>
        </div>
        <div className="user-page-pill">Live schedule</div>
      </header>

      <div className="glass schedule-control-panel">
        <div className="schedule-control-panel__copy">
          <h3>My {labels.resources}</h3>
          <p>
            Search by {labelsLower.resource} or tag. Switch between month grid and list.
          </p>
        </div>
        <input
          className="schedule-search-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search..."
        />
        <div className="schedule-view-toggle" role="group" aria-label="Schedule view">
          {[
            { key: "month", label: "Month" },
            { key: "list", label: "List" },
          ].map((opt) => (
            <button
              type="button"
              key={opt.key}
              onClick={() => setViewMode(opt.key)}
              className={viewMode === opt.key ? "active" : ""}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass user-state-panel">
          Loading your schedule...
        </div>
      ) : scheduleBookings.length === 0 ? (
        <div
          className={`glass user-state-panel ${error ? "user-state-panel--warn" : ""}`}
        >
          {error || `No scheduled ${labelsLower.resources} were found for your account.`}
        </div>
      ) : (
        <div className="schedule-content">
          {viewMode === "month" ? (
            <MobileMonthAgenda
              monthLabel={monthLabel}
              days={monthDays}
              selectedDayKey={selectedDayKey}
              onSelectDay={(day) => setSelectedDay(day)}
              onPrev={() =>
                setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
              onNext={() =>
                setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
              emptyAgendaText="No bookings for the selected day."
              renderAgendaItem={(b) => {
                const shortLocation = getBookingShortLocation(b);
                return (
                  <button
                    type="button"
                    className="mobile-agenda__item"
                    onClick={() => setSelectedScheduleBooking(b)}
                    style={{ cursor: "pointer" }}
                  >
                    <div>
                      <div className="mobile-agenda__title">
                        {(b.resources || []).map((r) => r.name).filter(Boolean).join(" / ") ||
                          "Booking"}
                      </div>
                      {shortLocation ? <div className="mobile-agenda__sub">{shortLocation}</div> : null}
                    </div>
                    <div className="mobile-agenda__time">
                      {formatTime(b.start_time)} - {formatTime(b.end_time)}
                    </div>
                  </button>
                );
              }}
            />
          ) : (
            <>
              <Section
                title="Upcoming"
                color="#2563eb"
                items={upcoming}
                role={role}
                onCancel={openCancelDialog}
                labels={labels}
                labelsLower={labelsLower}
              />
              <Section
                title="Past"
                color="#94a3b8"
                items={past}
                role={role}
                onCancel={openCancelDialog}
                labels={labels}
                labelsLower={labelsLower}
              />
            </>
          )}
        </div>
      )}

      {selectedDay && (
        <div
          className="schedule-day-modal"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="glass schedule-day-modal__card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="schedule-day-modal__header">
              <div>
                {selectedDayLabel ? `Bookings on ${selectedDayLabel}` : "Bookings"}
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setSelectedDay(null)}
              >
                Close
              </button>
            </div>

            <div className="schedule-day-modal__list">
              {Array.isArray(selectedDay.bookings) && selectedDay.bookings.length > 0 ? (
                selectedDay.bookings.map((b) => {
                  const shortLocation = getBookingShortLocation(b);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className="schedule-day-modal__booking"
                      onClick={() => {
                        setSelectedScheduleBooking(b);
                        setSelectedDay(null);
                      }}
                    >
                      <div className="schedule-day-modal__booking-title">
                        {(b.resources || []).map((r) => r.name).filter(Boolean).join(" / ") || "Booking"}
                      </div>
                      <div className="schedule-day-modal__booking-time">
                        {formatTime(b.start_time)} - {formatTime(b.end_time)}
                      </div>
                      {shortLocation && (
                        <div className="schedule-day-modal__booking-location">
                          {shortLocation}
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <div style={{ color: "#475569" }}>No bookings on this day.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
