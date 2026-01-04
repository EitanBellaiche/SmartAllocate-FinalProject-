function toNumberIfPossible(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function getValueByPath(obj, path) {
  if (!path || !obj) return undefined;
  const parts = String(path).split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function resolveRefPath(path) {
  if (!path) return path;
  if (path.startsWith("request.")) return path.replace(/^request\./, "booking.");
  return path;
}

function resolveValue(rawValue, context) {
  if (rawValue && typeof rawValue === "object" && "ref" in rawValue) {
    const refPath = resolveRefPath(rawValue.ref);
    return getValueByPath(context, refPath);
  }
  return rawValue;
}

function compareValues(op, left, right) {
  const leftNum = toNumberIfPossible(left);
  const rightNum = toNumberIfPossible(right);
  const bothNumeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);

  if (op === "contains") {
    if (Array.isArray(left)) return left.includes(right);
    if (typeof left === "string") return left.includes(String(right));
    return false;
  }
  if (op === "in") {
    if (Array.isArray(right)) return right.includes(left);
    return false;
  }
  if (op === "overlap") {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return left.some((item) => right.includes(item));
  }

  if (["<", "<=", ">", ">="].includes(op)) {
    if (!bothNumeric) return false;
    if (op === "<") return leftNum < rightNum;
    if (op === "<=") return leftNum <= rightNum;
    if (op === ">") return leftNum > rightNum;
    if (op === ">=") return leftNum >= rightNum;
  }

  if (op === "==" || op === "eq") {
    return bothNumeric ? leftNum === rightNum : left === right;
  }
  if (op === "!=" || op === "ne") {
    return bothNumeric ? leftNum !== rightNum : left !== right;
  }
  if (op === "exists") return left !== undefined && left !== null;

  return false;
}

function evaluateClause(clause, context) {
  if (!clause || typeof clause !== "object") return false;
  if ("all" in clause || "any" in clause || "not" in clause) {
    return evaluateCondition(clause, context);
  }

  const left = getValueByPath(context, resolveRefPath(clause.field));
  const right = resolveValue(clause.value, context);
  const op = clause.op;

  return compareValues(op, left, right);
}

function evaluateCondition(condition, context) {
  if (!condition || typeof condition !== "object") return true;
  if (Array.isArray(condition.all)) {
    return condition.all.every((c) => evaluateClause(c, context));
  }
  if (Array.isArray(condition.any)) {
    return condition.any.some((c) => evaluateClause(c, context));
  }
  if ("not" in condition) {
    return !evaluateClause(condition.not, context);
  }

  return evaluateClause(condition, context);
}

function getActionEffect(rule) {
  if (rule?.action?.effect) return rule.action.effect;
  return rule?.is_hard ? "forbid" : "score";
}

function getScoreDelta(rule) {
  if (rule?.action?.effect !== "score") return 0;
  if (Number.isFinite(Number(rule?.action?.delta))) return Number(rule.action.delta);
  if (Number.isFinite(Number(rule?.weight))) return Number(rule.weight);
  return 0;
}

function evaluateRulesForContext(rules, context, resourceId = null) {
  const hardViolations = [];
  const softMatches = [];
  const alerts = [];
  let score = 0;

  for (const rule of rules) {
    if (!rule?.is_active) continue;
    if (!evaluateCondition(rule.condition, context)) continue;

    const effect = getActionEffect(rule);
    if (effect === "forbid") {
      hardViolations.push({
        id: rule.id,
        name: rule.name,
        target_type: rule.target_type,
        resource_id: resourceId,
      });
      continue;
    }

    if (effect === "alert" || effect === "require_approval") {
      alerts.push({
        id: rule.id,
        name: rule.name,
        target_type: rule.target_type,
        resource_id: resourceId,
        effect,
      });
      continue;
    }

    if (effect === "score") {
      const delta = getScoreDelta(rule);
      score += delta;
      softMatches.push({
        id: rule.id,
        name: rule.name,
        target_type: rule.target_type,
        resource_id: resourceId,
        delta,
      });
    }
  }

  return { hardViolations, softMatches, alerts, score };
}

export function evaluateRules({ rules, booking, resources, roles }) {
  const bookingRules = rules.filter((r) => r.target_type === "booking");
  const resourceRules = rules.filter((r) => r.target_type === "resource");
  const pairRules = rules.filter((r) => r.target_type === "pair");

  const results = {
    hardViolations: [],
    softMatches: [],
    alerts: [],
    score: 0,
  };

  const bookingContext = { booking, request: booking };
  const bookingEval = evaluateRulesForContext(bookingRules, bookingContext, null);
  results.hardViolations.push(...bookingEval.hardViolations);
  results.softMatches.push(...bookingEval.softMatches);
  results.alerts.push(...bookingEval.alerts);
  results.score += bookingEval.score;

  for (const resource of resources) {
    const role = roles?.[resource.id] ?? null;
    const context = {
      booking,
      request: booking,
      resource,
      pair: { resource_id: resource.id, role },
    };

    const resourceEval = evaluateRulesForContext(resourceRules, context, resource.id);
    const pairEval = evaluateRulesForContext(pairRules, context, resource.id);

    results.hardViolations.push(...resourceEval.hardViolations, ...pairEval.hardViolations);
    results.softMatches.push(...resourceEval.softMatches, ...pairEval.softMatches);
    results.alerts.push(...resourceEval.alerts, ...pairEval.alerts);
    results.score += resourceEval.score + pairEval.score;
  }

  return results;
}
