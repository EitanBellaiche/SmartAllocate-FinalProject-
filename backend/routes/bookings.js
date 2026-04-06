import express from "express";
import pool from "../db.js";
import { evaluateRules } from "../rulesEngine.js";

const router = express.Router();
let tableReady = false;

function getOrgId(req) {
  const value =
    req.query?.org_id ||
    req.query?.organization_id ||
    req.body?.org_id ||
    req.body?.organization_id;
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

async function ensureTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_cancellations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      cancelled_reason TEXT,
      cancelled_by TEXT,
      cancelled_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_locations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      location TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      resource_name TEXT,
      sender_name TEXT,
      target_user_id TEXT,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS resource_name TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sender_name TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_user_id TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  tableReady = true;
}

function normalizeMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractUserIds(meta) {
  if (!meta || typeof meta !== "object") return [];
  const candidates = [
    meta.user_ids,
    meta.userIds,
    meta.users,
  ];
  const list = [];
  for (const value of candidates) {
    if (!value) continue;
    if (Array.isArray(value)) {
      list.push(...value);
    } else if (typeof value === "string") {
      list.push(...value.split(/[\s,]+/));
    }
  }
  return list.map((v) => String(v).trim()).filter(Boolean);
}

function hasAssignedUsers(meta) {
  if (extractUserIds(meta).length > 0) return true;
  const responsible =
    meta.responsible_user_id ||
    meta.responsibleUserId ||
    meta.responsible_id ||
    meta.responsibleId;
  return Boolean(responsible);
}

function getPrimaryResourceRows(rows) {
  const primary = rows.filter((row) => hasAssignedUsers(normalizeMetadata(row.resource_metadata)));
  return primary.length > 0 ? primary : rows;
}

function uniqueNumericIds(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    )
  );
}

