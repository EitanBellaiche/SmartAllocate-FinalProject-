import { useEffect, useState } from "react";
import { loginUser } from "../api";
import { normalizeRole } from "../utils/appHelpers";

export const SESSION_KEY = "smartallocate.session";

export default function useSessionAuth({
  userIdLabel = "user ID",
  adminUrl,
  onLogoutReset,
}) {
  const [currentUserId, setCurrentUserId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [hasUser, setHasUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mustLogout = params.get("logout") === "1";
    if (mustLogout) {
      localStorage.removeItem(SESSION_KEY);
      window.history.replaceState({}, "", window.location.pathname);
      setCurrentUserId("");
      setPassword("");
      setRole("user");
      setHasUser(false);
      setError("");
      onLogoutReset?.();
      return;
    }

    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw);
      const storedId = String(stored?.id || "").trim();
      if (!storedId) return;
      setCurrentUserId(storedId);
      setRole(normalizeRole(stored?.role));
      setHasUser(true);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  async function handleLogin() {
    const id = currentUserId.trim();
    if (!id) {
      setError(`Please enter your ${userIdLabel}.`);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const user = await loginUser(id, password);
      const normalizedRole = normalizeRole(user?.role);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          id,
          role: normalizedRole,
          organization_id: user?.organization_id || null,
          full_name: user?.full_name || "",
        })
      );
      if (normalizedRole === "admin") {
        const params = new URLSearchParams();
        params.set("national_id", id);
        if (user?.organization_id) {
          params.set("organization_id", String(user.organization_id));
        }
        if (user?.full_name) {
          params.set("full_name", String(user.full_name));
        }
        params.set("role", "admin");
        const query = `?${params.toString()}`;
        window.location.assign(`${adminUrl}${query}`);
        return;
      }
      setRole(normalizedRole);
      setHasUser(true);
    } catch (err) {
      setError(err?.message || "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setHasUser(false);
    setCurrentUserId("");
    setPassword("");
    setRole("user");
    setError("");
    onLogoutReset?.();
  }

  return {
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
  };
}
