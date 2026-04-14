import { evaluateRules } from "../../rulesEngine.js";

function describeViolation(violation, resources = []) {
  const resourceId = Number(violation?.resource_id);
  const matchedResource = resources.find((resource) => Number(resource.id) === resourceId);
  return {
    id: violation?.id ?? null,
    name: violation?.name || "Unknown rule",
    description: violation?.description || "",
    target_type: violation?.target_type || "",
    resource_id: Number.isFinite(resourceId) ? resourceId : null,
    resource_name: matchedResource?.name || null,
    resource_type: matchedResource?.type_name || null,
  };
}

function describeAlerts(alerts = [], resources = []) {
  return alerts.map((alert) => describeViolation(alert, resources));
}

function describeRuleTrace(trace) {
  return {
    id: trace?.id ?? null,
    name: trace?.name || "Unnamed rule",
    description: trace?.description || "",
    target_type: trace?.target_type || "",
    resource_id: Number.isFinite(Number(trace?.resource_id)) ? Number(trace.resource_id) : null,
    effect: trace?.effect || "score",
    status: trace?.status || "not_matched",
    matched: Boolean(trace?.matched),
    delta: Number.isFinite(Number(trace?.matched ? trace?.delta : 0))
      ? Number(trace.matched ? trace.delta : 0)
      : 0,
    potential_delta: Number.isFinite(Number(trace?.delta)) ? Number(trace.delta) : 0,
  };
}

async function loadExplainableCandidateRowsByTypeIds(client, typeIds, orgId) {
  if (!typeIds.length) return [];
  const params = [typeIds];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT r.*, rt.name AS type_name
    FROM resources r
    JOIN resource_types rt ON rt.id = r.type_id
    WHERE r.type_id = ANY($1)
      AND COALESCE(r.active, true) = true
      ${orgWhere}
    ORDER BY r.type_id ASC, LOWER(r.name) ASC, r.id ASC
    `,
    params
  );
  return rows;
}

async function loadConflictingResourceIds(client, resourceIds, date, startTime, endTime, orgId) {
  if (!resourceIds.length) return new Set();
  const params = [resourceIds, date, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT DISTINCT br.resource_id
    FROM booking_resources br
    JOIN bookings b ON b.id = br.booking_id
    JOIN resources r ON r.id = br.resource_id
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    WHERE br.resource_id = ANY($1)
      AND b.date = $2
      AND bc.booking_id IS NULL
      ${orgWhere}
      AND (
        ($3 >= b.start_time AND $3 < b.end_time) OR
        ($4 > b.start_time AND $4 <= b.end_time) OR
        ($3 <= b.start_time AND $4 >= b.end_time)
      )
    `,
    params
  );
  return new Set(
    rows
      .map((row) => Number(row.resource_id))
      .filter((id) => Number.isFinite(id))
  );
}

function buildSelectedRuleBreakdown(evaluation) {
  return (evaluation?.ruleTraces || [])
    .filter((trace) => trace?.effect === "score" && trace?.matched)
    .map((trace) => describeRuleTrace(trace))
    .sort((left, right) => {
      const deltaGap = Math.abs(Number(right.delta || 0)) - Math.abs(Number(left.delta || 0));
      if (deltaGap !== 0) return deltaGap;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });
}

function sortCandidates(left, right) {
  if (left.is_selected !== right.is_selected) return left.is_selected ? -1 : 1;
  if (left.state !== right.state) {
    const order = { selected: 0, valid: 1, blocked: 2 };
    return (order[left.state] ?? 99) - (order[right.state] ?? 99);
  }
  if (right.final_score !== left.final_score) return right.final_score - left.final_score;
  return String(left.name || "").localeCompare(String(right.name || ""));
}

