import React, { useMemo, useState } from "react";
import {
  getBookingsByUser,
  getAllResources,
  createResourceRequest,
  getBookingsByResource,
} from "./api";

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(t) {
  return t ? t.slice(0, 5) : "";
}

function toDateKey(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

function buildMonthGrid(baseDate, bookings) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  // start from Sunday
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - gridStart.getDay());
  const gridEnd = new Date(end);
  gridEnd.setDate(end.getDate() + (6 - gridEnd.getDay()));

  const byDate = bookings.reduce((acc, b) => {
    const key = toDateKey(b.date);
    acc[key] = acc[key] || [];
    acc[key].push(b);
    return acc;
  }, {});

  const days = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({
      date: new Date(d),
      key,
      inMonth: d.getMonth() === baseDate.getMonth(),
      bookings: byDate[key] || [],
    });
  }
  return days;
}

export default function App() {
  const [studentId, setStudentId] = useState("");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState("month"); // month | list
  const [monthDate, setMonthDate] = useState(new Date());
  const [hasStudent, setHasStudent] = useState(false);

  // resource search
  const [resources, setResources] = useState([]);
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState(null);
  const [requestQuery, setRequestQuery] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestResourceId, setRequestResourceId] = useState(null);
  const [requestSent, setRequestSent] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestView, setRequestView] = useState("list"); // list | form
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [availabilityResource, setAvailabilityResource] = useState(null);
  const [availabilityBookings, setAvailabilityBookings] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityMonthDate, setAvailabilityMonthDate] = useState(
    () => new Date()
  );

  async function loadBookings() {
    if (!studentId.trim()) {
      setError("Please enter a student ID.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await getBookingsByUser(studentId.trim());
      setBookings(Array.isArray(data) ? data : []);
      setHasStudent(true);
    } catch (err) {
      setError(err?.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }

  const filteredBookings = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const resourcesTxt = (b.resources || [])
        .map((r) => `${r.name} ${r.type_name || ""}`)
        .join(" ");
      const haystack = `${b.id} ${b.date} ${resourcesTxt}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [bookings, filter]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return filteredBookings.filter(
      (b) => new Date(`${b.date}T${b.start_time}`) >= now
    );
  }, [filteredBookings]);

  const past = useMemo(() => {
    const now = new Date();
    return filteredBookings.filter(
      (b) => new Date(`${b.date}T${b.start_time}`) < now
    );
  }, [filteredBookings]);

  const monthDays = useMemo(
    () => buildMonthGrid(monthDate, filteredBookings),
    [monthDate, filteredBookings]
  );
  const availabilityDays = useMemo(
    () => buildMonthGrid(availabilityMonthDate, availabilityBookings),
    [availabilityMonthDate, availabilityBookings]
  );

  const monthLabel = monthDate.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const availabilityMonthLabel = availabilityMonthDate.toLocaleDateString(
    "en-GB",
    {
      month: "long",
      year: "numeric",
    }
  );

  function isResourceAvailable(resource) {
    const meta = resource?.metadata || {};
    if (meta.available === true) return true;
    const status = `${meta.status || meta.availability || ""}`.toLowerCase();
    return status === "available" || status === "free" || status === "open";
  }

  function resourceMatchesQuery(resource, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${resource.name} ${resource.type_name || ""} ${JSON.stringify(
      resource.metadata || {}
    )}`.toLowerCase();
    return hay.includes(q);
  }

  const filteredResources = useMemo(() => {
    if (!resourceQuery.trim()) return [];
    return resources.filter((r) => resourceMatchesQuery(r, resourceQuery));
  }, [resources, resourceQuery]);

  const filteredRequestResources = useMemo(() => {
    return resources.filter((r) => {
      if (!resourceMatchesQuery(r, requestQuery)) return false;
      if (onlyAvailable && !isResourceAvailable(r)) return false;
      return true;
    });
  }, [resources, requestQuery, onlyAvailable]);

  const selectedResource = useMemo(() => {
    if (!selectedResourceId) return null;
    return resources.find((r) => r.id === selectedResourceId) || null;
  }, [resources, selectedResourceId]);

  const selectedRequestResource = useMemo(() => {
    if (!requestResourceId) return null;
    return resources.find((r) => r.id === requestResourceId) || null;
  }, [resources, requestResourceId]);

  async function loadResources(options = {}) {
    const { allowEmptyQuery = false } = options;
    if (!allowEmptyQuery && !resourceQuery.trim()) return;
    setResourceError("");
    setResourceLoading(true);
    try {
      const data = await getAllResources();
      setResources(Array.isArray(data) ? data : []);
    } catch (err) {
      setResourceError(err?.message || "Failed to load resources.");
    } finally {
      setResourceLoading(false);
    }
  }

  async function openAvailability(resource) {
    if (!resource) return;
    setAvailabilityResource(resource);
    setAvailabilityMonthDate(new Date());
    setAvailabilityError("");
    setAvailabilityLoading(true);
    try {
      const data = await getBookingsByResource(resource.id);
      setAvailabilityBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      setAvailabilityError(err?.message || "Failed to load availability.");
      setAvailabilityBookings([]);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function submitResourceRequest() {
    if (!selectedRequestResource) return;
    const note = requestNote.trim();
    const requester = studentId.trim();
    if (!requester) {
      setRequestError("Please enter your student ID first.");
      return;
    }
    if (!note) {
      setRequestError("Please add a short reason for the request.");
      return;
    }
    setRequestError("");
    setRequestSubmitting(true);
    try {
      await createResourceRequest({
        resource_id: selectedRequestResource.id,
        student_id: requester,
        note,
      });
      setRequestSent(`Request sent for ${selectedRequestResource.name}.`);
      setRequestNote("");
      setRequestResourceId(null);
      setRequestView("list");
    } catch (err) {
      setRequestError(err?.message || "Failed to send request.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  // map resource id -> sessions for this student
  const resourceSessions = useMemo(() => {
    const byId = {};
    for (const b of bookings) {
      for (const r of b.resources || []) {
        byId[r.id] = byId[r.id] || [];
        byId[r.id].push({
          bookingId: b.id,
          date: b.date,
          start: b.start_time,
          end: b.end_time,
          role: r.role || null,
        });
      }
    }
    Object.values(byId).forEach((list) =>
      list.sort(
        (a, b) =>
          new Date(`${a.date}T${a.start}`) - new Date(`${b.date}T${b.start}`)
      )
    );
    return byId;
  }, [bookings]);

  // Sidebar selection
  const [section, setSection] = useState("schedule"); // schedule | search | requests

  if (!hasStudent) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg,#f8fafc 0%,#e2e8f0 100%)",
        }}
      >
        <div
          className="glass"
          style={{
            width: 420,
            padding: 24,
            borderRadius: 18,
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: "0 0 8px", color: "#0f172a" }}>Welcome</h2>
          <p style={{ margin: "0 0 16px", color: "#475569" }}>
            Please enter your student ID to load your bookings.
          </p>
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="e.g. 123456789"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              marginBottom: 12,
            }}
          />
          <button
            onClick={loadBookings}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 12,
              border: "none",
              background: loading ? "#94a3b8" : "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              boxShadow: "0 10px 30px rgba(37,99,235,0.35)",
            }}
          >
            {loading ? "Loading..." : "Load my bookings"}
          </button>
          {error && (
            <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#f8fafc" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: "#0f172a",
          color: "#e2e8f0",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18 }}>SmartAllocate</div>
        <div style={{ fontSize: 12, color: "#cbd5e1" }}>
          Student ID: {studentId}
        </div>
        <button
          onClick={() => setSection("schedule")}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: section === "schedule" ? "#1d4ed8" : "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          My Schedule
        </button>
        <button
          onClick={() => setSection("search")}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: section === "search" ? "#1d4ed8" : "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Find Resource
        </button>
        <button
          onClick={() => setSection("requests")}
          style={{
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: section === "requests" ? "#1d4ed8" : "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Resource Requests
        </button>
        <div style={{ marginTop: "auto", fontSize: 12, color: "#94a3b8" }}>
          Powered by SmartAllocate
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {section === "schedule" ? (
          <>
            <header
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>My Schedule</h1>
              <p style={{ margin: 0, color: "#475569" }}>
                Month or list view of your bookings.
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
                <h3 style={{ margin: 0, color: "#0f172a" }}>My Bookings</h3>
                <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
                  Search by resource or tag. Switch between month grid and list.
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
                        viewMode === opt.key
                          ? "rgba(37,99,235,0.1)"
                          : "transparent",
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

            {bookings.length === 0 && !loading ? (
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
                No bookings yet. Enter an ID and click "Load bookings".
              </div>
            ) : (
              <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
                {viewMode === "month" ? (
                  <MonthGrid
                    monthLabel={monthLabel}
                    onPrev={() =>
                      setMonthDate(
                        (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                      )
                    }
                    onNext={() =>
                      setMonthDate(
                        (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                      )
                    }
                    days={monthDays}
                  />
                ) : (
                  <>
                    <Section title="Upcoming" color="#2563eb" items={upcoming} />
                    <Section title="Past" color="#94a3b8" items={past} />
                  </>
                )}
              </div>
            )}
          </>
        ) : section === "search" ? (
          <>
            <header
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>Find a resource</h1>
              <p style={{ margin: 0, color: "#475569" }}>
                Search by name or tags, then expand to see your dates & times.
              </p>
            </header>

            <div
              className="glass"
              style={{
                padding: 16,
                borderRadius: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <input
                  value={resourceQuery}
                  onChange={(e) => setResourceQuery(e.target.value)}
                  placeholder="e.g. projector, room 103, prep station..."
                  style={{
                    flex: 1,
                    minWidth: 280,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                />
                <button
                  onClick={loadResources}
                  disabled={resourceLoading}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: resourceLoading ? "#94a3b8" : "#2563eb",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: resourceLoading ? "default" : "pointer",
                    boxShadow: "0 10px 30px rgba(37,99,235,0.25)",
                  }}
                >
                  {resourceLoading ? "Searching..." : "Search"}
                </button>
              </div>

              {resourceError && (
                <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
                  {resourceError}
                </div>
              )}

              {resourceQuery.trim() &&
                filteredResources.length === 0 &&
                !resourceLoading && (
                  <div
                    style={{
                      marginTop: 16,
                      color: "#475569",
                    }}
                  >
                    No matches found. Try another keyword.
                  </div>
                )}

              {selectedResource ? (
                <div
                  style={{
                    marginTop: 18,
                    padding: 18,
                    borderRadius: 18,
                    background:
                      "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(14,116,144,0.12))",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <button
                    onClick={() => setSelectedResourceId(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#1d4ed8",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                      marginBottom: 12,
                    }}
                  >
                    Back to results
                  </button>
                  <div
                    className="glass"
                    style={{
                      padding: 16,
                      borderRadius: 16,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          Resource
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                          {selectedResource.name}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          background: "#e0e7ff",
                          color: "#1d4ed8",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontWeight: 700,
                        }}
                      >
                        {selectedResource.type_name || "Resource"}
                      </span>
                    </div>

                    {selectedResource.metadata &&
                      Object.keys(selectedResource.metadata).length > 0 && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#475569",
                            lineHeight: 1.6,
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            marginBottom: 14,
                          }}
                        >
                          {Object.entries(selectedResource.metadata)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" | ")}
                        </div>
                      )}

                    <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
                      Sessions
                    </div>
                    {(resourceSessions[selectedResource.id] || []).length === 0 && (
                      <div style={{ color: "#475569" }}>
                        No sessions found for this resource.
                      </div>
                    )}
                    {(resourceSessions[selectedResource.id] || []).length > 0 && (
                      <div style={{ display: "grid", gap: 10 }}>
                        {(resourceSessions[selectedResource.id] || []).map((s) => (
                          <div
                            key={`${s.bookingId}-${s.start}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "6px 1fr",
                              gap: 12,
                              alignItems: "stretch",
                            }}
                          >
                            <div
                              style={{
                                borderRadius: 999,
                                background: "linear-gradient(180deg,#2563eb,#0ea5a5)",
                              }}
                            />
                            <div
                              style={{
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              <div style={{ fontWeight: 700 }}>
                                {formatDate(s.date)}
                              </div>
                              <div style={{ color: "#475569", fontSize: 12 }}>
                                {formatTime(s.start)} - {formatTime(s.end)} - Booking #{s.bookingId}
                              </div>
                              {s.role && (
                                <div style={{ color: "#1d4ed8", fontWeight: 700 }}>
                                  Role: {s.role}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                filteredResources.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {filteredResources.slice(0, 20).map((r) => {
                      const sessions = resourceSessions[r.id] || [];
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedResourceId(r.id)}
                          className="glass"
                          style={{
                            textAlign: "left",
                            borderRadius: 16,
                            padding: 14,
                            border: "1px solid #e2e8f0",
                            background: "#fff",
                            cursor: "pointer",
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div style={{ fontWeight: 800, color: "#0f172a" }}>
                              {r.name}
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                background: "#e0e7ff",
                                color: "#1d4ed8",
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontWeight: 700,
                              }}
                            >
                              {r.type_name || "Resource"}
                            </span>
                          </div>
                          <div style={{ color: "#475569", fontSize: 12 }}>
                            {sessions.length} session{sessions.length === 1 ? "" : "s"}
                          </div>
                          {r.metadata && Object.keys(r.metadata).length > 0 && (
                            <div style={{ color: "#64748b", fontSize: 12 }}>
                              {Object.entries(r.metadata)
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" | ")}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </>
        ) : (
          <>
            <header
              style={{
                padding: "12px 0",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 16,
              }}
            >
              <h1 style={{ margin: 0, color: "#0f172a" }}>
                Request a resource
              </h1>
              <p style={{ margin: 0, color: "#475569" }}>
                Browse resources and send a request to your admin.
              </p>
            </header>

            {requestSent && (
              <div
                className="glass"
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
                className="glass"
                style={{
                  padding: 18,
                  borderRadius: 18,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
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
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#0f172a",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Back to resources
                  </button>
                </div>

                {selectedRequestResource ? (
                  <>
                    <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>
                      {selectedRequestResource.name}{" "}
                      {selectedRequestResource.type_name
                        ? `(${selectedRequestResource.type_name})`
                        : ""}
                    </div>
                    {requestError && (
                      <div style={{ marginTop: 10, color: "#b91c1c" }}>
                        {requestError}
                      </div>
                    )}
                    <textarea
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
                    <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                      <button
                        onClick={submitResourceRequest}
                        disabled={requestSubmitting}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "none",
                          background: requestSubmitting ? "#94a3b8" : "#2563eb",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: requestSubmitting ? "default" : "pointer",
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
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          color: "#0f172a",
                          fontWeight: 700,
                          cursor: requestSubmitting ? "default" : "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 12, color: "#475569" }}>
                    Pick a resource to continue.
                  </div>
                )}
              </div>
            ) : (
              <div
                className="glass"
                style={{
                  padding: 16,
                  borderRadius: 18,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <input
                    value={requestQuery}
                    onChange={(e) => setRequestQuery(e.target.value)}
                    placeholder="Search resources..."
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
                  <label style={{ display: "flex", gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={onlyAvailable}
                      onChange={(e) => setOnlyAvailable(e.target.checked)}
                    />
                    Only available
                  </label>
                  <button
                    onClick={() => loadResources({ allowEmptyQuery: true })}
                    disabled={resourceLoading}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: "none",
                      background: resourceLoading ? "#94a3b8" : "#2563eb",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: resourceLoading ? "default" : "pointer",
                      boxShadow: "0 10px 30px rgba(37,99,235,0.25)",
                    }}
                  >
                    {resourceLoading ? "Loading..." : "Load resources"}
                  </button>
                </div>

                {resourceError && (
                  <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
                    {resourceError}
                  </div>
                )}

                {resources.length === 0 && !resourceLoading && (
                  <div style={{ marginTop: 16, color: "#475569" }}>
                    Load resources to get started.
                  </div>
                )}

                {resources.length > 0 &&
                  filteredRequestResources.length === 0 &&
                  !resourceLoading && (
                    <div style={{ marginTop: 16, color: "#475569" }}>
                      No resources match your filters.
                    </div>
                  )}

                {filteredRequestResources.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {filteredRequestResources.slice(0, 20).map((r) => {
                      const available = isResourceAvailable(r);
                      return (
                        <div
                          key={r.id}
                          className="glass"
                          style={{
                            borderRadius: 16,
                            padding: 14,
                            border: "1px solid #e2e8f0",
                            background: "#fff",
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                                {r.name}
                              </div>
                              <div style={{ color: "#475569", fontSize: 12 }}>
                                {r.type_name ? `Type: ${r.type_name}` : "Resource"}
                              </div>
                            </div>
                          <button
                            type="button"
                            onClick={() => openAvailability(r)}
                            style={{
                              fontSize: 12,
                              background: available ? "#dcfce7" : "#e2e8f0",
                              color: available ? "#166534" : "#475569",
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontWeight: 700,
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            {available ? "Available" : "Check availability"}
                          </button>
                          </div>

                          {r.metadata && Object.keys(r.metadata).length > 0 && (
                            <div style={{ color: "#64748b", fontSize: 12 }}>
                              {Object.entries(r.metadata)
                                .slice(0, 4)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" | ")}
                            </div>
                          )}

                          <div>
                            <button
                              onClick={() => {
                                setRequestResourceId(r.id);
                                setRequestSent("");
                                setRequestError("");
                                setRequestNote("");
                                setRequestView("form");
                              }}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "none",
                                background: "#0f172a",
                                color: "#fff",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Request this resource
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
        )}

        {availabilityResource && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 50,
            }}
            onClick={() => setAvailabilityResource(null)}
          >
            <div
              className="glass"
              style={{
                width: "min(980px, 96vw)",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: 20,
                borderRadius: 18,
                background: "#fff",
                border: "1px solid #e2e8f0",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    Availability calendar
                  </div>
                  <div style={{ color: "#475569", fontSize: 12 }}>
                    {availabilityResource.name}{" "}
                    {availabilityResource.type_name
                      ? `(${availabilityResource.type_name})`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAvailabilityResource(null)}
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
              </div>

              {availabilityError && (
                <div style={{ marginBottom: 10, color: "#b91c1c" }}>
                  {availabilityError}
                </div>
              )}

              {availabilityLoading ? (
                <div style={{ color: "#475569" }}>Loading availability...</div>
              ) : (
                <>
                  <MonthGrid
                    monthLabel={availabilityMonthLabel}
                    onPrev={() =>
                      setAvailabilityMonthDate(
                        (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                      )
                    }
                    onNext={() =>
                      setAvailabilityMonthDate(
                        (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                      )
                    }
                    days={availabilityDays}
                    maxItems={null}
                    renderBooking={(b) => (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "linear-gradient(135deg,#0f172a,#1e293b)",
                          color: "#fff",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {formatTime(b.start_time)} - {formatTime(b.end_time)}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          Reserved by: {b.user_id}
                        </div>
                      </div>
                    )}
                  />
                  {availabilityBookings.length === 0 && (
                    <div style={{ marginTop: 12, color: "#475569" }}>
                      No bookings yet for this resource.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, color, items }) {
  return (
    <section>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: color,
            display: "inline-block",
          }}
        />
        <h3 style={{ margin: 0, color: "#0f172a" }}>{title}</h3>
      </div>

      {items.length === 0 ? (
        <div
          className="glass"
          style={{
            padding: 14,
            borderRadius: 14,
            color: "#475569",
            fontSize: 14,
          }}
        >
          No bookings in this category.
        </div>
      ) : (
        <div className="grid-auto">
          {items.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      )}
    </section>
  );
}

function BookingCard({ booking }) {
  return (
    <div
      className="glass"
      style={{
        padding: 16,
        borderRadius: 16,
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ color: "#475569", fontSize: 12 }}>
            Booking #{booking.id}
          </div>
          <div style={{ color: "#0f172a", fontWeight: 600 }}>
            {formatDate(booking.date)}
          </div>
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(37, 99, 235, 0.1)",
            color: "#1d4ed8",
            fontSize: 13,
            border: "1px solid rgba(37,99,235,0.25)",
          }}
        >
          {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {(booking.resources || []).map((r) => (
          <div
            key={r.id}
            style={{
              padding: 10,
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ color: "#0f172a", fontWeight: 600 }}>{r.name}</div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>
              {r.type_name ? `Type: ${r.type_name}` : ""}
              {r.role ? ` - Role: ${r.role}` : ""}
            </div>
            {r.metadata && Object.keys(r.metadata).length > 0 && (
              <div
                style={{
                  color: "#64748b",
                  fontSize: 12,
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                {Object.entries(r.metadata)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" | ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({
  monthLabel,
  onPrev,
  onNext,
  days,
  renderBooking,
  maxItems = 3,
}) {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="glass" style={{ padding: 16, borderRadius: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onPrev}
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            &lt;
          </button>
          <button
            onClick={onNext}
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#0f172a",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            &gt;
          </button>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>{monthLabel}</div>
        </div>
        <div className="badge">
          <span role="img" aria-label="calendar">
            CAL
          </span>
          Month view
        </div>
      </div>

      <div className="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontWeight: 700,
              color: "#475569",
            }}
          >
            {d}
          </div>
        ))}

        {weeks.map((week, wi) =>
          week.map((day, di) => (
            <div
              key={`${wi}-${di}`}
              className="calendar-day"
              style={{
                opacity: day.inMonth ? 1 : 0.45,
              }}
            >
              <div className="date">{day.date.getDate()}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(typeof maxItems === "number"
                  ? day.bookings.slice(0, maxItems)
                  : day.bookings
                ).map((b) => (
                  <div key={b.id}>
                    {renderBooking ? (
                      renderBooking(b)
                    ) : (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                          color: "#fff",
                          fontSize: 12,
                          boxShadow: "0 6px 18px rgba(37,99,235,0.25)",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {(b.resources || [])
                            .map((r) => r.name)
                            .filter(Boolean)
                            .join(" / ")}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          {formatTime(b.start_time)} - {formatTime(b.end_time)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {typeof maxItems === "number" &&
                  day.bookings.length > maxItems && (
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    +{day.bookings.length - maxItems} more
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
