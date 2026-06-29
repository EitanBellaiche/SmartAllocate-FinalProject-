import React from "react";
import {
  formatDate,
  formatTime,
  formatTypeLabel,
  getBookingResources,
} from "../utils/appHelpers";

function formatMetaValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value ?? "");
}

function formatMetaLabel(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPrimaryLocationResource(resources) {
  return resources.find((resource) => {
    const meta = resource?.metadata || {};
    return meta.room || meta.location || meta.site || meta.space || meta.building || meta.floor;
  });
}

function getLocationHighlights(metadata = {}) {
  const preferredKeys = [
    "building",
    "floor",
    "capacity",
    "users",
    "is_lab",
    "computer_lab",
    "projector",
    "is_studio",
  ];

  return preferredKeys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== "")
    .map((key) => ({
      key,
      label: formatMetaLabel(key),
      value: formatMetaValue(metadata[key]),
    }));
}

export default function BookingDetailsModal({
  selectedScheduleBooking,
  setSelectedScheduleBooking,
  labels,
}) {
  if (!selectedScheduleBooking) return null;

  const bookingResources = getBookingResources(selectedScheduleBooking);
  const title =
    (selectedScheduleBooking.resources || [])
      .map((resource) => resource.name)
      .filter(Boolean)
      .join(" / ") || "Booking";
  const locationResource = getPrimaryLocationResource(bookingResources);
  const locationMetadata = locationResource?.metadata || {};
  const locationHighlights = getLocationHighlights(locationMetadata);
  const detailResources = locationResource
    ? bookingResources.filter((resource) => resource !== locationResource)
    : bookingResources;

  return (
    <div
      className="booking-details-modal"
      onClick={() => setSelectedScheduleBooking(null)}
    >
      <div
        className="glass booking-details-modal__card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="booking-details-modal__header">
          <div className="booking-details-modal__heading">
            <div className="booking-details-modal__title">{title}</div>
            <div className="booking-details-modal__time">
              {formatDate(selectedScheduleBooking.date)} -{" "}
              {formatTime(selectedScheduleBooking.start_time)} -{" "}
              {formatTime(selectedScheduleBooking.end_time)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedScheduleBooking(null)}
            className="booking-details-modal__close"
          >
            Close
          </button>
        </div>

        {locationResource ? (
          <section className="booking-details-modal__location">
            <div className="booking-details-modal__location-copy">
              <div className="booking-details-modal__location-label">Location</div>
              <div className="booking-details-modal__location-title">
                {locationResource.name || "On-site"}
              </div>
              {locationResource.type_name ? (
                <div className="booking-details-modal__location-subtitle">
                  {formatTypeLabel(locationResource.type_name, labels)}
                </div>
              ) : null}
            </div>

            {locationHighlights.length > 0 ? (
              <div className="booking-details-modal__location-chips">
                {locationHighlights.map((item) => (
                  <div className="booking-details-modal__location-chip" key={item.key}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {detailResources.length > 0 ? (
          <div className="booking-details-modal__resources">
            {detailResources.map((resource, index) => (
              <div
                key={`${resource?.id || "resource"}-${index}`}
                className="booking-details-modal__resource"
              >
                <div className="booking-details-modal__resource-title">
                  {resource?.name || "Resource"}
                </div>
                <div className="booking-details-modal__resource-type">
                  {resource?.type_name
                    ? `Type: ${formatTypeLabel(resource.type_name, labels)}`
                    : ""}
                  {resource?.role ? ` - Role: ${resource.role}` : ""}
                </div>

                {resource?.metadata && Object.keys(resource.metadata).length > 0 ? (
                  <div className="booking-details-modal__metadata">
                    {Object.entries(resource.metadata).map(([key, value]) => (
                      <div className="booking-details-modal__meta-row" key={key}>
                        <span className="booking-details-modal__meta-key">
                          {formatMetaLabel(key)}
                        </span>
                        <span className="booking-details-modal__meta-value">
                          {formatMetaValue(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
