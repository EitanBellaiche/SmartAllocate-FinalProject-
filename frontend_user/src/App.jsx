import React, { useEffect, useMemo, useState } from "react";
import AvailabilitySection from "./components/AvailabilitySection";
import AppSidebar from "./components/AppSidebar";
import BookingDetailsModal from "./components/BookingDetailsModal";
import CancelDialog from "./components/CancelDialog";
import LoginView from "./components/LoginView";
import NotificationsSection from "./components/NotificationsSection";
import RequestsSection from "./components/RequestsSection";
import ResourceAvailabilityModal from "./components/ResourceAvailabilityModal";
import ScheduleSection from "./components/ScheduleSection";
import SearchSection from "./components/SearchSection";
import useNotificationsState from "./hooks/useNotificationsState";
import useResourceExplorerState from "./hooks/useResourceExplorerState";
import useSessionAuth, { SESSION_KEY } from "./hooks/useSessionAuth";
import {
  getBookingsByUser,
  getAllResources,
  createResourceRequest,
  getBookingsByResource,
  cancelBooking,
  rescheduleBooking,
  getUserAvailability,
  createUserAvailability,
  deleteUserAvailability,
} from "./api";
import { getOrgLabels, getSessionOrgId } from "./orgConfig";
import {
  buildMonthGrid,
  filterBookingsToPrimaryResources,
  getSeatLabelFromBooking,
  hasAssignedUsers,
  isCinemaHallResource,
  isResourceAssignedToUser,
  normalizeMetadata,
  parseDateValue,
  weekdayLabel,
} from "./utils/appHelpers";

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || "http://localhost:5174";