function timeToMinutes(value) {
  const [h, m] = String(value || "")
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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

function describeResourceConflict(resource, bookingDate, startTime, endTime) {
  return {
    id: null,
    name: "Resource conflict",
    description: `${resource?.name || "This resource"} is already booked on ${bookingDate} at ${startTime}-${endTime}.`,
    target_type: "resource",
    resource_id: Number.isFinite(Number(resource?.id)) ? Number(resource.id) : null,
    resource_name: resource?.name || null,
    resource_type: resource?.type_name || null,
  };
}

async function loadExplainableCandidateRowsByTypeIds(client, typeIds, orgId, excludedResourceIds = []) {
  if (!typeIds.length) return [];
  const params = [typeIds];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  let exclusionWhere = "";
  if (excludedResourceIds.length > 0) {
    params.push(excludedResourceIds);
    exclusionWhere = `AND r.id <> ALL($${params.length})`;
  }
  const { rows } = await client.query(
    `
    SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
    FROM resources r
    JOIN resource_types rt ON rt.id = r.type_id
    WHERE r.type_id = ANY($1)
      AND COALESCE(r.active, true) = true
      ${orgWhere}
      ${exclusionWhere}
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

async function buildCandidateEvaluationDetails({
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
  selectedResourceIds = [],
  selectedEvaluation = null,
  maxCandidatesPerType = null,
  maxRulesPerCandidate = null,
  includeAlternatives = true,
  impactfulRulesOnly = false,
}) {
  const normalizedTypeIds = uniqueNumericIds(candidateTypeIds);
  if (normalizedTypeIds.length === 0) return null;

  const selectedIdSet = new Set(
    uniqueNumericIds(selectedResourceIds).map((id) => Number(id))
  );
  const allResources = Array.isArray(resources) ? resources : [];
  const explainableRows = await loadExplainableCandidateRowsByTypeIds(
    client,
    normalizedTypeIds,
    orgId,
    []
  );

  const candidateGroups = [];
  const alternatives = [];

  for (const typeId of normalizedTypeIds) {
    const selectedForType = allResources.find(
      (resource) =>
        Number(resource?.type_id) === Number(typeId) && selectedIdSet.has(Number(resource?.id))
    );
    const comparisonBase = selectedForType
      ? allResources.filter((resource) => Number(resource?.id) !== Number(selectedForType.id))
      : allResources.filter((resource) => Number(resource?.type_id) !== Number(typeId));
    const comparisonBaseIds = comparisonBase
      .map((resource) => Number(resource?.id))
      .filter((id) => Number.isFinite(id));
    const candidatesForType = explainableRows.filter((resource) => {
      if (Number(resource?.type_id) !== Number(typeId)) return false;
      return !comparisonBaseIds.includes(Number(resource?.id));
    });
    const boundedCandidatesForType = Number.isFinite(Number(maxCandidatesPerType))
      ? candidatesForType.slice(0, Number(maxCandidatesPerType))
      : candidatesForType;
    const conflictingResourceIds = await loadConflictingResourceIds(
      client,
      boundedCandidatesForType
        .map((resource) => Number(resource?.id))
        .filter((id) => Number.isFinite(id)),
      bookingDate,
      startTime,
      endTime,
      orgId
    );

    const evaluatedCandidates = [];
    for (const candidate of boundedCandidatesForType) {
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
      const blockingReasons = [
        ...(hasConflict ? [describeResourceConflict(candidate, bookingDate, startTime, endTime)] : []),
        ...evaluation.hardViolations.map((item) => describeViolation(item, candidateResources)),
      ];
      const candidateState = hasConflict || evaluation.hardViolations.length > 0
        ? "blocked"
        : selectedIdSet.has(candidateId)
          ? "selected"
          : "valid";
      const scoreBreakdown = (evaluation.ruleTraces || [])
        .filter((trace) => trace?.effect === "score")
        .map((trace) => describeRuleTrace(trace));
      const filteredScoreBreakdown = impactfulRulesOnly
        ? scoreBreakdown.filter(
            (trace) => trace.matched || Number(trace.delta) !== 0 || Number(trace.potential_delta) !== 0
          )
        : scoreBreakdown;
      const matchedScoreBreakdown = filteredScoreBreakdown.filter((trace) => trace.matched);
      const limitedScoreBreakdown = Number.isFinite(Number(maxRulesPerCandidate))
        ? matchedScoreBreakdown.slice(0, Number(maxRulesPerCandidate))
        : matchedScoreBreakdown;
      const alertBreakdown = describeAlerts(evaluation.alerts || [], candidateResources);
      const candidateDetails = {
        resource_id: candidateId,
        name: candidate?.name || "Unnamed resource",
        type_id: Number(candidate?.type_id),
        type_name: candidate?.type_name || "",
        state: candidateState,
        is_selected: selectedIdSet.has(candidateId),
        final_score: Number(evaluation.score || 0),
        blocking_reasons: blockingReasons,
        alerts: alertBreakdown,
        score_breakdown: limitedScoreBreakdown,
        total_score_rules: matchedScoreBreakdown.length,
      };

      evaluatedCandidates.push(candidateDetails);
      if (includeAlternatives && candidateState === "valid") {
        alternatives.push(candidateDetails);
      }
    }

    evaluatedCandidates.sort((left, right) => {
      if (left.is_selected !== right.is_selected) return left.is_selected ? -1 : 1;
      if (left.state !== right.state) {
        const order = { selected: 0, valid: 1, blocked: 2 };
        return (order[left.state] ?? 99) - (order[right.state] ?? 99);
      }
      if (right.final_score !== left.final_score) return right.final_score - left.final_score;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });

    const validCandidates = evaluatedCandidates.filter((candidate) => candidate.state !== "blocked");
    const selectedCandidate = evaluatedCandidates.find((candidate) => candidate.is_selected) || null;
    const hasPerfectMatch = validCandidates.some(
      (candidate) => !candidate.score_breakdown.some((item) => Number(item.delta) < 0)
    );
    candidateGroups.push({
      type_id: Number(typeId),
      type_name:
        selectedForType?.type_name ||
        candidatesForType[0]?.type_name ||
        `Type ${typeId}`,
      selected_resource_id: selectedCandidate?.resource_id ?? null,
      best_valid_score:
        validCandidates.length > 0
          ? Math.max(...validCandidates.map((candidate) => Number(candidate.final_score || 0)))
          : null,
      has_perfect_match: hasPerfectMatch,
      total_candidates: candidatesForType.length,
      shown_candidates: evaluatedCandidates.length,
      candidates: evaluatedCandidates,
    });
  }

  const selectedSummary = candidateGroups
    .map((group) => group.candidates.find((candidate) => candidate.is_selected))
    .filter(Boolean)
    .map((candidate) => ({
      resource_id: candidate.resource_id,
      name: candidate.name,
      type_id: candidate.type_id,
      type_name: candidate.type_name,
      final_score: candidate.final_score,
    }));

  return {
    summary: {
      selected_resource_ids: Array.from(selectedIdSet),
      selected_score: Number.isFinite(Number(selectedEvaluation?.score))
        ? Number(selectedEvaluation.score)
        : null,
      total_candidates: candidateGroups.reduce((sum, group) => sum + group.candidates.length, 0),
      valid_candidates: candidateGroups.reduce(
        (sum, group) => sum + group.candidates.filter((candidate) => candidate.state !== "blocked").length,
        0
      ),
      blocked_candidates: candidateGroups.reduce(
        (sum, group) => sum + group.candidates.filter((candidate) => candidate.state === "blocked").length,
        0
      ),
      has_perfect_match: candidateGroups.every((group) => group.has_perfect_match),
      selected_resources: selectedSummary,
    },
    candidate_groups: candidateGroups,
    alternatives: includeAlternatives
      ? alternatives
      .sort((left, right) => {
        if (right.final_score !== left.final_score) return right.final_score - left.final_score;
        return String(left.name || "").localeCompare(String(right.name || ""));
      })
      .slice(0, 6)
      : [],
  };
}

async function hasResourceConflict(client, resourceIds, date, startTime, endTime, orgId, excludeBookingId = null) {
  if (!resourceIds.length) return false;
  const params = [resourceIds, date, startTime, endTime];
  let excludeWhere = "";
  if (Number.isFinite(Number(excludeBookingId))) {
    params.push(Number(excludeBookingId));
    excludeWhere = `AND b.id <> $${params.length}`;
  }
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT b.id
    FROM booking_resources br
    JOIN bookings b ON b.id = br.booking_id
    JOIN resources r ON r.id = br.resource_id
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    WHERE br.resource_id = ANY($1)
    AND b.date = $2
    AND bc.booking_id IS NULL
    ${excludeWhere}
    ${orgWhere}
    AND (
      ($3 >= b.start_time AND $3 < b.end_time) OR
      ($4 > b.start_time AND $4 <= b.end_time) OR
      ($3 <= b.start_time AND $4 >= b.end_time)
    )
    LIMIT 1
    `,
    params
  );
  return rows.length > 0;
}

async function loadConflictingBookings(client, resourceIds, date, startTime, endTime, orgId) {
  if (!resourceIds.length) return [];
  const params = [resourceIds, date, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT
      b.id,
      b.user_id,
      b.date,
      b.start_time,
      b.end_time,
      br.role,
      r.id AS resource_id,
      r.name AS resource_name,
      r.type_id,
      rt.name AS type_name
    FROM booking_resources br
    JOIN bookings b ON b.id = br.booking_id
    JOIN resources r ON r.id = br.resource_id
    JOIN resource_types rt ON rt.id = r.type_id
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
    ORDER BY b.id ASC, r.id ASC
    `,
    params
  );

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        id: Number(row.id),
        user_id: row.user_id ? String(row.user_id) : null,
        date: row.date,
        start_time: row.start_time,
        end_time: row.end_time,
        resources: [],
      });
    }
    grouped.get(row.id).resources.push({
      id: Number(row.resource_id),
      name: row.resource_name,
      type_id: Number(row.type_id),
      type_name: row.type_name || "",
      role: row.role || null,
    });
  }

  return Array.from(grouped.values());
}

function summarizeBookingForConflict(booking) {
  return {
    id: Number(booking.id),
    user_id: booking.user_id ? String(booking.user_id) : null,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    resources: Array.isArray(booking.resources)
      ? booking.resources.map((resource) => ({
          id: Number(resource.id),
          name: resource.name,
          type_id: Number(resource.type_id),
          type_name: resource.type_name || "",
          role: resource.role || null,
        }))
      : [],
  };
}

async function loadResourceRowsByIds(client, resourceIds, orgId) {
  if (!resourceIds.length) return [];
  const params = [resourceIds];
  let where = "WHERE r.id = ANY($1)";
  if (orgId) {
    params.push(orgId);
    where = "WHERE r.id = ANY($1) AND r.organization_id = $2";
  }
  const { rows } = await client.query(
    `
    SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
    FROM resources r
    JOIN resource_types rt ON rt.id = r.type_id
    ${where}
    `,
    params
  );
  return rows;
}

async function loadCandidateRowsByTypeIds(client, typeIds, orgId, bookingDate, startTime, endTime, excludedResourceIds) {
  if (!typeIds.length) return [];
  const params = [typeIds, bookingDate, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  let exclusionWhere = "";
  if (excludedResourceIds.length > 0) {
    params.push(excludedResourceIds);
    exclusionWhere = `AND r.id <> ALL($${params.length})`;
  }
  const { rows } = await client.query(
    `
    SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
    FROM resources r
    JOIN resource_types rt ON rt.id = r.type_id
    WHERE r.type_id = ANY($1)
      AND COALESCE(r.active, true) = true
      ${orgWhere}
      ${exclusionWhere}
      AND NOT EXISTS (
        SELECT 1
        FROM booking_resources br
        JOIN bookings b ON b.id = br.booking_id
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        WHERE br.resource_id = r.id
          AND b.date = $2
          AND bc.booking_id IS NULL
          AND (
            ($3 >= b.start_time AND $3 < b.end_time) OR
            ($4 > b.start_time AND $4 <= b.end_time) OR
            ($3 <= b.start_time AND $4 >= b.end_time)
          )
      )
    ORDER BY r.type_id ASC, LOWER(r.name) ASC, r.id ASC
    `,
    params
  );
  return rows;
}

function pickBestResourceCombination({ fixedResources, candidatePools, rules, booking, roles }) {
  if (!candidatePools.length) {
    const evaluation = evaluateRules({ rules, booking, resources: fixedResources, roles });
    return evaluation.hardViolations.length > 0
      ? { best: null, bestBlocked: evaluation }
      : { best: { resources: [], evaluation } };
  }

  const preparedPools = candidatePools.map((pool) => {
    const scored = pool.candidates
      .map((candidate) => {
        const evaluation = evaluateRules({
          rules,
          booking,
          resources: [...fixedResources, candidate],
          roles,
        });
        return { candidate, evaluation };
      })
      .filter((entry) => entry.evaluation.hardViolations.length === 0)
      .sort((a, b) => {
        if (b.evaluation.score !== a.evaluation.score) {
          return b.evaluation.score - a.evaluation.score;
        }
        return Number(a.candidate.id) - Number(b.candidate.id);
      })
      .slice(0, 25)
      .map((entry) => entry.candidate);

    return {
      ...pool,
      candidates: scored.length > 0 ? scored : pool.candidates.slice(0, 25),
    };
  });

  let best = null;
  let bestBlocked = null;

  const search = (index, chosen) => {
    if (index >= preparedPools.length) {
      const resources = [...fixedResources, ...chosen];
      const evaluation = evaluateRules({ rules, booking, resources, roles });
      if (evaluation.hardViolations.length > 0) {
        if (!bestBlocked || evaluation.hardViolations.length < bestBlocked.hardViolations.length) {
          bestBlocked = evaluation;
        }
        return;
      }
      if (
        !best ||
        evaluation.score > best.evaluation.score ||
        (evaluation.score === best.evaluation.score &&
          resources.map((resource) => Number(resource.id)).join(",") <
            best.resources.map((resource) => Number(resource.id)).join(","))
      ) {
        best = { resources: [...chosen], evaluation };
      }
      return;
    }

    for (const candidate of preparedPools[index].candidates) {
      search(index + 1, [...chosen, candidate]);
    }
  };

  search(0, []);
  return { best, bestBlocked };
}

async function buildAlternativeSuggestions({
  client,
  orgId,
  bookingDate,
  startTime,
  endTime,
  resources,
  rules,
  booking,
  roles,
  limit = 3,
}) {
  if (!Array.isArray(resources) || resources.length === 0) return [];

  const suggestions = [];
  const seenKeys = new Set();

  for (let index = 0; index < resources.length; index += 1) {
    const original = resources[index];
    if (!original?.type_id) continue;
    if (["Courses", "Exam"].includes(String(original.type_name || ""))) continue;

    const excludedIds = resources
      .map((resource) => Number(resource.id))
      .filter((id) => Number.isFinite(id) && id !== Number(original.id));

    const candidates = await loadCandidateRowsByTypeIds(
      client,
      [Number(original.type_id)],
      orgId,
      bookingDate,
      startTime,
      endTime,
      excludedIds
    );

    for (const candidate of candidates) {
      if (Number(candidate.id) === Number(original.id)) continue;

      const nextResources = resources.map((resource, resourceIndex) =>
        resourceIndex === index ? candidate : resource
      );
      const resourceIds = nextResources
        .map((resource) => Number(resource.id))
        .filter((id) => Number.isFinite(id));
      const combinationKey = resourceIds.slice().sort((a, b) => a - b).join(",");
      if (!combinationKey || seenKeys.has(combinationKey)) continue;

      if (await hasResourceConflict(client, resourceIds, bookingDate, startTime, endTime, orgId)) {
        continue;
      }

      const evaluation = evaluateRules({
        rules,
        booking,
        resources: nextResources,
        roles,
      });
      if (evaluation.hardViolations.length > 0) continue;

      suggestions.push({
        score: evaluation.score,
        resource_ids: resourceIds,
        summary: `${original.name} -> ${candidate.name}`,
        why: `Replaces ${original.name} with ${candidate.name} to keep the same slot while improving the rule match.`,
        replaced_resource: {
          id: Number(original.id),
          name: original.name,
          type_id: Number(original.type_id),
          type_name: original.type_name || "",
        },
        suggested_resource: {
          id: Number(candidate.id),
          name: candidate.name,
          type_id: Number(candidate.type_id),
          type_name: candidate.type_name || "",
        },
        resources: nextResources.map((resource) => ({
          id: Number(resource.id),
          name: resource.name,
          type_id: Number(resource.type_id),
          type_name: resource.type_name || "",
        })),
        rule_summary: {
          score: evaluation.score,
          soft_matches: (evaluation.softMatches || []).map((match) => ({
            id: match?.id ?? null,
            name: match?.name || "",
            description: match?.description || "",
            delta: Number(match?.delta || 0),
            resource_id: match?.resource_id ?? null,
          })),
        },
      });
      seenKeys.add(combinationKey);
    }
  }

  return suggestions
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.summary.localeCompare(b.summary);
    })
    .slice(0, limit);
}

async function findUserConflict(client, userId, date, startTime, endTime, orgId) {
  if (!userId) return null;
  const params = [String(userId), date, startTime, endTime];
  let orgWhere = "";
  if (orgId) {
    params.push(orgId);
    orgWhere = `AND r.organization_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `
    SELECT b.id, b.date, b.start_time, b.end_time
    FROM bookings b
    LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
    LEFT JOIN booking_resources br ON br.booking_id = b.id
    LEFT JOIN resources r ON r.id = br.resource_id
    WHERE b.user_id::text = $1
    AND b.date = $2
    AND bc.booking_id IS NULL
    ${orgWhere}
    AND (
      ($3 >= b.start_time AND $3 < b.end_time) OR
      ($4 > b.start_time AND $4 <= b.end_time) OR
      ($3 <= b.start_time AND $4 >= b.end_time)
    )
    LIMIT 1
    `,
    params
  );
  return rows[0] || null;
}

async function buildTimeSlotSuggestions({
  client,
  orgId,
  bookingDate,
  startTime,
  endTime,
  userId,
  fixedResources,
  candidateTypeIds,
  rules,
  roles,
  limit = 3,
}) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return [];
  }

  const duration = endMinutes - startMinutes;
  const slots = [];
  const preferredOffsets = [-120, -90, -60, -30, 30, 60, 90, 120, -150, 150, -180, 180];
  const seenSlots = new Set();
  for (const offset of preferredOffsets) {
    const candidateStart = startMinutes + offset;
    const candidateEnd = candidateStart + duration;
    if (candidateStart < 0 || candidateEnd > 24 * 60) continue;
    if (candidateStart === startMinutes && candidateEnd === endMinutes) continue;
    const key = `${candidateStart}-${candidateEnd}`;
    if (seenSlots.has(key)) continue;
    seenSlots.add(key);
    slots.push({
      start_time: minutesToTime(candidateStart),
      end_time: minutesToTime(candidateEnd),
      distance: Math.abs(offset),
    });
  }

  const suggestions = [];

  for (const slot of slots) {
    if (userId) {
      const userConflict = await findUserConflict(
        client,
        userId,
        bookingDate,
        slot.start_time,
        slot.end_time,
        orgId
      );
      if (userConflict) continue;
    }

    let resolvedResourceRows = [...fixedResources];
    let resolvedResourceIds = resolvedResourceRows
      .map((resource) => Number(resource.id))
      .filter((id) => Number.isFinite(id));

    if (
      resolvedResourceIds.length > 0 &&
      (await hasResourceConflict(client, resolvedResourceIds, bookingDate, slot.start_time, slot.end_time, orgId))
    ) {
      continue;
    }

    if (candidateTypeIds.length > 0) {
      const candidateRows = await loadCandidateRowsByTypeIds(
        client,
        candidateTypeIds,
        orgId,
        bookingDate,
        slot.start_time,
        slot.end_time,
        resolvedResourceIds
      );
      const candidatePools = candidateTypeIds.map((typeId) => ({
        typeId,
        candidates: candidateRows.filter((resource) => Number(resource.type_id) === Number(typeId)),
      }));
      if (candidatePools.some((pool) => pool.candidates.length === 0)) continue;

      const { best } = pickBestResourceCombination({
        fixedResources: resolvedResourceRows,
        candidatePools,
        rules,
        booking: {
          date: bookingDate,
          start_time: slot.start_time,
          end_time: slot.end_time,
          user_id: userId,
        },
        roles,
      });
      if (!best) continue;

      resolvedResourceRows = [...resolvedResourceRows, ...best.resources];
      resolvedResourceIds = resolvedResourceRows
        .map((resource) => Number(resource.id))
        .filter((id) => Number.isFinite(id));

      if (
        await hasResourceConflict(client, resolvedResourceIds, bookingDate, slot.start_time, slot.end_time, orgId)
      ) {
        continue;
      }
    }

    const evaluation = evaluateRules({
      rules,
      booking: {
        date: bookingDate,
        start_time: slot.start_time,
        end_time: slot.end_time,
        user_id: userId,
      },
      resources: resolvedResourceRows,
      roles,
    });
    if (evaluation.hardViolations.length > 0) continue;

    suggestions.push({
      type: "timeslot",
      score: evaluation.score,
      distance_from_original: slot.distance ?? Math.abs((timeToMinutes(slot.start_time) ?? 0) - startMinutes),
      date: bookingDate,
      start_time: slot.start_time,
      end_time: slot.end_time,
      resource_ids: resolvedResourceIds,
      summary: `${bookingDate} ${slot.start_time}-${slot.end_time}`,
      why: "Keeps the same booking need but moves it to a time slot with a better valid rule match.",
      resources: resolvedResourceRows.map((resource) => ({
        id: Number(resource.id),
        name: resource.name,
        type_id: Number(resource.type_id),
        type_name: resource.type_name || "",
      })),
      rule_summary: {
        score: evaluation.score,
        soft_matches: (evaluation.softMatches || []).map((match) => ({
          id: match?.id ?? null,
          name: match?.name || "",
          description: match?.description || "",
          delta: Number(match?.delta || 0),
          resource_id: match?.resource_id ?? null,
        })),
      },
    });
  }

  return suggestions
    .sort((a, b) => {
      const aDistance = Number(a.distance_from_original ?? 9999);
      const bDistance = Number(b.distance_from_original ?? 9999);
      if (aDistance !== bDistance) return aDistance - bDistance;
      if (b.score !== a.score) return b.score - a.score;
      const aStart = timeToMinutes(a.start_time) ?? 0;
      const bStart = timeToMinutes(b.start_time) ?? 0;
      return aStart - bStart;
    })
    .slice(0, limit);
}

