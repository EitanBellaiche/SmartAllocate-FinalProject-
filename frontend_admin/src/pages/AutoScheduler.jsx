import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api/api";
import IsraelDateInput from "../components/IsraelDateInput";
import SchedulingConstraintsPanel from "../components/SchedulingConstraintsPanel";
import { formatIsraelDate, formatIsraelDateRange, formatIsraelTime } from "../utils/datetime";

const DEFAULT_SEMESTER_MONTHS = 3;
const DEFAULT_HOURS_PER_DAY = 3;
const DEFAULT_DAYS_PER_WEEK = 1;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_TIME_WINDOWS = [
  { id: "morning", label: "Morning", start_time: "08:00", end_time: "12:00" },
  { id: "noon", label: "Noon", start_time: "12:00", end_time: "16:00" },
  { id: "evening", label: "Evening", start_time: "16:00", end_time: "22:00" },
];

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toDateValue(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeValue(dateObj) {
  const hh = String(dateObj.getHours()).padStart(2, "0");
  const mm = String(dateObj.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseIds(raw) {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildGroupId() {
  return `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractGroupSuggestions(item) {
  return Array.isArray(item?.suggestions) ? item.suggestions : [];
}

function extractSuggestionRules(suggestion) {
  return Array.isArray(suggestion?.rule_summary?.soft_matches)
    ? suggestion.rule_summary.soft_matches
    : [];
}

function normalizeNumericIds(values) {
  return Array.isArray(values)
    ? values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
}

function normalizePreferredTimeWindows(values) {
  return (Array.isArray(values) ? values : [])
    .map((window) => ({
      start_time: String(window?.start_time || "").slice(0, 5),
      end_time: String(window?.end_time || "").slice(0, 5),
    }))
    .filter((window) => window.start_time && window.end_time && window.start_time < window.end_time);
}

function toRunnableGroup(group, windowById = {}) {
  const preferredTimeWindows = normalizePreferredTimeWindows(group?.preferred_time_windows);
  if (preferredTimeWindows.length === 0) {
    const preferredWindow = windowById[String(group?.preferred_window_id || "").trim()];
    const startTime = String(preferredWindow?.start_time || "").slice(0, 5);
    const endTime = String(preferredWindow?.end_time || "").slice(0, 5);
    if (startTime && endTime && startTime < endTime) {
      preferredTimeWindows.push({ start_time: startTime, end_time: endTime });
    }
  }

  return {
    ...group,
    group_id: group?.group_id || buildGroupId(),
    type_ids: normalizeNumericIds(group?.type_ids),
    resource_ids: normalizeNumericIds(group?.resource_ids),
    responsible_user_id: String(group?.responsible_user_id || "").trim(),
    user_ids: Array.isArray(group?.user_ids)
      ? group.user_ids.map((value) => String(value || "").trim()).filter(Boolean)
      : parseIds(String(group?.user_ids || "")),
    hours_per_day: Number(group?.hours_per_day) || DEFAULT_HOURS_PER_DAY,
    days_per_week: Math.min(
      7,
      Math.max(1, Number(group?.days_per_week) || DEFAULT_DAYS_PER_WEEK)
    ),
    preferred_time_windows: preferredTimeWindows,
  };
}

function buildSuggestedRetryGroup(group, suggestion, windowById = {}) {
  if (!group || !suggestion) return null;

  const nextGroup = toRunnableGroup(group, windowById);
  if (suggestion.type === "timeslot") {
    const startTime = String(suggestion?.start_time || "").slice(0, 5);
    const endTime = String(suggestion?.end_time || "").slice(0, 5);
    if (!startTime || !endTime || startTime >= endTime) return null;
    nextGroup.preferred_time_windows = [{ start_time: startTime, end_time: endTime }];
    if (Array.isArray(suggestion.resource_ids) && suggestion.resource_ids.length > 0) {
      nextGroup.resource_ids = normalizeNumericIds(suggestion.resource_ids);
      nextGroup.type_ids = [];
    }
    return nextGroup;
  }

  if (suggestion.type === "resource") {
    if (!Array.isArray(suggestion.resource_ids) || suggestion.resource_ids.length === 0) return null;
    nextGroup.resource_ids = normalizeNumericIds(suggestion.resource_ids);
    nextGroup.type_ids = [];
    return nextGroup;
  }

  return null;
}

function buildSuggestionRetryKey({ jobId, groupId, suggestion }) {
  const resourceSignature = Array.isArray(suggestion?.resource_ids)
    ? suggestion.resource_ids.join(",")
    : "";
  return [
    String(jobId || "adhoc"),
    String(groupId || ""),
    String(suggestion?.type || ""),
    String(suggestion?.start_time || ""),
    String(suggestion?.end_time || ""),
    resourceSignature,
  ].join("::");
}

function buildGroupTitle(group, resourceTypes, resourceById) {
  if (!group) return "Allocation";
  const typeNames = Array.isArray(group.type_ids)
    ? group.type_ids
        .map((typeId) => resourceTypes.find((type) => Number(type.id) === Number(typeId))?.name || `Type ${typeId}`)
        .join(", ")
    : "";
  const resourceNames = (group.resource_ids || [])
    .map((id) => resourceById[id]?.name || `Resource ${id}`)
    .join(", ");
  return typeNames
    ? `${typeNames}${resourceNames ? ` + ${resourceNames}` : ""}`
    : resourceNames || "Allocation";
}

function buildDecisionStatsLine(stats) {
  if (!stats) return "";
  const parts = [];
  if (stats.used_locked_slot) parts.push("locked recurring slot");
  if (stats.used_preferred_window) parts.push("preferred window");
  if (Number(stats.attempted_slots) > 0) parts.push(`${Number(stats.attempted_slots)} slots checked`);
  return parts.join(" | ");
}

function buildScheduledDecisionSignature(item) {
  const decision = item?.decision_summary || {};
  const selectedResourceIds = (Array.isArray(decision.selected_resources) ? decision.selected_resources : [])
    .map((resource) => Number(resource?.id))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b)
    .join(",");
  const ruleSignature = (Array.isArray(decision.score_breakdown) ? decision.score_breakdown : [])
    .slice(0, 6)
    .map((rule) => `${rule?.id ?? "x"}:${Number(rule?.delta || 0)}`)
    .join("|");
  return [
    String(item?.group_id || ""),
    String(selectedResourceIds),
    String(Number(decision?.score || 0)),
    ruleSignature,
  ].join("::");
}

function groupScheduledDecisionItems(scheduled = []) {
  const grouped = new Map();
  for (const item of Array.isArray(scheduled) ? scheduled : []) {
    const signature = buildScheduledDecisionSignature(item);
    const current = grouped.get(signature);
    if (!current) {
      grouped.set(signature, {
        key: signature,
        item,
        occurrences: 1,
        dates: [item?.date].filter(Boolean),
      });
      continue;
    }
    current.occurrences += 1;
    if (item?.date) current.dates.push(item.date);
  }
  return Array.from(grouped.values());
}

function ScheduledDecisionCards({ scheduled, groupById, resourceTypes, resourceById }) {
  const groupedItems = groupScheduledDecisionItems(scheduled);
  if (groupedItems.length === 0) return null;
  return (
    <div className="space-y-3">
      {groupedItems.map(({ key, item, occurrences, dates }, idx) => {
        const group = groupById[item.group_id] || null;
        const title = buildGroupTitle(group, resourceTypes, resourceById);
        const decision = item?.decision_summary || {};
        const selectedResources = Array.isArray(decision.selected_resources)
          ? decision.selected_resources
          : [];
        const selectedRules = Array.isArray(decision.score_breakdown)
          ? decision.score_breakdown
          : [];
        const candidateGroups = Array.isArray(decision.candidate_groups)
          ? decision.candidate_groups
          : [];
        const statsLine = buildDecisionStatsLine(decision.search_stats);
        const sampleDates = dates.slice(0, 3).map((date) => formatIsraelDate(date)).join(", ");
        return (
          <div
            key={`scheduled-group-${key}-${idx}`}
            className="rounded-2xl border border-emerald-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{title}</div>
                <div className="mt-1 text-xs text-slate-600">
                  {occurrences} occurrences
                  {item?.start_time && item?.end_time
                    ? ` | ${formatIsraelTime(item.start_time)}-${formatIsraelTime(item.end_time)}`
                    : ""}
                  {sampleDates ? ` | ${sampleDates}` : ""}
                  {dates.length > 3 ? ` +${dates.length - 3} more` : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {Number.isFinite(Number(decision.score)) && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
                    Score {Number(decision.score)}
                  </span>
                )}
                {statsLine && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
                    {statsLine}
                  </span>
                )}
              </div>
            </div>

            {decision.narrative && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {decision.narrative}
              </div>
            )}

            {selectedResources.length > 0 && (
              <div className="mt-3 text-xs text-slate-600">
                Resources: {selectedResources.map((resource) => resource.name).join(", ")}
              </div>
            )}

            {Array.isArray(decision.blockers) && decision.blockers.length > 0 && (
              <div className="mt-2 text-xs text-amber-700">
                Before success: {decision.blockers.join(" | ")}
              </div>
            )}

            {selectedRules.length > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Score breakdown
                </div>
                <div className="mt-3 space-y-2">
                  {selectedRules.slice(0, 6).map((rule) => (
                    <div
                      key={`scheduled-rule-${item.booking_id || idx}-${rule.id}-${rule.name}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{rule.name}</div>
                        {rule.description && (
                          <div className="mt-1 text-xs text-slate-500">{rule.description}</div>
                        )}
                      </div>
                      <div
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          Number(rule.delta) >= 0
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {Number(rule.delta) > 0 ? "+" : ""}
                        {Number(rule.delta)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {candidateGroups.length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {candidateGroups.map((candidateGroup) => (
                  <div
                    key={`candidate-group-${item.booking_id || idx}-${candidateGroup.type_id}`}
                    className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3"
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                      {candidateGroup.type_name}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      Selected: {candidateGroup.selected_resource_name}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Selected score {candidateGroup.selected_score ?? "N/A"} | Best valid{" "}
                      {candidateGroup.best_valid_score ?? "N/A"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {candidateGroup.valid_candidates} valid | {candidateGroup.blocked_candidates} blocked
                    </div>
                    {Array.isArray(candidateGroup.top_alternatives) &&
                      candidateGroup.top_alternatives.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {candidateGroup.top_alternatives.map((alternative) => (
                            <div
                              key={`candidate-alt-${item.booking_id || idx}-${candidateGroup.type_id}-${alternative.resource_id}`}
                              className="rounded-xl border border-blue-100 bg-white px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium text-slate-900">
                                  {alternative.name}
                                </div>
                                <div className="text-xs font-semibold text-slate-600">
                                  Score {alternative.final_score}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AvailabilityDetailsModal({
  open,
  user,
  userId,
  slots,
  overrides,
  loading,
  error,
  onClose,
}) {
  if (!open) return null;

  const hasSlots = Array.isArray(slots) && slots.length > 0;
  const hasOverrides = Array.isArray(overrides) && overrides.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Responsible availability
            </div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {user?.full_name || "Responsible"}
            </div>
            <div className="mt-1 text-sm text-slate-500">{userId || "No ID"}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="max-h-[calc(85vh-96px)] overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Loading availability...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
              {error}
            </div>
          ) : !hasSlots && !hasOverrides ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
              No availability defined. Treated as available every day.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Weekly availability
                </div>
                {hasSlots ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {slots.map((slot) => (
                      <div
                        key={`availability-slot-${slot.id}`}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          {DAY_LABELS[Number(slot.day_of_week)] || `Day ${slot.day_of_week}`}
                        </div>
                        <div className="mt-1 text-sm text-slate-700">
                          {formatIsraelTime(slot.start_time)}-{formatIsraelTime(slot.end_time)}
                        </div>
                        {(slot.start_date || slot.end_date) && (
                          <div className="mt-2 text-xs text-slate-500">
                            {formatIsraelDateRange(slot.start_date, slot.end_date)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    No weekly availability records.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Date overrides
                </div>
                {hasOverrides ? (
                  <div className="space-y-3">
                    {overrides.map((slot) => (
                      <div
                        key={`availability-override-${slot.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {formatIsraelDate(slot.date)}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {slot.start_time && slot.end_time
                              ? `${formatIsraelTime(slot.start_time)}-${formatIsraelTime(slot.end_time)}`
                              : "Full day"}
                          </div>
                        </div>
                        <div
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            slot.is_available
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {slot.is_available ? "Available" : "Blocked"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    No override records.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkippedResultCards({
  skipped,
  groupById,
  resourceTypes,
  resourceById,
  onApplySuggestion,
  applyingSuggestionKey,
  getSuggestionActionKey,
}) {
  if (!Array.isArray(skipped) || skipped.length === 0) return null;
  return (
    <div className="space-y-3">
      {skipped.slice(0, 10).map((item, idx) => {
        const group = groupById[item.group_id] || null;
        const title = buildGroupTitle(group, resourceTypes, resourceById);
        const suggestions = extractGroupSuggestions(item);
        const failedSlot = item?.failed_slot;
        const occupiedBy = item?.occupied_by;
        return (
          <div
            key={`${item.group_id || idx}`}
            className="rounded-2xl border border-red-200 bg-white/75 p-4"
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {title}
            </div>
            <div className="text-sm font-semibold text-red-800">{item.reason}</div>
            {failedSlot?.date && failedSlot?.start_time && failedSlot?.end_time && (
              <div className="mt-1 text-xs text-red-700">
                Failed slot: {failedSlot.date} {failedSlot.start_time} - {failedSlot.end_time}
              </div>
            )}
            {occupiedBy?.resource_name && (
              <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                <div className="font-semibold">Blocking booking</div>
                <div className="mt-1">
                  Resource: {occupiedBy.resource_name}
                  {occupiedBy.resource_type_name ? ` (${occupiedBy.resource_type_name})` : ""}
                </div>
                <div>
                  Booking #{occupiedBy.id ?? occupiedBy.booking_id} | {occupiedBy.date} {occupiedBy.start_time}-
                  {occupiedBy.end_time}
                  {occupiedBy.user_id ? ` | User ${occupiedBy.user_id}` : ""}
                </div>
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                  Suggested alternatives
                </div>
                {suggestions.map((suggestion, suggestionIndex) => (
                  <div
                    key={`${item.group_id || idx}-suggestion-${suggestionIndex}`}
                    className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                        {suggestion.type === "timeslot" ? "Time Alternative" : "Resource Alternative"}
                      </span>
                      {Number.isFinite(Number(suggestion?.score)) && (
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                          Score {Number(suggestion.score)}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">
                      {suggestion.summary || "Alternative"}
                    </div>
                    {suggestion.why && (
                      <div className="mt-1 text-sm text-slate-600">{suggestion.why}</div>
                    )}
                    {suggestion.type === "timeslot" && (
                      <div className="mt-2 text-xs text-slate-600">
                        Suggested slot: {suggestion.date} {suggestion.start_time} - {suggestion.end_time}
                      </div>
                    )}
                    {Array.isArray(suggestion.resources) && suggestion.resources.length > 0 && (
                      <div className="mt-2 text-xs text-slate-600">
                        Resources: {suggestion.resources.map((resource) => resource.name).join(", ")}
                      </div>
                    )}
                    {extractSuggestionRules(suggestion).length > 0 && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Why this suggestion scored
                        </div>
                        <div className="mt-2 space-y-1">
                          {extractSuggestionRules(suggestion).slice(0, 4).map((rule) => (
                            <div
                              key={`suggestion-rule-${item.group_id || idx}-${suggestionIndex}-${rule.id}-${rule.name}`}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="text-slate-700">{rule.name}</span>
                              <span
                                className={`rounded-full px-2 py-1 font-semibold ${
                                  Number(rule.delta) >= 0
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {Number(rule.delta) > 0 ? "+" : ""}
                                {Number(rule.delta)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(suggestion.type === "resource" || suggestion.type === "timeslot") && (() => {
                      const actionKey = getSuggestionActionKey?.(item, suggestion) || "";
                      const isApplying = actionKey && applyingSuggestionKey === actionKey;
                      return (
                        <button
                          type="button"
                          className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => onApplySuggestion?.(item, suggestion)}
                          disabled={isApplying}
                        >
                          {isApplying
                            ? "Retrying..."
                            : suggestion.type === "timeslot"
                              ? "Retry with time suggestion"
                              : "Retry with resource suggestion"}
                        </button>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {skipped.length > 10 && (
        <div className="text-xs text-red-700">+{skipped.length - 10} more</div>
      )}

    </div>
  );
}

function toRunAt(deadlineDate, deadlineTime) {
  if (!deadlineDate || !deadlineTime) return null;
  const runAt = new Date(`${deadlineDate}T${deadlineTime}:00`);
  if (Number.isNaN(runAt.getTime())) return null;
  return runAt;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatCountdown(msLeft) {
  if (!Number.isFinite(msLeft)) return "";
  if (msLeft <= 0) return "00:00:00";
  const totalSeconds = Math.floor(msLeft / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const hh = pad2(hours);
  const mm = pad2(minutes);
  const ss = pad2(seconds);
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export default function AutoScheduler({ embedded = false }) {
  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [responsibleUsers, setResponsibleUsers] = useState([]);
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [responsibleOptions, setResponsibleOptions] = useState([]);
  const [responsibleLoading, setResponsibleLoading] = useState(false);
  const [responsibleError, setResponsibleError] = useState("");
  const [responsibleUser, setResponsibleUser] = useState(null);
  const [responsibleAvailability, setResponsibleAvailability] = useState([]);
  const [responsibleOverrides, setResponsibleOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");
  const [resourceTypeQuery, setResourceTypeQuery] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceFilterTypeId, setResourceFilterTypeId] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [rangeStart, setRangeStart] = useState(() => toDateValue(new Date()));
  const [rangeEnd, setRangeEnd] = useState(() =>
    toDateValue(addMonths(new Date(), DEFAULT_SEMESTER_MONTHS))
  );
  const [allowSaturday, setAllowSaturday] = useState(true);
  const [blockedDates, setBlockedDates] = useState([]);
  const [runMode, setRunMode] = useState("manual"); // manual | deadline
  const [deadlineDate, setDeadlineDate] = useState(() => toDateValue(new Date()));
  const [deadlineTime, setDeadlineTime] = useState("23:59");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [timeWindows, setTimeWindows] = useState(() => DEFAULT_TIME_WINDOWS);
  const [selection, setSelection] = useState({
    typeIds: [],
    resourceIds: [],
    responsibleId: "",
    userIds: "",
    hoursPerDay: String(DEFAULT_HOURS_PER_DAY),
    daysPerWeek: String(DEFAULT_DAYS_PER_WEEK),
    preferredWindowId: "",
  });
  const [groups, setGroups] = useState([]);
  const [lastRun, setLastRun] = useState({ scheduled: [], skipped: [], payload: null });
  const [allocations, setAllocations] = useState([]);
  const [allocationsLoading, setAllocationsLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [expandedJobIds, setExpandedJobIds] = useState([]);
  const [jobActionState, setJobActionState] = useState({ id: null, action: "" });
  const [suggestionActionKey, setSuggestionActionKey] = useState("");
  const [availabilityModal, setAvailabilityModal] = useState({
    open: false,
    userId: "",
    slots: [],
    overrides: [],
    loading: false,
    error: "",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [resourceData, typeData, availabilityData, usersData] = await Promise.all([
          apiGet("/resources"),
          apiGet("/resource-types"),
          apiGet("/user-availability"),
          apiGet("/users?role=responsible"),
        ]);
        setResources(Array.isArray(resourceData) ? resourceData : []);
        setResourceTypes(Array.isArray(typeData) ? typeData : []);
        setAvailability(Array.isArray(availabilityData) ? availabilityData : []);
        setResponsibleUsers(Array.isArray(usersData) ? usersData : []);
      } catch (err) {
        setMessageTone("error");
        setMessage(err?.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function loadJobs() {
    setJobsLoading(true);
    try {
      const data = await apiGet("/auto-schedule/jobs?limit=25");
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      setJobs([]);
      setMessageTone("error");
      setMessage(err?.message || "Failed to load scheduled jobs.");
    } finally {
      setJobsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(async () => {
      setResponsibleLoading(true);
      setResponsibleError("");
      try {
        const q = responsibleQuery.trim();
        const query = q ? `&q=${encodeURIComponent(q)}` : "";
        const data = await apiGet(`/users?role=responsible${query}`);
        if (!active) return;
        setResponsibleOptions(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!active) return;
        setResponsibleError(err?.message || "Failed to load responsible users.");
      } finally {
        if (active) setResponsibleLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [responsibleQuery]);

  useEffect(() => {
    const responsibleId = String(responsibleUser?.national_id || "").trim();
    if (!responsibleId) {
      setResponsibleAvailability([]);
      setResponsibleOverrides([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const [availabilityData, overrideData] = await Promise.all([
          apiGet(`/user-availability?user_id=${encodeURIComponent(responsibleId)}`),
          apiGet(`/user-availability/overrides?user_id=${encodeURIComponent(responsibleId)}`),
        ]);
        if (!active) return;
        setResponsibleAvailability(Array.isArray(availabilityData) ? availabilityData : []);
        setResponsibleOverrides(Array.isArray(overrideData) ? overrideData : []);
      } catch {
        if (!active) return;
        setResponsibleAvailability([]);
        setResponsibleOverrides([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [responsibleUser]);

  async function openAvailabilityModal(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return;

    setAvailabilityModal({
      open: true,
      userId: normalizedUserId,
      slots: [],
      overrides: [],
      loading: true,
      error: "",
    });

    try {
      const [availabilityData, overrideData] = await Promise.all([
        apiGet(`/user-availability?user_id=${encodeURIComponent(normalizedUserId)}`),
        apiGet(`/user-availability/overrides?user_id=${encodeURIComponent(normalizedUserId)}`),
      ]);

      setAvailabilityModal({
        open: true,
        userId: normalizedUserId,
        slots: Array.isArray(availabilityData) ? availabilityData : [],
        overrides: Array.isArray(overrideData) ? overrideData : [],
        loading: false,
        error: "",
      });
    } catch (err) {
      setAvailabilityModal({
        open: true,
        userId: normalizedUserId,
        slots: [],
        overrides: [],
        loading: false,
        error: err?.message || "Failed to load availability details.",
      });
    }
  }

  function closeAvailabilityModal() {
    setAvailabilityModal({
      open: false,
      userId: "",
      slots: [],
      overrides: [],
      loading: false,
      error: "",
    });
  }

  const availabilityByUser = useMemo(() => {
    return availability.reduce((acc, row) => {
      const key = String(row.user_id || "").trim();
      if (!key) return acc;
      acc[key] = acc[key] || [];
      acc[key].push(row);
      return acc;
    }, {});
  }, [availability]);

  const responsibleById = useMemo(() => {
    return responsibleUsers.reduce((acc, user) => {
      const key = String(user?.national_id || user?.id || "").trim();
      if (!key) return acc;
      acc[key] = user;
      return acc;
    }, {});
  }, [responsibleUsers]);

  const resourceById = useMemo(() => {
    return resources.reduce((acc, resource) => {
      acc[resource.id] = resource;
      return acc;
    }, {});
  }, [resources]);

  const lastRunGroupById = useMemo(() => {
    const payloadGroups = Array.isArray(lastRun?.payload?.groups) ? lastRun.payload.groups : [];
    return payloadGroups.reduce((acc, group) => {
      if (group?.group_id) acc[group.group_id] = group;
      return acc;
    }, {});
  }, [lastRun]);

  const filteredResourceTypes = useMemo(() => {
    const query = resourceTypeQuery.trim().toLowerCase();
    return resourceTypes.filter((type) => {
      if (!query) return true;
      return String(type.name || "").toLowerCase().includes(query);
    });
  }, [resourceTypes, resourceTypeQuery]);

  const filteredResources = useMemo(() => {
    const query = resourceQuery.trim().toLowerCase();
    return resources.filter((resource) => {
      const matchesQuery =
        !query ||
        String(resource.name || "").toLowerCase().includes(query) ||
        String(resource.type_name || "").toLowerCase().includes(query);
      const matchesType =
        !resourceFilterTypeId || String(resource.type_id) === String(resourceFilterTypeId);
      const matchesSelected =
        !showSelectedOnly || selection.resourceIds.includes(resource.id);
      return matchesQuery && matchesType && matchesSelected;
    });
  }, [resources, resourceQuery, resourceFilterTypeId, showSelectedOnly, selection.resourceIds]);

  function toggleResource(resourceId) {
    setSelection((prev) => {
      const exists = prev.resourceIds.includes(resourceId);
      const next = exists
        ? prev.resourceIds.filter((id) => id !== resourceId)
        : [...prev.resourceIds, resourceId];
      return { ...prev, resourceIds: next };
    });
  }

  function toggleType(typeId) {
    setSelection((prev) => {
      const exists = prev.typeIds.includes(typeId);
      const next = exists
        ? prev.typeIds.filter((id) => id !== typeId)
        : [...prev.typeIds, typeId];
      return { ...prev, typeIds: next };
    });
  }

  function addGroup() {
    if (selection.resourceIds.length === 0 && selection.typeIds.length === 0) {
      setMessage("Select at least one resource or resource type for the allocation.");
      return;
    }
    const group = {
      group_id: buildGroupId(),
      type_ids: selection.typeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
      resource_ids: selection.resourceIds,
      responsible_user_id: selection.responsibleId.trim(),
      user_ids: parseIds(selection.userIds),
      hours_per_day: Number(selection.hoursPerDay) || DEFAULT_HOURS_PER_DAY,
      days_per_week: Math.min(
        7,
        Math.max(1, Number(selection.daysPerWeek) || DEFAULT_DAYS_PER_WEEK)
      ),
      preferred_window_id: String(selection.preferredWindowId || "").trim(),
    };
    setGroups((prev) => [...prev, group]);
    setSelection({
      typeIds: [],
      resourceIds: [],
      responsibleId: "",
      userIds: "",
      hoursPerDay: String(DEFAULT_HOURS_PER_DAY),
      daysPerWeek: String(DEFAULT_DAYS_PER_WEEK),
      preferredWindowId: "",
    });
    setResponsibleQuery("");
    setResponsibleOptions([]);
    setResponsibleUser(null);
    setMessage("");
  }

  function updateGroup(groupId, patch) {
    setGroups((prev) =>
      prev.map((g) => (g.group_id === groupId ? { ...g, ...patch } : g))
    );
  }

  function removeGroup(groupId) {
    setGroups((prev) => prev.filter((g) => g.group_id !== groupId));
  }

  function moveGroup(groupId, direction) {
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.group_id === groupId);
      if (idx < 0) return prev;
      const nextIdx = direction === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  }

  function addTimeWindow() {
    const id = `win_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setTimeWindows((prev) => [
      ...prev,
      { id, label: "Custom window", start_time: "08:00", end_time: "12:00" },
    ]);
  }

  function updateTimeWindow(windowId, patch) {
    setTimeWindows((prev) => prev.map((w) => (w.id === windowId ? { ...w, ...patch } : w)));
  }

  function removeTimeWindow(windowId) {
    setTimeWindows((prev) => prev.filter((w) => w.id !== windowId));
    setGroups((prev) =>
      prev.map((g) =>
        g.preferred_window_id === windowId ? { ...g, preferred_window_id: "" } : g
      )
    );
    setSelection((prev) =>
      prev.preferredWindowId === windowId ? { ...prev, preferredWindowId: "" } : prev
    );
  }

  function buildWindowById() {
    return timeWindows.reduce((acc, window) => {
      const key = String(window?.id || "").trim();
      if (key) acc[key] = window;
      return acc;
    }, {});
  }

  function buildCurrentRunPayload() {
    const windowById = buildWindowById();
    return {
      start_date: rangeStart,
      end_date: rangeEnd,
      groups: groups.map((group) => toRunnableGroup(group, windowById)),
      allow_saturday: allowSaturday,
      blocked_dates: blockedDates,
    };
  }

  async function applyAutoSuggestion({ item, suggestion, group, runConfig, sourceJobId } = {}) {
    const groupId = item?.group_id || group?.group_id || "";
    if (!groupId || !suggestion || !group) return;
    if (running) return;

    const actionKey = buildSuggestionRetryKey({ jobId: sourceJobId, groupId, suggestion });
    const windowById = buildWindowById();
    const nextGroup = buildSuggestedRetryGroup(group, suggestion, windowById);
    if (!nextGroup) {
      setMessageTone("error");
      setMessage("This suggestion cannot be retried automatically.");
      return;
    }

    const startDate = String(runConfig?.start_date || "").trim();
    const endDate = String(runConfig?.end_date || "").trim();
    if (!startDate || !endDate) {
      setMessageTone("error");
      setMessage("Missing date range for the retry run.");
      return;
    }

    const nextPayload = {
      start_date: startDate,
      end_date: endDate,
      groups: [nextGroup],
      allow_saturday: runConfig?.allow_saturday !== false,
      blocked_dates: Array.isArray(runConfig?.blocked_dates) ? runConfig.blocked_dates : [],
      org_id: runConfig?.org_id || null,
    };

    setRunning(true);
    setSuggestionActionKey(actionKey);
    setMessage("");
    try {
      const data = await apiPost("/auto-schedule", nextPayload);
      const scheduledCount = data?.scheduled?.length || 0;
      const skippedCount = data?.skipped?.length || 0;
      setLastRun({
        scheduled: Array.isArray(data?.scheduled) ? data.scheduled : [],
        skipped: Array.isArray(data?.skipped) ? data.skipped : [],
        payload: nextPayload,
      });
      setMessageTone(skippedCount > 0 && scheduledCount === 0 ? "error" : "success");
      setMessage(
        skippedCount > 0 && scheduledCount === 0
          ? `Retry completed without results. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
          : `Retry created for the failed allocation. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
      );
      await loadAllocations();
      await loadJobs();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to retry failed allocation.");
      await loadJobs();
    } finally {
      setRunning(false);
      setSuggestionActionKey("");
    }
  }

  async function loadAllocations() {
    setAllocationsLoading(true);
    try {
      const qs = new URLSearchParams({
        start_date: rangeStart,
        end_date: rangeEnd,
      });
      const data = await apiGet(`/auto-schedule/allocations?${qs.toString()}`);
      setAllocations(Array.isArray(data) ? data : []);
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to load allocations.");
      setAllocations([]);
    } finally {
      setAllocationsLoading(false);
    }
  }

  async function runAutoSchedule() {
    if (running) return;
    if (groups.length === 0) {
      setMessageTone("error");
      setMessage("Add at least one allocation before running auto schedule.");
      return;
    }
    if (!rangeStart || !rangeEnd) {
      setMessageTone("error");
      setMessage("Choose both range start and range end.");
      return;
    }
    setRunning(true);
    setMessage("");
    try {
      const payload = buildCurrentRunPayload();
      const data = await apiPost("/auto-schedule", payload);
      const scheduledCount = data?.scheduled?.length || 0;
      const skippedCount = data?.skipped?.length || 0;
      setLastRun({
        scheduled: Array.isArray(data?.scheduled) ? data.scheduled : [],
        skipped: Array.isArray(data?.skipped) ? data.skipped : [],
        payload,
      });
      setMessageTone(skippedCount > 0 && scheduledCount === 0 ? "error" : "success");
      setMessage(
        skippedCount > 0 && scheduledCount === 0
          ? `Auto schedule completed without results. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
          : `Auto schedule completed. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
      );
      await loadAllocations();
      await loadJobs();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Auto schedule failed.");
      await loadJobs();
    } finally {
      setRunning(false);
    }
  }

  async function removeAllocation(allocation) {
    if (!allocation) return;
    setMessage("");
    try {
      await apiPost("/auto-schedule/allocations/delete", {
        start_date: rangeStart,
        end_date: rangeEnd,
        start_time: allocation.start_time,
        end_time: allocation.end_time,
        resource_ids: allocation.resource_ids,
        responsible_user_id: allocation.responsible_user_id,
      });
      setMessageTone("success");
      setMessage("Allocation removed.");
      await loadAllocations();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to remove allocation.");
    }
  }

  async function scheduleAtDeadline() {
    if (running) return;
    if (groups.length === 0) {
      setMessageTone("error");
      setMessage("Add at least one allocation before scheduling a deadline run.");
      return;
    }
    if (!rangeStart || !rangeEnd) {
      setMessageTone("error");
      setMessage("Choose both range start and range end.");
      return;
    }
    if (!deadlineDate || !deadlineTime) {
      setMessageTone("error");
      setMessage("Choose both deadline date and time.");
      return;
    }

    const runAt = toRunAt(deadlineDate, deadlineTime);
    if (!runAt) {
      setMessageTone("error");
      setMessage("Invalid deadline date/time.");
      return;
    }

    setRunning(true);
    setMessage("");
    try {
      const payload = buildCurrentRunPayload();
      const job = await apiPost("/auto-schedule/jobs", {
        run_at: runAt.toISOString(),
        start_date: payload.start_date,
        end_date: payload.end_date,
        groups: payload.groups,
        allow_saturday: payload.allow_saturday,
        blocked_dates: payload.blocked_dates,
      });
      setMessageTone("success");
      setMessage(
        `Auto schedule job created (ID ${job?.id || "?"}). It will run after the deadline.`
      );
      await loadJobs();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to create auto schedule job.");
    } finally {
      setRunning(false);
    }
  }

  async function cancelJob(job) {
    const jobId = Number(job?.id);
    if (!jobId) return;
    const isRunningJob = String(job?.status || "").trim().toLowerCase() === "running";
    if (isRunningJob) {
      const confirmed = window.confirm(
        `Force stop auto schedule job #${jobId}?`
      );
      if (!confirmed) return;
    }
    setJobActionState({ id: jobId, action: "cancel" });
    try {
      await apiPost(`/auto-schedule/jobs/${jobId}/cancel`, {});
      if (job && !isRunningJob) {
        loadJobIntoEditor(job);
      }
      setMessageTone("success");
      setMessage(
        isRunningJob
          ? `Job #${jobId} was force-stopped. You can now delete or rerun it.`
          : "Job cancelled. The setup is back in the editor."
      );
      await loadJobs();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to cancel job.");
    } finally {
      setJobActionState({ id: null, action: "" });
    }
  }

  function toggleJobExpanded(jobId) {
    setExpandedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  }

  async function deleteJob(jobId) {
    if (!jobId) return;
    const confirmed = window.confirm(`Delete auto schedule job #${jobId}?`);
    if (!confirmed) return;
    setJobActionState({ id: jobId, action: "delete" });
    try {
      await apiDelete(`/auto-schedule/jobs/${jobId}`);
      setExpandedJobIds((prev) => prev.filter((id) => id !== jobId));
      setMessageTone("success");
      setMessage(`Job #${jobId} deleted.`);
      await loadJobs();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to delete job.");
    } finally {
      setJobActionState({ id: null, action: "" });
    }
  }

  async function rerunJob(jobId) {
    if (!jobId) return;
    setJobActionState({ id: jobId, action: "rerun" });
    try {
      const rerun = await apiPost(`/auto-schedule/jobs/${jobId}/rerun`, {});
      setMessageTone("success");
      setMessage(`Job rerun created as job #${rerun?.id || "?"}.`);
      await loadJobs();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to rerun job.");
    } finally {
      setJobActionState({ id: null, action: "" });
    }
  }

  function loadJobIntoEditor(job) {
    const payload = job?.payload || {};
    const payloadGroups = Array.isArray(payload.groups) ? payload.groups : [];
    const windowsByKey = new Map();
    const nextWindows = [];

    for (const group of payloadGroups) {
      const preferredList = Array.isArray(group?.preferred_time_windows)
        ? group.preferred_time_windows
        : [];
      const firstWindow = preferredList[0];
      const startTime = String(firstWindow?.start_time || "").slice(0, 5);
      const endTime = String(firstWindow?.end_time || "").slice(0, 5);
      if (!startTime || !endTime) continue;
      const key = `${startTime}-${endTime}`;
      if (windowsByKey.has(key)) continue;
      const id = `loaded_${nextWindows.length + 1}_${Date.now()}`;
      windowsByKey.set(key, id);
      nextWindows.push({
        id,
        label: `Loaded ${startTime}-${endTime}`,
        start_time: startTime,
        end_time: endTime,
      });
    }

    const normalizedGroups = payloadGroups.map((group) => {
      const preferredList = Array.isArray(group?.preferred_time_windows)
        ? group.preferred_time_windows
        : [];
      const firstWindow = preferredList[0];
      const startTime = String(firstWindow?.start_time || "").slice(0, 5);
      const endTime = String(firstWindow?.end_time || "").slice(0, 5);
      const preferredWindowId =
        startTime && endTime ? windowsByKey.get(`${startTime}-${endTime}`) || "" : "";

      return {
        group_id: group?.group_id || buildGroupId(),
        type_ids: Array.isArray(group?.type_ids)
          ? group.type_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
          : [],
        resource_ids: Array.isArray(group?.resource_ids)
          ? group.resource_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
          : [],
        responsible_user_id: String(group?.responsible_user_id || "").trim(),
        user_ids: Array.isArray(group?.user_ids) ? group.user_ids.map(String) : [],
        hours_per_day: Number(group?.hours_per_day) || DEFAULT_HOURS_PER_DAY,
        days_per_week: Math.min(7, Math.max(1, Number(group?.days_per_week) || DEFAULT_DAYS_PER_WEEK)),
        preferred_window_id: preferredWindowId,
      };
    });

    setRangeStart(String(payload?.start_date || "").trim());
    setRangeEnd(String(payload?.end_date || "").trim());
    setAllowSaturday(payload?.allow_saturday !== false);
    setBlockedDates(
      Array.isArray(payload?.blocked_dates)
        ? payload.blocked_dates
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        : []
    );
    setTimeWindows(nextWindows.length > 0 ? nextWindows : DEFAULT_TIME_WINDOWS);
    setGroups(normalizedGroups);
    setSelection({
      typeIds: [],
      resourceIds: [],
      responsibleId: "",
      userIds: "",
      hoursPerDay: String(DEFAULT_HOURS_PER_DAY),
      daysPerWeek: String(DEFAULT_DAYS_PER_WEEK),
      preferredWindowId: "",
    });
    setResponsibleQuery("");
    setResponsibleOptions([]);
    setResponsibleUser(null);

    const runAt = job?.run_at ? new Date(job.run_at) : null;
    if (runAt && !Number.isNaN(runAt.getTime()) && String(job?.status || "") === "scheduled") {
      setRunMode("deadline");
      setDeadlineDate(toDateValue(runAt));
      setDeadlineTime(toTimeValue(runAt));
    } else {
      setRunMode("manual");
    }

    setMessageTone("success");
    setMessage(`Job #${job?.id || "?"} loaded into the editor. Update the allocations and run it again.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function revertJob(jobId) {
    if (!jobId) return;
    const confirmed = window.confirm(
      `Cancel all bookings created by auto schedule job #${jobId}?`
    );
    if (!confirmed) return;
    setJobActionState({ id: jobId, action: "revert" });
    try {
      const result = await apiPost(`/auto-schedule/jobs/${jobId}/revert`, {});
      const revertedCount = Number(result?.reverted_count) || Number(result?.result?.revert?.cancelled_count) || 0;
      setMessageTone("success");
      setMessage(
        revertedCount > 0
          ? `Cancelled ${revertedCount} bookings created by job #${jobId}.`
          : `Job #${jobId} was reverted.`
      );
      await loadJobs();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to cancel job results.");
    } finally {
      setJobActionState({ id: null, action: "" });
    }
  }

  const nextScheduledJob = useMemo(() => {
    const scheduledJobs = jobs
      .filter((job) => job?.status === "scheduled" && job?.run_at)
      .map((job) => {
        const dt = new Date(job.run_at);
        return Number.isNaN(dt.getTime()) ? null : { job, runAt: dt };
      })
      .filter(Boolean)
      .sort((a, b) => a.runAt.getTime() - b.runAt.getTime());

    return scheduledJobs[0] || null;
  }, [jobs]);

  const selectedRunAt = useMemo(() => toRunAt(deadlineDate, deadlineTime), [deadlineDate, deadlineTime]);

  const deadlineDisabledReason = useMemo(() => {
    if (running) return "Scheduler is currently working.";
    if (groups.length === 0) return "Add at least one allocation first.";
    if (!rangeStart || !rangeEnd) return "Select range start and range end.";
    if (!deadlineDate || !deadlineTime) return "Select deadline date and time.";
    if (!selectedRunAt) return "Invalid deadline date/time.";
    return "";
  }, [running, groups.length, rangeStart, rangeEnd, deadlineDate, deadlineTime, selectedRunAt]);

  const canScheduleAtDeadline = !deadlineDisabledReason;

  const countdownTarget = useMemo(() => {
    if (nextScheduledJob?.runAt) return nextScheduledJob.runAt;
    if (runMode === "deadline") return selectedRunAt;
    return null;
  }, [nextScheduledJob, runMode, selectedRunAt]);

  const countdownText = useMemo(() => {
    if (!countdownTarget) return "";
    const msLeft = countdownTarget.getTime() - nowTick;
    return formatCountdown(msLeft);
  }, [countdownTarget, nowTick]);

  useEffect(() => {
    if (runMode !== "deadline") return;
    if (!countdownTarget) return;

    const msLeft = countdownTarget.getTime() - nowTick;
    const shouldPoll = msLeft <= 2 * 60_000; // 2 minutes before/after deadline
    if (!shouldPoll) return;

    const id = setInterval(() => {
      loadJobs();
    }, 5000);
    return () => clearInterval(id);
  }, [runMode, countdownTarget, nowTick]);

  return (
    <div className={embedded ? "" : "p-6"}>
      {!embedded && (
        <div className="mb-6 rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_50%,#ffffff_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div>
            <div className="inline-flex rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              Auto Planner
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Auto Scheduler
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Build allocations by picking resources together, then schedule by teacher availability.
            </p>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mb-5 rounded-2xl px-4 py-3 text-sm ${
            messageTone === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : messageTone === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {message}
        </div>
      )}

      {loading && (
        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Loading scheduler data...
        </div>
      )}

      <div className="auto-run-panel mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="auto-run-panel__range grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="auto-run-field">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Range start</label>
            <IsraelDateInput
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              value={rangeStart}
              onChange={setRangeStart}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Range end</label>
            <IsraelDateInput
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              value={rangeEnd}
              onChange={setRangeEnd}
            />
          </div>
          <button
            type="button"
            onClick={runAutoSchedule}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.26)] transition hover:bg-blue-700 disabled:bg-slate-400 disabled:shadow-none"
            disabled={groups.length === 0 || running}
          >
            {running ? "Running..." : "Run auto schedule"}
          </button>
        </div>

        <div className="auto-run-deadline mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="auto-run-deadline__header flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="auto-run-deadline__label text-sm font-semibold text-slate-800">Run mode</div>
              <div className="auto-run-deadline__hint">Choose whether scheduling starts now or waits for a deadline.</div>
            </div>
            <div className="auto-run-mode-toggle inline-flex rounded-2xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setRunMode("manual")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  runMode === "manual" ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Immediate scheduling
              </button>
              <button
                type="button"
                onClick={() => setRunMode("deadline")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  runMode === "deadline" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Time-based scheduling
              </button>
            </div>
          </div>

          {runMode === "deadline" && (
            <div className="auto-run-deadline__grid mt-4 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="auto-run-field md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Deadline date
            </label>
            <IsraelDateInput
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
              value={deadlineDate}
              onChange={setDeadlineDate}
            />
          </div>
          <div className="auto-run-field">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Deadline time
            </label>
            <input
              type="time"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
            />
          </div>
          <div className="auto-run-deadline__status md:col-span-2">
            {canScheduleAtDeadline ? (
              <button
                type="button"
                onClick={scheduleAtDeadline}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
                disabled={running}
              >
                {running ? "Working..." : "Schedule after deadline"}
              </button>
            ) : (
              <div className="auto-run-notice rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Can’t schedule yet
                </div>
                <div className="mt-1">{deadlineDisabledReason}</div>
              </div>
            )}
          </div>
              <div className="auto-run-deadline__insights md:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="auto-countdown-card rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Countdown
                  </div>
                  <div className="auto-countdown-card__value mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                    {countdownText || "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {countdownTarget
                      ? `Target: ${countdownTarget.toLocaleString("he-IL")}`
                      : "Pick a deadline to start the countdown."}
                  </div>
                </div>
                <div className="auto-deadline-explain rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  After the deadline passes, the backend will automatically run the scheduler once with the current allocations.
                  If you created a job, the countdown follows the nearest scheduled job.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <SchedulingConstraintsPanel
        allowSaturday={allowSaturday}
        onAllowSaturdayChange={setAllowSaturday}
        blockedDates={blockedDates}
        onBlockedDatesChange={setBlockedDates}
        title="Scheduling constraints"
        description="Apply the same blocked-day rules to immediate runs and deadline-based auto scheduling."
        className="mb-6 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
      />

      <div className="auto-windows-panel mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Time window priorities</h2>
          <button
            type="button"
            onClick={addTimeWindow}
            className="rounded-2xl border border-blue-200 bg-white px-4 py-2.5 font-medium text-blue-700 transition hover:bg-blue-50"
          >
            Add window
          </button>
        </div>
        <div className="text-sm text-slate-600 mb-4">
          Allocations assigned to a window will try to schedule inside that time range first.
        </div>
        {timeWindows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No windows defined.
          </div>
        ) : (
          <div className="auto-windows-grid space-y-3">
            {timeWindows.map((w) => (
              <div key={w.id} className="auto-window-card rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="auto-window-card__grid grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div className="auto-window-card__label md:col-span-2">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Label
                    </label>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                      value={w.label}
                      onChange={(e) => updateTimeWindow(w.id, { label: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Start
                    </label>
                    <input
                      type="time"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                      value={w.start_time}
                      onChange={(e) => updateTimeWindow(w.id, { start_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      End
                    </label>
                    <input
                      type="time"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                      value={w.end_time}
                      onChange={(e) => updateTimeWindow(w.id, { end_time: e.target.value })}
                    />
                  </div>
                  <div className="auto-window-card__remove flex items-end">
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-red-200 bg-white px-3 py-2.5 text-red-600 transition hover:bg-red-50"
                      onClick={() => removeTimeWindow(w.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="auto-jobs-panel mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="auto-jobs-panel__header flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="auto-run-field">
            <h2 className="text-xl font-semibold text-slate-900">Scheduled jobs</h2>
            <p className="mt-1 text-sm text-slate-500">
              Recent automation runs are kept in a compact activity panel.
            </p>
          </div>
          <button
            type="button"
            onClick={loadJobs}
            className="auto-jobs-panel__refresh rounded-2xl border border-blue-200 bg-white px-4 py-2.5 font-medium text-blue-700 transition hover:bg-blue-50"
            disabled={jobsLoading}
          >
            {jobsLoading ? "Loading..." : "Refresh jobs"}
          </button>
        </div>
        {jobsLoading ? (
          <div className="text-sm text-slate-500">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="auto-jobs-empty rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No scheduled jobs yet.
          </div>
        ) : (
          <div className="auto-jobs-list space-y-3">
            {jobs.map((job) => {
              const runAt = job?.run_at ? new Date(job.run_at) : null;
              const runAtLabel = runAt && !Number.isNaN(runAt.getTime())
                ? runAt.toLocaleString("he-IL")
                : String(job?.run_at || "");
              const statusKey = String(job?.status || "").trim().toLowerCase();
              const status = statusKey.toUpperCase() || "UNKNOWN";
              const allocationCount = Array.isArray(job?.payload?.groups)
                ? job.payload.groups.length
                : 0;
              const jobGroupById = Array.isArray(job?.payload?.groups)
                ? job.payload.groups.reduce((acc, group) => {
                    if (group?.group_id) acc[group.group_id] = group;
                    return acc;
                  }, {})
                : {};
              const result = job?.result || {};
              const scheduled = Array.isArray(result?.scheduled) ? result.scheduled : [];
              const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
              const revertInfo = result?.revert || null;
              const isReverted = Boolean(revertInfo?.reverted_at);
              const isExpanded = expandedJobIds.includes(job.id);
              const canView = scheduled.length > 0 || skipped.length > 0;
              const actionBusy = jobActionState.id === job.id ? jobActionState.action : "";
              return (
                <div
                  key={job.id}
                  className={`auto-job-card rounded-2xl border border-slate-200 bg-slate-50/70 p-4 ${isExpanded ? "auto-job-card--expanded" : ""}`}
                >
                  <div className="auto-job-card__summary flex flex-wrap items-center justify-between gap-3">
                    <div className="auto-job-card__title font-semibold text-slate-900">
                      Job #{job.id} · {status}
                    </div>
                    <div className="auto-job-card__actions flex flex-wrap gap-2">
                      {canView && (
                        <button
                          type="button"
                          className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
                          onClick={() => toggleJobExpanded(job.id)}
                        >
                          {isExpanded ? "Hide results" : "View results"}
                        </button>
                      )}
                      {statusKey !== "running" && (
                        <button
                          type="button"
                          className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
                          onClick={() => loadJobIntoEditor(job)}
                        >
                          Edit
                        </button>
                      )}
                      {(statusKey === "scheduled" || statusKey === "running") && (
                        <button
                          type="button"
                          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                          onClick={() => cancelJob(job)}
                          disabled={actionBusy === "cancel"}
                        >
                          {actionBusy === "cancel"
                            ? (statusKey === "running" ? "Stopping..." : "Cancelling...")
                            : (statusKey === "running" ? "Force stop" : "Cancel job")}
                        </button>
                      )}
                      {statusKey === "completed" && scheduled.length > 0 && !isReverted && (
                        <button
                          type="button"
                          className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
                          onClick={() => revertJob(job.id)}
                          disabled={actionBusy === "revert"}
                        >
                          {actionBusy === "revert" ? "Cancelling..." : "Cancel results"}
                        </button>
                      )}
                      {statusKey !== "running" && (
                        <button
                          type="button"
                          className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                          onClick={() => rerunJob(job.id)}
                          disabled={actionBusy === "rerun"}
                        >
                          {actionBusy === "rerun" ? "Creating..." : "Run again"}
                        </button>
                      )}
                      {statusKey !== "running" && (
                        <button
                          type="button"
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                          onClick={() => deleteJob(job.id)}
                          disabled={actionBusy === "delete"}
                        >
                          {actionBusy === "delete" ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="auto-job-card__line mt-1 text-xs leading-6 text-slate-600">
                    Run at: {runAtLabel} | Allocations: {allocationCount}
                  </div>
                  <div className="auto-job-card__line mt-1 text-xs leading-6 text-slate-600">
                    Saturday: {job?.payload?.allow_saturday === false ? "blocked" : "allowed"} | Blocked dates: {Array.isArray(job?.payload?.blocked_dates) ? job.payload.blocked_dates.length : 0}
                  </div>
                  {(scheduled.length > 0 || skipped.length > 0) && (
                    <div className="auto-job-card__line mt-1 text-xs leading-6 text-slate-600">
                      Scheduled: {scheduled.length} | Skipped: {skipped.length}
                    </div>
                  )}
                  {isReverted && (
                    <div className="auto-job-card__line mt-1 text-xs leading-6 text-amber-700">
                      Results cancelled: {Number(revertInfo?.cancelled_count) || 0} bookings | {new Date(revertInfo.reverted_at).toLocaleString("he-IL")}
                    </div>
                  )}
                  {job.error && (
                    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {job.error}
                    </div>
                  )}
                  {isExpanded && (
                    <div className="auto-job-card__details mt-4 space-y-4">
                      {scheduled.length > 0 && (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                            Scheduled decisions
                          </div>
                          <ScheduledDecisionCards
                            scheduled={scheduled}
                            groupById={jobGroupById}
                            resourceTypes={resourceTypes}
                            resourceById={resourceById}
                          />
                        </div>
                      )}
                      {skipped.length > 0 && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                            Skipped details
                          </div>
                          <SkippedResultCards
                            skipped={skipped}
                            groupById={jobGroupById}
                            resourceTypes={resourceTypes}
                            resourceById={resourceById}
                            onApplySuggestion={(item, suggestion) =>
                              applyAutoSuggestion({
                                item,
                                suggestion,
                                group: jobGroupById[item?.group_id] || null,
                                runConfig: job?.payload || null,
                                sourceJobId: job.id,
                              })
                            }
                            applyingSuggestionKey={suggestionActionKey}
                            getSuggestionActionKey={(item, suggestion) =>
                              buildSuggestionRetryKey({
                                jobId: job.id,
                                groupId: item?.group_id,
                                suggestion,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="auto-availability-panel mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Responsible availability</h2>
        {availability.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No availability found.
          </div>
        ) : (
          <div className="auto-availability-grid space-y-3">
            {Object.entries(availabilityByUser).map(([userId, slots]) => {
              const user = responsibleById[userId];
              return (
                <div key={userId} className="auto-availability-card rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="auto-availability-card__header">
                    <div className="font-semibold text-slate-900">
                      {user?.full_name || "Responsible"}
                    </div>
                    <span>{slots.length} slots</span>
                  </div>
                  <div className="auto-availability-card__id">{userId}</div>
                  <div className="auto-availability-slots mt-3 text-xs leading-6 text-slate-600">
                    {slots.map((slot, index) => (
                      <span key={`${userId}-${index}`}>
                        Day {slot.day_of_week} · {slot.start_time?.slice?.(0, 5) || slot.start_time}
                        -{slot.end_time?.slice?.(0, 5) || slot.end_time}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Build allocation</h2>
        <div className="mb-4 text-sm text-slate-600">
          You can combine specific resources and whole resource types in the same allocation.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="mb-2 text-base font-semibold text-slate-900">Whole resource types</div>
            <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="text"
                className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500"
                value={resourceTypeQuery}
                onChange={(e) => setResourceTypeQuery(e.target.value)}
                placeholder="Search resource types..."
              />
              {filteredResourceTypes.map((type) => (
                <label key={type.id} className="mb-2 flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm text-slate-700 shadow-sm">
                  <input
                    type="checkbox"
                    checked={selection.typeIds.includes(type.id)}
                    onChange={() => toggleType(type.id)}
                  />
                  <span>{type.name}</span>
                </label>
              ))}
              {filteredResourceTypes.length === 0 && (
                <div className="text-xs text-slate-500">No resource types found.</div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-base font-semibold text-slate-900">Specific resources</div>
            <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 grid gap-3">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500"
                  placeholder="Search resources..."
                  value={resourceQuery}
                  onChange={(e) => setResourceQuery(e.target.value)}
                />
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500"
                    value={resourceFilterTypeId}
                    onChange={(e) => setResourceFilterTypeId(e.target.value)}
                  >
                    <option value="">All resource types</option>
                    {resourceTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={showSelectedOnly}
                      onChange={(e) => setShowSelectedOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Selected only</span>
                  </label>
                </div>
              </div>
              {filteredResources.map((resource) => {
                const type = resourceTypes.find((t) => t.id === resource.type_id);
                const typeName = type?.name || resource.type_name || "Resource";
                return (
                  <label key={resource.id} className="mb-2 flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm text-slate-700 shadow-sm">
                    <input
                      type="checkbox"
                      checked={selection.resourceIds.includes(resource.id)}
                      onChange={() => toggleResource(resource.id)}
                    />
                    <span>{resource.name}</span>
                    <span className="text-xs text-slate-500">({typeName})</span>
                  </label>
                );
              })}
              {filteredResources.length === 0 && (
                <div className="text-xs text-slate-500">No resources match.</div>
              )}
            </div>
          </div>
          <div className="grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">People assignment</h3>
              <p className="mt-1 text-sm text-slate-500">
                Keep this optional. Pick a responsible user only when this allocation should be tied to one, and optionally add additional user IDs.
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Responsible user (optional)
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={responsibleQuery}
                onChange={(e) => {
                  setResponsibleQuery(e.target.value);
                  setResponsibleUser(null);
                  setSelection((prev) => ({ ...prev, responsibleId: "" }));
                }}
                placeholder="Search by name, email, or ID"
              />
              {responsibleLoading && (
                <div className="mt-2 text-sm text-slate-500">Loading users...</div>
              )}
              {responsibleError && (
                <div className="mt-2 text-sm text-red-600">{responsibleError}</div>
              )}
              {responsibleOptions.length > 0 && (
                <div className="mt-3 max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  {responsibleOptions.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="w-full rounded-xl px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        const nextId = String(user.national_id || user.id || "").trim();
                        setResponsibleUser(user);
                        setResponsibleQuery(
                          user.full_name || user.email || user.national_id || ""
                        );
                        setSelection((prev) => ({ ...prev, responsibleId: nextId }));
                      }}
                    >
                      {user.full_name || "User"} · {user.national_id || "No ID"} · {user.email}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">
                Selected: {responsibleUser?.national_id || selection.responsibleId || "None"}
              </div>
            </div>

            {responsibleUser && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-slate-700">
                <div className="mb-2 font-semibold text-slate-900">Responsible availability</div>
                {responsibleAvailability.length === 0 && responsibleOverrides.length === 0 ? (
                  <div>No availability defined. Treated as available every day.</div>
                ) : (
                  <>
                    {responsibleAvailability.length > 0 && (
                      <div className="space-y-1">
                        {responsibleAvailability.map((slot) => (
                          <div key={slot.id}>
                            {DAY_LABELS[Number(slot.day_of_week)] || `Day ${slot.day_of_week}`}{" "}
                            {formatIsraelTime(slot.start_time)}-{formatIsraelTime(slot.end_time)}
                            {slot.start_date || slot.end_date
                              ? ` | ${formatIsraelDateRange(slot.start_date, slot.end_date)}`
                              : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {responsibleOverrides.length > 0 && (
                      <div className="mt-3 border-t border-emerald-100 pt-3 text-xs text-slate-500">
                        Overrides:
                        {responsibleOverrides.map((slot) => (
                          <div key={slot.id}>
                            {formatIsraelDate(slot.date)} | {slot.is_available ? "Available" : "Blocked"}
                            {slot.start_time && slot.end_time
                              ? ` | ${formatIsraelTime(slot.start_time)}-${formatIsraelTime(slot.end_time)}`
                              : ""}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Assigned user IDs
              </label>
              <textarea
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={selection.userIds}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, userIds: e.target.value }))
                }
                placeholder="e.g. 12345, 67890"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Preferred time window (optional)
              </label>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={selection.preferredWindowId}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, preferredWindowId: e.target.value }))
                }
              >
                <option value="">No preference</option>
                {timeWindows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} ({w.start_time}-{w.end_time})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Hours per day
              </label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={selection.hoursPerDay}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, hoursPerDay: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Days per week
              </label>
              <input
                type="number"
                min="1"
                max="7"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500"
                value={selection.daysPerWeek}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, daysPerWeek: e.target.value }))
                }
              />
              <div className="mt-1 text-xs text-slate-500">
                Auto schedule will split the weekly hours into this many sessions.
              </div>
            </div>
            <button
              type="button"
              className="rounded-2xl border border-blue-200 bg-white px-4 py-3 font-medium text-blue-700 transition hover:bg-blue-50"
              onClick={addGroup}
            >
              Add allocation
            </button>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs text-slate-600">
              {selection.resourceIds.length > 0 || selection.typeIds.length > 0
                ? `${selection.resourceIds.length} fixed resources selected. ${selection.typeIds.length} resource types selected for automatic matching.`
                : "No resources selected yet."}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Allocations</h2>
        <div className="mb-4 text-sm text-slate-600">
          Order matters: allocations at the top are scheduled first.
        </div>
        {groups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">No allocations yet.</div>
        )}
        {groups.length > 0 && (
          <div className="space-y-4">
            {groups.map((group, index) => {
              const typeNames = Array.isArray(group.type_ids)
                ? group.type_ids
                    .map((typeId) => resourceTypes.find((type) => Number(type.id) === Number(typeId))?.name || `Type ${typeId}`)
                    .join(", ")
                : "";
              const resourceNames = (group.resource_ids || [])
                .map((id) => resourceById[id]?.name || `Resource ${id}`)
                .join(", ");
              const title = typeNames
                ? `${typeNames}${resourceNames ? ` + ${resourceNames}` : ""}`
                : resourceNames;
              return (
                <div key={group.group_id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">
                      #{index + 1} · {title}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        onClick={() => moveGroup(group.group_id, "up")}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        onClick={() => moveGroup(group.group_id, "down")}
                        disabled={index === groups.length - 1}
                      >
                        Down
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Responsible user ID
                      </label>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={group.responsible_user_id}
                        onChange={(e) =>
                          updateGroup(group.group_id, { responsible_user_id: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Assigned user IDs</label>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={group.user_ids.join(", ")}
                        onChange={(e) =>
                          updateGroup(group.group_id, { user_ids: parseIds(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Preferred window
                      </label>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={group.preferred_window_id || ""}
                        onChange={(e) =>
                          updateGroup(group.group_id, { preferred_window_id: e.target.value })
                        }
                      >
                        <option value="">No preference</option>
                        {timeWindows.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.label} ({w.start_time}-{w.end_time})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Hours per day</label>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={
                          group.hours_per_day ??
                          (Number(group.weekly_hours || 0) > 0
                            ? Number(group.weekly_hours) / (Number(group.days_per_week || 1) || 1)
                            : DEFAULT_HOURS_PER_DAY)
                        }
                        onChange={(e) =>
                          updateGroup(group.group_id, {
                            hours_per_day: Number(e.target.value) || DEFAULT_HOURS_PER_DAY,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Days per week
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="7"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
                        value={group.days_per_week ?? DEFAULT_DAYS_PER_WEEK}
                        onChange={(e) =>
                          updateGroup(group.group_id, {
                            days_per_week: Math.min(7, Math.max(1, Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="w-full rounded-2xl border border-red-200 bg-white px-3 py-2.5 text-red-600 transition hover:bg-red-50"
                        onClick={() => removeGroup(group.group_id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {group.responsible_user_id && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="text-xs text-slate-600">
                        Availability records:{" "}
                        {availabilityByUser[group.responsible_user_id]?.length || 0}
                      </div>
                      <button
                        type="button"
                        onClick={() => openAvailabilityModal(group.responsible_user_id)}
                        className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                      >
                        View full availability
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Allocations in range</h2>
          <button
            type="button"
            onClick={loadAllocations}
            className="rounded-2xl border border-blue-200 bg-white px-4 py-2.5 font-medium text-blue-700 transition hover:bg-blue-50"
            disabled={allocationsLoading}
          >
            {allocationsLoading ? "Loading..." : "Refresh list"}
          </button>
        </div>
        {allocationsLoading ? (
          <div className="text-sm text-slate-500">Loading allocations...</div>
        ) : allocations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">No allocations found in this range.</div>
        ) : (
          <div className="space-y-3">
            {allocations.map((item, idx) => {
              const resourcesLabel = Array.isArray(item.resource_names)
                ? item.resource_names.join(", ")
                : Array.isArray(item.resource_ids)
                  ? item.resource_ids.join(", ")
                  : "Resources";
              const dayLabel =
                DAY_LABELS[item.day_of_week] || `Day ${item.day_of_week}`;
              return (
                <div key={`${item.responsible_user_id}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="font-semibold text-slate-900">{resourcesLabel}</div>
                  <div className="mt-1 text-xs leading-6 text-slate-600">
                    Responsible: {item.responsible_user_id} | {dayLabel} |{" "}
                    {formatIsraelTime(item.start_time)}-{formatIsraelTime(item.end_time)} |{" "}
                    {formatIsraelDate(item.start_date)} {"->"} {formatIsraelDate(item.end_date)} | {item.occurrences} weeks
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-red-600 transition hover:bg-red-50"
                    onClick={() => removeAllocation(item)}
                  >
                    Remove allocation
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lastRun.scheduled.length > 0 && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Scheduled decisions
              </div>
              <div className="mt-1 text-sm text-emerald-900">
                {lastRun.scheduled.length} sessions scheduled. Repeated decisions are grouped once.
              </div>
            </div>
            <div className="text-xs text-emerald-800">
              Allocations in range still shows the final recurring result.
            </div>
          </div>
          <ScheduledDecisionCards
            scheduled={lastRun.scheduled}
            groupById={lastRunGroupById}
            resourceTypes={resourceTypes}
            resourceById={resourceById}
          />
        </div>
      )}
      {lastRun.skipped.length > 0 && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
            Skipped details
          </div>
          <SkippedResultCards
            skipped={lastRun.skipped}
            groupById={lastRunGroupById}
            resourceTypes={resourceTypes}
            resourceById={resourceById}
            onApplySuggestion={(item, suggestion) =>
              applyAutoSuggestion({
                item,
                suggestion,
                group: lastRunGroupById[item?.group_id] || null,
                runConfig: lastRun?.payload || null,
                sourceJobId: "last-run",
              })
            }
            applyingSuggestionKey={suggestionActionKey}
            getSuggestionActionKey={(item, suggestion) =>
              buildSuggestionRetryKey({
                jobId: "last-run",
                groupId: item?.group_id,
                suggestion,
              })
            }
          />
        </div>
      )}

      <AvailabilityDetailsModal
        open={availabilityModal.open}
        user={responsibleById[availabilityModal.userId]}
        userId={availabilityModal.userId}
        slots={availabilityModal.slots}
        overrides={availabilityModal.overrides}
        loading={availabilityModal.loading}
        error={availabilityModal.error}
        onClose={closeAvailabilityModal}
      />
    </div>
  );
}
