import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "../layout/MainLayout";
import { getAdminSession, setAdminSession } from "../api/api";

import Dashboard from "./Dashboard";
import Resources from "./Resources";
import Booking from "./Booking";
import ResourceTypes from "./ResourceTypes";
import Availability from "./Availability";
import Rules from "./Rules";  
import ResourceRequests from "./ResourceRequests";
export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

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
    if (existingRole === "admin" && hasOrg) {
      setReady(true);
      return;
    }
    if (!nationalId || role !== "admin" || !orgId) {
      setError("Please sign in from the main login page.");
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
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Admin Login Required</h1>
          <p style={{ color: "#475569", marginBottom: 16 }}>
            {error || "Checking admin session..."}
          </p>
        </div>
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
