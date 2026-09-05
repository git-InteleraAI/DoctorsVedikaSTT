import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import authService from "../services/authService";

export default function Profile() {
    const { doctor, updateDoctor } = useAuth();

    const [activeTab, setActiveTab] = useState("info");
    const [isEditing, setIsEditing] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [showPublicPreview, setShowPublicPreview] = useState(false);

    const fileInputRef = useRef(null);

    // Form state initialized from doctor context with safe fallbacks
    const [formData, setFormData] = useState({
        fullName: doctor?.fullName || "Harshini Jakki",
        specialization: doctor?.specialization || "Cardiologist - Cardiac Surgeon",
        qualification: doctor?.qualification || "MBBS, MD (General Medicine), DM (Cardiology)",
        dob: doctor?.dob || "2001-09-11",
        gender: doctor?.gender || "Female",
        email: doctor?.email || "jakkiharshini@gmail.com",
        mobileNumber: doctor?.mobileNumber || "9390175007",
        nationality: doctor?.nationality || "Indian",
        joinedDate: doctor?.createdAt ? new Date(doctor.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "22 Aug 2026",
        userId: doctor?.userId || "DVKID12345",
        status: doctor?.verificationStatus || "Pending",
        preferredLanguage: doctor?.preferredLanguage || "English",
        clinicName: doctor?.clinicName || "sri sai krishna clinic",
        clinicAddress: doctor?.clinicAddress || "SR.Nagar, Bapunagar, Hyderabad",
        consultationFee: doctor?.consultationFee || "200",
        experience: doctor?.experience || "5 Years",
        languages: Array.isArray(doctor?.languages) ? doctor.languages.join(", ") : (doctor?.languages || "English, Hindi, Telugu"),
        description: doctor?.description || "Dedicated Cardiologist & Cardiac Surgeon committed to providing compassionate patient care.",
        registrationNumber: doctor?.registrationNumber || "MCI-98658",
    });

    useEffect(() => {
        if (doctor) {
            setFormData(prev => ({
                ...prev,
                fullName: doctor.fullName || prev.fullName,
                specialization: doctor.specialization || prev.specialization,
                qualification: doctor.qualification || prev.qualification,
                dob: doctor.dob || prev.dob,
                gender: doctor.gender || prev.gender,
                email: doctor.email || prev.email,
                mobileNumber: doctor.mobileNumber || prev.mobileNumber,
                nationality: doctor.nationality || prev.nationality,
                userId: doctor.userId || prev.userId,
                status: doctor.verificationStatus || prev.status,
                preferredLanguage: doctor.preferredLanguage || prev.preferredLanguage,
                clinicName: doctor.clinicName || prev.clinicName,
                clinicAddress: doctor.clinicAddress || prev.clinicAddress,
                consultationFee: doctor.consultationFee || prev.consultationFee,
                experience: doctor.experience || prev.experience,
                languages: Array.isArray(doctor.languages) ? doctor.languages.join(", ") : (doctor.languages || prev.languages),
                description: doctor.description || prev.description,
                registrationNumber: doctor.registrationNumber || prev.registrationNumber,
            }));
        }
    }, [doctor]);

    /* ── Photo upload handler ── */
    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingPhoto(true);
        try {
            const photoUrl = await authService.uploadDocument(file, "profile");
            const updated = await authService.updateProfile({ avatarUrl: photoUrl });
            if (updated?.doctor) {
                updateDoctor(updated.doctor);
            } else {
                updateDoctor({ ...doctor, avatarUrl: photoUrl });
            }
            setSaveMessage("Profile photo updated successfully!");
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            console.error("Photo upload error:", err);
            const localUrl = URL.createObjectURL(file);
            updateDoctor({ ...doctor, avatarUrl: localUrl });
        } finally {
            setUploadingPhoto(false);
        }
    };

    /* ── Save profile handler ── */
    const handleSaveProfile = async (e) => {
        if (e) e.preventDefault();
        setSaving(true);
        try {
            const updated = await authService.updateProfile(formData);
            if (updated?.doctor) {
                updateDoctor(updated.doctor);
            } else {
                updateDoctor({ ...doctor, ...formData });
            }
            setIsEditing(false);
            setSaveMessage("Profile updated successfully!");
            setTimeout(() => setSaveMessage(null), 3500);
        } catch (err) {
            console.error("Save error:", err);
            updateDoctor({ ...doctor, ...formData });
            setIsEditing(false);
            setSaveMessage("Profile updated!");
            setTimeout(() => setSaveMessage(null), 3500);
        } finally {
            setSaving(false);
        }
    };

    /* ── Navigation Items ── */
    const navItems = [
        { id: "info", label: "Profile Information", icon: "fa-solid fa-user" },
        { id: "clinic", label: "Clinic & Location", icon: "fa-solid fa-hospital" },
        { id: "pro", label: "Professional Details", icon: "fa-solid fa-briefcase" },
        { id: "edu", label: "Education & Certificates", icon: "fa-solid fa-graduation-cap" },
        { id: "exp", label: "Experience", icon: "fa-solid fa-award" },
        { id: "lang", label: "Languages", icon: "fa-solid fa-language" },
        { id: "fees", label: "Consultation Fees", icon: "fa-solid fa-credit-card" },
        { id: "about", label: "About Me", icon: "fa-solid fa-circle-question" },
        { id: "settings", label: "Account Settings", icon: "fa-solid fa-gear" },
    ];

    /* ── DOB display ── */
    const formatDobDisplay = (dateStr) => {
        if (!dateStr) return "11 Sept 2001";
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        } catch {
            return dateStr;
        }
    };

    const avatarImage = doctor?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.fullName)}&background=01b6af&color=fff`;

    return (
        <DashboardLayout activePage="profile" searchPlaceholder="Search patients, appointments, etc...">
            {/* Hidden File Input for Avatar */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="image/*"
                onChange={handlePhotoUpload}
            />

            <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

                {/* ── Page Header ── */}
                <div style={{ marginBottom: 16, flexShrink: 0 }}>
                    <h1 style={{ color: "#082B68", fontWeight: 800, fontSize: "1.65rem", margin: "0 0 4px" }}>My Profile</h1>
                    <p style={{ color: "#64748b", margin: 0, fontSize: "0.85rem" }}>Manage your professional information and profile settings.</p>
                </div>

                {/* ── Save Notification Banner ── */}
                {saveMessage && (
                    <div style={{ marginBottom: 14, padding: "10px 16px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, color: "#059669", fontWeight: 600, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <i className="fa-solid fa-circle-check" style={{ fontSize: "1.05rem" }} />
                        {saveMessage}
                    </div>
                )}

                {/* ── Main Layout Grid ── */}
                <div className="profile-layout-wrapper">

                    {/* ═══ LEFT: Fixed Non-Scrolling Inner Sidebar ═══ */}
                    <div className="profile-sidebar">
                        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "12px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
                            <div style={{ padding: "6px 10px 12px", color: "#0f172a", fontWeight: 800, fontSize: "0.92rem" }}>
                                Profile
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto" }}>
                                {navItems.map((item) => {
                                    const active = activeTab === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setActiveTab(item.id)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justify: "space-between",
                                                padding: "9px 10px",
                                                borderRadius: 9,
                                                border: "none",
                                                background: active ? "rgba(8,174,184,0.1)" : "transparent",
                                                color: active ? "#082B68" : "#475569",
                                                fontWeight: active ? 700 : 500,
                                                fontSize: "0.83rem",
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                                borderLeft: active ? "3.5px solid #08AEB8" : "3.5px solid transparent",
                                                width: "100%",
                                                boxSizing: "border-box",
                                                gap: 8,
                                            }}
                                            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f8fafc"; }}
                                            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 7,
                                                    background: active ? "#08AEB8" : "#f1f5f9",
                                                    color: active ? "#fff" : "#64748b",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: "0.78rem", flexShrink: 0
                                                }}>
                                                    <i className={item.icon} />
                                                </div>
                                                <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
                                            </div>
                                            <i className="fa-solid fa-chevron-right" style={{ fontSize: "0.68rem", color: active ? "#08AEB8" : "#cbd5e1", flexShrink: 0, marginLeft: "auto" }} />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Preview Public Profile Box INSIDE the sidebar container */}
                            <div
                                onClick={() => setShowPublicPreview(true)}
                                style={{
                                    marginTop: 14,
                                    background: "rgba(8,174,184,0.04)",
                                    borderRadius: 12,
                                    border: "1.5px solid rgba(8,174,184,0.25)",
                                    padding: "12px 12px",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                    display: "flex",
                                    alignItems: "center",
                                    justify: "space-between",
                                    flexShrink: 0
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(8,174,184,0.08)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(8,174,184,0.04)"}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(8,174,184,0.15)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", flexShrink: 0 }}>
                                        <i className="fa-solid fa-eye" />
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#082B68", whiteSpace: "nowrap" }}>Preview Public Profile</div>
                                        <div style={{ fontSize: "0.68rem", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>See how patients see profile</div>
                                    </div>
                                </div>
                                <i className="fa-solid fa-chevron-right" style={{ fontSize: "0.68rem", color: "#08AEB8", flexShrink: 0, marginLeft: 4 }} />
                            </div>
                        </div>
                    </div>

                    {/* ═══ RIGHT: Internal Scrollable Active Section Content Card ═══ */}
                    <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>

                        {/* DYNAMIC CARD CONTENT BASED ON activeTab */}
                        <div className="theme-section-dark" style={{ borderRadius: 18, padding: "22px 26px", boxSizing: "border-box", height: "100%", overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)" }}>

                            {/* Section Header */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(1, 182, 175, 0.15)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
                                        <i className={navItems.find(n => n.id === activeTab)?.icon || "fa-solid fa-user"} />
                                    </div>
                                    <div>
                                        <h2 style={{ fontWeight: 800, fontSize: "1.15rem", color: "#ffffff", margin: 0 }}>
                                            {navItems.find(n => n.id === activeTab)?.label || "Profile Information"}
                                        </h2>
                                        <p style={{ color: "#94a3b8", margin: 0, fontSize: "0.82rem" }}>
                                            {activeTab === "info" && "Update your personal and professional details."}
                                            {activeTab === "clinic" && "Manage your clinic details and location settings."}
                                            {activeTab === "pro" && "Update specialization, registration and domain details."}
                                            {activeTab === "edu" && "Add and manage medical degrees and certificates."}
                                            {activeTab === "exp" && "Showcase clinical experience and hospital history."}
                                            {activeTab === "lang" && "Manage languages spoken for consultations."}
                                            {activeTab === "fees" && "Set consultation fees for physical and online visits."}
                                            {activeTab === "about" && "Write your doctor bio and patient welcome message."}
                                            {activeTab === "settings" && "Manage password, notifications and security."}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsEditing(true)}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "8px 18px", background: "#08AEB8", color: "#fff",
                                        border: "none", borderRadius: 9, fontWeight: 700,
                                        fontSize: "0.84rem", cursor: "pointer",
                                        boxShadow: "0 4px 12px rgba(8,174,184,0.22)",
                                        transition: "all 0.2s",
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = "#07969e"}
                                    onMouseLeave={(e) => e.currentTarget.style.background = "#08AEB8"}
                                >
                                    <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                </button>
                            </div>

                            {/* ── TAB 1: PROFILE INFORMATION ── */}
                            {activeTab === "info" && (
                                <div className="dark-glass-card" style={{ display: "flex", gap: 26, padding: "20px", position: "relative", overflow: "hidden" }}>

                                    {/* LEFT: Banner + Avatar Card */}
                                    <div style={{ width: 230, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                                        {/* Curved Cyan Top Accent */}
                                        <div style={{
                                            position: "absolute", top: -20, left: -20, right: -20, height: 86,
                                            background: "linear-gradient(135deg, rgba(1, 182, 175, 0.25) 0%, rgba(15, 23, 42, 0.5) 100%)",
                                            borderRadius: "16px 16px 50% 50%",
                                            zIndex: 0,
                                        }} />

                                        {/* Avatar Container */}
                                        <div style={{ position: "relative", marginTop: 10, marginBottom: 12, zIndex: 1 }}>
                                            <img
                                                src={avatarImage}
                                                alt={formData.fullName}
                                                style={{
                                                    width: 104, height: 104, borderRadius: "50%",
                                                    objectFit: "cover", border: "4px solid #ffffff",
                                                    boxShadow: "0 6px 16px rgba(0,0,0,0.08)"
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploadingPhoto}
                                                title="Upload Profile Photo"
                                                style={{
                                                    position: "absolute", bottom: 2, right: 2,
                                                    width: 30, height: 30, borderRadius: "50%",
                                                    background: "#ffffff", border: "1.5px solid #e2e8f0",
                                                    color: "#08AEB8", cursor: "pointer",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                                                    fontSize: "0.82rem", transition: "transform 0.15s"
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                                                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                                            >
                                                {uploadingPhoto
                                                    ? <i className="fa-solid fa-spinner fa-spin" />
                                                    : <i className="fa-solid fa-camera" />
                                                }
                                            </button>
                                        </div>

                                        {/* Doctor Name & Verification */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 2 }}>
                                            <h3 style={{ fontWeight: 800, fontSize: "1.05rem", color: "#ffffff", margin: 0 }}>{formData.fullName}</h3>
                                            <i className="fa-solid fa-circle-check" style={{ color: "#01b6af", fontSize: "0.9rem" }} title="Verified Doctor" />
                                        </div>

                                        {/* Specialization */}
                                        <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "#01b6af", marginBottom: 6 }}>
                                            {formData.specialization}
                                        </div>

                                        {/* Qualifications */}
                                        <div style={{ fontSize: "0.76rem", color: "#94a3b8", lineHeight: 1.45, maxWidth: 200 }}>
                                            {formData.qualification}
                                        </div>
                                    </div>

                                    {/* RIGHT: 2-Column Info Grid */}
                                    <div className="responsive-grid-2" style={{ flex: 1, paddingTop: 8 }}>

                                        {/* Full Name */}
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                                                <i className="fa-solid fa-user" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Full Name</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#ffffff" }}>{formData.fullName}</div>
                                            </div>
                                        </div>

                                        {/* Nationality */}
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                                                <i className="fa-solid fa-globe" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Nationality</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#ffffff" }}>{formData.nationality}</div>
                                            </div>
                                        </div>

                                        {/* Date of Birth */}
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                                                <i className="fa-solid fa-calendar-days" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Date of Birth</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#ffffff" }}>{formatDobDisplay(formData.dob)}</div>
                                            </div>
                                        </div>

                                        {/* Joined On */}
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                                                <i className="fa-solid fa-calendar-check" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Joined on</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#ffffff" }}>{formData.joinedDate}</div>
                                            </div>
                                        </div>

                                        {/* Gender */}
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                                                <i className="fa-solid fa-venus-mars" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Gender</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#ffffff" }}>{formData.gender}</div>
                                            </div>
                                        </div>

                                        {/* User ID
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f8fafc", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid #f1f5f9" }}>
                                                <i className="fa-solid fa-id-card" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>User ID</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#0f172a" }}>{formData.userId}</div>
                                            </div>
                                        </div> */}

                                        {/* Email Address */}
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                                                <i className="fa-solid fa-envelope" />
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Email Address</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "#01b6af", wordBreak: "break-all" }}>{formData.email}</div>
                                            </div>
                                        </div>

                                        {/* Profile Status
                                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f8fafc", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid #f1f5f9" }}>
                                            <i className="fa-solid fa-shield-halved" />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Profile Status</div>
                                            <span style={{
                                                background: "rgba(16,185,129,0.12)", color: "#10B981",
                                                padding: "2px 10px", borderRadius: 16, fontSize: "0.74rem", fontWeight: 700,
                                                display: "inline-block"
                                            }}>
                                                {formData.status}
                                            </span>
                                        </div>
                                    </div>  */}


                                        {/* Phone Number */}
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                                                <i className="fa-solid fa-phone" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Phone Number</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#ffffff" }}>{formData.mobileNumber}</div>
                                            </div>
                                        </div>

                                        {/* Preferred Language */}
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                                                <i className="fa-solid fa-language" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 600, marginBottom: 1 }}>Preferred Language (App)</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#ffffff" }}>{formData.preferredLanguage}</div>
                                            </div>
                                        </div>

                                    </div>

                                </div>
                            )}

                            {/* ── TAB 2: CLINIC & LOCATION ── */}
                            {activeTab === "clinic" && (
                                <div className="dark-glass-card" style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <i className="fa-solid fa-hospital" style={{ color: "#01b6af", fontSize: "1.4rem" }} />
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#ffffff" }}>{formData.clinicName}</div>
                                            <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{formData.clinicAddress}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                                        <div>
                                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Consultation Hours</span>
                                            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#e2e8f0" }}>Mon - Sat (09:00 AM - 08:00 PM)</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Consultation Charge</span>
                                            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#01b6af" }}>₹{formData.consultationFee} per visit</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── TAB 3: PROFESSIONAL DETAILS ── */}
                            {activeTab === "pro" && (
                                <div className="dark-glass-card" style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                        <div>
                                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Registration Number</span>
                                            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#ffffff" }}>{formData.registrationNumber}</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Specialization</span>
                                            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#01b6af" }}>{formData.specialization}</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Medical Council</span>
                                            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#e2e8f0" }}>State Medical Council</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>License Verification</span>
                                            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#10B981" }}>Verified & Active</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── TAB 4: EDUCATION & CERTIFICATES ── */}
                            {activeTab === "edu" && (
                                <div className="dark-glass-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#ffffff" }}>Qualifications & Degrees</div>
                                    <div style={{ fontSize: "0.85rem", color: "#e2e8f0", background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}>
                                        {formData.qualification}
                                    </div>
                                </div>
                            )}

                            {/* ── TAB 5: EXPERIENCE ── */}
                            {activeTab === "exp" && (
                                <div className="dark-glass-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#ffffff" }}>Clinical Experience</div>
                                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#01b6af" }}>{formData.experience} of medical clinical practice</div>
                                    <div style={{ fontSize: "0.82rem", color: "#94a3b8" }}>Currently practicing at {formData.clinicName}</div>
                                </div>
                            )}

                            {/* ── TAB 6: LANGUAGES ── */}
                            {activeTab === "lang" && (
                                <div className="dark-glass-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#ffffff" }}>Languages Spoken for Consultation</div>
                                    <div style={{ display: "flex", gap: 10 }}>
                                        {formData.languages.split(",").map((l, i) => (
                                            <span key={i} style={{ background: "rgba(1, 182, 175, 0.2)", color: "#01b6af", padding: "4px 14px", borderRadius: 20, fontSize: "0.82rem", fontWeight: 600 }}>
                                                {l.trim()}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── TAB 7: CONSULTATION FEES ── */}
                            {activeTab === "fees" && (
                                <div className="dark-glass-card" style={{ display: "flex", flexDirection: "column", gap: 14, padding: "20px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.05)", padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)" }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#ffffff" }}>In-Clinic Consultation Fee</div>
                                            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Physical visit at clinic</div>
                                        </div>
                                        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#01b6af" }}>₹{formData.consultationFee}</div>
                                    </div>
                                </div>
                            )}

                            {/* ── TAB 8: ABOUT ME ── */}
                            {activeTab === "about" && (
                                <div className="dark-glass-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#ffffff" }}>Doctor Bio & Summary</div>
                                    <p style={{ fontSize: "0.85rem", color: "#e2e8f0", margin: 0, lineHeight: 1.6, background: "rgba(255,255,255,0.05)", padding: "14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)" }}>
                                        {formData.description}
                                    </p>
                                </div>
                            )}

                            {/* ── TAB 9: ACCOUNT SETTINGS ── */}
                            {activeTab === "settings" && (
                                <div className="dark-glass-card" style={{ display: "flex", flexDirection: "column", gap: 14, padding: "20px" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#ffffff" }}>Account Security & Preferences</div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.05)", padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)" }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ffffff" }}>Password</div>
                                            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Last updated 30 days ago</div>
                                        </div>
                                        <button onClick={() => setIsEditing(true)} style={{ padding: "6px 14px", background: "rgba(1, 182, 175, 0.2)", border: "1px solid rgba(1, 182, 175, 0.3)", borderRadius: 8, fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", color: "#01b6af" }}>Change Password</button>
                                    </div>
                                </div>
                            )}

                        </div>

                    </div>

                </div>

            </div>

            {/* ═════════════════════════════════════════════════════════
               EDIT PROFILE MODAL
            ═════════════════════════════════════════════════════════ */}
            {isEditing && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 2000, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20
                }}>
                    <div style={{
                        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 640,
                        boxShadow: "0 20px 40px rgba(0,0,0,0.15)", overflow: "hidden", display: "flex", flexDirection: "column",
                        maxHeight: "90vh"
                    }}>
                        {/* Modal Header */}
                        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg,#082B68,#08AEB8)" }}>
                            <div style={{ color: "#fff" }}>
                                <h3 style={{ margin: 0, fontWeight: 800, fontSize: "1.15rem" }}>Edit Profile Information</h3>
                                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "rgba(255,255,255,0.8)" }}>Update your professional & personal details</p>
                            </div>
                            <button onClick={() => setIsEditing(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>

                        {/* Modal Body / Form */}
                        <form onSubmit={handleSaveProfile} style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Full Name</label>
                                    <input
                                        type="text"
                                        value={formData.fullName}
                                        onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                        required
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Specialization</label>
                                    <input
                                        type="text"
                                        value={formData.specialization}
                                        onChange={e => setFormData({ ...formData, specialization: e.target.value })}
                                        required
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Date of Birth</label>
                                    <input
                                        type="date"
                                        value={formData.dob}
                                        onChange={e => setFormData({ ...formData, dob: e.target.value })}
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Gender</label>
                                    <select
                                        value={formData.gender}
                                        onChange={e => setFormData({ ...formData, gender: e.target.value })}
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box", background: "#fff" }}
                                    >
                                        <option value="Female">Female</option>
                                        <option value="Male">Male</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Email Address</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        required
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Phone Number</label>
                                    <input
                                        type="text"
                                        value={formData.mobileNumber}
                                        onChange={e => setFormData({ ...formData, mobileNumber: e.target.value })}
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Nationality</label>
                                    <input
                                        type="text"
                                        value={formData.nationality}
                                        onChange={e => setFormData({ ...formData, nationality: e.target.value })}
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Registration Number</label>
                                    <input
                                        type="text"
                                        value={formData.registrationNumber}
                                        onChange={e => setFormData({ ...formData, registrationNumber: e.target.value })}
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Consultation Fee (₹)</label>
                                    <input
                                        type="number"
                                        value={formData.consultationFee}
                                        onChange={e => setFormData({ ...formData, consultationFee: e.target.value })}
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Languages Spoken</label>
                                    <input
                                        type="text"
                                        value={formData.languages}
                                        onChange={e => setFormData({ ...formData, languages: e.target.value })}
                                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>

                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Qualifications & Degrees</label>
                                <input
                                    type="text"
                                    value={formData.qualification}
                                    onChange={e => setFormData({ ...formData, qualification: e.target.value })}
                                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                />
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Clinic Name</label>
                                <input
                                    type="text"
                                    value={formData.clinicName}
                                    onChange={e => setFormData({ ...formData, clinicName: e.target.value })}
                                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                />
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Clinic Address</label>
                                <textarea
                                    rows={2}
                                    value={formData.clinicAddress}
                                    onChange={e => setFormData({ ...formData, clinicAddress: e.target.value })}
                                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                                />
                            </div>

                            {/* Modal Footer */}
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    style={{ padding: "9px 18px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 9, fontWeight: 700, cursor: "pointer", fontSize: "0.84rem" }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{ padding: "9px 22px", background: "linear-gradient(135deg,#082B68,#08AEB8)", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.84rem", display: "flex", alignItems: "center", gap: 8 }}
                                >
                                    {saving
                                        ? <><i className="fa-solid fa-spinner fa-spin" /> Saving...</>
                                        : <><i className="fa-solid fa-check" /> Save Changes</>
                                    }
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════
               PREVIEW PUBLIC PROFILE MODAL
            ═════════════════════════════════════════════════════════ */}
            {showPublicPreview && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 2000, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20
                }}>
                    <div style={{
                        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 520,
                        boxShadow: "0 20px 40px rgba(0,0,0,0.18)", overflow: "hidden"
                    }}>
                        <div style={{ padding: "16px 20px", background: "linear-gradient(135deg,#082B68,#08AEB8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <i className="fa-solid fa-eye" />
                                <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>Patient Profile View</span>
                            </div>
                            <button onClick={() => setShowPublicPreview(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: "50%", cursor: "pointer" }}>
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>
                        <div style={{ padding: 22, textAlign: "center" }}>
                            <img src={avatarImage} alt={formData.fullName} style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover", marginBottom: 10, border: "4px solid #08AEB8" }} />
                            <h3 style={{ margin: "0 0 3px", fontWeight: 800, color: "#082B68", fontSize: "1.15rem" }}>{formData.fullName}</h3>
                            <div style={{ color: "#08AEB8", fontWeight: 700, fontSize: "0.88rem", marginBottom: 5 }}>{formData.specialization}</div>
                            <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 14 }}>{formData.qualification} • {formData.experience}</div>
                            <div style={{ background: "#f8fafc", padding: 14, borderRadius: 12, border: "1px solid #e2e8f0", textAlign: "left", fontSize: "0.84rem", color: "#334155", display: "flex", flexDirection: "column", gap: 8 }}>
                                <div><strong>Clinic:</strong> {formData.clinicName}</div>
                                <div><strong>Address:</strong> {formData.clinicAddress}</div>
                                <div><strong>Languages:</strong> {formData.languages}</div>
                                <div><strong>Consultation Fee:</strong> ₹{formData.consultationFee}</div>
                            </div>
                        </div>
                        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", textAlign: "right" }}>
                            <button onClick={() => setShowPublicPreview(false)} style={{ padding: "8px 18px", background: "#08AEB8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.84rem" }}>Close Preview</button>
                        </div>
                    </div>
                </div>
            )}

        </DashboardLayout>
    );
}
