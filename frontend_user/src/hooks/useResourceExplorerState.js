import { useEffect, useMemo, useState } from "react";
import {
  createResourceRequest,
  getAllResources,
  getBookingsByResource,
  getBookingsByUser,
} from "../api";
import { buildMonthGrid, isPrimaryResource } from "../utils/appHelpers";

function isResourceAvailable(resource) {
  const meta = resource?.metadata || {};
  if (meta.available === true) return true;
  const status = `${meta.status || meta.availability || ""}`.toLowerCase();
  return status === "available" || status === "free" || status === "open";
}

function resourceMatchesQuery(resource, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${resource.name} ${resource.type_name || ""} ${JSON.stringify(
    resource.metadata || {}
  )}`.toLowerCase();
  return hay.includes(q);
}

export default function useResourceExplorerState({
  role,
  currentUserId,
  labels,
  labelsLower,
  bookings,
  setBookings,
  requestQuery,
  onlyAvailable,
  requestResourceId,
}) {
  const [resources, setResources] = useState([]);
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState(null);
  const [availabilityResource, setAvailabilityResource] = useState(null);
  const [availabilityBookings, setAvailabilityBookings] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityMonthDate, setAvailabilityMonthDate] = useState(
    () => new Date()
  );
  const [bookingDraft, setBookingDraft] = useState({
    date: "",
    start: "09:00",
    end: "10:00",
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");

  const availabilityDays = useMemo(
    () => buildMonthGrid(availabilityMonthDate, availabilityBookings),
    [availabilityMonthDate, availabilityBookings]
  );

  const availabilityMonthLabel = availabilityMonthDate.toLocaleDateString(
    "he-IL",
    {
      timeZone: "Asia/Jerusalem",
      month: "long",
      year: "numeric",
    }
  );

  const filteredResources = useMemo(() => {
    const visibleResources = resources.filter((resource) => {
      if (role === "manager" && isPrimaryResource(resource)) return false;
      return true;
    });
    const sortedResources = [...visibleResources].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
    if (role === "user" && !resourceQuery.trim()) return sortedResources;
    if (!resourceQuery.trim()) return [];
    return sortedResources.filter((resource) =>
      resourceMatchesQuery(resource, resourceQuery)
    );
  }, [resources, resourceQuery, role]);

  const filteredRequestResources = useMemo(() => {
    return resources.filter((resource) => {
      if (role === "manager" && isPrimaryResource(resource)) return false;
      if (!resourceMatchesQuery(resource, requestQuery)) return false;
      if (onlyAvailable && !isResourceAvailable(resource)) return false;
      return true;
    });
  }, [resources, requestQuery, onlyAvailable, role]);

  const selectedResource = useMemo(() => {
    if (!selectedResourceId) return null;
    return resources.find((resource) => resource.id === selectedResourceId) || null;
  }, [resources, selectedResourceId]);

  const selectedRequestResource = useMemo(() => {
    if (!requestResourceId) return null;
    return resources.find((resource) => resource.id === requestResourceId) || null;
  }, [resources, requestResourceId]);

  async function loadResources(options = {}) {
    const { allowEmptyQuery = false } = options;
    if (!allowEmptyQuery && !resourceQuery.trim()) return;
    setResourceError("");
    setResourceLoading(true);
    try {
      const data = await getAllResources();
      setResources(Array.isArray(data) ? data : []);
    } catch (err) {
      setResourceError(
        err?.message || `Failed to load ${labelsLower.resources}.`
      );
    } finally {
      setResourceLoading(false);
    }
  }

  async function openAvailability(resource) {
    if (!resource) return;
    setAvailabilityResource(resource);
    setAvailabilityMonthDate(new Date());
    setAvailabilityError("");
    setBookingDraft({ date: "", start: "09:00", end: "10:00" });
    setBookingError("");
    setBookingSuccess("");
    setAvailabilityLoading(true);
    try {
      const bookingsData = await getBookingsByResource(resource.id);
      setAvailabilityBookings(Array.isArray(bookingsData) ? bookingsData : []);
    } catch (err) {
      setAvailabilityError(err?.message || "Failed to load availability.");
      setAvailabilityBookings([]);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  function pickBookingDate(day) {
    if (!day?.key) return;
    setBookingDraft((prev) => ({ ...prev, date: day.key }));
    setBookingError("");
    setBookingSuccess("");
  }

  async function submitBookingRequest(dateOverride) {
    const requester = currentUserId.trim();
    if (!availabilityResource) return;
    if (!requester) {
      setBookingError(`Please enter your ${labels.userId} first.`);
      return;
    }
    const requestDate = dateOverride || bookingDraft.date;
    if (dateOverride && bookingDraft.date !== dateOverride) {
      setBookingDraft((prev) => ({ ...prev, date: dateOverride }));
    }
    if (!requestDate) {
      setBookingError("Please choose a date in the calendar.");
      return;
    }
    if (!bookingDraft.start || !bookingDraft.end) {
      setBookingError("Please select start and end times.");
      return;
    }
    if (bookingDraft.start >= bookingDraft.end) {
      setBookingError("End time must be after start time.");
      return;
    }

    setBookingSubmitting(true);
    setBookingError("");
    setBookingSuccess("");
    try {
      await createResourceRequest({
        resource_id: availabilityResource.id,
        user_id: requester,
        note: `Booking request for ${requestDate} ${bookingDraft.start}-${bookingDraft.end}`,
        request_date: requestDate,
        start_time: bookingDraft.start,
        end_time: bookingDraft.end,
      });
      setBookingSuccess("Request sent to the admin for approval.");
    } catch (err) {
      setBookingError(err?.message || "Failed to send request.");
    } finally {
      setBookingSubmitting(false);
    }
  }

  async function refreshAvailabilityStatus() {
    if (!availabilityResource || !currentUserId.trim()) return;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    try {
      const [bookingsData, userBookings] = await Promise.all([
        getBookingsByResource(availabilityResource.id),
        getBookingsByUser(currentUserId.trim()),
      ]);
      setAvailabilityBookings(Array.isArray(bookingsData) ? bookingsData : []);
      setBookings(Array.isArray(userBookings) ? userBookings : []);
    } catch (err) {
      setAvailabilityError(err?.message || "Failed to load availability.");
    } finally {
      setAvailabilityLoading(false);
    }
  }

  useEffect(() => {
    if (!resourceQuery.trim()) return;
    if (resources.length > 0) return;
    const timer = setTimeout(() => {
      loadResources();
    }, 200);
    return () => clearTimeout(timer);
  }, [resourceQuery, resources.length]);

  useEffect(() => {
    if (!requestQuery.trim()) return;
    if (resources.length > 0) return;
    loadResources({ allowEmptyQuery: true });
  }, [requestQuery, resources.length]);

  useEffect(() => {
    if (!availabilityResource || !currentUserId.trim()) return;
    let active = true;

    async function refreshStatus() {
      try {
        const [bookingsData, userBookings] = await Promise.all([
          getBookingsByResource(availabilityResource.id),
          getBookingsByUser(currentUserId.trim()),
        ]);
        if (!active) return;
        setAvailabilityBookings(
          Array.isArray(bookingsData) ? bookingsData : []
        );
        setBookings(Array.isArray(userBookings) ? userBookings : []);
      } catch {
        if (!active) return;
      }
    }

    refreshStatus();
    const timer = setInterval(refreshStatus, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [availabilityResource, currentUserId, setBookings]);

  return {
    resources,
    setResources,
    resourceQuery,
    setResourceQuery,
    resourceLoading,
    resourceError,
    selectedResourceId,
    setSelectedResourceId,
    availabilityResource,
    setAvailabilityResource,
    availabilityBookings,
    availabilityLoading,
    setAvailabilityLoading,
    availabilityError,
    availabilityMonthDate,
    setAvailabilityMonthDate,
    bookingDraft,
    setBookingDraft,
    bookingSubmitting,
    bookingError,
    bookingSuccess,
    availabilityDays,
    availabilityMonthLabel,
    filteredResources,
    filteredRequestResources,
    selectedResource,
    selectedRequestResource,
    loadResources,
    openAvailability,
    pickBookingDate,
    submitBookingRequest,
    refreshAvailabilityStatus,
    isResourceAvailable,
  };
}
