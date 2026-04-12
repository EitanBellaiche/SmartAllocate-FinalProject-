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

function getStorageKey(orgId) {
  return `${STORAGE_PREFIX}${orgId || "default"}`;
}

export function getOrgConfig(orgId) {
  const raw = localStorage.getItem(getStorageKey(orgId));
  if (!raw) return DEFAULT_CONFIG;

  try {
    const parsed = JSON.parse(raw);

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      labels: { ...DEFAULT_LABELS, ...(parsed.labels || {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
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
