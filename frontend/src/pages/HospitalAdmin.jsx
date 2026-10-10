import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import vedikaLogo from "../assets/vedika_logo.png";
import { getApiV1Url } from "../utils/apiConfig";
import { QRCodeCanvas } from "qrcode.react";
import { createPortal } from "react-dom";

const API_BASE = getApiV1Url();

// -------------------------------------------------------------------------
// Doctor Schedule Constants
// -------------------------------------------------------------------------

// Hospital Admin manages doctor availability for all seven weekdays.
const DOCTOR_SCHEDULE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Consultation session time selections.
// Same pattern we used in the previous schedule implementation.
const SCHEDULE_TIME_OPTIONS = [
  "06:00 AM",
  "06:30 AM",
  "07:00 AM",
  "07:30 AM",
  "08:00 AM",
  "08:30 AM",
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "01:00 PM",
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
  "05:30 PM",
  "06:00 PM",
  "06:30 PM",
  "07:00 PM",
  "07:30 PM",
  "08:00 PM",
  "08:30 PM",
  "09:00 PM",
  "09:30 PM",
  "10:00 PM",
];

export default function HospitalAdmin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, doctor: currentUser } = useAuth();

  // -------------------------------------------------------------------------
  // Synchronize active tab from URL location path
  // -------------------------------------------------------------------------
  const activeTab = useMemo(() => {
    const path = location.pathname;

    /*
     * Patients must be resolved before "/hospital".
     *
     * This also keeps /hospital-admin/patients working correctly,
     * because that URL naturally contains "/hospital".
     */
    if (path.includes("/patients")) return "patients";

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
    hospitalStatus: "active",
  });

  const [recentDoctors, setRecentDoctors] = useState([]);
  const [recentStaff, setRecentStaff] = useState([]);

  const [doctorsList, setDoctorsList] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // -------------------------------------------------------------------------
  // Hospital Admin Patients
  // -------------------------------------------------------------------------
  // Read-only patient list returned by:
  // GET /api/v1/hospital-admin/patients
  const [hospitalPatients, setHospitalPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState("");

  // -------------------------------------------------------------------------
  // Selected Hospital Patient Details
  // -------------------------------------------------------------------------
  const [selectedPatientDetails, setSelectedPatientDetails] = useState(null);
  const [patientDetailsLoading, setPatientDetailsLoading] = useState(false);
  const [patientDetailsError, setPatientDetailsError] = useState("");
  const [showPatientDetails, setShowPatientDetails] = useState(false);

  const [selectedHospitalPatientId, setSelectedHospitalPatientId] =
    useState(null);

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

  // -------------------------------------------------------------------------
  // Doctor Schedule Management
  // -------------------------------------------------------------------------

  // Controls Manage Schedule modal.
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Doctor whose schedule is currently being managed.
  const [scheduleDoctor, setScheduleDoctor] = useState(null);

  // Monday-Sunday schedule returned by backend.
  const [doctorSchedule, setDoctorSchedule] = useState([]);

  // Hospital-specific unavailable / leave dates.
  const [doctorBlockedDates, setDoctorBlockedDates] = useState([]);

  // Loading states are separated so weekly schedule and
  // blocked-date actions remain easy to control.
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [blockDateLoading, setBlockDateLoading] = useState(false);

  const [scheduleError, setScheduleError] = useState("");

  const [scheduleSuccess, setScheduleSuccess] = useState("");

  const [blockDateForm, setBlockDateForm] = useState({
    date: "",
    reason: "",
  });

  // -------------------------------------------------------------------------
  // Doctor Patients View
  // -------------------------------------------------------------------------

  // Full doctor-patient summary returned by:
  // GET /hospital-admin/doctors/:doctorId/patients
  const [selectedDoctorPatients, setSelectedDoctorPatients] = useState(null);

  // Controls the doctor patients modal.
  const [showDoctorPatients, setShowDoctorPatients] = useState(false);

  // Loading/error states are kept separate from the main Doctors list.
  const [doctorPatientsLoading, setDoctorPatientsLoading] = useState(false);
  const [doctorPatientsError, setDoctorPatientsError] = useState("");

  // Remember which doctor is currently being viewed.
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);

  const [showEditStaffModal, setShowEditStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  const [showEditHospitalModal, setShowEditHospitalModal] = useState(false);

  const [statusConfirmModal, setStatusConfirmModal] = useState({
    show: false,
    memberType: "doctor", // "doctor" | "staff"
    member: null,
    targetStatus: "inactive",
  });

  // View Member Details Modal
  const [viewMemberModal, setViewMemberModal] = useState({
    show: false,
    memberType: "doctor",
    member: null,
  });

  // One-Time Credential Display Modal State
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [createdCredential, setCreatedCredential] = useState(null);
  const [showTempPassword, setShowTempPassword] = useState(true);

  // Form Inputs - Doctor Creation
  const [docFullName, setDocFullName] = useState("");
  const [docEmail, setDocEmail] = useState("");
  const [docPhone, setDocPhone] = useState("");
  const [docSpecialization, setDocSpecialization] = useState(
    "General Physician & AI Consultant",
  );
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
      "X-Portal-Context": "hospital_admin",
    };

    if (
      storedHospitalId &&
      storedHospitalId !== "null" &&
      storedHospitalId !== "undefined" &&
      storedHospitalId !== "00000000-0000-0000-0000-000000000001"
    ) {
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
    setStatusConfirmModal({
      show: false,
      memberType: "doctor",
      member: null,
      targetStatus: "inactive",
    });
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
        fetchAuditLogs(),
        fetchHospitalPatients(),
      ]);
    } catch (err) {
      console.warn("Fetch admin data warning:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/hospital-admin/dashboard-stats`, {
        headers: getAuthHeaders(),
      });
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
      const res = await fetch(`${API_BASE}/hospital-admin/doctors`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setDoctorsList(data.doctors || []);
      }
    } catch (err) {
      console.warn("Error fetching doctors:", err);
    }
  };

  // -------------------------------------------------------------------------
  // Open Doctor Schedule
  // -------------------------------------------------------------------------

  /**
   * Opens the selected doctor's schedule and loads:
   *
   * 1. Monday-Sunday hospital availability
   * 2. Hospital-specific blocked / leave dates
   *
   * Hospital authorization is still enforced by the backend.
   */
  const openDoctorSchedule = async (doctor) => {
    if (!doctor) {
      return;
    }

    const doctorId = doctor.doctorId || doctor.memberId;

    if (!doctorId) {
      setMessage({
        text: "Unable to identify the selected doctor.",
        type: "error",
      });

      return;
    }

    setScheduleDoctor(doctor);

    setShowScheduleModal(true);

    setScheduleLoading(true);

    setScheduleError("");

    setScheduleSuccess("");

    setDoctorSchedule([]);

    setDoctorBlockedDates([]);

    setBlockDateForm({
      date: "",
      reason: "",
    });

    try {
      const [availabilityResponse, blockedDatesResponse] = await Promise.all([
        fetch(`${API_BASE}/hospital-admin/doctors/${doctorId}/availability`, {
          headers: getAuthHeaders(),
        }),

        fetch(`${API_BASE}/hospital-admin/doctors/${doctorId}/blocked-dates`, {
          headers: getAuthHeaders(),
        }),
      ]);

      const availabilityData = await availabilityResponse.json();

      const blockedDatesData = await blockedDatesResponse.json();

      if (!availabilityResponse.ok || !availabilityData.success) {
        throw new Error(
          availabilityData.message || "Failed to load doctor availability.",
        );
      }

      if (!blockedDatesResponse.ok || !blockedDatesData.success) {
        throw new Error(
          blockedDatesData.message || "Failed to load doctor blocked dates.",
        );
      }

      const returnedSchedule = Array.isArray(availabilityData.availability)
        ? availabilityData.availability
        : [];

      /*
       * Always create all seven days for the UI.
       *
       * Existing hospital configuration is reused when present.
       */
      const normalizedSchedule = DOCTOR_SCHEDULE_DAYS.map((day) => {
        const existing = returnedSchedule.find(
          (item) =>
            String(item.day_of_week || "").toLowerCase() === day.toLowerCase(),
        );

        if (existing) {
          let timeWindows = Array.isArray(existing.time_windows)
            ? existing.time_windows
            : [];

          /*
           * Compatibility with older availability
           * rows that only had start/end time.
           */
          if (
            existing.is_available &&
            timeWindows.length === 0 &&
            existing.start_time &&
            existing.end_time
          ) {
            timeWindows = [
              {
                start_time: existing.start_time,

                end_time: existing.end_time,
              },
            ];
          }

          return {
            ...existing,

            day_of_week: day,

            is_available: Boolean(existing.is_available),

            time_windows: existing.is_available ? timeWindows : [],
          };
        }

        return {
          id: null,

          day_of_week: day,

          is_available: false,

          time_windows: [],
        };
      });

      setDoctorSchedule(normalizedSchedule);

      setDoctorBlockedDates(
        Array.isArray(blockedDatesData.blockedDates)
          ? blockedDatesData.blockedDates
          : [],
      );
    } catch (err) {
      console.error("[HospitalAdmin] Load doctor schedule error:", err);

      setScheduleError(err.message || "Failed to load doctor schedule.");
    } finally {
      setScheduleLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Doctor Schedule UI Helpers
  // -------------------------------------------------------------------------

  /**
   * Enable / disable one weekday.
   *
   * When enabling a day for the first time,
   * create one default consultation session.
   *
   * This currently changes frontend state only.
   */
  const handleScheduleDayToggle = (day) => {
    setDoctorSchedule((previous) =>
      previous.map((item) => {
        if (item.day_of_week !== day) {
          return item;
        }

        const nextAvailable = !item.is_available;

        return {
          ...item,

          is_available: nextAvailable,

          time_windows: nextAvailable
            ? Array.isArray(item.time_windows) && item.time_windows.length > 0
              ? item.time_windows
              : [
                  {
                    start_time: "10:00 AM",
                    end_time: "12:00 PM",
                  },
                ]
            : [],
        };
      }),
    );

    setScheduleError("");
    setScheduleSuccess("");
  };

  /**
   * Update the start/end time of one session.
   *
   * Example:
   * Monday -> Session 1 -> start_time -> 09:00 AM
   */
  const handleScheduleWindowChange = (day, windowIndex, field, value) => {
    setDoctorSchedule((previous) =>
      previous.map((item) => {
        if (item.day_of_week !== day) {
          return item;
        }

        const windows = [...(item.time_windows || [])];

        windows[windowIndex] = {
          ...windows[windowIndex],
          [field]: value,
        };

        return {
          ...item,
          time_windows: windows,
        };
      }),
    );

    setScheduleError("");
    setScheduleSuccess("");
  };

  /**
   * Add another consultation session to a day.
   *
   * Example:
   * Morning 10 AM - 12 PM
   * Evening 6 PM - 10 PM
   */
  const handleAddScheduleWindow = (day) => {
    setDoctorSchedule((previous) =>
      previous.map((item) => {
        if (item.day_of_week !== day) {
          return item;
        }

        return {
          ...item,

          is_available: true,

          time_windows: [
            ...(item.time_windows || []),

            {
              start_time: "06:00 PM",

              end_time: "10:00 PM",
            },
          ],
        };
      }),
    );

    setScheduleError("");
    setScheduleSuccess("");
  };

  /**
   * Remove one consultation session.
   *
   * An available day must keep at least
   * one consultation session.
   */
  const handleRemoveScheduleWindow = (day, windowIndex) => {
    setDoctorSchedule((previous) =>
      previous.map((item) => {
        if (item.day_of_week !== day) {
          return item;
        }

        const windows = item.time_windows || [];

        /*
         * Keep at least one consultation
         * session on an available day.
         */
        if (windows.length <= 1) {
          return item;
        }

        return {
          ...item,

          time_windows: windows.filter((_, index) => index !== windowIndex),
        };
      }),
    );

    setScheduleError("");
    setScheduleSuccess("");
  };

  /**
   * Persist Monday-Sunday doctor availability.
   */
  const handleSaveDoctorSchedule = async () => {
    if (!scheduleDoctor) {
      return;
    }

    const doctorId = scheduleDoctor.doctorId || scheduleDoctor.memberId;

    setScheduleSaving(true);

    setScheduleError("");

    setScheduleSuccess("");

    try {
      const response = await fetch(
        `${API_BASE}/hospital-admin/doctors/${doctorId}/availability`,
        {
          method: "PUT",

          headers: getAuthHeaders(),

          body: JSON.stringify({
            schedule: doctorSchedule.map((item) => ({
              day_of_week: item.day_of_week,

              is_available: Boolean(item.is_available),

              time_windows: item.is_available
                ? (item.time_windows || []).map((window) => ({
                    start_time: window.start_time,

                    end_time: window.end_time,
                  }))
                : [],
            })),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to save doctor schedule.");
      }

      if (Array.isArray(data.availability)) {
        setDoctorSchedule(data.availability);
      }

      setScheduleSuccess("Weekly doctor schedule saved successfully.");
    } catch (err) {
      console.error("[HospitalAdmin] Save doctor schedule error:", err);

      setScheduleError(err.message || "Failed to save doctor schedule.");
    } finally {
      setScheduleSaving(false);
    }
  };

  /**
   * Add or update one doctor unavailable date.
   */
  const handleAddDoctorBlockedDate = async (event) => {
    event.preventDefault();

    if (!scheduleDoctor || !blockDateForm.date) {
      setScheduleError("Please select a date to block.");

      return;
    }

    const doctorId = scheduleDoctor.doctorId || scheduleDoctor.memberId;

    setBlockDateLoading(true);

    setScheduleError("");

    setScheduleSuccess("");

    try {
      const response = await fetch(
        `${API_BASE}/hospital-admin/doctors/${doctorId}/blocked-dates`,
        {
          method: "POST",

          headers: getAuthHeaders(),

          body: JSON.stringify({
            date: blockDateForm.date,

            reason: blockDateForm.reason.trim() || "Leave / Blocked",
          }),
        },
      );

      const data = await response.json();

      console.log("[Block Date] HTTP status:", response.status);

      console.log("[Block Date] Backend response:", data);

      console.log("[Block Date] Sent payload:", {
        doctorId,
        date: blockDateForm.date,
        reason: blockDateForm.reason.trim() || "Leave / Blocked",
      });

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to block doctor date.");
      }

      if (data.blockedDate) {
        setDoctorBlockedDates((previous) => {
          /*
           * Remove an older copy of the
           * same date before adding the
           * latest backend response.
           */
          const filtered = previous.filter(
            (item) =>
              item.id !== data.blockedDate.id &&
              item.blocked_date !== data.blockedDate.blocked_date,
          );

          return [...filtered, data.blockedDate].sort((a, b) =>
            String(a.blocked_date).localeCompare(String(b.blocked_date)),
          );
        });
      }

      setBlockDateForm({
        date: "",
        reason: "",
      });

      setScheduleSuccess("Unavailable date added successfully.");
    } catch (err) {
      console.error("[HospitalAdmin] Add blocked date error:", err);

      setScheduleError(err.message || "Failed to add unavailable date.");
    } finally {
      setBlockDateLoading(false);
    }
  };

  /**
   * Remove one doctor unavailable date.
   */
  const handleDeleteDoctorBlockedDate = async (blockedDateId) => {
    if (!scheduleDoctor || !blockedDateId) {
      return;
    }

    const doctorId = scheduleDoctor.doctorId || scheduleDoctor.memberId;

    setScheduleError("");

    setScheduleSuccess("");

    try {
      const response = await fetch(
        `${API_BASE}/hospital-admin/doctors/${doctorId}/blocked-dates/${blockedDateId}`,
        {
          method: "DELETE",

          headers: getAuthHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to remove blocked date.");
      }

      setDoctorBlockedDates((previous) =>
        previous.filter((item) => item.id !== blockedDateId),
      );

      setScheduleSuccess("Unavailable date removed successfully.");
    } catch (err) {
      console.error("[HospitalAdmin] Delete blocked date error:", err);

      setScheduleError(err.message || "Failed to remove unavailable date.");
    }
  };

  /**
   * Close and reset Schedule modal.
   *
   * No database operation occurs here.
   */
  const closeDoctorScheduleModal = () => {
    setShowScheduleModal(false);

    setScheduleDoctor(null);

    setDoctorSchedule([]);

    setDoctorBlockedDates([]);

    setScheduleError("");

    setScheduleSuccess("");

    setBlockDateForm({
      date: "",
      reason: "",
    });
  };

  // -------------------------------------------------------------------------
  // Fetch Doctor Patients Summary
  // -------------------------------------------------------------------------
  const fetchDoctorPatients = async (doctor) => {
    if (!doctor?.doctorId) {
      return;
    }

    setSelectedDoctorId(doctor.doctorId);
    setShowDoctorPatients(true);
    setDoctorPatientsLoading(true);
    setDoctorPatientsError("");
    setSelectedDoctorPatients(null);

    try {
      const res = await fetch(
        `${API_BASE}/hospital-admin/doctors/${doctor.doctorId}/patients`,
        {
          headers: getAuthHeaders(),
        },
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "Failed to load doctor patient information.",
        );
      }

      setSelectedDoctorPatients(data);
    } catch (err) {
      console.error("Error fetching doctor patients:", err);

      setDoctorPatientsError(err.message || "Failed to load doctor patients.");
    } finally {
      setDoctorPatientsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Close Doctor Patients Modal
  // -------------------------------------------------------------------------
  const closeDoctorPatients = () => {
    setShowDoctorPatients(false);
    setSelectedDoctorId(null);
    setSelectedDoctorPatients(null);
    setDoctorPatientsError("");
    setDoctorPatientsLoading(false);
  };

  const fetchStaff = async () => {
    try {
      const res = await fetch(`${API_BASE}/hospital-admin/staff`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setStaffList(data.staff || []);
      }
    } catch (err) {
      console.warn("Error fetching staff:", err);
    }
  };

  /**
   * Fetch patients belonging to the authenticated Hospital Admin's hospital.
   *
   * The backend determines hospital scope using req.context.hospitalId.
   * The frontend does not decide which hospital's patients can be returned.
   */
  const fetchHospitalPatients = async () => {
    setPatientsLoading(true);
    setPatientsError("");

    try {
      const res = await fetch(`${API_BASE}/hospital-admin/patients`, {
        headers: getAuthHeaders(),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load hospital patients.");
      }

      setHospitalPatients(data.patients || []);
    } catch (err) {
      console.warn("Error fetching hospital patients:", err);

      setPatientsError(err.message || "Failed to load hospital patients.");
    } finally {
      setPatientsLoading(false);
    }
  };

  /**
   * Fetch complete operational details for one hospital-scoped patient.
   *
   * Backend security still validates:
   * hospital_patient_records.id + req.context.hospitalId
   *
   * This frontend does not decide hospital authorization.
   */
  const fetchHospitalPatientDetails = async (hospitalPatientId) => {
    if (!hospitalPatientId) {
      return;
    }
    setSelectedHospitalPatientId(hospitalPatientId);
    setShowPatientDetails(true);
    setPatientDetailsLoading(true);
    setPatientDetailsError("");
    setSelectedPatientDetails(null);

    try {
      const res = await fetch(
        `${API_BASE}/hospital-admin/patients/${hospitalPatientId}`,
        {
          headers: getAuthHeaders(),
        },
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load patient details.");
      }

      setSelectedPatientDetails(data);
    } catch (err) {
      console.warn("Error fetching hospital patient details:", err);

      setPatientDetailsError(err.message || "Failed to load patient details.");
    } finally {
      setPatientDetailsLoading(false);
    }
  };

  /**
   * Refresh an already-open patient details modal.
   *
   * Unlike the initial fetch:
   * - does not clear existing data
   * - does not show the full loading screen
   * - silently replaces the operational details
   *
   * Useful for:
   * waiting duration
   * consultation duration
   * status changes
   */
  const refreshOpenPatientDetails = async (hospitalPatientId) => {
    if (!hospitalPatientId) {
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/hospital-admin/patients/${hospitalPatientId}`,
        {
          headers: getAuthHeaders(),
        },
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to refresh patient details.");
      }

      setSelectedPatientDetails(data);
    } catch (err) {
      /*
       * Do not destroy the currently visible modal if a
       * background refresh temporarily fails.
       */
      console.warn("Patient details auto-refresh warning:", err);
    }
  };

  const closePatientDetails = () => {
    setShowPatientDetails(false);

    setSelectedPatientDetails(null);

    setSelectedHospitalPatientId(null);

    setPatientDetailsError("");
  };
  const fetchHospitalProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/hospital-admin/hospital`, {
        headers: getAuthHeaders(),
      });
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
      const res = await fetch(`${API_BASE}/hospital-admin/audit-logs`, {
        headers: getAuthHeaders(),
      });
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
        type: "error",
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
          gender: docGender,
        }),
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
        setShowDoctorPatients(false);
        setSelectedDoctorPatients(null);
        setSelectedDoctorId(null);
        setDoctorPatientsError("");

        fetchDoctors();
        fetchStats();
      } else {
        setMessage({
          text: data.message || "Failed to create doctor account.",
          type: "error",
        });
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
        type: "error",
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
          staffRole: staffRole,
        }),
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
        setMessage({
          text: data.message || "Failed to create staff account.",
          type: "error",
        });
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
      const res = await fetch(
        `${API_BASE}/hospital-admin/doctors/${editingDoctor.doctorId || editingDoctor.memberId}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            fullName: docFullName,
            phone: docPhone,
            specialization: docSpecialization,
            qualification: docQualification,
            registrationNumber: docRegNumber,
          }),
        },
      );

      const data = await res.json();
      if (data.success) {
        setShowEditDoctorModal(false);
        setEditingDoctor(null);
        fetchDoctors();
        fetchStats();
      } else {
        setMessage({
          text: data.message || "Failed to update doctor profile.",
          type: "error",
        });
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
      const res = await fetch(
        `${API_BASE}/hospital-admin/staff/${editingStaff.memberId}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            fullName: staffFullName,
            phone: staffPhone,
            staffRole: staffRole,
          }),
        },
      );

      const data = await res.json();
      if (data.success) {
        setShowEditStaffModal(false);
        setEditingStaff(null);
        fetchStaff();
        fetchStats();
      } else {
        setMessage({
          text: data.message || "Failed to update staff profile.",
          type: "error",
        });
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
          state: hospState,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowEditHospitalModal(false);
        fetchHospitalProfile();
        fetchStats();
      } else {
        setMessage({
          text: data.message || "Failed to update hospital profile.",
          type: "error",
        });
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
      const endpoint =
        memberType === "doctor"
          ? `${API_BASE}/hospital-admin/doctors/${member.doctorId || member.memberId}/status`
          : `${API_BASE}/hospital-admin/staff/${member.memberId}/status`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusConfirmModal({
          show: false,
          memberType: "doctor",
          member: null,
          targetStatus: "inactive",
        });
        if (memberType === "doctor") fetchDoctors();
        else fetchStaff();
        fetchStats();
      } else {
        setMessage({
          text: data.message || "Status update failed.",
          type: "error",
        });
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
  const filteredDoctors = doctorsList.filter((d) => {
    const matchesSearch =
      doctorSearch === "" ||
      (d.fullName &&
        d.fullName.toLowerCase().includes(doctorSearch.toLowerCase())) ||
      (d.email && d.email.toLowerCase().includes(doctorSearch.toLowerCase())) ||
      (d.specialization &&
        d.specialization.toLowerCase().includes(doctorSearch.toLowerCase()));
    const matchesStatus =
      doctorStatusFilter === "all" || d.status === doctorStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredStaff = staffList.filter((s) => {
    const matchesSearch =
      staffSearch === "" ||
      (s.fullName &&
        s.fullName.toLowerCase().includes(staffSearch.toLowerCase())) ||
      (s.email && s.email.toLowerCase().includes(staffSearch.toLowerCase())) ||
      (s.staffRole &&
        s.staffRole.toLowerCase().includes(staffSearch.toLowerCase()));
    const matchesRole =
      staffRoleFilter === "all" || s.staffRole === staffRoleFilter;
    const matchesStatus =
      staffStatusFilter === "all" || s.status === staffStatusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const adminName =
    currentUser?.fullName ||
    currentUser?.doctor_name ||
    "Hospital Administrator";
  const hospitalNameDisplay =
    currentUser?.hospitalName ||
    currentUser?.hospital_name ||
    stats.hospitalName ||
    hospitalInfo?.name ||
    "Doctors Vedika Hospital";
  // -------------------------------------------------------------------------
  // Patient Card Display Helpers
  // -------------------------------------------------------------------------

  /**
   * Convert database status values into readable labels.
   *
   * Example:
   * in_consultation -> In Consultation
   */
  const formatPatientStatus = (status) => {
    const normalized = String(status || "registered")
      .trim()
      .toLowerCase();

    const labels = {
      registered: "Registered",
      scheduled: "Scheduled",
      checked_in: "Checked In",
      waiting: "Waiting",
      in_consultation: "In Consultation",
      completed: "Completed",
      exited: "Completed",
      cancelled: "Cancelled",
      canceled: "Cancelled",
    };

    return labels[normalized] || "Registered";
  };

  /**
   * Badge styling for the patient's current operational state.
   */
  const getPatientStatusStyle = (status) => {
    const normalized = String(status || "")
      .trim()
      .toLowerCase();

    if (normalized === "completed" || normalized === "exited") {
      return {
        backgroundColor: "#dcfce7",
        color: "#15803d",
      };
    }

    if (normalized === "cancelled" || normalized === "canceled") {
      return {
        backgroundColor: "#fee2e2",
        color: "#dc2626",
      };
    }

    if (normalized === "waiting" || normalized === "checked_in") {
      return {
        backgroundColor: "#fef3c7",
        color: "#b45309",
      };
    }

    if (normalized === "in_consultation") {
      return {
        backgroundColor: "#dbeafe",
        color: "#1d4ed8",
      };
    }

    return {
      backgroundColor: "#f1f5f9",
      color: "#475569",
    };
  };

  /**
   * Keep phone formatting simple for now.
   * We preserve the value supplied by the production API.
   */
  const formatPatientPhone = (phone) => {
    if (!phone) {
      return "Not available";
    }

    return phone;
  };

  /**
   * Format a PostgreSQL timestamp in India time.
   */
  const formatPatientDateTime = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  /**
   * Format appointment-only date.
   */
  const formatPatientDate = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /**
   * Format a duration stored in minutes.
   */
  const formatPatientDuration = (minutes) => {
    if (minutes === null || minutes === undefined) {
      return "—";
    }

    const totalMinutes = Number(minutes);

    if (!Number.isFinite(totalMinutes)) {
      return "—";
    }

    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }

    const hours = Math.floor(totalMinutes / 60);

    const remainingMinutes = totalMinutes % 60;

    if (remainingMinutes === 0) {
      return `${hours} hr`;
    }

    return `${hours} hr ${remainingMinutes} min`;
  };
  /*
   * ========================================================================
   * LIVE PATIENT DETAILS REFRESH
   * ========================================================================
   *
   * While Hospital Admin is viewing one patient's operational details,
   * refresh the backend data once every minute.
   *
   * This keeps:
   * - waiting duration
   * - consultation duration
   * - patient stage/status
   * - completed timestamps
   *
   * reasonably current without any database write.
   */
  useEffect(() => {
    if (!showPatientDetails || !selectedHospitalPatientId) {
      return undefined;
    }

    const refreshInterval = setInterval(() => {
      refreshOpenPatientDetails(selectedHospitalPatientId);
    }, 60 * 1000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [showPatientDetails, selectedHospitalPatientId]);
  return (
    <DashboardLayout
      activePage="admin"
      searchPlaceholder="Search hospital doctors, staff members, profile..."
    >
      <div
        style={{
          padding: "24px 32px",
          width: "100%",
          maxWidth: "none",
          boxSizing: "border-box",
        }}
      >
        {/* =========================================================================
                    NOTIFICATION MESSAGES
                ========================================================================= */}
        {message.text && (
          <div
            style={{
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
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <i
                className={`fa-solid ${message.type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}`}
              ></i>
              {message.text}
            </div>
            <button
              onClick={() => setMessage({ text: "", type: "" })}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
              }}
            >
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
            <div
              style={{
                padding: "28px 32px",
                marginBottom: "28px",
                borderRadius: "16px",
                background:
                  "linear-gradient(135deg, #0b1c2d 0%, #08265F 55%, #08AEB8 100%)",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 10px 25px rgba(11, 28, 45, 0.12)",
                flexWrap: "wrap",
                gap: "20px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    color: "#5eead4",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "4px",
                  }}
                >
                  HOSPITAL ADMINISTRATOR
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: "1.75rem",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Good Morning, {adminName}
                </h1>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: "0.9rem",
                    color: "#cbd5e1",
                  }}
                >
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
                    boxShadow: "0 4px 12px rgba(8, 174, 184, 0.3)",
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
                    gap: "8px",
                  }}
                >
                  <i className="fa-solid fa-user-plus"></i> + Add Staff
                </button>
              </div>
            </div>

            {/* Summary Cards Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "20px",
                marginBottom: "32px",
              }}
            >
              {/* Total Doctors */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "24px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "#64748b",
                    }}
                  >
                    Total Doctors
                  </span>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      backgroundColor: "#e0f2fe",
                      color: "#0284c7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-user-md"></i>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "2.1rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                    lineHeight: "1",
                  }}
                >
                  {stats.totalDoctors}
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#059669",
                    fontWeight: 600,
                    marginTop: "8px",
                  }}
                >
                  <i className="fa-solid fa-circle-check"></i> Registered
                  Medical Practitioners
                </div>
              </div>

              {/* Active Doctors */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "24px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "#64748b",
                    }}
                  >
                    Active Doctors
                  </span>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      backgroundColor: "#dcfce7",
                      color: "#16a34a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-stethoscope"></i>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "2.1rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                    lineHeight: "1",
                  }}
                >
                  {stats.activeDoctors}
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#64748b",
                    fontWeight: 600,
                    marginTop: "8px",
                  }}
                >
                  Active consultation authorizations
                </div>
              </div>

              {/* Total Staff */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "24px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "#64748b",
                    }}
                  >
                    Total Staff
                  </span>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      backgroundColor: "#f3e8ff",
                      color: "#9333ea",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-users-gear"></i>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "2.1rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                    lineHeight: "1",
                  }}
                >
                  {stats.totalStaff}
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#64748b",
                    fontWeight: 600,
                    marginTop: "8px",
                  }}
                >
                  Reception, Nursing & Support Staff
                </div>
              </div>

              {/* Active Staff */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "24px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "#64748b",
                    }}
                  >
                    Active Staff
                  </span>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      backgroundColor: "#ccfbf1",
                      color: "#0d9488",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-user-check"></i>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "2.1rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                    lineHeight: "1",
                  }}
                >
                  {stats.activeStaff}
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#0d9488",
                    fontWeight: 600,
                    marginTop: "8px",
                  }}
                >
                  Active staff portal permissions
                </div>
              </div>
            </div>

            {/* Two Column Layout: Doctors Overview & Staff Overview */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "28px",
              }}
            >
              {/* DOCTORS OVERVIEW */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "24px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                      }}
                    >
                      Doctors Overview
                    </h3>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "0.8rem",
                        color: "#64748b",
                      }}
                    >
                      Medical practitioners registered in hospital
                    </p>
                  </div>
                  <button
                    onClick={() => handleTabChange("doctors")}
                    style={{
                      backgroundColor: "#f1f5f9",
                      color: "#08AEB8",
                      border: "none",
                      padding: "6px 14px",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    View All Doctors{" "}
                    <i
                      className="fa-solid fa-arrow-right"
                      style={{ marginLeft: "4px" }}
                    ></i>
                  </button>
                </div>

                {recentDoctors.length === 0 ? (
                  <div
                    style={{
                      padding: "30px",
                      textAlign: "center",
                      color: "#94a3b8",
                      fontSize: "0.88rem",
                    }}
                  >
                    No doctors added yet. Click <strong>+ Add Doctor</strong> to
                    create an account.
                  </div>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.85rem",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          textTransform: "uppercase",
                          fontSize: "0.72rem",
                          color: "#64748b",
                          letterSpacing: "0.05em",
                        }}
                      >
                        <th style={{ textAlign: "left", padding: "10px 8px" }}>
                          Doctor
                        </th>
                        <th style={{ textAlign: "left", padding: "10px 8px" }}>
                          Specialization
                        </th>
                        <th
                          style={{ textAlign: "center", padding: "10px 8px" }}
                        >
                          Status
                        </th>
                        <th style={{ textAlign: "right", padding: "10px 8px" }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDoctors.map((doc) => (
                        <tr
                          key={doc.memberId}
                          style={{ borderBottom: "1px solid #f1f5f9" }}
                        >
                          <td
                            style={{
                              padding: "12px 8px",
                              fontWeight: 700,
                              color: "#0b1c2d",
                            }}
                          >
                            {doc.fullName}
                          </td>
                          <td style={{ padding: "12px 8px", color: "#475569" }}>
                            {doc.specialization}
                          </td>
                          <td
                            style={{ padding: "12px 8px", textAlign: "center" }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 8px",
                                borderRadius: "12px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                backgroundColor:
                                  doc.status === "active"
                                    ? "#dcfce7"
                                    : "#f1f5f9",
                                color:
                                  doc.status === "active"
                                    ? "#15803d"
                                    : "#64748b",
                              }}
                            >
                              {doc.status}
                            </span>
                          </td>
                          <td
                            style={{ padding: "12px 8px", textAlign: "right" }}
                          >
                            <button
                              onClick={() =>
                                setViewMemberModal({
                                  show: true,
                                  memberType: "doctor",
                                  member: doc,
                                })
                              }
                              style={{
                                background: "none",
                                border: "none",
                                color: "#08AEB8",
                                fontWeight: 700,
                                cursor: "pointer",
                                fontSize: "0.8rem",
                              }}
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
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  padding: "24px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                      }}
                    >
                      Staff Overview
                    </h3>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "0.8rem",
                        color: "#64748b",
                      }}
                    >
                      Reception, nursing, and clinical staff
                    </p>
                  </div>
                  <button
                    onClick={() => handleTabChange("staff")}
                    style={{
                      backgroundColor: "#f1f5f9",
                      color: "#08AEB8",
                      border: "none",
                      padding: "6px 14px",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    View All Staff{" "}
                    <i
                      className="fa-solid fa-arrow-right"
                      style={{ marginLeft: "4px" }}
                    ></i>
                  </button>
                </div>

                {recentStaff.length === 0 ? (
                  <div
                    style={{
                      padding: "30px",
                      textAlign: "center",
                      color: "#94a3b8",
                      fontSize: "0.88rem",
                    }}
                  >
                    No staff accounts created yet. Click{" "}
                    <strong>+ Add Staff</strong> to create one.
                  </div>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.85rem",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          textTransform: "uppercase",
                          fontSize: "0.72rem",
                          color: "#64748b",
                          letterSpacing: "0.05em",
                        }}
                      >
                        <th style={{ textAlign: "left", padding: "10px 8px" }}>
                          Name
                        </th>
                        <th style={{ textAlign: "left", padding: "10px 8px" }}>
                          Role
                        </th>
                        <th
                          style={{ textAlign: "center", padding: "10px 8px" }}
                        >
                          Status
                        </th>
                        <th style={{ textAlign: "right", padding: "10px 8px" }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentStaff.map((stf) => (
                        <tr
                          key={stf.memberId}
                          style={{ borderBottom: "1px solid #f1f5f9" }}
                        >
                          <td
                            style={{
                              padding: "12px 8px",
                              fontWeight: 700,
                              color: "#0b1c2d",
                            }}
                          >
                            {stf.fullName}
                          </td>
                          <td style={{ padding: "12px 8px", color: "#475569" }}>
                            {stf.staffRole}
                          </td>
                          <td
                            style={{ padding: "12px 8px", textAlign: "center" }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 8px",
                                borderRadius: "12px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                backgroundColor:
                                  stf.status === "active"
                                    ? "#dcfce7"
                                    : "#f1f5f9",
                                color:
                                  stf.status === "active"
                                    ? "#15803d"
                                    : "#64748b",
                              }}
                            >
                              {stf.status}
                            </span>
                          </td>
                          <td
                            style={{ padding: "12px 8px", textAlign: "right" }}
                          >
                            <button
                              onClick={() =>
                                setViewMemberModal({
                                  show: true,
                                  memberType: "staff",
                                  member: stf,
                                })
                              }
                              style={{
                                background: "none",
                                border: "none",
                                color: "#08AEB8",
                                fontWeight: 700,
                                cursor: "pointer",
                                fontSize: "0.8rem",
                              }}
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
    TAB 2: PATIENT MANAGEMENT

    Hospital-scoped, read-only patient cards.

    Detailed patient journey/history will be connected to
    the View Details button in the next step.
------------------------------------------------------------------- */}
        {activeTab === "patients" && (
          <div>
            {/* ============================================================
            PATIENTS HEADER
        ============================================================ */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "24px 28px",
                marginBottom: "22px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.45rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                  }}
                >
                  Patients
                </h2>

                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: "0.86rem",
                    color: "#64748b",
                  }}
                >
                  View patients associated with {hospitalNameDisplay}.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                {/* Patient count */}
                <div
                  style={{
                    padding: "9px 14px",
                    borderRadius: "10px",
                    backgroundColor: "#f1f5f9",
                    color: "#475569",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                  }}
                >
                  {hospitalPatients.length} Patients
                </div>

                {/* Manual refresh */}
                <button
                  type="button"
                  onClick={fetchHospitalPatients}
                  disabled={patientsLoading}
                  style={{
                    border: "none",
                    backgroundColor: "#0b1c2d",
                    color: "#ffffff",
                    borderRadius: "10px",
                    padding: "10px 16px",
                    fontSize: "0.84rem",
                    fontWeight: 700,
                    cursor: patientsLoading ? "not-allowed" : "pointer",
                    opacity: patientsLoading ? 0.7 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <i
                    className={`fa-solid ${
                      patientsLoading ? "fa-spinner fa-spin" : "fa-rotate"
                    }`}
                  ></i>
                  Refresh
                </button>
              </div>
            </div>

            {/* ============================================================
            PATIENT API ERROR
        ============================================================ */}
            {patientsError && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "14px 18px",
                  borderRadius: "10px",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                <i
                  className="fa-solid fa-circle-exclamation"
                  style={{
                    marginRight: "8px",
                  }}
                ></i>

                {patientsError}
              </div>
            )}

            {/* ============================================================
            LOADING
        ============================================================ */}
            {patientsLoading && hospitalPatients.length === 0 ? (
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  padding: "60px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                <i
                  className="fa-solid fa-spinner fa-spin"
                  style={{
                    display: "block",
                    fontSize: "2rem",
                    color: "#08AEB8",
                    marginBottom: "12px",
                  }}
                ></i>
                Loading hospital patients...
              </div>
            ) : hospitalPatients.length === 0 ? (
              /* ========================================================
                EMPTY STATE
            ======================================================== */
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  padding: "60px",
                  textAlign: "center",
                }}
              >
                <i
                  className="fa-solid fa-hospital-user"
                  style={{
                    display: "block",
                    fontSize: "2.5rem",
                    color: "#94a3b8",
                    marginBottom: "12px",
                  }}
                ></i>

                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 800,
                    color: "#334155",
                  }}
                >
                  No Patients Found
                </div>

                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: "0.84rem",
                    color: "#64748b",
                  }}
                >
                  No patients are currently associated with this hospital.
                </p>
              </div>
            ) : (
              /* ========================================================
                PATIENT CARD GRID
            ======================================================== */
              <div
                style={{
                  display: "grid",

                  /*
                   * Three cards on a typical desktop.
                   * CSS automatically reduces columns on
                   * smaller widths.
                   */
                  gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",

                  gap: "20px",
                }}
              >
                {hospitalPatients.map((patient) => {
                  const statusStyle = getPatientStatusStyle(
                    patient.currentStatus,
                  );

                  const doctor = patient.assignedDoctor;

                  return (
                    <div
                      key={patient.hospitalPatientId}
                      style={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "18px",
                        padding: "22px",
                        boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "18px",
                      }}
                    >
                      {/* ========================================
                                PATIENT IDENTITY
                            ======================================== */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "14px",
                          alignItems: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "13px",
                            minWidth: 0,
                          }}
                        >
                          {/* Patient icon */}
                          <div
                            style={{
                              width: "54px",
                              height: "54px",
                              borderRadius: "14px",
                              backgroundColor: "#dff7f8",
                              color: "#08AEB8",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              fontSize: "1.25rem",
                            }}
                          >
                            <i className="fa-solid fa-user"></i>
                          </div>

                          <div
                            style={{
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: "1.05rem",
                                fontWeight: 800,
                                color: "#0b1c2d",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={patient.fullName}
                            >
                              {patient.fullName || "Patient"}
                            </div>

                            <div
                              style={{
                                marginTop: "3px",
                                fontSize: "0.8rem",
                                color: "#64748b",
                                fontWeight: 600,
                              }}
                            >
                              {patient.patientCode || "N/A"}
                            </div>
                          </div>
                        </div>

                        {/* Status */}
                        <span
                          style={{
                            padding: "6px 11px",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            ...statusStyle,
                          }}
                        >
                          {formatPatientStatus(patient.currentStatus)}
                        </span>
                      </div>

                      {/* ========================================
                                AGE / GENDER / PHONE
                            ======================================== */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              color: "#94a3b8",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              marginBottom: "4px",
                            }}
                          >
                            Patient
                          </div>

                          <div
                            style={{
                              fontSize: "0.86rem",
                              color: "#334155",
                              fontWeight: 600,
                            }}
                          >
                            {patient.age !== null && patient.age !== undefined
                              ? `${patient.age} yrs`
                              : "Age N/A"}

                            {patient.gender ? ` • ${patient.gender}` : ""}
                          </div>
                        </div>

                        <div>
                          <div
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              color: "#94a3b8",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              marginBottom: "4px",
                            }}
                          >
                            Phone
                          </div>

                          <div
                            style={{
                              fontSize: "0.86rem",
                              color: "#334155",
                              fontWeight: 600,
                              wordBreak: "break-word",
                            }}
                          >
                            {formatPatientPhone(patient.phone)}
                          </div>
                        </div>
                      </div>

                      {/* ========================================
                                ASSIGNED DOCTOR
                            ======================================== */}
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: "12px",
                          backgroundColor: "#f8fafc",
                          border: "1px solid #f1f5f9",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.68rem",
                            color: "#94a3b8",
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: "5px",
                          }}
                        >
                          Assigned Doctor
                        </div>

                        {doctor ? (
                          <>
                            <div
                              style={{
                                fontSize: "0.9rem",
                                fontWeight: 800,
                                color: "#0b1c2d",
                              }}
                            >
                              {doctor.name}
                            </div>

                            <div
                              style={{
                                marginTop: "3px",
                                fontSize: "0.78rem",
                                color: "#64748b",
                                lineHeight: 1.4,
                              }}
                            >
                              {doctor.specialization || "Not specified"}
                            </div>
                          </>
                        ) : (
                          <div
                            style={{
                              fontSize: "0.84rem",
                              color: "#64748b",
                              fontWeight: 600,
                            }}
                          >
                            No doctor assigned
                          </div>
                        )}
                      </div>

                      {/* ========================================
                                LATEST APPOINTMENT / VISIT
                            ======================================== */}
                      {(patient.latestAppointment || patient.latestVisit) && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            color: "#64748b",
                            fontSize: "0.78rem",
                          }}
                        >
                          <div>
                            <i
                              className="fa-regular fa-calendar"
                              style={{
                                marginRight: "6px",
                                color: "#08AEB8",
                              }}
                            ></i>

                            {patient.latestAppointment?.date ||
                              "Visit recorded"}
                          </div>

                          {patient.latestAppointment?.time && (
                            <div>
                              <i
                                className="fa-regular fa-clock"
                                style={{
                                  marginRight: "6px",
                                }}
                              ></i>

                              {patient.latestAppointment.time}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ========================================
                                VIEW DETAILS
                            ======================================== */}
                      <button
                        type="button"
                        /*
                         * In the next step this will open the
                         * complete operational patient details.
                         *
                         * For now the button is intentionally
                         * UI-only.
                         */
                        onClick={() =>
                          fetchHospitalPatientDetails(patient.hospitalPatientId)
                        }
                        style={{
                          width: "100%",
                          marginTop: "auto",
                          border: "none",
                          borderRadius: "11px",
                          padding: "11px 16px",
                          backgroundColor: "#08AEB8",
                          color: "#ffffff",
                          fontSize: "0.86rem",
                          fontWeight: 800,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          boxShadow: "0 3px 10px rgba(8,174,184,0.18)",
                        }}
                      >
                        <i className="fa-regular fa-eye"></i>
                        View Details
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {/* ================================================================
    PATIENT DETAILS MODAL
================================================================ */}
            {showPatientDetails &&
              createPortal(
                <div
                  onClick={closePatientDetails}
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 99999,

                    /*
                     * Full-screen overlay.
                     * Portal keeps the Hospital Admin top navbar
                     * from overlapping the modal.
                     */
                    backgroundColor: "rgba(15, 23, 42, 0.60)",

                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",

                    padding: "24px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      width: "min(1000px, 100%)",
                      maxHeight: "calc(100vh - 48px)",

                      backgroundColor: "#ffffff",
                      borderRadius: "22px",

                      boxShadow: "0 25px 70px rgba(15, 23, 42, 0.30)",

                      overflow: "hidden",

                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* ====================================================
    MODAL HEADER
==================================================== */}
                    <div
                      style={{
                        flexShrink: 0,
                        padding: "20px 26px",
                        borderBottom: "1px solid #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "#ffffff",
                      }}
                    >
                      {/* Left side: title */}
                      <div>
                        <h2
                          style={{
                            margin: 0,
                            fontSize: "1.3rem",
                            fontWeight: 800,
                            color: "#0b1c2d",
                          }}
                        >
                          Patient Details
                        </h2>

                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: "0.82rem",
                            color: "#64748b",
                          }}
                        >
                          Complete operational hospital journey
                        </p>
                      </div>

                      {/* Right side: refresh + close */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        {/* Refresh latest operational information */}
                        <button
                          type="button"
                          onClick={() =>
                            refreshOpenPatientDetails(selectedHospitalPatientId)
                          }
                          disabled={!selectedHospitalPatientId}
                          title="Refresh patient details"
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "12px",
                            border: "1px solid #e2e8f0",
                            backgroundColor: "#f8fafc",
                            color: "#08AEB8",
                            cursor: selectedHospitalPatientId
                              ? "pointer"
                              : "not-allowed",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <i className="fa-solid fa-rotate"></i>
                        </button>

                        {/* Close modal */}
                        <button
                          type="button"
                          onClick={closePatientDetails}
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "12px",
                            border: "1px solid #e2e8f0",
                            backgroundColor: "#f8fafc",
                            color: "#475569",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1rem",
                          }}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                    </div>

                    {/* ====================================================
    SCROLLABLE MODAL BODY
==================================================== */}
                    <div
                      style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "24px 26px 28px",
                        backgroundColor: "#f8fafc",
                      }}
                    >
                      {/* =================================================
                        LOADING
                    ================================================= */}
                      {patientDetailsLoading && (
                        <div
                          style={{
                            minHeight: "350px",

                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",

                            color: "#64748b",
                          }}
                        >
                          <i
                            className="fa-solid fa-spinner fa-spin"
                            style={{
                              fontSize: "2rem",
                              color: "#08AEB8",
                              marginBottom: "14px",
                            }}
                          ></i>
                          Loading patient details...
                        </div>
                      )}

                      {/* =================================================
                        ERROR
                    ================================================= */}
                      {!patientDetailsLoading && patientDetailsError && (
                        <div
                          style={{
                            padding: "16px 18px",

                            borderRadius: "12px",

                            backgroundColor: "#fef2f2",
                            border: "1px solid #fecaca",

                            color: "#991b1b",

                            fontSize: "0.86rem",
                            fontWeight: 600,
                          }}
                        >
                          <i
                            className="fa-solid fa-circle-exclamation"
                            style={{
                              marginRight: "8px",
                            }}
                          ></i>

                          {patientDetailsError}
                        </div>
                      )}

                      {/* =================================================
                        PATIENT DETAILS CONTENT
                    ================================================= */}
                      {!patientDetailsLoading &&
                        !patientDetailsError &&
                        selectedPatientDetails &&
                        (() => {
                          const details = selectedPatientDetails;

                          const patient = details.patient || {};

                          const summary = details.summary || {};

                          const latestVisit = details.latestVisit || null;

                          const visitHistory = details.visitHistory || [];

                          const statusStyle = getPatientStatusStyle(
                            summary.currentStatus,
                          );

                          return (
                            <>
                              {/* =====================================
                                        PATIENT PROFILE CARD
                                    ===================================== */}
                              <div
                                style={{
                                  backgroundColor: "#ffffff",

                                  borderRadius: "16px",

                                  border: "1px solid #e2e8f0",

                                  padding: "20px",

                                  marginBottom: "18px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",

                                    justifyContent: "space-between",

                                    alignItems: "center",

                                    gap: "20px",

                                    flexWrap: "wrap",
                                  }}
                                >
                                  {/* Patient */}
                                  <div
                                    style={{
                                      display: "flex",

                                      alignItems: "center",

                                      gap: "16px",

                                      minWidth: 0,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: "62px",
                                        height: "62px",

                                        borderRadius: "16px",

                                        backgroundColor: "#dff7f8",

                                        color: "#08AEB8",

                                        display: "flex",

                                        alignItems: "center",

                                        justifyContent: "center",

                                        fontSize: "1.5rem",

                                        flexShrink: 0,
                                      }}
                                    >
                                      <i className="fa-solid fa-user"></i>
                                    </div>

                                    <div>
                                      <h3
                                        style={{
                                          margin: 0,

                                          fontSize: "1.25rem",

                                          fontWeight: 800,

                                          color: "#0b1c2d",
                                        }}
                                      >
                                        {patient.fullName || "Patient"}
                                      </h3>

                                      <div
                                        style={{
                                          marginTop: "4px",

                                          color: "#64748b",

                                          fontSize: "0.84rem",

                                          fontWeight: 600,
                                        }}
                                      >
                                        {patient.patientCode || "N/A"}
                                      </div>

                                      <div
                                        style={{
                                          marginTop: "5px",

                                          color: "#475569",

                                          fontSize: "0.84rem",
                                        }}
                                      >
                                        {patient.age !== null &&
                                        patient.age !== undefined
                                          ? `${patient.age} yrs`
                                          : "Age N/A"}

                                        {patient.gender
                                          ? ` • ${patient.gender}`
                                          : ""}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Current status */}
                                  <span
                                    style={{
                                      padding: "7px 14px",

                                      borderRadius: "999px",

                                      fontSize: "0.75rem",

                                      fontWeight: 800,

                                      ...statusStyle,
                                    }}
                                  >
                                    {formatPatientStatus(summary.currentStatus)}
                                  </span>
                                </div>

                                {/* Patient quick information */}
                                <div
                                  style={{
                                    display: "grid",

                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(140px, 1fr))",

                                    gap: "10px",

                                    marginTop: "18px",
                                  }}
                                >
                                  {[
                                    ["Phone", patient.phone || "Not available"],

                                    [
                                      "Registration",
                                      patient.registrationType
                                        ? patient.registrationType.replaceAll(
                                            "_",
                                            " ",
                                          )
                                        : "N/A",
                                    ],

                                    ["Visits", summary.totalRecords ?? 0],

                                    ["Completed", summary.completedVisits ?? 0],

                                    ["Cancelled", summary.cancelledVisits ?? 0],
                                  ].map(([label, value]) => (
                                    <div
                                      key={label}
                                      style={{
                                        padding: "12px 14px",

                                        borderRadius: "10px",

                                        backgroundColor: "#f8fafc",
                                      }}
                                    >
                                      <div
                                        style={{
                                          color: "#94a3b8",

                                          fontSize: "0.66rem",

                                          fontWeight: 800,

                                          textTransform: "uppercase",

                                          letterSpacing: "0.04em",
                                        }}
                                      >
                                        {label}
                                      </div>

                                      <div
                                        style={{
                                          marginTop: "5px",

                                          color: "#0b1c2d",

                                          fontSize: "0.86rem",

                                          fontWeight: 700,

                                          textTransform:
                                            label === "Registration"
                                              ? "capitalize"
                                              : "none",
                                        }}
                                      >
                                        {value}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* =====================================
                                        LATEST VISIT
                                    ===================================== */}
                              {latestVisit && (
                                <div
                                  style={{
                                    backgroundColor: "#ffffff",

                                    borderRadius: "16px",

                                    border: "1px solid #e2e8f0",

                                    padding: "20px",

                                    marginBottom: "18px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",

                                      justifyContent: "space-between",

                                      alignItems: "center",

                                      marginBottom: "16px",
                                    }}
                                  >
                                    <h3
                                      style={{
                                        margin: 0,

                                        fontSize: "1rem",

                                        fontWeight: 800,

                                        color: "#0b1c2d",
                                      }}
                                    >
                                      Latest Visit
                                    </h3>

                                    <span
                                      style={{
                                        padding: "5px 10px",

                                        borderRadius: "999px",

                                        fontSize: "0.68rem",

                                        fontWeight: 800,

                                        ...getPatientStatusStyle(
                                          latestVisit.status,
                                        ),
                                      }}
                                    >
                                      {formatPatientStatus(latestVisit.status)}
                                    </span>
                                  </div>

                                  {/* Doctor + Appointment */}
                                  <div
                                    style={{
                                      display: "grid",

                                      gridTemplateColumns:
                                        "repeat(auto-fit, minmax(250px, 1fr))",

                                      gap: "12px",
                                    }}
                                  >
                                    {/* Doctor */}
                                    <div
                                      style={{
                                        padding: "14px 16px",

                                        backgroundColor: "#f8fafc",

                                        borderRadius: "12px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          color: "#94a3b8",

                                          fontSize: "0.66rem",

                                          fontWeight: 800,

                                          textTransform: "uppercase",

                                          marginBottom: "6px",
                                        }}
                                      >
                                        Assigned Doctor
                                      </div>

                                      <div
                                        style={{
                                          fontSize: "0.9rem",

                                          fontWeight: 800,

                                          color: "#0b1c2d",
                                        }}
                                      >
                                        {latestVisit.doctor?.name ||
                                          "Assigned Doctor"}
                                      </div>

                                      <div
                                        style={{
                                          marginTop: "3px",

                                          fontSize: "0.76rem",

                                          color: "#64748b",
                                        }}
                                      >
                                        {latestVisit.doctor?.specialization ||
                                          "Not specified"}
                                      </div>
                                    </div>

                                    {/* Appointment */}
                                    <div
                                      style={{
                                        padding: "14px 16px",

                                        backgroundColor: "#f8fafc",

                                        borderRadius: "12px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          color: "#94a3b8",

                                          fontSize: "0.66rem",

                                          fontWeight: 800,

                                          textTransform: "uppercase",

                                          marginBottom: "6px",
                                        }}
                                      >
                                        Appointment
                                      </div>

                                      <div
                                        style={{
                                          fontWeight: 800,

                                          color: "#0b1c2d",

                                          fontSize: "0.88rem",
                                        }}
                                      >
                                        {formatPatientDate(
                                          latestVisit.appointment?.date,
                                        )}
                                      </div>

                                      <div
                                        style={{
                                          marginTop: "3px",

                                          color: "#64748b",

                                          fontSize: "0.76rem",

                                          textTransform: "capitalize",
                                        }}
                                      >
                                        {latestVisit.appointment?.time ||
                                          "Time N/A"}

                                        {latestVisit.visitType
                                          ? ` • ${String(
                                              latestVisit.visitType,
                                            ).replaceAll("_", " ")}`
                                          : ""}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Complaint */}
                                  {latestVisit.reportedComplaint && (
                                    <div
                                      style={{
                                        marginTop: "12px",

                                        padding: "13px 15px",

                                        backgroundColor: "#ecfdf5",

                                        border: "1px solid #a7f3d0",

                                        borderRadius: "11px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          color: "#047857",

                                          fontSize: "0.7rem",

                                          fontWeight: 800,

                                          marginBottom: "5px",
                                        }}
                                      >
                                        <i
                                          className="fa-solid fa-stethoscope"
                                          style={{
                                            marginRight: "7px",
                                          }}
                                        ></i>
                                        Patient Reported Complaint
                                      </div>

                                      <div
                                        style={{
                                          color: "#334155",

                                          fontSize: "0.84rem",

                                          fontWeight: 600,

                                          lineHeight: 1.55,
                                        }}
                                      >
                                        {latestVisit.reportedComplaint}
                                      </div>
                                    </div>
                                  )}

                                  {/* =================================
                                                VISIT JOURNEY
                                            ================================= */}
                                  <div
                                    style={{
                                      marginTop: "18px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "0.82rem",

                                        fontWeight: 800,

                                        color: "#0b1c2d",

                                        marginBottom: "10px",
                                      }}
                                    >
                                      Visit Journey
                                    </div>

                                    <div
                                      style={{
                                        display: "grid",

                                        gridTemplateColumns:
                                          "repeat(auto-fit, minmax(180px, 1fr))",

                                        gap: "10px",
                                      }}
                                    >
                                      {[
                                        [
                                          "Checked In",
                                          latestVisit.checkedInAt,
                                          "fa-right-to-bracket",
                                        ],

                                        [
                                          "Consultation Started",
                                          latestVisit.consultationStartedAt,
                                          "fa-stethoscope",
                                        ],

                                        [
                                          "Consultation Completed",
                                          latestVisit.consultationCompletedAt,
                                          "fa-circle-check",
                                        ],
                                      ].map(([label, value, icon]) => (
                                        <div
                                          key={label}
                                          style={{
                                            padding: "13px 14px",

                                            borderRadius: "11px",

                                            border: "1px solid #e2e8f0",

                                            backgroundColor: "#ffffff",
                                          }}
                                        >
                                          <div
                                            style={{
                                              display: "flex",

                                              alignItems: "center",

                                              gap: "7px",

                                              color: "#64748b",

                                              fontSize: "0.67rem",

                                              fontWeight: 800,

                                              textTransform: "uppercase",
                                            }}
                                          >
                                            <i
                                              className={`fa-solid ${icon}`}
                                              style={{
                                                color: "#08AEB8",
                                              }}
                                            ></i>

                                            {label}
                                          </div>

                                          <div
                                            style={{
                                              marginTop: "6px",

                                              fontSize: "0.78rem",

                                              fontWeight: 700,

                                              color: value
                                                ? "#0b1c2d"
                                                : "#94a3b8",
                                            }}
                                          >
                                            {formatPatientDateTime(value)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Duration cards */}
                                    <div
                                      style={{
                                        display: "grid",

                                        gridTemplateColumns:
                                          "repeat(3, minmax(0, 1fr))",

                                        gap: "10px",

                                        marginTop: "10px",
                                      }}
                                    >
                                      {[
                                        ["Waiting", latestVisit.waitingMinutes],

                                        [
                                          "Consultation",
                                          latestVisit.consultationMinutes,
                                        ],

                                        [
                                          "Total Visit",
                                          latestVisit.totalVisitMinutes,
                                        ],
                                      ].map(([label, value]) => (
                                        <div
                                          key={label}
                                          style={{
                                            padding: "12px",

                                            borderRadius: "10px",

                                            backgroundColor: "#f1f5f9",

                                            textAlign: "center",
                                          }}
                                        >
                                          <div
                                            style={{
                                              color: "#94a3b8",

                                              fontSize: "0.65rem",

                                              fontWeight: 800,

                                              textTransform: "uppercase",
                                            }}
                                          >
                                            {label}
                                          </div>

                                          <div
                                            style={{
                                              marginTop: "4px",

                                              color: "#0b1c2d",

                                              fontWeight: 800,

                                              fontSize: "0.9rem",
                                            }}
                                          >
                                            {formatPatientDuration(value)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* =====================================
                                        VISIT HISTORY
                                    ===================================== */}
                              <div
                                style={{
                                  backgroundColor: "#ffffff",

                                  borderRadius: "16px",

                                  border: "1px solid #e2e8f0",

                                  padding: "20px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",

                                    justifyContent: "space-between",

                                    alignItems: "center",

                                    marginBottom: "14px",
                                  }}
                                >
                                  <h3
                                    style={{
                                      margin: 0,

                                      fontSize: "1rem",

                                      fontWeight: 800,

                                      color: "#0b1c2d",
                                    }}
                                  >
                                    Visit History
                                  </h3>

                                  <span
                                    style={{
                                      color: "#64748b",

                                      fontSize: "0.76rem",

                                      fontWeight: 700,
                                    }}
                                  >
                                    {visitHistory.length} record
                                    {visitHistory.length === 1 ? "" : "s"}
                                  </span>
                                </div>

                                {visitHistory.length === 0 ? (
                                  <div
                                    style={{
                                      padding: "30px",

                                      borderRadius: "12px",

                                      backgroundColor: "#f8fafc",

                                      textAlign: "center",

                                      color: "#64748b",

                                      fontSize: "0.82rem",
                                    }}
                                  >
                                    No visit history available.
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      display: "flex",

                                      flexDirection: "column",

                                      gap: "10px",
                                    }}
                                  >
                                    {visitHistory.map((visit, index) => (
                                      <div
                                        key={
                                          visit.visitId ||
                                          visit.appointmentId ||
                                          index
                                        }
                                        style={{
                                          padding: "14px 16px",

                                          border: "1px solid #e2e8f0",

                                          borderRadius: "11px",

                                          backgroundColor: "#f8fafc",
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",

                                            justifyContent: "space-between",

                                            alignItems: "flex-start",

                                            gap: "12px",
                                          }}
                                        >
                                          <div>
                                            <div
                                              style={{
                                                color: "#0b1c2d",

                                                fontWeight: 800,

                                                fontSize: "0.84rem",
                                              }}
                                            >
                                              {visit.doctor?.name ||
                                                "Assigned Doctor"}
                                            </div>

                                            <div
                                              style={{
                                                marginTop: "3px",

                                                color: "#64748b",

                                                fontSize: "0.74rem",

                                                textTransform: "capitalize",
                                              }}
                                            >
                                              {visit.appointment?.date
                                                ? formatPatientDate(
                                                    visit.appointment.date,
                                                  )
                                                : formatPatientDateTime(
                                                    visit.createdAt,
                                                  )}

                                              {visit.visitType
                                                ? ` • ${String(
                                                    visit.visitType,
                                                  ).replaceAll("_", " ")}`
                                                : ""}
                                            </div>
                                          </div>

                                          <span
                                            style={{
                                              padding: "4px 9px",

                                              borderRadius: "999px",

                                              fontSize: "0.65rem",

                                              fontWeight: 800,

                                              ...getPatientStatusStyle(
                                                visit.status,
                                              ),
                                            }}
                                          >
                                            {formatPatientStatus(visit.status)}
                                          </span>
                                        </div>

                                        {/* History timings */}
                                        <div
                                          style={{
                                            marginTop: "12px",

                                            display: "grid",

                                            gridTemplateColumns:
                                              "repeat(3, minmax(0, 1fr))",

                                            gap: "8px",
                                          }}
                                        >
                                          {[
                                            ["Waiting", visit.waitingMinutes],

                                            [
                                              "Consultation",
                                              visit.consultationMinutes,
                                            ],

                                            ["Total", visit.totalVisitMinutes],
                                          ].map(([label, value]) => (
                                            <div key={label}>
                                              <div
                                                style={{
                                                  color: "#94a3b8",

                                                  fontSize: "0.63rem",

                                                  fontWeight: 800,

                                                  textTransform: "uppercase",
                                                }}
                                              >
                                                {label}
                                              </div>

                                              <div
                                                style={{
                                                  marginTop: "3px",

                                                  color: "#334155",

                                                  fontSize: "0.78rem",

                                                  fontWeight: 700,
                                                }}
                                              >
                                                {formatPatientDuration(value)}
                                              </div>
                                            </div>
                                          ))}
                                        </div>

                                        {visit.reportedComplaint && (
                                          <div
                                            style={{
                                              marginTop: "10px",

                                              padding: "9px 11px",

                                              borderRadius: "8px",

                                              backgroundColor: "#ffffff",

                                              color: "#475569",

                                              fontSize: "0.75rem",

                                              lineHeight: 1.45,
                                            }}
                                          >
                                            <strong>Complaint:</strong>{" "}
                                            {visit.reportedComplaint}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        })()}
                    </div>
                  </div>
                </div>,
                document.body,
              )}

            {/* End of Patients tab */}
          </div>
        )}

        {/* -------------------------------------------------------------------
    TAB 2: DOCTOR MANAGEMENT
------------------------------------------------------------------- */}
        {activeTab === "doctors" && (
          <>
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "24px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              {/* ============================================================
          DOCTOR HEADER
      ============================================================ */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1.4rem",
                      fontWeight: 800,
                      color: "#0b1c2d",
                    }}
                  >
                    Doctors
                  </h2>

                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "0.84rem",
                      color: "#64748b",
                    }}
                  >
                    Manage doctors and view their hospital patient activity.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddDoctorModal(true)}
                  style={{
                    backgroundColor: "#08AEB8",
                    color: "#ffffff",
                    border: "none",
                    padding: "9px 17px",
                    borderRadius: "9px",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    boxShadow: "0 4px 12px rgba(8,174,184,0.22)",
                  }}
                >
                  <i className="fa-solid fa-plus" />
                  Add Doctor
                </button>
              </div>

              {/* ============================================================
          SEARCH + STATUS FILTER
      ============================================================ */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginBottom: "18px",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: "260px",
                    position: "relative",
                  }}
                >
                  <i
                    className="fa-solid fa-magnifying-glass"
                    style={{
                      position: "absolute",
                      left: "13px",
                      top: "12px",
                      color: "#94a3b8",
                      fontSize: "0.82rem",
                    }}
                  />

                  <input
                    type="text"
                    placeholder="Search doctor by name, email, specialization..."
                    value={doctorSearch}
                    onChange={(event) => setDoctorSearch(event.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px 9px 37px",
                      borderRadius: "9px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.82rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <select
                  value={doctorStatusFilter}
                  onChange={(event) =>
                    setDoctorStatusFilter(event.target.value)
                  }
                  style={{
                    padding: "9px 14px",
                    borderRadius: "9px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.82rem",
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    fontWeight: 600,
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* ============================================================
          COMPACT DOCTOR CARDS
      ============================================================ */}
              {filteredDoctors.length === 0 ? (
                <div
                  style={{
                    padding: "45px 20px",
                    textAlign: "center",
                    color: "#94a3b8",
                    backgroundColor: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <i
                    className="fa-solid fa-user-doctor"
                    style={{
                      fontSize: "2rem",
                      marginBottom: "10px",
                      display: "block",
                    }}
                  />

                  <div
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 800,
                      color: "#475569",
                    }}
                  >
                    No Doctors Found
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(320px, 360px))",
                    gap: "16px",
                    justifyContent: "start",
                  }}
                >
                  {filteredDoctors.map((doc) => {
                    const isActive =
                      String(doc.status || "").toLowerCase() === "active";

                    const doctorInitial =
                      String(doc.fullName || "D")
                        .replace(/^Dr\.?\s*/i, "")
                        .trim()
                        .charAt(0)
                        .toUpperCase() || "D";

                    return (
                      <div
                        key={doc.memberId || doc.doctorId || doc.email}
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "13px",
                          padding: "16px",
                          boxShadow: "0 2px 7px rgba(15,23,42,0.04)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        {/* Doctor identity */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              minWidth: "36px",
                              borderRadius: "9px",
                              backgroundColor: "#e0f2fe",
                              color: "#0284c7",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.9rem",
                              fontWeight: 800,
                            }}
                          >
                            {doctorInitial}
                          </div>

                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "7px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.84rem",
                                  fontWeight: 800,
                                  color: "#0f172a",
                                  lineHeight: 1.25,
                                }}
                              >
                                {doc.fullName || "Doctor"}
                              </div>

                              <span
                                style={{
                                  padding: "3px 6px",
                                  borderRadius: "999px",
                                  fontSize: "0.56rem",
                                  fontWeight: 800,
                                  whiteSpace: "nowrap",
                                  backgroundColor: isActive
                                    ? "#dcfce7"
                                    : "#f1f5f9",
                                  color: isActive ? "#15803d" : "#64748b",
                                }}
                              >
                                {isActive
                                  ? "ACCOUNT ACTIVE"
                                  : "ACCOUNT INACTIVE"}
                              </span>
                            </div>

                            <div
                              style={{
                                marginTop: "3px",
                                fontSize: "0.7rem",
                                color: "#64748b",
                                lineHeight: 1.35,
                              }}
                            >
                              {doc.specialization ||
                                "Specialization not specified"}
                            </div>
                          </div>
                        </div>

                        {/* Qualification + Experience */}
                        <div
                          style={{
                            display: "flex",
                            gap: "7px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              padding: "4px 7px",
                              borderRadius: "6px",
                              backgroundColor: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              color: "#475569",
                            }}
                          >
                            <i
                              className="fa-solid fa-graduation-cap"
                              style={{
                                color: "#08AEB8",
                                marginRight: "4px",
                              }}
                            />

                            {doc.qualification || "Not specified"}
                          </span>

                          <span
                            style={{
                              padding: "4px 7px",
                              borderRadius: "6px",
                              backgroundColor: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              color: "#475569",
                            }}
                          >
                            <i
                              className="fa-solid fa-briefcase-medical"
                              style={{
                                color: "#08AEB8",
                                marginRight: "4px",
                              }}
                            />

                            {doc.experience !== null &&
                            doc.experience !== undefined &&
                            doc.experience !== ""
                              ? `${doc.experience} ${
                                  Number(doc.experience) === 1
                                    ? "Year"
                                    : "Years"
                                }`
                              : "Experience N/A"}
                          </span>
                        </div>

                        {/* Contact */}
                        <div
                          style={{
                            display: "grid",
                            gap: "5px",
                            fontSize: "0.7rem",
                            color: "#475569",
                          }}
                        >
                          <div>
                            <i
                              className="fa-solid fa-phone"
                              style={{
                                width: "17px",
                                color: "#08AEB8",
                              }}
                            />

                            {doc.phone || "Not available"}
                          </div>

                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={doc.email || ""}
                          >
                            <i
                              className="fa-regular fa-envelope"
                              style={{
                                width: "17px",
                                color: "#08AEB8",
                              }}
                            />

                            {doc.email || "Not available"}
                          </div>
                        </div>

                        {/* ======================================================
    DOCTOR OPERATIONAL ACTIONS
====================================================== */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "8px",
                          }}
                        >
                          {/* View doctor-related patients */}
                          <button
                            type="button"
                            onClick={() => fetchDoctorPatients(doc)}
                            style={{
                              border: "1px solid #99e5e7",
                              backgroundColor: "#ecfeff",
                              color: "#087f8c",
                              borderRadius: "8px",
                              padding: "8px 10px",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            <i
                              className="fa-solid fa-users"
                              style={{
                                marginRight: "6px",
                              }}
                            />
                            View Patients
                          </button>

                          {/* Manage weekly doctor availability */}
                          <button
                            type="button"
                            onClick={() => openDoctorSchedule(doc)}
                            style={{
                              border: "1px solid #c7d2fe",
                              backgroundColor: "#eef2ff",
                              color: "#4338ca",
                              borderRadius: "8px",
                              padding: "8px 10px",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            <i
                              className="fa-solid fa-calendar-days"
                              style={{
                                marginRight: "6px",
                              }}
                            />
                            Schedule
                          </button>
                        </div>

                        {/* Existing management actions */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "7px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDoctor(doc);

                              setDocFullName(doc.fullName || "");

                              setDocPhone(doc.phone || "");

                              setDocSpecialization(doc.specialization || "");

                              setDocQualification(doc.qualification || "");

                              setDocRegNumber(doc.registrationNumber || "");

                              setShowEditDoctorModal(true);
                            }}
                            style={{
                              border: "1px solid #bae6fd",
                              borderRadius: "8px",
                              padding: "7px 9px",
                              backgroundColor: "#f0f9ff",
                              color: "#0284c7",
                              fontSize: "0.7rem",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            <i
                              className="fa-solid fa-pen"
                              style={{
                                marginRight: "5px",
                              }}
                            />
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setStatusConfirmModal({
                                show: true,
                                memberType: "doctor",
                                member: doc,
                                targetStatus: isActive ? "inactive" : "active",
                              });
                            }}
                            style={{
                              border: `1px solid ${
                                isActive ? "#fecaca" : "#bbf7d0"
                              }`,
                              borderRadius: "8px",
                              padding: "7px 9px",
                              backgroundColor: isActive ? "#fef2f2" : "#f0fdf4",
                              color: isActive ? "#b91c1c" : "#15803d",
                              fontSize: "0.7rem",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ================================================================
        DOCTOR PATIENTS MODAL
    ================================================================ */}
            {showDoctorPatients &&
              createPortal(
                <div
                  onClick={closeDoctorPatients}
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 99999,
                    backgroundColor: "rgba(15, 23, 42, 0.55)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                  }}
                >
                  <div
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      width: "100%",
                      maxWidth: "900px",
                      maxHeight: "88vh",
                      overflowY: "auto",
                      backgroundColor: "#ffffff",
                      borderRadius: "17px",
                      boxShadow: "0 24px 70px rgba(15,23,42,0.25)",
                    }}
                  >
                    {/* Modal header */}
                    <div
                      style={{
                        padding: "18px 20px",
                        borderBottom: "1px solid #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "14px",
                        position: "sticky",
                        top: 0,
                        backgroundColor: "#ffffff",
                        zIndex: 2,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "1.08rem",
                            fontWeight: 800,
                            color: "#0f172a",
                          }}
                        >
                          {selectedDoctorPatients?.doctor?.name ||
                            "Doctor Patients"}
                        </div>

                        <div
                          style={{
                            marginTop: "3px",
                            fontSize: "0.75rem",
                            color: "#64748b",
                          }}
                        >
                          {selectedDoctorPatients?.doctor?.specialization ||
                            "Patient activity overview"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={closeDoctorPatients}
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          backgroundColor: "#f8fafc",
                          color: "#475569",
                          cursor: "pointer",
                        }}
                      >
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </div>

                    <div
                      style={{
                        padding: "20px",
                      }}
                    >
                      {/* Loading */}
                      {doctorPatientsLoading && (
                        <div
                          style={{
                            padding: "55px 20px",
                            textAlign: "center",
                            color: "#64748b",
                          }}
                        >
                          <i
                            className="fa-solid fa-spinner fa-spin"
                            style={{
                              fontSize: "1.5rem",
                              color: "#08AEB8",
                              marginBottom: "10px",
                            }}
                          />

                          <div
                            style={{
                              fontSize: "0.82rem",
                              fontWeight: 700,
                            }}
                          >
                            Loading patients...
                          </div>
                        </div>
                      )}

                      {/* Error */}
                      {!doctorPatientsLoading && doctorPatientsError && (
                        <div
                          style={{
                            padding: "15px",
                            backgroundColor: "#fef2f2",
                            border: "1px solid #fecaca",
                            borderRadius: "9px",
                            color: "#b91c1c",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                          }}
                        >
                          {doctorPatientsError}
                        </div>
                      )}

                      {!doctorPatientsLoading &&
                        !doctorPatientsError &&
                        selectedDoctorPatients && (
                          <>
                            {/* ==============================================
                        STATUS SUMMARY
                    ============================================== */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(115px, 1fr))",
                                gap: "9px",
                                marginBottom: "20px",
                              }}
                            >
                              {[
                                {
                                  label: "Total Patients",
                                  value:
                                    selectedDoctorPatients.summary
                                      ?.totalPatients || 0,
                                  icon: "fa-users",
                                },
                                {
                                  label: "Scheduled",
                                  value:
                                    selectedDoctorPatients.summary?.scheduled ||
                                    0,
                                  icon: "fa-calendar",
                                },
                                {
                                  label: "Active",
                                  value:
                                    selectedDoctorPatients.summary?.active || 0,
                                  icon: "fa-stethoscope",
                                },
                                {
                                  label: "Completed",
                                  value:
                                    selectedDoctorPatients.summary?.completed ||
                                    0,
                                  icon: "fa-circle-check",
                                },
                                {
                                  label: "Rescheduled",
                                  value:
                                    selectedDoctorPatients.summary
                                      ?.rescheduled || 0,
                                  icon: "fa-calendar-days",
                                },
                                {
                                  label: "Cancelled",
                                  value:
                                    selectedDoctorPatients.summary?.cancelled ||
                                    0,
                                  icon: "fa-circle-xmark",
                                },
                              ].map((item) => (
                                <div
                                  key={item.label}
                                  style={{
                                    padding: "12px",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "10px",
                                    backgroundColor: "#f8fafc",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      color: "#64748b",
                                      fontSize: "0.64rem",
                                      fontWeight: 800,
                                      marginBottom: "5px",
                                    }}
                                  >
                                    <span>{item.label}</span>

                                    <i
                                      className={`fa-solid ${item.icon}`}
                                      style={{
                                        color: "#08AEB8",
                                      }}
                                    />
                                  </div>

                                  <div
                                    style={{
                                      fontSize: "1.35rem",
                                      fontWeight: 800,
                                      color: "#0b1c2d",
                                    }}
                                  >
                                    {item.value}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* ==============================================
                        PATIENT LIST
                    ============================================== */}
                            <div
                              style={{
                                marginBottom: "9px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.92rem",
                                  fontWeight: 800,
                                  color: "#0f172a",
                                }}
                              >
                                Patients
                              </div>

                              <div
                                style={{
                                  fontSize: "0.72rem",
                                  color: "#64748b",
                                  marginTop: "2px",
                                }}
                              >
                                Name, age and main patient-reported symptoms.
                              </div>
                            </div>

                            {(selectedDoctorPatients.patients || []).length ===
                            0 ? (
                              <div
                                style={{
                                  padding: "40px 20px",
                                  textAlign: "center",
                                  border: "1px dashed #cbd5e1",
                                  borderRadius: "11px",
                                  color: "#64748b",
                                  fontSize: "0.78rem",
                                }}
                              >
                                No patients found for this doctor.
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "9px",
                                }}
                              >
                                {selectedDoctorPatients.patients.map(
                                  (patient) => {
                                    const status =
                                      patient.status || "scheduled";

                                    return (
                                      <div
                                        key={patient.hospitalPatientId}
                                        style={{
                                          border: "1px solid #e2e8f0",
                                          borderRadius: "11px",
                                          padding: "12px 14px",
                                          display: "grid",
                                          gridTemplateColumns:
                                            "minmax(140px,1fr) minmax(180px,1.4fr) auto",
                                          gap: "15px",
                                          alignItems: "center",
                                        }}
                                      >
                                        {/* Name + age */}
                                        <div>
                                          <div
                                            style={{
                                              fontSize: "0.82rem",
                                              fontWeight: 800,
                                              color: "#0f172a",
                                            }}
                                          >
                                            {patient.name || "Patient"}
                                          </div>

                                          <div
                                            style={{
                                              marginTop: "3px",
                                              color: "#64748b",
                                              fontSize: "0.7rem",
                                            }}
                                          >
                                            {patient.age !== null &&
                                            patient.age !== undefined
                                              ? `${patient.age} years`
                                              : "Age not available"}
                                          </div>
                                        </div>

                                        {/* Maximum two symptoms */}
                                        <div>
                                          <div
                                            style={{
                                              fontSize: "0.62rem",
                                              fontWeight: 800,
                                              color: "#94a3b8",
                                              textTransform: "uppercase",
                                              marginBottom: "4px",
                                            }}
                                          >
                                            Main Symptoms
                                          </div>

                                          <div
                                            style={{
                                              display: "flex",
                                              gap: "5px",
                                              flexWrap: "wrap",
                                            }}
                                          >
                                            {patient.symptoms?.length > 0 ? (
                                              patient.symptoms
                                                .slice(0, 2)
                                                .map((symptom, index) => (
                                                  <span
                                                    key={`${patient.hospitalPatientId}-${index}`}
                                                    style={{
                                                      padding: "3px 7px",
                                                      borderRadius: "6px",
                                                      backgroundColor:
                                                        "#f1f5f9",
                                                      color: "#334155",
                                                      fontSize: "0.68rem",
                                                      fontWeight: 700,
                                                    }}
                                                  >
                                                    {symptom}
                                                  </span>
                                                ))
                                            ) : (
                                              <span
                                                style={{
                                                  color: "#94a3b8",
                                                  fontSize: "0.7rem",
                                                }}
                                              >
                                                No symptoms reported
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Current status */}
                                        <span
                                          style={{
                                            padding: "4px 8px",
                                            borderRadius: "999px",
                                            backgroundColor:
                                              status === "completed"
                                                ? "#dcfce7"
                                                : status === "active"
                                                  ? "#e0f2fe"
                                                  : status === "cancelled"
                                                    ? "#fee2e2"
                                                    : "#fef3c7",
                                            color:
                                              status === "completed"
                                                ? "#15803d"
                                                : status === "active"
                                                  ? "#0369a1"
                                                  : status === "cancelled"
                                                    ? "#b91c1c"
                                                    : "#a16207",
                                            fontSize: "0.62rem",
                                            fontWeight: 800,
                                            textTransform: "uppercase",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {status === "active"
                                            ? "WAITING"
                                            : String(status)
                                                .replaceAll("_", " ")
                                                .toUpperCase()}
                                        </span>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            )}
                          </>
                        )}
                    </div>
                  </div>
                </div>,
                document.body,
              )}
          </>
        )}

        {/* -------------------------------------------------------------------
                    TAB 3: STAFF MANAGEMENT
                ------------------------------------------------------------------- */}
        {activeTab === "staff" && (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              padding: "28px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
            }}
          >
            {/* Staff Header & Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
                flexWrap: "wrap",
                gap: "16px",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.4rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                  }}
                >
                  Hospital Staff
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "0.85rem",
                    color: "#64748b",
                  }}
                >
                  Manage non-clinical hospital staff, receptionists, nurses, and
                  administrative personnel.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                {/* Staff Count */}
                <div
                  style={{
                    padding: "9px 14px",
                    borderRadius: "10px",
                    backgroundColor: "#f1f5f9",
                    color: "#475569",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {filteredStaff.length === staffList.length
                    ? `${staffList.length} Staff Members`
                    : `${filteredStaff.length} of ${staffList.length} Staff`}
                </div>

                {/* Refresh */}
                <button
                  type="button"
                  onClick={fetchStaff}
                  style={{
                    border: "none",
                    backgroundColor: "#0b1c2d",
                    color: "#ffffff",
                    borderRadius: "10px",
                    padding: "10px 16px",
                    fontSize: "0.84rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <i className="fa-solid fa-rotate"></i>
                  Refresh
                </button>

                {/* Add Staff */}
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(true)}
                  style={{
                    backgroundColor: "#08AEB8",
                    color: "#ffffff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "10px",
                    fontWeight: 700,
                    fontSize: "0.84rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(8,174,184,0.25)",
                  }}
                >
                  <i className="fa-solid fa-plus"></i>
                  Add Staff
                </button>
              </div>
            </div>

            {/* Search & Filters */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                marginBottom: "20px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: "280px", position: "relative" }}>
                <i
                  className="fa-solid fa-magnifying-glass"
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "13px",
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                  }}
                ></i>
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
                    boxSizing: "border-box",
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
                  fontWeight: 600,
                }}
              >
                <option value="all">All Roles</option>
                <option value="Reception / Front Desk">
                  Reception / Front Desk
                </option>
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
                  fontWeight: 600,
                }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* ============================================================
    STAFF CARD GRID
    ------------------------------------------------------------
    Uses the same responsive card approach as Hospital Patients.
    All existing View / Edit / Activate / Deactivate actions
    are preserved.
============================================================ */}

            {filteredStaff.length === 0 ? (
              /* ==========================================================
      EMPTY STATE
  ========================================================== */
              <div
                style={{
                  padding: "56px 24px",
                  textAlign: "center",
                  color: "#94a3b8",
                }}
              >
                <i
                  className="fa-solid fa-users-slash"
                  style={{
                    fontSize: "2.5rem",
                    marginBottom: "12px",
                    display: "block",
                  }}
                ></i>

                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 800,
                    color: "#475569",
                  }}
                >
                  No Staff Members Found
                </div>

                <p
                  style={{
                    fontSize: "0.85rem",
                    margin: "5px 0 0",
                    color: "#94a3b8",
                  }}
                >
                  Try adjusting the search or filters, or add a new staff
                  member.
                </p>
              </div>
            ) : (
              /* ==========================================================
      STAFF CARDS
  ========================================================== */
              <div
                style={{
                  display: "grid",

                  /*
                   * Keep Staff cards at a comfortable dashboard width.
                   * They will no longer stretch across the whole page,
                   * but also won't become too narrow.
                   */
                  /*
                   * Keep approximately two Staff cards per desktop row.
                   * auto-fill prevents one card from stretching across
                   * the entire screen when only one staff member exists.
                   */
                  gridTemplateColumns: "repeat(auto-fill, minmax(500px, 1fr))",

                  gap: "20px",

                  alignItems: "start",
                }}
              >
                {filteredStaff.map((stf) => {
                  const isActive =
                    String(stf.status || "")
                      .toLowerCase()
                      .trim() === "active";

                  // Safely create initials without assuming fullName exists.
                  const initials = String(stf.fullName || "Staff")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part.charAt(0).toUpperCase())
                    .join("");

                  return (
                    <div
                      key={stf.memberId}
                      style={{
                        backgroundColor: "#ffffff",

                        border: "1px solid #dbe4ee",

                        borderRadius: "16px",

                        // IMPORTANT:
                        // Your current code accidentally says "adding".
                        padding: "18px",

                        boxShadow: "0 3px 12px rgba(15,23,42,0.06)",

                        display: "flex",
                        flexDirection: "column",

                        gap: "14px",

                        minWidth: 0,

                        boxSizing: "border-box",
                      }}
                    >
                      {/* ==================================================
              STAFF IDENTITY
          ================================================== */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "14px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "13px",
                            minWidth: 0,
                          }}
                        >
                          {/* Avatar / initials */}
                          <div
                            style={{
                              width: "54px",
                              height: "54px",
                              borderRadius: "14px",

                              backgroundColor: "#dff7f8",
                              color: "#08AEB8",

                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",

                              flexShrink: 0,

                              fontSize: "1rem",
                              fontWeight: 800,
                            }}
                          >
                            {initials || <i className="fa-solid fa-user"></i>}
                          </div>

                          <div
                            style={{
                              minWidth: 0,
                            }}
                          >
                            {/* Staff name */}
                            <div
                              title={stf.fullName || "Staff Member"}
                              style={{
                                fontSize: "1.05rem",
                                fontWeight: 800,
                                color: "#0b1c2d",

                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {stf.fullName || "Staff Member"}
                            </div>

                            {/* Staff role */}
                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                color: "#08AEB8",
                              }}
                            >
                              {stf.staffRole || "Hospital Staff"}
                            </div>
                          </div>
                        </div>

                        {/* Active / Inactive badge */}
                        <span
                          style={{
                            padding: "6px 11px",
                            borderRadius: "999px",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            whiteSpace: "nowrap",

                            backgroundColor: isActive ? "#dcfce7" : "#f1f5f9",

                            color: isActive ? "#15803d" : "#64748b",
                          }}
                        >
                          {isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>

                      {/* ==================================================
              CONTACT INFORMATION
          ================================================== */}
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "12px",

                          backgroundColor: "#f8fafc",
                          border: "1px solid #f1f5f9",

                          /*
                           * Email and Phone appear next to each other.
                           * This reduces unnecessary card height.
                           */
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",

                          gap: "14px",
                        }}
                      >
                        {/* Email */}
                        <div>
                          <div
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              color: "#94a3b8",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              marginBottom: "4px",
                            }}
                          >
                            Email
                          </div>

                          <div
                            title={stf.email || ""}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "7px",

                              fontSize: "0.84rem",
                              fontWeight: 600,
                              color: "#334155",

                              wordBreak: "break-word",
                            }}
                          >
                            <i
                              className="fa-regular fa-envelope"
                              style={{
                                color: "#08AEB8",
                              }}
                            ></i>

                            {stf.email || "Not available"}
                          </div>
                        </div>

                        {/* Phone */}
                        <div>
                          <div
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              color: "#94a3b8",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              marginBottom: "4px",
                            }}
                          >
                            Phone
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "7px",

                              fontSize: "0.84rem",
                              fontWeight: 600,
                              color: "#334155",
                            }}
                          >
                            <i
                              className="fa-solid fa-phone"
                              style={{
                                color: "#08AEB8",
                              }}
                            ></i>

                            {stf.phone || "Not available"}
                          </div>
                        </div>
                      </div>

                      {/* ==================================================
              ROLE
          ================================================== */}
                      <div>
                        <div
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            color: "#94a3b8",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: "7px",
                          }}
                        >
                          Hospital Role
                        </div>

                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "7px",

                            backgroundColor: "#e0e7ff",
                            color: "#3730a3",

                            padding: "6px 11px",
                            borderRadius: "8px",

                            fontSize: "0.78rem",
                            fontWeight: 700,
                          }}
                        >
                          <i className="fa-solid fa-id-badge"></i>

                          {stf.staffRole || "Hospital Staff"}
                        </span>
                      </div>

                      {/* ==================================================
              ACTIONS
          ================================================== */}
                      <div
                        style={{
                          marginTop: "auto",
                          paddingTop: "4px",

                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "9px",
                        }}
                      >
                        {/* View Details */}
                        <button
                          type="button"
                          onClick={() =>
                            setViewMemberModal({
                              show: true,
                              memberType: "staff",
                              member: stf,
                            })
                          }
                          style={{
                            border: "none",
                            borderRadius: "10px",

                            padding: "10px 12px",

                            backgroundColor: "#08AEB8",
                            color: "#ffffff",

                            fontSize: "0.8rem",
                            fontWeight: 800,

                            cursor: "pointer",

                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "7px",
                          }}
                        >
                          <i className="fa-regular fa-eye"></i>
                          View
                        </button>

                        {/* Edit Staff */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStaff(stf);

                            setStaffFullName(stf.fullName || "");

                            setStaffPhone(stf.phone || "");

                            setStaffRole(
                              stf.staffRole || "Reception / Front Desk",
                            );

                            setShowEditStaffModal(true);
                          }}
                          style={{
                            border: "1px solid #bae6fd",

                            borderRadius: "10px",

                            padding: "10px 12px",

                            backgroundColor: "#f0f9ff",
                            color: "#0284c7",

                            fontSize: "0.8rem",
                            fontWeight: 800,

                            cursor: "pointer",

                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "7px",
                          }}
                        >
                          <i className="fa-solid fa-pen"></i>
                          Edit
                        </button>

                        {/* Activate / Deactivate */}
                        <button
                          type="button"
                          onClick={() => {
                            setStatusConfirmModal({
                              show: true,
                              memberType: "staff",
                              member: stf,

                              targetStatus: isActive ? "inactive" : "active",
                            });
                          }}
                          style={{
                            gridColumn: "1 / -1",

                            border: `1px solid ${
                              isActive ? "#fecaca" : "#bbf7d0"
                            }`,

                            borderRadius: "10px",

                            padding: "10px 12px",

                            backgroundColor: isActive ? "#fef2f2" : "#f0fdf4",

                            color: isActive ? "#b91c1c" : "#15803d",

                            fontSize: "0.8rem",
                            fontWeight: 800,

                            cursor: "pointer",

                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "7px",
                          }}
                        >
                          <i
                            className={
                              isActive
                                ? "fa-solid fa-user-slash"
                                : "fa-solid fa-user-check"
                            }
                          ></i>

                          {isActive ? "Deactivate Staff" : "Activate Staff"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------------
                    TAB 3.5: HOSPITAL ADMIN PROFILE (PART 5)
                ------------------------------------------------------------------- */}
        {activeTab === "profile" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              width: "100%",
            }}
          >
            {/* Page Header */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "24px 32px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "#0b1c2d",
                }}
              >
                My Administrator Profile
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "0.88rem",
                  color: "#64748b",
                }}
              >
                Manage your hospital administrator identity, contact
                information, and active institutional role.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: "24px",
              }}
            >
              {/* Primary Account & Role Information */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  padding: "28px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "20px",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(8,174,184,0.1)",
                      color: "#08AEB8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-user-shield"></i>
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                      }}
                    >
                      Hospital Administration Identity
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                      Active administrative role details
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Administrator Name
                    </div>
                    <div
                      style={{
                        fontSize: "1.15rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                        marginTop: "2px",
                      }}
                    >
                      {adminName}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Primary Portal Role
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 12px",
                            borderRadius: "20px",
                            fontSize: "0.8rem",
                            fontWeight: 800,
                            backgroundColor: "rgba(8,174,184,0.12)",
                            color: "#08AEB8",
                          }}
                        >
                          Hospital Administrator
                        </span>
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Account Status
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 12px",
                            borderRadius: "20px",
                            fontSize: "0.78rem",
                            fontWeight: 800,
                            backgroundColor: "#dcfce7",
                            color: "#15803d",
                          }}
                        >
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor: "#16a34a",
                            }}
                          ></span>
                          ACTIVE
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Active Hospital
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: "#0b1c2d",
                          marginTop: "2px",
                        }}
                      >
                        {hospitalNameDisplay}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Hospital Code
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 800,
                          color: "#08AEB8",
                          marginTop: "2px",
                        }}
                      >
                        {stats.hospitalCode || "DV-MAIN"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Secondary Professional Info (If user is also a doctor) */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  padding: "28px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "20px",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      backgroundColor: "#e0f2fe",
                      color: "#0284c7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-user-doctor"></i>
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                      }}
                    >
                      Professional Medical Background
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                      Secondary clinical qualifications (if applicable)
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Medical Role
                    </div>
                    <div
                      style={{
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: "#334155",
                        marginTop: "2px",
                      }}
                    >
                      {currentUser?.specialization
                        ? "Doctor / Medical Practitioner"
                        : "Hospital Administrator"}
                    </div>
                  </div>

                  {currentUser?.specialization && (
                    <div>
                      <div
                        style={{
                          fontSize: "0.66rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Specialization
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: "#08AEB8",
                          marginTop: "2px",
                        }}
                      >
                        {currentUser.specialization}
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      fontSize: "0.8rem",
                      color: "#64748b",
                    }}
                  >
                    <i
                      className="fa-solid fa-circle-info"
                      style={{ color: "#08AEB8", marginRight: "6px" }}
                    ></i>
                    Clinical consultation workspace features can be accessed
                    separately via the Doctor Portal login.
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              width: "100%",
            }}
          >
            {/* Page Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "24px 32px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                  }}
                >
                  Hospital Profile
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "0.88rem",
                    color: "#64748b",
                  }}
                >
                  Manage your hospital's institutional information, primary
                  contacts, and facility location.
                </p>
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
                  boxShadow: "0 4px 12px rgba(11, 28, 45, 0.15)",
                }}
              >
                <i className="fa-solid fa-pen-to-square"></i> Edit Hospital
                Profile
              </button>
            </div>

            {/* Structured Dashboard Cards Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: "24px",
              }}
            >
              {/* Section 1: Hospital Overview */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  padding: "28px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "20px",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(8,174,184,0.1)",
                      color: "#08AEB8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-building-hospital"></i>
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                      }}
                    >
                      Hospital Overview
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                      Official institutional identity
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Hospital Name
                    </div>
                    <div
                      style={{
                        fontSize: "1.15rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                        marginTop: "2px",
                      }}
                    >
                      {hospitalInfo?.name || hospitalNameDisplay}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Hospital Code
                      </div>
                      <div
                        style={{
                          fontSize: "1rem",
                          fontWeight: 800,
                          color: "#08AEB8",
                          marginTop: "2px",
                        }}
                      >
                        {hospitalInfo?.code || stats.hospitalCode || "DV-MAIN"}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Status
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 12px",
                            borderRadius: "20px",
                            fontSize: "0.78rem",
                            fontWeight: 800,
                            backgroundColor: "#dcfce7",
                            color: "#15803d",
                          }}
                        >
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor: "#16a34a",
                            }}
                          ></span>
                          ACTIVE / OPERATIONAL
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Contact Information */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  padding: "28px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "20px",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      backgroundColor: "#e0f2fe",
                      color: "#0284c7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-headset"></i>
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                      }}
                    >
                      Contact Information
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                      Official communications & support
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Phone Number
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: "#334155",
                          marginTop: "2px",
                        }}
                      >
                        {hospitalInfo?.phone || "+91 (040) 2345 6789"}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Official Email
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: "#334155",
                          marginTop: "2px",
                        }}
                      >
                        {hospitalInfo?.email || "admin@doctorsvedika.com"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Primary Administrator
                    </div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "#0b1c2d",
                        marginTop: "2px",
                      }}
                    >
                      {adminName}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Facility Location */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  padding: "28px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "20px",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      backgroundColor: "#f3e8ff",
                      color: "#9333ea",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                    }}
                  >
                    <i className="fa-solid fa-location-dot"></i>
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                      }}
                    >
                      Location & Address
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                      Physical hospital campus
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Street Address
                    </div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "#334155",
                        marginTop: "2px",
                      }}
                    >
                      {hospitalInfo?.address || "Road No 36, Jubilee Hills"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        City
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: "#334155",
                          marginTop: "2px",
                        }}
                      >
                        {hospitalInfo?.city || "Hyderabad"}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        State
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: "#334155",
                          marginTop: "2px",
                        }}
                      >
                        {hospitalInfo?.state || "Telangana"}
                      </div>
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              width: "100%",
            }}
          >
            {/* Header Banner */}
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
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                  }}
                >
                  My Administrative Profile
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "0.88rem",
                    color: "#64748b",
                  }}
                >
                  Hospital Administrator identity & administrative credentials
                </p>
              </div>
              <div
                style={{
                  backgroundColor: "rgba(8, 174, 184, 0.1)",
                  color: "#08AEB8",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  fontWeight: 800,
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <i className="fa-solid fa-user-shield"></i> Hospital
                Administrator
              </div>
            </div>

            {/* Grid 2 Column */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "24px",
              }}
            >
              {/* Left Card: Administrative Information */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  padding: "28px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "20px",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "12px",
                      backgroundColor: "#e0f2fe",
                      color: "#0284c7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                    }}
                  >
                    <i className="fa-solid fa-address-card"></i>
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                      }}
                    >
                      Administrative Details
                    </h3>
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                      Primary portal account credentials
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Full Name
                    </div>
                    <div
                      style={{
                        fontSize: "1.05rem",
                        fontWeight: 800,
                        color: "#0b1c2d",
                        marginTop: "2px",
                      }}
                    >
                      {currentUser?.fullName ||
                        currentUser?.doctor_name ||
                        "Dr. Harshini"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Email Address
                      </div>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          color: "#334155",
                          marginTop: "2px",
                        }}
                      >
                        {currentUser?.email ||
                          currentUser?.doctor_email ||
                          "admin@doctorsvedika.com"}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Phone Number
                      </div>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          color: "#334155",
                          marginTop: "2px",
                        }}
                      >
                        {currentUser?.mobileNumber ||
                          currentUser?.phone ||
                          "+91 98765 43210"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Hospital Role
                      </div>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: 800,
                          color: "#08AEB8",
                          marginTop: "2px",
                        }}
                      >
                        Hospital Administrator
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Account Status
                      </div>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: 800,
                          color: "#10b981",
                          marginTop: "2px",
                        }}
                      >
                        <i className="fa-solid fa-circle-check"></i> Active
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Card: Hospital Context & Dual Role Secondary Info */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                }}
              >
                {/* Hospital Context Card */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: "16px",
                    padding: "28px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "20px",
                      borderBottom: "1px solid #f1f5f9",
                      paddingBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "12px",
                        backgroundColor: "#f0fdf4",
                        color: "#16a34a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.2rem",
                      }}
                    >
                      <i className="fa-solid fa-hospital"></i>
                    </div>
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "1.1rem",
                          fontWeight: 800,
                          color: "#0b1c2d",
                        }}
                      >
                        Associated Hospital
                      </h3>
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        Active administrative tenant
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Hospital Name
                      </div>
                      <div
                        style={{
                          fontSize: "1.05rem",
                          fontWeight: 800,
                          color: "#0b1c2d",
                          marginTop: "2px",
                        }}
                      >
                        {hospitalNameDisplay}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#64748b",
                            textTransform: "uppercase",
                          }}
                        >
                          Hospital Code
                        </div>
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 800,
                            color: "#08AEB8",
                            marginTop: "2px",
                          }}
                        >
                          {stats.hospitalCode || "DV-MAIN"}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#64748b",
                            textTransform: "uppercase",
                          }}
                        >
                          Facility Status
                        </div>
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 800,
                            color: "#10b981",
                            marginTop: "2px",
                          }}
                        >
                          Active Facility
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Secondary Professional Info Card (Optional Dual Role) */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: "16px",
                    padding: "28px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "10px",
                        backgroundColor: "#fef3c7",
                        color: "#d97706",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.1rem",
                      }}
                    >
                      <i className="fa-solid fa-user-md"></i>
                    </div>
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "1rem",
                          fontWeight: 800,
                          color: "#0b1c2d",
                        }}
                      >
                        Professional Clinical Identity
                      </h3>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Secondary information for dual-role medical
                        practitioners
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: "#f8fafc",
                      padding: "16px",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 800,
                            color: "#0b1c2d",
                            fontSize: "0.95rem",
                          }}
                        >
                          {currentUser?.specialization
                            ? `Doctor • ${currentUser.specialization}`
                            : "Practicing Medical Practitioner"}
                        </div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "#64748b",
                            marginTop: "2px",
                          }}
                        >
                          Registration:{" "}
                          {currentUser?.registrationNumber || "MCI-784920-AP"}
                        </div>
                      </div>
                      <span
                        style={{
                          backgroundColor: "rgba(8, 174, 184, 0.1)",
                          color: "#08AEB8",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          padding: "4px 10px",
                          borderRadius: "6px",
                        }}
                      >
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              width: "100%",
            }}
          >
            {/* Page Header */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "24px 32px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "#0b1c2d",
                }}
              >
                Hospital Administration Settings
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "0.88rem",
                  color: "#64748b",
                }}
              >
                Manage administrator account preferences, security governance,
                and tenant policies.
              </p>
            </div>

            {/* Security & Access Cards */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "28px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 16px",
                  fontSize: "1.15rem",
                  fontWeight: 800,
                  color: "#0b1c2d",
                }}
              >
                Security & Access Governance
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: "20px",
                }}
              >
                <div
                  style={{
                    padding: "20px",
                    borderRadius: "12px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      color: "#0b1c2d",
                      fontSize: "0.95rem",
                      marginBottom: "4px",
                    }}
                  >
                    <i
                      className="fa-solid fa-lock"
                      style={{ color: "#08AEB8", marginRight: "8px" }}
                    ></i>{" "}
                    Multi-Tenant Context Isolation
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.82rem",
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    All member queries are isolated to tenant context:{" "}
                    <strong style={{ color: "#08AEB8" }}>
                      {stats.hospitalCode}
                    </strong>
                    .
                  </p>
                </div>

                <div
                  style={{
                    padding: "20px",
                    borderRadius: "12px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      color: "#0b1c2d",
                      fontSize: "0.95rem",
                      marginBottom: "4px",
                    }}
                  >
                    <i
                      className="fa-solid fa-key"
                      style={{ color: "#08AEB8", marginRight: "8px" }}
                    ></i>{" "}
                    Provisioning Security
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.82rem",
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    Plaintext credentials are shown once upon creation and are
                    never logged or stored in plain text.
                  </p>
                </div>

                <div
                  style={{
                    padding: "20px",
                    borderRadius: "12px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      color: "#0b1c2d",
                      fontSize: "0.95rem",
                      marginBottom: "4px",
                    }}
                  >
                    <i
                      className="fa-solid fa-shield-halved"
                      style={{ color: "#08AEB8", marginRight: "8px" }}
                    ></i>{" "}
                    Role-Based API Authorization
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.82rem",
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    Backend authentication guards validate hospital membership
                    before granting management permissions.
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              width: "100%",
            }}
          >
            {/* Audit Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "24px 32px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    color: "#0b1c2d",
                  }}
                >
                  Administrative Audit Logs
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "0.88rem",
                    color: "#64748b",
                  }}
                >
                  Comprehensive trail of administrative member additions, edits,
                  and status changes.
                </p>
              </div>
              <button
                onClick={fetchAuditLogs}
                style={{
                  backgroundColor: "#0b1c2d",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <i className="fa-solid fa-arrows-rotate"></i> Refresh Audit
                Trail
              </button>
            </div>

            {/* Audit Table */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "28px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
              }}
            >
              {auditLogs.length === 0 ? (
                <div
                  style={{
                    padding: "48px",
                    textAlign: "center",
                    color: "#94a3b8",
                  }}
                >
                  <i
                    className="fa-solid fa-shield-cat"
                    style={{
                      fontSize: "2.5rem",
                      marginBottom: "12px",
                      display: "block",
                    }}
                  ></i>
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#475569",
                    }}
                  >
                    No Audit Logs Recorded
                  </div>
                  <p style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
                    System events will appear here when administrative actions
                    are performed.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.85rem",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          backgroundColor: "#f8fafc",
                          borderBottom: "2px solid #e2e8f0",
                          textTransform: "uppercase",
                          fontSize: "0.72rem",
                          color: "#475569",
                          letterSpacing: "0.05em",
                        }}
                      >
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>
                          Timestamp
                        </th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>
                          Action
                        </th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>
                          Resource
                        </th>
                        <th style={{ textAlign: "left", padding: "12px 16px" }}>
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.slice(0, 30).map((log) => (
                        <tr
                          key={log.id}
                          style={{ borderBottom: "1px solid #f1f5f9" }}
                        >
                          <td
                            style={{
                              padding: "14px 16px",
                              color: "#64748b",
                              fontWeight: 500,
                            }}
                          >
                            {new Date(
                              log.created_at || log.timestamp,
                            ).toLocaleString()}
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span
                              style={{
                                fontWeight: 800,
                                color: "#08AEB8",
                                backgroundColor: "rgba(8,174,184,0.1)",
                                padding: "4px 10px",
                                borderRadius: "6px",
                              }}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "14px 16px",
                              color: "#334155",
                              fontWeight: 700,
                            }}
                          >
                            {log.resource_type || log.resourceType}
                          </td>
                          <td
                            style={{ padding: "14px 16px", color: "#475569" }}
                          >
                            {typeof log.metadata === "object"
                              ? JSON.stringify(log.metadata)
                              : String(log.metadata || "")}
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
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(11, 28, 45, 0.6)",
            backdropFilter: "blur(6px)",
            zIndex: 4000,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "80px 20px 20px 20px",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "560px",
              boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              maxHeight: "calc(100vh - 100px)",
              display: "flex",
              flexDirection: "column",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                padding: "24px 28px",
                backgroundColor: "#0b1c2d",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>
                  Create Doctor Account
                </h3>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#94a3b8",
                    marginTop: "2px",
                  }}
                >
                  Provision credentials for Doctor Portal access
                </div>
              </div>
              <button
                onClick={() => setShowAddDoctorModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={handleAddDoctorSubmit}
              style={{
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
                overflowY: "auto",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Doctor Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Anil Kumar"
                  value={docFullName}
                  onChange={(e) => setDocFullName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="anil@example.com"
                    value={docEmail}
                    onChange={(e) => setDocEmail(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={docPhone}
                    onChange={(e) => setDocPhone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Specialization
                  </label>
                  <input
                    type="text"
                    placeholder="General Physician / Cardiology"
                    value={docSpecialization}
                    onChange={(e) => setDocSpecialization(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Qualification
                  </label>
                  <input
                    type="text"
                    placeholder="MBBS, MD"
                    value={docQualification}
                    onChange={(e) => setDocQualification(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Medical Reg Number
                  </label>
                  <input
                    type="text"
                    placeholder="MCI-123456"
                    value={docRegNumber}
                    onChange={(e) => setDocRegNumber(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Gender
                  </label>
                  <select
                    value={docGender}
                    onChange={(e) => setDocGender(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      outline: "none",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowAddDoctorModal(false)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    padding: "10px 24px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#08AEB8",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: isLoading ? 0.7 : 1,
                  }}
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
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(11, 28, 45, 0.6)",
            backdropFilter: "blur(6px)",
            zIndex: 4000,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "80px 20px 20px 20px",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              maxHeight: "calc(100vh - 100px)",
              display: "flex",
              flexDirection: "column",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                padding: "24px 28px",
                backgroundColor: "#0b1c2d",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>
                  Create Staff Account
                </h3>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#94a3b8",
                    marginTop: "2px",
                  }}
                >
                  Provision credentials for Staff Portal access
                </div>
              </div>
              <button
                onClick={() => setShowAddStaffModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form
              onSubmit={handleAddStaffSubmit}
              style={{
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
                overflowY: "auto",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Staff Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ravi Kumar"
                  value={staffFullName}
                  onChange={(e) => setStaffFullName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="ravi@example.com"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98765 12345"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Staff Role *
                  </label>
                  <select
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      outline: "none",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value="Reception / Front Desk">
                      Reception / Front Desk
                    </option>
                    <option value="Nurse">Nurse</option>
                    <option value="Coordinator">Coordinator</option>
                    <option value="Other Staff">Other Staff</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    padding: "10px 24px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#08AEB8",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: isLoading ? 0.7 : 1,
                  }}
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
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(11, 28, 45, 0.6)",
            backdropFilter: "blur(6px)",
            zIndex: 4000,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "40px 20px 20px 20px",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "20px",
              width: "100%",
              maxWidth: "540px",
              boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              maxHeight: "calc(100vh - 60px)",
              display: "flex",
              flexDirection: "column",
              margin: "0 auto",
              position: "relative",
            }}
          >
            {/* Top Header */}
            <div
              style={{
                padding: "24px 28px",
                backgroundColor: "#f0fdf4",
                borderBottom: "1px solid #bbf7d0",
                textAlign: "center",
                position: "relative",
              }}
            >
              <button
                onClick={() => setShowCredentialModal(false)}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "none",
                  border: "none",
                  fontSize: "1.2rem",
                  color: "#166534",
                  cursor: "pointer",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "50%",
                  backgroundColor: "#dcfce7",
                  color: "#16a34a",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.5rem",
                  marginBottom: "10px",
                }}
              >
                <i className="fa-solid fa-circle-check"></i>
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.35rem",
                  fontWeight: 800,
                  color: "#14532d",
                }}
              >
                {createdCredential.role === "Doctor"
                  ? "Doctor Account Created Successfully"
                  : "Staff Account Created Successfully"}
              </h3>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#166534",
                  marginTop: "4px",
                  fontWeight: 600,
                }}
              >
                Hospital: {createdCredential.hospitalName}
              </div>
            </div>

            {/* Body Details */}
            <div style={{ padding: "28px", overflowY: "auto" }}>
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: "14px",
                  padding: "20px",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#64748b",
                      textTransform: "uppercase",
                    }}
                  >
                    Hospital
                  </span>
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 800,
                      color: "#0b1c2d",
                    }}
                  >
                    {createdCredential.hospitalName}
                  </div>
                </div>

                <div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#64748b",
                      textTransform: "uppercase",
                    }}
                  >
                    Member Name & Role
                  </span>
                  <div
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: "#0b1c2d",
                    }}
                  >
                    {createdCredential.memberName}{" "}
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "#08AEB8",
                        fontWeight: 700,
                      }}
                    >
                      ({createdCredential.role})
                    </span>
                  </div>
                </div>

                <div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#64748b",
                      textTransform: "uppercase",
                    }}
                  >
                    Login Email
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "2px",
                    }}
                  >
                    <code
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "#0f172a",
                      }}
                    >
                      {createdCredential.email}
                    </code>
                    <button
                      onClick={() =>
                        copyToClipboard(createdCredential.email, "Email")
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: "#08AEB8",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "0.82rem",
                      }}
                    >
                      <i className="fa-regular fa-copy"></i> Copy Email
                    </button>
                  </div>
                </div>

                <div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#64748b",
                      textTransform: "uppercase",
                    }}
                  >
                    Temporary Password
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "2px",
                    }}
                  >
                    <code
                      style={{
                        fontSize: "1rem",
                        fontWeight: 800,
                        color: "#b91c1c",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {showTempPassword
                        ? createdCredential.temporaryPassword
                        : "••••••••••••"}
                    </code>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        onClick={() => setShowTempPassword(!showTempPassword)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                        }}
                      >
                        <i
                          className={`fa-solid ${showTempPassword ? "fa-eye-slash" : "fa-eye"}`}
                        ></i>
                      </button>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            createdCredential.temporaryPassword,
                            "Password",
                          )
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: "#08AEB8",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: "0.82rem",
                        }}
                      >
                        <i className="fa-regular fa-copy"></i> Copy Password
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#64748b",
                      textTransform: "uppercase",
                    }}
                  >
                    Target Portal
                  </span>
                  <div
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: "#0369a1",
                      marginTop: "2px",
                    }}
                  >
                    {createdCredential.portalName}
                  </div>
                </div>
              </div>

              {/* Warning Banner */}
              <div
                style={{
                  backgroundColor: "#fffbebe6",
                  border: "1px solid #fde68a",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  fontSize: "0.8rem",
                  color: "#92400e",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "20px",
                }}
              >
                <i
                  className="fa-solid fa-triangle-exclamation"
                  style={{ fontSize: "1rem", color: "#d97706" }}
                ></i>
                <span>
                  <strong>Security Notice:</strong> Share these credentials
                  securely. The temporary password is shown once.
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => {
                    const text = `Hospital: ${createdCredential.hospitalName}\nName: ${createdCredential.memberName}\nRole: ${createdCredential.role}\nEmail: ${createdCredential.email}\nPassword: ${createdCredential.temporaryPassword}\nPortal: ${createdCredential.portalName}`;
                    copyToClipboard(text, "Full Credentials Block");
                  }}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#0b1c2d",
                    fontWeight: 700,
                    fontSize: "0.88rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <i className="fa-solid fa-copy"></i> Copy Credentials
                </button>
                <button
                  onClick={() => setShowCredentialModal(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "10px",
                    border: "none",
                    backgroundColor: "#0b1c2d",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.88rem",
                    cursor: "pointer",
                  }}
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
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(11, 28, 45, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                backgroundColor: "#0b1c2d",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                {viewMemberModal.memberType === "doctor"
                  ? "Doctor Details"
                  : "Staff Details"}
              </h3>
              <button
                onClick={() =>
                  setViewMemberModal({
                    show: false,
                    memberType: "doctor",
                    member: null,
                  })
                }
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                fontSize: "0.9rem",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  Full Name
                </span>
                <div
                  style={{
                    fontWeight: 800,
                    color: "#0b1c2d",
                    fontSize: "1.05rem",
                  }}
                >
                  {viewMemberModal.member.fullName}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  Email Address
                </span>
                <div style={{ fontWeight: 600, color: "#334155" }}>
                  {viewMemberModal.member.email}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  Phone
                </span>
                <div style={{ fontWeight: 600, color: "#334155" }}>
                  {viewMemberModal.member.phone || "N/A"}
                </div>
              </div>
              {viewMemberModal.memberType === "doctor" ? (
                <>
                  <div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Specialization
                    </span>
                    <div style={{ fontWeight: 600, color: "#08AEB8" }}>
                      {viewMemberModal.member.specialization}
                    </div>
                  </div>
                  {viewMemberModal.member.qualification && (
                    <div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Qualification
                      </span>
                      <div style={{ fontWeight: 600, color: "#334155" }}>
                        {viewMemberModal.member.qualification}
                      </div>
                    </div>
                  )}
                  {viewMemberModal.member.registrationNumber && (
                    <div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Medical Registration No
                      </span>
                      <div style={{ fontWeight: 600, color: "#334155" }}>
                        {viewMemberModal.member.registrationNumber}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#64748b",
                      textTransform: "uppercase",
                    }}
                  >
                    Staff Role
                  </span>
                  <div style={{ fontWeight: 600, color: "#3730a3" }}>
                    {viewMemberModal.member.staffRole}
                  </div>
                </div>
              )}
              <div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  Account Status
                </span>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      backgroundColor:
                        viewMemberModal.member.status === "active"
                          ? "#dcfce7"
                          : "#f1f5f9",
                      color:
                        viewMemberModal.member.status === "active"
                          ? "#15803d"
                          : "#64748b",
                    }}
                  >
                    {viewMemberModal.member.status
                      ? viewMemberModal.member.status.toUpperCase()
                      : "ACTIVE"}
                  </span>
                </div>
              </div>
              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() =>
                    setViewMemberModal({
                      show: false,
                      memberType: "doctor",
                      member: null,
                    })
                  }
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#0b1c2d",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
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
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(11, 28, 45, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                backgroundColor: "#0b1c2d",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                Edit Doctor Profile
              </h3>
              <button
                onClick={() => setShowEditDoctorModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form
              onSubmit={handleEditDoctorSubmit}
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={docFullName}
                  onChange={(e) => setDocFullName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  Phone
                </label>
                <input
                  type="text"
                  value={docPhone}
                  onChange={(e) => setDocPhone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  Specialization
                </label>
                <input
                  type="text"
                  value={docSpecialization}
                  onChange={(e) => setDocSpecialization(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Qualification
                  </label>
                  <input
                    type="text"
                    value={docQualification}
                    onChange={(e) => setDocQualification(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Medical Reg Number
                  </label>
                  <input
                    type="text"
                    value={docRegNumber}
                    onChange={(e) => setDocRegNumber(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowEditDoctorModal(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#08AEB8",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
                MODAL 6: EDIT STAFF MODAL
            ========================================================================= */}
      {showEditStaffModal && editingStaff && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(11, 28, 45, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                backgroundColor: "#0b1c2d",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                Edit Staff Profile
              </h3>
              <button
                onClick={() => setShowEditStaffModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form
              onSubmit={handleEditStaffSubmit}
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={staffFullName}
                  onChange={(e) => setStaffFullName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  Phone
                </label>
                <input
                  type="text"
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  Staff Role
                </label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="Reception / Front Desk">
                    Reception / Front Desk
                  </option>
                  <option value="Nurse">Nurse</option>
                  <option value="Coordinator">Coordinator</option>
                  <option value="Other Staff">Other Staff</option>
                </select>
              </div>
              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowEditStaffModal(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#08AEB8",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
                MODAL 7: EDIT HOSPITAL PROFILE MODAL
            ========================================================================= */}
      {showEditHospitalModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(11, 28, 45, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                backgroundColor: "#0b1c2d",
                color: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                Edit Hospital Profile
              </h3>
              <button
                onClick={() => setShowEditHospitalModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form
              onSubmit={handleEditHospitalSubmit}
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  Hospital Name
                </label>
                <input
                  type="text"
                  required
                  value={hospName}
                  onChange={(e) => setHospName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Phone
                  </label>
                  <input
                    type="text"
                    value={hospPhone}
                    onChange={(e) => setHospPhone(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={hospEmail}
                    onChange={(e) => setHospEmail(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "4px",
                  }}
                >
                  Address
                </label>
                <input
                  type="text"
                  value={hospAddress}
                  onChange={(e) => setHospAddress(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    City
                  </label>
                  <input
                    type="text"
                    value={hospCity}
                    onChange={(e) => setHospCity(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "4px",
                    }}
                  >
                    State
                  </label>
                  <input
                    type="text"
                    value={hospState}
                    onChange={(e) => setHospState(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowEditHospitalModal(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#0b1c2d",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Save Hospital Info
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
                MODAL 8: ACTIVATE / DEACTIVATE CONFIRMATION DIALOG
            ========================================================================= */}
      {statusConfirmModal.show && statusConfirmModal.member && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(11, 28, 45, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 3500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "440px",
              padding: "28px",
              textAlign: "center",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "50%",
                backgroundColor:
                  statusConfirmModal.targetStatus === "inactive"
                    ? "#fef2f2"
                    : "#f0fdf4",
                color:
                  statusConfirmModal.targetStatus === "inactive"
                    ? "#ef4444"
                    : "#16a34a",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.4rem",
                marginBottom: "16px",
              }}
            >
              <i
                className={`fa-solid ${statusConfirmModal.targetStatus === "inactive" ? "fa-user-slash" : "fa-user-check"}`}
              ></i>
            </div>
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: "1.2rem",
                fontWeight: 800,
                color: "#0b1c2d",
              }}
            >
              {statusConfirmModal.targetStatus === "inactive"
                ? `Deactivate ${statusConfirmModal.member.fullName}?`
                : `Activate ${statusConfirmModal.member.fullName}?`}
            </h3>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: "0.85rem",
                color: "#64748b",
              }}
            >
              {statusConfirmModal.targetStatus === "inactive"
                ? `Deactivating this member will suspend their access to the hospital portal.`
                : `Activating this member will restore their access permissions for this hospital.`}
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() =>
                  setStatusConfirmModal({
                    show: false,
                    memberType: "doctor",
                    member: null,
                    targetStatus: "inactive",
                  })
                }
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#475569",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeStatusToggle}
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor:
                    statusConfirmModal.targetStatus === "inactive"
                      ? "#dc2626"
                      : "#16a34a",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isLoading
                  ? "Updating..."
                  : `Yes, ${statusConfirmModal.targetStatus === "inactive" ? "Deactivate" : "Activate"}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* =========================================================================
    MODAL: MANAGE DOCTOR SCHEDULE
============================================================================= */}

      {showScheduleModal &&
        scheduleDoctor &&
        createPortal(
          <div
            onClick={closeDoctorScheduleModal}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,

              backgroundColor: "rgba(11, 28, 45, 0.58)",

              backdropFilter: "blur(4px)",

              display: "flex",

              alignItems: "center",

              justifyContent: "center",

              padding: "20px",
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "100%",

                maxWidth: "950px",

                maxHeight: "90vh",

                backgroundColor: "#ffffff",

                borderRadius: "18px",

                border: "1px solid #e2e8f0",

                boxShadow: "0 24px 60px rgba(0,0,0,0.25)",

                overflow: "hidden",

                display: "flex",

                flexDirection: "column",
              }}
            >
              {/* ==============================================
            HEADER
        ============================================== */}

              <div
                style={{
                  padding: "18px 22px",

                  background:
                    "linear-gradient(135deg, #0b1c2d 0%, #08265F 70%, #08AEB8 100%)",

                  color: "#ffffff",

                  display: "flex",

                  justifyContent: "space-between",

                  alignItems: "center",

                  gap: "15px",
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,

                      fontSize: "1.15rem",

                      fontWeight: 800,
                    }}
                  >
                    Manage Doctor Schedule
                  </h3>

                  <p
                    style={{
                      margin: "4px 0 0",

                      color: "#cbd5e1",

                      fontSize: "0.8rem",
                    }}
                  >
                    {scheduleDoctor.fullName}

                    {scheduleDoctor.specialization
                      ? ` • ${scheduleDoctor.specialization}`
                      : ""}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDoctorScheduleModal}
                  style={{
                    width: "34px",

                    height: "34px",

                    borderRadius: "8px",

                    border: "1px solid rgba(255,255,255,0.25)",

                    backgroundColor: "rgba(255,255,255,0.1)",

                    color: "#ffffff",

                    cursor: "pointer",
                  }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              {/* ==============================================
            BODY
        ============================================== */}

              <div
                style={{
                  padding: "22px",

                  overflowY: "auto",
                }}
              >
                {/* Error */}

                {scheduleError && (
                  <div
                    style={{
                      marginBottom: "16px",

                      padding: "11px 14px",

                      backgroundColor: "#fef2f2",

                      border: "1px solid #fecaca",

                      borderRadius: "9px",

                      color: "#991b1b",

                      fontSize: "0.8rem",

                      fontWeight: 600,
                    }}
                  >
                    <i
                      className="fa-solid fa-circle-exclamation"
                      style={{
                        marginRight: "7px",
                      }}
                    />

                    {scheduleError}
                  </div>
                )}
                {/* Success Message */}

                {scheduleSuccess && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "11px 14px",
                      backgroundColor: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "9px",
                      color: "#166534",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                    }}
                  >
                    <i className="fa-solid fa-circle-check" />

                    {scheduleSuccess}
                  </div>
                )}

                {/* Loading */}

                {scheduleLoading ? (
                  <div
                    style={{
                      padding: "60px 20px",

                      textAlign: "center",

                      color: "#64748b",
                    }}
                  >
                    <i
                      className="fa-solid fa-spinner fa-spin"
                      style={{
                        fontSize: "1.5rem",

                        display: "block",

                        marginBottom: "10px",

                        color: "#08AEB8",
                      }}
                    />
                    Loading doctor schedule...
                  </div>
                ) : (
                  <>
                    {/* ==========================================
                  WEEKLY AVAILABILITY
              ========================================== */}

                    <div
                      style={{
                        marginBottom: "25px",
                      }}
                    >
                      <h4
                        style={{
                          margin: "0 0 4px",

                          color: "#0b1c2d",

                          fontSize: "1rem",

                          fontWeight: 800,
                        }}
                      >
                        Weekly Availability
                      </h4>

                      <p
                        style={{
                          margin: "0 0 14px",

                          color: "#64748b",

                          fontSize: "0.78rem",
                        }}
                      >
                        Select the days the doctor works and configure
                        consultation sessions.
                      </p>

                      <div
                        style={{
                          display: "flex",

                          flexDirection: "column",

                          gap: "10px",
                        }}
                      >
                        {doctorSchedule.map((item) => (
                          <div
                            key={item.day_of_week}
                            style={{
                              border: "1px solid #e2e8f0",

                              borderRadius: "11px",

                              backgroundColor: item.is_available
                                ? "#ffffff"
                                : "#f8fafc",

                              overflow: "hidden",
                            }}
                          >
                            {/* Day header */}

                            <div
                              style={{
                                padding: "12px 14px",

                                display: "flex",

                                justifyContent: "space-between",

                                alignItems: "center",

                                gap: "12px",

                                borderBottom: item.is_available
                                  ? "1px solid #e2e8f0"
                                  : "none",
                              }}
                            >
                              <label
                                style={{
                                  display: "flex",

                                  alignItems: "center",

                                  gap: "9px",

                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(item.is_available)}
                                  onChange={() =>
                                    handleScheduleDayToggle(item.day_of_week)
                                  }
                                  style={{
                                    width: "17px",

                                    height: "17px",

                                    accentColor: "#08AEB8",
                                  }}
                                />

                                <div>
                                  <div
                                    style={{
                                      color: "#0b1c2d",

                                      fontWeight: 800,

                                      fontSize: "0.88rem",
                                    }}
                                  >
                                    {item.day_of_week}
                                  </div>

                                  <div
                                    style={{
                                      marginTop: "2px",

                                      fontSize: "0.69rem",

                                      fontWeight: 600,

                                      color: item.is_available
                                        ? "#059669"
                                        : "#94a3b8",
                                    }}
                                  >
                                    {item.is_available
                                      ? `${
                                          item.time_windows?.length || 0
                                        } session${
                                          item.time_windows?.length === 1
                                            ? ""
                                            : "s"
                                        }`
                                      : "Unavailable"}
                                  </div>
                                </div>
                              </label>

                              {item.is_available && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAddScheduleWindow(item.day_of_week)
                                  }
                                  style={{
                                    padding: "6px 10px",

                                    borderRadius: "7px",

                                    border: "1px solid #a5f3fc",

                                    backgroundColor: "#ecfeff",

                                    color: "#0891b2",

                                    fontSize: "0.7rem",

                                    fontWeight: 700,

                                    cursor: "pointer",
                                  }}
                                >
                                  <i
                                    className="fa-solid fa-plus"
                                    style={{
                                      marginRight: "5px",
                                    }}
                                  />
                                  Add Session
                                </button>
                              )}
                            </div>

                            {/* Consultation sessions */}

                            {item.is_available && (
                              <div
                                style={{
                                  padding: "12px 14px",

                                  display: "flex",

                                  flexDirection: "column",

                                  gap: "9px",
                                }}
                              >
                                {(item.time_windows || []).map(
                                  (window, windowIndex) => (
                                    <div
                                      key={`${item.day_of_week}-${windowIndex}`}
                                      style={{
                                        padding: "10px",

                                        backgroundColor: "#f8fafc",

                                        border: "1px solid #e2e8f0",

                                        borderRadius: "9px",

                                        display: "grid",

                                        gridTemplateColumns:
                                          "75px minmax(135px, 1fr) 20px minmax(135px, 1fr) 38px",

                                        gap: "9px",

                                        alignItems: "end",
                                      }}
                                    >
                                      <div
                                        style={{
                                          alignSelf: "center",

                                          fontSize: "0.68rem",

                                          fontWeight: 800,

                                          color: "#64748b",
                                        }}
                                      >
                                        Session {windowIndex + 1}
                                      </div>

                                      {/* Start */}

                                      <div>
                                        <label
                                          style={{
                                            display: "block",

                                            marginBottom: "4px",

                                            color: "#64748b",

                                            fontSize: "0.63rem",

                                            fontWeight: 700,
                                          }}
                                        >
                                          START
                                        </label>

                                        <select
                                          value={
                                            window.start_time || "10:00 AM"
                                          }
                                          onChange={(event) =>
                                            handleScheduleWindowChange(
                                              item.day_of_week,
                                              windowIndex,
                                              "start_time",
                                              event.target.value,
                                            )
                                          }
                                          style={{
                                            width: "100%",

                                            padding: "8px",

                                            border: "1px solid #cbd5e1",

                                            borderRadius: "7px",

                                            backgroundColor: "#ffffff",

                                            fontSize: "0.76rem",
                                          }}
                                        >
                                          {SCHEDULE_TIME_OPTIONS.map((time) => (
                                            <option key={time} value={time}>
                                              {time}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      <div
                                        style={{
                                          height: "34px",

                                          display: "flex",

                                          alignItems: "center",

                                          justifyContent: "center",

                                          color: "#94a3b8",
                                        }}
                                      >
                                        <i className="fa-solid fa-arrow-right" />
                                      </div>

                                      {/* End */}

                                      <div>
                                        <label
                                          style={{
                                            display: "block",

                                            marginBottom: "4px",

                                            color: "#64748b",

                                            fontSize: "0.63rem",

                                            fontWeight: 700,
                                          }}
                                        >
                                          END
                                        </label>

                                        <select
                                          value={window.end_time || "12:00 PM"}
                                          onChange={(event) =>
                                            handleScheduleWindowChange(
                                              item.day_of_week,
                                              windowIndex,
                                              "end_time",
                                              event.target.value,
                                            )
                                          }
                                          style={{
                                            width: "100%",

                                            padding: "8px",

                                            border: "1px solid #cbd5e1",

                                            borderRadius: "7px",

                                            backgroundColor: "#ffffff",

                                            fontSize: "0.76rem",
                                          }}
                                        >
                                          {SCHEDULE_TIME_OPTIONS.map((time) => (
                                            <option key={time} value={time}>
                                              {time}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Remove */}

                                      <button
                                        type="button"
                                        disabled={
                                          (item.time_windows || []).length <= 1
                                        }
                                        onClick={() =>
                                          handleRemoveScheduleWindow(
                                            item.day_of_week,
                                            windowIndex,
                                          )
                                        }
                                        style={{
                                          width: "34px",

                                          height: "34px",

                                          borderRadius: "7px",

                                          border: "1px solid #fecaca",

                                          backgroundColor: "#ffffff",

                                          color: "#dc2626",

                                          cursor:
                                            (item.time_windows || []).length <=
                                            1
                                              ? "not-allowed"
                                              : "pointer",

                                          opacity:
                                            (item.time_windows || []).length <=
                                            1
                                              ? 0.4
                                              : 1,
                                        }}
                                      >
                                        <i className="fa-solid fa-trash" />
                                      </button>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: "16px",
                      }}
                    >
                      <button
                        type="button"
                        disabled={scheduleSaving}
                        onClick={handleSaveDoctorSchedule}
                        style={{
                          padding: "9px 18px",

                          border: "none",

                          borderRadius: "8px",

                          backgroundColor: "#08AEB8",

                          color: "#ffffff",

                          fontSize: "0.78rem",

                          fontWeight: 800,

                          cursor: scheduleSaving ? "not-allowed" : "pointer",

                          opacity: scheduleSaving ? 0.7 : 1,

                          display: "inline-flex",

                          alignItems: "center",

                          gap: "7px",
                        }}
                      >
                        {scheduleSaving ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-floppy-disk" />
                            Save Weekly Schedule
                          </>
                        )}
                      </button>
                    </div>

                    {/* ==========================================
                  CURRENT BLOCKED DATES — READ ONLY
              ========================================== */}

                    <div
                      style={{
                        borderTop: "1px solid #e2e8f0",

                        paddingTop: "20px",
                      }}
                    >
                      <h4
                        style={{
                          margin: "0 0 4px",

                          color: "#0b1c2d",

                          fontSize: "1rem",

                          fontWeight: 800,
                        }}
                      >
                        Leave / Unavailable Dates
                      </h4>

                      <p
                        style={{
                          margin: "0 0 12px",

                          color: "#64748b",

                          fontSize: "0.76rem",
                        }}
                      >
                        Existing hospital-specific unavailable dates.
                      </p>
                      <form
                        onSubmit={handleAddDoctorBlockedDate}
                        style={{
                          display: "grid",

                          gridTemplateColumns: "170px minmax(200px, 1fr) auto",

                          gap: "10px",

                          marginBottom: "14px",
                        }}
                      >
                        <input
                          type="date"
                          required
                          value={blockDateForm.date}
                          onChange={(event) =>
                            setBlockDateForm((previous) => ({
                              ...previous,

                              date: event.target.value,
                            }))
                          }
                          style={{
                            padding: "8px 10px",

                            border: "1px solid #cbd5e1",

                            borderRadius: "8px",

                            fontSize: "0.78rem",
                          }}
                        />

                        <input
                          type="text"
                          placeholder="Reason, e.g. Surgery / Leave"
                          value={blockDateForm.reason}
                          onChange={(event) =>
                            setBlockDateForm((previous) => ({
                              ...previous,

                              reason: event.target.value,
                            }))
                          }
                          style={{
                            padding: "8px 10px",

                            border: "1px solid #cbd5e1",

                            borderRadius: "8px",

                            fontSize: "0.78rem",
                          }}
                        />

                        <button
                          type="submit"
                          disabled={blockDateLoading}
                          style={{
                            padding: "8px 14px",

                            border: "none",

                            borderRadius: "8px",

                            backgroundColor: "#0b1c2d",

                            color: "#ffffff",

                            fontSize: "0.76rem",

                            fontWeight: 700,

                            cursor: blockDateLoading
                              ? "not-allowed"
                              : "pointer",

                            opacity: blockDateLoading ? 0.7 : 1,
                          }}
                        >
                          {blockDateLoading ? "Adding..." : "Block Date"}
                        </button>
                      </form>

                      {doctorBlockedDates.length === 0 ? (
                        <div
                          style={{
                            padding: "17px",

                            border: "1px dashed #cbd5e1",

                            borderRadius: "9px",

                            textAlign: "center",

                            color: "#64748b",

                            fontSize: "0.76rem",
                          }}
                        >
                          No blocked dates for this doctor.
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",

                            flexDirection: "column",

                            gap: "7px",
                          }}
                        >
                          {doctorBlockedDates.map((blocked) => (
                            <div
                              key={blocked.id}
                              style={{
                                padding: "10px 12px",

                                backgroundColor: "#fff7ed",

                                border: "1px solid #fed7aa",

                                borderRadius: "8px",
                              }}
                            >
                              <div
                                style={{
                                  color: "#9a3412",

                                  fontWeight: 800,

                                  fontSize: "0.79rem",
                                }}
                              >
                                {blocked.blocked_date}
                              </div>

                              <div
                                style={{
                                  marginTop: "2px",

                                  color: "#7c2d12",

                                  fontSize: "0.72rem",
                                }}
                              >
                                {blocked.reason || "Unavailable"}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteDoctorBlockedDate(blocked.id)
                                }
                                title="Remove blocked date"
                                style={{
                                  width: "34px",

                                  height: "34px",

                                  minWidth: "34px",

                                  border: "1px solid #fecaca",

                                  borderRadius: "8px",

                                  backgroundColor: "#ffffff",

                                  color: "#dc2626",

                                  cursor: "pointer",
                                }}
                              >
                                <i className="fa-solid fa-trash" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* ==============================================
            FOOTER
        ============================================== */}

              <div
                style={{
                  padding: "13px 22px",

                  borderTop: "1px solid #e2e8f0",

                  backgroundColor: "#f8fafc",

                  display: "flex",

                  justifyContent: "space-between",

                  alignItems: "center",

                  gap: "12px",
                }}
              >
                <div
                  style={{
                    color: "#64748b",

                    fontSize: "0.72rem",
                  }}
                >
                  <i
                    className="fa-solid fa-circle-info"
                    style={{
                      marginRight: "6px",
                    }}
                  />
                  Staff appointment booking will use this saved schedule.
                </div>

                <button
                  type="button"
                  onClick={closeDoctorScheduleModal}
                  style={{
                    padding: "8px 18px",

                    borderRadius: "8px",

                    border: "1px solid #cbd5e1",

                    backgroundColor: "#ffffff",

                    color: "#334155",

                    fontWeight: 700,

                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </DashboardLayout>
  );
}