async function buildFailureSuggestions({
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
}) {
  const [resourceSuggestions, timeSuggestions] = await Promise.all([
    buildAlternativeSuggestions({
      client,
      orgId,
      bookingDate,
      startTime,
      endTime,
      resources,
      rules,
      booking: {
        date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        user_id: userId,
      },
      roles,
    }),
    buildTimeSlotSuggestions({
      client,
      orgId,
      bookingDate,
      startTime,
      endTime,
      userId,
      fixedResources: resources,
      candidateTypeIds,
      rules,
      roles,
    }),
  ]);

  return [...resourceSuggestions, ...timeSuggestions]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.summary || "").localeCompare(String(b.summary || ""));
    })
    .slice(0, 5);
}

async function buildConflictResolution({
  client,
  orgId,
  bookingDate,
  startTime,
  endTime,
  userId,
  resolvedResourceRows,
  candidateTypeIds,
  rules,
  roles,
}) {
  const conflictingBookings = await loadConflictingBookings(
    client,
    resolvedResourceRows.map((resource) => Number(resource.id)).filter((id) => Number.isFinite(id)),
    bookingDate,
    startTime,
    endTime,
    orgId
  );

  const moveNewSuggestions = await buildFailureSuggestions({
    client,
    orgId,
    bookingDate,
    startTime,
    endTime,
    userId,
    resources: resolvedResourceRows,
    candidateTypeIds,
    rules,
    roles,
  });

  let moveExisting = null;
  if (conflictingBookings.length === 1) {
    const existing = conflictingBookings[0];
    const existingResourceRows = await loadResourceRowsByIds(
      client,
      existing.resources.map((resource) => Number(resource.id)),
      orgId
    );
    const suggestions = await buildFailureSuggestions({
      client,
      orgId,
      bookingDate: existing.date,
      startTime: existing.start_time,
      endTime: existing.end_time,
      userId: existing.user_id,
      resources: existingResourceRows,
      candidateTypeIds: [],
      rules,
      roles: {},
    });
    moveExisting = {
      booking: summarizeBookingForConflict(existing),
      suggestions,
      can_auto_reassign: suggestions.length > 0,
    };
  }

  return {
    conflicting_bookings: conflictingBookings.map(summarizeBookingForConflict),
    move_new_suggestions: moveNewSuggestions,
    move_existing: moveExisting,
  };
}

