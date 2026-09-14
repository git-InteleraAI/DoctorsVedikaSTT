import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import authService from "../services/authService";
import "./DoctorAuth.css";

// Assets
import vedikaLogo from "../assets/vedika_logo.png";
import doctorCutout from "../assets/doctor_bg.png";
import iconSecure from "../assets/secure.png";
import iconNeedHelp from "../assets/need_help.png";
import iconPassword from "../assets/password.png";

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [accessToken, setAccessToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    let token = "";
    
    // Check URL hash (#access_token=...)
    if (location.hash) {
      const params = new URLSearchParams(location.hash.substring(1));
      token = params.get("access_token") || "";
    }
    
    // Check URL search (?access_token=... or ?token=...)
    if (!token && location.search) {
      const params = new URLSearchParams(location.search);
      token = params.get("access_token") || params.get("token") || "";
    }

    if (token) {
      setAccessToken(token);
    } else {
      setErrorMsg("Invalid or missing password reset link. Please request a new link from the login page.");
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!accessToken) {
      setErrorMsg("Invalid or expired reset token. Please request a new password reset link.");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setErrorMsg("Please enter and confirm your new password.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("New password and confirm password do not match.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await authService.resetPassword(accessToken, newPassword);
      setSuccessMsg(res?.message || "Password updated successfully! Redirecting to login...");
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to reset password. Link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="doctor-auth-wrapper">

      {/* Background Animations */}
      <div className="auth-ambient-glow glow-1"></div>
      <div className="auth-ambient-glow glow-2"></div>
      <div className="auth-floating-plus p1">+</div>
      <div className="auth-floating-plus p2">+</div>

      {/* Absolute Top Left Branding (Logo & Title) */}
      <Link to="/" className="auth-top-left-brand">
        <img src={vedikaLogo} alt="Doctors Vedika Logo" className="auth-brand-logo-img" />
        <div className="auth-brand-info">
          <div className="auth-brand-title">Doctors <span>Vedika</span></div>
          <div className="auth-brand-subtitle">Care. Consult. Cure.</div>
        </div>
      </Link>

      {/* Main Content Grid */}
      <div className="doctor-auth-container animated-entry">

        {/* LEFT SHOWCASE PANEL */}
        <div className="auth-showcase-panel">
          <h1 className="auth-showcase-title">
            Reset Your <span className="text-highlight">Account Password</span>
          </h1>
          <p className="auth-showcase-subtitle">
            Securely set your new password to regain access to your Doctors Vedika clinical portal.
          </p>

          <div className="auth-stage-area">
            <img src={doctorCutout} alt="Doctor Vedika" className="auth-doctor-img" />
          </div>
        </div>

        {/* RIGHT AUTH FORM CARD */}
        <div className="auth-form-card login-card">

          <div className="auth-card-header">
            <h2>Create New Password</h2>
            <p className="auth-card-subtitle">
              Enter and confirm your new password below
            </p>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="auth-alert error-alert">
              <span>⚠️</span> {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="auth-alert success-alert">
              <span>✅</span> {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {/* New Password */}
            <div className="auth-input-group">
              <label className="auth-input-label">New Password</label>
              <div className="auth-input-field-wrapper">
                <img src={iconPassword} alt="Password" className="auth-input-icon-3d" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="newPassword"
                  className="auth-text-input"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  required
                />
                <button
                  type="button"
                  className="auth-toggle-pwd-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle Password Visibility"
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="auth-input-group">
              <label className="auth-input-label">Confirm New Password</label>
              <div className="auth-input-field-wrapper">
                <img src={iconSecure} alt="Confirm Password" className="auth-input-icon-3d" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="confirmPassword"
                  className="auth-text-input"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || !accessToken}
            >
              {loading ? "Updating Password..." : "Update Password"}
            </button>
          </form>

          {/* Footer Link */}
          <div className="auth-card-footer">
            <span>Remembered your password? </span>
            <Link to="/login" className="auth-card-footer-link">
              Back to Sign In
            </Link>
          </div>

        </div>

      </div>

      {/* ABSOLUTE BOTTOM FOOTER BAR */}
      <div className="auth-global-footer-bar">
        <div className="auth-footer-info-item">
          <img src={iconSecure} alt="HIPAA Compliant" className="auth-footer-3d-icon" />
          <div className="auth-footer-info-text">
            <span className="title">HIPAA Compliant</span>
            <span className="desc">Bank-Grade 256-bit AES Encryption</span>
          </div>
        </div>

        <div className="auth-footer-divider"></div>

        <div className="auth-footer-info-item">
          <img src={iconNeedHelp} alt="24/7 Support" className="auth-footer-3d-icon" />
          <div className="auth-footer-info-text">
            <span className="title">Need Assistance?</span>
            <span className="desc">Dedicated Medical IT Support</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ResetPassword;
