import { getAdminSession } from "./api/api";

const STORAGE_PREFIX = "smartallocate.presentation.";

const ORG_DOMAIN_OVERRIDES = {
  shenkar: "generic",
  soroka: "clinic",
  soroka_hospital: "clinic",
  "soroka-hospital": "clinic",
  sorokamedicalcenter: "clinic",
  soroka_medical_center: "clinic",
  "soroka-medical-center": "clinic",
  yesplanetramatgan: "cinema",
  yes_planet_ramat_gan: "cinema",
  "yes-planet-ramat-gan": "cinema",
};

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
  booking: "Booking",
  bookings: "Bookings",
};

const DEFAULT_CONFIG = {
  domain: "generic",
  businessName: "SmartAllocate",
  productSubtitle: "Generic resource allocation workspace",
  labels: DEFAULT_LABELS,
  roleNames: {
    admin: "Administrator",
    manager: "Manager",
    user: "User",
  },
  navigation: {
    dashboard: "Dashboard",
    resourceTypes: "Resource Types",
    resources: "Resources",
    availability: "Calendar",
    bookings: "Bookings",
    userBookings: "User Bookings",
    userGroups: "User Groups",
    requests: "Requests",
    rules: "Rules",
  },
  dashboard: {
    eyebrow: "Operations Overview",
    title: "Allocation Dashboard",
    subtitle: "Monitor resources, bookings, and activity across your organization.",
    searchTitle: "Find Resources",
    searchPlaceholder: "Search by name, type, id, or metadata...",
    emptyTitle: "Search to reveal resources",
    emptySubtitle: "Start typing to keep this view focused and easy to scan.",
    noResultsTitle: "No matching resources",
    noResultsSubtitle: "Try a different keyword to locate the resource you need.",
  },
  resources: {
    eyebrow: "Resource Directory",
    title: "Resources",
    subtitle: "Browse, filter, and manage resources from one control panel.",
    filterLabel: "Filter by type",
    searchLabel: "Search by resource name",
    searchPlaceholder: "Type a resource name...",
    matchedResults: "Matched Results",
    selectedFilter: "Selected Filter",
    totalResources: "Total Resources",
    emptyTitle: "Search to reveal resources",
    emptySubtitle: "Start typing a resource name to keep this view clean and focused.",
    noResultsTitle: "No matching resources",
    noResultsSubtitle: "Try a different keyword or change the selected type filter.",
    addButton: "Add Resource",
    addTitle: "Add Resource",
    namePlaceholder: "Resource name",
    fieldsTitle: "Resource Fields",
    customFieldsTitle: "Custom Fields For This Resource",
    defaultTypeLabel: "Resource",
  },
  theme: {
    sidebar: "bg-white",
    sidebarText: "text-gray-900",
    sidebarMuted: "text-gray-500",
    sidebarAccent: "text-blue-600",
    pageBg: "bg-slate-50",
    hoverBg: "hover:bg-blue-50",
    hoverText: "hover:text-blue-600",
    navActive: "bg-blue-50 text-blue-600 border border-blue-100",
    navIdle: "text-gray-700 hover:bg-gray-100 hover:text-blue-600",
    activeNav: "bg-blue-50 text-blue-600 border border-blue-100",
    idleNav: "text-gray-700 hover:bg-gray-100 hover:text-blue-600",
    hero: "from-white via-slate-50 to-blue-50",
    heroEyebrow: "border-blue-200 bg-blue-100 text-blue-700",
    card: "border-slate-200 bg-white",
    panelSoft: "border-slate-200 bg-white/80 backdrop-blur-sm",
    heroDark: "border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50",
    buttonSecondary: "bg-indigo-600 hover:bg-indigo-700 text-white",
    textStrong: "text-slate-900",
    textSoft: "text-slate-500",
    panelBorder: "border-slate-200",
    panelBg: "bg-white",
    tag: "bg-blue-50 text-blue-700",
    input:
      "border-slate-200 bg-white text-slate-900 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100",
    modalCard: "border-slate-200 bg-white",
    modalSurface: "border-slate-200 bg-slate-50",
    modalMuted: "text-slate-500",
    buttonDanger: "bg-red-600 hover:bg-red-700 text-white",
    buttonGhost: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    buttonNeutral: "bg-gray-700 hover:bg-gray-800 text-white",
    tagMuted: "border-slate-200 bg-white text-slate-600",
    aisle: "bg-slate-200/45",
    seatAvailableClass:
      "border-violet-300 bg-[linear-gradient(180deg,#ede9fe_0%,#ddd6fe_100%)] hover:bg-[linear-gradient(180deg,#ddd6fe_0%,#c4b5fd_100%)]",
    seatBlockedClass:
      "border-amber-300 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_100%)]",
    seatBrokenClass:
      "border-red-300 bg-[linear-gradient(180deg,#fee2e2_0%,#fecaca_100%)]",
    metricCards: {
      blue: "border-indigo-200 bg-[linear-gradient(180deg,#ffffff_0%,#eef2ff_100%)] text-indigo-700 shadow-indigo-200/70",
      sky: "border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#eff6ff_100%)] text-sky-700 shadow-sky-200/70",
      emerald:
        "border-emerald-200 bg-[linear-gradient(180deg,#ffffff_0%,#ecfdf5_100%)] text-emerald-700 shadow-emerald-200/70",
      amber: "border-amber-200 bg-[linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)] text-amber-700 shadow-amber-200/70",
      violet:
        "border-fuchsia-200 bg-[linear-gradient(180deg,#ffffff_0%,#fdf4ff_100%)] text-fuchsia-700 shadow-fuchsia-200/70",
    },
  },
};

