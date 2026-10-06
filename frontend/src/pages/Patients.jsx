import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { getApiBaseUrl } from "../utils/apiConfig";

const API = getApiBaseUrl();

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
        fullName: "", mobile: "", email: "", dob: "", gender: "", bloodGroup: "", address: ""
    });

    // Lookup & Search state
    const [lookupResult, setLookupResult] = useState(null);
    const [lookupLoading, setLookupLoading] = useState(false);

    const getToken = () => localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token") || localStorage.getItem("doctor_token") || localStorage.getItem("sb-access-token");

    const handleLookup = async (q) => {
        const cleanQ = (q || "").trim();
        if (!cleanQ || cleanQ.length < 3) {
            setLookupResult(null);
            return;
        }
        setLookupLoading(true);
        try {
            const token = getToken();
            const res = await axios.get(`${API}/api/patients/lookup`, {
                params: { q: cleanQ },
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success && res.data.found) {
                setLookupResult(res.data.patient);
            } else {
                setLookupResult(null);
            }
        } catch (err) {
            console.error("Lookup error:", err);
        } finally {
            setLookupLoading(false);
        }
    };

    const handleStartConsultationWithExisting = async (patientObj) => {
        setLoading(true);
        setError("");
        try {
            const token = getToken();
            const targetId = patientObj.userId || patientObj.id || patientObj.patientCode;

            // 1. Create Walk-in Visit for currently logged-in doctor
            const visitRes = await axios.post(`${API}/api/patients/${targetId}/visit`, {
                fee: doctor.consultationFee || 500,
                paymentStatus: "paid",
                reason: "Walk-in Consultation"
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const appointmentId = visitRes.data.appointment.id;

            navigate(`/consultation/${targetId}?appointmentId=${appointmentId}`, {
                state: {
                    appointmentId: appointmentId,
                    patient: {
                        ...patientObj,
                        id: appointmentId,
                        patientName: patientObj.fullName,
                        age: patientObj.age,
                        gender: patientObj.gender,
                        bloodGroup: patientObj.bloodGroup
                    },
                    doctorId: doctor.id,
                }
            });
        } catch (err) {
            console.error("Start existing consultation error:", err);
            setError("Failed to start consultation for existing patient.");
            setLoading(false);
        }
    };

    // Profile view state
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientVisits, setPatientVisits] = useState([]);
    const [editingEmail, setEditingEmail] = useState(false);
    const [tempEmail, setTempEmail] = useState("");
    const [savingEmail, setSavingEmail] = useState(false);

    const handleSaveEmail = async () => {
        if (!selectedPatient) return;
        setSavingEmail(true);
        setError("");
        try {
            const token = getToken();
            await axios.put(`${API}/api/patients/${selectedPatient.userId || selectedPatient.id}`, {
                email: tempEmail
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSelectedPatient(prev => ({ ...prev, email: tempEmail }));
            setPatients(prev => prev.map(p => p.id === selectedPatient.id || p.userId === selectedPatient.userId ? { ...p, email: tempEmail } : p));
            setEditingEmail(false);
            setFollowUpSuccess("Patient email updated successfully!");
            setTimeout(() => setFollowUpSuccess(""), 4000);
        } catch (err) {
            console.error("Update email error:", err);
            setError(err.response?.data?.error || "Failed to update email.");
        } finally {
            setSavingEmail(false);
        }
    };

    // Follow-up Booking Modal State
    const [showFollowUpModal, setShowFollowUpModal] = useState(false);
    const [followUpDate, setFollowUpDate] = useState("");
    const [availableSlots, setAvailableSlots] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState("");
    const [slotReason, setSlotReason] = useState("");
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [bookingFollowUp, setBookingFollowUp] = useState(false);
    const [followUpSuccess, setFollowUpSuccess] = useState("");


    // Delete Confirmation State
    const [deleteModal, setDeleteModal] = useState({
        show: false,
        mode: "single", // 'single' or 'all'
        patientId: null,
        appointmentId: null,
        date: "",
        patientName: ""
    });
    const [deleting, setDeleting] = useState(false);

    const handleDeleteConfirm = async () => {
        if (!deleteModal.patientId) return;
        setDeleting(true);
        setError("");
        try {
            const token = getToken();
            const headers = { Authorization: `Bearer ${token}` };

            if (deleteModal.mode === "single" && deleteModal.appointmentId) {
                // Delete single selected visit record
                await axios.delete(`${API}/api/patients/${deleteModal.patientId}/visit/${deleteModal.appointmentId}`, { headers });
                setPatientVisits(prev => prev.filter(v => v.appointmentId !== deleteModal.appointmentId));
                setFollowUpSuccess("Selected appointment record deleted successfully.");
            } else {
                // Delete entire patient record and all visits
                await axios.delete(`${API}/api/patients/${deleteModal.patientId}`, { headers });
                setFollowUpSuccess(`Patient record for ${deleteModal.patientName || "patient"} and all respective visits deleted successfully.`);
                setView("search");
                fetchPatients("");
            }
            setDeleteModal({ show: false, mode: "single", patientId: null, appointmentId: null, date: "", patientName: "" });
        } catch (err) {
            console.error("Delete error:", err);
            setError(err.response?.data?.error || "Failed to delete record.");
        } finally {
            setDeleting(false);
        }
    };

    useEffect(() => {
        if (!authLoading) {
            if (!doctor) {
                navigate("/login");
            } else {
                fetchPatients("");
            }
        }
    }, [doctor, authLoading, navigate]);

    const fetchPatients = async (q = "") => {
        setLoading(true);
        setError("");
        try {
            const token = getToken();
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
            const token = getToken();

            // 1. Create Walk-in Patient (or reuse existing)
            const patRes = await axios.post(`${API}/api/patients/walkin`, walkinForm, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const patientData = patRes.data.patient;
            const targetPatientId = patientData.userId || patientData.id || patientData.patientCode;

            // 2. Create Visit for current doctor
            const visitRes = await axios.post(`${API}/api/patients/${targetPatientId}/visit`, {
                fee: doctor.consultationFee || 500,
                paymentStatus: "paid",
                reason: "Walk-in Consultation"
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // 3. Navigate to Consultation
            const appointmentId = visitRes.data.appointment.id;

            let age = patientData.age || null;
            if (!age && walkinForm.dob) {
                const dob = new Date(walkinForm.dob);
                const diffMs = Date.now() - dob.getTime();
                const ageDt = new Date(diffMs);
                age = Math.abs(ageDt.getUTCFullYear() - 1970);
            }

            navigate(`/consultation/${targetPatientId}?appointmentId=${appointmentId}`, {
                state: {
                    appointmentId: appointmentId,
                    patient: {
                        ...patientData,
                        id: appointmentId,
                        patientName: patientData.fullName || walkinForm.fullName,
                        age: age,
                        gender: patientData.gender || walkinForm.gender,
                        bloodGroup: patientData.bloodGroup || walkinForm.bloodGroup
                    },
                    doctorId: doctor.id,
                }
            });

        } catch (err) {
            console.error("Walkin error", err);
            setError(err.response?.data?.error || "Failed to register walk-in patient.");
            setLoading(false);
        }
    };

    const openProfile = async (patientId) => {
        setLoading(true);
        setError("");
        try {
            const token = getToken();
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
        const pId = selectedPatient?.userId || selectedPatient?.id || visit.hospital_patient_id || visit.appointmentId;
        const encounterId = visit.visitId || visit.appointmentId || pId;
        const token = getToken();

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

        navigate(`/consultation/${encodeURIComponent(pId)}?appointmentId=${encodeURIComponent(visit.appointmentId)}`, {
            state: {
                appointmentId: visit.appointmentId,
                patient: selectedPatient,
                doctorId: doctor?.id,
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
            const token = getToken();
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
            const token = getToken();
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
                                                {p.patientCode} • {p.age ? `${p.age} yrs` : "Age -"} • {p.gender || "-"} • <i className="fa-solid fa-phone" style={{ fontSize: "0.8rem", marginLeft: "4px" }}></i> {p.mobile}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="responsive-flex-wrap" style={{ alignItems: "center", gap: "16px" }}>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "2px" }}>Total Visits: <strong style={{ color: "#0f172a" }}>{p.totalVisits}</strong></div>
                                            <div style={{ fontSize: "0.85rem", color: "#64748b" }}>Last Visit: <strong style={{ color: "#0f172a" }}>{p.lastVisit ? new Date(p.lastVisit).toLocaleDateString() : "Never"}</strong></div>
                                        </div>
                                        <button onClick={() => openProfile(p.userId)} style={{ background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
                                            View Profile <i className="fa-solid fa-arrow-right" style={{ marginLeft: "4px" }}></i>
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
                        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}><i className="fa-solid fa-user-plus" style={{ color: "#01b6af" }}></i> Register Walk-in Patient</h2>
                        <button onClick={() => { setView("search"); setLookupResult(null); }} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}><i className="fa-solid fa-times"></i> Cancel</button>
                    </div>

                    {/* Existing Patient Lookup Box */}
                    <div style={{ marginBottom: "24px", background: "#f8fafc", padding: "18px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                        <label style={{ display: "block", marginBottom: "8px", color: "#0f172a", fontWeight: 700, fontSize: "0.95rem" }}>
                            <i className="fa-solid fa-magnifying-glass" style={{ color: "#0d9488", marginRight: "6px" }}></i> Search Existing Patient (Phone, Email, or Patient ID)
                        </label>
                        <input 
                            type="text" 
                            placeholder="Enter mobile number or email to check existing records..." 
                            style={inputStyle}
                            onChange={(e) => handleLookup(e.target.value)}
                        />

                        {lookupLoading && (
                            <div style={{ marginTop: "10px", fontSize: "0.9rem", color: "#0d9488" }}>
                                <i className="fa-solid fa-spinner fa-spin"></i> Checking existing patient database...
                            </div>
                        )}

                        {lookupResult && (
                            <div style={{ marginTop: "16px", background: "#f0fdf4", border: "1.5px solid #22c55e", padding: "16px 20px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "#166534", display: "flex", alignItems: "center", gap: "8px" }}>
                                        <i className="fa-solid fa-circle-check" style={{ color: "#16a34a", fontSize: "1.1rem" }}></i> Existing Patient Found: {lookupResult.fullName}
                                    </div>
                                    <div style={{ fontSize: "0.9rem", color: "#15803d", marginTop: "4px" }}>
                                        Patient ID: <strong>{lookupResult.patientCode}</strong> | Phone: {lookupResult.mobile || "-"} | Email: {lookupResult.email || "-"} | Gender: {lookupResult.gender || "-"}
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => handleStartConsultationWithExisting(lookupResult)}
                                    disabled={loading}
                                    style={{ background: "#16a34a", color: "white", border: "none", padding: "12px 24px", borderRadius: "10px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.95rem" }}
                                >
                                    {loading ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-stethoscope" />}
                                    Start Consultation (Reuse ID: {lookupResult.patientCode})
                                </button>
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleWalkinSubmit} className="responsive-grid-2">
                        <div>
                            <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Full Name *</label>
                            <input type="text" value={walkinForm.fullName} onChange={e => setWalkinForm({ ...walkinForm, fullName: e.target.value })} required style={inputStyle} placeholder="John Doe" />
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Mobile Number *</label>
                            <input 
                                type="text" 
                                value={walkinForm.mobile} 
                                onChange={e => {
                                    const val = e.target.value;
                                    setWalkinForm({ ...walkinForm, mobile: val });
                                    if (val.length >= 6) handleLookup(val);
                                }} 
                                required 
                                style={inputStyle} 
                                placeholder="9876543210" 
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Date of Birth / Age</label>
                            <input type="date" value={walkinForm.dob} onChange={e => setWalkinForm({ ...walkinForm, dob: e.target.value })} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Gender</label>
                            <select value={walkinForm.gender} onChange={e => setWalkinForm({ ...walkinForm, gender: e.target.value })} style={inputStyle}>
                                <option value="">Select Gender</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Blood Group</label>
                            <select value={walkinForm.bloodGroup} onChange={e => setWalkinForm({ ...walkinForm, bloodGroup: e.target.value })} style={inputStyle}>
                                <option value="">Select Blood Group</option>
                                <option value="A+">A+</option><option value="A-">A-</option>
                                <option value="B+">B+</option><option value="B-">B-</option>
                                <option value="O+">O+</option><option value="O-">O-</option>
                                <option value="AB+">AB+</option><option value="AB-">AB-</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Email Address (Optional)</label>
                            <input 
                                type="email" 
                                value={walkinForm.email || ""} 
                                onChange={e => {
                                    const val = e.target.value;
                                    setWalkinForm({ ...walkinForm, email: val });
                                    if (val.includes("@")) handleLookup(val);
                                }} 
                                style={inputStyle} 
                                placeholder="patient@example.com" 
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "8px", color: "#475569", fontWeight: 600 }}>Locality / Address</label>
                            <input type="text" value={walkinForm.address} onChange={e => setWalkinForm({ ...walkinForm, address: e.target.value })} style={inputStyle} placeholder="City, Area" />
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

                    <div className="responsive-flex-wrap" style={{ background: "#fff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "24px", marginBottom: "24px", alignItems: "flex-start", boxShadow: "0 10px 30px rgba(0,0,0,0.02)" }}>
                        <img src={selectedPatient.profilePhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedPatient.fullName)}&background=01b6af&color=fff`} style={{ width: "100px", height: "100px", borderRadius: "50%", border: "4px solid #f1f5f9", flexShrink: 0 }} alt="" />
                        <div style={{ flex: 1, minWidth: "200px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", flexWrap: "wrap", gap: "12px" }}>
                                <h2 style={{ margin: "0 0 8px 0", color: "var(--navy-deep)", fontSize: "1.6rem", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                    {selectedPatient.fullName}
                                    <span style={{ fontSize: "0.85rem", background: "#f8fafc", padding: "4px 10px", borderRadius: "10px", border: "1px solid #e2e8f0", color: "#64748b" }}>
                                        Total Visits: <strong>{patientVisits.length}</strong>
                                    </span>
                                </h2>
                                <button
                                    onClick={() => setDeleteModal({
                                        show: true,
                                        mode: "all",
                                        patientId: selectedPatient.userId || selectedPatient.id,
                                        appointmentId: null,
                                        date: "",
                                        patientName: selectedPatient.fullName
                                    })}
                                    style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "8px 16px", borderRadius: "10px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                                >
                                    <i className="fa-solid fa-trash-can" /> Delete Patient & All Records
                                </button>
                            </div>
                            <div style={{ display: "flex", gap: "24px", color: "#475569", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
                                <span style={{ fontWeight: 600 }}><i className="fa-solid fa-id-card" style={{ color: "#08AEB8", marginRight: "6px" }}></i> {selectedPatient.patientCode}</span>
                                <span><i className="fa-solid fa-phone" style={{ color: "#08AEB8", marginRight: "6px" }}></i> {selectedPatient.mobile || "N/A"}</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    <i className="fa-solid fa-envelope" style={{ color: "#08AEB8" }}></i>
                                    {editingEmail ? (
                                        <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                                            <input
                                                type="email"
                                                value={tempEmail}
                                                onChange={e => setTempEmail(e.target.value)}
                                                style={{ padding: "4px 10px", borderRadius: "8px", border: "1px solid #08AEB8", fontSize: "0.9rem", outline: "none" }}
                                                placeholder="Enter email address..."
                                                autoFocus
                                            />
                                            <button onClick={handleSaveEmail} disabled={savingEmail} style={{ background: "#08AEB8", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 12px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}>
                                                {savingEmail ? <i className="fa-solid fa-spinner fa-spin" /> : "Save"}
                                            </button>
                                            <button onClick={() => setEditingEmail(false)} style={{ background: "#e2e8f0", color: "#475569", border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "0.85rem" }}>Cancel</button>
                                        </span>
                                    ) : (
                                        <span style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }} onClick={() => { setTempEmail(selectedPatient.email || ""); setEditingEmail(true); }}>
                                            {selectedPatient.email || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>+ Add Email</span>}
                                            <i className="fa-solid fa-pen" style={{ fontSize: "0.75rem", color: "#94a3b8", marginLeft: "2px" }}></i>
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                                <span style={tagStyle}>Age: {selectedPatient.age || "—"}</span>
                                <span style={tagStyle}>Gender: {selectedPatient.gender || "—"}</span>
                                <span style={tagStyle}>Blood: <strong style={{ color: "#ef4444" }}>{selectedPatient.bloodGroup || "—"}</strong></span>
                                {selectedPatient.address && <span style={tagStyle}><i className="fa-solid fa-location-dot"></i> {selectedPatient.address}</span>}
                            </div>
                        </div>
                    </div>

                    {followUpSuccess && (
                        <div style={{ marginBottom: "20px", padding: "14px 20px", borderRadius: 12, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", fontWeight: 600 }}>
                            <i className="fa-solid fa-circle-check" style={{ marginRight: "8px" }}></i> {followUpSuccess}
                        </div>
                    )}

                    <section className="theme-section-dark">
                        <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}><i className="fa-solid fa-clock-rotate-left" style={{ color: "#2b3333ff" }}></i> Visit History & Appointments</h3>

                        <div style={{ display: "grid", gap: "16px", paddingBottom: "60px" }}>
                            {patientVisits.map((visit, index) => (
                                <div key={visit.appointmentId || index} className="dark-glass-card">
                                    <div className="appointment-card-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
                                        <div>
                                            <div style={{ color: "#2b3333ff", fontWeight: 700, fontSize: "1.1rem", marginBottom: "8px" }}>
                                                {new Date(visit.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} • {visit.time}
                                            </div>
                                            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                                                <span style={{ background: visit.status === 'completed' ? "#dcfce7" : "#fef3c7", color: visit.status === 'completed' ? "#16a34a" : "#d97706", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>{String(visit.status || "").toUpperCase()}</span>
                                                <span style={{ background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>{visit.type}</span>
                                            </div>

                                            <div style={{ display: "grid", gap: "10px" }}>
                                                {visit.chiefComplaint && (
                                                    <div><span style={{ fontSize: "0.85rem", textTransform: "uppercase", fontWeight: 700 }}>Symptoms / Complaint</span><p style={{ margin: "2px 0 0 0", color: "#2b3333ff", fontWeight: 500 }}>{visit.chiefComplaint}</p></div>
                                                )}
                                                {visit.diagnosis && (
                                                    <div><span style={{ fontSize: "0.85rem", textTransform: "uppercase", fontWeight: 700 }}>Diagnosis</span><p style={{ margin: "2px 0 0 0", color: "#2b3333ff", fontWeight: 600 }}>{visit.diagnosis}</p></div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="responsive-flex-wrap" style={{ flexDirection: "column", gap: "12px", alignItems: "flex-end", minWidth: "150px" }}>
                                            <div style={{ textAlign: "right" }}>
                                                <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "4px" }}>₹{visit.fee}</div>
                                                <div style={{ color: visit.paymentStatus === 'paid' ? "#16a34a" : "#d97706", fontSize: "0.85rem", fontWeight: 600 }}>{visit.paymentStatus === 'paid' ? 'Paid' : 'Pending Payment'}</div>
                                            </div>

                                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                {(visit.status === 'completed' || visit.visitStage === 'completed' || visit.visitStage === 'exited' || visit.hasNotes || Boolean(visit.diagnosis || visit.notes)) ? (
                                                    <>
                                                        <button
                                                            onClick={() => window.open(`${API}/api/v1/clinical/notes/${encodeURIComponent(selectedPatient.userId)}/consultation-app-${visit.appointmentId}/pdf`, "_blank")}
                                                            style={{ background: "#10B981", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                                                        >
                                                            <i className="fa-solid fa-file-pdf"></i> PDF Report
                                                        </button>
                                                        <button
                                                            onClick={() => navigate(`/patients/${selectedPatient.userId}`)}
                                                            style={{ background: "#08AEB8", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                                                        >
                                                            <i className="fa-solid fa-file-medical"></i> View Record
                                                        </button>
                                                    </>
                                                ) : (visit.visitStage === "waiting" || visit.visitStage === "checked_in" || visit.visitStage === "in_consultation" || (visit.status === "confirmed" && visit.visitStage !== "completed" && visit.visitStage !== "cancelled")) ? (
                                                    <button
                                                        onClick={() => startConsultation(visit)}
                                                        style={{ background: "#08AEB8", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                                                    >
                                                        {visit.visitStage === "in_consultation" ? "In Consultation" : "Start Consultation"} <i className="fa-solid fa-arrow-right" />
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: "0.82rem", color: "#64748b", fontStyle: "italic", background: "#f1f5f9", padding: "6px 12px", borderRadius: "6px" }}>
                                                        Requires Queue Check-In
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => setDeleteModal({
                                                        show: true,
                                                        mode: "single",
                                                        patientId: selectedPatient.userId || selectedPatient.id,
                                                        appointmentId: visit.appointmentId,
                                                        date: visit.date,
                                                        patientName: selectedPatient.fullName
                                                    })}
                                                    title="Delete Selected Appointment Record"
                                                    style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "8px 12px", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
                                                >
                                                    <i className="fa-solid fa-trash-can" /> Delete Record
                                                </button>
                                            </div>
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

            {deleteModal.show && (
                <div className="modal-overlay" onClick={() => setDeleteModal({ show: false, mode: "single", patientId: null, appointmentId: null, date: "", patientName: "" })}>
                    <div className="modal-content" style={{ maxWidth: "500px", borderRadius: "16px", padding: "24px" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", color: "#ef4444" }}>
                            <div style={{ background: "rgba(239, 68, 68, 0.1)", borderRadius: "50%", width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <i className="fa-solid fa-triangle-exclamation fa-lg" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "1.2rem", color: "#0f172a" }}>
                                    {deleteModal.mode === "all" ? "Delete Patient & All Records" : "Delete Appointment Record"}
                                </h3>
                                <span style={{ fontSize: "0.8rem", color: "#ef4444", fontWeight: 700 }}>Permanent Action</span>
                            </div>
                        </div>

                        <p style={{ color: "#1e293b", fontSize: "1rem", lineHeight: 1.5, margin: "0 0 10px 0", fontWeight: 600 }}>
                            Are you sure you want to delete the existing patient record?
                        </p>

                        <p style={{ color: "#64748b", fontSize: "0.88rem", margin: "0 0 24px 0", lineHeight: 1.4 }}>
                            {deleteModal.mode === "all"
                                ? `This will permanently remove ${deleteModal.patientName || "this patient"} and ALL associated appointments, clinical notes, and prescriptions from the database.`
                                : `This will permanently delete the selected appointment record (${deleteModal.date}) and its associated consultation notes/prescriptions from the database.`}
                        </p>

                        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                            <button
                                disabled={deleting}
                                onClick={() => setDeleteModal({ show: false, mode: "single", patientId: null, appointmentId: null, date: "", patientName: "" })}
                                style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "10px 20px", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
                            >
                                Cancel
                            </button>
                            <button
                                disabled={deleting}
                                onClick={handleDeleteConfirm}
                                style={{ background: "#ef4444", color: "#ffffff", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
                            >
                                {deleting ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-trash-can" />}
                                {deleteModal.mode === "all" ? "Yes, Delete All Records" : "Yes, Delete Selected Record"}
                            </button>
                        </div>
                    </div>
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
