import React from "react";

const PROMO_VIDEO_SRC = "/SmartAllocateVideo.mp4";

export default function LoginView({
  labels,
  labelsLower,
  currentUserId,
  setCurrentUserId,
  password,
  setPassword,
  handleLogin,
  loading,
  error,
  domain = "generic",
}) {
  return (
    <div className={`login-shell login-shell--${domain || "generic"}`}>
      <div className="login-card">
        <section className="login-showcase">
          <div className="login-brand-badge">SmartAllocate</div>

          <div className="login-greeting">
            <div className="login-greeting-title">Welcome back</div>
            <div className="login-greeting-sub">
              Sign in to manage your {labelsLower.resources}, review your activity, and stay
              aligned with your organization from one elegant workspace.
            </div>
          </div>

          <div className="login-showcase-video-card">
            <div className="login-showcase-video-header">
              <span className="login-video-chip login-video-chip-problem">Before SmartAllocate</span>
              <span className="login-video-chip login-video-chip-solution">After SmartAllocate</span>
            </div>
            <div className="login-showcase-video-frame">
              <video
                className="login-showcase-video"
                src={PROMO_VIDEO_SRC}
                autoPlay
                muted
                loop
                controls
                playsInline
                preload="metadata"
              >
                Your browser does not support HTML5 video.
              </video>
            </div>
            <div className="login-showcase-video-copy">
              <strong>See the full transformation.</strong>
              <p>
                Watch how manual scheduling, booking conflicts, and resource overload turn into
                a clean SmartAllocate workflow with automated assignments and calmer operations.
              </p>
            </div>
          </div>

          <div className="login-showcase-panel">
            <div className="login-showcase-label">Personal workspace</div>
            <div className="login-showcase-text">
              Review bookings, follow updates from your {labelsLower.managers}, and request the
              next {labelsLower.resource} with a calm, focused workflow.
            </div>
          </div>
        </section>

        <section className="login-form-wrap">
          <div className="login-form">
            <div className="login-form-header">
              <div className="login-form-title">Sign in</div>
              <div className="login-form-subtitle">
                Enter your details to access your personal dashboard.
              </div>
            </div>

            <label className="login-label">{labels.userId}</label>
            <input
              className="login-input"
              type="text"
              inputMode="numeric"
              value={currentUserId}
              onChange={(e) => setCurrentUserId(e.target.value)}
              placeholder={`Enter your ${labelsLower.userId}`}
            />
            <label className="login-label">Password</label>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
            <button className="login-button" onClick={handleLogin} disabled={loading}>
              {loading ? "Loading..." : "Sign in"}
            </button>
            {error && <div className="login-error">{error}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
