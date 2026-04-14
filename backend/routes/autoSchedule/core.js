import { evaluateRules } from "../../rulesEngine.js";
import { addMinutes, formatDate, getWeekStartsInRange, normalizeTimeKey, timeToMinutes } from "./timeUtils.js";
import { buildFallbackAvailability, getDayAvailabilityWindows } from "./availabilityUtils.js";
import {
  findResourceConflictDetails,
  findUserConflict,
  hasExactBooking,
  hasResourceConflict,
  weekAlreadyScheduled,
} from "./conflicts.js";
import { buildAutoScheduleDecisionExplanation } from "./explain.js";
import { loadCandidateRowsByTypeIds, loadResourceRowsByIds } from "./resources.js";
import { buildAutoScheduleFailureSuggestions } from "./suggestions.js";

function normalizePreferredWindows(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((w) => ({
      start_time: w?.start_time ? String(w.start_time).slice(0, 5) : "",
      end_time: w?.end_time ? String(w.end_time).slice(0, 5) : "",
    }))
    .filter((w) => w.start_time && w.end_time && w.start_time < w.end_time);
}

function isWithinAnyPreferredWindow(preferredWindows, startTime, endTime) {
  if (!preferredWindows || preferredWindows.length === 0) return true;
  return preferredWindows.some(
    (w) => startTime >= w.start_time && endTime <= w.end_time
  );
}

function buildCandidateSlots(availability, durationMinutes) {
  const candidates = [];
  availability.forEach((slot) => {
    const slotStart = String(slot.start_time).slice(0, 5);
    const slotEnd = String(slot.end_time).slice(0, 5);
    const slotStartMin = timeToMinutes(slotStart);
    const slotEndMin = timeToMinutes(slotEnd);
    for (let candidate = slotStartMin; candidate + durationMinutes <= slotEndMin; candidate += 30) {
      candidates.push({
        availability: slot,
        day_of_week: Number(slot.day_of_week),
        start_time: addMinutes("00:00", candidate),
        end_time: addMinutes("00:00", candidate + durationMinutes),
      });
    }
  });
  return candidates.sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
  });
}

function buildDecisionNarrative({
  usedLockedSlot,
  usedPreferredWindow,
  attemptedSlots,
  responsibleConflicts,
  userConflicts,
  resourceConflicts,
  ruleConflicts,
}) {
  const reasons = [];
  if (usedLockedSlot) reasons.push("reused the recurring slot pattern");
  if (usedPreferredWindow) reasons.push("stayed inside the preferred time window");
  if (attemptedSlots > 1) reasons.push(`passed ${attemptedSlots - 1} blocked candidates before landing on this slot`);
  if (reasons.length === 0) reasons.push("was the first valid slot in the scan order");

  const blockers = [];
  if (responsibleConflicts > 0) blockers.push(`${responsibleConflicts} responsible conflicts`);
  if (userConflicts > 0) blockers.push(`${userConflicts} assigned-user conflicts`);
  if (resourceConflicts > 0) blockers.push(`${resourceConflicts} resource conflicts`);
  if (ruleConflicts > 0) blockers.push(`${ruleConflicts} rule blocks`);

  return {
    summary: reasons.join(". ") + ".",
    blockers,
  };
}

