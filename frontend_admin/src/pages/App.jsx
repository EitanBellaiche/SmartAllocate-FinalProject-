import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "../layout/MainLayout";
import { getAdminSession, setAdminSession } from "../api/api";
import { getOrgConfig } from "../orgConfig";
import "./AppLogin.css";

import Dashboard from "./Dashboard";
import Resources from "./Resources";
import Booking from "./Booking";
import ResourceTypes from "./ResourceTypes";
import Availability from "./Availability";
import Rules from "./Rules";  
import ResourceRequests from "./ResourceRequests";
import UserBookings from "./UserBookings";

const DEFAULT_USER_URL = "http://localhost:4173";
const RAW_USER_URL = import.meta.env.VITE_USER_URL;
function getUserUrl() {
  if (!RAW_USER_URL) return DEFAULT_USER_URL;
  try {
    return new URL(RAW_USER_URL).toString();
  } catch {
    return DEFAULT_USER_URL;
  }
}
export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const orgConfig = getOrgConfig();

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const nationalId = params.get("national_id");
    const orgId = params.get("organization_id");
    const role = String(params.get("role") || "").toLowerCase();
    const fullName = params.get("full_name") || "";
    const existing = getAdminSession();
    const existingRole = String(existing?.role || "").toLowerCase();
    const hasOrg = String(existing?.organization_id || "").trim();
    const hasIncomingAdminSession = Boolean(nationalId && role === "admin" && orgId);
    if (!hasIncomingAdminSession && existingRole === "admin" && hasOrg) {
      setReady(true);
      return;
    }
    if (!nationalId || role !== "admin" || !orgId) {
      setError("Redirecting to the main login page...");
      window.location.assign(getUserUrl());
      return;
    }

    if (active) {
      setAdminSession({
        id: nationalId,
        role: "admin",
        organization_id: orgId,
        full_name: fullName,
      });
      window.history.replaceState({}, "", window.location.pathname);
      setReady(true);
    }
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    const statusText = error || "Checking admin session...";
    const isRedirecting = Boolean(error);

    return (
      <div className="admin-login-shell">
        <div className="admin-login-orb admin-login-orb-left" aria-hidden="true" />
        <div className="admin-login-orb admin-login-orb-right" aria-hidden="true" />

        <section className="admin-login-card" aria-live="polite">
          <div className="admin-login-brand">
            <span className="admin-login-kicker">Admin workspace</span>
            <div className="admin-login-mark" aria-hidden="true">
              SA
            </div>
          </div>

          <div className="admin-login-copy">
            <p className="admin-login-eyebrow">{orgConfig.businessName}</p>
            <h1>Secure access for your management console</h1>
            <p className="admin-login-subtitle">
              {orgConfig.productSubtitle || "Control resources, bookings, and operations from one place."}
            </p>
          </div>

          <div className="admin-login-status-panel">
            <div className="admin-login-status-header">
              <span
                className={`admin-login-status-dot ${
                  isRedirecting ? "admin-login-status-dot-alert" : ""
                }`}
                aria-hidden="true"
              />
              <strong>{isRedirecting ? "Redirect in progress" : "Validating session"}</strong>
            </div>
            <p>{statusText}</p>
          </div>

          <div className="admin-login-footer">
            <div>
              <span className="admin-login-footer-label">Access level</span>
              <strong>Administrator</strong>
            </div>
            <div>
              <span className="admin-login-footer-label">Platform</span>
              <strong>SmartAllocate</strong>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="resources" element={<Resources />} />
          <Route path="bookings" element={<Booking />} />
          <Route path="resource-types" element={<ResourceTypes />} />
          <Route path="availability" element={<Availability />} />
          <Route path="rules" element={<Rules />} />  { }
          <Route path="requests" element={<ResourceRequests />} />
          <Route path="user-bookings" element={<UserBookings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
