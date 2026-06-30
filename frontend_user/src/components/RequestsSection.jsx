import React from "react";
import { formatTypeLabel } from "../utils/appHelpers";

export default function RequestsSection({
  labels,
  labelsLower,
  isCinema,
  cinemaPrimaryButton,
  cinemaSecondaryButton,
  requestSent,
  requestView,
  setRequestView,
  setRequestResourceId,
  setRequestError,
  selectedRequestResource,
  requestError,
  requestNote,
  setRequestNote,
  requestSubmitting,
  submitResourceRequest,
  requestQuery,
  setRequestQuery,
  onlyAvailable,
  setOnlyAvailable,
  loadResources,
  resourceLoading,
  resourceError,
  resources,
  filteredRequestResources,
  isResourceAvailable,
  openAvailability,
  setRequestSent,
}) {
  return (
    <>
      <header
        className="requests-page-header"
        style={{
          padding: "12px 0",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, color: "#0f172a" }}>
          Request a {labelsLower.resource}
        </h1>
        <p style={{ margin: 0, color: "#475569" }}>
          Browse {labelsLower.resources} and send a request to your admin.
        </p>
      </header>

      {requestSent && (
        <div
          className="glass requests-success-message"
          style={{
            padding: 12,
            borderRadius: 12,
            color: "#166534",
            marginBottom: 12,
          }}
        >
          {requestSent}
        </div>
      )}

      {requestView === "form" ? (
        <div
          className="glass requests-form-panel"
          style={{
            padding: 18,
            borderRadius: 18,
            border: "1px solid #e2e8f0",
            background: "#fff",
          }}
        >
          <div className="requests-form-panel__head" style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                Request details
              </div>
              <div style={{ color: "#64748b", fontSize: 12 }}>
                Fill in the request and send it to your admin.
              </div>
            </div>
            <button
              onClick={() => {
                setRequestView("list");
                setRequestResourceId(null);
                setRequestError("");
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                cursor: "pointer",
                ...(isCinema
                  ? cinemaSecondaryButton
                  : {
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#0f172a",
                      fontWeight: 700,
                    }),
              }}
            >
              Back to {labels.resources}
            </button>
          </div>

          {selectedRequestResource ? (
            <>
              <div className="requests-selected-resource" style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>
                <span className="requests-selected-resource__label">Selected resource</span>
                <strong>{selectedRequestResource.name}</strong>
                {selectedRequestResource.type_name && (
                  <span>{formatTypeLabel(selectedRequestResource.type_name, labels)}</span>
                )}
              </div>
              {requestError && (
                <div style={{ marginTop: 10, color: "#b91c1c" }}>
                  {requestError}
                </div>
              )}
              <textarea
                className="requests-note-input"
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="Reason for the request..."
                disabled={requestSubmitting}
                style={{
                  width: "100%",
                  minHeight: 110,
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#0f172a",
                }}
              />
              <div className="requests-form-actions" style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button
                  onClick={submitResourceRequest}
                  disabled={requestSubmitting}
                  style={{
                    padding: "12px 18px",
                    borderRadius: 16,
                    cursor: requestSubmitting ? "default" : "pointer",
                    ...(requestSubmitting
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
                            background: "#2563eb",
                            color: "#fff",
                            fontWeight: 700,
                          }),
                  }}
                >
                  {requestSubmitting ? "Sending..." : "Send request"}
                </button>
                <button
                  onClick={() => {
                    setRequestResourceId(null);
                    setRequestView("list");
                    setRequestError("");
                  }}
                  disabled={requestSubmitting}
                  style={{
                    marginTop: 2,
                    padding: "6px 10px",
                    borderRadius: 10,
                    cursor: requestSubmitting ? "not-allowed" : "pointer",
                    ...(isCinema
                      ? cinemaSecondaryButton
                      : {
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          color: "#1d4ed8",
                          fontWeight: 700,
                        }),
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 12, color: "#475569" }}>
              Pick a {labelsLower.resource} to continue.
            </div>
          )}
        </div>
      ) : (
        <div
          className="glass requests-list-panel"
          style={{
            padding: 16,
            borderRadius: 18,
          }}
        >
          <div
            className="requests-toolbar"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <input
              className="requests-search-input"
              value={requestQuery}
              onChange={(e) => setRequestQuery(e.target.value)}
              placeholder={`Search ${labelsLower.resources}...`}
              style={{
                flex: 1,
                minWidth: 240,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#0f172a",
              }}
            />
            <label className="requests-available-toggle" style={{ display: "flex", gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
              />
              Only available
            </label>
            <button
              className="requests-load-button"
              onClick={() => loadResources({ allowEmptyQuery: true })}
              disabled={resourceLoading}
              style={{
                padding: "12px 18px",
                borderRadius: 16,
                cursor: resourceLoading ? "default" : "pointer",
                ...(resourceLoading
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
                        background: "#2563eb",
                        color: "#fff",
                        fontWeight: 700,
                        boxShadow: "0 10px 30px rgba(37,99,235,0.25)",
                      }),
              }}
            >
              {resourceLoading ? "Loading..." : `Load ${labelsLower.resources}`}
            </button>
          </div>

          {resourceError && (
            <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
              {resourceError}
            </div>
          )}

          {resources.length === 0 && !resourceLoading && (
            <div style={{ marginTop: 16, color: "#475569" }}>
              Load {labelsLower.resources} to get started.
            </div>
          )}

          {resources.length > 0 &&
            filteredRequestResources.length === 0 &&
            !resourceLoading && (
              <div style={{ marginTop: 16, color: "#475569" }}>
                No {labelsLower.resources} match your filters.
              </div>
            )}

          {filteredRequestResources.length > 0 && (
            <div
              className="requests-results-grid"
              style={{
                marginTop: 16,
                display: "grid",
                gap: 12,
              }}
            >
              {filteredRequestResources.map((r) => {
                const available = isResourceAvailable(r);
                return (
                  <div
                    key={r.id}
                    className="glass requests-resource-card"
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      border: isCinema ? "1px solid #d1d5db" : "1px solid #e2e8f0",
                      background: "#fff",
                      display: "grid",
                      gap: 10,
                      boxShadow: isCinema ? "0 10px 24px rgba(15,23,42,0.06)" : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: "#0f172a" }}>{r.name}</div>
                        <div style={{ color: "#475569", fontSize: 12 }}>
                          {r.type_name
                            ? `Type: ${formatTypeLabel(r.type_name, labels)}`
                            : labels.resource}
                        </div>
                      </div>
                      <button
                        className={`requests-availability-button ${
                          available ? "requests-availability-button--available" : ""
                        }`}
                        type="button"
                        onClick={() => openAvailability(r)}
                        style={{
                          fontSize: 12,
                          padding: "8px 12px",
                          borderRadius: 999,
                          fontWeight: 800,
                          cursor: "pointer",
                          ...(isCinema
                            ? available
                              ? {
                                  border: "1px solid #86efac",
                                  background: "#ecfdf5",
                                  color: "#166534",
                                  boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                                }
                              : cinemaSecondaryButton
                            : {
                                border: "none",
                                background: available ? "#dcfce7" : "#e2e8f0",
                                color: available ? "#166534" : "#475569",
                              }),
                        }}
                      >
                        {available ? "Available" : "Check availability"}
                      </button>
                    </div>

                    {r.metadata && Object.keys(r.metadata).length > 0 && (
                      <div className="requests-resource-meta" style={{ color: "#64748b", fontSize: 12 }}>
                        {Object.entries(r.metadata)
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <span className="requests-resource-meta-chip" key={k}>
                              <span>{k}</span>
                              <strong>{String(v)}</strong>
                            </span>
                          ))}
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div className="requests-resource-id" style={{ color: "#475569", fontSize: 12 }}>Resource ID: {r.id}</div>
                      <button
                        className="requests-request-button"
                        onClick={() => {
                          setRequestResourceId(r.id);
                          setRequestSent("");
                          setRequestError("");
                          setRequestNote("");
                          setRequestView("form");
                        }}
                        style={{
                          padding: "12px 18px",
                          borderRadius: 16,
                          cursor: "pointer",
                          ...(isCinema
                            ? cinemaPrimaryButton
                            : {
                                border: "none",
                                background: "#0f172a",
                                color: "#fff",
                                fontWeight: 700,
                              }),
                        }}
                      >
                        Request this {labelsLower.resource}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
