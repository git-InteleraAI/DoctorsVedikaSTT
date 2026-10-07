import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import { getApiBaseUrl, getApiV1Url } from "../utils/apiConfig";

const API_BASE = getApiV1Url();

export default function StaffPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { doctor: currentUser, logout, loading: authLoading } = useAuth();

  // -------------------------------------------------------------------------
  // URL Location-based Active Sub-Tab Resolution
  // -------------------------------------------------------------------------
  const activeTab = useMemo(() => {
    const p = location.pathname;
    if (p.includes("/patients")) return "patients";
    if (p.includes("/appointments")) return "appointments";
    if (p.includes("/check-in")) return "check-in";
    if (p.includes("/queue")) return "queue";
    if (p.includes("/profile")) return "profile";
    if (p.includes("/settings")) return "settings";
    return "dashboard";
  }, [location.pathname]);

  // -------------------------------------------------------------------------
  // State Variables
  // -------------------------------------------------------------------------
  const [stats, setStats] = useState({
    totalAppointments: 0,
    waiting: 0,
    checkedIn: 0,
    inConsultation: 0,
    completed: 0,
    cancelled: 0,
    queueCount: 0
  });

  const [doctors, setDoctors] = useState([]);
  const [isDoctorsLoading, setIsDoctorsLoading] = useState(false);
  const [queue, setQueue] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);

  // Search & Filtering
  const [patientSearch, setPatientSearch] = useState("");
  const [candidatePhoneQuery, setCandidatePhoneQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);

  // Doctor & Specialization Filter State
  const [selectedSpecialization, setSelectedSpecialization] = useState("all");
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState("all");

  // Redesigned Tab-Based Patient Queue State
  const [selectedQueueDate, setSelectedQueueDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  const [activeQueueStatusTab, setActiveQueueStatusTab] = useState("all");
  const [queueSearchText, setQueueSearchText] = useState("");

  // Patient Details Drawer & Action Modal State
  const [selectedVisitDetails, setSelectedVisitDetails] = useState(null);
  const [showVisitDetailsDrawer, setShowVisitDetailsDrawer] = useState(false);
  const [isLoadingVisitDetails, setIsLoadingVisitDetails] = useState(false);

  const [cancelModalAppointment, setCancelModalAppointment] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteModalAppointment, setDeleteModalAppointment] = useState(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [actionMenuOpenId, setActionMenuOpenId] = useState(null);

  const formatISTTime = (rawIso) => {
    if (!rawIso) return "--";
    const d = new Date(rawIso);
    if (isNaN(d.getTime())) return String(rawIso);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  };

  const formatReadableDate = (rawIsoOrDateStr) => {
    if (!rawIsoOrDateStr) return "--";
    const d = new Date(rawIsoOrDateStr);
    if (isNaN(d.getTime())) return String(rawIsoOrDateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  };

  const specializations = useMemo(() => {
    const list = doctors.map(d => (d.specialization || "").trim()).filter(Boolean);
    return Array.from(new Set(list));
  }, [doctors]);

  const filteredDoctorOptions = useMemo(() => {
    if (selectedSpecialization === "all") return doctors;
    return doctors.filter(d => (d.specialization || "").trim().toLowerCase() === selectedSpecialization.trim().toLowerCase());
  }, [doctors, selectedSpecialization]);

  const selectedDoctorObj = useMemo(() => {
    if (selectedDoctorFilter === "all") return null;
    return doctors.find(d => String(d.doctorId) === String(selectedDoctorFilter));
  }, [doctors, selectedDoctorFilter]);

  const filteredQueue = useMemo(() => {
    return queue.filter(q => {
      const matchDoc = selectedDoctorFilter === "all" || String(q.doctorId) === String(selectedDoctorFilter);
      const matchSpec = selectedSpecialization === "all" || (q.specialization && q.specialization.trim().toLowerCase() === selectedSpecialization.trim().toLowerCase());
      return matchDoc && matchSpec;
    });
  }, [queue, selectedDoctorFilter, selectedSpecialization]);

  // Tab counts calculation based on current doctor/spec filter
  const queueCounts = useMemo(() => {
    let all = 0, scheduled = 0, waiting = 0, inConsultation = 0, completed = 0, cancelled = 0;

    filteredQueue.forEach(item => {
      all++;
      const stage = (item.visitStage || item.status || "").toLowerCase();
      if (stage === "scheduled" || stage === "pending" || stage === "confirmed") scheduled++;
      else if (stage === "waiting" || stage === "checked_in") waiting++;
      else if (stage === "in_consultation") inConsultation++;
      else if (stage === "completed" || stage === "exited") completed++;
      else if (stage === "cancelled") cancelled++;
    });

    return { all, scheduled, waiting, inConsultation, completed, cancelled };
  }, [filteredQueue]);

  // Reusable unified dataset for active status tab and search text
  const displayedQueueRows = useMemo(() => {
    return filteredQueue.filter(item => {
      const stage = (item.visitStage || item.status || "").toLowerCase();

      if (activeQueueStatusTab === "scheduled" && !(stage === "scheduled" || stage === "pending" || stage === "confirmed")) return false;
      if (activeQueueStatusTab === "waiting" && !(stage === "waiting" || stage === "checked_in")) return false;
      if (activeQueueStatusTab === "in_consultation" && stage !== "in_consultation") return false;
      if (activeQueueStatusTab === "completed" && !(stage === "completed" || stage === "exited")) return false;
      if (activeQueueStatusTab === "cancelled" && stage !== "cancelled") return false;

      if (queueSearchText.trim()) {
        const q = queueSearchText.trim().toLowerCase();
        const pName = (item.patientName || item.patient_name || "").toLowerCase();
        const pPhone = (item.phone || "").toLowerCase();
        const pCode = (item.patientCode || item.hprCode || "").toLowerCase();
        const docName = (item.doctorName || "").toLowerCase();
        const token = (item.tokenNumber || item.token_number || "").toLowerCase();
        const apptTime = (item.appointmentTime || "").toLowerCase();

        return pName.includes(q) || pPhone.includes(q) || pCode.includes(q) || docName.includes(q) || token.includes(q) || apptTime.includes(q);
      }

      return true;
    });
  }, [filteredQueue, activeQueueStatusTab, queueSearchText]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter(app => {
      const matchDoc = selectedDoctorFilter === "all" || String(app.doctorId) === String(selectedDoctorFilter);
      const matchSpec = selectedSpecialization === "all" || (app.specialization && app.specialization.trim().toLowerCase() === selectedSpecialization.trim().toLowerCase());
      return matchDoc && matchSpec;
    });
  }, [appointments, selectedDoctorFilter, selectedSpecialization]);

  const currentConsultationList = useMemo(() => {
    return filteredQueue.filter(q => q.visitStage === "in_consultation");
  }, [filteredQueue]);

  const waitingQueueList = useMemo(() => {
    return filteredQueue.filter(q => q.visitStage === "waiting" || q.visitStage === "checked_in");
  }, [filteredQueue]);

  const completedTodayList = useMemo(() => {
    return filteredQueue.filter(q => q.visitStage === "completed" || q.visitStage === "exited");
  }, [filteredQueue]);

  // Walk-in Registration Modal & Form State
  const [showWalkinModal, setShowWalkinModal] = useState(false);
  const [walkinFirstName, setWalkinFirstName] = useState("");
  const [walkinLastName, setWalkinLastName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");
  const [walkinGender, setWalkinGender] = useState("Male");
  const [walkinDob, setWalkinDob] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [chiefComplaints, setChiefComplaints] = useState("");
  const [walkinVitals, setWalkinVitals] = useState({
    bp: "",
    pulse: "",
    temperature: "",
    weight: "",
    height: "",
    spo2: "",
    bloodGroup: ""
  });

  // Edit Patient Vitals Modal State
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [editVitalsData, setEditVitalsData] = useState({
    bp: "",
    pulse: "",
    temperature: "",
    weight: "",
    height: "",
    spo2: "",
    bloodGroup: "",
    allergies: ""
  });
  const [isSavingVitals, setIsSavingVitals] = useState(false);

  // QR Intake State
  const [qrIntakes, setQrIntakes] = useState([]);
  const [selectedQrIntake, setSelectedQrIntake] = useState(null);
  const [showQrDetailsModal, setShowQrDetailsModal] = useState(false);
  const [activeQrSessionId, setActiveQrSessionId] = useState(null);
  const [lastNotifiedQrCount, setLastNotifiedQrCount] = useState(0);

  // Patient Detail History Modal State
  const [selectedHprDetail, setSelectedHprDetail] = useState(null);
  const [showHprModal, setShowHprModal] = useState(false);
  const [hprHistory, setHprHistory] = useState([]);
  const [showQuickScheduleForm, setShowQuickScheduleForm] = useState(false);
  const [quickSchedDoctorId, setQuickSchedDoctorId] = useState("");
  const [quickSchedReason, setQuickSchedReason] = useState("");
  const [quickSchedActionType, setQuickSchedActionType] = useState("register_and_checkin");
  const [isQuickScheduling, setIsQuickScheduling] = useState(false);

  // Permanent Conversion Modal State
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertEmail, setConvertEmail] = useState("");
  const [convertPhone, setConvertPhone] = useState("");
  const [convertFullName, setConvertFullName] = useState("");
  const [convertDob, setConvertDob] = useState("");
  const [convertGender, setConvertGender] = useState("Male");
  const [convertAddress, setConvertAddress] = useState("");
  const [isConverting, setIsConverting] = useState(false);

  // Change Password Form State
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState({ text: "", type: "" });

  // Dynamic Hospital Information State
  const [hospitalInfo, setHospitalInfo] = useState(null);

  const [message, setMessage] = useState({ text: "", type: "" });
  const [isLoading, setIsLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Authorization Headers Helper
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Authorization Headers Helper
  // -------------------------------------------------------------------------
  const getAuthHeaders = () => {
    const token =
      localStorage.getItem("doctors_vedika_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("doctor_token");
    const storedHospitalId =
      localStorage.getItem("doctors_vedika_hospital_id") ||
      localStorage.getItem("active_hospital_id");

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Portal-Context": "staff",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    };

    if (storedHospitalId && storedHospitalId !== "null" && storedHospitalId !== "undefined" && storedHospitalId !== "00000000-0000-0000-0000-000000000001") {
      headers["X-Hospital-Id"] = storedHospitalId;
    }

    return headers;
  };

  const calculateTimeDiff = (startIso, endIso) => {
    if (!startIso) return "--";
    const start = new Date(startIso).getTime();
    if (isNaN(start)) return "--";
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    if (isNaN(end)) return "--";
    const diffMs = Math.max(0, end - start);
    const totalSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}h ${remMins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  // -------------------------------------------------------------------------
  // Data Fetching Effects
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (authLoading || !currentUser) {
      return;
    }

    fetchAllData();

    // Fast 2-second polling for real-time queue & stage updates
    const interval = setInterval(() => {
      fetchStats();
      fetchQueue();
      fetchQrIntakes();
    }, 2000);

    const handleStorageUpdate = (e) => {
      if (!e || e.key === "doctors_vedika_queue_updated") {
        fetchStats();
        fetchQueue();
        fetchQrIntakes();
      }
    };

    window.addEventListener("storage", handleStorageUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorageUpdate);
    };
  }, [activeTab, authLoading, currentUser?.id, currentUser?.userId]);

  useEffect(() => {
    if (!showWalkinModal || authLoading || !currentUser) {
      return;
    }

    const targetHospitalId =
      hospitalInfo?.id ||
      currentUser?.hospitalId ||
      currentUser?.hospital_id ||
      localStorage.getItem("doctors_vedika_hospital_id") ||
      localStorage.getItem("hospital_id");

    fetchDoctors(targetHospitalId);
  }, [
    showWalkinModal,
    authLoading,
    currentUser?.id,
    currentUser?.userId,
    currentUser?.hospitalId,
    currentUser?.hospital_id,
    hospitalInfo?.id
  ]);

  // Ensure selected doctor in appointment modal is auto-populated as soon as doctors list updates
  useEffect(() => {
    if (doctors && doctors.length > 0) {
      if (!selectedDoctorId || !doctors.some(d => String(d.doctorId) === String(selectedDoctorId))) {
        setSelectedDoctorId(doctors[0].doctorId);
      }
    }
  }, [doctors]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // 1. Resolve and verify authenticated hospital context first
      const hosp = await fetchHospitalInfo();
      const resolvedHospId = hosp?.id || localStorage.getItem("doctors_vedika_hospital_id");

      // 2. Fetch remaining portal data with verified hospital context header
      await Promise.all([
        fetchStats(resolvedHospId),
        fetchDoctors(resolvedHospId),
        fetchQueue(selectedQueueDate),
        fetchAppointments(resolvedHospId),
        fetchPatients(patientSearch)
      ]);
    } catch (err) {
      console.warn("[StaffPortal] Data fetch warning:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHospitalInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/staff/hospital-info?_t=${Date.now()}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.hospital) {
        setHospitalInfo(data.hospital);
        if (data.hospital.id) {
          localStorage.setItem("doctors_vedika_hospital_id", data.hospital.id);
          localStorage.setItem("hospital_id", data.hospital.id);
        }
        return data.hospital;
      }
    } catch (err) {
      console.warn("Fetch hospital info error:", err);
    }
    return null;
  };

  const fetchStats = async (overrideHospId) => {
    try {
      const targetHospId = overrideHospId || hospitalInfo?.id || localStorage.getItem("doctors_vedika_hospital_id");
      const headers = getAuthHeaders();
      if (targetHospId && targetHospId !== "null" && targetHospId !== "undefined") {
        headers["X-Hospital-Id"] = targetHospId;
      }
      const res = await fetch(`${API_BASE}/staff/dashboard-stats?_t=${Date.now()}`, { headers });
      const data = await res.json();
      if (data.success && data.stats) setStats(data.stats);
    } catch (err) {
      console.warn("Fetch stats error:", err);
    }
  };

  const fetchDoctors = async (overrideHospId = null) => {
    setIsDoctorsLoading(true);

    const targetHospId =
      overrideHospId ||
      hospitalInfo?.id ||
      currentUser?.hospitalId ||
      currentUser?.hospital_id ||
      localStorage.getItem("doctors_vedika_hospital_id") ||
      localStorage.getItem("hospital_id");

    const headers = getAuthHeaders();
    if (targetHospId && targetHospId !== "null" && targetHospId !== "undefined") {
      headers["X-Hospital-Id"] = targetHospId;
    }

    console.log("[STAFF DOCTORS] request", {
      url: `${API_BASE}/staff/doctors`,
      hospitalId: targetHospId,
      headers: {
        hasAuthorization: !!headers.Authorization,
        hospitalId: headers["X-Hospital-Id"]
      }
    });

    try {
      const response = await fetch(
        `${API_BASE}/staff/doctors?_t=${Date.now()}`,
        {
          method: "GET",
          headers: {
            ...headers,
            "Accept": "application/json"
          },
          cache: "no-store"
        }
      );

      console.log("[STAFF DOCTORS] HTTP", response.status);

      const data = await response.json();
      console.log("[STAFF DOCTORS] RESPONSE", data);

      if (!response.ok) {
        console.error(
          "[StaffPortal] Doctor API failed:",
          response.status,
          data
        );
        return;
      }

      if (!data.success || !Array.isArray(data.doctors)) {
        console.error(
          "[StaffPortal] Invalid doctor API response:",
          data
        );
        return;
      }

      const receivedDoctors = data.doctors;

      if (receivedDoctors.length === 0) {
        setDoctors([]);
        setSelectedDoctorId("");
        return;
      }

      setDoctors(receivedDoctors);

      const selectedStillExists = receivedDoctors.some(
        doctor => String(doctor.doctorId) === String(selectedDoctorId)
      );

      if (!selectedStillExists) {
        setSelectedDoctorId(receivedDoctors[0].doctorId);
      }
    } catch (error) {
      console.error(
        "[StaffPortal] Failed to load hospital doctors:",
        error
      );
    } finally {
      setIsDoctorsLoading(false);
    }
  };

  const fetchQueue = async (targetDate = selectedQueueDate) => {
    try {
      const sep = targetDate ? "&" : "?";
      const url = `${API_BASE}/staff/queue${targetDate ? `?date=${encodeURIComponent(targetDate)}` : ""}${sep}_t=${Date.now()}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.queue) {
        setQueue(data.queue);
      }
    } catch (err) {
      console.warn("Fetch queue error:", err);
    }
  };

  const handleOpenPatientDetails = async (item) => {
    const idToUse = item.visitId || item.id || item.appointmentId;
    setIsLoadingVisitDetails(true);
    setShowVisitDetailsDrawer(true);
    setSelectedVisitDetails(null);

    try {
      const res = await fetch(`${API_BASE}/staff/visits/${idToUse}/details`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedVisitDetails(data.data);
      } else {
        // Fallback context if endpoint unavailable
        setSelectedVisitDetails({
          patient: {
            fullName: item.patientName || "Patient",
            phone: item.phone || "--",
            patientCode: item.patientCode || item.hprCode || "--",
            gender: item.gender || "--",
            dateOfBirth: item.dob || item.dateOfBirth || null,
            isWalkin: !item.patientId
          },
          appointment: {
            appointmentDate: item.appointmentDate || selectedQueueDate,
            appointmentTime: item.appointmentTime || "--",
            doctorName: item.doctorName || "Doctor",
            specialization: item.specialization || "--",
            status: item.status || item.visitStage || "Scheduled",
            chiefComplaints: item.chiefComplaints || item.reason || "--"
          },
          visit: {
            visitId: item.visitId || item.id,
            visitStage: item.visitStage || item.status,
            checkedInAt: item.checkedInAt,
            consultationStartedAt: item.consultationStartedAt,
            consultationCompletedAt: item.consultationCompletedAt,
            waitingDuration: item.checkedInAt ? calculateTimeDiff(item.checkedInAt, item.consultationStartedAt) : "--",
            consultationDuration: item.consultationStartedAt ? calculateTimeDiff(item.consultationStartedAt, item.consultationCompletedAt) : "--"
          },
          hospital: {
            hospitalName: "Doctors Vedika Main Hospital",
            hprCode: item.hprCode || "DV-HPR-001",
            registrationType: item.patientId ? "REGISTERED_PATIENT" : "WALK_IN_DIRECT"
          }
        });
      }
    } catch (err) {
      console.error("Error fetching visit details:", err);
    } finally {
      setIsLoadingVisitDetails(false);
    }
  };

  const handleOpenCancelModal = (item) => {
    setCancelModalAppointment(item);
    setCancelReason("");
    setActionMenuOpenId(null);
  };

  const handleConfirmCancelAppointment = async (e) => {
    e?.preventDefault();
    if (!cancelModalAppointment) return;
    setIsActionSubmitting(true);
    try {
      const apptId = cancelModalAppointment.appointmentId || cancelModalAppointment.id;
      const res = await fetch(`${API_BASE}/staff/appointments/${apptId}/cancel`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: cancelReason })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message || "Appointment cancelled successfully.", type: "success" });
        setCancelModalAppointment(null);
        fetchQueue(selectedQueueDate);
        fetchAppointments();
      } else {
        setMessage({ text: data.message || "Failed to cancel appointment.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: err.message || "Error cancelling appointment.", type: "error" });
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleOpenDeleteModal = (item) => {
    setDeleteModalAppointment(item);
    setActionMenuOpenId(null);
  };

  const handleConfirmDeleteAppointment = async () => {
    if (!deleteModalAppointment) return;
    setIsActionSubmitting(true);
    try {
      const apptId = deleteModalAppointment.appointmentId || deleteModalAppointment.id;
      const res = await fetch(`${API_BASE}/staff/appointments/${apptId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message || "Appointment deleted permanently.", type: "success" });
        setDeleteModalAppointment(null);
        fetchQueue(selectedQueueDate);
        fetchAppointments();
      } else {
        setMessage({ text: data.message || "Cannot delete appointment.", type: "error" });
        setDeleteModalAppointment(null);
      }
    } catch (err) {
      setMessage({ text: err.message || "Error deleting appointment.", type: "error" });
      setDeleteModalAppointment(null);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      const res = await fetch(`${API_BASE}/staff/appointments?_t=${Date.now()}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.appointments) {
        setAppointments(data.appointments);
      }
    } catch (err) {
      console.warn("Fetch appointments error:", err);
    }
  };

  const fetchPatients = async (searchTerm = "") => {
    try {
      const sep = searchTerm ? "&" : "?";
      const url = `${API_BASE}/staff/patients${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ""}${sep}_t=${Date.now()}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.patients) {
        setPatients(data.patients);
      }
    } catch (err) {
      console.warn("Fetch patients error:", err);
    }
  };

  const fetchQrIntakes = async () => {
    try {
      const res = await fetch(`${API_BASE}/staff/qr-intakes?_t=${Date.now()}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.intakes)) {
        setQrIntakes(data.intakes);
        if (data.intakes.length > lastNotifiedQrCount && lastNotifiedQrCount > 0) {
          setMessage({
            text: `New incoming QR Patient Intake: ${data.intakes[0].patientName || "Patient"} has submitted their symptoms!`,
            type: "success"
          });
        }
        setLastNotifiedQrCount(data.intakes.length);
      }
    } catch (err) {
      console.warn("Fetch QR intakes error:", err);
    }
  };

  const handleStartWalkinFromQr = (intake) => {
    const fName = intake.firstName || (intake.patientName ? intake.patientName.split(" ")[0] : "");
    const lName = intake.lastName || (intake.patientName ? intake.patientName.split(" ").slice(1).join(" ") : "");
    
    const symptoms = Array.isArray(intake.clinicalIntake?.symptoms) ? intake.clinicalIntake.symptoms.join(", ") : "";
    let complaintText = symptoms ? `Symptoms: ${symptoms}` : "";
    if (intake.clinicalIntake?.duration) {
      complaintText += complaintText ? ` | Duration: ${intake.clinicalIntake.duration}` : `Duration: ${intake.clinicalIntake.duration}`;
    }
    if (intake.clinicalIntake?.severity) {
      complaintText += complaintText ? ` | Severity: ${intake.clinicalIntake.severity}` : `Severity: ${intake.clinicalIntake.severity}`;
    }
    if (intake.clinicalIntake?.location) {
      complaintText += complaintText ? ` | Location: ${intake.clinicalIntake.location}` : `Location: ${intake.clinicalIntake.location}`;
    }
    if (intake.clinicalIntake?.recent_actions) {
      complaintText += complaintText ? ` | Actions: ${intake.clinicalIntake.recent_actions}` : `Actions: ${intake.clinicalIntake.recent_actions}`;
    }

    setWalkinFirstName(fName);
    setWalkinLastName(lName);
    setWalkinPhone(intake.phone || "");
    setWalkinDob(intake.dateOfBirth || "");
    setWalkinGender(intake.gender ? (intake.gender.charAt(0).toUpperCase() + intake.gender.slice(1)) : "Male");
    setChiefComplaints(complaintText);
    setActiveQrSessionId(intake.id);
    setCandidatePhoneQuery(intake.phone || "");

    setShowWalkinModal(true);
    setShowQrDetailsModal(false);
  };

  // -------------------------------------------------------------------------
  // Handlers & Actions
  // -------------------------------------------------------------------------
  const handleSearchCandidates = async (e) => {
    e?.preventDefault();
    if (!candidatePhoneQuery.trim()) return;
    setIsSearchingCandidates(true);
    setSelectedCandidate(null);
    try {
      const res = await fetch(`${API_BASE}/staff/patients/search?q=${encodeURIComponent(candidatePhoneQuery.trim())}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setCandidates(data.candidates || []);
      }
    } catch (err) {
      console.error("Candidate search error:", err);
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  const handleSelectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setWalkinFirstName(candidate.first_name || "");
    setWalkinLastName(candidate.last_name || "");
    setWalkinPhone(candidate.phone || "");
    setWalkinGender(candidate.gender || "Male");
    setWalkinDob(candidate.date_of_birth || "");
  };

  const handleWalkinSubmit = (e) => {
    e?.preventDefault();
    handleWalkinSubmitWithAction("register_and_checkin");
  };

  const handleWalkinSubmitWithAction = async (actionType) => {
    setMessage({ text: "", type: "" });

    if (!selectedDoctorId) {
      setMessage({ text: "Please select an assigned doctor for this walk-in.", type: "error" });
      return;
    }

    if (!walkinDob || !walkinDob.trim()) {
      setMessage({ text: "Date of Birth (DOB) is required to register a walk-in patient.", type: "error" });
      return;
    }

    try {
      const endpoint = selectedCandidate ? `${API_BASE}/staff/patients/existing-walkin` : `${API_BASE}/staff/patients/walkin`;
      const payload = {
        selectedHprId: selectedCandidate ? selectedCandidate.id : null,
        firstName: walkinFirstName,
        lastName: walkinLastName,
        fullName: `${walkinFirstName} ${walkinLastName}`.trim(),
        phone: walkinPhone,
        gender: walkinGender,
        dateOfBirth: walkinDob,
        doctorId: selectedDoctorId,
        chiefComplaints,
        vitals: walkinVitals, // Optional vitals during registration
        actionType, // 'register_only' | 'register_and_checkin'
        qrSessionId: activeQrSessionId || null
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        const actionLabel = actionType === "register_only" ? "registered (scheduled)" : "checked in to queue";
        setMessage({ text: `Walk-in patient ${actionLabel} successfully!`, type: "success" });
        setShowWalkinModal(false);
        setActiveQrSessionId(null);
        // Reset Form
        setSelectedCandidate(null);
        setCandidatePhoneQuery("");
        setCandidates([]);
        setWalkinFirstName("");
        setWalkinLastName("");
        setWalkinPhone("");
        setWalkinDob("");
        setChiefComplaints("");
        setWalkinVitals({ bp: "", pulse: "", temperature: "", weight: "", height: "", spo2: "", bloodGroup: "" });
        // Refresh Data
        fetchStats();
        fetchQueue();
        fetchAppointments();
        fetchPatients();
        fetchQrIntakes();
      } else {
        setMessage({ text: data.message || "Failed to register walk-in patient.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: err.message || "Connection error.", type: "error" });
    }
  };

  const handleOpenVitalsModal = (visit) => {
    setEditingVisit(visit);
    const existing = visit.intakeVitals || visit.intake_vitals || visit.vitals || {};
    setEditVitalsData({
      bp: existing.bp || existing.blood_pressure || existing.bloodPressure || "",
      pulse: existing.pulse || existing.heart_rate || existing.heartRate || "",
      temperature: existing.temperature || existing.temp || "",
      weight: existing.weight || "",
      height: existing.height || "",
      spo2: existing.spo2 || "",
      bloodGroup: existing.bloodGroup || existing.blood_group || "",
      allergies: existing.allergies || ""
    });
    setShowVitalsModal(true);
  };

  const handleSaveVitals = async (e) => {
    e?.preventDefault();
    if (!editingVisit) return;
    setIsSavingVitals(true);
    setMessage({ text: "", type: "" });
    try {
      const targetId = editingVisit.visitId || editingVisit.appointmentId || editingVisit.id;
      const cleanTargetId = targetId ? String(targetId).replace(/^v\./, "") : "";
      const res = await fetch(`${API_BASE}/staff/visits/${cleanTargetId}/vitals`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ vitals: editVitalsData })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: "Patient vitals updated successfully!", type: "success" });
        setShowVitalsModal(false);
        setEditingVisit(null);
        fetchQueue();
      } else {
        setMessage({ text: data.message || "Failed to update vitals.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: err.message || "Connection error.", type: "error" });
    } finally {
      setIsSavingVitals(false);
    }
  };

  const handleOpenConvertModal = (hpr) => {
    if (hpr.patient_id) {
      setMessage({ text: "This patient is already a registered Doctors Vedika patient.", type: "error" });
      return;
    }
    setConvertFullName(hpr.full_name || "");
    setConvertPhone(hpr.phone || "");
    setConvertEmail(hpr.email || "");
    setConvertDob(hpr.date_of_birth || "");
    setConvertGender(hpr.gender || "Male");
    setConvertAddress(hpr.address || "");
    setShowConvertModal(true);
  };

  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    if (!selectedHprDetail) return;
    setIsConverting(true);
    setMessage({ text: "", type: "" });

    try {
      const res = await fetch(`${API_BASE}/staff/patients/${selectedHprDetail.id}/convert`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: convertEmail,
          phone: convertPhone,
          fullName: convertFullName,
          dateOfBirth: convertDob,
          gender: convertGender,
          address: convertAddress
        })
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ text: data.message, type: "success" });
        setShowConvertModal(false);
        setShowHprModal(false);
        fetchPatients();
      } else {
        setMessage({ text: data.message || "Conversion failed.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: err.message || "Connection error.", type: "error" });
    } finally {
      setIsConverting(false);
    }
  };

  const handleAppointmentCheckin = async (appointmentId) => {
    try {
      // Immediate optimistic update so status badge changes to WAITING and Check In button disappears dynamically
      const nowIso = new Date().toISOString();
      setQueue(prevQueue => prevQueue.map(item => {
        if (String(item.id) === String(appointmentId) || String(item.appointmentId) === String(appointmentId)) {
          return {
            ...item,
            visitStage: "waiting",
            checkedInAt: nowIso,
            can_check_in: false
          };
        }
        return item;
      }));

      setAppointments(prevAppts => prevAppts.map(app => {
        if (String(app.id) === String(appointmentId)) {
          return {
            ...app,
            status: "waiting",
            visitStage: "waiting",
            isCheckedIn: true
          };
        }
        return app;
      }));

      const res = await fetch(`${API_BASE}/staff/appointments/${appointmentId}/checkin`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ chiefComplaints: "Checked in by reception staff" })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: "Patient checked in to queue successfully!", type: "success" });
        fetchStats();
        fetchQueue();
        fetchAppointments();
      } else {
        setMessage({ text: data.message || "Check-in failed.", type: "error" });
        fetchQueue();
        fetchAppointments();
      }
    } catch (err) {
      setMessage({ text: err.message, type: "error" });
      fetchQueue();
      fetchAppointments();
    }
  };

  const handleDoctorReassign = async (visitId, newDoctorId) => {
    try {
      const res = await fetch(`${API_BASE}/staff/visits/${visitId}/assignment`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ doctorId: newDoctorId })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: "Doctor reassigned successfully.", type: "success" });
        fetchQueue();
      } else {
        setMessage({ text: data.message || "Reassignment failed.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleMarkExited = async (visitId) => {
    try {
      const res = await fetch(`${API_BASE}/queue/transition`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ visitId, targetStage: "exited" })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: "Patient marked as EXITED from hospital.", type: "success" });
        fetchStats();
        fetchQueue();
      } else {
        setMessage({ text: data.message || "Failed to mark patient as exited.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: err.message || "Connection error.", type: "error" });
    }
  };

  const handleViewPatientDetail = async (hpr) => {
    const targetHpr = hpr || {};
    setSelectedHprDetail(targetHpr);
    setShowHprModal(true);
    setShowQuickScheduleForm(false);
    setQuickSchedReason("");
    setQuickSchedDoctorId(doctors[0]?.doctorId || "");
    setHprHistory([]);
    try {
      const hprId = targetHpr.hprId || targetHpr.id;
      const res = await fetch(`${API_BASE}/staff/patients/${hprId}/history`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setHprHistory(data.visitHistory || []);
        if (data.hpr) setSelectedHprDetail(data.hpr);
      }
    } catch (err) {
      console.error("Fetch HPR History Error:", err);
    }
  };

  const handleQuickScheduleSubmit = async (e) => {
    e?.preventDefault();
    if (!selectedHprDetail || !quickSchedDoctorId) {
      setMessage({ text: "Please select an assigned doctor for the visit.", type: "error" });
      return;
    }
    setIsQuickScheduling(true);
    setMessage({ text: "", type: "" });
    try {
      const res = await fetch(`${API_BASE}/staff/patients/existing-walkin`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          selectedHprId: selectedHprDetail.id,
          doctorId: quickSchedDoctorId,
          chiefComplaints: quickSchedReason,
          actionType: quickSchedActionType
        })
      });
      const data = await res.json();
      if (data.success) {
        const statusText = quickSchedActionType === "register_only" ? "scheduled" : "registered & checked in to queue";
        setMessage({ text: `Appointment for ${selectedHprDetail.full_name} ${statusText} successfully!`, type: "success" });
        setShowQuickScheduleForm(false);
        setQuickSchedReason("");
        fetchQueue();
        fetchAppointments();
        fetchStats();
        handleViewPatientDetail(selectedHprDetail);
      } else {
        setMessage({ text: data.message || "Failed to schedule appointment.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: err.message || "Connection error.", type: "error" });
    } finally {
      setIsQuickScheduling(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwdMsg({ text: "", type: "" });
    if (pwdNew !== pwdConfirm) {
      setPwdMsg({ text: "New password and confirm password do not match.", type: "error" });
      return;
    }
    if (pwdNew.length < 6) {
      setPwdMsg({ text: "Password must be at least 6 characters long.", type: "error" });
      return;
    }
    setPwdLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/change-password`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword: pwdCurrent, newPassword: pwdNew })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPwdMsg({ text: "Password changed successfully!", type: "success" });
        setPwdCurrent("");
        setPwdNew("");
        setPwdConfirm("");
      } else {
        setPwdMsg({ text: data.message || "Failed to change password.", type: "error" });
      }
    } catch (err) {
      setPwdMsg({ text: err.message || "Unable to process password change.", type: "error" });
    } finally {
      setPwdLoading(false);
    }
  };

  const staffName = currentUser?.fullName || currentUser?.doctor_name || "Ravi Kumar";
  const hospitalName = currentUser?.hospitalName || currentUser?.hospital_name || hospitalInfo?.name || "Doctors Vedika Hospital";

  return (
    <DashboardLayout activePage="staff" searchPlaceholder="Search patients, appointments, phone numbers...">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%", paddingBottom: "40px" }}>

        {/* Global Notification Banner */}
        {message.text && (
          <div
            style={{
              padding: "14px 20px",
              borderRadius: "12px",
              backgroundColor: message.type === "success" ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${message.type === "success" ? "#bbf7d0" : "#fecaca"}`,
              color: message.type === "success" ? "#166534" : "#991b1b",
              fontWeight: 700,
              fontSize: "0.9rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span>
              <i className={`fa-solid ${message.type === "success" ? "fa-circle-check" : "fa-triangle-exclamation"}`} style={{ marginRight: "8px" }} />
              {message.text}
            </span>
            <button onClick={() => setMessage({ text: "", type: "" })} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}

        {/* =========================================================================
            TAB 1: STAFF DASHBOARD (/staff)
        ========================================================================= */}
        {(activeTab === "dashboard" || activeTab === "staff") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>

            {/* Banner Section */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "24px 32px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "16px"
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#08AEB8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Staff Operations Desk
                </div>
                <h2 style={{ margin: "2px 0 4px", fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>
                  Good Morning, {staffName}
                </h2>
                <p style={{ margin: 0, fontSize: "0.88rem", color: "#64748b" }}>
                  {hospitalName} • Live Reception &amp; Walk-in Queue Operations
                </p>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => setShowWalkinModal(true)}
                  style={{
                    backgroundColor: "#08AEB8",
                    color: "#ffffff",
                    border: "none",
                    padding: "12px 20px",
                    borderRadius: "10px",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(8, 174, 184, 0.3)"
                  }}
                >
                  <i className="fa-solid fa-user-plus" /> + Register Walk-in
                </button>
                <button
                  onClick={() => navigate("/staff/patients")}
                  style={{
                    backgroundColor: "#0b1c2d",
                    color: "#ffffff",
                    border: "none",
                    padding: "12px 20px",
                    borderRadius: "10px",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <i className="fa-solid fa-magnifying-glass" /> Find Patient
                </button>
              </div>
            </div>

            {/* Operational Metrics Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>

              <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Today's Bookings</span>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
                    <i className="fa-solid fa-calendar-day" />
                  </div>
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#0b1c2d", marginTop: "10px" }}>
                  {stats.totalAppointments}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Scheduled &amp; Walk-ins</div>
              </div>

              <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Checked In</span>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", backgroundColor: "#fef3c7", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
                    <i className="fa-solid fa-user-clock" />
                  </div>
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#d97706", marginTop: "10px" }}>
                  {stats.checkedIn}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Active Reception Arrived</div>
              </div>

              <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Waiting Queue</span>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", backgroundColor: "#e0e7ff", color: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
                    <i className="fa-solid fa-users" />
                  </div>
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#4f46e5", marginTop: "10px" }}>
                  {stats.waiting}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Awaiting Doctor Consultation</div>
              </div>

              <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Completed Today</span>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", backgroundColor: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
                    <i className="fa-solid fa-circle-check" />
                  </div>
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#16a34a", marginTop: "10px" }}>
                  {stats.completed}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Consultations Finished</div>
              </div>

            </div>

            {/* Incoming QR Patient Intakes Section */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "20px 24px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                display: "flex",
                flexDirection: "column",
                gap: "16px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>
                    <i className="fa-solid fa-qrcode" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>
                      Incoming QR Patient Intakes
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                      Patients who scanned the hospital QR code and completed digital clinical intake
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "20px",
                      fontSize: "0.8rem",
                      fontWeight: 800,
                      backgroundColor: qrIntakes.length > 0 ? "rgba(8,174,184,0.12)" : "#f1f5f9",
                      color: qrIntakes.length > 0 ? "#08AEB8" : "#64748b"
                    }}
                  >
                    {qrIntakes.length} {qrIntakes.length === 1 ? "Pending Intake" : "Pending Intakes"}
                  </span>
                  <button
                    onClick={fetchQrIntakes}
                    style={{
                      background: "none",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      color: "#64748b"
                    }}
                    title="Refresh QR Intakes"
                  >
                    <i className="fa-solid fa-rotate-right" /> Refresh
                  </button>
                </div>
              </div>

              {qrIntakes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 10px", color: "#94a3b8", fontSize: "0.88rem" }}>
                  <i className="fa-solid fa-clipboard-check" style={{ fontSize: "1.5rem", marginBottom: "8px", display: "block", color: "#cbd5e1" }} />
                  No pending QR patient intakes at this moment. New check-ins submitted via the hospital QR code will appear here in real-time.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {qrIntakes.map((item) => {
                    const symptomsList = Array.isArray(item.clinicalIntake?.symptoms) ? item.clinicalIntake.symptoms : [];
                    const isCaution = item.safetyStatus?.toLowerCase() === "caution";
                    const isCritical = item.safetyStatus?.toLowerCase() === "critical";

                    return (
                      <div
                        key={item.id}
                        style={{
                          backgroundColor: "#f8fafc",
                          borderRadius: "12px",
                          padding: "16px 20px",
                          border: isCritical ? "1px solid #fca5a5" : isCaution ? "1px solid #fde68a" : "1px solid #e2e8f0",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "14px"
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "220px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontWeight: 800, fontSize: "0.98rem", color: "#0f172a" }}>
                              {item.patientName || "Anonymous Patient"}
                            </span>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "0.72rem",
                                fontWeight: 800,
                                textTransform: "uppercase",
                                backgroundColor: isCritical ? "#fee2e2" : isCaution ? "#fef3c7" : "#ecfdf5",
                                color: isCritical ? "#b91c1c" : isCaution ? "#b45309" : "#047857"
                              }}
                            >
                              {item.safetyStatus || "safe"}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                            <span>📞 {item.phone || "No phone"}</span>
                            <span style={{ margin: "0 8px" }}>•</span>
                            <span>DOB: {item.dateOfBirth || "N/A"}</span>
                            <span style={{ margin: "0 8px" }}>•</span>
                            <span>{item.gender ? item.gender.toUpperCase() : "N/A"}</span>
                          </div>
                          <div style={{ fontSize: "0.82rem", color: "#334155", marginTop: "2px" }}>
                            <strong>Symptoms:</strong> {symptomsList.length > 0 ? symptomsList.join(", ") : "General assessment"}
                            {item.clinicalIntake?.duration ? ` (${item.clinicalIntake.duration})` : ""}
                            {item.clinicalIntake?.severity ? ` • Severity: ${item.clinicalIntake.severity}` : ""}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => {
                              setSelectedQrIntake(item);
                              setShowQrDetailsModal(true);
                            }}
                            style={{
                              backgroundColor: "#ffffff",
                              color: "#334155",
                              border: "1px solid #cbd5e1",
                              padding: "8px 14px",
                              borderRadius: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              cursor: "pointer"
                            }}
                          >
                            <i className="fa-solid fa-file-lines" style={{ marginRight: "6px" }} /> View Intake
                          </button>
                          <button
                            onClick={() => handleStartWalkinFromQr(item)}
                            style={{
                              backgroundColor: "#08AEB8",
                              color: "#ffffff",
                              border: "none",
                              padding: "8px 16px",
                              borderRadius: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px"
                            }}
                          >
                            <i className="fa-solid fa-user-plus" /> Register &amp; Walk-in
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Doctor & Specialization Filtering Bar */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "20px 24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <i className="fa-solid fa-stethoscope" style={{ color: "#08AEB8", marginRight: "6px" }} /> Specialization:
                  </label>
                  <select
                    value={selectedSpecialization}
                    onChange={(e) => {
                      setSelectedSpecialization(e.target.value);
                      setSelectedDoctorFilter("all");
                    }}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: 700, color: "#0b1c2d", backgroundColor: "#f8fafc", outline: "none", minWidth: "180px" }}
                  >
                    <option value="all">All Specializations ({specializations.length})</option>
                    {specializations.map((spec) => (
                      <option key={spec} value={spec}>{spec}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <i className="fa-solid fa-user-doctor" style={{ color: "#08AEB8", marginRight: "6px" }} /> Doctor:
                  </label>
                  <select
                    value={selectedDoctorFilter}
                    onChange={(e) => setSelectedDoctorFilter(e.target.value)}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: 700, color: "#0b1c2d", backgroundColor: "#f8fafc", outline: "none", minWidth: "220px" }}
                  >
                    <option value="all">All Doctors ({filteredDoctorOptions.length})</option>
                    {filteredDoctorOptions.map((doc) => (
                      <option key={doc.doctorId} value={doc.doctorId}>
                        {doc.fullName} ({doc.specialization})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#64748b" }}>
                Filter View: <span style={{ color: "#08AEB8", fontWeight: 900 }}>{selectedDoctorObj ? `${selectedDoctorObj.fullName} • ${selectedDoctorObj.specialization}` : (selectedSpecialization !== "all" ? `Specialization: ${selectedSpecialization}` : "All Hospital Doctors")}</span>
              </div>
            </div>

            {/* SECTION 1: CURRENT CONSULTATION */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#0284c7", boxShadow: "0 0 0 3px rgba(2,132,199,0.2)" }} />
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>1. Current Consultation</h3>
                  <span style={{ backgroundColor: "#e0f2fe", color: "#0284c7", padding: "3px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 800 }}>
                    {currentConsultationList.length} Active
                  </span>
                </div>
                <button
                  onClick={fetchQueue}
                  style={{ backgroundColor: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <i className="fa-solid fa-arrows-rotate" /> Refresh
                </button>
              </div>

              {currentConsultationList.length === 0 ? (
                <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                  <i className="fa-solid fa-stethoscope" style={{ fontSize: "1.6rem", marginBottom: "8px", color: "#94a3b8", display: "block" }} />
                  <div style={{ fontWeight: 700, color: "#475569", fontSize: "0.9rem" }}>No Patient Currently in Consultation</div>
                  <span style={{ fontSize: "0.78rem" }}>When doctor clicks 'Start Consultation', patient will immediately appear here.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#475569", letterSpacing: "0.05em" }}>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Patient Name</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Check-in Time</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Start Time</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Consult Duration</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Assigned Doctor</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentConsultationList.map(q => (
                        <tr key={q.visitId} style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: "#f0f9ff" }}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{q.patientName}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{q.phone || q.patientCode}</div>
                          </td>
                          <td style={{ padding: "12px 14px", color: "#475569", fontWeight: 600 }}>
                            {formatISTTime(q.checkedInAt)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#0284c7", fontWeight: 700 }}>
                            {formatISTTime(q.consultationStartedAt)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#0284c7", fontWeight: 900 }}>
                            {calculateTimeDiff(q.consultationStartedAt, null)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#334155", fontWeight: 700 }}>
                            {q.doctorName}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ backgroundColor: "#e0f2fe", color: "#0284c7", padding: "4px 10px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                              IN CONSULTATION
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SECTION 2: WAITING QUEUE */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#d97706" }} />
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>2. Waiting Queue</h3>
                  <span style={{ backgroundColor: "#fef3c7", color: "#d97706", padding: "3px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 800 }}>
                    {waitingQueueList.length} Waiting
                  </span>
                </div>
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Checked-in patients awaiting doctor</span>
              </div>

              {waitingQueueList.length === 0 ? (
                <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                  <i className="fa-solid fa-user-clock" style={{ fontSize: "1.6rem", marginBottom: "8px", color: "#94a3b8", display: "block" }} />
                  <div style={{ fontWeight: 700, color: "#475569", fontSize: "0.9rem" }}>No Patients Currently Waiting</div>
                  <span style={{ fontSize: "0.78rem" }}>Check in scheduled appointments or register walk-ins to add patients to waiting queue.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#475569", letterSpacing: "0.05em" }}>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Queue No.</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Patient Name</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Check-in Time</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Waiting Duration</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Doctor</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Reassign</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitingQueueList.map((q, idx) => (
                        <tr key={q.visitId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "12px 14px", fontWeight: 900, color: "#08AEB8", fontSize: "1.05rem" }}>
                            #{String(idx + 1).padStart(2, "0")}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{q.patientName}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{q.phone || q.patientCode}</div>
                          </td>
                          <td style={{ padding: "12px 14px", color: "#475569", fontWeight: 600 }}>
                            {formatISTTime(q.checkedInAt)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#d97706", fontWeight: 800 }}>
                            {calculateTimeDiff(q.checkedInAt, null)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#334155", fontWeight: 700 }}>
                            {q.doctorName}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) handleDoctorReassign(q.visitId, e.target.value);
                              }}
                              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.78rem", outline: "none", backgroundColor: "#ffffff" }}
                            >
                              <option value="" disabled>Reassign Doctor...</option>
                              {doctors.map(d => (
                                <option key={d.doctorId} value={d.doctorId}>{d.fullName}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ backgroundColor: "#fef3c7", color: "#d97706", padding: "4px 10px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                              WAITING
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SECTION 3: TODAY'S SCHEDULED APPOINTMENTS */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#08AEB8" }} />
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>3. Today's Scheduled Appointments</h3>
                  <span style={{ backgroundColor: "rgba(8,174,184,0.1)", color: "#08AEB8", padding: "3px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 800 }}>
                    {filteredAppointments.length} Scheduled
                  </span>
                </div>
                <button
                  onClick={fetchAppointments}
                  style={{ backgroundColor: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}
                >
                  <i className="fa-solid fa-rotate-right" /> Refresh
                </button>
              </div>

              {filteredAppointments.length === 0 ? (
                <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                  <i className="fa-solid fa-calendar-day" style={{ fontSize: "1.6rem", marginBottom: "8px", color: "#94a3b8", display: "block" }} />
                  <div style={{ fontWeight: 700, color: "#475569", fontSize: "0.9rem" }}>No Scheduled Appointments Today</div>
                  <span style={{ fontSize: "0.78rem" }}>Appointments will appear here when booked for today.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#475569", letterSpacing: "0.05em" }}>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Appt Time</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Patient Name</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Assigned Doctor</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Status</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAppointments.map(app => {
                        const isChecked = app.status === "checked_in" || app.visitStage === "waiting" || app.visitStage === "checked_in" || app.status === "in_consultation" || app.visitStage === "in_consultation";
                        const isComp = app.status === "completed" || app.visitStage === "completed";
                        const isExit = app.status === "exited" || app.visitStage === "exited";
                        const isCanc = app.status === "cancelled" || app.visitStage === "cancelled";
                        const isProcessed = isChecked || isComp || isExit || isCanc;

                        return (
                          <tr key={app.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 14px", fontWeight: 800, color: "#08AEB8" }}>
                              {app.appointmentTime || app.appointment_time || "Today"}
                            </td>
                            <td style={{ padding: "12px 14px", fontWeight: 800, color: "#0b1c2d" }}>
                              {app.patientName || app.patient_name || "Scheduled Patient"}
                            </td>
                            <td style={{ padding: "12px 14px", color: "#334155", fontWeight: 600 }}>
                              {app.doctorName || app.doctors?.full_name || "Assigned Doctor"}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <span style={{
                                backgroundColor: isComp ? "#dcfce7" : isChecked ? "#fef3c7" : "rgba(8,174,184,0.1)",
                                color: isComp ? "#16a34a" : isChecked ? "#d97706" : "#08AEB8",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontWeight: 800,
                                fontSize: "0.75rem",
                                textTransform: "uppercase"
                              }}>
                                {isComp ? "COMPLETED" : isChecked ? (app.visitStage === "in_consultation" ? "IN CONSULTATION" : "WAITING") : (app.status || "CONFIRMED")}
                              </span>
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              {isProcessed ? (
                                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: isComp ? "#16a34a" : isChecked ? "#d97706" : "#64748b" }}>
                                  <i className={`fa-solid ${isComp ? "fa-circle-check" : isChecked ? "fa-user-clock" : "fa-info-circle"}`} style={{ marginRight: "4px" }} />
                                  {isComp ? "Completed" : isChecked ? "Checked In" : app.status}
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleAppointmentCheckin(app.id)}
                                  style={{ backgroundColor: "#08AEB8", color: "#ffffff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}
                                >
                                  Check In Patient
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SECTION 4: COMPLETED TODAY */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#16a34a" }} />
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>4. Completed Today</h3>
                  <span style={{ backgroundColor: "#dcfce7", color: "#16a34a", padding: "3px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 800 }}>
                    {completedTodayList.length} Finished
                  </span>
                </div>
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Finished doctor consultations today</span>
              </div>

              {completedTodayList.length === 0 ? (
                <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                  <i className="fa-solid fa-circle-check" style={{ fontSize: "1.6rem", marginBottom: "8px", color: "#94a3b8", display: "block" }} />
                  <div style={{ fontWeight: 700, color: "#475569", fontSize: "0.9rem" }}>No Consultations Completed Yet</div>
                  <span style={{ fontSize: "0.78rem" }}>Completed consultations for today will automatically appear here.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#475569", letterSpacing: "0.05em" }}>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Patient Name</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Check-in Time</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Start Time</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Completed Time</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Consult Duration</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Assigned Doctor</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedTodayList.map(q => (
                        <tr key={q.visitId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{q.patientName}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{q.phone || q.patientCode}</div>
                          </td>
                          <td style={{ padding: "12px 14px", color: "#475569", fontWeight: 600 }}>
                            {formatISTTime(q.checkedInAt)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#0284c7", fontWeight: 600 }}>
                            {formatISTTime(q.consultationStartedAt)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#16a34a", fontWeight: 700 }}>
                            {formatISTTime(q.consultationCompletedAt)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#16a34a", fontWeight: 900 }}>
                            {calculateTimeDiff(q.consultationStartedAt, q.consultationCompletedAt)}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#334155", fontWeight: 700 }}>
                            {q.doctorName}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            {q.visitStage === "completed" ? (
                              <button
                                onClick={() => handleMarkExited(q.visitId)}
                                style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "5px 12px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              >
                                <i className="fa-solid fa-door-open" /> Mark Exit
                              </button>
                            ) : (
                              <span style={{ backgroundColor: "#f1f5f9", color: "#64748b", padding: "4px 10px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
                                Exited
                              </span>
                            )}
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

        {/* =========================================================================
            TAB 2: PATIENT OPERATIONS (/staff/patients)
        ========================================================================= */}
        {activeTab === "patients" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>

            {/* Header & Search Bar */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>Hospital Patient Records</h2>
                <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Search &amp; manage hospital-scoped patient records (HPR)</p>
              </div>

              <button
                onClick={() => setShowWalkinModal(true)}
                style={{ backgroundColor: "#08AEB8", color: "#ffffff", border: "none", padding: "10px 18px", borderRadius: "10px", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
              >
                <i className="fa-solid fa-user-plus" /> + Register New HPR
              </button>
            </div>

            {/* Search Input Box */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "20px 28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", gap: "12px" }}>
                <input
                  type="text"
                  placeholder="Search by Patient Name, Phone Number, or Hospital Patient Code (HPR)..."
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    fetchPatients(e.target.value);
                  }}
                  style={{ flex: 1, padding: "12px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.92rem", outline: "none" }}
                />
                <button
                  onClick={() => fetchPatients(patientSearch)}
                  style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "12px 24px", borderRadius: "10px", fontWeight: 700, cursor: "pointer" }}
                >
                  Search
                </button>
              </div>
            </div>

            {/* Patients Table */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              {patients.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  <i className="fa-solid fa-address-book" style={{ fontSize: "2.2rem", marginBottom: "12px", display: "block" }} />
                  <div style={{ fontWeight: 700, color: "#475569" }}>No Patient Records Found</div>
                  <span style={{ fontSize: "0.82rem" }}>Try adjusting your search criteria or register a new walk-in patient.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#475569", letterSpacing: "0.05em" }}>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>HPR Code</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Patient Name</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Phone Number</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Gender / DOB</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Type</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patients.map(p => (
                        <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "14px 16px", fontWeight: 800, color: "#08AEB8" }}>
                            {p.hospital_patient_code || "DV-HPR"}
                          </td>
                          <td style={{ padding: "14px 16px", fontWeight: 800, color: "#0b1c2d" }}>
                            {p.full_name}
                          </td>
                          <td style={{ padding: "14px 16px", color: "#475569", fontWeight: 600 }}>
                            {p.phone || "—"}
                          </td>
                          <td style={{ padding: "14px 16px", color: "#64748b" }}>
                            {p.gender || "—"} {p.date_of_birth ? `(${p.date_of_birth})` : ""}
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{ backgroundColor: "#f1f5f9", color: "#475569", padding: "4px 10px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
                              {p.registration_type || "Walk-in"}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <button
                              onClick={() => handleViewPatientDetail(p)}
                              style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                            >
                              <i className="fa-solid fa-eye" /> View History
                            </button>
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

        {/* =========================================================================
            TAB 3: APPOINTMENTS (/staff/appointments)
        ========================================================================= */}
        {activeTab === "appointments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>Today's Appointments</h2>
                <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Operational check-in desk for pre-booked appointments</p>
              </div>
              <button onClick={fetchAppointments} style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "10px 18px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }}>
                <i className="fa-solid fa-rotate-right" style={{ marginRight: "6px" }} /> Refresh List
              </button>
            </div>

            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              {appointments.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  <i className="fa-solid fa-calendar-xmark" style={{ fontSize: "2.2rem", marginBottom: "12px", display: "block" }} />
                  <div style={{ fontWeight: 700, color: "#475569" }}>No Appointments Scheduled Today</div>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#475569", letterSpacing: "0.05em" }}>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Time Slot</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Patient Name</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Doctor</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Type</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Status</th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.map(app => {
                        const isChecked = app.status === "checked_in" || app.status === "in_consultation";
                        const isComp = app.status === "completed";
                        const isExit = app.status === "exited";
                        const isCanc = app.status === "cancelled";
                        const isProcessed = isChecked || isComp || isExit || isCanc;

                        return (
                          <tr key={app.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "14px 16px", fontWeight: 800, color: "#08AEB8" }}>
                              {app.appointment_time || "Today"}
                            </td>
                            <td style={{ padding: "14px 16px", fontWeight: 800, color: "#0b1c2d" }}>
                              {app.patient_name || app.patientName || "Scheduled Patient"}
                            </td>
                            <td style={{ padding: "14px 16px", color: "#475569", fontWeight: 600 }}>
                              {app.doctorName || app.doctors?.full_name || "Assigned Doctor"}
                            </td>
                            <td style={{ padding: "14px 16px", color: "#64748b" }}>
                              {app.appointment_type || "Consultation"}
                            </td>
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{
                                backgroundColor: isComp ? "#dcfce7" : isChecked ? "#fef3c7" : "rgba(8,174,184,0.1)",
                                color: isComp ? "#16a34a" : isChecked ? "#d97706" : "#08AEB8",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontWeight: 800,
                                fontSize: "0.75rem",
                                textTransform: "uppercase"
                              }}>
                                {app.status || "CONFIRMED"}
                              </span>
                            </td>
                            <td style={{ padding: "14px 16px" }}>
                              {isProcessed ? (
                                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: isComp ? "#16a34a" : isChecked ? "#d97706" : "#64748b" }}>
                                  <i className={`fa-solid ${isComp ? "fa-circle-check" : isChecked ? "fa-user-clock" : "fa-info-circle"}`} style={{ marginRight: "4px" }} />
                                  {isComp ? "Completed" : isChecked ? "Checked In" : app.status}
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleAppointmentCheckin(app.id)}
                                  style={{ backgroundColor: "#08AEB8", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}
                                >
                                  Check In
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: CHECK-IN DESK (/staff/check-in)
        ========================================================================= */}
        {activeTab === "check-in" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>Patient Check-In Desk</h2>
              <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Fast-track reception check-in and queue token generation</p>
            </div>

            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Scheduled Appointments Ready for Arrival</h3>
              {appointments.length === 0 ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>No pending check-ins available.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                  {appointments.map(app => {
                    const isChecked = app.status === "waiting" || app.visitStage === "waiting" || app.status === "checked_in" || app.status === "in_consultation" || app.visitStage === "in_consultation";
                    const isComp = app.status === "completed" || app.visitStage === "completed";
                    const isProcessed = isChecked || isComp || app.status === "cancelled" || app.status === "exited";

                    return (
                      <div key={app.id} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", backgroundColor: "#f8fafc" }}>
                        <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0b1c2d" }}>{app.patient_name || app.patientName}</div>
                        <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>Time: {app.appointment_time || "Today"}</div>
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#08AEB8", marginTop: "4px" }}>
                          Doctor: {app.doctorName || app.doctors?.full_name || "Doctor"}
                        </div>
                        {isProcessed ? (
                          <div style={{ marginTop: "16px", padding: "8px 12px", borderRadius: "8px", backgroundColor: isComp ? "#dcfce7" : "#fef3c7", color: isComp ? "#16a34a" : "#d97706", fontWeight: 700, fontSize: "0.85rem", textAlign: "center" }}>
                            <i className={`fa-solid ${isComp ? "fa-circle-check" : "fa-user-clock"}`} style={{ marginRight: "6px" }} />
                            {isComp ? "Consultation Completed" : (app.status === "in_consultation" || app.visitStage === "in_consultation" ? "In Consultation" : "Waiting in Queue")}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAppointmentCheckin(app.id)}
                            style={{ marginTop: "16px", width: "100%", backgroundColor: "#08AEB8", color: "#ffffff", border: "none", padding: "10px", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Check In Patient Now
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: REDESIGNED PATIENT QUEUE MONITORING (/staff/queue)
        ========================================================================= */}
        {activeTab === "queue" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
            
            {/* 1. HEADER */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "20px 28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#0b1c2d" }}>Patient Queue</h2>
                  <span style={{ backgroundColor: "rgba(8,174,184,0.1)", color: "#08AEB8", padding: "4px 12px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 800 }}>
                    <i className="fa-solid fa-hospital" style={{ marginRight: "6px" }} /> {hospitalInfo?.name || "Vedika Hospital Context"} ({hospitalInfo?.code || "HOSP"})
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>Manage patients across different stages of consultation</p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                {/* Date Selector */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: "#f8fafc", padding: "6px 12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                  <i className="fa-solid fa-calendar-day" style={{ color: "#08AEB8", fontSize: "0.9rem" }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>Date:</span>
                  <input
                    type="date"
                    value={selectedQueueDate}
                    onChange={(e) => {
                      setSelectedQueueDate(e.target.value);
                      fetchQueue(e.target.value);
                    }}
                    style={{ border: "none", backgroundColor: "transparent", fontSize: "0.85rem", fontWeight: 800, color: "#0b1c2d", outline: "none", cursor: "pointer" }}
                  />
                  <button
                    onClick={() => {
                      const todayStr = new Date().toISOString().split("T")[0];
                      setSelectedQueueDate(todayStr);
                      fetchQueue(todayStr);
                    }}
                    style={{ border: "none", backgroundColor: "#08AEB8", color: "#ffffff", padding: "3px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                  >
                    Today
                  </button>
                </div>

                {/* Refresh Button */}
                <button
                  onClick={() => { fetchQueue(selectedQueueDate); fetchAppointments(); }}
                  style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <i className="fa-solid fa-arrows-rotate" /> Refresh
                </button>
              </div>
            </div>

            {/* 2. HORIZONTAL STATUS TABS WITH LIVE COUNTS */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "12px 16px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "max-content" }}>
                {[
                  { key: "all", label: "All Patients", count: queueCounts.all, icon: "fa-users" },
                  { key: "scheduled", label: "Scheduled", count: queueCounts.scheduled, icon: "fa-calendar-check" },
                  { key: "waiting", label: "Waiting", count: queueCounts.waiting, icon: "fa-clock" },
                  { key: "in_consultation", label: "In Consultation", count: queueCounts.inConsultation, icon: "fa-user-doctor" },
                  { key: "completed", label: "Completed", count: queueCounts.completed, icon: "fa-circle-check" },
                  { key: "cancelled", label: "Cancelled", count: queueCounts.cancelled, icon: "fa-ban" }
                ].map(tab => {
                  const isActive = activeQueueStatusTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveQueueStatusTab(tab.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 18px",
                        borderRadius: "10px",
                        border: "none",
                        fontSize: "0.85rem",
                        fontWeight: 800,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        backgroundColor: isActive ? "#08AEB8" : "transparent",
                        color: isActive ? "#ffffff" : "#475569"
                      }}
                    >
                      <i className={`fa-solid ${tab.icon}`} style={{ fontSize: "0.9rem", color: isActive ? "#ffffff" : "#64748b" }} />
                      <span>{tab.label}</span>
                      <span
                        style={{
                          backgroundColor: isActive ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                          color: isActive ? "#ffffff" : "#0b1c2d",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: 900
                        }}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. DOCTOR & SPECIALIZATION FILTERS + SEARCH */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "18px 24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", flex: 1 }}>
                {/* Specialization Filter */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Specialization:
                  </label>
                  <select
                    value={selectedSpecialization}
                    onChange={(e) => {
                      setSelectedSpecialization(e.target.value);
                      setSelectedDoctorFilter("all");
                    }}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: 700, color: "#0b1c2d", backgroundColor: "#f8fafc", outline: "none", minWidth: "180px" }}
                  >
                    <option value="all">All Specializations ({specializations.length})</option>
                    {specializations.map((spec) => (
                      <option key={spec} value={spec}>{spec}</option>
                    ))}
                  </select>
                </div>

                {/* Doctor Filter */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Doctor:
                  </label>
                  <select
                    value={selectedDoctorFilter}
                    onChange={(e) => setSelectedDoctorFilter(e.target.value)}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: 700, color: "#0b1c2d", backgroundColor: "#f8fafc", outline: "none", minWidth: "200px" }}
                  >
                    <option value="all">All Doctors ({filteredDoctorOptions.length})</option>
                    {filteredDoctorOptions.map((doc) => (
                      <option key={doc.doctorId} value={doc.doctorId}>
                        {doc.fullName} ({doc.specialization})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Patient Search Input */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative", minWidth: "240px", flex: 1 }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "12px", color: "#94a3b8", fontSize: "0.85rem" }} />
                  <input
                    type="text"
                    placeholder="Search patient name, phone, code, token..."
                    value={queueSearchText}
                    onChange={(e) => setQueueSearchText(e.target.value)}
                    style={{ padding: "8px 12px 8px 34px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", width: "100%", outline: "none", backgroundColor: "#f8fafc" }}
                  />
                  {queueSearchText && (
                    <button onClick={() => setQueueSearchText("")} style={{ position: "absolute", right: "10px", border: "none", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.8rem" }}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Doctor-wise Monitoring Overview Banner (if doctor selected) */}
            {selectedDoctorObj && (
              <div style={{ backgroundColor: "#f0f9ff", borderRadius: "12px", padding: "14px 20px", border: "1px solid #bae6fd", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "#0284c7", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.95rem" }}>
                    {(selectedDoctorObj.fullName || "D").charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#0369a1", fontSize: "0.95rem" }}>{selectedDoctorObj.fullName}</div>
                    <div style={{ fontSize: "0.78rem", color: "#0284c7" }}>{selectedDoctorObj.specialization} • Hospital Queue Scoped</div>
                  </div>
                </div>

                {/* Scoped Counts Summary */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>Scheduled: <b style={{ color: "#08AEB8" }}>{queueCounts.scheduled}</b></span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>Checked In: <b style={{ color: "#d97706" }}>{queueCounts.checkedIn}</b></span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>Waiting: <b style={{ color: "#d97706" }}>{queueCounts.waiting}</b></span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>In Consult: <b style={{ color: "#0284c7" }}>{queueCounts.inConsultation}</b></span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>Completed: <b style={{ color: "#16a34a" }}>{queueCounts.completed}</b></span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>Cancelled: <b style={{ color: "#dc2626" }}>{queueCounts.cancelled}</b></span>
                </div>
              </div>
            )}

            {/* 4. REUSABLE UNIFIED PATIENT TABLE */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "20px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              {displayedQueueRows.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                  <i className="fa-solid fa-hospital-user" style={{ fontSize: "2rem", marginBottom: "10px", color: "#cbd5e1", display: "block" }} />
                  <div style={{ fontWeight: 800, color: "#475569", fontSize: "0.95rem" }}>No Patients Found for Selected Filter</div>
                  <span style={{ fontSize: "0.8rem" }}>Try changing the active status tab, date, doctor, or clear your search input.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", textTransform: "uppercase", fontSize: "0.72rem", color: "#475569", letterSpacing: "0.05em" }}>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>#</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Patient</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Token / Visit ID</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Doctor & Specialization</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Appointment Time</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Status</th>
                        <th style={{ textAlign: "left", padding: "12px 14px" }}>Wait / Duration</th>
                        <th style={{ textAlign: "right", padding: "12px 14px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedQueueRows.map((item, idx) => {
                        const stage = (item.visitStage || item.status || "").toLowerCase();
                        const isScheduled = stage === "scheduled" || stage === "pending" || stage === "confirmed";
                        const isCheckedIn = stage === "checked_in";
                        const isWaiting = stage === "waiting";
                        const isInConsult = stage === "in_consultation";
                        const isCompleted = stage === "completed" || stage === "exited";
                        const isCancelled = stage === "cancelled";

                        // Status Badge Colors
                        let badgeBg = "rgba(8,174,184,0.1)";
                        let badgeColor = "#08AEB8";
                        let badgeText = "SCHEDULED";

                        if (isCheckedIn) {
                          badgeBg = "#fef3c7"; badgeColor = "#d97706"; badgeText = "CHECKED IN";
                        } else if (isWaiting) {
                          badgeBg = "#fef3c7"; badgeColor = "#d97706"; badgeText = "WAITING";
                        } else if (isInConsult) {
                          badgeBg = "#e0f2fe"; badgeColor = "#0284c7"; badgeText = "IN CONSULTATION";
                        } else if (isCompleted) {
                          badgeBg = "#dcfce7"; badgeColor = "#16a34a"; badgeText = "COMPLETED";
                        } else if (isCancelled) {
                          badgeBg = "#fee2e2"; badgeColor = "#dc2626"; badgeText = "CANCELLED";
                        }

                        // Time duration text
                        let durationText = "--";
                        if (isInConsult) {
                          durationText = calculateTimeDiff(item.consultationStartedAt, null);
                        } else if (isWaiting || isCheckedIn) {
                          durationText = calculateTimeDiff(item.checkedInAt, null);
                        } else if (isCompleted) {
                          durationText = calculateTimeDiff(item.consultationStartedAt, item.consultationCompletedAt);
                        }

                        const menuOpen = actionMenuOpenId === (item.id || item.visitId || item.appointmentId);

                        return (
                          <tr key={item.id || item.visitId || idx} style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: isInConsult ? "#f0f9ff" : "transparent" }}>
                            <td style={{ padding: "12px 14px", fontWeight: 800, color: "#08AEB8" }}>
                              #{String(item.tokenNumber || idx + 1).padStart(2, "0")}
                            </td>

                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#e2e8f0", color: "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.85rem" }}>
                                  {(item.patientName || "P").charAt(0)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.9rem" }}>
                                    {item.patientName}
                                  </div>
                                  <div style={{ fontSize: "0.75rem", color: "#64748b", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                                    <span>{item.phone || "--"}</span>
                                    <span>•</span>
                                    <span>{item.patientCode || item.hprCode || "Walk-in"}</span>
                                  </div>
                                  {/* Display updated vitals pills directly under patient info */}
                                  {(() => {
                                    const vts = item.intakeVitals || item.intake_vitals || item.vitals || {};
                                    const bp = vts.bp || vts.blood_pressure || vts.bloodPressure;
                                    const pulse = vts.pulse || vts.heart_rate || vts.heartRate;
                                    const temp = vts.temperature || vts.temp;
                                    const spo2 = vts.spo2;
                                    const weight = vts.weight;
                                    if (bp || pulse || temp || spo2 || weight) {
                                      return (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "5px" }}>
                                          {bp && <span style={{ fontSize: "0.7rem", backgroundColor: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>BP: {bp}</span>}
                                          {pulse && <span style={{ fontSize: "0.7rem", backgroundColor: "#fef3c7", color: "#b45309", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>Pulse: {pulse} bpm</span>}
                                          {temp && <span style={{ fontSize: "0.7rem", backgroundColor: "#fee2e2", color: "#b91c1c", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>Temp: {temp}°F</span>}
                                          {spo2 && <span style={{ fontSize: "0.7rem", backgroundColor: "#f0fdf4", color: "#15803d", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>SpO2: {spo2}%</span>}
                                          {weight && <span style={{ fontSize: "0.7rem", backgroundColor: "#f3e8ff", color: "#6b21a8", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>Wt: {weight}kg</span>}
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: "12px 14px", fontWeight: 700, color: "#475569" }}>
                              {item.tokenNumber ? `TOKEN #${item.tokenNumber}` : (item.visitId ? item.visitId.substring(0, 8) : "--")}
                            </td>

                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{item.doctorName || "Assigned Doctor"}</div>
                              <div style={{ fontSize: "0.74rem", color: "#08AEB8", fontWeight: 700 }}>{item.specialization || "General Medicine"}</div>
                            </td>

                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{item.appointmentTime || "Today"}</div>
                              <div style={{ fontSize: "0.74rem", color: "#64748b" }}>{formatReadableDate(item.appointmentDate || selectedQueueDate)}</div>
                            </td>

                            <td style={{ padding: "12px 14px" }}>
                              <span style={{ backgroundColor: badgeBg, color: badgeColor, padding: "4px 10px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                                {badgeText}
                              </span>
                            </td>

                            <td style={{ padding: "12px 14px", fontWeight: 800, color: isInConsult ? "#0284c7" : isWaiting ? "#d97706" : "#475569" }}>
                              {durationText}
                            </td>

                            <td style={{ padding: "12px 14px", textAlign: "right", position: "relative" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                {/* Primary Direct Button */}
                                {isScheduled && item.can_check_in !== false && (
                                  <button
                                    onClick={() => handleAppointmentCheckin(item.appointmentId || item.id)}
                                    style={{ backgroundColor: "#08AEB8", color: "#ffffff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                                  >
                                    Check In
                                  </button>
                                )}

                                {(() => {
                                  const vts = item.intakeVitals || item.intake_vitals || item.vitals || {};
                                  const hasVitals = Boolean(vts.bp || vts.pulse || vts.temperature || vts.spo2 || vts.weight || vts.height || vts.bloodGroup);
                                  return (
                                    <button
                                      onClick={() => handleOpenVitalsModal(item)}
                                      style={{
                                        backgroundColor: hasVitals ? "#ecfdf5" : "rgba(8,174,184,0.1)",
                                        color: hasVitals ? "#047857" : "#08AEB8",
                                        border: hasVitals ? "1px solid #a7f3d0" : "1px solid rgba(8,174,184,0.3)",
                                        padding: "6px 10px",
                                        borderRadius: "6px",
                                        fontSize: "0.78rem",
                                        fontWeight: 700,
                                        cursor: "pointer"
                                      }}
                                      title="View/Edit Patient Intake Vitals"
                                    >
                                      <i className={`fa-solid ${hasVitals ? "fa-circle-check" : "fa-heart-pulse"}`} style={{ marginRight: "4px" }} /> Vitals
                                    </button>
                                  );
                                })()}

                                <button
                                  onClick={() => handleOpenPatientDetails(item)}
                                  style={{ backgroundColor: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "6px 10px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                                >
                                  View
                                </button>

                                {/* Action Dropdown Menu Trigger [ ⋮ ] */}
                                <div style={{ position: "relative", display: "inline-block" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const keyId = item.id || item.visitId || item.appointmentId;
                                      setActionMenuOpenId(actionMenuOpenId === keyId ? null : keyId);
                                    }}
                                    style={{ backgroundColor: "transparent", border: "none", padding: "6px 8px", borderRadius: "6px", cursor: "pointer", color: "#475569", fontSize: "0.95rem" }}
                                  >
                                    <i className="fa-solid fa-ellipsis-vertical" />
                                  </button>

                                  {menuOpen && (
                                    <div style={{ position: "absolute", right: 0, top: "100%", marginTop: "4px", backgroundColor: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 100, minWidth: "160px", padding: "6px 0", textAlign: "left" }}>
                                      <button
                                        onClick={() => { setActionMenuOpenId(null); handleOpenPatientDetails(item); }}
                                        style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 14px", border: "none", background: "none", fontSize: "0.8rem", fontWeight: 700, color: "#334155", cursor: "pointer" }}
                                      >
                                        <i className="fa-solid fa-address-card" style={{ color: "#08AEB8" }} /> View Details
                                      </button>

                                      {isScheduled && (
                                        <button
                                          onClick={() => { setActionMenuOpenId(null); handleAppointmentCheckin(item.appointmentId || item.id); }}
                                          style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 14px", border: "none", background: "none", fontSize: "0.8rem", fontWeight: 700, color: "#334155", cursor: "pointer" }}
                                        >
                                          <i className="fa-solid fa-user-check" style={{ color: "#08AEB8" }} /> Check In Patient
                                        </button>
                                      )}

                                      {item.can_cancel !== false && !isCompleted && !isCancelled && (
                                        <button
                                          onClick={() => handleOpenCancelModal(item)}
                                          style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 14px", border: "none", background: "none", fontSize: "0.8rem", fontWeight: 700, color: "#d97706", cursor: "pointer" }}
                                        >
                                          <i className="fa-solid fa-ban" /> Cancel Appointment
                                        </button>
                                      )}

                                      {item.can_delete === true && (
                                        <button
                                          onClick={() => handleOpenDeleteModal(item)}
                                          style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 14px", border: "none", background: "none", fontSize: "0.8rem", fontWeight: 700, color: "#dc2626", cursor: "pointer" }}
                                        >
                                          <i className="fa-solid fa-trash-can" /> Delete Appointment
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* =========================================================================
            TAB 6: STAFF PROFILE (/staff/profile)
        ========================================================================= */}
        {activeTab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>Staff Profile</h2>
                <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Operational identity &amp; staff desk credentials</p>
              </div>
              <div style={{ backgroundColor: "rgba(8,174,184,0.1)", color: "#08AEB8", padding: "8px 16px", borderRadius: "10px", fontWeight: 800, fontSize: "0.85rem" }}>
                <i className="fa-solid fa-id-badge" style={{ marginRight: "6px" }} /> Reception Staff
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <h3 style={{ margin: "0 0 20px", fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                  Staff Credentials
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Full Name</div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0b1c2d", marginTop: "2px" }}>{staffName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Role &amp; Designation</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#08AEB8", marginTop: "2px" }}>Reception / Front Desk Staff</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Email Address</div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155", marginTop: "2px" }}>{currentUser?.email || "staff@doctorsvedika.com"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Account Status</div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#10b981", marginTop: "2px" }}>
                      <i className="fa-solid fa-circle-check" /> Active Staff Member
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <h3 style={{ margin: "0 0 20px", fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                  Hospital Affiliation
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Hospital Facility</div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0b1c2d", marginTop: "2px" }}>{hospitalInfo?.name || hospitalName || "Doctors Vedika Hospital"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Facility Code</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#08AEB8", marginTop: "2px" }}>{hospitalInfo?.code || "DV-HOSP"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Scope of Access</div>
                    <div style={{ fontSize: "0.88rem", color: "#475569", marginTop: "2px", lineHeight: 1.5 }}>
                      Operational walk-in patient registration, appointment check-in, live queue management.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 7: STAFF SETTINGS (/staff/settings)
        ========================================================================= */}
        {activeTab === "settings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px 32px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1c2d" }}>Staff Operations Settings</h2>
              <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#64748b" }}>Manage reception account security and operational preferences</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              {/* Change Password Card */}
              <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Security &amp; Password</h3>

                {pwdMsg.text && (
                  <div style={{ padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem", fontWeight: 700, backgroundColor: pwdMsg.type === "success" ? "#f0fdf4" : "#fef2f2", color: pwdMsg.type === "success" ? "#166534" : "#991b1b" }}>
                    {pwdMsg.text}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Current Password</label>
                    <input
                      type="password"
                      required
                      value={pwdCurrent}
                      onChange={(e) => setPwdCurrent(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>New Password</label>
                    <input
                      type="password"
                      required
                      value={pwdNew}
                      onChange={(e) => setPwdNew(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Confirm New Password</label>
                    <input
                      type="password"
                      required
                      value={pwdConfirm}
                      onChange={(e) => setPwdConfirm(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={pwdLoading}
                    style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "12px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", marginTop: "8px" }}
                  >
                    {pwdLoading ? "Updating..." : "Update Password"}
                  </button>
                </form>
              </div>

              {/* Isolation & Governance Card */}
              <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "28px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 800, color: "#0b1c2d" }}>Hospital Context Governance</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ padding: "16px", borderRadius: "10px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.9rem" }}>
                      <i className="fa-solid fa-hospital" style={{ color: "#08AEB8", marginRight: "6px" }} /> Strict Hospital Scoping
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
                      All patient records, queues, and appointments are strictly isolated to tenant context: <strong>{hospitalInfo?.name || hospitalInfo?.code || "Vedika Hospital"}</strong>.
                    </p>
                  </div>
                  <div style={{ padding: "16px", borderRadius: "10px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.9rem" }}>
                      <i className="fa-solid fa-user-lock" style={{ color: "#08AEB8", marginRight: "6px" }} /> Clinical Isolation Policy
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
                      Staff role accounts cannot open doctor clinical consultation workspaces, prescriptions, or AI summaries.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* =========================================================================
          MODAL 1: REGISTER WALK-IN PATIENT
      ========================================================================= */}
      {/* =========================================================================
          MODAL 1: REGISTER WALK-IN PATIENT
      ========================================================================= */}
      {showWalkinModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 4000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 20px 20px 20px", overflowY: "auto", boxSizing: "border-box" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "600px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "calc(100vh - 100px)", display: "flex", flexDirection: "column", margin: "0 auto" }}>

            <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Register Walk-in Patient</h3>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Search existing candidates or register a new HPR</span>
              </div>
              <button onClick={() => setShowWalkinModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px", overflowY: "auto" }}>

              {/* Step 1: Candidate Search */}
              <div style={{ backgroundColor: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Step 1: Check Existing Patient by Phone or Name
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Enter phone number or patient name..."
                    value={candidatePhoneQuery}
                    onChange={(e) => setCandidatePhoneQuery(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", outline: "none" }}
                  />
                  <button
                    type="button"
                    onClick={handleSearchCandidates}
                    disabled={isSearchingCandidates}
                    style={{ backgroundColor: "#08AEB8", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
                  >
                    {isSearchingCandidates ? "Searching..." : "Check Candidate"}
                  </button>
                </div>

                {candidates.length > 0 && (
                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Matching Existing HPR Candidates:</div>
                    {candidates.map(c => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCandidate(c)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: selectedCandidate?.id === c.id ? "2px solid #08AEB8" : "1px solid #cbd5e1",
                          backgroundColor: selectedCandidate?.id === c.id ? "rgba(8,174,184,0.08)" : "#ffffff",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.9rem" }}>{c.full_name}</div>
                          <div style={{ fontSize: "0.78rem", color: "#64748b" }}>Code: {c.hospital_patient_code} • Phone: {c.phone}</div>
                        </div>
                        <button
                          type="button"
                          style={{ backgroundColor: selectedCandidate?.id === c.id ? "#08AEB8" : "#f1f5f9", color: selectedCandidate?.id === c.id ? "#ffffff" : "#334155", border: "none", padding: "4px 10px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700 }}
                        >
                          {selectedCandidate?.id === c.id ? "Selected ✓" : "Select HPR"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 2: Patient Details Form */}
              <form onSubmit={handleWalkinSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>First Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh"
                      value={walkinFirstName}
                      onChange={(e) => setWalkinFirstName(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Last Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Rao"
                      value={walkinLastName}
                      onChange={(e) => setWalkinLastName(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Phone Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="+91 98765 43210"
                      value={walkinPhone}
                      onChange={(e) => setWalkinPhone(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Date of Birth (DOB) *</label>
                    <input
                      type="date"
                      required
                      max={new Date().toISOString().split("T")[0]}
                      value={walkinDob}
                      onChange={(e) => setWalkinDob(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Gender</label>
                    <select
                      value={walkinGender}
                      onChange={(e) => setWalkinGender(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#ffffff" }}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Assigned Doctor Selection */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Assign Doctor *</label>
                  <select
                    required
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#ffffff", fontWeight: 700 }}
                  >
                    <option value="" disabled>{isDoctorsLoading ? "Loading hospital doctors..." : doctors.length === 0 ? "No active doctors assigned to this hospital" : "Select Doctor..."}</option>
                    {doctors.map(d => (
                      <option key={d.doctorId} value={d.doctorId}>{d.fullName} — {d.specialization}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Chief Complaints / Visit Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Fever, Cough, Eye Pain..."
                    value={chiefComplaints}
                    onChange={(e) => setChiefComplaints(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>

                {/* OPTIONAL Initial Vitals Section */}
                <div style={{ backgroundColor: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#082b68", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <i className="fa-solid fa-heart-pulse" style={{ color: "#08AEB8" }} />
                    <span>Patient Intake Vitals <span style={{ fontWeight: 600, color: "#64748b", fontSize: "0.75rem" }}>(Optional - Staff can also edit later)</span></span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "#475569", marginBottom: "2px" }}>BP (mmHg)</label>
                      <input
                        type="text"
                        placeholder="120/80"
                        value={walkinVitals.bp}
                        onChange={(e) => setWalkinVitals(prev => ({ ...prev, bp: e.target.value }))}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "#475569", marginBottom: "2px" }}>Pulse (bpm)</label>
                      <input
                        type="text"
                        placeholder="72"
                        value={walkinVitals.pulse}
                        onChange={(e) => setWalkinVitals(prev => ({ ...prev, pulse: e.target.value }))}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "#475569", marginBottom: "2px" }}>Temp (°F)</label>
                      <input
                        type="text"
                        placeholder="98.6"
                        value={walkinVitals.temperature}
                        onChange={(e) => setWalkinVitals(prev => ({ ...prev, temperature: e.target.value }))}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "#475569", marginBottom: "2px" }}>Weight (kg)</label>
                      <input
                        type="text"
                        placeholder="65"
                        value={walkinVitals.weight}
                        onChange={(e) => setWalkinVitals(prev => ({ ...prev, weight: e.target.value }))}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setShowWalkinModal(false)}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWalkinSubmitWithAction("register_only")}
                    style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #08AEB8", backgroundColor: "#ffffff", color: "#08AEB8", fontWeight: 800, cursor: "pointer" }}
                  >
                    Register Only (Scheduled)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWalkinSubmitWithAction("register_and_checkin")}
                    style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#08AEB8", color: "#ffffff", fontWeight: 800, cursor: "pointer" }}
                  >
                    Register &amp; Check In Walk-in
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: PATIENT HISTORY DETAIL & CONVERSION MODAL
      ========================================================================= */}
      {showHprModal && selectedHprDetail && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 4000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 20px 20px 20px", overflowY: "auto", boxSizing: "border-box" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "680px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", margin: "0 auto" }}>
            <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>{selectedHprDetail.full_name}</h3>
                  <span style={{ fontSize: "0.72rem", fontWeight: 800, padding: "3px 10px", borderRadius: "12px", backgroundColor: selectedHprDetail.patient_id ? "#dcfce7" : "#fef3c7", color: selectedHprDetail.patient_id ? "#15803d" : "#b45309" }}>
                    {selectedHprDetail.patient_id ? "Registered Patient" : "Temporary Walk-in"}
                  </span>
                </div>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                  HPR Code: {selectedHprDetail.hospital_patient_code || selectedHprDetail.patientCode || "—"} • Phone: {selectedHprDetail.phone || "—"} {selectedHprDetail.gender ? `• ${selectedHprDetail.gender}` : ""} {selectedHprDetail.date_of_birth ? `• DOB: ${selectedHprDetail.date_of_birth}` : ""}
                </span>
              </div>
              <button onClick={() => setShowHprModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Permanent Conversion Banner if Temporary */}
              {!selectedHprDetail.patient_id && (
                <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1", backgroundColor: "rgba(8,174,184,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.92rem" }}>Temporary Hospital Patient</div>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>This patient exists only within this hospital. Convert to link across Doctors Vedika platform.</div>
                  </div>
                  <button
                    onClick={() => handleOpenConvertModal(selectedHprDetail)}
                    style={{ backgroundColor: "#08AEB8", color: "#ffffff", border: "none", padding: "8px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "0.8rem", cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Convert to Registered Patient
                  </button>
                </div>
              )}

              {/* Action Header & Schedule Appointment Button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1c2d" }}>
                  Visit &amp; Appointment History ({hprHistory.length})
                </h4>
                <button
                  onClick={() => {
                    setShowQuickScheduleForm(prev => !prev);
                    if (!quickSchedDoctorId && doctors.length > 0) {
                      setQuickSchedDoctorId(doctors[0].doctorId);
                    }
                  }}
                  style={{
                    backgroundColor: showQuickScheduleForm ? "#64748b" : "#08AEB8",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontWeight: 800,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <i className={`fa-solid ${showQuickScheduleForm ? "fa-xmark" : "fa-calendar-plus"}`} />
                  {showQuickScheduleForm ? "Cancel Scheduling" : "Schedule New Visit"}
                </button>
              </div>

              {/* Inline Quick Schedule Form for Existing Patient */}
              {showQuickScheduleForm && (
                <form
                  onSubmit={handleQuickScheduleSubmit}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid #08AEB8",
                    backgroundColor: "#f0fdfa",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px"
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#0f766e", fontSize: "0.9rem" }}>
                    📅 Schedule New Appointment / Book Visit for {selectedHprDetail.full_name}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                        Assigned Doctor *
                      </label>
                      <select
                        value={quickSchedDoctorId}
                        onChange={(e) => setQuickSchedDoctorId(e.target.value)}
                        required
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", outline: "none" }}
                      >
                        <option value="">-- Select Doctor --</option>
                        {doctors.map(doc => (
                          <option key={doc.doctorId} value={doc.doctorId}>
                            Dr. {doc.doctorName} ({doc.specialization})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                        Action Mode
                      </label>
                      <select
                        value={quickSchedActionType}
                        onChange={(e) => setQuickSchedActionType(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", outline: "none" }}
                      >
                        <option value="register_and_checkin">Check-in Now (Waiting Queue)</option>
                        <option value="register_only">Schedule Appointment (Scheduled)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                      Chief Complaints / Visit Reason
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Follow-up consultation, Fever, Routine checkup"
                      value={quickSchedReason}
                      onChange={(e) => setQuickSchedReason(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.82rem", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
                    <button
                      type="button"
                      onClick={() => setShowQuickScheduleForm(false)}
                      style={{ backgroundColor: "#e2e8f0", color: "#334155", border: "none", padding: "7px 14px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isQuickScheduling}
                      style={{ backgroundColor: "#08AEB8", color: "#ffffff", border: "none", padding: "7px 16px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 800, cursor: "pointer", opacity: isQuickScheduling ? 0.7 : 1 }}
                    >
                      {isQuickScheduling ? "Booking..." : "Confirm & Book Visit"}
                    </button>
                  </div>
                </form>
              )}

              {/* Visit & Appointment History List */}
              {hprHistory.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", backgroundColor: "#f8fafc", borderRadius: "10px", border: "1px dashed #cbd5e1" }}>
                  <i className="fa-solid fa-notes-medical" style={{ fontSize: "1.8rem", color: "#cbd5e1", marginBottom: "8px", display: "block" }} />
                  No past visits or appointments recorded for this patient.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {hprHistory.map(v => {
                    const stage = (v.visit_stage || v.status || "scheduled").toLowerCase();
                    let stageBg = "#fef3c7";
                    let stageColor = "#b45309";
                    if (stage === "completed" || stage === "exited") {
                      stageBg = "#dcfce7";
                      stageColor = "#15803d";
                    } else if (stage === "in_consultation" || stage === "waiting" || stage === "checked_in") {
                      stageBg = "#e0f2fe";
                      stageColor = "#0369a1";
                    } else if (stage === "cancelled") {
                      stageBg = "#fee2e2";
                      stageColor = "#b91c1c";
                    }

                    const docName = v.doctors?.full_name || v.doctors?.doctor_name || v.doctorName || "Assigned Doctor";
                    const docSpec = v.doctors?.doctor_specialization || v.specialization || "";
                    const dateDisplay = formatReadableDate(v.created_at || v.appointment_date || v.checked_in_at);
                    const vitals = v.intake_vitals || v.vitals || {};

                    return (
                      <div key={v.id} style={{ padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 800, color: "#08AEB8", fontSize: "0.85rem" }}>
                            📅 {dateDisplay} {v.appointment_time ? `• ${v.appointment_time}` : ""}
                          </span>
                          <span style={{ fontSize: "0.72rem", fontWeight: 800, padding: "3px 10px", borderRadius: "12px", backgroundColor: stageBg, color: stageColor }}>
                            {stage.toUpperCase().replace("_", " ")}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0b1c2d", marginTop: "6px" }}>
                          Doctor: Dr. {docName} {docSpec ? `(${docSpec})` : ""}
                        </div>

                        {v.chief_complaints && (
                          <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "4px" }}>
                            <strong>Reason/Complaints:</strong> {v.chief_complaints}
                          </div>
                        )}

                        {/* Vitals Summary Pill Badges */}
                        {(vitals.bp || vitals.pulse || vitals.temperature || vitals.spo2 || vitals.weight) && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                            {vitals.bp && <span style={{ fontSize: "0.72rem", backgroundColor: "#f1f5f9", color: "#334155", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>BP: {vitals.bp}</span>}
                            {vitals.pulse && <span style={{ fontSize: "0.72rem", backgroundColor: "#f1f5f9", color: "#334155", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>Pulse: {vitals.pulse} bpm</span>}
                            {vitals.temperature && <span style={{ fontSize: "0.72rem", backgroundColor: "#f1f5f9", color: "#334155", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>Temp: {vitals.temperature} °F</span>}
                            {vitals.spo2 && <span style={{ fontSize: "0.72rem", backgroundColor: "#f1f5f9", color: "#334155", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>SpO2: {vitals.spo2}%</span>}
                            {vitals.weight && <span style={{ fontSize: "0.72rem", backgroundColor: "#f1f5f9", color: "#334155", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>Weight: {vitals.weight} kg</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: CONVERT TEMPORARY TO PERMANENT PATIENT MODAL
      ========================================================================= */}
      {showConvertModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "520px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Convert to Doctors Vedika Patient</h3>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Create official platform patient account for {convertFullName}</span>
              </div>
              <button onClick={() => setShowConvertModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form onSubmit={handleConvertSubmit} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Patient Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. ramesh.rao@gmail.com"
                  value={convertEmail}
                  onChange={(e) => setConvertEmail(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Full Name</label>
                  <input
                    type="text"
                    required
                    value={convertFullName}
                    onChange={(e) => setConvertFullName(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Phone Number</label>
                  <input
                    type="text"
                    required
                    value={convertPhone}
                    onChange={(e) => setConvertPhone(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Gender</label>
                  <select
                    value={convertGender}
                    onChange={(e) => setConvertGender(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#ffffff" }}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Date of Birth</label>
                  <input
                    type="date"
                    value={convertDob}
                    onChange={(e) => setConvertDob(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Address</label>
                <input
                  type="text"
                  placeholder="e.g. Flat 102, Hyderabad"
                  value={convertAddress}
                  onChange={(e) => setConvertAddress(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowConvertModal(false)}
                  style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConverting}
                  style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#08AEB8", color: "#ffffff", fontWeight: 800, cursor: "pointer" }}
                >
                  {isConverting ? "Converting..." : "Complete Conversion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: EDIT PATIENT VITALS MODAL (HOSPITAL ISOLATED)
      ========================================================================= */}
      {showVitalsModal && editingVisit && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "520px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Update Patient Vitals</h3>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                  Patient: {editingVisit.patientName || "Walk-in Patient"} • Token #{editingVisit.token || "—"}
                </span>
              </div>
              <button onClick={() => setShowVitalsModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form onSubmit={handleSaveVitals} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Blood Pressure (BP)</label>
                  <input
                    type="text"
                    placeholder="e.g. 120/80 mmHg"
                    value={editVitalsData.bp}
                    onChange={(e) => setEditVitalsData(prev => ({ ...prev, bp: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Heart Rate / Pulse</label>
                  <input
                    type="text"
                    placeholder="e.g. 72 bpm"
                    value={editVitalsData.pulse}
                    onChange={(e) => setEditVitalsData(prev => ({ ...prev, pulse: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Temperature</label>
                  <input
                    type="text"
                    placeholder="e.g. 98.6 °F"
                    value={editVitalsData.temperature}
                    onChange={(e) => setEditVitalsData(prev => ({ ...prev, temperature: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>SpO2 (%)</label>
                  <input
                    type="text"
                    placeholder="e.g. 98%"
                    value={editVitalsData.spo2}
                    onChange={(e) => setEditVitalsData(prev => ({ ...prev, spo2: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Weight (kg)</label>
                  <input
                    type="text"
                    placeholder="e.g. 68"
                    value={editVitalsData.weight}
                    onChange={(e) => setEditVitalsData(prev => ({ ...prev, weight: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Height (cm)</label>
                  <input
                    type="text"
                    placeholder="e.g. 172"
                    value={editVitalsData.height}
                    onChange={(e) => setEditVitalsData(prev => ({ ...prev, height: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Blood Group</label>
                  <input
                    type="text"
                    placeholder="e.g. O+"
                    value={editVitalsData.bloodGroup}
                    onChange={(e) => setEditVitalsData(prev => ({ ...prev, bloodGroup: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Allergies / Special Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Penicillin allergy, Dust..."
                  value={editVitalsData.allergies}
                  onChange={(e) => setEditVitalsData(prev => ({ ...prev, allergies: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowVitalsModal(false)}
                  style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingVitals}
                  style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#08AEB8", color: "#ffffff", fontWeight: 800, cursor: "pointer" }}
                >
                  {isSavingVitals ? "Saving Vitals..." : "Save Vitals"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          SLIDE-OVER DRAWER: PATIENT DETAILS & OPERATIONAL CONTEXT
      ========================================================================= */}
      {showVisitDetailsDrawer && (
        <div
          onClick={() => setShowVisitDetailsDrawer(false)}
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.5)", backdropFilter: "blur(4px)", zIndex: 6000, display: "flex", justifyContent: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "540px", backgroundColor: "#ffffff", height: "100%", overflowY: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" }}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Patient Operational Context</h3>
                <span style={{ fontSize: "0.78rem", color: "#08AEB8", fontWeight: 700 }}>Hospital Reception & Queue Summary</span>
              </div>
              <button onClick={() => setShowVisitDetailsDrawer(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.3rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Body Content */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              {isLoadingVisitDetails ? (
                <div style={{ padding: "60px 20px", textAlign: "center", color: "#64748b" }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2rem", color: "#08AEB8", marginBottom: "12px", display: "block" }} />
                  <div style={{ fontWeight: 800, color: "#0b1c2d" }}>Fetching Patient Operational History...</div>
                </div>
              ) : selectedVisitDetails ? (
                <>
                  {/* CARD 1: PATIENT INFORMATION */}
                  <div style={{ backgroundColor: "#f8fafc", borderRadius: "12px", padding: "18px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#08AEB8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <i className="fa-solid fa-user-injured" /> PATIENT INFORMATION
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.85rem" }}>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Patient Name</div>
                        <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.95rem" }}>{selectedVisitDetails.patient?.fullName || "--"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Phone Number</div>
                        <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{selectedVisitDetails.patient?.phone || "--"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Patient Code / HPR Code</div>
                        <div style={{ fontWeight: 800, color: "#08AEB8" }}>{selectedVisitDetails.patient?.patientCode || "--"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Gender & DOB</div>
                        <div style={{ fontWeight: 700, color: "#334155" }}>
                          {selectedVisitDetails.patient?.gender || "--"} • {selectedVisitDetails.patient?.dateOfBirth ? formatReadableDate(selectedVisitDetails.patient.dateOfBirth) : "--"}
                        </div>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700, marginBottom: "4px" }}>Account Type</div>
                        {selectedVisitDetails.patient?.isWalkin ? (
                          <span style={{ backgroundColor: "#fef3c7", color: "#d97706", padding: "4px 10px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <i className="fa-solid fa-person-walking" /> Walk-in Patient (Patient Account: Not Registered)
                          </span>
                        ) : (
                          <span style={{ backgroundColor: "#dcfce7", color: "#16a34a", padding: "4px 10px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <i className="fa-solid fa-user-check" /> Registered Platform Account
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* CARD 2: APPOINTMENT INFORMATION */}
                  <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", padding: "18px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#08AEB8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <i className="fa-solid fa-calendar-check" /> APPOINTMENT INFORMATION
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.85rem" }}>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Appointment Date</div>
                        <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{formatReadableDate(selectedVisitDetails.appointment?.appointmentDate)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Appointment Time</div>
                        <div style={{ fontWeight: 900, color: "#08AEB8" }}>{selectedVisitDetails.appointment?.appointmentTime || "Walk-in (No scheduled time)"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Assigned Doctor</div>
                        <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{selectedVisitDetails.appointment?.doctorName || "--"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Specialization</div>
                        <div style={{ fontWeight: 700, color: "#334155" }}>{selectedVisitDetails.appointment?.specialization || "--"}</div>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Chief Complaints / Reason</div>
                        <div style={{ fontWeight: 700, color: "#475569", marginTop: "2px" }}>{selectedVisitDetails.appointment?.chiefComplaints || "--"}</div>
                      </div>
                    </div>
                  </div>

                  {/* CARD 3: VISIT & QUEUE STAGE INFORMATION */}
                  <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", padding: "18px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#08AEB8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <i className="fa-solid fa-stopwatch" /> VISIT & QUEUE STAGE INFORMATION
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.85rem" }}>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Visit ID</div>
                        <div style={{ fontWeight: 800, color: "#475569" }}>{selectedVisitDetails.visit?.visitId ? selectedVisitDetails.visit.visitId.substring(0, 10) : "--"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Visit Stage</div>
                        <div style={{ fontWeight: 800, color: "#08AEB8", textTransform: "uppercase" }}>{selectedVisitDetails.visit?.visitStage || "--"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Check-in Time</div>
                        <div style={{ fontWeight: 700, color: "#334155" }}>{formatISTTime(selectedVisitDetails.visit?.checkedInAt)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Consult Start Time</div>
                        <div style={{ fontWeight: 700, color: "#334155" }}>{formatISTTime(selectedVisitDetails.visit?.consultationStartedAt)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Consult Complete Time</div>
                        <div style={{ fontWeight: 700, color: "#334155" }}>{formatISTTime(selectedVisitDetails.visit?.consultationCompletedAt)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Waiting Time</div>
                        <div style={{ fontWeight: 800, color: "#d97706" }}>
                          {selectedVisitDetails.visit?.checkedInAt ? calculateTimeDiff(selectedVisitDetails.visit?.checkedInAt, selectedVisitDetails.visit?.consultationStartedAt) : "--"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Consultation Duration</div>
                        <div style={{ fontWeight: 800, color: "#08AEB8" }}>
                          {selectedVisitDetails.visit?.consultationStartedAt ? calculateTimeDiff(selectedVisitDetails.visit?.consultationStartedAt, selectedVisitDetails.visit?.consultationCompletedAt) : "--"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Total Visit Duration</div>
                        <div style={{ fontWeight: 800, color: "#16a34a" }}>
                          {selectedVisitDetails.visit?.checkedInAt ? calculateTimeDiff(selectedVisitDetails.visit?.checkedInAt, selectedVisitDetails.visit?.consultationCompletedAt) : "--"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD 4: HOSPITAL INFORMATION */}
                  <div style={{ backgroundColor: "#f8fafc", borderRadius: "12px", padding: "18px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#08AEB8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <i className="fa-solid fa-hospital" /> HOSPITAL INFORMATION
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.85rem" }}>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Hospital</div>
                        <div style={{ fontWeight: 800, color: "#0b1c2d" }}>{selectedVisitDetails.hospital?.hospitalName || "Doctors Vedika Main Hospital"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>HPR Code</div>
                        <div style={{ fontWeight: 800, color: "#08AEB8" }}>{selectedVisitDetails.hospital?.hprCode || "DV-MAIN-HPR"}</div>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <div style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 700 }}>Registration Type</div>
                        <div style={{ fontWeight: 700, color: "#334155" }}>{selectedVisitDetails.hospital?.registrationType || "ONLINE_APPOINTMENT"}</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>No detailed record found for this visit.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CANCEL APPOINTMENT CONFIRMATION
      ========================================================================= */}
      {cancelModalAppointment && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", width: "100%", maxWidth: "480px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "18px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>Cancel Appointment?</h3>
              <button onClick={() => setCancelModalAppointment(null)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form onSubmit={handleConfirmCancelAppointment} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ backgroundColor: "#fffbe8", borderRadius: "10px", padding: "14px", border: "1px solid #fef08a", fontSize: "0.85rem" }}>
                <div style={{ fontWeight: 800, color: "#b45309" }}>{cancelModalAppointment.patientName || "Patient"}</div>
                <div style={{ color: "#475569", marginTop: "2px" }}>Doctor: {cancelModalAppointment.doctorName || "Doctor"}</div>
                <div style={{ color: "#475569" }}>Time: {cancelModalAppointment.appointmentTime || "Today"} ({formatReadableDate(cancelModalAppointment.appointmentDate || selectedQueueDate)})</div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Cancellation Reason (Optional)</label>
                <textarea
                  placeholder="e.g. Patient requested reschedule, emergency, no-show..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setCancelModalAppointment(null)}
                  style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                >
                  Keep Appointment
                </button>
                <button
                  type="submit"
                  disabled={isActionSubmitting}
                  style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#d97706", color: "#ffffff", fontWeight: 800, cursor: "pointer" }}
                >
                  {isActionSubmitting ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: DELETE APPOINTMENT CONFIRMATION
      ========================================================================= */}
      {deleteModalAppointment && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", width: "100%", maxWidth: "480px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "18px 24px", backgroundColor: "#7f1d1d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>Delete Appointment?</h3>
              <button onClick={() => setDeleteModalAppointment(null)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ backgroundColor: "#fef2f2", borderRadius: "10px", padding: "14px", border: "1px solid #fecaca", fontSize: "0.85rem" }}>
                <div style={{ fontWeight: 800, color: "#991b1b" }}>Patient: {deleteModalAppointment.patientName || "Patient"}</div>
                <div style={{ color: "#7f1d1d", marginTop: "2px" }}>Doctor: {deleteModalAppointment.doctorName || "Doctor"}</div>
                <div style={{ color: "#7f1d1d" }}>Time: {deleteModalAppointment.appointmentTime || "Today"} ({formatReadableDate(deleteModalAppointment.appointmentDate || selectedQueueDate)})</div>
              </div>

              <div style={{ color: "#dc2626", fontSize: "0.82rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}>
                <i className="fa-solid fa-triangle-exclamation" /> WARNING: This action cannot be undone.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setDeleteModalAppointment(null)}
                  style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAppointment}
                  disabled={isActionSubmitting}
                  style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#dc2626", color: "#ffffff", fontWeight: 800, cursor: "pointer" }}
                >
                  {isActionSubmitting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: QR CLINICAL INTAKE DETAILS
      ========================================================================= */}
      {showQrDetailsModal && selectedQrIntake && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "18px", width: "100%", maxWidth: "600px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            
            <div style={{ padding: "18px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>QR Clinical Intake Details</h3>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Structured pre-consultation symptom assessment</span>
              </div>
              <button onClick={() => setShowQrDetailsModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
              {/* Patient Basic Info */}
              <div style={{ backgroundColor: "#f8fafc", padding: "14px 18px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                  {selectedQrIntake.patientName}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <span>Phone: {selectedQrIntake.phone}</span>
                  <span>DOB: {selectedQrIntake.dateOfBirth}</span>
                  <span>Gender: {selectedQrIntake.gender}</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "4px" }}>
                  Submitted: {selectedQrIntake.submittedAt ? new Date(selectedQrIntake.submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Recently"}
                </div>
              </div>

              {/* Clinical Intake Fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#08AEB8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Clinical Intake Summary
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "8px", fontSize: "0.9rem" }}>
                  <span style={{ fontWeight: 700, color: "#64748b" }}>Symptoms:</span>
                  <span style={{ color: "#0f172a", fontWeight: 600 }}>
                    {Array.isArray(selectedQrIntake.clinicalIntake?.symptoms) && selectedQrIntake.clinicalIntake.symptoms.length > 0
                      ? selectedQrIntake.clinicalIntake.symptoms.join(", ")
                      : "None recorded"}
                  </span>

                  <span style={{ fontWeight: 700, color: "#64748b" }}>Duration:</span>
                  <span style={{ color: "#0f172a" }}>{selectedQrIntake.clinicalIntake?.duration || "--"}</span>

                  <span style={{ fontWeight: 700, color: "#64748b" }}>Severity:</span>
                  <span style={{ color: "#0f172a" }}>{selectedQrIntake.clinicalIntake?.severity ? selectedQrIntake.clinicalIntake.severity.toUpperCase() : "--"}</span>

                  <span style={{ fontWeight: 700, color: "#64748b" }}>Location:</span>
                  <span style={{ color: "#0f172a" }}>{selectedQrIntake.clinicalIntake?.location || "--"}</span>

                  <span style={{ fontWeight: 700, color: "#64748b" }}>Recent Actions:</span>
                  <span style={{ color: "#0f172a" }}>{selectedQrIntake.clinicalIntake?.recent_actions || "--"}</span>

                  <span style={{ fontWeight: 700, color: "#64748b" }}>Medications:</span>
                  <span style={{ color: "#0f172a" }}>{selectedQrIntake.clinicalIntake?.current_medications || "--"}</span>

                  <span style={{ fontWeight: 700, color: "#64748b" }}>Patient Notes:</span>
                  <span style={{ color: "#0f172a" }}>{selectedQrIntake.clinicalIntake?.additional_notes || "--"}</span>

                  <span style={{ fontWeight: 700, color: "#64748b" }}>Safety Status:</span>
                  <span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        backgroundColor: selectedQrIntake.safetyStatus?.toLowerCase() === "caution" ? "#fef3c7" : "#ecfdf5",
                        color: selectedQrIntake.safetyStatus?.toLowerCase() === "caution" ? "#b45309" : "#047857"
                      }}
                    >
                      {selectedQrIntake.safetyStatus || "safe"}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div style={{ padding: "16px 24px", backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setShowQrDetailsModal(false)}
                style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleStartWalkinFromQr(selectedQrIntake)}
                style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#08AEB8", color: "#ffffff", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
              >
                <i className="fa-solid fa-user-plus" /> Proceed to Walk-in Registration
              </button>
            </div>

          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