export async function pickLockedSlot({
  availability,
  availabilityOverrides,
  durationMinutes,
  startDate,
  endDate,
  responsibleId,
  userIds,
  resourceIds,
  resourceRows,
  ruleRows,
  orgId,
  client,
  excludedDayOfWeeks = [],
  preferredTimeWindows = [],
}) {
  const weekStarts = getWeekStartsInRange(startDate, endDate);
  const candidatesMap = new Map();
  let lastFailure = "No available slot found";
  let firstCandidateFailure = null;
  const excluded = new Set((excludedDayOfWeeks || []).map((d) => Number(d)));

  for (let day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
    const dayKey = formatDate(day);
    const dayOfWeek = day.getDay();
    if (excluded.has(dayOfWeek)) continue;
    const windows = getDayAvailabilityWindows(availability, availabilityOverrides, dayKey, dayOfWeek);
    for (const window of windows) {
      const slotStartMin = timeToMinutes(window.start_time);
      const slotEndMin = timeToMinutes(window.end_time);
      for (let candidate = slotStartMin; candidate + durationMinutes <= slotEndMin; candidate += 30) {
        const startTime = addMinutes("00:00", candidate);
        const endTime = addMinutes("00:00", candidate + durationMinutes);
        if (!isWithinAnyPreferredWindow(preferredTimeWindows, startTime, endTime)) continue;
        const key = `${dayOfWeek}-${startTime}-${endTime}`;
        candidatesMap.set(key, { day_of_week: dayOfWeek, start_time: startTime, end_time: endTime });
      }
    }
  }

  const candidates = Array.from(candidatesMap.values());
  for (const candidate of candidates) {
    const occurrences = [];
    for (const weekStart of weekStarts) {
      const dateObj = new Date(weekStart);
      dateObj.setDate(weekStart.getDate() + candidate.day_of_week);
      if (dateObj < startDate || dateObj > endDate) continue;
      const dayKey = formatDate(dateObj);
      const windows = getDayAvailabilityWindows(availability, availabilityOverrides, dayKey, candidate.day_of_week);
      const covered = windows.some((window) => candidate.start_time >= window.start_time && candidate.end_time <= window.end_time);
      if (!covered) continue;
      occurrences.push(dayKey);
    }

    if (occurrences.length === 0) {
      lastFailure = "No availability in range";
      continue;
    }

    let conflictReason = null;
    for (const dayKey of occurrences) {
      if (responsibleId) {
        const responsibleConflict = await findUserConflict(client, responsibleId, dayKey, candidate.start_time, candidate.end_time, orgId);
        if (responsibleConflict) {
          conflictReason = `Responsible conflict with booking #${responsibleConflict.id} at ${responsibleConflict.date} ${responsibleConflict.start_time}-${responsibleConflict.end_time}`;
          break;
        }
      }

      let userConflict = null;
      for (const userId of userIds) {
        userConflict = await findUserConflict(client, userId, dayKey, candidate.start_time, candidate.end_time, orgId);
        if (userConflict) break;
      }
      if (userConflict) {
        conflictReason = `User conflict with booking #${userConflict.id} at ${userConflict.date} ${userConflict.start_time}-${userConflict.end_time}`;
        break;
      }

      const resourceConflict = await hasResourceConflict(client, resourceIds, dayKey, candidate.start_time, candidate.end_time, orgId);
      if (resourceConflict) {
        conflictReason = `Resource conflict at ${dayKey} ${candidate.start_time}-${candidate.end_time}`;
        break;
      }

      const ruleEval = evaluateRules({
        rules: ruleRows,
        booking: { date: dayKey, start_time: candidate.start_time, end_time: candidate.end_time, user_id: responsibleId },
        resources: resourceRows,
        roles: {},
      });
      if (ruleEval.hardViolations.length > 0) {
        const violation = ruleEval.hardViolations[0];
        const ruleLabel = violation?.name ? ` (${violation.name})` : "";
        conflictReason = `Rule violation${ruleLabel} at ${dayKey} ${candidate.start_time}-${candidate.end_time}`;
        break;
      }
    }

    if (!conflictReason) {
      return { slot: { day_of_week: candidate.day_of_week, start_time: candidate.start_time, end_time: candidate.end_time } };
    }
    if (!firstCandidateFailure) firstCandidateFailure = conflictReason;
    lastFailure = conflictReason;
  }

  return { slot: null, reason: firstCandidateFailure || lastFailure };
}

export function pickBestResourceCombination({ fixedResources, candidatePools, rules, booking, roles }) {
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
        if (b.evaluation.score !== a.evaluation.score) return b.evaluation.score - a.evaluation.score;
        return Number(a.candidate.id) - Number(b.candidate.id);
      })
      .slice(0, 25)
      .map((entry) => entry.candidate);

    return { ...pool, candidates: scored.length > 0 ? scored : pool.candidates.slice(0, 25) };
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

