const DEFAULT_LABELS = {
  student: "Student",
  students: "Students",
  lecturer: "Lecturer",
  lecturers: "Lecturers",
  responsible: "Responsible",
  course: "Course",
  courses: "Courses",
  class: "Class",
  userId: "National ID",
  request: "Request",
};

const ORG_CONFIGS = {
  "demo.restaurant": {
    labels: {
      student: "Employee",
      students: "Employees",
      lecturer: "Shift manager",
      lecturers: "Shift managers",
      responsible: "Shift manager",
      course: "Shift",
      courses: "Shifts",
      class: "Shift",
      userId: "Employee ID",
      request: "Request",
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
