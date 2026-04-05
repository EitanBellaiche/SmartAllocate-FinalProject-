import OpenAI from "openai";

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
            side: { type: "string", enum: ALLOWED_SIDE },
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
          },
          required: ["side", "field", "op", "compare", "value", "refField"],
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

function sanitizeClauses(clauses, { target, fieldsA, fieldsB }) {
  if (!Array.isArray(clauses) || !clauses.length) {
    throw new Error("No clauses returned by LLM");
  }

  const allowedFieldsA = new Set(fieldsA || []);
  const allowedFieldsB = new Set(fieldsB || []);

  const normalizeField = (raw) => {
    const value = String(raw || "");
    if (allowedFieldsA.has(value) || allowedFieldsB.has(value)) return value;
    if (value.startsWith("resource.")) return value.replace(/^resource\./, "");
    if (value.startsWith("resources_by_type_id.")) {
      return value.replace(/^resources_by_type_id\\.[^\\.]+\\./, "");
    }
    return value;
  };

  return clauses.map((clause, idx) => {
    if (!clause || typeof clause !== "object") throw new Error(`Clause ${idx + 1} is invalid`);
    let side = clause.side;
    let field = normalizeField(clause.field);
    const op = clause.op;
    const compare = clause.compare;
    const value = clause.value ?? "";
    let refField = normalizeField(clause.refField ?? "");

    if (!ALLOWED_SIDE.includes(side)) throw new Error(`Clause ${idx + 1}: invalid side`);
    if (!ALLOWED_OPS.includes(op)) throw new Error(`Clause ${idx + 1}: invalid operator`);
    if (!ALLOWED_COMPARE.includes(compare)) throw new Error(`Clause ${idx + 1}: invalid compare type`);

    if (side === "A") {
      if (!allowedFieldsA.has(field)) throw new Error(`Clause ${idx + 1}: field not allowed for A`);
    } else {
      if (target !== "pair") throw new Error(`Clause ${idx + 1}: side B not allowed for single target`);
      if (!allowedFieldsB.has(field)) throw new Error(`Clause ${idx + 1}: field not allowed for B`);
    }

    if (compare === "field") {
      if (target !== "pair") {
        if (side !== "A") throw new Error(`Clause ${idx + 1}: side B not allowed for single target`);
        if (!allowedFieldsA.has(refField)) {
          throw new Error(`Clause ${idx + 1}: refField not allowed for Resource A`);
        }
        return {
          side,
          field,
          op,
          compare,
          value,
          refField,
        };
      }

      const refIsA = allowedFieldsA.has(refField);
      const refIsB = allowedFieldsB.has(refField);

      if (!refIsA && !refIsB) {
        throw new Error(`Clause ${idx + 1}: refField not allowed for A or B`);
      }

      if (side === "A" && !refIsB && refIsA) {
        if (allowedFieldsB.has(field)) {
          // flip to make it cross-side
          side = "B";
          const prevField = field;
          field = refField;
          refField = prevField;
        } else {
          throw new Error(`Clause ${idx + 1}: refField must be from Resource B fields`);
        }
      }
      if (side === "B" && !refIsA && refIsB) {
        if (allowedFieldsA.has(field)) {
          side = "A";
          const prevField = field;
          field = refField;
          refField = prevField;
        } else {
          throw new Error(`Clause ${idx + 1}: refField must be from Resource A fields`);
        }
      }
    }

    return {
      side,
      field,
      op,
      compare,
      value,
      refField,
    };
  });
}

function buildPrompt({ sentence, target, typeAName, typeBName, fieldsA, fieldsB }) {
  const lines = [
    "You are a rule parser. Convert the user sentence into structured rule clauses.",
    "Use only the provided field lists.",
    "If the sentence implies comparing one field to another, use compare=field and set refField.",
    "Field naming: use raw field names like 'metadata.capacity' or 'metadata.students_number' (no 'resource.' prefixes).",
    "For single-target rules, side must be 'A' and refField must also be from the A list.",
    "For pair-target rules, if side='A' then field must be from A list and refField must be from B list.",
    "For pair-target rules, if side='B' then field must be from B list and refField must be from A list.",
    "If the sentence implies a boolean like 'no computers', set value=false.",
    "Split multiple conditions connected by 'and' into separate clauses.",
    "If the sentence is unclear or missing info, respond with status='clarify' and add 1-3 short questions.",
    "The user may write in Hebrew. You must still output JSON using English field names from the allowed lists.",
    "Never invent fields.",
    "Output only JSON that matches the schema.",
    "",
    `Target: ${target}`,
    `Resource A type: ${typeAName || "A"}`,
  ];
  if (target === "pair") lines.push(`Resource B type: ${typeBName || "B"}`);
  lines.push("");
  lines.push(`Allowed fields for A: ${fieldsA.join(", ")}`);
  if (target === "pair") lines.push(`Allowed fields for B: ${fieldsB.join(", ")}`);
  lines.push("");
  lines.push(`User sentence: ${sentence}`);
  return lines.join("\n");
}

export async function parseRuleSentence({
  sentence,
  target,
  typeAName,
  typeBName,
  fieldsA = [],
  fieldsB = [],
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const schema = buildSchema();
  const prompt = buildPrompt({ sentence, target, typeAName, typeBName, fieldsA, fieldsB });

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

  const clauses = sanitizeClauses(rawClauses, { target, fieldsA, fieldsB });
  return { status: "ok", clauses, questions: [] };
}
