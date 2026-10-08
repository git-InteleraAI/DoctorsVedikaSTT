import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { getApiBaseUrl } from "../utils/apiConfig";

const API = getApiBaseUrl();

const APPOINTMENT_TABS = [
    { key: "waiting", label: "Waiting", icon: "fa-solid fa-user-group", color: "#0284c7", activeBg: "#e0f2fe", activeBorder: "#bae6fd" },
    { key: "completed", label: "Completed", icon: "fa-solid fa-circle-check", color: "#16a34a", activeBg: "#dcfce7", activeBorder: "#bbf7d0" },
    { key: "rescheduled", label: "Rescheduled", icon: "fa-solid fa-clock-rotate-left", color: "#d97706", activeBg: "#fff7ed", activeBorder: "#fed7aa" },
    { key: "cancelled", label: "Cancelled", icon: "fa-solid fa-circle-xmark", color: "#dc2626", activeBg: "#fee2e2", activeBorder: "#fecaca" },
    { key: "scheduled", label: "Scheduled", icon: "fa-regular fa-calendar-days", color: "#7e22ce", activeBg: "#f3e8ff", activeBorder: "#e9d5ff" }
];

const getTodayDate = () => {
    const now = new Date();
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(now);
};

const getPatientInitials = (name = "") => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "P";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatAppointmentTime = (time) => {
    if (!time) return "--";
    const str = String(time).trim();
    if (str.includes("AM") || str.includes("PM") || str.includes("am") || str.includes("pm")) {
        return str;
    }
    const [hours, minutes] = str.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return time;
    }
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });
};

const formatAppointmentSource = (source) => {
    switch (source) {
        case "app":
            return "Mobile App";
        case "walk_in":
            return "Walk-in";
        case "qr":
            return "QR";
        case "legacy":
            return "Legacy";
        default:
            return source || "Walk-in";
    }
};

const resolveOperationalStatus = (app) => {
    if (!app) return "scheduled";
    const status = String(app.status || "").toLowerCase();
    const visitStage = String(app.visitStage || app.visit_stage || "").toLowerCase();

    // 1. Visit stage operational priorities (patient is in clinic/consultation)
    if (visitStage === "waiting" || visitStage === "checked_in") return "waiting";
    if (visitStage === "in_consultation") return "in_consultation";
    if (visitStage === "completed" || visitStage === "exited" || status === "completed") return "completed";

    // 2. Appointment explicit states
    if (status === "rescheduled") return "rescheduled";
    if (status === "cancelled") return "cancelled";
    if (status === "waiting") return "waiting";
    if (status === "in_consultation") return "in_consultation";

    // 3. Default fallback for confirmed/scheduled
    if (status === "confirmed" || status === "scheduled") return "scheduled";

    return status || visitStage || "scheduled";
};

const checkIsPastSlot = (slotTime, selectedDateStr, todayStr) => {
    if (!selectedDateStr || !slotTime) return false;
    const today = todayStr || getTodayDate();
    if (selectedDateStr < today) return true;
    if (selectedDateStr > today) return false;

    // Same date: compare slot time vs current local time
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const str = String(slotTime).trim();
    const [timeStr, modifier] = str.split(" ");
    let [h, m] = (timeStr || "").split(":").map(Number);
    if (isNaN(h)) return false;
    if (modifier && modifier.toUpperCase() === "PM" && h < 12) h += 12;
    if (modifier && modifier.toUpperCase() === "AM" && h === 12) h = 0;
    const slotMinutes = h * 60 + (m || 0);

    return slotMinutes < currentMinutes;
};

const sortAppointmentsChronologically = (appsList) => {
    if (!Array.isArray(appsList)) return [];
    return [...appsList].sort((a, b) => {
        const parseMinutes = (t) => {
            if (!t) return 9999;
            const str = String(t).trim();
            const [timeStr, modifier] = str.split(" ");
            let [h, m] = (timeStr || "").split(":").map(Number);
            if (isNaN(h)) return 9999;
            if (modifier && modifier.toUpperCase() === "PM" && h < 12) h += 12;
            if (modifier && modifier.toUpperCase() === "AM" && h === 12) h = 0;
            return h * 60 + (m || 0);
        };
        return parseMinutes(a.time || a.appointment_time) - parseMinutes(b.time || b.appointment_time);
    });
};

