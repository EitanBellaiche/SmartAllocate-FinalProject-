import OpenAI from "openai";
import {
  getPairSideForResourceId,
  getPairSideResourceIds,
  normalizeRuleResources,
} from "./ruleResourceHelpers.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ALLOWED_OPS = ["==", "!=", ">", "<", ">=", "<=", "in"];
const ALLOWED_COMPARE = ["value", "field"];
const ALLOWED_SIDE = ["A", "B"];

function buildSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["ok", "clarify"] },
      clauses: {
        type: "array",
        minItems: 0,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            side: {
              anyOf: [
                { type: "string", enum: ALLOWED_SIDE },
                { type: "null" },
              ],
            },
            resourceId: {
              anyOf: [
                { type: "string" },
                { type: "null" },
              ],
            },
            field: { type: "string" },
            op: { type: "string", enum: ALLOWED_OPS },
            compare: { type: "string", enum: ALLOWED_COMPARE },
            value: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "null" },
                {
                  type: "array",
                  items: {
                    anyOf: [
                      { type: "string" },
                      { type: "number" },
                      { type: "boolean" },
                      { type: "null" },
                      { type: "object", additionalProperties: false },
                    ],
                    additionalProperties: false,
                  },
                },
                { type: "object", additionalProperties: false },
              ],
              additionalProperties: false,
            },
            refField: { type: "string" },
            refResourceId: {
              anyOf: [
                { type: "string" },
                { type: "null" },
              ],
            },
          },
          required: ["side", "resourceId", "field", "op", "compare", "value", "refField", "refResourceId"],
        },
      },
      questions: {
        type: "array",
        minItems: 0,
        items: {
          type: "string",
        },
      },
    },
    required: ["status", "clauses", "questions"],
  };
}

function normalizeField(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("resource.")) return value.replace(/^resource\./, "");
  if (value.startsWith("resources_by_type_id.")) {
    return value.replace(/^resources_by_type_id\.[^\\.]+\./, "");
  }
  return value;
}

function buildResourceLookup(resources) {
  const byId = new Map();
  const fieldOwners = new Map();

  for (const resource of resources) {
    const normalized = {
      id: String(resource?.id || "").trim(),
      name: String(resource?.name || "").trim(),
      fields: Array.isArray(resource?.fields)
        ? Array.from(new Set(resource.fields.map((field) => String(field || "").trim()).filter(Boolean)))
        : [],
    };
    if (!normalized.id) continue;
    byId.set(normalized.id, normalized);

    for (const field of normalized.fields) {
      if (!fieldOwners.has(field)) fieldOwners.set(field, new Set());
      fieldOwners.get(field).add(normalized.id);
    }
  }

  return { byId, fieldOwners };
}

function getLegacyResourceHint(clause, resources) {
  if (clause?.resourceId) return String(clause.resourceId).trim();
  const sideIds = getPairSideResourceIds(resources);
  if (clause?.side === "A") return sideIds.A;
  if (clause?.side === "B") return sideIds.B;
  return "";
}

function getLegacyRefResourceHint(clause, resources) {
  if (clause?.refResourceId) return String(clause.refResourceId).trim();
  const sideIds = getPairSideResourceIds(resources);
  if (clause?.side === "A") return sideIds.B;
  if (clause?.side === "B") return sideIds.A;
  return "";
}

function validateBaseClause(clause, idx) {
  if (!clause || typeof clause !== "object") throw new Error(`Clause ${idx + 1} is invalid`);
  if (!ALLOWED_OPS.includes(clause.op)) throw new Error(`Clause ${idx + 1}: invalid operator`);
  if (!ALLOWED_COMPARE.includes(clause.compare)) {
    throw new Error(`Clause ${idx + 1}: invalid compare type`);
  }
}

