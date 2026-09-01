import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const SIDEBAR_WIDTH = 236;
const HEADER_HEIGHT = 64;

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
    const { logout } = useAuth();

    const [isAppointmentsOpen, setIsAppointmentsOpen] =
        useState(activePage === "dashboard");

    const [isPatientsOpen, setIsPatientsOpen] =
        useState(activePage === "patients");

    const [hoveredItem, setHoveredItem] = useState(null);

    /*
     * Keep dropdowns synchronized with the page.
     */
    useEffect(() => {
        if (activePage === "dashboard") {
            setIsAppointmentsOpen(true);
        }

        if (activePage === "patients") {
            setIsPatientsOpen(true);
        }
    }, [activePage]);

    /*
     * Current page detection.
     */
    const isDashboard =
        activePage === "dashboard" ||
        location.pathname === "/dashboard";

    const isPatients =
        activePage === "patients" ||
        location.pathname === "/patients";

    const isAvailability =
        activePage === "availability" ||
        location.pathname === "/availability";

    const isVideos =
        activePage === "videos" ||
        location.pathname === "/videos";

    const isQna =
        activePage === "qna" ||
        location.pathname === "/qna";

    const isProfile =
        activePage === "profile" ||
        location.pathname === "/profile";

    const isSettings =
        activePage === "settings" ||
        location.pathname === "/settings";

    /*
     * Appointment navigation.
     */
    const goTab = (tab) => {
        if (activePage === "dashboard" && onDashboardTab) {
            onDashboardTab(tab);
            return;
        }

        navigate(`/dashboard?tab=${tab}`);
    };

    /*
     * Patient navigation.
     */
    const goPatientView = (view) => {
        if (activePage === "patients" && onPatientView) {
            onPatientView(view);

            if (view === "search" && fetchPatients) {
                fetchPatients("");
            }

            return;
        }

        navigate("/patients");
    };

    /*
     * Logout.
     */
    const handleLogout = () => {
        if (logout) {
            logout();
        }

        navigate("/login");
    };

    /*
     * Colors.
     */
    const COLORS = {
        navy: "#082B68",
        cyan: "#08AEB8",
        text: "#17233C",
        muted: "#64748B",
        border: "#E5EDF3",
        submenuBorder: "#DCE7ED",
        red: "#EF4444",
        green: "#10B981",
        orange: "#F59E0B",
    };

    /*
     * Primary navigation style.
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
                ? "linear-gradient(135deg, #082B68 0%, #08AEB8 100%)"
                : hovered
                    ? "rgba(8,174,184,0.07)"
                    : "transparent",

            color: active ? "#FFFFFF" : COLORS.text,

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
     * Submenu style.
     */
    const submenuStyle = (active, theme, itemKey) => {
        const hovered = hoveredItem === itemKey;

        const themes = {
            cyan: {
                color: COLORS.cyan,
                background: "rgba(8,174,184,0.10)",
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

        const selected = themes[theme] || themes.cyan;

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
                    ? "rgba(15,23,42,0.035)"
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
     * Primary navigation button.
     */
    const PrimaryButton = ({
        itemKey,
        active,
        iconClass,
        children,
        onClick,
        rightIcon,
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
                        }}
                    />
                )}
            </button>
        );
    };

    /*
     * Submenu button.
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
                    position: "fixed",

                    top: HEADER_HEIGHT,
                    left: 0,
                    bottom: 0,

                    width: SIDEBAR_WIDTH,

                    boxSizing: "border-box",

                    background: "#FFFFFF",

                    borderRight:
                        `1px solid ${COLORS.border}`,

                    display: "flex",
                    flexDirection: "column",

                    padding: "16px 14px 14px",

                    zIndex: 900,

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
                        {/* Dashboard */}

                        <li>
                            <PrimaryButton
                                itemKey="dashboard"
                                active={
                                    isDashboard &&
                                    !isAppointmentsOpen
                                }
                                iconClass="fa-solid fa-house"
                                onClick={() => {
                                    navigate(
                                        "/dashboard"
                                    );
                                }}
                            >
                                Dashboard
                            </PrimaryButton>
                        </li>

                        {/* Appointments */}

                        <li>
                            <PrimaryButton
                                itemKey="appointments"
                                active={
                                    isDashboard &&
                                    isAppointmentsOpen
                                }
                                iconClass="fa-solid fa-calendar-days"
                                rightIcon={
                                    `fa-solid fa-chevron-${isAppointmentsOpen
                                        ? "up"
                                        : "down"
                                    }`
                                }
                                onClick={() => {
                                    if (!isDashboard) {
                                        navigate(
                                            "/dashboard"
                                        );

                                        setIsAppointmentsOpen(
                                            true
                                        );

                                        return;
                                    }

                                    setIsAppointmentsOpen(
                                        (value) =>
                                            !value
                                    );
                                }}
                            >
                                Appointments
                            </PrimaryButton>

                            {isAppointmentsOpen && (
                                <div
                                    style={{
                                        margin:
                                            "3px 0 5px 21px",

                                        paddingLeft: 12,

                                        borderLeft:
                                            `1px solid ${COLORS.submenuBorder}`,
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
                                                isDashboard &&
                                                dashboardTab ===
                                                "confirmed"
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
                                            itemKey="pending"
                                            theme="orange"
                                            active={
                                                isDashboard &&
                                                dashboardTab ===
                                                "pending"
                                            }
                                            iconClass="fa-solid fa-clock"
                                            onClick={() =>
                                                goTab(
                                                    "pending"
                                                )
                                            }
                                        >
                                            Pending
                                        </SubmenuButton>

                                        <SubmenuButton
                                            itemKey="completed"
                                            theme="green"
                                            active={
                                                isDashboard &&
                                                dashboardTab ===
                                                "completed"
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
                            )}
                        </li>

                        {/* Patients */}

                        <li>
                            <PrimaryButton
                                itemKey="patients"
                                active={
                                    isPatients &&
                                    isPatientsOpen
                                }
                                iconClass="fa-solid fa-user-group"
                                rightIcon={
                                    `fa-solid fa-chevron-${isPatientsOpen
                                        ? "up"
                                        : "down"
                                    }`
                                }
                                onClick={() => {
                                    if (!isPatients) {
                                        navigate(
                                            "/patients"
                                        );

                                        setIsPatientsOpen(
                                            true
                                        );

                                        return;
                                    }

                                    setIsPatientsOpen(
                                        (value) =>
                                            !value
                                    );
                                }}
                            >
                                Patients
                            </PrimaryButton>

                            {isPatientsOpen && (
                                <div
                                    style={{
                                        margin:
                                            "3px 0 5px 21px",

                                        paddingLeft: 12,

                                        borderLeft:
                                            `1px solid ${COLORS.submenuBorder}`,
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
                            )}
                        </li>

                        {/* Availability */}

                        <li>
                            <PrimaryButton
                                itemKey="availability"
                                active={
                                    isAvailability
                                }
                                iconClass="fa-solid fa-clock"
                                onClick={() =>
                                    navigate(
                                        "/availability"
                                    )
                                }
                            >
                                Availability
                            </PrimaryButton>
                        </li>

                        {/* Videos */}

                        <li>
                            <PrimaryButton
                                itemKey="videos"
                                active={isVideos}
                                iconClass="fa-solid fa-circle-play"
                                onClick={() =>
                                    navigate(
                                        "/videos"
                                    )
                                }
                            >
                                Videos & Shorts
                            </PrimaryButton>
                        </li>

                        {/* Q&A */}

                        <li>
                            <PrimaryButton
                                itemKey="qna"
                                active={isQna}
                                iconClass="fa-solid fa-circle-question"
                                onClick={() =>
                                    navigate("/qna")
                                }
                            >
                                Q&A
                            </PrimaryButton>
                        </li>

                        {/* Profile */}

                        <li>
                            <PrimaryButton
                                itemKey="profile"
                                active={isProfile}
                                iconClass="fa-solid fa-user"
                                onClick={() =>
                                    navigate(
                                        "/profile"
                                    )
                                }
                            >
                                Profile
                            </PrimaryButton>
                        </li>
                    </ul>
                </nav>

                {/* =====================================================
                    FIXED BOTTOM NAVIGATION

                    Settings + Logout NEVER participate in
                    the navigation scroll.
                ===================================================== */}

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

                    {/* Settings */}

                    <PrimaryButton
                        itemKey="settings"
                        active={isSettings}
                        iconClass="fa-solid fa-gear"
                        onClick={() =>
                            navigate(
                                "/settings"
                            )
                        }
                    >
                        Settings
                    </PrimaryButton>

                    {/* Logout */}

                    <button
                        type="button"
                        className="dv-logout"
                        onClick={
                            handleLogout
                        }
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

                {/* =====================================================
                    UPGRADE CARD

                    Completely outside the scrollable nav.
                ===================================================== */}

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
                            // Add your subscription
                            // route here later.
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
            </aside>
        </>
    );
}