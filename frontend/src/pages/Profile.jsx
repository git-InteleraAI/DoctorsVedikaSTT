import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import authService from "../services/authService";

export default function Profile() {
    const { doctor, updateDoctor } = useAuth();

    const [activeTab, setActiveTab] = useState("info");
    const [editingSection, setEditingSection] = useState(null); // 'info' | 'clinic' | 'pro' | 'edu' | 'exp' | 'lang' | 'fees' | 'about' | 'settings' | null
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [showPublicPreview, setShowPublicPreview] = useState(false);

    // Password Change State
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
    const [pwdData, setPwdData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdError, setPwdError] = useState("");
    const [pwdSuccess, setPwdSuccess] = useState("");

    const fileInputRef = useRef(null);
    const isManualScrolling = useRef(false);
    const manualScrollTimeoutRef = useRef(null);

    const handleChangePasswordSubmit = async (e) => {
        e.preventDefault();
        setPwdError("");
        setPwdSuccess("");

        if (pwdData.newPassword.length < 6) {
            setPwdError("New password must be at least 6 characters long.");
            return;
        }

        if (pwdData.newPassword !== pwdData.confirmPassword) {
            setPwdError("New password and confirm password do not match.");
            return;
        }

        setPwdLoading(true);
        try {
            const res = await authService.changePassword(pwdData.currentPassword, pwdData.newPassword);
            setPwdSuccess(res?.message || "Password updated successfully!");
            setPwdData({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setTimeout(() => {
                setShowChangePasswordModal(false);
                setPwdSuccess("");
            }, 1800);
        } catch (err) {
            setPwdError(err.message || "Failed to update password.");
        } finally {
            setPwdLoading(false);
        }
    };

    // Form state initialized from doctor context with safe fallbacks
    const [formData, setFormData] = useState({
        fullName: doctor?.fullName || doctor?.name || "",
        specialization: doctor?.specialization || "",
        qualification: doctor?.qualification || "",
        dob: doctor?.dob || "",
        gender: doctor?.gender || "Male",
        email: doctor?.email || "",
        mobileNumber: doctor?.mobileNumber === "0000000000" ? "" : (doctor?.mobileNumber || ""),
        nationality: doctor?.nationality || "Indian",
        joinedDate: doctor?.createdAt ? new Date(doctor.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
        userId: doctor?.userId || "",
        status: doctor?.verificationStatus || "Pending",
        preferredLanguage: doctor?.preferredLanguage || "English",
        clinicName: doctor?.clinicName || "",
        clinicAddress: doctor?.clinicAddress || "",
        consultationFee: doctor?.consultationFee || "",
        experience: doctor?.experience || "",
        languages: Array.isArray(doctor?.languages) ? doctor.languages.join(", ") : (doctor?.languages || ""),
        description: doctor?.description || "",
        registrationNumber: doctor?.registrationNumber || "",
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

    /* ── Save section handler (Inline Editing) ── */
    const handleSaveSection = async (sectionName, e) => {
        if (e) e.preventDefault();

        if (formData.mobileNumber) {
            const mobileDigits = String(formData.mobileNumber).replace(/\D/g, "");
            if (mobileDigits.length !== 10) {
                setSaveMessage("Mobile number must be exactly 10 digits.");
                setTimeout(() => setSaveMessage(null), 3500);
                return;
            }
            if (!/^[6-9]/.test(mobileDigits)) {
                setSaveMessage("Mobile number must start with 6, 7, 8, or 9.");
                setTimeout(() => setSaveMessage(null), 3500);
                return;
            }
        }

        setSaving(true);
        try {
            const updated = await authService.updateProfile(formData);
            if (updated?.doctor) {
                updateDoctor(updated.doctor);
            } else {
                updateDoctor({ ...doctor, ...formData });
            }
            setEditingSection(null);
            setSaveMessage(`${sectionName || "Profile"} updated successfully!`);
            setTimeout(() => setSaveMessage(null), 3500);
        } catch (err) {
            console.error("Save error:", err);
            updateDoctor({ ...doctor, ...formData });
            setEditingSection(null);
            setSaveMessage("Profile updated!");
            setTimeout(() => setSaveMessage(null), 3500);
        } finally {
            setSaving(false);
        }
    };

    /* ── Cancel Section Edit ── */
    const handleCancelEdit = () => {
        if (doctor) {
            setFormData({
                fullName: doctor.fullName || doctor.name || "",
                specialization: doctor.specialization || "",
                qualification: doctor.qualification || "",
                dob: doctor.dob || "",
                gender: doctor.gender || "Male",
                email: doctor.email || "",
                mobileNumber: doctor.mobileNumber === "0000000000" ? "" : (doctor.mobileNumber || ""),
                nationality: doctor.nationality || "Indian",
                joinedDate: doctor.createdAt ? new Date(doctor.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
                userId: doctor.userId || "",
                status: doctor.verificationStatus || "Pending",
                preferredLanguage: doctor.preferredLanguage || "English",
                clinicName: doctor.clinicName || "",
                clinicAddress: doctor.clinicAddress || "",
                consultationFee: doctor.consultationFee || "",
                experience: doctor.experience || "",
                languages: Array.isArray(doctor.languages) ? doctor.languages.join(", ") : (doctor.languages || ""),
                description: doctor.description || "",
                registrationNumber: doctor.registrationNumber || "",
            });
        }
        setEditingSection(null);
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

    /* ── Smooth Scroll Navigation ── */
    const handleNavClick = (id) => {
        setActiveTab(id);
        isManualScrolling.current = true;
        const section = document.getElementById(`section-${id}`);
        const mainEl = document.querySelector("main");
        if (section && mainEl) {
            const targetTop = section.offsetTop - 12;
            mainEl.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
        } else if (section) {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (manualScrollTimeoutRef.current) clearTimeout(manualScrollTimeoutRef.current);
        manualScrollTimeoutRef.current = setTimeout(() => {
            isManualScrolling.current = false;
        }, 800);
    };

    useEffect(() => {
        const mainEl = document.querySelector("main");
        const handleScroll = () => {
            if (isManualScrolling.current) return;
            const scrollPos = (mainEl ? mainEl.scrollTop : window.scrollY) + 120;
            for (let i = navItems.length - 1; i >= 0; i--) {
                const el = document.getElementById(`section-${navItems[i].id}`);
                if (el) {
                    const top = el.offsetTop;
                    if (scrollPos >= top) {
                        setActiveTab(navItems[i].id);
                        break;
                    }
                }
            }
        };

        if (mainEl) {
            mainEl.addEventListener("scroll", handleScroll, { passive: true });
        } else {
            window.addEventListener("scroll", handleScroll, { passive: true });
        }

        return () => {
            if (mainEl) {
                mainEl.removeEventListener("scroll", handleScroll);
            } else {
                window.removeEventListener("scroll", handleScroll);
            }
            if (manualScrollTimeoutRef.current) clearTimeout(manualScrollTimeoutRef.current);
        };
    }, []);

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

            <div style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>

                {/* ── Main Layout: Fixed Left Sidebar + Right Content Column ── */}
                <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>

                    {/* ═══ PROFILE NAVIGATION SIDEBAR (STICKY TOP: 0) ═══ */}
                    <div
                        className="profile-sidebar"
                        style={{
                            width: "270px",
                            minWidth: "270px",
                            flexShrink: 0,
                            position: "sticky",
                            top: "0px",
                            maxHeight: "calc(100vh - 64px - 40px)",
                            display: "flex",
                            flexDirection: "column",
                            zIndex: 10,
                        }}
                    >
                        <div style={{
                            background: "#fff",
                            borderRadius: 16,
                            border: "1px solid #e2e8f0",
                            padding: "16px 14px",
                            boxShadow: "0 4px 16px rgba(0,0,0,0.03)",
                            display: "flex",
                            flexDirection: "column",
                            boxSizing: "border-box",
                            maxHeight: "100%",
                            overflow: "hidden"
                        }}>
                            {/* Profile Page Title inside Sidebar */}
                            <div style={{ paddingBottom: "12px", borderBottom: "1px solid #f1f5f9", marginBottom: 12, flexShrink: 0 }}>
                                <h1 style={{ color: "#082B68", fontWeight: 800, fontSize: "1.45rem", margin: "0 0 2px" }}>My Profile</h1>
                                <p style={{ color: "#64748b", margin: 0, fontSize: "0.8rem" }}>Manage your professional profile & details</p>
                            </div>

                            <div style={{ padding: "0 4px 8px", color: "#94a3b8", fontWeight: 800, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
                                Profile Sections
                            </div>

                            {/* Nav items list with slim scrollbar */}
                            <div className="custom-slim-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", paddingRight: 4, flex: 1, minHeight: 0 }}>
                                {navItems.map((item) => {
                                    const active = activeTab === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => handleNavClick(item.id)}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
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
                                                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
                                            </div>
                                            <i className="fa-solid fa-chevron-right" style={{ fontSize: "0.68rem", color: active ? "#08AEB8" : "#cbd5e1", flexShrink: 0, marginLeft: "auto" }} />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Preview Public Profile */}
                            <div
                                onClick={() => setShowPublicPreview(true)}
                                style={{
                                    marginTop: 12,
                                    background: "rgba(8,174,184,0.04)",
                                    borderRadius: 12,
                                    border: "1.5px solid rgba(8,174,184,0.25)",
                                    padding: "10px 12px",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
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
                                        <div style={{ fontSize: "0.68rem", color: "#64748b", whiteSpace: "nowrap" }}>See patient view</div>
                                    </div>
                                </div>
                                <i className="fa-solid fa-chevron-right" style={{ fontSize: "0.68rem", color: "#08AEB8", flexShrink: 0, marginLeft: 4 }} />
                            </div>
                        </div>
                    </div>

                    {/* ═══ PROFILE SECTIONS CONTINUOUS CONTENT ═══ */}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "28px" }}>

                        {/* Save Banner if active */}
                        {saveMessage && (
                            <div style={{ padding: "12px 18px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, color: "#059669", fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 10 }}>
                                <i className="fa-solid fa-circle-check" style={{ fontSize: "1.1rem" }} />
                                {saveMessage}
                            </div>
                        )}

                        {/* ── SECTION 1: PROFILE INFORMATION ── */}
                        <div id="section-info" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-user" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>Profile Information</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>Personal and contact details</p>
                                        </div>
                                    </div>

                                    {editingSection !== "info" ? (
                                        <button
                                            type="button"
                                            onClick={() => setEditingSection("info")}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 8,
                                                padding: "8px 18px", background: "#08AEB8", color: "#fff",
                                                border: "none", borderRadius: 9, fontWeight: 700,
                                                fontSize: "0.84rem", cursor: "pointer",
                                                boxShadow: "0 4px 12px rgba(8,174,184,0.22)",
                                            }}
                                        >
                                            <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button
                                                type="button"
                                                onClick={handleCancelEdit}
                                                style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => handleSaveSection("Profile Information", e)}
                                                disabled={saving}
                                                style={{ padding: "7px 18px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}
                                            >
                                                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />} Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingSection !== "info" ? (
                                    /* VIEW MODE */
                                    <div className="dark-glass-card" style={{ display: "flex", gap: 26, padding: "20px", position: "relative", overflow: "hidden" }}>
                                        <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                                            <div style={{
                                                position: "absolute", top: -20, left: -20, right: -20, height: 86,
                                                background: "linear-gradient(135deg, rgba(8, 174, 184, 0.15) 0%, rgba(8, 43, 104, 0.08) 100%)",
                                                borderRadius: "16px 16px 50% 50%", zIndex: 0,
                                            }} />
                                            <div style={{ position: "relative", marginTop: 10, marginBottom: 12, zIndex: 1 }}>
                                                <img
                                                    src={avatarImage}
                                                    alt={formData.fullName}
                                                    style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: "4px solid #ffffff", boxShadow: "0 6px 16px rgba(0,0,0,0.08)" }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={uploadingPhoto}
                                                    title="Upload Photo"
                                                    style={{ position: "absolute", bottom: 2, right: 2, width: 30, height: 30, borderRadius: "50%", background: "#ffffff", border: "1.5px solid #e2e8f0", color: "#08AEB8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                                >
                                                    {uploadingPhoto ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-camera" />}
                                                </button>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 2 }}>
                                                <h3 style={{ fontWeight: 800, fontSize: "1.05rem", color: "#08265F", margin: 0 }}>{formData.fullName}</h3>
                                                <i className="fa-solid fa-circle-check" style={{ color: "#08AEB8", fontSize: "0.9rem" }} />
                                            </div>
                                            <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "#08AEB8", marginBottom: 6 }}>{formData.specialization}</div>
                                            <div style={{ fontSize: "0.76rem", color: "#64748b", lineHeight: 1.45, maxWidth: 200 }}>{formData.qualification}</div>
                                        </div>

                                        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingTop: 6 }}>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>Full Name</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{formData.fullName}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>Nationality</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{formData.nationality}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>Date of Birth</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{formatDobDisplay(formData.dob)}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>Joined on</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{formData.joinedDate}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>Gender</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{formData.gender}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>Email Address</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "#08AEB8", wordBreak: "break-all" }}>{formData.email}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>Phone Number</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{formData.mobileNumber}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600 }}>Preferred Language (App)</div>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{formData.preferredLanguage}</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* INLINE EDIT MODE */
                                    <form onSubmit={(e) => handleSaveSection("Profile Information", e)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, background: "#f8fafc", padding: "20px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Full Name</label>
                                            <input type="text" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Specialization</label>
                                            <input type="text" value={formData.specialization} onChange={e => setFormData({ ...formData, specialization: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Date of Birth</label>
                                            <input type="date" value={formData.dob} onChange={e => setFormData({ ...formData, dob: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Gender</label>
                                            <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box", background: "#fff" }}>
                                                <option value="Female">Female</option>
                                                <option value="Male">Male</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Email Address</label>
                                            <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Phone Number</label>
                                            <input type="text" value={formData.mobileNumber} onChange={e => setFormData({ ...formData, mobileNumber: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Nationality</label>
                                            <input type="text" value={formData.nationality} onChange={e => setFormData({ ...formData, nationality: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Preferred Language</label>
                                            <input type="text" value={formData.preferredLanguage} onChange={e => setFormData({ ...formData, preferredLanguage: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 2: CLINIC & LOCATION ── */}
                        <div id="section-clinic" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-hospital" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>Clinic & Location</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>Clinic name, address and fee setup</p>
                                        </div>
                                    </div>
                                    {editingSection !== "clinic" ? (
                                        <button type="button" onClick={() => setEditingSection("clinic")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "#08AEB8", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer", boxShadow: "0 4px 12px rgba(8,174,184,0.22)" }}>
                                            <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="button" onClick={handleCancelEdit} style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>Cancel</button>
                                            <button type="button" onClick={(e) => handleSaveSection("Clinic & Location", e)} disabled={saving} style={{ padding: "7px 18px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                                                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />} Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingSection !== "clinic" ? (
                                    <div className="dark-glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(8,174,184,0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                                                <i className="fa-solid fa-hospital" />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>{formData.clinicName || "Clinic Name Not Set"}</div>
                                                <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 2 }}>{formData.clinicAddress || "Clinic address not set"}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                                            <div>
                                                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Consultation Hours</span>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a", marginTop: 2 }}>Mon - Sat (09:00 AM - 08:00 PM)</div>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Consultation Charge</span>
                                                <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#08AEB8", marginTop: 2 }}>₹{formData.consultationFee || 0} per visit</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => handleSaveSection("Clinic & Location", e)} style={{ display: "flex", flexDirection: "column", gap: 14, background: "#f8fafc", padding: "20px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Clinic Name</label>
                                            <input type="text" value={formData.clinicName} onChange={e => setFormData({ ...formData, clinicName: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Clinic Address</label>
                                            <textarea rows={2} value={formData.clinicAddress} onChange={e => setFormData({ ...formData, clinicAddress: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box", fontFamily: "inherit" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Consultation Fee (₹)</label>
                                            <input type="number" value={formData.consultationFee} onChange={e => setFormData({ ...formData, consultationFee: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 3: PROFESSIONAL DETAILS ── */}
                        <div id="section-pro" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-briefcase" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>Professional Details</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>Registration number and medical domain</p>
                                        </div>
                                    </div>
                                    {editingSection !== "pro" ? (
                                        <button type="button" onClick={() => setEditingSection("pro")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "#08AEB8", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer", boxShadow: "0 4px 12px rgba(8,174,184,0.22)" }}>
                                            <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="button" onClick={handleCancelEdit} style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>Cancel</button>
                                            <button type="button" onClick={(e) => handleSaveSection("Professional Details", e)} disabled={saving} style={{ padding: "7px 18px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                                                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />} Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingSection !== "pro" ? (
                                    <div className="dark-glass-card" style={{ padding: "20px" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                                            <div>
                                                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Registration Number</span>
                                                <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#0f172a", marginTop: 2 }}>{formData.registrationNumber || "Not Specified"}</div>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Specialization</span>
                                                <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#08AEB8", marginTop: 2 }}>{formData.specialization || "General Medicine"}</div>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Medical Council</span>
                                                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a", marginTop: 2 }}>State Medical Council</div>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>License Verification</span>
                                                <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#10B981", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="fa-solid fa-circle-check" /> Verified & Active
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => handleSaveSection("Professional Details", e)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, background: "#f8fafc", padding: "20px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Registration Number</label>
                                            <input type="text" value={formData.registrationNumber} onChange={e => setFormData({ ...formData, registrationNumber: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Specialization</label>
                                            <input type="text" value={formData.specialization} onChange={e => setFormData({ ...formData, specialization: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 4: EDUCATION & CERTIFICATES ── */}
                        <div id="section-edu" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-graduation-cap" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>Education & Certificates</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>Medical qualifications and degrees</p>
                                        </div>
                                    </div>
                                    {editingSection !== "edu" ? (
                                        <button type="button" onClick={() => setEditingSection("edu")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "#08AEB8", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer", boxShadow: "0 4px 12px rgba(8,174,184,0.22)" }}>
                                            <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="button" onClick={handleCancelEdit} style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>Cancel</button>
                                            <button type="button" onClick={(e) => handleSaveSection("Education & Certificates", e)} disabled={saving} style={{ padding: "7px 18px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                                                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />} Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingSection !== "edu" ? (
                                    <div className="dark-glass-card" style={{ padding: "20px" }}>
                                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a", marginBottom: 8 }}>Qualifications & Medical Degrees</div>
                                        <div style={{ fontSize: "0.88rem", color: "#0f172a", background: "#f8fafc", padding: "14px", borderRadius: 10, border: "1px solid #e2e8f0", lineHeight: 1.5 }}>
                                            {formData.qualification || "No qualifications specified."}
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => handleSaveSection("Education & Certificates", e)} style={{ display: "flex", flexDirection: "column", gap: 14, background: "#f8fafc", padding: "20px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Qualifications & Degrees</label>
                                            <input type="text" value={formData.qualification} onChange={e => setFormData({ ...formData, qualification: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 5: EXPERIENCE ── */}
                        <div id="section-exp" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-award" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>Experience</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>Clinical experience duration and hospital practice</p>
                                        </div>
                                    </div>
                                    {editingSection !== "exp" ? (
                                        <button type="button" onClick={() => setEditingSection("exp")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "#08AEB8", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer", boxShadow: "0 4px 12px rgba(8,174,184,0.22)" }}>
                                            <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="button" onClick={handleCancelEdit} style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>Cancel</button>
                                            <button type="button" onClick={(e) => handleSaveSection("Experience", e)} disabled={saving} style={{ padding: "7px 18px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                                                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />} Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingSection !== "exp" ? (
                                    <div className="dark-glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 10 }}>
                                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>Clinical Practice Experience</div>
                                        <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#08AEB8" }}>{formData.experience || "0 years"} of medical clinical practice</div>
                                        <div style={{ fontSize: "0.84rem", color: "#64748b" }}>Currently practicing at <strong>{formData.clinicName || "Private Clinic"}</strong></div>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => handleSaveSection("Experience", e)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, background: "#f8fafc", padding: "20px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Experience (Years/Duration)</label>
                                            <input type="text" value={formData.experience} onChange={e => setFormData({ ...formData, experience: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Clinic / Hospital Name</label>
                                            <input type="text" value={formData.clinicName} onChange={e => setFormData({ ...formData, clinicName: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 6: LANGUAGES ── */}
                        <div id="section-lang" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-language" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>Languages</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>Languages spoken during consultation</p>
                                        </div>
                                    </div>
                                    {editingSection !== "lang" ? (
                                        <button type="button" onClick={() => setEditingSection("lang")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "#08AEB8", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer", boxShadow: "0 4px 12px rgba(8,174,184,0.22)" }}>
                                            <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="button" onClick={handleCancelEdit} style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>Cancel</button>
                                            <button type="button" onClick={(e) => handleSaveSection("Languages", e)} disabled={saving} style={{ padding: "7px 18px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                                                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />} Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingSection !== "lang" ? (
                                    <div className="dark-glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
                                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>Languages Spoken</div>
                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                            {(formData.languages || "English").split(",").map((l, i) => (
                                                <span key={i} style={{ background: "#f0fdfa", color: "#08AEB8", border: "1px solid #ccfbf1", padding: "6px 16px", borderRadius: 20, fontSize: "0.85rem", fontWeight: 700 }}>
                                                    <i className="fa-solid fa-comments" style={{ marginRight: 6, fontSize: "0.75rem" }} />
                                                    {l.trim()}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => handleSaveSection("Languages", e)} style={{ display: "flex", flexDirection: "column", gap: 14, background: "#f8fafc", padding: "20px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Languages Spoken (comma-separated)</label>
                                            <input type="text" value={formData.languages} onChange={e => setFormData({ ...formData, languages: e.target.value })} placeholder="English, Hindi, Telugu" style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 7: CONSULTATION FEES ── */}
                        <div id="section-fees" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-credit-card" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>Consultation Fees</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>In-clinic consultation charge settings</p>
                                        </div>
                                    </div>
                                    {editingSection !== "fees" ? (
                                        <button type="button" onClick={() => setEditingSection("fees")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "#08AEB8", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer", boxShadow: "0 4px 12px rgba(8,174,184,0.22)" }}>
                                            <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="button" onClick={handleCancelEdit} style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>Cancel</button>
                                            <button type="button" onClick={(e) => handleSaveSection("Consultation Fees", e)} disabled={saving} style={{ padding: "7px 18px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                                                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />} Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingSection !== "fees" ? (
                                    <div className="dark-glass-card" style={{ padding: "20px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "14px 18px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#0f172a" }}>In-Clinic Consultation Fee</div>
                                                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: 2 }}>Physical patient visit at clinic</div>
                                            </div>
                                            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#08AEB8" }}>₹{formData.consultationFee || 0}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => handleSaveSection("Consultation Fees", e)} style={{ display: "flex", flexDirection: "column", gap: 14, background: "#f8fafc", padding: "20px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Consultation Fee (₹)</label>
                                            <input type="number" value={formData.consultationFee} onChange={e => setFormData({ ...formData, consultationFee: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 8: ABOUT ME ── */}
                        <div id="section-about" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-circle-question" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>About Me</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>Doctor biography and overview</p>
                                        </div>
                                    </div>
                                    {editingSection !== "about" ? (
                                        <button type="button" onClick={() => setEditingSection("about")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "#08AEB8", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer", boxShadow: "0 4px 12px rgba(8,174,184,0.22)" }}>
                                            <i className="fa-solid fa-pencil" style={{ fontSize: "0.78rem" }} /> Edit
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="button" onClick={handleCancelEdit} style={{ padding: "7px 14px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>Cancel</button>
                                            <button type="button" onClick={(e) => handleSaveSection("About Me", e)} disabled={saving} style={{ padding: "7px 18px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6 }}>
                                                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />} Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingSection !== "about" ? (
                                    <div className="dark-glass-card" style={{ padding: "20px" }}>
                                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a", marginBottom: 8 }}>Doctor Bio & Summary</div>
                                        <p style={{ fontSize: "0.86rem", color: "#0f172a", margin: 0, lineHeight: 1.6, background: "#f8fafc", padding: "16px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                            {formData.description || "No bio added yet."}
                                        </p>
                                    </div>
                                ) : (
                                    <form onSubmit={(e) => handleSaveSection("About Me", e)} style={{ display: "flex", flexDirection: "column", gap: 14, background: "#f8fafc", padding: "20px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>Doctor Bio & Summary</label>
                                            <textarea rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box", fontFamily: "inherit" }} />
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 9: ACCOUNT SETTINGS ── */}
                        <div id="section-settings" style={{ scrollMarginTop: "90px" }}>
                            <div className="theme-section-dark" style={{ borderRadius: 18, padding: "24px 28px", border: "1px solid #e2e8f0", background: "#fff" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(8, 174, 184, 0.12)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>
                                            <i className="fa-solid fa-gear" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontWeight: 800, fontSize: "1.18rem", color: "#082B68", margin: 0 }}>Account Settings</h2>
                                            <p style={{ color: "#64748b", margin: 0, fontSize: "0.82rem" }}>Security and password settings</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="dark-glass-card" style={{ padding: "20px" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a", marginBottom: 10 }}>Account Security & Preferences</div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "14px 18px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#0f172a" }}>Password</div>
                                            <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: 2 }}>Secure password authentication</div>
                                        </div>
                                        <button onClick={() => setShowChangePasswordModal(true)} style={{ padding: "8px 16px", background: "#f0fdfa", border: "1px solid #ccfbf1", borderRadius: 8, fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", color: "#08AEB8" }}>Change Password</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                </div>

            </div>

            {/* ═════════════════════════════════════════════════════════
               CHANGE PASSWORD MODAL
            ═════════════════════════════════════════════════════════ */}
            {showChangePasswordModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 2500, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20
                }}>
                    <div style={{
                        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 460,
                        boxShadow: "0 20px 40px rgba(0,0,0,0.18)", overflow: "hidden"
                    }}>
                        <div style={{ padding: "16px 20px", background: "linear-gradient(135deg,#082B68,#08AEB8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <i className="fa-solid fa-key" />
                                <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>Change Password</span>
                            </div>
                            <button onClick={() => setShowChangePasswordModal(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: "50%", cursor: "pointer" }}>
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>

                        <form onSubmit={handleChangePasswordSubmit} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
                            {pwdError && (
                                <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: "0.82rem", fontWeight: 600 }}>
                                    {pwdError}
                                </div>
                            )}

                            {pwdSuccess && (
                                <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#16a34a", fontSize: "0.82rem", fontWeight: 600 }}>
                                    {pwdSuccess}
                                </div>
                            )}

                            <div>
                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Current Password (optional)</label>
                                <input
                                    type="password"
                                    placeholder="Enter current password"
                                    value={pwdData.currentPassword}
                                    onChange={(e) => setPwdData({ ...pwdData, currentPassword: e.target.value })}
                                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                />
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>New Password</label>
                                <input
                                    type="password"
                                    required
                                    placeholder="At least 6 characters"
                                    value={pwdData.newPassword}
                                    onChange={(e) => setPwdData({ ...pwdData, newPassword: e.target.value })}
                                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                />
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 5 }}>Confirm New Password</label>
                                <input
                                    type="password"
                                    required
                                    placeholder="Re-enter new password"
                                    value={pwdData.confirmPassword}
                                    onChange={(e) => setPwdData({ ...pwdData, confirmPassword: e.target.value })}
                                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: "0.86rem", outline: "none", boxSizing: "border-box" }}
                                />
                            </div>

                            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                                <button
                                    type="button"
                                    onClick={() => setShowChangePasswordModal(false)}
                                    style={{ padding: "8px 16px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.84rem" }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={pwdLoading}
                                    style={{ padding: "8px 20px", background: "linear-gradient(135deg,#082B68,#08AEB8)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: pwdLoading ? "not-allowed" : "pointer", fontSize: "0.84rem" }}
                                >
                                    {pwdLoading ? "Updating..." : "Update Password"}
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
