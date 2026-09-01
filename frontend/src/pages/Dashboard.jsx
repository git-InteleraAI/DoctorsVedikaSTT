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
        
        const completed = items.filter((item) => item.patientId);
        if (!completed.length) {
            setCompletedRecords({});
            return;
        }
        
        setRecordsLoading(true);
        const entries = await Promise.all(
            completed.map(async (appointment) => {
                try {
                    const response = await axios.get(`${API}/api/v1/clinical/notes/${encodeURIComponent(appointment.patientId)}`);
                    const records = response.data?.records || [];
                    return [appointment.patientId, records[0] || null];
                } catch (err) {
                    console.warn("Unable to load completed patient record", appointment.patientId, err);
                    return [appointment.patientId, null];
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

    const patientRecord = (appointment) => completedRecords[appointment.patientId];

    return (
        <DashboardLayout
            activePage="dashboard"
            dashboardTab={activeTab}
            onDashboardTab={switchTab}
        >
            {/* SUMMARY STAT CARDS GRID */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                        <div style={{ background: "#ffffff", borderRadius: "16px", padding: "18px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
                            <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600 }}>Today's Consultations</div>
                            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--navy-deep)", marginTop: "4px" }}>{metrics.todayCount || 0}</div>
                        </div>
                        <div style={{ background: "#ffffff", borderRadius: "16px", padding: "18px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
                            <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600 }}>Tomorrow's Bookings</div>
                            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#08AEB8", marginTop: "4px" }}>{metrics.tomorrowCount || 0}</div>
                        </div>
                        <div style={{ background: "#ffffff", borderRadius: "16px", padding: "18px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
                            <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600 }}>Pending Consultations</div>
                            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f59e0b", marginTop: "4px" }}>{metrics.pendingCount || 0}</div>
                        </div>
                        <div style={{ background: "#ffffff", borderRadius: "16px", padding: "18px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
                            <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600 }}>Completed Visits</div>
                            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>{metrics.completedCount || 0}</div>
                        </div>
                        <div onClick={() => navigate("/availability")} style={{ background: "linear-gradient(135deg, #082B68 0%, #08AEB8 100%)", borderRadius: "16px", padding: "18px", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                            <div style={{ fontSize: "0.85rem", fontWeight: 600, opacity: 0.9 }}><i className="fa-solid fa-clock"></i> Quick Action</div>
                            <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: "8px" }}>Manage Availability &rarr;</div>
                        </div>
                    </div>

                    {error && (
                        <div style={{ margin: "12px 0", padding: "14px 20px", borderRadius: 12, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#ef4444", fontWeight: 500 }}>
                            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "8px" }}></i> {error}
                        </div>
                    )}

                    {/* TOP TAB SWITCHER (For mobile / quick access) */}
                    <div className="tab-navigation-bar" style={{ display: "flex", gap: "12px", margin: "0 0 24px 0", flexWrap: "wrap" }}>
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

                    <section className="glass-panel fade-in" style={{ background: "#ffffff", borderRadius: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.03)", padding: "24px", border: "1px solid rgba(8,174,184,0.1)" }}>
                        {/* DATE FILTER HEADER */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "20px", marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
                            <div>
                                <h2 style={{ color: "var(--navy-deep)", fontSize: "1.4rem", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                                    {activeTab === "confirmed" && <><i className="fa-solid fa-calendar-check" style={{ color: "#08AEB8" }} /> Confirmed Appointments</>}
                                    {activeTab === "pending" && <><i className="fa-solid fa-clock-rotate-left" style={{ color: "#f59e0b" }} /> Pending Consultations</>}
                                    {activeTab === "completed" && <><i className="fa-solid fa-circle-check" style={{ color: "#10B981" }} /> Completed Consultations</>}
                                </h2>
                                <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: "0.95rem" }}>
                                    {activeTab === "confirmed" && "Manage your upcoming scheduled patients."}
                                    {activeTab === "pending" && "Patients waiting for consultation completion."}
                                    {activeTab === "completed" && "Review past consultations and reports."}
                                </p>
                            </div>

                            {/* DATE FILTER UI (Dropdown Style) */}
                            <div style={{ display: "flex", alignItems: "center", background: "#f8fafc", padding: "6px", borderRadius: "14px", border: "1px solid #e2e8f0", gap: "8px" }}>
                                <select 
                                    value={dateFilter}
                                    onChange={(e) => handleDateFilterChange(e.target.value)}
                                    style={{
                                        padding: "8px 12px",
                                        borderRadius: "10px",
                                        border: "1px solid transparent",
                                        background: "transparent",
                                        color: "var(--navy-deep)",
                                        fontWeight: 600,
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
                                            min={new Date().toISOString().split("T")[0]} // Disable past dates
                                            style={{
                                                padding: "8px 12px",
                                                borderRadius: "10px",
                                                border: "2px solid #08AEB8",
                                                background: "#fff",
                                                color: "var(--navy-deep)",
                                                fontWeight: 600,
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
                                <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#08AEB8", marginBottom: "16px" }}></i>
                                <p>Loading appointments...</p>
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: "16px" }}>
                                {appointments.map((app) => (
                                    <div key={app.id} style={{ 
                                        display: "flex", 
                                        flexDirection: "column",
                                        background: "#ffffff", 
                                        border: "1px solid #e2e8f0", 
                                        borderRadius: "16px", 
                                        padding: "20px", 
                                        boxShadow: "0 4px 6px rgba(0,0,0,0.02)",
                                        transition: "transform 0.2s, box-shadow 0.2s"
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 15px rgba(8,174,184,0.08)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 6px rgba(0,0,0,0.02)"; }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
                                            
                                            {/* Patient Info Profile */}
                                            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                                                <img 
                                                    src={app.patientPhoto || "/images/human.png"} 
                                                    alt="Patient" 
                                                    style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0" }}
                                                    onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.patientName || "Patient")}&background=08AEB8&color=fff`; }} 
                                                />
                                                <div>
                                                    <h3 style={{ margin: "0 0 4px 0", color: "var(--navy-deep)", fontSize: "1.2rem", fontWeight: 700 }}>{app.patientName}</h3>
                                                    <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
                                                        {app.patientCode || app.patientId || "No ID"} • {app.age ? `${app.age} yrs` : "Age —"} • {app.gender || "—"} • {app.bloodGroup || "—"}
                                                    </p>
                                                    {app.reason && <p style={{ margin: "6px 0 0 0", color: "#475569", fontSize: "0.9rem", background: "#f1f5f9", padding: "4px 8px", borderRadius: "6px", display: "inline-block" }}>
                                                        <i className="fa-solid fa-stethoscope" style={{ color: "#08AEB8", marginRight: "6px" }}></i> {app.reason}
                                                    </p>}
                                                </div>
                                            </div>

                                            {/* Appointment Info & Action */}
                                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "12px", minWidth: "220px" }}>
                                                <div style={{ textAlign: "right" }}>
                                                    <div style={{ color: "var(--navy-deep)", fontWeight: 700, fontSize: "1.1rem", marginBottom: "4px" }}>
                                                        <i className="fa-regular fa-calendar" style={{ color: "#08AEB8", marginRight: "6px" }}></i> 
                                                        {new Date(app.appointmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} • {app.time}
                                                    </div>
                                                    <div style={{ color: "#64748b", fontSize: "0.9rem", display: "flex", gap: "10px", justifyContent: "flex-end", alignItems: "center" }}>
                                                        <span><i className="fa-solid fa-tag"></i> ₹{app.consultationFee || doctor?.consultationFee}</span>
                                                        <span style={{ 
                                                            background: app.paymentStatus === 'paid' ? "#dcfce7" : "#fef3c7", 
                                                            color: app.paymentStatus === 'paid' ? "#16a34a" : "#d97706",
                                                            padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 
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
                                                            background: "#08AEB8", color: "#fff", border: "none", padding: "10px 20px",
                                                            borderRadius: "10px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                                                            transition: "background 0.2s", boxShadow: "0 4px 10px rgba(8,174,184,0.3)"
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = "#068f98"}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = "#08AEB8"}
                                                    >
                                                        Start Consultation <i className="fa-solid fa-arrow-right" />
                                                    </button>
                                                ) : (
                                                    <div style={{ display: "flex", gap: "8px" }}>
                                                        <button 
                                                            onClick={() => navigate(`/patients/${encodeURIComponent(app.patientId)}`)}
                                                            style={{
                                                                background: "#f1f5f9", color: "var(--navy-deep)", border: "1px solid #e2e8f0", padding: "8px 16px",
                                                                borderRadius: "8px", fontWeight: 600, cursor: "pointer", transition: "background 0.2s"
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.background = "#e2e8f0"}
                                                            onMouseLeave={(e) => e.currentTarget.style.background = "#f1f5f9"}
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
                                                                    background: "#10B981", color: "#fff", border: "none", padding: "8px 16px",
                                                                    borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                                                                    boxShadow: "0 4px 10px rgba(16,185,129,0.2)"
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
                                    <div style={{ textAlign: "center", padding: "60px 20px", background: "#f8fafc", borderRadius: "16px", border: "2px dashed #e2e8f0" }}>
                                        <div style={{ width: "80px", height: "80px", background: "#e0f2fe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
                                            <i className="fa-regular fa-calendar-xmark" style={{ fontSize: "2rem", color: "#38bdf8" }}></i>
                                        </div>
                                        <h3 style={{ margin: "0 0 8px 0", color: "var(--navy-deep)" }}>No Appointments Found</h3>
                                        <p style={{ margin: 0, color: "#64748b" }}>
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
    let activeColor = "#08AEB8";
    let activeBg = "rgba(8,174,184,0.1)";
    let activeBorder = "rgba(8,174,184,0.3)";
    
    if (theme === "orange") {
        activeColor = "#f59e0b"; activeBg = "rgba(245,158,11,0.1)"; activeBorder = "rgba(245,158,11,0.3)";
    } else if (theme === "green") {
        activeColor = "#10B981"; activeBg = "rgba(16,185,129,0.1)"; activeBorder = "rgba(16,185,129,0.3)";
    }

    return {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 18px",
        borderRadius: "12px",
        border: `1px solid ${active ? activeBorder : "rgba(226, 232, 240, 1)"}`,
        background: active ? activeBg : "#ffffff",
        color: active ? activeColor : "#64748B",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: "0.92rem",
        transition: "all 0.2s ease",
        boxShadow: active ? "none" : "0 2px 4px rgba(0,0,0,0.02)"
    };
};

export default Dashboard;
