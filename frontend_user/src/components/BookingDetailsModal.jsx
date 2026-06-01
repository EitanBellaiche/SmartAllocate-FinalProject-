import React from "react";
import {
  formatDate,
  formatTime,
  formatTypeLabel,
  getBookingResources,
  getBookingRoomLine,
} from "../utils/appHelpers";

export default function BookingDetailsModal({
  selectedScheduleBooking,
  setSelectedScheduleBooking,
  labels,
}) {
  if (!selectedScheduleBooking) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 55,
      }}
      onClick={() => setSelectedScheduleBooking(null)}
    >
      <div
        className="glass"
        style={{
          width: "min(560px, 92vw)",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: 20,
          borderRadius: 18,
          background: "#fff",
          border: "1px solid #e2e8f0",
          display: "grid",
          gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 20 }}>
              {(selectedScheduleBooking.resources || [])
                .map((resource) => resource.name)
                .filter(Boolean)
                .join(" / ")}
            </div>
            <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>
              {formatDate(selectedScheduleBooking.date)} •{" "}
              {formatTime(selectedScheduleBooking.start_time)} -{" "}
              {formatTime(selectedScheduleBooking.end_time)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedScheduleBooking(null)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              fontWeight: 700,
              cursor: "pointer",
              height: "fit-content",
            }}
          >
            Close
          </button>
        </div>

        {getBookingRoomLine(selectedScheduleBooking) && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              color: "#0f172a",
              fontWeight: 600,
            }}
          >
            {getBookingRoomLine(selectedScheduleBooking)}
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {getBookingResources(selectedScheduleBooking).map((resource, index) => (
            <div
              key={`${resource?.id || "resource"}-${index}`}
              style={{
                padding: 12,
                borderRadius: 12,
                background: "#fff",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontWeight: 700, color: "#0f172a" }}>
                {resource?.name || "Resource"}
              </div>
              <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>
                {resource?.type_name ? `Type: ${formatTypeLabel(resource.type_name, labels)}` : ""}
                {resource?.role ? ` • Role: ${resource.role}` : ""}
              </div>
              {resource?.metadata && Object.keys(resource.metadata).length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    display: "grid",
                    gap: 4,
                    color: "#475569",
                    fontSize: 12,
                  }}
                >
                  {Object.entries(resource.metadata).map(([key, value]) => (
                    <div key={key}>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>{key}:</span>{" "}
                      <span>{Array.isArray(value) ? value.join(", ") : String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
