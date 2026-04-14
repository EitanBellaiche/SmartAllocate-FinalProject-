import React from "react";
import { formatTypeLabel, getHallSeatRows, getUserSeatIdsForHall, splitSeatRowIntoSections } from "../utils/appHelpers";

export default function SearchSection({
  isCinema,
  role,
  labels,
  labelsLower,
  bookings,
  resourceQuery,
  setResourceQuery,
  loadResources,
  resourceLoading,
  filteredResources,
  selectedResource,
  setSelectedResourceId,
  cinemaSecondaryButton,
}) {
  return (
    <>
      <header className="search-section__header">
        <h1 className="search-section__title">
          {isCinema ? "Seat Explorer" : `Find a ${labelsLower.resource}`}
        </h1>
        <p className="search-section__subtitle">
          {isCinema
            ? role === "user"
              ? "Browse available seats in the hall and inspect their booking sessions."
              : "Search seats by row, number, hall, or metadata to manage assignments."
            : role === "user"
              ? `Browse all ${labelsLower.resources}, then expand one to see your assignments.`
              : "Search by name or tags, then expand to see your dates & times."}
        </p>
      </header>

      <div className="glass search-section__panel">
        <div className="search-section__toolbar">
          <input
            className="search-section__input"
            value={resourceQuery}
            onChange={(e) => setResourceQuery(e.target.value)}
            placeholder={
              isCinema
                ? "e.g. seat A12, row B, hall 1, VIP..."
                : "e.g. projector, room 103, prep station..."
            }
          />
          <button
            className="search-section__search-button"
            onClick={() => loadResources({ allowEmptyQuery: role === "user" })}
            disabled={resourceLoading}
          >
            {resourceLoading ? "Searching..." : "Search"}
          </button>
        </div>

        {role !== "user" &&
          resourceQuery.trim() &&
          filteredResources.length === 0 &&
          !resourceLoading && (
            <div className="search-section__empty-hint">
              No matches found. Try another keyword.
            </div>
          )}

        {selectedResource ? (
          <div className="search-section__selected-wrap">
            <button
              onClick={() => setSelectedResourceId(null)}
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                cursor: "pointer",
                marginBottom: 12,
                ...cinemaSecondaryButton,
              }}
            >
              Back to results
            </button>

            <div className="glass search-section__details-card">
              <div className="search-section__details-head">
                <div>
                  <div className="search-section__eyebrow">Hall overview</div>
                  <div className="search-section__resource-name">{selectedResource.name}</div>
                </div>

                <span className="search-section__type-badge">
                  {formatTypeLabel(selectedResource.type_name, labels)}
                </span>
              </div>

              {selectedResource.metadata &&
                Object.keys(selectedResource.metadata).length > 0 && (
                  <div className="search-section__meta-list">
                    {Object.entries(selectedResource.metadata)
                      .filter(([key]) => key !== "seatObjects")
                      .map(([key, value]) => (
                        <span key={key} className="search-section__meta-chip">
                          {key}: {String(value)}
                        </span>
                      ))}
                  </div>
                )}

              <div className="search-section__hall-card">
                <div className="search-section__screen">SCREEN</div>

                <div className="search-section__legend">
                  <LegendChip bg="#ecfdf5" border="#86efac" color="#166534" dot="#22c55e" label="Your seat" />
                  <LegendChip bg="#fef3c7" border="#fcd34d" color="#92400e" dot="#facc15" label="Focus / center seat" />
                  <LegendChip bg="#fef2f2" border="#fca5a5" color="#991b1b" dot="#fca5a5" label="Broken seat" />
                  <LegendChip bg="#f5f3ff" border="#c4b5fd" color="#5b21b6" dot="#c4b5fd" label="Available seat" />
                </div>

                <div className="search-section__seat-map">
                  {getHallSeatRows(selectedResource).map(({ rowLabel, items }) => {
                    const sections = splitSeatRowIntoSections(items);
                    const userSeatIds = getUserSeatIdsForHall(selectedResource, bookings);

                    return (
                      <div key={rowLabel} className="search-section__seat-row">
                        <div className="search-section__row-label">
                          {rowLabel}
                        </div>

                        <div className="search-section__row-sections">
                          {[sections.left, sections.center, sections.right].map(
                            (sectionItems, sectionIdx) => (
                              <React.Fragment key={`${rowLabel}-${sectionIdx}`}>
                                {sectionItems.length > 0 && (
                                  <div className="search-section__seat-cluster">
                                    {sectionItems.map((seat) => {
                                      const seatId = String(
                                        seat?.seatId || `${seat?.row || ""}${seat?.number || ""}`
                                      );
                                      const isMine = userSeatIds.has(seatId);
                                      const isBroken = Boolean(seat?.isBroken);
                                      const isFocus =
                                        seat?.section === "center" ||
                                        seat?.section === "front_center";

                                      return (
                                        <div
                                          key={seatId}
                                          title={`${selectedResource.name} • Seat ${seatId}`}
                                          style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 12,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 11,
                                            fontWeight: 900,
                                            color: isMine
                                              ? "#14532d"
                                              : isBroken
                                                ? "#991b1b"
                                                : isFocus
                                                  ? "#92400e"
                                                  : "#312e81",
                                            background: isMine
                                              ? "linear-gradient(180deg,#bbf7d0,#86efac)"
                                              : isBroken
                                                ? "linear-gradient(180deg,#fee2e2,#fecaca)"
                                                : isFocus
                                                  ? "linear-gradient(180deg,#fef3c7,#fde68a)"
                                                  : "linear-gradient(180deg,#ede9fe,#ddd6fe)",
                                            border: isMine
                                              ? "1px solid #22c55e"
                                              : isBroken
                                                ? "1px solid #fca5a5"
                                                : isFocus
                                                  ? "1px solid #fcd34d"
                                                  : "1px solid #c4b5fd",
                                            boxShadow: isMine
                                              ? "0 10px 20px rgba(34,197,94,0.18)"
                                              : isBroken
                                                ? "0 10px 20px rgba(239,68,68,0.12)"
                                                : isFocus
                                                  ? "0 10px 20px rgba(250,204,21,0.18)"
                                                  : "0 10px 20px rgba(109,40,217,0.12)",
                                          }}
                                        >
                                          {seat?.number}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {sectionIdx < 2 && sections.center.length > 0 && (
                                  <div className="search-section__aisle" />
                                )}
                              </React.Fragment>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="search-section__results-list">
            {filteredResources.map((resource) => {
              const userSeats = getUserSeatIdsForHall(resource, bookings);

              return (
                <div
                  key={resource.id}
                  onClick={() => setSelectedResourceId(resource.id)}
                  className="search-section__result-card"
                >
                  <div className="search-section__result-name">{resource.name}</div>
                  <div className="search-section__result-meta">
                    {userSeats.size > 0
                      ? `${userSeats.size} seats yours`
                      : "No seats assigned"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function LegendChip({ bg, border, color, dot, label }) {
  return (
    <div
      className="search-section__legend-chip"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <span
        className="search-section__legend-dot"
        style={{ background: dot }}
      />
      {label}
    </div>
  );
}
