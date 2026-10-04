import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import authService from "../services/authService";
import "./DoctorAuth.css";

// Assets
import vedikaLogo from "../assets/vedika_logo.png";
import doctorCutout from "../assets/doctor_bg.png";
import iconSecure from "../assets/secure.png";
import iconNeedHelp from "../assets/need_help.png";
import iconDoctor from "../assets/doctor_bg.png";
import iconEmail from "../assets/email.png";
import iconPassword from "../assets/password.png";

const DoctorLogin = ({ portal: initialPortal = "doctor" }) => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [activePortal, setActivePortal] = useState(initialPortal);
  const [formData, setFormData] = useState({
    email: activePortal === "admin" ? "admin@doctorsvedika.com" : "",
    password: activePortal === "admin" ? "Admin@123456" : "",
  });

  React.useEffect(() => {
    const existing = authService.getCurrentDoctor();
    if (existing && authService.isAuthenticated()) {
      const caps = existing.capabilities || {};
      const role = existing.role || (caps.staff ? "staff" : caps.hospitalAdmin ? "hospital_admin" : "doctor");
      let targetRoute = "/dashboard";
      if (role === "hospital_admin" || role === "admin") {
        targetRoute = "/admin";
      } else if (role === "staff") {
        targetRoute = "/staff";
      }
      navigate(targetRoute, { replace: true });
    }
  }, [navigate]);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handlePortalSwitch = (portal) => {
    setActivePortal(portal);
    setErrorMsg("");
    setSuccessMsg("");
    if (portal === "admin") {
      setFormData({ email: "admin@doctorsvedika.com", password: "Admin@123456" });
    } else {
      setFormData({ email: "", password: "" });
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (errorMsg) setErrorMsg("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await login(formData.email, formData.password, activePortal);
      if (res && res.success) {
        const userObj = res.doctor || authService.getCurrentDoctor() || {};
        const caps = userObj.capabilities || {};
        const role = userObj.role || (caps.staff ? "staff" : caps.hospitalAdmin ? "hospital_admin" : "doctor");

        let targetRoute = "/dashboard";
        if (role === "hospital_admin" || role === "admin" || activePortal === "admin") {
          targetRoute = "/admin";
        } else if (role === "staff" || activePortal === "staff") {
          targetRoute = "/staff";
        }

        setLoading(false);
        navigate(targetRoute, { replace: true });
      } else {
        setErrorMsg(res?.message || "Invalid credentials. Please check your email and password.");
        setLoading(false);
      }
    } catch (err) {
      setErrorMsg(err.message || "Unable to connect to authentication service.");
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setErrorMsg("Please enter your registered email address first.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    setResetLoading(true);
    try {
      const res = await authService.forgotPassword(formData.email);
      setSuccessMsg(res?.message || `Password reset link sent to ${formData.email}. Please check your inbox.`);
    } catch (err) {
      setErrorMsg(err.message || "Failed to send reset link. Please try again.");
    } finally {
      setResetLoading(false);
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
            Care made <br />
            <span className="text-highlight">simple &amp; smart</span>
          </h1>
          <p className="auth-showcase-subtitle">
            Your trusted AI-powered clinical assistant for seamless consultations and patient care management.
          </p>

          <div className="auth-stage-area">
            {/* Animated ECG Pulse Vector Scrolling */}
            <div style={{ position: "absolute", zIndex: 0, width: "100%", height: "100%", left: 0, top: 0, overflow: "visible" }}>
              <div className="ecg-container">
                <svg className="auth-ecg-pulse-animated" viewBox="0 0 500 120" fill="none">
                  <path
                    d="M0 60 H140 L150 20 L165 100 L180 35 L195 75 L210 60 H500"
                    stroke="url(#ecgLogoGradient)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="ecgLogoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#08AEB8" stopOpacity="0.1" />
                      <stop offset="50%" stopColor="#08AEB8" stopOpacity="1" />
                      <stop offset="100%" stopColor="#082B68" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>
                </svg>
                <svg className="auth-ecg-pulse-animated" viewBox="0 0 500 120" fill="none">
                  <path
                    d="M0 60 H140 L150 20 L165 100 L180 35 L195 75 L210 60 H500"
                    stroke="url(#ecgLogoGradient2)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="ecgLogoGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#082B68" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#08AEB8" stopOpacity="1" />
                      <stop offset="100%" stopColor="#08AEB8" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 10, display: "flex", justifyContent: "center", width: "100%" }}>
              <img src={doctorCutout} alt="Doctor Professional" className="auth-doctor-img" />
            </div>
          </div>
        </div>

        {/* RIGHT LOGIN CARD */}
        <div className="auth-form-card login-card">
          {/* Portal Selector Tabs */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", background: "#f1f5f9", padding: "6px", borderRadius: "14px" }}>
            <button
              type="button"
              onClick={() => handlePortalSwitch("admin")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "10px",
                border: "none",
                fontSize: "0.8rem",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.2s",
                background: activePortal === "admin" ? "#0D9488" : "transparent",
                color: activePortal === "admin" ? "#ffffff" : "#64748b",
                boxShadow: activePortal === "admin" ? "0 2px 6px rgba(13,148,136,0.3)" : "none"
              }}
            >
              🏥 Admin Portal
            </button>
            <button
              type="button"
              onClick={() => handlePortalSwitch("staff")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "10px",
                border: "none",
                fontSize: "0.8rem",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.2s",
                background: activePortal === "staff" ? "#0D9488" : "transparent",
                color: activePortal === "staff" ? "#ffffff" : "#64748b",
                boxShadow: activePortal === "staff" ? "0 2px 6px rgba(13,148,136,0.3)" : "none"
              }}
            >
              👔 Staff Desk
            </button>
            <button
              type="button"
              onClick={() => handlePortalSwitch("doctor")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "10px",
                border: "none",
                fontSize: "0.8rem",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.2s",
                background: activePortal === "doctor" ? "#0D9488" : "transparent",
                color: activePortal === "doctor" ? "#ffffff" : "#64748b",
                boxShadow: activePortal === "doctor" ? "0 2px 6px rgba(13,148,136,0.3)" : "none"
              }}
            >
              🩺 Doctor Portal
            </button>
          </div>

          <div className="auth-card-header">
            <h2>
              {activePortal === "admin" ? "Hospital Admin Sign In" :
               activePortal === "staff" ? "Staff Desk Sign In" :
               "Doctor Portal Sign In"}
            </h2>
            <p>
              {activePortal === "admin" ? "Sign in to manage hospital members & tenant operations" :
               activePortal === "staff" ? "Sign in to manage walk-in patients & live queue" :
               "Sign in to access your clinical workspace & consultations"}
            </p>
          </div>

          {errorMsg && (
            <div className="auth-alert-box error">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="auth-alert-box success">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {/* Email Field */}
            <div className="auth-input-group">
              <label className="auth-input-label">Email</label>
              <div className="auth-input-field-wrapper">
                <img src={iconEmail} alt="Email" className="auth-input-icon-3d" />
                <input
                  type="email"
                  name="email"
                  className="auth-text-input"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="auth-input-group">
              <label className="auth-input-label">Password</label>
              <div className="auth-input-field-wrapper">
                <img src={iconPassword} alt="Password" className="auth-input-icon-3d" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  className="auth-text-input"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
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

            {/* Forgot Password */}
            <div className="auth-forgot-row">
              <button 
                type="button" 
                className="auth-link-btn" 
                onClick={handleForgotPassword}
                disabled={resetLoading}
              >
                {resetLoading ? "Sending reset link..." : "Forgot Password?"}
              </button>
            </div>

            {/* Action Button */}
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Authenticating..." : "Sign In"}
              {!loading && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </button>
          </form>

          {/* Admin Provisioning Notice */}
          <div className="auth-switch-footer" style={{ marginTop: "20px", color: "#64748b", fontSize: "0.85rem" }}>
            Doctor accounts are provisioned by your System Administrator.
          </div>
        </div>
      </div>

      {/* ABSOLUTE BOTTOM FOOTER BAR (Spread Across the Corner) */}
      <div className="auth-global-footer-bar">
        <div className="auth-footer-info-item">
          <img src={iconSecure} alt="Secure" className="auth-footer-3d-icon" />
          <div className="auth-footer-info-text">
            <span className="title">Secure &amp; Reliable</span>
            <span className="desc">Your data is safe with us</span>
          </div>
        </div>

        <div className="auth-footer-divider"></div>

        <div className="auth-footer-info-item">
          <img src={iconNeedHelp} alt="Support" className="auth-footer-3d-icon" />
          <div className="auth-footer-info-text">
            <span className="title">24/7 Support</span>
            <span className="desc">We're here to help</span>
          </div>
        </div>

        <div className="auth-footer-divider"></div>

        <div className="auth-footer-info-item">
          <img src={iconDoctor} alt="Doctors" className="auth-footer-3d-icon" />
          <div className="auth-footer-info-text">
            <span className="title">Trusted by Doctors</span>
            <span className="desc">Across the country</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default DoctorLogin;
