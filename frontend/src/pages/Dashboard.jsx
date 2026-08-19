import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_NODE_API_URL || "http://localhost:5000";

const Dashboard = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Default to 'confirmed' schedule tab or URL param
    const initialTab = searchParams.get("tab") || "confirmed";
    const [activeTab, setActiveTab] = useState(initialTab);

    const [appointments, setAppointments] = useState([]);
    const [completedRecords, setCompletedRecords] = useState({});
    const [loading, setLoading] = useState(true);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [error, setError] = useState("");

    const switchTab = (tabName) => {
        setActiveTab(tabName);
        setSearchParams({ tab: tabName });
    };

    const loadAppointments = async () => {
        setLoading(true);
        setError("");
        try {
            const response = await axios.get(`${API}/api/appointments`);
            setAppointments(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            console.error("Failed to fetch appointments", err);
            setError("Unable to load appointments. Make sure the backend is running.");
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    };

    const loadCompletedRecords = async (items) => {
        const completed = items.filter((item) => item.status === "Completed" && item.patientId);
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
        loadAppointments();
    }, []);

    useEffect(() => {
        if (!loading) loadCompletedRecords(appointments);
    }, [loading, appointments.length, appointments.map((a) => `${a.id}-${a.status}`).join("|")]);

    const pendingAppointments = useMemo(() => appointments.filter((a) => a.status === "Pending"), [appointments]);
    const confirmedAppointments = useMemo(() => appointments.filter((a) => a.status === "Confirmed"), [appointments]);
    const completedAppointments = useMemo(() => appointments.filter((a) => a.status === "Completed"), [appointments]);

    const handleAccept = async (id) => {
        try {
            const response = await axios.patch(`${API}/api/appointments/${id}`, { status: "Confirmed" });
            setAppointments((previous) => previous.map((a) => a.id === id ? response.data.appointment : a));
        } catch (err) {
            console.error("Failed to accept appointment", err);
            setError("Unable to confirm this appointment.");
        }
    };

    const handleDecline = async (id) => {
        try {
            const response = await axios.patch(`${API}/api/appointments/${id}`, { status: "Cancelled" });
            setAppointments((previous) => previous.map((a) => a.id === id ? response.data.appointment : a));
        } catch (err) {
            console.error("Failed to decline appointment", err);
            setError("Unable to decline this appointment.");
        }
    };

    const openConsultation = (appointment) => {
        if (!appointment.patientId) {
            setError("This appointment does not have a patient ID.");
            return;
        }
        navigate(`/consultation/${encodeURIComponent(appointment.patientId)}?appointmentId=${encodeURIComponent(appointment.id)}`, {
            state: {
                appointmentId: appointment.id,
                patient: appointment,
                doctorId: "default-doctor",
            },
        });
    };

    const patientRecord = (appointment) => completedRecords[appointment.patientId];

    return (
        <>
            <div className="ambient-bg" />
            <div className="ambient-bg-2" />

            <div className="portal-container">
                <aside className="sidebar">
                    <div className="brand">
                        <i className="fa-solid fa-notes-medical" /> Doctors Vedika
                    </div>
                    <ul className="nav-links">
                        <li>
                            <button
                                type="button"
                                className={`sidebar-link ${activeTab === "confirmed" ? "active" : ""}`}
                                onClick={() => switchTab("confirmed")}
                                style={sidebarBtnStyle(activeTab === "confirmed")}
                            >
                                <i className="fa-solid fa-calendar-check" /> Confirmed Schedule
                                {confirmedAppointments.length > 0 && <span className="nav-badge cyan">{confirmedAppointments.length}</span>}
                            </button>
                        </li>
                        <li>
                            <button
                                type="button"
                                className={`sidebar-link ${activeTab === "new" ? "active" : ""}`}
                                onClick={() => switchTab("new")}
                                style={sidebarBtnStyle(activeTab === "new")}
                            >
                                <i className="fa-solid fa-envelope-open-text" /> New Requests
                                {pendingAppointments.length > 0 && <span className="nav-badge red">{pendingAppointments.length}</span>}
                            </button>
                        </li>
                        <li>
                            <button
                                type="button"
                                className={`sidebar-link ${activeTab === "completed" ? "active" : ""}`}
                                onClick={() => switchTab("completed")}
                                style={sidebarBtnStyle(activeTab === "completed")}
                            >
                                <i className="fa-solid fa-circle-check" /> Completed
                                {completedAppointments.length > 0 && <span className="nav-badge green">{completedAppointments.length}</span>}
                            </button>
                        </li>
                    </ul>
                </aside>

                <main className="main-content">
                    <header className="header-top fade-in">
                        <div>
                            <h1>Welcome, Dr. Sharma</h1>
                            <p style={{ color: "var(--text-muted)", marginTop: 5 }}>Manage appointments and clinical consultations</p>
                        </div>
                        <div className="doctor-profile">
                            <span>Dr. Anil Sharma</span>
                            <img src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=100&q=80" alt="Doctor Profile" />
                        </div>
                    </header>

                    {error && (
                        <div style={{ margin: "12px 0", padding: "12px 16px", borderRadius: 10, background: "rgba(255,51,102,.1)", border: "1px solid rgba(255,51,102,.3)", color: "#ff7b99" }}>
                            {error}
                        </div>
                    )}

                    {/* TOP TAB SWITCHER */}
                    <div className="tab-navigation-bar" style={{ display: "flex", gap: "12px", margin: "20px 0", flexWrap: "wrap" }}>
                        <button
                            type="button"
                            onClick={() => switchTab("confirmed")}
                            style={tabButtonStyle(activeTab === "confirmed", "cyan")}
                        >
                            <i className="fa-solid fa-calendar-check" /> Confirmed Schedule
                            <span style={tabBadgeStyle(activeTab === "confirmed", "cyan")}>{confirmedAppointments.length}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => switchTab("new")}
                            style={tabButtonStyle(activeTab === "new", "red")}
                        >
                            <i className="fa-solid fa-envelope-open-text" /> New Requests
                            <span style={tabBadgeStyle(activeTab === "new", "red")}>{pendingAppointments.length}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => switchTab("completed")}
                            style={tabButtonStyle(activeTab === "completed", "green")}
                        >
                            <i className="fa-solid fa-circle-check" /> Completed Consultations
                            <span style={tabBadgeStyle(activeTab === "completed", "green")}>{completedAppointments.length}</span>
                        </button>
                    </div>

                    {loading ? (
                        <section className="glass-panel"><p style={{ color: "var(--text-muted)" }}>Loading appointments...</p></section>
                    ) : (
                        <>
                            {/* TAB 1: NEW REQUESTS */}
                            {activeTab === "new" && (
                                <section className="glass-panel fade-in">
                                    <div className="panel-header">
                                        <div>
                                            <h2 className="panel-title"><i className="fa-solid fa-envelope-open-text" style={{ color: "var(--danger)", marginRight: 8 }} /> New Appointment Requests</h2>
                                            <p style={{ color: "var(--text-muted)", margin: "6px 0 0" }}>Review incoming appointment requests and accept or decline.</p>
                                        </div>
                                        <span style={{ background: "rgba(255,51,102,.2)", color: "var(--danger)", padding: "6px 14px", borderRadius: 20, fontSize: ".9rem", fontWeight: 700 }}>{pendingAppointments.length} Pending</span>
                                    </div>
                                    <div className="request-list" style={{ marginTop: 16 }}>
                                        {pendingAppointments.map((app) => (
                                            <div className="request-card" key={app.id}>
                                                <div className="patient-info">
                                                    <img src="/images/human.png" alt="Patient" onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.patient || "Patient")}&background=random`; }} />
                                                    <div className="patient-details">
                                                        <h4>{app.patient}</h4>
                                                        <p><i className="fa-regular fa-clock" /> Today, {app.time} • {app.type}</p>
                                                        <small style={{ color: "var(--text-muted)" }}>Patient ID: {app.patientId || "Not assigned"}</small>
                                                    </div>
                                                </div>
                                                <div className="request-actions">
                                                    <button className="btn btn-secondary" onClick={() => handleDecline(app.id)}>Decline</button>
                                                    <button className="btn btn-accept" onClick={() => handleAccept(app.id)}><i className="fa-solid fa-check" /> Accept</button>
                                                </div>
                                            </div>
                                        ))}
                                        {!pendingAppointments.length && <p style={{ color: "var(--text-muted)", padding: 20, textAlign: "center" }}>No pending appointment requests.</p>}
                                    </div>
                                </section>
                            )}

                            {/* TAB 2: CONFIRMED SCHEDULE */}
                            {activeTab === "confirmed" && (
                                <section className="glass-panel fade-in">
                                    <div className="panel-header">
                                        <div>
                                            <h2 className="panel-title"><i className="fa-solid fa-calendar-check" style={{ color: "var(--primary)", marginRight: 8 }} /> Today's Confirmed Schedule</h2>
                                            <p style={{ color: "var(--text-muted)", margin: "6px 0 0" }}>Start live consultation and clinical documentation.</p>
                                        </div>
                                        <span style={{ padding: "6px 14px", borderRadius: 20, background: "rgba(0,210,255,.1)", color: "var(--primary)", fontWeight: 700 }}>{confirmedAppointments.length} Confirmed</span>
                                    </div>
                                    <div className="request-list" style={{ marginTop: 16 }}>
                                        {confirmedAppointments.map((app) => (
                                            <div className="request-card" key={app.id}>
                                                <div className="patient-info">
                                                    <img src="/images/human.png" alt="Patient" onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.patient || "Patient")}&background=random`; }} />
                                                    <div className="patient-details">
                                                        <h4>{app.patient}</h4>
                                                        <p><i className="fa-regular fa-clock" /> Today, {app.time} • {app.type}</p>
                                                        <small style={{ color: "var(--text-muted)" }}>{app.age ? `${app.age} years` : "Age —"} • {app.gender || "Gender —"} • ID: {app.patientId || "—"}</small>
                                                    </div>
                                                </div>
                                                <div className="request-actions">
                                                    <button className="btn btn-start" onClick={() => openConsultation(app)}>
                                                        Start Consultation <i className="fa-solid fa-arrow-right" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {!confirmedAppointments.length && <p style={{ color: "var(--text-muted)", padding: 20, textAlign: "center" }}>No confirmed appointments scheduled for today.</p>}
                                    </div>
                                </section>
                            )}

                            {/* TAB 3: COMPLETED CONSULTATIONS */}
                            {activeTab === "completed" && (
                                <section className="glass-panel fade-in">
                                    <div className="panel-header">
                                        <div>
                                            <h2 className="panel-title"><i className="fa-solid fa-circle-check" style={{ color: "#22c55e", marginRight: 8 }} /> Completed Consultations</h2>
                                            <p style={{ color: "var(--text-muted)", margin: "6px 0 0" }}>Saved consultation reports and generated medical PDFs.</p>
                                        </div>
                                        <span style={{ padding: "6px 14px", borderRadius: 20, background: "rgba(34,197,94,.1)", color: "#4ade80", fontWeight: 700 }}>{completedAppointments.length} Completed</span>
                                    </div>

                                    <div className="completed-list" style={{ display: "grid", gap: 14, marginTop: 16 }}>
                                        {completedAppointments.map((app) => {
                                            const record = patientRecord(app);
                                            const report = record?.summary || {};
                                            const diagnosis = Array.isArray(record?.diagnosis) ? record.diagnosis.join(", ") : (report.diagnosis || "Not documented");
                                            const meds = Array.isArray(record?.medications) ? record.medications.length : 0;
                                            return (
                                                <article key={app.id} style={{ padding: 18, borderRadius: 14, border: "1px solid rgba(34,197,94,.18)", background: "rgba(34,197,94,.025)" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
                                                        <div>
                                                            <h3 style={{ margin: 0 }}>{app.patient}</h3>
                                                            <p style={{ color: "var(--text-muted)", margin: "6px 0" }}>Patient ID: {app.patientId || "—"} • {app.type} • {app.time}</p>
                                                            <p style={{ margin: "6px 0", color: "#cbd5e1" }}>Diagnosis: <strong>{diagnosis || "Not documented"}</strong></p>
                                                            <p style={{ margin: "6px 0", color: "var(--text-muted)" }}>Prescription: {meds} medicine{meds === 1 ? "" : "s"} • Status: <strong style={{ color: "#4ade80" }}>Completed</strong></p>
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                            <button className="btn btn-secondary" onClick={() => navigate(`/patients/${encodeURIComponent(app.patientId)}`)}>View Patient Record</button>
                                                            {record && (
                                                                <button
                                                                    className="btn btn-start"
                                                                    onClick={() => {
                                                                        const pdfTarget = record.pdfUrl
                                                                            ? (record.pdfUrl.startsWith("http") ? record.pdfUrl : `${API}${record.pdfUrl}`)
                                                                            : `${API}/api/v1/clinical/notes/${encodeURIComponent(app.patientId)}/${encodeURIComponent(record.consultationId)}/pdf`;
                                                                        window.open(pdfTarget, "_blank", "noopener,noreferrer");
                                                                    }}
                                                                >
                                                                    📄 View PDF
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {record && (
                                                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(148,163,184,.12)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                                                            <Info label="Consultation Date" value={record.consultationDate} />
                                                            <Info label="Consultation Time" value={record.consultationTime} />
                                                            <Info label="Doctor" value={record.doctorId} />
                                                            <Info label="Record ID" value={record.consultationId} />
                                                        </div>
                                                    )}
                                                </article>
                                            );
                                        })}
                                        {!completedAppointments.length && <p style={{ color: "var(--text-muted)", padding: 20, textAlign: "center" }}>No completed consultations yet.</p>}
                                        {recordsLoading && <p style={{ color: "var(--text-muted)" }}>Loading completed patient details...</p>}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </main>
            </div>
        </>
    );
};

const Info = ({ label, value }) => (
    <div>
        <small style={{ color: "var(--text-muted)", display: "block" }}>{label}</small>
        <span style={{ fontWeight: 600, color: "#cbd5e1" }}>{value || "—"}</span>
    </div>
);

const sidebarBtnStyle = (active) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    background: active ? "rgba(0,210,255,0.12)" : "transparent",
    border: "none",
    borderRadius: "10px",
    padding: "12px 14px",
    color: active ? "var(--primary)" : "var(--text-muted)",
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
    fontSize: "0.95rem",
    textAlign: "left",
    transition: "all 0.2s ease",
});

const tabButtonStyle = (active, theme) => {
    const isCyan = theme === "cyan";
    const isRed = theme === "red";
    const activeBg = isCyan
        ? "linear-gradient(135deg, rgba(0,210,255,0.2), rgba(0,168,181,0.25))"
        : isRed
            ? "linear-gradient(135deg, rgba(255,51,102,0.2), rgba(220,38,38,0.25))"
            : "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.25))";

    const activeColor = isCyan ? "#00d2ff" : isRed ? "#ff4d6d" : "#4ade80";
    const activeBorder = isCyan ? "rgba(0,210,255,0.4)" : isRed ? "rgba(255,51,102,0.4)" : "rgba(34,197,94,0.4)";

    return {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 18px",
        borderRadius: "12px",
        border: `1px solid ${active ? activeBorder : "rgba(100,122,151,0.2)"}`,
        background: active ? activeBg : "rgba(11,22,40,0.6)",
        color: active ? activeColor : "#8fa1b7",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: "0.92rem",
        transition: "all 0.2s ease",
    };
};

const tabBadgeStyle = (active, theme) => {
    const isCyan = theme === "cyan";
    const isRed = theme === "red";
    const bg = isCyan
        ? "rgba(0,210,255,0.2)"
        : isRed
            ? "rgba(255,51,102,0.25)"
            : "rgba(34,197,94,0.2)";

    const color = isCyan ? "#00d2ff" : isRed ? "#ff4d6d" : "#4ade80";

    return {
        background: bg,
        color: color,
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "0.78rem",
        fontWeight: 800,
        marginLeft: "4px",
    };
};

export default Dashboard;
