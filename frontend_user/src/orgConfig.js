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

export function getOrgConfig(orgId) {
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