async function reassignBookingWithSuggestion(client, bookingId, suggestion, orgId) {
  const nextResourceIds = uniqueNumericIds(suggestion?.resource_ids);
  const nextDate = String(suggestion?.date || "").trim();
  const nextStart = String(suggestion?.start_time || "").trim();
  const nextEnd = String(suggestion?.end_time || "").trim();
  if (!nextResourceIds.length || !nextDate || !nextStart || !nextEnd) {
    throw new Error("Missing reassignment details");
  }

  const { rows: bookingRows } = await client.query(
    `
    SELECT id, user_id
    FROM bookings
    WHERE id = $1
    `,
    [bookingId]
  );
  if (!bookingRows.length) {
    throw new Error("Conflicting booking not found");
  }
  const booking = bookingRows[0];

  if (booking.user_id) {
    const conflict = await findUserConflict(
      client,
      booking.user_id,
      nextDate,
      nextStart,
      nextEnd,
      orgId
    );
    if (conflict && Number(conflict.id) !== Number(bookingId)) {
      throw new Error("Displaced booking has no valid user slot");
    }
  }

  const resourceConflict = await hasResourceConflict(
    client,
    nextResourceIds,
    nextDate,
    nextStart,
    nextEnd,
    orgId,
    bookingId
  );
  if (resourceConflict) {
    throw new Error("Displaced booking has no valid resource slot");
  }

  await client.query(
    `
    UPDATE bookings
    SET date = $1, start_time = $2, end_time = $3
    WHERE id = $4
    `,
    [nextDate, nextStart, nextEnd, bookingId]
  );

  await client.query(`DELETE FROM booking_resources WHERE booking_id = $1`, [bookingId]);
  for (const resourceId of nextResourceIds) {
    await client.query(
      `
      INSERT INTO booking_resources (booking_id, resource_id, role)
      VALUES ($1, $2, $3)
      `,
      [bookingId, resourceId, null]
    );
  }
}

function suggestionsMatch(left, right) {
  if (!left || !right) return false;
  const leftIds = uniqueNumericIds(left.resource_ids).sort((a, b) => a - b);
  const rightIds = uniqueNumericIds(right.resource_ids).sort((a, b) => a - b);
  if (leftIds.length !== rightIds.length) return false;
  if (leftIds.some((id, index) => id !== rightIds[index])) return false;
  return (
    String(left.date || "") === String(right.date || "") &&
    String(left.start_time || "") === String(right.start_time || "") &&
    String(left.end_time || "") === String(right.end_time || "")
  );
}

router.use(async (req, res, next) => {
  try {
    await ensureTables();
    next();
  } catch (err) {
    console.error("Failed to init booking tables:", err);
    res.status(500).json({ error: "Booking service unavailable" });
  }
});

