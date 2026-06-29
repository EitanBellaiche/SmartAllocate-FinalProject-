import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/api";
import { getOrgConfig } from "../orgConfig";
import "./Rules.css";

const OP_OPTIONS = [
  { label: "==", value: "==" },
  { label: "!=", value: "!=" },
  { label: ">=", value: ">=" },
  { label: "<=", value: "<=" },
  { label: ">", value: ">" },
  { label: "<", value: "<" },
];
const WIZARD_OP_OPTIONS = [...OP_OPTIONS, { label: "in", value: "in" }];

const EMPTY_COMPARISON = {
  bMode: "resource",
  resourceBId: "",
  typeBId: "",
  fieldA: "",
  op: "<",
  rightMode: "field",
  fieldB: "",
  constValue: "",
};

let wizardExtraScopeCounter = 1;

function createEmptyWizardExtraScope() {
  return {
    id: `extra-${wizardExtraScopeCounter++}`,
    scopeMode: "type",
    resourceId: "",
    typeId: "",
  };
}

function createEmptyWizardCondition(id = "c1") {
  return {
    id,
    side: "A",
    resourceId: "A",
    field: "",
    op: "==",
    compare: "value",
    value: "",
    refField: "",
    refResourceId: "",
  };
}

/** @typedef {{ id: string, side?: "A" | "B", resourceId?: string, field: string, op: string, compare: "value" | "field", value: string, refField: string, refResourceId?: string }} WizardCondition */
/** @typedef {{ id: string, scopeMode: "type" | "resource", resourceId: string, typeId: string }} WizardExtraScope */
/** @typedef {{ actionEffect: "forbid" | "score", target: "single" | "pair" | "multi", scopeAMode: "type" | "resource", scopeBMode: "type" | "resource", resourceAId: string, resourceBId: string, typeAId: string, typeBId: string, extraScopes: WizardExtraScope[], conditions: WizardCondition[], conditionSentence: string, lastAppliedSentence: string, name: string, description: string, is_active: boolean, sort_order: number, weight: number, scoreValue: number }} WizardState */

function uniq(arr) {
  return Array.from(new Set(arr));
}

function normalizeWizardSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}:]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsWizardPhrase(text, phrase) {
  if (!text || !phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

function extractWizardDigits(value) {
  return new Set((String(value || "").match(/\d+/g) || []).map(String));
}

function uniqueWizardTerms(values) {
  return Array.from(
    new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))
  );
}

function scoreWizardCatalogEntry(answerNorm, digitTokens, entry) {
  let score = 0;
  const ids = Array.isArray(entry?.ids) ? entry.ids.map((id) => String(id)) : [];
  for (const id of ids) {
    if (id && digitTokens.has(id)) score = Math.max(score, 140);
  }

  const terms = Array.isArray(entry?.searchTerms) ? entry.searchTerms : [];
  const answerTokens = new Set(answerNorm.split(" ").filter(Boolean));
  for (const rawTerm of terms) {
    const term = normalizeWizardSearch(rawTerm);
    if (!term) continue;
    if (answerNorm === term) {
      score = Math.max(score, 130);
      continue;
    }
    if (containsWizardPhrase(answerNorm, term)) {
      score = Math.max(score, 115 + Math.min(term.length, 20));
      continue;
    }
    const termTokens = term.split(" ").filter(Boolean);
    const overlap = termTokens.filter((token) => token.length > 1 && answerTokens.has(token)).length;
    if (overlap === termTokens.length && overlap > 0) {
      score = Math.max(score, 95 + overlap);
      continue;
    }
    if (overlap >= Math.max(1, Math.ceil(termTokens.length / 2))) {
      score = Math.max(score, 60 + overlap);
    }
  }
  return score;
}

function matchWizardCatalog(answer, entries = [], threshold = 70) {
  const answerNorm = normalizeWizardSearch(answer);
  const digitTokens = extractWizardDigits(answer);
  return entries
    .map((entry) => ({
      ...entry,
      matchScore: scoreWizardCatalogEntry(answerNorm, digitTokens, entry),
    }))
    .filter((entry) => entry.matchScore >= threshold)
    .sort((a, b) => b.matchScore - a.matchScore || String(a.label).localeCompare(String(b.label)));
}

function getWizardSearchResults(query, entries = [], limit = 8) {
  const normalized = normalizeWizardSearch(query);
  if (!normalized) return entries.slice(0, limit);
  return matchWizardCatalog(normalized, entries, 1).slice(0, limit);
}

function getResourceFieldOptions(resource) {
  if (!resource) return [];
  const metaKeys = Object.keys(resource.metadata || {}).sort();
  const base = [
    { label: "id", value: "id" },
    { label: "name", value: "name" },
    { label: "type_id", value: "type_id" },
    { label: "type_name", value: "type_name" },
  ];
  const meta = metaKeys.map((k) => ({ label: `metadata.${k}`, value: `metadata.${k}` }));
  return [...base, ...meta];
}

function fieldLabel(value) {
  if (!value) return "";
  return String(value).replace(/^metadata\./, "");
}

function humanizeField(raw) {
  if (!raw) return "";
  const cleaned = String(raw)
    .replace(/^resource\./, "Resource ")
    .replace(/^resources_by_type_id\./, "")
    .replace(/\.metadata\./g, " ")
    .replace(/\.id$/g, " id")
    .replace(/_/g, " ");
  return cleaned.trim();
}

function humanizeOp(op) {
  switch (op) {
    case "==":
      return "is";
    case "!=":
      return "is not";
    case ">":
      return "is greater than";
    case ">=":
      return "is at least";
    case "<":
      return "is less than";
    case "<=":
      return "is at most";
    case "contains":
      return "contains";
    case "in":
      return "is in";
    case "overlap":
      return "overlaps";
    default:
      return op || "";
  }
}

