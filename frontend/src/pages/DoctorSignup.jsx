import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./DoctorAuth.css";

// Assets
import vedikaLogo from "../assets/vedika_logo.png";
import doctorCutout from "../assets/doctor_cutout.png";
import iconSecure from "../assets/secure.png";
import iconNeedHelp from "../assets/need_help.png";
import iconDoctor from "../assets/doctor.png";
import iconEmail from "../assets/email.png";
import iconPhone from "../assets/phone.png";
import iconCalender from "../assets/calender.png";
import iconRecords from "../assets/records.png";
import iconPassword from "../assets/password.png";

const DoctorSignup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    mobileNumber: "",
    dob: "",
    registrationNumber: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
    if (errorMsg) setErrorMsg("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.fullName || !formData.email || !formData.password) {
      setErrorMsg("Full name, email address, and password are required.");
      return;
    }

    if (formData.password.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMsg("Passwords do not match. Please re-enter.");
      return;
    }

    if (!formData.agreeTerms) {
      setErrorMsg("You must agree to the Terms of Service & Privacy Policy.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await signup({
        fullName: formData.fullName,
        email: formData.email,
        mobileNumber: formData.mobileNumber,
        dob: formData.dob,
        registrationNumber: formData.registrationNumber,
        password: formData.password,
      });

      if (res && res.success) {
        setSuccessMsg("Doctor account registered successfully! Redirecting to login...");
        setTimeout(() => {
          navigate("/login");
        }, 1200);
      } else {
        setErrorMsg(res?.message || "Registration failed. Please try again.");
      }
    } catch (err) {
      setErrorMsg(err.message || "Unable to connect to backend server.");
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
      <div className="auth-top-left-brand">
        <img src={vedikaLogo} alt="Doctors Vedika Logo" className="auth-brand-logo-img" />
        <div className="auth-brand-info">
          <div className="auth-brand-title">Doctors <span>Vedika</span></div>
          <div className="auth-brand-subtitle">Care. Consult. Cure.</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="doctor-auth-container animated-entry">

        {/* LEFT SHOWCASE PANEL */}
        <div className="auth-showcase-panel">
          <h1 className="auth-showcase-title">
            Join our network of <br />
            <span className="text-highlight">trusted medical experts</span>
          </h1>
          <p className="auth-showcase-subtitle">
            Empowering healthcare professionals with next-gen AI consultation tools and clinical STT workflows.
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

        {/* RIGHT SIGNUP CARD */}
        <div className="auth-form-card signup-card">
          <div className="auth-card-header">
            <h2>Create Account</h2>
            <p>Register as a certified doctor to continue</p>
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
            {/* Full Name */}
            <div className="auth-input-group">
              <label className="auth-input-label">Full Name *</label>
              <div className="auth-input-field-wrapper">
                <img src={iconDoctor} alt="Name" className="auth-input-icon-3d" />
                <input
                  type="text"
                  name="fullName"
                  className="auth-text-input"
                  placeholder="Dr. Full Name"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Email & Phone */}
            <div className="auth-form-grid-2">
              <div className="auth-input-group">
                <label className="auth-input-label">Email Address *</label>
                <div className="auth-input-field-wrapper">
                  <img src={iconEmail} alt="Email" className="auth-input-icon-3d" />
                  <input
                    type="email"
                    name="email"
                    className="auth-text-input"
                    placeholder="doctor@hospital.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label className="auth-input-label">Mobile Number</label>
                <div className="auth-input-field-wrapper">
                  <img src={iconPhone} alt="Phone" className="auth-input-icon-3d" />
                  <input
                    type="tel"
                    name="mobileNumber"
                    className="auth-text-input"
                    placeholder="+91 98765 43210"
                    value={formData.mobileNumber}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* DOB & Reg Number */}
            <div className="auth-form-grid-2">
              <div className="auth-input-group">
                <label className="auth-input-label">Date of Birth</label>
                <div className="auth-input-field-wrapper">
                  <img src={iconCalender} alt="DOB" className="auth-input-icon-3d" />
                  <input
                    type="date"
                    name="dob"
                    className="auth-text-input"
                    value={formData.dob}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label className="auth-input-label">Medical Reg. Number</label>
                <div className="auth-input-field-wrapper">
                  <img src={iconRecords} alt="Records" className="auth-input-icon-3d" />
                  <input
                    type="text"
                    name="registrationNumber"
                    className="auth-text-input"
                    placeholder="MCI-XXXXXX"
                    value={formData.registrationNumber}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* Password & Confirm Password */}
            <div className="auth-form-grid-2">
              <div className="auth-input-group">
                <label className="auth-input-label">Password *</label>
                <div className="auth-input-field-wrapper">
                  <img src={iconPassword} alt="Password" className="auth-input-icon-3d" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    className="auth-text-input"
                    placeholder="Min 6 chars"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label className="auth-input-label">Confirm Password *</label>
                <div className="auth-input-field-wrapper">
                  <img src={iconPassword} alt="Password" className="auth-input-icon-3d" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="confirmPassword"
                    className="auth-text-input"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Checkbox Terms */}
            <label className="auth-checkbox-label">
              <input
                type="checkbox"
                name="agreeTerms"
                className="auth-checkbox"
                checked={formData.agreeTerms}
                onChange={handleChange}
                required
              />
              <span>
                I agree to the <a href="#terms" onClick={(e) => e.preventDefault()}>Terms of Service</a> &amp;{" "}
                <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
              </span>
            </label>

            {/* Submit Button */}
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Creating Account..." : "Create Account"}
              {!loading && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="auth-divider">
            <span>or sign up with</span>
          </div>

          <div className="auth-social-row">
            <button type="button" className="auth-social-btn" onClick={() => {
              const API_BASE_URL = import.meta.env.VITE_NODE_API_URL;
              const redirectUrl = encodeURIComponent(window.location.origin + "/auth/callback");
              window.location.href = `${API_BASE_URL}/api/auth/google?redirect_to=${redirectUrl}`;
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Switch to Login */}
          <div className="auth-switch-footer">
            Already have an account? <Link to="/login">Sign in</Link>
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

export default DoctorSignup;