export async function diagnoseGroupFailure({
  client,
  group,
  startDate,
  endDate,
  orgId,
  ruleRows,
  durationMinutes,
}) {
  const resourceIds = Array.isArray(group?.resource_ids)
    ? group.resource_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const typeIds = Array.isArray(group?.type_ids)
    ? group.type_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const responsibleId = String(group?.responsible_user_id || "").trim();
  const rawUserIds = Array.isArray(group?.user_ids) ? group.user_ids : [];
  const userIds = Array.from(new Set(rawUserIds.map((id) => String(id).trim()).filter(Boolean))).filter((id) => id && id !== responsibleId);

  let resourceRows = [];
  if (resourceIds.length > 0) {
    resourceRows = await loadResourceRowsByIds(client, resourceIds, orgId);
  }

  let availability = [];
  let availabilityOverrides = [];
  if (responsibleId) {
    const availParams = [responsibleId];
    let availWhere = "WHERE user_id = $1";
    if (orgId) {
      availParams.push(orgId);
      availWhere += ` AND organization_id = $${availParams.length}`;
    }
    const availabilityResult = await client.query(
      `
      SELECT *
      FROM user_availability
      ${availWhere}
      ORDER BY day_of_week, start_time
      `,
      availParams
    );
    const overridesResult = await client.query(
      `
      SELECT *
      FROM user_availability_overrides
      ${availWhere}
      ORDER BY date, start_time NULLS FIRST
      `,
      availParams
    );
    availability = availabilityResult.rows;
    availabilityOverrides = overridesResult.rows;
    if (availability.length === 0 && availabilityOverrides.length === 0) {
      return { group_id: group?.group_id || null, reason: "No availability defined for the responsible user.", failure_type: "missing_availability", suggestions: [] };
    }
  } else {
    availability = buildFallbackAvailability();
  }

  for (const weekStart of getWeekStartsInRange(startDate, endDate)) {
    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    const weekStartBound = new Date(Math.max(weekStart.getTime(), startDate.getTime()));
    const weekEndBound = new Date(Math.min(weekEnd.getTime(), endDate.getTime()));

    for (let day = new Date(weekStartBound); day <= weekEndBound; day.setDate(day.getDate() + 1)) {
      const dayKey = formatDate(day);
      const dayOfWeek = day.getDay();
      const windows = getDayAvailabilityWindows(availability, availabilityOverrides, dayKey, dayOfWeek);
      for (const window of windows) {
        const slotStartMin = timeToMinutes(window.start_time);
        const slotEndMin = timeToMinutes(window.end_time);
        for (let candidate = slotStartMin; candidate + durationMinutes <= slotEndMin; candidate += 30) {
          const startTime = addMinutes("00:00", candidate);
          const endTime = addMinutes("00:00", candidate + durationMinutes);

          if (responsibleId) {
            const responsibleConflict = await findUserConflict(client, responsibleId, dayKey, startTime, endTime, orgId);
            if (responsibleConflict) {
              const suggestions = await buildAutoScheduleFailureSuggestions({
                client,
                orgId,
                bookingDate: dayKey,
                startTime,
                endTime,
                userId: responsibleId,
                resources: resourceRows,
                candidateTypeIds: typeIds,
                rules: ruleRows,
                roles: {},
                pickBestResourceCombination,
              });
              return {
                group_id: group?.group_id || null,
                reason: `The responsible user is already booked on ${dayKey} ${startTime}-${endTime}.`,
                failure_type: "responsible_conflict",
                failed_slot: { date: dayKey, start_time: startTime, end_time: endTime },
                occupied_by: responsibleConflict,
                suggestions,
              };
            }
          }

          for (const userId of userIds) {
            const userConflict = await findUserConflict(client, userId, dayKey, startTime, endTime, orgId);
            if (userConflict) {
              const suggestions = await buildAutoScheduleFailureSuggestions({
                client,
                orgId,
                bookingDate: dayKey,
                startTime,
                endTime,
                userId: responsibleId,
                resources: resourceRows,
                candidateTypeIds: typeIds,
                rules: ruleRows,
                roles: {},
                pickBestResourceCombination,
              });
              return {
                group_id: group?.group_id || null,
                reason: `One of the assigned users is already booked on ${dayKey} ${startTime}-${endTime}.`,
                failure_type: "user_conflict",
                failed_slot: { date: dayKey, start_time: startTime, end_time: endTime },
                occupied_by: userConflict,
                suggestions,
              };
            }
          }

          if (resourceIds.length > 0) {
            const resourceConflict = await findResourceConflictDetails(client, resourceIds, dayKey, startTime, endTime, orgId);
            if (resourceConflict) {
              const suggestions = await buildAutoScheduleFailureSuggestions({
                client,
                orgId,
                bookingDate: dayKey,
                startTime,
                endTime,
                userId: responsibleId,
                resources: resourceRows,
                candidateTypeIds: typeIds,
                rules: ruleRows,
                roles: {},
                pickBestResourceCombination,
              });
              return {
                group_id: group?.group_id || null,
                reason: `${resourceConflict.resource_name} is occupied by booking #${resourceConflict.id} on ${dayKey} ${startTime}-${endTime}.`,
                failure_type: "resource_conflict",
                failed_slot: { date: dayKey, start_time: startTime, end_time: endTime },
                occupied_by: { id: resourceConflict.id, booking_id: resourceConflict.id, user_id: resourceConflict.user_id, resource_id: resourceConflict.resource_id, resource_name: resourceConflict.resource_name, resource_type_name: resourceConflict.resource_type_name, date: resourceConflict.date, start_time: resourceConflict.start_time, end_time: resourceConflict.end_time },
                suggestions,
              };
            }
          }
        }
      }
    }
  }

  return { group_id: group?.group_id || null, reason: "No matching slot was found in the selected range.", failure_type: "no_slot_found", suggestions: [] };
}

