import { evaluateRules } from "../../rulesEngine.js";
import { minutesToTime, timeToMinutes } from "./timeUtils.js";
import { hasResourceConflict, findUserConflict } from "./conflicts.js";
import { loadCandidateRowsByTypeIds } from "./resources.js";

function normalizePreferredWindows(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((window) => ({
      start_time: window?.start_time ? String(window.start_time).slice(0, 5) : "",
      end_time: window?.end_time ? String(window.end_time).slice(0, 5) : "",
    }))
    .filter((window) => window.start_time && window.end_time && window.start_time < window.end_time);
}

export async function buildAlternativeSuggestions({
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

      if (
        await hasResourceConflict(client, resourceIds, bookingDate, startTime, endTime, orgId)
      ) {
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
        type: "resource",
        score: evaluation.score,
        resource_ids: resourceIds,
        date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        summary: `${original.name} -> ${candidate.name}`,
        why: `Replace ${original.name} with ${candidate.name} and keep the same time slot.`,
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
      return String(a.summary || "").localeCompare(String(b.summary || ""));
    })
    .slice(0, limit);
}

export async function buildTimeSlotSuggestions({
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
  pickBestResourceCombination,
  limit = 3,
}) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return [];
  }

  const duration = endMinutes - startMinutes;
  const preferredOffsets = [-120, -90, -60, -30, 30, 60, 90, 120, -150, 150, -180, 180];
  const slots = [];
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
      (await hasResourceConflict(
        client,
        resolvedResourceIds,
        bookingDate,
        slot.start_time,
        slot.end_time,
        orgId
      ))
    ) {
      continue;
    }

    const uncoveredTypeIds = (Array.isArray(candidateTypeIds) ? candidateTypeIds : []).filter(
      (typeId) =>
        !resolvedResourceRows.some(
          (resource) => Number(resource?.type_id) === Number(typeId)
        )
    );

    if (uncoveredTypeIds.length > 0) {
      const candidateRows = await loadCandidateRowsByTypeIds(
        client,
        uncoveredTypeIds,
        orgId,
        bookingDate,
        slot.start_time,
        slot.end_time,
        resolvedResourceIds
      );
      const candidatePools = uncoveredTypeIds.map((typeId) => ({
        typeId,
        candidates: candidateRows.filter(
          (resource) => Number(resource.type_id) === Number(typeId)
        ),
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
      distance_from_original: slot.distance,
      date: bookingDate,
      start_time: slot.start_time,
      end_time: slot.end_time,
      resource_ids: resolvedResourceIds,
      summary: `${bookingDate} ${slot.start_time}-${slot.end_time}`,
      why: "Try a nearby time slot that keeps the booking valid with the current rule set.",
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
      return String(a.summary || "").localeCompare(String(b.summary || ""));
    })
    .slice(0, limit);
}

export async function buildAutoScheduleFailureSuggestions({
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
  pickBestResourceCombination,
  preferredTimeWindows = [],
}) {
  const normalizedPreferredTimeWindows = normalizePreferredWindows(preferredTimeWindows);
  const allowTimeSuggestions = normalizedPreferredTimeWindows.length === 0;
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
    allowTimeSuggestions
      ? buildTimeSlotSuggestions({
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
          pickBestResourceCombination,
        })
      : Promise.resolve([]),
  ]);

  return [...resourceSuggestions, ...timeSuggestions]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.summary || "").localeCompare(String(b.summary || ""));
    })
    .slice(0, 5);
}
