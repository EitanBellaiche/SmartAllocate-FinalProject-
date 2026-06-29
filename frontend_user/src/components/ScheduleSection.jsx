import React, { useEffect, useMemo, useState } from "react";
import { MobileMonthAgenda } from "./BookingViews";
import {
  formatTime,
  getBookingShortLocation,
  toDateKey,
  toDateKeyFromDate,
} from "../utils/appHelpers";

function parseBookingDate(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getWeekDays(anchorDate) {
  const start = addDays(anchorDate, -anchorDate.getDay());
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function getBookingTitle(booking) {
  return (
    (booking.resources || [])
      .map((resource) => resource.name)
      .filter(Boolean)
      .join(" / ") || "Booking"
  );
}

function getFirstBookingDate(bookings) {
  const dates = (Array.isArray(bookings) ? bookings : [])
    .map((booking) => parseBookingDate(toDateKey(booking?.date)))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] || null;
}

function hasBookingsInWeek(bookingsByDate, anchorDate) {
  return getWeekDays(anchorDate).some((day) => {
    const key = toDateKeyFromDate(day);
    return (bookingsByDate[key] || []).length > 0;
  });
}

function ScheduleBookingButton({ booking, onOpen }) {
  const shortLocation = getBookingShortLocation(booking);
  return (
    <button type="button" className="schedule-period-booking" onClick={() => onOpen(booking)}>
      <div className="schedule-period-booking__time">
        {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
      </div>
      <div className="schedule-period-booking__title">{getBookingTitle(booking)}</div>
      {shortLocation ? (
        <div className="schedule-period-booking__location">{shortLocation}</div>
      ) : null}
    </button>
  );
}

export default function ScheduleSection({
  isCinema,
  isShenkar,
  isClinic,
  labels,
  labelsLower,
  filter,
  setFilter,
  viewMode,
  setViewMode,
  scheduleBookings,
  filteredBookings,
  loading,
  error,
  monthLabel,
  monthDate,
  setMonthDate,
  monthDays,
  setSelectedScheduleBooking,
  role,
  openCancelDialog,
}) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [mobileMonthKey, setMobileMonthKey] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const selectedDayKey = selectedDay?.key || "";
  const isShenkarSchedule = isShenkar && !isCinema && !isClinic;
  const calendarClassName =
    isShenkarSchedule
      ? "mobile-calendar--admin mobile-calendar--shenkar-schedule"
      : "";
  const schedulePageClassName = isShenkarSchedule
    ? "schedule-page schedule-page--shenkar-schedule"
    : "schedule-page";
  const visibleBookings = Array.isArray(filteredBookings) ? filteredBookings : scheduleBookings;
  const activeDate = monthDate instanceof Date ? monthDate : new Date();
  const bookingsByDate = useMemo(() => {
    return visibleBookings.reduce((acc, booking) => {
      const key = toDateKey(booking.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(booking);
      return acc;
    }, {});
  }, [visibleBookings]);
  const firstBookingDate = useMemo(() => getFirstBookingDate(visibleBookings), [visibleBookings]);
  const effectiveDate = useMemo(() => {
    if (!firstBookingDate) return activeDate;
    if (viewMode === "day" && (bookingsByDate[toDateKeyFromDate(activeDate)] || []).length === 0) {
      return firstBookingDate;
    }
    if (viewMode === "week" && !hasBookingsInWeek(bookingsByDate, activeDate)) {
      return firstBookingDate;
    }
    return activeDate;
  }, [activeDate, bookingsByDate, firstBookingDate, viewMode]);
  const effectiveDateKey = toDateKeyFromDate(effectiveDate);
  const dayBookings = useMemo(
    () => visibleBookings.filter((booking) => toDateKey(booking.date) === effectiveDateKey),
    [visibleBookings, effectiveDateKey]
  );
  const weekDays = useMemo(() => getWeekDays(effectiveDate), [effectiveDateKey]);
  const weekLabel = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[6];
    return `${first.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} - ${last.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }, [weekDays]);
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

  function shiftSchedule(direction) {
    const amount = direction === "next" ? 1 : -1;
    if (viewMode === "day") {
      setMonthDate(addDays(effectiveDate, amount));
      return;
    }
    if (viewMode === "week") {
      setMonthDate(addDays(effectiveDate, amount * 7));
      return;
    }
    setMonthDate((date) => new Date(date.getFullYear(), date.getMonth() + amount, 1));
  }

  function renderPeriodHeader(title, subtitle) {
    return (
      <div className="schedule-period-header">
        <div>
          <div className="schedule-period-header__eyebrow">{viewMode}</div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="schedule-period-header__nav">
          <button type="button" onClick={() => shiftSchedule("prev")} aria-label="Previous">
            {"<"}
          </button>
          <button type="button" onClick={() => shiftSchedule("next")} aria-label="Next">
            {">"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={schedulePageClassName}>
      <header className={`user-page-header ${isShenkarSchedule ? "user-page-header--shenkar-schedule" : ""}`}>
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

      <div className={`glass schedule-control-panel ${isShenkarSchedule ? "schedule-control-panel--shenkar" : ""}`}>
        <div className="schedule-control-panel__copy">
          <h3>My {labels.resources}</h3>
          <p>
            Search by {labelsLower.resource} or tag. Switch between day, week, and month.
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
            { key: "day", label: "Day" },
            { key: "week", label: "Week" },
            { key: "month", label: "Month" },
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
              className={calendarClassName}
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
                    className={`mobile-agenda__item ${isShenkarSchedule ? "mobile-agenda__item--shenkar" : ""}`}
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
          ) : viewMode === "week" ? (
            <section className="glass schedule-period-panel schedule-week-panel">
              {renderPeriodHeader("Weekly schedule", weekLabel)}
              <div className="schedule-week-grid">
                {weekDays.map((day) => {
                  const key = toDateKeyFromDate(day);
                  const items = bookingsByDate[key] || [];
                  return (
                    <div
                      className={`schedule-week-day ${
                        items.length > 0 ? "schedule-week-day--has-bookings" : ""
                      }`}
                      key={key}
                    >
                      <div className="schedule-week-day__header">
                        <span>
                          {day.toLocaleDateString("en-US", { weekday: "short" })}
                        </span>
                        <strong>{day.getDate()}</strong>
                      </div>
                      <div className="schedule-week-day__body">
                        {items.length > 0 ? (
                          items.map((booking) => (
                            <ScheduleBookingButton
                              key={booking.id}
                              booking={booking}
                              onOpen={setSelectedScheduleBooking}
                            />
                          ))
                        ) : (
                          <div className="schedule-period-empty">No bookings</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="glass schedule-period-panel schedule-day-panel">
              {renderPeriodHeader(
                "Daily schedule",
                effectiveDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              )}
              <div className="schedule-day-list">
                {dayBookings.length > 0 ? (
                  dayBookings.map((booking) => (
                    <ScheduleBookingButton
                      key={booking.id}
                      booking={booking}
                      onOpen={setSelectedScheduleBooking}
                    />
                  ))
                ) : (
                  <div className="schedule-period-empty">
                    No bookings for this day.
                  </div>
                )}
              </div>
            </section>
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
    </div>
  );
}