function sanitizeSingleClauses(clauses, resources) {
  const resource = resources[0] || { id: "A", fields: [] };
  const allowedFields = new Set(resource.fields || []);

  return clauses.map((clause, idx) => {
    validateBaseClause(clause, idx);

    const field = normalizeField(clause.field);
    const refField = normalizeField(clause.refField ?? "");
    const compare = clause.compare;

    if (clause.side && clause.side !== "A") {
      throw new Error(`Clause ${idx + 1}: invalid side`);
    }
    if (clause.resourceId && String(clause.resourceId).trim() !== resource.id) {
      throw new Error(`Clause ${idx + 1}: resourceId "${clause.resourceId}" is not the single target resource`);
    }
    if (!allowedFields.has(field)) {
      throw new Error(`Clause ${idx + 1}: field "${field}" is not available for Resource A`);
    }
    if (compare === "field" && !allowedFields.has(refField)) {
      throw new Error(`Clause ${idx + 1}: refField "${refField}" is not available for Resource A`);
    }

    return {
      side: "A",
      resourceId: resource.id,
      field,
      op: clause.op,
      compare,
      value: clause.value ?? "",
      refField,
      ...(compare === "field" ? { refResourceId: resource.id } : {}),
    };
  });
}

function sanitizePairClauses(clauses, resources) {
  const resourceA = resources[0] || { id: "A", fields: [] };
  const resourceB = resources[1] || { id: "B", fields: [] };
  const allowedFieldsA = new Set(resourceA.fields || []);
  const allowedFieldsB = new Set(resourceB.fields || []);
  const sideIds = getPairSideResourceIds(resources);

  function buildPairResult({ side, field, op, compare, value, refField }) {
    return {
      side,
      resourceId: side === "A" ? sideIds.A : sideIds.B,
      field,
      op,
      compare,
      value,
      refField,
      ...(compare === "field"
        ? { refResourceId: side === "A" ? sideIds.B : sideIds.A }
        : {}),
    };
  }

  return clauses.map((clause, idx) => {
    validateBaseClause(clause, idx);

    const field = normalizeField(clause.field);
    const refField = normalizeField(clause.refField ?? "");
    const compare = clause.compare;
    const value = clause.value ?? "";

    const fieldIsA = allowedFieldsA.has(field);
    const fieldIsB = allowedFieldsB.has(field);
    const refIsA = allowedFieldsA.has(refField);
    const refIsB = allowedFieldsB.has(refField);

    const resourceSide = getPairSideForResourceId(resources, clause.resourceId);
    const refResourceSide = getPairSideForResourceId(resources, clause.refResourceId);
    let side = resourceSide || clause.side;

    if (clause.side && !ALLOWED_SIDE.includes(clause.side)) {
      throw new Error(`Clause ${idx + 1}: invalid side`);
    }
    if (clause.resourceId && !resourceSide) {
      throw new Error(`Clause ${idx + 1}: resourceId "${clause.resourceId}" is not part of this pair rule`);
    }
    if (clause.refResourceId && !refResourceSide) {
      throw new Error(`Clause ${idx + 1}: refResourceId "${clause.refResourceId}" is not part of this pair rule`);
    }
    if (clause.side && resourceSide && clause.side !== resourceSide) {
      throw new Error(`Clause ${idx + 1}: side and resourceId refer to different pair resources`);
    }
    if (!fieldIsA && !fieldIsB) {
      throw new Error(`Clause ${idx + 1}: field "${field}" is not available for Resource A or B`);
    }

    if (compare === "value") {
      if (fieldIsA && !fieldIsB) side = "A";
      else if (fieldIsB && !fieldIsA) side = "B";
      else if (!ALLOWED_SIDE.includes(side)) side = "A";

      if (side === "A" && !fieldIsA) {
        throw new Error(`Clause ${idx + 1}: field "${field}" is not available for Resource A`);
      }
      if (side === "B" && !fieldIsB) {
        throw new Error(`Clause ${idx + 1}: field "${field}" is not available for Resource B`);
      }

      return buildPairResult({ side, field, op: clause.op, compare, value, refField });
    }

    if (!refField) {
      throw new Error(`Clause ${idx + 1}: missing refField for field comparison`);
    }
    if (!refIsA && !refIsB) {
      throw new Error(`Clause ${idx + 1}: refField "${refField}" is not available for Resource A or B`);
    }

    const canBeA = fieldIsA && refIsB;
    const canBeB = fieldIsB && refIsA;

    function tryBuild(candidateSide) {
      const expectedRefSide = candidateSide === "A" ? "B" : "A";
      if (resourceSide && resourceSide !== candidateSide) return null;
      if (refResourceSide && refResourceSide !== expectedRefSide) return null;
      return buildPairResult({
        side: candidateSide,
        field,
        op: clause.op,
        compare,
        value,
        refField,
      });
    }

    if (side === "A" && canBeA) {
      const result = tryBuild("A");
      if (result) return result;
    }
    if (side === "B" && canBeB) {
      const result = tryBuild("B");
      if (result) return result;
    }
    if (canBeA && !canBeB) {
      const result = tryBuild("A");
      if (result) return result;
    }
    if (canBeB && !canBeA) {
      const result = tryBuild("B");
      if (result) return result;
    }
    if (canBeA && canBeB) {
      const preferredSide = ALLOWED_SIDE.includes(side) ? side : "A";
      const preferred = tryBuild(preferredSide);
      if (preferred) return preferred;
      const fallback = tryBuild(preferredSide === "A" ? "B" : "A");
      if (fallback) return fallback;
    }

    if (fieldIsA && refIsA && !fieldIsB && !refIsB) {
      throw new Error(
        `Clause ${idx + 1}: both fields belong to Resource A. For pair rules, the comparison must use one field from A and one from B`
      );
    }
    if (fieldIsB && refIsB && !fieldIsA && !refIsA) {
      throw new Error(
        `Clause ${idx + 1}: both fields belong to Resource B. For pair rules, the comparison must use one field from A and one from B`
      );
    }
    if (fieldIsA && !refIsB) {
      throw new Error(`Clause ${idx + 1}: refField "${refField}" must come from Resource B`);
    }
    if (fieldIsB && !refIsA) {
      throw new Error(`Clause ${idx + 1}: refField "${refField}" must come from Resource A`);
    }
    throw new Error(`Clause ${idx + 1}: invalid cross-resource comparison`);
  });
}