const CINEMA_CONFIG = {
  domain: "cinema",
  businessName: "SmartAllocate Cinema Mode",
  productSubtitle: "Hall, screen, and seat allocation workspace",
  labels: {
    user: "Customer",
    users: "Customers",
    manager: "Hall Staff",
    managers: "Hall Staff",
    resource: "Hall",
    resources: "Halls",
    userId: "Customer ID",
    request: "Seat Request",
    requests: "Seat Requests",
    booking: "Booking",
    bookings: "Bookings",
  },
  roleNames: {
    admin: "Cinema Administrator",
    manager: "Hall Staff",
    user: "Customer",
  },
  navigation: {
    dashboard: "Hall Overview",
    resourceTypes: "Hall Types",
    resources: "Halls",
    availability: "Screenings",
    bookings: "Bookings",
    userBookings: "Customer Bookings",
    userGroups: "Customer Groups",
    requests: "Seat Requests",
    rules: "Seating Rules",
  },
  dashboard: {
    eyebrow: "Cinema Operations",
    title: "Hall Control Center",
    subtitle:
      "Track seat inventory, hall activity, and booking demand in one cinematic workspace.",
    searchTitle: "Find Halls",
    searchPlaceholder: "Search by hall name, screen, zone, capacity, or metadata...",
    emptyTitle: "Search to reveal halls",
    emptySubtitle: "Start typing to quickly locate halls across your cinema layout.",
    noResultsTitle: "No matching halls",
    noResultsSubtitle: "Try another hall name, screen, or zone keyword.",
  },
  resources: {
    eyebrow: "Cinema Inventory",
    title: "Halls",
    subtitle: "Manage halls, capacities, and seating layouts from one live control surface.",
    filterLabel: "Filter by hall type",
    searchLabel: "Search by hall name",
    searchPlaceholder: "Type a hall, screen, or zone keyword...",
    matchedResults: "Matched Halls",
    selectedFilter: "Selected Hall Type",
    totalResources: "Total Halls",
    emptyTitle: "Search to reveal halls",
    emptySubtitle: "Start typing a hall name, screen, or zone to keep this view focused.",
    noResultsTitle: "No matching halls",
    noResultsSubtitle: "Try a different hall keyword or adjust the selected hall type.",
    addButton: "Add Cinema Resource",
    addTitle: "Add Cinema Resource",
    namePlaceholder: "Hall name",
    fieldsTitle: "Hall Fields",
    customFieldsTitle: "Custom Fields For This Hall",
    defaultTypeLabel: "Hall",
  },
  theme: {
    sidebar: "bg-[#0b1020]",
    sidebarText: "text-slate-100",
    sidebarMuted: "text-slate-400",
    sidebarAccent: "text-violet-200",
    pageBg: "bg-slate-50",
    hoverBg: "hover:bg-white/5",
    hoverText: "hover:text-white",
    navActive: "bg-violet-400/15 text-violet-100 border border-violet-300/20",
    navIdle: "text-slate-100 hover:bg-white/5 hover:text-white",
    activeNav: "bg-violet-400/15 text-violet-100 border border-violet-300/20",
    idleNav: "text-slate-100 hover:bg-white/5 hover:text-white",
    hero: "from-[#180f2e] via-[#26133f] to-[#4c1d95]",
    heroEyebrow: "border-fuchsia-300/30 bg-fuchsia-400/14 text-fuchsia-100",
    primaryButton: "bg-violet-600 hover:bg-fuchsia-700 text-white shadow-violet-300/20",
    panelBorder: "border-slate-200",
    panelBg: "bg-white",
    tag: "bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200",
    card: "border-violet-200/70 bg-[linear-gradient(180deg,#fff_0%,#faf5ff_100%)]",
    panelSoft: "border-violet-200/60 bg-white/14 backdrop-blur-sm",
    heroDark: "border-violet-900/35 bg-[linear-gradient(135deg,#12091f_0%,#24103d_46%,#4c1d95_100%)]",
    buttonPrimary: "bg-[linear-gradient(135deg,#4c1d95_0%,#7c3aed_55%,#db2777_100%)] hover:brightness-110 text-white",
    buttonSecondary:
      "border border-fuchsia-200 text-fuchsia-800 bg-white hover:bg-fuchsia-50 shadow-sm",
    textStrong: "text-purple-950",
    textSoft: "text-slate-300",
    seatAvailable: "bg-emerald-500",
    seatBlocked: "bg-slate-400",
    seatBroken: "bg-red-600",
    input:
      "border-violet-200 bg-white/85 text-purple-950 focus:border-fuchsia-400 focus:bg-white focus:ring-4 focus:ring-fuchsia-100",
    modalCard: "border-violet-200/80 bg-[linear-gradient(180deg,#fff_0%,#faf5ff_100%)]",
    modalSurface: "border-violet-200/70 bg-white/75",
    modalMuted: "text-slate-600",
    buttonDanger: "bg-red-700 hover:bg-red-800 text-white",
    buttonWarning: "bg-fuchsia-700 hover:bg-fuchsia-800 text-white",
    buttonGhost: "border-violet-200 bg-white/85 text-purple-950 hover:bg-fuchsia-50",
    buttonNeutral: "bg-violet-700 hover:bg-violet-800 text-white",
    tagMuted: "border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    highlightTag: "border border-amber-200 bg-amber-50 text-amber-800",
    aisle: "bg-violet-900/15",
    seatAvailableClass:
      "border-violet-300 bg-[linear-gradient(180deg,#ede9fe_0%,#ddd6fe_100%)] hover:bg-[linear-gradient(180deg,#ede9fe_0%,#c4b5fd_100%)]",
    seatBlockedClass:
      "border-amber-300 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_100%)]",
    seatBrokenClass:
      "border-red-300 bg-[linear-gradient(180deg,#fee2e2_0%,#fecaca_100%)]",
    metricCards: {
      blue: "border-indigo-200 bg-[linear-gradient(180deg,#ffffff_0%,#eef2ff_100%)] text-indigo-700 shadow-indigo-200/70",
      sky: "border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#eff6ff_100%)] text-sky-700 shadow-sky-200/70",
      emerald:
        "border-emerald-200 bg-[linear-gradient(180deg,#ffffff_0%,#ecfdf5_100%)] text-emerald-700 shadow-emerald-200/70",
      amber: "border-amber-200 bg-[linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)] text-amber-700 shadow-amber-200/70",
      violet:
        "border-fuchsia-200 bg-[linear-gradient(180deg,#ffffff_0%,#fdf4ff_100%)] text-fuchsia-700 shadow-fuchsia-200/70",
    },
  },
};

