import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";
import { getOrgConfig } from "../orgConfig";
import "./Resources.css";

function ModalPortal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function sortResourcesAlphabetically(items) {
  return [...items].sort(
    (a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
        sensitivity: "base",
      }) || Number(a?.id || 0) - Number(b?.id || 0)
  );
}

const RESERVED_METADATA_FIELD_NAMES = new Set(["user_ids", "userIds"]);

function getTypeFieldNames(type) {
  return new Set(Array.isArray(type?.fields) ? type.fields.map((field) => field.name) : []);
}

function isAssignedUserIdsFieldName(fieldName) {
  return RESERVED_METADATA_FIELD_NAMES.has(String(fieldName || "").trim());
}

function getCustomMetadataEntries(metadata, type) {
  const typeFieldNames = getTypeFieldNames(type);
  return Object.entries(metadata || {}).filter(
    ([key]) => !typeFieldNames.has(key) && !isAssignedUserIdsFieldName(key)
  );
}

function normalizeCustomFieldValue(value, fieldType) {
  if (fieldType === "boolean") return Boolean(value);
  if (fieldType === "number") return value === "" ? "" : Number(value);
  return String(value ?? "");
}

function parseAssignedUserIds(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[\s,]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
}

function getAutoUserCountFieldNames(type) {
  if (!Array.isArray(type?.fields)) return [];
  return type.fields
    .filter(
      (field) =>
        field &&
        typeof field === "object" &&
        field.type === "number" &&
        field.auto_user_count &&
        field.name
    )
    .map((field) => field.name);
}

function syncAutoUserCountFields(metadata, type) {
  const nextMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : {};
  const autoFieldNames = getAutoUserCountFieldNames(type);

  if (autoFieldNames.length === 0) return nextMetadata;

  const assignedCount = parseAssignedUserIds(nextMetadata.user_ids ?? nextMetadata.userIds).length;
  autoFieldNames.forEach((fieldName) => {
    nextMetadata[fieldName] =
      typeof nextMetadata[fieldName] === "string" ? String(assignedCount) : assignedCount;
  });

  return nextMetadata;
}

function formatAssignedUserIds(value) {
  if (typeof value === "string") return value;
  return parseAssignedUserIds(value).join(", ");
}

function buildMetadataSearchText(metadata) {
  if (!metadata || typeof metadata !== "object") return "";

  return Object.entries(metadata)
    .flatMap(([key, value]) => {
      if (value === false || value === null || value === undefined || value === "") {
        return [];
      }

      if (value === true) {
        return [key];
      }

      if (Array.isArray(value)) {
        return value.map((item) => String(item));
      }

      if (typeof value === "object") {
        return Object.values(value)
          .filter((item) => item !== false && item !== null && item !== undefined && item !== "")
          .map((item) => String(item));
      }

      return [String(value)];
    })
    .join(" ");
}
function getFieldDisplayName(field) {
  return field?.label || field?.name || "";
}

function isAutoUserCountField(field) {
  return field?.type === "number" && Boolean(field?.auto_user_count);
}

