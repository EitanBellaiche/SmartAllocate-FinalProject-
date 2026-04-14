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
      <header
        style={{
          padding: "12px 0",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, color: "#0f172a" }}>
          {isCinema ? "My Screenings" : "My Schedule"}
        </h1>
        <p style={{ margin: 0, color: "#475569" }}>
          {isCinema
            ? "Follow your upcoming screenings in month or list view."
            : `Month or list view of your ${labelsLower.resources}.`}
        </p>
      </header>

      <div
        className="glass"
        style={{
          padding: 16,
          borderRadius: 18,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0, color: "#0f172a" }}>My {labels.resources}</h3>
          <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
            Search by {labelsLower.resource} or tag. Switch between month grid and list.
          </p>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search..."
          style={{
            width: 220,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            background: "#fff",
            color: "#0f172a",
          }}
        />
        <div
          className="glass"
          style={{
            display: "flex",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e2e8f0",
          }}
        >
          {[
            { key: "month", label: "Month" },
            { key: "list", label: "List" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setViewMode(opt.key)}
              style={{
                padding: "10px 14px",
                border: "none",
                background:
                  viewMode === opt.key ? "rgba(37,99,235,0.1)" : "transparent",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {scheduleBookings.length === 0 && !loading ? (
        <div
          className="glass"
          style={{
            marginTop: 18,
            padding: 16,
            borderRadius: 16,
            color: "#475569",
            textAlign: "center",
          }}
        >
          No {labelsLower.resources} yet. Enter an ID and click "Load bookings".
        </div>
      ) : (
        <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
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
                      {formatTime(b.start_time)}–{formatTime(b.end_time)}
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
          onClick={() => setSelectedDay(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 12,
          }}
        >
          <div
            className="glass"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              borderRadius: 18,
              padding: 14,
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 900, color: "#0f172a" }}>
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

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {Array.isArray(selectedDay.bookings) && selectedDay.bookings.length > 0 ? (
                selectedDay.bookings.map((b) => {
                  const shortLocation = getBookingShortLocation(b);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className="btn"
                      onClick={() => {
                        setSelectedScheduleBooking(b);
                        setSelectedDay(null);
                      }}
                      style={{
                        textAlign: "left",
                        background: "#fff",
                        borderRadius: 14,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>
                        {(b.resources || []).map((r) => r.name).filter(Boolean).join(" / ") || "Booking"}
                      </div>
                      <div style={{ marginTop: 4, color: "#475569", fontWeight: 700 }}>
                        {formatTime(b.start_time)} - {formatTime(b.end_time)}
                      </div>
                      {shortLocation && (
                        <div style={{ marginTop: 2, color: "#64748b", fontSize: 12 }}>
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
