import React from "react";
import IsraelDateInput from "../IsraelDateInput";
import { formatDate, formatTime } from "../utils/appHelpers";

export default function CancelDialog({
  cancelDialog,
  setCancelDialog,
  labelsLower,
  rescheduleMode,
  setRescheduleMode,
  rescheduleDate,
  setRescheduleDate,
  rescheduleStart,
  setRescheduleStart,
  rescheduleEnd,
  setRescheduleEnd,
  rescheduleLocation,
  setRescheduleLocation,
  cancelReason,
  setCancelReason,
  cancelSenderName,
  setCancelSenderName,
  cancelError,
  cancelSuccess,
  submitCancellation,
  cancelSubmitting,
}) {
  if (!cancelDialog.open) return null;

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
        zIndex: 60,
      }}
      onClick={() => setCancelDialog({ open: false, booking: null })}
    >
      <div
        className="glass"
        style={{
          width: "min(560px, 92vw)",
          padding: 20,
          borderRadius: 18,
          background: "#fff",
          border: "1px solid #e2e8f0",
          display: "grid",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, color: "#0f172a" }}>Cancel {labelsLower.resource}</div>
        {cancelDialog.booking && (
          <div style={{ color: "#475569", fontSize: 12 }}>
            {formatDate(cancelDialog.booking.date)} •{" "}
            {formatTime(cancelDialog.booking.start_time)} -{" "}
            {formatTime(cancelDialog.booking.end_time)}
          </div>
        )}
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={rescheduleMode}
            onChange={(e) => setRescheduleMode(e.target.checked)}
          />
          Reschedule instead of cancel
        </label>
        {rescheduleMode && (
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#475569" }}>
              New date
              <IsraelDateInput
                value={rescheduleDate}
                onChange={setRescheduleDate}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "#475569" }}>
                Start
                <input
                  type="time"
                  value={rescheduleStart}
                  onChange={(e) => setRescheduleStart(e.target.value)}
                  style={{
                    marginTop: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
              </label>
              <label style={{ fontSize: 12, color: "#475569" }}>
                End
                <input
                  type="time"
                  value={rescheduleEnd}
                  onChange={(e) => setRescheduleEnd(e.target.value)}
                  style={{
                    marginTop: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
              </label>
              <label style={{ fontSize: 12, color: "#475569" }}>
                Location
                <select
                  value={rescheduleLocation}
                  onChange={(e) => setRescheduleLocation(e.target.value)}
                  style={{
                    marginTop: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <option value="onsite">On-site</option>
                  <option value="zoom">Zoom</option>
                </select>
              </label>
            </div>
          </div>
        )}
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
        <input
          value={cancelSenderName}
          onChange={(e) => setCancelSenderName(e.target.value)}
          placeholder="Your name (optional)"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
          }}
        />
        {cancelError && <div style={{ color: "#b91c1c" }}>{cancelError}</div>}
        {cancelSuccess && <div style={{ color: "#166534" }}>{cancelSuccess}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setCancelDialog({ open: false, booking: null })}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={submitCancellation}
            disabled={cancelSubmitting}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "none",
              background: cancelSubmitting ? "#94a3b8" : "#b91c1c",
              color: "#fff",
              fontWeight: 700,
              cursor: cancelSubmitting ? "default" : "pointer",
            }}
          >
            {cancelSubmitting
              ? rescheduleMode
                ? "Rescheduling..."
                : "Cancelling..."
              : rescheduleMode
                ? "Confirm reschedule"
                : "Confirm cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
