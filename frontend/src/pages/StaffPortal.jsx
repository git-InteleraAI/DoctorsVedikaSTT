import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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

  // Doctor & Shift Filter State
  const [selectedShiftFilter, setSelectedShiftFilter] = useState("all");
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState("all");

  const getTodayDateStr = () => {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  };

  const getDynamicGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning ☀️";
    if (hour < 17) return "Good Afternoon 🌤️";
    return "Good Evening 🌙";
  };

  // Redesigned Tab-Based Patient Queue State - Always defaults to current date
  const [selectedQueueDate, setSelectedQueueDate] = useState(() => getTodayDateStr());
  const selectedQueueDateRef = useRef(selectedQueueDate);

  useEffect(() => {
    selectedQueueDateRef.current = selectedQueueDate;
  }, [selectedQueueDate]);

  const handleDateChange = (newDate) => {
    const validDate = newDate || getTodayDateStr();
    setSelectedQueueDate(validDate);
    selectedQueueDateRef.current = validDate;
    fetchQueue(validDate);
    fetchAppointments(validDate);
    fetchStats(null, validDate);
  };

  const [activeQueueStatusTab, setActiveQueueStatusTab] = useState("all");
  const [queueSearchText, setQueueSearchText] = useState("");

  // Real-time Doctor Consultation Completion Popup Alert Queue
  const [completionAlertQueue, setCompletionAlertQueue] = useState([]);
  const previousQueueMapRef = useRef(new Map());
  const isInitialQueueFetchedRef = useRef(false);

  // Patient Details Drawer & Action Modal State
  const [selectedVisitDetails, setSelectedVisitDetails] = useState(null);
  const [showVisitDetailsDrawer, setShowVisitDetailsDrawer] = useState(false);
  const [isLoadingVisitDetails, setIsLoadingVisitDetails] = useState(false);

  const [cancelModalAppointment, setCancelModalAppointment] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteModalAppointment, setDeleteModalAppointment] = useState(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [actionMenuOpenId, setActionMenuOpenId] = useState(null);

  // Reschedule Modal State
  const [rescheduleModalAppointment, setRescheduleModalAppointment] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [rescheduleSubmitError, setRescheduleSubmitError] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);

  const parse12hTime = (timeStr) => {
    if (!timeStr) return 540;
    const str = String(timeStr).trim();
    const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return 540;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const period = match[3] ? match[3].toUpperCase() : null;
    if (period === "PM" && h < 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };

  const calculateAge = (dob) => {
    if (!dob) return "28 years";
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return dob;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return `${age} years`;
  };

  const [collapsedDoctors, setCollapsedDoctors] = useState({});

  const toggleDoctorCollapse = (doctorId) => {
    setCollapsedDoctors(prev => ({
      ...prev,
      [doctorId]: !prev[doctorId]
    }));
  };

  const isVitalsComplete = (vitalsObj) => {
    if (!vitalsObj) return false;
    const bp = vitalsObj.bp || vitalsObj.blood_pressure || vitalsObj.bloodPressure;
    const pulse = vitalsObj.pulse || vitalsObj.heart_rate || vitalsObj.heartRate;
    const temp = vitalsObj.temperature || vitalsObj.temp;
    const weight = vitalsObj.weight;
    const height = vitalsObj.height;
    const spo2 = vitalsObj.spo2;
    return Boolean(bp || pulse || temp || weight || height || spo2);
  };

  const handleNextPatient = async (docIdOverride = null) => {
    setIsActionSubmitting(true);
    try {
      const targetDocId = docIdOverride || selectedVisitDetails?.doctorId || selectedVisitDetails?.doctor_id || (selectedDoctorFilter !== "all" ? selectedDoctorFilter : (doctors[0]?.doctorId || doctors[0]?.id));
      const res = await fetch(`${API_BASE}/staff/queue/next`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ doctorId: targetDocId, appointmentDate: selectedQueueDate })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message || "Advanced queue to next waiting patient.", type: "success" });
        fetchQueue(selectedQueueDate);
        fetchStats();
        if (data.nextVisit) {
          handleOpenPatientDetails(data.nextVisit);
        } else {
          // Auto select next waiting patient from local queue
          const nextWaiting = queue.find(q =>
            (q.visitStage === "waiting" || q.visitStage === "checked_in") &&
            (targetDocId ? String(q.doctorId) === String(targetDocId) : true)
          );
          if (nextWaiting) {
            handleOpenPatientDetails(nextWaiting);
          }
        }
      } else {
        setMessage({ text: data.message || "No eligible waiting patient in queue.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: err.message || "Error advancing queue.", type: "error" });
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleOpenQrRegisterModal = (qrItem) => {
    setSelectedCandidate(null);
    setActiveQrSessionId(qrItem.qrSessionId || qrItem.id);
    const fullName = qrItem.patientName || qrItem.full_name || "";
    const nameParts = fullName.trim().split(" ");
    setWalkinFirstName(qrItem.firstName || nameParts[0] || "");
    setWalkinLastName(qrItem.lastName || nameParts.slice(1).join(" ") || "");
    setWalkinPhone(qrItem.phone || "");
    setWalkinGender(qrItem.gender ? (qrItem.gender.charAt(0).toUpperCase() + qrItem.gender.slice(1).toLowerCase()) : "Male");
    setWalkinDob(qrItem.dateOfBirth || qrItem.date_of_birth || "");
    setShowWalkinModal(true);
  };

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

  const filteredDoctorOptions = useMemo(() => {
    return doctors;
  }, [doctors]);

  const selectedDoctorObj = useMemo(() => {
    if (selectedDoctorFilter === "all") return null;
    return doctors.find(d => String(d.doctorId) === String(selectedDoctorFilter));
  }, [doctors, selectedDoctorFilter]);

  const filteredQueue = useMemo(() => {
    const activeDate = selectedQueueDateRef.current || selectedQueueDate;
    return queue.filter(q => {
      // Date filter - strictly match selected date if item has appointmentDate or date
      const itemDate = q.appointmentDate || q.appointment_date || q.date;
      if (itemDate && itemDate !== activeDate) {
        return false;
      }

      const matchDoc = selectedDoctorFilter === "all" || String(q.doctorId || q.doctor_id) === String(selectedDoctorFilter);
      const timeStr = q.appointmentTime || q.appointment_time || "09:00 AM";
      const mins = parse12hTime(timeStr);
      let matchShift = true;
      if (selectedShiftFilter === "morning") matchShift = mins < 960;
      else if (selectedShiftFilter === "evening") matchShift = mins >= 960;
      return matchDoc && matchShift;
    });
  }, [queue, selectedDoctorFilter, selectedShiftFilter, selectedQueueDate]);

  // Tab counts calculation based on current doctor/shift filter
  const queueCounts = useMemo(() => {
    let total = 0, scheduled = 0, waiting = 0, inConsultation = 0, completed = 0, cancelled = 0, pendingAssignment = 0;

    filteredQueue.forEach(item => {
      const isUnreg = item.isUnregisteredQr || item.status === "UNREGISTERED_QR" || item.visitStage === "qr_pending" || item.doctorId === "unassigned";
      if (isUnreg) {
        pendingAssignment++;
        return; // Unregistered QR intakes are NOT counted in registered appointments
      }

      const stage = (item.visitStage || item.status || "").toLowerCase();
      if (stage === "scheduled" || stage === "pending" || stage === "confirmed") {
        scheduled++;
        total++;
      } else if (stage === "waiting" || stage === "checked_in") {
        waiting++;
        total++;
      } else if (stage === "in_consultation") {
        inConsultation++;
        total++;
      } else if (stage === "completed" || stage === "exited") {
        completed++;
        total++;
      } else if (stage === "cancelled") {
        cancelled++;
      } else {
        waiting++;
        total++;
      }
    });

    return { total, all: total, scheduled, waiting, inConsultation, completed, cancelled, pendingAssignment };
  }, [filteredQueue]);

  // Reusable unified dataset for active status tab and search text
  const displayedQueueRows = useMemo(() => {
    return filteredQueue.filter(item => {
      const isUnreg = item.isUnregisteredQr || item.status === "UNREGISTERED_QR" || item.visitStage === "qr_pending" || item.doctorId === "unassigned";

      // If active tab is "pending_assignment", ONLY show unregistered QR patients
      if (activeQueueStatusTab === "pending_assignment") {
        return isUnreg;
      }

      // In regular tabs ("all", "waiting", "in_consultation", "completed", "scheduled"),
      // hide unregistered QR patients until staff registers them
      if (isUnreg) {
        return false;
      }

      const stage = (item.visitStage || item.status || "").toLowerCase();

      // In "all" tab, show all registered patients (waiting, in_consultation, completed, scheduled)
      if (activeQueueStatusTab === "all") {
        if (stage === "cancelled" || stage === "completed" || stage === "exited") return false;
      } else if (activeQueueStatusTab === "scheduled" && !(stage === "scheduled" || stage === "pending" || stage === "confirmed")) {
        return false;
      } else if (activeQueueStatusTab === "waiting" && !(stage === "waiting" || stage === "checked_in")) {
        return false;
      } else if (activeQueueStatusTab === "in_consultation" && stage !== "in_consultation") {
        return false;
      } else if (activeQueueStatusTab === "completed" && !(stage === "completed" || stage === "exited")) {
        return false;
      } else if (activeQueueStatusTab === "cancelled" && stage !== "cancelled") {
        return false;
      }

      if (queueSearchText.trim()) {
        const q = queueSearchText.trim().toLowerCase();
        const pName = (item.patientName || item.patient_name || "").toLowerCase();
        const pPhone = (item.phone || "").toLowerCase();
        const pCode = (item.patientCode || item.hprCode || "").toLowerCase();
        const docName = (item.doctorName || "").toLowerCase();
        const token = (item.tokenNumber || item.token_number || "").toLowerCase();

        return pName.includes(q) || pPhone.includes(q) || pCode.includes(q) || docName.includes(q) || token.includes(q);
      }

      return true;
    });
  }, [filteredQueue, activeQueueStatusTab, queueSearchText]);

  const getDoctorDynamicShifts = useCallback((docObj, dateStr) => {
    if (!dateStr) return null;
    let weekdayName = "Monday";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(utcDate);
    }

    const availList = docObj?.availability || [];
    const daySched = availList.find(s => s.day_of_week && s.day_of_week.trim().toLowerCase() === weekdayName.toLowerCase());

    if (!daySched || !daySched.is_available) return null;

    let windows = daySched.time_windows;
    if (typeof windows === "string") {
      try { windows = JSON.parse(windows); } catch (e) { windows = []; }
    }
    if (!Array.isArray(windows) || windows.length === 0) {
      if (daySched.start_time && daySched.end_time) {
        windows = [{ start_time: daySched.start_time, end_time: daySched.end_time }];
      }
    }

    if (!windows || windows.length === 0) return null;

    return windows.map((w, idx) => {
      const startMins = parse12hTime(w.start_time);
      const endMins = parse12hTime(w.end_time);
      const isEvening = startMins >= 960;
      return {
        key: `shift_${idx + 1}`,
        name: `Shift ${idx + 1} (${w.start_time} – ${w.end_time})`,
        icon: isEvening ? "🌙" : "☀️",
        startMins,
        endMins
      };
    });
  }, []);

  // Group displayed queue by doctor and active shift (Dynamically fetched per doctor schedule)
  const doctorGroupedQueue = useMemo(() => {
    const map = new Map();

    displayedQueueRows.forEach(item => {
      const docId = String(item.doctorId || item.doctor_id || "unassigned");
      const docName = item.doctorName || item.doctor_name || "Pending Assignment";
      const spec = item.specialization || "General Medicine";

      if (!map.has(docId)) {
        map.set(docId, {
          doctorId: docId,
          doctorName: docName,
          specialization: spec,
          patients: []
        });
      }
      map.get(docId).patients.push(item);
    });

    const result = [];
    map.forEach((docGroup) => {
      const isPending = docGroup.doctorId === "unassigned" || (docGroup.doctorName && docGroup.doctorName.toLowerCase().includes("pending assignment"));

      if (isPending) {
        result.push({
          ...docGroup,
          isUnassigned: true,
          shifts: [
            {
              key: "pending_direct",
              name: null,
              icon: null,
              patients: docGroup.patients
            }
          ],
          totalCount: docGroup.patients.length
        });
      } else {
        const docObj = doctors.find(d => String(d.doctorId) === String(docGroup.doctorId));
        const configuredShifts = getDoctorDynamicShifts(docObj, selectedQueueDateRef.current);

        if (configuredShifts && configuredShifts.length > 0) {
          const shiftMap = configuredShifts.map(s => ({ ...s, patients: [] }));

          docGroup.patients.forEach((patient) => {
            const timeStr = patient.appointmentTime || patient.appointment_time || "09:00 AM";
            const mins = parse12hTime(timeStr);
            const matchedShift = shiftMap.find(s => mins >= s.startMins && mins <= s.endMins);

            if (matchedShift) {
              matchedShift.patients.push(patient);
            } else if (shiftMap.length > 0) {
              let closest = shiftMap[0];
              let minDiff = Math.abs(mins - shiftMap[0].startMins);
              shiftMap.forEach(s => {
                const diff = Math.abs(mins - s.startMins);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = s;
                }
              });
              closest.patients.push(patient);
            }
          });

          const activeShifts = shiftMap.filter(s => s.patients.length > 0);
          if (activeShifts.length > 0) {
            result.push({
              ...docGroup,
              isUnassigned: false,
              shifts: activeShifts,
              totalCount: docGroup.patients.length
            });
          }
        } else {
          const morningPatients = [];
          const eveningPatients = [];

          docGroup.patients.forEach((patient) => {
            const timeStr = patient.appointmentTime || patient.appointment_time || "09:00 AM";
            const mins = parse12hTime(timeStr);
            if (mins < 960) {
              morningPatients.push(patient);
            } else {
              eveningPatients.push(patient);
            }
          });

          const shifts = [];
          if (morningPatients.length > 0) {
            shifts.push({
              key: "shift_1",
              name: "Shift 1 (09:00 AM – 01:00 PM)",
              icon: "☀️",
              patients: morningPatients
            });
          }
          if (eveningPatients.length > 0) {
            shifts.push({
              key: "shift_2",
              name: "Shift 2 (05:00 PM – 09:00 PM)",
              icon: "🌙",
              patients: eveningPatients
            });
          }

          if (shifts.length > 0) {
            result.push({
              ...docGroup,
              isUnassigned: false,
              shifts,
              totalCount: docGroup.patients.length
            });
          }
        }
      }
    });

    return result;
  }, [displayedQueueRows, doctors, getDoctorDynamicShifts]);

  const dynamicShiftOptions = useMemo(() => {
    const shiftMap = new Map();
    doctorGroupedQueue.forEach(docGroup => {
      if (!docGroup.isUnassigned && Array.isArray(docGroup.shifts)) {
        docGroup.shifts.forEach(shift => {
          if (shift.key && shift.name && !shiftMap.has(shift.key)) {
            shiftMap.set(shift.key, shift.name);
          }
        });
      }
    });

    if (shiftMap.size === 0) {
      shiftMap.set("shift_1", "Shift 1 (09:00 AM – 01:00 PM)");
      shiftMap.set("shift_2", "Shift 2 (05:00 PM – 09:00 PM)");
    }

    return Array.from(shiftMap.entries()).map(([key, name]) => ({ key, name }));
  }, [doctorGroupedQueue]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter(app => {
      const matchDoc = selectedDoctorFilter === "all" || String(app.doctorId || app.doctor_id) === String(selectedDoctorFilter);
      const timeStr = app.appointmentTime || app.appointment_time || "09:00 AM";
      const mins = parse12hTime(timeStr);
      let matchShift = true;
      if (selectedShiftFilter === "morning") matchShift = mins < 960;
      else if (selectedShiftFilter === "evening") matchShift = mins >= 960;
      return matchDoc && matchShift;
    });
  }, [appointments, selectedDoctorFilter, selectedShiftFilter]);

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
  const [isWalkinSubmitting, setIsWalkinSubmitting] = useState(false);
  const [walkinFirstName, setWalkinFirstName] = useState("");
  const [walkinLastName, setWalkinLastName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");
  const [walkinGender, setWalkinGender] = useState("Male");
  const [walkinDob, setWalkinDob] = useState("");
  const [dobMode, setDobMode] = useState("picker"); // "picker" | "text"
  const [walkinDobText, setWalkinDobText] = useState("");

  const parseManualDob = (input) => {
    if (!input || typeof input !== "string") return "";
    const trimmed = input.trim();
    if (!trimmed) return "";
    const ageMatch = trimmed.match(/^(\d{1,3})\s*(y|yrs|years|year|y\/o)?$/i);
    if (ageMatch) {
      const age = parseInt(ageMatch[1], 10);
      if (age >= 0 && age <= 120) {
        const currentYear = new Date().getFullYear();
        const birthYear = currentYear - age;
        return `${birthYear}-01-01`;
      }
    }
    const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyyMatch) {
      const day = ddmmyyyyMatch[1].padStart(2, '0');
      const month = ddmmyyyyMatch[2].padStart(2, '0');
      const year = ddmmyyyyMatch[3];
      return `${year}-${month}-${day}`;
    }
    const yyyymmddMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (yyyymmddMatch) {
      const year = yyyymmddMatch[1];
      const month = yyyymmddMatch[2].padStart(2, '0');
      const day = yyyymmddMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return trimmed;
  };
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [walkinDate, setWalkinDate] = useState("");
  const [walkinShift, setWalkinShift] = useState("");
  const [doctorAvailability, setDoctorAvailability] = useState(null);
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);
  const [availableShifts, setAvailableShifts] = useState([]);
  const [walkinDateStatus, setWalkinDateStatus] = useState(null);
  const [walkinModalError, setWalkinModalError] = useState("");
  const doctorAvailabilityReqRef = useRef(0);
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
  const [lastQrStatuses, setLastQrStatuses] = useState({});

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
      hospitalInfo?.id ||
      currentUser?.hospitalId ||
      currentUser?.hospital_id ||
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
  // Data Fetching Effects & Modal Reset on Navigation
  // -------------------------------------------------------------------------
  useEffect(() => {
    setShowWalkinModal(false);
    setShowVitalsModal(false);
    setShowHprModal(false);
    setShowQuickScheduleForm(false);
    setShowConvertModal(false);
    setShowVisitDetailsDrawer(false);
    setCancelModalAppointment(null);
    setDeleteModalAppointment(null);
    setActionMenuOpenId(null);
  }, [activeTab]);

  useEffect(() => {
    if (authLoading || !currentUser) {
      return;
    }

    fetchAllData();

    // Fast 2-second polling for real-time queue & stage updates
    const interval = setInterval(() => {
      fetchStats();
      fetchQueue();
      fetchAppointments();
      fetchQrIntakes();
    }, 2000);

    const handleStorageUpdate = (e) => {
      if (!e || e.key === "doctors_vedika_queue_updated") {
        fetchStats();
        fetchQueue();
        fetchAppointments();
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



  const evaluateDateAvailability = (dateStr, availObj = doctorAvailability) => {
    setWalkinModalError("");

    if (!dateStr) {
      setAvailableShifts([]);
      setWalkinShift("");
      setWalkinDateStatus(null);
      return;
    }

    const todayKolkataStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    if (dateStr < todayKolkataStr) {
      setWalkinDateStatus({ isAvailable: false, message: "Past date selected", subtext: "Registration date cannot be in the past." });
      setAvailableShifts([]);
      setWalkinShift("");
      return;
    }

    if (availObj?.blockedDates && availObj.blockedDates.length > 0) {
      const blocked = availObj.blockedDates.find(b => b.blocked_date === dateStr);
      if (blocked) {
        setWalkinDateStatus({ isAvailable: false, message: "Doctor is on leave on this date", subtext: blocked.reason || "Doctor has blocked this date." });
        setAvailableShifts([]);
        setWalkinShift("");
        return;
      }
    }

    let weekdayName = "Monday";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(utcDate);
    }

    if (!availObj?.availability || availObj.availability.length === 0) {
      setWalkinDateStatus({ isAvailable: false, message: "No schedule configured", subtext: `No schedule found for doctor on ${weekdayName}s.` });
      setAvailableShifts([]);
      setWalkinShift("");
      return;
    }

    const daySched = availObj.availability.find(
      s => s.day_of_week && s.day_of_week.trim().toLowerCase() === weekdayName.toLowerCase()
    );

    if (!daySched || !daySched.is_available) {
      setWalkinDateStatus({ isAvailable: false, message: "Doctor is on leave / not consulting", subtext: `Doctor does not consult on ${weekdayName}s.` });
      setAvailableShifts([]);
      setWalkinShift("");
      return;
    }

    let windows = daySched.time_windows;
    if (typeof windows === "string") {
      try { windows = JSON.parse(windows); } catch (e) { windows = []; }
    }
    if (!Array.isArray(windows) || windows.length === 0) {
      if (daySched.start_time && daySched.end_time) {
        windows = [{ start_time: daySched.start_time, end_time: daySched.end_time }];
      }
    }

    if (!windows || windows.length === 0) {
      setWalkinDateStatus({ isAvailable: false, message: "No available shifts", subtext: `No shifts configured for ${weekdayName}.` });
      setAvailableShifts([]);
      setWalkinShift("");
      return;
    }

    const nowKolkata = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentMins = nowKolkata.getHours() * 60 + nowKolkata.getMinutes();
    const isToday = dateStr === todayKolkataStr;

    const shifts = windows.map((w, idx) => {
      const startMins = parse12hTime(w.start_time);
      const endMins = parse12hTime(w.end_time);
      const isEvening = startMins >= 960;
      const isPassed = isToday && currentMins >= endMins;
      return {
        id: idx + 1,
        name: `Shift ${idx + 1}`,
        time: `${w.start_time} - ${w.end_time}`,
        icon: isEvening ? "moon" : "sun",
        isPassed
      };
    });

    setAvailableShifts(shifts);
    const firstValid = shifts.find(s => !s.isPassed);
    if (firstValid) {
      setWalkinShift(firstValid.time);
      setWalkinDateStatus({
        isAvailable: true,
        message: "Doctor is available on this date",
        subtext: `${shifts.filter(s => !s.isPassed).length} active shift(s) available`
      });
    } else if (shifts.length > 0) {
      setWalkinShift("");
      setWalkinDateStatus({
        isAvailable: false,
        message: "Shifts for today have ended",
        subtext: "All consulting shifts for today have already passed."
      });
    } else {
      setWalkinShift("");
      setWalkinDateStatus({
        isAvailable: false,
        message: "No available shifts",
        subtext: "No consulting shifts configured."
      });
    }
  };

  // Fetch doctor availability when selectedDoctorId changes or modal opens
  const fetchDoctorAvailability = async (docId, initialDate = null) => {
    if (!docId) {
      setDoctorAvailability(null);
      setAvailableShifts([]);
      setWalkinShift("");
      setWalkinDateStatus(null);
      return;
    }
    setIsAvailabilityLoading(true);
    const reqId = ++doctorAvailabilityReqRef.current;

    try {
      const res = await fetch(`${API_BASE}/staff/doctors/${docId}/availability`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (reqId !== doctorAvailabilityReqRef.current) return;

      if (data.success) {
        const availObj = {
          availability: data.availability || [],
          blockedDates: data.blockedDates || []
        };
        setDoctorAvailability(availObj);
        const targetDate = initialDate || walkinDate || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
        setWalkinDate(targetDate);
        evaluateDateAvailability(targetDate, availObj);
      } else {
        setDoctorAvailability(null);
        setAvailableShifts([]);
        setWalkinShift("");
        setWalkinDateStatus({ isAvailable: false, message: "Failed to load schedule", subtext: data.message || "Could not fetch availability." });
      }
    } catch (err) {
      if (reqId !== doctorAvailabilityReqRef.current) return;
      setDoctorAvailability(null);
      setAvailableShifts([]);
      setWalkinShift("");
      setWalkinDateStatus({ isAvailable: false, message: "Connection error", subtext: err.message || "Failed to connect to backend." });
    } finally {
      if (reqId === doctorAvailabilityReqRef.current) {
        setIsAvailabilityLoading(false);
      }
    }
  };

  useEffect(() => {
    if (showWalkinModal && selectedDoctorId) {
      const todayKolkataStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      setWalkinDate(todayKolkataStr);
      fetchDoctorAvailability(selectedDoctorId, todayKolkataStr);
    }
  }, [selectedDoctorId, showWalkinModal]);

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
        fetchAppointments(selectedQueueDateRef.current),
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

  const fetchStats = async (overrideHospId, targetDate = null) => {
    try {
      const targetHospId = overrideHospId || hospitalInfo?.id || currentUser?.hospitalId || currentUser?.hospital_id || localStorage.getItem("doctors_vedika_hospital_id");
      const headers = getAuthHeaders();
      if (targetHospId && targetHospId !== "null" && targetHospId !== "undefined") {
        headers["X-Hospital-Id"] = targetHospId;
      }
      const activeDate = targetDate || selectedQueueDateRef.current || getTodayDateStr();
      const res = await fetch(`${API_BASE}/staff/dashboard-stats?date=${encodeURIComponent(activeDate)}&_t=${Date.now()}`, { headers });
      if (!res.ok) return;
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

      if (!response.ok) {
        console.error(
          "[StaffPortal] Doctor API failed:",
          response.status
        );
        return;
      }

      const data = await response.json();
      console.log("[STAFF DOCTORS] RESPONSE", data);

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

  const fetchQueue = async (targetDate = null) => {
    const activeDate = targetDate || selectedQueueDateRef.current || getTodayDateStr();
    try {
      const targetHospId = hospitalInfo?.id || currentUser?.hospitalId || currentUser?.hospital_id || localStorage.getItem("doctors_vedika_hospital_id");
      const headers = getAuthHeaders();
      if (targetHospId && targetHospId !== "null" && targetHospId !== "undefined") {
        headers["X-Hospital-Id"] = targetHospId;
      }
      const sep = activeDate ? "&" : "?";
      const url = `${API_BASE}/staff/queue${activeDate ? `?date=${encodeURIComponent(activeDate)}` : ""}${sep}_t=${Date.now()}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.queue)) {
        const incomingQueue = data.queue;

        if (isInitialQueueFetchedRef.current) {
          const newAlerts = [];
          incomingQueue.forEach(item => {
            const itemId = String(item.id || item.visitId || item.appointmentId);
            const currentStage = String(item.visitStage || item.status || "").toLowerCase();
            const prevStage = previousQueueMapRef.current.get(itemId);

            // Detect when any doctor in the hospital completes a consultation
            if (
              prevStage &&
              (prevStage === "in_consultation" || prevStage === "waiting" || prevStage === "checked_in") &&
              (currentStage === "completed" || currentStage === "exited")
            ) {
              newAlerts.push({
                id: itemId + "_" + Date.now(),
                doctorId: item.doctorId || item.doctor_id,
                doctorName: item.doctorName || item.doctor_name || "Doctor",
                patientName: item.patientName || item.patient_name || item.full_name || "Patient",
                tokenNumber: item.tokenNumber || item.token_number || item.token || "001",
                completedAt: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
              });
            }
          });

          if (newAlerts.length > 0) {
            setCompletionAlertQueue(prev => [...prev, ...newAlerts]);
          }
        }

        // Update tracking map for next polling check
        const newMap = new Map();
        incomingQueue.forEach(item => {
          const itemId = String(item.id || item.visitId || item.appointmentId);
          const stage = String(item.visitStage || item.status || "").toLowerCase();
          newMap.set(itemId, stage);
        });
        previousQueueMapRef.current = newMap;
        isInitialQueueFetchedRef.current = true;

        setQueue(incomingQueue);
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
        try {
          localStorage.setItem("doctors_vedika_queue_updated", String(Date.now()));
          window.dispatchEvent(new Event("storage"));
        } catch (evtErr) {
          console.warn("Storage event error:", evtErr);
        }
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

  // Reschedule Handlers & Slot Availability Fetching
  const handleOpenRescheduleModal = (item) => {
    const apptDate = item.appointmentDate || item.appointment_date || selectedQueueDate || new Date().toISOString().split("T")[0];
    const apptTime = item.appointmentTime || item.appointment_time || "";
    const docId = item.doctorId || item.doctor_id || (doctors && doctors.length > 0 ? (doctors[0].doctorId || doctors[0].id) : "");

    setRescheduleModalAppointment(item);
    setRescheduleDate(apptDate);
    setRescheduleTime(apptTime);
    setRescheduleReason("");
    setRescheduleDoctorId(docId);
    setAvailableSlots([]);
    setSlotsError("");
    setRescheduleSubmitError("");
    setActionMenuOpenId(null);
  };

  const fetchRescheduleSlots = async (targetDate, targetDoctorId) => {
    if (!targetDate || !targetDoctorId) {
      setAvailableSlots([]);
      return;
    }
    setIsSlotsLoading(true);
    setSlotsError("");
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/availability/slots?date=${encodeURIComponent(targetDate)}&doctorId=${encodeURIComponent(targetDoctorId)}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.available && Array.isArray(data.slots)) {
        setAvailableSlots(data.slots);
      } else if (data.success && data.available === false) {
        setAvailableSlots([]);
        setSlotsError(data.reason || `Doctor unavailable on ${targetDate}`);
      } else {
        setAvailableSlots([]);
        setSlotsError(data.message || data.reason || "Failed to load slots for selected date.");
      }
    } catch (err) {
      console.error("Error fetching reschedule slots:", err);
      setAvailableSlots([]);
      setSlotsError("Could not fetch slot availability.");
    } finally {
      setIsSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (rescheduleModalAppointment && rescheduleDate && rescheduleDoctorId) {
      fetchRescheduleSlots(rescheduleDate, rescheduleDoctorId);
    }
  }, [rescheduleModalAppointment, rescheduleDate, rescheduleDoctorId]);

  const handleConfirmRescheduleAppointment = async (e) => {
    e?.preventDefault();
    if (!rescheduleModalAppointment) return;
    if (!rescheduleDate || !rescheduleTime) {
      setRescheduleSubmitError("Please select a date and an available time slot.");
      return;
    }

    setIsActionSubmitting(true);
    setRescheduleSubmitError("");

    try {
      const apptId = rescheduleModalAppointment.appointmentId || rescheduleModalAppointment.id;
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/appointments/${apptId}/reschedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          newDate: rescheduleDate,
          newTime: rescheduleTime,
          reason: rescheduleReason
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({
          text: data.message || `Appointment rescheduled to ${rescheduleDate} at ${rescheduleTime} successfully.`,
          type: "success"
        });
        setRescheduleModalAppointment(null);

        try {
          localStorage.setItem("doctors_vedika_queue_updated", String(Date.now()));
          window.dispatchEvent(new Event("storage"));
        } catch (evtErr) {
          console.warn("Storage event error:", evtErr);
        }

        fetchQueue(selectedQueueDate);
        fetchAppointments();
      } else {
        setRescheduleSubmitError(data.message || "Failed to reschedule appointment.");
      }
    } catch (err) {
      console.error("Reschedule submit error:", err);
      setRescheduleSubmitError(err.message || "An error occurred while rescheduling.");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const fetchAppointments = async (targetDate = null) => {
    const activeDate = targetDate || selectedQueueDateRef.current || getTodayDateStr();
    try {
      const targetHospId = hospitalInfo?.id || currentUser?.hospitalId || currentUser?.hospital_id || localStorage.getItem("doctors_vedika_hospital_id");
      const headers = getAuthHeaders();
      if (targetHospId && targetHospId !== "null" && targetHospId !== "undefined") {
        headers["X-Hospital-Id"] = targetHospId;
      }
      const url = `${API_BASE}/staff/appointments?date=${encodeURIComponent(activeDate)}&_t=${Date.now()}`;
      const res = await fetch(url, { headers });
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
      const res = await fetch(
        `${API_BASE}/staff/qr-intakes?_t=${Date.now()}`,
        { headers: getAuthHeaders() }
      );

      const data = await res.json();

      if (data.success && Array.isArray(data.intakes)) {
        const incomingIntakes = data.intakes;

        const currentStatuses = {};
        incomingIntakes.forEach((intake) => {
          currentStatuses[intake.id] = String(
            intake?.status || ""
          ).toLowerCase();
        });

        // Detect newly created QR sessions.
        const isInitialLoad = lastNotifiedQrCount === 0;

        if (
          !isInitialLoad &&
          incomingIntakes.length > lastNotifiedQrCount
        ) {
          const newestIntake = incomingIntakes[0];
          const newestStatus = String(
            newestIntake?.status || ""
          ).toLowerCase();

          let notificationText =
            `New QR patient: ${newestIntake?.patientName || "Patient"}`;

          if (newestStatus === "collecting") {
            notificationText +=
              " has registered and symptoms are still pending.";
          } else if (newestStatus === "review") {
            notificationText +=
              " is currently completing the symptom assessment.";
          } else if (newestStatus === "submitted") {
            notificationText +=
              " has submitted their symptoms.";
          } else if (newestStatus === "safety_blocked") {
            notificationText +=
              " requires urgent clinical attention.";
          }

          setMessage({
            text: notificationText,
            type:
              newestStatus === "safety_blocked"
                ? "error"
                : "success"
          });
        }

        // Detect lifecycle status changes for existing QR patients.
        if (!isInitialLoad) {
          for (const intake of incomingIntakes) {
            const previousStatus = lastQrStatuses[intake.id];
            const currentStatus = currentStatuses[intake.id];

            if (
              previousStatus &&
              previousStatus !== currentStatus
            ) {
              let notificationText = "";
              let notificationType = "success";

              if (currentStatus === "review") {
                notificationText =
                  `${intake.patientName || "Patient"} is now completing the symptom assessment.`;
              } else if (currentStatus === "submitted") {
                notificationText =
                  `${intake.patientName || "Patient"} has submitted their symptoms.`;
              } else if (currentStatus === "safety_blocked") {
                notificationText =
                  `${intake.patientName || "Patient"} requires urgent clinical attention.`;
                notificationType = "error";
              } else if (currentStatus === "collecting") {
                notificationText =
                  `${intake.patientName || "Patient"} is registered but symptoms are still pending.`;
              }

              if (notificationText) {
                setMessage({
                  text: notificationText,
                  type: notificationType
                });
              }

              break;
            }
          }
        }

        setQrIntakes(incomingIntakes);
        setLastNotifiedQrCount(incomingIntakes.length);
        setLastQrStatuses(currentStatuses);
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

  const handleWalkinDateChange = (dateStr) => {
    setWalkinDate(dateStr);
    evaluateDateAvailability(dateStr, doctorAvailability);
  };

  const handleWalkinSubmit = (e) => {
    e?.preventDefault();
    handleWalkinSubmitWithAction("register_and_checkin");
  };

  const handleWalkinSubmitWithAction = async (actionType) => {
    if (isWalkinSubmitting) return;
    setWalkinModalError("");

    if (!selectedDoctorId) {
      setWalkinModalError("Please select an assigned doctor for this walk-in.");
      return;
    }

    if (!walkinDate) {
      setWalkinModalError("Please select a registration date.");
      return;
    }

    if (!walkinShift) {
      setWalkinModalError("Please select an available shift for the chosen date.");
      return;
    }

    const effectiveDob = dobMode === "text" ? parseManualDob(walkinDobText) : walkinDob;

    if (!effectiveDob || !effectiveDob.trim()) {
      setWalkinModalError("Date of Birth (DOB) / Age is required to register a walk-in patient.");
      return;
    }

    if (!walkinFirstName || !walkinFirstName.trim()) {
      setWalkinModalError("First Name is required.");
      return;
    }

    if (!walkinPhone || !walkinPhone.trim()) {
      setWalkinModalError("Phone Number is required.");
      return;
    }

    try {
      setIsWalkinSubmitting(true);
      const endpoint = selectedCandidate ? `${API_BASE}/staff/patients/existing-walkin` : `${API_BASE}/staff/patients/walkin`;
      const payload = {
        selectedHprId: selectedCandidate ? selectedCandidate.id : null,
        firstName: walkinFirstName,
        lastName: walkinLastName,
        fullName: `${walkinFirstName} ${walkinLastName}`.trim(),
        phone: walkinPhone,
        gender: walkinGender,
        dateOfBirth: effectiveDob,
        doctorId: selectedDoctorId,
        appointmentDate: walkinDate,
        shift: walkinShift,
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
        setWalkinDobText("");
        setWalkinDate("");
        setWalkinShift("");
        setAvailableShifts([]);
        setWalkinModalError("");
        // Refresh Data
        fetchStats();
        fetchQueue();
        fetchAppointments();
        fetchPatients();
        fetchQrIntakes();
      } else {
        setWalkinModalError(data.message || "Failed to register walk-in patient.");
      }
    } catch (err) {
      setWalkinModalError(err.message || "Connection error.");
    } finally {
      setIsWalkinSubmitting(false);
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

  const qrPendingIntakes = qrIntakes.filter(
    (item) => String(item?.status || "").toLowerCase() === "collecting"
  );

  const qrReviewIntakes = qrIntakes.filter(
    (item) => String(item?.status || "").toLowerCase() === "review"
  );

  const qrUrgentIntakes = qrIntakes.filter(
    (item) =>
      String(item?.status || "").toLowerCase() === "safety_blocked" ||
      String(item?.safetyStatus || "").toLowerCase() === "critical"
  );

  return (
    <DashboardLayout activePage="staff" searchPlaceholder="Search patients, appointments, phone numbers...">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%", paddingBottom: "40px" }}>

        {/* Floating Screen Toast Notification Popup */}
        {message.text && (
          <div
            style={{
              position: "fixed",
              top: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9999,
              padding: "14px 24px",
              borderRadius: "14px",
              backgroundColor: message.type === "success" ? "#0b1c2d" : "#7f1d1d",
              color: "#ffffff",
              boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "0.9rem",
              fontWeight: 700,
              maxWidth: "90vw",
              boxSizing: "border-box"
            }}
          >
            <i
              className={`fa-solid ${message.type === "success" ? "fa-circle-check" : "fa-triangle-exclamation"}`}
              style={{ color: message.type === "success" ? "#00a8b5" : "#f87171", fontSize: "1.2rem" }}
            />
            <span>{message.text}</span>
            <button
              onClick={() => setMessage({ text: "", type: "" })}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px", fontSize: "1rem", marginLeft: "12px", display: "flex", alignItems: "center" }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}

        {/* =========================================================================
            TAB 1: STAFF DASHBOARD (/staff)
        ========================================================================= */}
        {(activeTab === "dashboard" || activeTab === "staff") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>

            {/* Header Section */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "20px 28px",
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
                <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#08AEB8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>
                  {getDynamicGreeting()}, {staffName} 👋
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#0b1c2d" }}>
                    {selectedQueueDate === getTodayDateStr() ? "Today's Patients" : `Patients for ${selectedQueueDate}`}
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      backgroundColor: "#f8fafc",
                      padding: "6px 14px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1"
                    }}
                  >
                    <i className="fa-solid fa-calendar-day" style={{ color: "#08AEB8", fontSize: "0.9rem" }} />
                    <input
                      type="date"
                      value={selectedQueueDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      style={{ border: "none", backgroundColor: "transparent", fontSize: "0.85rem", fontWeight: 800, color: "#0b1c2d", outline: "none", cursor: "pointer" }}
                    />
                    <button
                      onClick={() => handleDateChange(getTodayDateStr())}
                      style={{ border: "none", backgroundColor: "#08AEB8", color: "#ffffff", padding: "3px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                    >
                      Today
                    </button>
                  </div>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                  Showing intakes and patient registrations for {selectedQueueDate === getTodayDateStr() ? "Today" : selectedQueueDate} (Walk-ins, QR intakes &amp; Mobile bookings).
                </p>
              </div>

              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>


                <button
                  onClick={() => {
                    setSelectedCandidate(null);
                    setActiveQrSessionId(null);
                    setWalkinFirstName("");
                    setWalkinLastName("");
                    setWalkinPhone("");
                    setWalkinDob("");
                    setShowWalkinModal(true);
                  }}
                  style={{
                    backgroundColor: "#08AEB8",
                    color: "#ffffff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "10px",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(8, 174, 184, 0.25)"
                  }}
                >
                  <i className="fa-solid fa-plus" /> Register Walk-in
                </button>
              </div>
            </div>

            {/* Dynamic Interactive Summary Cards Grid (Acts as Tracking Tabs) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>

              {/* Active Queue Tracking Card */}
              <div
                onClick={() => setActiveQueueStatusTab("all")}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "16px 20px",
                  border: activeQueueStatusTab === "all" ? "2px solid #00a8b5" : "1px solid #e2e8f0",
                  boxShadow: activeQueueStatusTab === "all" ? "0 4px 12px rgba(0, 168, 181, 0.15)" : "0 2px 6px rgba(0,0,0,0.02)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                  <i className="fa-solid fa-user-group" />
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                    {selectedQueueDate === getTodayDateStr() ? "Today's Appointments" : "Total Appointments"}
                  </div>
                  <div style={{ fontSize: "1.7rem", fontWeight: 900, color: "#0b1c2d", lineHeight: 1.1, marginTop: "2px" }}>
                    {queueCounts.total || 0}
                  </div>
                </div>
              </div>

              {/* Waiting Card */}
              <div
                onClick={() => setActiveQueueStatusTab("waiting")}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "16px 20px",
                  border: activeQueueStatusTab === "waiting" ? "2px solid #d97706" : "1px solid #e2e8f0",
                  boxShadow: activeQueueStatusTab === "waiting" ? "0 4px 12px rgba(217, 119, 6, 0.15)" : "0 2px 6px rgba(0,0,0,0.02)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "#fef3c7", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                  <i className="fa-solid fa-clock" />
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Waiting</div>
                  <div style={{ fontSize: "1.7rem", fontWeight: 900, color: "#d97706", lineHeight: 1.1, marginTop: "2px" }}>
                    {queueCounts.waiting || 0}
                  </div>
                </div>
              </div>

              {/* In Consultation Card */}
              <div
                onClick={() => setActiveQueueStatusTab("in_consultation")}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "16px 20px",
                  border: activeQueueStatusTab === "in_consultation" ? "2px solid #0284c7" : "1px solid #e2e8f0",
                  boxShadow: activeQueueStatusTab === "in_consultation" ? "0 4px 12px rgba(2, 132, 199, 0.15)" : "0 2px 6px rgba(0,0,0,0.02)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                  <i className="fa-solid fa-user-doctor" />
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>In Consultation</div>
                  <div style={{ fontSize: "1.7rem", fontWeight: 900, color: "#0284c7", lineHeight: 1.1, marginTop: "2px" }}>
                    {queueCounts.inConsultation || 0}
                  </div>
                </div>
              </div>

              {/* Completed Tab Card */}
              <div
                onClick={() => setActiveQueueStatusTab("completed")}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "16px 20px",
                  border: activeQueueStatusTab === "completed" ? "2px solid #16a34a" : "1px solid #e2e8f0",
                  boxShadow: activeQueueStatusTab === "completed" ? "0 4px 12px rgba(22, 163, 74, 0.15)" : "0 2px 6px rgba(0,0,0,0.02)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                  <i className="fa-solid fa-circle-check" />
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Completed</div>
                  <div style={{ fontSize: "1.7rem", fontWeight: 900, color: "#16a34a", lineHeight: 1.1, marginTop: "2px" }}>
                    {queueCounts.completed || 0}
                  </div>
                </div>
              </div>

              {/* Pending Assignment Card (Only shown if unregistered QR intakes exist) */}
              {queueCounts.pendingAssignment > 0 && (
                <div
                  onClick={() => setActiveQueueStatusTab("pending_assignment")}
                  style={{
                    backgroundColor: activeQueueStatusTab === "pending_assignment" ? "#fff7ed" : "#ffffff",
                    borderRadius: "14px",
                    padding: "16px 20px",
                    border: activeQueueStatusTab === "pending_assignment" ? "2px solid #ea580c" : "1px solid #fed7aa",
                    boxShadow: activeQueueStatusTab === "pending_assignment" ? "0 4px 12px rgba(234, 88, 12, 0.15)" : "0 2px 6px rgba(0,0,0,0.02)",
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "#ffedd5", color: "#ea580c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                    <i className="fa-solid fa-qrcode" />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#c2410c", textTransform: "uppercase" }}>Pending Assignment</div>
                    <div style={{ fontSize: "1.7rem", fontWeight: 900, color: "#ea580c", lineHeight: 1.1, marginTop: "2px" }}>
                      {queueCounts.pendingAssignment}
                    </div>
                  </div>
                </div>
              )}

              {/* Scheduled (Other Dates) Card */}
              <div style={{ backgroundColor: "#ffffff", borderRadius: "14px", padding: "16px 20px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)", display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "#f3e8ff", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                  <i className="fa-solid fa-calendar-days" />
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Scheduled (Other Dates)</div>
                  <div style={{ fontSize: "1.7rem", fontWeight: 900, color: "#7c3aed", lineHeight: 1.1, marginTop: "2px" }}>
                    {stats.scheduledOtherDates || queueCounts.scheduled || 0}
                  </div>
                </div>
              </div>

            </div>

            {/* Urgent / Action-Required Banner for Unregistered QR Intakes */}
            {queueCounts.pendingAssignment > 0 && activeQueueStatusTab !== "pending_assignment" && (
              <div
                style={{
                  backgroundColor: "#fff7ed",
                  borderRadius: "14px",
                  padding: "14px 20px",
                  border: "1px solid #fdba74",
                  boxShadow: "0 2px 8px rgba(234, 88, 12, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: "#ffedd5", color: "#ea580c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>
                    <i className="fa-solid fa-qrcode" />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#9a3412" }}>
                      {queueCounts.pendingAssignment} Today's QR Intake{queueCounts.pendingAssignment > 1 ? "s" : ""} Awaiting Registration
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#c2410c", fontWeight: 600 }}>
                      Patient submitted intake via QR code. Assign a doctor to register and add to queue.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setActiveQueueStatusTab("pending_assignment")}
                  style={{
                    backgroundColor: "#ea580c",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 18px",
                    fontSize: "0.84rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <i className="fa-solid fa-clipboard-user" /> Review &amp; Register
                </button>
              </div>
            )}

            {/* Filter & Search Bar */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "16px 24px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 800, color: "#475569" }}>Doctor:</label>
                  <select
                    value={selectedDoctorFilter}
                    onChange={(e) => setSelectedDoctorFilter(e.target.value)}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: 700, color: "#0b1c2d", backgroundColor: "#f8fafc", outline: "none", minWidth: "180px" }}
                  >
                    <option value="all">All Doctors</option>
                    {filteredDoctorOptions.map((doc) => (
                      <option key={doc.doctorId} value={doc.doctorId}>
                        {doc.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 800, color: "#475569" }}>Shift:</label>
                  <select
                    value={selectedShiftFilter}
                    onChange={(e) => setSelectedShiftFilter(e.target.value)}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: 700, color: "#0b1c2d", backgroundColor: "#f8fafc", outline: "none", minWidth: "180px" }}
                  >
                    <option value="all">All Shifts</option>
                    {dynamicShiftOptions.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Patient / Token Search Box */}
              <div style={{ position: "relative", minWidth: "300px", flex: 1, maxWidth: "450px" }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.85rem" }} />
                <input
                  type="text"
                  placeholder="Search patient name, token number..."
                  value={queueSearchText}
                  onChange={(e) => setQueueSearchText(e.target.value)}
                  style={{ width: "100%", padding: "9px 14px 9px 38px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: 600, outline: "none", backgroundColor: "#f8fafc" }}
                />
              </div>
            </div>

            {/* Main Content Area: Table + Optional Right Details Panel */}
            <div style={{ display: "grid", gridTemplateColumns: selectedVisitDetails ? "1fr 360px" : "1fr", gap: "20px", alignItems: "start" }}>

              {/* Left Column: Unified Patient Table */}
              <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "14px 16px", fontSize: "0.72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>#</th>
                        <th style={{ padding: "14px 16px", fontSize: "0.72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Token</th>
                        <th style={{ padding: "14px 16px", fontSize: "0.72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Patient</th>
                        <th style={{ padding: "14px 16px", fontSize: "0.72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Gender</th>
                        <th style={{ padding: "14px 16px", fontSize: "0.72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Status</th>
                        <th style={{ padding: "14px 16px", fontSize: "0.72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Vitals</th>
                        <th style={{ padding: "14px 16px", fontSize: "0.72rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctorGroupedQueue.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: "40px 16px", textAlign: "center", color: "#64748b", fontSize: "0.9rem" }}>
                            <i className="fa-solid fa-user-slash" style={{ fontSize: "1.8rem", color: "#cbd5e1", marginBottom: "8px", display: "block" }} />
                            No patients found for the selected date and filters.
                          </td>
                        </tr>
                      ) : (
                        doctorGroupedQueue.map((docGroup) => {
                          const isCollapsed = collapsedDoctors[docGroup.doctorId];
                          let globalIndex = 0;

                          return (
                            <React.Fragment key={docGroup.doctorId}>
                              {/* Doctor Accordion Header Bar */}
                              <tr
                                style={{
                                  backgroundColor: "#f8fafc",
                                  borderTop: "2px solid #e2e8f0",
                                  borderBottom: "1px solid #cbd5e1"
                                }}
                              >
                                <td colSpan={7} style={{ padding: "12px 18px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div
                                      onClick={() => toggleDoctorCollapse(docGroup.doctorId)}
                                      style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
                                    >
                                      <i className={`fa-solid ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"}`} style={{ color: "#0b1c2d", fontSize: "0.9rem" }} />
                                      <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0b1c2d" }}>
                                        {docGroup.isUnassigned ? "Unassigned QR Intakes" : `Dr. ${docGroup.doctorName.replace(/^Dr\.\s*/i, "")}`}
                                      </span>
                                      <span style={{ fontSize: "0.82rem", color: docGroup.isUnassigned ? "#c2410c" : "#64748b", fontWeight: 600 }}>
                                        {docGroup.isUnassigned ? "Awaiting Doctor Assignment & Registration" : docGroup.specialization}
                                      </span>
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                      <span style={{ backgroundColor: docGroup.isUnassigned ? "#ffedd5" : "#e2e8f0", color: docGroup.isUnassigned ? "#9a3412" : "#334155", padding: "4px 12px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                                        <i className={`fa-solid ${docGroup.isUnassigned ? "fa-qrcode" : "fa-user"}`} /> {docGroup.totalCount} {docGroup.isUnassigned ? "Intakes" : "Patients"}
                                      </span>
                                      <i
                                        className={`fa-solid ${isCollapsed ? "fa-chevron-down" : "fa-chevron-up"}`}
                                        onClick={() => toggleDoctorCollapse(docGroup.doctorId)}
                                        style={{ color: "#64748b", cursor: "pointer", fontSize: "0.9rem" }}
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>

                              {/* Render Doctor's Active Shifts if not collapsed */}
                              {!isCollapsed && docGroup.shifts.map((shift) => (
                                <React.Fragment key={shift.key}>
                                  {/* Shift Sub-Header Bar (Hidden for Pending Assignment) */}
                                  {shift.name && (
                                    <tr style={{ backgroundColor: "#fffbe6", borderBottom: "1px solid #fef08a" }}>
                                      <td colSpan={7} style={{ padding: "10px 18px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, fontSize: "0.9rem", color: "#854d0e" }}>
                                            <span>{shift.icon}</span>
                                            <span>{shift.name}</span>
                                          </div>
                                          <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#a16207" }}>
                                            {shift.patients.length} Patients
                                          </span>
                                        </div>
                                      </td>
                                    </tr>
                                  )}

                                  {/* Patient Rows inside this Shift */}
                                  {shift.patients.map((item) => {
                                    globalIndex += 1;
                                    const tokenVal = item.token || item.token_number || item.tokenNumber || String(globalIndex).padStart(3, "0");
                                    const isUnregQr = item.isUnregisteredQr || item.status === "UNREGISTERED_QR";
                                    const vitalsObj = item.vitals || item.intakeVitals || item.intake_vitals;
                                    const isVitalsSaved = isVitalsComplete(vitalsObj);

                                    const statusStr = (item.visitStage || item.status || "WAITING").toUpperCase();
                                    const isInConsult = statusStr === "IN CONSULTATION" || statusStr === "IN_CONSULTATION";
                                    const isCompleted = statusStr === "COMPLETED" || statusStr === "EXITED";

                                    return (
                                      <tr
                                        key={item.id || item.qrSessionId || item.appointmentId || globalIndex}
                                        style={{
                                          borderBottom: "1px solid #f1f5f9",
                                          backgroundColor: selectedVisitDetails?.id === item.id ? "#f0fdfa" : "#ffffff"
                                        }}
                                      >
                                        <td style={{ padding: "14px 16px", fontSize: "0.85rem", fontWeight: 700, color: "#64748b" }}>
                                          {globalIndex}
                                        </td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.9rem", fontWeight: 800, color: "#00a8b5" }}>
                                          {tokenVal}
                                        </td>
                                        <td style={{ padding: "14px 16px" }}>
                                          <span style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.9rem" }}>
                                            {item.patientName || item.patient_name || item.full_name || "Patient"}
                                          </span>
                                        </td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>
                                          {item.gender ? (item.gender.charAt(0).toUpperCase() + item.gender.slice(1).toLowerCase()) : "Male"}
                                        </td>
                                        <td style={{ padding: "14px 16px" }}>
                                          {isUnregQr ? (
                                            <button
                                              onClick={() => handleOpenQrRegisterModal(item)}
                                              style={{ backgroundColor: "#00a8b5", color: "#ffffff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "0.78rem", fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                                            >
                                              <i className="fa-solid fa-qrcode" /> Register
                                            </button>
                                          ) : isInConsult ? (
                                            <span style={{ backgroundColor: "#e0f2fe", color: "#0284c7", padding: "4px 12px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                                              IN CONSULTATION
                                            </span>
                                          ) : isCompleted ? (
                                            <span style={{ backgroundColor: "#dcfce7", color: "#16a34a", padding: "4px 12px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                                              COMPLETED
                                            </span>
                                          ) : (
                                            <span style={{ backgroundColor: "#fef3c7", color: "#d97706", padding: "4px 12px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" }}>
                                              WAITING
                                            </span>
                                          )}
                                        </td>
                                        <td style={{ padding: "14px 16px" }}>
                                          {isUnregQr ? (
                                            <span style={{ color: "#94a3b8" }}>-</span>
                                          ) : (
                                            <button
                                              onClick={() => handleOpenVitalsModal(item)}
                                              style={{
                                                backgroundColor: isVitalsSaved ? "#dcfce7" : "#fef2f2",
                                                color: isVitalsSaved ? "#165834" : "#dc2626",
                                                border: `1px solid ${isVitalsSaved ? "#bbf7d0" : "#fecaca"}`,
                                                borderRadius: "16px",
                                                padding: "4px 12px",
                                                fontSize: "0.75rem",
                                                fontWeight: 800,
                                                cursor: "pointer",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "5px"
                                              }}
                                            >
                                              <i className={`fa-solid ${isVitalsSaved ? "fa-circle-check" : "fa-heart-pulse"}`} style={{ color: isVitalsSaved ? "#16a34a" : "#dc2626", fontSize: "0.8rem" }} />
                                              {isVitalsSaved ? "Vitals ✓" : "Vitals"}
                                            </button>
                                          )}
                                        </td>
                                        <td style={{ padding: "14px 16px" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <button
                                              onClick={() => setSelectedVisitDetails(item)}
                                              style={{ backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "4px 12px", fontSize: "0.78rem", fontWeight: 700, color: "#0f172a", cursor: "pointer" }}
                                            >
                                              View
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const keyId = item.id || item.qrSessionId || item.appointmentId;
                                                setActionMenuOpenId(actionMenuOpenId === keyId ? null : keyId);
                                              }}
                                              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "1rem", padding: "4px" }}
                                            >
                                              <i className="fa-solid fa-ellipsis-vertical" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              ))}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column: Patient Details Panel (Matches Image media_1791616560778.jpg) */}
              {selectedVisitDetails && (
                <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.04)", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0b1c2d" }}>Patient Details</h3>
                    <button
                      onClick={() => setSelectedVisitDetails(null)}
                      style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1.1rem" }}
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>

                  {/* Patient Header Block */}
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "50px", height: "50px", borderRadius: "50%", backgroundColor: "#e0f2fe", color: "#0284c7", fontSize: "1.3rem", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {(selectedVisitDetails.patientName || selectedVisitDetails.patient_name || selectedVisitDetails.full_name || "P").charAt(0).toUpperCase()}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "1.1rem", fontWeight: 900, color: "#0b1c2d" }}>
                          {selectedVisitDetails.patientName || selectedVisitDetails.patient_name || selectedVisitDetails.full_name}
                        </span>
                        <span style={{ backgroundColor: "#e0f2fe", color: "#00a8b5", fontSize: "0.75rem", fontWeight: 800, padding: "2px 8px", borderRadius: "6px" }}>
                          #{selectedVisitDetails.token || selectedVisitDetails.token_number || "001"}
                        </span>
                        <span style={{ backgroundColor: "#dcfce7", color: "#16a34a", fontSize: "0.68rem", fontWeight: 800, padding: "2px 8px", borderRadius: "12px", textTransform: "uppercase" }}>
                          {selectedVisitDetails.status || "WAITING"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
                        {selectedVisitDetails.gender ? (selectedVisitDetails.gender.charAt(0).toUpperCase() + selectedVisitDetails.gender.slice(1).toLowerCase()) : "Male"} • {calculateAge(selectedVisitDetails.dob || selectedVisitDetails.dateOfBirth)}
                      </div>
                      <div>
                        <span style={{ backgroundColor: "#f3e8ff", color: "#7e22ce", fontSize: "0.7rem", fontWeight: 800, padding: "2px 8px", borderRadius: "6px" }}>
                          {selectedVisitDetails.registrationSource || "QR Registration"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Basic Information Block */}
                  <div style={{ backgroundColor: "#f8fafc", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#0b1c2d", marginBottom: "2px" }}>Basic Information</div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Patient ID</span>
                      <span style={{ color: "#0b1c2d", fontWeight: 800 }}>{selectedVisitDetails.patientCode || selectedVisitDetails.patient_code || selectedVisitDetails.hpr_id || "DV-P-348938"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Age</span>
                      <span style={{ color: "#0b1c2d", fontWeight: 800 }}>{calculateAge(selectedVisitDetails.dob || selectedVisitDetails.dateOfBirth)}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Phone Number</span>
                      <span style={{ color: "#0b1c2d", fontWeight: 800 }}>{selectedVisitDetails.phone || selectedVisitDetails.patient_phone || "8889996664"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Registration Source</span>
                      <span style={{ color: "#0b1c2d", fontWeight: 800 }}>{selectedVisitDetails.registrationSource || "QR Intake"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Appointment Time</span>
                      <span style={{ color: "#0b1c2d", fontWeight: 800 }}>{selectedVisitDetails.appointmentTime || "09:15 AM"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Doctor</span>
                      <span style={{ color: "#0b1c2d", fontWeight: 800 }}>{selectedVisitDetails.doctorName || selectedVisitDetails.doctor_name || "Dr. Akshatha Bitla"}</span>
                    </div>
                  </div>

                  {/* Vitals Information Block */}
                  <div style={{ backgroundColor: "#f8fafc", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#0b1c2d", marginBottom: "2px" }}>Vitals Information</div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Blood Pressure</span>
                      <span style={{ color: "#16a34a", fontWeight: 800 }}>{selectedVisitDetails.vitals?.bp || selectedVisitDetails.vitals?.blood_pressure || "120/80 mmHg"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Pulse</span>
                      <span style={{ color: "#16a34a", fontWeight: 800 }}>{selectedVisitDetails.vitals?.pulse || "72 bpm"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Temperature</span>
                      <span style={{ color: "#16a34a", fontWeight: 800 }}>{selectedVisitDetails.vitals?.temperature || "98.4°F"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Weight</span>
                      <span style={{ color: "#16a34a", fontWeight: 800 }}>{selectedVisitDetails.vitals?.weight ? `${selectedVisitDetails.vitals.weight} kg` : "65 kg"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                      <span style={{ color: "#64748b", fontWeight: 600 }}>Updated At</span>
                      <span style={{ color: "#64748b", fontWeight: 700 }}>{selectedVisitDetails.vitals_updated_at || "10 Oct 2026, 09:20 AM"}</span>
                    </div>
                  </div>

                  {/* Actions Block */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <button
                      onClick={handleNextPatient}
                      disabled={isActionSubmitting}
                      style={{ width: "100%", backgroundColor: "#00a8b5", color: "#ffffff", border: "none", borderRadius: "8px", padding: "12px", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                    >
                      Next Patient <i className="fa-solid fa-arrow-right" />
                    </button>

                    <button
                      onClick={() => handleOpenPatientDetails(selectedVisitDetails)}
                      style={{ width: "100%", backgroundColor: "#ffffff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                    >
                      <i className="fa-solid fa-file-lines" style={{ color: "#00a8b5" }} /> View Full History
                    </button>

                    <button
                      onClick={() => handleOpenRescheduleModal(selectedVisitDetails)}
                      style={{ width: "100%", backgroundColor: "#ffffff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                    >
                      <i className="fa-solid fa-calendar-days" style={{ color: "#00a8b5" }} /> Reschedule Appointment
                    </button>
                  </div>
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
              <button onClick={fetchAllData} disabled={isLoading} style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "10px 18px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }}>
                <i className={`fa-solid fa-rotate-right ${isLoading ? "fa-spin" : ""}`} style={{ marginRight: "6px" }} /> Refresh List
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
                    onChange={(e) => handleDateChange(e.target.value)}
                    style={{ border: "none", backgroundColor: "transparent", fontSize: "0.85rem", fontWeight: 800, color: "#0b1c2d", outline: "none", cursor: "pointer" }}
                  />
                  <button
                    onClick={() => handleDateChange(getTodayDateStr())}
                    style={{ border: "none", backgroundColor: "#08AEB8", color: "#ffffff", padding: "3px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                  >
                    Today
                  </button>
                </div>

                {/* Refresh Button */}
                <button
                  onClick={fetchAllData}
                  disabled={isLoading}
                  style={{ backgroundColor: "#0b1c2d", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <i className={`fa-solid fa-arrows-rotate ${isLoading ? "fa-spin" : ""}`} /> {isLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            {/* 2. HORIZONTAL STATUS TABS WITH LIVE COUNTS */}
            <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", padding: "12px 16px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "max-content" }}>
                {[
                  { key: "all", label: "All Patients", count: queueCounts.total, icon: "fa-users" },
                  ...(queueCounts.pendingAssignment > 0 ? [{ key: "pending_assignment", label: "Pending Assignment", count: queueCounts.pendingAssignment, icon: "fa-qrcode" }] : []),
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
                {/* Shift Filter */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Shift:
                  </label>
                  <select
                    value={selectedShiftFilter}
                    onChange={(e) => setSelectedShiftFilter(e.target.value)}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", fontWeight: 700, color: "#0b1c2d", backgroundColor: "#f8fafc", outline: "none", minWidth: "180px" }}
                  >
                    <option value="all">All Shifts</option>
                    {dynamicShiftOptions.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.name}</option>
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

                                      {!isCompleted && !isCancelled && !isInConsult && (
                                        <button
                                          onClick={() => handleOpenRescheduleModal(item)}
                                          style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 14px", border: "none", background: "none", fontSize: "0.8rem", fontWeight: 700, color: "#0284c7", cursor: "pointer" }}
                                        >
                                          <i className="fa-solid fa-clock-rotate-left" style={{ color: "#0284c7" }} /> Reschedule Appointment
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
          MODAL 0: REAL-TIME CONSULTATION COMPLETED ALERT MODAL
      ========================================================================= */}
      {completionAlertQueue.length > 0 && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.75)", backdropFilter: "blur(6px)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "20px", width: "100%", maxWidth: "520px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)", border: "2px solid #10b981", overflow: "hidden" }}>

            {/* Modal Header */}
            <div style={{ backgroundColor: "#10b981", color: "#ffffff", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "#ffffff", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", fontWeight: 900 }}>
                  <i className="fa-solid fa-circle-check" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 900 }}>Consultation Completed!</h3>
                  <span style={{ fontSize: "0.82rem", opacity: 0.95 }}>
                    {completionAlertQueue.length > 1 ? `(${completionAlertQueue.length} doctor updates waiting)` : "Doctor update from consultation workspace"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setCompletionAlertQueue(prev => prev.slice(1))}
                style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    <i className="fa-solid fa-user-doctor" style={{ marginRight: "6px" }} />
                    Dr. {completionAlertQueue[0].doctorName.replace(/^Dr\.\s*/i, "")}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "#15803d", fontWeight: 700 }}>
                    {completionAlertQueue[0].completedAt}
                  </span>
                </div>

                <div style={{ fontSize: "1.2rem", fontWeight: 900, color: "#0b1c2d", marginTop: "4px" }}>
                  {completionAlertQueue[0].patientName}
                  <span style={{ color: "#00a8b5", marginLeft: "8px" }}>
                    (Token #{completionAlertQueue[0].tokenNumber})
                  </span>
                </div>

                <p style={{ margin: "4px 0 0", fontSize: "0.86rem", color: "#475569", lineHeight: 1.5 }}>
                  Doctor has completed the consultation. Click <strong>Next Patient</strong> to advance the queue and view the next waiting patient for <strong>Dr. {completionAlertQueue[0].doctorName.replace(/^Dr\.\s*/i, "")}</strong>.
                </p>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setCompletionAlertQueue(prev => prev.slice(1))}
                  style={{ padding: "11px 20px", borderRadius: "10px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem" }}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const alertDocId = completionAlertQueue[0].doctorId;
                    setCompletionAlertQueue(prev => prev.slice(1));
                    handleNextPatient(alertDocId);
                  }}
                  style={{ padding: "11px 24px", borderRadius: "10px", border: "none", backgroundColor: "#00a8b5", color: "#ffffff", fontWeight: 900, cursor: "pointer", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 12px rgba(0, 168, 181, 0.3)" }}
                >
                  Next Patient <i className="fa-solid fa-arrow-right" />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: REGISTER WALK-IN PATIENT
      ========================================================================= */}
      {showWalkinModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 4000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 20px 20px 20px", overflowY: "auto", boxSizing: "border-box" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", width: "100%", maxWidth: "660px", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column", margin: "0 auto" }}>

            {/* Modal Header */}
            <div style={{ padding: "18px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.01em" }}>Register Walk-in Patient</h3>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginTop: "2px" }}>Search existing candidates or register a new patient</span>
              </div>
              <button onClick={() => setShowWalkinModal(false)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.25rem", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.85, transition: "opacity 0.2s" }} onMouseEnter={(e) => e.target.style.opacity = "1"} onMouseLeave={(e) => e.target.style.opacity = "0.85"}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px", overflowY: "auto" }}>

              {/* Top Search & Action Bar */}
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.9rem" }} />
                  <input
                    type="text"
                    placeholder="Search existing patients by name, phone number or HPR..."
                    value={candidatePhoneQuery}
                    onChange={(e) => setCandidatePhoneQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearchCandidates(); } }}
                    style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.86rem", outline: "none", color: "#0b1c2d", boxSizing: "border-box" }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSearchCandidates}
                  disabled={isSearchingCandidates}
                  style={{ backgroundColor: "#00a8b5", color: "#ffffff", border: "none", padding: "10px 22px", borderRadius: "8px", fontWeight: 800, cursor: "pointer", fontSize: "0.86rem", whiteSpace: "nowrap", boxShadow: "0 2px 6px rgba(0, 168, 181, 0.2)" }}
                >
                  {isSearchingCandidates ? "Searching..." : "Search"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCandidate(null);
                    setCandidatePhoneQuery("");
                    setCandidates([]);
                    setWalkinFirstName("");
                    setWalkinLastName("");
                    setWalkinPhone("");
                    setWalkinDob("");
                    setWalkinDobText("");
                    setWalkinModalError("");
                  }}
                  style={{ backgroundColor: "#ffffff", color: "#00a8b5", border: "1.5px solid #00a8b5", padding: "9px 18px", borderRadius: "8px", fontWeight: 800, cursor: "pointer", fontSize: "0.86rem", whiteSpace: "nowrap" }}
                >
                  Register New
                </button>
              </div>

              {/* Candidate Search Results List */}
              {candidates.length > 0 && (
                <div style={{ backgroundColor: "#f8fafc", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Matching Patient Candidates:</div>
                  {candidates.map(c => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCandidate(c)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: selectedCandidate?.id === c.id ? "2px solid #00a8b5" : "1px solid #cbd5e1",
                        backgroundColor: selectedCandidate?.id === c.id ? "#e6f7f9" : "#ffffff",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: "#0b1c2d", fontSize: "0.9rem" }}>{c.full_name}</div>
                        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>Code: {c.hospital_patient_code || "HPR-TEMP"} • Phone: {c.phone}</div>
                      </div>
                      <button
                        type="button"
                        style={{ backgroundColor: selectedCandidate?.id === c.id ? "#00a8b5" : "#f1f5f9", color: selectedCandidate?.id === c.id ? "#ffffff" : "#334155", border: "none", padding: "4px 10px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700 }}
                      >
                        {selectedCandidate?.id === c.id ? "Selected ✓" : "Select HPR"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Walk-in Registration Form */}
              <form onSubmit={handleWalkinSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                {/* Row 1: Name fields */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 800, color: "#0b1c2d", marginBottom: "6px" }}>First Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter first name"
                      value={walkinFirstName}
                      onChange={(e) => setWalkinFirstName(e.target.value)}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", outline: "none", boxSizing: "border-box", color: "#0b1c2d" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 800, color: "#0b1c2d", marginBottom: "6px" }}>Last Name</label>
                    <input
                      type="text"
                      placeholder="Enter last name"
                      value={walkinLastName}
                      onChange={(e) => setWalkinLastName(e.target.value)}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", outline: "none", boxSizing: "border-box", color: "#0b1c2d" }}
                    />
                  </div>
                </div>

                {/* Row 2: Phone, DOB, Gender */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 800, color: "#0b1c2d", marginBottom: "6px" }}>Phone Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="Phone number"
                      value={walkinPhone}
                      onChange={(e) => setWalkinPhone(e.target.value)}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", outline: "none", boxSizing: "border-box", color: "#0b1c2d" }}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <label style={{ fontSize: "0.82rem", fontWeight: 800, color: "#0b1c2d" }}>Date of Birth (DOB) *</label>
                      <button
                        type="button"
                        onClick={() => {
                          if (dobMode === "picker") {
                            setDobMode("text");
                            if (walkinDob) setWalkinDobText(walkinDob);
                          } else {
                            setDobMode("picker");
                            if (walkinDobText) setWalkinDob(parseManualDob(walkinDobText));
                          }
                        }}
                        style={{ background: "none", border: "none", color: "#00a8b5", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                      >
                        {dobMode === "picker" ? "Type Age" : "Date Picker"}
                      </button>
                    </div>
                    {dobMode === "picker" ? (
                      <input
                        type="date"
                        required
                        max={new Date().toISOString().split("T")[0]}
                        value={walkinDob}
                        onChange={(e) => {
                          setWalkinDob(e.target.value);
                          setWalkinDobText(e.target.value);
                        }}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", outline: "none", boxSizing: "border-box", color: "#0b1c2d", backgroundColor: "#ffffff" }}
                      />
                    ) : (
                      <input
                        type="text"
                        required
                        placeholder="e.g. 25 Y, 15/08/1998"
                        value={walkinDobText}
                        onChange={(e) => {
                          setWalkinDobText(e.target.value);
                          setWalkinDob(parseManualDob(e.target.value));
                        }}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", outline: "none", boxSizing: "border-box", color: "#0b1c2d" }}
                      />
                    )}
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 800, color: "#0b1c2d", marginBottom: "6px" }}>Gender</label>
                    <select
                      value={walkinGender}
                      onChange={(e) => setWalkinGender(e.target.value)}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", outline: "none", backgroundColor: "#ffffff", color: "#0b1c2d" }}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Row 3: Assign Doctor */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 800, color: "#0b1c2d", marginBottom: "6px" }}>Assign Doctor *</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#00a8b5", fontSize: "1.1rem", pointerEvents: "none" }}>
                      <i className="fa-solid fa-user-doctor" />
                    </div>
                    <select
                      required
                      value={selectedDoctorId}
                      onChange={(e) => {
                        const newDocId = e.target.value;
                        setSelectedDoctorId(newDocId);
                        const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
                        setWalkinDate(todayStr);
                        setWalkinShift("");
                        setAvailableShifts([]);
                        setWalkinModalError("");
                        if (newDocId) {
                          fetchDoctorAvailability(newDocId, todayStr);
                        }
                      }}
                      style={{ width: "100%", padding: "11px 14px 11px 42px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", outline: "none", backgroundColor: "#ffffff", fontWeight: 700, color: "#0b1c2d", cursor: "pointer", boxSizing: "border-box" }}
                    >
                      <option value="" disabled>{isDoctorsLoading ? "Loading hospital doctors..." : doctors.length === 0 ? "No active doctors assigned to this hospital" : "Select Doctor..."}</option>
                      {doctors.map(d => (
                        <option key={d.doctorId} value={d.doctorId}>Dr. {d.fullName} — {d.specialization}</option>
                      ))}
                    </select>
                  </div>
                  {isAvailabilityLoading && (
                    <div style={{ fontSize: "0.78rem", color: "#00a8b5", marginTop: "4px", fontWeight: 600 }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: "4px" }} /> Loading doctor availability...
                    </div>
                  )}
                </div>

                {/* Remaining Two Options Open After Selecting Doctor */}
                {selectedDoctorId ? (
                  <>
                    {/* Select Consultation Date & Status Badge */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.86rem", fontWeight: 800, color: "#0b1c2d" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "6px", backgroundColor: "#e6f7f9", color: "#00a8b5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem" }}>
                          <i className="fa-solid fa-calendar-days" />
                        </div>
                        <span>Select Consultation Date *</span>
                      </label>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "14px", alignItems: "center" }}>
                        <input
                          type="date"
                          required
                          min={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}
                          value={walkinDate}
                          onChange={(e) => handleWalkinDateChange(e.target.value)}
                          style={{
                            padding: "11px 14px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            outline: "none",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            color: "#0b1c2d",
                            backgroundColor: "#ffffff",
                            boxSizing: "border-box"
                          }}
                        />

                        {walkinDateStatus && (
                          <div style={{
                            backgroundColor: walkinDateStatus.isAvailable ? "#e6f4ea" : "#fce8e6",
                            color: walkinDateStatus.isAvailable ? "#137333" : "#c5221f",
                            border: `1px solid ${walkinDateStatus.isAvailable ? "#ceead6" : "#fad2cf"}`,
                            padding: "10px 14px",
                            borderRadius: "10px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px"
                          }}>
                            <div style={{
                              backgroundColor: walkinDateStatus.isAvailable ? "#34a853" : "#ea4335",
                              color: "#ffffff",
                              width: "22px",
                              height: "22px",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 900,
                              fontSize: "0.8rem",
                              flexShrink: 0
                            }}>
                              {walkinDateStatus.isAvailable ? "✓" : "✕"}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: "0.86rem" }}>{walkinDateStatus.message}</div>
                              <div style={{ fontSize: "0.76rem", opacity: 0.9 }}>{walkinDateStatus.subtext}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Select Shift */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.86rem", fontWeight: 800, color: "#0b1c2d" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "6px", backgroundColor: "#e6f7f9", color: "#00a8b5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem" }}>
                          <i className="fa-solid fa-clock" />
                        </div>
                        <span>Select Shift *</span>
                      </label>

                      {availableShifts.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          {availableShifts.map((shiftObj) => {
                            const isSelected = walkinShift === shiftObj.time;
                            const isPassed = shiftObj.isPassed;
                            return (
                              <div
                                key={shiftObj.id}
                                onClick={() => {
                                  if (isPassed) return;
                                  setWalkinShift(shiftObj.time);
                                  setWalkinModalError("");
                                }}
                                style={{
                                  padding: "12px 16px",
                                  borderRadius: "10px",
                                  border: isSelected ? "2px solid #00a8b5" : "1px solid #cbd5e1",
                                  backgroundColor: isPassed ? "#f1f5f9" : isSelected ? "#e6f7f9" : "#ffffff",
                                  opacity: isPassed ? 0.6 : 1,
                                  cursor: isPassed ? "not-allowed" : "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "12px",
                                  transition: "all 0.15s ease"
                                }}
                              >
                                <div style={{
                                  width: "18px",
                                  height: "18px",
                                  borderRadius: "50%",
                                  border: isSelected ? "5px solid #00a8b5" : "2px solid #cbd5e1",
                                  backgroundColor: isPassed ? "#cbd5e1" : "#ffffff",
                                  boxSizing: "border-box",
                                  flexShrink: 0
                                }} />
                                <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{shiftObj.icon === "sun" ? "☀️" : "🌙"}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ fontWeight: 800, fontSize: "0.88rem", color: isPassed ? "#64748b" : "#0b1c2d" }}>{shiftObj.name}</span>
                                    {isPassed && (
                                      <span style={{ backgroundColor: "#fee2e2", color: "#991b1b", fontSize: "0.68rem", fontWeight: 800, padding: "2px 6px", borderRadius: "4px" }}>
                                        Ended
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 600, marginTop: "2px" }}>{shiftObj.time}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ padding: "12px 16px", borderRadius: "10px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: "0.85rem", fontWeight: 600 }}>
                          {walkinDateStatus?.message ? `${walkinDateStatus.message} — No shifts available on this date.` : "No shifts available."}
                        </div>
                      )}
                    </div>

                    {/* Information Summary Banner */}
                    {walkinDate && walkinShift && availableShifts.length > 0 && (
                      <div style={{ backgroundColor: "#e8f4fd", border: "none", color: "#1d4ed8", padding: "12px 16px", borderRadius: "10px", fontSize: "0.84rem", display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: "#0284c7", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "0.8rem", flexShrink: 0 }}>
                          ℹ
                        </div>
                        <span>
                          Consultation will be scheduled for <strong>{walkinDate}</strong> during <strong>{availableShifts.find(s => s.time === walkinShift)?.name || "Shift"} ({walkinShift})</strong>.
                        </span>
                      </div>
                    )}
                  </>
                ) : null}

                {/* Validation Error Banner */}
                {walkinModalError && (
                  <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: "8px", fontSize: "0.84rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                    <i className="fa-solid fa-circle-exclamation" style={{ fontSize: "1rem" }} />
                    <span>{walkinModalError}</span>
                  </div>
                )}

                {/* Footer Buttons */}
                <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                  <button
                    type="button"
                    disabled={isWalkinSubmitting}
                    onClick={() => setShowWalkinModal(false)}
                    style={{ padding: "10px 22px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#334155", fontWeight: 700, cursor: isWalkinSubmitting ? "not-allowed" : "pointer", fontSize: "0.86rem" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isWalkinSubmitting}
                    onClick={() => handleWalkinSubmitWithAction("register_and_checkin")}
                    style={{ padding: "10px 24px", borderRadius: "8px", border: "none", backgroundColor: "#00a8b5", color: "#ffffff", fontWeight: 800, cursor: isWalkinSubmitting ? "not-allowed" : "pointer", fontSize: "0.86rem", boxShadow: "0 2px 8px rgba(0, 168, 181, 0.25)" }}
                  >
                    {isWalkinSubmitting ? "Registering..." : "Register Walk-in Patient"}
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

      {/* =========================================================================
          MODAL: RESCHEDULE APPOINTMENT
      ========================================================================= */}
      {rescheduleModalAppointment && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(11, 28, 45, 0.6)", backdropFilter: "blur(6px)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#ffffff", borderRadius: "16px", width: "100%", maxWidth: "540px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

            {/* Modal Header */}
            <div style={{ padding: "18px 24px", backgroundColor: "#0b1c2d", color: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <i className="fa-solid fa-clock-rotate-left" style={{ color: "#08AEB8", fontSize: "1.2rem" }} />
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>Reschedule Appointment</h3>
              </div>
              <button onClick={() => setRescheduleModalAppointment(null)} style={{ background: "none", border: "none", color: "#ffffff", fontSize: "1.2rem", cursor: "pointer" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmRescheduleAppointment} style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* Patient Info Card */}
              <div style={{ backgroundColor: "#f0f9ff", borderRadius: "12px", padding: "14px 16px", border: "1px solid #bae6fd", fontSize: "0.85rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, color: "#0369a1", fontSize: "0.95rem" }}>
                    {rescheduleModalAppointment.patientName || rescheduleModalAppointment.patient_name || "Patient"}
                  </div>
                  <span style={{ fontSize: "0.75rem", backgroundColor: "#e0f2fe", color: "#0284c7", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                    {rescheduleModalAppointment.patientCode || rescheduleModalAppointment.hprCode || "Walk-in"}
                  </span>
                </div>
                <div style={{ color: "#475569", marginTop: "4px" }}>
                  Current: <strong>{rescheduleModalAppointment.appointmentDate || selectedQueueDate}</strong> at <strong>{rescheduleModalAppointment.appointmentTime || "--"}</strong>
                </div>
                <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "2px" }}>
                  Doctor: {rescheduleModalAppointment.doctorName || rescheduleModalAppointment.doctors?.full_name || "Assigned Doctor"}
                </div>
              </div>

              {/* Backend Submit Error Banner */}
              {rescheduleSubmitError && (
                <div style={{ backgroundColor: "#fef2f2", color: "#991b1b", padding: "12px 14px", borderRadius: "10px", border: "1px solid #fecaca", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ color: "#dc2626" }} />
                  <div>{rescheduleSubmitError}</div>
                </div>
              )}

              {/* Doctor Selector (if multiple doctors available) */}
              {doctors && doctors.length > 1 && (
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Doctor</label>
                  <select
                    value={rescheduleDoctorId}
                    onChange={(e) => setRescheduleDoctorId(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", outline: "none" }}
                  >
                    {doctors.map(d => (
                      <option key={d.doctorId || d.id} value={d.doctorId || d.id}>
                        {d.fullName || d.full_name} ({d.specialization || "General Medicine"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Select New Date <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => {
                    setRescheduleDate(e.target.value);
                    setRescheduleTime("");
                    setRescheduleSubmitError("");
                  }}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }}
                  required
                />
              </div>

              {/* Available Time Slots Grid */}
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Select Available Time Slot <span style={{ color: "#dc2626" }}>*</span>
                </label>

                {isSlotsLoading ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: "8px", color: "#08AEB8" }} />
                    Checking slot availability for {rescheduleDate}...
                  </div>
                ) : slotsError ? (
                  <div style={{ backgroundColor: "#fffbe8", color: "#b45309", padding: "12px", borderRadius: "8px", border: "1px solid #fef08a", fontSize: "0.83rem", fontWeight: 600 }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "6px" }} />
                    {slotsError}
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div style={{ padding: "16px", textAlign: "center", backgroundColor: "#f8fafc", borderRadius: "8px", color: "#64748b", fontSize: "0.83rem" }}>
                    No slots available for this date. Please select another date.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "8px", maxHeight: "180px", overflowY: "auto", padding: "4px" }}>
                    {availableSlots.map((slot, sIdx) => {
                      const isSelected = rescheduleTime === slot.time;
                      const isAvailable = slot.available;

                      return (
                        <button
                          key={sIdx}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            if (isAvailable) {
                              setRescheduleTime(slot.time);
                              setRescheduleSubmitError("");
                            }
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: isSelected ? "2px solid #08AEB8" : isAvailable ? "1px solid #cbd5e1" : "1px solid #f1f5f9",
                            backgroundColor: isSelected ? "#e6f7f8" : isAvailable ? "#ffffff" : "#f1f5f9",
                            color: isSelected ? "#08AEB8" : isAvailable ? "#1e293b" : "#94a3b8",
                            fontWeight: isSelected ? 800 : 600,
                            fontSize: "0.8rem",
                            cursor: isAvailable ? "pointer" : "not-allowed",
                            textAlign: "center",
                            transition: "all 0.15s ease",
                            textDecoration: !isAvailable ? "line-through" : "none"
                          }}
                        >
                          {slot.time}
                          {!isAvailable && (
                            <div style={{ fontSize: "0.65rem", textDecoration: "none", marginTop: "2px" }}>
                              {slot.reason || "Booked"}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {rescheduleTime && (
                  <div style={{ marginTop: "8px", fontSize: "0.8rem", color: "#08AEB8", fontWeight: 700 }}>
                    Selected Time: {rescheduleTime}
                  </div>
                )}
              </div>

              {/* Optional Reason TextArea */}
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Reschedule Reason (Optional)
                </label>
                <textarea
                  placeholder="e.g. Patient requested time change, doctor delay, emergency..."
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  rows={2}
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Actions Footer */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setRescheduleModalAppointment(null)}
                  style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionSubmitting || !rescheduleDate || !rescheduleTime}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: (isActionSubmitting || !rescheduleDate || !rescheduleTime) ? "#94a3b8" : "#0284c7",
                    color: "#ffffff",
                    fontWeight: 800,
                    cursor: (isActionSubmitting || !rescheduleDate || !rescheduleTime) ? "not-allowed" : "pointer"
                  }}
                >
                  {isActionSubmitting ? "Rescheduling..." : "Confirm Reschedule"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