const CLINIC_CONFIG = {
  domain: "clinic",
  businessName: "SmartAllocate Clinic Mode",
  productSubtitle: "Appointments, doctors, and rooms allocation workspace",
  labels: {
    user: "Patient",
    users: "Patients",
    manager: "Medical Staff",
    managers: "Medical Staff",
    resource: "Doctor",
    resources: "Doctors",
    userId: "Patient ID",
    request: "Appointment Request",
    requests: "Appointment Requests",
    booking: "Appointment",
    bookings: "Appointments",
  },
  roleNames: {
    admin: "Clinic Administrator",
    manager: "Medical Staff",
    user: "Patient",
  },
  navigation: {
    dashboard: "Clinic Overview",
    resourceTypes: "Specialties",
    resources: "Doctors",
    availability: "Schedule",
    bookings: "Appointments",
    userBookings: "Patient Appointments",
    requests: "Appointment Requests",
    rules: "Policies",
  },
  dashboard: {
    eyebrow: "Clinic Operations",
    title: "Clinic Control Center",
    subtitle:
      "Monitor doctors, appointments, and patient activity in one clean healthcare workspace.",
    searchTitle: "Find Doctors",
    searchPlaceholder: "Search by doctor name, specialty, room, or metadata...",
    emptyTitle: "Search to reveal doctors",
    emptySubtitle: "Start typing to quickly locate doctors and specialties.",
    noResultsTitle: "No matching doctors",
    noResultsSubtitle: "Try another doctor name, specialty, or room keyword.",
  },
  resources: {
    eyebrow: "Clinic Directory",
    title: "Doctors",
    subtitle: "Manage doctors, specialties, and clinic availability from one control surface.",
    filterLabel: "Filter by specialty",
    searchLabel: "Search by doctor name",
    searchPlaceholder: "Type a doctor name, specialty, or room keyword...",
    matchedResults: "Matched Doctors",
    selectedFilter: "Selected Specialty",
    totalResources: "Total Doctors",
    emptyTitle: "Search to reveal doctors",
    emptySubtitle: "Start typing a doctor name or specialty to keep this view focused.",
    noResultsTitle: "No matching doctors",
    noResultsSubtitle: "Try a different keyword or adjust the selected specialty filter.",
    addButton: "Add Doctor",
    addTitle: "Add Doctor",
    namePlaceholder: "Doctor name",
    fieldsTitle: "Doctor Fields",
    customFieldsTitle: "Custom Fields For This Doctor",
    defaultTypeLabel: "Doctor",
  },
  theme: {
    sidebar: "bg-white",
    sidebarText: "text-slate-900",
    sidebarMuted: "text-slate-500",
    sidebarAccent: "text-emerald-700",
    pageBg: "bg-slate-50",
    hoverBg: "hover:bg-emerald-50",
    hoverText: "hover:text-emerald-700",
    navActive: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    navIdle: "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700",
    activeNav: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    idleNav: "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700",
    hero: "from-emerald-600 via-teal-600 to-cyan-500",
    heroEyebrow: "border-emerald-200 bg-emerald-50 text-emerald-800",
    primaryButton: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/40",
    panelBorder: "border-slate-200",
    panelBg: "bg-white",
    tag: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    card: "border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#f0fdf4_100%)]",
    panelSoft: "border-emerald-100 bg-white/86 backdrop-blur-sm",
    heroDark: "border-emerald-200/45 bg-[linear-gradient(135deg,#064e3b_0%,#047857_48%,#14b8a6_100%)]",
    buttonPrimary: "bg-emerald-600 hover:bg-emerald-700 text-white",
    buttonSecondary: "border border-emerald-200 text-emerald-800 bg-white hover:bg-emerald-50 shadow-sm",
    textStrong: "text-slate-950",
    textSoft: "text-slate-600",
    seatAvailable: "bg-emerald-500",
    seatBlocked: "bg-slate-400",
    seatBroken: "bg-red-600",
    input:
      "border-emerald-200 bg-white text-slate-900 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100",
    modalCard: "border-slate-200 bg-white",
    modalSurface: "border-slate-200 bg-slate-50",
    modalMuted: "text-slate-500",
    buttonDanger: "bg-red-600 hover:bg-red-700 text-white",
    buttonWarning: "bg-amber-500 hover:bg-amber-600 text-white",
    buttonGhost: "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50",
    buttonNeutral: "bg-teal-700 hover:bg-teal-800 text-white",
    tagMuted: "border-emerald-200 bg-emerald-50 text-emerald-800",
    highlightTag: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    aisle: "bg-slate-200/45",
    seatAvailableClass:
      "border-emerald-300 bg-[linear-gradient(180deg,#d1fae5_0%,#a7f3d0_100%)] hover:bg-[linear-gradient(180deg,#bbf7d0_0%,#86efac_100%)]",
    seatBlockedClass:
      "border-amber-300 bg-[linear-gradient(180deg,#fef3c7_0%,#fde68a_100%)]",
    seatBrokenClass:
      "border-red-300 bg-[linear-gradient(180deg,#fee2e2_0%,#fecaca_100%)]",
    metricCards: {
      blue: "border-teal-200 bg-[linear-gradient(180deg,#ffffff_0%,#f0fdfa_100%)] text-teal-700 shadow-teal-200/60",
      sky: "border-emerald-200 bg-[linear-gradient(180deg,#ffffff_0%,#ecfdf5_100%)] text-emerald-700 shadow-emerald-200/60",
      emerald:
        "border-emerald-200 bg-[linear-gradient(180deg,#ffffff_0%,#ecfdf5_100%)] text-emerald-700 shadow-emerald-200/60",
      amber: "border-amber-200 bg-[linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)] text-amber-700 shadow-amber-200/60",
      violet:
        "border-lime-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7fee7_100%)] text-lime-700 shadow-lime-200/60",
    },
  },
};

