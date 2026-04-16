function formatDelta(value) {
  const numeric = Number(value || 0);
  return `${numeric > 0 ? "+" : ""}${numeric}`;
}

function hasMeaningfulBreakdown(candidate) {
  return Array.isArray(candidate?.score_breakdown) && candidate.score_breakdown.length > 0;
}

function getCandidateTone(state) {
  if (state === "selected") {
    return {
      card: "border-emerald-300 bg-emerald-50/80 shadow-[0_16px_40px_rgba(16,185,129,0.12)]",
      badge: "border-emerald-300 bg-emerald-100 text-emerald-800",
      label: "Selected",
    };
  }
  if (state === "blocked") {
    return {
      card: "border-rose-200 bg-rose-50/80",
      badge: "border-rose-200 bg-rose-100 text-rose-700",
      label: "Blocked",
    };
  }
  return {
    card: "border-slate-200 bg-white",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    label: "Valid",
  };
}

function SummaryStat({ label, value, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  };

  return (
    <div className={`rounded-2xl border px-4 py-4 ${tones[tone] || tones.slate}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default function ResourceEvaluationPanel({
  evaluation,
  preview = false,
  loading = false,
  onPreviewPageChange = null,
}) {
  if (!evaluation?.candidate_groups?.length) return null;

  const summary = evaluation.summary || {};
  const alternatives = Array.isArray(evaluation.alternatives) ? evaluation.alternatives : [];

  return (
    <section className="mb-6 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
            {preview ? "Live Resource Decision" : "Resource Decision"}
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Explainable scheduling score
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {preview
              ? "Live preview shows only the top candidate slice so the page stays fast while you edit."
              : "Every candidate resource is evaluated against the active rules. Selected resources are highlighted, blocked resources show rejection reasons, and lower-scoring options expose the exact rule deltas behind the decision."}
          </p>
        </div>
        {!summary.has_perfect_match && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No perfect match was found. The best valid option is shown together with alternatives.
          </div>
        )}
      </div>

      {loading && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Refreshing evaluation preview...
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryStat
          label="Selected Score"
          value={summary.selected_score ?? "N/A"}
          tone="emerald"
        />
        <SummaryStat
          label="Valid Candidates"
          value={summary.valid_candidates ?? 0}
        />
        <SummaryStat
          label="Blocked Candidates"
          value={summary.blocked_candidates ?? 0}
          tone="rose"
        />
      </div>

      <div className="mt-6 space-y-6">
        {evaluation.candidate_groups.map((group) => {
          const totalCandidates = Number(group.total_candidates || 0);
          const shownCandidates = Number(group.shown_candidates || group.candidates?.length || 0);
          const candidateOffset = Number(group.candidate_offset || 0);
          const pageSize = Math.max(1, Number(group.candidate_page_size || shownCandidates || 1));
          const showingStart = totalCandidates > 0 ? candidateOffset + 1 : 0;
          const showingEnd = totalCandidates > 0 ? Math.min(candidateOffset + shownCandidates, totalCandidates) : 0;
          const hasPreviousPage = candidateOffset > 0;
          const hasNextPage = candidateOffset + shownCandidates < totalCandidates;

          return (
          <div
            key={`candidate-group-${group.type_id}`}
            className="rounded-[24px] border border-slate-200 bg-white/80 p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Resource Type
                </div>
                <div className="mt-1 text-xl font-semibold text-slate-950">{group.type_name}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.selected_resource_id && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Selected resource #{group.selected_resource_id}
                  </span>
                )}
                {Number.isFinite(Number(group.best_valid_score)) && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Best valid score {Number(group.best_valid_score)}
                  </span>
                )}
                {preview && totalCandidates > 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    Showing {showingStart}-{showingEnd} of {totalCandidates}
                  </span>
                )}
              </div>
            </div>

            {preview && (hasPreviousPage || hasNextPage) && (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onPreviewPageChange?.(group.type_id, Math.max(0, candidateOffset - pageSize))}
                  disabled={loading || !hasPreviousPage}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => onPreviewPageChange?.(group.type_id, candidateOffset + pageSize)}
                  disabled={loading || !hasNextPage}
                  className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}

            <div className={`mt-4 grid gap-4 ${preview ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
              {group.candidates.map((candidate) => {
                const tone = getCandidateTone(candidate.state);
                return (
                  <article
                    key={`candidate-${candidate.resource_id}`}
                    className={`rounded-[22px] border p-4 ${tone.card}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-950">{candidate.name}</h3>
                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.badge}`}
                          >
                            {tone.label}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">{candidate.type_name}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-right">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Final Score
                        </div>
                        <div className="mt-1 text-2xl font-semibold text-slate-950">
                          {candidate.final_score}
                        </div>
                      </div>
                    </div>

                    {candidate.blocking_reasons?.length > 0 && !preview && (
                      <div className="mt-4 rounded-2xl border border-rose-200 bg-white/80 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                          Blocking reasons
                        </div>
                        <div className="mt-2 space-y-2">
                          {candidate.blocking_reasons.map((reason, index) => (
                            <div
                              key={`candidate-${candidate.resource_id}-block-${index}`}
                              className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900"
                            >
                              <div className="font-semibold">{reason.name || "Blocked"}</div>
                              {reason.description && <div className="mt-1">{reason.description}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {candidate.alerts?.length > 0 && !preview && (
                      <div className="mt-4 rounded-2xl border border-sky-200 bg-white/80 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                          Alerts
                        </div>
                        <div className="mt-2 space-y-2">
                          {candidate.alerts.map((alert, index) => (
                            <div
                              key={`candidate-${candidate.resource_id}-alert-${index}`}
                              className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-900"
                            >
                              <div className="font-semibold">{alert.name || "Alert"}</div>
                              {alert.description && <div className="mt-1">{alert.description}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {hasMeaningfulBreakdown(candidate) ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/90 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Score breakdown
                          </div>
                          <div className="text-xs text-slate-400">
                            {preview
                              ? `${candidate.score_breakdown?.length || 0} top rules`
                              : `${candidate.score_breakdown?.length || 0} scoring rules`}
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {candidate.score_breakdown.map((rule) => (
                            <div
                              key={`candidate-${candidate.resource_id}-rule-${rule.id}-${rule.name}`}
                              className="flex flex-col gap-2 rounded-xl border border-slate-200 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                            >
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{rule.name}</div>
                                {!preview && rule.description && (
                                  <div className="mt-1 text-sm text-slate-500">{rule.description}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    rule.matched
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {rule.matched ? "Matched" : "Not matched"}
                                </span>
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    Number(rule.delta) > 0
                                      ? "bg-emerald-100 text-emerald-800"
                                      : Number(rule.delta) < 0
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {formatDelta(rule.delta)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-3 py-4 text-sm text-slate-500">
                        {preview
                          ? "No rules are affecting this candidate right now."
                          : "No scoring rules applied to this candidate."}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {!preview && !summary.has_perfect_match && alternatives.length > 0 && (
        <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
            Best alternatives
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {alternatives.map((candidate) => (
              <div
                key={`alternative-${candidate.resource_id}`}
                className="rounded-2xl border border-amber-200 bg-white px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    Score {candidate.final_score}
                  </div>
                </div>
                <div className="mt-1 text-sm text-slate-500">{candidate.type_name}</div>
                <div className="mt-3 text-xs text-slate-500">
                  Positive rules:{" "}
                  {candidate.score_breakdown
                    ?.filter((rule) => Number(rule.delta) > 0)
                    .map((rule) => rule.name)
                    .slice(0, 3)
                    .join(", ") || "None"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
