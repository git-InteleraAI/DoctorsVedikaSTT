import React from "react";
import { useNavigate } from "react-router-dom";
import vedikaLogo from "/images/logo.png";

import { getApiBaseUrl } from "../utils/apiConfig";

export default function AuthModal({ isOpen, onClose }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleGoogleSignIn = () => {
    const apiBase = getApiBaseUrl();
    const redirectUrl = encodeURIComponent(window.location.origin + "/auth/callback");
    window.location.href = `${apiBase}/api/auth/google?redirect_to=${redirectUrl}`;
  };

  const handleEmailSignIn = () => {
    onClose();
    navigate("/signup");
  };

  const handleEmailLoginDirect = () => {
    onClose();
    navigate("/login");
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(4, 22, 53, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "20px",
        animation: "modalFadeIn 0.25s ease-out forwards",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(145deg, #FFFFFF 0%, #F4FAFD 100%)",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "440px",
          padding: "36px 32px",
          boxShadow: "0 25px 60px -15px rgba(4, 22, 53, 0.35), 0 0 0 1px rgba(8, 174, 184, 0.2)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          animation: "modalPopIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            background: "#F1F5F9",
            border: "none",
            borderRadius: "50%",
            width: "36px",
            height: "36px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#64748B",
            fontSize: "18px",
            fontWeight: "700",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#E2E8F0";
            e.currentTarget.style.color = "#0F172A";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#F1F5F9";
            e.currentTarget.style.color = "#64748B";
          }}
          aria-label="Close Modal"
        >
          ✕
        </button>

        {/* Logo & Header */}
        <img
          src={vedikaLogo}
          alt="Doctors Vedika"
          style={{ height: "56px", width: "auto", marginBottom: "16px" }}
        />

        <div
          style={{
            background: "rgba(8, 174, 184, 0.1)",
            color: "#08AEB8",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: 800,
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginBottom: "12px",
          }}
        >
          ⚡ Clinical AI Portal Access
        </div>

        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: 800,
            color: "#041635",
            margin: "0 0 8px 0",
            letterSpacing: "-0.5px",
          }}
        >
          Sign in to Doctors Vedika
        </h2>

        <p
          style={{
            fontSize: "0.9rem",
            color: "#64748B",
            margin: "0 0 28px 0",
            lineHeight: 1.5,
          }}
        >
          Access Live Transcribe, ambient scribing, and AI clinical tools by selecting your sign-in method.
        </p>

        {/* Action Buttons */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Sign in with Email / Portal */}
          <button
            onClick={handleEmailLoginDirect}
            style={{
              width: "100%",
              padding: "14px 20px",
              background: "linear-gradient(135deg, #08AEB8 0%, #082B68 100%)",
              border: "none",
              borderRadius: "14px",
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "#FFFFFF",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              boxShadow: "0 8px 20px -4px rgba(8, 174, 184, 0.4)",
              transition: "all 0.25s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 12px 25px -4px rgba(8, 174, 184, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 8px 20px -4px rgba(8, 174, 184, 0.4)";
            }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign in to Portal
          </button>

        </div>

        {/* Footer info */}
        <div
          style={{
            marginTop: "20px",
            fontSize: "0.85rem",
            color: "#64748B",
          }}
        >
          Doctor accounts are provisioned by your administrator.
        </div>

        <style>{`
          @keyframes modalFadeIn {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes modalPopIn {
            0% { opacity: 0; transform: scale(0.88) translateY(12px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
