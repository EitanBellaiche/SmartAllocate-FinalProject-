import React from "react";
import IsraelDateInput from "../IsraelDateInput";
import { formatDate, formatTime, weekdayLabel } from "../utils/appHelpers";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatCountdown(msLeft) {
  if (!Number.isFinite(msLeft)) return "";
  if (msLeft <= 0) return "00:00:00";
  const totalSeconds = Math.floor(msLeft / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const hh = pad2(hours);
  const mm = pad2(minutes);
  const ss = pad2(seconds);
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

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
  deadlineInfo,
  lockedAvailability,
}) {
  const runAt = deadlineInfo?.run_at ? new Date(deadlineInfo.run_at) : null;
  const hasDeadline = Boolean(deadlineInfo?.has_deadline && runAt && !Number.isNaN(runAt.getTime()));
  const lockMessage =
    lockedAvailability && hasDeadline
      ? `Availability is locked because scheduling started at ${runAt.toLocaleString()}.`
      : lockedAvailability
        ? "Availability is locked because scheduling has started."
        : "";
  const [nowTick, setNowTick] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const countdown = hasDeadline ? formatCountdown(runAt.getTime() - nowTick) : "";
  const schedulingRange = deadlineInfo?.scheduling_range;
  const timeWindows = Array.isArray(deadlineInfo?.time_windows) ? deadlineInfo.time_windows : [];
  const rangeMin = schedulingRange?.start_date ? String(schedulingRange.start_date) : undefined;
  const rangeMax = schedulingRange?.end_date ? String(schedulingRange.end_date) : undefined;

  const [splitForm, setSplitForm] = React.useState({
    day_of_week: "1",
    day_start: "08:00",
    day_end: "22:00",
    unavailable_start: "16:00",
    unavailable_end: "18:00",
  });

  return (
    <>
      <header
        className="availability-page-header"
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

      {hasDeadline && !lockedAvailability && (
        <div className="glass card stack availability-deadline-card" style={{ marginBottom: 16, maxWidth: 620 }}>
          <div className="row">
            <span className="badge-soft badge-info">Scheduling deadline</span>
            <span className="badge-soft badge-info" style={{ fontVariantNumeric: "tabular-nums" }}>
              {countdown || "—"}
            </span>
          </div>
          <div style={{ fontWeight: 900, color: "#0f172a" }}>
            Starts at {runAt.toLocaleString()}.
          </div>
          {schedulingRange?.start_date && schedulingRange?.end_date && (
            <div className="muted" style={{ fontWeight: 700 }}>
              Range: {schedulingRange.start_date} → {schedulingRange.end_date}
            </div>
          )}
          {timeWindows.length > 0 && (
            <div className="muted" style={{ fontWeight: 700 }}>
              Preferred hours:{" "}
              <span style={{ fontWeight: 900 }}>
                {timeWindows
                  .map(
                    (w) =>
                      `${String(w.start_time).slice(0, 5)}-${String(w.end_time).slice(0, 5)}`
                  )
                  .join(" | ")}
              </span>
            </div>
          )}
          <div className="help">
            Update your availability before the deadline. After that it will be locked.
          </div>
        </div>
      )}

      {availabilityMessage && (
        <div
          className="glass availability-message"
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

      {lockMessage && (
        <div className="glass card stack availability-lock-card" style={{ marginBottom: 16, maxWidth: 620 }}>
          <span className="badge-soft badge-warn">Locked</span>
          {lockMessage}
        </div>
      )}

      <div className="glass card stack availability-form-card" style={{ maxWidth: 620 }}>
        <div className="row availability-form-card__head">
          <div style={{ fontWeight: 900 }}>Add availability</div>
          <span className="badge-soft">{lockedAvailability ? "Locked" : "Editable"}</span>
        </div>
        <div className="help">
          Tip: You can add multiple time ranges for the same day (e.g. 08:00-16:00 and 18:00-22:00).
        </div>

        <fieldset style={{ border: "none", padding: 0, margin: 0 }} aria-label="Days of week">
          <legend className="field" style={{ fontWeight: 900, color: "#0f172a" }}>
            Days of week
          </legend>
          <div className="availability-quick-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() =>
                setAvailabilityForm((prev) => ({ ...prev, day_of_week: ["1", "2", "3", "4", "5"] }))
              }
              className="btn btn-secondary"
            >
              Weekdays
            </button>
            <button
              type="button"
              onClick={() =>
                setAvailabilityForm((prev) => ({ ...prev, day_of_week: ["0", "6"] }))
              }
              className="btn btn-secondary"
            >
              Weekend
            </button>
            <button
              type="button"
              onClick={() =>
                setAvailabilityForm((prev) => ({ ...prev, day_of_week: ["0", "1", "2", "3", "4", "5", "6"] }))
              }
              className="btn btn-secondary"
            >
              All days
            </button>
            <button
              type="button"
              onClick={() =>
                setAvailabilityForm((prev) => ({ ...prev, day_of_week: [] }))
              }
              className="btn"
            >
              Clear
            </button>
          </div>
          <div
            className="availability-days-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              marginTop: 8,
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <label
                className="availability-day-option"
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
        </fieldset>

        <div className="card stack availability-split-card" style={{ border: "1px dashed rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.04)" }}>
          <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
            Split a day around an unavailable window
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
            Example: “I’m available all day except 16:00-18:00” → creates two availability ranges automatically.
          </div>
          <div className="grid-2">
            <label className="field">
              Day
              <select
                value={splitForm.day_of_week}
                onChange={(e) => setSplitForm((p) => ({ ...p, day_of_week: e.target.value }))}
                className="control"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={String(d)}>
                    {weekdayLabel(d)}
                  </option>
                ))}
              </select>
            </label>

            <div />

            <label className="field">
              Day start
              <input
                type="time"
                value={splitForm.day_start}
                onChange={(e) => setSplitForm((p) => ({ ...p, day_start: e.target.value }))}
                className="control"
              />
            </label>
            <label className="field">
              Day end
              <input
                type="time"
                value={splitForm.day_end}
                onChange={(e) => setSplitForm((p) => ({ ...p, day_end: e.target.value }))}
                className="control"
              />
            </label>

            <label className="field">
              Unavailable start
              <input
                type="time"
                value={splitForm.unavailable_start}
                onChange={(e) =>
                  setSplitForm((p) => ({ ...p, unavailable_start: e.target.value }))
                }
                className="control"
              />
            </label>
            <label className="field">
              Unavailable end
              <input
                type="time"
                value={splitForm.unavailable_end}
                onChange={(e) =>
                  setSplitForm((p) => ({ ...p, unavailable_end: e.target.value }))
                }
                className="control"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={availabilitySaving || lockedAvailability}
            onClick={async () => {
              const userId = currentUserId.trim();
              if (!userId) return;
              const day = Number(splitForm.day_of_week);
              const ds = splitForm.day_start;
              const de = splitForm.day_end;
              const us = splitForm.unavailable_start;
              const ue = splitForm.unavailable_end;
              if (![ds, de, us, ue].every(Boolean)) {
                setAvailabilityMessage("Please fill all split fields.");
                return;
              }
              if (!(ds < us && us < ue && ue < de)) {
                setAvailabilityMessage("Split times must satisfy: day start < unavailable start < unavailable end < day end.");
                return;
              }
              setAvailabilitySaving(true);
              setAvailabilityMessage("");
              try {
                const created = [];
                created.push(
                  await createUserAvailability({
                    user_id: userId,
                    day_of_week: day,
                    start_time: ds,
                    end_time: us,
                    start_date: availabilityForm.start_date || null,
                    end_date: availabilityForm.end_date || null,
                  })
                );
                created.push(
                  await createUserAvailability({
                    user_id: userId,
                    day_of_week: day,
                    start_time: ue,
                    end_time: de,
                    start_date: availabilityForm.start_date || null,
                    end_date: availabilityForm.end_date || null,
                  })
                );
                setUserAvailability((prev) => [...prev, ...created]);
                setAvailabilityMessage("Availability saved (split day).");
              } catch (err) {
                setAvailabilityMessage(err?.message || "Failed to save split availability.");
              } finally {
                setAvailabilitySaving(false);
              }
            }}
            className="btn btn-primary btn-block"
          >
            Create two availability ranges
          </button>
        </div>

        <div className="grid-2">
          <label className="field">
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
              className="control"
            />
          </label>

          <label className="field">
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
              className="control"
            />
          </label>
        </div>

        <div className="grid-2">
          <label className="field">
            Start date (optional)
          <IsraelDateInput
            value={availabilityForm.start_date}
            onChange={(nextDate) =>
              setAvailabilityForm((prev) => ({
                ...prev,
                start_date: nextDate,
              }))
            }
            min={rangeMin}
            max={rangeMax}
            className="control"
          />
          </label>

          <label className="field">
            End date (optional)
          <IsraelDateInput
            value={availabilityForm.end_date}
            onChange={(nextDate) =>
              setAvailabilityForm((prev) => ({
                ...prev,
                end_date: nextDate,
              }))
            }
            min={rangeMin}
            max={rangeMax}
            className="control"
          />
          </label>
        </div>

        <button
          type="button"
          disabled={availabilitySaving || lockedAvailability}
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
          className={`btn btn-primary ${isCinema ? "" : "btn-block"}`}
        >
          {availabilitySaving ? "Saving..." : lockedAvailability ? "Availability locked" : "Save availability"}
        </button>
      </div>

      <div className="availability-saved-section" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 8, color: "#0f172a" }}>Saved availability</h3>
        {userAvailability.length === 0 ? (
          <div className="glass availability-empty-card" style={{ padding: 12, borderRadius: 12 }}>
            No availability saved yet.
          </div>
        ) : (
          <div className="grid-auto availability-saved-grid">
            {userAvailability.map((slot) => (
              <div key={slot.id} className="glass availability-slot-card" style={{ padding: 12, borderRadius: 12 }}>
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
                  disabled={lockedAvailability}
                  style={{
                    marginTop: 8,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: lockedAvailability ? "#f1f5f9" : "#fff",
                    color: lockedAvailability ? "#94a3b8" : "#0f172a",
                    cursor: lockedAvailability ? "not-allowed" : "pointer",
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
