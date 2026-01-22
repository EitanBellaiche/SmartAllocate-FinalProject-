import { getAdminSession } from "./api/api";

const DEFAULT_LABELS = {
  user: "User",
  users: "Users",
  manager: "Manager",
  managers: "Managers",
  resource: "Resource",
  resources: "Resources",
  userId: "National ID",
  request: "Request",
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
    },
  },
};

export function getOrgLabels() {
  const session = getAdminSession();
  const orgId = String(session?.organization_id || "").trim();
  if (orgId && ORG_CONFIGS[orgId]) {
    return ORG_CONFIGS[orgId].labels;
  }
  return DEFAULT_LABELS;
}