function getStorageKey() {
  const session = getAdminSession();
  const orgId = String(session?.organization_id || "default").trim() || "default";
  return `${STORAGE_PREFIX}${orgId}`;
}

function getForcedDomain() {
  const session = getAdminSession();
  const orgId = String(session?.organization_id || "").trim().toLowerCase();
  const compactOrgId = orgId.replace(/[^a-z0-9]/g, "");
  if (compactOrgId.includes("soroka")) return "clinic";
  if (compactOrgId.includes("yesplanetramatgan")) return "cinema";
  if (compactOrgId === "shenkar") return "generic";
  return ORG_DOMAIN_OVERRIDES[orgId] || ORG_DOMAIN_OVERRIDES[compactOrgId] || null;
}

function getConfigByDomain(domain) {
  if (domain === "cinema") return CINEMA_CONFIG;
  if (domain === "clinic") return CLINIC_CONFIG;
  return DEFAULT_CONFIG;
}

function normalizeKeywords(items = []) {
  return items
    .flatMap((item) => {
      const values = [];
      if (item?.name) values.push(item.name);
      if (item?.type_name) values.push(item.type_name);
      if (item?.description) values.push(item.description);
      if (item?.metadata) values.push(JSON.stringify(item.metadata));
      if (Array.isArray(item?.fields)) {
        item.fields.forEach((field) => {
          if (field?.name) values.push(field.name);
        });
      }
      return values;
    })
    .join(" ")
    .toLowerCase();
}