function resolveMultiResourceId({
  idx,
  rawResourceId,
  field,
  byId,
  fieldOwners,
  label,
  hintName,
}) {
  const resourceId = String(rawResourceId || "").trim();
  if (resourceId) {
    const resource = byId.get(resourceId);
    if (!resource) {
      throw new Error(`Clause ${idx + 1}: ${hintName} "${resourceId}" is not one of the provided resources`);
    }
    if (!resource.fields.includes(field)) {
      throw new Error(`Clause ${idx + 1}: ${label} "${field}" is not available for resource "${resourceId}"`);
    }
    return resource.id;
  }

  const owners = Array.from(fieldOwners.get(field) || []);
  if (!owners.length) {
    throw new Error(`Clause ${idx + 1}: ${label} "${field}" is not available for any provided resource`);
  }
  if (owners.length === 1) return owners[0];

  throw new Error(
    `Clause ${idx + 1}: ${label} "${field}" exists on multiple resources. Provide ${hintName} explicitly`
  );
}

function sanitizeMultiClauses(clauses, resources) {
  const { byId, fieldOwners } = buildResourceLookup(resources);

  return clauses.map((clause, idx) => {
    validateBaseClause(clause, idx);

    const field = normalizeField(clause.field);
    const refField = normalizeField(clause.refField ?? "");
    const compare = clause.compare;
    const value = clause.value ?? "";

    const resourceId = resolveMultiResourceId({
      idx,
      rawResourceId: getLegacyResourceHint(clause, resources),
      field,
      byId,
      fieldOwners,
      label: "field",
      hintName: "resourceId",
    });

    if (compare === "value") {
      return {
        resourceId,
        field,
        op: clause.op,
        compare,
        value,
        refField,
      };
    }

    if (!refField) {
      throw new Error(`Clause ${idx + 1}: missing refField for field comparison`);
    }

    const refResourceId = resolveMultiResourceId({
      idx,
      rawResourceId: getLegacyRefResourceHint(clause, resources),
      field: refField,
      byId,
      fieldOwners,
      label: "refField",
      hintName: "refResourceId",
    });

    return {
      resourceId,
      field,
      op: clause.op,
      compare,
      value,
      refField,
      refResourceId,
    };
  });
}

export function sanitizeClauses(clauses, { target, resources = [] }) {
  if (!Array.isArray(clauses) || !clauses.length) {
    throw new Error("No clauses returned by LLM");
  }

  if (target === "pair") return sanitizePairClauses(clauses, resources);
  if (target === "multi") return sanitizeMultiClauses(clauses, resources);
  return sanitizeSingleClauses(clauses, resources);
}

