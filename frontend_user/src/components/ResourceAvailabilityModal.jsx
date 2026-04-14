import React from "react";
import { MobileMonthAgenda, MonthGrid } from "./BookingViews";
import { formatDate, formatTime, formatTypeLabel } from "../utils/appHelpers";

export default function ResourceAvailabilityModal({
  availabilityResource,
  setAvailabilityResource,
  labels,
  labelsLower,
  currentUserId,
  refreshAvailabilityStatus,
  availabilityError,
  availabilityLoading,
  availabilityMonthLabel,
  setAvailabilityMonthDate,
  availabilityDays,
  bookingDraft,
  bookingSubmitting,
  pickBookingDate,
  submitBookingRequest,
  availabilityBookings,
  setBookingDraft,
  bookingError,
  bookingSuccess,
}) {
  if (!availabilityResource) return null;

  const requestDisabled = bookingSubmitting;
  const requestButtonLabel = "Send request";
  const selectedDayKey = String(bookingDraft?.date || "");

  return (
    <div className="availability-modal" onClick={() => setAvailabilityResource(null)}>
      <div className="glass availability-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="availability-modal__header">
          <div>
            <div className="availability-modal__title">Availability calendar</div>
            <div className="availability-modal__subtitle">
              {availabilityResource.name}{" "}
              {availabilityResource.type_name
                ? `(${formatTypeLabel(availabilityResource.type_name, labels)})`
                : ""}
            </div>
          </div>
          <button
            className="availability-modal__action"
            type="button"
            onClick={() => {
              if (!currentUserId.trim()) return;
              refreshAvailabilityStatus();
            }}
          >
            Refresh status
          </button>
          <button
            className="availability-modal__action"
            type="button"
            onClick={() => setAvailabilityResource(null)}
          >
            Close
          </button>
        </div>

        {availabilityError && (
          <div className="availability-modal__error">{availabilityError}</div>
        )}

        {availabilityLoading ? (
          <div className="availability-modal__loading">Loading availability...</div>
        ) : (
          <>
            <MobileMonthAgenda
              monthLabel={availabilityMonthLabel}
              days={availabilityDays}
              selectedDayKey={selectedDayKey}
              onSelectDay={(day) => {
                pickBookingDate(day);
              }}
              onPrev={() =>
                setAvailabilityMonthDate(
                  (date) => new Date(date.getFullYear(), date.getMonth() - 1, 1)
                )
              }
              onNext={() =>
                setAvailabilityMonthDate(
                  (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1)
                )
              }
              emptyAgendaText="No bookings for the selected day."
              renderAgendaItem={(booking) => (
                <div className="mobile-agenda__item" style={{ cursor: "default" }}>
                  <div>
                    <div className="mobile-agenda__title">{formatDate(booking.date)}</div>
                    <div className="mobile-agenda__sub">Reserved by: {booking.user_id}</div>
                  </div>
                  <div className="mobile-agenda__time">
                    {formatTime(booking.start_time)}–{formatTime(booking.end_time)}
                  </div>
                </div>
              )}
              renderSelectedDayFooter={(day) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isPast = day.date < today;
                const disabled = !day.inMonth || isPast || bookingSubmitting || !day?.key;
                const isSelected = String(day.key) === selectedDayKey;
                const label = isSelected ? requestButtonLabel : "Select this day";
                return (
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    disabled={disabled || (!isSelected && requestDisabled)}
                    onClick={() => {
                      if (!day?.key) return;
                      if (!isSelected) {
                        pickBookingDate(day);
                        return;
                      }
                      submitBookingRequest(day.key);
                    }}
                  >
                    {label}
                  </button>
                );
              }}
            />

            {availabilityBookings.length === 0 && (
              <div className="availability-modal__empty">
                No bookings yet for this {labelsLower.resource}.
              </div>
            )}

            <div className="glass availability-modal__request-card">
              <div className="availability-modal__request-title">
                Request this {labelsLower.resource}
              </div>
              <div className="availability-modal__selected-date">
                Selected date: {bookingDraft.date ? formatDate(bookingDraft.date) : "None"}
              </div>
              <div className="availability-modal__controls">
                <label className="availability-modal__field">
                  Start
                  <input
                    className="availability-modal__time-input"
                    type="time"
                    value={bookingDraft.start}
                    onChange={(e) =>
                      setBookingDraft((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="availability-modal__field">
                  End
                  <input
                    className="availability-modal__time-input"
                    type="time"
                    value={bookingDraft.end}
                    onChange={(e) =>
                      setBookingDraft((prev) => ({
                        ...prev,
                        end: e.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="availability-modal__submit"
                  type="button"
                  onClick={() => submitBookingRequest()}
                  disabled={requestDisabled}
                >
                  {bookingSubmitting ? "Sending..." : requestButtonLabel}
                </button>
              </div>
              {bookingError && (
                <div className="availability-modal__request-error">{bookingError}</div>
              )}
              {bookingSuccess && (
                <div className="availability-modal__request-success">{bookingSuccess}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
