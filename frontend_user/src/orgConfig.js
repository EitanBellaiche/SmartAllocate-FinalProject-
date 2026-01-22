const DEFAULT_LABELS = {
  user: "User",
  users: "Users",
  manager: "Manager",
  managers: "Managers",
  resource: "Resource",
  resources: "Resources",
  userId: "National ID",
  request: "Request",
  requests: "Requests",
};

const ORG_CONFIGS = {
  "demo.restaurant": {
    labels: {
      user: "User",
      users: "Users",
      manager: "Manager",
      managers: "Managers",
      resource: "Resource",
      resources: "Resources",
      userId: "Employee ID",
      request: "Request",
      requests: "Requests",
    },
  },
};

export function getOrgConfig(orgId) {
  const key = String(orgId || "").trim();
  if (key && ORG_CONFIGS[key]) return ORG_CONFIGS[key];
  return { labels: DEFAULT_LABELS };
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