function AssignedUserIdsEditor({ value, onChange, inputClassName, users = [] }) {
  const assignedUserIds = parseAssignedUserIds(value);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const usersByNationalId = useMemo(
    () =>
      new Map(
        (Array.isArray(users) ? users : [])
          .map((user) => [String(user?.national_id || "").trim(), user])
          .filter(([nationalId]) => nationalId)
      ),
    [users]
  );
  const matchedUsers = assignedUserIds
    .map((userId) => ({
      userId,
      user: usersByNationalId.get(userId) || null,
    }))
    .filter((entry) => entry.user);
  const missingUserIds = assignedUserIds.filter((userId) => !usersByNationalId.has(userId));

  return (
    <div className="resources-assigned-users">
      <div className="resources-assigned-users__header">
        <div>
          <h3>Assigned User IDs</h3>
          <p>Paste IDs separated by commas, spaces, or new lines. The system will normalize them on save.</p>
        </div>
        <div className="resources-assigned-users__count">
          {assignedUserIds.length} {assignedUserIds.length === 1 ? "user" : "users"}
        </div>
      </div>

      <textarea
        rows={4}
        className={`${inputClassName} resources-assigned-users__textarea`}
        placeholder={"970300001, 970300002, 970300003"}
        value={formatAssignedUserIds(value)}
        onChange={(e) => onChange("user_ids", e.target.value)}
      />

      <div className="resources-assigned-users__hint">
        Example: <code>970300001, 970300002, 970300003</code>
      </div>

      {assignedUserIds.length > 0 && (
        <div className="resources-assigned-users__preview">
          {assignedUserIds.slice(0, 18).map((userId) => (
            <span key={userId} className="resources-assigned-users__chip">
              {userId}
            </span>
          ))}
          {assignedUserIds.length > 18 && (
            <button
              type="button"
              className="resources-assigned-users__more"
              onClick={() => setShowAllUsers((prev) => !prev)}
            >
              +{assignedUserIds.length - 18} more
            </button>
          )}
        </div>
      )}

      {(showAllUsers || assignedUserIds.length <= 18) && assignedUserIds.length > 0 && (
        <div className="resources-assigned-users__details">
          <div className="resources-assigned-users__section">
            <div className="resources-assigned-users__section-head">
              <strong>Assigned And Found In System</strong>
              <span>{matchedUsers.length}</span>
            </div>
            {matchedUsers.length > 0 ? (
              <div className="resources-assigned-users__user-list">
                {matchedUsers.map(({ userId, user }) => (
                  <div key={userId} className="resources-assigned-users__user-row">
                    <div>
                      <div className="resources-assigned-users__user-name">
                        {user.full_name || "User"}
                      </div>
                      <div className="resources-assigned-users__user-meta">
                        {userId}
                        {user.email ? ` · ${user.email}` : ""}
                      </div>
                    </div>
                    <span className="resources-assigned-users__status resources-assigned-users__status--ok">
                      Valid
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="resources-assigned-users__empty">
                No assigned IDs currently match real users in this organization.
              </div>
            )}
          </div>

          {missingUserIds.length > 0 && (
            <div className="resources-assigned-users__section">
              <div className="resources-assigned-users__section-head">
                <strong>Assigned But Not Found</strong>
                <span>{missingUserIds.length}</span>
              </div>
              <div className="resources-assigned-users__missing-list">
                {missingUserIds.map((userId) => (
                  <span key={userId} className="resources-assigned-users__missing-chip">
                    {userId}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function isCinemaHallResource(resource) {
  const resourceName = String(resource?.name || "").toLowerCase();
  const typeName = String(resource?.type_name || "").toLowerCase();
  const metadata = resource?.metadata || {};
  const capacity = Number(metadata.capacity || metadata.Capacity || 0);

  return (
    capacity > 0 &&
    /(hall|cinema area|screen|auditorium|theatre|theater)/.test(
      `${resourceName} ${typeName}`
    )
  );
}

// --- Restaurant foundation helpers ---
function isRestaurantTableResource(resource) {
  const resourceName = String(resource?.name || "").toLowerCase();
  const typeName = String(resource?.type_name || "").toLowerCase();
  const metadata = resource?.metadata || {};
  const seats = Number(metadata.seats || metadata.capacity || 0);
  const shape = String(metadata.shape || "").toLowerCase();

  return (
    seats > 0 &&
    /(table|booth|bar|patio|terrace|dining|restaurant|vip table)/.test(
      `${resourceName} ${typeName} ${shape}`
    )
  );
}

function getRestaurantTableConfig(resource) {
  const metadata = resource?.metadata || {};
  const seats = Number(metadata.seats || metadata.capacity || 2);
  const shape = String(metadata.shape || "round").toLowerCase();
  const size = String(
    metadata.size || (seats <= 2 ? "small" : seats <= 4 ? "medium" : "large")
  ).toLowerCase();
  const x = Number(metadata.x ?? 120);
  const y = Number(metadata.y ?? 120);
  const rotation = Number(metadata.rotation ?? 0);

  return {
    seats,
    shape,
    size,
    x,
    y,
    rotation,
  };
}

function getRestaurantTablePixelSize(size, shape) {
  const base = size === "small" ? 72 : size === "large" ? 124 : 96;

  if (shape === "rect" || shape === "rectangle") {
    return { width: base + 28, height: Math.max(54, base - 8) };
  }

  if (shape === "square") {
    return { width: base, height: base };
  }

  return { width: base, height: base };
}

function buildSeatDots(seats) {
  return Array.from({ length: Math.max(0, Number(seats || 0)) }, (_, index) => index + 1);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getSeatObjects(resource) {
  return Array.isArray(resource?.metadata?.seatObjects)
    ? resource.metadata.seatObjects
    : [];
}

function toRowLabel(index) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let value = "";
  let current = index;

  do {
    value = alphabet[current % 26] + value;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return value;
}

function buildSeatObjectsFromCapacity(capacity) {
  const total = Number(capacity || 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const firstRowsCount = Math.min(3, Math.max(1, Math.ceil(total / 90)));
  const frontRowSize = total <= 60 ? 8 : total <= 120 ? 10 : 12;
  const fullRowSize = total <= 80 ? 12 : total <= 160 ? 15 : 18;

  const rowPlans = [];
  let remaining = total;

  for (let i = 0; i < firstRowsCount && remaining > 0; i += 1) {
    const seatsInRow = Math.min(frontRowSize, remaining);
    rowPlans.push({
      row: toRowLabel(i),
      totalSeats: seatsInRow,
      sections: [seatsInRow],
      frontCentered: true,
    });
    remaining -= seatsInRow;
  }

  let rowIndex = firstRowsCount;
  while (remaining > 0) {
    const seatsInRow = Math.min(fullRowSize, remaining);

    const leftCount = Math.max(4, Math.floor(seatsInRow * 0.28));
    const rightCount = leftCount;
    const centerCount = seatsInRow - leftCount - rightCount;

    rowPlans.push({
      row: toRowLabel(rowIndex),
      totalSeats: seatsInRow,
      sections: [leftCount, centerCount, rightCount],
      frontCentered: false,
    });

    remaining -= seatsInRow;
    rowIndex += 1;
  }

  const seatObjects = [];

  rowPlans.forEach((plan) => {
    let seatNumber = 1;

    if (plan.frontCentered) {
      for (let i = 0; i < plan.totalSeats; i += 1) {
        seatObjects.push({
          seatId: `${plan.row}${seatNumber}`,
          row: plan.row,
          number: seatNumber,
          section: "front_center",
          status: "available",
          isBroken: false,
          notes: "",
        });
        seatNumber += 1;
      }
      return;
    }

    const [leftCount, centerCount, rightCount] = plan.sections;

    for (let i = 0; i < leftCount; i += 1) {
      seatObjects.push({
        seatId: `${plan.row}${seatNumber}`,
        row: plan.row,
        number: seatNumber,
        section: "left",
        status: "available",
        isBroken: false,
        notes: "",
      });
      seatNumber += 1;
    }

    for (let i = 0; i < centerCount; i += 1) {
      seatObjects.push({
        seatId: `${plan.row}${seatNumber}`,
        row: plan.row,
        number: seatNumber,
        section: "center",
        status: "available",
        isBroken: false,
        notes: "",
      });
      seatNumber += 1;
    }

    for (let i = 0; i < rightCount; i += 1) {
      seatObjects.push({
        seatId: `${plan.row}${seatNumber}`,
        row: plan.row,
        number: seatNumber,
        section: "right",
        status: "available",
        isBroken: false,
        notes: "",
      });
      seatNumber += 1;
    }
  });

  return seatObjects;
}

function buildSeatObjectsFromLayoutConfig(layoutConfig, fallbackCapacity) {
  const frontRows = Math.max(0, Number(layoutConfig?.frontRows || 0));
  const frontSeatsPerRow = Math.max(0, Number(layoutConfig?.frontSeatsPerRow || 0));
  const regularRows = Math.max(0, Number(layoutConfig?.regularRows || 0));
  const leftSeats = Math.max(0, Number(layoutConfig?.leftSeats || 0));
  const centerSeats = Math.max(0, Number(layoutConfig?.centerSeats || 0));
  const rightSeats = Math.max(0, Number(layoutConfig?.rightSeats || 0));

  const hasCustomLayout =
    frontRows > 0 || frontSeatsPerRow > 0 || regularRows > 0 || leftSeats > 0 || centerSeats > 0 || rightSeats > 0;

  if (!hasCustomLayout) {
    return buildSeatObjectsFromCapacity(fallbackCapacity);
  }

  const seatObjects = [];
  let rowIndex = 0;

  for (let row = 0; row < frontRows; row += 1) {
    const rowLabel = toRowLabel(rowIndex);
    for (let number = 1; number <= frontSeatsPerRow; number += 1) {
      seatObjects.push({
        seatId: `${rowLabel}${number}`,
        row: rowLabel,
        number,
        section: "front_center",
        status: "available",
        isBroken: false,
        notes: "",
      });
    }
    rowIndex += 1;
  }

  const sectionPlan = [
    { section: "left", count: leftSeats },
    { section: "center", count: centerSeats },
    { section: "right", count: rightSeats },
  ].filter((item) => item.count > 0);

  for (let row = 0; row < regularRows; row += 1) {
    const rowLabel = toRowLabel(rowIndex);
    let seatNumber = 1;

    sectionPlan.forEach(({ section, count }) => {
      for (let i = 0; i < count; i += 1) {
        seatObjects.push({
          seatId: `${rowLabel}${seatNumber}`,
          row: rowLabel,
          number: seatNumber,
          section,
          status: "available",
          isBroken: false,
          notes: "",
        });
        seatNumber += 1;
      }
    });

    rowIndex += 1;
  }

  return seatObjects;
}

function getDefaultHallLayoutConfig(resource) {
  const existing = resource?.metadata?.layoutConfig;
  if (existing) {
    return {
      frontRows: Number(existing.frontRows || 0),
      frontSeatsPerRow: Number(existing.frontSeatsPerRow || 0),
      regularRows: Number(existing.regularRows || 0),
      leftSeats: Number(existing.leftSeats || 0),
      centerSeats: Number(existing.centerSeats || 0),
      rightSeats: Number(existing.rightSeats || 0),
    };
  }

  const capacity = Number(resource?.metadata?.capacity || resource?.metadata?.Capacity || 0);
  const firstRowsCount = Math.min(3, Math.max(1, Math.ceil(capacity / 90)));
  const frontSeatsPerRow = capacity <= 60 ? 8 : capacity <= 120 ? 10 : 12;
  const fullRowSize = capacity <= 80 ? 12 : capacity <= 160 ? 15 : 18;
  const remaining = Math.max(capacity - firstRowsCount * frontSeatsPerRow, 0);
  const regularRows = Math.max(1, Math.ceil(remaining / fullRowSize));
  const leftSeats = Math.max(4, Math.floor(fullRowSize * 0.28));
  const rightSeats = leftSeats;
  const centerSeats = Math.max(1, fullRowSize - leftSeats - rightSeats);

  return {
    frontRows: firstRowsCount,
    frontSeatsPerRow,
    regularRows,
    leftSeats,
    centerSeats,
    rightSeats,
  };
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function splitRowIntoSections(rowItems) {
  if (!Array.isArray(rowItems) || rowItems.length === 0) {
    return { left: [], center: [], right: [] };
  }

  // 🔥 FIX: if seats don't have section (old data), treat all as center
  const hasSectionData = rowItems.some((seat) => seat?.section);
  if (!hasSectionData) {
    return { left: [], center: rowItems, right: [] };
  }

  const frontOnly = rowItems.every((seat) => seat?.section === "front_center");
  if (frontOnly) {
    return { left: [], center: rowItems, right: [] };
  }

  return {
    left: rowItems.filter((seat) => seat?.section === "left"),
    center: rowItems.filter((seat) => seat?.section === "center"),
    right: rowItems.filter((seat) => seat?.section === "right"),
  };
}

function SummaryPill({ label, value, tone = "slate", isClassic = false, isCinema = false }) {
  const unifiedCinemaTone = "border-[#e8cfe5] bg-[#f7f7f7] text-[#2d252b]";
  const tones = {
    blue: unifiedCinemaTone,
    slate: unifiedCinemaTone,
    emerald: unifiedCinemaTone,
  };

  const classicTones = {
    blue: "border-stone-300 bg-stone-50 text-stone-700",
    slate: "border-stone-300 bg-white text-stone-700",
    emerald: "border-stone-300 bg-stone-50 text-stone-700",
  };

  const toneClass = isCinema
    ? "resources-summary-pill--cinema-unified"
    : isClassic
    ? (classicTones[tone] || classicTones.slate)
    : (tones[tone] || tones.slate);
  const labelClass = isClassic
    ? "resources-summary-pill__label resources-summary-pill__label--classic text-xs font-semibold uppercase"
    : "resources-summary-pill__label text-xs font-semibold uppercase tracking-[0.16em]";
  const isNumericValue = Number.isFinite(Number(value));
  const valueClass = isNumericValue
    ? "resources-summary-pill__value resources-summary-pill__value--numeric mt-2 text-2xl font-black"
    : "resources-summary-pill__value mt-2 text-2xl font-black";
  const cinemaStyle = isCinema
    ? {
        position: "relative",
        overflow: "hidden",
        borderColor: "rgba(215, 122, 202, 0.24)",
        background: "#f7f7f7",
        color: "#2f2b2e",
        boxShadow: "0 12px 26px rgba(82, 22, 79, 0.055)",
      }
    : undefined;
  const cinemaLabelStyle = isCinema ? { color: "#6f596c" } : undefined;
  const cinemaValueStyle = isCinema ? { color: "#2f2b2e", fontWeight: 500 } : undefined;

  return (
    <div className={`resources-summary-pill rounded-2xl border px-4 py-3 ${toneClass}`} style={cinemaStyle}>
      <div className={labelClass} style={cinemaLabelStyle}>{label}</div>
      <div className={valueClass} style={cinemaValueStyle}>{value}</div>
      {isCinema && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 16,
            bottom: 11,
            left: 16,
            height: 3,
            borderRadius: 999,
            background: "rgba(215, 122, 202, 0.48)",
          }}
        />
      )}
    </div>
  );
}

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [types, setTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [expandedResourceGroups, setExpandedResourceGroups] = useState({});
  const [activeResourceGroupKey, setActiveResourceGroupKey] = useState("");
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm] = useState({
    name: "",
    type_id: "",
    metadata: {},
  });
  const [customFieldDraft, setCustomFieldDraft] = useState({
    name: "",
    type: "text",
  });

  const [detailsModal, setDetailsModal] = useState({
    open: false,
    item: null,
  });
  const [selectedHallId, setSelectedHallId] = useState(null);
  const [dragState, setDragState] = useState(null);

  const [layoutModal, setLayoutModal] = useState({
    open: false,
    hall: null,
    form: {
      frontRows: 0,
      frontSeatsPerRow: 0,
      regularRows: 0,
      leftSeats: 0,
      centerSeats: 0,
      rightSeats: 0,
    },
  });

  const [showEdit, setShowEdit] = useState(false);
  const [editSelectedType, setEditSelectedType] = useState(null);
  const [editForm, setEditForm] = useState({
    id: null,
    name: "",
    type_id: "",
    metadata: {},
  });
  const [editCustomFieldDraft, setEditCustomFieldDraft] = useState({
    name: "",
    type: "text",
  });
  const config = getOrgConfig();
  const isCinema = config.domain === "cinema";
  const theme = config.theme;
  const isShenkar = config.domain === "shenkar";
  const isRestaurant = config.domain === "restaurant";

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (loading || !isCinema || resources.length === 0) return;

    const hallsMissingSeats = resources.filter(
      (resource) => isCinemaHallResource(resource) && getSeatObjects(resource).length === 0
    );

    if (hallsMissingSeats.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        await Promise.all(
          hallsMissingSeats.map((resource) => {
            const capacity = Number(
              resource?.metadata?.capacity || resource?.metadata?.Capacity || 0
            );

            if (!Number.isFinite(capacity) || capacity <= 0) {
              return Promise.resolve();
            }

            return apiPut(`/resources/${resource.id}`, {
              name: resource.name,
              type_id: resource.type_id,
              metadata: {
                ...(resource.metadata || {}),
                seatObjects: buildSeatObjectsFromLayoutConfig(
                  resource?.metadata?.layoutConfig,
                  capacity
                ),
              },
            });
          })
        );

        if (!cancelled) {
          await loadData();
        }
      } catch (err) {
        console.error("Error auto-generating seats:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, isCinema, resources]);

  async function loadData() {
    try {
      const [resData, typeData, userData] = await Promise.all([
        apiGet("/resources"),
        apiGet("/resource-types"),
        apiGet("/users"),
      ]);
      setResources(sortResourcesAlphabetically(resData));
      setTypes(typeData);
      setUsers(Array.isArray(userData) ? userData : []);
    } catch (err) {
      console.error("Error loading resources:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectType(typeId) {
    const type = types.find((t) => t.id === Number(typeId));
    setSelectedType(type || null);

    if (!type || !Array.isArray(type.fields)) {
      setForm({
        name: "",
        type_id: typeId,
        metadata: {},
      });
      setCustomFieldDraft({ name: "", type: "text" });
      return;
    }

    const meta = {};
    type.fields.forEach((field) => {
      if (isAutoUserCountField(field)) {
        meta[field.name] = 0;
        return;
      }
      meta[field.name] = field.default || (field.type === "boolean" ? false : "");
    });

    setForm({
      name: "",
      type_id: typeId,
      metadata: syncAutoUserCountFields(meta, type),
    });
    setCustomFieldDraft({ name: "", type: "text" });
  }

  function handleEditSelectType(typeId) {
    const type = types.find((t) => t.id === Number(typeId));
    setEditSelectedType(type || null);

    if (!type || !Array.isArray(type.fields)) {
      setEditForm((prev) => ({
        ...prev,
        type_id: typeId,
        metadata: {},
      }));
      setEditCustomFieldDraft({ name: "", type: "text" });
      return;
    }

    const meta = {};
    type.fields.forEach((field) => {
      const existing = editForm.metadata?.[field.name];
      if (isAutoUserCountField(field)) {
        meta[field.name] =
          existing !== undefined
            ? existing
            : 0;
        return;
      }
      meta[field.name] =
        existing !== undefined ? existing : field.default || (field.type === "boolean" ? false : "");
    });

    setEditForm((prev) => ({
      ...prev,
      type_id: typeId,
      metadata: syncAutoUserCountFields(meta, type),
    }));
    setEditCustomFieldDraft({ name: "", type: "text" });
  }

  function handleMetadataChange(field, value) {
    if (field === "user_ids") {
      setForm((prev) => {
        const metadata = { ...prev.metadata, user_ids: value };
        delete metadata.userIds;
        return {
          ...prev,
          metadata: syncAutoUserCountFields(metadata, selectedType),
        };
      });
      return;
    }

    setForm((prev) => ({
      ...prev,
      metadata: syncAutoUserCountFields({ ...prev.metadata, [field]: value }, selectedType),
    }));
  }

  function handleEditMetadataChange(field, value) {
    if (field === "user_ids") {
      setEditForm((prev) => {
        const metadata = { ...prev.metadata, user_ids: value };
        delete metadata.userIds;
        return {
          ...prev,
          metadata: syncAutoUserCountFields(metadata, editSelectedType),
        };
      });
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      metadata: syncAutoUserCountFields(
        { ...prev.metadata, [field]: value },
        editSelectedType
      ),
    }));
  }

  function addCustomField() {
    const fieldName = customFieldDraft.name.trim();
    if (!fieldName) return;

    setForm((prev) => {
      if (isAssignedUserIdsFieldName(fieldName)) {
        return {
          ...prev,
          metadata: {
            ...prev.metadata,
            user_ids: prev.metadata?.user_ids ?? "",
          },
        };
      }

      if (Object.prototype.hasOwnProperty.call(prev.metadata, fieldName)) {
        return prev;
      }

      return {
        ...prev,
        metadata: {
          ...prev.metadata,
          [fieldName]: normalizeCustomFieldValue("", customFieldDraft.type),
        },
      };
    });

    setCustomFieldDraft({ name: "", type: "text" });
  }

  function addEditCustomField() {
    const fieldName = editCustomFieldDraft.name.trim();
    if (!fieldName) return;

    setEditForm((prev) => {
      if (isAssignedUserIdsFieldName(fieldName)) {
        return {
          ...prev,
          metadata: {
            ...prev.metadata,
            user_ids: prev.metadata?.user_ids ?? "",
          },
        };
      }

      if (Object.prototype.hasOwnProperty.call(prev.metadata, fieldName)) {
        return prev;
      }

      return {
        ...prev,
        metadata: {
          ...prev.metadata,
          [fieldName]: normalizeCustomFieldValue("", editCustomFieldDraft.type),
        },
      };
    });

    setEditCustomFieldDraft({ name: "", type: "text" });
  }

  function removeCustomField(fieldName) {
    setForm((prev) => {
      const metadata = { ...prev.metadata };
      delete metadata[fieldName];
      return { ...prev, metadata };
    });
  }

  function removeEditCustomField(fieldName) {
    setEditForm((prev) => {
      const metadata = { ...prev.metadata };
      delete metadata[fieldName];
      return { ...prev, metadata };
    });
  }

  async function saveResource() {
    try {
      await apiPost("/resources", form);
      setShowAdd(false);
      setSelectedType(null);
      setForm({ name: "", type_id: "", metadata: {} });
      setCustomFieldDraft({ name: "", type: "text" });
      setSelectedHallId(null);
      loadData();
    } catch (err) {
      console.error("Error creating resource:", err);
    }
  }

  function openEdit(resource) {
    const type = types.find((t) => t.id === Number(resource.type_id));
    setEditSelectedType(type || null);
    setEditForm({
      id: resource.id,
      name: resource.name || "",
      type_id: resource.type_id || "",
      metadata: syncAutoUserCountFields(resource.metadata || {}, type || null),
    });
    setEditCustomFieldDraft({ name: "", type: "text" });
    setShowEdit(true);
  }

  async function saveEdit() {
    try {
      if (!editForm.id) return;
      const payload = {
        name: editForm.name,
        type_id: editForm.type_id,
        metadata: editForm.metadata,
      };
      await apiPut(`/resources/${editForm.id}`, payload);
      setShowEdit(false);
      setEditSelectedType(null);
      setEditForm({ id: null, name: "", type_id: "", metadata: {} });
      setEditCustomFieldDraft({ name: "", type: "text" });
      setSelectedHallId(null);
      loadData();
    } catch (err) {
      console.error("Error updating resource:", err);
    }
  }

  async function deleteResource(id) {
    if (!confirm("Are you sure you want to delete this resource?")) return;

    try {
      await apiDelete(`/resources/${id}`);
      if (String(selectedHallId) === String(id)) {
        setSelectedHallId(null);
      }
      loadData();
    } catch (err) {
      console.error("Delete error:", err);
    }
  }
  async function generateSeatsForHall(resource) {
  try {
    const capacity = Number(
      resource?.metadata?.capacity || resource?.metadata?.Capacity || 0
    );
    if (!Number.isFinite(capacity) || capacity <= 0) return;

    const payload = {
      name: resource.name,
      type_id: resource.type_id,
      metadata: {
        ...(resource.metadata || {}),
        seatObjects: buildSeatObjectsFromCapacity(capacity),
      },
    };

    await apiPut(`/resources/${resource.id}`, payload);
    await loadData();
  } catch (err) {
    console.error("Error generating seats:", err);
  }
}

async function updateSeatState(hallResource, seatId, changes) {
  try {
    const currentSeats = getSeatObjects(hallResource);
    const nextSeats = currentSeats.map((seat) =>
      seat.seatId === seatId ? { ...seat, ...changes } : seat
    );

    const payload = {
      name: hallResource.name,
      type_id: hallResource.type_id,
      metadata: {
        ...(hallResource.metadata || {}),
        seatObjects: nextSeats,
      },
    };

    await apiPut(`/resources/${hallResource.id}`, payload);
    await loadData();
  } catch (err) {
    console.error("Error updating seat state:", err);
  }
}

function openLayoutEditor(hallResource) {
  setLayoutModal({
    open: true,
    hall: hallResource,
    form: getDefaultHallLayoutConfig(hallResource),
  });
}

async function saveHallLayout() {
  try {
    if (!layoutModal.hall) return;

    const nextLayout = {
      frontRows: Number(layoutModal.form.frontRows || 0),
      frontSeatsPerRow: Number(layoutModal.form.frontSeatsPerRow || 0),
      regularRows: Number(layoutModal.form.regularRows || 0),
      leftSeats: Number(layoutModal.form.leftSeats || 0),
      centerSeats: Number(layoutModal.form.centerSeats || 0),
      rightSeats: Number(layoutModal.form.rightSeats || 0),
    };

    const seatObjects = buildSeatObjectsFromLayoutConfig(nextLayout, 0);
    const totalSeats = seatObjects.length;

    await apiPut(`/resources/${layoutModal.hall.id}`, {
      name: layoutModal.hall.name,
      type_id: layoutModal.hall.type_id,
      metadata: {
        ...(layoutModal.hall.metadata || {}),
        capacity: totalSeats,
        seatObjects,
        layoutConfig: nextLayout,
      },
    });

    setLayoutModal({
      open: false,
      hall: null,
      form: {
        frontRows: 0,
        frontSeatsPerRow: 0,
        regularRows: 0,
        leftSeats: 0,
        centerSeats: 0,
        rightSeats: 0,
      },
    });

    await loadData();
  } catch (err) {
    console.error("Error saving hall layout:", err);
  }
}



  const normalizedNameFilter = nameFilter.trim().toLowerCase();
  const hasNameFilter = normalizedNameFilter.length > 0;
  const hasTypeFilter = String(typeFilter).trim().length > 0;
  const hasActiveFilter = hasNameFilter || hasTypeFilter;

  const filteredResources = sortResourcesAlphabetically(resources).filter((resource) => {
    const matchesType = !typeFilter || String(resource.type_id) === typeFilter;

    if (!hasNameFilter) {
      return hasTypeFilter || isRestaurant ? matchesType : false;
    }

    const haystack = [
      resource.name,
      resource.type_name,
      buildMetadataSearchText(resource.metadata),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return matchesType && haystack.includes(normalizedNameFilter);
  });

  const selectedTypeName =
    types.find((type) => String(type.id) === String(typeFilter))?.name || "All";

  const nameMatchedResources = hasNameFilter
    ? filteredResources.filter((resource) =>
        String(resource?.name || "").toLowerCase().includes(normalizedNameFilter)
      )
    : filteredResources;

  useEffect(() => {
    setExpandedResourceGroups({});
    setActiveResourceGroupKey("");
  }, [normalizedNameFilter, typeFilter]);

  const resourceResultGroups = useMemo(() => {
    function getGroupIdentity(resource) {
      const label = resource.type_name || config.resources.defaultTypeLabel || "Resource";
      const key = `${resource.type_id || "unknown"}-${label}`;
      return { key, label };
    }

    const matchedGroupKeys = new Set(
      nameMatchedResources.map((resource) => getGroupIdentity(resource).key)
    );

    const exactMatchCounts = nameMatchedResources.reduce((acc, resource) => {
      const { key } = getGroupIdentity(resource);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const groups = new Map();

    sortResourcesAlphabetically(resources).forEach((resource) => {
      const { key, label } = getGroupIdentity(resource);
      const matchesType = !typeFilter || String(resource.type_id) === typeFilter;

      if (!matchesType || !matchedGroupKeys.has(key)) return;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          resources: [],
          exactMatches: exactMatchCounts[key] || 0,
        });
      }
      groups.get(key).resources.push(resource);
    });

    if (hasNameFilter) {
      groups.forEach((group) => {
        group.resources = group.resources.filter((resource) =>
          String(resource?.name || "").toLowerCase().includes(normalizedNameFilter)
        );
      });
    }

    return Array.from(groups.values()).sort(
      (a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) ||
        b.resources.length - a.resources.length
    );
  }, [
    filteredResources,
    nameMatchedResources,
    resources,
    typeFilter,
    hasNameFilter,
    normalizedNameFilter,
    config.resources.defaultTypeLabel,
  ]);

  function toggleResourceGroup(groupKey) {
    setExpandedResourceGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }

  const activeResourceGroup = resourceResultGroups.find(
    (group) => group.key === activeResourceGroupKey
  );


  const groupedSeatRows = useMemo(() => {
    if (!isCinema || !selectedHallId) return [];

    const selectedHall = filteredResources.find(
      (resource) => String(resource.id) === String(selectedHallId)
    );

    if (!selectedHall) return [];

    const allSeats = getSeatObjects(selectedHall).map((seat) => ({
      ...seat,
      hallName: selectedHall.name,
      resourceId: selectedHall.id,
    }));

    return Object.entries(
      allSeats.reduce((acc, seat) => {
        const row = String(seat?.row || "A").trim() || "A";
        if (!acc[row]) acc[row] = [];
        acc[row].push(seat);
        return acc;
      }, {})
    )
      .sort(([a], [b]) =>
        String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      )
      .map(([rowLabel, rowItems]) => ({
        rowLabel,
        items: [...rowItems].sort(
          (a, b) => Number(a?.number || 0) - Number(b?.number || 0)
        ),
      }));
  }, [filteredResources, isCinema, selectedHallId]);

  const selectedHall = useMemo(() => {
    if (!selectedHallId) return null;
    return (
      filteredResources.find((resource) => String(resource.id) === String(selectedHallId)) ||
      null
    );
  }, [filteredResources, selectedHallId]);

  const seatRowBlocks = useMemo(() => {
    if (!isCinema) return [];
    return chunkArray(groupedSeatRows, 2);
  }, [groupedSeatRows, isCinema]);

  if (loading) {
    return <p className="text-gray-500">Loading {String(config.labels.resources || "resources").toLowerCase()}...</p>;
  }

  function renderResourceCard(resource) {
    return (
      <article key={resource.id} className="resource-card rounded-[22px] border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-bold text-slate-900">{resource.name}</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${config.theme.tag}`}>{resource.type_name || config.resources.defaultTypeLabel}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tagMuted}`}>ID #{resource.id}</span>
              {Object.entries(resource.metadata || {})
                .slice(0, 3)
                .map(([key, value]) => (
                  <span key={`${resource.id}-${key}`} className={`rounded-full border px-3 py-1 text-xs ${theme.tagMuted}`}>{key}: {normalizeCustomFieldValue(value)}</span>
                ))}
            </div>

            {isRestaurant && isRestaurantTableResource(resource) && (() => {
              const table = getRestaurantTableConfig(resource);
              const box = getRestaurantTablePixelSize(table.size, table.shape);
              const isRect = table.shape === "rect" || table.shape === "rectangle";
              const isSquare = table.shape === "square";

              return (
                <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-5">
                  <div className="relative flex h-[140px] w-[180px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                    <div
                      className={`relative border-2 border-amber-300 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_100%)] shadow-sm ${
                        isRect ? "rounded-2xl" : isSquare ? "rounded-2xl" : "rounded-full"
                      }`}
                      style={{ width: `${box.width}px`, height: `${box.height}px` }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">
                        {table.shape}
                      </div>
                    </div>

                    {buildSeatDots(table.seats).map((seatNumber, index, arr) => {
                      const angle = (Math.PI * 2 * index) / arr.length;
                      const radiusX = isRect ? box.width / 2 + 18 : box.width / 2 + 14;
                      const radiusY = isRect ? box.height / 2 + 16 : box.height / 2 + 14;
                      const left = 90 + Math.cos(angle - Math.PI / 2) * radiusX;
                      const top = 70 + Math.sin(angle - Math.PI / 2) * radiusY;

                      return (
                        <div
                          key={`${resource.id}-seat-preview-${seatNumber}`}
                          className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-700 shadow-sm"
                          style={{ left: `${left}px`, top: `${top}px` }}
                        >
                          {seatNumber}
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid gap-2 text-sm text-slate-600">
                    <div><span className="font-semibold text-slate-900">Shape:</span> {table.shape}</div>
                    <div><span className="font-semibold text-slate-900">Size:</span> {table.size}</div>
                    <div><span className="font-semibold text-slate-900">Seats:</span> {table.seats}</div>
                    <div><span className="font-semibold text-slate-900">Position:</span> {table.x}, {table.y}</div>
                    <div><span className="font-semibold text-slate-900">Rotation:</span> {table.rotation}ֲ°</div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
            <button onClick={() => setDetailsModal({ open: true, item: resource })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonNeutral}`}>View</button>
            <button onClick={() => openEdit(resource)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonWarning}`}>Edit</button>
            <button onClick={() => deleteResource(resource.id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonDanger}`}>Delete</button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className={`resources-page ${!isCinema ? "resources-page--classic" : ""} space-y-6`}>
      {!selectedHallId && (
        <section className={`resources-toolbar overflow-visible rounded-[28px] border p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-8 ${isCinema ? config.theme.heroDark : `${theme.card} bg-gradient-to-br ${theme.hero}`}`}>
        <div className="resources-toolbar__top flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div
              className={
                isCinema
                  ? "resources-eyebrow mb-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] border-red-900/40 bg-red-950/50 text-red-200"
                  : "resources-eyebrow resources-eyebrow--classic mb-3 inline-flex items-center text-xs font-semibold uppercase"
              }
            >
              {config.resources.eyebrow}
            </div>
            <p className={`resources-toolbar__subtitle mt-3 text-base leading-7 ${isCinema ? "text-slate-300" : theme.textSoft}`}>
              {isRestaurant
                ? "Arrange tables visually, adjust table sizes, and match the number of seats to each table layout."
                : config.resources.subtitle}
            </p>
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className={`resources-add-button inline-flex h-fit items-center rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg transition ${config.theme.buttonPrimary}`}
          >
            + {config.resources.addButton}
          </button>
        </div>

        <div className={`resources-filter-panel mt-8 rounded-[24px] border p-4 shadow-sm backdrop-blur sm:p-5 ${isCinema ? config.theme.panelSoft : "border-slate-200 bg-white/85"}`}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className={`mb-2 block text-sm font-semibold ${isCinema ? "text-slate-100" : theme.textStrong}`}>
                {config.resources.filterLabel}
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${theme.input}`}
                >
                  <option value="">All</option>
                  {sortResourcesAlphabetically(types).map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-sm font-semibold ${isCinema ? "text-slate-100" : theme.textStrong}`}>
                {isRestaurant ? "Search by table name" : config.resources.searchLabel}
              </label>
              <input
                type="text"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder={isRestaurant ? "Type a table name, area, shape, or seat count..." : config.resources.searchPlaceholder}
                className={`w-full rounded-2xl border px-4 py-3 outline-none transition placeholder:text-slate-400 ${theme.input}`}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryPill
              label={config.resources.matchedResults}
              value={isCinema ? (hasActiveFilter ? filteredResources.length : 0) : hasActiveFilter ? nameMatchedResources.length : 0}
              tone="blue"
              isClassic={!isCinema}
              isCinema={isCinema}
            />
            <SummaryPill
              label={config.resources.selectedFilter}
              value={selectedTypeName}
              tone="slate"
              isClassic={!isCinema}
              isCinema={isCinema}
            />
            <SummaryPill
              label={config.resources.totalResources}
              value={resources.length}
              tone="emerald"
              isClassic={!isCinema}
              isCinema={isCinema}
            />
          </div>
        </div>
        </section>
      )}

      <section className={`resources-list rounded-[26px] border p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-6 ${isCinema ? config.theme.card : "border-slate-200 bg-white"}`}>
        {isCinema ? (
          !hasActiveFilter ? (
            <div className="resources-cinema-empty rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
              <div className="text-lg font-semibold text-slate-800">{config.resources.emptyTitle}</div>
              <div className="mt-2 text-sm text-slate-500">{config.resources.emptySubtitle}</div>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
              <div className="text-lg font-semibold text-slate-800">{config.resources.noResultsTitle}</div>
              <div className="mt-2 text-sm text-slate-500">{config.resources.noResultsSubtitle}</div>
            </div>
          ) : selectedHall ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={`text-sm font-semibold uppercase tracking-[0.18em] ${config.theme.textSoft}`}>Seat Map</div>
                  <h2 className={`mt-1 text-2xl font-black ${isCinema ? config.theme.textStrong : "text-slate-900"}`}>{selectedHall.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openLayoutEditor(selectedHall)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${config.theme.buttonSecondary}`}
                  >
                    Edit Layout
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedHallId(null)}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold ${theme.buttonGhost}`}
                  >
                    Back to Halls
                  </button>
                </div>
              </div>

              <div className={`overflow-hidden rounded-[24px] border p-4 shadow-inner sm:p-6 ${config.theme.card}`}>
                <div className={`mx-auto mb-6 max-w-5xl rounded-[24px] border px-6 py-4 text-center shadow-[0_12px_35px_rgba(127,29,29,0.22)] ${config.theme.heroDark}`}>
                  <div className="text-xs font-bold uppercase tracking-[0.35em] text-red-400">Hall Layout</div>
                  <div className="mt-2 text-2xl font-black tracking-[0.28em] text-white">SCREEN</div>
                  <div className="mt-2 text-sm text-slate-300">Seat map generated automatically from hall capacity.</div>
                </div>

                {seatRowBlocks.length > 0 ? (
                  <div className="grid gap-4 lg:gap-5">
                    {seatRowBlocks.map((rowBlock, blockIndex) => (
                      <div
                        key={`block-${blockIndex}`}
                        className={`rounded-[22px] border px-3 py-3 shadow-sm sm:px-4 lg:px-5 ${config.theme.card}`}
                      >
                        <div className="grid gap-3 lg:gap-4">
                          {rowBlock.map(({ rowLabel, items }) => {
                            const sections = splitRowIntoSections(items);

                            return (
                              <div
                                key={rowLabel}
                                className="grid items-center gap-3 sm:grid-cols-[52px_1fr] lg:grid-cols-[58px_1fr]"
                              >
                                <div className={`cinema-seat-row-label flex h-[32px] lg:h-[36px] items-center justify-center rounded-xl text-sm font-bold text-white shadow-lg ${config.theme.buttonPrimary}`} style={isCinema ? { color: "#ffffff", WebkitTextFillColor: "#ffffff" } : undefined}>
                                  {rowLabel}
                                </div>

                                <div className="pb-2">
                                  <div className="mx-auto flex flex-wrap items-center justify-center gap-1.5 lg:gap-2">
                                    {sections.left.length > 0 && (
                                      <div className="grid grid-flow-col auto-cols-max gap-1.5 sm:gap-2">
                                        {sections.left.map((seat) => {
                                          const isBroken = Boolean(seat?.isBroken);
                                          const status = String(seat?.status || "available");
                                          return (
                                            <div key={`${seat.resourceId}-${seat.seatId}`} className="group relative">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setDetailsModal({
                                                    open: true,
                                                    item: {
                                                      name: `${seat.seatId} • ${seat.hallName}`,
                                                      type_name: "Seat",
                                                      metadata: seat,
                                                    },
                                                  })
                                                }
                                                className={`flex h-[26px] w-[26px] sm:h-[28px] sm:w-[28px] lg:h-[30px] lg:w-[30px] flex-col items-center justify-center rounded-md border text-center shadow-[0_12px_25px_rgba(109,40,217,0.18)] transition hover:-translate-y-1 ${
                                                  isBroken
                                                    ? "border-red-300 bg-[linear-gradient(180deg,#fee2e2_0%,#fecaca_100%)]"
                                                    : status === "blocked"
                                                    ? "border-amber-300 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_100%)]"
                                                    : "border-violet-300 bg-[linear-gradient(180deg,#ede9fe_0%,#ddd6fe_100%)] hover:bg-[linear-gradient(180deg,#ddd6fe_0%,#c4b5fd_100%)]"
                                                }`}
                                              >
                                                <span className="mt-0.5 text-[9px] lg:text-[10px] font-black text-slate-900">{seat.number}</span>
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {sections.left.length > 0 && sections.center.length > 0 && (
                                      <div className="hidden h-8 lg:h-10 w-3 lg:w-4 rounded-full bg-slate-200/45 sm:block" />
                                    )}

                                    {sections.center.length > 0 && (
                                      <div className="grid grid-flow-col auto-cols-max gap-1.5 sm:gap-2">
                                        {sections.center.map((seat) => {
                                          const isBroken = Boolean(seat?.isBroken);
                                          const status = String(seat?.status || "available");
                                          return (
                                            <div key={`${seat.resourceId}-${seat.seatId}`} className="group relative">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setDetailsModal({
                                                    open: true,
                                                    item: {
                                                      name: `${seat.seatId} • ${seat.hallName}`,
                                                      type_name: "Seat",
                                                      metadata: seat,
                                                    },
                                                  })
                                                }
                                                className={`flex h-[26px] w-[26px] sm:h-[28px] sm:w-[28px] lg:h-[30px] lg:w-[30px] flex-col items-center justify-center rounded-md border text-center shadow-[0_12px_25px_rgba(109,40,217,0.18)] transition hover:-translate-y-1 ${
                                                  isBroken
                                                    ? "border-red-300 bg-[linear-gradient(180deg,#fee2e2_0%,#fecaca_100%)]"
                                                    : status === "blocked"
                                                    ? "border-amber-300 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_100%)]"
                                                    : "border-violet-300 bg-[linear-gradient(180deg,#ede9fe_0%,#ddd6fe_100%)] hover:bg-[linear-gradient(180deg,#ddd6fe_0%,#c4b5fd_100%)]"
                                                }`}
                                              >
                                                <span className="mt-0.5 text-[9px] lg:text-[10px] font-black text-slate-900">{seat.number}</span>
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {sections.right.length > 0 && sections.center.length > 0 && (
                                      <div className="hidden h-8 lg:h-10 w-3 lg:w-4 rounded-full bg-slate-200/45 sm:block" />
                                    )}

                                    {sections.right.length > 0 && (
                                      <div className="grid grid-flow-col auto-cols-max gap-1.5 sm:gap-2">
                                        {sections.right.map((seat) => {
                                          const isBroken = Boolean(seat?.isBroken);
                                          const status = String(seat?.status || "available");
                                          return (
                                            <div key={`${seat.resourceId}-${seat.seatId}`} className="group relative">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setDetailsModal({
                                                    open: true,
                                                    item: {
                                                      name: `${seat.seatId} • ${seat.hallName}`,
                                                      type_name: "Seat",
                                                      metadata: seat,
                                                    },
                                                  })
                                                }
                                                className={`flex h-[26px] w-[26px] sm:h-[28px] sm:w-[28px] lg:h-[30px] lg:w-[30px] flex-col items-center justify-center rounded-md border text-center shadow-[0_12px_25px_rgba(109,40,217,0.18)] transition hover:-translate-y-1 ${
                                                  isBroken
                                                    ? "border-red-300 bg-[linear-gradient(180deg,#fee2e2_0%,#fecaca_100%)]"
                                                    : status === "blocked"
                                                    ? "border-amber-300 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_100%)]"
                                                    : "border-violet-300 bg-[linear-gradient(180deg,#ede9fe_0%,#ddd6fe_100%)] hover:bg-[linear-gradient(180deg,#ddd6fe_0%,#c4b5fd_100%)]"
                                                }`}
                                              >
                                                <span className="mt-0.5 text-[9px] lg:text-[10px] font-black text-slate-900">{seat.number}</span>
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-violet-200 bg-white/70 px-4 py-12 text-center">
                    <div className="text-lg font-semibold text-slate-800">No generated seats yet</div>
                    <div className="mt-2 text-sm text-slate-500">Seats will be created automatically from hall capacity.</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="resources-cinema-grid">
              {filteredResources.map((resource) => {
                const hallSeats = getSeatObjects(resource);
                const canGenerateSeats = isCinemaHallResource(resource);
                return (
                  <article key={resource.id} className={`resource-card resource-card--cinema-grid rounded-[22px] border p-5 shadow-sm transition hover:shadow-md ${isCinema ? `${config.theme.card} hover:border-red-900/30` : "border-slate-200 bg-gradient-to-r from-white to-slate-50 hover:border-slate-300"}`}>
                    <div className="resource-card--cinema-grid__body flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="resource-card--cinema-grid__content min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className={`text-xl font-bold ${isCinema ? config.theme.textStrong : "text-slate-900"}`}>{resource.name}</h3>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${config.theme.tag}`}>{resource.type_name || config.resources.defaultTypeLabel}</span>
                        {canGenerateSeats && (
                          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                            {hallSeats.length > 0 ? `${hallSeats.length} seats ready` : `Capacity ${resource?.metadata?.capacity || resource?.metadata?.Capacity || 0}`}
                          </span>
                        )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tagMuted}`}>ID #{resource.id}</span>
                          {Object.entries(resource.metadata || {})
                            .filter(([key]) => key !== "seatObjects")
                            .slice(0, 3)
                            .map(([key, value]) => {
                              const chipClass =
                                key === "zone"
                                  ? config.theme.tag
                                  : key === "capacity" || key === "Capacity"
                                  ? theme.highlightTag
                                  : theme.tagMuted;

                              return (
                                <span key={`${resource.id}-${key}`} className={`rounded-full px-3 py-1 text-xs ${chipClass}`}>
                                  {key}: {normalizeCustomFieldValue(value)}
                                </span>
                              );
                            })}
                        </div>
                      </div>
                      <div className="resource-card--cinema-grid__actions flex flex-wrap items-center gap-2 whitespace-nowrap">
                        {canGenerateSeats && (
                          <button
                            onClick={() => openLayoutEditor(resource)}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold ${config.theme.buttonSecondary}`}
                          >
                            Edit Layout
                          </button>
                        )}
                        {canGenerateSeats && (
                          <button onClick={() => setSelectedHallId(resource.id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonPrimary}`}>Open Seat Map</button>
                        )}
                        <button onClick={() => setDetailsModal({ open: true, item: resource })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonNeutral}`}>View</button>
                        <button onClick={() => openEdit(resource)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonWarning}`}>Edit</button>
                        <button onClick={() => deleteResource(resource.id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonDanger}`}>Delete</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : !hasActiveFilter ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
            <div className="text-lg font-semibold text-slate-800">{config.resources.emptyTitle}</div>
            <div className="mt-2 text-sm text-slate-500">{config.resources.emptySubtitle}</div>
          </div>
        ) : (!isRestaurant && nameMatchedResources.length === 0) || (isRestaurant && filteredResources.length === 0) ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
            <div className="text-lg font-semibold text-slate-800">{config.resources.noResultsTitle}</div>
            <div className="mt-2 text-sm text-slate-500">{config.resources.noResultsSubtitle}</div>
          </div>
        ) : !isRestaurant ? (
          activeResourceGroup ? (
            <div className="resource-group-detail">
              <div className="resource-group-detail__header">
                <button
                  type="button"
                  onClick={() => setActiveResourceGroupKey("")}
                  className="resource-group-detail__back"
                >
                  Back to groups
                </button>
                <div>
                  <span className="resource-result-group__eyebrow">Resource group</span>
                  <h2>{activeResourceGroup.label}</h2>
                  <p>
                    {activeResourceGroup.resources.length} resources
                    {hasNameFilter && activeResourceGroup.exactMatches < activeResourceGroup.resources.length
                      ? `, ${activeResourceGroup.exactMatches} direct matches for "${nameFilter.trim()}"`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="resource-group-detail__grid">
                {activeResourceGroup.resources.map((resource) => renderResourceCard(resource))}
              </div>
            </div>
          ) : (
            <div className="resource-group-list resource-group-list--grid">
              {resourceResultGroups.map((group) => {
                const previewNames = group.resources.slice(0, 4).map((resource) => resource.name);

                return (
                  <button
                    key={group.key}
                    type="button"
                    className="resource-result-tile"
                    onClick={() => setActiveResourceGroupKey(group.key)}
                  >
                    <span className="resource-result-group__eyebrow">Result group</span>
                    <strong>{group.label}</strong>
                    <p>
                      {previewNames.join(", ")}
                      {group.resources.length > previewNames.length ? "..." : ""}
                    </p>
                    <div className="resource-result-tile__footer">
                      {hasNameFilter && group.exactMatches < group.resources.length && (
                        <span>{group.exactMatches} matches</span>
                      )}
                      <span>{group.resources.length} resources</span>
                      <b className="resource-result-tile__open-group">Open group</b>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <div className="grid gap-4">
            {filteredResources.map((resource) => (
              <article key={resource.id} className="resource-card rounded-[22px] border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-bold text-slate-900">{resource.name}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${config.theme.tag}`}>{resource.type_name || config.resources.defaultTypeLabel}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tagMuted}`}>ID #{resource.id}</span>
                      {Object.entries(resource.metadata || {})
                        .slice(0, 3)
                        .map(([key, value]) => (
                          <span key={`${resource.id}-${key}`} className={`rounded-full border px-3 py-1 text-xs ${theme.tagMuted}`}>{key}: {normalizeCustomFieldValue(value)}</span>
                        ))}
                    </div>

                    {isRestaurant && isRestaurantTableResource(resource) && (() => {
                      const table = getRestaurantTableConfig(resource);
                      const box = getRestaurantTablePixelSize(table.size, table.shape);
                      const isRect = table.shape === "rect" || table.shape === "rectangle";
                      const isSquare = table.shape === "square";

                      return (
                        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-5">
                          <div className="relative flex h-[140px] w-[180px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                            <div
                              className={`relative border-2 border-amber-300 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_100%)] shadow-sm ${
                                isRect ? "rounded-2xl" : isSquare ? "rounded-2xl" : "rounded-full"
                              }`}
                              style={{ width: `${box.width}px`, height: `${box.height}px` }}
                            >
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">
                                {table.shape}
                              </div>
                            </div>

                            {buildSeatDots(table.seats).map((seatNumber, index, arr) => {
                              const angle = (Math.PI * 2 * index) / arr.length;
                              const radiusX = isRect ? box.width / 2 + 18 : box.width / 2 + 14;
                              const radiusY = isRect ? box.height / 2 + 16 : box.height / 2 + 14;
                              const left = 90 + Math.cos(angle - Math.PI / 2) * radiusX;
                              const top = 70 + Math.sin(angle - Math.PI / 2) * radiusY;

                              return (
                                <div
                                  key={`${resource.id}-seat-preview-${seatNumber}`}
                                  className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-700 shadow-sm"
                                  style={{ left: `${left}px`, top: `${top}px` }}
                                >
                                  {seatNumber}
                                </div>
                              );
                            })}
                          </div>

                          <div className="grid gap-2 text-sm text-slate-600">
                            <div><span className="font-semibold text-slate-900">Shape:</span> {table.shape}</div>
                            <div><span className="font-semibold text-slate-900">Size:</span> {table.size}</div>
                            <div><span className="font-semibold text-slate-900">Seats:</span> {table.seats}</div>
                            <div><span className="font-semibold text-slate-900">Position:</span> {table.x}, {table.y}</div>
                            <div><span className="font-semibold text-slate-900">Rotation:</span> {table.rotation}°</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                    <button onClick={() => setDetailsModal({ open: true, item: resource })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonNeutral}`}>View</button>
                    <button onClick={() => openEdit(resource)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonWarning}`}>Edit</button>
                    <button onClick={() => deleteResource(resource.id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${theme.buttonDanger}`}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showAdd && (
        <ModalPortal>
        <div className={`resources-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 ${isShenkar ? "resources-modal-backdrop--shenkar" : ""} ${isCinema ? "resources-modal-backdrop--cinema" : ""}`}>
          <div className={`resources-modal-surface resources-add-modal max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6 ${isShenkar ? "resources-modal-surface--shenkar" : ""} ${isCinema ? "resources-modal-surface--cinema" : ""}`}>
            <div className="resources-add-modal__header">
              <div className="resources-add-modal__eyebrow">Resource setup</div>
              <h2>{config.resources.addTitle}</h2>
              <p>Create the resource, connect it to a type, and optionally assign users.</p>
            </div>

            <div className="resources-add-modal__grid">
              <div className="resources-add-modal__field">
                <label>Select Type</label>
                <select
                  className={`resources-add-modal__input ${theme.input}`}
                  value={form.type_id}
                  onChange={(e) => handleSelectType(e.target.value)}
                >
                  <option value="">-- Select Type --</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="resources-add-modal__field">
                <label>Resource name</label>
                <input
                  type="text"
                  placeholder={config.resources.namePlaceholder}
                  className={`resources-add-modal__input ${theme.input}`}
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="mb-5">
              <AssignedUserIdsEditor
                value={form.metadata?.user_ids ?? form.metadata?.userIds ?? ""}
                onChange={handleMetadataChange}
                inputClassName={theme.input}
                users={users}
              />
            </div>

            {selectedType && Array.isArray(selectedType.fields) && (
              <>
                <h3 className="mb-2 font-semibold">{config.resources.fieldsTitle}</h3>
                {selectedType.fields.map((field, index) => (
                  <div key={index} className="mb-3">
                    <label className="mb-1 block text-sm font-medium">
                      {getFieldDisplayName(field)} ({field.type})
                    </label>
                    {isAutoUserCountField(field) && (
                      <div className="mb-1 text-xs text-slate-500">
                        Calculated automatically from Assigned User IDs.
                      </div>
                    )}

                    {field.type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={form.metadata[field.name] || false}
                        onChange={(e) => handleMetadataChange(field.name, e.target.checked)}
                      />
                    ) : (
                      <input
                        type={field.type === "number" ? "number" : "text"}
                        className={theme.input}
                        value={form.metadata[field.name]}
                        readOnly={isAutoUserCountField(field)}
                        disabled={isAutoUserCountField(field)}
                        onChange={(e) => handleMetadataChange(field.name, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </>
            )}

            {selectedType && (
              <>
                <h3 className="mb-2 mt-6 font-semibold">{config.resources.customFieldsTitle}</h3>
                <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <input
                    type="text"
                    placeholder="Field name"
                    className={theme.input}
                    value={customFieldDraft.name}
                    onChange={(e) =>
                      setCustomFieldDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                  <select
                    className={theme.input}
                    value={customFieldDraft.type}
                    onChange={(e) =>
                      setCustomFieldDraft((prev) => ({ ...prev, type: e.target.value }))
                    }
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="resources-add-modal__add-field rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-800"
                  >
                    Add Field
                  </button>
                </div>

                {getCustomMetadataEntries(form.metadata, selectedType).map(([fieldName, fieldValue]) => {
                  const fieldType =
                    typeof fieldValue === "boolean"
                      ? "boolean"
                      : typeof fieldValue === "number"
                      ? "number"
                      : "text";

                  return (
                    <div key={fieldName} className="mb-3 rounded border p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {fieldName} ({fieldType})
                        </label>
                        <button
                          type="button"
                          onClick={() => removeCustomField(fieldName)}
                          className="resources-add-modal__remove-field rounded bg-red-600 px-2 py-1 text-sm text-white hover:bg-red-700"
                        >
                          Remove
                        </button>
                      </div>

                      {fieldType === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(fieldValue)}
                          onChange={(e) => handleMetadataChange(fieldName, e.target.checked)}
                        />
                      ) : (
                        <input
                          type={fieldType === "number" ? "number" : "text"}
                          className={theme.input}
                          value={fieldValue ?? ""}
                          onChange={(e) =>
                            handleMetadataChange(
                              fieldName,
                              fieldType === "number"
                                ? e.target.value === ""
                                  ? ""
                                  : Number(e.target.value)
                                : e.target.value
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </>
            )}

            <div className="resources-add-modal__footer mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setSelectedType(null);
                  setCustomFieldDraft({ name: "", type: "text" });
                }}
                className="resources-add-modal__cancel rounded border px-4 py-2"
              >
                Cancel
              </button>

              <button
                onClick={saveResource}
                className="resources-add-modal__save rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Save Resource
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {showEdit && (
        <ModalPortal>
        <div className={`resources-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 ${isShenkar ? "resources-modal-backdrop--shenkar" : ""}`}>
          <div className={`resources-modal-surface resources-edit-modal flex max-h-[90vh] w-full max-w-[600px] flex-col overflow-hidden rounded-lg bg-white p-4 shadow-xl sm:p-6 ${isShenkar ? "resources-modal-surface--shenkar" : ""}`}>
            <h2 className="resources-edit-modal__title mb-4 text-xl font-bold">Edit Resource</h2>

            <div className="resources-edit-modal__body">

            <label className="mb-2 block font-medium">Select Type</label>
            <select
              className={`resources-edit-modal__input mb-4 ${theme.input}`}
              value={editForm.type_id}
              onChange={(e) => handleEditSelectType(e.target.value)}
            >
              <option value="">-- Select Type --</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder={config.resources.namePlaceholder}
              className={`resources-edit-modal__input mb-4 ${theme.input}`}
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />

            <div className="mb-5">
              <AssignedUserIdsEditor
                value={editForm.metadata?.user_ids ?? editForm.metadata?.userIds ?? ""}
                onChange={handleEditMetadataChange}
                inputClassName={theme.input}
                users={users}
              />
            </div>

            {editSelectedType && Array.isArray(editSelectedType.fields) && (
              <>
                <h3 className="resources-edit-modal__section-title mb-2 font-semibold">{config.resources.fieldsTitle}</h3>
                {editSelectedType.fields.map((field, index) => (
                  <div key={index} className="resources-edit-modal__field-row mb-3">
                    <label className="mb-1 block text-sm font-medium">
                      {getFieldDisplayName(field)} ({field.type})
                    </label>
                    {isAutoUserCountField(field) && (
                      <div className="mb-1 text-xs text-slate-500">
                        Calculated automatically from Assigned User IDs.
                      </div>
                    )}

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
                        className={`resources-edit-modal__input ${theme.input}`}
                        value={editForm.metadata[field.name] ?? ""}
                        readOnly={isAutoUserCountField(field)}
                        disabled={isAutoUserCountField(field)}
                        onChange={(e) => handleEditMetadataChange(field.name, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </>
            )}

            {editSelectedType && (
              <>
                <h3 className="resources-edit-modal__section-title mb-2 mt-6 font-semibold">{config.resources.customFieldsTitle}</h3>
                <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <input
                    type="text"
                    placeholder="Field name"
                    className={`resources-edit-modal__input ${theme.input}`}
                    value={editCustomFieldDraft.name}
                    onChange={(e) =>
                      setEditCustomFieldDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                  <select
                    className={`resources-edit-modal__input ${theme.input}`}
                    value={editCustomFieldDraft.type}
                    onChange={(e) =>
                      setEditCustomFieldDraft((prev) => ({ ...prev, type: e.target.value }))
                    }
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <button
                    type="button"
                    onClick={addEditCustomField}
                    className="resources-edit-modal__add-field rounded px-4 py-2 text-white"
                  >
                    Add Field
                  </button>
                </div>

                {getCustomMetadataEntries(editForm.metadata, editSelectedType).map(
                  ([fieldName, fieldValue]) => {
                    const fieldType =
                      typeof fieldValue === "boolean"
                        ? "boolean"
                        : typeof fieldValue === "number"
                        ? "number"
                        : "text";

                    return (
                      <div key={fieldName} className="resources-edit-modal__custom-card mb-3 rounded border p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <label className="text-sm font-medium">
                            {fieldName} ({fieldType})
                          </label>
                          <button
                            type="button"
                            onClick={() => removeEditCustomField(fieldName)}
                            className="resources-edit-modal__remove rounded px-2 py-1 text-sm text-white"
                          >
                            Remove
                          </button>
                        </div>

                        {fieldType === "boolean" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(fieldValue)}
                            onChange={(e) =>
                              handleEditMetadataChange(fieldName, e.target.checked)
                            }
                          />
                        ) : (
                          <input
                            type={fieldType === "number" ? "number" : "text"}
                            className={`resources-edit-modal__input ${theme.input}`}
                            value={fieldValue ?? ""}
                            onChange={(e) =>
                              handleEditMetadataChange(
                                fieldName,
                                fieldType === "number"
                                  ? e.target.value === ""
                                    ? ""
                                    : Number(e.target.value)
                                  : e.target.value
                              )
                            }
                          />
                        )}
                      </div>
                    );
                  }
                )}
              </>
            )}
            </div>

            <div className="resources-edit-modal__footer mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowEdit(false);
                  setEditSelectedType(null);
                  setEditCustomFieldDraft({ name: "", type: "text" });
                }}
                className="resources-edit-modal__cancel rounded border px-4 py-2"
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                className="resources-edit-modal__save rounded px-4 py-2 text-white"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {layoutModal.open && layoutModal.hall && (
        <ModalPortal>
        <div className={`resources-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 ${isShenkar ? "resources-modal-backdrop--shenkar" : ""}`}>
          <div className={`resources-modal-surface w-full max-w-[560px] rounded-2xl bg-white p-5 shadow-xl ${isShenkar ? "resources-modal-surface--shenkar" : ""}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Edit Hall Layout</h2>
                <p className="mt-1 text-sm text-slate-500">{layoutModal.hall.name}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setLayoutModal({
                    open: false,
                    hall: null,
                    form: {
                      frontRows: 0,
                      frontSeatsPerRow: 0,
                      regularRows: 0,
                      leftSeats: 0,
                      centerSeats: 0,
                      rightSeats: 0,
                    },
                  })
                }
                className="rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Front rows</label>
                <input
                  type="number"
                  min="0"
                  value={layoutModal.form.frontRows}
                  onChange={(e) =>
                    setLayoutModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, frontRows: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Seats per front row</label>
                <input
                  type="number"
                  min="0"
                  value={layoutModal.form.frontSeatsPerRow}
                  onChange={(e) =>
                    setLayoutModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, frontSeatsPerRow: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Regular rows</label>
                <input
                  type="number"
                  min="0"
                  value={layoutModal.form.regularRows}
                  onChange={(e) =>
                    setLayoutModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, regularRows: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Left section seats</label>
                <input
                  type="number"
                  min="0"
                  value={layoutModal.form.leftSeats}
                  onChange={(e) =>
                    setLayoutModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, leftSeats: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Center section seats</label>
                <input
                  type="number"
                  min="0"
                  value={layoutModal.form.centerSeats}
                  onChange={(e) =>
                    setLayoutModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, centerSeats: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Right section seats</label>
                <input
                  type="number"
                  min="0"
                  value={layoutModal.form.rightSeats}
                  onChange={(e) =>
                    setLayoutModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, rightSeats: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Total seats preview: {Number(layoutModal.form.frontRows || 0) * Number(layoutModal.form.frontSeatsPerRow || 0) + Number(layoutModal.form.regularRows || 0) * (Number(layoutModal.form.leftSeats || 0) + Number(layoutModal.form.centerSeats || 0) + Number(layoutModal.form.rightSeats || 0))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setLayoutModal({
                    open: false,
                    hall: null,
                    form: {
                      frontRows: 0,
                      frontSeatsPerRow: 0,
                      regularRows: 0,
                      leftSeats: 0,
                      centerSeats: 0,
                      rightSeats: 0,
                    },
                  })
                }
                className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveHallLayout}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${config.theme.buttonPrimary}`}
              >
                Save Layout
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
      {detailsModal.open && (
        <ModalPortal>
        <div className={`resources-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 ${isShenkar ? "resources-modal-backdrop--shenkar" : ""}`}>
          <div className={`resources-modal-surface resources-details-modal flex max-h-[90vh] w-full max-w-[500px] flex-col overflow-hidden rounded-[28px] border border-purple-900/20 bg-[linear-gradient(180deg,#fff_0%,#faf7ff_100%)] p-5 shadow-[0_18px_45px_rgba(88,28,135,0.12)] sm:p-6 ${isShenkar ? "resources-modal-surface--shenkar" : ""}`}>
            <h2 className="mb-4 text-xl font-bold">
              Details - {detailsModal.item?.name}
            </h2>

            <p className="mb-2 text-sm">
              <strong>Type:</strong> {detailsModal.item?.type_name}
            </p>

            <h3 className="mb-3 mt-4 text-lg font-semibold text-purple-950">
              {isCinema && detailsModal.item?.type_name === "Seat" ? "Seat Details" : "Fields"}
            </h3>

            <div className="resources-details-modal__body">
            {isCinema && detailsModal.item?.type_name === "Seat" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-purple-900/15 bg-white/90 p-4 shadow-sm">
                    <div className="text-slate-500 uppercase tracking-[0.12em] text-xs font-semibold">Seat</div>
                    <div className="mt-2 inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-bold text-violet-800">
                      {detailsModal.item?.metadata?.seatId || "-"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-purple-900/15 bg-white/90 p-4 shadow-sm">
                    <div className="text-slate-500 uppercase tracking-[0.12em] text-xs font-semibold">Status</div>
                    <div className="mt-2">
                      {String(detailsModal.item?.metadata?.status || "available") === "blocked" ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">
                          Blocked
                        </span>
                      ) : String(detailsModal.item?.metadata?.status || "available") === "broken" ? (
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-bold text-red-700">
                          Broken
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                          Available
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-purple-900/15 bg-white/90 p-4 shadow-sm">
                    <div className="text-slate-500 uppercase tracking-[0.12em] text-xs font-semibold">Broken</div>
                    <div className="mt-2">
                      {detailsModal.item?.metadata?.isBroken ? (
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-bold text-red-700">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-700">
                          No
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-purple-900/15 bg-white/90 p-4 shadow-sm">
                    <div className="text-slate-500 uppercase tracking-[0.12em] text-xs font-semibold">Hall</div>
                    <div className="mt-1 font-bold text-slate-900">
                      {selectedHall?.name || detailsModal.item?.metadata?.hallName || "-"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const hallResource =
                        selectedHall ||
                        filteredResources.find(
                          (resource) =>
                            String(resource.id) ===
                            String(detailsModal.item?.metadata?.resourceId)
                        );

                      if (!hallResource) return;

                      const nextBroken = !Boolean(detailsModal.item?.metadata?.isBroken);
                      await updateSeatState(hallResource, detailsModal.item?.metadata?.seatId, {
                        isBroken: nextBroken,
                        status: nextBroken ? "broken" : "available",
                      });
                      setDetailsModal({ open: false, item: null });
                    }}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    {detailsModal.item?.metadata?.isBroken ? "Mark Fixed" : "Report Broken"}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const hallResource =
                        selectedHall ||
                        filteredResources.find(
                          (resource) =>
                            String(resource.id) ===
                            String(detailsModal.item?.metadata?.resourceId)
                        );

                      if (!hallResource) return;

                      const currentStatus = String(detailsModal.item?.metadata?.status || "available");
                      await updateSeatState(hallResource, detailsModal.item?.metadata?.seatId, {
                        status: currentStatus === "blocked" ? "available" : "blocked",
                      });
                      setDetailsModal({ open: false, item: null });
                    }}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                  >
                    {String(detailsModal.item?.metadata?.status || "available") === "blocked"
                      ? "Unblock"
                      : "Block"}
                  </button>
                </div>
              </div>
            ) : (
              <pre className="rounded border bg-gray-100 p-4 text-sm">
                {JSON.stringify(detailsModal.item?.metadata || {}, null, 2)}
              </pre>
            )}
            </div>

            <div className="resources-details-modal__footer">
              <button
                onClick={() => setDetailsModal({ open: false, item: null })}
                className="resources-details-modal__close rounded-xl border border-purple-900/20 bg-white px-5 py-2.5 text-sm font-semibold text-purple-950 hover:bg-purple-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
