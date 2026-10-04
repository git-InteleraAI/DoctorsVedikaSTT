import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar({
    activePage = "dashboard",
    dashboardTab = "confirmed",
    onDashboardTab,
    patientView = "search",
    onPatientView,
    fetchPatients,
}) {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout, doctor } = useAuth();

    const isAdminMode =
        location.pathname === "/admin" ||
        location.pathname.startsWith("/admin/") ||
        location.pathname === "/hospital-admin" ||
        location.pathname.startsWith("/hospital-admin/");

    const isStaffMode =
        location.pathname === "/staff" ||
        location.pathname.startsWith("/staff/");

    const adminSubTab = useMemo(() => {
        const p = location.pathname;
        if (p.includes("/doctors")) return "doctors";
        if (p.includes("/staff")) return "staff";
        if (p.includes("/hospital")) return "hospital";
        if (p.includes("/settings")) return "settings";
        if (p.includes("/audit")) return "audit";
        return "dashboard";
    }, [location.pathname]);

    const staffSubTab = useMemo(() => {
        const p = location.pathname;
        if (p.includes("/patients")) return "patients";
        if (p.includes("/appointments")) return "appointments";
        if (p.includes("/check-in")) return "check-in";
        if (p.includes("/queue")) return "queue";
        if (p.includes("/profile")) return "profile";
        if (p.includes("/settings")) return "settings";
        return "dashboard";
    }, [location.pathname]);

    /*
     * ============================================================
     * CURRENT SECTION
     *
     * The URL is the primary source of truth.
     * activePage is used only for routes where the URL itself
     * does not explicitly identify the section.
     * ============================================================
     */
    const currentSection = useMemo(() => {
        const path = location.pathname;

        if (path === "/appointments" || path.startsWith("/appointments/")) {
            return "appointments";
        }

        if (path === "/patients" || path.startsWith("/patients/")) {
            return "patients";
        }

        if (path === "/availability" || path.startsWith("/availability/")) {
            return "availability";
        }

        if (path === "/videos" || path.startsWith("/videos/")) {
            return "videos";
        }

        if (path === "/qna" || path.startsWith("/qna/")) {
            return "qna";
        }

        if (path === "/staff" || path.startsWith("/staff/")) {
            return "staff";
        }

        if (path === "/admin" || path.startsWith("/admin/")) {
            return "admin";
        }

        if (path === "/profile" || path.startsWith("/profile/")) {
            return "profile";
        }

        if (path === "/settings" || path.startsWith("/settings/")) {
            return "settings";
        }

        if (path === "/dashboard" || path.startsWith("/dashboard/")) {
            return "dashboard";
        }

        /*
         * For consultation or other nested pages where the sidebar
         * receives activePage from the parent, preserve that value.
         */
        return activePage || "dashboard";
    }, [location.pathname, activePage]);

    /*
     * ============================================================
     * DROPDOWN STATE
     *
     * Only ONE section can be open at a time.
     *
     * This replaces the old:
     *   isAppointmentsOpen
     *   isPatientsOpen
     *
     * This prevents conflicting state updates during navigation.
     * ============================================================
     */
    const [openSection, setOpenSection] = useState(() => {
        if (
            location.pathname === "/appointments" ||
            location.pathname.startsWith("/appointments/")
        ) {
            return "appointments";
        }

        if (
            location.pathname === "/patients" ||
            location.pathname.startsWith("/patients/")
        ) {
            return "patients";
        }

        if (activePage === "appointments") {
            return "appointments";
        }

        if (activePage === "patients") {
            return "patients";
        }

        return null;
    });

    const [hoveredItem, setHoveredItem] = useState(null);

    /*
     * ============================================================
     * SYNCHRONIZE DROPDOWN ONLY AFTER ROUTE/SECTION CHANGES
     *
     * IMPORTANT:
     * Navigation click handlers do NOT close the dropdown first.
     *
     * The route changes first, then this effect updates the
     * appropriate open section.
     * ============================================================
     */
    useEffect(() => {
        if (currentSection === "appointments") {
            setOpenSection("appointments");
            return;
        }

        if (currentSection === "patients") {
            setOpenSection("patients");
            return;
        }

        /*
         * For all other primary pages, close dropdowns after the
         * new route has become active.
         */
        setOpenSection(null);
    }, [currentSection]);

    /*
     * ============================================================
     * ACTIVE PAGE DETECTION
     * ============================================================
     */

    const isDashboard =
        currentSection === "dashboard" ||
        activePage === "dashboard";

    const isAppointments =
        currentSection === "appointments" ||
        activePage === "appointments";

    const isPatients =
        currentSection === "patients" ||
        activePage === "patients";

    const isAvailability =
        currentSection === "availability" ||
        activePage === "availability";

    const isVideos =
        currentSection === "videos" ||
        activePage === "videos";

    const isQna =
        currentSection === "qna" ||
        activePage === "qna";

    const isProfile =
        currentSection === "profile" ||
        activePage === "profile";

    const isSettings =
        currentSection === "settings" ||
        activePage === "settings";

    const isAdmin =
        currentSection === "admin" ||
        activePage === "admin";

    const isStaff =
        currentSection === "staff" ||
        activePage === "staff";

    const isAppointmentsOpen = openSection === "appointments";
    const isPatientsOpen = openSection === "patients";

    /*
     * ============================================================
     * APPOINTMENT NAVIGATION
     * ============================================================
     */
    const goTab = (tab) => {
        /*
         * If already on Appointments, only update the query.
         */
        if (currentSection === "appointments") {
            navigate(`/appointments?tab=${tab}`);
            return;
        }

        /*
         * If dashboard owns appointment tabs, preserve that behavior.
         */
        if (
            currentSection === "dashboard" &&
            onDashboardTab
        ) {
            onDashboardTab(tab);
            return;
        }

        /*
         * Otherwise navigate to Appointments.
         */
        navigate(`/appointments?tab=${tab}`);
    };

    /*
     * ============================================================
     * PATIENT NAVIGATION
     * ============================================================
     */
    const goPatientView = (view) => {
        /*
         * If already on Patients, use the parent's existing
         * patient-view handler.
         */
        if (
            currentSection === "patients" &&
            onPatientView
        ) {
            onPatientView(view);

            if (
                view === "search" &&
                fetchPatients
            ) {
                fetchPatients("");
            }

            return;
        }

        /*
         * Navigate to the existing Patients page.
         */
        navigate("/patients");
    };

    /*
     * ============================================================
     * LOGOUT
     * ============================================================
     */
    const handleLogout = () => {
        if (logout) {
            logout();
        }

        navigate("/login");
    };

    /*
     * ============================================================
     * COLORS
     * ============================================================
     */
    const COLORS = {
        navy: "#0f172a",
        cyan: "#01b6af",
        text: "#e2e8f0",
        muted: "#94A3B8",
        border: "rgba(255, 255, 255, 0.05)",
        submenuBorder: "rgba(255, 255, 255, 0.05)",
        red: "#EF4444",
        green: "#10B981",
        orange: "#F59E0B",
    };

    /*
     * ============================================================
     * PRIMARY NAVIGATION STYLE
     * ============================================================
     */
    const primaryStyle = (active, itemKey) => {
        const hovered = hoveredItem === itemKey;

        return {
            width: "100%",
            minHeight: 44,

            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",

            boxSizing: "border-box",

            padding: "10px 12px",

            border: "none",
            borderRadius: 10,

            background: active
                ? "linear-gradient(135deg, #01b6af 0%, #0ea5e9 100%)"
                : hovered
                    ? "rgba(255, 255, 255, 0.05)"
                    : "transparent",

            color: active
                ? "#FFFFFF"
                : COLORS.text,

            cursor: "pointer",

            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: active ? 700 : 600,

            textAlign: "left",

            transition:
                "background 0.18s ease, color 0.18s ease",

            outline: "none",
        };
    };

    /*
     * ============================================================
     * SUBMENU STYLE
     * ============================================================
     */
    const submenuStyle = (active, theme, itemKey) => {
        const hovered = hoveredItem === itemKey;

        const themes = {
            cyan: {
                color: COLORS.cyan,
                background: "rgba(1, 182, 175, 0.15)",
            },

            orange: {
                color: COLORS.orange,
                background: "rgba(245,158,11,0.10)",
            },

            green: {
                color: COLORS.green,
                background: "rgba(16,185,129,0.10)",
            },
        };

        const selected =
            themes[theme] || themes.cyan;

        return {
            width: "100%",
            minHeight: 38,

            display: "flex",
            alignItems: "center",

            gap: 9,

            boxSizing: "border-box",

            padding: "8px 10px",

            border: "none",
            borderRadius: 8,

            background: active
                ? selected.background
                : hovered
                    ? "rgba(255, 255, 255, 0.05)"
                    : "transparent",

            color: active
                ? selected.color
                : COLORS.muted,

            cursor: "pointer",

            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: active ? 700 : 500,

            textAlign: "left",

            transition:
                "background 0.18s ease, color 0.18s ease",

            outline: "none",
        };
    };

    /*
     * ============================================================
     * PRIMARY BUTTON
     * ============================================================
     */
    const PrimaryButton = ({
        itemKey,
        active,
        iconClass,
        children,
        onClick,
        rightIcon,
        rightIconStyle = {},
    }) => {
        return (
            <button
                type="button"
                onClick={onClick}
                onMouseEnter={() =>
                    setHoveredItem(itemKey)
                }
                onMouseLeave={() =>
                    setHoveredItem(null)
                }
                style={primaryStyle(
                    active,
                    itemKey
                )}
            >
                <span
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        minWidth: 0,
                    }}
                >
                    <span
                        style={{
                            width: 20,
                            minWidth: 20,
                            height: 20,

                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",

                            fontSize: 15,

                            color: active
                                ? "#FFFFFF"
                                : COLORS.cyan,
                        }}
                    >
                        <i className={iconClass} />
                    </span>

                    <span
                        style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {children}
                    </span>
                </span>

                {rightIcon && (
                    <i
                        className={rightIcon}
                        style={{
                            fontSize: 10,
                            opacity: active
                                ? 0.95
                                : 0.55,
                            flexShrink: 0,
                            ...rightIconStyle,
                        }}
                    />
                )}
            </button>
        );
    };

    /*
     * ============================================================
     * SUBMENU BUTTON
     * ============================================================
     */
    const SubmenuButton = ({
        itemKey,
        active,
        theme,
        iconClass,
        children,
        onClick,
    }) => {
        const iconColors = {
            cyan: COLORS.cyan,
            orange: COLORS.orange,
            green: COLORS.green,
        };

        return (
            <button
                type="button"
                onClick={onClick}
                onMouseEnter={() =>
                    setHoveredItem(itemKey)
                }
                onMouseLeave={() =>
                    setHoveredItem(null)
                }
                style={submenuStyle(
                    active,
                    theme,
                    itemKey
                )}
            >
                <span
                    style={{
                        width: 18,
                        minWidth: 18,

                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",

                        fontSize: 12,

                        color: active
                            ? iconColors[theme]
                            : "#94A3B8",
                    }}
                >
                    <i className={iconClass} />
                </span>

                <span
                    style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {children}
                </span>
            </button>
        );
    };

    /*
     * ============================================================
     * RENDER
     * ============================================================
     */
    return (
        <>
            <style>
                {`
                    .dv-sidebar-nav {
                        scrollbar-width: thin;
                        scrollbar-color: #D9E5EA transparent;
                    }

                    .dv-sidebar-nav::-webkit-scrollbar {
                        width: 4px;
                    }

                    .dv-sidebar-nav::-webkit-scrollbar-track {
                        background: transparent;
                    }

                    .dv-sidebar-nav::-webkit-scrollbar-thumb {
                        background: #D9E5EA;
                        border-radius: 10px;
                    }

                    .dv-sidebar button:focus-visible {
                        outline: none;
                        box-shadow:
                            0 0 0 2px #FFFFFF,
                            0 0 0 4px rgba(8,174,184,0.35);
                    }

                    .dv-upgrade-card {
                        transition:
                            transform 0.18s ease,
                            box-shadow 0.18s ease;
                    }

                    .dv-upgrade-card:hover {
                        transform: translateY(-1px);
                        box-shadow:
                            0 8px 24px rgba(8,43,104,0.14);
                    }

                    .dv-logout:hover {
                        background: rgba(239,68,68,0.06) !important;
                    }
                `}
            </style>

            <aside
                className="dv-sidebar"
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    boxSizing: "border-box",

                    background: "transparent",

                    display: "flex",
                    flexDirection: "column",

                    padding: "16px 14px 14px",

                    overflow: "hidden",
                }}
            >
                {/* =====================================================
                    SCROLLABLE NAVIGATION
                ===================================================== */}

                <nav
                    className="dv-sidebar-nav"
                    aria-label="Doctor portal navigation"
                    style={{
                        flex: "1 1 auto",
                        minHeight: 0,

                        overflowY: "auto",
                        overflowX: "hidden",

                        paddingRight: 2,
                    }}
                >
                    <ul
                        style={{
                            listStyle: "none",
                            margin: 0,
                            padding: 0,

                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                        }}
                    >
                        {isAdminMode ? (
                            <>
                                {/* Workspace Header */}
                                <div style={{ padding: "4px 8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "8px" }}>
                                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#ffffff", letterSpacing: "0.02em" }}>
                                        Doctors Vedika
                                    </div>
                                    <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#01b6af", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>
                                        Hospital Administration
                                    </div>
                                </div>

                                {/* Dashboard */}
                                <li>
                                    <PrimaryButton
                                        itemKey="admin-dashboard"
                                        active={adminSubTab === "dashboard"}
                                        iconClass="fa-solid fa-chart-pie"
                                        onClick={() => navigate("/admin")}
                                    >
                                        Dashboard
                                    </PrimaryButton>
                                </li>

                                {/* Hospital Management Group */}
                                <li style={{ marginTop: "12px", padding: "6px 12px 2px", fontSize: "0.68rem", fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                    Hospital Management
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="admin-doctors"
                                        active={adminSubTab === "doctors"}
                                        iconClass="fa-solid fa-user-md"
                                        onClick={() => navigate("/admin/doctors")}
                                    >
                                        Doctors
                                    </PrimaryButton>
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="admin-staff"
                                        active={adminSubTab === "staff"}
                                        iconClass="fa-solid fa-users-gear"
                                        onClick={() => navigate("/admin/staff")}
                                    >
                                        Staff
                                    </PrimaryButton>
                                </li>

                                {/* Hospital Group */}
                                <li style={{ marginTop: "12px", padding: "6px 12px 2px", fontSize: "0.68rem", fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                    Hospital
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="admin-hospital"
                                        active={adminSubTab === "hospital"}
                                        iconClass="fa-solid fa-hospital"
                                        onClick={() => navigate("/admin/hospital")}
                                    >
                                        Hospital Profile
                                    </PrimaryButton>
                                </li>

                                {/* Administration Group */}
                                <li style={{ marginTop: "12px", padding: "6px 12px 2px", fontSize: "0.68rem", fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                    Administration
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="admin-settings"
                                        active={adminSubTab === "settings"}
                                        iconClass="fa-solid fa-sliders"
                                        onClick={() => navigate("/admin/settings")}
                                    >
                                        Settings
                                    </PrimaryButton>
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="admin-audit"
                                        active={adminSubTab === "audit"}
                                        iconClass="fa-solid fa-file-invoice"
                                        onClick={() => navigate("/admin/audit")}
                                    >
                                        Audit Logs
                                    </PrimaryButton>
                                </li>
                            </>
                        ) : isStaffMode ? (
                            <>
                                {/* Workspace Header */}
                                <div style={{ padding: "4px 8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "8px" }}>
                                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#ffffff", letterSpacing: "0.02em" }}>
                                        Doctors Vedika
                                    </div>
                                    <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#01b6af", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>
                                        Staff Operations
                                    </div>
                                </div>

                                {/* Dashboard */}
                                <li>
                                    <PrimaryButton
                                        itemKey="staff-dashboard"
                                        active={staffSubTab === "dashboard"}
                                        iconClass="fa-solid fa-chart-line"
                                        onClick={() => navigate("/staff")}
                                    >
                                        Dashboard
                                    </PrimaryButton>
                                </li>

                                {/* Patient Operations Group */}
                                <li style={{ marginTop: "12px", padding: "6px 12px 2px", fontSize: "0.68rem", fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                    Patient Operations
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="staff-patients"
                                        active={staffSubTab === "patients"}
                                        iconClass="fa-solid fa-hospital-user"
                                        onClick={() => navigate("/staff/patients")}
                                    >
                                        Patients
                                    </PrimaryButton>
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="staff-appointments"
                                        active={staffSubTab === "appointments"}
                                        iconClass="fa-solid fa-calendar-check"
                                        onClick={() => navigate("/staff/appointments")}
                                    >
                                        Appointments
                                    </PrimaryButton>
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="staff-checkin"
                                        active={staffSubTab === "check-in"}
                                        iconClass="fa-solid fa-user-check"
                                        onClick={() => navigate("/staff/check-in")}
                                    >
                                        Check-in
                                    </PrimaryButton>
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="staff-queue"
                                        active={staffSubTab === "queue"}
                                        iconClass="fa-solid fa-list-ol"
                                        onClick={() => navigate("/staff/queue")}
                                    >
                                        Queue
                                    </PrimaryButton>
                                </li>

                                {/* Account Group */}
                                <li style={{ marginTop: "12px", padding: "6px 12px 2px", fontSize: "0.68rem", fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                    Account
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="staff-profile"
                                        active={staffSubTab === "profile"}
                                        iconClass="fa-solid fa-id-card"
                                        onClick={() => navigate("/staff/profile")}
                                    >
                                        Profile
                                    </PrimaryButton>
                                </li>
                                <li>
                                    <PrimaryButton
                                        itemKey="staff-settings"
                                        active={staffSubTab === "settings"}
                                        iconClass="fa-solid fa-sliders"
                                        onClick={() => navigate("/staff/settings")}
                                    >
                                        Settings
                                    </PrimaryButton>
                                </li>
                            </>
                        ) : (
                            <>
                                {/* =================================================
                                    DOCTOR PORTAL NAVIGATION
                                ================================================= */}

                                <li>
                                    <PrimaryButton
                                        itemKey="dashboard"
                                        active={isDashboard}
                                        iconClass="fa-solid fa-house"
                                        onClick={() => {
                                            if (location.pathname === "/dashboard") return;
                                            navigate("/dashboard");
                                        }}
                                    >
                                        Dashboard
                                    </PrimaryButton>
                                </li>

                                <li>
                                    <PrimaryButton
                                        itemKey="appointments"
                                        active={isAppointments}
                                        iconClass="fa-solid fa-calendar-days"
                                        rightIcon="fa-solid fa-chevron-down"
                                        rightIconStyle={{
                                            transform:
                                                isAppointmentsOpen
                                                    ? "rotate(180deg)"
                                                    : "rotate(0deg)",

                                            transition:
                                                "transform 0.25s ease-in-out",
                                        }}
                                        onClick={() => {
                                            if (
                                                currentSection !==
                                                "appointments"
                                            ) {
                                                navigate(
                                                    "/appointments"
                                                );
                                                return;
                                            }

                                            setOpenSection(
                                                (current) =>
                                                    current ===
                                                        "appointments"
                                                        ? null
                                                        : "appointments"
                                            );
                                        }}
                                    >
                                        Appointments
                                    </PrimaryButton>

                                    <div
                                        style={{
                                            maxHeight:
                                                isAppointmentsOpen
                                                    ? "140px"
                                                    : "0px",

                                            opacity:
                                                isAppointmentsOpen
                                                    ? 1
                                                    : 0,

                                            overflow: "hidden",

                                            transition:
                                                "max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease-in-out, margin 0.28s ease-in-out",

                                            margin:
                                                isAppointmentsOpen
                                                    ? "3px 0 5px 21px"
                                                    : "0 0 0 21px",

                                            paddingLeft: 12,

                                            borderLeft:
                                                `1px solid ${COLORS.submenuBorder}`,

                                            pointerEvents:
                                                isAppointmentsOpen
                                                    ? "auto"
                                                    : "none",

                                            visibility:
                                                isAppointmentsOpen
                                                    ? "visible"
                                                    : "hidden",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection:
                                                    "column",
                                                gap: 2,
                                            }}
                                        >
                                            <SubmenuButton
                                                itemKey="confirmed"
                                                theme="cyan"
                                                active={
                                                    (isAppointments ||
                                                        isDashboard) &&
                                                    (
                                                        dashboardTab ===
                                                        "confirmed" ||
                                                        location.search.includes(
                                                            "tab=confirmed"
                                                        )
                                                    )
                                                }
                                                iconClass="fa-solid fa-calendar-check"
                                                onClick={() =>
                                                    goTab(
                                                        "confirmed"
                                                    )
                                                }
                                            >
                                                Upcoming / Confirmed
                                            </SubmenuButton>

                                            <SubmenuButton
                                                itemKey="completed"
                                                theme="green"
                                                active={
                                                    (isAppointments ||
                                                        isDashboard) &&
                                                    (
                                                        dashboardTab ===
                                                        "completed" ||
                                                        location.search.includes(
                                                            "tab=completed"
                                                        )
                                                    )
                                                }
                                                iconClass="fa-solid fa-circle-check"
                                                onClick={() =>
                                                    goTab(
                                                        "completed"
                                                    )
                                                }
                                            >
                                                Completed
                                            </SubmenuButton>
                                        </div>
                                    </div>
                                </li>

                                <li>
                                    <PrimaryButton
                                        itemKey="patients"
                                        active={
                                            isPatients &&
                                            isPatientsOpen
                                        }
                                        iconClass="fa-solid fa-user-group"
                                        rightIcon="fa-solid fa-chevron-down"
                                        rightIconStyle={{
                                            transform:
                                                isPatientsOpen
                                                    ? "rotate(180deg)"
                                                    : "rotate(0deg)",

                                            transition:
                                                "transform 0.25s ease-in-out",
                                        }}
                                        onClick={() => {
                                            if (
                                                currentSection !==
                                                "patients"
                                            ) {
                                                navigate("/patients");
                                                return;
                                            }

                                            setOpenSection(
                                                (current) =>
                                                    current ===
                                                        "patients"
                                                        ? null
                                                        : "patients"
                                            );
                                        }}
                                    >
                                        Patients
                                    </PrimaryButton>

                                    <div
                                        style={{
                                            maxHeight:
                                                isPatientsOpen
                                                    ? "140px"
                                                    : "0px",

                                            opacity:
                                                isPatientsOpen
                                                    ? 1
                                                    : 0,

                                            overflow: "hidden",

                                            transition:
                                                "max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease-in-out, margin 0.28s ease-in-out",

                                            margin:
                                                isPatientsOpen
                                                    ? "3px 0 5px 21px"
                                                    : "0 0 0 21px",

                                            paddingLeft: 12,

                                            borderLeft:
                                                `1px solid ${COLORS.submenuBorder}`,

                                            pointerEvents:
                                                isPatientsOpen
                                                    ? "auto"
                                                    : "none",

                                            visibility:
                                                isPatientsOpen
                                                    ? "visible"
                                                    : "hidden",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection:
                                                    "column",
                                                gap: 2,
                                            }}
                                        >
                                            <SubmenuButton
                                                itemKey="directory"
                                                theme="cyan"
                                                active={
                                                    isPatients &&
                                                    (
                                                        patientView ===
                                                        "search" ||
                                                        patientView ===
                                                        "profile"
                                                    )
                                                }
                                                iconClass="fa-solid fa-magnifying-glass"
                                                onClick={() =>
                                                    goPatientView(
                                                        "search"
                                                    )
                                                }
                                            >
                                                Directory
                                            </SubmenuButton>

                                            <SubmenuButton
                                                itemKey="walkin"
                                                theme="orange"
                                                active={
                                                    isPatients &&
                                                    patientView ===
                                                    "walkin"
                                                }
                                                iconClass="fa-solid fa-user-plus"
                                                onClick={() =>
                                                    goPatientView(
                                                        "walkin"
                                                    )
                                                }
                                            >
                                                Add Walk-in
                                            </SubmenuButton>
                                        </div>
                                    </div>
                                </li>

                                <li>
                                    <PrimaryButton
                                        itemKey="availability"
                                        active={isAvailability}
                                        iconClass="fa-solid fa-clock"
                                        onClick={() => {
                                            if (
                                                location.pathname ===
                                                "/availability"
                                            ) {
                                                return;
                                            }

                                            navigate(
                                                "/availability"
                                            );
                                        }}
                                    >
                                        Availability
                                    </PrimaryButton>
                                </li>

                                <li>
                                    <PrimaryButton
                                        itemKey="videos"
                                        active={isVideos}
                                        iconClass="fa-solid fa-circle-play"
                                        onClick={() => {
                                            if (
                                                location.pathname ===
                                                "/videos"
                                            ) {
                                                return;
                                            }

                                            navigate("/videos");
                                        }}
                                    >
                                        Videos & Shorts
                                    </PrimaryButton>
                                </li>

                                <li>
                                    <PrimaryButton
                                        itemKey="qna"
                                        active={isQna}
                                        iconClass="fa-solid fa-circle-question"
                                        onClick={() => {
                                            if (
                                                location.pathname ===
                                                "/qna"
                                            ) {
                                                return;
                                            }

                                            navigate("/qna");
                                        }}
                                    >
                                        Q&A
                                    </PrimaryButton>
                                </li>

                                <li>
                                    <PrimaryButton
                                        itemKey="profile"
                                        active={isProfile}
                                        iconClass="fa-solid fa-user"
                                        onClick={() => {
                                            if (
                                                location.pathname ===
                                                "/profile"
                                            ) {
                                                return;
                                            }

                                            navigate("/profile");
                                        }}
                                    >
                                        Profile
                                    </PrimaryButton>
                                </li>
                            </>
                        )}
                    </ul>
                </nav>

                {/* =========================================================
                    FIXED BOTTOM NAVIGATION
                ========================================================= */}

                <div
                    style={{
                        flexShrink: 0,
                        paddingTop: 10,
                    }}
                >
                    <div
                        style={{
                            height: 1,
                            background:
                                COLORS.border,
                            margin:
                                "0 4px 9px",
                        }}
                    />

                    {/* =================================================
                        SETTINGS
                    ================================================= */}

                    <PrimaryButton
                        itemKey="settings"
                        active={isAdminMode ? adminSubTab === "settings" : isSettings}
                        iconClass="fa-solid fa-gear"
                        onClick={() => {
                            if (isAdminMode) {
                                navigate("/hospital-admin/settings");
                                return;
                            }
                            if (
                                location.pathname ===
                                "/settings"
                            ) {
                                return;
                            }

                            navigate("/settings");
                        }}
                    >
                        Settings
                    </PrimaryButton>

                    {/* =================================================
                        LOGOUT
                    ================================================= */}

                    <button
                        type="button"
                        className="dv-logout"
                        onClick={handleLogout}
                        style={{
                            display: "flex",
                            alignItems: "center",

                            width: "100%",
                            minHeight: 44,

                            marginTop: 3,

                            padding: "10px 12px",

                            border: "none",
                            borderRadius: 10,

                            background:
                                "transparent",

                            color: COLORS.red,

                            cursor: "pointer",

                            fontFamily:
                                "inherit",

                            fontSize: 14,
                            fontWeight: 600,

                            textAlign: "left",

                            transition:
                                "background 0.18s ease",

                            outline: "none",
                        }}
                    >
                        <span
                            style={{
                                width: 20,
                                minWidth: 20,
                                height: 20,

                                display:
                                    "inline-flex",

                                alignItems:
                                    "center",

                                justifyContent:
                                    "center",

                                marginRight: 11,

                                fontSize: 15,
                            }}
                        >
                            <i className="fa-solid fa-right-from-bracket" />
                        </span>

                        Logout
                    </button>
                </div>

                {/* =========================================================
                    UPGRADE CARD (Doctor mode only)
                ========================================================= */}

                {!isAdminMode && (
                    <div
                        className="dv-upgrade-card"
                        style={{
                            flexShrink: 0,

                            marginTop: 10,

                            padding: 13,

                            borderRadius: 13,

                            background:
                                "linear-gradient(135deg, #082B68 0%, #08AEB8 100%)",

                            boxShadow:
                                "0 4px 14px rgba(8,43,104,0.08)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,

                                marginBottom: 7,
                            }}
                        >
                            <span
                                style={{
                                    width: 27,
                                    height: 27,

                                    borderRadius: 8,

                                    display:
                                        "inline-flex",

                                    alignItems:
                                        "center",

                                    justifyContent:
                                        "center",

                                    background:
                                        "rgba(255,255,255,0.14)",

                                    flexShrink: 0,
                                }}
                            >
                                <i
                                    className="fa-solid fa-star"
                                    style={{
                                        color:
                                            "#FACC15",
                                        fontSize: 12,
                                    }}
                                />
                            </span>

                            <span
                                style={{
                                    color:
                                        "#FFFFFF",
                                    fontWeight:
                                        800,
                                    fontSize: 13,
                                }}
                            >
                                Upgrade to Pro
                            </span>
                        </div>

                        <p
                            style={{
                                color:
                                    "rgba(255,255,255,0.82)",

                                fontSize: 11.5,
                                lineHeight: 1.45,

                                margin:
                                    "0 0 10px",
                            }}
                        >
                            Unlock premium features
                            and exclusive medical
                            resources.
                        </p>

                        <button
                            type="button"
                            onClick={() => {
                                // Add subscription route here later.
                            }}
                            style={{
                                width: "100%",
                                minHeight: 36,

                                padding:
                                    "8px 10px",

                                border: "none",
                                borderRadius: 8,

                                background:
                                    "#FFFFFF",

                                color:
                                    COLORS.navy,

                                fontFamily:
                                    "inherit",

                                fontSize: 12,
                                fontWeight: 800,

                                cursor: "pointer",

                                outline: "none",
                            }}
                        >
                            Upgrade Now
                        </button>
                    </div>
                )}
            </aside>
        </>
    );
}