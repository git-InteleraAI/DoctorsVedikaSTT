import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import vedikaLogo from "/images/logo.png";
import { getApiV1Url } from "../utils/apiConfig";
import { QRCodeCanvas } from "qrcode.react";

const API_BASE = getApiV1Url();

export default function HospitalAdmin() {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout, doctor: currentUser } = useAuth();

    // -------------------------------------------------------------------------
    // Synchronize active tab from URL location path
    // -------------------------------------------------------------------------
    const activeTab = useMemo(() => {
        const path = location.pathname;
        if (path.includes("/doctors")) return "doctors";
        if (path.includes("/staff")) return "staff";
        if (path.includes("/hospital")) return "hospital";
        if (path.includes("/settings")) return "settings";
        if (path.includes("/audit")) return "audit";
        return "dashboard";
    }, [location.pathname]);

    const handleTabChange = (tab) => {
        navigate(`/hospital-admin/${tab}`);
    };

    // -------------------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------------------
    const [stats, setStats] = useState({
        totalDoctors: 0,
        activeDoctors: 0,
        totalStaff: 0,
        activeStaff: 0,
        hospitalName: "Doctors Vedika Main Hospital",
        hospitalCode: "DV-MAIN",
        hospitalStatus: "active"
    });

    const [recentDoctors, setRecentDoctors] = useState([]);
    const [recentStaff, setRecentStaff] = useState([]);

    const [doctorsList, setDoctorsList] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [hospitalInfo, setHospitalInfo] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);

    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ text: "", type: "" });

    // Search & Filtering State
    const [doctorSearch, setDoctorSearch] = useState("");
    const [doctorStatusFilter, setDoctorStatusFilter] = useState("all");

    const [staffSearch, setStaffSearch] = useState("");
    const [staffRoleFilter, setStaffRoleFilter] = useState("all");
    const [staffStatusFilter, setStaffStatusFilter] = useState("all");

    // Modal Control Flags
    const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
    const [showAddStaffModal, setShowAddStaffModal] = useState(false);

    const [showEditDoctorModal, setShowEditDoctorModal] = useState(false);
    const [editingDoctor, setEditingDoctor] = useState(null);

    const [showEditStaffModal, setShowEditStaffModal] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);

    const [showEditHospitalModal, setShowEditHospitalModal] = useState(false);

    const [statusConfirmModal, setStatusConfirmModal] = useState({
        show: false,
        memberType: "doctor", // "doctor" | "staff"
        member: null,
        targetStatus: "inactive"
    });

    // View Member Details Modal
    const [viewMemberModal, setViewMemberModal] = useState({
        show: false,
        memberType: "doctor",
        member: null
    });

    // One-Time Credential Display Modal State
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [createdCredential, setCreatedCredential] = useState(null);
    const [showTempPassword, setShowTempPassword] = useState(true);

    // Form Inputs - Doctor Creation
    const [docFullName, setDocFullName] = useState("");
    const [docEmail, setDocEmail] = useState("");
    const [docPhone, setDocPhone] = useState("");
    const [docSpecialization, setDocSpecialization] = useState("General Physician & AI Consultant");
    const [docQualification, setDocQualification] = useState("MBBS");
    const [docRegNumber, setDocRegNumber] = useState("");
    const [docGender, setDocGender] = useState("Male");

    // Form Inputs - Staff Creation
    const [staffFullName, setStaffFullName] = useState("");
    const [staffEmail, setStaffEmail] = useState("");
    const [staffPhone, setStaffPhone] = useState("");
    const [staffRole, setStaffRole] = useState("Reception / Front Desk");

    // Form Inputs - Hospital Edit
    const [hospName, setHospName] = useState("");
    const [hospPhone, setHospPhone] = useState("");
    const [hospEmail, setHospEmail] = useState("");
    const [hospAddress, setHospAddress] = useState("");
    const [hospCity, setHospCity] = useState("");
    const [hospState, setHospState] = useState("");

    // Form Inputs - Password Change
    const [pwdCurrent, setPwdCurrent] = useState("");
    const [pwdNew, setPwdNew] = useState("");
    const [pwdConfirm, setPwdConfirm] = useState("");
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdMsg, setPwdMsg] = useState({ text: "", type: "" });

    // -------------------------------------------------------------------------
    // Authorization Headers Helper
    // -------------------------------------------------------------------------
    const getAuthHeaders = () => {
        const token =
            localStorage.getItem("doctors_vedika_token") ||
            localStorage.getItem("token") ||
            localStorage.getItem("sb-access-token");
        const storedHospitalId =
            currentUser?.hospitalId ||
            currentUser?.hospital_id ||
            localStorage.getItem("doctors_vedika_hospital_id") ||
            localStorage.getItem("active_hospital_id");

        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Portal-Context": "hospital_admin"
        };

        if (storedHospitalId && storedHospitalId !== "null" && storedHospitalId !== "undefined" && storedHospitalId !== "00000000-0000-0000-0000-000000000001") {
            headers["X-Hospital-Id"] = storedHospitalId;
        }

        return headers;
    };

    // -------------------------------------------------------------------------
    // Data Fetching & Modal Reset on Tab Change
    // -------------------------------------------------------------------------
    useEffect(() => {
        setShowAddDoctorModal(false);
        setShowAddStaffModal(false);
        setShowEditDoctorModal(false);
        setShowEditStaffModal(false);
        setShowEditHospitalModal(false);
        setStatusConfirmModal({ show: false, memberType: "doctor", member: null, targetStatus: "inactive" });
        setViewMemberModal({ show: false, memberType: "doctor", member: null });
        setShowCredentialModal(false);
        fetchAllData();
    }, [activeTab]);

    const fetchAllData = async () => {
        setIsLoading(true);
        try {
            await Promise.all([
                fetchStats(),
                fetchDoctors(),
                fetchStaff(),
                fetchHospitalProfile(),
                fetchAuditLogs()
            ]);
        } catch (err) {
            console.warn("Fetch admin data warning:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_BASE}/hospital-admin/dashboard-stats`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success && data.stats) {
                setStats(data.stats);
                if (data.recentDoctors) setRecentDoctors(data.recentDoctors);
                if (data.recentStaff) setRecentStaff(data.recentStaff);
            }
        } catch (err) {
            console.warn("Error fetching dashboard stats:", err);
        }
    };

    const fetchDoctors = async () => {
        try {
            const res = await fetch(`${API_BASE}/hospital-admin/doctors`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                setDoctorsList(data.doctors || []);
            }
        } catch (err) {
            console.warn("Error fetching doctors:", err);
        }
    };

    const fetchStaff = async () => {
        try {
            const res = await fetch(`${API_BASE}/hospital-admin/staff`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                setStaffList(data.staff || []);
            }
        } catch (err) {
            console.warn("Error fetching staff:", err);
        }
    };

    const fetchHospitalProfile = async () => {
        try {
            const res = await fetch(`${API_BASE}/hospital-admin/hospital`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success && data.hospital) {
                setHospitalInfo(data.hospital);
                setHospName(data.hospital.name || "");
                setHospPhone(data.hospital.phone || "");
                setHospEmail(data.hospital.email || "");
                setHospAddress(data.hospital.address || "");
                setHospCity(data.hospital.city || "");
                setHospState(data.hospital.state || "");
            }
        } catch (err) {
            console.warn("Error fetching hospital profile:", err);
        }
    };

    const fetchAuditLogs = async () => {
        try {
            const res = await fetch(`${API_BASE}/hospital-admin/audit-logs`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                setAuditLogs(data.auditLogs || []);
            }
        } catch (err) {
            console.warn("Error fetching audit logs:", err);
        }
    };

    // Helper: Frontend Gmail validation
    const isValidGmail = (emailStr) => {
        if (!emailStr || typeof emailStr !== "string") return false;
        const normalized = emailStr.trim().toLowerCase();
        return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(normalized);
    };

    // -------------------------------------------------------------------------
    // Submit Handler: Add Doctor
    // -------------------------------------------------------------------------
    const handleAddDoctorSubmit = async (e) => {
        e.preventDefault();
        setMessage({ text: "", type: "" });

        if (!isValidGmail(docEmail)) {
            setMessage({
                text: "Only Gmail addresses (@gmail.com) are allowed for Doctor and Staff accounts.",
                type: "error"
            });
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch(`${API_BASE}/hospital-admin/doctors`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    fullName: docFullName,
                    email: docEmail.trim().toLowerCase(),
                    phone: docPhone,
                    specialization: docSpecialization,
                    qualification: docQualification,
                    registrationNumber: docRegNumber,
                    gender: docGender
                })
            });

            const data = await res.json();

            if (data.success && data.credentials) {
                setDocFullName("");
                setDocEmail("");
                setDocPhone("");
                setDocSpecialization("General Physician & AI Consultant");
                setDocQualification("MBBS");
                setDocRegNumber("");
                setDocGender("Male");
                setShowAddDoctorModal(false);

                setCreatedCredential(data.credentials);
                setShowCredentialModal(true);

                fetchDoctors();
                fetchStats();
            } else {
                setMessage({ text: data.message || "Failed to create doctor account.", type: "error" });
            }
        } catch (err) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    // -------------------------------------------------------------------------
    // Submit Handler: Add Staff
    // -------------------------------------------------------------------------
    const handleAddStaffSubmit = async (e) => {
        e.preventDefault();
        setMessage({ text: "", type: "" });

        if (!isValidGmail(staffEmail)) {
            setMessage({
                text: "Only Gmail addresses (@gmail.com) are allowed for Doctor and Staff accounts.",
                type: "error"
            });
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch(`${API_BASE}/hospital-admin/staff`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    fullName: staffFullName,
                    email: staffEmail.trim().toLowerCase(),
                    phone: staffPhone,
                    staffRole: staffRole
                })
            });

            const data = await res.json();

            if (data.success && data.credentials) {
                setStaffFullName("");
                setStaffEmail("");
                setStaffPhone("");
                setStaffRole("Reception / Front Desk");
                setShowAddStaffModal(false);

                setCreatedCredential(data.credentials);
                setShowCredentialModal(true);

                fetchStaff();
                fetchStats();
            } else {
                setMessage({ text: data.message || "Failed to create staff account.", type: "error" });
            }
        } catch (err) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    // -------------------------------------------------------------------------
    // Submit Handler: Edit Doctor
    // -------------------------------------------------------------------------
    const handleEditDoctorSubmit = async (e) => {
        e.preventDefault();
        if (!editingDoctor) return;
        setIsLoading(true);

        try {
            const res = await fetch(`${API_BASE}/hospital-admin/doctors/${editingDoctor.doctorId || editingDoctor.memberId}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    fullName: docFullName,
                    phone: docPhone,
                    specialization: docSpecialization,
                    qualification: docQualification,
                    registrationNumber: docRegNumber
                })
            });

            const data = await res.json();
            if (data.success) {
                setShowEditDoctorModal(false);
                setEditingDoctor(null);
                fetchDoctors();
                fetchStats();
            } else {
                setMessage({ text: data.message || "Failed to update doctor profile.", type: "error" });
            }
        } catch (err) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    // -------------------------------------------------------------------------
    // Submit Handler: Edit Staff
    // -------------------------------------------------------------------------
    const handleEditStaffSubmit = async (e) => {
        e.preventDefault();
        if (!editingStaff) return;
        setIsLoading(true);

        try {
            const res = await fetch(`${API_BASE}/hospital-admin/staff/${editingStaff.memberId}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    fullName: staffFullName,
                    phone: staffPhone,
                    staffRole: staffRole
                })
            });

            const data = await res.json();
            if (data.success) {
                setShowEditStaffModal(false);
                setEditingStaff(null);
                fetchStaff();
                fetchStats();
            } else {
                setMessage({ text: data.message || "Failed to update staff profile.", type: "error" });
            }
        } catch (err) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    // -------------------------------------------------------------------------
    // Submit Handler: Edit Hospital Profile
    // -------------------------------------------------------------------------
    const handleEditHospitalSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch(`${API_BASE}/hospital-admin/hospital`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    name: hospName,
                    phone: hospPhone,
                    email: hospEmail,
                    address: hospAddress,
                    city: hospCity,
                    state: hospState
                })
            });

            const data = await res.json();
            if (data.success) {
                setShowEditHospitalModal(false);
                fetchHospitalProfile();
                fetchStats();
            } else {
                setMessage({ text: data.message || "Failed to update hospital profile.", type: "error" });
            }
        } catch (err) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    // -------------------------------------------------------------------------
    // Toggle Status Execution
    // -------------------------------------------------------------------------
    const executeStatusToggle = async () => {
        const { memberType, member, targetStatus } = statusConfirmModal;
        if (!member) return;
        setIsLoading(true);

        try {
            const endpoint = memberType === "doctor"
                ? `${API_BASE}/hospital-admin/doctors/${member.doctorId || member.memberId}/status`
                : `${API_BASE}/hospital-admin/staff/${member.memberId}/status`;

            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify({ status: targetStatus })
            });

            const data = await res.json();
            if (data.success) {
                setStatusConfirmModal({ show: false, memberType: "doctor", member: null, targetStatus: "inactive" });
                if (memberType === "doctor") fetchDoctors();
                else fetchStaff();
                fetchStats();
            } else {
                setMessage({ text: data.message || "Status update failed.", type: "error" });
            }
        } catch (err) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    // -------------------------------------------------------------------------
    // Helper: Copy to Clipboard
    // -------------------------------------------------------------------------
    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text);
        setMessage({ text: `Copied ${label} to clipboard!`, type: "success" });
        setTimeout(() => setMessage({ text: "", type: "" }), 3000);
    };

    // -------------------------------------------------------------------------
    // Filtered Lists
    // -------------------------------------------------------------------------
    const filteredDoctors = doctorsList.filter(d => {
        const matchesSearch = doctorSearch === "" ||
            (d.fullName && d.fullName.toLowerCase().includes(doctorSearch.toLowerCase())) ||
            (d.email && d.email.toLowerCase().includes(doctorSearch.toLowerCase())) ||
            (d.specialization && d.specialization.toLowerCase().includes(doctorSearch.toLowerCase()));
        const matchesStatus = doctorStatusFilter === "all" || d.status === doctorStatusFilter;
        return matchesSearch && matchesStatus;
    });

    const filteredStaff = staffList.filter(s => {
        const matchesSearch = staffSearch === "" ||
            (s.fullName && s.fullName.toLowerCase().includes(staffSearch.toLowerCase())) ||
            (s.email && s.email.toLowerCase().includes(staffSearch.toLowerCase())) ||
            (s.staffRole && s.staffRole.toLowerCase().includes(staffSearch.toLowerCase()));
        const matchesRole = staffRoleFilter === "all" || s.staffRole === staffRoleFilter;
        const matchesStatus = staffStatusFilter === "all" || s.status === staffStatusFilter;
        return matchesSearch && matchesRole && matchesStatus;
    });

    const adminName = currentUser?.fullName || currentUser?.doctor_name || "Hospital Administrator";
    const hospitalNameDisplay = currentUser?.hospitalName || currentUser?.hospital_name || stats.hospitalName || hospitalInfo?.name || "Doctors Vedika Hospital";

    return (
        <DashboardLayout activePage="admin" searchPlaceholder="Search hospital doctors, staff members, profile...">
            <div style={{ padding: "24px 32px", width: "100%", maxWidth: "none", boxSizing: "border-box" }}>

                {/* =========================================================================
                    NOTIFICATION MESSAGES
                ========================================================================= */}
                {message.text && (
                    <div style={{
                        marginBottom: "24px",
                        padding: "12px 20px",
                        borderRadius: "10px",
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        backgroundColor: message.type === "error" ? "#fef2f2" : "#f0fdf4",
                        color: message.type === "error" ? "#991b1b" : "#166534",
                        border: `1px solid ${message.type === "error" ? "#fecaca" : "#bbf7d0"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <i className={`fa-solid ${message.type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}`}></i>
                            {message.text}
                        </div>
                        <button onClick={() => setMessage({ text: "", type: "" })} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}

                {/* -------------------------------------------------------------------
                    TAB 1: DASHBOARD
                ------------------------------------------------------------------- */}
                {activeTab === "dashboard" && (
                    <div>
                        {/* Executive Welcome Header */}
                        <div style={{
                            padding: "28px 32px",
                            marginBottom: "28px",
                            borderRadius: "16px",
                            background: "linear-gradient(135deg, #0b1c2d 0%, #08265F 55%, #08AEB8 100%)",
                            color: "#ffffff",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            boxShadow: "0 10px 25px rgba(11, 28, 45, 0.12)",
                            flexWrap: "wrap",
                            gap: "20px"
                        }}>
                            <div>
                                <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#5eead4", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
                                    HOSPITAL ADMINISTRATOR
                                </div>
                                <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                                    Good Morning, {adminName}
                                </h1>
                                <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "#cbd5e1" }}>
                                    {hospitalNameDisplay}
                                </p>
                            </div>

                            <div style={{ display: "flex", gap: "12px" }}>
                                <button
                                    onClick={() => setShowAddDoctorModal(true)}
                                    style={{
                                        backgroundColor: "#08AEB8",
                                        color: "#ffffff",
                                        border: "none",
                                        padding: "10px 18px",
                                        borderRadius: "10px",
                                        fontWeight: 700,
                                        fontSize: "0.88rem",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        boxShadow: "0 4px 12px rgba(8, 174, 184, 0.3)"
                                    }}
                                >
                                    <i className="fa-solid fa-user-doctor-hair"></i> + Add Doctor
                                </button>
                                <button
                                    onClick={() => setShowAddStaffModal(true)}
                                    style={{
                                        backgroundColor: "rgba(255,255,255,0.15)",
                                        color: "#ffffff",
                                        border: "1px solid rgba(255,255,255,0.3)",
                                        padding: "10px 18px",
                                        borderRadius: "10px",
                                        fontWeight: 700,
                                        fontSize: "0.88rem",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px"
                                    }}
                                >
                                    <i className="fa-solid fa-user-plus"></i> + Add Staff
                                </button>
                            </div>
                        </div>

                        {/* Summary Cards Grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "32px" }}>

                            {/* Total Doctors */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b" }}>Total Doctors</span>
                                    <div style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-user-md"></i>
                                    </div>
                                </div>
                                <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "#0b1c2d", lineHeight: "1" }}>{stats.totalDoctors}</div>
                                <div style={{ fontSize: "0.78rem", color: "#059669", fontWeight: 600, marginTop: "8px" }}>
                                    <i className="fa-solid fa-circle-check"></i> Registered Medical Practitioners
                                </div>
                            </div>

                            {/* Active Doctors */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b" }}>Active Doctors</span>
                                    <div style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-stethoscope"></i>
                                    </div>
                                </div>
                                <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "#0b1c2d", lineHeight: "1" }}>{stats.activeDoctors}</div>
                                <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 600, marginTop: "8px" }}>
                                    Active consultation authorizations
                                </div>
                            </div>

                            {/* Total Staff */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b" }}>Total Staff</span>
                                    <div style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: "#f3e8ff", color: "#9333ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-users-gear"></i>
                                    </div>
                                </div>
                                <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "#0b1c2d", lineHeight: "1" }}>{stats.totalStaff}</div>
                                <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 600, marginTop: "8px" }}>
                                    Reception, Nursing & Support Staff
                                </div>
                            </div>

                            {/* Active Staff */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b" }}>Active Staff</span>
                                    <div style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: "#ccfbf1", color: "#0d9488", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-user-check"></i>
                                    </div>
                                </div>
                                <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "#0b1c2d", lineHeight: "1" }}>{stats.activeStaff}</div>
                                <div style={{ fontSize: "0.78rem", color: "#0d9488", fontWeight: 600, marginTop: "8px" }}>
                                    Active staff portal permissions
                                </div>
                            </div>

                        </div>

                        {/* Two Column Layout: Doctors Overview & Staff Overview */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>

                            {/* DOCTORS OVERVIEW */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Doctors Overview</h3>
                                        <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>Medical practitioners registered in hospital</p>
                                    </div>
                                    <button
                                        onClick={() => handleTabChange("doctors")}
                                        style={{ backgroundColor: "#f1f5f9", color: "#08AEB8", border: "none", padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}
                                    >
                                        View All Doctors <i className="fa-solid fa-arrow-right" style={{ marginLeft: "4px" }}></i>
                                    </button>
                                </div>

                                {recentDoctors.length === 0 ? (
                                    <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "0.88rem" }}>
                                        No doctors added yet. Click <strong>+ Add Doctor</strong> to create an account.
                                    </div>
                                ) : (
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                                        <thead>
                                            <tr style={{ borderBottom: "1px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.05em" }}>
                                                <th style={{ textAlign: "left", padding: "10px 8px" }}>Doctor</th>
                                                <th style={{ textAlign: "left", padding: "10px 8px" }}>Specialization</th>
                                                <th style={{ textAlign: "center", padding: "10px 8px" }}>Status</th>
                                                <th style={{ textAlign: "right", padding: "10px 8px" }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentDoctors.map(doc => (
                                                <tr key={doc.memberId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                    <td style={{ padding: "12px 8px", fontWeight: 700, color: "#0b1c2d" }}>
                                                        {doc.fullName}
                                                    </td>
                                                    <td style={{ padding: "12px 8px", color: "#475569" }}>{doc.specialization}</td>
                                                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                                                        <span style={{
                                                            display: "inline-block",
                                                            padding: "3px 8px",
                                                            borderRadius: "12px",
                                                            fontSize: "0.72rem",
                                                            fontWeight: 700,
                                                            backgroundColor: doc.status === "active" ? "#dcfce7" : "#f1f5f9",
                                                            color: doc.status === "active" ? "#15803d" : "#64748b"
                                                        }}>
                                                            {doc.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                                                        <button
                                                            onClick={() => setViewMemberModal({ show: true, memberType: "doctor", member: doc })}
                                                            style={{ background: "none", border: "none", color: "#08AEB8", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem" }}
                                                        >
                                                            View
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* STAFF OVERVIEW */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Staff Overview</h3>
                                        <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>Reception, nursing, and clinical staff</p>
                                    </div>
                                    <button
                                        onClick={() => handleTabChange("staff")}
                                        style={{ backgroundColor: "#f1f5f9", color: "#08AEB8", border: "none", padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}
                                    >
                                        View All Staff <i className="fa-solid fa-arrow-right" style={{ marginLeft: "4px" }}></i>
                                    </button>
                                </div>

                                {recentStaff.length === 0 ? (
                                    <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "0.88rem" }}>
                                        No staff accounts created yet. Click <strong>+ Add Staff</strong> to create one.
                                    </div>
                                ) : (
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                                        <thead>
                                            <tr style={{ borderBottom: "1px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#64748b", letterSpacing: "0.05em" }}>
                                                <th style={{ textAlign: "left", padding: "10px 8px" }}>Name</th>
                                                <th style={{ textAlign: "left", padding: "10px 8px" }}>Role</th>
                                                <th style={{ textAlign: "center", padding: "10px 8px" }}>Status</th>
                                                <th style={{ textAlign: "right", padding: "10px 8px" }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentStaff.map(stf => (
                                                <tr key={stf.memberId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                    <td style={{ padding: "12px 8px", fontWeight: 700, color: "#0b1c2d" }}>
                                                        {stf.fullName}
                                                    </td>
                                                    <td style={{ padding: "12px 8px", color: "#475569" }}>{stf.staffRole}</td>
                                                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                                                        <span style={{
                                                            display: "inline-block",
                                                            padding: "3px 8px",
                                                            borderRadius: "12px",
                                                            fontSize: "0.72rem",
                                                            fontWeight: 700,
                                                            backgroundColor: stf.status === "active" ? "#dcfce7" : "#f1f5f9",
                                                            color: stf.status === "active" ? "#15803d" : "#64748b"
                                                        }}>
                                                            {stf.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                                                        <button
                                                            onClick={() => setViewMemberModal({ show: true, memberType: "staff", member: stf })}
                                                            style={{ background: "none", border: "none", color: "#08AEB8", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem" }}
                                                        >
                                                            View
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                        </div>
                    </div>
                )}

                {/* -------------------------------------------------------------------
                    TAB 2: DOCTOR MANAGEMENT
                ------------------------------------------------------------------- */}
                {activeTab === "doctors" && (
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>

                        {/* Doctor Header & Actions */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#0b1c2d" }}>Doctors</h2>
                                <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>Manage hospital doctor accounts, medical specializations, and authorization status.</p>
                            </div>

                            <button
                                onClick={() => setShowAddDoctorModal(true)}
                                style={{
                                    backgroundColor: "#08AEB8",
                                    color: "#ffffff",
                                    border: "none",
                                    padding: "10px 20px",
                                    borderRadius: "10px",
                                    fontWeight: 700,
                                    fontSize: "0.88rem",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    boxShadow: "0 4px 12px rgba(8, 174, 184, 0.25)"
                                }}
                            >
                                <i className="fa-solid fa-plus"></i> Add Doctor
                            </button>
                        </div>

                        {/* Search & Status Filters */}
                        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: "280px", position: "relative" }}>
                                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "14px", top: "13px", color: "#94a3b8", fontSize: "0.9rem" }}></i>
                                <input
                                    type="text"
                                    placeholder="Search Doctor by name, email, specialization..."
                                    value={doctorSearch}
                                    onChange={(e) => setDoctorSearch(e.target.value)}
                                    style={{
                                        width: "100%",
                                        padding: "10px 14px 10px 40px",
                                        borderRadius: "10px",
                                        border: "1px solid #cbd5e1",
                                        fontSize: "0.88rem",
                                        outline: "none",
                                        boxSizing: "border-box"
                                    }}
                                />
                            </div>

                            <select
                                value={doctorStatusFilter}
                                onChange={(e) => setDoctorStatusFilter(e.target.value)}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: "10px",
                                    border: "1px solid #cbd5e1",
                                    fontSize: "0.88rem",
                                    backgroundColor: "#ffffff",
                                    color: "#334155",
                                    fontWeight: 600
                                }}
                            >
                                <option value="all">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>

                        {/* Doctor Table */}
                        {filteredDoctors.length === 0 ? (
                            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
                                <i className="fa-solid fa-user-md-slash" style={{ fontSize: "2.5rem", marginBottom: "12px", display: "block" }}></i>
                                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#475569" }}>No Doctors Found</div>
                                <p style={{ fontSize: "0.85rem", margin: "4px 0 16px" }}>Try adjusting your search criteria or add a new doctor account.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                                    <thead>
                                        <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.75rem", color: "#475569", letterSpacing: "0.05em" }}>
                                            <th style={{ textAlign: "left", padding: "12px 16px" }}>Name</th>
                                            <th style={{ textAlign: "left", padding: "12px 16px" }}>Email</th>
                                            <th style={{ textAlign: "left", padding: "12px 16px" }}>Phone</th>
                                            <th style={{ textAlign: "left", padding: "12px 16px" }}>Specialization</th>
                                            <th style={{ textAlign: "center", padding: "12px 16px" }}>Status</th>
                                            <th style={{ textAlign: "right", padding: "12px 16px" }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDoctors.map(doc => (
                                            <tr key={doc.memberId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                <td style={{ padding: "16px", fontWeight: 700, color: "#0b1c2d" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>
                                                            {doc.fullName.replace("Dr.", "").trim().charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div>{doc.fullName}</div>
                                                            {doc.registrationNumber && <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>Reg: {doc.registrationNumber}</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: "16px", color: "#334155" }}>{doc.email}</td>
                                                <td style={{ padding: "16px", color: "#334155" }}>{doc.phone || "N/A"}</td>
                                                <td style={{ padding: "16px", color: "#334155" }}>
                                                    <span style={{ backgroundColor: "#f1f5f9", padding: "4px 10px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>
                                                        {doc.specialization}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "16px", textAlign: "center" }}>
                                                    <span style={{
                                                        display: "inline-block",
                                                        padding: "4px 12px",
                                                        borderRadius: "20px",
                                                        fontSize: "0.75rem",
                                                        fontWeight: 700,
                                                        backgroundColor: doc.status === "active" ? "#dcfce7" : "#f1f5f9",
                                                        color: doc.status === "active" ? "#15803d" : "#64748b"
                                                    }}>
                                                        {doc.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "16px", textAlign: "right" }}>
                                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                                                        <button
                                                            onClick={() => setViewMemberModal({ show: true, memberType: "doctor", member: doc })}
                                                            style={{ backgroundColor: "#f1f5f9", color: "#0b1c2d", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                                                        >
                                                            View
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingDoctor(doc);
                                                                setDocFullName(doc.fullName);
                                                                setDocPhone(doc.phone);
                                                                setDocSpecialization(doc.specialization);
                                                                setDocQualification(doc.qualification);
                                                                setDocRegNumber(doc.registrationNumber);
                                                                setShowEditDoctorModal(true);
                                                            }}
                                                            style={{ backgroundColor: "#f1f5f9", color: "#08AEB8", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setStatusConfirmModal({
                                                                    show: true,
                                                                    memberType: "doctor",
                                                                    member: doc,
                                                                    targetStatus: doc.status === "active" ? "inactive" : "active"
                                                                });
                                                            }}
                                                            style={{
                                                                backgroundColor: doc.status === "active" ? "#fef2f2" : "#f0fdf4",
                                                                color: doc.status === "active" ? "#b91c1c" : "#15803d",
                                                                border: `1px solid ${doc.status === "active" ? "#fecaca" : "#bbf7d0"}`,
                                                                padding: "6px 12px",
                                                                borderRadius: "6px",
                                                                fontSize: "0.78rem",
                                                                fontWeight: 700,
                                                                cursor: "pointer"
                                                            }}
                                                        >
                                                            {doc.status === "active" ? "Deactivate" : "Activate"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* -------------------------------------------------------------------
                    TAB 3: STAFF MANAGEMENT
                ------------------------------------------------------------------- */}
                {activeTab === "staff" && (
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>

                        {/* Staff Header & Actions */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#0b1c2d" }}>Hospital Staff</h2>
                                <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>Manage non-clinical hospital staff, receptionists, nurses, and administrative personnel.</p>
                            </div>

                            <button
                                onClick={() => setShowAddStaffModal(true)}
                                style={{
                                    backgroundColor: "#08AEB8",
                                    color: "#ffffff",
                                    border: "none",
                                    padding: "10px 20px",
                                    borderRadius: "10px",
                                    fontWeight: 700,
                                    fontSize: "0.88rem",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    boxShadow: "0 4px 12px rgba(8, 174, 184, 0.25)"
                                }}
                            >
                                <i className="fa-solid fa-plus"></i> Add Staff
                            </button>
                        </div>

                        {/* Search & Filters */}
                        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: "280px", position: "relative" }}>
                                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "14px", top: "13px", color: "#94a3b8", fontSize: "0.9rem" }}></i>
                                <input
                                    type="text"
                                    placeholder="Search Staff by name, email, role..."
                                    value={staffSearch}
                                    onChange={(e) => setStaffSearch(e.target.value)}
                                    style={{
                                        width: "100%",
                                        padding: "10px 14px 10px 40px",
                                        borderRadius: "10px",
                                        border: "1px solid #cbd5e1",
                                        fontSize: "0.88rem",
                                        outline: "none",
                                        boxSizing: "border-box"
                                    }}
                                />
                            </div>

                            <select
                                value={staffRoleFilter}
                                onChange={(e) => setStaffRoleFilter(e.target.value)}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: "10px",
                                    border: "1px solid #cbd5e1",
                                    fontSize: "0.88rem",
                                    backgroundColor: "#ffffff",
                                    color: "#334155",
                                    fontWeight: 600
                                }}
                            >
                                <option value="all">All Roles</option>
                                <option value="Reception / Front Desk">Reception / Front Desk</option>
                                <option value="Nurse">Nurse</option>
                                <option value="Coordinator">Coordinator</option>
                                <option value="Other Staff">Other Staff</option>
                            </select>

                            <select
                                value={staffStatusFilter}
                                onChange={(e) => setStaffStatusFilter(e.target.value)}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: "10px",
                                    border: "1px solid #cbd5e1",
                                    fontSize: "0.88rem",
                                    backgroundColor: "#ffffff",
                                    color: "#334155",
                                    fontWeight: 600
                                }}
                            >
                                <option value="all">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>

                        {/* Staff Table */}
                        {filteredStaff.length === 0 ? (
                            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
                                <i className="fa-solid fa-users-slash" style={{ fontSize: "2.5rem", marginBottom: "12px", display: "block" }}></i>
                                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#475569" }}>No Staff Members Found</div>
                                <p style={{ fontSize: "0.85rem", margin: "4px 0 16px" }}>Try adjusting your search criteria or add a new staff member account.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                                    <thead>
                                        <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.75rem", color: "#475569", letterSpacing: "0.05em" }}>
                                            <th style={{ textAlign: "left", padding: "12px 16px" }}>Name</th>
                                            <th style={{ textAlign: "left", padding: "12px 16px" }}>Email</th>
                                            <th style={{ textAlign: "left", padding: "12px 16px" }}>Phone</th>
                                            <th style={{ textAlign: "left", padding: "12px 16px" }}>Staff Role</th>
                                            <th style={{ textAlign: "center", padding: "12px 16px" }}>Status</th>
                                            <th style={{ textAlign: "right", padding: "12px 16px" }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStaff.map(stf => (
                                            <tr key={stf.memberId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                <td style={{ padding: "16px", fontWeight: 700, color: "#0b1c2d" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "#f3e8ff", color: "#9333ea", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>
                                                            {stf.fullName.charAt(0)}
                                                        </div>
                                                        <div>{stf.fullName}</div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: "16px", color: "#334155" }}>{stf.email}</td>
                                                <td style={{ padding: "16px", color: "#334155" }}>{stf.phone || "N/A"}</td>
                                                <td style={{ padding: "16px", color: "#334155" }}>
                                                    <span style={{ backgroundColor: "#e0e7ff", color: "#3730a3", padding: "4px 10px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>
                                                        {stf.staffRole}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "16px", textAlign: "center" }}>
                                                    <span style={{
                                                        display: "inline-block",
                                                        padding: "4px 12px",
                                                        borderRadius: "20px",
                                                        fontSize: "0.75rem",
                                                        fontWeight: 700,
                                                        backgroundColor: stf.status === "active" ? "#dcfce7" : "#f1f5f9",
                                                        color: stf.status === "active" ? "#15803d" : "#64748b"
                                                    }}>
                                                        {stf.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "16px", textAlign: "right" }}>
                                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                                                        <button
                                                            onClick={() => setViewMemberModal({ show: true, memberType: "staff", member: stf })}
                                                            style={{ backgroundColor: "#f1f5f9", color: "#0b1c2d", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                                                        >
                                                            View
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingStaff(stf);
                                                                setStaffFullName(stf.fullName);
                                                                setStaffPhone(stf.phone);
                                                                setStaffRole(stf.staffRole);
                                                                setShowEditStaffModal(true);
                                                            }}
                                                            style={{ backgroundColor: "#f1f5f9", color: "#08AEB8", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setStatusConfirmModal({
                                                                    show: true,
                                                                    memberType: "staff",
                                                                    member: stf,
                                                                    targetStatus: stf.status === "active" ? "inactive" : "active"
                                                                });
                                                            }}
                                                            style={{
                                                                backgroundColor: stf.status === "active" ? "#fef2f2" : "#f0fdf4",
                                                                color: stf.status === "active" ? "#b91c1c" : "#15803d",
                                                                border: `1px solid ${stf.status === "active" ? "#fecaca" : "#bbf7d0"}`,
                                                                padding: "6px 12px",
                                                                borderRadius: "6px",
                                                                fontSize: "0.78rem",
                                                                fontWeight: 700,
                                                                cursor: "pointer"
                                                            }}
                                                        >
                                                            {stf.status === "active" ? "Deactivate" : "Activate"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* -------------------------------------------------------------------
                    TAB 3.5: HOSPITAL ADMIN PROFILE (PART 5)
                ------------------------------------------------------------------- */}
                {activeTab === "profile" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
                        {/* Page Header */}
                        <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                            <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>My Administrator Profile</h2>
                            <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Manage your hospital administrator identity, contact information, and active institutional role.</p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>

                            {/* Primary Account & Role Information */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: "rgba(8,174,184,0.1)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-user-shield"></i>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Hospital Administration Identity</h3>
                                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Active administrative role details</span>
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                    <div>
                                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Administrator Name</div>
                                        <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0b1c2d", marginTop: "2px" }}>{adminName}</div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Primary Portal Role</div>
                                            <div style={{ marginTop: "4px" }}>
                                                <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 800, backgroundColor: "rgba(8,174,184,0.12)", color: "#08AEB8" }}>
                                                    Hospital Administrator
                                                </span>
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Account Status</div>
                                            <div style={{ marginTop: "4px" }}>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 12px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 800, backgroundColor: "#dcfce7", color: "#15803d" }}>
                                                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#16a34a" }}></span>
                                                    ACTIVE
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Active Hospital</div>
                                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0b1c2d", marginTop: "2px" }}>{hospitalNameDisplay}</div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Hospital Code</div>
                                            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#08AEB8", marginTop: "2px" }}>{stats.hospitalCode || "DV-MAIN"}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Secondary Professional Info (If user is also a doctor) */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-user-doctor"></i>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Professional Medical Background</h3>
                                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Secondary clinical qualifications (if applicable)</span>
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                    <div>
                                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Medical Role</div>
                                        <div style={{ fontSize: "1rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>
                                            {currentUser?.specialization ? "Doctor / Medical Practitioner" : "Hospital Administrator"}
                                        </div>
                                    </div>

                                    {currentUser?.specialization && (
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Specialization</div>
                                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#08AEB8", marginTop: "2px" }}>
                                                {currentUser.specialization}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ padding: "12px 16px", backgroundColor: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "0.8rem", color: "#64748b" }}>
                                        <i className="fa-solid fa-circle-info" style={{ color: "#08AEB8", marginRight: "6px" }}></i>
                                        Clinical consultation workspace features can be accessed separately via the Doctor Portal login.
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {/* -------------------------------------------------------------------
                    TAB 4: HOSPITAL PROFILE REDESIGN (PART 8)
                ------------------------------------------------------------------- */}
                {activeTab === "hospital" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>

                        {/* Page Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>Hospital Profile</h2>
                                <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Manage your hospital's institutional information, primary contacts, and facility location.</p>
                            </div>

                            <button
                                onClick={() => setShowEditHospitalModal(true)}
                                style={{
                                    backgroundColor: "#0b1c2d",
                                    color: "#ffffff",
                                    border: "none",
                                    padding: "10px 20px",
                                    borderRadius: "10px",
                                    fontWeight: 700,
                                    fontSize: "0.88rem",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    boxShadow: "0 4px 12px rgba(11, 28, 45, 0.15)"
                                }}
                            >
                                <i className="fa-solid fa-pen-to-square"></i> Edit Hospital Profile
                            </button>
                        </div>

                        {/* Structured Dashboard Cards Grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>

                            {/* Section 1: Hospital Overview */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: "rgba(8,174,184,0.1)", color: "#08AEB8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-building-hospital"></i>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Hospital Overview</h3>
                                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Official institutional identity</span>
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                    <div>
                                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Hospital Name</div>
                                        <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0b1c2d", marginTop: "2px" }}>{hospitalInfo?.name || hospitalNameDisplay}</div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Hospital Code</div>
                                            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#08AEB8", marginTop: "2px" }}>{hospitalInfo?.code || stats.hospitalCode || "DV-MAIN"}</div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Status</div>
                                            <div style={{ marginTop: "4px" }}>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 12px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 800, backgroundColor: "#dcfce7", color: "#15803d" }}>
                                                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#16a34a" }}></span>
                                                    ACTIVE / OPERATIONAL
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Contact Information */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-headset"></i>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Contact Information</h3>
                                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Official communications & support</span>
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Phone Number</div>
                                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>{hospitalInfo?.phone || "+91 (040) 2345 6789"}</div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Official Email</div>
                                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>{hospitalInfo?.email || "admin@doctorsvedika.com"}</div>
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Primary Administrator</div>
                                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0b1c2d", marginTop: "2px" }}>{adminName}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Facility Location */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: "#f3e8ff", color: "#9333ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                        <i className="fa-solid fa-location-dot"></i>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Location & Address</h3>
                                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Physical hospital campus</span>
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                    <div>
                                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Street Address</div>
                                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>{hospitalInfo?.address || "Road No 36, Jubilee Hills"}</div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>City</div>
                                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>{hospitalInfo?.city || "Hyderabad"}</div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>State</div>
                                            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>{hospitalInfo?.state || "Telangana"}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                    </div>
                )}

                {/* -------------------------------------------------------------------
                    TAB 4.5: HOSPITAL ADMIN PROFILE (/admin/profile)
                ------------------------------------------------------------------- */}
                {activeTab === "profile" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
                        {/* Header Banner */}
                        <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>My Administrative Profile</h2>
                                <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Hospital Administrator identity & administrative credentials</p>
                            </div>
                            <div style={{ backgroundColor: "rgba(8, 174, 184, 0.1)", color: "#08AEB8", padding: "8px 16px", borderRadius: "10px", fontWeight: 800, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
                                <i className="fa-solid fa-user-shield"></i> Hospital Administrator
                            </div>
                        </div>

                        {/* Grid 2 Column */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                            {/* Left Card: Administrative Information */}
                            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", borderBottom: "1px solid #f1f5f9", paddingBottom: "16px" }}>
                                    <div style={{ width: "42px", height: "42px", borderRadius: "12px", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>
                                        <i className="fa-solid fa-address-card"></i>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Administrative Details</h3>
                                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Primary portal account credentials</span>
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                    <div>
                                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Full Name</div>
                                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0b1c2d", marginTop: "2px" }}>
                                            {currentUser?.fullName || currentUser?.doctor_name || "Dr. Harshini"}
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Email Address</div>
                                            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>
                                                {currentUser?.email || currentUser?.doctor_email || "admin@doctorsvedika.com"}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Phone Number</div>
                                            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>
                                                {currentUser?.mobileNumber || currentUser?.phone || "+91 98765 43210"}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Hospital Role</div>
                                            <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#08AEB8", marginTop: "2px" }}>
                                                Hospital Administrator
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Account Status</div>
                                            <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#10b981", marginTop: "2px" }}>
                                                <i className="fa-solid fa-circle-check"></i> Active
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Card: Hospital Context & Dual Role Secondary Info */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                                {/* Hospital Context Card */}
                                <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", borderBottom: "1px solid #f1f5f9", paddingBottom: "16px" }}>
                                        <div style={{ width: "42px", height: "42px", borderRadius: "12px", backgroundColor: "#f0fdf4", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>
                                            <i className="fa-solid fa-hospital"></i>
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Associated Hospital</h3>
                                            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Active administrative tenant</span>
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                        <div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Hospital Name</div>
                                            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0b1c2d", marginTop: "2px" }}>
                                                {hospitalNameDisplay}
                                            </div>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                            <div>
                                                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Hospital Code</div>
                                                <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#08AEB8", marginTop: "2px" }}>
                                                    {stats.hospitalCode || "DV-MAIN"}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Facility Status</div>
                                                <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#10b981", marginTop: "2px" }}>
                                                    Active Facility
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Secondary Professional Info Card (Optional Dual Role) */}
                                <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                                        <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: "#fef3c7", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                                            <i className="fa-solid fa-user-md"></i>
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1c2d" }}>Professional Clinical Identity</h3>
                                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Secondary information for dual-role medical practitioners</span>
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div>
                                                <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.95rem" }}>
                                                    {currentUser?.specialization ? `Doctor • ${currentUser.specialization}` : "Practicing Medical Practitioner"}
                                                </div>
                                                <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                                                    Registration: {currentUser?.registrationNumber || "MCI-784920-AP"}
                                                </div>
                                            </div>
                                            <span style={{ backgroundColor: "rgba(8, 174, 184, 0.1)", color: "#08AEB8", fontSize: "0.75rem", fontWeight: 800, padding: "4px 10px", borderRadius: "6px" }}>
                                                Secondary Role
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* -------------------------------------------------------------------
                    TAB 5: SETTINGS (PART 16)
                ------------------------------------------------------------------- */}
                {activeTab === "settings" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>

                        {/* Page Header */}
                        <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                            <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>Hospital Administration Settings</h2>
                            <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Manage administrator account preferences, security governance, and tenant policies.</p>
                        </div>

                        {/* Security & Access Cards */}
                        <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                            <h3 style={{ margin: "0 0 16px", fontSize: "1.15rem", fontWeight: 800, color: "#0b1c2d" }}>Security & Access Governance</h3>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>

                                <div style={{ padding: "20px", borderRadius: "12px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                                    <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.95rem", marginBottom: "4px" }}>
                                        <i className="fa-solid fa-lock" style={{ color: "#08AEB8", marginRight: "8px" }}></i> Multi-Tenant Context Isolation
                                    </div>
                                    <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b", lineHeight: 1.5 }}>
                                        All member queries are isolated to tenant context: <strong style={{ color: "#08AEB8" }}>{stats.hospitalCode}</strong>.
                                    </p>
                                </div>

                                <div style={{ padding: "20px", borderRadius: "12px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                                    <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.95rem", marginBottom: "4px" }}>
                                        <i className="fa-solid fa-key" style={{ color: "#08AEB8", marginRight: "8px" }}></i> Provisioning Security
                                    </div>
                                    <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b", lineHeight: 1.5 }}>
                                        Plaintext credentials are shown once upon creation and are never logged or stored in plain text.
                                    </p>
                                </div>

                                <div style={{ padding: "20px", borderRadius: "12px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                                    <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.95rem", marginBottom: "4px" }}>
                                        <i className="fa-solid fa-shield-halved" style={{ color: "#08AEB8", marginRight: "8px" }}></i> Role-Based API Authorization
                                    </div>
                                    <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b", lineHeight: 1.5 }}>
                                        Backend authentication guards validate hospital membership before granting management permissions.
                                    </p>
                                </div>

                            </div>
                        </div>

                    </div>
                )}

                {/* -------------------------------------------------------------------
                    TAB 6: DEDICATED AUDIT LOGS (PART 17)
                ------------------------------------------------------------------- */}
                {activeTab === "audit" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>

                        {/* Audit Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>Administrative Audit Logs</h2>
                                <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Comprehensive trail of administrative member additions, edits, and status changes.</p>
                            </div>
                            <button onClick={fetchAuditLogs} style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "10px 18px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                                <i className="fa-solid fa-arrows-rotate"></i> Refresh Audit Trail
                            </button>
                        </div>

                        {/* Audit Table */}
                        <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                            {auditLogs.length === 0 ? (
                                <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
                                    <i className="fa-solid fa-shield-cat" style={{ fontSize: "2.5rem", marginBottom: "12px", display: "block" }}></i>
                                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "#475569" }}>No Audit Logs Recorded</div>
                                    <p style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>System events will appear here when administrative actions are performed.</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                                        <thead>
                                            <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#475569", letterSpacing: "0.05em" }}>
                                                <th style={{ textAlign: "left", padding: "12px 16px" }}>Timestamp</th>
                                                <th style={{ textAlign: "left", padding: "12px 16px" }}>Action</th>
                                                <th style={{ textAlign: "left", padding: "12px 16px" }}>Resource</th>
                                                <th style={{ textAlign: "left", padding: "12px 16px" }}>Details</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditLogs.slice(0, 30).map(log => (
                                                <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                    <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: 500 }}>
                                                        {new Date(log.created_at || log.timestamp).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: "14px 16px" }}>
                                                        <span style={{ fontWeight: 800, color: "#08AEB8", backgroundColor: "rgba(8,174,184,0.1)", padding: "4px 10px", borderRadius: "6px" }}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "14px 16px", color: "#334155", fontWeight: 700 }}>{log.resource_type || log.resourceType}</td>
                                                    <td style={{ padding: "14px 16px", color: "#475569" }}>
                                                        {typeof log.metadata === "object" ? JSON.stringify(log.metadata) : String(log.metadata || "")}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                    </div>
                )}

            </div>

            {/* =========================================================================
                MODAL 1: ADD DOCTOR ACCOUNT
            ========================================================================= */}
            {showAddDoctorModal && (
                <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 4000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 20px 20px 20px", overflowY: "auto", boxSizing: "border-box" }}>
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "560px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "calc(100vh - 100px)", display: "flex", flexDirection: "column", margin: "0 auto" }}>

                        <div style={{ padding: "24px 28px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>Create Doctor Account</h3>
                                <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>Provision credentials for Doctor Portal access</div>
                            </div>
                            <button onClick={() => setShowAddDoctorModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <form onSubmit={handleAddDoctorSubmit} style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "18px", overflowY: "auto" }}>

                            <div>
                                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Doctor Full Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Dr. Anil Kumar"
                                    value={docFullName}
                                    onChange={(e) => setDocFullName(e.target.value)}
                                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Email Address *</label>
                                    <input
                                        type="email"
                                        required
                                        placeholder="anil@example.com"
                                        value={docEmail}
                                        onChange={(e) => setDocEmail(e.target.value)}
                                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Phone Number</label>
                                    <input
                                        type="text"
                                        placeholder="+91 98765 43210"
                                        value={docPhone}
                                        onChange={(e) => setDocPhone(e.target.value)}
                                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Specialization</label>
                                    <input
                                        type="text"
                                        placeholder="General Physician / Cardiology"
                                        value={docSpecialization}
                                        onChange={(e) => setDocSpecialization(e.target.value)}
                                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Qualification</label>
                                    <input
                                        type="text"
                                        placeholder="MBBS, MD"
                                        value={docQualification}
                                        onChange={(e) => setDocQualification(e.target.value)}
                                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Medical Reg Number</label>
                                    <input
                                        type="text"
                                        placeholder="MCI-123456"
                                        value={docRegNumber}
                                        onChange={(e) => setDocRegNumber(e.target.value)}
                                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Gender</label>
                                    <select
                                        value={docGender}
                                        onChange={(e) => setDocGender(e.target.value)}
                                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", backgroundColor: "#ffffff" }}
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                                <button
                                    type="button"
                                    onClick={() => setShowAddDoctorModal(false)}
                                    style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    style={{ padding: "10px 24px", borderRadius: "8px", border: "none", backgroundColor: "#08AEB8", color: "#ffffff", fontWeight: 700, cursor: "pointer", opacity: isLoading ? 0.7 : 1 }}
                                >
                                    {isLoading ? "Creating..." : "Create Doctor"}
                                </button>
                            </div>

                        </form>

                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL 2: ADD STAFF ACCOUNT
            ========================================================================= */}
            {showAddStaffModal && (
                <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 4000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 20px 20px 20px", overflowY: "auto", boxSizing: "border-box" }}>
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "520px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "calc(100vh - 100px)", display: "flex", flexDirection: "column", margin: "0 auto" }}>

                        <div style={{ padding: "24px 28px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>Create Staff Account</h3>
                                <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>Provision credentials for Staff Portal access</div>
                            </div>
                            <button onClick={() => setShowAddStaffModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <form onSubmit={handleAddStaffSubmit} style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "18px", overflowY: "auto" }}>

                            <div>
                                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Staff Full Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Ravi Kumar"
                                    value={staffFullName}
                                    onChange={(e) => setStaffFullName(e.target.value)}
                                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                />
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Email Address *</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="ravi@example.com"
                                    value={staffEmail}
                                    onChange={(e) => setStaffEmail(e.target.value)}
                                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Phone Number</label>
                                    <input
                                        type="text"
                                        placeholder="+91 98765 12345"
                                        value={staffPhone}
                                        onChange={(e) => setStaffPhone(e.target.value)}
                                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Staff Role *</label>
                                    <select
                                        value={staffRole}
                                        onChange={(e) => setStaffRole(e.target.value)}
                                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", backgroundColor: "#ffffff" }}
                                    >
                                        <option value="Reception / Front Desk">Reception / Front Desk</option>
                                        <option value="Nurse">Nurse</option>
                                        <option value="Coordinator">Coordinator</option>
                                        <option value="Other Staff">Other Staff</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                                <button
                                    type="button"
                                    onClick={() => setShowAddStaffModal(false)}
                                    style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    style={{ padding: "10px 24px", borderRadius: "8px", border: "none", backgroundColor: "#08AEB8", color: "#ffffff", fontWeight: 700, cursor: "pointer", opacity: isLoading ? 0.7 : 1 }}
                                >
                                    {isLoading ? "Creating..." : "Create Staff"}
                                </button>
                            </div>

                        </form>

                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL 3: ONE-TIME CREDENTIAL DISPLAY SUCCESS SCREEN
            ========================================================================= */}
            {showCredentialModal && createdCredential && (
                <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 4000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px 20px 20px", overflowY: "auto", boxSizing: "border-box" }}>
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "20px", width: "100%", maxWidth: "540px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column", margin: "0 auto", position: "relative" }}>

                        {/* Top Header */}
                        <div style={{ padding: "24px 28px", backgroundColor: "#f0fdf4", borderBottom: "1px solid #bbf7d0", textAlign: "center", position: "relative" }}>
                            <button
                                onClick={() => setShowCredentialModal(false)}
                                style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", fontSize: "1.2rem", color: "#166534", cursor: "pointer", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                            <div style={{ width: "50px", height: "50px", borderRadius: "50%", backgroundColor: "#dcfce7", color: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "10px" }}>
                                <i className="fa-solid fa-circle-check"></i>
                            </div>
                            <h3 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#14532d" }}>
                                {createdCredential.role === "Doctor" ? "Doctor Account Created Successfully" : "Staff Account Created Successfully"}
                            </h3>
                            <div style={{ fontSize: "0.85rem", color: "#166534", marginTop: "4px", fontWeight: 600 }}>
                                Hospital: {createdCredential.hospitalName}
                            </div>
                        </div>

                        {/* Body Details */}
                        <div style={{ padding: "28px", overflowY: "auto" }}>

                            <div style={{ backgroundColor: "#f8fafc", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>

                                <div>
                                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Hospital</span>
                                    <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0b1c2d" }}>
                                        {createdCredential.hospitalName}
                                    </div>
                                </div>

                                <div>
                                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Member Name & Role</span>
                                    <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0b1c2d" }}>
                                        {createdCredential.memberName} <span style={{ fontSize: "0.8rem", color: "#08AEB8", fontWeight: 700 }}>({createdCredential.role})</span>
                                    </div>
                                </div>

                                <div>
                                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Login Email</span>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
                                        <code style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>{createdCredential.email}</code>
                                        <button onClick={() => copyToClipboard(createdCredential.email, "Email")} style={{ background: "none", border: "none", color: "#08AEB8", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>
                                            <i className="fa-regular fa-copy"></i> Copy Email
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Temporary Password</span>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
                                        <code style={{ fontSize: "1rem", fontWeight: 800, color: "#b91c1c", letterSpacing: "0.05em" }}>
                                            {showTempPassword ? createdCredential.temporaryPassword : "••••••••••••"}
                                        </code>
                                        <div style={{ display: "flex", gap: "10px" }}>
                                            <button onClick={() => setShowTempPassword(!showTempPassword)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.85rem" }}>
                                                <i className={`fa-solid ${showTempPassword ? "fa-eye-slash" : "fa-eye"}`}></i>
                                            </button>
                                            <button onClick={() => copyToClipboard(createdCredential.temporaryPassword, "Password")} style={{ background: "none", border: "none", color: "#08AEB8", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>
                                                <i className="fa-regular fa-copy"></i> Copy Password
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Target Portal</span>
                                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0369a1", marginTop: "2px" }}>
                                        {createdCredential.portalName}
                                    </div>
                                </div>

                            </div>

                            {/* Warning Banner */}
                            <div style={{ backgroundColor: "#fffbebe6", border: "1px solid #fde68a", padding: "12px 16px", borderRadius: "10px", fontSize: "0.8rem", color: "#92400e", display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                                <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: "1rem", color: "#d97706" }}></i>
                                <span><strong>Security Notice:</strong> Share these credentials securely. The temporary password is shown once.</span>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: "flex", gap: "12px" }}>
                                <button
                                    onClick={() => {
                                        const text = `Hospital: ${createdCredential.hospitalName}\nName: ${createdCredential.memberName}\nRole: ${createdCredential.role}\nEmail: ${createdCredential.email}\nPassword: ${createdCredential.temporaryPassword}\nPortal: ${createdCredential.portalName}`;
                                        copyToClipboard(text, "Full Credentials Block");
                                    }}
                                    style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#0b1c2d", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                                >
                                    <i className="fa-solid fa-copy"></i> Copy Credentials
                                </button>
                                <button
                                    onClick={() => setShowCredentialModal(false)}
                                    style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", backgroundColor: "#0b1c2d", color: "#ffffff", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer" }}
                                >
                                    Done
                                </button>
                            </div>

                        </div>

                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL 4: VIEW MEMBER DETAILS MODAL
            ========================================================================= */}
            {viewMemberModal.show && viewMemberModal.member && (
                <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.5)", backdropFilter: "blur(4px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                                {viewMemberModal.memberType === "doctor" ? "Doctor Details" : "Staff Details"}
                            </h3>
                            <button onClick={() => setViewMemberModal({ show: false, memberType: "doctor", member: null })} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.1rem", cursor: "pointer" }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
                            <div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Full Name</span>
                                <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "1.05rem" }}>{viewMemberModal.member.fullName}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Email Address</span>
                                <div style={{ fontWeight: 600, color: "#334155" }}>{viewMemberModal.member.email}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Phone</span>
                                <div style={{ fontWeight: 600, color: "#334155" }}>{viewMemberModal.member.phone || "N/A"}</div>
                            </div>
                            {viewMemberModal.memberType === "doctor" ? (
                                <>
                                    <div>
                                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Specialization</span>
                                        <div style={{ fontWeight: 600, color: "#08AEB8" }}>{viewMemberModal.member.specialization}</div>
                                    </div>
                                    {viewMemberModal.member.qualification && (
                                        <div>
                                            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Qualification</span>
                                            <div style={{ fontWeight: 600, color: "#334155" }}>{viewMemberModal.member.qualification}</div>
                                        </div>
                                    )}
                                    {viewMemberModal.member.registrationNumber && (
                                        <div>
                                            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Medical Registration No</span>
                                            <div style={{ fontWeight: 600, color: "#334155" }}>{viewMemberModal.member.registrationNumber}</div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div>
                                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Staff Role</span>
                                    <div style={{ fontWeight: 600, color: "#3730a3" }}>{viewMemberModal.member.staffRole}</div>
                                </div>
                            )}
                            <div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Account Status</span>
                                <div>
                                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700, backgroundColor: viewMemberModal.member.status === "active" ? "#dcfce7" : "#f1f5f9", color: viewMemberModal.member.status === "active" ? "#15803d" : "#64748b" }}>
                                        {viewMemberModal.member.status ? viewMemberModal.member.status.toUpperCase() : "ACTIVE"}
                                    </span>
                                </div>
                            </div>
                            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                                <button onClick={() => setViewMemberModal({ show: false, memberType: "doctor", member: null })} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", backgroundColor: "#0b1c2d", color: "#ffffff", fontWeight: 700, cursor: "pointer" }}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL 5: EDIT DOCTOR MODAL
            ========================================================================= */}
            {showEditDoctorModal && editingDoctor && (
                <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.5)", backdropFilter: "blur(4px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "520px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Edit Doctor Profile</h3>
                            <button onClick={() => setShowEditDoctorModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.1rem", cursor: "pointer" }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <form onSubmit={handleEditDoctorSubmit} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Full Name</label>
                                <input type="text" required value={docFullName} onChange={(e) => setDocFullName(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Phone</label>
                                <input type="text" value={docPhone} onChange={(e) => setDocPhone(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Specialization</label>
                                <input type="text" value={docSpecialization} onChange={(e) => setDocSpecialization(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Qualification</label>
                                    <input type="text" value={docQualification} onChange={(e) => setDocQualification(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Medical Reg Number</label>
                                    <input type="text" value={docRegNumber} onChange={(e) => setDocRegNumber(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                                </div>
                            </div>
                            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                <button type="button" onClick={() => setShowEditDoctorModal(false)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                                <button type="submit" disabled={isLoading} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", backgroundColor: "#08AEB8", color: "#ffffff", fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL 6: EDIT STAFF MODAL
            ========================================================================= */}
            {showEditStaffModal && editingStaff && (
                <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.5)", backdropFilter: "blur(4px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Edit Staff Profile</h3>
                            <button onClick={() => setShowEditStaffModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.1rem", cursor: "pointer" }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <form onSubmit={handleEditStaffSubmit} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Full Name</label>
                                <input type="text" required value={staffFullName} onChange={(e) => setStaffFullName(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Phone</label>
                                <input type="text" value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Staff Role</label>
                                <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", backgroundColor: "#ffffff" }}>
                                    <option value="Reception / Front Desk">Reception / Front Desk</option>
                                    <option value="Nurse">Nurse</option>
                                    <option value="Coordinator">Coordinator</option>
                                    <option value="Other Staff">Other Staff</option>
                                </select>
                            </div>
                            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                <button type="button" onClick={() => setShowEditStaffModal(false)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                                <button type="submit" disabled={isLoading} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", backgroundColor: "#08AEB8", color: "#ffffff", fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL 7: EDIT HOSPITAL PROFILE MODAL
            ========================================================================= */}
            {showEditHospitalModal && (
                <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.5)", backdropFilter: "blur(4px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "520px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Edit Hospital Profile</h3>
                            <button onClick={() => setShowEditHospitalModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.1rem", cursor: "pointer" }}>
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <form onSubmit={handleEditHospitalSubmit} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Hospital Name</label>
                                <input type="text" required value={hospName} onChange={(e) => setHospName(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Phone</label>
                                    <input type="text" value={hospPhone} onChange={(e) => setHospPhone(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Email</label>
                                    <input type="email" value={hospEmail} onChange={(e) => setHospEmail(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Address</label>
                                <input type="text" value={hospAddress} onChange={(e) => setHospAddress(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>City</label>
                                    <input type="text" value={hospCity} onChange={(e) => setHospCity(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>State</label>
                                    <input type="text" value={hospState} onChange={(e) => setHospState(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", boxSizing: "border-box" }} />
                                </div>
                            </div>
                            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                <button type="button" onClick={() => setShowEditHospitalModal(false)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                                <button type="submit" disabled={isLoading} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", backgroundColor: "#0b1c2d", color: "#ffffff", fontWeight: 700, cursor: "pointer" }}>Save Hospital Info</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================================
                MODAL 8: ACTIVATE / DEACTIVATE CONFIRMATION DIALOG
            ========================================================================= */}
            {statusConfirmModal.show && statusConfirmModal.member && (
                <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.5)", backdropFilter: "blur(4px)", zIndex: 3500, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                    <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", width: "100%", maxWidth: "440px", padding: "28px", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", border: "1px solid #e2e8f0" }}>
                        <div style={{ width: "50px", height: "50px", borderRadius: "50%", backgroundColor: statusConfirmModal.targetStatus === "inactive" ? "#fef2f2" : "#f0fdf4", color: statusConfirmModal.targetStatus === "inactive" ? "#ef4444" : "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", marginBottom: "16px" }}>
                            <i className={`fa-solid ${statusConfirmModal.targetStatus === "inactive" ? "fa-user-slash" : "fa-user-check"}`}></i>
                        </div>
                        <h3 style={{ margin: "0 0 8px", fontSize: "1.2rem", fontWeight: 800, color: "#0b1c2d" }}>
                            {statusConfirmModal.targetStatus === "inactive" ? `Deactivate ${statusConfirmModal.member.fullName}?` : `Activate ${statusConfirmModal.member.fullName}?`}
                        </h3>
                        <p style={{ margin: "0 0 24px", fontSize: "0.85rem", color: "#64748b" }}>
                            {statusConfirmModal.targetStatus === "inactive"
                                ? `Deactivating this member will suspend their access to the hospital portal.`
                                : `Activating this member will restore their access permissions for this hospital.`}
                        </p>
                        <div style={{ display: "flex", gap: "12px" }}>
                            <button
                                onClick={() => setStatusConfirmModal({ show: false, memberType: "doctor", member: null, targetStatus: "inactive" })}
                                style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeStatusToggle}
                                disabled={isLoading}
                                style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "none", backgroundColor: statusConfirmModal.targetStatus === "inactive" ? "#dc2626" : "#16a34a", color: "#ffffff", fontWeight: 700, cursor: "pointer" }}
                            >
                                {isLoading ? "Updating..." : `Yes, ${statusConfirmModal.targetStatus === "inactive" ? "Deactivate" : "Activate"}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </DashboardLayout>
    );
}
