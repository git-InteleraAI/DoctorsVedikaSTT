import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import "./Appointments.css";
import "../index.css";

const API = import.meta.env.VITE_NODE_API_URL;

export default function Appointments() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { doctor, loading: authLoading } = useAuth();

    // Query parameters / Filter State
    const activeTab = searchParams.get("tab") || "all";
    const dateFilter = searchParams.get("dateFilter") || "all";
    const customDate = searchParams.get("customDate") || "";

    const [searchQuery, setSearchQuery] = useState("");
    const [appointments, setAppointments] = useState([]);
    const [metrics, setMetrics] = useState({
        todayCount: 0,
        tomorrowCount: 0,
        pendingCount: 0,
        completedCount: 0,
        confirmedCount: 0,
        totalCount: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedAppointment, setSelectedAppointment] = useState(null);

    // Redirect if unauthenticated or incomplete onboarding
    useEffect(() => {
        if (!authLoading) {
            if (!doctor) {
                navigate("/login");
            } else if (!doctor.onboardingCompleted) {
                navigate("/onboarding");
            }
        }
    }, [doctor, authLoading, navigate]);

    // Fetch Metrics
    const loadMetrics = async () => {
        if (!doctor) return;
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const response = await axios.get(`${API}/api/appointments/metrics`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.data?.metrics) {
                setMetrics(response.data.metrics);
            }
        } catch (err) {
            console.warn("Failed to fetch appointment metrics:", err);
        }
    };

    // Fetch Appointments
    const loadAppointments = async () => {
        if (!doctor) return;
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const response = await axios.get(`${API}/api/appointments`, {
                params: {
                    tab: activeTab === "all" ? "" : activeTab,
                    dateFilter: dateFilter,
                    customDate: customDate,
                },
                headers: { Authorization: `Bearer ${token}` },
            });

            const fetchedData = Array.isArray(response.data?.appointments)
                ? response.data.appointments
                : Array.isArray(response.data)
                ? response.data
                : [];

            setAppointments(fetchedData);
        } catch (err) {
            console.error("Failed to fetch appointments:", err);
            setError("Unable to load appointments. Please check backend connection.");
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (doctor) {
            loadAppointments();
            loadMetrics();
        }
    }, [activeTab, dateFilter, customDate, doctor]);

    // Tab Switch handler
    const handleTabChange = (newTab) => {
        const params = new URLSearchParams(searchParams);
        if (newTab === "all") {
            params.delete("tab");
        } else {
            params.set("tab", newTab);
        }
        setSearchParams(params);
    };

    // Date Filter handler
    const handleDateFilterChange = (filter) => {
        const params = new URLSearchParams(searchParams);
        if (filter === "all") {
            params.delete("dateFilter");
            params.delete("customDate");
        } else {
            params.set("dateFilter", filter);
            if (filter !== "custom") {
                params.delete("customDate");
            }
        }
        setSearchParams(params);
    };

    // Custom Date handler
    const handleCustomDateChange = (e) => {
        const val = e.target.value;
        const params = new URLSearchParams(searchParams);
        params.set("dateFilter", "custom");
        params.set("customDate", val);
        setSearchParams(params);
    };

    // Status Update Action
    const handleStatusUpdate = async (appointmentId, newStatus) => {
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            await axios.patch(
                `${API}/api/appointments/${encodeURIComponent(appointmentId)}`,
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Optimistic update
            setAppointments((prev) =>
                prev.map((app) =>
                    app.id === appointmentId ? { ...app, status: newStatus } : app
                )
            );
            loadMetrics();
            if (selectedAppointment?.id === appointmentId) {
                setSelectedAppointment((prev) => ({ ...prev, status: newStatus }));
            }
        } catch (err) {
            console.error(`Failed to update status to ${newStatus}:`, err);
            alert("Could not update appointment status. Please try again.");
        }
    };

    // Filter appointments locally by search query and active tab
    const filteredAppointments = useMemo(() => {
        return appointments.filter((app) => {
            // Tab filter
            if (activeTab === "confirmed" && (app.status || "").toLowerCase() !== "confirmed") return false;
            if (activeTab === "pending" && (app.status || "").toLowerCase() !== "pending") return false;
            if (activeTab === "completed" && (app.status || "").toLowerCase() !== "completed") return false;
            if (activeTab === "cancelled" && (app.status || "").toLowerCase() !== "cancelled") return false;

            // Search query filter
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            const pName = (app.patientName || app.patient?.name || "").toLowerCase();
            const pCode = (app.patientCode || app.patient_code || app.patientId || "").toLowerCase();
            const pPhone = (app.patientPhone || app.phone || "").toLowerCase();
            const reason = (app.reason || app.symptoms || "").toLowerCase();

            return pName.includes(q) || pCode.includes(q) || pPhone.includes(q) || reason.includes(q);
        });
    }, [appointments, activeTab, searchQuery]);

    // Format helper for display dates
    const formatDisplayDate = (dateStr, timeStr) => {
        if (!dateStr) return "Scheduled Visit";
        try {
            const d = new Date(dateStr);
            const formattedDate = d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
            return timeStr ? `${formattedDate} • ${timeStr}` : formattedDate;
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <DashboardLayout
            activePage="appointments"
            searchPlaceholder="Search by patient name, code, reason..."
            searchValue={searchQuery}
            onSearchChange={(e) => setSearchQuery(e.target.value)}
        >
            <div className="appointments-container">
                {/* Header Banner */}
                <div className="appointments-header-banner">
                    <div className="appointments-title-group">
                        <h1>
                            <i className="fa-solid fa-calendar-check" style={{ color: "#01b6af" }}></i>
                            Appointments Directory
                        </h1>
                        <p>Manage, schedule, and launch clinical consultations for your patients.</p>
                    </div>

                    <div className="appointments-header-actions">
                        <button
                            className="btn-quick-action secondary"
                            onClick={() => navigate("/availability")}
                        >
                            <i className="fa-solid fa-clock"></i>
                            Manage Availability
                        </button>

                        <button
                            className="btn-quick-action primary"
                            onClick={() => navigate("/patients")}
                        >
                            <i className="fa-solid fa-user-plus"></i>
                            Add Patient / Walk-in
                        </button>
                    </div>
                </div>

                {/* KPI Metrics */}
                <div className="appointments-kpi-grid">
                    <div
                        className={`kpi-card ${activeTab === "all" ? "active-kpi" : ""}`}
                        onClick={() => handleTabChange("all")}
                    >
                        <div className="kpi-icon-wrapper today">
                            <i className="fa-solid fa-calendar-days"></i>
                        </div>
                        <div className="kpi-details">
                            <span className="kpi-label">Today's Visits</span>
                            <span className="kpi-value">{metrics.todayCount || 0}</span>
                        </div>
                    </div>

                    <div
                        className={`kpi-card ${activeTab === "confirmed" ? "active-kpi" : ""}`}
                        onClick={() => handleTabChange("confirmed")}
                    >
                        <div className="kpi-icon-wrapper tomorrow">
                            <i className="fa-solid fa-circle-check"></i>
                        </div>
                        <div className="kpi-details">
                            <span className="kpi-label">Confirmed / Upcoming</span>
                            <span className="kpi-value">{metrics.confirmedCount || metrics.tomorrowCount || 0}</span>
                        </div>
                    </div>

                    <div
                        className={`kpi-card ${activeTab === "completed" ? "active-kpi" : ""}`}
                        onClick={() => handleTabChange("completed")}
                    >
                        <div className="kpi-icon-wrapper completed">
                            <i className="fa-solid fa-square-check"></i>
                        </div>
                        <div className="kpi-details">
                            <span className="kpi-label">Completed Visits</span>
                            <span className="kpi-value">{metrics.completedCount || 0}</span>
                        </div>
                    </div>
                </div>

                {/* Toolbar & Filters */}
                <div className="appointments-toolbar">
                    <div className="search-input-group">
                        <i className="fa-solid fa-magnifying-glass search-icon"></i>
                        <input
                            type="text"
                            placeholder="Filter by patient name, ID, phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                className="clear-search-btn"
                                onClick={() => setSearchQuery("")}
                                title="Clear Search"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        )}
                    </div>

                    <div className="status-tabs-container">
                        <button
                            className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                            onClick={() => handleTabChange("all")}
                        >
                            All
                            <span className="tab-badge">{appointments.length}</span>
                        </button>
                        <button
                            className={`tab-btn ${activeTab === "confirmed" ? "active" : ""}`}
                            onClick={() => handleTabChange("confirmed")}
                        >
                            <i className="fa-solid fa-calendar-check" style={{ color: "#01b6af" }}></i>
                            Confirmed
                        </button>
                        <button
                            className={`tab-btn ${activeTab === "completed" ? "active" : ""}`}
                            onClick={() => handleTabChange("completed")}
                        >
                            <i className="fa-solid fa-circle-check" style={{ color: "#10b981" }}></i>
                            Completed
                        </button>
                        <button
                            className={`tab-btn ${activeTab === "cancelled" ? "active" : ""}`}
                            onClick={() => handleTabChange("cancelled")}
                        >
                            Cancelled
                        </button>
                    </div>

                    <div className="date-filter-group">
                        <select
                            className="date-select"
                            value={dateFilter}
                            onChange={(e) => handleDateFilterChange(e.target.value)}
                        >
                            <option value="all">All Dates</option>
                            <option value="today">Today</option>
                            <option value="tomorrow">Tomorrow</option>
                            <option value="custom">Custom Date</option>
                        </select>

                        {dateFilter === "custom" && (
                            <input
                                type="date"
                                className="custom-date-picker"
                                value={customDate}
                                onChange={handleCustomDateChange}
                            />
                        )}
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div
                        style={{
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            color: "#b91c1c",
                            padding: "14px 20px",
                            borderRadius: "14px",
                            fontSize: "0.9rem",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        {error}
                    </div>
                )}

                {/* Appointments List */}
                {loading ? (
                    <div
                        style={{
                            textAlign: "center",
                            padding: "60px 20px",
                            color: "#64748b",
                        }}
                    >
                        <i
                            className="fa-solid fa-circle-notch fa-spin"
                            style={{ fontSize: "2rem", color: "#01b6af", marginBottom: 12 }}
                        ></i>
                        <p style={{ margin: 0, fontWeight: 500 }}>Loading appointments...</p>
                    </div>
                ) : filteredAppointments.length === 0 ? (
                    <div className="appointments-empty-state">
                        <div className="empty-icon-circle">
                            <i className="fa-solid fa-calendar-xmark"></i>
                        </div>
                        <h3>No Appointments Found</h3>
                        <p>No appointments match your current status or date filter selection.</p>
                    </div>
                ) : (
                    <div className="appointments-list-container">
                        {filteredAppointments.map((app) => {
                            const pId = app.patientId || app.patient?.id || app.patient_id;
                            const pName = app.patientName || app.patient?.name || "Patient";
                            const pCode = app.patientCode || app.patient_code || (pId ? `ID: ${pId.slice(0, 8)}` : "Walk-in");
                            const pAvatar = app.patientAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(pName)}&background=01b6af&color=fff`;
                            const status = (app.status || "confirmed").toLowerCase();
                            const feeStatus = app.payment_status || app.feeStatus || "paid";

                            return (
                                <div className="appointment-card" key={app.id || app.appointmentId}>
                                    <div className="appointment-card-body">
                                        {/* Patient Info */}
                                        <div className="patient-info-block">
                                            <img
                                                src={pAvatar}
                                                alt={pName}
                                                className="patient-avatar"
                                                onError={(e) => {
                                                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(pName)}&background=01b6af&color=fff`;
                                                }}
                                            />

                                            <div className="patient-meta-details">
                                                <h3>
                                                    {pName}
                                                    <span className="patient-code-tag">{pCode}</span>
                                                </h3>

                                                <div className="patient-demographics">
                                                    {app.patientAge || app.age ? `${app.patientAge || app.age} yrs` : "Age N/A"} •{" "}
                                                    {app.patientGender || app.gender || "Gender N/A"} •{" "}
                                                    Blood: {app.bloodGroup || app.blood_group || "O+"}
                                                </div>

                                                <div className="complaint-pill">
                                                    <i className="fa-solid fa-stethoscope"></i>
                                                    {app.reason || app.symptoms || app.chiefComplaint || "General Medical Checkup"}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Slot & Badges */}
                                        <div className="appointment-slot-block">
                                            <div className="slot-time-badge">
                                                <i className="fa-regular fa-calendar" style={{ color: "#01b6af" }}></i>
                                                {formatDisplayDate(app.appointment_date || app.date, app.appointment_time || app.time)}
                                            </div>

                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                <span className={`fee-badge ${feeStatus === "paid" ? "paid" : "pending"}`}>
                                                    {feeStatus === "paid" ? "₹200 Paid" : "₹200 Pending"}
                                                </span>

                                                <span className={`status-badge ${status}`}>
                                                    <i className={`fa-solid fa-${status === "confirmed" ? "circle-check" : status === "pending" ? "clock" : status === "completed" ? "check-double" : "xmark"}`}></i>
                                                    {status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Bar */}
                                    <div className="appointment-card-actions">
                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                            <button
                                                className="btn-action-secondary"
                                                onClick={() => setSelectedAppointment(app)}
                                            >
                                                <i className="fa-solid fa-circle-info"></i>
                                                View Details
                                            </button>

                                            {status === "pending" && (
                                                <button
                                                    className="btn-action-secondary"
                                                    style={{ color: "#01b6af", borderColor: "#01b6af" }}
                                                    onClick={() => handleStatusUpdate(app.id, "confirmed")}
                                                >
                                                    <i className="fa-solid fa-check"></i>
                                                    Confirm
                                                </button>
                                            )}

                                            {status !== "completed" && status !== "cancelled" && (
                                                <button
                                                    className="btn-action-secondary"
                                                    style={{ color: "#10b981", borderColor: "#10b981" }}
                                                    onClick={() => handleStatusUpdate(app.id, "completed")}
                                                >
                                                    <i className="fa-solid fa-square-check"></i>
                                                    Mark Completed
                                                </button>
                                            )}

                                            {status !== "cancelled" && status !== "completed" && (
                                                <button
                                                    className="btn-action-danger"
                                                    onClick={() => handleStatusUpdate(app.id, "cancelled")}
                                                >
                                                    <i className="fa-solid fa-ban"></i>
                                                    Cancel
                                                </button>
                                            )}
                                        </div>

                                        {pId ? (
                                            <button
                                                className="btn-start-consultation"
                                                onClick={() => navigate(`/consultation/${encodeURIComponent(pId)}?appointmentId=${encodeURIComponent(app.id || "")}`, {
                                                    state: {
                                                        appointmentId: app.id,
                                                        patient: app,
                                                        symptoms: app.symptoms || app.reason,
                                                        duration: app.duration,
                                                        severity: app.severity,
                                                        current_medications: app.current_medications || app.currentMedications,
                                                        additional_notes: app.additional_notes || app.additionalNotes,
                                                    }
                                                })}
                                            >
                                                <span>Start Consultation</span>
                                                <i className="fa-solid fa-arrow-right"></i>
                                            </button>
                                        ) : (
                                            <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>No Patient Record Linked</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Appointment Details Modal */}
            {selectedAppointment && (
                <div className="modal-overlay" onClick={() => setSelectedAppointment(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Appointment Details</h2>
                            <button className="modal-close-btn" onClick={() => setSelectedAppointment(null)}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <div className="modal-body">
                            <div>
                                <strong style={{ color: "#082b68", display: "block", marginBottom: 4 }}>Patient Name:</strong>
                                <span>{selectedAppointment.patientName || selectedAppointment.patient?.name || "Unknown"}</span>
                            </div>

                            <div>
                                <strong style={{ color: "#082b68", display: "block", marginBottom: 4 }}>Scheduled Slot:</strong>
                                <span>{formatDisplayDate(selectedAppointment.appointment_date || selectedAppointment.date, selectedAppointment.appointment_time || selectedAppointment.time)}</span>
                            </div>

                            <div>
                                <strong style={{ color: "#082b68", display: "block", marginBottom: 4 }}>Reason for Consultation:</strong>
                                <span>{selectedAppointment.reason || selectedAppointment.symptoms || "General Medical Consultation"}</span>
                            </div>

                            <div>
                                <strong style={{ color: "#082b68", display: "block", marginBottom: 4 }}>Status:</strong>
                                <span style={{ textTransform: "uppercase", fontWeight: 700, color: "#01b6af" }}>
                                    {selectedAppointment.status || "Confirmed"}
                                </span>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button
                                className="btn-action-secondary"
                                onClick={() => setSelectedAppointment(null)}
                            >
                                Close
                            </button>

                            {(selectedAppointment.patientId || selectedAppointment.patient?.id) && (
                                <button
                                    className="btn-start-consultation"
                                    onClick={() => {
                                        const pId = selectedAppointment.patientId || selectedAppointment.patient?.id;
                                        const aptId = selectedAppointment.id;
                                        setSelectedAppointment(null);
                                        navigate(`/consultation/${encodeURIComponent(pId)}?appointmentId=${encodeURIComponent(aptId)}`, {
                                            state: {
                                                appointmentId: aptId,
                                                patient: selectedAppointment,
                                                symptoms: selectedAppointment.symptoms || selectedAppointment.reason,
                                                duration: selectedAppointment.duration,
                                                severity: selectedAppointment.severity,
                                                current_medications: selectedAppointment.current_medications || selectedAppointment.currentMedications,
                                                additional_notes: selectedAppointment.additional_notes || selectedAppointment.additionalNotes,
                                            }
                                        });
                                    }}
                                >
                                    Start Consultation <i className="fa-solid fa-arrow-right"></i>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
