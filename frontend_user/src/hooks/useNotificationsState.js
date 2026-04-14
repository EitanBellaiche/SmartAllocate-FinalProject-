import { useEffect, useMemo, useState } from "react";
import {
  createAnnouncement,
  getAnnouncements,
  getResourceRequests,
} from "../api";

export default function useNotificationsState({
  role,
  section,
  currentUserId,
  labels,
}) {
  const [userRequests, setUserRequests] = useState([]);
  const [userRequestsLoading, setUserRequestsLoading] = useState(false);
  const [userRequestsError, setUserRequestsError] = useState("");
  const [userRequestsQuery, setUserRequestsQuery] = useState("");
  const [selectedUserRequestKey, setSelectedUserRequestKey] = useState(null);
  const [seenRequestIds, setSeenRequestIds] = useState([]);
  const [notificationTab, setNotificationTab] = useState("requests");
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState("");
  const [announcementsQuery, setAnnouncementsQuery] = useState("");
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState(null);
  const [seenAnnouncementIds, setSeenAnnouncementIds] = useState([]);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    message: "",
    resource: "",
    targetUserId: "",
    senderName: "",
  });
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);
  const [announcementSent, setAnnouncementSent] = useState("");
  const [announcementError, setAnnouncementError] = useState("");

  async function loadUserRequests() {
    const userId = currentUserId.trim();
    if (role === "user" && !userId) return;
    setUserRequestsError("");
    setUserRequestsLoading(true);
    try {
      const data =
        role === "manager"
          ? await getResourceRequests()
          : await getResourceRequests({ userId });
      setUserRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setUserRequestsError(err?.message || "Failed to load requests.");
      setUserRequests([]);
    } finally {
      setUserRequestsLoading(false);
    }
  }

  async function loadAnnouncements() {
    const userId = currentUserId.trim();
    if (role === "user" && !userId) return;
    setAnnouncementsError("");
    setAnnouncementsLoading(true);
    try {
      const data = await getAnnouncements({
        userId: role === "user" ? userId : undefined,
      });
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (err) {
      setAnnouncementsError(err?.message || "Failed to load announcements.");
      setAnnouncements([]);
    } finally {
      setAnnouncementsLoading(false);
    }
  }

  async function submitAnnouncement() {
    const title = announcementForm.title.trim();
    const message = announcementForm.message.trim();
    const resource = announcementForm.resource.trim();
    const targetUserId = announcementForm.targetUserId.trim();
    const senderName =
      announcementForm.senderName.trim() || currentUserId.trim() || labels.manager;

    if (!title) {
      setAnnouncementError("Please add a title.");
      return;
    }
    if (!message) {
      setAnnouncementError("Please add a message.");
      return;
    }

    setAnnouncementSubmitting(true);
    setAnnouncementError("");
    setAnnouncementSent("");
    try {
      await createAnnouncement({
        title,
        message,
        resource_name: resource,
        sender_name: senderName,
        target_user_id: targetUserId || null,
      });
      setAnnouncementSent("Announcement sent.");
      setAnnouncementForm((prev) => ({
        ...prev,
        title: "",
        message: "",
        resource: "",
        targetUserId: "",
      }));
      await loadAnnouncements();
    } catch (err) {
      setAnnouncementError(err?.message || "Failed to send announcement.");
    } finally {
      setAnnouncementSubmitting(false);
    }
  }

  function markAnnouncementSeen(announcementId) {
    if (role !== "user") return;
    const userId = currentUserId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_announcements_${userId}`;
    const next = new Set([...seenAnnouncementIds, Number(announcementId)]);
    const nextList = Array.from(next);
    setSeenAnnouncementIds(nextList);
    localStorage.setItem(key, JSON.stringify(nextList));
  }

  function markRequestsSeen(resourceId) {
    const userId = currentUserId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_${userId}`;
    const toMark = userRequests
      .filter(
        (req) =>
          String(req.resource_id) === String(resourceId) &&
          req.status &&
          req.status !== "pending"
      )
      .map((req) => Number(req.id));
    if (toMark.length === 0) return;
    const next = new Set([...seenRequestIds, ...toMark]);
    const nextList = Array.from(next);
    setSeenRequestIds(nextList);
    localStorage.setItem(key, JSON.stringify(nextList));
  }

  useEffect(() => {
    const userId = currentUserId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_${userId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      setSeenRequestIds(Array.isArray(stored) ? stored : []);
    } catch {
      setSeenRequestIds([]);
    }
  }, [currentUserId]);

  useEffect(() => {
    const userId = currentUserId.trim();
    if (!userId) return;
    const key = `smartallocate_seen_announcements_${userId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      setSeenAnnouncementIds(Array.isArray(stored) ? stored : []);
    } catch {
      setSeenAnnouncementIds([]);
    }
  }, [currentUserId]);

  const seenRequestSet = useMemo(
    () => new Set(seenRequestIds.map((id) => Number(id))),
    [seenRequestIds]
  );

  const seenAnnouncementSet = useMemo(
    () => new Set(seenAnnouncementIds.map((id) => Number(id))),
    [seenAnnouncementIds]
  );

  const unreadRequestCount = useMemo(() => {
    return userRequests.filter(
      (req) =>
        req.status && req.status !== "pending" && !seenRequestSet.has(Number(req.id))
    ).length;
  }, [userRequests, seenRequestSet]);

  const unreadAnnouncementCount = useMemo(() => {
    if (role !== "user") return 0;
    return announcements.filter((a) => !seenAnnouncementSet.has(Number(a.id))).length;
  }, [announcements, role, seenAnnouncementSet]);

  const unreadNotificationCount = unreadRequestCount + unreadAnnouncementCount;

  const filteredUserRequests = useMemo(() => {
    const q = userRequestsQuery.trim().toLowerCase();
    if (!q) return userRequests;
    return userRequests.filter((req) => {
      const haystack = [
        req.resource_name,
        req.resource_type,
        req.status,
        req.request_date,
        req.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [userRequests, userRequestsQuery]);

  const filteredAnnouncements = useMemo(() => {
    const q = announcementsQuery.trim().toLowerCase();
    if (!q) return announcements;
    return announcements.filter((a) => {
      const haystack = [a.title, a.message, a.resource_name, a.sender_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [announcements, announcementsQuery]);

  const groupedUserRequests = useMemo(() => {
    const groups = new Map();
    filteredUserRequests.forEach((req) => {
      const key = String(req.resource_id ?? req.resource_name ?? req.id);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          resource_id: req.resource_id,
          resource_name: req.resource_name,
          resource_type: req.resource_type,
          requests: [],
        });
      }
      groups.get(key).requests.push(req);
    });
    return Array.from(groups.values()).sort((a, b) => {
      const aName = a.resource_name || `${labels.resource} #${a.resource_id || ""}`;
      const bName = b.resource_name || `${labels.resource} #${b.resource_id || ""}`;
      return aName.localeCompare(bName);
    });
  }, [filteredUserRequests, labels.resource]);

  const selectedUserGroup = groupedUserRequests.find(
    (group) => group.key === selectedUserRequestKey
  );

  function getUnreadCountForGroup(group) {
    return group.requests.filter(
      (req) =>
        req.status && req.status !== "pending" && !seenRequestSet.has(Number(req.id))
    ).length;
  }

  useEffect(() => {
    if (
      selectedUserRequestKey &&
      !groupedUserRequests.some((group) => group.key === selectedUserRequestKey)
    ) {
      setSelectedUserRequestKey(null);
    }
  }, [groupedUserRequests, selectedUserRequestKey]);

  useEffect(() => {
    if (
      selectedAnnouncementId &&
      !filteredAnnouncements.some((announcement) => announcement.id === selectedAnnouncementId)
    ) {
      setSelectedAnnouncementId(null);
    }
  }, [filteredAnnouncements, selectedAnnouncementId]);

  useEffect(() => {
    if (userRequestsQuery.trim()) {
      setSelectedUserRequestKey(null);
    }
  }, [userRequestsQuery]);

  useEffect(() => {
    if (role === "manager") {
      setNotificationTab("requests");
    } else if (role === "user") {
      setNotificationTab("announcements");
      setUserRequests([]);
    }
  }, [role]);

  useEffect(() => {
    if (section !== "notifications") return;
    if (role === "manager") {
      loadUserRequests();
    }
    if (role === "user") {
      loadAnnouncements();
    }
  }, [section, currentUserId, role]);

  useEffect(() => {
    if (section !== "notifications") return;
    if (role !== "user" || !currentUserId.trim()) return;
    let active = true;

    async function refreshAnnouncements() {
      try {
        const data = await getAnnouncements({
          userId: currentUserId.trim(),
        });
        if (!active) return;
        setAnnouncements(Array.isArray(data) ? data : []);
      } catch {
        if (!active) return;
      }
    }

    refreshAnnouncements();
    const timer = setInterval(refreshAnnouncements, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [section, currentUserId, role]);

  return {
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
  };
}
