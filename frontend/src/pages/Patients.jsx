import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import "../index.css";

const API = import.meta.env.VITE_NODE_API_URL;

const Patients = () => {
    const navigate = useNavigate();
    const { doctor, loading: authLoading } = useAuth();

    // UI States
    const [view, setView] = useState("search"); // 'search', 'walkin', 'profile'
    const [searchQuery, setSearchQuery] = useState("");
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    
    // Walk-in form state
    const [walkinForm, setWalkinForm] = useState({
        fullName: "", mobile: "", dob: "", gender: "", bloodGroup: "", address: ""
    });
    
    // Profile view state
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientVisits, setPatientVisits] = useState([]);
    
    // Follow-up Booking Modal State
    const [showFollowUpModal, setShowFollowUpModal] = useState(false);
    const [followUpDate, setFollowUpDate] = useState("");
    const [availableSlots, setAvailableSlots] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState("");
    const [slotReason, setSlotReason] = useState("");
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [bookingFollowUp, setBookingFollowUp] = useState(false);
    const [followUpSuccess, setFollowUpSuccess] = useState("");


    useEffect(() => {
        if (!authLoading) {
            if (!doctor) {
                navigate("/login");
            } else if (!doctor.onboardingCompleted) {
                navigate("/onboarding");
            } else {
                fetchPatients("");
            }
        }
    }, [doctor, authLoading, navigate]);

    const fetchPatients = async (q = "") => {
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const response = await axios.get(`${API}/api/patients/search`, {
                params: { q },
                headers: { Authorization: `Bearer ${token}` }
            });
            setPatients(response.data.patients || []);
        } catch (err) {
            console.error("Search error", err);
            setError("Failed to search patients.");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        fetchPatients(searchQuery);
    };

    const handleWalkinSubmit = async (e) => {
        e.preventDefault();
        if (!walkinForm.fullName || !walkinForm.mobile) {
            setError("Name and Mobile are required.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            
            // 1. Create Patient
            const patRes = await axios.post(`${API}/api/patients/walkin`, walkinForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            const newPatientId = patRes.data.patient.userId;
            
            // 2. Create Visit
            const visitRes = await axios.post(`${API}/api/patients/${newPatientId}/visit`, {
                fee: doctor.consultationFee || 500,
                paymentStatus: "paid",
                reason: "Walk-in Consultation"
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // 3. Navigate to Consultation
            const appointmentId = visitRes.data.appointment.id;
            
            let age = null;
            if (walkinForm.dob) {
                const dob = new Date(walkinForm.dob);
                const diffMs = Date.now() - dob.getTime();
                const ageDt = new Date(diffMs);
                age = Math.abs(ageDt.getUTCFullYear() - 1970);
            }

            navigate(`/consultation/${newPatientId}?appointmentId=${appointmentId}`, {
                state: {
                    appointmentId: appointmentId,
                    patient: { 
                        ...patRes.data.patient, 
                        id: appointmentId,
                        patientName: walkinForm.fullName,
                        age: age,
                        gender: walkinForm.gender,
                        bloodGroup: walkinForm.bloodGroup
                    },
                    doctorId: doctor.id,
                }
            });
            
        } catch (err) {
            console.error("Walkin error", err);
            setError("Failed to register walk-in patient.");
            setLoading(false);
        }
    };

    const openProfile = async (patientId) => {
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const response = await axios.get(`${API}/api/patients/${patientId}/history`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSelectedPatient(response.data.patient);
            setPatientVisits(response.data.visits || []);
            setView("profile");
        } catch (err) {
            console.error("Profile error", err);
            setError("Failed to load patient profile.");
        } finally {
            setLoading(false);
        }
    };

    const startConsultation = (visit) => {
        navigate(`/consultation/${selectedPatient.userId}?appointmentId=${visit.appointmentId}`, {
            state: {
                appointmentId: visit.appointmentId,
                patient: selectedPatient,
                doctorId: doctor.id,
            }
        });
    };

    const handleDateSelectForFollowUp = async (dateStr) => {
        setFollowUpDate(dateStr);
        setSelectedSlot("");
        if (!dateStr || !doctor?.id) return;

        setLoadingSlots(true);
        setSlotReason("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const res = await axios.get(`${API}/api/availability/slots`, {
                params: { doctorId: doctor.id, date: dateStr },
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data?.available === false) {
                setAvailableSlots([]);
                setSlotReason(res.data.reason || "Doctor unavailable on this date.");
            } else {
                setAvailableSlots(res.data?.slots || []);
                setSlotReason("");
            }
        } catch (err) {
            console.error("Error fetching slots:", err);
            setSlotReason("Failed to load available slots.");
        } finally {
            setLoadingSlots(false);
        }
    };

    const handleBookFollowUp = async (e) => {
        e.preventDefault();
        if (!followUpDate || !selectedSlot) {
            setError("Please select both a date and an available slot.");
            return;
        }

        setBookingFollowUp(true);
        setError("");
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const res = await axios.post(`${API}/api/appointments/book`, {
                doctorId: doctor.id,
                patientId: selectedPatient.userId,
                date: followUpDate,
                time: selectedSlot,
                appointmentType: "Follow-up",
                reason: "Scheduled Follow-up Visit"
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data?.success) {
                setFollowUpSuccess(`Follow-up appointment confirmed for ${followUpDate} at ${selectedSlot}!`);
                setShowFollowUpModal(false);
                setFollowUpDate("");
                setSelectedSlot("");
                setAvailableSlots([]);
                // Reload patient history to reflect new visit
                openProfile(selectedPatient.userId);
                setTimeout(() => setFollowUpSuccess(""), 5000);
            }
        } catch (err) {
            console.error("Follow-up booking error:", err);
            setError(err.response?.data?.message || "Failed to book follow-up appointment.");
        } finally {
            setBookingFollowUp(false);
        }
    };

    return (
        <DashboardLayout
            activePage="patients"
            patientView={view}
            onPatientView={(v) => { setView(v); if (v === "search") { setSearchQuery(""); fetchPatients(""); } }}
            fetchPatients={fetchPatients}
        >
            {/* PAGE TITLE */}
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ color: "var(--navy-deep,#082B68)", fontWeight: 800, fontSize: "1.8rem", margin: 0 }}>Patient Directory</h1>
                <p style={{ color: "#64748b", marginTop: 4, fontSize: "1rem" }}>Manage patient records and medical history</p>
            </div>

            {error && (

                        <div style={{ margin: "12px 0", padding: "14px 20px", borderRadius: 12, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#ef4444", fontWeight: 500 }}>
                            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "8px" }}></i> {error}
                        </div>
                    )}

                    {view === "search" && (
                        <div className="fade-in">
                            <form onSubmit={handleSearch} style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
                                <div style={{ flex: 1, position: "relative" }}>
                                    <i className="fa-solid fa-search" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                                    <input 
                                        type="text" 
                                        placeholder="Search by ID, Name, Mobile, Email..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{ width: "100%", padding: "14px 20px 14px 45px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "1rem", outline: "none", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}
                                    />
                                </div>
                                <button type="submit" style={{ background: "#082B68", color: "white", padding: "0 24px", borderRadius: "12px", fontWeight: 600, border: "none", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#051b44"} onMouseLeave={(e) => e.currentTarget.style.background = "#082B68"}>
                                    Search
                                </button>
                                <button type="button" onClick={() => setView("walkin")} style={{ background: "#08AEB8", color: "white", padding: "0 24px", borderRadius: "12px", fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#068f98"} onMouseLeave={(e) => e.currentTarget.style.background = "#08AEB8"}>
                                    <i className="fa-solid fa-plus" /> Walk-in
                                </button>
                            </form>

                            {loading ? (
                                <div style={{ textAlign: "center", padding: "40px" }}><i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#08AEB8" }}></i></div>
                            ) : (
                                <div style={{ display: "grid", gap: "16px" }}>
                                    {patients.map(p => (
                                        <div key={p.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
                                            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                                                <img src={p.profilePhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.fullName)}&background=08AEB8&color=fff`} style={{ width: "50px", height: "50px", borderRadius: "50%" }} alt="" />
                                                <div>
                                                    <h3 style={{ margin: "0 0 4px 0", color: "var(--navy-deep)", fontSize: "1.1rem" }}>{p.fullName}</h3>
                                                    <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
                                                        {p.patientCode} • {p.age ? `${p.age} yrs` : "Age -"} • {p.gender || "-"} • <i className="fa-solid fa-phone" style={{fontSize: "0.8rem", marginLeft: "4px"}}></i> {p.mobile}
                                                    </p>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                                                <div style={{ textAlign: "right" }}>
                                                    <div style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "2px" }}>Total Visits: <strong style={{ color: "var(--navy-deep)" }}>{p.totalVisits}</strong></div>
                                                    <div style={{ color: "#64748b", fontSize: "0.85rem" }}>Last Visit: <strong style={{ color: "var(--navy-deep)" }}>{p.lastVisit ? new Date(p.lastVisit).toLocaleDateString() : "Never"}</strong></div>
                                                </div>
                                                <button onClick={() => openProfile(p.userId)} style={{ background: "#f1f5f9", color: "var(--navy-deep)", border: "1px solid #e2e8f0", padding: "8px 16px", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
                                                    View Profile <i className="fa-solid fa-arrow-right" style={{marginLeft: "4px"}}></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {patients.length === 0 && (
                                        <div style={{ textAlign: "center", padding: "60px", background: "#f8fafc", borderRadius: "16px", border: "2px dashed #e2e8f0", color: "#64748b" }}>
                                            No patients found. Try adjusting your search.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {view === "walkin" && (
                        <div className="fade-in glass-panel" style={{ background: "#fff", padding: "30px", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                                <h2 style={{ margin: 0, color: "var(--navy-deep)", display: "flex", alignItems: "center", gap: "10px" }}><i className="fa-solid fa-user-plus" style={{color: "#f59e0b"}}></i> Register Walk-in Patient</h2>
                                <button onClick={() => setView("search")} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontWeight: 600 }}><i className="fa-solid fa-times"></i> Cancel</button>
                            </div>
                            
                            <form onSubmit={handleWalkinSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Full Name *</label>
                                    <input type="text" value={walkinForm.fullName} onChange={e => setWalkinForm({...walkinForm, fullName: e.target.value})} required style={inputStyle} placeholder="John Doe" />
                                </div>
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Mobile Number *</label>
                                    <input type="text" value={walkinForm.mobile} onChange={e => setWalkinForm({...walkinForm, mobile: e.target.value})} required style={inputStyle} placeholder="9876543210" />
                                </div>
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Date of Birth / Age</label>
                                    <input type="date" value={walkinForm.dob} onChange={e => setWalkinForm({...walkinForm, dob: e.target.value})} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Gender</label>
                                    <select value={walkinForm.gender} onChange={e => setWalkinForm({...walkinForm, gender: e.target.value})} style={inputStyle}>
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Blood Group</label>
                                    <select value={walkinForm.bloodGroup} onChange={e => setWalkinForm({...walkinForm, bloodGroup: e.target.value})} style={inputStyle}>
                                        <option value="">Select Blood Group</option>
                                        <option value="A+">A+</option><option value="A-">A-</option>
                                        <option value="B+">B+</option><option value="B-">B-</option>
                                        <option value="O+">O+</option><option value="O-">O-</option>
                                        <option value="AB+">AB+</option><option value="AB-">AB-</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Locality / Address</label>
                                    <input type="text" value={walkinForm.address} onChange={e => setWalkinForm({...walkinForm, address: e.target.value})} style={inputStyle} placeholder="City, Area" />
                                </div>
                                
                                <div style={{ gridColumn: "1 / -1", marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
                                    <button type="submit" disabled={loading} style={{ background: "#08AEB8", color: "#fff", padding: "14px 32px", borderRadius: "12px", border: "none", fontWeight: 700, fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}>
                                        {loading ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-stethoscope" />} 
                                        Register & Start Consultation
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {view === "profile" && selectedPatient && (
                        <div className="fade-in">
                            <button onClick={() => setView("search")} style={{ background: "transparent", border: "none", color: "#08AEB8", cursor: "pointer", fontWeight: 600, marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
                                <i className="fa-solid fa-arrow-left"></i> Back to Search
                            </button>
                            
                            {/* TOP PROFILE CARD */}
                            <div style={{ background: "#fff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "24px", marginBottom: "24px", display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap", boxShadow: "0 10px 30px rgba(0,0,0,0.02)" }}>
                                <img src={selectedPatient.profilePhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedPatient.fullName)}&background=082B68&color=fff`} style={{ width: "100px", height: "100px", borderRadius: "50%", border: "4px solid #f1f5f9" }} alt="" />
                                <div style={{ flex: 1, minWidth: "300px" }}>
                                    <h2 style={{ margin: "0 0 8px 0", color: "var(--navy-deep)", fontSize: "1.6rem" }}>{selectedPatient.fullName}</h2>
                                    <div style={{ display: "flex", gap: "24px", color: "#475569", flexWrap: "wrap", marginBottom: "16px" }}>
                                        <span style={{fontWeight: 600}}><i className="fa-solid fa-id-card" style={{color:"#08AEB8", marginRight: "6px"}}></i> {selectedPatient.patientCode}</span>
                                        <span><i className="fa-solid fa-phone" style={{color:"#08AEB8", marginRight: "6px"}}></i> {selectedPatient.mobile}</span>
                                        {selectedPatient.email && <span><i className="fa-solid fa-envelope" style={{color:"#08AEB8", marginRight: "6px"}}></i> {selectedPatient.email}</span>}
                                    </div>
                                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                                        <span style={tagStyle}>Age: {selectedPatient.age || "—"}</span>
                                        <span style={tagStyle}>Gender: {selectedPatient.gender || "—"}</span>
                                        <span style={tagStyle}>Blood: <strong style={{color:"#ef4444"}}>{selectedPatient.bloodGroup || "—"}</strong></span>
                                        {selectedPatient.address && <span style={tagStyle}><i className="fa-solid fa-location-dot"></i> {selectedPatient.address}</span>}
                                    </div>
                                </div>
                                <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "14px", border: "1px solid #e2e8f0", minWidth: "220px", display: "flex", flexDirection: "column", gap: "12px" }}>
                                    <div>
                                        <span style={{color:"#64748b", fontSize: "0.85rem", display: "block"}}>Total Visits</span>
                                        <strong style={{color:"var(--navy-deep)", fontSize: "1.3rem"}}>{patientVisits.length}</strong>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowFollowUpModal(true)}
                                        style={{ background: "#08AEB8", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "10px", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: "0 4px 10px rgba(8,174,184,0.25)" }}
                                    >
                                        <i className="fa-solid fa-calendar-plus"></i> Book Follow-up
                                    </button>
                                </div>
                            </div>

                            {followUpSuccess && (
                                <div style={{ marginBottom: "20px", padding: "14px 20px", borderRadius: 12, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", fontWeight: 600 }}>
                                    <i className="fa-solid fa-circle-check" style={{ marginRight: "8px" }}></i> {followUpSuccess}
                                </div>
                            )}

                            {/* FOLLOW-UP BOOKING MODAL */}
                            {showFollowUpModal && (
                                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.5)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                                    <div style={{ background: "#fff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "28px", maxWidth: "550px", width: "100%", boxShadow: "0 20px 40px rgba(0,0,0,0.15)", position: "relative" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                                            <h3 style={{ margin: 0, color: "var(--navy-deep)", fontSize: "1.3rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
                                                <i className="fa-solid fa-calendar-check" style={{ color: "#08AEB8" }}></i> Schedule Follow-up Visit
                                            </h3>
                                            <button onClick={() => setShowFollowUpModal(false)} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "1.1rem" }}><i className="fa-solid fa-times"></i></button>
                                        </div>

                                        <form onSubmit={handleBookFollowUp}>
                                            <div style={{ marginBottom: "16px" }}>
                                                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Select Follow-up Date *</label>
                                                <input
                                                    type="date"
                                                    value={followUpDate}
                                                    onChange={e => handleDateSelectForFollowUp(e.target.value)}
                                                    min={new Date().toISOString().split("T")[0]}
                                                    required
                                                    style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "1rem", color: "var(--navy-deep)", background: "#f8fafc" }}
                                                />
                                            </div>

                                            {loadingSlots && (
                                                <div style={{ textAlign: "center", padding: "20px", color: "#08AEB8" }}>
                                                    <i className="fa-solid fa-spinner fa-spin fa-lg"></i> Checking available doctor slots...
                                                </div>
                                            )}

                                            {slotReason && !loadingSlots && (
                                                <div style={{ padding: "12px 16px", borderRadius: "10px", background: "#fef2f2", color: "#ef4444", fontSize: "0.9rem", fontWeight: 500, marginBottom: "16px" }}>
                                                    <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "6px" }}></i> {slotReason}
                                                </div>
                                            )}

                                            {availableSlots.length > 0 && !loadingSlots && (
                                                <div style={{ marginBottom: "20px" }}>
                                                    <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>Available Time Slots *</label>
                                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", maxHeight: "200px", overflowY: "auto", padding: "4px" }}>
                                                        {availableSlots.map(s => (
                                                            <button
                                                                type="button"
                                                                key={s.time}
                                                                disabled={!s.available}
                                                                onClick={() => setSelectedSlot(s.time)}
                                                                style={{
                                                                    padding: "10px",
                                                                    borderRadius: "10px",
                                                                    border: selectedSlot === s.time ? "2px solid #08AEB8" : "1px solid #e2e8f0",
                                                                    background: !s.available ? "#f1f5f9" : selectedSlot === s.time ? "rgba(8, 174, 184, 0.1)" : "#fff",
                                                                    color: !s.available ? "#94a3b8" : selectedSlot === s.time ? "#08AEB8" : "var(--navy-deep)",
                                                                    fontWeight: selectedSlot === s.time ? 700 : 500,
                                                                    cursor: !s.available ? "not-allowed" : "pointer",
                                                                    fontSize: "0.85rem",
                                                                    textAlign: "center"
                                                                }}
                                                            >
                                                                {s.time} {!s.available && `(${s.reason})`}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                                                <button type="button" onClick={() => setShowFollowUpModal(false)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "12px 20px", borderRadius: "10px", fontWeight: 600, cursor: "pointer" }}>
                                                    Cancel
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={bookingFollowUp || !selectedSlot}
                                                    style={{ background: "#08AEB8", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "10px", fontWeight: 700, cursor: bookingFollowUp || !selectedSlot ? "not-allowed" : "pointer", opacity: !selectedSlot ? 0.6 : 1 }}
                                                >
                                                    {bookingFollowUp ? <i className="fa-solid fa-spinner fa-spin" /> : "Confirm Appointment"}
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* VISIT HISTORY TIMELINE */}
                            <h3 style={{ color: "var(--navy-deep)", display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}><i className="fa-solid fa-clock-rotate-left" style={{color: "#08AEB8"}}></i> Visit History</h3>
                            
                            <div style={{ display: "grid", gap: "16px" }}>
                                {patientVisits.map((visit, index) => (
                                    <div key={visit.appointmentId} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "24px", position: "relative", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
                                            <div>
                                                <div style={{ color: "#08AEB8", fontWeight: 700, fontSize: "1.1rem", marginBottom: "8px" }}>
                                                    {new Date(visit.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} • {visit.time}
                                                </div>
                                                <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                                                    <span style={{ background: visit.status === 'completed' ? "#dcfce7" : "#fef3c7", color: visit.status === 'completed' ? "#16a34a" : "#d97706", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>{visit.status.toUpperCase()}</span>
                                                    <span style={{ background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>{visit.type}</span>
                                                </div>
                                                
                                                <div style={{ display: "grid", gap: "10px" }}>
                                                    {visit.chiefComplaint && (
                                                        <div><span style={{color:"#64748b", fontSize:"0.85rem", textTransform:"uppercase", fontWeight:700}}>Symptoms / Complaint</span><p style={{margin:"2px 0 0 0", color:"var(--navy-deep)", fontWeight:500}}>{visit.chiefComplaint}</p></div>
                                                    )}
                                                    {visit.diagnosis && (
                                                        <div><span style={{color:"#64748b", fontSize:"0.85rem", textTransform:"uppercase", fontWeight:700}}>Diagnosis</span><p style={{margin:"2px 0 0 0", color:"#082B68", fontWeight:600}}>{visit.diagnosis}</p></div>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-end", minWidth: "200px" }}>
                                                <div style={{ textAlign: "right" }}>
                                                    <div style={{ color: "var(--navy-deep)", fontWeight: 700, fontSize: "1.1rem", marginBottom: "4px" }}>₹{visit.fee}</div>
                                                    <div style={{ color: visit.paymentStatus === 'paid' ? "#16a34a" : "#d97706", fontSize: "0.85rem", fontWeight: 600 }}>{visit.paymentStatus === 'paid' ? 'Paid' : 'Pending Payment'}</div>
                                                </div>
                                                
                                                {visit.status === 'completed' ? (
                                                    <button 
                                                        onClick={() => {
                                                            const pdfUrl = `/api/v1/clinical/notes/${encodeURIComponent(selectedPatient.userId)}/consultation-${new Date(visit.date).getTime()}/pdf`;
                                                            // We try to open PatientRecord logic basically 
                                                            navigate(`/patients/${selectedPatient.userId}`);
                                                        }}
                                                        style={{ background: "#10B981", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "10px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 10px rgba(16,185,129,0.2)" }}
                                                    >
                                                        <i className="fa-solid fa-file-medical"></i> View Report
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => startConsultation(visit)}
                                                        style={{ background: "#08AEB8", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "10px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 10px rgba(8,174,184,0.3)" }}
                                                    >
                                                        Start Consultation <i className="fa-solid fa-arrow-right" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {patientVisits.length === 0 && (
                                    <div style={{ padding: "40px", textAlign: "center", background: "#f8fafc", borderRadius: "16px", border: "1px solid #e2e8f0", color: "#64748b" }}>
                                        No past visits found for this patient.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
        </DashboardLayout>
    );
};



const inputStyle = {
    width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1",
    fontSize: "0.95rem", outline: "none", color: "var(--navy-deep)", background: "#f8fafc"
};

const tagStyle = {
    background: "#f1f5f9", padding: "6px 12px", borderRadius: "8px", fontSize: "0.85rem", color: "#475569", fontWeight: 600
};

export default Patients;