export default function App() {
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("");
  const [viewMode, setViewMode] = useState("month"); // month | list
  const [monthDate, setMonthDate] = useState(new Date());

  const [requestQuery, setRequestQuery] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestResourceId, setRequestResourceId] = useState(null);
  const [requestSent, setRequestSent] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestView, setRequestView] = useState("list"); // list | form
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [cancelDialog, setCancelDialog] = useState({ open: false, booking: null });
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSenderName, setCancelSenderName] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelSuccess, setCancelSuccess] = useState("");
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStart, setRescheduleStart] = useState("09:00");
  const [rescheduleEnd, setRescheduleEnd] = useState("10:00");
  const [rescheduleLocation, setRescheduleLocation] = useState("onsite");
  const [selectedScheduleBooking, setSelectedScheduleBooking] = useState(null);
  const [userAvailability, setUserAvailability] = useState([]);
  const [availabilityForm, setAvailabilityForm] = useState({
    day_of_week: ["1"],
    start_time: "09:00",
    end_time: "12:00",
    start_date: "",
    end_date: "",
  });
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [section, setSection] = useState("schedule"); // schedule | search | requests | availability | notifications
  const sessionLabels = getOrgLabels(getSessionOrgId(SESSION_KEY));
  const {
    currentUserId,
    setCurrentUserId,
    password,
    setPassword,
    role,
    hasUser,
    loading,
    error,
    handleLogin,
    handleLogout,
  } = useSessionAuth({
    userIdLabel: sessionLabels.userId,
    adminUrl: ADMIN_URL,
    onLogoutReset: () => {
      setSection("schedule");
      setBookings([]);
      setUserRequests([]);
      setAnnouncements([]);
    },
  });
  const labels = useMemo(
    () => getOrgLabels(getSessionOrgId(SESSION_KEY)),
    [role, hasUser]
  );
  const labelsLower = useMemo(
    () => ({
      user: String(labels.user || "").toLowerCase(),
      users: String(labels.users || "").toLowerCase(),
      manager: String(labels.manager || "").toLowerCase(),
      managers: String(labels.managers || "").toLowerCase(),
      resource: String(labels.resource || "").toLowerCase(),
      resources: String(labels.resources || "").toLowerCase(),
      userId: String(labels.userId || "").toLowerCase(),
      request: String(labels.request || "").toLowerCase(),
    }),
    [labels]
  );
  const {
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
  } = useResourceExplorerState({
    role,
    currentUserId,
    labels,
    labelsLower,
    bookings,
    setBookings,
    requestQuery,
    onlyAvailable,
    requestResourceId,
  });
  const {
    userRequests,
    setUserRequests,
    userRequestsLoading,
    userRequestsError,
    userRequestsQuery,
    setUserRequestsQuery,
    selectedUserRequestKey,
    setSelectedUserRequestKey,
    notificationTab,
    setNotificationTab,
    announcements,
    setAnnouncements,
    announcementsLoading,
    announcementsError,
    announcementsQuery,
    setAnnouncementsQuery,
    selectedAnnouncementId,
    setSelectedAnnouncementId,
    announcementForm,
    setAnnouncementForm,
    announcementSubmitting,
    announcementSent,
    announcementError,
    unreadNotificationCount,
    filteredUserRequests,
    filteredAnnouncements,
    groupedUserRequests,
    selectedUserGroup,
    seenAnnouncementSet,
    loadUserRequests,
    loadAnnouncements,
    submitAnnouncement,
    markAnnouncementSeen,
    markRequestsSeen,
    getUnreadCountForGroup,
  } = useNotificationsState({
    role,
    section,
    currentUserId,
    labels,
  });

  const isCinema = true;

  const cinemaPrimaryButton = {
    border: "none",
    background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
    color: "#fff",
    fontWeight: 800,
    boxShadow: "0 14px 30px rgba(79,70,229,0.22)",
  };

  const cinemaSecondaryButton = {
    border: "1px solid #c4b5fd",
    background: "#ffffff",
    color: "#5b21b6",
    fontWeight: 800,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  };

  const activeBookings = useMemo(() => {
    return bookings.filter((b) => !b.cancelled_at);
  }, [bookings]);

  const scheduleBookings = useMemo(
    () => filterBookingsToPrimaryResources(activeBookings),
    [activeBookings]
  );

  const filteredBookings = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return scheduleBookings;
    return scheduleBookings.filter((b) => {
      const resourcesTxt = (b.resources || [])
        .map((r) => `${r.name} ${r.type_name || ""}`)
        .join(" ");
      const haystack = `${b.id} ${b.date} ${resourcesTxt}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [scheduleBookings, filter]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return filteredBookings.filter(
      (b) => new Date(`${b.date}T${b.start_time}`) >= now
    );
  }, [filteredBookings]);

  const past = useMemo(() => {
    const now = new Date();
    return filteredBookings.filter(
      (b) => new Date(`${b.date}T${b.start_time}`) < now
    );
  }, [filteredBookings]);

  const monthDays = useMemo(
    () => buildMonthGrid(monthDate, filteredBookings),
    [monthDate, filteredBookings]
  );
  const monthLabel = monthDate.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    month: "long",
    year: "numeric",
  });
  useEffect(() => {
    if (!hasUser || !currentUserId.trim()) return;
    let active = true;

    async function refreshUserData() {
      try {
        const userId = currentUserId.trim();
        const [bookingsData, allResources] = await Promise.all([
          getBookingsByUser(userId),
          getAllResources(),
        ]);
        if (!active) return;
        const baseBookings = Array.isArray(bookingsData) ? bookingsData : [];
        const resourcesList = Array.isArray(allResources) ? allResources : [];
        setResources(resourcesList);
        const assignedResources = resourcesList.filter((r) =>
          isResourceAssignedToUser(r, userId)
        );
        let mergedBookings = baseBookings;
        if (assignedResources.length > 0) {
          const extra = await Promise.all(
            assignedResources.map((r) => getBookingsByResource(r.id).catch(() => []))
          );
          const all = new Map();
          for (const b of baseBookings) {
            if (b?.id != null) all.set(String(b.id), b);
          }
          for (const list of extra) {
            for (const b of list || []) {
              if (b?.id != null && !all.has(String(b.id))) {
                all.set(String(b.id), b);
              }
            }
          }
          mergedBookings = Array.from(all.values());
        }
        setBookings(mergedBookings);
      } catch {
        if (!active) return;
      }
    }

    refreshUserData();
    const timer = setInterval(refreshUserData, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hasUser, currentUserId, setResources]);

  async function submitResourceRequest() {
    if (!selectedRequestResource) return;
    const note = requestNote.trim();
    const requester = currentUserId.trim();
    if (!requester) {
      setRequestError(`Please enter your ${labels.userId} first.`);
      return;
    }
    if (!note) {
      setRequestError("Please add a short reason for the request.");
      return;
    }
    setRequestError("");
    setRequestSubmitting(true);
    try {
      await createResourceRequest({
        resource_id: selectedRequestResource.id,
        user_id: requester,
        note,
      });
      setRequestSent(`Request sent for ${selectedRequestResource.name}.`);
      setRequestNote("");
      setRequestResourceId(null);
      setRequestView("list");
    } catch (err) {
      setRequestError(err?.message || "Failed to send request.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  // map resource id -> sessions for active bookings
  const resourceSessions = useMemo(() => {
    const byId = {};
    for (const b of activeBookings) {
      for (const r of b.resources || []) {
        byId[r.id] = byId[r.id] || [];
        byId[r.id].push({
          bookingId: b.id,
          date: b.date,
          start: b.start_time,
          end: b.end_time,
          role: r.role || null,
        });
      }
    }
    Object.values(byId).forEach((list) =>
      list.sort(
        (a, b) =>
          new Date(`${a.date}T${a.start}`) - new Date(`${b.date}T${b.start}`)
      )
    );
    return byId;
  }, [activeBookings]);

  // map resource id -> sessions for all bookings (including cancelled)
  const allResourceSessions = useMemo(() => {
    const byId = {};
    for (const b of bookings) {
      for (const r of b.resources || []) {
        byId[r.id] = byId[r.id] || [];
        byId[r.id].push({
          bookingId: b.id,
          date: b.date,
          start: b.start_time,
          end: b.end_time,
          role: r.role || null,
          cancelled: Boolean(b.cancelled_at),
        });
      }
    }
    Object.values(byId).forEach((list) =>
      list.sort(
        (a, b) =>
          new Date(`${a.date}T${a.start}`) - new Date(`${b.date}T${b.start}`)
      )
    );
    return byId;
  }, [bookings]);

  function openCancelDialog(booking) {
    if (!booking) return;
    setCancelDialog({ open: true, booking });
    setCancelReason("");
    setCancelSenderName("");
    setCancelError("");
    setCancelSuccess("");
    setRescheduleMode(false);
    setRescheduleDate(booking.date || "");
    setRescheduleStart(booking.start_time || "09:00");
    setRescheduleEnd(booking.end_time || "10:00");
    setRescheduleLocation("onsite");
  }

  async function submitCancellation() {
    const booking = cancelDialog.booking;
    if (!booking) return;
    setCancelSubmitting(true);
    setCancelError("");
    setCancelSuccess("");
    try {
      if (rescheduleMode) {
        if (!rescheduleDate || !rescheduleStart || !rescheduleEnd) {
          setCancelError("Please select a new date and time.");
          setCancelSubmitting(false);
          return;
        }
        if (rescheduleStart >= rescheduleEnd) {
          setCancelError("End time must be after start time.");
          setCancelSubmitting(false);
          return;
        }
        await rescheduleBooking(booking.id, {
          date: rescheduleDate,
          start_time: rescheduleStart,
          end_time: rescheduleEnd,
          location: rescheduleLocation,
          reason: cancelReason.trim(),
          sender_name: cancelSenderName.trim() || currentUserId.trim() || labels.manager,
          target_user_id: currentUserId.trim(),
        });
        setCancelSuccess(`${labels.resource} rescheduled.`);
      } else {
        await cancelBooking(booking.id, {
          reason: cancelReason.trim(),
          sender_name: cancelSenderName.trim() || currentUserId.trim() || labels.manager,
          target_user_id: currentUserId.trim(),
        });
        setCancelSuccess(`${labels.resource} cancelled.`);
      }
      const data = await getBookingsByUser(currentUserId.trim());
      setBookings(Array.isArray(data) ? data : []);
      setCancelDialog({ open: false, booking: null });
    } catch (err) {
      setCancelError(
        err?.message ||
        (rescheduleMode
          ? `Failed to reschedule ${labelsLower.resource}.`
          : `Failed to cancel ${labelsLower.resource}.`)
      );
    } finally {
      setCancelSubmitting(false);
    }
  }

  useEffect(() => {
    if (role === "user" && (section === "requests" || section === "availability")) {
      setSection("schedule");
    }
  }, [role, section]);

  useEffect(() => {
    if (!hasUser || role !== "manager") return;
    const id = currentUserId.trim();
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const data = await getUserAvailability(id);
        if (active) setUserAvailability(data);
      } catch {
        if (active) setUserAvailability([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [hasUser, role, currentUserId]);

  if (!hasUser) {
    return (
      <LoginView
        labels={labels}
        labelsLower={labelsLower}
        currentUserId={currentUserId}
        setCurrentUserId={setCurrentUserId}
        password={password}
        setPassword={setPassword}
        handleLogin={handleLogin}
        loading={loading}
        error={error}
      />
    );
  }
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: isCinema ? "#f1f5f9" : "#f8fafc",
      }}
    >
      <AppSidebar
        isCinema={isCinema}
        role={role}
        labels={labels}
        labelsLower={labelsLower}
        currentUserId={currentUserId}
        section={section}
        setSection={setSection}
        unreadNotificationCount={unreadNotificationCount}
        handleLogout={handleLogout}
      />

      {/* Main */}
      <div style={{ flex: 1, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {section === "schedule" ? (
          <ScheduleSection
            isCinema={isCinema}
            labels={labels}
            labelsLower={labelsLower}
            filter={filter}
            setFilter={setFilter}
            viewMode={viewMode}
            setViewMode={setViewMode}
            scheduleBookings={scheduleBookings}
            loading={loading}
            monthLabel={monthLabel}
            setMonthDate={setMonthDate}
            monthDays={monthDays}
            setSelectedScheduleBooking={setSelectedScheduleBooking}
            role={role}
            openCancelDialog={openCancelDialog}
            upcoming={upcoming}
            past={past}
          />
        ) : section === "search" ? (
          <SearchSection
            isCinema={isCinema}
            role={role}
            labels={labels}
            labelsLower={labelsLower}
            bookings={bookings}
            resourceQuery={resourceQuery}
            setResourceQuery={setResourceQuery}
            loadResources={loadResources}
            resourceLoading={resourceLoading}
            filteredResources={filteredResources}
            selectedResource={selectedResource}
            setSelectedResourceId={setSelectedResourceId}
            cinemaSecondaryButton={cinemaSecondaryButton}
          />

        ) : section === "requests" ? (
          <RequestsSection
            labels={labels}
            labelsLower={labelsLower}
            isCinema={isCinema}
            cinemaPrimaryButton={cinemaPrimaryButton}
            cinemaSecondaryButton={cinemaSecondaryButton}
            requestSent={requestSent}
            requestView={requestView}
            setRequestView={setRequestView}
            setRequestResourceId={setRequestResourceId}
            setRequestError={setRequestError}
            selectedRequestResource={selectedRequestResource}
            requestError={requestError}
            requestNote={requestNote}
            setRequestNote={setRequestNote}
            requestSubmitting={requestSubmitting}
            submitResourceRequest={submitResourceRequest}
            requestQuery={requestQuery}
            setRequestQuery={setRequestQuery}
            onlyAvailable={onlyAvailable}
            setOnlyAvailable={setOnlyAvailable}
            loadResources={loadResources}
            resourceLoading={resourceLoading}
            resourceError={resourceError}
            resources={resources}
            filteredRequestResources={filteredRequestResources}
            isResourceAvailable={isResourceAvailable}
            openAvailability={openAvailability}
            setRequestSent={setRequestSent}
          />
        ) : section === "availability" ? (
          <AvailabilitySection
            labelsLower={labelsLower}
            availabilityMessage={availabilityMessage}
            availabilityForm={availabilityForm}
            setAvailabilityForm={setAvailabilityForm}
            availabilitySaving={availabilitySaving}
            setAvailabilitySaving={setAvailabilitySaving}
            isCinema={isCinema}
            cinemaPrimaryButton={cinemaPrimaryButton}
            currentUserId={currentUserId}
            createUserAvailability={createUserAvailability}
            setUserAvailability={setUserAvailability}
            setAvailabilityMessage={setAvailabilityMessage}
            userAvailability={userAvailability}
            deleteUserAvailability={deleteUserAvailability}
          />
        ) : (
          <NotificationsSection
            role={role}
            isCinema={isCinema}
            labels={labels}
            labelsLower={labelsLower}
            cinemaPrimaryButton={cinemaPrimaryButton}
            cinemaSecondaryButton={cinemaSecondaryButton}
            notificationTab={notificationTab}
            setNotificationTab={setNotificationTab}
            userRequestsQuery={userRequestsQuery}
            setUserRequestsQuery={setUserRequestsQuery}
            loadUserRequests={loadUserRequests}
            userRequestsLoading={userRequestsLoading}
            userRequestsError={userRequestsError}
            userRequests={userRequests}
            filteredUserRequests={filteredUserRequests}
            groupedUserRequests={groupedUserRequests}
            getUnreadCountForGroup={getUnreadCountForGroup}
            setSelectedUserRequestKey={setSelectedUserRequestKey}
            markRequestsSeen={markRequestsSeen}
            selectedUserGroup={selectedUserGroup}
            announcementsQuery={announcementsQuery}
            setAnnouncementsQuery={setAnnouncementsQuery}
            loadAnnouncements={loadAnnouncements}
            announcementsLoading={announcementsLoading}
            announcementsError={announcementsError}
            announcementForm={announcementForm}
            setAnnouncementForm={setAnnouncementForm}
            submitAnnouncement={submitAnnouncement}
            announcementSubmitting={announcementSubmitting}
            announcementError={announcementError}
            announcementSent={announcementSent}
            filteredAnnouncements={filteredAnnouncements}
            seenAnnouncementSet={seenAnnouncementSet}
            selectedAnnouncementId={selectedAnnouncementId}
            setSelectedAnnouncementId={setSelectedAnnouncementId}
            markAnnouncementSeen={markAnnouncementSeen}
          />
        )}

        <CancelDialog
          cancelDialog={cancelDialog}
          setCancelDialog={setCancelDialog}
          labelsLower={labelsLower}
          rescheduleMode={rescheduleMode}
          setRescheduleMode={setRescheduleMode}
          rescheduleDate={rescheduleDate}
          setRescheduleDate={setRescheduleDate}
          rescheduleStart={rescheduleStart}
          setRescheduleStart={setRescheduleStart}
          rescheduleEnd={rescheduleEnd}
          setRescheduleEnd={setRescheduleEnd}
          rescheduleLocation={rescheduleLocation}
          setRescheduleLocation={setRescheduleLocation}
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          cancelSenderName={cancelSenderName}
          setCancelSenderName={setCancelSenderName}
          cancelError={cancelError}
          cancelSuccess={cancelSuccess}
          submitCancellation={submitCancellation}
          cancelSubmitting={cancelSubmitting}
        />

        <ResourceAvailabilityModal
          availabilityResource={availabilityResource}
          setAvailabilityResource={setAvailabilityResource}
          labels={labels}
          labelsLower={labelsLower}
          currentUserId={currentUserId}
          refreshAvailabilityStatus={refreshAvailabilityStatus}
          availabilityError={availabilityError}
          availabilityLoading={availabilityLoading}
          availabilityMonthLabel={availabilityMonthLabel}
          setAvailabilityMonthDate={setAvailabilityMonthDate}
          availabilityDays={availabilityDays}
          bookingDraft={bookingDraft}
          bookingSubmitting={bookingSubmitting}
          pickBookingDate={pickBookingDate}
          submitBookingRequest={submitBookingRequest}
          availabilityBookings={availabilityBookings}
          setBookingDraft={setBookingDraft}
          bookingError={bookingError}
          bookingSuccess={bookingSuccess}
        />

        <BookingDetailsModal
          selectedScheduleBooking={selectedScheduleBooking}
          setSelectedScheduleBooking={setSelectedScheduleBooking}
          labels={labels}
        />
      </div>
    </div>
  );
}
