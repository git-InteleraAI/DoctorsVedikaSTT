import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import "./Appointments.css";
import { getApiBaseUrl } from "../utils/apiConfig";

const API = getApiBaseUrl();

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

    // Redirect if unauthenticated
    useEffect(() => {
        if (!authLoading) {
            if (!doctor) {
                navigate("/login");
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
            const rawStatus = (app.status || "").toLowerCase();
            const rawVisitStage = (app.visitStage || app.visit_stage || "").toLowerCase();
            const isCompleted = rawStatus === "completed" || rawVisitStage === "completed" || rawVisitStage === "exited";
            const effectiveStatus = isCompleted ? "completed" : rawStatus;

            // Tab filter
            if (activeTab === "confirmed" && (isCompleted || effectiveStatus !== "confirmed")) return false;
            if (activeTab === "pending" && (isCompleted || effectiveStatus !== "pending")) return false;
            if (activeTab === "completed" && !isCompleted) return false;
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
                            const pId = app.patientId || app.patient?.id || app.patient_id || app.hospital_patient_id || app.id;
                            const pName = app.patientName || app.patient?.name || app.patient_name || "Walk-in Patient";
                            const pCode = app.patientCode || app.patient_code || (app.hospital_patient_id ? `DV-P-${app.hospital_patient_id.slice(0, 6).toUpperCase()}` : `ID: ${String(pId).slice(0, 8)}`);
                            const pAvatar = app.patientAvatar || app.profile_photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(pName)}&background=01b6af&color=fff`;
                            const rawStatus = (app.status || "confirmed").toLowerCase();
                            const visitStage = (app.visitStage || app.visit_stage || "").toLowerCase();
                            const isCompleted = rawStatus === "completed" || visitStage === "completed" || visitStage === "exited";
                            const status = isCompleted ? "completed" : rawStatus;
                            const feeStatus = app.payment_status || app.feeStatus || "pending";

                            const handleViewSummary = (appointmentItem) => {
                                const encounterId = appointmentItem.visitId || appointmentItem.visit_id || appointmentItem.hospital_patient_id || appointmentItem.patientId || appointmentItem.patient_id || appointmentItem.id;
                                const queryParams = new URLSearchParams();
                                if (appointmentItem.id) queryParams.set("appointmentId", appointmentItem.id);
                                if (appointmentItem.visitId || appointmentItem.visit_id) queryParams.set("visitId", appointmentItem.visitId || appointmentItem.visit_id);
                                if (appointmentItem.patientId || appointmentItem.patient_id) queryParams.set("patientId", appointmentItem.patientId || appointmentItem.patient_id);

                                navigate(`/consultation/${encodeURIComponent(encounterId)}/summary?${queryParams.toString()}`, {
                                    state: {
                                        appointmentId: appointmentItem.id,
                                        visitId: appointmentItem.visitId || appointmentItem.visit_id,
                                        hospitalPatientId: appointmentItem.hospital_patient_id,
                                        patientId: appointmentItem.patientId || appointmentItem.patient_id || null,
                                        patient: appointmentItem,
                                        consultationCompleted: true,
                                    }
                                });
                            };

                            const handleStartConsultation = (appointmentItem) => {
                                const encounterId = appointmentItem.visitId || appointmentItem.visit_id || appointmentItem.hospital_patient_id || appointmentItem.patientId || appointmentItem.patient_id || appointmentItem.id;
                                
                                const isItemCompleted = (appointmentItem.status || "").toLowerCase() === "completed" || 
                                    (appointmentItem.visitStage || appointmentItem.visit_stage || "").toLowerCase() === "completed" || 
                                    (appointmentItem.visitStage || appointmentItem.visit_stage || "").toLowerCase() === "exited";

                                if (isItemCompleted) {
                                    handleViewSummary(appointmentItem);
                                    return;
                                }

                                const queryParams = new URLSearchParams();
                                if (appointmentItem.id) queryParams.set("appointmentId", appointmentItem.id);
                                if (appointmentItem.visitId || appointmentItem.visit_id) queryParams.set("visitId", appointmentItem.visitId || appointmentItem.visit_id);

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
                                }).catch((e) => console.warn("Transition notice:", e));

                                navigate(`/consultation/${encodeURIComponent(encounterId)}?${queryParams.toString()}`, {
                                    state: {
                                        appointmentId: appointmentItem.id,
                                        visitId: appointmentItem.visitId || appointmentItem.visit_id,
                                        hospitalPatientId: appointmentItem.hospital_patient_id,
                                        patientId: appointmentItem.patientId || appointmentItem.patient_id || null,
                                        patient: appointmentItem,
                                        symptoms: appointmentItem.symptoms || appointmentItem.reason,
                                        duration: appointmentItem.duration,
                                        severity: appointmentItem.severity,
                                        current_medications: appointmentItem.current_medications || appointmentItem.currentMedications,
                                        additional_notes: appointmentItem.additional_notes || appointmentItem.additionalNotes,
                                    }
                                });
                            };

                            return (
                                <div 
                                    key={app.id || app.appointmentId} 
                                    className="classic-card appointment-card" 
                                    style={{ 
                                        display: "flex", 
                                        flexDirection: "column",
                                        justifyContent: "space-between",
                                        padding: "20px",
                                        borderRadius: "14px",
                                        border: "1px solid #e2e8f0",
                                        background: "#ffffff",
                                        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                                        transition: "all 0.2s ease-in-out"
                                    }}
                                >
                                    {/* TOP CARD CONTENT */}
                                    <div>
                                        {/* Patient Info Profile */}
                                        <div style={{ display: "flex", gap: "14px", alignItems: "center", marginBottom: "12px" }}>
                                            <img 
                                                src={pAvatar} 
                                                alt={pName} 
                                                style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0", flexShrink: 0 }}
                                                onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(pName)}&background=0d9488&color=fff`; }} 
                                            />
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <h3 style={{ margin: "0 0 2px 0", fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {pName}
                                                </h3>
                                                <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {pCode}
                                                    {(app.patientAge || app.age) ? ` • ${app.patientAge || app.age} yrs` : ""}
                                                    {(app.patientGender || app.gender) ? ` • ${app.patientGender || app.gender}` : ""}
                                                    {(app.bloodGroup || app.blood_group) ? ` • ${app.bloodGroup || app.blood_group}` : ""}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Reason / Chief Complaint Pill */}
                                        <div style={{ 
                                            margin: "8px 0 12px 0", 
                                            color: "#0f766e", 
                                            fontSize: "0.82rem", 
                                            background: "#f0fdfa", 
                                            border: "1px solid #ccfbf1",
                                            padding: "6px 12px", 
                                            borderRadius: "8px", 
                                            fontWeight: 500,
                                            display: "flex",
                                            alignItems: "flex-start",
                                            gap: "8px",
                                            lineHeight: 1.35
                                        }}>
                                            <i className="fa-solid fa-stethoscope" style={{ color: "#0d9488", marginTop: "2px", flexShrink: 0 }}></i>
                                            <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                                {app.reason || app.symptoms || app.chiefComplaint || "General Medical Checkup"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* BOTTOM CARD ACTIONS & METADATA */}
                                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", marginTop: "10px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                                                <i className="fa-regular fa-calendar" style={{ color: "#0d9488" }}></i>
                                                <span>
                                                    {formatDisplayDate(app.appointment_date || app.date, app.appointment_time || app.time)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                                            {status === "completed" || visitStage === "completed" || visitStage === "exited" ? (
                                                <>
                                                    <button
                                                        onClick={() => navigate(`/patients/${encodeURIComponent(pId)}`)}
                                                        style={{
                                                            flex: 1,
                                                            background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", padding: "8px 12px",
                                                            borderRadius: "8px", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", transition: "background 0.2s"
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = "#f8fafc"}
                                                    >
                                                        Patient Record
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const consId = app.visitId || app.visit_id || app.id;
                                                            const pdfTarget = `${API}/api/v1/clinical/notes/${encodeURIComponent(pId)}/${encodeURIComponent(consId)}/pdf`;
                                                            window.open(pdfTarget, "_blank", "noopener,noreferrer");
                                                        }}
                                                        style={{
                                                            flex: 1,
                                                            background: "#16a34a", color: "#fff", border: "none", padding: "8px 12px",
                                                            borderRadius: "8px", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                                                        }}
                                                    >
                                                        <i className="fa-solid fa-file-pdf"></i> View PDF
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => setSelectedAppointment(app)}
                                                        style={{
                                                            background: "#f8fafc", color: "#475569", border: "1px solid #cbd5e1", padding: "8px 12px",
                                                            borderRadius: "8px", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer"
                                                        }}
                                                    >
                                                        Details
                                                    </button>
                                                    <button
                                                        onClick={() => handleStartConsultation(app)}
                                                        style={{
                                                            flex: 1,
                                                            background: "#0d9488", color: "#fff", border: "none", padding: "10px 14px",
                                                            borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                                                            fontSize: "0.88rem", boxShadow: "0 2px 6px rgba(13,148,136,0.2)"
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = "#0f766e"}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = "#0d9488"}
                                                    >
                                                        {visitStage === "in_consultation" ? "In Consultation" : "Start Consultation"} <i className="fa-solid fa-arrow-right" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
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
                                <span>{selectedAppointment.patientName || selectedAppointment.patient_name || selectedAppointment.patient?.name || "Unknown"}</span>
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

                            {String(selectedAppointment.status || "").toLowerCase() === "completed" ? (
                                <button
                                    className="btn-start-consultation"
                                    style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
                                    onClick={() => {
                                        const targetPId = selectedAppointment.patientId || selectedAppointment.patient_id || selectedAppointment.hospital_patient_id || selectedAppointment.id;
                                        setSelectedAppointment(null);
                                        navigate(`/patients/${encodeURIComponent(targetPId)}`);
                                    }}
                                >
                                    View Patient Record <i className="fa-solid fa-arrow-right"></i>
                                </button>
                            ) : (
                                <button
                                    className="btn-start-consultation"
                                    onClick={() => {
                                        const targetPId = selectedAppointment.patientId || selectedAppointment.patient_id || selectedAppointment.hospital_patient_id || selectedAppointment.id;
                                        const aptId = selectedAppointment.id;
                                        setSelectedAppointment(null);

                                        const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token") || localStorage.getItem("doctor_token");
                                        fetch(`${API}/api/v1/queue/transition`, {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                ...(token ? { Authorization: `Bearer ${token}` } : {})
                                            },
                                            body: JSON.stringify({
                                                visitId: selectedAppointment.visitId || selectedAppointment.visit_id || targetPId,
                                                targetStage: "in_consultation"
                                            })
                                        }).catch((e) => console.warn("Transition notice:", e));

                                        navigate(`/consultation/${encodeURIComponent(targetPId)}?appointmentId=${encodeURIComponent(aptId)}`, {
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
