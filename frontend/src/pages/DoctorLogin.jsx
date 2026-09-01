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
import iconPassword from "../assets/password.png";

const DoctorLogin = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

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
      const res = await login(formData.email, formData.password);
      if (res && res.success) {
        setSuccessMsg("Welcome back, Doctor! Redirecting...");
        setTimeout(() => {
          if (res.doctor && res.doctor.onboardingCompleted) {
            navigate("/dashboard");
          } else {
            navigate("/onboarding");
          }
        }, 1000);
      } else {
        setErrorMsg(res?.message || "Invalid credentials. Please try again.");
      }
    } catch (err) {
      setErrorMsg(err.message || "Unable to connect to backend server.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (!formData.email) {
      setErrorMsg("Please enter your registered email address first.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg(`Password reset link sent to ${formData.email}. Please check your inbox.`);
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
          <div className="auth-card-header">
            <h2>Welcome Back</h2>
            <p>Sign in to continue to your medical dashboard</p>
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
              <button type="button" className="auth-link-btn" onClick={handleForgotPassword}>
                Forgot Password?
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

          {/* Divider */}
          <div className="auth-divider">
            <span>or sign in with</span>
          </div>

          {/* Social Google Login */}
          <div className="auth-social-row">
            <button type="button" className="auth-social-btn" onClick={() => {
              const API_BASE_URL = import.meta.env.VITE_NODE_API_URL;
              window.location.href = `${API_BASE_URL}/api/auth/google`;
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Switch to Signup */}
          <div className="auth-switch-footer">
            Don't have an account? <Link to="/signup">Sign up</Link>
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
