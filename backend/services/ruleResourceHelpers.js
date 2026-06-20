export const VALID_WIZARD_TARGETS = ["single", "pair", "multi"];

const LEGACY_RESOURCE_IDS = Object.freeze({
  A: "A",
  B: "B",
});

function uniq(values) {
  return Array.from(new Set(values));
}

function normalizeFieldList(fields) {
  if (!Array.isArray(fields)) return [];
  return uniq(
    fields
      .map((field) => String(field || "").trim())
      .filter(Boolean)
  );
}

function normalizeResourceEntry(resource, index) {
  if (!resource || typeof resource !== "object") return null;

  const fallbackId = `resource_${index + 1}`;
  const id = String(resource.id || fallbackId).trim() || fallbackId;
  const name = String(resource.name || id).trim() || id;
  const fields = normalizeFieldList(resource.fields);

  return { id, name, fields };
}

export function normalizeRuleResources({
  resources,
  typeAName = "",
  typeBName = "",
  fieldsA = [],
  fieldsB = [],
} = {}) {
  const dynamicResources = Array.isArray(resources)
    ? resources.map(normalizeResourceEntry).filter(Boolean)
    : [];

  if (dynamicResources.length) return dynamicResources;

  const normalizedAFields = normalizeFieldList(fieldsA);
  const normalizedBFields = normalizeFieldList(fieldsB);
  const legacyResources = [
    {
      id: LEGACY_RESOURCE_IDS.A,
      name: String(typeAName || "A").trim() || "A",
      fields: normalizedAFields,
    },
  ];

  const hasLegacyB =
    normalizedBFields.length > 0 || String(typeBName || "").trim().length > 0;
  if (hasLegacyB) {
    legacyResources.push({
      id: LEGACY_RESOURCE_IDS.B,
      name: String(typeBName || "B").trim() || "B",
      fields: normalizedBFields,
    });
  }

  return legacyResources;
}

export function normalizeWizardTarget(target, resources = []) {
  const normalized = String(target || "").trim().toLowerCase();
  if (VALID_WIZARD_TARGETS.includes(normalized)) return normalized;
  if (resources.length > 2) return "multi";
  if (resources.length === 2) return "pair";
  return "single";
}

export function getPairSideResourceIds(resources = []) {
  return {
    A: resources[0]?.id || LEGACY_RESOURCE_IDS.A,
    B: resources[1]?.id || LEGACY_RESOURCE_IDS.B,
  };
}

export function getPairSideForResourceId(resources = [], resourceId) {
  if (!resourceId) return null;
  const sideIds = getPairSideResourceIds(resources);
  if (String(resourceId) === String(sideIds.A)) return "A";
  if (String(resourceId) === String(sideIds.B)) return "B";
  return null;
}
