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
            <section className="theme-section-light">
                <div style={{ marginBottom: "0" }}>
                    <h1 style={{ color: "var(--navy-deep,#082B68)", fontWeight: 800, fontSize: "1.8rem", margin: 0 }}>Patient Directory</h1>
                    <p style={{ color: "#64748b", marginTop: 4, fontSize: "1rem" }}>Manage patient records and medical history</p>
                </div>
            </section>

            {error && (

                        <div style={{ margin: "12px 0", padding: "14px 20px", borderRadius: 12, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#ef4444", fontWeight: 500 }}>
                            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "8px" }}></i> {error}
                        </div>
                    )}

                    {view === "search" && (
                        <section className="theme-section-dark fade-in">
                            <form className="responsive-flex-wrap" onSubmit={handleSearch} style={{ marginBottom: "24px", alignItems: "stretch" }}>
                                <div style={{ flex: 1, position: "relative" }}>
                                    <i className="fa-solid fa-search" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                                    <input 
                                        type="text" 
                                        placeholder="Search by ID, Name, Mobile, Email..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="dark-input"
                                        style={{ width: "100%", padding: "14px 20px 14px 45px", fontSize: "1rem", boxSizing: "border-box", height: "100%" }}
                                    />
                                </div>
                                <button type="submit" style={{ background: "#0f172a", color: "white", padding: "0 24px", borderRadius: "10px", fontWeight: 600, border: "none", cursor: "pointer" }}>
                                    Search
                                </button>
                                <button type="button" onClick={() => setView("walkin")} style={{ background: "#0d9488", color: "white", padding: "0 24px", borderRadius: "10px", fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <i className="fa-solid fa-plus" /> Walk-in
                                </button>
                            </form>

                            {loading ? (
                                <div style={{ textAlign: "center", padding: "40px" }}><i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#0d9488" }}></i></div>
                            ) : (
                                <div style={{ display: "grid", gap: "16px" }}>
                                    {patients.map(p => (
                                        <div key={p.id} className="classic-card responsive-flex-between">
                                            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                                                <img src={p.profilePhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.fullName)}&background=0d9488&color=fff`} style={{ width: "48px", height: "48px", borderRadius: "50%" }} alt="" />
                                                <div>
                                                    <h3 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", color: "#0f172a" }}>{p.fullName}</h3>
                                                    <p style={{ margin: 0, fontSize: "0.88rem", color: "#64748b" }}>
                                                        {p.patientCode} • {p.age ? `${p.age} yrs` : "Age -"} • {p.gender || "-"} • <i className="fa-solid fa-phone" style={{fontSize: "0.8rem", marginLeft: "4px"}}></i> {p.mobile}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="responsive-flex-wrap" style={{ alignItems: "center", gap: "16px" }}>
                                                <div style={{ textAlign: "right" }}>
                                                    <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "2px" }}>Total Visits: <strong style={{ color: "#0f172a" }}>{p.totalVisits}</strong></div>
                                                    <div style={{ fontSize: "0.85rem", color: "#64748b" }}>Last Visit: <strong style={{ color: "#0f172a" }}>{p.lastVisit ? new Date(p.lastVisit).toLocaleDateString() : "Never"}</strong></div>
                                                </div>
                                                <button onClick={() => openProfile(p.userId)} style={{ background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
                                                    View Profile <i className="fa-solid fa-arrow-right" style={{marginLeft: "4px"}}></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {patients.length === 0 && (
                                        <div style={{ textAlign: "center", padding: "60px", background: "rgba(255,255,255,0.05)", borderRadius: "16px", border: "2px dashed rgba(255,255,255,0.1)", color: "#94a3b8" }}>
                                            No patients found. Try adjusting your search.
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    )}

                    {view === "walkin" && (
                        <section className="theme-section-dark fade-in">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                                <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}><i className="fa-solid fa-user-plus" style={{color: "#01b6af"}}></i> Register Walk-in Patient</h2>
                                <button onClick={() => setView("search")} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}><i className="fa-solid fa-times"></i> Cancel</button>
                            </div>
                            
                            <form onSubmit={handleWalkinSubmit} className="responsive-grid-2">
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", color: "#e2e8f0", fontWeight: 600 }}>Full Name *</label>
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
                        </section>
                    )}

                    {view === "profile" && selectedPatient && (
                        <div className="fade-in">
                            <button onClick={() => setView("search")} style={{ background: "transparent", border: "none", color: "#01b6af", cursor: "pointer", fontWeight: 600, marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
                                <i className="fa-solid fa-arrow-left"></i> Back to Search
                            </button>
                            
                            {/* TOP PROFILE CARD */}
                            <div className="responsive-flex-wrap" style={{ background: "#fff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "24px", marginBottom: "24px", alignItems: "flex-start", boxShadow: "0 10px 30px rgba(0,0,0,0.02)" }}>
                                <img src={selectedPatient.profilePhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedPatient.fullName)}&background=01b6af&color=fff`} style={{ width: "100px", height: "100px", borderRadius: "50%", border: "4px solid #f1f5f9", flexShrink: 0 }} alt="" />
                                <div style={{ flex: 1, minWidth: "200px" }}>
                                    <h2 style={{ margin: "0 0 8px 0", color: "var(--navy-deep)", fontSize: "1.6rem", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                        {selectedPatient.fullName}
                                        <span style={{ fontSize: "0.85rem", background: "#f8fafc", padding: "4px 10px", borderRadius: "10px", border: "1px solid #e2e8f0", color: "#64748b" }}>
                                            Total Visits: <strong>{patientVisits.length}</strong>
                                        </span>
                                    </h2>
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
                            </div>

                            {followUpSuccess && (
                                <div style={{ marginBottom: "20px", padding: "14px 20px", borderRadius: 12, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", fontWeight: 600 }}>
                                    <i className="fa-solid fa-circle-check" style={{ marginRight: "8px" }}></i> {followUpSuccess}
                                </div>
                            )}

                            {/* FOLLOW-UP BOOKING MODAL (REMOVED) */}

                            {/* VISIT HISTORY TIMELINE */}
                            <section className="theme-section-dark">
                                <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}><i className="fa-solid fa-clock-rotate-left" style={{color: "#01b6af"}}></i> Visit History</h3>
                            
                                <div style={{ display: "grid", gap: "16px", paddingBottom: "60px" }}>
                                    {patientVisits.map((visit, index) => (
                                        <div key={visit.appointmentId} className="dark-glass-card">
                                            <div className="appointment-card-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
                                                <div>
                                                    <div style={{ color: "#01b6af", fontWeight: 700, fontSize: "1.1rem", marginBottom: "8px" }}>
                                                    {new Date(visit.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} • {visit.time}
                                                </div>
                                                <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                                                    <span style={{ background: visit.status === 'completed' ? "#dcfce7" : "#fef3c7", color: visit.status === 'completed' ? "#16a34a" : "#d97706", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>{visit.status.toUpperCase()}</span>
                                                    <span style={{ background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>{visit.type}</span>
                                                </div>
                                                
                                                    <div style={{ display: "grid", gap: "10px" }}>
                                                        {visit.chiefComplaint && (
                                                            <div><span style={{fontSize:"0.85rem", textTransform:"uppercase", fontWeight:700}}>Symptoms / Complaint</span><p style={{margin:"2px 0 0 0", color:"#ffffff", fontWeight:500}}>{visit.chiefComplaint}</p></div>
                                                        )}
                                                        {visit.diagnosis && (
                                                            <div><span style={{fontSize:"0.85rem", textTransform:"uppercase", fontWeight:700}}>Diagnosis</span><p style={{margin:"2px 0 0 0", color:"#01b6af", fontWeight:600}}>{visit.diagnosis}</p></div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="responsive-flex-wrap" style={{ flexDirection: "column", gap: "12px", alignItems: "flex-end", minWidth: "150px" }}>
                                                    <div style={{ textAlign: "right" }}>
                                                        <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "4px" }}>₹{visit.fee}</div>
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
                                        <div style={{ padding: "40px", textAlign: "center", background: "rgba(255,255,255,0.05)", borderRadius: "16px", border: "1px dashed rgba(255,255,255,0.2)", color: "#94a3b8" }}>
                                            No past visits found for this patient.
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}
        </DashboardLayout>
    );
};



const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1",
    fontSize: "0.95rem", outline: "none", color: "#0f172a", background: "#ffffff"
};

const tagStyle = {
    background: "#f1f5f9", padding: "6px 12px", borderRadius: "8px", fontSize: "0.85rem", color: "#475569", fontWeight: 600
};

export default Patients;
