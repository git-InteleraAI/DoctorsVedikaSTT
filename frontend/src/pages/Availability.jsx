import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import "../index.css";

const API = import.meta.env.VITE_NODE_API_URL;

const DAYS = [
    { key: "Monday", label: "Monday" },
    { key: "Tuesday", label: "Tuesday" },
    { key: "Wednesday", label: "Wednesday" },
    { key: "Thursday", label: "Thursday" },
    { key: "Friday", label: "Friday" },
    { key: "Saturday", label: "Saturday" },
    { key: "Sunday", label: "Sunday" }
];

const TIME_OPTIONS = [
    "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM", "08:00 AM", "08:30 AM",
    "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
    "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
    "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
    "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
    "09:00 PM", "09:30 PM", "10:00 PM", "10:30 PM", "11:00 PM"
];

const Availability = () => {
    const navigate = useNavigate();
    const { doctor, loading: authLoading } = useAuth();

    const [schedule, setSchedule] = useState(
        DAYS.map(d => ({
            day_of_week: d.key,
            is_available: d.key !== "Sunday",
            start_time: "09:00 AM",
            end_time: "05:00 PM",
            time_windows: [
                { start_time: "09:00 AM", end_time: "01:00 PM" },
                { start_time: "05:00 PM", end_time: "08:00 PM" }
            ]
        }))
    );
    const [slotDuration, setSlotDuration] = useState(30);

    const [blockedDates, setBlockedDates] = useState([]);
    const [blockForm, setBlockForm] = useState({ date: "", reason: "" });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [blocking, setBlocking] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    useEffect(() => {
        if (!authLoading) {
            if (!doctor) {
                navigate("/login");
            } else {
                fetchAvailabilityData();
            }
        }
    }, [doctor, authLoading]);

    const fetchAvailabilityData = async () => {
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const [availRes, blockedRes] = await Promise.all([
                axios.get(`${API}/api/availability`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API}/api/availability/blocked-dates`, { headers: { Authorization: `Bearer ${token}` } })
            ]);

            if (availRes.data?.availability && Array.isArray(availRes.data.availability)) {
                console.log("[Frontend Availability] Loaded Availability:", availRes.data.availability);
                setSchedule(availRes.data.availability);
            }
            if (availRes.data?.slotDuration) {
                setSlotDuration(availRes.data.slotDuration);
            }
            if (blockedRes.data?.blockedDates) {
                setBlockedDates(blockedRes.data.blockedDates);
            }
        } catch (err) {
            console.error("Error fetching availability:", err);
            setError("Failed to load availability settings.");
        } finally {
            setLoading(false);
        }
    };

    const handleToggleDay = (dayKey) => {
        setSchedule(prev =>
            prev.map(item =>
                item.day_of_week.toLowerCase() === dayKey.toLowerCase()
                    ? { ...item, is_available: !item.is_available }
                    : item
            )
        );
    };

    const handleTimeChange = (dayKey, windowIndex, field, value) => {
        setSchedule(prev =>
            prev.map(item => {
                if (item.day_of_week.toLowerCase() === dayKey.toLowerCase()) {
                    const updatedWindows = [...(item.time_windows || [])];
                    if (!updatedWindows[windowIndex]) {
                        updatedWindows[windowIndex] = { start_time: "09:00 AM", end_time: "05:00 PM" };
                    }
                    updatedWindows[windowIndex] = {
                        ...updatedWindows[windowIndex],
                        [field]: value
                    };

                    const firstWin = updatedWindows[0] || {};
                    const lastWin = updatedWindows[updatedWindows.length - 1] || {};

                    const newStartTime = firstWin.start_time || value;
                    const newEndTime = lastWin.end_time || value;

                    return {
                        ...item,
                        start_time: newStartTime,
                        end_time: newEndTime,
                        time_windows: updatedWindows
                    };
                }
                return item;
            })
        );
    };

    const handleAddWindow = (dayKey) => {
        setSchedule(prev =>
            prev.map(item => {
                if (item.day_of_week.toLowerCase() === dayKey.toLowerCase()) {
                    const currentWindows = item.time_windows || [];
                    const updatedWindows = [
                        ...currentWindows,
                        { start_time: "05:00 PM", end_time: "08:00 PM" }
                    ];
                    return { ...item, time_windows: updatedWindows };
                }
                return item;
            })
        );
    };

    const handleRemoveWindow = (dayKey, windowIndex) => {
        setSchedule(prev =>
            prev.map(item => {
                if (item.day_of_week.toLowerCase() === dayKey.toLowerCase() && (item.time_windows || []).length > 1) {
                    const updatedWindows = item.time_windows.filter((_, idx) => idx !== windowIndex);
                    return { ...item, time_windows: updatedWindows };
                }
                return item;
            })
        );
    };

    const handleSaveSchedule = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        setSuccessMessage("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            console.log("[Frontend Availability] Saving schedule payload:", { schedule, slotDuration });
            const res = await axios.put(
                `${API}/api/availability`,
                { schedule, slotDuration },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log("[Frontend Availability] Save response:", res.data);
            if (res.data?.availability) {
                setSchedule(res.data.availability);
            }
            setSuccessMessage("Weekly availability schedule saved successfully!");
            setShowSuccessModal(true);
            setTimeout(() => setSuccessMessage(""), 4000);
        } catch (err) {
            console.error("Save schedule error:", err);
            setError(err.response?.data?.message || "Failed to save schedule settings.");
        } finally {
            setSaving(false);
        }
    };

    const handleAddBlockedDate = async (e) => {
        e.preventDefault();
        if (!blockForm.date) {
            setError("Please select a date to block.");
            return;
        }
        setBlocking(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const res = await axios.post(
                `${API}/api/availability/blocked-dates`,
                { date: blockForm.date, reason: blockForm.reason || "Leave / Blocked" },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.blockedDate) {
                setBlockedDates(prev => [...prev.filter(b => b.blocked_date !== blockForm.date), res.data.blockedDate]);
                setBlockForm({ date: "", reason: "" });
                setSuccessMessage(`Date ${blockForm.date} blocked successfully!`);
                setShowSuccessModal(true);
                setTimeout(() => setSuccessMessage(""), 4000);
            }
        } catch (err) {
            console.error("Add blocked date error:", err);
            setError("Failed to block date.");
        } finally {
            setBlocking(false);
        }
    };

    const handleDeleteBlockedDate = async (id) => {
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            await axios.delete(`${API}/api/availability/blocked-dates/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setBlockedDates(prev => prev.filter(b => b.id !== id));
            setSuccessMessage("Blocked date removed.");
            setTimeout(() => setSuccessMessage(""), 4000);
        } catch (err) {
            console.error("Delete blocked date error:", err);
            setError("Failed to remove blocked date.");
        }
    };

    return (
        <>
            <div className="ambient-bg" style={{ background: "#f5f8fa" }} />

            {/* SUCCESS MODAL POPUP */}
            {showSuccessModal && (
                <div style={{
                    position: "fixed",
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(8, 43, 104, 0.4)",
                    backdropFilter: "blur(5px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 9999
                }}>
                    <div style={{
                        background: "#ffffff",
                        borderRadius: "24px",
                        padding: "36px 40px",
                        maxWidth: "420px",
                        width: "90%",
                        textAlign: "center",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
                        border: "1px solid rgba(8, 174, 184, 0.2)"
                    }}>
                        <div style={{
                            width: "72px",
                            height: "72px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 20px auto",
                            boxShadow: "0 10px 20px rgba(16, 185, 129, 0.3)"
                        }}>
                            <i className="fa-solid fa-check" style={{ color: "#fff", fontSize: "2rem" }}></i>
                        </div>
                        <h3 style={{ color: "var(--navy-deep, #082B68)", fontSize: "1.4rem", fontWeight: 800, margin: "0 0 10px 0" }}>
                            Saved Successfully!
                        </h3>
                        <p style={{ color: "#64748b", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 0 24px 0" }}>
                            {successMessage || "Your weekly consulting schedule and appointment settings have been saved successfully."}
                        </p>
                        <button
                            onClick={() => setShowSuccessModal(false)}
                            style={{
                                background: "linear-gradient(135deg, #08AEB8 0%, #068b93 100%)",
                                color: "#ffffff",
                                border: "none",
                                padding: "12px 32px",
                                borderRadius: "12px",
                                fontWeight: 700,
                                fontSize: "1rem",
                                cursor: "pointer",
                                boxShadow: "0 4px 14px rgba(8, 174, 184, 0.3)",
                                width: "100%"
                            }}
                        >
                            OK, Great!
                        </button>
                    </div>
                </div>
            )}

            <DashboardLayout activePage="availability">
                {/* PAGE TITLE */}
                <div style={{ marginBottom: "1.5rem" }}>
                    <h1 style={{ color: "var(--navy-deep,#082B68)", fontWeight: 800, fontSize: "1.8rem", margin: 0 }}>Doctor Schedule & Availability</h1>
                    <p style={{ color: "#64748b", marginTop: 4, fontSize: "1rem" }}>Configure working hours, appointment slots, and blocked dates</p>
                </div>

                {error && (
                        <div style={{ margin: "12px 0", padding: "14px 20px", borderRadius: 12, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#ef4444", fontWeight: 500 }}>
                            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "8px" }}></i> {error}
                        </div>
                    )}

                    {successMessage && (
                        <div style={{ margin: "12px 0", padding: "14px 20px", borderRadius: 12, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", fontWeight: 600 }}>
                            <i className="fa-solid fa-circle-check" style={{ marginRight: "8px" }}></i> {successMessage}
                        </div>
                    )}

                    {loading ? (
                        <div style={{ textAlign: "center", padding: "60px" }}><i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#08AEB8" }}></i></div>
                    ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
                            {/* LEFT COLUMN: WEEKLY WORKING HOURS */}
                            <div style={{ background: "#ffffff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "28px", boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", paddingBottom: "16px", borderBottom: "1px solid #f1f5f9" }}>
                                    <div>
                                        <h2 style={{ margin: 0, color: "var(--navy-deep)", fontSize: "1.3rem", fontWeight: 700 }}>Weekly Schedule</h2>
                                        <span style={{ color: "#64748b", fontSize: "0.9rem" }}>Enable consulting days and choose 12-hour AM/PM shifts</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#475569" }}>Slot Duration:</label>
                                        <select
                                            value={slotDuration}
                                            onChange={e => setSlotDuration(Number(e.target.value))}
                                            style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.9rem", fontWeight: 600, color: "var(--navy-deep)", background: "#f8fafc" }}
                                        >
                                            <option value={15}>15 mins</option>
                                            <option value={30}>30 mins</option>
                                            <option value={45}>45 mins</option>
                                            <option value={60}>60 mins</option>
                                        </select>
                                    </div>
                                </div>

                                <form onSubmit={handleSaveSchedule}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                                        {DAYS.map(d => {
                                            const dayData = schedule.find(s => s.day_of_week.toLowerCase() === d.key.toLowerCase()) || {
                                                day_of_week: d.key,
                                                is_available: true,
                                                start_time: "09:00 AM",
                                                end_time: "05:00 PM",
                                                time_windows: [{ start_time: "09:00 AM", end_time: "05:00 PM" }]
                                            };

                                            const windows = dayData.time_windows && dayData.time_windows.length > 0
                                                ? dayData.time_windows
                                                : [{ start_time: dayData.start_time || "09:00 AM", end_time: dayData.end_time || "05:00 PM" }];

                                            return (
                                                <div key={d.key} style={{ background: dayData.is_available ? "#f8fafc" : "#fff", border: `1px solid ${dayData.is_available ? "#e2e8f0" : "#f1f5f9"}`, borderRadius: "14px", padding: "16px 20px", transition: "all 0.2s" }}>
                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: dayData.is_available ? "12px" : "0" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                                                            <input
                                                                type="checkbox"
                                                                id={`toggle-${d.key}`}
                                                                checked={dayData.is_available}
                                                                onChange={() => handleToggleDay(d.key)}
                                                                style={{ width: "20px", height: "20px", accentColor: "#08AEB8", cursor: "pointer" }}
                                                            />
                                                            <label htmlFor={`toggle-${d.key}`} style={{ fontWeight: 700, color: dayData.is_available ? "var(--navy-deep)" : "#94a3b8", fontSize: "1.05rem", cursor: "pointer", width: "110px" }}>
                                                                {d.label}
                                                            </label>
                                                            <span style={{ background: dayData.is_available ? "#dcfce7" : "#f1f5f9", color: dayData.is_available ? "#16a34a" : "#94a3b8", padding: "3px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 700 }}>
                                                                {dayData.is_available ? "Available" : "Unavailable"}
                                                            </span>
                                                        </div>

                                                        {dayData.is_available && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAddWindow(d.key)}
                                                                style={{ background: "transparent", border: "none", color: "#08AEB8", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                                                            >
                                                                <i className="fa-solid fa-plus-circle"></i> Add Shift Window
                                                            </button>
                                                        )}
                                                    </div>

                                                    {dayData.is_available && (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px", paddingLeft: "34px" }}>
                                                            {windows.map((win, wIdx) => (
                                                                <div key={wIdx} style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                                                    <span style={{ fontSize: "0.85rem", color: "#64748b", width: "70px", fontWeight: 600 }}>Shift {wIdx + 1}:</span>
                                                                    
                                                                    {/* START TIME 12-HOUR SELECTOR */}
                                                                    <select
                                                                        value={win.start_time || dayData.start_time || "09:00 AM"}
                                                                        onChange={e => handleTimeChange(d.key, wIdx, "start_time", e.target.value)}
                                                                        style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "0.95rem", fontWeight: 600, color: "var(--navy-deep)" }}
                                                                    >
                                                                        {TIME_OPTIONS.map(t => (
                                                                            <option key={t} value={t}>{t}</option>
                                                                        ))}
                                                                    </select>

                                                                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>to</span>

                                                                    {/* END TIME 12-HOUR SELECTOR */}
                                                                    <select
                                                                        value={win.end_time || dayData.end_time || "05:00 PM"}
                                                                        onChange={e => handleTimeChange(d.key, wIdx, "end_time", e.target.value)}
                                                                        style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "0.95rem", fontWeight: 600, color: "var(--navy-deep)" }}
                                                                    >
                                                                        {TIME_OPTIONS.map(t => (
                                                                            <option key={t} value={t}>{t}</option>
                                                                        ))}
                                                                    </select>

                                                                    {windows.length > 1 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveWindow(d.key, wIdx)}
                                                                            style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", marginLeft: "4px" }}
                                                                            title="Remove shift window"
                                                                        >
                                                                            <i className="fa-solid fa-trash-can"></i>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
                                        <button
                                            type="submit"
                                            disabled={saving}
                                            style={{ background: "#08AEB8", color: "#fff", border: "none", padding: "14px 36px", borderRadius: "12px", fontWeight: 700, fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 14px rgba(8,174,184,0.3)" }}
                                        >
                                            {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
                                            Save Weekly Schedule
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* RIGHT COLUMN: BLOCK DATES */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                                {/* BLOCK DATE CARD */}
                                <div style={{ background: "#ffffff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
                                    <h2 style={{ margin: "0 0 8px 0", color: "var(--navy-deep)", fontSize: "1.2rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                                        <i className="fa-solid fa-ban" style={{ color: "#ef4444" }}></i> Block Specific Date
                                    </h2>
                                    <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 16px 0" }}>Block a date for leaves, holidays, or emergency absence</p>

                                    <form onSubmit={handleAddBlockedDate} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Select Date *</label>
                                            <input
                                                type="date"
                                                value={blockForm.date}
                                                onChange={e => setBlockForm({ ...blockForm, date: e.target.value })}
                                                required
                                                min={new Date().toISOString().split("T")[0]}
                                                style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.95rem", color: "var(--navy-deep)", background: "#f8fafc" }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Reason (Optional)</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Medical Conference"
                                                value={blockForm.reason}
                                                onChange={e => setBlockForm({ ...blockForm, reason: e.target.value })}
                                                style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.95rem", color: "var(--navy-deep)", background: "#f8fafc" }}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={blocking}
                                            style={{ background: "#ef4444", color: "#fff", border: "none", padding: "12px", borderRadius: "10px", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "4px" }}
                                        >
                                            {blocking ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-lock" />} Block Date
                                        </button>
                                    </form>
                                </div>

                                {/* LIST OF BLOCKED DATES */}
                                <div style={{ background: "#ffffff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 4px 12px rgba(0,0,0,0.02)", flex: 1 }}>
                                    <h3 style={{ margin: "0 0 16px 0", color: "var(--navy-deep)", fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                                        <i className="fa-solid fa-calendar-xmark" style={{ color: "#f59e0b" }}></i> Blocked Dates ({blockedDates.length})
                                    </h3>

                                    {blockedDates.length === 0 ? (
                                        <div style={{ textAlign: "center", padding: "30px", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #e2e8f0", color: "#94a3b8", fontSize: "0.9rem" }}>
                                            No dates blocked yet.
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "350px", overflowY: "auto" }}>
                                            {blockedDates.map(b => (
                                                <div key={b.id || b.blocked_date} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: "#991b1b", fontSize: "0.95rem" }}>
                                                            {new Date(b.blocked_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </div>
                                                        <div style={{ fontSize: "0.8rem", color: "#7f1d1d", marginTop: "2px" }}>{b.reason || "Blocked"}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteBlockedDate(b.id || b.blocked_date)}
                                                        style={{ background: "#ffffff", border: "1px solid #fecaca", color: "#ef4444", padding: "6px 12px", borderRadius: "8px", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
                                                    >
                                                        Unblock
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
            </DashboardLayout>
        </>
    );
};

export default Availability;