function formatValue(value) {
  if (value && typeof value === "object" && "ref" in value) {
    return `ref:${value.ref}`;
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatCondition(condition, typeNameById, resourceNameById) {
  if (!condition || typeof condition !== "object") return "";
  if (condition.logic && typeof condition.logic === "object") {
    return formatCondition(condition.logic, typeNameById, resourceNameById);
  }
  const describeField = (field) => {
    if (!field) return "?";
    const raw = String(field);
    const typeMatch = raw.match(/^resources_by_type_id\.(\d+)\.(.+)$/);
    if (typeMatch) {
      const typeId = Number(typeMatch[1]);
      const typeName = typeNameById?.get?.(typeId) || `Type ${typeMatch[1]}`;
      const rest = typeMatch[2];
      return `${typeName} ${humanizeField(rest)}`.trim();
    }
    if (raw === "resource.type_id") return "Resource type";
    if (raw === "resource.id") return "Resource";
    return humanizeField(raw);
  };
  const describeValue = (value) => {
    if (value && typeof value === "object" && "ref" in value) {
      const ref = String(value.ref || "");
      const typeMatch = ref.match(/^resources_by_type_id\.(\d+)\.(.+)$/);
      if (typeMatch) {
        const typeId = Number(typeMatch[1]);
        const typeName = typeNameById?.get?.(typeId) || `Type ${typeMatch[1]}`;
        const rest = typeMatch[2];
        return `${typeName} ${humanizeField(rest)}`.trim();
      }
      if (ref === "resource.type_id") return "Resource type";
      if (ref === "resource.id") return "Resource";
      return `ref:${ref}`;
    }
    return formatValue(value);
  };
  const replaceTypeIds = (text) => {
    if (!text) return text;
    return text
      .replace(/resource\.type_id\s*([=!<>]+)\s*(\d+)/g, (m, op, id) => {
        const name = typeNameById?.get?.(Number(id));
        return name ? `Resource type ${humanizeOp(op)} ${name}` : m;
      })
      .replace(/Resource type id\s*(is|is not|is greater than|is at least|is less than|is at most)\s*(\d+)/g, (m, op, id) => {
        const name = typeNameById?.get?.(Number(id));
        return name ? `Resource type ${op} ${name}` : m;
      })
      .replace(/resource\.id\s*([=!<>]+)\s*(\d+)/g, (m, op, id) => {
        const name = resourceNameById?.get?.(Number(id));
        return name ? `Resource ${humanizeOp(op)} ${name}` : m;
      })
      .replace(/resources_by_type_id\.(\d+)/g, (m, id) => {
        const name = typeNameById?.get?.(Number(id));
        return name ? `${name}` : m;
      })
      .replace(/\b(\d+)\b(?=\s)/g, (m, id) => {
        const name = typeNameById?.get?.(Number(id));
        return name ? name : m;
      });
  };
  if (Array.isArray(condition.all)) {
    const text = condition.all
      .map((c) => {
        if (!c || typeof c !== "object") return "";
        if ("not" in c) {
          const inner = c.not;
          if (!inner || typeof inner !== "object") return "NOT ?";
          return `NOT ${describeField(inner.field)} ${humanizeOp(inner.op)} ${describeValue(inner.value)}`.trim();
        }
        const left = describeField(c.field);
        const right = describeValue(c.value);
        const op = humanizeOp(c.op);
        return `${left} ${op} ${right}`.trim();
      })
      .filter(Boolean)
      .join(" AND ");
    return replaceTypeIds(text);
  }
  if (Array.isArray(condition.any)) {
    const text = condition.any
      .map((c) => {
        const left = humanizeField(c.field || "?");
        const right = formatValue(c.value);
        const op = humanizeOp(c.op);
        return `${left} ${op} ${right}`.trim();
      })
      .filter(Boolean)
      .join(" OR ");
    return replaceTypeIds(text);
  }
  if ("not" in condition) {
    const inner = condition.not;
    if (!inner || typeof inner !== "object") return "NOT ?";
    return replaceTypeIds(
      `NOT ${inner.field || "?"} ${inner.op || ""} ${formatValue(inner.value)}`.trim()
    );
  }
  if ("field" in condition) {
    return replaceTypeIds(
      `${humanizeField(condition.field || "?")} ${humanizeOp(condition.op)} ${formatValue(condition.value)}`.trim()
    );
  }
  return "";
}

function parsePrimitive(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  const n = Number(text);
  return Number.isFinite(n) ? n : text;
}

// LLM-based parsing replaces local text heuristics.

function parseInputValue(raw, op) {
  const text = String(raw ?? "").trim();
  if (op === "in") {
    if (!text) return [];
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }
    return text
      .split(",")
      .map((part) => parsePrimitive(part))
      .filter((v) => v !== "");
  }
  return parsePrimitive(text);
}

function buildFieldPath(typeId, field) {
  if (!typeId || !field) return "";
  return `resources_by_type_id.${typeId}.${field}`;
}

function buildResourceFieldPath(field) {
  if (!field) return "";
  return `resource.${field}`;
}

function fieldLabelFromField(field) {
  if (!field) return "";
  return String(field).replace(/^metadata\./, "").replace(/_/g, " ");
}

function getTypeSchemaById(schemaTypes) {
  const map = new Map();
  for (const entry of schemaTypes) {
    if (!entry) continue;
    map.set(String(entry.type_id), entry);
    map.set(Number(entry.type_id), entry);
  }
  return map;
}

function getFieldOptionsForType(schemaTypes, typeId) {
  if (!typeId) return [];
  const entry = schemaTypes.find((t) => String(t.type_id) === String(typeId));
  const keys = Array.isArray(entry?.allowed_keys) ? entry.allowed_keys : [];
  const base = [
    { label: "id", value: "id" },
    { label: "type_id", value: "type_id" },
  ];
  const meta = keys
    .slice()
    .sort()
    .map((key) => ({ label: `metadata.${key}`, value: `metadata.${key}` }));
  return [...base, ...meta];
}

function detectContradictions(clauses) {
  const tracker = new Map();
  for (const clause of clauses) {
    if (!clause || typeof clause !== "object") continue;
    if (!["==", "!="].includes(clause.op)) continue;
    if (clause.value && typeof clause.value === "object" && "ref" in clause.value) continue;
    const key = clause.field;
    if (!key) continue;
    const entry = tracker.get(key) || { eq: null, ne: new Set() };
    const valueKey = JSON.stringify(clause.value);
    if (clause.op === "==") {
      if (entry.eq && entry.eq !== valueKey) {
        return `Contradiction: ${key} has multiple == values.`;
      }
      if (entry.ne.has(valueKey)) {
        return `Contradiction: ${key} has both == and != for the same value.`;
      }
      entry.eq = valueKey;
    } else if (clause.op === "!=") {
      if (entry.eq && entry.eq === valueKey) {
        return `Contradiction: ${key} has both == and != for the same value.`;
      }
      entry.ne.add(valueKey);
    }
    tracker.set(key, entry);
  }
  return "";
}

function formatWizardParserError(message, { isPair, typeAName, typeBName }) {
  const text = String(message || "").trim();
  if (!text) return "AI parsing failed. Try a simpler sentence.";
  if (text.includes("both fields belong to Resource A")) {
    return `The AI used two ${typeAName || "Resource A"} fields in the same comparison. For this rule, write one field from ${typeAName || "A"} and one from ${typeBName || "B"}.`;
  }
  if (text.includes("both fields belong to Resource B")) {
    return `The AI used two ${typeBName || "Resource B"} fields in the same comparison. For this rule, write one field from ${typeAName || "A"} and one from ${typeBName || "B"}.`;
  }
  if (isPair && (text.includes("Resource A") || text.includes("Resource B"))) {
    return `${text}. Try wording it like: "${typeAName || "Resource A"} capacity is smaller than ${typeBName || "Resource B"} students number".`;
  }
  return text;
}

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [resources, setResources] = useState([]);
  const [schemaTypes, setSchemaTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsModal, setDetailsModal] = useState({ open: false, rule: null });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardError, setWizardError] = useState("");
  const [wizardQuestions, setWizardQuestions] = useState([]);
  const [wizardAnswers, setWizardAnswers] = useState({});
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardChatInput, setWizardChatInput] = useState("");
  const [wizardChatReplies, setWizardChatReplies] = useState({});
  const [showSimpleBuilder, setShowSimpleBuilder] = useState(false);
  const config = getOrgConfig();
  const theme = config.theme;
  const isCinema = config.domain === "cinema";

  const [mode, setMode] = useState("single"); // single | pair
  const [form, setForm] = useState({
    name: "",
    description: "",
    aMode: "resource", // resource | type
    resourceAId: "",
    typeAId: "",
    fieldA: "",
    op: "<",
    constValue: "",
    effect: "forbid", // forbid | alert | score
    scoreDelta: 10,
    is_active: true,
    comparisons: [{ ...EMPTY_COMPARISON }],
  });

  const createEmptyWizard = () => ({
    actionEffect: "forbid",
    target: "single",
    scopeAMode: "type",
    scopeBMode: "type",
    resourceAId: "",
    resourceBId: "",
    typeAId: "",
    typeBId: "",
    extraScopes: [],
    conditions: [createEmptyWizardCondition("c1")],
    conditionSentence: "",
    lastAppliedSentence: "",
    name: "",
    description: "",
    is_active: true,
    sort_order: 0,
    weight: 0,
    scoreValue: 10,
  });

  const [wizard, setWizard] = useState(createEmptyWizard);

  useEffect(() => {
    (async () => {
      try {
        const [rulesData, resourcesData, schemaData] = await Promise.all([
          apiGet("/rules"),
          apiGet("/resources"),
          apiGet("/schema/resource-types"),
        ]);
        setRules(Array.isArray(rulesData) ? rulesData : []);
        setResources(Array.isArray(resourcesData) ? resourcesData : []);
        setSchemaTypes(Array.isArray(schemaData) ? schemaData : []);
      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function reloadRules() {
    const data = await apiGet("/rules");
    setRules(Array.isArray(data) ? data : []);
  }

  const resourceOptions = useMemo(
    () => resources.slice().sort((a, b) => Number(a.id) - Number(b.id)),
    [resources]
  );

  const resourceNameById = useMemo(() => {
    const map = new Map();
    for (const r of resources) {
      if (!r?.id || !r?.name) continue;
      map.set(String(r.id), r.name);
      map.set(Number(r.id), r.name);
    }
    return map;
  }, [resources]);

  const typeOptions = useMemo(() => {
    const pairs = resources
      .map((r) => ({ type_id: r.type_id, type_name: r.type_name }))
      .filter((x) => x.type_id && x.type_name);

    const ids = uniq(pairs.map((p) => p.type_id));
    return ids
      .map((id) => pairs.find((p) => p.type_id === id))
      .filter(Boolean)
      .sort((a, b) => Number(a.type_id) - Number(b.type_id));
  }, [resources]);

  const resourceA = useMemo(
    () => resources.find((r) => String(r.id) === String(form.resourceAId)) ?? null,
    [resources, form.resourceAId]
  );

  const typeNameById = useMemo(() => {
    const map = new Map();
    for (const r of resources) {
      if (r?.type_id && r?.type_name) {
        map.set(Number(r.type_id), r.type_name);
      }
    }
    return map;
  }, [resources]);

  const schemaTypeById = useMemo(() => getTypeSchemaById(schemaTypes), [schemaTypes]);
  const wizardTypeCatalog = useMemo(
    () =>
      schemaTypes.map((type) => ({
        kind: "type",
        id: String(type.type_id),
        ids: [type.type_id],
        label: `${type.name} (type ${type.type_id})`,
        searchTerms: uniqueWizardTerms([type.name, type.type_id]),
      })),
    [schemaTypes]
  );
  const wizardResourceCatalog = useMemo(
    () =>
      resourceOptions.map((resource) => ({
        kind: "resource",
        id: String(resource.id),
        ids: [resource.id],
        label: `${resource.name} (id ${resource.id}${resource.type_name ? `, ${resource.type_name}` : ""})`,
        searchTerms: uniqueWizardTerms([resource.name, resource.id, resource.type_name]),
      })),
    [resourceOptions]
  );

  function getTypeFieldOptions(typeId) {
    if (!typeId) return [];
    const list = resources.filter((r) => String(r.type_id) === String(typeId));
    const keys = uniq(list.flatMap((r) => Object.keys(r.metadata || {}))).sort();
    return keys.map((k) => ({ label: `metadata.${k}`, value: `metadata.${k}` }));
  }

  function resetWizard() {
    setWizard(createEmptyWizard());
    setWizardStep(1);
    setWizardError("");
    setWizardChatInput("");
    setWizardChatReplies({});
    setWizardQuestions([]);
    setWizardAnswers({});
  }

  function openWizard() {
    resetWizard();
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
  }

  useEffect(() => {
    if (wizardStep === 3 || wizardStep === 4) {
      setWizardChatInput("");
    }
  }, [wizardStep]);

  function updateWizard(patch) {
    setWizard((prev) => {
      const next = { ...prev, ...patch };
      if ("target" in patch && patch.target !== prev.target) {
        next.lastAppliedSentence = "";
      }
      if ("conditionSentence" in patch && patch.conditionSentence !== prev.conditionSentence) {
        next.lastAppliedSentence = "";
      }
      if ("scopeAMode" in patch && patch.scopeAMode !== prev.scopeAMode) {
        next.resourceAId = "";
        next.typeAId = "";
        next.lastAppliedSentence = "";
      }
      if ("scopeBMode" in patch && patch.scopeBMode !== prev.scopeBMode) {
        next.resourceBId = "";
        next.typeBId = "";
        next.lastAppliedSentence = "";
      }
      if ("resourceAId" in patch && patch.resourceAId !== prev.resourceAId) {
        const selected = resources.find((r) => String(r.id) === String(patch.resourceAId));
        next.typeAId = selected?.type_id ? String(selected.type_id) : "";
        next.lastAppliedSentence = "";
      }
      if ("resourceBId" in patch && patch.resourceBId !== prev.resourceBId) {
        const selected = resources.find((r) => String(r.id) === String(patch.resourceBId));
        next.typeBId = selected?.type_id ? String(selected.type_id) : "";
        next.lastAppliedSentence = "";
      }
      if ("typeAId" in patch && patch.typeAId !== prev.typeAId) {
        next.lastAppliedSentence = "";
      }
      if ("typeBId" in patch && patch.typeBId !== prev.typeBId) {
        next.lastAppliedSentence = "";
      }
      if (next.target === "single") {
        next.scopeBMode = "type";
        next.resourceBId = "";
        next.typeBId = "";
        next.extraScopes = [];
        next.conditions = next.conditions.map((c) => ({
          ...c,
          side: "A",
          resourceId: "A",
          compare: "value",
          refField: "",
          refResourceId: "",
        }));
      } else if (next.target === "pair") {
        next.extraScopes = [];
        next.conditions = next.conditions.map((c) => ({
          ...c,
          resourceId: c.resourceId || (c.side === "B" ? "B" : "A"),
          refResourceId: c.compare === "field" ? c.refResourceId || (c.side === "B" ? "A" : "B") : "",
        }));
      } else if (next.target === "multi") {
        if (!Array.isArray(next.extraScopes) || !next.extraScopes.length) {
          next.extraScopes = [createEmptyWizardExtraScope()];
        }
        next.conditions = next.conditions.map((c) => ({
          ...c,
          resourceId: c.resourceId || "A",
          refResourceId: c.compare === "field" ? c.refResourceId || "B" : "",
        }));
      }
      return next;
    });
  }

  function updateWizardCondition(idx, patch) {
    setWizard((prev) => {
      const next = { ...prev, conditions: [...prev.conditions] };
      next.conditions[idx] = { ...next.conditions[idx], ...patch };
      if (next.target === "single") {
        next.conditions[idx].side = "A";
        next.conditions[idx].resourceId = "A";
        next.conditions[idx].compare = "value";
        next.conditions[idx].refField = "";
        next.conditions[idx].refResourceId = "";
      }
      if (next.target !== "multi") {
        next.conditions[idx].resourceId = next.conditions[idx].side === "B" ? "B" : "A";
        next.conditions[idx].refResourceId =
          next.conditions[idx].compare === "field"
            ? next.conditions[idx].side === "B"
              ? "A"
              : "B"
            : "";
      }
      return next;
    });
  }

  function updateWizardExtraScope(scopeId, patch) {
    setWizard((prev) => ({
      ...prev,
      lastAppliedSentence: "",
      extraScopes: prev.extraScopes.map((scope) => {
        if (scope.id !== scopeId) return scope;
        const nextScope = { ...scope, ...patch };
        if ("scopeMode" in patch && patch.scopeMode !== scope.scopeMode) {
          nextScope.resourceId = "";
          nextScope.typeId = "";
        }
        if ("resourceId" in patch && patch.resourceId !== scope.resourceId) {
          const selected = resources.find((r) => String(r.id) === String(patch.resourceId));
          nextScope.typeId = selected?.type_id ? String(selected.type_id) : "";
        }
        return nextScope;
      }),
    }));
  }

  function addWizardExtraScope() {
    setWizard((prev) => ({
      ...prev,
      lastAppliedSentence: "",
      extraScopes: [...prev.extraScopes, createEmptyWizardExtraScope()],
    }));
  }

  function removeWizardExtraScope(scopeId) {
    setWizard((prev) => ({
      ...prev,
      lastAppliedSentence: "",
      extraScopes: prev.extraScopes.filter((scope) => scope.id !== scopeId),
    }));
  }

  function getWizardPrompt(step) {
    if (step === 1) {
      return "What should this rule do?";
    }
    if (step === 2) {
      return "Does this rule check one resource, compare Resource A to Resource B, or coordinate three or more resources?";
    }
    if (step === 3) {
      return "Choose Resource A, the main resource this rule is about.";
    }
    if (step === 4) {
      return wizard.target === "multi"
        ? "Choose the additional resources used together with Resource A."
        : "Choose Resource B, the second resource used for the comparison.";
    }
    if (step === 5) {
      return "Describe the condition in plain English, and I will turn it into rule logic.";
    }
    if (step === 6) {
      return "Set the rule details.";
    }
    if (step === 7) {
      return "Review the summary and create the rule.";
    }
    return "";
  }

  function setWizardReply(step, text) {
    setWizardChatReplies((prev) => ({ ...prev, [step]: text }));
  }

  function buildWizardActionReply(effect = wizard.actionEffect, scoreValue = wizard.scoreValue) {
    return effect === "score"
      ? `Soft rule: add score ${Number(scoreValue) || 0}.`
      : "Hard rule: block this situation.";
  }

  function buildWizardTargetReply(target = wizard.target) {
    if (target === "pair") {
      return "Compare two resources: A is the main resource, B is the other one.";
    }
    if (target === "multi") {
      return "Coordinate multiple resources: A is the main resource, plus Resource B and any extra resources.";
    }
    return "Check one resource only.";
  }

  function buildWizardScopeReply(side, mode, entry) {
    if (!entry) return "";
    return mode === "resource"
      ? `${side}: use the specific resource ${entry.label}.`
      : `${side}: use any resource of type ${entry.label}.`;
  }

  function buildWizardSettingsReply() {
    return `${wizard.name.trim() || "Unnamed rule"} · ${wizard.is_active ? "active" : "inactive"} · sort ${Number(wizard.sort_order) || 0}`;
  }

  function getDefaultWizardName() {
    const resourceLabel =
      wizard.scopeAMode === "resource"
        ? resourceNameById.get(String(wizard.resourceAId)) || "resource"
        : schemaTypeById.get(String(wizard.typeAId))?.name || "resource";
    return wizard.actionEffect === "score"
      ? `Prefer matching ${resourceLabel}`
      : `Block invalid ${resourceLabel}`;
  }

  function chooseWizardScope(side, entry) {
    if (!entry) return;
    const step = side === "A" ? 3 : 4;
    const mode = entry.kind === "resource" ? "resource" : "type";
    const patch =
      side === "A"
        ? mode === "resource"
          ? { scopeAMode: "resource", resourceAId: entry.id }
          : { scopeAMode: "type", typeAId: entry.id, resourceAId: "" }
        : mode === "resource"
        ? { scopeBMode: "resource", resourceBId: entry.id }
        : { scopeBMode: "type", typeBId: entry.id, resourceBId: "" };

    updateWizard(patch);
    setWizardReply(step, buildWizardScopeReply(side, mode, entry));
    setWizardError("");
    setWizardChatInput("");
    setWizardStep((current) => (current === step ? nextWizardStep(current) : current));
  }

  function completeStructuredWizardStep(step) {
    if (step === 1) {
      setWizardReply(1, buildWizardActionReply());
      setWizardError("");
      setWizardStep((current) => nextWizardStep(current));
      return true;
    }
    if (step === 2) {
      setWizardReply(2, buildWizardTargetReply());
      setWizardError("");
      setWizardStep((current) => nextWizardStep(current));
      return true;
    }
    if (step === 3) {
      const isType = wizard.scopeAMode === "type";
      const selectedEntry = isType
        ? wizardTypeCatalog.find((entry) => String(entry.id) === String(wizard.typeAId))
        : wizardResourceCatalog.find((entry) => String(entry.id) === String(wizard.resourceAId));
      if (!selectedEntry) {
        setWizardError(`Choose Resource A as ${isType ? "a type" : "a specific resource"} before continuing.`);
        return false;
      }
      setWizardReply(3, buildWizardScopeReply("A", isType ? "type" : "resource", selectedEntry));
      setWizardError("");
      setWizardStep((current) => nextWizardStep(current));
      return true;
    }
    if (step === 4) {
      if (wizard.target === "multi") {
        const hasResourceB = wizard.scopeBMode === "resource" ? !!wizard.resourceBId : !!wizard.typeBId;
        if (!hasResourceB) {
          setWizardError("Choose Resource B before continuing.");
          return false;
        }
        const selectedExtras = wizard.extraScopes.filter((scope) =>
          scope.scopeMode === "resource" ? scope.resourceId : scope.typeId
        );
        if (!selectedExtras.length) {
          setWizardError("Add at least one more resource for a multi-resource rule.");
          return false;
        }
        setWizardReply(4, `B plus ${selectedExtras.length} additional resource${selectedExtras.length === 1 ? "" : "s"} selected.`);
        setWizardError("");
        setWizardStep((current) => nextWizardStep(current));
        return true;
      }
      const isType = wizard.scopeBMode === "type";
      const selectedEntry = isType
        ? wizardTypeCatalog.find((entry) => String(entry.id) === String(wizard.typeBId))
        : wizardResourceCatalog.find((entry) => String(entry.id) === String(wizard.resourceBId));
      if (!selectedEntry) {
        setWizardError(`Choose Resource B as ${isType ? "a type" : "a specific resource"} before continuing.`);
        return false;
      }
      setWizardReply(4, buildWizardScopeReply("B", isType ? "type" : "resource", selectedEntry));
      setWizardError("");
      setWizardStep((current) => nextWizardStep(current));
      return true;
    }
    if (step === 6) {
      const err = validateWizardStep(6);
      if (err) {
        setWizardError(err);
        return false;
      }
      setWizardReply(6, buildWizardSettingsReply());
      setWizardError("");
      setWizardStep((current) => nextWizardStep(current));
      return true;
    }
    return false;
  }

  async function handleWizardContinue() {
    if ([1, 2, 3, 4, 6].includes(wizardStep)) {
      completeStructuredWizardStep(wizardStep);
      return;
    }

    if (wizardStep === 5) {
      const err = validateWizardStep(wizardStep);
      if (err) {
        setWizardError(err);
        return;
      }
      if (!String(wizard.name || "").trim()) {
        updateWizard({ name: getDefaultWizardName() });
      }
      setWizardError("");
      setWizardStep((current) => nextWizardStep(current));
    }
  }

  function buildWizardTranscript() {
    const rows = [];
    for (const step of [1, 2, 3, 4, 5, 6]) {
      if (step === 4 && wizard.target === "single") continue;
      if (step > wizardStep) continue;
      rows.push({ role: "assistant", text: getWizardPrompt(step), id: `prompt-${step}` });
      if (step === 5 && String(wizard.conditionSentence || "").trim()) {
        rows.push({ role: "user", text: wizard.conditionSentence, id: `reply-${step}` });
      } else if (wizardChatReplies[step]) {
        rows.push({ role: "user", text: wizardChatReplies[step], id: `reply-${step}` });
      }
    }
    if (wizardStep === 7) {
      rows.push({ role: "assistant", text: getWizardPrompt(7), id: "prompt-7" });
    }
    return rows;
  }

  function addWizardCondition() {
    setWizard((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        createEmptyWizardCondition(`c${prev.conditions.length + 1}`),
      ],
    }));
  }

  function removeWizardCondition(idx) {
    setWizard((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== idx),
    }));
  }

  async function applySentenceConditions() {
    const sentence = String(wizard.conditionSentence || "").trim();
    if (!sentence) {
      setWizardError("Please write a short condition sentence.");
      return;
    }
    if (wizard.scopeAMode === "resource" && !wizard.resourceAId) {
      setWizardError("Select Resource A first.");
      return;
    }
    if (!wizardFieldsA.length) {
      setWizardError("Select Resource A type and fields first.");
      return;
    }
    if ((wizard.target === "pair" || wizard.target === "multi") && !wizardFieldsB.length) {
      setWizardError("Select Resource B type and fields first.");
      return;
    }
    if (wizard.target === "multi") {
      const extraSelections = wizardSelectedResources.filter((resource) => resource.id !== "A" && resource.id !== "B");
      if (!extraSelections.length) {
        setWizardError("Add at least one more resource before generating a multi-resource rule.");
        return;
      }
      const missingFields = extraSelections.find((resource) => !resource.fields.length);
      if (missingFields) {
        setWizardError(`Select fields for ${missingFields.name} first.`);
        return;
      }
    }
    if (!wizardSelectedResources.length) {
      setWizardError("Select the rule resources first.");
      return;
    }
    setWizardError("");
    setWizardBusy(true);
    try {
      const payload = {
        sentence,
        target: wizard.target,
        resources: wizardSelectedResources.map((resource) => ({
          id: resource.id,
          name: resource.name,
          fields: resource.fields,
        })),
      };
      const data = await apiPost("/rules/wizard-llm", payload);
      if (data?.status === "clarify") {
        setWizardQuestions(Array.isArray(data.questions) ? data.questions : []);
        setWizardAnswers({});
        setWizard((prev) => ({ ...prev, lastAppliedSentence: "" }));
        setWizardError("");
        return;
      }
      const clauses = Array.isArray(data?.clauses) ? data.clauses : [];
      if (!clauses.length) {
        setWizardError("LLM did not return any clauses.");
        return;
      }
      setWizardQuestions([]);
      setWizard((prev) => ({
        ...prev,
        lastAppliedSentence: sentence,
        conditions: clauses.map((c, idx) => ({
          id: `c${idx + 1}`,
          side: c.side || "A",
          resourceId: c.resourceId || (c.side === "B" ? "B" : "A"),
          field: c.field,
          op: c.op,
          compare: c.compare,
          value:
            typeof c.value === "string"
              ? c.value
              : c.value === null || typeof c.value === "undefined"
              ? ""
              : JSON.stringify(c.value),
          refField: c.refField ?? "",
          refResourceId: c.refResourceId || (c.compare === "field" ? (c.side === "B" ? "A" : "B") : ""),
        })),
      }));
    } catch (err) {
      console.error("LLM parse failed:", err);
      setWizard((prev) => ({ ...prev, lastAppliedSentence: "" }));
      setWizardError(
        formatWizardParserError(err?.data?.error || err.message || "LLM parse failed", {
          isPair: wizard.target === "pair",
          typeAName: schemaTypeById.get(String(wizard.typeAId))?.name || "Resource A",
          typeBName: schemaTypeById.get(String(wizard.typeBId))?.name || "Resource B",
        })
      );
    } finally {
      setWizardBusy(false);
    }
  }

  async function submitClarifications() {
    const missing = wizardQuestions.find((q) => !String(wizardAnswers[q] || "").trim());
    if (missing) {
      setWizardError("Please answer all questions before continuing.");
      return;
    }
    const qaText = wizardQuestions
      .map((q) => `Q: ${q} A: ${wizardAnswers[q]}`)
      .join(" | ");
    updateWizard({ conditionSentence: `${wizard.conditionSentence}\n\nAnswers: ${qaText}` });
    setWizardQuestions([]);
    await applySentenceConditions();
  }

  function buildWizardClauses() {
    if (wizard.target === "multi") {
      return wizard.conditions
        .map((c) => {
          const selectedResource = wizardSelectedResourceMap.get(String(c.resourceId));
          if (!selectedResource?.typeId || !c.field) return null;
          const field = buildFieldPath(selectedResource.typeId, c.field);
          if (!field) return null;
          if (c.compare === "field") {
            const refResource = wizardSelectedResourceMap.get(String(c.refResourceId));
            const ref = refResource?.typeId ? buildFieldPath(refResource.typeId, c.refField) : "";
            if (!ref) return null;
            return { field, op: c.op, value: { ref } };
          }
          return { field, op: c.op, value: parseInputValue(c.value, c.op) };
        })
        .filter(Boolean);
    }

    return wizard.conditions
      .map((c) => {
        const resourceId = c.resourceId || (c.side === "B" ? "B" : "A");
        const refResourceId =
          c.refResourceId || (c.side === "B" ? "A" : "B");
        const isSideB = resourceId === "B";
        const field = isSideB
          ? buildFieldPath(wizard.typeBId, c.field)
          : buildResourceFieldPath(c.field);
        if (!field) return null;
        if (c.compare === "field") {
          const ref = refResourceId === "B"
            ? buildFieldPath(wizard.typeBId, c.refField)
            : buildResourceFieldPath(c.refField);
          if (!ref) return null;
          return { field, op: c.op, value: { ref } };
        }
        return { field, op: c.op, value: parseInputValue(c.value, c.op) };
      })
      .filter(Boolean);
  }


  function validateWizardStep(step) {
    if (step >= 1 && !wizard.actionEffect) return "Choose an action type.";
    if (step >= 2 && !wizard.target) return "Choose a target.";
    if (step >= 3) {
      if (!wizard.scopeAMode) return "Choose whether the rule is for one resource or a whole type.";
      if (wizard.scopeAMode === "resource" && !wizard.resourceAId) return "Choose Resource A.";
      if (!wizard.typeAId) return "Choose Resource A type.";
    }
    if (step >= 4 && (wizard.target === "pair" || wizard.target === "multi")) {
      if (!wizard.scopeBMode) return "Choose whether Resource B is one resource or a whole type.";
      if (wizard.scopeBMode === "resource" && !wizard.resourceBId) return "Choose Resource B.";
      if (!wizard.typeBId) return "Choose Resource B type.";
      if (wizard.target === "multi") {
        const selectedExtras = wizard.extraScopes.filter((scope) =>
          scope.scopeMode === "resource" ? scope.resourceId : scope.typeId
        );
        if (!selectedExtras.length) return "Add at least one more resource for a multi-resource rule.";
        const missingType = selectedExtras.find((scope) => scope.scopeMode === "resource" ? !scope.resourceId : !scope.typeId);
        if (missingType) return "Complete each additional resource selection.";
      }
    }
    if (step >= 5) {
      const sentence = String(wizard.conditionSentence || "").trim();
      if (sentence && sentence !== String(wizard.lastAppliedSentence || "").trim()) {
        return "Run the AI condition parser successfully before creating the rule.";
      }
      if (!wizard.conditions.length) return "Add at least one condition.";
      for (const [idx, c] of wizard.conditions.entries()) {
        if (!c.field) return `Choose a field for condition ${idx + 1}.`;
        if (!c.op) return `Choose an operator for condition ${idx + 1}.`;
        if (wizard.target === "multi") {
          if (!c.resourceId) return `Choose a resource for condition ${idx + 1}.`;
          if (c.compare === "field") {
            if (!c.refResourceId) return `Choose a reference resource for condition ${idx + 1}.`;
            if (!c.refField) return `Choose a reference field for condition ${idx + 1}.`;
          } else {
            const isEmptyValue =
              c.value === "" || c.value === null || typeof c.value === "undefined";
            if (c.op === "in" && isEmptyValue) {
              return `Enter comma-separated values for condition ${idx + 1}.`;
            }
            if (c.op !== "in" && isEmptyValue) {
              return `Enter a value for condition ${idx + 1}.`;
            }
          }
        } else if (wizard.target === "pair" && c.compare === "field") {
          if (!wizard.typeBId) return "Choose Resource B type.";
          if (!c.refField) return `Choose a reference field for condition ${idx + 1}.`;
        } else {
          const isEmptyValue =
            c.value === "" || c.value === null || typeof c.value === "undefined";
          if (c.op === "in" && isEmptyValue) {
            return `Enter comma-separated values for condition ${idx + 1}.`;
          }
          if (c.op !== "in" && isEmptyValue) {
            return `Enter a value for condition ${idx + 1}.`;
          }
        }
      }
      const contradiction = detectContradictions(buildWizardClauses());
      if (contradiction) return contradiction;
    }
    if (step >= 6) {
      if (!wizard.name.trim()) return "Rule name is required.";
      if (!Number.isFinite(Number(wizard.sort_order))) return "Sort order must be a number.";
      if (!Number.isFinite(Number(wizard.weight))) return "Weight must be a number.";
      if (wizard.actionEffect === "score" && !Number.isFinite(Number(wizard.scoreValue))) {
        return "Score value must be a number.";
      }
    }
    return "";
  }

  function nextWizardStep(current) {
    if (wizard.target === "single" && current === 3) return 5;
    return Math.min(7, current + 1);
  }

  function prevWizardStep(current) {
    if (wizard.target === "single" && current === 5) return 3;
    return Math.max(1, current - 1);
  }

  function buildWizardPayload() {
    const clauses = buildWizardClauses();
    if (wizard.target === "multi") {
      const selectedResources = wizardSelectedResources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        fields: resource.fields,
      }));
      const scopeClauses = wizardSelectedResources
        .filter((resource) => resource.scopeMode === "resource" && resource.resourceId && resource.typeId)
        .map((resource) => ({
          field: `resources_by_type_id.${resource.typeId}.id`,
          op: "==",
          value: Number(resource.resourceId),
        }));
      const condition = {
        resources: selectedResources,
        logic: { all: [...scopeClauses, ...clauses] },
      };
      const action =
        wizard.actionEffect === "score"
          ? { effect: "score", value: Number(wizard.scoreValue) || 0 }
          : { effect: "forbid" };

      return {
        name: wizard.name.trim(),
        description: wizard.description ?? "",
        target_type: "multi",
        is_hard: wizard.actionEffect === "forbid",
        is_active: !!wizard.is_active,
        weight: wizard.actionEffect === "forbid" ? 0 : Number(wizard.weight) || 0,
        sort_order: Number(wizard.sort_order) || 0,
        condition,
        action,
      };
    }

    const scopeClauseA =
      wizard.scopeAMode === "resource" && wizard.resourceAId
        ? { field: "resource.id", op: "==", value: Number(wizard.resourceAId) }
        : wizard.typeAId
        ? { field: "resource.type_id", op: "==", value: Number(wizard.typeAId) }
        : null;
    const scopeClauseB =
      wizard.target === "pair" && wizard.scopeBMode === "resource" && wizard.resourceBId && wizard.typeBId
        ? {
            field: `resources_by_type_id.${wizard.typeBId}.id`,
            op: "==",
            value: Number(wizard.resourceBId),
          }
        : null;
    const scopedClauses = [scopeClauseA, scopeClauseB, ...clauses].filter(Boolean);
    const condition = { all: scopedClauses };
    const action =
      wizard.actionEffect === "score"
        ? { effect: "score", value: Number(wizard.scoreValue) || 0 }
        : { effect: "forbid" };

    return {
      name: wizard.name.trim(),
      description: wizard.description ?? "",
      target_type: wizard.target === "pair" ? "pair" : "resource",
      is_hard: wizard.actionEffect === "forbid",
      is_active: !!wizard.is_active,
      weight: wizard.actionEffect === "forbid" ? 0 : Number(wizard.weight) || 0,
      sort_order: Number(wizard.sort_order) || 0,
      condition,
      action,
    };
  }

  function buildWizardSummary() {
    const actionText = wizard.actionEffect === "forbid" ? "Block" : `Score ${Number(wizard.scoreValue) || 0}`;
    const parts = buildWizardClauses().map((clause) => {
      if (!clause) return "";
      const fieldStr = String(clause.field || "");
      const leftMatch = fieldStr.match(/^resources_by_type_id\.(\d+)\.(.+)$/);
      const leftType = fieldStr.startsWith("resource.")
        ? describeWizardResourceById("A")
        : leftMatch
        ? wizardSelectedResources.find((resource) => String(resource.typeId) === String(leftMatch[1]))?.name || `Type ${leftMatch[1]}`
        : "Resource";
      const leftField = fieldStr.startsWith("resource.")
        ? fieldLabelFromField(fieldStr.replace(/^resource\./, ""))
        : leftMatch
        ? fieldLabelFromField(leftMatch[2])
        : fieldLabelFromField(fieldStr);
      if (clause.value && typeof clause.value === "object" && "ref" in clause.value) {
        const refStr = String(clause.value.ref || "");
        const refMatch = refStr.match(/^resources_by_type_id\.(\d+)\.(.+)$/);
        const refType = refStr.startsWith("resource.")
          ? describeWizardResourceById("A")
          : refMatch
          ? wizardSelectedResources.find((resource) => String(resource.typeId) === String(refMatch[1]))?.name || `Type ${refMatch[1]}`
          : "Resource";
        const refField = refStr.startsWith("resource.")
          ? fieldLabelFromField(refStr.replace(/^resource\./, ""))
          : refMatch
          ? fieldLabelFromField(refMatch[2])
          : fieldLabelFromField(refStr);
        return `${leftType}.${leftField} ${clause.op} ${refType}.${refField}`.trim();
      }
      return `${leftType}.${leftField} ${clause.op} ${JSON.stringify(clause.value)}`.trim();
    }).filter(Boolean);
    if (!parts.length) return `If ${describeWizardResourceById("A")} matches the conditions → ${actionText}.`;
    return `If ${parts.join(" AND ")} → ${actionText}.`;
  }

  async function createWizardRule() {
    const err = validateWizardStep(7);
    if (err) {
      setWizardError(err);
      return;
    }
    setWizardError("");
    setWizardBusy(true);
    try {
      const payload = buildWizardPayload();
      await apiPost("/rules", payload);
      await reloadRules();
      setWizardOpen(false);
      alert("Rule created.");
    } catch (err) {
      console.error("Error creating rule:", err);
      alert("Failed to create rule");
    } finally {
      setWizardBusy(false);
    }
  }

  const fieldsA = useMemo(() => {
    if (form.aMode === "type") return getFieldOptionsForType(schemaTypes, form.typeAId);
    return getResourceFieldOptions(resourceA);
  }, [form.aMode, form.typeAId, resourceA, schemaTypes]);

  const wizardFieldsA = useMemo(
    () =>
      wizard.scopeAMode === "resource"
        ? getResourceFieldOptions(
            resources.find((r) => String(r.id) === String(wizard.resourceAId)) ?? null
          )
        : getFieldOptionsForType(schemaTypes, wizard.typeAId),
    [resources, schemaTypes, wizard.resourceAId, wizard.scopeAMode, wizard.typeAId]
  );
  const wizardFieldsB = useMemo(
    () =>
      wizard.scopeBMode === "resource"
        ? getResourceFieldOptions(
            resources.find((r) => String(r.id) === String(wizard.resourceBId)) ?? null
          )
        : getFieldOptionsForType(schemaTypes, wizard.typeBId),
    [resources, schemaTypes, wizard.resourceBId, wizard.scopeBMode, wizard.typeBId]
  );

  function buildWizardResourceSelection({ id, scopeMode, resourceId, typeId, fallbackLabel }) {
    if (scopeMode === "resource") {
      const resource = resources.find((entry) => String(entry.id) === String(resourceId)) ?? null;
      if (!resource?.id || !resource?.type_id) return null;
      return {
        id,
        scopeMode,
        resourceId: String(resource.id),
        typeId: String(resource.type_id),
        name: resource.name || fallbackLabel,
        fields: getResourceFieldOptions(resource).map((field) => field.value),
      };
    }

    if (!typeId) return null;
    return {
      id,
      scopeMode,
      resourceId: "",
      typeId: String(typeId),
      name: schemaTypeById.get(String(typeId))?.name || fallbackLabel,
      fields: getFieldOptionsForType(schemaTypes, typeId).map((field) => field.value),
    };
  }

  const wizardSelectedResources = useMemo(() => {
    const selected = [];
    const resourceASelection = buildWizardResourceSelection({
      id: "A",
      scopeMode: wizard.scopeAMode,
      resourceId: wizard.resourceAId,
      typeId: wizard.typeAId,
      fallbackLabel: "Resource A",
    });
    if (resourceASelection) selected.push(resourceASelection);

    if (wizard.target === "pair" || wizard.target === "multi") {
      const resourceBSelection = buildWizardResourceSelection({
        id: "B",
        scopeMode: wizard.scopeBMode,
        resourceId: wizard.resourceBId,
        typeId: wizard.typeBId,
        fallbackLabel: "Resource B",
      });
      if (resourceBSelection) selected.push(resourceBSelection);
    }

    if (wizard.target === "multi") {
      wizard.extraScopes.forEach((scope, idx) => {
        const selection = buildWizardResourceSelection({
          id: `R${idx + 3}`,
          scopeMode: scope.scopeMode,
          resourceId: scope.resourceId,
          typeId: scope.typeId,
          fallbackLabel: `Resource ${idx + 3}`,
        });
        if (selection) selected.push(selection);
      });
    }

    return selected;
  }, [
    resources,
    schemaTypes,
    schemaTypeById,
    wizard.scopeAMode,
    wizard.resourceAId,
    wizard.typeAId,
    wizard.scopeBMode,
    wizard.resourceBId,
    wizard.typeBId,
    wizard.extraScopes,
    wizard.target,
  ]);

  const wizardSelectedResourceMap = useMemo(
    () => new Map(wizardSelectedResources.map((resource) => [resource.id, resource])),
    [wizardSelectedResources]
  );

  function getWizardFieldOptionsByResourceId(resourceId) {
    const resource = wizardSelectedResourceMap.get(String(resourceId));
    return Array.isArray(resource?.fields)
      ? resource.fields.map((field) => ({ label: field, value: field }))
      : [];
  }

  function describeWizardResourceById(resourceId) {
    return wizardSelectedResourceMap.get(String(resourceId))?.name || resourceId || "Resource";
  }

  const wizardSummary = buildWizardSummary();
  const wizardPayload = buildWizardPayload();
  const wizardTranscript = buildWizardTranscript();
  const wizardScopeASearchResults = getWizardSearchResults(
    wizardChatInput,
    wizard.scopeAMode === "type" ? wizardTypeCatalog : wizardResourceCatalog
  );
  const wizardScopeBSearchResults = getWizardSearchResults(
    wizardChatInput,
    wizard.scopeBMode === "type" ? wizardTypeCatalog : wizardResourceCatalog
  );
  const wizardSelectedAEntry =
    wizard.scopeAMode === "type"
      ? wizardTypeCatalog.find((entry) => String(entry.id) === String(wizard.typeAId))
      : wizardResourceCatalog.find((entry) => String(entry.id) === String(wizard.resourceAId));
  const wizardSelectedBEntry =
    wizard.scopeBMode === "type"
      ? wizardTypeCatalog.find((entry) => String(entry.id) === String(wizard.typeBId))
      : wizardResourceCatalog.find((entry) => String(entry.id) === String(wizard.resourceBId));

  function ensureDefaultFieldA(next) {
    const updated = { ...next };
    if (!updated.fieldA && fieldsA[0]) updated.fieldA = fieldsA[0].value;
    if (Array.isArray(updated.comparisons)) {
      updated.comparisons = updated.comparisons.map((c) => ({
        ...EMPTY_COMPARISON,
        ...c,
        rightMode: c.rightMode || "field",
        fieldA: c.fieldA || updated.fieldA || "",
      }));
    }
    return updated;
  }

  function updateForm(patch) {
    setForm((prev) => ensureDefaultFieldA({ ...prev, ...patch }));
  }

  function updateComparison(idx, patch) {
    setForm((prev) => {
      const next = { ...prev, comparisons: [...prev.comparisons] };
      next.comparisons[idx] = { ...next.comparisons[idx], ...patch };
      return ensureDefaultFieldA(next);
    });
  }

  function addComparison() {
    setForm((prev) => {
      const next = {
        ...prev,
        comparisons: [
          ...prev.comparisons,
          { ...EMPTY_COMPARISON, fieldA: prev.fieldA || "" },
        ],
      };
      return ensureDefaultFieldA(next);
    });
  }

  function removeComparison(idx) {
    setForm((prev) => ({
      ...prev,
      comparisons: prev.comparisons.filter((_, i) => i !== idx),
    }));
  }

  async function createRule() {
    if (!form.name.trim()) return alert("Name is required");
    if (form.aMode === "resource" && !form.resourceAId) return alert("Please choose Resource A.");
    if (form.aMode === "type" && !form.typeAId) return alert("Please choose Resource Type A.");

    let condition;
    let target_type = "resource";

    const aScopeClause =
      form.aMode === "type"
        ? { field: "resource.type_id", op: "==", value: Number(form.typeAId) }
        : { field: "resource.id", op: "==", value: Number(form.resourceAId) };

    if (mode === "single") {
      if (!form.fieldA) return alert("Please choose a field for Resource A.");
      if (String(form.constValue ?? "").trim() === "") return alert("Please enter a value.");
      condition = {
        all: [
          aScopeClause,
          {
            field: `resource.${form.fieldA}`,
            op: form.op,
            value: parseInputValue(form.constValue, form.op),
          },
        ],
      };
    } else {
      if (!form.comparisons.length) return alert("Add at least one comparison.");
      target_type = "pair";
      const clauses = [aScopeClause];

      for (const [idx, comp] of form.comparisons.entries()) {
        const usesFieldComparison = (comp.rightMode || "field") === "field";
        if (!comp.fieldA) {
          return alert(usesFieldComparison ? `Choose Field A for row ${idx + 1}` : `Choose a field for row ${idx + 1}`);
        }
        if (usesFieldComparison && !comp.fieldB) return alert(`Choose Field B for row ${idx + 1}`);
        if (!usesFieldComparison && String(comp.constValue ?? "").trim() === "") {
          return alert(`Enter a value for row ${idx + 1}`);
        }

        if (comp.bMode === "resource") {
          if (!comp.resourceBId) return alert(`Choose Resource B for row ${idx + 1}`);
          const resourceB = resources.find((r) => String(r.id) === String(comp.resourceBId));
          if (!resourceB?.type_id) return alert(`Resource B (row ${idx + 1}) is missing type.`);

          const typeIdB = Number(resourceB.type_id);
          clauses.push({
            field: `resources_by_type_id.${typeIdB}.id`,
            op: "==",
            value: Number(comp.resourceBId),
          });
          if (!usesFieldComparison) {
            clauses.push({
              field: `resources_by_type_id.${typeIdB}.${comp.fieldA}`,
              op: comp.op,
              value: parseInputValue(comp.constValue, comp.op),
            });
            continue;
          }
          clauses.push({
            field: `resource.${comp.fieldA}`,
            op: comp.op,
            value: { ref: `resources_by_type_id.${typeIdB}.${comp.fieldB}` },
          });
        } else if (usesFieldComparison) {
          if (!comp.typeBId) return alert(`Choose Resource Type for row ${idx + 1}`);
          const typeIdB = Number(comp.typeBId);
          clauses.push({
            field: `resource.${comp.fieldA}`,
            op: comp.op,
            value: { ref: `resources_by_type_id.${typeIdB}.${comp.fieldB}` },
          });
        } else {
          if (!comp.typeBId) return alert(`Choose Resource Type for row ${idx + 1}`);
          const typeIdB = Number(comp.typeBId);
          clauses.push({
            field: `resources_by_type_id.${typeIdB}.${comp.fieldA}`,
            op: comp.op,
            value: parseInputValue(comp.constValue, comp.op),
          });
        }
      }

      condition = { all: clauses };
    }

    let action;
    if (form.effect === "alert") action = { effect: "alert" };
    else if (form.effect === "score") action = { effect: "score", delta: Number(form.scoreDelta) || 0 };
    else action = { effect: "forbid" };

    const payload = {
      name: form.name.trim(),
      description: form.description ?? "",
      target_type,
      is_hard: form.effect === "forbid",
      is_active: !!form.is_active,
      weight: 0,
      sort_order: 0,
      condition,
      action,
    };

    try {
      await apiPost("/rules", payload);
      reloadRules();
      alert("Rule created.");
    } catch (err) {
      console.error("Error creating rule:", err);
      alert("Failed to create rule");
    }
  }

  async function deleteRule(id) {
    if (!confirm("Delete this rule?")) return;
    try {
      await apiDelete(`/rules/${id}`);
      reloadRules();
    } catch (err) {
      console.error("Error deleting rule:", err);
      alert("Delete failed");
    }
  }

  async function toggleActive(rule) {
    try {
      await apiPut(`/rules/${rule.id}`, {
        ...rule,
        is_active: !rule.is_active,
      });
      reloadRules();
    } catch (err) {
      console.error("Error updating rule:", err);
      alert("Update failed");
    }
  }

  function openDetails(rule) {
    setDetailsModal({ open: true, rule });
  }

  if (loading) return <p className="text-gray-500">Loading rules...</p>;

  const previewText = (() => {
    const aName =
      form.aMode === "type"
        ? typeOptions.find((t) => String(t.type_id) === String(form.typeAId))?.type_name || "Type A"
        : resourceNameById.get(String(form.resourceAId)) || "Resource A";
    const action =
      form.effect === "forbid"
        ? "Block"
        : form.effect === "alert"
        ? "Alert"
        : `Score ${Number(form.scoreDelta) || 0}`;

    if (mode === "single") {
      if (!form.fieldA || !form.op || form.constValue === "") {
        return `If ${aName} matches the condition → ${action}.`;
      }
      return `If ${aName}.${fieldLabel(form.fieldA)} ${form.op} ${form.constValue} → ${action}.`;
    }

    if (!form.comparisons.length) {
      return `If ${aName} matches the comparisons → ${action}.`;
    }
    const parts = form.comparisons.map((c) => {
      const left = fieldLabel(c.fieldA || form.fieldA);
      if ((c.rightMode || "field") === "value") {
        if (c.bMode === "type") {
          const typeLabel = typeOptions.find((t) => String(t.type_id) === String(c.typeBId))?.type_name || "Type";
          return `${typeLabel}.${left} ${c.op} ${c.constValue || "value"}`;
        }
        const bName = resourceNameById.get(String(c.resourceBId)) || "Resource";
        return `${bName}.${left} ${c.op} ${c.constValue || "value"}`;
      }
      if (c.bMode === "type") {
        const typeLabel = typeOptions.find((t) => String(t.type_id) === String(c.typeBId))?.type_name || "Type";
        return `${aName}.${left} ${c.op} ${typeLabel}.${fieldLabel(c.fieldB)}`;
      }
      const bName = resourceNameById.get(String(c.resourceBId)) || "Resource B";
      return `${aName}.${left} ${c.op} ${bName}.${fieldLabel(c.fieldB)}`;
    });
    return `If ${parts.join(" AND ")} → ${action}.`;
  })();
  const activeRulesCount = rules.filter((rule) => rule.is_active).length;
  const inactiveRulesCount = rules.length - activeRulesCount;

  return (
    <div className="rules-page space-y-6">
      <section className={`rules-hero rounded-[30px] border p-6 shadow-[0_24px_60px_rgba(2,6,23,0.35)] sm:p-8 ${theme.heroDark}`}>
        <div className="rules-hero__layout flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="rules-hero__copy max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
              Policy Center
            </div>
            <h1 className={`text-4xl font-black tracking-tight ${isCinema ? "text-white" : theme.textStrong}`}>Rules</h1>
            <p className={`mt-3 max-w-2xl text-base leading-7 ${theme.textSoft}`}>
              Shape platform behavior with intelligent policies, guided creation, and
              transparent rule previews.
            </p>
          </div>
          <button
            onClick={openWizard}
            className={`rules-wizard-button inline-flex h-fit items-center rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg transition ${theme.buttonPrimary}`}
          >
            Rule Wizard Chat
          </button>
        </div>

        <div className="rules-metrics mt-8 grid gap-3 sm:grid-cols-3">
          <div className={`rules-metric rules-metric--total rounded-2xl border px-4 py-3 ${theme.card}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Total Rules</div>
            <div className={`mt-2 text-3xl font-black ${theme.textStrong}`}>{rules.length}</div>
          </div>
          <div className={`rules-metric rules-metric--active rounded-2xl border px-4 py-3 ${theme.card}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Active Rules</div>
            <div className={`mt-2 text-3xl font-black ${theme.textStrong}`}>{activeRulesCount}</div>
          </div>
          <div className={`rules-metric rules-metric--inactive rounded-2xl border px-4 py-3 ${theme.card}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Inactive Rules</div>
            <div className={`mt-2 text-3xl font-black ${theme.textStrong}`}>{inactiveRulesCount}</div>
          </div>
        </div>
      </section>

      <section className={`rules-guidance rounded-[26px] border p-4 shadow-sm ${theme.panelSoft}`}>
        <div className="text-sm text-slate-700">
          Prefer guided setup? Use <span className={theme.textStrong}>Rule Wizard Chat</span> above.
        </div>
      </section>

      <section className={`rules-builder rounded-[26px] border p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)] ${theme.card}`}>
        <div className="flex items-center justify-between mb-2">
          <div className={`text-base font-semibold ${theme.textStrong}`}>Simple Rule Builder</div>
          <button
            onClick={() => setShowSimpleBuilder((prev) => !prev)}
            className={`rounded-xl border px-4 py-2 text-xs font-semibold ${theme.buttonGhost}`}
          >
            {showSimpleBuilder ? "Hide" : "Show"}
          </button>
        </div>
        <div className="mb-4 text-xs text-slate-500">
          Manual builder for power users. The Wizard is recommended for most cases.
        </div>
        {!showSimpleBuilder ? null : (
          <>
        <div className="flex flex-wrap gap-4 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === "single"}
              onChange={() => setMode("single")}
            />
            <span>Rule on a single resource</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === "pair"}
              onChange={() => setMode("pair")}
            />
            <span>Compare with multiple resources</span>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">A Source</label>
            <select
              className={`w-full p-2 border rounded ${theme.input}`}
              value={form.aMode}
              onChange={(e) => updateForm({ aMode: e.target.value, resourceAId: "", typeAId: "", fieldA: "" })}
            >
              <option value="resource">Specific resource</option>
              <option value="type">Resource type</option>
            </select>
            <div className={`text-xs mt-1 ${theme.textSoft}`}>Choose if A is a specific resource or any resource of a type.</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Resource A</label>
            {form.aMode === "type" ? (
              <select
                className={`w-full p-2 border rounded ${theme.input}`}
                value={form.typeAId}
                onChange={(e) => updateForm({ typeAId: e.target.value, fieldA: "" })}
              >
                <option value="">Choose type…</option>
                {typeOptions.map((t) => (
                  <option key={t.type_id} value={t.type_id}>
                    {t.type_name} (id={t.type_id})
                  </option>
                ))}
              </select>
            ) : (
              <select
                className={`w-full p-2 border rounded ${theme.input}`}
                value={form.resourceAId}
                onChange={(e) => updateForm({ resourceAId: e.target.value, fieldA: "" })}
              >
                <option value="">Choose resource…</option>
                {resourceOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (id={r.id})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Field (A)</label>
            <select
              className={`w-full p-2 border rounded ${theme.input}`}
              value={form.fieldA}
              onChange={(e) => updateForm({ fieldA: e.target.value })}
              disabled={form.aMode === "type" ? !form.typeAId : !form.resourceAId}
            >
              <option value="">Choose field…</option>
              {fieldsA.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {mode === "single" ? (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Operator</label>
              <select
                className={`w-full p-2 border rounded ${theme.input}`}
                value={form.op}
                onChange={(e) => updateForm({ op: e.target.value })}
              >
                {OP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Value</label>
              <input
                type="text"
                className={`w-full p-2 border rounded ${theme.input}`}
                value={form.constValue}
                onChange={(e) => updateForm({ constValue: e.target.value })}
                placeholder="50, true, text..."
              />
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <div className="text-sm font-medium mb-2">Comparisons</div>
            <div className="space-y-3">
              {form.comparisons.map((comp, idx) => {
                const resourceB = resources.find((r) => String(r.id) === String(comp.resourceBId)) ?? null;
                const fieldsB = comp.bMode === "type"
                  ? getTypeFieldOptions(comp.typeBId)
                  : getResourceFieldOptions(resourceB);
                const comparesToValue = (comp.rightMode || "field") === "value";
                const leftFieldOptions = comparesToValue ? fieldsB : fieldsA;
                return (
                  <div key={`comp-${idx}`} className="grid grid-cols-7 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium mb-1">B Source</label>
                      <select
                        className={`w-full p-2 border rounded ${theme.input}`}
                        value={comp.bMode}
                        onChange={(e) =>
                          updateComparison(idx, {
                            bMode: e.target.value,
                            resourceBId: "",
                            typeBId: "",
                            fieldB: "",
                            ...(comparesToValue ? { fieldA: "" } : {}),
                          })
                        }
                      >
                        <option value="resource">Specific resource</option>
                        <option value="type">Resource type</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Resource B</label>
                      {comp.bMode === "type" ? (
                        <select
                          className={`w-full p-2 border rounded ${theme.input}`}
                          value={comp.typeBId}
                          onChange={(e) =>
                            updateComparison(idx, {
                              typeBId: e.target.value,
                              fieldB: "",
                              ...(comparesToValue ? { fieldA: "" } : {}),
                            })
                          }
                        >
                          <option value="">Choose type…</option>
                          {typeOptions.map((t) => (
                            <option key={t.type_id} value={t.type_id}>
                              {t.type_name} (id={t.type_id})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          className={`w-full p-2 border rounded ${theme.input}`}
                          value={comp.resourceBId}
                          onChange={(e) =>
                            updateComparison(idx, {
                              resourceBId: e.target.value,
                              fieldB: "",
                              ...(comparesToValue ? { fieldA: "" } : {}),
                            })
                          }
                        >
                          <option value="">Choose resource…</option>
                          {resourceOptions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} (id={r.id})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">
                        {comparesToValue ? "Field" : "Field (A)"}
                      </label>
                      <select
                        className={`w-full p-2 border rounded ${theme.input}`}
                        value={comp.fieldA}
                        onChange={(e) => updateComparison(idx, { fieldA: e.target.value })}
                        disabled={
                          comparesToValue
                            ? comp.bMode === "type"
                              ? !comp.typeBId
                              : !comp.resourceBId
                            : form.aMode === "type"
                            ? !form.typeAId
                            : !form.resourceAId
                        }
                      >
                        <option value="">Choose field…</option>
                        {leftFieldOptions.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Operator</label>
                      <select
                        className={`w-full p-2 border rounded ${theme.input}`}
                        value={comp.op}
                        onChange={(e) => updateComparison(idx, { op: e.target.value })}
                      >
                        {OP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Compare to</label>
                      <select
                        className={`w-full p-2 border rounded ${theme.input}`}
                        value={comp.rightMode || "field"}
                        onChange={(e) =>
                          updateComparison(idx, {
                            rightMode: e.target.value,
                            fieldA: "",
                            fieldB: "",
                            constValue: "",
                          })
                        }
                      >
                        <option value="field">Field</option>
                        <option value="value">Value</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">
                        {(comp.rightMode || "field") === "value" ? "Value" : "Field (B)"}
                      </label>
                      {(comp.rightMode || "field") === "value" ? (
                        <input
                          type="text"
                          className={`w-full p-2 border rounded ${theme.input}`}
                          value={comp.constValue || ""}
                          onChange={(e) => updateComparison(idx, { constValue: e.target.value })}
                          placeholder="true, 20, text..."
                        />
                      ) : (
                        <select
                          className={`w-full p-2 border rounded ${theme.input}`}
                          value={comp.fieldB}
                          onChange={(e) => updateComparison(idx, { fieldB: e.target.value })}
                          disabled={comp.bMode === "type" ? !comp.typeBId : !comp.resourceBId}
                        >
                        <option value="">Choose field…</option>
                        {fieldsB.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                        </select>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeComparison(idx)}
                      className={`px-3 py-2 rounded-xl ${theme.buttonDanger}`}
                      disabled={form.comparisons.length === 1}
                    >
                      Remove
                    </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={addComparison}
              className={`mt-3 px-3 py-2 border rounded ${theme.buttonGhost}`}
            >
              + Add Resource
            </button>
            <div className={`text-xs mt-1 ${theme.textSoft}`}>
              Tip: choose "Resource type" to apply the rule to any resource of that type.
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Rule Name</label>
            <input
              type="text"
              className={`w-full p-2 border rounded ${theme.input}`}
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              className={`w-full p-2 border rounded ${theme.input}`}
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-6 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => updateForm({ is_active: e.target.checked })}
            />
            <span className="text-sm">Active</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={form.effect === "forbid"}
              onChange={() => updateForm({ effect: "forbid" })}
            />
            <span className="text-sm">Block</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={form.effect === "alert"}
              onChange={() => updateForm({ effect: "alert" })}
            />
            <span className="text-sm">Alert</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={form.effect === "score"}
              onChange={() => updateForm({ effect: "score" })}
            />
            <span className="text-sm">Score</span>
          </label>

          {form.effect === "score" && (
            <input
              type="number"
              className={`w-24 p-2 border rounded ${theme.input}`}
              value={form.scoreDelta}
              onChange={(e) => updateForm({ scoreDelta: e.target.value })}
            />
          )}
        </div>

        <button
          onClick={createRule}
          className={`px-4 py-2 rounded-xl ${theme.buttonPrimary}`}
        >
          Create Rule
        </button>

        <div className={`mt-3 text-sm border rounded p-3 ${theme.modalSurface} ${theme.textSoft}`}>
          Preview: {previewText}
        </div>

        <div className={`text-xs mt-2 ${theme.textSoft}`}>
          Note: when using "Resource type", the comparison uses the first matching resource of that type
          in the booking.
        </div>
          </>
        )}
      </section>

      <section className={`rules-list-panel rounded-[26px] border p-4 shadow-[0_14px_35px_rgba(15,23,42,0.06)] sm:p-6 ${theme.card}`}>
        <div className="mb-4">
          <div className={`text-lg font-bold ${theme.textStrong}`}>Current Rules</div>
          <div className="mt-1 text-sm text-slate-500">
            Active rules are shown as live policies with readable conditions and direct actions.
          </div>
        </div>

        <div className="rules-list grid gap-4">
          {rules.map((rule) => (
            <article
              key={rule.id}
              className={`rules-card rounded-[22px] border p-5 shadow-sm transition hover:shadow-md ${theme.card}`}
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${theme.tagMuted}`}>
                      Rule #{rule.id}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${theme.tag}`}>
                      {rule.target_type}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${rule.is_active ? theme.highlightTag : theme.tagMuted}`}
                    >
                      {rule.is_active ? "Active" : "Disabled"}
                    </span>
                  </div>

                  <h2 className={`mt-4 text-2xl font-bold ${theme.textStrong}`}>{rule.name}</h2>

                  <div className={`mt-4 rounded-2xl border p-4 ${theme.modalSurface}`}>
                    <div className={`mb-2 text-xs font-semibold uppercase tracking-[0.16em] ${theme.modalMuted}`}>
                      Condition
                    </div>
                    <div className={`text-sm leading-7 ${theme.textSoft}`}>
                      {formatCondition(rule.condition, typeNameById, resourceNameById) || "-"}
                    </div>
                  </div>
                </div>

                <div className="rules-card__actions flex flex-wrap items-center gap-2 whitespace-nowrap">
                  <button
                    onClick={() => openDetails(rule)}
                    className={`rules-card__view-button rounded-xl px-4 py-2 text-sm font-semibold transition ${theme.buttonNeutral}`}
                  >
                    View
                  </button>
                  <button
                    onClick={() => toggleActive(rule)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${theme.buttonGhost}`}
                  >
                    {rule.is_active ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${theme.buttonDanger}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}

          {rules.length === 0 && (
            <div className={`rounded-[22px] border border-dashed px-4 py-14 text-center ${theme.modalSurface} ${theme.textSoft}`}>
              No rules defined yet.
            </div>
          )}
        </div>
      </section>

      {wizardOpen && (
        <div className="rules-wizard-overlay fixed inset-0 z-50 bg-black/40 flex justify-center items-center">
          <div
            className={`rules-wizard-modal p-6 rounded-2xl w-[900px] shadow-2xl max-h-[90vh] overflow-y-auto ${theme.modalSurface}`}
            style={{ "--wizard-progress": `${Math.round((wizardStep / 7) * 100)}%` }}
          >
            <div className="rules-wizard-modal__header flex items-center justify-between mb-4">
              <div>
                <h2 className={`rules-wizard-modal__title text-xl font-bold ${theme.textStrong}`}>Rule Wizard Chat</h2>
                <div className={`rules-wizard-modal__step text-xs ${theme.textSoft}`}>Step {wizardStep} of 7</div>
              </div>
              <button onClick={closeWizard} className={`rules-wizard-modal__close px-3 py-2 border rounded ${theme.buttonGhost}`}>
                Close
              </button>
            </div>

            <div className="rules-wizard-chat space-y-4 mb-6">
              {wizardTranscript.map((item) => (
                <div
                  key={item.id}
                  className={`rules-wizard-chat__row rules-wizard-chat__row--${item.role} flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rules-wizard-chat__bubble rules-wizard-chat__bubble--${item.role} px-4 py-3 rounded-2xl text-sm max-w-[75%] ${
                      item.role === "user" ? theme.buttonPrimary : theme.panelSoft
                    }`}
                  >
                    {item.text}
                  </div>
                </div>
              ))}
              {wizardStep > 1 && (
                <div className="rules-wizard-chat__row rules-wizard-chat__row--user flex justify-end">
                  <div className={`rules-wizard-chat__bubble rules-wizard-chat__bubble--user px-4 py-3 rounded-2xl text-sm max-w-[75%] ${theme.buttonPrimary}`}>
                    {wizardSummary}
                  </div>
                </div>
              )}
            </div>

            {wizardStep === 1 && (
              <div className="flex justify-end">
                <div className={`rules-wizard-step-card border rounded-2xl p-4 w-full max-w-[75%] space-y-3 ${theme.card}`}>
                  <div className={`text-xs ${theme.textSoft}`}>
                    Start with the rule effect. Most admin rules should use <strong>Block</strong>.
                  </div>
                  <div className="rules-wizard-choice-grid">
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.actionEffect === "forbid" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => updateWizard({ actionEffect: "forbid", weight: 0 })}
                    >
                      <span className="rules-wizard-choice__title">Block</span>
                      <span className="rules-wizard-choice__meta">Stop invalid bookings completely.</span>
                    </button>
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.actionEffect === "score" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => updateWizard({ actionEffect: "score" })}
                    >
                      <span className="rules-wizard-choice__title">Score</span>
                      <span className="rules-wizard-choice__meta">Soft preference, adds points instead of blocking.</span>
                    </button>
                  </div>
                  {wizard.actionEffect === "score" && (
                    <div className="rules-wizard-inline-fields">
                      <label className="rules-wizard-field">
                        <span className={`text-xs ${theme.textSoft}`}>Score value</span>
                        <input
                          type="number"
                          className={`w-full p-3 border rounded text-sm ${theme.input}`}
                          value={wizard.scoreValue}
                          onChange={(e) => updateWizard({ scoreValue: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="flex justify-end">
                <div className={`rules-wizard-step-card border rounded-2xl p-4 w-full max-w-[75%] space-y-3 ${theme.card}`}>
                  <div className={`text-xs ${theme.textSoft}`}>
                    Choose <strong>Single resource</strong> when the rule checks one room/course by its own fields, like capacity or equipment.
                  </div>
                  <div className="rules-wizard-choice-grid">
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.target === "single" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => {
                        updateWizard({ target: "single" });
                        setWizardReply(2, buildWizardTargetReply("single"));
                        setWizardError("");
                        setWizardStep((current) => (current === 2 ? nextWizardStep(current) : current));
                      }}
                    >
                      <span className="rules-wizard-choice__title">Single resource</span>
                      <span className="rules-wizard-choice__meta">Example: block a classroom when its capacity is too small.</span>
                    </button>
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.target === "pair" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => {
                        updateWizard({ target: "pair" });
                        setWizardReply(2, buildWizardTargetReply("pair"));
                        setWizardError("");
                        setWizardStep((current) => (current === 2 ? nextWizardStep(current) : current));
                      }}
                    >
                      <span className="rules-wizard-choice__title">Compare two resources</span>
                      <span className="rules-wizard-choice__meta">Use this only when A must be compared to another resource B.</span>
                    </button>
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.target === "multi" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => {
                        updateWizard({ target: "multi" });
                        setWizardReply(2, buildWizardTargetReply("multi"));
                        setWizardError("");
                        setWizardStep((current) => (current === 2 ? nextWizardStep(current) : current));
                      }}
                    >
                      <span className="rules-wizard-choice__title">Compare 3+ resources</span>
                      <span className="rules-wizard-choice__meta">Use this for rules like lecturer + course + room or student + course + lecturer + class.</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="flex justify-end">
                <div className={`rules-wizard-step-card border rounded-2xl p-4 w-full max-w-[75%] space-y-3 ${theme.card}`}>
                  <div className={`text-xs ${theme.textSoft}`}>
                    Resource A is the main resource the rule is about.
                  </div>
                  <div className="rules-wizard-choice-grid">
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.scopeAMode === "type" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => {
                        updateWizard({ scopeAMode: "type", typeAId: "", resourceAId: "" });
                        setWizardChatInput("");
                      }}
                    >
                      <span className="rules-wizard-choice__title">Any resource of a type</span>
                      <span className="rules-wizard-choice__meta">Best for rules like "all classrooms" or "all courses".</span>
                    </button>
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.scopeAMode === "resource" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => {
                        updateWizard({ scopeAMode: "resource", resourceAId: "" });
                        setWizardChatInput("");
                      }}
                    >
                      <span className="rules-wizard-choice__title">One specific resource</span>
                      <span className="rules-wizard-choice__meta">Pick an exact room or course from the list.</span>
                    </button>
                  </div>
                  <div className="rules-wizard-picker">
                    <div className={`text-xs ${theme.textSoft}`}>
                      Search {wizard.scopeAMode === "type" ? "resource types" : "resources"} and click one result.
                    </div>
                    <input
                      className={`w-full p-3 border rounded text-sm ${theme.input}`}
                      placeholder={wizard.scopeAMode === "type" ? "Search type: classroom, courses..." : "Search resource: Classroom 201, Intro to AI..."}
                      value={wizardChatInput}
                      onChange={(e) => setWizardChatInput(e.target.value)}
                    />
                    <div className="rules-wizard-picker__list">
                      {wizardScopeASearchResults.map((entry) => (
                        <button
                          key={`wizard-a-${entry.kind}-${entry.id}`}
                          type="button"
                          className={`rules-wizard-picker__option ${
                            wizardSelectedAEntry?.kind === entry.kind && String(wizardSelectedAEntry?.id) === String(entry.id)
                              ? "rules-wizard-picker__option--active"
                              : ""
                          }`}
                          onClick={() => chooseWizardScope("A", entry)}
                        >
                          <span>{entry.label}</span>
                          <span className="rules-wizard-picker__badge">{entry.kind === "type" ? "Type" : "Resource"}</span>
                        </button>
                      ))}
                      {wizardScopeASearchResults.length === 0 && (
                        <div className={`text-xs ${theme.textSoft}`}>No matches. Try a shorter search.</div>
                      )}
                    </div>
                  </div>
                  {wizardSelectedAEntry && (
                    <div className={`text-xs ${theme.textSoft}`}>
                      Selected: <strong>{wizardSelectedAEntry.label}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 4 && wizard.target === "pair" && (
              <div className="flex justify-end">
                <div className={`rules-wizard-step-card border rounded-2xl p-4 w-full max-w-[75%] space-y-3 ${theme.card}`}>
                  <div className={`text-xs ${theme.textSoft}`}>
                    Resource B is the second resource checked together with Resource A.
                  </div>
                  <div className="rules-wizard-choice-grid">
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.scopeBMode === "type" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => {
                        updateWizard({ scopeBMode: "type", typeBId: "", resourceBId: "" });
                        setWizardChatInput("");
                      }}
                    >
                      <span className="rules-wizard-choice__title">Any resource of a type</span>
                      <span className="rules-wizard-choice__meta">Use when B can be any resource from a type.</span>
                    </button>
                    <button
                      type="button"
                      className={`rules-wizard-choice ${wizard.scopeBMode === "resource" ? "rules-wizard-choice--active" : ""}`}
                      onClick={() => {
                        updateWizard({ scopeBMode: "resource", resourceBId: "" });
                        setWizardChatInput("");
                      }}
                    >
                      <span className="rules-wizard-choice__title">One specific resource</span>
                      <span className="rules-wizard-choice__meta">Use when the rule compares against one exact room/course.</span>
                    </button>
                  </div>
                  <div className="rules-wizard-picker">
                    <div className={`text-xs ${theme.textSoft}`}>
                      Search {wizard.scopeBMode === "type" ? "resource types" : "resources"} and click one result.
                    </div>
                    <input
                      className={`w-full p-3 border rounded text-sm ${theme.input}`}
                      placeholder={wizard.scopeBMode === "type" ? "Search type: lab, auditorium..." : "Search resource: Lab 1, Auditorium..."}
                      value={wizardChatInput}
                      onChange={(e) => setWizardChatInput(e.target.value)}
                    />
                    <div className="rules-wizard-picker__list">
                      {wizardScopeBSearchResults.map((entry) => (
                        <button
                          key={`wizard-b-${entry.kind}-${entry.id}`}
                          type="button"
                          className={`rules-wizard-picker__option ${
                            wizardSelectedBEntry?.kind === entry.kind && String(wizardSelectedBEntry?.id) === String(entry.id)
                              ? "rules-wizard-picker__option--active"
                              : ""
                          }`}
                          onClick={() => chooseWizardScope("B", entry)}
                        >
                          <span>{entry.label}</span>
                          <span className="rules-wizard-picker__badge">{entry.kind === "type" ? "Type" : "Resource"}</span>
                        </button>
                      ))}
                      {wizardScopeBSearchResults.length === 0 && (
                        <div className={`text-xs ${theme.textSoft}`}>No matches. Try a shorter search.</div>
                      )}
                    </div>
                  </div>
                  {wizardSelectedBEntry && (
                    <div className={`text-xs ${theme.textSoft}`}>
                      Selected: <strong>{wizardSelectedBEntry.label}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 4 && wizard.target === "multi" && (
              <div className="flex justify-end">
                <div className={`rules-wizard-step-card border rounded-2xl p-4 w-full max-w-[85%] space-y-4 ${theme.card}`}>
                  <div className={`text-xs ${theme.textSoft}`}>
                    Multi-resource rules need at least <strong>Resource B</strong> plus one more resource.
                  </div>

                  <div className="grid grid-cols-3 gap-3 items-end">
                    <label className="rules-wizard-field">
                      <span className={`text-xs ${theme.textSoft}`}>Resource B source</span>
                      <select
                        className={`w-full p-3 border rounded text-sm ${theme.input}`}
                        value={wizard.scopeBMode}
                        onChange={(e) => updateWizard({ scopeBMode: e.target.value, resourceBId: "", typeBId: "" })}
                      >
                        <option value="type">Any resource of a type</option>
                        <option value="resource">One specific resource</option>
                      </select>
                    </label>
                    <label className="rules-wizard-field col-span-2">
                      <span className={`text-xs ${theme.textSoft}`}>Resource B</span>
                      {wizard.scopeBMode === "type" ? (
                        <select
                          className={`w-full p-3 border rounded text-sm ${theme.input}`}
                          value={wizard.typeBId}
                          onChange={(e) => updateWizard({ typeBId: e.target.value, resourceBId: "" })}
                        >
                          <option value="">Choose type…</option>
                          {typeOptions.map((type) => (
                            <option key={type.type_id} value={type.type_id}>
                              {type.type_name} (id={type.type_id})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          className={`w-full p-3 border rounded text-sm ${theme.input}`}
                          value={wizard.resourceBId}
                          onChange={(e) => updateWizard({ resourceBId: e.target.value })}
                        >
                          <option value="">Choose resource…</option>
                          {resourceOptions.map((resource) => (
                            <option key={resource.id} value={resource.id}>
                              {resource.name} (id={resource.id}{resource.type_name ? `, ${resource.type_name}` : ""})
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div className={`text-xs ${theme.textSoft}`}>Additional resources</div>
                    {wizard.extraScopes.map((scope, idx) => {
                      const selectedResource =
                        scope.scopeMode === "resource"
                          ? resources.find((resource) => String(resource.id) === String(scope.resourceId))
                          : null;
                      return (
                        <div key={scope.id} className="grid grid-cols-4 gap-3 items-end">
                          <label className="rules-wizard-field">
                            <span className={`text-xs ${theme.textSoft}`}>Source</span>
                            <select
                              className={`w-full p-3 border rounded text-sm ${theme.input}`}
                              value={scope.scopeMode}
                              onChange={(e) => updateWizardExtraScope(scope.id, { scopeMode: e.target.value })}
                            >
                              <option value="type">Any resource of a type</option>
                              <option value="resource">One specific resource</option>
                            </select>
                          </label>
                          <label className="rules-wizard-field col-span-2">
                            <span className={`text-xs ${theme.textSoft}`}>Resource {idx + 3}</span>
                            {scope.scopeMode === "type" ? (
                              <select
                                className={`w-full p-3 border rounded text-sm ${theme.input}`}
                                value={scope.typeId}
                                onChange={(e) => updateWizardExtraScope(scope.id, { typeId: e.target.value, resourceId: "" })}
                              >
                                <option value="">Choose type…</option>
                                {typeOptions.map((type) => (
                                  <option key={`${scope.id}-${type.type_id}`} value={type.type_id}>
                                    {type.type_name} (id={type.type_id})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                className={`w-full p-3 border rounded text-sm ${theme.input}`}
                                value={scope.resourceId}
                                onChange={(e) => updateWizardExtraScope(scope.id, { resourceId: e.target.value })}
                              >
                                <option value="">Choose resource…</option>
                                {resourceOptions.map((resource) => (
                                  <option key={`${scope.id}-${resource.id}`} value={resource.id}>
                                    {resource.name} (id={resource.id}{resource.type_name ? `, ${resource.type_name}` : ""})
                                  </option>
                                ))}
                              </select>
                            )}
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={`px-3 py-2 rounded ${theme.buttonGhost}`}
                              onClick={() => removeWizardExtraScope(scope.id)}
                              disabled={wizard.extraScopes.length === 1}
                            >
                              Remove
                            </button>
                          </div>
                          {(scope.typeId || selectedResource?.type_id) && (
                            <div className={`col-span-4 text-xs ${theme.textSoft}`}>
                              Selected type: <strong>{schemaTypeById.get(String(scope.typeId || selectedResource?.type_id))?.name || "Unknown type"}</strong>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className={`px-3 py-2 border rounded ${theme.buttonGhost}`}
                      onClick={addWizardExtraScope}
                    >
                      + Add another resource
                    </button>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <div className={`rules-wizard-step-card border rounded-2xl p-4 w-full max-w-[85%] space-y-3 ${theme.card}`}>
                    <div className="text-sm font-medium">Describe the situation you want to block (plain English)</div>
                    <div className={`text-xs ${theme.textSoft}`}>
                      Example: “Block if exam needs computers and the room has no computers”
                      or “Block when capacity is smaller than students number”.
                    </div>
                    {wizard.target === "pair" && (
                      <div className={`text-xs ${theme.textSoft}`}>
                        For pair rules, describe both sides explicitly. Example: “Block when classroom capacity is smaller than course students number”.
                      </div>
                    )}
                    {wizard.target === "multi" && (
                      <div className={`text-xs ${theme.textSoft}`}>
                        For multi rules, mention each resource clearly. Example: “Block when lecturer department is design, course students count is over 80, and room capacity is smaller than the course size”.
                      </div>
                    )}
                    <textarea
                      className={`w-full p-3 border rounded text-sm ${theme.input}`}
                      rows={4}
                      placeholder="Describe the blocked situation in one or two sentences."
                      value={wizard.conditionSentence}
                      onChange={(e) => updateWizard({ conditionSentence: e.target.value })}
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className={`px-4 py-2 border rounded ${theme.buttonGhost}`}
                        onClick={applySentenceConditions}
                        disabled={wizardBusy}
                      >
                        {wizardBusy ? "Generating..." : "Generate conditions with AI"}
                      </button>
                      {wizard.conditions.length > 0 && (
                        <span className={`text-xs ${theme.textSoft}`}>
                          Generated {wizard.conditions.length} condition(s).
                        </span>
                      )}
                    </div>
                    {wizardQuestions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className={`text-xs ${theme.textSoft}`}>
                          I need a bit more info:
                        </div>
                        {wizardQuestions.map((q) => (
                          <div key={q} className="text-sm space-y-1">
                            <div className={`text-xs ${theme.textSoft}`}>{q}</div>
                            <input
                              type="text"
                              className={`w-full p-2 border rounded text-sm ${theme.input}`}
                              value={wizardAnswers[q] || ""}
                              onChange={(e) =>
                                setWizardAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                              }
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          className={`px-3 py-2 border rounded ${theme.buttonGhost}`}
                          onClick={submitClarifications}
                          disabled={wizardBusy}
                        >
                          {wizardBusy ? "Submitting..." : "Send answers"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex">
                  <div className={`px-4 py-3 rounded-2xl text-xs max-w-[75%] ${theme.panelSoft} ${theme.textSoft}`}>
                    <div className={`font-medium mb-1 ${theme.textStrong}`}>Fields I can use</div>
                    {wizardSelectedResources.map((resource) => (
                      <div key={`wizard-fields-${resource.id}`}>
                        {describeWizardResourceById(resource.id)}: {resource.fields.join(", ") || "None selected"}
                      </div>
                    ))}
                  </div>
                </div>

                {(wizard.target === "pair" || wizard.target === "multi") && !wizard.typeBId && (
                  <div className="flex">
                    <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-2xl text-xs text-amber-700 max-w-[75%]">
                      To use Side B, go back and choose a Resource B type in Step 4.
                    </div>
                  </div>
                )}

                <details className={`rules-wizard-details border rounded-2xl p-3 ${theme.card}`}>
                  <summary className="text-sm font-medium cursor-pointer">Advanced: edit conditions manually</summary>
                  <div className="mt-3 space-y-3">
                    <div className={`text-xs ${theme.textSoft}`}>
                      Use this only if you want to tweak the generated conditions.
                    </div>
                    {wizard.conditions.map((cond, idx) => {
                      if (wizard.target === "multi") {
                        const fieldOptions = getWizardFieldOptionsByResourceId(cond.resourceId || "A");
                        const refFieldOptions = getWizardFieldOptionsByResourceId(cond.refResourceId || "");
                        return (
                          <div key={cond.id} className="grid grid-cols-8 gap-3 items-end">
                            <div>
                              <label className="block text-xs font-medium mb-1">Resource</label>
                              <select
                                className={`w-full p-2 border rounded ${theme.input}`}
                                value={cond.resourceId || "A"}
                                onChange={(e) => updateWizardCondition(idx, { resourceId: e.target.value, field: "" })}
                              >
                                {wizardSelectedResources.map((resource) => (
                                  <option key={`${cond.id}-${resource.id}`} value={resource.id}>
                                    {resource.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Field</label>
                              <select
                                className={`w-full p-2 border rounded ${theme.input}`}
                                value={cond.field}
                                onChange={(e) => updateWizardCondition(idx, { field: e.target.value })}
                              >
                                <option value="">Choose field…</option>
                                {fieldOptions.map((field) => (
                                  <option key={`${cond.id}-${cond.resourceId}-${field.value}`} value={field.value}>{field.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Operator</label>
                              <select
                                className={`w-full p-2 border rounded ${theme.input}`}
                                value={cond.op}
                                onChange={(e) => updateWizardCondition(idx, { op: e.target.value })}
                              >
                                {WIZARD_OP_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Compare</label>
                              <select
                                className={`w-full p-2 border rounded ${theme.input}`}
                                value={cond.compare}
                                onChange={(e) =>
                                  updateWizardCondition(idx, {
                                    compare: e.target.value,
                                    refField: "",
                                    refResourceId: e.target.value === "field" ? cond.refResourceId || "B" : "",
                                  })
                                }
                              >
                                <option value="value">Value</option>
                                <option value="field">Field</option>
                              </select>
                            </div>
                            {cond.compare === "field" ? (
                              <>
                                <div>
                                  <label className="block text-xs font-medium mb-1">Ref resource</label>
                                  <select
                                    className={`w-full p-2 border rounded ${theme.input}`}
                                    value={cond.refResourceId || ""}
                                    onChange={(e) => updateWizardCondition(idx, { refResourceId: e.target.value, refField: "" })}
                                  >
                                    <option value="">Choose…</option>
                                    {wizardSelectedResources
                                      .filter((resource) => resource.id !== cond.resourceId)
                                      .map((resource) => (
                                        <option key={`${cond.id}-ref-${resource.id}`} value={resource.id}>
                                          {resource.name}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-xs font-medium mb-1">Ref field</label>
                                  <select
                                    className={`w-full p-2 border rounded ${theme.input}`}
                                    value={cond.refField}
                                    onChange={(e) => updateWizardCondition(idx, { refField: e.target.value })}
                                  >
                                    <option value="">Choose field…</option>
                                    {refFieldOptions.map((field) => (
                                      <option key={`${cond.id}-${cond.refResourceId}-${field.value}`} value={field.value}>{field.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            ) : (
                              <div className="col-span-3">
                                <label className="block text-xs font-medium mb-1">Value</label>
                                <input
                                  type="text"
                                  className={`w-full p-2 border rounded ${theme.input}`}
                                  placeholder={cond.op === "in" ? "Example: A,B,C" : "Example: yes / 10 / lab"}
                                  value={cond.value}
                                  onChange={(e) => updateWizardCondition(idx, { value: e.target.value })}
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => removeWizardCondition(idx)}
                                className={`px-3 py-2 rounded ${theme.buttonGhost}`}
                                disabled={wizard.conditions.length === 1}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      }

                      const sideFields = cond.side === "B" ? wizardFieldsB : wizardFieldsA;
                      const refFields = cond.side === "B" ? wizardFieldsA : wizardFieldsB;
                      return (
                        <div key={cond.id} className="grid grid-cols-7 gap-3 items-end">
                          <div>
                            <label className="block text-xs font-medium mb-1">Side</label>
                            <select
                              className={`w-full p-2 border rounded ${theme.input}`}
                              value={cond.side}
                              onChange={(e) => updateWizardCondition(idx, { side: e.target.value })}
                              disabled={wizard.target === "single"}
                            >
                              <option value="A">A</option>
                              {wizard.target === "pair" && wizard.typeBId && <option value="B">B</option>}
                            </select>
                            <div className="text-[11px] text-gray-500 mt-1">
                              {cond.side === "B"
                                ? `B = ${wizard.scopeBMode === "resource"
                                    ? resourceNameById.get(String(wizard.resourceBId)) || "Resource B"
                                    : schemaTypeById.get(String(wizard.typeBId))?.name || "Resource B"} (the other resource)`
                                : `A = ${wizard.scopeAMode === "resource"
                                    ? resourceNameById.get(String(wizard.resourceAId)) || "Resource A"
                                    : schemaTypeById.get(String(wizard.typeAId))?.name || "Resource A"} (main resource)`}
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1">Field</label>
                            <select
                              className={`w-full p-2 border rounded ${theme.input}`}
                              value={cond.field}
                              onChange={(e) => updateWizardCondition(idx, { field: e.target.value })}
                            >
                              <option value="">Choose field…</option>
                              {sideFields.map((field) => (
                                <option key={field.value} value={field.value}>{field.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1">Operator</label>
                            <select
                              className={`w-full p-2 border rounded ${theme.input}`}
                              value={cond.op}
                              onChange={(e) => updateWizardCondition(idx, { op: e.target.value })}
                            >
                              {WIZARD_OP_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1">Compare</label>
                            <select
                              className={`w-full p-2 border rounded ${theme.input}`}
                              value={cond.compare}
                              onChange={(e) => updateWizardCondition(idx, { compare: e.target.value })}
                              disabled={wizard.target !== "pair"}
                            >
                              <option value="value">Value</option>
                              <option value="field">Field (other side)</option>
                            </select>
                          </div>

                          {cond.compare === "field" && wizard.target === "pair" ? (
                            <div className="col-span-2">
                              <label className="block text-xs font-medium mb-1">Ref field</label>
                              <select
                                className={`w-full p-2 border rounded ${theme.input}`}
                                value={cond.refField}
                                onChange={(e) => updateWizardCondition(idx, { refField: e.target.value })}
                              >
                                <option value="">Choose field…</option>
                                {refFields.map((field) => (
                                  <option key={field.value} value={field.value}>{field.label}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="col-span-2">
                              <label className="block text-xs font-medium mb-1">Value</label>
                              <input
                                type="text"
                                className={`w-full p-2 border rounded ${theme.input}`}
                                placeholder={cond.op === "in" ? "Example: A,B,C" : "Example: yes / 10 / lab"}
                                value={cond.value}
                                onChange={(e) => updateWizardCondition(idx, { value: e.target.value })}
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  className={`px-2 py-1 text-xs border rounded ${theme.buttonGhost}`}
                                  onClick={() => updateWizardCondition(idx, { value: "true" })}
                                >
                                  True
                                </button>
                                <button
                                  type="button"
                                  className={`px-2 py-1 text-xs border rounded ${theme.buttonGhost}`}
                                  onClick={() => updateWizardCondition(idx, { value: "false" })}
                                >
                                  False
                                </button>
                                <button
                                  type="button"
                                  className={`px-2 py-1 text-xs border rounded ${theme.buttonGhost}`}
                                  onClick={() => updateWizardCondition(idx, { value: "" })}
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => removeWizardCondition(idx)}
                              className={`px-3 py-2 rounded ${theme.buttonGhost}`}
                              disabled={wizard.conditions.length === 1}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <button onClick={addWizardCondition} className={`px-3 py-2 border rounded ${theme.buttonGhost}`}>
                      + Add Condition
                    </button>
                  </div>
                </details>
              </div>
            )}

            {wizardStep === 6 && (
              <div className="flex justify-end">
                <div className={`rules-wizard-step-card border rounded-2xl p-4 w-full max-w-[85%] space-y-3 ${theme.card}`}>
                  <div className={`text-xs ${theme.textSoft}`}>
                    Keep this part simple. Only the rule name is required.
                  </div>
                  <div className="rules-wizard-inline-fields rules-wizard-inline-fields--two">
                    <label className="rules-wizard-field">
                      <span className={`text-xs ${theme.textSoft}`}>Rule name</span>
                      <input
                        type="text"
                        className={`w-full p-3 border rounded text-sm ${theme.input}`}
                        value={wizard.name}
                        onChange={(e) => updateWizard({ name: e.target.value })}
                        placeholder="Block classrooms over capacity"
                      />
                    </label>
                    <label className="rules-wizard-field">
                      <span className={`text-xs ${theme.textSoft}`}>Description</span>
                      <input
                        type="text"
                        className={`w-full p-3 border rounded text-sm ${theme.input}`}
                        value={wizard.description}
                        onChange={(e) => updateWizard({ description: e.target.value })}
                        placeholder="Optional"
                      />
                    </label>
                    <label className="rules-wizard-field">
                      <span className={`text-xs ${theme.textSoft}`}>Sort order</span>
                      <input
                        type="number"
                        className={`w-full p-3 border rounded text-sm ${theme.input}`}
                        value={wizard.sort_order}
                        onChange={(e) => updateWizard({ sort_order: e.target.value })}
                      />
                    </label>
                    <label className="rules-wizard-field">
                      <span className={`text-xs ${theme.textSoft}`}>Status</span>
                      <select
                        className={`w-full p-3 border rounded text-sm ${theme.input}`}
                        value={wizard.is_active ? "active" : "inactive"}
                        onChange={(e) => updateWizard({ is_active: e.target.value === "active" })}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                    {wizard.actionEffect === "score" && (
                      <label className="rules-wizard-field">
                        <span className={`text-xs ${theme.textSoft}`}>Score value</span>
                        <input
                          type="number"
                          className={`w-full p-3 border rounded text-sm ${theme.input}`}
                          value={wizard.scoreValue}
                          onChange={(e) => updateWizard({ scoreValue: e.target.value })}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 7 && (
              <div className="rules-wizard-review space-y-4">
                <div className={`border rounded p-3 text-sm ${theme.panelSoft} ${theme.textSoft}`}>
                  <div className="font-semibold mb-1">Summary understood</div>
                  <div>{wizardSummary}</div>
                </div>

                <div>
                  <div className="text-sm font-semibold mb-2">Rule JSON</div>
                  <pre className={`p-3 rounded text-xs border overflow-x-auto ${theme.modalSurface}`}>
                    {JSON.stringify(wizardPayload, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {wizardError && (
              <div className="mt-4 text-sm text-red-600">{wizardError}</div>
            )}

            <div className="rules-wizard-modal__footer flex justify-between items-center mt-6">
              <button
                onClick={() => setWizardStep((s) => prevWizardStep(s))}
                className={`rules-wizard-modal__back px-4 py-2 border rounded ${theme.buttonGhost}`}
                disabled={wizardStep === 1}
              >
                Back
              </button>

              <div className="flex gap-2">
                {wizardStep < 7 && (
                  <button
                    onClick={handleWizardContinue}
                    className={`rules-wizard-modal__primary px-4 py-2 rounded ${theme.buttonPrimary}`}
                  >
                    {wizardStep === 5 ? "Next" : "Continue"}
                  </button>
                )}

                {wizardStep === 7 && (
                  <button
                    onClick={createWizardRule}
                    className="rules-wizard-modal__primary px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    disabled={wizardBusy}
                  >
                    {wizardBusy ? "Creating..." : "Create Rule"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {detailsModal.open && detailsModal.rule && (
        <div className="rules-details-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rules-details-modal max-h-[90vh] w-[760px] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="rules-details-modal__header">
              <div>
                <div className="rules-details-modal__eyebrow">Rule snapshot</div>
                <h2>Rule Details</h2>
              </div>
              <div className={detailsModal.rule.is_active ? "rules-details-modal__status rules-details-modal__status--active" : "rules-details-modal__status"}>
                {detailsModal.rule.is_active ? "Active" : "Disabled"}
              </div>
            </div>

            <div className="rules-details-modal__summary">
              <div className="rules-details-modal__summary-main">
                <span>Rule #{detailsModal.rule.id}</span>
                <h3>{detailsModal.rule.name}</h3>
                <p>{detailsModal.rule.description || "No description provided."}</p>
              </div>
              <div className="rules-details-modal__facts">
                <div>
                  <span>Target</span>
                  <strong>{detailsModal.rule.target_type}</strong>
                </div>
                <div>
                  <span>Hard</span>
                  <strong>{detailsModal.rule.is_hard ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span>Weight</span>
                  <strong>{detailsModal.rule.weight}</strong>
                </div>
                <div>
                  <span>Sort Order</span>
                  <strong>{detailsModal.rule.sort_order}</strong>
                </div>
              </div>
            </div>

            <div className="rules-details-modal__json-grid">
              <section className="rules-details-modal__json-card">
                <div className="rules-details-modal__section-title">Condition JSON</div>
                <pre>
                  {JSON.stringify(detailsModal.rule.condition || {}, null, 2)}
                </pre>
              </section>

              <section className="rules-details-modal__json-card">
                <div className="rules-details-modal__section-title">Action JSON</div>
                <pre>
                  {JSON.stringify(detailsModal.rule.action || {}, null, 2)}
                </pre>
              </section>
            </div>

            <div className="rules-details-modal__footer">
              <button
                onClick={() => setDetailsModal({ open: false, rule: null })}
                className="rules-details-modal__close px-4 py-2 border rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
