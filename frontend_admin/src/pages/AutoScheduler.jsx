import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api/api";
import IsraelDateInput from "../components/IsraelDateInput";
import { formatIsraelDate, formatIsraelDateRange, formatIsraelTime } from "../utils/datetime";

const DEFAULT_SEMESTER_MONTHS = 3;
const DEFAULT_HOURS_PER_DAY = 3;
const DEFAULT_DAYS_PER_WEEK = 1;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const [runMode, setRunMode] = useState("manual"); // manual | deadline
  const [deadlineDate, setDeadlineDate] = useState(() => toDateValue(new Date()));
  const [deadlineTime, setDeadlineTime] = useState("23:59");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [timeWindows, setTimeWindows] = useState(() => [
    { id: "morning", label: "Morning", start_time: "08:00", end_time: "12:00" },
    { id: "noon", label: "Noon", start_time: "12:00", end_time: "16:00" },
    { id: "evening", label: "Evening", start_time: "16:00", end_time: "22:00" },
  ]);
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
  const [lastRun, setLastRun] = useState({ scheduled: [], skipped: [] });
  const [allocations, setAllocations] = useState([]);
  const [allocationsLoading, setAllocationsLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);

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

  function applyAutoSuggestion(groupId, suggestion) {
    if (!groupId || !Array.isArray(suggestion?.resource_ids) || suggestion.resource_ids.length === 0) {
      return;
    }
    updateGroup(groupId, {
      resource_ids: suggestion.resource_ids,
      type_ids: [],
    });
    setMessageTone("success");
    setMessage(`Loaded alternative for allocation: ${suggestion.summary || "resource suggestion"}.`);
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
      const windowById = timeWindows.reduce((acc, w) => {
        if (w?.id) acc[w.id] = w;
        return acc;
      }, {});
      const payloadGroups = groups.map((g) => {
        const w = g.preferred_window_id ? windowById[g.preferred_window_id] : null;
        const preferred_time_windows = w ? [{ start_time: w.start_time, end_time: w.end_time }] : [];
        return { ...g, preferred_time_windows };
      });
      const data = await apiPost("/auto-schedule", {
        start_date: rangeStart,
        end_date: rangeEnd,
        groups: payloadGroups,
      }, {
        timeoutMs: 20000,
        timeoutMessage:
          "Auto schedule did not return within 20 seconds. The request likely got stuck on the server or no valid slot could be resolved. Check the selected room/course combination or inspect the backend logs.",
      });
      const scheduledCount = data?.scheduled?.length || 0;
      const skippedCount = data?.skipped?.length || 0;
      setLastRun({
        scheduled: Array.isArray(data?.scheduled) ? data.scheduled : [],
        skipped: Array.isArray(data?.skipped) ? data.skipped : [],
      });
      setMessageTone(skippedCount > 0 && scheduledCount === 0 ? "error" : "success");
      setMessage(
        skippedCount > 0 && scheduledCount === 0
          ? `Auto schedule completed without results. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
          : `Auto schedule completed. Scheduled ${scheduledCount}, skipped ${skippedCount}.`
      );
      await loadAllocations();
    } catch (err) {
      if (err?.code === "REQUEST_TIMEOUT") {
        try {
          const windowById = timeWindows.reduce((acc, w) => {
            if (w?.id) acc[w.id] = w;
            return acc;
          }, {});
          const payloadGroups = groups.map((g) => {
            const w = g.preferred_window_id ? windowById[g.preferred_window_id] : null;
            const preferred_time_windows = w ? [{ start_time: w.start_time, end_time: w.end_time }] : [];
            return { ...g, preferred_time_windows };
          });
          const diagnostic = await apiPost(
            "/auto-schedule/diagnose",
            {
              start_date: rangeStart,
              end_date: rangeEnd,
              groups: payloadGroups,
            },
            {
              timeoutMs: 10000,
              timeoutMessage: "Could not analyze the scheduling conflict in time.",
            }
          );
          const skipped = Array.isArray(diagnostic?.skipped) ? diagnostic.skipped : [];
          setLastRun({ scheduled: [], skipped });
          const first = skipped[0];
          setMessageTone("error");
          setMessage(
            first?.reason ||
              "Auto schedule timed out, but a conflict analysis was returned below."
          );
        } catch (diagnosticErr) {
          setMessageTone("error");
          setMessage(diagnosticErr?.message || err?.message || "Auto schedule failed.");
        }
      } else {
        setMessageTone("error");
        setMessage(err?.message || "Auto schedule failed.");
      }
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
      const windowById = timeWindows.reduce((acc, w) => {
        if (w?.id) acc[w.id] = w;
        return acc;
      }, {});
      const payloadGroups = groups.map((g) => {
        const w = g.preferred_window_id ? windowById[g.preferred_window_id] : null;
        const preferred_time_windows = w ? [{ start_time: w.start_time, end_time: w.end_time }] : [];
        return { ...g, preferred_time_windows };
      });
      const job = await apiPost("/auto-schedule/jobs", {
        run_at: runAt.toISOString(),
        start_date: rangeStart,
        end_date: rangeEnd,
        groups: payloadGroups,
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

  async function cancelJob(jobId) {
    if (!jobId) return;
    try {
      await apiPost(`/auto-schedule/jobs/${jobId}/cancel`, {});
      setMessageTone("success");
      setMessage("Job cancelled.");
      await loadJobs();
    } catch (err) {
      setMessageTone("error");
      setMessage(err?.message || "Failed to cancel job.");
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

      <div className="mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
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

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-800">Run mode</div>
            <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
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
            <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Deadline date
            </label>
            <IsraelDateInput
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5"
              value={deadlineDate}
              onChange={setDeadlineDate}
            />
          </div>
          <div>
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
          <div className="md:col-span-2">
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
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Can’t schedule yet
                </div>
                <div className="mt-1">{deadlineDisabledReason}</div>
              </div>
            )}
          </div>
              <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Countdown
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                    {countdownText || "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {countdownTarget
                      ? `Target: ${countdownTarget.toLocaleString("he-IL")}`
                      : "Pick a deadline to start the countdown."}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  After the deadline passes, the backend will automatically run the scheduler once with the current allocations.
                  If you created a job, the countdown follows the nearest scheduled job.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
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
          <div className="space-y-3">
            {timeWindows.map((w) => (
              <div key={w.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div className="md:col-span-2">
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
                  <div className="flex items-end">
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

      <div className="mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Scheduled jobs</h2>
          <button
            type="button"
            onClick={loadJobs}
            className="rounded-2xl border border-blue-200 bg-white px-4 py-2.5 font-medium text-blue-700 transition hover:bg-blue-50"
            disabled={jobsLoading}
          >
            {jobsLoading ? "Loading..." : "Refresh jobs"}
          </button>
        </div>
        {jobsLoading ? (
          <div className="text-sm text-slate-500">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No scheduled jobs yet.
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const runAt = job?.run_at ? new Date(job.run_at) : null;
              const runAtLabel = runAt && !Number.isNaN(runAt.getTime())
                ? runAt.toLocaleString("he-IL")
                : String(job?.run_at || "");
              const status = String(job?.status || "").toUpperCase() || "UNKNOWN";
              const allocationCount = Array.isArray(job?.payload?.groups)
                ? job.payload.groups.length
                : 0;
              return (
                <div
                  key={job.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">
                      Job #{job.id} · {status}
                    </div>
                    {job.status === "scheduled" && (
                      <button
                        type="button"
                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                        onClick={() => cancelJob(job.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-xs leading-6 text-slate-600">
                    Run at: {runAtLabel} | Allocations: {allocationCount}
                  </div>
                  {job.error && (
                    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {job.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Responsible availability</h2>
        {availability.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No availability found.
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(availabilityByUser).map(([userId, slots]) => {
              const user = responsibleById[userId];
              return (
                <div key={userId} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="font-semibold text-slate-900">
                    {user?.full_name || "Responsible"} - {userId}
                  </div>
                  <div className="mt-1 text-xs leading-6 text-slate-600">
                    {slots
                      .map(
                        (slot) =>
                          `Day ${slot.day_of_week} ${slot.start_time?.slice?.(0, 5) || slot.start_time}-${
                            slot.end_time?.slice?.(0, 5) || slot.end_time
                          }`
                      )
                      .join(" | ")}
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
                  <div>No availability defined yet.</div>
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
                  {group.responsible_user_id &&
                    availabilityByUser[group.responsible_user_id]?.length > 0 && (
                      <div className="mt-3 text-xs text-slate-600">
                        Availability records:{" "}
                        {availabilityByUser[group.responsible_user_id].length}
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
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
            Scheduled summary
          </div>
          <div className="text-xs text-slate-600">
            {lastRun.scheduled.length} sessions scheduled. See allocations in range for the full
            recurring blocks.
          </div>
        </div>
      )}
      {lastRun.skipped.length > 0 && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
            Skipped details
          </div>
          <div className="space-y-3">
            {lastRun.skipped.slice(0, 10).map((item, idx) => {
              const suggestions = extractGroupSuggestions(item);
              const failedSlot = item?.failed_slot;
              const occupiedBy = item?.occupied_by;
              return (
                <div
                  key={`${item.group_id || idx}`}
                  className="rounded-2xl border border-red-200 bg-white/75 p-4"
                >
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
                          {suggestion.type === "resource" && Array.isArray(suggestion.resource_ids) && suggestion.resource_ids.length > 0 && (
                            <button
                              type="button"
                              className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                              onClick={() => applyAutoSuggestion(item.group_id, suggestion)}
                            >
                              Use resource suggestion
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {lastRun.skipped.length > 10 && (
              <div className="text-xs text-red-700">+{lastRun.skipped.length - 10} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