async function buildCandidateGroupSummaries({
  client,
  orgId,
  bookingDate,
  startTime,
  endTime,
  userId,
  resources,
  candidateTypeIds,
  rules,
  roles,
  maxCandidatesPerType = 16,
  maxAlternativesPerType = 3,
  maxRulesPerCandidate = 4,
}) {
  const normalizedTypeIds = Array.from(
    new Set(
      (Array.isArray(candidateTypeIds) ? candidateTypeIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    )
  );
  if (normalizedTypeIds.length === 0) return [];

  const allResources = Array.isArray(resources) ? resources : [];
  const selectedIdSet = new Set(
    allResources
      .map((resource) => Number(resource?.id))
      .filter((id) => Number.isFinite(id))
  );
  const explainableRows = await loadExplainableCandidateRowsByTypeIds(client, normalizedTypeIds, orgId);
  const groups = [];

  for (const typeId of normalizedTypeIds) {
    const selectedForType = allResources.find(
      (resource) => Number(resource?.type_id) === Number(typeId) && selectedIdSet.has(Number(resource?.id))
    );
    if (!selectedForType) continue;

    const comparisonBase = allResources.filter((resource) => Number(resource?.id) !== Number(selectedForType.id));
    const comparisonBaseIds = comparisonBase
      .map((resource) => Number(resource?.id))
      .filter((id) => Number.isFinite(id));
    const candidatesForType = explainableRows
      .filter((resource) => Number(resource?.type_id) === Number(typeId))
      .filter((resource) => !comparisonBaseIds.includes(Number(resource?.id)))
      .slice(0, maxCandidatesPerType);

    const conflictingResourceIds = await loadConflictingResourceIds(
      client,
      candidatesForType
        .map((resource) => Number(resource?.id))
        .filter((id) => Number.isFinite(id)),
      bookingDate,
      startTime,
      endTime,
      orgId
    );

    const evaluatedCandidates = candidatesForType.map((candidate) => {
      const candidateId = Number(candidate?.id);
      const candidateResources = [...comparisonBase, candidate];
      const evaluation = evaluateRules({
        rules,
        booking: {
          date: bookingDate,
          start_time: startTime,
          end_time: endTime,
          user_id: userId || null,
        },
        resources: candidateResources,
        roles,
      });
      const hasConflict = conflictingResourceIds.has(candidateId);
      const candidateState = hasConflict || evaluation.hardViolations.length > 0
        ? "blocked"
        : selectedIdSet.has(candidateId)
          ? "selected"
          : "valid";
      const scoreBreakdown = buildSelectedRuleBreakdown(evaluation).slice(0, maxRulesPerCandidate);

      return {
        resource_id: candidateId,
        name: candidate?.name || "Unnamed resource",
        type_id: Number(candidate?.type_id),
        type_name: candidate?.type_name || "",
        is_selected: selectedIdSet.has(candidateId),
        state: candidateState,
        final_score: Number(evaluation.score || 0),
        score_breakdown: scoreBreakdown,
      };
    });

    evaluatedCandidates.sort(sortCandidates);
    const validCandidates = evaluatedCandidates.filter((candidate) => candidate.state !== "blocked");
    const selectedCandidate = evaluatedCandidates.find((candidate) => candidate.is_selected) || null;

    groups.push({
      type_id: Number(typeId),
      type_name:
        selectedCandidate?.type_name ||
        selectedForType?.type_name ||
        `Type ${typeId}`,
      selected_resource_id: selectedCandidate?.resource_id ?? Number(selectedForType.id),
      selected_resource_name: selectedCandidate?.name || selectedForType?.name || "Selected resource",
      selected_score: selectedCandidate?.final_score ?? null,
      best_valid_score:
        validCandidates.length > 0
          ? Math.max(...validCandidates.map((candidate) => Number(candidate.final_score || 0)))
          : null,
      valid_candidates: validCandidates.length,
      blocked_candidates: evaluatedCandidates.filter((candidate) => candidate.state === "blocked").length,
      top_alternatives: validCandidates
        .filter((candidate) => !candidate.is_selected)
        .slice(0, maxAlternativesPerType),
    });
  }

  return groups;
}

export async function buildAutoScheduleDecisionExplanation({
  client,
  orgId,
  bookingDate,
  startTime,
  endTime,
  userId,
  resources,
  candidateTypeIds,
  rules,
  roles = {},
  evaluation,
}) {
  const selectedResources = (Array.isArray(resources) ? resources : []).map((resource) => ({
    id: Number(resource?.id),
    name: resource?.name || "Unnamed resource",
    type_id: Number(resource?.type_id),
    type_name: resource?.type_name || "",
  }));
  const candidateGroups = await buildCandidateGroupSummaries({
    client,
    orgId,
    bookingDate,
    startTime,
    endTime,
    userId,
    resources,
    candidateTypeIds,
    rules,
    roles,
  });

  return {
    score: Number(evaluation?.score || 0),
    selected_resources: selectedResources,
    score_breakdown: buildSelectedRuleBreakdown(evaluation),
    alerts: describeAlerts(evaluation?.alerts || [], resources),
    candidate_groups: candidateGroups,
  };
}
