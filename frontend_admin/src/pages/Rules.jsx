import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/api";

const OP_OPTIONS = [
  { label: "==", value: "==" },
  { label: "!=", value: "!=" },
  { label: ">=", value: ">=" },
  { label: "<=", value: "<=" },
  { label: ">", value: ">" },
  { label: "<", value: "<" },
];
const WIZARD_OP_OPTIONS = [...OP_OPTIONS, { label: "in", value: "in" }];

/** @typedef {{ id: string, side: "A" | "B", field: string, op: string, compare: "value" | "field", value: string, refField: string }} WizardCondition */
/** @typedef {{ actionEffect: "forbid" | "score", target: "single" | "pair", scopeAMode: "type" | "resource", scopeBMode: "type" | "resource", resourceAId: string, resourceBId: string, typeAId: string, typeBId: string, conditions: WizardCondition[], conditionSentence: string, lastAppliedSentence: string, name: string, description: string, is_active: boolean, sort_order: number, weight: number, scoreValue: number }} WizardState */

function uniq(arr) {
  return Array.from(new Set(arr));
}

function toNumberIfPossible(v) {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  if (!trimmed) return v;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : v;
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
  const [showSimpleBuilder, setShowSimpleBuilder] = useState(false);

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
    comparisons: [
      { bMode: "resource", resourceBId: "", typeBId: "", fieldA: "", op: "<", fieldB: "" },
    ],
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
    conditions: [
      { id: "c1", side: "A", field: "", op: "==", compare: "value", value: "", refField: "" },
    ],
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
  }

  function openWizard() {
    resetWizard();
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
  }

  function updateWizard(patch) {
    setWizard((prev) => {
      const next = { ...prev, ...patch };
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
        next.conditions = next.conditions.map((c) => ({
          ...c,
          side: "A",
          compare: "value",
          refField: "",
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
        next.conditions[idx].compare = "value";
        next.conditions[idx].refField = "";
      }
      return next;
    });
  }

  function addWizardCondition() {
    setWizard((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        { id: `c${prev.conditions.length + 1}`, side: "A", field: "", op: "==", compare: "value", value: "", refField: "" },
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
    if (wizard.target === "pair" && !wizardFieldsB.length) {
      setWizardError("Select Resource B type and fields first.");
      return;
    }
    setWizardError("");
    setWizardBusy(true);
    try {
      const payload = {
        sentence,
        target: wizard.target,
        typeAName: schemaTypeById.get(String(wizard.typeAId))?.name || "",
        typeBName: schemaTypeById.get(String(wizard.typeBId))?.name || "",
        fieldsA: wizardFieldsA.map((f) => f.value),
        fieldsB: wizardFieldsB.map((f) => f.value),
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
          side: c.side,
          field: c.field,
          op: c.op,
          compare: c.compare,
          value: c.value ?? "",
          refField: c.refField ?? "",
        })),
      }));
    } catch (err) {
      console.error("LLM parse failed:", err);
      setWizard((prev) => ({ ...prev, lastAppliedSentence: "" }));
      setWizardError(err?.data?.error || err.message || "LLM parse failed");
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
    return wizard.conditions
      .map((c) => {
        const isSideB = c.side === "B";
        const field = isSideB
          ? buildFieldPath(wizard.typeBId, c.field)
          : buildResourceFieldPath(c.field);
        if (!field) return null;
        if (c.compare === "field") {
          const ref = isSideB
            ? buildResourceFieldPath(c.refField)
            : buildFieldPath(wizard.typeBId, c.refField);
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
    if (step >= 4 && wizard.target === "pair") {
      if (!wizard.scopeBMode) return "Choose whether Resource B is one resource or a whole type.";
      if (wizard.scopeBMode === "resource" && !wizard.resourceBId) return "Choose Resource B.";
      if (!wizard.typeBId) return "Choose Resource B type.";
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
        if (wizard.target === "pair" && c.compare === "field") {
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
    const typeAName = wizard.scopeAMode === "resource"
      ? resourceNameById.get(String(wizard.resourceAId)) || "Resource A"
      : schemaTypeById.get(String(wizard.typeAId))?.name || "Type A";
    const typeBName = wizard.scopeBMode === "resource"
      ? resourceNameById.get(String(wizard.resourceBId)) || "Resource B"
      : schemaTypeById.get(String(wizard.typeBId))?.name || "Type B";
    const actionText = wizard.actionEffect === "forbid" ? "Block" : `Score ${Number(wizard.scoreValue) || 0}`;
    const parts = buildWizardClauses().map((clause) => {
      if (!clause) return "";
      const fieldStr = String(clause.field || "");
      const isResource = fieldStr.startsWith("resource.");
      const isARef = fieldStr.includes(`resources_by_type_id.${wizard.typeAId}.`);
      const leftType = isResource ? typeAName : isARef ? typeAName : typeBName;
      const leftField = isResource
        ? fieldLabelFromField(fieldStr.replace(/^resource\./, ""))
        : fieldLabelFromField(fieldStr.split(".").slice(2).join("."));
      if (clause.value && typeof clause.value === "object" && "ref" in clause.value) {
        const refStr = String(clause.value.ref || "");
        const refIsResource = refStr.startsWith("resource.");
        const refType = refIsResource
          ? typeAName
          : refStr.includes(`resources_by_type_id.${wizard.typeAId}.`)
          ? typeAName
          : typeBName;
        const refField = refIsResource
          ? fieldLabelFromField(refStr.replace(/^resource\./, ""))
          : fieldLabelFromField(refStr.split(".").slice(2).join("."));
        return `${leftType}.${leftField} ${clause.op} ${refType}.${refField}`.trim();
      }
      return `${leftType}.${leftField} ${clause.op} ${JSON.stringify(clause.value)}`.trim();
    }).filter(Boolean);
    if (!parts.length) return `If ${typeAName} matches the conditions → ${actionText}.`;
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
    if (form.aMode === "type") return getTypeFieldOptions(form.typeAId);
    return getResourceFieldOptions(resourceA);
  }, [form.aMode, form.typeAId, resourceA, resources]);

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

  const wizardSummary = useMemo(() => buildWizardSummary(), [wizard, schemaTypeById]);
  const wizardPayload = useMemo(() => buildWizardPayload(), [wizard]);

  function ensureDefaultFieldA(next) {
    const updated = { ...next };
    if (!updated.fieldA && fieldsA[0]) updated.fieldA = fieldsA[0].value;
    if (Array.isArray(updated.comparisons)) {
      updated.comparisons = updated.comparisons.map((c) => ({
        ...c,
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
          { bMode: "resource", resourceBId: "", typeBId: "", fieldA: prev.fieldA || "", op: "<", fieldB: "" },
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
      condition = {
        all: [
          aScopeClause,
          {
            field: `resource.${form.fieldA}`,
            op: form.op,
            value: toNumberIfPossible(form.constValue),
          },
        ],
      };
    } else {
      if (!form.comparisons.length) return alert("Add at least one resource to compare.");
      target_type = "pair";
      const clauses = [aScopeClause];

      for (const [idx, comp] of form.comparisons.entries()) {
        if (!comp.fieldA) return alert(`Choose Field A for row ${idx + 1}`);
        if (!comp.fieldB) return alert(`Choose Field B for row ${idx + 1}`);

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
          clauses.push({
            field: `resource.${comp.fieldA}`,
            op: comp.op,
            value: { ref: `resources_by_type_id.${typeIdB}.${comp.fieldB}` },
          });
        } else {
          if (!comp.typeBId) return alert(`Choose Resource Type for row ${idx + 1}`);
          const typeIdB = Number(comp.typeBId);
          clauses.push({
            field: `resource.${comp.fieldA}`,
            op: comp.op,
            value: { ref: `resources_by_type_id.${typeIdB}.${comp.fieldB}` },
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
      return `If ${aName} is compared to other resources → ${action}.`;
    }
    const parts = form.comparisons.map((c) => {
      const left = fieldLabel(c.fieldA || form.fieldA);
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
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_35%),linear-gradient(135deg,#0f172a,#111827,#020617)] p-6 text-white shadow-[0_24px_60px_rgba(2,6,23,0.35)] sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
              Policy Center
            </div>
            <h1 className="text-4xl font-black tracking-tight">Rules</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
              Shape platform behavior with intelligent policies, guided creation, and
              transparent rule previews.
            </p>
          </div>
          <button
            onClick={openWizard}
            className="inline-flex h-fit items-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
          >
            Rule Wizard Chat
          </button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Total Rules</div>
            <div className="mt-2 text-3xl font-black">{rules.length}</div>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-emerald-100">
            <div className="text-xs font-semibold uppercase tracking-[0.16em]">Active Rules</div>
            <div className="mt-2 text-3xl font-black">{activeRulesCount}</div>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-amber-100">
            <div className="text-xs font-semibold uppercase tracking-[0.16em]">Inactive Rules</div>
            <div className="mt-2 text-3xl font-black">{inactiveRulesCount}</div>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-4 shadow-sm">
        <div className="text-sm text-slate-700">
          Prefer guided setup? Use <span className="font-semibold text-slate-900">Rule Wizard Chat</span> above.
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-base font-semibold text-slate-900">Simple Rule Builder</div>
          <button
            onClick={() => setShowSimpleBuilder((prev) => !prev)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showSimpleBuilder ? "Hide" : "Show"}
          </button>
        </div>
        <div className="mb-4 text-xs text-slate-500">
          Manual builder for power users. The Wizard is recommended for most cases.
        </div>
        {!showSimpleBuilder ? null : (
          <>

        <div className="flex gap-4 mb-4">
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
              className="w-full p-2 border rounded bg-white"
              value={form.aMode}
              onChange={(e) => updateForm({ aMode: e.target.value, resourceAId: "", typeAId: "", fieldA: "" })}
            >
              <option value="resource">Specific resource</option>
              <option value="type">Resource type</option>
            </select>
            <div className="text-xs text-gray-500 mt-1">Choose if A is a specific resource or any resource of a type.</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Resource A</label>
            {form.aMode === "type" ? (
              <select
                className="w-full p-2 border rounded bg-white"
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
                className="w-full p-2 border rounded bg-white"
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
              className="w-full p-2 border rounded bg-white"
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
                className="w-full p-2 border rounded bg-white"
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
                className="w-full p-2 border rounded"
                value={form.constValue}
                onChange={(e) => updateForm({ constValue: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <div className="text-sm font-medium mb-2">Comparisons (A vs multiple B)</div>
            <div className="space-y-3">
              {form.comparisons.map((comp, idx) => {
                const resourceB = resources.find((r) => String(r.id) === String(comp.resourceBId)) ?? null;
                const fieldsB = comp.bMode === "type"
                  ? getTypeFieldOptions(comp.typeBId)
                  : getResourceFieldOptions(resourceB);
                return (
                  <div key={`comp-${idx}`} className="grid grid-cols-6 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium mb-1">B Source</label>
                      <select
                        className="w-full p-2 border rounded bg-white"
                        value={comp.bMode}
                        onChange={(e) => updateComparison(idx, { bMode: e.target.value, resourceBId: "", typeBId: "", fieldB: "" })}
                      >
                        <option value="resource">Specific resource</option>
                        <option value="type">Resource type</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Resource B</label>
                      {comp.bMode === "type" ? (
                        <select
                          className="w-full p-2 border rounded bg-white"
                          value={comp.typeBId}
                          onChange={(e) => updateComparison(idx, { typeBId: e.target.value, fieldB: "" })}
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
                          className="w-full p-2 border rounded bg-white"
                          value={comp.resourceBId}
                          onChange={(e) => updateComparison(idx, { resourceBId: e.target.value, fieldB: "" })}
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
                      <label className="block text-xs font-medium mb-1">Field (A)</label>
                      <select
                        className="w-full p-2 border rounded bg-white"
                        value={comp.fieldA}
                        onChange={(e) => updateComparison(idx, { fieldA: e.target.value })}
                        disabled={form.aMode === "type" ? !form.typeAId : !form.resourceAId}
                      >
                        <option value="">Choose field…</option>
                        {fieldsA.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Operator</label>
                      <select
                        className="w-full p-2 border rounded bg-white"
                        value={comp.op}
                        onChange={(e) => updateComparison(idx, { op: e.target.value })}
                      >
                        {OP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Field (B)</label>
                      <select
                        className="w-full p-2 border rounded bg-white"
                        value={comp.fieldB}
                        onChange={(e) => updateComparison(idx, { fieldB: e.target.value })}
                        disabled={comp.bMode === "type" ? !comp.typeBId : !comp.resourceBId}
                      >
                        <option value="">Choose field…</option>
                        {fieldsB.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => removeComparison(idx)}
                        className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
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
              className="mt-3 px-3 py-2 border rounded hover:bg-gray-50"
            >
              + Add Resource
            </button>
            <div className="text-xs text-gray-500 mt-1">
              Tip: choose "Resource type" to apply the rule to any resource of that type.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Rule Name</label>
            <input
              type="text"
              className="w-full p-2 border rounded"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              className="w-full p-2 border rounded"
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
              className="w-24 p-2 border rounded"
              value={form.scoreDelta}
              onChange={(e) => updateForm({ scoreDelta: e.target.value })}
            />
          )}
        </div>

        <button
          onClick={createRule}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Rule
        </button>

        <div className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded p-3">
          Preview: {previewText}
        </div>

        {mode === "pair" && (
          <div className="text-xs text-gray-500 mt-2">
            Note: when using "Resource type", the comparison uses the first matching resource of that type
            in the booking.
          </div>
        )}
          </>
        )}
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="mb-4">
          <div className="text-lg font-bold text-slate-900">Current Rules</div>
          <div className="mt-1 text-sm text-slate-500">
            Active rules are shown as live policies with readable conditions and direct actions.
          </div>
        </div>

        <div className="grid gap-4">
          {rules.map((rule) => (
            <article
              key={rule.id}
              className="rounded-[22px] border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      Rule #{rule.id}
                    </span>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                      {rule.target_type}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                        rule.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {rule.is_active ? "Active" : "Disabled"}
                    </span>
                  </div>

                  <h2 className="mt-4 text-2xl font-bold text-slate-900">{rule.name}</h2>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Condition
                    </div>
                    <div className="text-sm leading-7 text-slate-700">
                      {formatCondition(rule.condition, typeNameById, resourceNameById) || "-"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                  <button
                    onClick={() => openDetails(rule)}
                    className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    View
                  </button>
                  <button
                    onClick={() => toggleActive(rule)}
                    className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
                  >
                    {rule.is_active ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}

          {rules.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center text-slate-500">
              No rules defined yet.
            </div>
          )}
        </div>
      </section>

      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[900px] shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Rule Wizard Chat</h2>
                <div className="text-xs text-gray-500">Step {wizardStep} of 7</div>
              </div>
              <button onClick={closeWizard} className="px-3 py-2 border rounded">
                Close
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex">
                <div className="bg-gray-100 px-4 py-3 rounded-2xl text-sm max-w-[75%]">
                  {wizardStep === 1 && "Hi! Let’s build a rule together. First, what should this rule do?"}
                  {wizardStep === 2 && "Should this rule target a single resource or a pair (A + B)?"}
                  {wizardStep === 3 && "Should Resource A be one specific resource or all resources of a type?"}
                  {wizardStep === 4 && "Should Resource B be one specific resource or all resources of a type?"}
                  {wizardStep === 5 && "Describe your conditions in plain English, and I’ll create the JSON."}
                  {wizardStep === 6 && "Give your rule a name and settings."}
                  {wizardStep === 7 && "Review everything and create the rule."}
                </div>
              </div>
              {wizardStep > 1 && (
                <div className="flex justify-end">
                  <div className="bg-black text-white px-4 py-3 rounded-2xl text-sm max-w-[75%]">
                    {wizardSummary}
                  </div>
                </div>
              )}
            </div>

            {wizardStep === 1 && (
              <div className="flex justify-end">
                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-3">
                  <button
                    className={`px-4 py-2 border rounded ${wizard.actionEffect === "forbid" ? "bg-gray-900 text-white" : "bg-white"}`}
                    onClick={() => updateWizard({ actionEffect: "forbid", weight: 0 })}
                  >
                    Block (Hard forbid)
                  </button>
                  <button
                    className={`px-4 py-2 border rounded ${wizard.actionEffect === "score" ? "bg-gray-900 text-white" : "bg-white"}`}
                    onClick={() => updateWizard({ actionEffect: "score" })}
                  >
                    Score (Soft)
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="flex flex-col items-end gap-3">
                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-3">
                  <button
                    className={`px-4 py-2 border rounded ${wizard.target === "single" ? "bg-gray-900 text-white" : "bg-white"}`}
                    onClick={() => updateWizard({ target: "single" })}
                  >
                    Single
                  </button>
                  <button
                    className={`px-4 py-2 border rounded ${wizard.target === "pair" ? "bg-gray-900 text-white" : "bg-white"}`}
                    onClick={() => updateWizard({ target: "pair" })}
                  >
                    Pair
                  </button>
                </div>
                
              </div>
            )}

            {wizardStep === 3 && (
              <div className="flex justify-end">
                <div className="bg-white border border-gray-200 rounded-2xl p-4 w-full max-w-[75%] space-y-2">
                  <div className="text-xs text-gray-500">
                    Resource A is the main resource the rule is about (the one being evaluated).
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className={`px-4 py-2 border rounded ${wizard.scopeAMode === "type" ? "bg-gray-900 text-white" : "bg-white"}`}
                      onClick={() => updateWizard({ scopeAMode: "type" })}
                    >
                      All resources of a type
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 border rounded ${wizard.scopeAMode === "resource" ? "bg-gray-900 text-white" : "bg-white"}`}
                      onClick={() => updateWizard({ scopeAMode: "resource" })}
                    >
                      One specific resource
                    </button>
                  </div>
                  {wizard.scopeAMode === "type" ? (
                    <select
                      className="w-full p-2 border rounded bg-white"
                      value={wizard.typeAId}
                      onChange={(e) => updateWizard({ typeAId: e.target.value })}
                    >
                      <option value="">Choose type…</option>
                      {schemaTypes.map((t) => (
                        <option key={t.type_id} value={t.type_id}>
                          {t.name} (id={t.type_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="w-full p-2 border rounded bg-white"
                      value={wizard.resourceAId}
                      onChange={(e) => updateWizard({ resourceAId: e.target.value })}
                    >
                      <option value="">Choose resource…</option>
                      {resourceOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} (id={r.id}) {r.type_name ? `- ${r.type_name}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {wizard.scopeAMode === "resource" && wizard.resourceAId && (
                    <div className="text-xs text-gray-500">
                      Type: {schemaTypeById.get(String(wizard.typeAId))?.name || "Unknown type"}
                    </div>
                  )}
                  {schemaTypes.length === 0 && (
                    <div className="text-xs text-gray-500">No resource types found yet.</div>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 4 && wizard.target === "pair" && (
              <div className="flex justify-end">
                <div className="bg-white border border-gray-200 rounded-2xl p-4 w-full max-w-[75%] space-y-2">
                  <div className="text-xs text-gray-500">
                    Resource B is the second resource checked together with Resource A.
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className={`px-4 py-2 border rounded ${wizard.scopeBMode === "type" ? "bg-gray-900 text-white" : "bg-white"}`}
                      onClick={() => updateWizard({ scopeBMode: "type" })}
                    >
                      All resources of a type
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 border rounded ${wizard.scopeBMode === "resource" ? "bg-gray-900 text-white" : "bg-white"}`}
                      onClick={() => updateWizard({ scopeBMode: "resource" })}
                    >
                      One specific resource
                    </button>
                  </div>
                  {wizard.scopeBMode === "type" ? (
                    <select
                      className="w-full p-2 border rounded bg-white"
                      value={wizard.typeBId}
                      onChange={(e) => updateWizard({ typeBId: e.target.value })}
                    >
                      <option value="">Choose type…</option>
                      {schemaTypes.map((t) => (
                        <option key={t.type_id} value={t.type_id}>
                          {t.name} (id={t.type_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="w-full p-2 border rounded bg-white"
                      value={wizard.resourceBId}
                      onChange={(e) => updateWizard({ resourceBId: e.target.value })}
                    >
                      <option value="">Choose resource…</option>
                      {resourceOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} (id={r.id}) {r.type_name ? `- ${r.type_name}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {wizard.scopeBMode === "resource" && wizard.resourceBId && (
                    <div className="text-xs text-gray-500">
                      Type: {schemaTypeById.get(String(wizard.typeBId))?.name || "Unknown type"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 w-full max-w-[85%] space-y-3">
                    <div className="text-sm font-medium">Describe the situation you want to block (plain English)</div>
                    <div className="text-xs text-gray-500">
                      Example: “Block if exam needs computers and the room has no computers”
                      or “Block when capacity is smaller than students number”.
                    </div>
                    <textarea
                      className="w-full p-3 border rounded text-sm"
                      rows={4}
                      placeholder="Describe the blocked situation in one or two sentences."
                      value={wizard.conditionSentence}
                      onChange={(e) => updateWizard({ conditionSentence: e.target.value })}
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 border rounded hover:bg-gray-50"
                        onClick={applySentenceConditions}
                        disabled={wizardBusy}
                      >
                        {wizardBusy ? "Generating..." : "Generate conditions with AI"}
                      </button>
                      {wizard.conditions.length > 0 && (
                        <span className="text-xs text-gray-500">
                          Generated {wizard.conditions.length} condition(s).
                        </span>
                      )}
                    </div>
                    {wizardQuestions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-gray-600">
                          I need a bit more info:
                        </div>
                        {wizardQuestions.map((q) => (
                          <div key={q} className="text-sm space-y-1">
                            <div className="text-xs text-gray-500">{q}</div>
                            <input
                              type="text"
                              className="w-full p-2 border rounded text-sm"
                              value={wizardAnswers[q] || ""}
                              onChange={(e) =>
                                setWizardAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                              }
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          className="px-3 py-2 border rounded hover:bg-gray-50"
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
                  <div className="bg-gray-100 px-4 py-3 rounded-2xl text-xs text-gray-600 max-w-[75%]">
                    <div className="font-medium text-gray-700 mb-1">Fields I can use</div>
                    <div>Resource A: {wizardFieldsA.map((f) => f.label).join(", ") || "None selected"}</div>
                    {wizard.target === "pair" && (
                      <div>Resource B: {wizardFieldsB.map((f) => f.label).join(", ") || "None selected"}</div>
                    )}
                  </div>
                </div>

                {wizard.target === "pair" && !wizard.typeBId && (
                  <div className="flex">
                    <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-2xl text-xs text-amber-700 max-w-[75%]">
                      To use Side B, go back and choose a Resource B type in Step 4.
                    </div>
                  </div>
                )}

                <details className="bg-white border border-gray-200 rounded-2xl p-3">
                  <summary className="text-sm font-medium cursor-pointer">Advanced: edit conditions manually</summary>
                  <div className="mt-3 space-y-3">
                    <div className="text-xs text-gray-500">
                      Use this only if you want to tweak the generated conditions.
                    </div>
                    {wizard.conditions.map((cond, idx) => {
                  const sideFields = cond.side === "B" ? wizardFieldsB : wizardFieldsA;
                  const refFields = cond.side === "B" ? wizardFieldsA : wizardFieldsB;
                  return (
                    <div key={cond.id} className="grid grid-cols-7 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium mb-1">Side</label>
                        <select
                          className="w-full p-2 border rounded bg-white"
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
                          className="w-full p-2 border rounded bg-white"
                          value={cond.field}
                          onChange={(e) => updateWizardCondition(idx, { field: e.target.value })}
                        >
                          <option value="">Choose field…</option>
                          {sideFields.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">Operator</label>
                        <select
                          className="w-full p-2 border rounded bg-white"
                          value={cond.op}
                          onChange={(e) => updateWizardCondition(idx, { op: e.target.value })}
                        >
                          {WIZARD_OP_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">Compare</label>
                        <select
                          className="w-full p-2 border rounded bg-white"
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
                            className="w-full p-2 border rounded bg-white"
                            value={cond.refField}
                            onChange={(e) => updateWizardCondition(idx, { refField: e.target.value })}
                          >
                            <option value="">Choose field…</option>
                            {refFields.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-1">Value</label>
                          <input
                            type="text"
                            className="w-full p-2 border rounded"
                            placeholder={cond.op === "in" ? "Example: A,B,C" : "Example: yes / 10 / lab"}
                            value={cond.value}
                            onChange={(e) => updateWizardCondition(idx, { value: e.target.value })}
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                              onClick={() => updateWizardCondition(idx, { value: "true" })}
                            >
                              True
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                              onClick={() => updateWizardCondition(idx, { value: "false" })}
                            >
                              False
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
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
                          className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
                          disabled={wizard.conditions.length === 1}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}

                    <button onClick={addWizardCondition} className="px-3 py-2 border rounded hover:bg-gray-50">
                      + Add Condition
                    </button>
                  </div>
                </details>
              </div>
            )}

            {wizardStep === 6 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Rule Name</label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={wizard.name}
                      onChange={(e) => updateWizard({ name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={wizard.description}
                      onChange={(e) => updateWizard({ description: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium mb-1">Sort Order</label>
                    <input
                      type="number"
                      className="w-full p-2 border rounded"
                      value={wizard.sort_order}
                      onChange={(e) => updateWizard({ sort_order: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Weight</label>
                    <input
                      type="number"
                      className="w-full p-2 border rounded"
                      value={wizard.actionEffect === "forbid" ? 0 : wizard.weight}
                      disabled={wizard.actionEffect === "forbid"}
                      onChange={(e) => updateWizard({ weight: e.target.value })}
                    />
                  </div>

                  {wizard.actionEffect === "score" && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Score Value</label>
                      <input
                        type="number"
                        className="w-full p-2 border rounded"
                        value={wizard.scoreValue}
                        onChange={(e) => updateWizard({ scoreValue: e.target.value })}
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-2 mt-6">
                    <input
                      type="checkbox"
                      checked={wizard.is_active}
                      onChange={(e) => updateWizard({ is_active: e.target.checked })}
                    />
                    <span className="text-sm">Active</span>
                  </label>
                </div>
              </div>
            )}

            {wizardStep === 7 && (
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm">
                  <div className="font-semibold mb-1">Summary understood</div>
                  <div>{wizardSummary}</div>
                </div>

                <div>
                  <div className="text-sm font-semibold mb-2">Rule JSON</div>
                  <pre className="bg-gray-100 p-3 rounded text-xs border overflow-x-auto">
                    {JSON.stringify(wizardPayload, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {wizardError && (
              <div className="mt-4 text-sm text-red-600">{wizardError}</div>
            )}

            <div className="flex justify-between items-center mt-6">
              <button
                onClick={() => setWizardStep((s) => prevWizardStep(s))}
                className="px-4 py-2 border rounded"
                disabled={wizardStep === 1}
              >
                Back
              </button>

              <div className="flex gap-2">
                {wizardStep < 7 && (
                  <button
                    onClick={() => {
                      const err = validateWizardStep(wizardStep);
                      if (err) {
                        setWizardError(err);
                        return;
                      }
                      setWizardError("");
                      setWizardStep((s) => nextWizardStep(s));
                    }}
                    className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
                  >
                    Next
                  </button>
                )}

                {wizardStep === 7 && (
                  <button
                    onClick={createWizardRule}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
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
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[700px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Rule Details</h2>

            <div className="space-y-2 text-sm">
              <div><strong>ID:</strong> {detailsModal.rule.id}</div>
              <div><strong>Name:</strong> {detailsModal.rule.name}</div>
              <div><strong>Description:</strong> {detailsModal.rule.description || "-"}</div>
              <div><strong>Target:</strong> {detailsModal.rule.target_type}</div>
              <div><strong>Active:</strong> {detailsModal.rule.is_active ? "Yes" : "No"}</div>
              <div><strong>Hard:</strong> {detailsModal.rule.is_hard ? "Yes" : "No"}</div>
              <div><strong>Weight:</strong> {detailsModal.rule.weight}</div>
              <div><strong>Sort Order:</strong> {detailsModal.rule.sort_order}</div>
            </div>

            <h3 className="font-semibold mt-4 mb-2">Condition (JSON)</h3>
            <pre className="bg-gray-100 p-3 rounded text-xs border overflow-x-auto">
              {JSON.stringify(detailsModal.rule.condition || {}, null, 2)}
            </pre>

            <h3 className="font-semibold mt-4 mb-2">Action (JSON)</h3>
            <pre className="bg-gray-100 p-3 rounded text-xs border overflow-x-auto">
              {JSON.stringify(detailsModal.rule.action || {}, null, 2)}
            </pre>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setDetailsModal({ open: false, rule: null })}
                className="px-4 py-2 border rounded"
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
