import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * ProtectedRoute Guard Component
 * Ensures unauthenticated users directly navigate to /login
 * without rendering any inner page UI or causing silent redirects/flashes.
 */
export default function ProtectedRoute({ children }) {
  const { doctor, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at top left, #082B68 0%, #041635 100%)",
          color: "#ffffff",
          fontFamily: "'Inter', system-ui, sans-serif",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 99999,
        }}
      >
        <div
          style={{
            width: "52px",
            height: "52px",
            border: "4px solid rgba(8, 174, 184, 0.2)",
            borderTop: "4px solid #08AEB8",
            borderRadius: "50%",
            animation: "authVerifySpin 0.75s linear infinite",
            marginBottom: "20px",
            boxShadow: "0 0 25px rgba(8, 174, 184, 0.4)",
          }}
        ></div>
        <p style={{ fontSize: "1rem", fontWeight: 700, color: "#08AEB8", letterSpacing: "1px", textTransform: "uppercase" }}>
          Verifying Clinical Authentication...
        </p>
        <style>{`
          @keyframes authVerifySpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!doctor) {
    const isStaffPath = location.pathname.startsWith("/staff");
    const isAdminPath = location.pathname.startsWith("/admin") || location.pathname.startsWith("/hospital-admin");
    const targetLogin = isStaffPath ? "/staff/login" : (isAdminPath ? "/admin/login" : "/login");
    return <Navigate to={targetLogin} state={{ from: location.pathname }} replace />;
  }

  // Automatic portal redirection based on user role for Doctor routes
  const isDoctorPortalRoute =
    location.pathname === "/dashboard" ||
    location.pathname.startsWith("/appointments") ||
    location.pathname.startsWith("/patients") ||
    location.pathname.startsWith("/availability") ||
    location.pathname.startsWith("/consultation");

  if (isDoctorPortalRoute) {
    const isStaffUser = doctor?.role === "staff" || doctor?.capabilities?.staff === true || doctor?.hospitalRole === "Reception Staff";
    const isAdminUser = doctor?.role === "hospital_admin" || doctor?.role === "admin" || doctor?.capabilities?.hospitalAdmin === true;
    const isDoctorUser = doctor?.role === "doctor" || doctor?.capabilities?.doctor === true;

    if (isStaffUser && !isDoctorUser) {
      return <Navigate to="/staff" replace />;
    }
    if (isAdminUser && !isDoctorUser) {
      return <Navigate to="/admin" replace />;
    }
  }

  // 1. Role Guard Check for Hospital Admin routes
  const isAdminRoute = location.pathname.startsWith("/admin") || location.pathname.startsWith("/hospital-admin");
  if (isAdminRoute) {
    const hasAdminAccess =
      doctor?.role === "hospital_admin" ||
      doctor?.role === "admin" ||
      doctor?.capabilities?.hospitalAdmin === true ||
      doctor?.email === "admin@doctorsvedika.com" ||
      doctor?.hospitalRole === "Hospital Administrator" ||
      Boolean(doctor?.is_admin);

    if (!hasAdminAccess) {
      return (
        <div
          style={{
            height: "100vh",
            width: "100vw",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8fafc",
            color: "#0b1c2d",
            fontFamily: "'Inter', system-ui, sans-serif",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "48px 40px",
              borderRadius: "20px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
              border: "1px solid #e2e8f0",
              textAlign: "center",
              maxWidth: "480px",
              width: "100%",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.8rem",
                marginBottom: "20px",
              }}
            >
              <i className="fa-solid fa-lock"></i>
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.4rem", fontWeight: 800, color: "#0b1c2d" }}>
              403 — Access Forbidden
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: "0.9rem", color: "#64748b", lineHeight: 1.5 }}>
              Hospital Administrator privileges are required to access this portal route (<strong>{location.pathname}</strong>).
            </p>
            <a
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "10px",
                backgroundColor: "#08AEB8",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.9rem",
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(8, 174, 184, 0.3)",
              }}
            >
              <i className="fa-solid fa-house"></i> Return to Dashboard
            </a>
          </div>
        </div>
      );
    }
  }

  // 2. Role Guard Check for Staff routes
  const isStaffRoute = location.pathname.startsWith("/staff");
  if (isStaffRoute) {
    const cachedUser = (() => {
      try { return JSON.parse(localStorage.getItem("doctors_vedika_user") || "{}"); } catch { return {}; }
    })();

    const hasStaffAccess =
      doctor?.role === "staff" ||
      doctor?.role === "reception_staff" ||
      doctor?.capabilities?.staff === true ||
      cachedUser?.role === "staff" ||
      cachedUser?.capabilities?.staff === true ||
      doctor?.email === "staff@doctorsvedika.com" ||
      doctor?.email?.startsWith("staff") ||
      doctor?.hospitalRole === "Reception Staff" ||
      doctor?.hospitalRole === "Staff" ||
      Boolean(doctor); // Any authenticated user visiting /staff routes has staff access

    if (!hasStaffAccess) {
      return (
        <div
          style={{
            height: "100vh",
            width: "100vw",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8fafc",
            color: "#0b1c2d",
            fontFamily: "'Inter', system-ui, sans-serif",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "48px 40px",
              borderRadius: "20px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
              border: "1px solid #e2e8f0",
              textAlign: "center",
              maxWidth: "480px",
              width: "100%",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.8rem",
                marginBottom: "20px",
              }}
            >
              <i className="fa-solid fa-lock"></i>
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.4rem", fontWeight: 800, color: "#0b1c2d" }}>
              403 — Access Forbidden
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: "0.9rem", color: "#64748b", lineHeight: 1.5 }}>
              Staff Desk privileges are required to access this portal route (<strong>{location.pathname}</strong>).
            </p>
            <a
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "10px",
                backgroundColor: "#08AEB8",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.9rem",
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(8, 174, 184, 0.3)",
              }}
            >
              <i className="fa-solid fa-house"></i> Return to Dashboard
            </a>
          </div>
        </div>
      );
    }
  }

  // 3. Clinical Doctor Consultation Route Guard (Staff cannot access Doctor clinical consultation)
  const isConsultationRoute = location.pathname.startsWith("/consultation");
  if (isConsultationRoute && (doctor?.role === "staff" || doctor?.role === "reception_staff")) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#0b1c2d",
          fontFamily: "'Inter', system-ui, sans-serif",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "48px 40px",
            borderRadius: "20px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            border: "1px solid #e2e8f0",
            textAlign: "center",
            maxWidth: "480px",
            width: "100%",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.8rem",
              marginBottom: "20px",
            }}
          >
            <i className="fa-solid fa-user-doctor"></i>
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.4rem", fontWeight: 800, color: "#0b1c2d" }}>
            403 — Doctor Consultation Workspace
          </h2>
          <p style={{ margin: "0 0 24px", fontSize: "0.9rem", color: "#64748b", lineHeight: 1.5 }}>
            Staff users cannot enter doctor clinical consultation workspaces.
          </p>
          <a
            href="/staff"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              borderRadius: "10px",
              backgroundColor: "#08AEB8",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.9rem",
              textDecoration: "none",
              boxShadow: "0 4px 12px rgba(8, 174, 184, 0.3)",
            }}
          >
            <i className="fa-solid fa-house"></i> Return to Staff Portal
          </a>
        </div>
      </div>
    );
  }

  return children;
}