export function detectPresentation(resourceTypes = [], resources = []) {
  const haystack = `${normalizeKeywords(resourceTypes)} ${normalizeKeywords(resources)}`;

  const cinemaKeywordHits = [
    "seat",
    "row",
    "screen",
    "vip",
    "aisle",
    "theater",
    "theatre",
    "cinema",
    "movie",
    "screening",
    "seat_map",
    "seatmap",
  ].filter((word) => haystack.includes(word)).length;

  const clinicKeywordHits = [
    "doctor",
    "patient",
    "clinic",
    "appointment",
    "physician",
    "nurse",
    "medical record",
    "medical_record",
    "exam room",
    "consultation room",
  ].filter((word) => haystack.includes(word)).length;

  const metadataHints = resources.filter((resource) => {
    const metadata = resource?.metadata || {};
    const keys = Object.keys(metadata).map((key) => String(key).toLowerCase());
    const values = Object.values(metadata).map((value) => String(value).toLowerCase());

    const hasRowKey = keys.some((key) => ["row", "seat_row", "seatrow"].includes(key));
    const hasSeatKey = keys.some((key) =>
      ["seat", "seat_number", "seatnumber", "seat_map", "seatmap"].includes(key)
    );
    const hasScreenKey = keys.some((key) =>
      ["screen", "screening", "aisle", "vip_section"].includes(key)
    );
    const hasCinemaValue = values.some((value) =>
      ["vip", "screening", "seat", "seat map", "seatmap", "aisle", "movie", "cinema"].some(
        (token) => value.includes(token)
      )
    );

    return (hasRowKey && hasSeatKey) || (hasScreenKey && hasSeatKey) || hasCinemaValue;
  }).length;

  const seatNameHints = resources.filter((resource) => {
    const combined = `${resource?.name || ""} ${resource?.type_name || ""}`.toLowerCase();
    return /(seat|seat map|seatmap|row|screen|screening|vip|theater|theatre|cinema|movie)/.test(
      combined
    );
  }).length;

  const clinicNameHints = resources.filter((resource) => {
    const combined = `${resource?.name || ""} ${resource?.type_name || ""}`.toLowerCase();
    return /(doctor|dr\.|physician|clinic|patient|appointment|nurse|exam room|consultation room|medical record)/.test(
      combined
    );
  }).length;

  if (clinicNameHints >= 1 && clinicKeywordHits >= 2) {
    return CLINIC_CONFIG;
  }

  if (
    (seatNameHints >= 2 && cinemaKeywordHits >= 1) ||
    (metadataHints >= 1 && cinemaKeywordHits >= 2)
  ) {
    return CINEMA_CONFIG;
  }

  return DEFAULT_CONFIG;
}

export function rememberPresentation(resourceTypes = [], resources = []) {
  const forcedDomain = getForcedDomain();
  if (forcedDomain) {
    const config = getConfigByDomain(forcedDomain);
    localStorage.setItem(
      getStorageKey(),
      JSON.stringify({
        domain: config.domain,
      })
    );
    return config;
  }

  const config = detectPresentation(resourceTypes, resources);
  localStorage.setItem(
    getStorageKey(),
    JSON.stringify({
      domain: config.domain,
    })
  );
  return config;
}

export function getOrgConfig() {
  const forcedDomain = getForcedDomain();
  if (forcedDomain) {
    return getConfigByDomain(forcedDomain);
  }

  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return DEFAULT_CONFIG;

  try {
    const parsed = JSON.parse(raw);
    const domain = parsed?.domain;

    if (domain === "cinema") {
      return CINEMA_CONFIG;
    }
    if (domain === "clinic") {
      return CLINIC_CONFIG;
    }

    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function getOrgLabels() {
  return getOrgConfig().labels;
}
