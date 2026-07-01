import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../api/api";
import { formatIsraelDate, getIsraelDateValue } from "../utils/datetime";
import { getOrgConfig, rememberPresentation } from "../orgConfig";
import "./Dashboard.css";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [resources, setResources] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const config = getOrgConfig();
  const theme = config.theme;

  const [editModal, setEditModal] = useState({
    open: false,
    item: null,
  });
  const [selectedType, setSelectedType] = useState(null);
  const [editForm, setEditForm] = useState({
    id: null,
    name: "",
    type_id: "",
    metadata: {},
  });
  const [viewModal, setViewModal] = useState({
    open: false,
    item: null,
    bookings: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    async function loadStats() {
      setLoadWarning("");
      try {
        const [resourcesResult, bookingsResult, typeResult, pendingRequestsResult] = await Promise.allSettled([
          apiGet("/resources"),
          apiGet("/bookings?include_cancelled=1"),
          apiGet("/resource-types"),
          apiGet("/resource-requests?status=pending"),
        ]);

        const resourcesData =
          resourcesResult.status === "fulfilled" && Array.isArray(resourcesResult.value)
            ? resourcesResult.value
            : [];
        const bookings =
          bookingsResult.status === "fulfilled" && Array.isArray(bookingsResult.value)
            ? bookingsResult.value
            : [];
        const typeData =
          typeResult.status === "fulfilled" && Array.isArray(typeResult.value)
            ? typeResult.value
            : [];
        const pendingRequests =
          pendingRequestsResult.status === "fulfilled" && Array.isArray(pendingRequestsResult.value)
            ? pendingRequestsResult.value
            : [];
        const failedSections = [
          resourcesResult.status === "rejected" ? "resources" : "",
          bookingsResult.status === "rejected" ? "bookings" : "",
          typeResult.status === "rejected" ? "resource types" : "",
          pendingRequestsResult.status === "rejected" ? "pending approvals" : "",
        ].filter(Boolean);

        if (failedSections.length > 0) {
          console.error("Dashboard partial load error:", {
            resources: resourcesResult.status === "rejected" ? resourcesResult.reason : null,
            bookings: bookingsResult.status === "rejected" ? bookingsResult.reason : null,
            resourceTypes: typeResult.status === "rejected" ? typeResult.reason : null,
            pendingRequests:
              pendingRequestsResult.status === "rejected" ? pendingRequestsResult.reason : null,
          });
          setLoadWarning(`Some dashboard data could not be loaded: ${failedSections.join(", ")}.`);
        }

        const today = getIsraelDateValue();
        const activeBookings = bookings.filter((booking) => !booking?.cancelled_at);
        const cancelledBookings = bookings.filter((booking) => booking?.cancelled_at);
        const bookingsToday = activeBookings.filter((booking) =>
          String(booking?.date || "").startsWith(today)
        );
        const resourceTypeCounts = resourcesData.reduce((acc, resource) => {
          const key = String(resource?.type_id || resource?.type_name || "unassigned");
          acc.set(key, {
            label: resource?.type_name || "Unassigned",
            count: (acc.get(key)?.count || 0) + 1,
          });
          return acc;
        }, new Map());
        const typesWithInventory = Array.from(resourceTypeCounts.values()).filter(
          (entry) => entry.count > 0
        ).length;
        const largestCategory = Array.from(resourceTypeCounts.values()).sort(
          (a, b) => b.count - a.count
        )[0];
        const resourceBookingCounts = activeBookings.reduce((acc, booking) => {
          if (!Array.isArray(booking?.resources)) return acc;
          booking.resources.forEach((resource) => {
            const key = String(resource?.id || resource?.name || "");
            if (!key) return;
            acc.set(key, {
              label: resource?.name || `Resource ${resource?.id}`,
              count: (acc.get(key)?.count || 0) + 1,
            });
          });
          return acc;
        }, new Map());
        const mostBookedResource = Array.from(resourceBookingCounts.values()).sort(
          (a, b) => b.count - a.count
        )[0];

        setStats({
          totalResources: resourcesData.length,
          bookingsToday: bookingsToday.length,
          pending: pendingRequests.length,
          totalBookings: activeBookings.length,
          cancelledBookings: cancelledBookings.length,
          totalBookingRecords: bookings.length,
          totalResourceTypes: typeData.length,
          typesWithInventory,
          largestCategoryLabel: largestCategory?.label || "No resources",
          largestCategoryCount: largestCategory?.count || 0,
          mostBookedResourceLabel: mostBookedResource?.label || "No booking data",
          mostBookedResourceCount: mostBookedResource?.count || 0,
        });
        setResources(resourcesData);
        setTypes(typeData);
        rememberPresentation(typeData, resourcesData);
      } catch (err) {
        console.error("Dashboard load error:", err);
        setStats({
          totalResources: 0,
          bookingsToday: 0,
          pending: 0,
          totalBookings: 0,
          cancelledBookings: 0,
          totalBookingRecords: 0,
          totalResourceTypes: 0,
          typesWithInventory: 0,
          largestCategoryLabel: "No resources",
          largestCategoryCount: 0,
          mostBookedResourceLabel: "No booking data",
          mostBookedResourceCount: 0,
        });
        setLoadWarning("Dashboard data could not be loaded. Check the API connection.");
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const pendingRate = stats?.totalBookings
    ? Math.round((stats.pending / stats.totalBookings) * 100)
    : 0;
  const todayCoverage = stats?.totalResources
    ? Math.min(100, Math.round((stats.bookingsToday / stats.totalResources) * 100))
    : 0;
  const filteredResources = useMemo(() => {
    if (!hasSearchQuery) return [];

    return resources.filter((r) => {
      const haystack = [
        r.id,
        r.name,
        r.type_name,
        JSON.stringify(r.metadata || {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearchQuery);
    });
  }, [hasSearchQuery, normalizedSearchQuery, resources]);

  if (loading) return <p className="text-gray-500">Loading dashboard...</p>;
  if (!stats) return <p className="text-red-500">Failed to load data.</p>;

  const insightCards = [
    {
      label: "Inventory Coverage",
      value: `${stats.typesWithInventory}/${stats.totalResourceTypes}`,
      text: "Resource categories that already have inventory, helping reveal gaps in the catalog structure.",
    },
    {
      label: "Largest Category",
      value: stats.largestCategoryLabel,
      text: `${stats.largestCategoryCount} resources sit in this category, showing where most capacity is concentrated.`,
    },
    {
      label: "Most Booked Resource",
      value: stats.mostBookedResourceLabel,
      text: `${stats.mostBookedResourceCount} historical active bookings reference this resource.`,
    },
  ];

  function openEdit(resource) {
    const type = types.find((t) => t.id === Number(resource.type_id));
    setSelectedType(type || null);
    setEditForm({
      id: resource.id,
      name: resource.name || "",
      type_id: resource.type_id || "",
      metadata: resource.metadata || {},
    });
    setEditModal({ open: true, item: resource });
  }

  function handleEditTypeChange(typeId) {
    const type = types.find((t) => t.id === Number(typeId));
    setSelectedType(type || null);

    const meta = {};
    if (type && Array.isArray(type.fields)) {
      type.fields.forEach((f) => {
        const existing = editForm.metadata?.[f.name];
        meta[f.name] =
          existing !== undefined
            ? existing
            : f.default || (f.type === "boolean" ? false : "");
      });
    }

    setEditForm((prev) => ({
      ...prev,
      type_id: typeId,
      metadata: meta,
    }));
  }

  function handleEditMetadataChange(field, value) {
    setEditForm((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [field]: value },
    }));
  }

  async function saveEdit() {
    try {
      const payload = {
        name: editForm.name,
        type_id: Number(editForm.type_id),
        metadata: editForm.metadata,
      };

      const updated = await apiPut(`/resources/${editForm.id}`, payload);

      setResources((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setEditModal({ open: false, item: null });
    } catch (err) {
      console.error("Error updating resource:", err);
    }
  }

  function metadataSummary(metadata) {
    if (!metadata || Object.keys(metadata).length === 0) return "—";

    return Object.entries(metadata)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}: ${value.length} items`;
        }
        if (value && typeof value === "object") {
          return `${key}: object`;
        }
        return `${key}: ${String(value)}`;
      })
      .join(", ");
  }

  function formatMetadataList(metadata) {
    if (!metadata || Object.keys(metadata).length === 0) return [];
    return Object.entries(metadata).map(
      ([key, value]) => `${key}: ${String(value)}`
    );
  }

  function formatMetadataValue(value) {
    if (Array.isArray(value)) return `${value.length} items`;
    if (value && typeof value === "object") return "Object";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (value === null || value === undefined || value === "") return "-";
    return String(value);
  }

  function getMetadataEntries(metadata) {
    if (!metadata || typeof metadata !== "object") return [];
    return Object.entries(metadata);
  }

  function formatDate(date) {
    if (!date) return "—";
    return formatIsraelDate(date);
  }

  async function openView(resource) {
    setViewModal({
      open: true,
      item: resource,
      bookings: [],
      loading: true,
      error: null,
    });

    try {
      const bookings = await apiGet(`/bookings?resource_id=${resource.id}`);
      setViewModal((prev) => ({
        ...prev,
        bookings,
        loading: false,
      }));
    } catch (err) {
      console.error("Error loading resource bookings:", err);
      setViewModal((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to load bookings.",
      }));
    }
  }

  return (
    <div className="dashboard-view">
      {loadWarning && (
        <div className="dashboard-load-warning">
          {loadWarning}
        </div>
      )}

      <section className="dashboard-search dashboard-search--primary">
        <div className="dashboard-search__header">
          <div>
            <p
              className={`dashboard-search__label ${
                config.domain === "shenkar" ? "dashboard-search__label--classic" : ""
              }`}
            >
              Resource Discovery
            </p>
            <h2 className="dashboard-search__title">{config.dashboard.searchTitle}</h2>
            <p className="dashboard-search__subtitle">
              Search the full inventory without crowding the dashboard. The results are optimized for quick operational decisions.
            </p>
          </div>
          <div className="dashboard-search__count">
            {hasSearchQuery
              ? `Showing ${filteredResources.length} of ${resources.length}`
              : `Search across ${resources.length} resources`}
          </div>
        </div>

        <div className="dashboard-search__field">
          <SearchIcon />
          <input
            type="text"
            placeholder={config.dashboard.searchPlaceholder}
            className="dashboard-search__input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {!hasSearchQuery ? (
          <div className="dashboard-search__empty">
            <h3>{config.dashboard.emptyTitle}</h3>
            <p>{config.dashboard.emptySubtitle}</p>
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="dashboard-search__empty">
            <h3>{config.dashboard.noResultsTitle}</h3>
            <p>{config.dashboard.noResultsSubtitle}</p>
          </div>
        ) : (
          <div className="dashboard-results">
            {filteredResources.map((r) => (
              <article key={r.id} className="dashboard-resource-card">
                <div className="dashboard-resource-card__top">
                  <div>
                    <span className="dashboard-resource-card__id">ID {r.id}</span>
                    <h3 className="dashboard-resource-card__name">{r.name}</h3>
                  </div>
                  <span
                    className={`dashboard-resource-card__type ${theme.tag}`}
                  >
                    {r.type_name}
                  </span>
                </div>

                <div className="dashboard-resource-card__meta">
                  <p className="dashboard-resource-card__meta-label">Metadata Snapshot</p>
                  <p className="dashboard-resource-card__meta-text">
                    {metadataSummary(r.metadata)}
                  </p>
                </div>

                <div className="dashboard-resource-card__actions">
                  <button
                    onClick={() => openView(r)}
                    className={`dashboard-resource-card__button ${theme.buttonNeutral}`}
                  >
                    View details
                  </button>
                  <button
                    onClick={() => openEdit(r)}
                    className={`dashboard-resource-card__button ${theme.buttonWarning}`}
                  >
                    Edit resource
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <div className="dashboard-hero__eyebrow">{config.dashboard.eyebrow}</div>
          <h1 className="dashboard-hero__title">{config.dashboard.title}</h1>
          <p className="dashboard-hero__subtitle">{config.dashboard.subtitle}</p>

          <div className="dashboard-hero__chips">
            <div className="dashboard-hero__chip">{stats.totalResources} tracked resources</div>
            <div className="dashboard-hero__chip">{stats.pending} approvals still need attention</div>
            <div className="dashboard-hero__chip">{stats.bookingsToday} active bookings scheduled today</div>
          </div>
        </div>

        <div className="dashboard-hero__panel">
          <p className="dashboard-hero__panel-label">Operational Pulse</p>
          <h2 className="dashboard-hero__panel-title">Live orchestration</h2>
          <p className="dashboard-hero__panel-copy">
            This view is designed to help operators understand load, friction, and resource structure at a glance.
          </p>

          <div className="dashboard-hero__panel-grid">
            <div className="dashboard-hero__panel-card dashboard-hero__panel-card--primary">
              <strong>{stats.totalBookingRecords}</strong>
              <span>Total booking records in historical system data</span>
            </div>
            <div className="dashboard-hero__panel-card">
              <strong>{stats.cancelledBookings}</strong>
              <span>Cancelled booking records in historical system data</span>
            </div>
            <div className="dashboard-hero__panel-card">
              <strong>{stats.totalResourceTypes}</strong>
              <span>Structured resource categories available for allocation</span>
            </div>
            <div className="dashboard-hero__panel-card">
              <strong>{pendingRate}%</strong>
              <span>Current share of bookings still waiting on approval</span>
            </div>
          </div>

          <div className="dashboard-hero__progress" aria-label="Dashboard health indicators">
            <div className="dashboard-hero__progress-row">
              <span>Today coverage</span>
              <strong>{todayCoverage}%</strong>
            </div>
            <div className="dashboard-hero__progress-track">
              <span style={{ width: `${todayCoverage}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-metrics">
          <StatCard
            title={config.labels.resources}
            value={stats.totalResources}
            tone="blue"
            theme={theme}
            domain={config.domain}
          />
          <StatCard
            title={config.navigation.resourceTypes}
            value={stats.totalResourceTypes}
            tone="sky"
            theme={theme}
            domain={config.domain}
          />
          <StatCard
            title={
              config.labels.bookings
                ? `Today's ${config.labels.bookings}`
                : "Bookings Today"
            }
            value={stats.bookingsToday}
            tone="emerald"
            theme={theme}
            domain={config.domain}
          />
          <StatCard
            title="Pending Approvals"
            value={stats.pending}
            tone="amber"
            theme={theme}
            domain={config.domain}
          />
          <StatCard
            title={`Active ${config.labels.bookings || "Bookings"}`}
            value={stats.totalBookings}
            tone="violet"
            theme={theme}
            domain={config.domain}
          />
      </section>

      <section className="dashboard-insights">
        {insightCards.map((card) => (
          <article key={card.label} className="dashboard-insight-card">
            <p className="dashboard-insight-card__label">{card.label}</p>
            <p className="dashboard-insight-card__value">{card.value}</p>
            <p className="dashboard-insight-card__text">{card.text}</p>
          </article>
        ))}
      </section>

      {editModal.open && (
        <div className="dashboard-modal-backdrop">
          <div className="dashboard-modal">
            <h2 className="dashboard-modal__title">
              Edit Resource - {editForm.name || "Untitled"}
            </h2>
            <p className="dashboard-modal__subtitle">
              Update naming, type assignment, and structured metadata from one focused panel.
            </p>

            <div className="dashboard-modal__section dashboard-modal__grid">
              <div className="dashboard-modal__field">
                <label>Resource Name</label>
                <input
                  type="text"
                  className={`w-full rounded-2xl border px-4 py-3 ${theme.input}`}
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="dashboard-modal__field">
                <label>Resource Type</label>
                <select
                  className={`w-full rounded-2xl border px-4 py-3 ${theme.input}`}
                  value={editForm.type_id}
                  onChange={(e) => handleEditTypeChange(e.target.value)}
                >
                  <option value="">-- Select Type --</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedType &&
              selectedType.fields &&
              Array.isArray(selectedType.fields) && (
                <div className="dashboard-modal__section">
                  <h3 className={`mb-4 text-lg font-semibold ${theme.textStrong}`}>Resource Fields</h3>

                  {selectedType.fields.map((field, i) => (
                    <div key={i} className="dashboard-modal__field">
                      <label>
                        {field.name} ({field.type})
                      </label>

                      {field.type === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={editForm.metadata[field.name] || false}
                          onChange={(e) =>
                            handleEditMetadataChange(field.name, e.target.checked)
                          }
                        />
                      ) : (
                        <input
                          type={field.type === "number" ? "number" : "text"}
                          className={`w-full rounded-2xl border px-4 py-3 ${theme.input}`}
                          value={editForm.metadata[field.name] ?? ""}
                          onChange={(e) =>
                            handleEditMetadataChange(field.name, e.target.value)
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

            <div className="dashboard-modal__actions">
              <button
                onClick={() => {
                  setEditModal({ open: false, item: null });
                  setSelectedType(null);
                }}
                className={`rounded-2xl px-4 py-3 ${theme.buttonGhost}`}
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                className={`rounded-2xl px-4 py-3 ${theme.buttonPrimary}`}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {viewModal.open && (
        <div className="dashboard-modal-backdrop">
          <div className="dashboard-modal dashboard-modal--wide">
            <h2 className="dashboard-modal__title">
              Resource Details - {viewModal.item?.name || "Untitled"}
            </h2>
            <p className="dashboard-modal__subtitle">
              Review the selected resource, its type, metadata, and every linked booking in one place.
            </p>

            <div className="dashboard-details-summary">
              <div className="dashboard-details-summary__item">
                <span>Resource ID</span>
                <strong>{viewModal.item?.id || "-"}</strong>
              </div>
              <div className="dashboard-details-summary__item">
                <span>Resource Type</span>
                <strong>{viewModal.item?.type_name || "Unassigned"}</strong>
              </div>
              <div className="dashboard-details-summary__item">
                <span>Linked Bookings</span>
                <strong>{viewModal.bookings.length}</strong>
              </div>
            </div>

            <div className="dashboard-modal__section dashboard-details-section">
              <div className="dashboard-details-section__header">
                <h3>Resource Metadata</h3>
                <span>{getMetadataEntries(viewModal.item?.metadata).length} fields</span>
              </div>

              {getMetadataEntries(viewModal.item?.metadata).length > 0 ? (
                <div className="dashboard-details-metadata">
                  {getMetadataEntries(viewModal.item?.metadata).map(([key, value]) => (
                    <div key={key} className="dashboard-details-metadata__item">
                      <span>{key}</span>
                      <strong>{formatMetadataValue(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-details-empty">No metadata fields for this resource.</div>
              )}
            </div>

            <div className="dashboard-modal__section dashboard-details-section">
              <div className="dashboard-details-section__header">
                <h3>Bookings</h3>
                <span>{viewModal.bookings.length} records</span>
              </div>

              {viewModal.loading && <p className={theme.textSoft}>Loading bookings...</p>}
              {viewModal.error && <p className="text-red-600">{viewModal.error}</p>}

              {!viewModal.loading && !viewModal.error && (
                <div className="dashboard-details-bookings">
                  {viewModal.bookings.map((b) => (
                    <div key={b.id} className="dashboard-booking-card">
                      <div className="dashboard-booking-card__meta">
                        <div className="dashboard-booking-card__identity">
                          <span>Booking #{b.id}</span>
                          <strong>{formatDate(b.date)}</strong>
                        </div>
                        <div className="dashboard-booking-card__facts">
                          {b.start_time && b.end_time && (
                            <span>{b.start_time} - {b.end_time}</span>
                          )}
                          {b.user_id && <span>User {b.user_id}</span>}
                          {b.status && <span>{b.status}</span>}
                        </div>
                      </div>

                      <div>
                        <div className="dashboard-booking-card__label">
                          Resources
                        </div>
                        <div className="dashboard-booking-card__resources">
                          {(b.resources || []).map((r) => (
                            <div key={r.id} className="dashboard-booking-card__resource">
                              <div className="dashboard-booking-card__resource-title">
                                {r.name}
                                {r.type_name && <span>{r.type_name}</span>}
                              </div>
                              {r.role && (
                                <div className="dashboard-booking-card__resource-role">
                                  Role: {r.role}
                                </div>
                              )}
                              {formatMetadataList(r.metadata).length > 0 && (
                                <div className="dashboard-booking-card__resource-meta">
                                  {formatMetadataList(r.metadata).slice(0, 4).map((line, idx) => (
                                    <div key={`${r.id}-${idx}`}>{line}</div>
                                  ))}
                                  {formatMetadataList(r.metadata).length > 4 && (
                                    <div>+{formatMetadataList(r.metadata).length - 4} more fields</div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {viewModal.bookings.length === 0 && (
                    <div className="dashboard-details-empty">
                      No bookings for this resource.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="dashboard-modal__actions">
              <button
                onClick={() =>
                  setViewModal({
                    open: false,
                    item: null,
                    bookings: [],
                    loading: false,
                    error: null,
                  })
                }
                className={`rounded-2xl px-4 py-3 ${theme.buttonGhost}`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, tone = "blue", theme, domain }) {
  const isClassic = domain === "shenkar";
  const tones = theme.metricCards || {};
  const toneClass = isClassic ? "dashboard-stat-card--classic" : tones[tone] || theme.card;

  return (
    <div className={`dashboard-stat-card dashboard-stat-card--${tone} ${toneClass}`}>
      <div className="dashboard-stat-card__top">
        <span
          className={`dashboard-stat-card__eyebrow ${
            isClassic ? "dashboard-stat-card__eyebrow--classic" : ""
          }`}
        >
          Live Metric
        </span>
        <span className="dashboard-stat-card__icon" aria-hidden="true">
          <MetricIcon tone={tone} />
        </span>
      </div>
      <p className="dashboard-stat-card__title">{title}</p>
      <p className="dashboard-stat-card__value">{value}</p>
      {!isClassic && <span className="dashboard-stat-card__bar" aria-hidden="true" />}
    </div>
  );
}

function MetricIcon({ tone }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (tone === "emerald") {
    return (
      <svg {...common}>
        <path d="M7 11.5 10.2 15 17 8" />
        <path d="M4 5h16v14H4z" />
      </svg>
    );
  }

  if (tone === "amber") {
    return (
      <svg {...common}>
        <path d="M12 8v5" />
        <path d="M12 17h.01" />
        <path d="M10.3 4.5h3.4L21 18.5H3L10.3 4.5z" />
      </svg>
    );
  }

  if (tone === "violet") {
    return (
      <svg {...common}>
        <path d="M7 3h10v4H7z" />
        <path d="M5 7h14v14H5z" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </svg>
    );
  }

  if (tone === "sky") {
    return (
      <svg {...common}>
        <path d="m12 4 8 4-8 4-8-4 8-4z" />
        <path d="m4 12 8 4 8-4" />
        <path d="m4 16 8 4 8-4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9z" />
      <path d="M12 4v16" />
      <path d="m4 7.5 8 4 8-4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
