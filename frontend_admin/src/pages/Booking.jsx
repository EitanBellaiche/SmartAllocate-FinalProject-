import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/api";
import IsraelDateInput from "../components/IsraelDateInput";
import { getOrgLabels } from "../orgConfig";
import { formatIsraelDate, formatIsraelDateRange, formatIsraelTime } from "../utils/datetime";
import AutoScheduler from "./AutoScheduler";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Booking() {
  const labels = getOrgLabels();
  const labelsLower = {
    userId: String(labels.userId || "").toLowerCase(),
  };
  const userIdPlural = `${labels.userId}s`;

  const [resources, setResources] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [editingBooking, setEditingBooking] = useState(null);
  const [selectedTypeIds, setSelectedTypeIds] = useState([]);
  const [selectedResources, setSelectedResources] = useState([]);
  const [resourceTypeQuery, setResourceTypeQuery] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceFilterTypeId, setResourceFilterTypeId] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [assignUsers, setAssignUsers] = useState(false);
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [responsibleOptions, setResponsibleOptions] = useState([]);
  const [responsibleLoading, setResponsibleLoading] = useState(false);
  const [responsibleError, setResponsibleError] = useState("");
  const [responsibleUser, setResponsibleUser] = useState(null);
  const [responsibleAvailability, setResponsibleAvailability] = useState([]);
  const [responsibleOverrides, setResponsibleOverrides] = useState([]);
  const [userIdsInput, setUserIdsInput] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [weekdays, setWeekdays] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [updatingBooking, setUpdatingBooking] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [violationDetails, setViolationDetails] = useState([]);
  const [alertDetails, setAlertDetails] = useState([]);
  const [mode, setMode] = useState("booking");

  const weekdayOptions = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
  ];

  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 30) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        options.push(`${hh}:${mm}`);
      }
    }
    return options;
  }, []);

  const selectedCandidateCount = useMemo(
    () =>
      resources.filter((resource) =>
        selectedTypeIds.some((typeId) => String(typeId) === String(resource.type_id))
      ).length,
    [resources, selectedTypeIds]
  );

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
      const matchesSelected = !showSelectedOnly || selectedResources.includes(resource.id);
      return matchesQuery && matchesType && matchesSelected;
    });
  }, [resources, resourceQuery, resourceFilterTypeId, showSelectedOnly, selectedResources]);

  useEffect(() => {
    loadResources();
  }, []);

  useEffect(() => {
    if (!assignUsers) return;

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
  }, [assignUsers, responsibleQuery]);

  useEffect(() => {
    const responsibleId = String(responsibleUser?.national_id || "").trim();
    if (!assignUsers || !responsibleId) {
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
  }, [assignUsers, responsibleUser]);

  async function loadResources() {
    try {
      const [resourceData, typeData, bookingData] = await Promise.all([
        apiGet("/resources"),
        apiGet("/resource-types"),
        apiGet("/bookings?include_details=1"),
      ]);
      setResources(resourceData);
      setResourceTypes(typeData);
      setBookings(Array.isArray(bookingData) ? bookingData : []);
    } catch (err) {
      console.error("Error loading resources:", err);
    }
  }

  function toggleResource(id) {
    if (selectedResources.includes(id)) {
      setSelectedResources(selectedResources.filter((resourceId) => resourceId !== id));
    } else {
      setSelectedResources([...selectedResources, id]);
    }
  }

  function toggleResourceType(id) {
    if (selectedTypeIds.includes(id)) {
      setSelectedTypeIds(selectedTypeIds.filter((typeId) => typeId !== id));
    } else {
      setSelectedTypeIds([...selectedTypeIds, id]);
    }
  }

  function toggleWeekday(dayValue) {
    setWeekdays((prev) => {
      if (prev.includes(dayValue)) {
        return prev.filter((day) => day !== dayValue);
      }
      return [...prev, dayValue];
    });
  }

  function parseUserIds(raw) {
    const items = raw
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    return Array.from(new Set(items));
  }

  function formatViolationMessage(violations) {
    const names = Array.from(
      new Set(violations.map((violation) => violation?.name).filter(Boolean))
    );
    return `Rule blocked: ${names.join(", ") || "Unknown rule"}`;
  }

  function extractFailureDetails(errLike) {
    return {
      violations: Array.isArray(errLike?.data?.violations) ? errLike.data.violations : [],
      suggestions: Array.isArray(errLike?.data?.suggestions) ? errLike.data.suggestions : [],
      violationDetails: Array.isArray(errLike?.data?.violation_details)
        ? errLike.data.violation_details
        : [],
      alertDetails: Array.isArray(errLike?.data?.alert_details) ? errLike.data.alert_details : [],
    };
  }

  function applySuggestion(suggestion) {
    const nextResourceIds = Array.isArray(suggestion?.resource_ids)
      ? suggestion.resource_ids
      : [];
    if (nextResourceIds.length > 0) {
      setSelectedResources(nextResourceIds);
    }
    setSelectedTypeIds([]);
    if (suggestion?.date) setDate(suggestion.date);
    if (suggestion?.start_time) setStartTime(suggestion.start_time);
    if (suggestion?.end_time) setEndTime(suggestion.end_time);
    setMessage(`Alternative loaded: ${suggestion?.summary || "suggested resources selected"}`);
  }

  function normalizeTo30Minutes(value) {
    if (!value || typeof value !== "string") return value;
    const parts = value.split(":");
    if (parts.length !== 2) return value;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
    const total = h * 60 + m;
    const rounded = Math.round(total / 30) * 30;
    const nextH = Math.floor(rounded / 60) % 24;
    const nextM = rounded % 60;
    return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
  }

  async function updateResourceAssignments(responsibleId, userIds) {
    const targetResources = resources.filter((resource) => selectedResources.includes(resource.id));
    if (targetResources.length === 0) return;

    await Promise.all(
      targetResources.map(async (resource) => {
        const meta =
          resource.metadata && typeof resource.metadata === "object"
            ? { ...resource.metadata }
            : {};
        meta.responsible_user_id = responsibleId || meta.responsible_user_id || "";
        meta.user_ids = userIds;
        meta.users = userIds.length;
        await apiPut(`/resources/${resource.id}`, {
          name: resource.name,
          type_id: resource.type_id,
          metadata: meta,
        });
      })
    );
  }

  async function submitBooking() {
    if (!startTime || !endTime || (selectedResources.length === 0 && selectedTypeIds.length === 0)) {
      setMessage("Please select time and at least one resource.");
      return;
    }
    if (normalizeTo30Minutes(startTime) !== startTime || normalizeTo30Minutes(endTime) !== endTime) {
      setMessage("Times must be in 30-minute increments.");
      return;
    }
    if (startTime >= endTime) {
      setMessage("End time must be after start time.");
      return;
    }
    if (assignUsers && !responsibleUser) {
      setMessage("Please choose a responsible user.");
      return;
    }
    if (recurring) {
      if (!rangeStart || !rangeEnd || weekdays.length === 0) {
        setMessage("Please select a date range and at least 1 weekday.");
        return;
      }
    } else if (!date) {
      setMessage("Please select a date.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setSuggestions([]);
    setViolationDetails([]);
    setAlertDetails([]);

    try {
      const basePayload = {
        resources: selectedResources,
        resource_type_ids: selectedTypeIds,
        start_time: startTime,
        end_time: endTime,
      };

      if (recurring) {
        basePayload.recurrence = {
          start_date: rangeStart,
          end_date: rangeEnd,
          days_of_week: weekdays,
        };
      } else {
        basePayload.date = date;
      }

      const userIds = assignUsers ? parseUserIds(userIdsInput) : [];
      const responsibleId = String(responsibleUser?.national_id || "").trim();
      const targetIds = assignUsers
        ? Array.from(new Set([responsibleId, ...userIds].filter(Boolean)))
        : [null];

      if (assignUsers && !responsibleId) {
        setMessage("Responsible user must have a national ID.");
        setSubmitting(false);
        return;
      }

      if (assignUsers && responsibleId) {
        await updateResourceAssignments(responsibleId, userIds);
      }

      if (targetIds.length === 0) {
        await apiPost("/bookings", basePayload);
      } else {
        const results = await Promise.allSettled(
          targetIds.map((id) =>
            apiPost("/bookings", {
              ...basePayload,
              user_id: id ? String(id).trim() : undefined,
            })
          )
        );
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length > 0) {
          const violations = failures
            .map((failure) => extractFailureDetails(failure?.reason).violations)
            .flat();
          const nextSuggestions = failures
            .map((failure) => extractFailureDetails(failure?.reason).suggestions)
            .flat();
          const nextViolationDetails = failures
            .map((failure) => extractFailureDetails(failure?.reason).violationDetails)
            .flat();
          const nextAlertDetails = failures
            .map((failure) => extractFailureDetails(failure?.reason).alertDetails)
            .flat();
          if (violations.length > 0) {
            setMessage(formatViolationMessage(violations));
            setSuggestions(nextSuggestions);
            setViolationDetails(nextViolationDetails);
            setAlertDetails(nextAlertDetails);
          } else {
            setMessage(
              `Created ${results.length - failures.length} bookings; ${failures.length} failed.`
            );
            setSuggestions(nextSuggestions);
            setViolationDetails(nextViolationDetails);
            setAlertDetails(nextAlertDetails);
          }
          setSubmitting(false);
          return;
        }
      }

      setMessage("Booking created successfully!");
      setSuggestions([]);
      setViolationDetails([]);
      setAlertDetails([]);
      setSelectedResources([]);
      setSelectedTypeIds([]);
      setDate("");
      setStartTime("");
      setEndTime("");
      setAssignUsers(false);
      setResponsibleQuery("");
      setResponsibleOptions([]);
      setResponsibleUser(null);
      setUserIdsInput("");
      setRecurring(false);
      setRangeStart("");
      setRangeEnd("");
      setWeekdays([]);
      await loadResources();
    } catch (err) {
      const { violations, suggestions: nextSuggestions, violationDetails: nextViolationDetails, alertDetails: nextAlertDetails } =
        extractFailureDetails(err);
      if (violations.length > 0) {
        setMessage(formatViolationMessage(violations));
        setSuggestions(nextSuggestions);
        setViolationDetails(nextViolationDetails);
        setAlertDetails(nextAlertDetails);
      } else {
        setMessage(err?.message || "Failed to create booking.");
        setSuggestions(nextSuggestions);
        setViolationDetails(nextViolationDetails);
        setAlertDetails(nextAlertDetails);
      }
      console.error(err);
    }

    setSubmitting(false);
  }

  function openEditBooking(booking) {
    setEditingBooking({
      id: booking.id,
      date: booking.date || "",
      start_time: booking.start_time || "",
      end_time: booking.end_time || "",
      user_id: booking.user_id || "",
      resources: (booking.resources || []).map((resource) => resource.id),
    });
  }

  function toggleEditingBookingResource(resourceId) {
    setEditingBooking((prev) => {
      if (!prev) return prev;
      const exists = prev.resources.includes(resourceId);
      return {
        ...prev,
        resources: exists
          ? prev.resources.filter((id) => id !== resourceId)
          : [...prev.resources, resourceId],
      };
    });
  }

  async function saveBookingEdit() {
    if (!editingBooking) return;
    if (!editingBooking.date || !editingBooking.start_time || !editingBooking.end_time) {
      setMessage("Please fill date, start time, and end time.");
      return;
    }
    if (!editingBooking.resources || editingBooking.resources.length === 0) {
      setMessage("Please select at least one resource.");
      return;
    }
    if (editingBooking.start_time >= editingBooking.end_time) {
      setMessage("End time must be after start time.");
      return;
    }

    setUpdatingBooking(true);
    try {
      await apiPut(`/bookings/${editingBooking.id}`, {
        resources: editingBooking.resources,
        date: editingBooking.date,
        start_time: editingBooking.start_time,
        end_time: editingBooking.end_time,
        user_id: editingBooking.user_id || undefined,
      });
      setEditingBooking(null);
      setMessage("Booking updated successfully!");
      await loadResources();
    } catch (err) {
      setMessage(err?.message || "Failed to update booking.");
    } finally {
      setUpdatingBooking(false);
    }
  }

  async function deleteBooking(id) {
    if (!confirm("Are you sure you want to delete this booking?")) return;

    try {
      await apiDelete(`/bookings/${id}`);
      setMessage("Booking deleted successfully!");
      await loadResources();
    } catch (err) {
      setMessage(err?.message || "Failed to delete booking.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_46%,#ffffff_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
              Booking Workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {mode === "booking" ? "Create New Booking" : "Auto Scheduling"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              A cleaner reservation flow with polished inputs and the existing schedule placed
              beside the form, so users can book with context instead of scrolling back and forth.
            </p>
          </div>

          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
                mode === "booking"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setMode("booking")}
            >
              Booking
            </button>
            <button
              type="button"
              className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
                mode === "auto"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setMode("auto")}
            >
              Auto
            </button>
          </div>
        </div>
      </section>

      <div className="mt-8">
        {mode === "auto" ? (
          <AutoScheduler embedded />
        ) : (
          <>
            {message && (
              <div className="mb-6 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
                {message}
              </div>
            )}

            {(violationDetails.length > 0 || alertDetails.length > 0) && (
              <div className="mb-6 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Why it was blocked
                </div>
                <div className="mt-3 space-y-3">
                  {violationDetails.map((item, index) => (
                    <div
                      key={`${item.name || "violation"}-${item.resource_name || "none"}-${index}`}
                      className="rounded-2xl border border-amber-200 bg-white px-4 py-4"
                    >
                      <div className="text-sm font-semibold text-slate-900">{item.name || "Blocked rule"}</div>
                      {item.description && (
                        <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                      )}
                      {(item.resource_name || item.resource_type) && (
                        <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                          {item.resource_name ? `Resource: ${item.resource_name}` : ""}
                          {item.resource_name && item.resource_type ? " • " : ""}
                          {item.resource_type ? `Type: ${item.resource_type}` : ""}
                        </div>
                      )}
                    </div>
                  ))}

                  {alertDetails.map((item, index) => (
                    <div
                      key={`${item.name || "alert"}-${item.resource_name || "none"}-${index}`}
                      className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4"
                    >
                      <div className="text-sm font-semibold text-slate-900">{item.name || "Alert"}</div>
                      {item.description && (
                        <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="mb-6 rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Suggested alternatives
                </div>
                <div className="mt-3 space-y-3">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={`${suggestion.summary || "suggestion"}-${index}`}
                      className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                            {suggestion.type === "timeslot" ? "Time Alternative" : "Resource Alternative"}
                          </span>
                          {Number.isFinite(Number(suggestion?.score)) && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                              Score {Number(suggestion.score)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          {suggestion.summary || "Alternative"}
                        </div>
                        {suggestion.why && (
                          <div className="mt-1 text-sm text-slate-600">{suggestion.why}</div>
                        )}
                        {suggestion.type === "timeslot" && (
                          <div className="mt-1 text-sm text-slate-600">
                            Suggested slot: {suggestion.date} {suggestion.start_time} - {suggestion.end_time}
                          </div>
                        )}
                        {suggestion.type === "timeslot" &&
                          Number.isFinite(Number(suggestion.distance_from_original)) && (
                            <div className="mt-1 text-sm text-slate-500">
                              Distance from original time: {Number(suggestion.distance_from_original)} minutes
                            </div>
                          )}
                        <div className="mt-1 text-sm text-slate-600">
                          {Array.isArray(suggestion.resources)
                            ? suggestion.resources.map((resource) => resource.name).join(", ")
                            : ""}
                        </div>
                        {Array.isArray(suggestion?.rule_summary?.soft_matches) &&
                          suggestion.rule_summary.soft_matches.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {suggestion.rule_summary.soft_matches.slice(0, 4).map((match, matchIndex) => (
                                <span
                                  key={`${suggestion.summary || "suggestion"}-match-${match.id || matchIndex}`}
                                  className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800"
                                >
                                  {match.name}
                                  {Number.isFinite(Number(match.delta)) ? ` (${Number(match.delta) > 0 ? "+" : ""}${Number(match.delta)})` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                      </div>
                      <button
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Use suggestion
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_360px]">
              <div className="space-y-6">
                <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-900">Booking details</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Choose the date, hours, and whether the reservation should repeat on
                          selected weekdays.
                        </p>
                      </div>

                      <label
                        htmlFor="recurring-toggle"
                        className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                      >
                        <input
                          id="recurring-toggle"
                          type="checkbox"
                          checked={recurring}
                          onChange={(e) => setRecurring(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Recurring schedule
                      </label>
                    </div>

                    {!recurring ? (
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-800">Date</label>
                        <IsraelDateInput
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                          value={date}
                          onChange={setDate}
                        />
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-800">
                            Start Date
                          </label>
                          <IsraelDateInput
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                            value={rangeStart}
                            max={rangeEnd || undefined}
                            onChange={setRangeStart}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-800">
                            End Date
                          </label>
                          <IsraelDateInput
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                            value={rangeEnd}
                            min={rangeStart || undefined}
                            onChange={setRangeEnd}
                          />
                        </div>
                      </div>
                    )}

                    {recurring && (
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                        <div className="mb-3 text-sm font-semibold text-slate-900">Weekdays</div>
                        <div className="flex flex-wrap gap-2">
                          {weekdayOptions.map((day) => (
                            <label
                              key={day.value}
                              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                                weekdays.includes(day.value)
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={weekdays.includes(day.value)}
                                onChange={() => toggleWeekday(day.value)}
                                className="sr-only"
                              />
                              <span>{day.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-800">
                          Start Time
                        </label>
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        >
                          <option value="">Select time</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-800">
                          End Time
                        </label>
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        >
                          <option value="">Select time</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-900">People assignment</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Keep this optional. Turn it on only when the booking should be tied to a
                          responsible user and additional {userIdPlural.toLowerCase()}.
                        </p>
                      </div>

                      <label
                        htmlFor="assign-users-toggle"
                        className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                      >
                        <input
                          id="assign-users-toggle"
                          type="checkbox"
                          checked={assignUsers}
                          onChange={(e) => {
                            setAssignUsers(e.target.checked);
                            setResponsibleUser(null);
                            setUserIdsInput("");
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Assign to users
                      </label>
                    </div>

                    {assignUsers && (
                      <>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-800">
                            Responsible user
                          </label>
                          <input
                            type="text"
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                            value={responsibleQuery}
                            onChange={(e) => {
                              setResponsibleQuery(e.target.value);
                              setResponsibleUser(null);
                            }}
                            placeholder={`Search by name, email, or ${labelsLower.userId}`}
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
                                    setResponsibleUser(user);
                                    setResponsibleQuery(
                                      user.full_name || user.email || user.national_id || ""
                                    );
                                  }}
                                >
                                  {user.full_name || "User"} · {user.national_id || `No ${labels.userId}`} · {user.email}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600">
                            Selected: {responsibleUser?.national_id || "None"}
                          </div>
                        </div>

                        {responsibleUser && (
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-slate-700">
                            <div className="mb-2 font-semibold text-slate-900">
                              Responsible availability
                            </div>
                            {responsibleAvailability.length === 0 &&
                            responsibleOverrides.length === 0 ? (
                              <div>No availability defined yet.</div>
                            ) : (
                              <>
                                {responsibleAvailability.length > 0 && (
                                  <div className="space-y-1">
                                    {responsibleAvailability.map((slot) => (
                                      <div key={slot.id}>
                                        {WEEKDAY_LABELS[Number(slot.day_of_week)] ||
                                          `Day ${slot.day_of_week}`} {" "}
                                        {formatIsraelTime(slot.start_time)}-
                                        {formatIsraelTime(slot.end_time)}
                                        {slot.start_date || slot.end_date
                                          ? ` | ${formatIsraelDateRange(
                                              slot.start_date,
                                              slot.end_date
                                            )}`
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
                                        {formatIsraelDate(slot.date)} | {" "}
                                        {slot.is_available ? "Available" : "Blocked"}
                                        {slot.start_time && slot.end_time
                                          ? ` | ${formatIsraelTime(
                                              slot.start_time
                                            )}-${formatIsraelTime(slot.end_time)}`
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
                            {userIdPlural} (comma or space separated)
                          </label>
                          <textarea
                            rows={3}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                            value={userIdsInput}
                            onChange={(e) => setUserIdsInput(e.target.value)}
                            placeholder="e.g. 12345, 67890"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </section>

                <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                  <div className="flex flex-col gap-5">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">Select resources</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Mix full resource types and specific resources in one booking when that fits
                        the need best.
                      </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 text-sm font-semibold text-slate-900">
                          Whole resource types
                        </div>
                        <input
                          type="text"
                          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500"
                          value={resourceTypeQuery}
                          onChange={(e) => setResourceTypeQuery(e.target.value)}
                          placeholder="Search resource types..."
                        />
                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                          {filteredResourceTypes.map((type) => (
                            <label
                              key={type.id}
                              className="flex items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-3 text-sm text-slate-700 shadow-sm transition hover:border-slate-200"
                            >
                              <input
                                type="checkbox"
                                checked={selectedTypeIds.includes(type.id)}
                                onChange={() => toggleResourceType(type.id)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>{type.name}</span>
                            </label>
                          ))}
                          {filteredResourceTypes.length === 0 && (
                            <div className="text-sm text-slate-500">No resource types found.</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 text-sm font-semibold text-slate-900">
                          Specific resources
                        </div>
                        <div className="mb-3 grid gap-3">
                          <input
                            type="text"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500"
                            value={resourceQuery}
                            onChange={(e) => setResourceQuery(e.target.value)}
                            placeholder="Search resources..."
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
                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                          {filteredResources.map((resource) => (
                            <label
                              key={resource.id}
                              className="flex items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-3 text-sm text-slate-700 shadow-sm transition hover:border-slate-200"
                            >
                              <input
                                type="checkbox"
                                checked={selectedResources.includes(resource.id)}
                                onChange={() => toggleResource(resource.id)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div className="flex flex-col">
                                <span>{resource.name}</span>
                                <span className="text-xs text-slate-400">{resource.type_name || "Unknown type"}</span>
                              </div>
                            </label>
                          ))}
                          {filteredResources.length === 0 && (
                            <div className="text-sm text-slate-500">No resources found.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                      {selectedResources.length > 0 || selectedTypeIds.length > 0
                        ? `${selectedResources.length} fixed resources selected. ${selectedTypeIds.length} resource types selected for automatic matching (${selectedCandidateCount} candidates available).`
                        : "No resources selected yet."}
                    </div>

                    <button
                      onClick={submitBooking}
                      disabled={submitting}
                      className="w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.28)] transition hover:bg-blue-700 disabled:bg-slate-400 disabled:shadow-none"
                    >
                      {submitting ? "Creating booking..." : "Create Booking"}
                    </button>
                  </div>
                </section>
              </div>

              <aside className="xl:sticky xl:top-6 xl:self-start">
                <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">Existing Bookings</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        The live schedule stays visible here while the user fills the form.
                      </p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                      Live list
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="font-semibold text-slate-900">
                              {formatIsraelDate(booking.date)} | {formatIsraelTime(booking.start_time)} -{" "}
                              {formatIsraelTime(booking.end_time)}
                            </div>
                            <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                              Booking #{booking.id}
                            </div>
                          </div>

                          <div className="text-sm text-slate-600">
                            {booking.user_id ? `User: ${booking.user_id}` : "No user assigned"}
                          </div>

                          {booking.location && (
                            <div className="text-sm text-slate-500">Location: {booking.location}</div>
                          )}

                          {booking.cancelled_at && (
                            <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                              Cancelled
                              {booking.cancelled_reason ? `: ${booking.cancelled_reason}` : ""}
                            </div>
                          )}

                          <div className="pt-1">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Resources
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(booking.resources || []).map((resource) => (
                                <span
                                  key={`${booking.id}-${resource.id}`}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
                                >
                                  {resource.name}
                                  {resource.type_name ? ` · ${resource.type_name}` : ""}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => openEditBooking(booking)}
                              className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBooking(booking.id)}
                              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {bookings.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                        No bookings have been created yet.
                      </div>
                    )}
                  </div>
                </section>
              </aside>
            </div>

            {editingBooking && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-[520px] rounded-3xl bg-white p-5 shadow-xl">
                  <h2 className="mb-4 text-xl font-bold text-slate-900">Edit Booking</h2>

                  <div className="mb-4">
                    <label className="mb-1 block font-semibold text-slate-800">Date</label>
                    <IsraelDateInput
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                      value={editingBooking.date}
                      onChange={(value) =>
                        setEditingBooking((prev) => ({ ...prev, date: value }))
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-800">Start Time</label>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                        value={editingBooking.start_time}
                        onChange={(e) =>
                          setEditingBooking((prev) => ({ ...prev, start_time: e.target.value }))
                        }
                      >
                        <option value="">Select time</option>
                        {timeOptions.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block font-semibold text-slate-800">End Time</label>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                        value={editingBooking.end_time}
                        onChange={(e) =>
                          setEditingBooking((prev) => ({ ...prev, end_time: e.target.value }))
                        }
                      >
                        <option value="">Select time</option>
                        {timeOptions.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 text-sm text-slate-600">
                    Select the resources that should stay attached to this booking.
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 text-sm font-medium text-slate-700">Resources</div>
                    <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 p-3">
                      {resources.map((resource) => (
                        <label key={resource.id} className="mb-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingBooking.resources.includes(resource.id)}
                            onChange={() => toggleEditingBookingResource(resource.id)}
                          />
                          <span>
                            {resource.name}
                            {resource.type_name ? ` · ${resource.type_name}` : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {editingBooking.resources.length} resources selected.
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingBooking(null)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveBookingEdit}
                      disabled={updatingBooking}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-slate-400"
                    >
                      {updatingBooking ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
