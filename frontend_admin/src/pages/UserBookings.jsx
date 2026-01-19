import { useEffect, useState } from "react";
import { apiGet } from "../api/api";

export default function UserBookings() {
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userId, setUserId] = useState("");
  const [userBookings, setUserBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  useEffect(() => {
    const trimmed = userQuery.trim();
    if (trimmed.length < 2) {
      setUserOptions([]);
      setUserError("");
      return;
    }
    let active = true;
    setUserLoading(true);
    setUserError("");
    apiGet(`/users?q=${encodeURIComponent(trimmed)}`)
      .then((data) => {
        if (!active) return;
        setUserOptions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!active) return;
        setUserError(err?.message || "Failed to load users");
      })
      .finally(() => {
        if (!active) return;
        setUserLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userQuery]);

  useEffect(() => {
    const id = String(userId || "").trim();
    if (!id) {
      setUserBookings([]);
      return;
    }
    let active = true;
    setBookingsLoading(true);
    apiGet(`/bookings?user_id=${encodeURIComponent(id)}&include_details=1`)
      .then((data) => {
        if (!active) return;
        setUserBookings(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setUserBookings([]);
      })
      .finally(() => {
        if (!active) return;
        setBookingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  function selectUser(user) {
    setUserId(String(user?.national_id || "").trim());
    setUserQuery(user?.full_name || user?.national_id || "");
    setUserOptions([]);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">User Bookings</h1>
      <p className="text-sm text-gray-600 mb-4">
        Search a user to review their bookings.
      </p>

      <div className="mb-4">
        <label className="block font-semibold mb-1">
          Find User (name, email, or national ID)
        </label>
        <input
          type="text"
          className="w-full p-3 border rounded-lg"
          value={userQuery}
          onChange={(e) => {
            setUserQuery(e.target.value);
            setUserId("");
          }}
          placeholder="Search by name, email, or national ID"
        />
        {userLoading && <div className="text-sm text-gray-500 mt-2">Loading users...</div>}
        {userError && <div className="text-sm text-red-600 mt-2">{userError}</div>}
        {userOptions.length > 0 && (
          <div className="border rounded mt-2 max-h-48 overflow-auto bg-white">
            {userOptions.map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-100"
                onClick={() => selectUser(u)}
              >
                {u.full_name || "User"} | {u.national_id} | {u.email}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 text-sm text-gray-600">
          Selected: {userId ? userId : "None"}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Current Bookings</h3>
        {bookingsLoading ? (
          <div className="text-sm text-gray-500">Loading bookings...</div>
        ) : userBookings.length === 0 ? (
          <div className="text-sm text-gray-500">No bookings for this user.</div>
        ) : (
          <div className="space-y-3">
            {userBookings.map((b) => (
              <div key={b.id} className="border rounded p-3">
                <div>
                  <div className="font-semibold">
                    {b.date} | {b.start_time} - {b.end_time}
                  </div>
                  <div className="text-sm text-gray-600">
                    {(b.resources || [])
                      .map((r) => r?.name || "Resource")
                      .join(" / ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