// GET bookings (optional filter by resource_id)
router.get("/", async (req, res) => {
  try {
    const { resource_id, include_details, user_id, national_id } = req.query;
    const orgId = getOrgId(req);
    const params = [];
    const conditions = [];
    const wantsDetails = include_details === "1" || include_details === "true";

    if (resource_id) {
      params.push(Number(resource_id));
      if (!Number.isFinite(params[0])) {
        return res.status(400).json({ error: "Invalid resource_id" });
      }
      conditions.push(`r.id = $${params.length}`);
    }

    const userIdValue = String(user_id || national_id || "").trim();
    if (userIdValue) {
      params.push(userIdValue);
      conditions.push(`b.user_id::text = $${params.length}`);
    }

    if (orgId) {
      params.push(orgId);
      conditions.push(`r.organization_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        bc.cancelled_at,
        bc.cancelled_reason,
        bc.cancelled_by,
        bl.location,
        json_agg(
          json_build_object(
            'id', r.id,
            'name', r.name,
            'type_id', r.type_id,
            'type_name', rt.name,
            'metadata', r.metadata,
            'role', br.role
          )
          ORDER BY r.id
        ) AS resources
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      LEFT JOIN booking_locations bl ON bl.booking_id = b.id
      ${where}
      GROUP BY b.id, bc.cancelled_at, bc.cancelled_reason, bc.cancelled_by, bl.location
      ORDER BY b.date ASC, b.start_time ASC, b.id ASC
      `,
      params
    );

    if (!wantsDetails) {
      const compact = rows.map((row) => ({
        ...row,
        resources: (row.resources || []).map((r) => ({
          id: r.id,
          name: r.name,
          type_id: r.type_id,
          role: r.role,
        })),
      }));
      return res.json(compact);
    }

    return res.json(rows);
  } catch (err) {
    console.error("Error getting bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

router.post("/preview", async (req, res) => {
  const {
    resources,
    resource_type_ids,
    roles,
    date,
    start_time,
    end_time,
    user_id,
  } = req.body || {};
  const orgId = getOrgId(req);
  const explicitResourceIds = uniqueNumericIds(resources);
  const candidateTypeIds = uniqueNumericIds(resource_type_ids);
  const bookingDate = String(date || "").trim();

  if (!bookingDate || !start_time || !end_time) {
    return res.status(400).json({ error: "Date, start_time, and end_time are required" });
  }
  if (explicitResourceIds.length === 0 && candidateTypeIds.length === 0) {
    return res.status(400).json({ error: "No resources or resource types provided" });
  }

  const client = await pool.connect();
  try {
    const roleMap = roles && typeof roles === "object" ? roles : {};
    const resourceRows = await loadResourceRowsByIds(client, explicitResourceIds, orgId);
    if (resourceRows.length !== explicitResourceIds.length) {
      return res.status(400).json({ error: "One or more resources not found" });
    }

    const ruleParams = [];
    let ruleWhere = "WHERE is_active = true";
    if (orgId) {
      ruleParams.push(orgId);
      ruleWhere += ` AND organization_id = $${ruleParams.length}`;
    }
    const { rows: ruleRows } = await client.query(
      `SELECT * FROM rules ${ruleWhere} ORDER BY sort_order ASC, id ASC`,
      ruleParams
    );

    const previewEvaluation = await buildCandidateEvaluationDetails({
      client,
      orgId,
      bookingDate,
      startTime: start_time,
      endTime: end_time,
      userId: user_id,
      resources: resourceRows,
      candidateTypeIds,
      rules: ruleRows,
      roles: roleMap,
      maxCandidatesPerType: 3,
      maxRulesPerCandidate: 3,
      includeAlternatives: false,
      impactfulRulesOnly: true,
    });

    res.json({
      resource_evaluation: previewEvaluation,
    });
  } catch (err) {
    console.error("Booking preview error:", err);
    res.status(500).json({ error: "Booking preview failed" });
  } finally {
    client.release();
  }
});

router.post("/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || "").trim();
  const senderName = String(req.body?.sender_name || "Manager").trim();
  const targetUserIdRaw = String(req.body?.target_user_id || "").trim();
  const targetUserId = targetUserIdRaw || null;
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid booking id" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const params = [id];
    let where = "WHERE b.id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE b.id = $1 AND r.organization_id = $2";
    }
    const { rows: bookingRows } = await client.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        r.id AS resource_id,
        r.name AS resource_name,
        r.metadata AS resource_metadata,
        rt.name AS type_name
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      ${where}
      `,
      params
    );

    if (bookingRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const { rows: existing } = await client.query(
      `SELECT id FROM booking_cancellations WHERE booking_id = $1`,
      [id]
    );
    if (existing.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Booking already cancelled" });
    }

    const primaryRows = getPrimaryResourceRows(bookingRows);
    const primaryNames = primaryRows.map((r) => r.resource_name).filter(Boolean);
    const fallbackNames = bookingRows.map((r) => r.resource_name).filter(Boolean);
    const resourceLabel =
      primaryNames.length > 0 ? primaryNames.join(" / ") : fallbackNames.join(" / ");
    const booking = bookingRows[0];

    const resourceIds = bookingRows.map((r) => r.resource_id).filter(Boolean);
    const primaryResourceIds = primaryRows
      .map((r) => r.resource_id)
      .filter(Boolean);
    const metadataUserIds = primaryRows.flatMap((r) =>
      extractUserIds(normalizeMetadata(r.resource_metadata))
    )
      .map((id) => String(id).trim())
      .filter(Boolean);
    let targetBookings = [{ id: booking.id, user_id: booking.user_id }];
    if (resourceIds.length > 0) {
      const targetParams = [
        resourceIds,
        booking.date,
        booking.start_time,
        booking.end_time,
        resourceIds.length,
      ];
      let targetOrg = "";
      if (orgId) {
        targetParams.push(orgId);
        targetOrg = `AND r.organization_id = $${targetParams.length}`;
      }
      const { rows: targetRows } = await client.query(
        `
        SELECT b.id, b.user_id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        WHERE br.resource_id = ANY($1)
        AND b.date = $2
        AND b.start_time = $3
        AND b.end_time = $4
        ${targetOrg}
        GROUP BY b.id, b.user_id
        HAVING COUNT(DISTINCT br.resource_id) = $5
           AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($1) THEN br.resource_id END) = $5
        `,
        targetParams
      );
      if (targetRows.length > 0) {
        targetBookings = targetRows;
      } else if (orgId) {
        const retryParams = [
          resourceIds,
          booking.date,
          booking.start_time,
          booking.end_time,
          resourceIds.length,
        ];
        const { rows: retryRows } = await client.query(
          `
          SELECT b.id, b.user_id
          FROM bookings b
          JOIN booking_resources br ON br.booking_id = b.id
          JOIN resources r ON r.id = br.resource_id
          WHERE br.resource_id = ANY($1)
          AND b.date = $2
          AND b.start_time = $3
          AND b.end_time = $4
          GROUP BY b.id, b.user_id
          HAVING COUNT(DISTINCT br.resource_id) = $5
             AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($1) THEN br.resource_id END) = $5
          `,
          retryParams
        );
        if (retryRows.length > 0) {
          targetBookings = retryRows;
        }
      }

      if (targetBookings.length === 1 && primaryResourceIds.length > 0) {
        const fallbackParams = [
          primaryResourceIds,
          booking.date,
          booking.start_time,
          booking.end_time,
        ];
        let fallbackOrg = "";
        if (orgId) {
          fallbackParams.push(orgId);
          fallbackOrg = `AND r.organization_id = $${fallbackParams.length}`;
        }
        const { rows: fallbackRows } = await client.query(
          `
          SELECT DISTINCT b.id, b.user_id
          FROM bookings b
          JOIN booking_resources br ON br.booking_id = b.id
          JOIN resources r ON r.id = br.resource_id
          WHERE br.resource_id = ANY($1)
          AND b.date = $2
          AND b.start_time = $3
          AND b.end_time = $4
          ${fallbackOrg}
          `,
          fallbackParams
        );
        if (fallbackRows.length > 0) {
          targetBookings = fallbackRows;
        } else if (orgId) {
          const retryFallbackParams = [
            primaryResourceIds,
            booking.date,
            booking.start_time,
            booking.end_time,
          ];
          const { rows: retryFallbackRows } = await client.query(
            `
            SELECT DISTINCT b.id, b.user_id
            FROM bookings b
            JOIN booking_resources br ON br.booking_id = b.id
            JOIN resources r ON r.id = br.resource_id
            WHERE br.resource_id = ANY($1)
            AND b.date = $2
            AND b.start_time = $3
            AND b.end_time = $4
            `,
            retryFallbackParams
          );
          if (retryFallbackRows.length > 0) {
            targetBookings = retryFallbackRows;
          }
        }
      }
    }

    const extraUserIds = Array.from(
      new Set(
        metadataUserIds
          .filter((id) => id && id !== String(booking.user_id || "").trim())
      )
    );
    if (extraUserIds.length > 0 && primaryResourceIds.length > 0) {
      const extraParams = [
        extraUserIds,
        primaryResourceIds,
        booking.date,
        booking.start_time,
        booking.end_time,
      ];
      let extraOrg = "";
      if (orgId) {
        extraParams.push(orgId);
        extraOrg = `AND r.organization_id = $${extraParams.length}`;
      }
      const { rows: extraRows } = await client.query(
        `
        SELECT DISTINCT b.id, b.user_id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        WHERE b.user_id = ANY($1)
        AND br.resource_id = ANY($2)
        AND b.date = $3
        AND b.start_time = $4
        AND b.end_time = $5
        ${extraOrg}
        `,
        extraParams
      );
      if (extraRows.length > 0) {
        const combined = new Map(targetBookings.map((t) => [t.id, t]));
        extraRows.forEach((row) => {
          if (!combined.has(row.id)) combined.set(row.id, row);
        });
        targetBookings = Array.from(combined.values());
      }
    }

    for (const target of targetBookings) {
      await client.query(
        `
        INSERT INTO booking_cancellations (booking_id, cancelled_reason, cancelled_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (booking_id) DO NOTHING
        `,
        [target.id, reason || null, senderName || null]
      );
    }

    const baseMessage = `Booking cancelled: ${resourceLabel} on ${booking.date} ${booking.start_time} - ${booking.end_time}.`;
    const message = reason ? `${baseMessage} Reason: ${reason}.` : baseMessage;
    const recipientSet = new Set(
      targetBookings
        .map((target) => String(target.user_id || ""))
        .filter(Boolean)
    );
    for (const userId of metadataUserIds) {
      const trimmed = String(userId || "").trim();
      if (trimmed && trimmed !== String(booking.user_id || "").trim()) {
        recipientSet.add(trimmed);
      }
    }
    if (recipientSet.size === 0 && targetUserId) {
      recipientSet.add(targetUserId);
    }
    for (const recipient of recipientSet) {
      await client.query(
        `
        INSERT INTO announcements (title, message, resource_name, sender_name, target_user_id, organization_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        ["Booking cancelled", message, resourceLabel || null, senderName || null, recipient, orgId]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error cancelling booking:", err);
    res.status(500).json({ error: "Failed to cancel booking" });
  } finally {
    client.release();
  }
});

router.post("/:id/reschedule", async (req, res) => {
  const id = Number(req.params.id);
  const date = String(req.body?.date || "").trim();
  const startTime = String(req.body?.start_time || "").trim();
  const endTime = String(req.body?.end_time || "").trim();
  const location = String(req.body?.location || "onsite").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  const senderName = String(req.body?.sender_name || "Manager").trim();
  const targetUserIdRaw = String(req.body?.target_user_id || "").trim();
  const targetUserId = targetUserIdRaw || null;
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: "Date and time are required" });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const params = [id];
    let where = "WHERE b.id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE b.id = $1 AND r.organization_id = $2";
    }
    const { rows: bookingRows } = await client.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        r.id AS resource_id,
        r.name AS resource_name,
        r.metadata AS resource_metadata,
        rt.name AS type_name
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      ${where}
      `,
      params
    );

    if (bookingRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingRows[0];

    const resourceIds = bookingRows.map((r) => r.resource_id);
    const conflictCheck = await client.query(
      `
      SELECT br.resource_id, b.*
      FROM booking_resources br
      JOIN bookings b ON b.id = br.booking_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      WHERE br.resource_id = ANY($1)
      AND b.date = $2
      AND b.id <> $5
      AND bc.booking_id IS NULL
      AND (
        ($3 >= b.start_time AND $3 < b.end_time) OR
        ($4 > b.start_time AND $4 <= b.end_time) OR
        ($3 <= b.start_time AND $4 >= b.end_time)
      )
    `,
      [resourceIds, date, startTime, endTime, id]
    );

    if (conflictCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Resources conflict" });
    }

    const primaryRows = getPrimaryResourceRows(bookingRows);
    const primaryResourceIds = primaryRows.map((r) => r.resource_id).filter(Boolean);
    const metadataUserIds = primaryRows.flatMap((r) =>
      extractUserIds(normalizeMetadata(r.resource_metadata))
    );

    let targetBookings = [{ id: booking.id, user_id: booking.user_id }];
    if (primaryResourceIds.length > 0) {
      const targetParams = [
        primaryResourceIds,
        booking.date,
        booking.start_time,
        booking.end_time,
      ];
      let targetOrg = "";
      if (orgId) {
        targetParams.push(orgId);
        targetOrg = `AND r.organization_id = $${targetParams.length}`;
      }
      const { rows: targetRows } = await client.query(
        `
        SELECT DISTINCT b.id, b.user_id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        WHERE br.resource_id = ANY($1)
        AND b.date = $2
        AND b.start_time = $3
        AND b.end_time = $4
        ${targetOrg}
        `,
        targetParams
      );
      if (targetRows.length > 0) {
        targetBookings = targetRows;
      }
    }

    const targetIds = targetBookings.map((target) => target.id);
    await client.query(
      `DELETE FROM booking_cancellations WHERE booking_id = ANY($1)`,
      [targetIds]
    );
    await client.query(
      `
      UPDATE bookings
      SET date = $1, start_time = $2, end_time = $3
      WHERE id = ANY($4)
      `,
      [date, startTime, endTime, targetIds]
    );

    if (location === "zoom") {
      for (const bookingId of targetIds) {
        await client.query(
          `
          INSERT INTO booking_locations (booking_id, location)
          VALUES ($1, $2)
          ON CONFLICT (booking_id) DO UPDATE
          SET location = EXCLUDED.location, updated_at = NOW()
          `,
          [bookingId, "zoom"]
        );
      }
    } else {
      await client.query(`DELETE FROM booking_locations WHERE booking_id = ANY($1)`, [targetIds]);
    }

    const primaryNames = primaryRows.map((r) => r.resource_name).filter(Boolean);
    const fallbackNames = bookingRows.map((r) => r.resource_name).filter(Boolean);
    const resourceLabel =
      primaryNames.length > 0 ? primaryNames.join(" / ") : fallbackNames.join(" / ");
    const locationLabel = location === "zoom" ? "Zoom" : "On-site";
    const baseMessage = `Booking rescheduled: ${resourceLabel} moved from ${booking.date} ${booking.start_time} - ${booking.end_time} to ${date} ${startTime} - ${endTime}.`;
    const message = reason
      ? `${baseMessage} Reason: ${reason}. Location: ${locationLabel}.`
      : `${baseMessage} Location: ${locationLabel}.`;

    const recipientSet = new Set(
      targetBookings
        .map((target) => String(target.user_id || ""))
        .filter(Boolean)
    );
    for (const userId of metadataUserIds) {
      const trimmed = String(userId || "").trim();
      if (trimmed && trimmed !== String(booking.user_id || "").trim()) {
        recipientSet.add(trimmed);
      }
    }
    if (recipientSet.size === 0 && targetUserId) {
      recipientSet.add(targetUserId);
    }
    for (const recipient of recipientSet) {
      await client.query(
        `
        INSERT INTO announcements (title, message, resource_name, sender_name, target_user_id, organization_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        ["Booking rescheduled", message, resourceLabel || null, senderName || null, recipient, orgId]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error rescheduling booking:", err);
    res.status(500).json({ error: "Failed to reschedule booking" });
  } finally {
    client.release();
  }
});

