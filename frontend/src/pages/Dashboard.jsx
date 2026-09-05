import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import "../index.css";

const API = import.meta.env.VITE_NODE_API_URL;

const Dashboard = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { doctor, loading: authLoading } = useAuth();

    // Filters State
    const initialTab = searchParams.get("tab") || "confirmed";
    const initialDateFilter = searchParams.get("dateFilter") || "all";
    const initialCustomDate = searchParams.get("customDate") || "";

    const [activeTab, setActiveTab] = useState(initialTab);
    const [dateFilter, setDateFilter] = useState(initialDateFilter);
    const [customDate, setCustomDate] = useState(initialCustomDate);

    // Data State
    const [appointments, setAppointments] = useState([]);
    const [completedRecords, setCompletedRecords] = useState({});
    const [metrics, setMetrics] = useState({ todayCount: 0, tomorrowCount: 0, pendingCount: 0, completedCount: 0, confirmedCount: 0 });
    const [upcomingFollowUps, setUpcomingFollowUps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [error, setError] = useState("");
    

    const switchTab = (tabName) => {
        setActiveTab(tabName);
        setSearchParams({ tab: tabName, dateFilter, customDate });
    };

    const handleDateFilterChange = (filter) => {
        setDateFilter(filter);
        if (filter !== "custom") {
            setCustomDate("");
            setSearchParams({ tab: activeTab, dateFilter: filter });
        } else {
            setSearchParams({ tab: activeTab, dateFilter: filter, customDate });
        }
    };

    const handleCustomDateChange = (e) => {
        const dateStr = e.target.value;
        setCustomDate(dateStr);
        setSearchParams({ tab: activeTab, dateFilter: "custom", customDate: dateStr });
    };

    const loadMetrics = async () => {
        if (!doctor) return;
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const response = await axios.get(`${API}/api/appointments/metrics`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data?.metrics) {
                setMetrics(response.data.metrics);
            }
            if (response.data?.upcomingFollowUps) {
                setUpcomingFollowUps(response.data.upcomingFollowUps);
            }
        } catch (err) {
            console.warn("Failed to fetch metrics", err);
        }
    };

    const loadAppointments = async () => {
        if (!doctor) return;
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const response = await axios.get(`${API}/api/appointments`, {
                params: {
                    tab: activeTab,
                    dateFilter: dateFilter,
                    customDate: customDate
                },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            setAppointments(Array.isArray(response.data.appointments) ? response.data.appointments : []);
        } catch (err) {
            console.error("Failed to fetch appointments", err);
            setError("Unable to load appointments. Make sure the backend is running.");
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    };

    const loadCompletedRecords = async (items) => {
        if (activeTab !== "completed") return;
        
        const completed = items.filter((item) => item.patientId || item.patient_id);
        if (!completed.length) {
            setCompletedRecords({});
            return;
        }
        
        setRecordsLoading(true);
        const entries = await Promise.all(
            completed.map(async (appointment) => {
                const pid = appointment.patientId || appointment.patient_id;
                try {
                    const response = await axios.get(`${API}/api/v1/clinical/notes/${encodeURIComponent(pid)}`);
                    const records = response.data?.records || [];
                    return [pid, records[0] || null];
                } catch (err) {
                    console.warn("Unable to load completed patient record", pid, err);
                    return [pid, null];
                }
            })
        );
        setCompletedRecords(Object.fromEntries(entries));
        setRecordsLoading(false);
    };

    useEffect(() => {
        if (!authLoading) {
            if (!doctor) {
                navigate("/login");
            } else if (!doctor.onboardingCompleted) {
                navigate("/onboarding");
            }
        }
    }, [doctor, authLoading, navigate]);

    useEffect(() => {
        if (doctor) {
            loadAppointments();
            loadMetrics();
        }
    }, [activeTab, dateFilter, customDate, doctor]);

    useEffect(() => {
        if (!loading && activeTab === "completed") {
            loadCompletedRecords(appointments);
        }
    }, [loading, appointments, activeTab]);

    const openConsultation = (appointment) => {
        if (!appointment.patientId) {
            setError("This appointment does not have a patient ID.");
            return;
        }
        navigate(`/consultation/${encodeURIComponent(appointment.patientId)}?appointmentId=${encodeURIComponent(appointment.id)}`, {
            state: {
                appointmentId: appointment.id,
                patient: appointment,
                doctorId: doctor?.id || "default-doctor",
            },
        });
    };

    const patientRecord = (appointment) => completedRecords[appointment.patientId || appointment.patient_id];

    return (
        <DashboardLayout
            activePage="dashboard"
            dashboardTab={activeTab}
            onDashboardTab={switchTab}
        >
            {/* SUMMARY STAT CARDS GRID */}
            <section style={{ marginBottom: "24px" }}>
                <div className="responsive-grid-auto">
                    <div style={{ background: "#ffffff", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", justifyBetween: "space-between" }}>
                            <span>Today's Consultations</span>
                            <i className="fa-solid fa-stethoscope" style={{ color: "#01b6af", fontSize: "1rem" }}></i>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, color: "#082b68", marginTop: "8px" }}>{metrics.todayCount || 0}</div>
                    </div>
                    <div style={{ background: "#ffffff", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", justifyBetween: "space-between" }}>
                            <span>Tomorrow's Bookings</span>
                            <i className="fa-regular fa-calendar-days" style={{ color: "#01b6af", fontSize: "1rem" }}></i>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, color: "#01b6af", marginTop: "8px" }}>{metrics.tomorrowCount || 0}</div>
                    </div>
                    <div style={{ background: "#ffffff", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", justifyBetween: "space-between" }}>
                            <span>Pending Consultations</span>
                            <i className="fa-regular fa-clock" style={{ color: "#d97706", fontSize: "1rem" }}></i>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, color: "#d97706", marginTop: "8px" }}>{metrics.pendingCount || 0}</div>
                    </div>
                    <div style={{ background: "#ffffff", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", justifyBetween: "space-between" }}>
                            <span>Completed Visits</span>
                            <i className="fa-regular fa-circle-check" style={{ color: "#16a34a", fontSize: "1rem" }}></i>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, color: "#16a34a", marginTop: "8px" }}>{metrics.completedCount || 0}</div>
                    </div>
                    <div onClick={() => navigate("/availability")} style={{ background: "linear-gradient(135deg, #082b68 0%, #01b6af 100%)", borderRadius: "14px", padding: "20px", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 4px 12px rgba(1,182,175,0.2)" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, opacity: 0.9 }}><i className="fa-solid fa-clock"></i> Quick Action</div>
                        <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span>Manage Availability</span>
                            <i className="fa-solid fa-arrow-right"></i>
                        </div>
                    </div>
                </div>
            </section>

            {error && (
                <div style={{ margin: "12px 0", padding: "14px 20px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontWeight: 500 }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "8px" }}></i> {error}
                </div>
            )}

            {/* APPOINTMENTS SECTION */}
            <section className="classic-section fade-in">
                {/* TOP TAB SWITCHER (For mobile / quick access) */}
                <div className="tab-navigation-bar responsive-flex-wrap" style={{ margin: "0 0 24px 0", gap: "10px" }}>
                    <button type="button" onClick={() => switchTab("confirmed")} style={tabButtonStyle(activeTab === "confirmed", "cyan")}>
                        <i className="fa-solid fa-calendar-check" /> Upcoming
                    </button>
                    <button type="button" onClick={() => switchTab("pending")} style={tabButtonStyle(activeTab === "pending", "orange")}>
                        <i className="fa-solid fa-clock-rotate-left" /> Pending
                    </button>
                    <button type="button" onClick={() => switchTab("completed")} style={tabButtonStyle(activeTab === "completed", "green")}>
                        <i className="fa-solid fa-circle-check" /> Completed
                    </button>
                </div>

                {/* DATE FILTER HEADER */}
                <div className="responsive-flex-between" style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: "20px", marginBottom: "20px" }}>
                    <div>
                        <h2 style={{ fontSize: "1.3rem", color: "#0f172a", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                            {activeTab === "confirmed" && <><i className="fa-solid fa-calendar-check" style={{ color: "#0d9488" }} /> Confirmed Appointments</>}
                            {activeTab === "pending" && <><i className="fa-solid fa-clock-rotate-left" style={{ color: "#d97706" }} /> Pending Consultations</>}
                            {activeTab === "completed" && <><i className="fa-solid fa-circle-check" style={{ color: "#16a34a" }} /> Completed Consultations</>}
                        </h2>
                        <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: "0.9rem" }}>
                            {activeTab === "confirmed" && "Manage your upcoming scheduled patients."}
                            {activeTab === "pending" && "Patients waiting for consultation completion."}
                            {activeTab === "completed" && "Review past consultations and reports."}
                        </p>
                    </div>

                    {/* DATE FILTER UI (Dropdown Style) */}
                    <div style={{ display: "flex", alignItems: "center", background: "#f8fafc", padding: "4px", borderRadius: "10px", border: "1px solid #e2e8f0", gap: "8px" }}>
                        <select 
                            value={dateFilter}
                            onChange={(e) => handleDateFilterChange(e.target.value)}
                            style={{
                                padding: "8px 12px",
                                borderRadius: "8px",
                                border: "none",
                                background: "transparent",
                                color: "#0f172a",
                                fontWeight: 600,
                                fontSize: "0.9rem",
                                cursor: "pointer",
                                outline: "none",
                                fontFamily: "inherit"
                            }}
                        >
                            <option value="all">All Dates</option>
                            <option value="today">Today</option>
                            <option value="tomorrow">Tomorrow</option>
                            <option value="custom">Select Date...</option>
                        </select>
                        
                        {dateFilter === "custom" && (
                            <div style={{ position: "relative" }}>
                                <input 
                                    type="date" 
                                    value={customDate}
                                    onChange={handleCustomDateChange}
                                    min={new Date().toISOString().split("T")[0]}
                                    style={{
                                        padding: "6px 10px",
                                        borderRadius: "8px",
                                        border: "1px solid #0d9488",
                                        background: "#fff",
                                        color: "#0f172a",
                                        fontWeight: 600,
                                        fontSize: "0.85rem",
                                        cursor: "pointer",
                                        outline: "none",
                                        fontFamily: "inherit"
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                        <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#0d9488", marginBottom: "16px" }}></i>
                        <p>Loading appointments...</p>
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: "16px" }}>
                        {appointments.map((app) => (
                            <div key={app.id} className="classic-card" style={{ 
                                display: "flex", 
                                flexDirection: "column",
                            }}>
                                <div className="appointment-card-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
                                    
                                    {/* Patient Info Profile */}
                                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                                        <img 
                                            src={app.patientPhoto || "/images/human.png"} 
                                            alt="Patient" 
                                            style={{ width: "56px", height: "56px", borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0" }}
                                            onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.patientName || "Patient")}&background=0d9488&color=fff`; }} 
                                        />
                                        <div>
                                            <h3 style={{ margin: "0 0 4px 0", fontSize: "1.15rem", fontWeight: 700, color: "#0f172a" }}>{app.patientName}</h3>
                                            <p style={{ margin: 0, fontSize: "0.88rem", color: "#64748b" }}>
                                                {app.patientCode || app.patientId || "No ID"} • {app.age ? `${app.age} yrs` : "Age —"} • {app.gender || "—"} • {app.bloodGroup || "—"}
                                            </p>
                                            {app.reason && <p style={{ margin: "6px 0 0 0", color: "#334155", fontSize: "0.85rem", background: "#f1f5f9", padding: "4px 10px", borderRadius: "6px", display: "inline-block", fontWeight: 500 }}>
                                                <i className="fa-solid fa-stethoscope" style={{ color: "#0d9488", marginRight: "6px" }}></i> {app.reason}
                                            </p>}
                                        </div>
                                    </div>

                                    {/* Appointment Info & Action */}
                                    <div className="appointment-card-actions" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "12px", minWidth: "220px" }}>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
                                                <i className="fa-regular fa-calendar" style={{ color: "#0d9488", marginRight: "6px" }}></i> 
                                                {new Date(app.appointmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} • {app.time}
                                            </div>
                                            <div style={{ color: "#64748b", fontSize: "0.88rem", display: "flex", gap: "10px", justifyContent: "flex-end", alignItems: "center" }}>
                                                <span>₹{app.consultationFee || doctor?.consultationFee}</span>
                                                <span style={{ 
                                                    background: app.paymentStatus === 'paid' ? "#f0fdf4" : "#fff7ed", 
                                                    color: app.paymentStatus === 'paid' ? "#16a34a" : "#c2410c",
                                                    border: `1px solid ${app.paymentStatus === 'paid' ? '#bbf7d0' : '#fed7aa'}`,
                                                    padding: "2px 8px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 600 
                                                }}>
                                                    {app.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* Action Buttons */}
                                        {activeTab !== "completed" ? (
                                            <button 
                                                onClick={() => openConsultation(app)}
                                                style={{
                                                    background: "#0d9488", color: "#fff", border: "none", padding: "9px 18px",
                                                    borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                                                    fontSize: "0.9rem", transition: "background 0.2s", boxShadow: "0 2px 4px rgba(13,148,136,0.2)"
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = "#0f766e"}
                                                onMouseLeave={(e) => e.currentTarget.style.background = "#0d9488"}
                                            >
                                                Start Consultation <i className="fa-solid fa-arrow-right" style={{ fontSize: "0.85rem" }} />
                                            </button>
                                        ) : (
                                            <div style={{ display: "flex", gap: "8px" }}>
                                                <button 
                                                    onClick={() => navigate(`/patients/${encodeURIComponent(app.patientId)}`)}
                                                    style={{
                                                        background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", padding: "8px 14px",
                                                        borderRadius: "8px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", transition: "background 0.2s"
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = "#f8fafc"}
                                                >
                                                    Patient Record
                                                </button>
                                                {patientRecord(app) && (
                                                    <button 
                                                        onClick={() => {
                                                            const record = patientRecord(app);
                                                            const pdfTarget = record.pdfUrl
                                                                ? (record.pdfUrl.startsWith("http") ? record.pdfUrl : `${API}${record.pdfUrl}`)
                                                                : `${API}/api/v1/clinical/notes/${encodeURIComponent(app.patientId)}/${encodeURIComponent(record.consultationId)}/pdf`;
                                                            window.open(pdfTarget, "_blank", "noopener,noreferrer");
                                                        }}
                                                        style={{
                                                            background: "#16a34a", color: "#fff", border: "none", padding: "8px 14px",
                                                            borderRadius: "8px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px"
                                                        }}
                                                    >
                                                        <i className="fa-solid fa-file-pdf"></i> View PDF
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {!appointments.length && (
                            <div style={{ textAlign: "center", padding: "50px 20px", background: "#f8fafc", borderRadius: "14px", border: "1px dashed #cbd5e1" }}>
                                <div style={{ width: "64px", height: "64px", background: "#e0f2fe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
                                    <i className="fa-regular fa-calendar-xmark" style={{ fontSize: "1.6rem", color: "#0284c7" }}></i>
                                </div>
                                <h3 style={{ margin: "0 0 6px 0", color: "#0f172a", fontWeight: 700 }}>No Appointments Found</h3>
                                <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
                                    There are no {activeTab} appointments for the selected date.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </DashboardLayout>
    );
};

const dateBtnStyle = (active) => ({
    background: active ? "#ffffff" : "transparent",
    color: active ? "#08AEB8" : "#64748b",
    border: "none",
    padding: "8px 16px",
    borderRadius: "10px",
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    boxShadow: active ? "0 2px 4px rgba(0,0,0,0.04)" : "none",
    transition: "all 0.2s"
});

// sidebarBtnStyle and sidebarItemStyle moved to shared Sidebar component

const tabButtonStyle = (active, theme) => {
    let activeColor = "#0d9488";
    let activeBg = "#f0fdf4";
    let activeBorder = "#99f6e4";
    
    if (theme === "orange") {
        activeColor = "#c2410c"; activeBg = "#fff7ed"; activeBorder = "#fed7aa";
    } else if (theme === "green") {
        activeColor = "#15803d"; activeBg = "#f0fdf4"; activeBorder = "#bbf7d0";
    }

    return {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        borderRadius: "10px",
        border: `1px solid ${active ? activeBorder : "#e2e8f0"}`,
        background: active ? activeBg : "#ffffff",
        color: active ? activeColor : "#64748b",
        cursor: "pointer",
        fontWeight: active ? 700 : 600,
        fontSize: "0.88rem",
        transition: "all 0.2s ease",
        boxShadow: active ? "none" : "0 1px 2px rgba(0,0,0,0.03)"
    };
};

export default Dashboard;