function buildPrompt({ sentence, target, resources }) {
  const lines = [
    "You are a rule parser. Convert the user sentence into structured rule clauses.",
    "Use only the provided resources and field lists.",
    "Use raw field names like 'metadata.capacity' or 'metadata.students_number' without resource path prefixes.",
    "If the sentence implies comparing one field to another, use compare=field and set refField.",
    "For compare=value, keep refField as an empty string unless the comparison explicitly needs a field.",
    "If the sentence implies a boolean like 'no computers', set value=false.",
    "Split multiple conditions connected by 'and' into separate clauses.",
    "If the sentence is unclear or missing info, respond with status='clarify' and add 1-3 short questions.",
    "The user may write in Hebrew. You must still output JSON using English field names from the allowed lists.",
    "Never invent resources, resource ids, or fields.",
    "Every clause object must include side, resourceId, field, op, compare, value, refField, and refResourceId. Use null when side/resourceId/refResourceId do not apply.",
    "Output only JSON that matches the schema.",
    "",
    `Target: ${target}`,
  ];

  if (target === "single") {
    lines.push("This is a single-resource rule. Use the only provided resource.");
    lines.push("If you set side, it must be 'A'. If you set resourceId, it must be the only resource id.");
  } else if (target === "pair") {
    lines.push("This is a pair rule with exactly two resources.");
    lines.push("Prefer side='A' for the first resource and side='B' for the second resource.");
    lines.push("For pair rules, if side='A' then field must be from A and refField must be from B.");
    lines.push("For pair rules, if side='B' then field must be from B and refField must be from A.");
  } else {
    lines.push("This is a multi-resource rule.");
    lines.push("Set resourceId to the resource that owns field.");
    lines.push("When compare=field, also set refResourceId to the resource that owns refField.");
  }

  lines.push("");
  lines.push("Resources:");
  resources.forEach((resource, index) => {
    lines.push(
      `${index + 1}. id=${resource.id}; name=${resource.name || resource.id}; allowed fields: ${(resource.fields || []).join(", ")}`
    );
  });
  lines.push("");
  lines.push(`User sentence: ${sentence}`);
  return lines.join("\n");
}

export async function parseRuleSentence({
  sentence,
  target,
  resources = [],
  typeAName,
  typeBName,
  fieldsA = [],
  fieldsB = [],
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const normalizedResources = normalizeRuleResources({
    resources,
    typeAName,
    typeBName,
    fieldsA,
    fieldsB,
  });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const schema = buildSchema();
  const prompt = buildPrompt({ sentence, target, resources: normalizedResources });

  const response = await client.responses.create({
    model: DEFAULT_MODEL,
    input: [
      { role: "system", content: "You are a strict JSON-only parser." },
      { role: "user", content: prompt },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "rule_clauses",
        schema,
        strict: true,
      },
    },
  });

  const text = response.output_text?.trim();
  if (!text) throw new Error("LLM returned empty output");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("LLM returned invalid JSON");
  }

  if (parsed.status === "clarify") {
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    return { status: "clarify", clauses: [], questions };
  }

  const rawClauses = Array.isArray(parsed.clauses) ? parsed.clauses : [];
  const missingValueQuestions = [];
  for (const [idx, clause] of rawClauses.entries()) {
    if (!clause || typeof clause !== "object") continue;
    const compare = clause.compare;
    const value = clause.value;
    const refField = clause.refField;
    if (compare === "value" && (value === "" || value === null || typeof value === "undefined")) {
      missingValueQuestions.push(`Clause ${idx + 1}: what value should this compare to?`);
    }
    if (compare === "field" && (!refField || String(refField).trim() === "")) {
      missingValueQuestions.push(`Clause ${idx + 1}: which field should it compare to?`);
    }
  }
  if (missingValueQuestions.length) {
    return { status: "clarify", clauses: [], questions: missingValueQuestions };
  }

  const clauses = sanitizeClauses(rawClauses, {
    target,
    resources: normalizedResources,
  });
  return { status: "ok", clauses, questions: [] };
}