/* -----------------------------
   CREATE BOOKING WITH RESOURCES
--------------------------------*/
router.post("/", async (req, res) => {
  const {
    resources,
    resource_type_ids,
    roles,
    date,
    start_time,
    end_time,
    user_id,
    recurrence,
    resolution_strategy,
    conflict_booking_id,
    resolution_suggestion,
  } = req.body;
  const orgId = getOrgId(req);

  const explicitResourceIds = uniqueNumericIds(resources);
  const candidateTypeIds = uniqueNumericIds(resource_type_ids);

  if (explicitResourceIds.length === 0 && candidateTypeIds.length === 0) {
    return res.status(400).json({ error: "No resources or resource types provided" });
  }

  const client = await pool.connect();

  try {
    const parseDate = (value) => {
      if (!value || typeof value !== "string") return null;
      const parts = value.split("-");
      if (parts.length !== 3) return null;
      const [y, m, d] = parts.map((p) => Number(p));
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
        return null;
      }
      return new Date(y, m - 1, d);
    };
    const formatDate = (dateObj) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    let bookingDates = [];
    if (recurrence) {
      const startDateValue = String(recurrence?.start_date || "").trim();
      const endDateValue = String(recurrence?.end_date || "").trim();
      const days = Array.isArray(recurrence?.days_of_week)
        ? recurrence.days_of_week
        : [];
      const daysOfWeek = days
        .map((d) => Number(d))
        .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);

      if (!startDateValue || !endDateValue || daysOfWeek.length === 0) {
        return res.status(400).json({
          error: "Recurrence requires start_date, end_date, and days_of_week",
        });
      }
      const startDate = parseDate(startDateValue);
      const endDate = parseDate(endDateValue);
      if (!startDate || !endDate || startDate > endDate) {
        return res.status(400).json({ error: "Invalid recurrence date range" });
      }

      const uniqueDays = Array.from(new Set(daysOfWeek));
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (uniqueDays.includes(d.getDay())) {
          bookingDates.push(formatDate(d));
        }
        if (bookingDates.length > 200) {
          return res.status(400).json({
            error: "Recurrence creates too many bookings",
          });
        }
      }

      if (bookingDates.length === 0) {
        return res.status(400).json({
          error: "No dates match the selected recurrence",
        });
      }
    } else {
      const dateValue = String(date || "").trim();
      if (!dateValue) {
        return res.status(400).json({ error: "Date is required" });
      }
      bookingDates = [dateValue];
    }

    await client.query("BEGIN");

    const roleMap = roles && typeof roles === "object" ? roles : {};
    const responsibleResources = explicitResourceIds.filter((rid) => {
      const roleValue = String(roleMap?.[rid] || "").toLowerCase();
      return roleValue === "responsible";
    });
    /* 2. Load resources + rules for evaluation */
    const resourceRows = await loadResourceRowsByIds(client, explicitResourceIds, orgId);

    if (resourceRows.length !== explicitResourceIds.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "One or more resources not found" });
    }

    const ruleParams = [];
    let ruleWhere = "WHERE is_active = true";
    if (orgId) {
      ruleParams.push(orgId);
      ruleWhere += ` AND organization_id = $${ruleParams.length}`;
    }
    const { rows: ruleRows } = await client.query(
      `SELECT * FROM rules ${ruleWhere} ORDER BY sort_order ASC, id ASC`,
      ruleParams
    );

    const createdBookings = [];
    let lastRuleEval = null;
    let lastCandidateEvaluation = null;
    for (const bookingDate of bookingDates) {
      /* 1. Prevent overlapping bookings for the same user */
      if (user_id) {
        const userParams = [String(user_id), bookingDate, start_time, end_time];
        let userOrg = "";
        if (orgId) {
          userParams.push(orgId);
          userOrg = `AND r.organization_id = $${userParams.length}`;
        }
        const userConflict = await client.query(
          `
          SELECT b.id
          FROM bookings b
          LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
          LEFT JOIN booking_resources br ON br.booking_id = b.id
          LEFT JOIN resources r ON r.id = br.resource_id
          WHERE b.user_id::text = $1
          AND b.date = $2
          AND bc.booking_id IS NULL
          ${userOrg}
          AND (
            ($3 >= b.start_time AND $3 < b.end_time) OR
            ($4 > b.start_time AND $4 <= b.end_time) OR
            ($3 <= b.start_time AND $4 >= b.end_time)
          )
          LIMIT 1
        `,
          userParams
        );
        if (userConflict.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "User is already booked at this time",
            date: bookingDate,
          });
        }
      }

      /* 2. Check availability for responsible roles only */
      if (responsibleResources.length > 0) {
        const conflictParams = [responsibleResources, bookingDate, start_time, end_time];
        let conflictOrg = "";
        if (orgId) {
          conflictParams.push(orgId);
          conflictOrg = `AND r.organization_id = $${conflictParams.length}`;
        }
        const conflictCheck = await client.query(
          `
          SELECT br.resource_id, br.role, b.*
          FROM booking_resources br
          JOIN bookings b ON b.id = br.booking_id
          JOIN resources r ON r.id = br.resource_id
          LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
          WHERE br.resource_id = ANY($1)
          AND LOWER(COALESCE(br.role, '')) = 'responsible'
          AND b.date = $2
          AND bc.booking_id IS NULL
          ${conflictOrg}
          AND (
            ($3 >= b.start_time AND $3 < b.end_time) OR
            ($4 > b.start_time AND $4 <= b.end_time) OR
            ($3 <= b.start_time AND $4 >= b.end_time)
          )
        `,
          conflictParams
        );

        if (conflictCheck.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "Resources conflict",
            date: bookingDate,
            conflicts: conflictCheck.rows
          });
        }
      }

      let resolvedResourceRows = [...resourceRows];
      let resolvedResourceIds = resolvedResourceRows.map((resource) => Number(resource.id));

      if (
        resolvedResourceIds.length > 0 &&
        (await hasResourceConflict(client, resolvedResourceIds, bookingDate, start_time, end_time, orgId))
      ) {
        const conflictResolution = await buildConflictResolution({
          client,
          orgId,
          bookingDate,
          startTime: start_time,
          endTime: end_time,
          userId: user_id,
          resolvedResourceRows,
          candidateTypeIds,
          rules: ruleRows,
          roles: roleMap,
        });
        const targetConflictId = Number(conflict_booking_id);
        if (
          resolution_strategy === "move_existing" &&
          Number.isFinite(targetConflictId) &&
          conflictResolution?.move_existing?.can_auto_reassign &&
          Number(conflictResolution.move_existing.booking?.id) === targetConflictId
        ) {
          const selectedSuggestion =
            conflictResolution.move_existing.suggestions.find((item) =>
              suggestionsMatch(item, resolution_suggestion)
            ) || conflictResolution.move_existing.suggestions[0];
          await reassignBookingWithSuggestion(
            client,
            targetConflictId,
            selectedSuggestion,
            orgId
          );
        }

        if (
          await hasResourceConflict(client, resolvedResourceIds, bookingDate, start_time, end_time, orgId)
        ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Selected resources conflict with an existing booking",
          date: bookingDate,
          violation_details: [
            {
              name: "Resource conflict",
              description: "At least one of the selected resources is already booked in the selected time slot.",
              resource_name: null,
            },
          ],
          suggestions: conflictResolution.move_new_suggestions,
          conflict_resolution: conflictResolution,
        });
        }
      }

      if (candidateTypeIds.length > 0) {
        const candidateRows = await loadCandidateRowsByTypeIds(
          client,
          candidateTypeIds,
          orgId,
          bookingDate,
          start_time,
          end_time,
          resolvedResourceIds
        );

        const candidatePools = candidateTypeIds.map((typeId) => ({
          typeId,
          candidates: candidateRows.filter((resource) => Number(resource.type_id) === Number(typeId)),
        }));

        const emptyPool = candidatePools.find((pool) => pool.candidates.length === 0);
        if (emptyPool) {
          const resourceEvaluation = await buildCandidateEvaluationDetails({
            client,
            orgId,
            bookingDate,
            startTime: start_time,
            endTime: end_time,
            userId: user_id,
            resources: resolvedResourceRows,
            candidateTypeIds,
            rules: ruleRows,
            roles: roleMap,
          });
          await client.query("ROLLBACK");
          return res.status(422).json({
            error: "No available resources found for one of the selected types",
            date: bookingDate,
            missing_type_id: emptyPool.typeId,
            resource_evaluation: resourceEvaluation,
          });
        }

        const { best, bestBlocked } = pickBestResourceCombination({
          fixedResources: resolvedResourceRows,
          candidatePools,
          rules: ruleRows,
          booking: {
            date: bookingDate,
            start_time,
            end_time,
            user_id,
          },
          roles: roleMap,
        });

        if (!best) {
          const suggestions = await buildFailureSuggestions({
            client,
            orgId,
            bookingDate,
            startTime: start_time,
            endTime: end_time,
            userId: user_id,
            resources: resolvedResourceRows,
            candidateTypeIds,
            rules: ruleRows,
            roles: roleMap,
          });
          const resourceEvaluation = await buildCandidateEvaluationDetails({
            client,
            orgId,
            bookingDate,
            startTime: start_time,
            endTime: end_time,
            userId: user_id,
            resources: resolvedResourceRows,
            candidateTypeIds,
            rules: ruleRows,
            roles: roleMap,
          });
          await client.query("ROLLBACK");
          return res.status(422).json({
            error: "No matching resources satisfy the active rules",
            date: bookingDate,
            violations: bestBlocked?.hardViolations || [],
            alerts: bestBlocked?.alerts || [],
            violation_details: (bestBlocked?.hardViolations || []).map((item) =>
              describeViolation(item, resolvedResourceRows)
            ),
            alert_details: describeAlerts(bestBlocked?.alerts || [], resolvedResourceRows),
            suggestions,
            resource_evaluation: resourceEvaluation,
          });
        }

        resolvedResourceRows = [...resolvedResourceRows, ...best.resources];
        resolvedResourceIds = resolvedResourceRows.map((resource) => Number(resource.id));
        lastCandidateEvaluation = await buildCandidateEvaluationDetails({
          client,
          orgId,
          bookingDate,
          startTime: start_time,
          endTime: end_time,
          userId: user_id,
          resources: resolvedResourceRows,
          candidateTypeIds,
          rules: ruleRows,
          roles: roleMap,
          selectedResourceIds: best.resources.map((resource) => Number(resource.id)),
          selectedEvaluation: best.evaluation,
        });

        if (await hasResourceConflict(client, resolvedResourceIds, bookingDate, start_time, end_time, orgId)) {
          const conflictResolution = await buildConflictResolution({
            client,
            orgId,
            bookingDate,
            startTime: start_time,
            endTime: end_time,
            userId: user_id,
            resolvedResourceRows,
            candidateTypeIds,
            rules: ruleRows,
            roles: roleMap,
          });
          const targetConflictId = Number(conflict_booking_id);
          if (
            resolution_strategy === "move_existing" &&
            Number.isFinite(targetConflictId) &&
            conflictResolution?.move_existing?.can_auto_reassign &&
            Number(conflictResolution.move_existing.booking?.id) === targetConflictId
          ) {
            const selectedSuggestion =
              conflictResolution.move_existing.suggestions.find((item) =>
                suggestionsMatch(item, resolution_suggestion)
              ) || conflictResolution.move_existing.suggestions[0];
            await reassignBookingWithSuggestion(
              client,
              targetConflictId,
              selectedSuggestion,
              orgId
            );
          }

          if (await hasResourceConflict(client, resolvedResourceIds, bookingDate, start_time, end_time, orgId)) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "Selected resources conflict with an existing booking",
            date: bookingDate,
            violation_details: [
              {
                name: "Resource conflict",
                description: "One of the automatically selected resources is already booked in the selected time slot.",
                resource_name: null,
              },
            ],
            suggestions: conflictResolution.move_new_suggestions,
            conflict_resolution: conflictResolution,
            resource_evaluation: lastCandidateEvaluation,
          });
          }
        }
      }

      const ruleEval = evaluateRules({
        rules: ruleRows,
        booking: {
          date: bookingDate,
          start_time,
          end_time,
          user_id,
        },
        resources: resolvedResourceRows,
        roles: roleMap,
      });
      lastRuleEval = ruleEval;

      if (ruleEval.hardViolations.length > 0) {
        const suggestions = await buildFailureSuggestions({
          client,
          orgId,
          bookingDate,
          startTime: start_time,
          endTime: end_time,
          userId: user_id,
          resources: resolvedResourceRows,
          candidateTypeIds,
          rules: ruleRows,
          roles: roleMap,
        });
        const resourceEvaluation =
          lastCandidateEvaluation ||
          (await buildCandidateEvaluationDetails({
            client,
            orgId,
            bookingDate,
            startTime: start_time,
            endTime: end_time,
            userId: user_id,
            resources: resolvedResourceRows,
            candidateTypeIds,
            rules: ruleRows,
            roles: roleMap,
            selectedResourceIds: resolvedResourceRows
              .filter((resource) =>
                candidateTypeIds.some((typeId) => Number(resource?.type_id) === Number(typeId))
              )
              .map((resource) => Number(resource.id))
              .filter((id) => Number.isFinite(id)),
            selectedEvaluation: ruleEval,
          }));
        await client.query("ROLLBACK");
        return res.status(422).json({
          error: "Rule violations",
          date: bookingDate,
          violations: ruleEval.hardViolations,
          alerts: ruleEval.alerts,
          violation_details: ruleEval.hardViolations.map((item) =>
            describeViolation(item, resolvedResourceRows)
          ),
          alert_details: describeAlerts(ruleEval.alerts, resolvedResourceRows),
          suggestions,
          resource_evaluation: resourceEvaluation,
        });
      }

      /* 3. Create booking */
      const bookingResult = await client.query(
        `
        INSERT INTO bookings (user_id, date, start_time, end_time)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [user_id, bookingDate, start_time, end_time]
      );

      const booking = bookingResult.rows[0];

      /* 4. Insert into booking_resources */
      for (const r of resolvedResourceIds) {
        await client.query(
          `
          INSERT INTO booking_resources (booking_id, resource_id, role)
          VALUES ($1, $2, $3)
        `,
          [booking.id, r, roleMap?.[r] || null]
        );
      }

      createdBookings.push(booking);
    }

    await client.query("COMMIT");

    res.json({
      message: "Booking created",
      bookings: createdBookings,
      count: createdBookings.length,
      resource_evaluation: lastCandidateEvaluation,
      rule_summary: {
        score: lastRuleEval?.score ?? null,
        soft_matches: lastRuleEval?.softMatches || [],
        alerts: lastRuleEval?.alerts || [],
      },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Booking error:", err);
    res.status(500).json({ error: "Booking failed" });
  } finally {
    client.release();
  }
});

// UPDATE booking
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { resources, roles, date, start_time, end_time, user_id } = req.body;
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid booking id" });
  if (!resources || resources.length === 0) {
    return res.status(400).json({ error: "No resources provided" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (user_id) {
      const userParams = [String(user_id), date, start_time, end_time, id];
      let userOrg = "";
      if (orgId) {
        userParams.push(orgId);
        userOrg = `AND r.organization_id = $${userParams.length}`;
      }
      const userConflict = await client.query(
        `
        SELECT b.id
        FROM bookings b
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        LEFT JOIN booking_resources br ON br.booking_id = b.id
        LEFT JOIN resources r ON r.id = br.resource_id
        WHERE b.user_id::text = $1
        AND b.date = $2
        AND b.id <> $5
        AND bc.booking_id IS NULL
        ${userOrg}
        AND (
          ($3 >= b.start_time AND $3 < b.end_time) OR
          ($4 > b.start_time AND $4 <= b.end_time) OR
          ($3 <= b.start_time AND $4 >= b.end_time)
        )
        LIMIT 1
      `,
        userParams
      );
      if (userConflict.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "User is already booked at this time",
        });
      }
    }

    const roleMap = roles && typeof roles === "object" ? roles : {};
    const responsibleResources = resources.filter((rid) => {
      const roleValue = String(roleMap?.[rid] || "").toLowerCase();
      return roleValue === "responsible";
    });
    if (responsibleResources.length > 0) {
      const conflictParams = [responsibleResources, date, start_time, end_time, id];
      let conflictOrg = "";
      if (orgId) {
        conflictParams.push(orgId);
        conflictOrg = `AND r.organization_id = $${conflictParams.length}`;
      }
      const conflictCheck = await client.query(
        `
        SELECT br.resource_id, br.role, b.*
        FROM booking_resources br
        JOIN bookings b ON b.id = br.booking_id
        JOIN resources r ON r.id = br.resource_id
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        WHERE br.resource_id = ANY($1)
        AND LOWER(COALESCE(br.role, '')) = 'responsible'
        AND b.date = $2
        AND b.id <> $5
        AND bc.booking_id IS NULL
        ${conflictOrg}
        AND (
          ($3 >= b.start_time AND $3 < b.end_time) OR
          ($4 > b.start_time AND $4 <= b.end_time) OR
          ($3 <= b.start_time AND $4 >= b.end_time)
        )
      `,
        conflictParams
      );

      if (conflictCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Resources conflict",
          conflicts: conflictCheck.rows
        });
      }
    }

    const resourceParams = [resources];
    let resourceWhere = "WHERE r.id = ANY($1)";
    if (orgId) {
      resourceParams.push(orgId);
      resourceWhere = "WHERE r.id = ANY($1) AND r.organization_id = $2";
    }
    const { rows: resourceRows } = await client.query(
      `
      SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
      FROM resources r
      JOIN resource_types rt ON rt.id = r.type_id
      ${resourceWhere}
      `,
      resourceParams
    );

    if (resourceRows.length !== resources.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "One or more resources not found" });
    }

    const ruleParams = [];
    let ruleWhere = "WHERE is_active = true";
    if (orgId) {
      ruleParams.push(orgId);
      ruleWhere += ` AND organization_id = $${ruleParams.length}`;
    }
    const { rows: ruleRows } = await client.query(
      `SELECT * FROM rules ${ruleWhere} ORDER BY sort_order ASC, id ASC`,
      ruleParams
    );

    const ruleEval = evaluateRules({
      rules: ruleRows,
      booking: {
        date,
        start_time,
        end_time,
        user_id,
      },
      resources: resourceRows,
      roles,
    });

    if (ruleEval.hardViolations.length > 0) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: "Rule violations",
        violations: ruleEval.hardViolations,
        alerts: ruleEval.alerts,
      });
    }

    const bookingResult = await client.query(
      `
      UPDATE bookings
      SET user_id = $1, date = $2, start_time = $3, end_time = $4
      WHERE id = $5
      RETURNING *
      `,
      [user_id, date, start_time, end_time, id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    await client.query(`DELETE FROM booking_resources WHERE booking_id = $1`, [id]);

    for (const r of resources) {
      await client.query(
        `
        INSERT INTO booking_resources (booking_id, resource_id, role)
        VALUES ($1, $2, $3)
      `,
        [id, r, roles?.[r] || null]
      );
    }

    await client.query("COMMIT");

    res.json({
      message: "Booking updated",
      booking: bookingResult.rows[0],
      rule_summary: {
        score: ruleEval.score,
        soft_matches: ruleEval.softMatches,
        alerts: ruleEval.alerts,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Booking update error:", err);
    res.status(500).json({ error: "Booking update failed" });
  } finally {
    client.release();
  }
});

// DELETE booking
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid booking id" });

  try {
    const { rowCount } = await pool.query(`DELETE FROM bookings WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: "Booking not found" });
    res.status(204).send();
  } catch (err) {
    console.error("Booking delete error:", err);
    res.status(500).json({ error: "Booking delete failed" });
  }
});

export default router;
