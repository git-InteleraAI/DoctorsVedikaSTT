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
    // Directly navigate to login page smoothly
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