const StatusBadge = ({ status }) => {
    const normalized = String(status || "").toLowerCase();
    const config = {
        waiting: { label: "Waiting", bg: "#fef3c7", text: "#92400e", border: "#fde68a", icon: "fa-solid fa-user-clock" },
        in_consultation: { label: "In Consultation", bg: "#ccfbf1", text: "#115e59", border: "#99f6e4", icon: "fa-solid fa-stethoscope" },
        completed: { label: "Completed", bg: "#dcfce7", text: "#166534", border: "#bbf7d0", icon: "fa-solid fa-circle-check" },
        rescheduled: { label: "Rescheduled", bg: "#e0f2fe", text: "#075985", border: "#bae6fd", icon: "fa-solid fa-clock-rotate-left" },
        cancelled: { label: "Cancelled", bg: "#fee2e2", text: "#991b1b", border: "#fecaca", icon: "fa-solid fa-circle-xmark" },
        scheduled: { label: "Scheduled", bg: "#f3e8ff", text: "#6b21a8", border: "#e9d5ff", icon: "fa-regular fa-calendar-check" },
        blocked: { label: "Blocked", bg: "#fee2e2", text: "#991b1b", border: "#fecaca", icon: "fa-solid fa-ban" },
        available: { label: "Available", bg: "#f0fdfa", text: "#0f766e", border: "#ccfbf1", icon: "fa-regular fa-circle-check" }
    };
    const item = config[normalized] || { label: status || "Unknown", bg: "#f1f5f9", text: "#475569", border: "#e2e8f0", icon: "fa-regular fa-circle" };

    return (
        <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            borderRadius: "9999px",
            border: `1px solid ${item.border}`,
            background: item.bg,
            color: item.text,
            padding: "4px 12px",
            fontSize: "0.75rem",
            fontWeight: 700
        }}>
            <i className={item.icon}></i>
            {item.label}
        </span>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { doctor, loading: authLoading } = useAuth();

    const today = getTodayDate();

    // 5-Tab & View Mode State
    const initialTab = searchParams.get("tab") || "waiting";
    const [activeTab, setActiveTab] = useState(initialTab);
    const [viewMode, setViewMode] = useState("card"); // 'card' | 'list'
    const [sortBy, setSortBy] = useState("time");

    // Calendar Month & Selected Day State
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(today);
    const [monthCalendarData, setMonthCalendarData] = useState({});
    const [selectedDayData, setSelectedDayData] = useState({
        appointments: [],
        availableSlots: [],
        bookedSlots: [],
        blockedSlots: [],
        isBlocked: false,
        blockReason: ""
    });
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [dayLoading, setDayLoading] = useState(false);

    // Operational Data State & Tab Counts
    const [appointments, setAppointments] = useState([]);
    const [tabCounts, setTabCounts] = useState({ waiting: 0, completed: 0, rescheduled: 0, cancelled: 0 });
    const [metrics, setMetrics] = useState({ todayCount: 0, tomorrowCount: 0, completedCount: 0, confirmedCount: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadMetrics = async () => {
        if (!doctor) return;
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const response = await axios.get(`${API}/api/appointments/metrics`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (response.data?.metrics) {
                setMetrics(response.data.metrics);
            }
        } catch (err) {
            console.warn("Failed to fetch metrics", err);
        }
    };

    // Fetch counts for all operational tabs for badges
    const loadAllTabCounts = async () => {
        if (!doctor) return;
        try {
            const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token");
            const headers = token ? { Authorization: `Bearer ${token}` } : {};

            const statuses = ["waiting", "completed", "rescheduled", "cancelled"];
            const results = await Promise.all(
                statuses.map(st =>
                    axios.get(`${API}/api/appointments/daily`, { params: { date: today, status: st }, headers })
                        .then(r => [st, r.data?.appointments?.length || 0])
                        .catch(() => [st, 0])
                )
            );
            const countsObj = Object.fromEntries(results);
            setTabCounts(countsObj);
        } catch (err) {
            console.warn("Failed to fetch tab counts", err);
        }
    };

    const loadDailyAppointments = async (status) => {
        if (!doctor) return;
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token");
            const response = await axios.get(`${API}/api/appointments/daily`, {
                params: {
                    date: today,
                    status
                },
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            if (response.data?.success) {
                setAppointments(response.data.appointments || []);
            } else {
                setAppointments([]);
            }
        } catch (err) {
            console.error("Failed to load daily appointments:", err);
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    };

    // Sprint 3 Step 2: Load Month Calendar Aggregates from GET /api/appointments/calendar
    const loadMonthCalendar = async (monthDate) => {
        if (!doctor) return;
        setCalendarLoading(true);
        try {
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            
            const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
            const lastDayNum = new Date(year, month + 1, 0).getDate();
            const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDayNum).padStart(2, "0")}`;

            const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token");
            const response = await axios.get(`${API}/api/appointments/calendar`, {
                params: { startDate, endDate },
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            if (response.data?.success) {
                const map = {};
                (response.data.calendar || []).forEach(item => {
                    if (item.date) map[item.date] = item;
                });
                setMonthCalendarData(map);
            } else {
                setMonthCalendarData({});
            }
        } catch (err) {
            console.error("Failed to load calendar month:", err);
            setMonthCalendarData({});
        } finally {
            setCalendarLoading(false);
        }
    };

    // Sprint 3 Step 2: Load Selected Day Details from GET /api/appointments/calendar/day
    const loadCalendarDay = async (dateStr) => {
        if (!doctor || !dateStr) return;
        setDayLoading(true);
        try {
            const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token");
            const response = await axios.get(`${API}/api/appointments/calendar/day`, {
                params: { date: dateStr },
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            if (response.data?.success) {
                setSelectedDayData({
                    appointments: response.data.appointments || [],
                    availableSlots: response.data.availableSlots || [],
                    bookedSlots: response.data.bookedSlots || [],
                    blockedSlots: response.data.blockedSlots || [],
                    isBlocked: Boolean(response.data.isBlocked),
                    blockReason: response.data.blockReason || ""
                });
            }
        } catch (err) {
            console.error("Failed to load calendar day details:", err);
            setSelectedDayData({
                appointments: [],
                availableSlots: [],
                bookedSlots: [],
                blockedSlots: [],
                isBlocked: false,
                blockReason: ""
            });
        } finally {
            setDayLoading(false);
        }
    };

    const handleAppointmentTabChange = (tab) => {
        setActiveTab(tab);
        setSearchParams({ tab });

        if (tab === "scheduled") {
            loadMonthCalendar(currentMonth);
            loadCalendarDay(selectedCalendarDate || today);
            return;
        }

        loadDailyAppointments(tab);
    };

    // Month Navigation Controls
    const handlePrevMonth = () => {
        const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        setCurrentMonth(prev);
        loadMonthCalendar(prev);
    };

    const handleNextMonth = () => {
        const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        setCurrentMonth(next);
        loadMonthCalendar(next);
    };

    const handleTodayClick = () => {
        const now = new Date();
        setCurrentMonth(now);
        setSelectedCalendarDate(today);
        loadMonthCalendar(now);
        loadCalendarDay(today);
    };

    const handleDateSelect = (dateStr) => {
        setSelectedCalendarDate(dateStr);
        loadCalendarDay(dateStr);
    };

    useEffect(() => {
        if (!authLoading) {
            if (!doctor) {
                navigate("/login");
            }
        }
    }, [doctor, authLoading, navigate]);

    useEffect(() => {
        if (doctor) {
            loadMetrics();
            loadAllTabCounts();
            if (activeTab === "scheduled") {
                loadMonthCalendar(currentMonth);
                loadCalendarDay(selectedCalendarDate || today);
            } else {
                loadDailyAppointments(activeTab);
            }
        }
    }, [doctor, activeTab]);

    // Realtime Sync Listener: Listen for Staff Portal queue/appointment updates
    useEffect(() => {
        if (!doctor) return;

        let lastHandledTime = 0;

        const handleQueueUpdatedEvent = (e) => {
            if (e && e.key && e.key !== "doctors_vedika_queue_updated") return;

            const now = Date.now();
            if (now - lastHandledTime < 800) return;
            lastHandledTime = now;

            loadMetrics();
            loadAllTabCounts();
            if (activeTab === "scheduled") {
                loadMonthCalendar(currentMonth);
                loadCalendarDay(selectedCalendarDate || today);
            } else {
                loadDailyAppointments(activeTab);
            }
        };

        window.addEventListener("storage", handleQueueUpdatedEvent);

        return () => {
            window.removeEventListener("storage", handleQueueUpdatedEvent);
        };
    }, [doctor, activeTab, currentMonth, selectedCalendarDate, today]);

    const openConsultation = (appointment) => {
        const encounterId = appointment.visit_id || appointment.visitId || appointment.hospital_patient_id || appointment.id;
        const queryParams = new URLSearchParams();
        if (appointment.id) queryParams.set("appointmentId", appointment.id);
        if (appointment.visit_id || appointment.visitId) queryParams.set("visitId", appointment.visit_id || appointment.visitId);
        if (appointment.patientId || appointment.patient_id) queryParams.set("patientId", appointment.patientId || appointment.patient_id);

        const isCompleted = (appointment.status || "").toLowerCase() === "completed" || 
            (appointment.visitStage || appointment.visit_stage || "").toLowerCase() === "completed" || 
            (appointment.visitStage || appointment.visit_stage || "").toLowerCase() === "exited" ||
            activeTab === "completed";

        if (isCompleted) {
            navigate(`/consultation/${encodeURIComponent(encounterId)}/summary?${queryParams.toString()}`, {
                state: {
                    appointmentId: appointment.id,
                    visitId: appointment.visit_id || appointment.visitId,
                    hospitalPatientId: appointment.hospital_patient_id,
                    patientId: appointment.patientId || appointment.patient_id || null,
                    patient: appointment,
                    doctorId: doctor?.id || "default-doctor",
                    consultationCompleted: true,
                },
            });
            return;
        }

        const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token") || localStorage.getItem("doctor_token");
        fetch(`${API}/api/v1/queue/transition`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                visitId: encounterId,
                targetStage: "in_consultation"
            })
        })
            .then(() => {
                localStorage.setItem("doctors_vedika_queue_updated", String(Date.now()));
                window.dispatchEvent(new Event("storage"));
            })
            .catch((e) => console.warn("Transition notice:", e));

        navigate(`/consultation/${encodeURIComponent(encounterId)}?${queryParams.toString()}`, {
            state: {
                appointmentId: appointment.id,
                visitId: appointment.visit_id || appointment.visitId,
                hospitalPatientId: appointment.hospital_patient_id,
                patientId: appointment.patientId || appointment.patient_id || null,
                patient: appointment,
                doctorId: doctor?.id || "default-doctor",
            },
        });
    };

    const renderAppointmentAction = (appointment) => {
        const opStatus = resolveOperationalStatus(appointment);

        if (opStatus === "cancelled") {
            return (
                <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: "8px", border: "1px solid #fecaca", color: "#991b1b", fontSize: "0.82rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                    <i className="fa-solid fa-ban"></i> Appointment Cancelled
                </div>
            );
        }

        if (opStatus === "rescheduled") {
            return (
                <div style={{ padding: "8px 12px", background: "#e0f2fe", borderRadius: "8px", border: "1px solid #bae6fd", color: "#0369a1", fontSize: "0.82rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                    <i className="fa-solid fa-clock-rotate-left"></i> Rescheduled to new date/time
                </div>
            );
        }

        if (opStatus === "completed") {
            return (
                <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                    <button
                        type="button"
                        onClick={() => openConsultation(appointment)}
                        style={{
                            flex: 1,
                            background: "#16a34a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "10px",
                            padding: "10px 14px",
                            fontSize: "0.88rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            boxShadow: "0 2px 6px rgba(22, 163, 74, 0.2)"
                        }}
                    >
                        <i className="fa-regular fa-file-lines"></i> View Report
                    </button>
                </div>
            );
        }

        // Active statuses: waiting, in_consultation, scheduled
        return (
            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                <button
                    type="button"
                    onClick={() => openConsultation(appointment)}
                    style={{
                        flex: 1,
                        background: opStatus === "in_consultation" ? "#0f766e" : "#0d9488",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px 14px",
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        boxShadow: "0 2px 6px rgba(13,148,136,0.25)"
                    }}
                >
                    <i className={opStatus === "in_consultation" ? "fa-solid fa-stethoscope" : "fa-solid fa-play"}></i>
                    {opStatus === "in_consultation" ? "Resume Consultation" : "Start Consultation"}
                </button>
            </div>
        );
    };

    // Helper: Generate Month Grid cells (Sun..Sat)
    const renderCalendarGrid = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const grid = [];

        // 1. Previous month padding days
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            const prevMonthDate = new Date(year, month - 1, dayNum);
            const dateStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            grid.push({ dayNum, dateStr, isCurrentMonth: false });
        }

        // 2. Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            grid.push({ dayNum: d, dateStr, isCurrentMonth: true });
        }

        // 3. Next month padding days to complete grid
        const totalCells = grid.length <= 35 ? 35 : 42;
        const remainingCells = totalCells - grid.length;
        for (let j = 1; j <= remainingCells; j++) {
            const nextMonthDate = new Date(year, month + 1, j);
            const dateStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
            grid.push({ dayNum: j, dateStr, isCurrentMonth: false });
        }

        return grid;
    };

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const weekDays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

    // Format date string nicely: Wednesday, 7 October 2026
    const formatDisplayDateHeader = (dateStr) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    };

    return (
        <DashboardLayout
            activePage="dashboard"
            dashboardTab={activeTab}
            onDashboardTab={handleAppointmentTabChange}
        >
            {/* TOP BAR / PAGE HEADER WITH DATE NAVIGATION */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "10px" }}>
                        <i className="fa-regular fa-calendar-check" style={{ color: "#0d9488" }}></i>
                        Appointments
                    </h1>
                    <p style={{ margin: "4px 0 0 0", fontSize: "0.9rem", color: "#64748b" }}>
                        Manage your daily appointments and consultations.
                    </p>
                </div>

                {/* Date Navigation Bar Pill */}
                <div style={{ display: "flex", alignItems: "center", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "4px 8px", boxShadow: "0 2px 6px rgba(15,23,42,0.04)" }}>
                    <button
                        type="button"
                        onClick={handlePrevMonth}
                        style={{ background: "transparent", border: "none", color: "#64748b", padding: "8px 12px", cursor: "pointer", fontSize: "0.9rem" }}
                    >
                        <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    <span style={{ padding: "0 12px", fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>
                        {formatDisplayDateHeader(selectedCalendarDate || today)}
                    </span>
                    <button
                        type="button"
                        onClick={handleNextMonth}
                        style={{ background: "transparent", border: "none", color: "#64748b", padding: "8px 12px", cursor: "pointer", fontSize: "0.9rem" }}
                    >
                        <i className="fa-solid fa-chevron-right"></i>
                    </button>
                    <button
                        type="button"
                        onClick={handleTodayClick}
                        style={{
                            marginLeft: "8px",
                            background: "#e0f2fe",
                            color: "#0284c7",
                            border: "none",
                            borderRadius: "8px",
                            padding: "6px 14px",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            cursor: "pointer"
                        }}
                    >
                        Today
                    </button>
                </div>
            </div>

            {/* TOP STAT CARDS GRID (NO PENDING CARD) */}
            <section style={{ marginBottom: "24px" }}>
                <div className="responsive-grid-auto">
                    <div className="classic-card" style={{ background: "#ffffff", borderRadius: "16px", padding: "20px", border: "1px solid #e2e8f0" }}>
                        <div style={{ color: "#64748b", fontSize: "0.88rem", fontWeight: 600, display: "flex", alignItems: "center" }}>
                            <i className="fa-solid fa-stethoscope" style={{ color: "#01b6af", fontSize: "1.05rem", marginRight: "8px", flexShrink: 0 }}></i>
                            <span>Today's Consultations</span>
                        </div>
                        <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "#082b68", marginTop: "10px" }}>{metrics.todayCount || 0}</div>
                    </div>

                    <div className="classic-card" style={{ background: "#ffffff", borderRadius: "16px", padding: "20px", border: "1px solid #e2e8f0" }}>
                        <div style={{ color: "#64748b", fontSize: "0.88rem", fontWeight: 600, display: "flex", alignItems: "center" }}>
                            <i className="fa-regular fa-calendar-days" style={{ color: "#01b6af", fontSize: "1.05rem", marginRight: "8px", flexShrink: 0 }}></i>
                            <span>Tomorrow's Bookings</span>
                        </div>
                        <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "#01b6af", marginTop: "10px" }}>{metrics.tomorrowCount || 0}</div>
                    </div>

                    <div className="classic-card" style={{ background: "#ffffff", borderRadius: "16px", padding: "20px", border: "1px solid #e2e8f0" }}>
                        <div style={{ color: "#64748b", fontSize: "0.88rem", fontWeight: 600, display: "flex", alignItems: "center" }}>
                            <i className="fa-regular fa-circle-check" style={{ color: "#16a34a", fontSize: "1.05rem", marginRight: "8px", flexShrink: 0 }}></i>
                            <span>Completed Visits</span>
                        </div>
                        <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "#16a34a", marginTop: "10px" }}>{metrics.completedCount || 0}</div>
                    </div>

                    <div onClick={() => navigate("/availability")} style={{ background: "linear-gradient(135deg, #082b68 0%, #01b6af 100%)", borderRadius: "16px", padding: "20px", color: "#ffffff", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 6px 20px rgba(1,182,175,0.25)", transition: "all 0.25s ease" }} onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-3px)"} onMouseLeave={(e) => e.currentTarget.style.transform = "none"}>
                        <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#ffffff", opacity: 0.95, display: "flex", alignItems: "center", gap: "8px" }}>
                            <i className="fa-solid fa-clock" style={{ color: "#ffffff" }}></i> Quick Action
                        </div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#ffffff", marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ color: "#ffffff" }}>Manage Availability</span>
                            <i className="fa-solid fa-arrow-right" style={{ color: "#ffffff" }}></i>
                        </div>
                    </div>
                </div>
            </section>

            {error && (
                <div style={{ margin: "12px 0", padding: "14px 20px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontWeight: 500 }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "8px" }}></i> {error}
                </div>
            )}

            {/* 5 TOP TAB CARDS (PILL TABS WITH COUNTS, MATCHING IMAGE 2) */}
            <section style={{ marginBottom: "24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                    {APPOINTMENT_TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        const count = tabCounts[tab.key] !== undefined ? tabCounts[tab.key] : 0;

                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => handleAppointmentTabChange(tab.key)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "14px 18px",
                                    borderRadius: "14px",
                                    border: `2px solid ${isActive ? tab.activeBorder : "#e2e8f0"}`,
                                    background: isActive ? tab.activeBg : "#ffffff",
                                    color: isActive ? tab.color : "#475569",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                    boxShadow: isActive ? "0 4px 12px rgba(15,23,42,0.06)" : "0 1px 3px rgba(0,0,0,0.02)"
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: isActive ? 800 : 600, fontSize: "0.95rem" }}>
                                    <i className={tab.icon} style={{ color: isActive ? tab.color : "#94a3b8", fontSize: "1.1rem" }}></i>
                                    <span>{tab.label}</span>
                                </div>
                                {tab.key !== "scheduled" && (
                                    <span style={{
                                        width: "26px",
                                        height: "26px",
                                        borderRadius: "50%",
                                        background: isActive ? tab.color : "#e2e8f0",
                                        color: isActive ? "#ffffff" : "#475569",
                                        fontSize: "0.8rem",
                                        fontWeight: 800,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center"
                                    }}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* SECTION HEADER: TITLE & CONTROLS */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "10px" }}>
                        <i className="fa-solid fa-user-group" style={{ color: "#0d9488" }}></i>
                        {activeTab === "waiting" ? "Patients Waiting" : activeTab === "completed" ? "Completed Consultations" : activeTab === "rescheduled" ? "Rescheduled Appointments" : activeTab === "cancelled" ? "Cancelled Appointments" : "Calendar Schedule"}
                        {activeTab !== "scheduled" && (
                            <span style={{ background: "#0d9488", color: "#ffffff", borderRadius: "9999px", padding: "2px 10px", fontSize: "0.8rem", fontWeight: 800 }}>
                                {appointments.length}
                            </span>
                        )}
                    </h2>
                    <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                        {activeTab === "waiting" ? "Patients currently waiting for consultation today" : activeTab === "completed" ? "Consultations completed today" : activeTab === "rescheduled" ? "Appointments rescheduled from today" : activeTab === "cancelled" ? "Appointments cancelled today" : "Doctor's calendar and complete longitudinal schedule"}
                    </p>
                </div>

                {/* VIEW MODE TOGGLE & SORT BY */}
                {activeTab !== "scheduled" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {/* View Switcher: Card View | List View */}
                        <div style={{ display: "flex", background: "#f1f5f9", padding: "4px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                            <button
                                type="button"
                                onClick={() => setViewMode("card")}
                                style={{
                                    border: "none",
                                    background: viewMode === "card" ? "#ffffff" : "transparent",
                                    color: viewMode === "card" ? "#0f172a" : "#64748b",
                                    fontWeight: viewMode === "card" ? 700 : 600,
                                    fontSize: "0.85rem",
                                    padding: "6px 14px",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    boxShadow: viewMode === "card" ? "0 1px 4px rgba(0,0,0,0.06)" : "none"
                                }}
                            >
                                <i className="fa-solid fa-table-cells-large"></i> Card View
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode("list")}
                                style={{
                                    border: "none",
                                    background: viewMode === "list" ? "#ffffff" : "transparent",
                                    color: viewMode === "list" ? "#0f172a" : "#64748b",
                                    fontWeight: viewMode === "list" ? 700 : 600,
                                    fontSize: "0.85rem",
                                    padding: "6px 14px",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    boxShadow: viewMode === "list" ? "0 1px 4px rgba(0,0,0,0.06)" : "none"
                                }}
                            >
                                <i className="fa-solid fa-list"></i> List View
                            </button>
                        </div>

                        {/* Sort Dropdown */}
                        <div style={{ position: "relative" }}>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                style={{
                                    padding: "8px 14px",
                                    borderRadius: "10px",
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    color: "#0f172a",
                                    fontWeight: 600,
                                    fontSize: "0.85rem",
                                    cursor: "pointer",
                                    outline: "none"
                                }}
                            >
                                <option value="time">Sort by: Appointment Time</option>
                                <option value="name">Sort by: Patient Name</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* MAIN APPOINTMENT VIEW WORKSPACE */}
            <section className="classic-section fade-in">
                {activeTab === "scheduled" ? (
                    /* SPRINT 3 REAL CALENDAR VIEW */
                    <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "24px" }}>
                        <div id="calendar-grid-container" style={{ borderRadius: "16px", border: "1px solid #e2e8f0", background: "#ffffff", padding: "24px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
                                <div>
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                                        <i className="fa-regular fa-calendar-check" style={{ color: "#0d9488" }}></i>
                                        {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                                    </h2>
                                    <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                                        Scheduled Appointments & Dynamic Slot Availability
                                    </p>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <button
                                        type="button"
                                        onClick={handleTodayClick}
                                        style={{
                                            padding: "6px 14px",
                                            borderRadius: "8px",
                                            border: "1px solid #cbd5e1",
                                            background: "#f8fafc",
                                            color: "#0f172a",
                                            fontSize: "0.85rem",
                                            fontWeight: 600,
                                            cursor: "pointer"
                                        }}
                                    >
                                        Today
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handlePrevMonth}
                                        style={{
                                            width: "36px", height: "36px", borderRadius: "8px",
                                            border: "1px solid #cbd5e1", background: "#ffffff",
                                            color: "#0f172a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                        }}
                                    >
                                        <i className="fa-solid fa-chevron-left"></i>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleNextMonth}
                                        style={{
                                            width: "36px", height: "36px", borderRadius: "8px",
                                            border: "1px solid #cbd5e1", background: "#ffffff",
                                            color: "#0f172a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                        }}
                                    >
                                        <i className="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px", textAlign: "center", marginBottom: "8px" }}>
                                {weekDays.map(day => (
                                    <div key={day} style={{ padding: "8px 0", fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {calendarLoading ? (
                                <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
                                    <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#0d9488", marginBottom: "12px" }}></i>
                                    <p>Loading month schedule...</p>
                                </div>
                            ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
                                    {renderCalendarGrid().map((cell, idx) => {
                                        const dateInfo = monthCalendarData[cell.dateStr] || {};
                                        const isSelected = selectedCalendarDate === cell.dateStr;
                                        const isTodayDate = cell.dateStr === today;
                                        const totalApps = Number(dateInfo.total || 0);

                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => handleDateSelect(cell.dateStr)}
                                                style={{
                                                    minHeight: "76px",
                                                    padding: "8px",
                                                    borderRadius: "12px",
                                                    border: isSelected ? "2px solid #0d9488" : "1px solid #e2e8f0",
                                                    background: isSelected ? "#f0fdfa" : (cell.isCurrentMonth ? "#ffffff" : "#f8fafc"),
                                                    opacity: cell.isCurrentMonth ? 1 : 0.45,
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    justifyContent: "space-between",
                                                    transition: "all 0.15s ease",
                                                    boxShadow: isSelected ? "0 4px 12px rgba(13, 148, 136, 0.15)" : "none"
                                                }}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <span style={{
                                                        fontSize: "0.85rem",
                                                        fontWeight: isTodayDate || isSelected ? 800 : 600,
                                                        color: isTodayDate ? "#0d9488" : (cell.isCurrentMonth ? "#0f172a" : "#94a3b8"),
                                                        background: isTodayDate ? "#ccfbf1" : "transparent",
                                                        padding: isTodayDate ? "2px 6px" : "0",
                                                        borderRadius: "4px"
                                                    }}>
                                                        {cell.dayNum}
                                                    </span>
                                                    {isTodayDate && (
                                                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#0d9488", textTransform: "uppercase" }}>
                                                            Today
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Real Appointment Indicators from /calendar API */}
                                                {totalApps > 0 && (
                                                    <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                                                        <span style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                            background: "#082b68",
                                                            color: "#ffffff",
                                                            fontSize: "0.7rem",
                                                            fontWeight: 700,
                                                            padding: "2px 8px",
                                                            borderRadius: "9999px"
                                                        }}>
                                                            ● {totalApps} {totalApps === 1 ? "app" : "apps"}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Sprint 3 Step 3: Selected Day Timeline & Dynamic Slot UX Workspace */}
                        <div id="selected-day-container" style={{ borderRadius: "16px", border: "1px solid #e2e8f0", background: "#ffffff", padding: "24px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
                            
                            {/* Selected-Day Header */}
                            <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                                            <i className="fa-regular fa-calendar-day" style={{ color: "#0d9488" }}></i>
                                            {formatDisplayDateHeader(selectedCalendarDate || today)}
                                        </h3>
                                        {selectedCalendarDate === today && (
                                            <span style={{ background: "#ccfbf1", color: "#0d9488", fontSize: "0.72rem", fontWeight: 800, padding: "3px 10px", borderRadius: "9999px", textTransform: "uppercase" }}>
                                                Today
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                                        {selectedDayData.dayOfWeek || "Schedule"} • {selectedDayData.appointments.length} Appointments • {selectedDayData.availableSlots.length} Available Slots
                                    </p>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    {selectedDayData.isBlocked && (
                                        <span style={{ padding: "6px 14px", borderRadius: "9999px", background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "0.82rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                                            <i className="fa-solid fa-ban"></i> Blocked: {selectedDayData.blockReason || "Doctor Unavailable"}
                                        </span>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => {
                                            const el = document.getElementById("calendar-grid-container");
                                            if (el) el.scrollIntoView({ behavior: "smooth" });
                                        }}
                                        style={{
                                            padding: "6px 12px",
                                            borderRadius: "8px",
                                            border: "1px solid #cbd5e1",
                                            background: "#ffffff",
                                            color: "#475569",
                                            fontSize: "0.8rem",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px"
                                        }}
                                    >
                                        <i className="fa-solid fa-arrow-up"></i> Month Grid
                                    </button>
                                </div>
                            </div>

                            {dayLoading ? (
                                <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                                    <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#0d9488", marginBottom: "12px" }}></i>
                                    <p>Loading timeline & slot details for {selectedCalendarDate}...</p>
                                </div>
                            ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px", alignItems: "start" }}>
                                    
                                    {/* Left Column: Chronological Appointments Timeline */}
                                    <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                            <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                                                <i className="fa-solid fa-timeline" style={{ color: "#0d9488" }}></i>
                                                Timeline ({selectedDayData.appointments.length})
                                            </h4>
                                            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Sorted by time</span>
                                        </div>

                                        {selectedDayData.appointments.length > 0 ? (
                                            <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "relative", paddingLeft: "12px" }}>
                                                {/* Visual Vertical Timeline Bar */}
                                                <div style={{ position: "absolute", top: "12px", bottom: "12px", left: "21px", width: "2px", background: "#e2e8f0", zIndex: 0 }}></div>

                                                {sortAppointmentsChronologically(selectedDayData.appointments).map((app, appIdx) => {
                                                    const opStatus = resolveOperationalStatus(app);
                                                    return (
                                                        <div
                                                            key={app.id || appIdx}
                                                            style={{
                                                                position: "relative",
                                                                zIndex: 1,
                                                                borderRadius: "16px",
                                                                border: opStatus === "in_consultation" ? "2px solid #0d9488" : "1px solid #e2e8f0",
                                                                background: "#ffffff",
                                                                padding: "16px 18px",
                                                                boxShadow: opStatus === "in_consultation" ? "0 4px 14px rgba(13, 148, 136, 0.12)" : "0 2px 6px rgba(15,23,42,0.03)",
                                                                display: "flex",
                                                                flexDirection: "column",
                                                                gap: "12px"
                                                            }}
                                                        >
                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                                                                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                                                    <img
                                                                        src={app.patientPhoto || "/images/human.png"}
                                                                        alt="Patient"
                                                                        style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid #f1f5f9" }}
                                                                        onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.patientName || app.patient_name || "Patient")}&background=0d9488&color=fff`; }}
                                                                    />
                                                                    <div>
                                                                        <div style={{ fontSize: "0.98rem", fontWeight: 800, color: "#0f172a" }}>
                                                                            {app.patientName || app.patient_name}
                                                                        </div>
                                                                        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                                                                            {app.patientCode || "Walk-in"} • {app.age ? `${app.age} yrs` : ""} • {app.gender || "Unknown"}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <StatusBadge status={opStatus} />
                                                            </div>

                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", color: "#0f172a", paddingTop: "8px", borderTop: "1px dashed #e2e8f0" }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                                    <i className="fa-regular fa-clock" style={{ color: "#0d9488" }}></i>
                                                                    <strong style={{ fontSize: "0.9rem" }}>{formatAppointmentTime(app.time || app.appointment_time)}</strong>
                                                                </div>
                                                                <div style={{ color: "#64748b", fontSize: "0.78rem", textTransform: "capitalize", background: "#f8fafc", padding: "2px 8px", borderRadius: "6px" }}>
                                                                    {formatAppointmentSource(app.source)}
                                                                </div>
                                                            </div>

                                                            {(app.reason || app.symptoms) && (
                                                                <div style={{ fontSize: "0.8rem", color: "#0f766e", background: "#f0fdfa", border: "1px solid #ccfbf1", padding: "8px 12px", borderRadius: "8px" }}>
                                                                    <strong>Chief Complaint:</strong> {app.reason || app.symptoms}
                                                                </div>
                                                            )}

                                                            <div style={{ marginTop: "2px" }}>
                                                                {renderAppointmentAction(app)}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div style={{ padding: "36px", textAlign: "center", background: "#f8fafc", borderRadius: "16px", border: "1px dashed #cbd5e1" }}>
                                                <i className="fa-regular fa-calendar-xmark" style={{ fontSize: "2rem", color: "#94a3b8", marginBottom: "10px" }}></i>
                                                <h5 style={{ margin: "0 0 4px 0", fontSize: "0.95rem", color: "#334155", fontWeight: 700 }}>No Appointments Booked</h5>
                                                <p style={{ margin: 0, color: "#64748b", fontSize: "0.82rem" }}>
                                                    There are no patient consultations scheduled for {formatDisplayDateHeader(selectedCalendarDate)}.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column: Dynamic Time Slots & Capacity UX Breakdown */}
                                    <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                            <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                                                <i className="fa-solid fa-chart-pie" style={{ color: "#0d9488" }}></i>
                                                Slot Capacity Breakdown
                                            </h4>
                                        </div>

                                        {selectedDayData.isBlocked ? (
                                            <div style={{ padding: "20px", background: "#fef2f2", borderRadius: "14px", border: "1px solid #fecaca", color: "#991b1b" }}>
                                                <i className="fa-solid fa-ban" style={{ fontSize: "1.5rem", marginBottom: "8px", display: "block" }}></i>
                                                <strong style={{ fontSize: "0.95rem" }}>Day Blocked by Doctor</strong>
                                                <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem" }}>
                                                    {selectedDayData.blockReason || "Doctor is unavailable or on leave for this date."}
                                                </p>
                                            </div>
                                        ) : selectedDayData.availableSlots.length === 0 && selectedDayData.bookedSlots.length === 0 ? (
                                            <div style={{ padding: "20px", background: "#f8fafc", borderRadius: "14px", border: "1px solid #e2e8f0", color: "#64748b" }}>
                                                <i className="fa-solid fa-clock-slash" style={{ fontSize: "1.5rem", marginBottom: "8px", display: "block", color: "#94a3b8" }}></i>
                                                <strong style={{ fontSize: "0.92rem", color: "#334155" }}>No Working Hours Configured</strong>
                                                <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem" }}>
                                                    No standard consultation slots are configured for this day. You can update availability in settings.
                                                </p>
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                                                
                                                {/* Capacity Summary Bar */}
                                                {(() => {
                                                    const total = (selectedDayData.bookedSlots.length || 0) + (selectedDayData.availableSlots.length || 0);
                                                    const bookedCount = selectedDayData.bookedSlots.length || 0;
                                                    const pct = total > 0 ? Math.round((bookedCount / total) * 100) : 0;
                                                    const isFullyBooked = selectedDayData.availableSlots.length === 0 && bookedCount > 0;

                                                    return (
                                                        <div style={{ padding: "16px", borderRadius: "14px", background: isFullyBooked ? "#fff7ed" : "#f8fafc", border: `1px solid ${isFullyBooked ? "#fed7aa" : "#e2e8f0"}` }}>
                                                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 700, color: isFullyBooked ? "#c2410c" : "#334155", marginBottom: "6px" }}>
                                                                <span>{isFullyBooked ? "🔥 100% Fully Booked" : `Capacity: ${pct}% Occupied`}</span>
                                                                <span>{bookedCount} / {total} Slots</span>
                                                            </div>
                                                            <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "9999px", overflow: "hidden" }}>
                                                                <div style={{ width: `${pct}%`, height: "100%", background: isFullyBooked ? "#f97316" : "#0d9488", transition: "width 0.4s ease" }}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Booked Slots breakdown */}
                                                <div>
                                                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                                                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#0284c7" }}></span>
                                                        Booked & Reserved Slots ({selectedDayData.bookedSlots.length})
                                                    </div>
                                                    {selectedDayData.bookedSlots.length > 0 ? (
                                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                                            {selectedDayData.bookedSlots.map((slot, sIdx) => (
                                                                <span
                                                                    key={sIdx}
                                                                    style={{
                                                                        padding: "6px 12px",
                                                                        borderRadius: "8px",
                                                                        background: "#e0f2fe",
                                                                        border: "1px solid #bae6fd",
                                                                        color: "#0369a1",
                                                                        fontSize: "0.8rem",
                                                                        fontWeight: 700,
                                                                        display: "inline-flex",
                                                                        alignItems: "center",
                                                                        gap: "6px"
                                                                    }}
                                                                >
                                                                    <i className="fa-regular fa-clock"></i> {slot.time} • {slot.patientName || "Booked"}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p style={{ margin: 0, fontSize: "0.82rem", color: "#94a3b8" }}>No slots booked yet for this day.</p>
                                                    )}
                                                </div>

                                                {/* Available Slots breakdown */}
                                                <div>
                                                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                                                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#0d9488" }}></span>
                                                        Available Slots ({selectedDayData.availableSlots.length})
                                                    </div>
                                                    {selectedDayData.availableSlots.length > 0 ? (
                                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                                            {selectedDayData.availableSlots.map((slot, sIdx) => {
                                                                const isPast = checkIsPastSlot(slot.time, selectedCalendarDate, today);
                                                                return (
                                                                    <span
                                                                        key={sIdx}
                                                                        style={{
                                                                            padding: "6px 12px",
                                                                            borderRadius: "8px",
                                                                            background: isPast ? "#f1f5f9" : "#f0fdfa",
                                                                            border: `1px solid ${isPast ? "#cbd5e1" : "#ccfbf1"}`,
                                                                            color: isPast ? "#94a3b8" : "#0f766e",
                                                                            fontSize: "0.8rem",
                                                                            fontWeight: 600,
                                                                            display: "inline-flex",
                                                                            alignItems: "center",
                                                                            gap: "4px"
                                                                        }}
                                                                    >
                                                                        <i className={isPast ? "fa-regular fa-clock" : "fa-regular fa-circle-check"}></i>
                                                                        {slot.time} {isPast ? "(Past)" : ""}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p style={{ margin: 0, fontSize: "0.82rem", color: "#94a3b8" }}>No open available slots remaining.</p>
                                                    )}
                                                </div>

                                            </div>
                                        )}
                                    </div>

                                </div>
                            )}
                        </div>

                    </div>
                ) : loading ? (
                    <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                        <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#0d9488", marginBottom: "16px" }}></i>
                        <p>Loading {activeTab} appointments...</p>
                    </div>
                ) : viewMode === "card" ? (
                    /* 3-COLUMN SMALL CARDS GRID (MATCHING REFERENCE IMAGE 2) */
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: "20px" }}>
                        {appointments.map((app) => (
                            <div
                                key={app.id}
                                style={{
                                    background: "#ffffff",
                                    borderRadius: "16px",
                                    border: "1px solid #e2e8f0",
                                    padding: "20px",
                                    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "space-between",
                                    position: "relative",
                                    transition: "all 0.2s ease"
                                }}
                            >
                                <span style={{
                                    position: "absolute",
                                    top: "14px",
                                    left: "14px",
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: activeTab === "waiting" ? "#f59e0b" : activeTab === "completed" ? "#16a34a" : activeTab === "rescheduled" ? "#0284c7" : "#dc2626"
                                }} />

                                <div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "14px", paddingLeft: "10px" }}>
                                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                            <img
                                                src={app.patientPhoto || "/images/human.png"}
                                                alt="Patient"
                                                style={{ width: "46px", height: "46px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid #f1f5f9" }}
                                                onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.patientName || "Patient")}&background=0d9488&color=fff`; }}
                                            />
                                            <div style={{ minWidth: 0 }}>
                                                <h3 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {app.patientName || app.patient_name}
                                                </h3>
                                                <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                                                    {app.patientCode || (app.patientId ? `DV-P-${String(app.patientId).slice(0, 6).toUpperCase()}` : "Walk-in Patient")}
                                                </p>
                                                <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                                                    {app.age ? `${app.age} yrs` : ""} {app.gender ? `• ${app.gender}` : ""}
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
                                            <span style={{
                                                background: "#f0f9ff",
                                                border: "1px solid #bae6fd",
                                                color: "#0284c7",
                                                padding: "4px 10px",
                                                borderRadius: "8px",
                                                fontSize: "0.82rem",
                                                fontWeight: 700,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "4px"
                                            }}>
                                                <i className="fa-regular fa-clock"></i> {formatAppointmentTime(app.time || app.appointment_time)}
                                            </span>

                                            {activeTab === "waiting" && (
                                                <span style={{
                                                    background: "#fff7ed",
                                                    border: "1px solid #fed7aa",
                                                    color: "#c2410c",
                                                    padding: "3px 8px",
                                                    borderRadius: "6px",
                                                    fontSize: "0.74rem",
                                                    fontWeight: 600,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "4px"
                                                }}>
                                                    <i className="fa-regular fa-hourglass-half"></i> Waiting 10 mins
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {(app.reason || app.symptoms) && (
                                        <div style={{
                                            background: "#f0fdfa",
                                            border: "1px solid #ccfbf1",
                                            borderRadius: "10px",
                                            padding: "10px 14px",
                                            marginBottom: "16px"
                                        }}>
                                            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f766e", display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                                                <i className="fa-solid fa-stethoscope" style={{ color: "#0d9488" }}></i> Chief Complaint
                                            </div>
                                            <div style={{ fontSize: "0.85rem", color: "#0f172a", fontWeight: 500, lineHeight: 1.35 }}>
                                                {app.reason || app.symptoms}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    {renderAppointmentAction(app)}
                                </div>
                            </div>
                        ))}

                        {!appointments.length && (
                            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 20px", background: "#f8fafc", borderRadius: "16px", border: "1.5px dashed #cbd5e1" }}>
                                <div style={{ width: "56px", height: "56px", background: "#e0f2fe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px auto" }}>
                                    <i className="fa-regular fa-calendar-xmark" style={{ fontSize: "1.5rem", color: "#0284c7" }}></i>
                                </div>
                                <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontWeight: 700 }}>No {activeTab.toUpperCase()} Appointments</h3>
                                <p style={{ margin: 0, color: "#64748b", fontSize: "0.88rem" }}>
                                    There are no {activeTab} appointments for today ({today}).
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* LIST VIEW (FULL-WIDTH ROWS) */
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {appointments.map((appointment) => (
                            <div
                                key={appointment.id}
                                style={{
                                    borderRadius: "16px",
                                    border: "1px solid #e2e8f0",
                                    background: "#ffffff",
                                    padding: "16px 20px",
                                    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.04)",
                                    transition: "all 0.2s ease"
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", justifyBetween: "space-between", gap: "24px", flexWrap: "wrap" }}>
                                    
                                    <div style={{ minWidth: "200px", flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                            <div style={{
                                                width: "40px", height: "40px", borderRadius: "50%",
                                                background: "#f1f5f9", color: "#0f172a",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                fontSize: "0.9rem", fontWeight: 700, flexShrink: 0
                                            }}>
                                                {getPatientInitials(appointment.patientName || appointment.patient_name)}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {appointment.patientName || appointment.patient_name}
                                                </h3>
                                                <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                                                    {appointment.patientCode || (appointment.patientId ? `DV-P-${String(appointment.patientId).slice(0, 6).toUpperCase()}` : "Walk-in Patient")}
                                                    {appointment.age ? ` • ${appointment.age} yrs` : ""}
                                                    {appointment.gender ? ` • ${appointment.gender}` : ""}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ width: "110px", flexShrink: 0 }}>
                                        <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>Appointment</p>
                                        <p style={{ margin: "2px 0 0 0", fontSize: "0.88rem", fontWeight: 600, color: "#0f172a" }}>
                                            {formatAppointmentTime(appointment.appointmentTime || appointment.appointment_time || appointment.time)}
                                        </p>
                                    </div>

                                    <div style={{ width: "110px", flexShrink: 0 }}>
                                        <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>Source</p>
                                        <p style={{ margin: "2px 0 0 0", fontSize: "0.88rem", fontWeight: 600, color: "#0f172a", textTransform: "capitalize" }}>
                                            {formatAppointmentSource(appointment.source)}
                                        </p>
                                    </div>

                                    <div style={{ width: "120px", flexShrink: 0 }}>
                                        <StatusBadge status={appointment.status || appointment.visitStage || appointment.visit_stage || activeTab} />
                                    </div>

                                    <div style={{ width: "220px", flexShrink: 0, textAlign: "right" }}>
                                        {renderAppointmentAction(appointment)}
                                    </div>

                                </div>

                                {(appointment.reason || appointment.symptoms) && (
                                    <div style={{
                                        marginTop: "12px",
                                        paddingTop: "10px",
                                        borderTop: "1px solid #f1f5f9",
                                        fontSize: "0.82rem",
                                        color: "#0f766e",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px"
                                    }}>
                                        <i className="fa-solid fa-stethoscope" style={{ color: "#0d9488" }}></i>
                                        <span><strong>Chief Complaint:</strong> {appointment.reason || appointment.symptoms}</span>
                                    </div>
                                )}
                            </div>
                        ))}

                        {!appointments.length && (
                            <div style={{ textAlign: "center", padding: "48px 20px", background: "#f8fafc", borderRadius: "16px", border: "1.5px dashed #cbd5e1" }}>
                                <div style={{ width: "56px", height: "56px", background: "#e0f2fe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px auto" }}>
                                    <i className="fa-regular fa-calendar-xmark" style={{ fontSize: "1.5rem", color: "#0284c7" }}></i>
                                </div>
                                <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontWeight: 700 }}>No {activeTab.toUpperCase()} Appointments</h3>
                                <p style={{ margin: 0, color: "#64748b", fontSize: "0.88rem" }}>
                                    There are no {activeTab} appointments for today ({today}).
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </DashboardLayout>
    );
};

export default Dashboard;
