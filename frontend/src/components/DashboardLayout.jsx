import React from "react";
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
    const { doctor } = useAuth();

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
                        width: `${SIDEBAR_WIDTH - 8}px`,
                        minWidth: `${SIDEBAR_WIDTH - 8}px`,

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
                            maxWidth: "180px",
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
                    <button
                        type="button"
                        onClick={() => navigate("/profile")}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",

                            minWidth: "235px",
                            height: "46px",

                            padding: "5px 13px 5px 6px",

                            borderRadius: "25px",
                            border: "1px solid #e1e8ee",

                            background: "#f8fafc",

                            cursor: "pointer",
                            textAlign: "left",

                            boxSizing: "border-box",
                        }}
                    >
                        <img
                            src={doctorAvatar}
                            alt="Doctor"
                            style={{
                                width: "34px",
                                height: "34px",

                                borderRadius: "50%",
                                objectFit: "cover",

                                flexShrink: 0,
                            }}
                        />

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <div
                                style={{
                                    fontWeight: 700,
                                    fontSize: "0.82rem",
                                    color: "#0f172a",
                                    lineHeight: 1.2,

                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {doctor?.fullName || "Doctor"}
                            </div>

                            <div
                                style={{
                                    fontSize: "0.69rem",
                                    color: "#64748b",
                                    lineHeight: 1.2,

                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {doctor?.specialization || "Cardiologist"}
                            </div>
                        </div>

                        <i
                            className="fa-solid fa-chevron-down"
                            style={{
                                fontSize: "0.62rem",
                                color: "#94a3b8",
                                flexShrink: 0,
                            }}
                        />
                    </button>
                </div>
            </header>

            {/* =========================================================
                FIXED SIDEBAR AREA
            ========================================================= */}

            <aside
                style={{
                    position: "fixed",

                    top: `${HEADER_HEIGHT}px`,
                    left: 0,
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
                    left: `${SIDEBAR_WIDTH}px`,
                    right: 0,
                    bottom: 0,

                    width: `calc(100% - ${SIDEBAR_WIDTH}px)`,
                    height: `calc(100vh - ${HEADER_HEIGHT}px)`,

                    overflowX: "hidden",
                    overflowY:
                        activePage === "profile" ? "hidden" : "auto",

                    background: "#f5f8fa",

                    boxSizing: "border-box",

                    padding:
                        activePage === "profile"
                            ? "24px 28px"
                            : "28px 32px",

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
                    }}
                >
                    {children}
                </div>
            </main>
        </div>
    );
}