export async function scheduleGroup({
  client,
  group,
  startDate,
  endDate,
  orgId,
  ruleRows,
  durationMinutes,
  daysPerWeek,
}) {
  const resourceIds = Array.isArray(group?.resource_ids)
    ? group.resource_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const typeIds = Array.isArray(group?.type_ids)
    ? group.type_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const responsibleId = String(group?.responsible_user_id || "").trim();
  const rawUserIds = Array.isArray(group?.user_ids) ? group.user_ids : [];
  const userIds = rawUserIds.map((id) => String(id).trim()).filter(Boolean);
  const uniqueUserIds = Array.from(new Set(userIds)).filter((id) => id && id !== responsibleId);

  if (resourceIds.length === 0 && typeIds.length === 0) {
    return { scheduled: [], skipped: { group_id: group?.group_id || null, reason: "No resources or resource types selected" } };
  }
  if (durationMinutes <= 0) {
    return { scheduled: [], skipped: { group_id: group?.group_id || null, reason: "Invalid hours per day" } };
  }

  let resourceRows = [];
  if (resourceIds.length > 0) {
    resourceRows = await loadResourceRowsByIds(client, resourceIds, orgId);
    if (resourceRows.length !== resourceIds.length) {
      return { scheduled: [], skipped: { group_id: group?.group_id || null, reason: "Missing resources" } };
    }
  }

  let availability = [];
  let availabilityOverrides = [];
  if (responsibleId) {
    const availParams = [responsibleId];
    let availWhere = "WHERE user_id = $1";
    if (orgId) {
      availParams.push(orgId);
      availWhere += ` AND organization_id = $${availParams.length}`;
    }
    const availabilityResult = await client.query(
      `
      SELECT *
      FROM user_availability
      ${availWhere}
      ORDER BY day_of_week, start_time
      `,
      availParams
    );
    const overridesResult = await client.query(
      `
      SELECT *
      FROM user_availability_overrides
      ${availWhere}
      ORDER BY date, start_time NULLS FIRST
      `,
      availParams
    );
    availability = availabilityResult.rows;
    availabilityOverrides = overridesResult.rows;
    if (availability.length === 0 && availabilityOverrides.length === 0) {
      return { scheduled: [], skipped: { group_id: group?.group_id || null, reason: "No availability for responsible" } };
    }
  } else {
    availability = buildFallbackAvailability();
  }

  const groupScheduled = [];
  let lastFailure = "No available slot found";
  let availabilityDays = 0;
  let attemptedSlots = 0;
  let responsibleConflicts = 0;
  let userConflicts = 0;
  let resourceConflicts = 0;
  let ruleConflicts = 0;
  let lockedSlots = [];
  let failureContext = null;
  const preferredTimeWindows = normalizePreferredWindows(group?.preferred_time_windows);

  for (let lockIndex = 0; lockIndex < daysPerWeek; lockIndex += 1) {
    const lockedCandidate = await pickLockedSlot({
      availability,
      availabilityOverrides,
      durationMinutes,
      startDate,
      endDate,
      responsibleId,
      userIds: uniqueUserIds,
      resourceIds,
      resourceRows,
      ruleRows,
      orgId,
      client,
      excludedDayOfWeeks: lockedSlots.map((slot) => slot.day_of_week),
      preferredTimeWindows,
    });
    if (lockedCandidate?.slot) {
      lockedSlots = [...lockedSlots, lockedCandidate.slot];
      continue;
    }
    if (lockedCandidate?.reason) lastFailure = lockedCandidate.reason;
    break;
  }

  const weekStarts = getWeekStartsInRange(startDate, endDate);
  for (const weekStart of weekStarts) {
    if (resourceIds.length > 0 && typeIds.length === 0 && await weekAlreadyScheduled(client, resourceIds, weekStart, new Date(weekStart.getTime() + 6 * 86400000), orgId)) {
      lastFailure = "Already scheduled this week";
      continue;
    }

    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    const weekStartBound = new Date(Math.max(weekStart.getTime(), startDate.getTime()));
    const weekEndBound = new Date(Math.min(weekEnd.getTime(), endDate.getTime()));

    let scheduledThisWeekCount = 0;
    let weekFailure = lastFailure;
    let weekSlots = 0;
    let localAttemptedSlots = 0;
    let localResponsibleConflicts = 0;
    let localUserConflicts = 0;
    let localResourceConflicts = 0;
    let localRuleConflicts = 0;

    for (let pass = 0; pass < 2; pass += 1) {
      const enforceLockedSlots = pass === 0 && lockedSlots.length > 0;
      if (pass === 1 && (scheduledThisWeekCount > 0 || !enforceLockedSlots)) break;

      for (let day = new Date(weekStartBound); day <= weekEndBound; day.setDate(day.getDate() + 1)) {
        const dayOfWeek = day.getDay();
        const dayKey = formatDate(day);
        const dayAvailability = getDayAvailabilityWindows(availability, availabilityOverrides, dayKey, dayOfWeek);
        if (dayAvailability.length === 0) continue;
        availabilityDays += 1;

        if (enforceLockedSlots) {
          const dayLocks = lockedSlots.filter((slot) => slot.day_of_week === dayOfWeek);
          if (dayLocks.length === 0) continue;
          const matchesWindow = dayLocks.some((locked) =>
            dayAvailability.some((slot) => {
              const slotStart = String(slot.start_time).slice(0, 5);
              const slotEnd = String(slot.end_time).slice(0, 5);
              return locked.start_time >= slotStart && locked.end_time <= slotEnd;
            })
          );
          if (!matchesWindow) continue;
        }

        const timePreferencePasses = preferredTimeWindows.length > 0 ? 2 : 1;
        for (let timePass = 0; timePass < timePreferencePasses; timePass += 1) {
          const enforcePreferred = preferredTimeWindows.length > 0 && timePass === 0;

          for (const slot of dayAvailability) {
            const slotStart = normalizeTimeKey(slot.start_time);
            const slotEnd = normalizeTimeKey(slot.end_time);
            const slotStartMin = timeToMinutes(slotStart);
            const slotEndMin = timeToMinutes(slotEnd);
            for (let candidate = slotStartMin; candidate + durationMinutes <= slotEndMin; candidate += 30) {
              weekSlots += 1;
              const startTime = addMinutes("00:00", candidate);
              const endTime = addMinutes("00:00", candidate + durationMinutes);

              if (enforcePreferred && !isWithinAnyPreferredWindow(preferredTimeWindows, startTime, endTime)) {
                continue;
              }

              if (enforceLockedSlots) {
                const matchesAnyLock = lockedSlots.some((locked) => (
                  locked.day_of_week === dayOfWeek &&
                  locked.start_time === startTime &&
                  locked.end_time === endTime
                ));
                if (!matchesAnyLock) continue;
              }

              attemptedSlots += 1;
              localAttemptedSlots += 1;
              if (responsibleId) {
                const responsibleConflict = await findUserConflict(client, responsibleId, dayKey, startTime, endTime, orgId);
                if (responsibleConflict) {
                  weekFailure = `Responsible conflict with booking #${responsibleConflict.id} at ${responsibleConflict.date} ${responsibleConflict.start_time}-${responsibleConflict.end_time}`;
                  responsibleConflicts += 1;
                  localResponsibleConflicts += 1;
                  if (!failureContext) {
                    failureContext = { type: "responsible_conflict", bookingDate: dayKey, startTime, endTime, resources: [...resourceRows], candidateTypeIds: [...typeIds] };
                  }
                  continue;
                }
              }

              let userConflict = null;
              if (uniqueUserIds.length > 0) {
                for (const userId of uniqueUserIds) {
                  userConflict = await findUserConflict(client, userId, dayKey, startTime, endTime, orgId);
                  if (userConflict) break;
                }
              }
              if (userConflict) {
                weekFailure = `User conflict with booking #${userConflict.id} at ${userConflict.date} ${userConflict.start_time}-${userConflict.end_time}`;
                userConflicts += 1;
                localUserConflicts += 1;
                if (!failureContext) {
                  failureContext = { type: "user_conflict", bookingDate: dayKey, startTime, endTime, resources: [...resourceRows], candidateTypeIds: [...typeIds] };
                }
                continue;
              }

              let resolvedResourceRows = [...resourceRows];
              let resolvedResourceIds = resolvedResourceRows
                .map((resource) => Number(resource.id))
                .filter((id) => Number.isFinite(id));

              if (typeIds.length > 0) {
                const candidateRows = await loadCandidateRowsByTypeIds(client, typeIds, orgId, dayKey, startTime, endTime, resolvedResourceIds);
                const candidatePools = typeIds.map((typeId) => ({
                  typeId,
                  candidates: candidateRows.filter((resource) => Number(resource.type_id) === Number(typeId)),
                }));
                const emptyPool = candidatePools.find((pool) => pool.candidates.length === 0);
                if (emptyPool) {
                  weekFailure = `No available resource for type ${emptyPool.typeId}`;
                  resourceConflicts += 1;
                  localResourceConflicts += 1;
                  if (!failureContext) {
                    failureContext = { type: "missing_type_resource", bookingDate: dayKey, startTime, endTime, resources: [...resolvedResourceRows], candidateTypeIds: [...typeIds] };
                  }
                  continue;
                }
                const { best } = pickBestResourceCombination({
                  fixedResources: resolvedResourceRows,
                  candidatePools,
                  rules: ruleRows,
                  booking: { date: dayKey, start_time: startTime, end_time: endTime, user_id: responsibleId },
                  roles: {},
                });
                if (!best) {
                  weekFailure = `No matching resources satisfy the active rules at ${dayKey} ${startTime}-${endTime}`;
                  ruleConflicts += 1;
                  localRuleConflicts += 1;
                  if (!failureContext) {
                    failureContext = { type: "rule_conflict", bookingDate: dayKey, startTime, endTime, resources: [...resolvedResourceRows], candidateTypeIds: [...typeIds] };
                  }
                  continue;
                }
                resolvedResourceRows = [...resolvedResourceRows, ...best.resources];
                resolvedResourceIds = resolvedResourceRows
                  .map((resource) => Number(resource.id))
                  .filter((id) => Number.isFinite(id));
              }

              const resourceConflict = await hasResourceConflict(client, resolvedResourceIds, dayKey, startTime, endTime, orgId);
              if (resourceConflict) {
                const conflictDetails = await findResourceConflictDetails(client, resolvedResourceIds, dayKey, startTime, endTime, orgId);
                weekFailure = conflictDetails?.resource_name
                  ? `${conflictDetails.resource_name} is occupied by booking #${conflictDetails.id} on ${dayKey} ${startTime}-${endTime}.`
                  : `Resource conflict at ${dayKey} ${startTime}-${endTime}`;
                resourceConflicts += 1;
                localResourceConflicts += 1;
                if (!failureContext) {
                  failureContext = { type: "resource_conflict", bookingDate: dayKey, startTime, endTime, resources: [...resolvedResourceRows], candidateTypeIds: [...typeIds], occupiedBy: conflictDetails || null };
                }
                continue;
              }

              const ruleEval = evaluateRules({
                rules: ruleRows,
                booking: { date: dayKey, start_time: startTime, end_time: endTime, user_id: responsibleId },
                resources: resolvedResourceRows,
                roles: {},
              });
              if (ruleEval.hardViolations.length > 0) {
                const violation = ruleEval.hardViolations[0];
                const ruleLabel = violation?.name ? ` (${violation.name})` : "";
                weekFailure = `Rule violation${ruleLabel} at ${dayKey} ${startTime}-${endTime}`;
                ruleConflicts += 1;
                localRuleConflicts += 1;
                if (!failureContext) {
                  failureContext = { type: "rule_conflict", bookingDate: dayKey, startTime, endTime, resources: [...resolvedResourceRows], candidateTypeIds: [...typeIds] };
                }
                continue;
              }

              if (responsibleId) {
                const alreadyExists = await hasExactBooking(client, responsibleId, resolvedResourceIds, dayKey, startTime, endTime, orgId);
                if (alreadyExists) {
                  scheduledThisWeekCount += 1;
                  localAttemptedSlots = 0;
                  localResponsibleConflicts = 0;
                  localUserConflicts = 0;
                  localResourceConflicts = 0;
                  localRuleConflicts = 0;
                  if (scheduledThisWeekCount >= daysPerWeek) break;
                  continue;
                }
              }

              const bookingResult = await client.query(
                `
                INSERT INTO bookings (user_id, date, start_time, end_time)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                `,
                [responsibleId || null, dayKey, startTime, endTime]
              );
              const booking = bookingResult.rows[0];

              for (const resourceId of resolvedResourceIds) {
                await client.query(
                  `
                  INSERT INTO booking_resources (booking_id, resource_id, role)
                  VALUES ($1, $2, $3)
                  `,
                  [booking.id, resourceId, null]
                );
              }

              for (const userId of uniqueUserIds) {
                const userExists = await hasExactBooking(client, userId, resolvedResourceIds, dayKey, startTime, endTime, orgId);
                if (userExists) continue;
                const userBookingResult = await client.query(
                  `
                  INSERT INTO bookings (user_id, date, start_time, end_time)
                  VALUES ($1, $2, $3, $4)
                  RETURNING *
                  `,
                  [userId, dayKey, startTime, endTime]
                );
                const userBooking = userBookingResult.rows[0];
                for (const resourceId of resolvedResourceIds) {
                  await client.query(
                    `
                    INSERT INTO booking_resources (booking_id, resource_id, role)
                    VALUES ($1, $2, $3)
                    `,
                    [userBooking.id, resourceId, null]
                  );
                }
              }

              const explanation = await buildAutoScheduleDecisionExplanation({
                client,
                orgId,
                bookingDate: dayKey,
                startTime,
                endTime,
                userId: responsibleId,
                resources: resolvedResourceRows,
                candidateTypeIds: typeIds,
                rules: ruleRows,
                roles: {},
                evaluation: ruleEval,
              });
              const narrative = buildDecisionNarrative({
                usedLockedSlot: enforceLockedSlots,
                usedPreferredWindow: enforcePreferred,
                attemptedSlots: localAttemptedSlots,
                responsibleConflicts: localResponsibleConflicts,
                userConflicts: localUserConflicts,
                resourceConflicts: localResourceConflicts,
                ruleConflicts: localRuleConflicts,
              });

              groupScheduled.push({
                group_id: group?.group_id || null,
                booking_id: booking.id,
                date: dayKey,
                start_time: startTime,
                end_time: endTime,
                resource_ids: resolvedResourceIds,
                decision_summary: {
                  ...explanation,
                  narrative: narrative.summary,
                  blockers: narrative.blockers,
                  search_stats: {
                    attempted_slots: localAttemptedSlots,
                    responsible_conflicts: localResponsibleConflicts,
                    user_conflicts: localUserConflicts,
                    resource_conflicts: localResourceConflicts,
                    rule_conflicts: localRuleConflicts,
                    used_locked_slot: enforceLockedSlots,
                    used_preferred_window: enforcePreferred,
                  },
                },
              });
              if (lockedSlots.length === 0) {
                lockedSlots = [{ day_of_week: dayOfWeek, start_time: startTime, end_time: endTime }];
              }
              scheduledThisWeekCount += 1;
              localAttemptedSlots = 0;
              localResponsibleConflicts = 0;
              localUserConflicts = 0;
              localResourceConflicts = 0;
              localRuleConflicts = 0;
              if (scheduledThisWeekCount >= daysPerWeek) break;
            }
            if (scheduledThisWeekCount >= daysPerWeek) break;
          }
          if (scheduledThisWeekCount >= daysPerWeek) break;
        }
        if (scheduledThisWeekCount >= daysPerWeek) break;
      }
      if (scheduledThisWeekCount >= daysPerWeek) break;
    }

    if (scheduledThisWeekCount === 0 && weekSlots > 0) lastFailure = weekFailure;
    if (scheduledThisWeekCount > 0) continue;
  }

  if (groupScheduled.length === 0) {
    let reason = lastFailure || "No available slot found";
    if (availabilityDays === 0) reason = "No availability in range";
    else if (attemptedSlots === 0) reason = "No time slot fits the required duration";
    else if (responsibleConflicts === attemptedSlots) reason = "Responsible conflict for all available slots";
    else if (userConflicts === attemptedSlots) reason = "User conflict for all available slots";
    else if (resourceConflicts === attemptedSlots) reason = "Resource conflict for all available slots";
    else if (ruleConflicts === attemptedSlots) reason = "Rule violations for all available slots";

    let suggestions = [];
    if (failureContext?.bookingDate && failureContext?.startTime && failureContext?.endTime) {
      suggestions = await buildAutoScheduleFailureSuggestions({
        client,
        orgId,
        bookingDate: failureContext.bookingDate,
        startTime: failureContext.startTime,
        endTime: failureContext.endTime,
        userId: responsibleId,
        resources: Array.isArray(failureContext.resources) ? failureContext.resources : resourceRows,
        candidateTypeIds: Array.isArray(failureContext.candidateTypeIds) ? failureContext.candidateTypeIds : typeIds,
        rules: ruleRows,
        roles: {},
        pickBestResourceCombination,
      });
    }
    if (!suggestions || suggestions.length === 0) {
      const diagnosis = await diagnoseGroupFailure({ client, group, startDate, endDate, orgId, ruleRows, durationMinutes });
      suggestions = Array.isArray(diagnosis?.suggestions) ? diagnosis.suggestions : [];
      if (diagnosis?.reason) reason = diagnosis.reason;
    }

    return {
      scheduled: [],
      skipped: {
        group_id: group?.group_id || null,
        reason,
        failure_type: failureContext?.type || null,
        failed_slot: failureContext?.bookingDate && failureContext?.startTime && failureContext?.endTime
          ? { date: failureContext.bookingDate, start_time: failureContext.startTime, end_time: failureContext.endTime }
          : null,
        occupied_by: failureContext?.occupiedBy || null,
        suggestions,
      },
    };
  }

  return { scheduled: groupScheduled, skipped: null };
}
