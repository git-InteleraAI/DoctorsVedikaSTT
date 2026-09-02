import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "./Sidebar";

/**
 * DashboardLayout
 *
 * Layout architecture:
 *
 * ┌──────────────────────────────────────────────┐
 * │                  FIXED HEADER                │
 * ├──────────────┬───────────────────────────────┤
 * │              │                               │
 * │    FIXED     │       INDEPENDENT             │
 * │   SIDEBAR    │       SCROLLABLE              │
 * │              │       MAIN CONTENT             │
 * │              │                               │
 * └──────────────┴───────────────────────────────┘
 *
 * IMPORTANT:
 * - Header never scrolls.
 * - Sidebar never scrolls with page content.
 * - Main content has its own vertical scroll.
 * - Sidebar width is permanently reserved.
 * - Opening navigation dropdowns cannot move Settings/Logout/Upgrade.
 */

const HEADER_HEIGHT = 64;
const SIDEBAR_WIDTH = 252;

export default function DashboardLayout({
    activePage = "dashboard",
    dashboardTab,
    onDashboardTab,
    patientView,
    onPatientView,
    fetchPatients,
    searchPlaceholder = "Search patients, questions, topics...",
    searchValue = "",
    onSearchChange,
    children,
}) {
    const navigate = useNavigate();
    const { doctor, logout } = useAuth();
    
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (!mobile) setIsSidebarOpen(true);
            else setIsSidebarOpen(false);
        };
        window.addEventListener('resize', handleResize);
        // Set initial state
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const doctorAvatar =
        doctor?.avatarUrl ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
            doctor?.fullName || "Doctor"
        )}&background=082B68&color=fff`;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                width: "100%",
                height: "100%",
                overflow: "hidden",
                background: "#f5f8fa",
                color: "#0f172a",
                fontFamily:
                    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
        >
            {/* =========================================================
                FIXED TOP HEADER
            ========================================================= */}
            <header
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${HEADER_HEIGHT}px`,
                    zIndex: 2000,

                    display: "flex",
                    alignItems: "center",

                    background: "#ffffff",
                    borderBottom: "1px solid #e5edf2",
                    boxShadow: "0 1px 8px rgba(15, 23, 42, 0.04)",

                    padding: "0 24px",
                    boxSizing: "border-box",

                    isolation: "isolate",
                }}
            >

                {/* Mobile Hamburger Menu */}
                {isMobile && (
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.25rem',
                            color: '#0f172a',
                            padding: '0.5rem',
                            marginRight: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <i className={`fa-solid ${isSidebarOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
                    </button>
                )}
                
                {/* =====================================================
                    LOGO
                ===================================================== */}
                <div
                    onClick={() => navigate("/")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            navigate("/");
                        }
                    }}
                    style={{
                        width: isMobile ? "auto" : `${SIDEBAR_WIDTH - 8}px`,
                        minWidth: isMobile ? "auto" : `${SIDEBAR_WIDTH - 8}px`,

                        height: "100%",

                        display: "flex",
                        alignItems: "center",

                        cursor: "pointer",
                        paddingLeft: "4px",

                        boxSizing: "border-box",
                    }}
                >
                    <img
                        src="/images/logo.png"
                        alt="Doctors Vedika"
                        style={{
                            display: "block",
                            height: "44px",
                            width: "auto",
                            maxWidth: isMobile ? "120px" : "180px",
                            objectFit: "contain",
                        }}
                        onError={(e) => {
                            e.currentTarget.style.display = "none";

                            const fallback =
                                e.currentTarget.parentElement?.querySelector(
                                    ".logo-fallback"
                                );

                            if (fallback) {
                                fallback.style.display = "flex";
                            }
                        }}
                    />

                    {/* Logo fallback */}
                    <div
                        className="logo-fallback"
                        style={{
                            display: "none",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <div
                            style={{
                                width: "38px",
                                height: "38px",
                                borderRadius: "10px",

                                background:
                                    "linear-gradient(135deg, #082B68, #08AEB8)",

                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",

                                flexShrink: 0,
                            }}
                        >
                            <i
                                className="fa-solid fa-stethoscope"
                                style={{
                                    color: "#ffffff",
                                    fontSize: "1.1rem",
                                }}
                            />
                        </div>

                        <div>
                            <div
                                style={{
                                    fontWeight: 800,
                                    fontSize: "0.88rem",
                                    color: "#082B68",
                                    lineHeight: 1.1,
                                }}
                            >
                                DOCTORS
                            </div>

                            <div
                                style={{
                                    fontWeight: 800,
                                    fontSize: "0.88rem",
                                    color: "#08AEB8",
                                    lineHeight: 1.1,
                                }}
                            >
                                VEDIKA
                            </div>
                        </div>
                    </div>
                </div>

                {/* =====================================================
                    SEARCH
                ===================================================== */}
                {!isMobile && (
                    <div
                        style={{
                            flex: "0 1 470px",
                            minWidth: "220px",
                            position: "relative",
                        }}
                    >
                        <i
                            className="fa-solid fa-magnifying-glass"
                        style={{
                            position: "absolute",
                            left: "15px",
                            top: "50%",
                            transform: "translateY(-50%)",

                            color: "#94a3b8",
                            fontSize: "0.85rem",

                            pointerEvents: "none",
                            zIndex: 1,
                        }}
                    />

                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        {...(onSearchChange !== undefined
                            ? {
                                value: searchValue,
                                onChange: onSearchChange,
                            }
                            : {
                                defaultValue: searchValue,
                            })}
                        style={{
                            width: "100%",
                            height: "42px",

                            padding: "0 16px 0 40px",

                            border: "1px solid #dfe7ee",
                            borderRadius: "22px",

                            background: "#f8fafc",
                            color: "#334155",

                            fontSize: "0.88rem",
                            fontWeight: 400,

                            outline: "none",
                            boxSizing: "border-box",

                            transition:
                                "border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "#08AEB8";
                            e.currentTarget.style.background = "#ffffff";
                            e.currentTarget.style.boxShadow =
                                "0 0 0 3px rgba(8, 174, 184, 0.08)";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "#dfe7ee";
                            e.currentTarget.style.background = "#f8fafc";
                            e.currentTarget.style.boxShadow = "none";
                        }}
                    />
                </div>
                )}

                {/* Flexible header spacing */}
                <div
                    style={{
                        flex: 1,
                        minWidth: "20px",
                    }}
                />

                {/* =====================================================
                    HEADER RIGHT SIDE
                ===================================================== */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        flexShrink: 0,
                    }}
                >
                    {/* Notification */}
                    <button
                        type="button"
                        aria-label="Notifications"
                        style={{
                            position: "relative",

                            width: "38px",
                            height: "38px",

                            border: "none",
                            background: "transparent",
                            borderRadius: "50%",

                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",

                            cursor: "pointer",
                        }}
                    >
                        <i
                            className="fa-regular fa-bell"
                            style={{
                                fontSize: "1.15rem",
                                color: "#64748b",
                            }}
                        />

                        <span
                            style={{
                                position: "absolute",
                                top: "2px",
                                right: "1px",

                                width: "16px",
                                height: "16px",

                                borderRadius: "50%",
                                background: "#ef4444",

                                color: "#ffffff",
                                fontSize: "0.58rem",
                                fontWeight: 700,

                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",

                                border: "2px solid #ffffff",
                                boxSizing: "border-box",
                            }}
                        >
                            3
                        </span>
                    </button>

                    {/* Help */}
                    <button
                        type="button"
                        aria-label="Help"
                        style={{
                            width: "36px",
                            height: "36px",

                            borderRadius: "50%",
                            border: "1px solid #e2e8f0",

                            background: "#ffffff",

                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",

                            cursor: "pointer",
                            color: "#64748b",
                        }}
                    >
                        <i
                            className="fa-regular fa-circle-question"
                            style={{
                                fontSize: "1rem",
                            }}
                        />
                    </button>

                    {/* Doctor profile */}
                    <div style={{ position: "relative" }}>
                        <button
                            type="button"
                            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                            style={{
                                display: "flex",
                            alignItems: "center",
                            gap: "10px",

                            minWidth: isMobile ? "auto" : "235px",
                            maxWidth: isMobile ? "140px" : "none",
                            height: "46px",

                            padding: "4px",

                            borderRadius: "50%",
                            border: "1px solid #e1e8ee",

                            background: "#f8fafc",

                            cursor: "pointer",
                            boxSizing: "border-box",
                        }}
                    >
                        <img
                            src={doctorAvatar}
                            alt="Doctor"
                            style={{
                                width: "38px",
                                height: "38px",

                                borderRadius: "50%",
                                objectFit: "cover",

                                flexShrink: 0,
                            }}
                        />
                    </button>

                    {/* Dropdown Menu */}
                    {profileMenuOpen && (
                        <>
                            <div 
                                onClick={() => setProfileMenuOpen(false)}
                                style={{ position: "fixed", inset: 0, zIndex: 2001 }}
                            />
                            <div
                                style={{
                                    position: "absolute",
                                    top: "calc(100% + 10px)",
                                    right: 0,
                                    width: "240px",
                                    background: "#fff",
                                    borderRadius: "16px",
                                    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
                                    border: "1px solid #e2e8f0",
                                    zIndex: 2002,
                                    overflow: "hidden",
                                    animation: "slideUp 0.2s ease"
                                }}
                            >
                                <div style={{ padding: "16px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {doctor?.fullName || "Doctor"}
                                    </div>
                                    <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {doctor?.specialization || "Cardiologist"}
                                    </div>
                                </div>
                                <div style={{ padding: "8px 0" }}>
                                    <button 
                                        onClick={() => { setProfileMenuOpen(false); navigate("/profile"); }}
                                        style={{ width: "100%", textAlign: "left", padding: "12px 20px", background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "#334155", display: "flex", alignItems: "center", gap: 12 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#08AEB8"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#334155"; }}
                                    >
                                        <i className="fa-regular fa-user" style={{ width: 16 }} /> Profile
                                    </button>
                                    <button 
                                        onClick={() => { setProfileMenuOpen(false); navigate("/settings"); }}
                                        style={{ width: "100%", textAlign: "left", padding: "12px 20px", background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "#334155", display: "flex", alignItems: "center", gap: 12 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#08AEB8"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#334155"; }}
                                    >
                                        <i className="fa-solid fa-gear" style={{ width: 16 }} /> Settings
                                    </button>
                                    <div style={{ margin: "4px 0", height: 1, background: "#f1f5f9" }} />
                                    <button 
                                        onClick={() => { setProfileMenuOpen(false); logout && logout(); }}
                                        style={{ width: "100%", textAlign: "left", padding: "12px 20px", background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "#ef4444", display: "flex", alignItems: "center", gap: 12 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.05)"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                                    >
                                        <i className="fa-solid fa-arrow-right-from-bracket" style={{ width: 16 }} /> Logout
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                    </div>
                </div>
            </header>

            {/* =========================================================
                FIXED SIDEBAR AREA
            ========================================================= */}
            {isMobile && isSidebarOpen && (
                <div 
                    onClick={() => setIsSidebarOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        zIndex: 1400
                    }}
                />
            )}

            <aside
                style={{
                    position: "fixed",

                    top: `${HEADER_HEIGHT}px`,
                    left: isMobile ? (isSidebarOpen ? 0 : `-${SIDEBAR_WIDTH}px`) : 0,
                    bottom: 0,

                    width: `${SIDEBAR_WIDTH}px`,

                    zIndex: 1500,

                    background: "#ffffff",
                    borderRight: "1px solid #e5edf2",

                    overflow: "hidden",

                    boxSizing: "border-box",

                    display: "flex",
                    flexDirection: "column",

                    isolation: "isolate",
                    transition: 'left 0.3s ease'
                }}
            >
                <Sidebar
                    activePage={activePage}
                    dashboardTab={dashboardTab}
                    onDashboardTab={onDashboardTab}
                    patientView={patientView}
                    onPatientView={onPatientView}
                    fetchPatients={fetchPatients}
                />
            </aside>

            {/* =========================================================
                MAIN APPLICATION AREA
            ========================================================= */}

            <main
                style={{
                    position: "fixed",

                    top: `${HEADER_HEIGHT}px`,
                    left: isMobile ? 0 : `${SIDEBAR_WIDTH}px`,
                    right: 0,
                    bottom: 0,

                    width: isMobile ? "100%" : `calc(100% - ${SIDEBAR_WIDTH}px)`,
                    height: `calc(100dvh - ${HEADER_HEIGHT}px)`,

                    overflowX: "hidden",
                    overflowY:
                        activePage === "profile" && !isMobile ? "hidden" : "auto",

                    background: "#f5f8fa",

                    boxSizing: "border-box",

                    padding:
                        activePage === "profile"
                            ? (isMobile ? "16px" : "24px 28px")
                            : (isMobile ? "16px" : "28px 32px"),

                    WebkitOverflowScrolling: "touch",

                    isolation: "isolate",
                }}
            >
                {/* Inner content wrapper prevents horizontal overflow */}
                <div
                    style={{
                        width: "100%",
                        maxWidth: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                        minHeight: "100%",
                        display: "flex",
                        flexDirection: "column"
                    }}
                >
                    {children}
                </div>
            </main>
        </div>
    );
}