import { getAdminSession } from "./api/api";

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

export function getOrgLabels() {
  const session = getAdminSession();
  const orgId = String(session?.organization_id || "").trim();
  if (orgId && ORG_CONFIGS[orgId]) {
    return ORG_CONFIGS[orgId].labels;
  }
  return DEFAULT_LABELS;
}
