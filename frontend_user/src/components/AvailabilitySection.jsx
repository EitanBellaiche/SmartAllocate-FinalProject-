import React from "react";
import IsraelDateInput from "../IsraelDateInput";
import { formatDate, formatTime, weekdayLabel } from "../utils/appHelpers";

export default function AvailabilitySection({
  labelsLower,
  availabilityMessage,
  availabilityForm,
  setAvailabilityForm,
  availabilitySaving,
  setAvailabilitySaving,
  isCinema,
  cinemaPrimaryButton,
  currentUserId,
  createUserAvailability,
  setUserAvailability,
  setAvailabilityMessage,
  userAvailability,
  deleteUserAvailability,
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
        <h1 style={{ margin: 0, color: "#0f172a" }}>My Availability</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          Share the hours you can support so the admin can schedule your {labelsLower.resources}.
        </p>
      </header>

      {availabilityMessage && (
        <div
          className="glass"
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            color: "#1d4ed8",
          }}
        >
          {availabilityMessage}
        </div>
      )}

      <div
        className="glass"
        style={{
          padding: 16,
          borderRadius: 16,
          display: "grid",
          gap: 12,
          maxWidth: 520,
        }}
      >
        <div style={{ fontWeight: 700 }}>Add availability</div>
        <label style={{ fontSize: 12, color: "#475569" }}>
          Days of week
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              marginTop: 8,
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <label
                key={day}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#0f172a",
                }}
              >
                <input
                  type="checkbox"
                  checked={availabilityForm.day_of_week.includes(String(day))}
                  onChange={() =>
                    setAvailabilityForm((prev) => {
                      const exists = prev.day_of_week.includes(String(day));
                      const nextDays = exists
                        ? prev.day_of_week.filter((value) => value !== String(day))
                        : [...prev.day_of_week, String(day)];
                      return { ...prev, day_of_week: nextDays };
                    })
                  }
                />
                <span>{weekdayLabel(day)}</span>
              </label>
            ))}
          </div>
        </label>

        <label style={{ fontSize: 12, color: "#475569" }}>
          Start time
          <input
            type="time"
            value={availabilityForm.start_time}
            onChange={(e) =>
              setAvailabilityForm((prev) => ({
                ...prev,
                start_time: e.target.value,
              }))
            }
            style={{
              display: "block",
              marginTop: 6,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          />
        </label>

        <label style={{ fontSize: 12, color: "#475569" }}>
          End time
          <input
            type="time"
            value={availabilityForm.end_time}
            onChange={(e) =>
              setAvailabilityForm((prev) => ({
                ...prev,
                end_time: e.target.value,
              }))
            }
            style={{
              display: "block",
              marginTop: 6,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          />
        </label>

        <label style={{ fontSize: 12, color: "#475569" }}>
          Start date (optional)
          <IsraelDateInput
            value={availabilityForm.start_date}
            onChange={(nextDate) =>
              setAvailabilityForm((prev) => ({
                ...prev,
                start_date: nextDate,
              }))
            }
            style={{
              display: "block",
              marginTop: 6,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          />
        </label>

        <label style={{ fontSize: 12, color: "#475569" }}>
          End date (optional)
          <IsraelDateInput
            value={availabilityForm.end_date}
            onChange={(nextDate) =>
              setAvailabilityForm((prev) => ({
                ...prev,
                end_date: nextDate,
              }))
            }
            style={{
              display: "block",
              marginTop: 6,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          />
        </label>

        <button
          type="button"
          disabled={availabilitySaving}
          onClick={async () => {
            const userId = currentUserId.trim();
            if (!userId) return;
            if (!availabilityForm.day_of_week.length) {
              setAvailabilityMessage("Choose at least one day.");
              return;
            }
            setAvailabilitySaving(true);
            setAvailabilityMessage("");
            try {
              const created = await Promise.all(
                availabilityForm.day_of_week.map((day) =>
                  createUserAvailability({
                    user_id: userId,
                    day_of_week: Number(day),
                    start_time: availabilityForm.start_time,
                    end_time: availabilityForm.end_time,
                    start_date: availabilityForm.start_date || null,
                    end_date: availabilityForm.end_date || null,
                  })
                )
              );
              setUserAvailability((prev) => [...prev, ...created]);
              setAvailabilityMessage("Availability saved.");
            } catch (err) {
              setAvailabilityMessage(err?.message || "Failed to save availability.");
            } finally {
              setAvailabilitySaving(false);
            }
          }}
          style={{
            padding: "12px 18px",
            borderRadius: 16,
            cursor: availabilitySaving ? "default" : "pointer",
            width: isCinema ? "fit-content" : undefined,
            ...(availabilitySaving
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
                    background: "#1d4ed8",
                    color: "#fff",
                    fontWeight: 700,
                  }),
          }}
        >
          {availabilitySaving ? "Saving..." : "Save availability"}
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 8, color: "#0f172a" }}>Saved availability</h3>
        {userAvailability.length === 0 ? (
          <div className="glass" style={{ padding: 12, borderRadius: 12 }}>
            No availability saved yet.
          </div>
        ) : (
          <div className="grid-auto">
            {userAvailability.map((slot) => (
              <div key={slot.id} className="glass" style={{ padding: 12, borderRadius: 12 }}>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>
                  {weekdayLabel(slot.day_of_week)}
                </div>
                <div style={{ color: "#475569", fontSize: 13 }}>
                  {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                </div>
                {(slot.start_date || slot.end_date) && (
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    {slot.start_date ? formatDate(slot.start_date) : "כל תאריך"} →{" "}
                    {slot.end_date ? formatDate(slot.end_date) : "כל תאריך"}
                  </div>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setAvailabilityMessage("");
                    try {
                      await deleteUserAvailability(slot.id);
                      setUserAvailability((prev) =>
                        prev.filter((item) => item.id !== slot.id)
                      );
                    } catch (err) {
                      setAvailabilityMessage(
                        err?.message || "Failed to delete availability."
                      );
                    }
                  }}
                  style={{
                    marginTop: 8,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
