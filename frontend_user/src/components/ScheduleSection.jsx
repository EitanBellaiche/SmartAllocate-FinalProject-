import React from "react";
import { MonthGrid, Section } from "./BookingViews";
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
            <MonthGrid
              monthLabel={monthLabel}
              onPrev={() =>
                setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
              onNext={() =>
                setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
              days={monthDays}
              renderBooking={(b) => {
                const pastBooking = isPastBooking(b);
                const shortLocation = getBookingShortLocation(b);
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedScheduleBooking(b)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedScheduleBooking(b);
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                      color: "#fff",
                      fontSize: 12,
                      boxShadow: "0 6px 18px rgba(37,99,235,0.25)",
                      display: "grid",
                      gap: 4,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {(b.resources || [])
                        .map((r) => r.name)
                        .filter(Boolean)
                        .join(" / ")}
                    </div>
                    <div style={{ opacity: 0.9 }}>
                      {formatTime(b.start_time)} - {formatTime(b.end_time)}
                    </div>
                    {shortLocation && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          opacity: 0.92,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {shortLocation}
                      </div>
                    )}
                    {role === "manager" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCancelDialog(b);
                        }}
                        disabled={pastBooking}
                        style={{
                          marginTop: 2,
                          padding: "4px 6px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.6)",
                          background: pastBooking ? "rgba(255,255,255,0.3)" : "#fff",
                          color: pastBooking ? "#e2e8f0" : "#1d4ed8",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: pastBooking ? "not-allowed" : "pointer",
                        }}
                      >
                        Cancel {labelsLower.resource}
                      </button>
                    )}
                  </div>
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
    </>
  );
}
