import { useMemo, useState } from "react";
import IsraelDateInput from "./IsraelDateInput";
import { formatIsraelDate } from "../utils/datetime";

function normalizeBlockedDates(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )
  ).sort();
}

export default function SchedulingConstraintsPanel({
  allowSaturday = true,
  onAllowSaturdayChange,
  blockedDates = [],
  onBlockedDatesChange,
  title = "Scheduling constraints",
  description = "Control dates that this scheduling request must avoid.",
  className = "",
}) {
  const [blockedDateDraft, setBlockedDateDraft] = useState("");
  const normalizedBlockedDates = useMemo(
    () => normalizeBlockedDates(blockedDates),
    [blockedDates]
  );

  function addBlockedDate() {
    const nextDate = String(blockedDateDraft || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    onBlockedDatesChange?.([...normalizedBlockedDates, nextDate]);
    setBlockedDateDraft("");
  }

  function removeBlockedDate(dateValue) {
    onBlockedDatesChange?.(normalizedBlockedDates.filter((value) => value !== dateValue));
  }

  return (
    <section className={`rounded-[26px] border border-slate-200 p-5 shadow-sm ${className}`.trim()}>
      <div>
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="mt-5 space-y-4">
        <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={!allowSaturday}
            onChange={(e) => onAllowSaturdayChange?.(!e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>Do not schedule on Saturday</span>
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">Blocked dates</div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <IsraelDateInput
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
              value={blockedDateDraft}
              onChange={setBlockedDateDraft}
            />
            <button
              type="button"
              onClick={addBlockedDate}
              disabled={!/^\d{4}-\d{2}-\d{2}$/.test(String(blockedDateDraft || "").trim())}
              className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            >
              Add blocked date
            </button>
          </div>

          {normalizedBlockedDates.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">
              No blocked dates selected.
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {normalizedBlockedDates.map((dateValue) => (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => removeBlockedDate(dateValue)}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 transition hover:bg-amber-100"
                >
                  <span>{formatIsraelDate(dateValue)}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em]">Remove</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
