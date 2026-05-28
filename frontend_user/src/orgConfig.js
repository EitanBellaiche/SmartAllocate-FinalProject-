const STORAGE_PREFIX = "smartallocate.presentation.";

const DEFAULT_LABELS = {
  user: "User",
  users: "Users",
  manager: "Manager",
  managers: "Managers",
  resource: "Resource",
  resources: "Resources",
  userId: "ID",
  request: "Request",
  requests: "Requests",
};

const DEFAULT_CONFIG = {
  domain: "generic",
  labels: DEFAULT_LABELS,
  ui: {
    title: "Resource Booking",
    subtitle: "Browse and reserve available resources",
    empty: "No available resources",
  },
};

const CINEMA_CONFIG = {
  domain: "cinema",
  labels: {
    user: "Customer",
    users: "Customers",
    manager: "Staff",
    managers: "Staff",
    resource: "Seat",
    resources: "Seats",
    userId: "Customer ID",
    request: "Seat Request",
    requests: "Seat Requests",
  },
  ui: {
    title: "Select Your Seat",
    subtitle: "Choose your preferred seat in the hall",
    empty: "No seats available",
  },
};

const ORG_DOMAIN_OVERRIDES = {
  shenkar: "generic",
  yesplanetramatgan: "cinema",
};

function getStorageKey(orgId) {
  return `${STORAGE_PREFIX}${orgId || "default"}`;
}

function normalizeConfig(parsed, forcedDomain) {
  const domain = forcedDomain || parsed?.domain || DEFAULT_CONFIG.domain;

  if (domain === "cinema") {
    return {
      ...DEFAULT_CONFIG,
      ...CINEMA_CONFIG,
      ...parsed,
      domain: "cinema",
      labels: { ...DEFAULT_LABELS, ...CINEMA_CONFIG.labels, ...(parsed?.labels || {}) },
      ui: { ...DEFAULT_CONFIG.ui, ...CINEMA_CONFIG.ui, ...(parsed?.ui || {}) },
    };
  }

  const genericOverrides = forcedDomain === "generic" ? {} : parsed;
  return {
    ...DEFAULT_CONFIG,
    ...genericOverrides,
    domain: "generic",
    labels: { ...DEFAULT_LABELS, ...(genericOverrides?.labels || {}) },
    ui: { ...DEFAULT_CONFIG.ui, ...(genericOverrides?.ui || {}) },
  };
}

export function getOrgConfig(orgId) {
  const normalizedOrgId = String(orgId || "").trim().toLowerCase();
  const forcedDomain = ORG_DOMAIN_OVERRIDES[normalizedOrgId];
  const raw = localStorage.getItem(getStorageKey(orgId));
  if (!raw) return normalizeConfig({}, forcedDomain);

  try {
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed, forcedDomain);
  } catch {
    return normalizeConfig({}, forcedDomain);
  }
}

export function getOrgLabels(orgId) {
  return getOrgConfig(orgId).labels;
}

export function getSessionOrgId(sessionKey) {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return "";
  try {
    const data = JSON.parse(raw);
    return String(data?.organization_id || "").trim();
  } catch {
    return "";
  }
}
