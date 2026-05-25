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
  const [searchQuery, setSearchQuery] = useState("");
  const config = getOrgConfig();
  const theme = config.theme;
  const isCinema = config.domain === "cinema";

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
      try {
        const [resourcesData, bookings, typeData] = await Promise.all([
          apiGet("/resources"),
          apiGet("/bookings"),
          apiGet("/resource-types"),
        ]);

        const today = getIsraelDateValue();

        const bookingsToday = bookings.filter((b) => b.date.startsWith(today));
        const pending = bookings.filter((b) => b.status === "pending");

        setStats({
          totalResources: resourcesData.length,
          bookingsToday: bookingsToday.length,
          pending: pending.length,
          totalBookings: bookings.length,
          totalResourceTypes: typeData.length,
        });
        setResources(resourcesData);
        setTypes(typeData);
        rememberPresentation(typeData, resourcesData);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const resourcePerType = stats
    ? (stats.totalResources / Math.max(stats.totalResourceTypes || 1, 1)).toFixed(1)
    : "0";
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
      label: "Resources Per Type",
      value: resourcePerType,
      text: "A healthy spread helps the system allocate capacity without forcing operators into manual exceptions.",
    },
    {
      label: "Pending Approval Rate",
      value: `${pendingRate}%`,
      text: "This shows how much work still depends on human review instead of flowing through a cleaner operational path.",
    },
    {
      label: "Today's Coverage",
      value: `${todayCoverage}%`,
      text: "A quick signal for how much of your resource inventory is already tied into today's scheduling activity.",
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
      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <div className="dashboard-hero__eyebrow">{config.dashboard.eyebrow}</div>
          <h1 className="dashboard-hero__title">{config.dashboard.title}</h1>
          <p className="dashboard-hero__subtitle">{config.dashboard.subtitle}</p>

          <div className="dashboard-hero__chips">
            <div className="dashboard-hero__chip">{stats.totalResources} tracked resources</div>
            <div className="dashboard-hero__chip">{stats.pending} approvals still need attention</div>
            <div className="dashboard-hero__chip">{stats.bookingsToday} bookings scheduled today</div>
          </div>
        </div>

        <div className="dashboard-hero__panel">
          <p className="dashboard-hero__panel-label">Operational Pulse</p>
          <h2 className="dashboard-hero__panel-title">Live orchestration</h2>
          <p className="dashboard-hero__panel-copy">
            This view is designed to help operators understand load, friction, and resource structure at a glance.
          </p>

          <div className="dashboard-hero__panel-grid">
            <div className="dashboard-hero__panel-card">
              <strong>{stats.totalBookings}</strong>
              <span>Total booking records in the system</span>
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
        </div>
      </section>

      <section className="dashboard-metrics">
          <StatCard
            title={config.labels.resources}
            value={stats.totalResources}
            tone="blue"
            theme={theme}
          />
          <StatCard
            title={config.navigation.resourceTypes}
            value={stats.totalResourceTypes}
            tone="sky"
            theme={theme}
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
          />
          <StatCard
            title="Pending Approvals"
            value={stats.pending}
            tone="amber"
            theme={theme}
          />
          <StatCard
            title={config.labels.bookings || "Bookings"}
            value={stats.totalBookings}
            tone="violet"
            theme={theme}
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

      <section className="dashboard-search">
        <div className="dashboard-search__header">
          <div>
            <p className="dashboard-search__label">Resource Discovery</p>
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

            <div className="dashboard-modal__section">
              <div className={`text-sm ${theme.textSoft}`}>
              <div>
                <strong>ID:</strong> {viewModal.item?.id}
              </div>
              {viewModal.item?.type_name && (
                <div>
                  <strong>Type:</strong> {viewModal.item.type_name}
                </div>
              )}
              {viewModal.item?.metadata &&
                Object.keys(viewModal.item.metadata).length > 0 && (
                  <div>
                    <strong>Metadata:</strong>{" "}
                    {metadataSummary(viewModal.item.metadata)}
                  </div>
                )}
              </div>
            </div>

            <div className="dashboard-modal__section">
              <h3 className={`mb-4 text-lg font-semibold ${theme.textStrong}`}>Bookings</h3>

              {viewModal.loading && <p className={theme.textSoft}>Loading bookings...</p>}
              {viewModal.error && <p className="text-red-600">{viewModal.error}</p>}

              {!viewModal.loading && !viewModal.error && (
                <div className="space-y-4 max-h-[420px] overflow-auto pr-1">
                  {viewModal.bookings.map((b) => (
                    <div key={b.id} className="dashboard-booking-card">
                      <div className="dashboard-booking-card__meta">
                      <div>
                        <strong>Booking ID:</strong> {b.id}
                      </div>
                      <div>
                        <strong>Date:</strong> {formatDate(b.date)}
                      </div>
                      {b.start_time && b.end_time && (
                        <div>
                          <strong>Time:</strong> {b.start_time} - {b.end_time}
                        </div>
                      )}
                      {b.user_id && (
                        <div>
                          <strong>User:</strong> {b.user_id}
                        </div>
                      )}
                      </div>

                      <div>
                        <div className={`mb-2 text-xs font-semibold ${theme.textSoft}`}>
                        Resources
                        </div>
                        <div className="dashboard-booking-card__resources">
                          {(b.resources || []).map((r) => (
                            <div key={r.id} className="dashboard-booking-card__resource">
                            <div className={`font-medium ${theme.textStrong}`}>
                              {r.name}
                              {r.type_name && (
                                <span className={`text-xs ${theme.textSoft}`}>
                                  {" "}
                                  ({r.type_name})
                                </span>
                              )}
                            </div>
                            {r.role && (
                              <div className={`text-xs ${theme.textSoft}`}>
                                Role: {r.role}
                              </div>
                            )}
                            {formatMetadataList(r.metadata).length > 0 && (
                              <div className={`text-xs mt-1 ${theme.textSoft}`}>
                                {formatMetadataList(r.metadata).map((line, idx) => (
                                  <div key={`${r.id}-${idx}`}>{line}</div>
                                ))}
                              </div>
                            )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {viewModal.bookings.length === 0 && (
                    <div className={`text-center p-4 ${theme.textSoft}`}>
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

function StatCard({ title, value, tone = "blue", theme }) {
  const tones = theme.metricCards || {};
  const toneClass = tones[tone] || theme.card;

  return (
    <div className={`dashboard-stat-card ${toneClass}`}>
      <span className="dashboard-stat-card__eyebrow">Live Metric</span>
      <p className="dashboard-stat-card__title">{title}</p>
      <p className="dashboard-stat-card__value">{value}</p>
    </div>
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
