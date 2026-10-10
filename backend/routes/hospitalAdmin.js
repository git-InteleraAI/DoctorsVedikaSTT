const express = require("express");
const router = express.Router();
const { authenticateAdapter, requirePermission } = require("../middleware/authAdapter");
const { logAuditEvent } = require("../middleware/auditLogger");
const { createClient } = require("@supabase/supabase-js");

const {
    decryptRecord,
    isEncrypted
} = require("../services/encryptionService");

function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey);
}

// -----------------------------------------------------------------------------
// Protect all Hospital Admin routes with Authentication & Hospital Admin guard
// -----------------------------------------------------------------------------
router.use(authenticateAdapter);

// Explicit guard: Only Hospital Administrators can access /hospital-admin routes
const requireHospitalAdminRole = (req, res, next) => {
    const role = req.context?.role;
    const isHospitalAdmin = role === "hospital_admin" || role === "admin" || req.context?.capabilities?.hospitalAdmin;
    if (!req.context || !isHospitalAdmin) {
        return res.status(403).json({
            success: false,
            message: "Access forbidden. Hospital Administrator privileges required."
        });
    }
    next();
};

router.use(requireHospitalAdminRole);

// Helper function to generate secure temporary passwords
function generateTempPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pass = "Vedika@";
    for (let i = 0; i < 6; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
}

/**
 * GET /api/v1/hospital-admin/dashboard-stats
 * Returns dynamic overview metrics & overview lists for the Hospital Admin dashboard
 */
router.get("/dashboard-stats", requirePermission("hospital.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        let totalDoctors = 0;
        let activeDoctors = 0;
        let totalStaff = 0;
        let activeStaff = 0;
        let hospitalName = req.context.hospitalName || "Doctors Vedika Hospital";
        let hospitalCode = "DV-MAIN";
        let hospitalStatus = "active";
        let recentDoctors = [];
        let recentStaff = [];

        if (db) {
            // 1. Fetch Hospital Info
            const { data: hospData } = await db
                .from("hospitals")
                .select("name, code, status")
                .eq("id", hospitalId)
                .maybeSingle();

            if (hospData) {
                hospitalName = hospData.name || hospitalName;
                hospitalCode = hospData.code || hospitalCode;
                hospitalStatus = hospData.status || hospitalStatus;
            }

            // 2. Fetch Doctor Counts
            const { count: docTotalCount } = await db
                .from("hospital_members")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .eq("role", "doctor");
            totalDoctors = docTotalCount || 0;

            const { count: docActiveCount } = await db
                .from("hospital_members")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .eq("role", "doctor")
                .eq("status", "active");
            activeDoctors = docActiveCount || 0;

            // 3. Fetch Staff Counts
            const { count: staffTotalCount } = await db
                .from("hospital_members")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .eq("role", "staff");
            totalStaff = staffTotalCount || 0;

            const { count: staffActiveCount } = await db
                .from("hospital_members")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .eq("role", "staff")
                .eq("status", "active");
            activeStaff = staffActiveCount || 0;

            // 4. Fetch Recent Doctors overview list
            const { data: docMembers } = await db
                .from("hospital_members")
                .select("id, user_id, doctor_id, status, created_at")
                .eq("hospital_id", hospitalId)
                .eq("role", "doctor")
                .order("created_at", { ascending: false })
                .limit(5);

            if (docMembers && docMembers.length > 0) {
                const docIds = docMembers.map(m => m.doctor_id).filter(Boolean);
                const userIds = docMembers.map(m => m.user_id).filter(Boolean);

                const { data: docRows } = await db
                    .from("doctors")
                    .select("*")
                    .or(`doctor_id.in.(${docIds.join(",") || "00000000-0000-0000-0000-000000000000"}),user_id.in.(${userIds.join(",") || "00000000-0000-0000-0000-000000000000"})`);

                const { data: userRows } = await db
                    .from("users")
                    .select("*")
                    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

                recentDoctors = docMembers.map(m => {
                    const d = (docRows || []).find(dr => dr.doctor_id === m.doctor_id || (dr.user_id && dr.user_id === m.user_id));
                    const u = (userRows || []).find(ur => ur.id === m.user_id);
                    return {
                        memberId: m.id,
                        doctorId: m.doctor_id || d?.doctor_id,
                        userId: m.user_id,
                        fullName: d?.doctor_name || d?.full_name || u?.full_name || "Dr. Unnamed Doctor",
                        email: d?.doctor_email || d?.email || u?.email || "N/A",
                        phone: d?.doctor_mobile || d?.mobile_number || u?.phone || "N/A",
                        specialization: d?.doctor_specialization || d?.specialization || "General Physician",
                        status: m.status || "active",
                        createdAt: m.created_at
                    };
                });
            }

            // 5. Fetch Recent Staff overview list
            const { data: staffMembers } = await db
                .from("hospital_members")
                .select("id, user_id, status, created_at")
                .eq("hospital_id", hospitalId)
                .eq("role", "staff")
                .order("created_at", { ascending: false })
                .limit(5);

            if (staffMembers && staffMembers.length > 0) {
                const userIds = staffMembers.map(m => m.user_id).filter(Boolean);
                const { data: userRows } = await db
                    .from("users")
                    .select("*")
                    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

                recentStaff = staffMembers.map(m => {
                    const u = (userRows || []).find(ur => ur.id === m.user_id);
                    return {
                        memberId: m.id,
                        userId: m.user_id,
                        fullName: u?.full_name || "Staff Member",
                        email: u?.email || "N/A",
                        phone: u?.phone || "N/A",
                        staffRole: u?.staff_role || "Reception / Front Desk",
                        status: m.status || "active",
                        createdAt: m.created_at
                    };
                });
            }
        }

        return res.json({
            success: true,
            stats: {
                totalDoctors,
                activeDoctors,
                totalStaff,
                activeStaff,
                hospitalName,
                hospitalCode,
                hospitalStatus
            },
            recentDoctors,
            recentStaff
        });
    } catch (err) {
        console.error("[HospitalAdmin] dashboard-stats error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});


/**
 * GET /api/v1/hospital-admin/patients
 *
 * Hospital Admin:
 * Read-only list of patients belonging to the authenticated hospital.
 *
 * IMPORTANT SECURITY RULES:
 * - hospital_id always comes from authenticated req.context.
 * - Never accepts hospital_id from frontend for authorization.
 * - Only hospital-scoped operational/basic patient data is returned.
 * - No diagnosis, prescription, consultation notes, AI transcript,
 *   treatment plan, or other doctor-private clinical information.
 *
 * DATABASE:
 * READ ONLY.
 * This endpoint performs SELECT queries only.
 */
router.get(
    "/patients",
    requirePermission("hospital.view"),
    async (req, res) => {
        try {
            const db = getSupabaseClient();
            const hospitalId = req.context?.hospitalId;

            if (!db) {
                return res.status(500).json({
                    success: false,
                    message: "Database connection unavailable."
                });
            }

            if (!hospitalId) {
                return res.status(403).json({
                    success: false,
                    message: "No authenticated hospital context."
                });
            }

            /*
             * ============================================================
             * 1. FETCH HOSPITAL PATIENT RECORDS
             * ============================================================
             *
             * hospital_patient_records is the hospital-scoped patient
             * identity/source of truth.
             */
            const {
                data: hospitalPatientRows,
                error: hospitalPatientError
            } = await db
                .from("hospital_patient_records")
                .select(`
                    id,
                    hospital_id,
                    patient_id,
                    hospital_patient_code,
                    first_name,
                    last_name,
                    full_name,
                    phone,
                    date_of_birth,
                    gender,
                    registration_type,
                    status,
                    created_at
                `)
                .eq("hospital_id", hospitalId)
                .order("created_at", {
                    ascending: false
                });

            if (hospitalPatientError) {
                throw hospitalPatientError;
            }

            const hospitalPatients = hospitalPatientRows || [];

            if (hospitalPatients.length === 0) {
                return res.json({
                    success: true,
                    patients: []
                });
            }

            const hospitalPatientIds = hospitalPatients
                .map((patient) => patient.id)
                .filter(Boolean);

            /*
             * ============================================================
             * 2. FETCH OPERATIONAL VISITS
             * ============================================================
             *
             * Only timing/status/doctor information needed for the
             * Hospital Admin patient cards is selected.
             *
             * We intentionally do NOT select diagnosis, clinical notes,
             * prescriptions, transcript, treatment plan, etc.
             */
            const {
                data: visitRows,
                error: visitError
            } = await db
                .from("patient_visits")
                .select(`
                    id,
                    hospital_patient_id,
                    appointment_id,
                    doctor_id,
                    visit_stage,
                    visit_type,
                    checked_in_at,
                    consultation_started_at,
                    consultation_completed_at,
                    created_at,
                    doctors(
                        doctor_id,
                        doctor_name,
                        doctor_specialization
                    )
                `)
                .eq("hospital_id", hospitalId)
                .in("hospital_patient_id", hospitalPatientIds)
                .order("created_at", {
                    ascending: false
                });

            if (visitError) {
                throw visitError;
            }

            /*
             * ============================================================
             * 3. FETCH HOSPITAL APPOINTMENTS
             * ============================================================
             *
             * Used as a fallback for doctor/date/status when a patient
             * has an appointment but has not yet progressed into a visit.
             */
            const {
                data: appointmentRows,
                error: appointmentError
            } = await db
                .from("appointments")
                .select(`
                    id,
                    hospital_patient_id,
                    doctor_id,
                    appointment_date,
                    appointment_time,
                    status,
                    source,
                    created_at,
                    doctors(
                        doctor_id,
                        doctor_name,
                        doctor_specialization
                    )
                `)
                .eq("hospital_id", hospitalId)
                .in("hospital_patient_id", hospitalPatientIds)
                .order("created_at", {
                    ascending: false
                });

            if (appointmentError) {
                throw appointmentError;
            }

            /*
             * ============================================================
             * HELPERS
             * ============================================================
             */

            const calculateAge = (dateOfBirth) => {
                if (!dateOfBirth) {
                    return null;
                }

                const dob = new Date(dateOfBirth);

                if (Number.isNaN(dob.getTime())) {
                    return null;
                }

                const today = new Date();

                let age =
                    today.getFullYear() -
                    dob.getFullYear();

                const monthDifference =
                    today.getMonth() -
                    dob.getMonth();

                if (
                    monthDifference < 0 ||
                    (
                        monthDifference === 0 &&
                        today.getDate() < dob.getDate()
                    )
                ) {
                    age -= 1;
                }

                return age;
            };

            /*
             * Never return raw AES ciphertext to the frontend.
             *
             * decryptRecord normally handles it, but this provides
             * an additional safety check if configuration/decryption
             * ever fails.
             */
            const safeValue = (value, fallback = null) => {
                if (
                    value === null ||
                    value === undefined ||
                    value === ""
                ) {
                    return fallback;
                }

                if (isEncrypted(value)) {
                    return fallback;
                }

                return value;
            };

            /*
             * ============================================================
             * 4. BUILD PATIENT CARD RESPONSE
             * ============================================================
             */
            const patients = hospitalPatients.map((rawPatient) => {
                /*
                 * Decrypt only the hospital patient identity fields.
                 *
                 * The production encryption service also supports older
                 * plaintext records, so both legacy and encrypted records
                 * work through the same path.
                 */
                const patient = decryptRecord(
                    "hospital_patient_records",
                    rawPatient
                );

                /*
                 * Because visitRows are ordered newest first,
                 * index 0 is this patient's latest visit.
                 */
                const patientVisits = (visitRows || []).filter(
                    (visit) =>
                        visit.hospital_patient_id === rawPatient.id
                );

                const latestVisit =
                    patientVisits[0] || null;

                /*
                 * Same approach for appointments.
                 */
                const patientAppointments = (
                    appointmentRows || []
                ).filter(
                    (appointment) =>
                        appointment.hospital_patient_id ===
                        rawPatient.id
                );

                let latestAppointment = null;

                /*
                 * Prefer the appointment attached to the latest visit.
                 */
                if (latestVisit?.appointment_id) {
                    latestAppointment =
                        patientAppointments.find(
                            (appointment) =>
                                appointment.id ===
                                latestVisit.appointment_id
                        ) || null;
                }

                /*
                 * Otherwise use the newest hospital appointment.
                 */
                if (!latestAppointment) {
                    latestAppointment =
                        patientAppointments[0] || null;
                }

                /*
                 * Assigned doctor can come from the current/latest visit
                 * or from the latest appointment.
                 */
                const doctor =
                    latestVisit?.doctors ||
                    latestAppointment?.doctors ||
                    null;

                /*
                 * Build readable patient name.
                 */
                const constructedName = [
                    safeValue(patient?.first_name, ""),
                    safeValue(patient?.last_name, "")
                ]
                    .filter(Boolean)
                    .join(" ")
                    .trim();

                const fullName =
                    safeValue(patient?.full_name, null) ||
                    constructedName ||
                    "Patient";

                /*
                 * Card status priority:
                 *
                 * visit stage -> appointment status -> registered
                 */
                const currentStatus =
                    latestVisit?.visit_stage ||
                    latestAppointment?.status ||
                    "registered";

                return {
                    /*
                     * Hospital-scoped patient identity.
                     */
                    hospitalPatientId: rawPatient.id,

                    patientId:
                        rawPatient.patient_id || null,

                    patientCode:
                        rawPatient.hospital_patient_code ||
                        "N/A",

                    /*
                     * Basic patient profile requested for the cards.
                     */
                    fullName,

                    phone:
                        safeValue(
                            patient?.phone,
                            null
                        ),

                    age:
                        calculateAge(
                            patient?.date_of_birth
                        ),

                    gender:
                        safeValue(
                            patient?.gender,
                            null
                        ),

                    registrationType:
                        rawPatient.registration_type ||
                        null,

                    patientStatus:
                        rawPatient.status ||
                        "active",

                    /*
                     * Latest operational status.
                     */
                    currentStatus,

                    /*
                     * Assigned / latest doctor.
                     */
                    assignedDoctor: doctor
                        ? {
                            doctorId:
                                doctor.doctor_id ||
                                latestVisit?.doctor_id ||
                                latestAppointment?.doctor_id ||
                                null,

                            name:
                                doctor.doctor_name ||
                                "Assigned Doctor",

                            specialization:
                                doctor.doctor_specialization ||
                                "Not specified"
                        }
                        : null,

                    /*
                     * Latest appointment information used by the card.
                     */
                    latestAppointment:
                        latestAppointment
                            ? {
                                appointmentId:
                                    latestAppointment.id,

                                date:
                                    latestAppointment.appointment_date ||
                                    null,

                                time:
                                    latestAppointment.appointment_time ||
                                    null,

                                source:
                                    latestAppointment.source ||
                                    null,

                                status:
                                    latestAppointment.status ||
                                    null
                            }
                            : null,

                    /*
                     * Only basic operational visit information.
                     * Detailed timings/history will come in Step 2B.
                     */
                    latestVisit:
                        latestVisit
                            ? {
                                visitId:
                                    latestVisit.id,

                                status:
                                    latestVisit.visit_stage ||
                                    null,

                                visitType:
                                    latestVisit.visit_type ||
                                    null,

                                checkedInAt:
                                    latestVisit.checked_in_at ||
                                    null,

                                consultationStartedAt:
                                    latestVisit.consultation_started_at ||
                                    null,

                                consultationCompletedAt:
                                    latestVisit.consultation_completed_at ||
                                    null
                            }
                            : null
                };
            });

            return res.json({
                success: true,
                count: patients.length,
                patients
            });
        } catch (err) {
            console.error(
                "[HospitalAdmin Patients] GET patients error:",
                err
            );

            return res.status(500).json({
                success: false,
                message:
                    err.message ||
                    "Failed to load hospital patients."
            });
        }
    }
);

/**
 * GET /api/v1/hospital-admin/patients/:hospitalPatientId
 *
 * Hospital Admin:
 * Read-only operational details for ONE patient belonging
 * to the authenticated hospital.
 *
 * SECURITY:
 * - hospitalPatientId alone is NOT trusted.
 * - Patient must also belong to req.context.hospitalId.
 * - No diagnosis, prescriptions, consultation notes,
 *   AI transcripts, treatment plans, or doctor-private notes.
 *
 * DATABASE:
 * SELECT ONLY.
 */
router.get(
    "/patients/:hospitalPatientId",
    requirePermission("hospital.view"),
    async (req, res) => {
        try {
            const db = getSupabaseClient();

            const hospitalId =
                req.context?.hospitalId;

            const {
                hospitalPatientId
            } = req.params;

            if (!db) {
                return res.status(500).json({
                    success: false,
                    message:
                        "Database connection unavailable."
                });
            }

            if (!hospitalId) {
                return res.status(403).json({
                    success: false,
                    message:
                        "No authenticated hospital context."
                });
            }

            if (!hospitalPatientId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Hospital patient ID is required."
                });
            }

            /*
             * ========================================================
             * 1. FETCH HOSPITAL-SCOPED PATIENT
             * ========================================================
             *
             * BOTH conditions are mandatory:
             *
             * id          = requested patient
             * hospital_id = authenticated hospital
             *
             * This prevents cross-hospital patient access.
             */
            const {
                data: rawPatient,
                error: patientError
            } = await db
                .from("hospital_patient_records")
                .select(`
                    id,
                    hospital_id,
                    patient_id,
                    hospital_patient_code,
                    first_name,
                    last_name,
                    full_name,
                    phone,
                    date_of_birth,
                    gender,
                    registration_type,
                    status,
                    created_at
                `)
                .eq(
                    "id",
                    hospitalPatientId
                )
                .eq(
                    "hospital_id",
                    hospitalId
                )
                .maybeSingle();

            if (patientError) {
                throw patientError;
            }

            if (!rawPatient) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Patient not found in this hospital."
                });
            }

            /*
             * Use the existing production encryption service.
             *
             * This changes nothing in the database.
             * It only decrypts the selected row in memory.
             */
            const patient = decryptRecord(
                "hospital_patient_records",
                rawPatient
            );

            /*
             * ========================================================
             * 2. FETCH ALL OPERATIONAL VISITS
             * ========================================================
             */
            const {
                data: rawVisitRows,
                error: visitError
            } = await db
                .from("patient_visits")
                .select(`
                    id,
                    hospital_id,
                    hospital_patient_id,
                    appointment_id,
                    doctor_id,
                    visit_stage,
                    visit_type,
                    chief_complaints,
                    checked_in_at,
                    consultation_started_at,
                    consultation_completed_at,
                    created_at,
                    doctors(
                        doctor_id,
                        doctor_name,
                        doctor_specialization
                    )
                `)
                .eq(
                    "hospital_id",
                    hospitalId
                )
                .eq(
                    "hospital_patient_id",
                    hospitalPatientId
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

            if (visitError) {
                throw visitError;
            }

            /*
             * ========================================================
             * 3. FETCH ALL HOSPITAL APPOINTMENTS
             * ========================================================
             */
            const {
                data: rawAppointmentRows,
                error: appointmentError
            } = await db
                .from("appointments")
                .select(`
                    id,
                    hospital_id,
                    hospital_patient_id,
                    patient_id,
                    doctor_id,
                    appointment_date,
                    appointment_time,
                    status,
                    source,
                    reason,
                    created_at,
                    doctors(
                        doctor_id,
                        doctor_name,
                        doctor_specialization
                    )
                `)
                .eq(
                    "hospital_id",
                    hospitalId
                )
                .eq(
                    "hospital_patient_id",
                    hospitalPatientId
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

            if (appointmentError) {
                throw appointmentError;
            }

            /*
             * ========================================================
             * HELPERS
             * ========================================================
             */

            const safeValue = (
                value,
                fallback = null
            ) => {
                if (
                    value === null ||
                    value === undefined ||
                    value === ""
                ) {
                    return fallback;
                }

                /*
                 * Never expose raw encrypted values such as:
                 * enc:gcm:v1:...
                 */
                if (isEncrypted(value)) {
                    return fallback;
                }

                return value;
            };

            const calculateAge = (
                dateOfBirth
            ) => {
                if (!dateOfBirth) {
                    return null;
                }

                const dob =
                    new Date(dateOfBirth);

                if (
                    Number.isNaN(
                        dob.getTime()
                    )
                ) {
                    return null;
                }

                const today =
                    new Date();

                let age =
                    today.getFullYear() -
                    dob.getFullYear();

                const monthDifference =
                    today.getMonth() -
                    dob.getMonth();

                if (
                    monthDifference < 0 ||
                    (
                        monthDifference === 0 &&
                        today.getDate() <
                            dob.getDate()
                    )
                ) {
                    age -= 1;
                }

                return age;
            };

            const minutesBetween = (
                start,
                end
            ) => {
                if (!start || !end) {
                    return null;
                }

                const startDate =
                    new Date(start);

                const endDate =
                    new Date(end);

                if (
                    Number.isNaN(
                        startDate.getTime()
                    ) ||
                    Number.isNaN(
                        endDate.getTime()
                    )
                ) {
                    return null;
                }

                return Math.max(
                    Math.round(
                        (
                            endDate.getTime() -
                            startDate.getTime()
                        ) /
                            60000
                    ),
                    0
                );
            };

            /*
             * ========================================================
             * 4. DECRYPT SAFE PATIENT-REPORTED DATA
             * ========================================================
             *
             * We only use chief_complaints / appointment reason as
             * patient-reported information.
             *
             * No diagnosis or doctor clinical notes are queried.
             */
            const visits =
                (rawVisitRows || []).map(
                    (visit) =>
                        decryptRecord(
                            "patient_visits",
                            visit
                        )
                );

            const appointments =
                (
                    rawAppointmentRows || []
                ).map(
                    (appointment) =>
                        decryptRecord(
                            "appointments",
                            appointment
                        )
                );

            /*
             * Fast appointment lookup for visit -> appointment.
             */
            const appointmentMap =
                new Map();

            appointments.forEach(
                (appointment) => {
                    appointmentMap.set(
                        appointment.id,
                        appointment
                    );
                }
            );

            /*
             * Keep track of appointments already represented
             * by an actual patient_visit row.
             */
            const processedAppointmentIds =
                new Set();

            /*
             * ========================================================
             * 5. BUILD COMPLETE VISIT HISTORY
             * ========================================================
             */
            const visitHistory =
                visits.map((visit) => {
                    const appointment =
                        visit.appointment_id
                            ? appointmentMap.get(
                                  visit.appointment_id
                              ) || null
                            : null;

                    if (
                        appointment?.id
                    ) {
                        processedAppointmentIds.add(
                            appointment.id
                        );
                    }

                    const doctor =
                        visit.doctors ||
                        appointment?.doctors ||
                        null;

                    const status =
                        visit.visit_stage ||
                        appointment?.status ||
                        "scheduled";

                    const checkedInAt =
                        visit.checked_in_at ||
                        null;

                    const consultationStartedAt =
                        visit.consultation_started_at ||
                        null;

                    const consultationCompletedAt =
                        visit.consultation_completed_at ||
                        null;

                    /*
                     * ------------------------------------------------
                     * WAITING DURATION
                     * ------------------------------------------------
                     *
                     * Completed waiting:
                     * check-in -> consultation start.
                     *
                     * Currently waiting:
                     * check-in -> now.
                     *
                     * We do NOT change stale visit states here.
                     */
                    let waitingMinutes =
                        null;

                    if (
                        checkedInAt &&
                        consultationStartedAt
                    ) {
                        waitingMinutes =
                            minutesBetween(
                                checkedInAt,
                                consultationStartedAt
                            );
                    } else if (
                        checkedInAt &&
                        (
                            status ===
                                "waiting" ||
                            status ===
                                "checked_in"
                        )
                    ) {
                        waitingMinutes =
                            minutesBetween(
                                checkedInAt,
                                new Date().toISOString()
                            );
                    }

                    /*
                     * ------------------------------------------------
                     * CONSULTATION DURATION
                     * ------------------------------------------------
                     */
                    let consultationMinutes =
                        null;

                    if (
                        consultationStartedAt &&
                        consultationCompletedAt
                    ) {
                        consultationMinutes =
                            minutesBetween(
                                consultationStartedAt,
                                consultationCompletedAt
                            );
                    } else if (
                        consultationStartedAt &&
                        status ===
                            "in_consultation"
                    ) {
                        consultationMinutes =
                            minutesBetween(
                                consultationStartedAt,
                                new Date().toISOString()
                            );
                    }

                    /*
                     * ------------------------------------------------
                     * TOTAL HOSPITAL VISIT TIME
                     * ------------------------------------------------
                     */
                    let totalVisitMinutes =
                        null;

                    if (
                        checkedInAt &&
                        consultationCompletedAt
                    ) {
                        totalVisitMinutes =
                            minutesBetween(
                                checkedInAt,
                                consultationCompletedAt
                            );
                    }

                    /*
                     * Patient-reported complaint only.
                     *
                     * This is NOT diagnosis.
                     */
                    const reportedComplaint =
                        safeValue(
                            visit.chief_complaints,
                            null
                        ) ||
                        safeValue(
                            appointment?.reason,
                            null
                        );

                    return {
                        visitId:
                            visit.id,

                        appointmentId:
                            appointment?.id ||
                            visit.appointment_id ||
                            null,

                        status,

                        visitType:
                            visit.visit_type ||
                            appointment?.source ||
                            null,

                        reportedComplaint,

                        doctor: {
                            doctorId:
                                doctor?.doctor_id ||
                                visit.doctor_id ||
                                appointment?.doctor_id ||
                                null,

                            name:
                                doctor?.doctor_name ||
                                "Assigned Doctor",

                            specialization:
                                doctor?.doctor_specialization ||
                                "Not specified"
                        },

                        appointment: {
                            date:
                                appointment?.appointment_date ||
                                null,

                            time:
                                appointment?.appointment_time ||
                                null,

                            source:
                                appointment?.source ||
                                visit.visit_type ||
                                null
                        },

                        /*
                         * Patient journey timestamps.
                         */
                        checkedInAt,

                        consultationStartedAt,

                        consultationCompletedAt,

                        /*
                         * Calculated operational durations.
                         */
                        waitingMinutes,

                        consultationMinutes,

                        totalVisitMinutes,

                        createdAt:
                            visit.created_at ||
                            appointment?.created_at ||
                            null
                    };
                });

            /*
             * ========================================================
             * 6. INCLUDE APPOINTMENTS WITHOUT A VISIT
             * ========================================================
             *
             * Example:
             * Patient booked an appointment but did not check in yet,
             * or appointment was cancelled before a visit was created.
             */
            appointments.forEach(
                (appointment) => {
                    if (
                        processedAppointmentIds.has(
                            appointment.id
                        )
                    ) {
                        return;
                    }

                    const doctor =
                        appointment.doctors ||
                        null;

                    visitHistory.push({
                        visitId: null,

                        appointmentId:
                            appointment.id,

                        status:
                            appointment.status ||
                            "scheduled",

                        visitType:
                            appointment.source ||
                            "appointment",

                        reportedComplaint:
                            safeValue(
                                appointment.reason,
                                null
                            ),

                        doctor: {
                            doctorId:
                                doctor?.doctor_id ||
                                appointment.doctor_id ||
                                null,

                            name:
                                doctor?.doctor_name ||
                                "Assigned Doctor",

                            specialization:
                                doctor?.doctor_specialization ||
                                "Not specified"
                        },

                        appointment: {
                            date:
                                appointment.appointment_date ||
                                null,

                            time:
                                appointment.appointment_time ||
                                null,

                            source:
                                appointment.source ||
                                null
                        },

                        checkedInAt: null,

                        consultationStartedAt:
                            null,

                        consultationCompletedAt:
                            null,

                        waitingMinutes: null,

                        consultationMinutes:
                            null,

                        totalVisitMinutes:
                            null,

                        createdAt:
                            appointment.created_at ||
                            null
                    });
                }
            );

            /*
             * Newest operational record first.
             */
            visitHistory.sort(
                (a, b) => {
                    const aTime =
                        new Date(
                            a.checkedInAt ||
                                a.createdAt ||
                                0
                        ).getTime();

                    const bTime =
                        new Date(
                            b.checkedInAt ||
                                b.createdAt ||
                                0
                        ).getTime();

                    return bTime - aTime;
                }
            );

            /*
             * ========================================================
             * 7. PATIENT SUMMARY
             * ========================================================
             */

            const completedVisits =
                visitHistory.filter(
                    (item) =>
                        item.status ===
                            "completed" ||
                        item.status ===
                            "exited"
                ).length;

            const cancelledVisits =
                visitHistory.filter(
                    (item) =>
                        item.status ===
                            "cancelled" ||
                        item.status ===
                            "canceled"
                ).length;

            const constructedName = [
                safeValue(
                    patient?.first_name,
                    ""
                ),
                safeValue(
                    patient?.last_name,
                    ""
                )
            ]
                .filter(Boolean)
                .join(" ")
                .trim();

            const fullName =
                safeValue(
                    patient?.full_name,
                    null
                ) ||
                constructedName ||
                "Patient";

            const latestVisit =
                visitHistory[0] ||
                null;

            /*
             * ========================================================
             * 8. SAFE RESPONSE
             * ========================================================
             */
            return res.json({
                success: true,

                patient: {
                    hospitalPatientId:
                        rawPatient.id,

                    patientId:
                        rawPatient.patient_id ||
                        null,

                    patientCode:
                        rawPatient.hospital_patient_code ||
                        "N/A",

                    fullName,

                    phone:
                        safeValue(
                            patient?.phone,
                            null
                        ),

                    age:
                        calculateAge(
                            patient?.date_of_birth
                        ),

                    gender:
                        safeValue(
                            patient?.gender,
                            null
                        ),

                    registrationType:
                        rawPatient.registration_type ||
                        null,

                    status:
                        rawPatient.status ||
                        "active",

                    registeredAt:
                        rawPatient.created_at ||
                        null
                },

                summary: {
                    totalRecords:
                        visitHistory.length,

                    completedVisits,

                    cancelledVisits,

                    currentStatus:
                        latestVisit?.status ||
                        "registered",

                    latestDoctor:
                        latestVisit?.doctor ||
                        null
                },

                latestVisit,

                visitHistory
            });
        } catch (err) {
            console.error(
                "[HospitalAdmin Patients] GET patient details error:",
                err
            );

            return res.status(500).json({
                success: false,
                message:
                    err.message ||
                    "Failed to load patient details."
            });
        }
    }
);

/**
 * GET /api/v1/hospital-admin/doctors
 * List all Doctors belonging to current hospital
 */

// ============================================================================
// HOSPITAL ADMIN — DOCTOR SCHEDULE HELPERS
// ============================================================================

const AVAILABILITY_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Normalize weekday names.
 *
 * Examples:
 * monday -> Monday
 * MONDAY -> Monday
 */
function normalizeAvailabilityDay(day) {
  const raw = String(day || "")
    .trim()
    .toLowerCase();

  const matched = AVAILABILITY_DAYS.find(
    (item) =>
      item.toLowerCase() === raw,
  );

  return matched || null;
}


/**
 * Convert supported schedule times into minutes from midnight.
 *
 * Supports:
 * 10:00 AM
 * 06:30 PM
 * 09:00
 * 18:30
 *
 * Used only for validation / ordering.
 */
function scheduleTimeToMinutes(value) {
  if (!value) {
    return null;
  }

  const text = String(value)
    .trim()
    .toUpperCase();

  // 24-hour HH:MM
  const twentyFourHourMatch =
    text.match(
      /^([01]\d|2[0-3]):([0-5]\d)$/,
    );

  if (twentyFourHourMatch) {
    const hours = Number(
      twentyFourHourMatch[1],
    );

    const minutes = Number(
      twentyFourHourMatch[2],
    );

    return hours * 60 + minutes;
  }

  // 12-hour HH:MM AM/PM
  const twelveHourMatch =
    text.match(
      /^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/,
    );

  if (!twelveHourMatch) {
    return null;
  }

  let hours = Number(
    twelveHourMatch[1],
  );

  const minutes = Number(
    twelveHourMatch[2],
  );

  const period =
    twelveHourMatch[3];

  if (
    period === "AM" &&
    hours === 12
  ) {
    hours = 0;
  }

  if (
    period === "PM" &&
    hours !== 12
  ) {
    hours += 12;
  }

  return hours * 60 + minutes;
}

/**
 * Check that one schedule time uses a format
 * supported by the existing availability table.
 */
function isValidScheduleTime(value) {
  if (!value) {
    return false;
  }

  const text =
    String(value).trim();

  return (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(
      text,
    ) ||
    /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$/i.test(
      text,
    )
  );
}

/**
 * Validate all consultation sessions for one weekday.
 *
 * Prevents:
 * - missing start/end time
 * - end before start
 * - overlapping consultation sessions
 */
function normalizeScheduleTimeWindows(
  timeWindows,
  day,
) {
  if (!Array.isArray(timeWindows)) {
    throw new Error(
      `${day}: time_windows must be an array.`,
    );
  }

  if (timeWindows.length === 0) {
    throw new Error(
      `${day}: at least one consultation session is required.`,
    );
  }

  const normalized =
    timeWindows.map(
      (window, index) => {
        const startTime =
          String(
            window?.start_time ||
              "",
          ).trim();

        const endTime =
          String(
            window?.end_time ||
              "",
          ).trim();

        if (
          !isValidScheduleTime(
            startTime,
          ) ||
          !isValidScheduleTime(
            endTime,
          )
        ) {
          throw new Error(
            `${day}: invalid time in session ${index + 1}.`,
          );
        }

        const startMinutes =
          scheduleTimeToMinutes(
            startTime,
          );

        const endMinutes =
          scheduleTimeToMinutes(
            endTime,
          );

        if (
          startMinutes === null ||
          endMinutes === null
        ) {
          throw new Error(
            `${day}: invalid consultation session.`,
          );
        }

        if (
          startMinutes >= endMinutes
        ) {
          throw new Error(
            `${day}: session ${index + 1} start time must be before end time.`,
          );
        }

        return {
          start_time:
            startTime,

          end_time:
            endTime,

          _startMinutes:
            startMinutes,

          _endMinutes:
            endMinutes,
        };
      },
    );

  // Always save sessions chronologically.
  normalized.sort(
    (a, b) =>
      a._startMinutes -
      b._startMinutes,
  );

  // Reject overlapping sessions.
  for (
    let index = 1;
    index < normalized.length;
    index += 1
  ) {
    const previous =
      normalized[index - 1];

    const current =
      normalized[index];

    if (
      current._startMinutes <
      previous._endMinutes
    ) {
      throw new Error(
        `${day}: consultation sessions cannot overlap.`,
      );
    }
  }

  return normalized.map(
    ({
      start_time,
      end_time,
    }) => ({
      start_time,
      end_time,
    }),
  );
}


/**
 * Confirm that the requested doctor belongs to
 * the authenticated Hospital Admin's hospital.
 *
 * doctorId may be either:
 * - doctors.doctor_id
 * - hospital_members.id
 *
 * Hospital scope always comes from req.context.hospitalId.
 */
async function resolveHospitalDoctor(
  db,
  hospitalId,
  doctorId,
) {
  if (
    !db ||
    !hospitalId ||
    !doctorId
  ) {
    return null;
  }

  const { data: member, error } =
    await db
      .from("hospital_members")
      .select(`
        id,
        hospital_id,
        user_id,
        doctor_id,
        role,
        status
      `)
      .eq(
        "hospital_id",
        hospitalId,
      )
      .eq("role", "doctor")
      .or(
        `doctor_id.eq.${doctorId},id.eq.${doctorId}`,
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (
    !member ||
    !member.doctor_id
  ) {
    return null;
  }

  return {
    memberId: member.id,
    doctorId: member.doctor_id,
    userId: member.user_id,
    status: member.status,
  };
}

/**
 * Return a complete Monday-Sunday schedule.
 *
 * Missing days are returned as unavailable.
 *
 * Existing older availability rows that only have
 * start_time/end_time are converted into one time window.
 */
function buildFullHospitalSchedule(
  rows,
  doctorId,
  hospitalId,
) {
  const scheduleMap = new Map();

  (rows || []).forEach((row) => {
    const day =
      normalizeAvailabilityDay(
        row.day_of_week,
      );

    if (day) {
      scheduleMap.set(
        day,
        row,
      );
    }
  });

  return AVAILABILITY_DAYS.map(
    (day) => {
      const existing =
        scheduleMap.get(day);

      if (existing) {
        let timeWindows =
          Array.isArray(
            existing.time_windows,
          )
            ? existing.time_windows
            : [];

        /*
         * Compatibility with older schedule rows.
         */
        if (
          existing.is_available &&
          timeWindows.length === 0 &&
          existing.start_time &&
          existing.end_time
        ) {
          timeWindows = [
            {
              start_time:
                existing.start_time,

              end_time:
                existing.end_time,
            },
          ];
        }

        return {
          id: existing.id,

          hospital_id:
            hospitalId,

          doctor_id:
            doctorId,

          day_of_week:
            day,

          is_available:
            Boolean(
              existing.is_available,
            ),

          time_windows:
            existing.is_available
              ? timeWindows
              : [],
        };
      }

      /*
       * No schedule configured for this day.
       */
      return {
        id: null,

        hospital_id:
          hospitalId,

        doctor_id:
          doctorId,

        day_of_week:
          day,

        is_available: false,

        time_windows: [],
      };
    },
  );
}


router.get("/doctors", requirePermission("doctors.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) return res.json({ success: true, doctors: [] });

        const { data: members, error: memErr } = await db
            .from("hospital_members")
            .select("id, hospital_id, user_id, doctor_id, role, status, created_at")
            .eq("hospital_id", hospitalId)
            .eq("role", "doctor")
            .order("created_at", { ascending: false });

        if (memErr) throw memErr;

        let doctorsList = [];

        if (members && members.length > 0) {
            const docIds = members.map(m => m.doctor_id).filter(Boolean);
            const userIds = members.map(m => m.user_id).filter(Boolean);

            let docQuery = db.from("doctors").select("*");
            if (docIds.length > 0 && userIds.length > 0) {
                const dIn = docIds.join(",");
                const uIn = userIds.join(",");
                docQuery = docQuery.or(`doctor_id.in.(${dIn}),user_id.in.(${uIn})`);
            } else if (docIds.length > 0) {
                docQuery = docQuery.in("doctor_id", docIds);
            } else if (userIds.length > 0) {
                docQuery = docQuery.in("user_id", userIds);
            }
            const { data: docRows } = await docQuery;

            const { data: userRows } = await db
                .from("users")
                .select("*")
                .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

            doctorsList = members.map(m => {
                const d = (docRows || []).find(dr => dr.doctor_id === m.doctor_id || (dr.user_id && dr.user_id === m.user_id));
                const u = (userRows || []).find(ur => ur.id === m.user_id);
                return {
                    memberId: m.id,
                    doctorId: m.doctor_id || d?.doctor_id,
                    userId: m.user_id,
                    fullName: d?.doctor_name || d?.full_name || u?.full_name || "Dr. Unnamed Doctor",
                    email: d?.doctor_email || d?.email || u?.email || "N/A",
                    phone: d?.doctor_mobile ?? d?.mobile_number ?? u?.phone ?? "",
                    specialization: d?.doctor_specialization ?? d?.specialization ?? "Not specified",
                    qualification: d?.doctor_qualification ?? d?.qualification ?? "",
                    registrationNumber: d?.doctor_registration_number ?? d?.registration_number ?? d?.doctor_reg_no ?? "",
                    experience: d?.doctor_experience || null,
                    clinicName: d?.doctor_clinic_name || null,
                    clinicAddress: d?.doctor_clinic_address || null,
                    consultationFee: d?.doctor_consultation_fee || null,
                    rating: d?.doctor_rating || 4.9,
                    status: m.status || "active",
                    createdAt: m.created_at
                };
            });
        }

        return res.json({
            success: true,
            doctors: doctorsList
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

console.log(
  "[HospitalAdmin] Doctor Patients route loaded"
);

/**
 * GET /api/v1/hospital-admin/doctors/:doctorId/patients
 *
 * Read-only operational patient summary for one doctor
 * inside the authenticated Hospital Admin's hospital.
 *
 * Returns:
 * - Basic doctor information
 * - Appointment / visit counts
 * - Unique patients associated with the doctor
 * - Patient name
 * - Patient age
 * - Maximum two patient-reported symptoms
 *
 * SECURITY:
 * - hospital_id always comes from req.context.hospitalId.
 * - The requested doctor must belong to this hospital.
 * - No diagnosis, prescriptions, doctor notes, AI transcript,
 *   treatment plan, or other private clinical content is queried.
 *
 * DATABASE:
 * SELECT ONLY.
 */
router.get(
  "/doctors/:doctorId/patients",
  requirePermission("doctors.view"),
  async (req, res) => {
    try {
      const db = getSupabaseClient();
      const hospitalId = req.context?.hospitalId;
      const { doctorId } = req.params;

      if (!db) {
        return res.status(500).json({
          success: false,
          message: "Database connection unavailable.",
        });
      }

      if (!hospitalId) {
        return res.status(403).json({
          success: false,
          message: "No authenticated hospital context.",
        });
      }

      if (!doctorId) {
        return res.status(400).json({
          success: false,
          message: "Doctor ID is required.",
        });
      }

      /*
       * ============================================================
       * 1. VERIFY DOCTOR BELONGS TO AUTHENTICATED HOSPITAL
       * ============================================================
       *
       * We never trust doctorId alone.
       * It must resolve through hospital_members for THIS hospital.
       */
      const { data: doctorMember, error: memberError } = await db
        .from("hospital_members")
        .select(`
          id,
          hospital_id,
          user_id,
          doctor_id,
          role,
          status
        `)
        .eq("hospital_id", hospitalId)
        .eq("role", "doctor")
        .or(`doctor_id.eq.${doctorId},id.eq.${doctorId}`)
        .maybeSingle();

      if (memberError) {
        throw memberError;
      }

      if (!doctorMember) {
        return res.status(404).json({
          success: false,
          message: "Doctor not found in this hospital.",
        });
      }

      /*
       * Normally doctor_id will already exist.
       *
       * The fallback allows older memberships that may only
       * contain user_id to resolve their doctor profile.
       */
      let resolvedDoctorId =
        doctorMember.doctor_id || null;

      let doctorRow = null;

      if (resolvedDoctorId) {
        const { data, error } = await db
          .from("doctors")
          .select("*")
          .eq("doctor_id", resolvedDoctorId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        doctorRow = data;
      } else if (doctorMember.user_id) {
        const { data, error } = await db
          .from("doctors")
          .select("*")
          .eq("user_id", doctorMember.user_id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        doctorRow = data;
        resolvedDoctorId =
          doctorRow?.doctor_id || null;
      }

      if (!resolvedDoctorId) {
        return res.status(404).json({
          success: false,
          message:
            "Doctor profile could not be resolved.",
        });
      }

      /*
       * ============================================================
       * 2. FETCH THIS DOCTOR'S HOSPITAL APPOINTMENTS
       * ============================================================
       */
      const {
        data: rawAppointments,
        error: appointmentError,
      } = await db
        .from("appointments")
        .select(`
          id,
          hospital_id,
          hospital_patient_id,
          patient_id,
          doctor_id,
          appointment_date,
          appointment_time,
          status,
          source,
          reason,
          created_at
        `)
        .eq("hospital_id", hospitalId)
        .eq("doctor_id", resolvedDoctorId)
        .order("created_at", {
          ascending: false,
        });

      if (appointmentError) {
        throw appointmentError;
      }

      /*
       * ============================================================
       * 3. FETCH THIS DOCTOR'S OPERATIONAL VISITS
       * ============================================================
       */
      const {
        data: rawVisits,
        error: visitError,
      } = await db
        .from("patient_visits")
        .select(`
          id,
          hospital_id,
          hospital_patient_id,
          appointment_id,
          doctor_id,
          visit_stage,
          status,
          chief_complaints,
          checked_in_at,
          consultation_started_at,
          consultation_completed_at,
          created_at
        `)
        .eq("hospital_id", hospitalId)
        .eq("doctor_id", resolvedDoctorId)
        .order("created_at", {
          ascending: false,
        });

      if (visitError) {
        throw visitError;
      }

      /*
       * Decrypt only the fields already used for basic
       * operational presentation.
       */
      const appointments = (
        rawAppointments || []
      ).map((appointment) =>
        decryptRecord(
          "appointments",
          appointment,
        ),
      );

      const visits = (rawVisits || []).map(
        (visit) =>
          decryptRecord(
            "patient_visits",
            visit,
          ),
      );

      /*
       * ============================================================
       * 4. FETCH HOSPITAL PATIENT IDENTITIES
       * ============================================================
       */
      const hospitalPatientIds = [
        ...new Set(
          [
            ...appointments.map(
              (appointment) =>
                appointment.hospital_patient_id,
            ),
            ...visits.map(
              (visit) =>
                visit.hospital_patient_id,
            ),
          ].filter(Boolean),
        ),
      ];

      let hospitalPatientMap = new Map();

      if (hospitalPatientIds.length > 0) {
        const {
          data: rawHospitalPatients,
          error: hospitalPatientError,
        } = await db
          .from("hospital_patient_records")
          .select(`
            id,
            patient_id,
            hospital_patient_code,
            first_name,
            last_name,
            full_name,
            date_of_birth,
            gender
          `)
          .eq("hospital_id", hospitalId)
          .in("id", hospitalPatientIds);

        if (hospitalPatientError) {
          throw hospitalPatientError;
        }

        hospitalPatientMap = new Map(
          (rawHospitalPatients || []).map(
            (rawPatient) => {
              const patient = decryptRecord(
                "hospital_patient_records",
                rawPatient,
              );

              return [
                rawPatient.id,
                patient,
              ];
            },
          ),
        );
      }

      /*
       * ============================================================
       * 5. FETCH PATIENT-REPORTED APPOINTMENT SYMPTOMS
       * ============================================================
       *
       * This is patient-reported information only.
       * We do NOT query consultation notes or diagnosis.
       */
      const appointmentIds = appointments
        .map((appointment) => appointment.id)
        .filter(Boolean);

      const symptomMap = new Map();

      if (appointmentIds.length > 0) {
        const {
          data: rawSymptoms,
          error: symptomsError,
        } = await db
          .from("appointment_symptoms")
          .select(`
            appointment_id,
            symptoms
          `)
          .in(
            "appointment_id",
            appointmentIds,
          );

        /*
         * Some older appointments may not have a row in
         * appointment_symptoms. That is fine; we can fall
         * back to chief complaint / appointment reason.
         */
        if (symptomsError) {
          console.warn(
            "[HospitalAdmin Doctor Patients] appointment_symptoms warning:",
            symptomsError.message,
          );
        } else {
          (rawSymptoms || []).forEach(
            (rawSymptom) => {
              const symptom =
                decryptRecord(
                  "appointment_symptoms",
                  rawSymptom,
                );

              symptomMap.set(
                symptom.appointment_id,
                symptom.symptoms,
              );
            },
          );
        }
      }

      /*
       * ============================================================
       * HELPERS
       * ============================================================
       */

      const calculateAge = (dateOfBirth) => {
        if (!dateOfBirth) {
          return null;
        }

        const dob = new Date(dateOfBirth);

        if (
          Number.isNaN(dob.getTime())
        ) {
          return null;
        }

        const today = new Date();

        let age =
          today.getFullYear() -
          dob.getFullYear();

        const monthDifference =
          today.getMonth() -
          dob.getMonth();

        if (
          monthDifference < 0 ||
          (monthDifference === 0 &&
            today.getDate() <
              dob.getDate())
        ) {
          age -= 1;
        }

        return age;
      };

      /**
       * Convert patient-reported symptom text into a maximum
       * of two readable symptoms.
       *
       * Supports values such as:
       *
       * "Cough, Throat pain, Fever"
       *
       * and:
       *
       * "Symptoms: toothache, headache, fever |
       *  Duration: < 24 Hours | Severity: severe"
       */
      const extractMainSymptoms = (
        rawValue,
      ) => {
        if (!rawValue) {
          return [];
        }

        /*
         * Some implementations may already return an array.
         */
        if (Array.isArray(rawValue)) {
          return rawValue
            .map((item) =>
              String(item || "").trim(),
            )
            .filter(Boolean)
            .slice(0, 2);
        }

        let text = String(rawValue).trim();

        if (!text) {
          return [];
        }

        /*
         * If the value contains structured metadata,
         * only keep the Symptoms portion.
         */
        const symptomsMatch =
          text.match(
            /symptoms?\s*:\s*([^|]+)/i,
          );

        if (symptomsMatch?.[1]) {
          text =
            symptomsMatch[1].trim();
        } else if (text.includes("|")) {
          /*
           * Avoid showing Duration / Severity / Location
           * metadata as symptoms.
           */
          text =
            text.split("|")[0].trim();
        }

        text = text.replace(
          /^symptoms?\s*:\s*/i,
          "",
        );

        return text
          .split(/[,;\n]+/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 2);
      };

      /**
       * Normalize operational states for the summary cards.
       *
       * Rescheduled is included only if production actually
       * contains that appointment status. No new DB status
       * is being created here.
       */
      const normalizeEncounterStatus = (
        visit,
        appointment,
      ) => {
        const appointmentStatus =
          String(
            appointment?.status || "",
          )
            .trim()
            .toLowerCase();

        const visitStage = String(
          visit?.visit_stage ||
            visit?.status ||
            "",
        )
          .trim()
          .toLowerCase();

        /*
         * Explicit appointment state has priority.
         */
        if (
          appointmentStatus ===
          "rescheduled"
        ) {
          return "rescheduled";
        }

        if (
          visitStage === "completed" ||
          visitStage === "exited" ||
          appointmentStatus ===
            "completed"
        ) {
          return "completed";
        }

        if (
          visitStage === "cancelled" ||
          visitStage === "canceled" ||
          appointmentStatus ===
            "cancelled" ||
          appointmentStatus ===
            "canceled"
        ) {
          return "cancelled";
        }

        if (
          visitStage ===
            "checked_in" ||
          visitStage === "waiting" ||
          visitStage ===
            "in_consultation"
        ) {
          return "active";
        }

        return "scheduled";
      };

      /*
       * ============================================================
       * 6. BUILD ONE ENCOUNTER PER APPOINTMENT / VISIT
       * ============================================================
       *
       * We must NOT count an appointment and its patient_visit
       * as two different visits.
       */
      const visitByAppointmentId =
        new Map();

      visits.forEach((visit) => {
        if (visit.appointment_id) {
          visitByAppointmentId.set(
            visit.appointment_id,
            visit,
          );
        }
      });

      const processedVisitIds =
        new Set();

      const encounters = [];

      appointments.forEach(
        (appointment) => {
          const visit =
            visitByAppointmentId.get(
              appointment.id,
            ) || null;

          if (visit?.id) {
            processedVisitIds.add(
              visit.id,
            );
          }

          const hprId =
            visit?.hospital_patient_id ||
            appointment.hospital_patient_id ||
            null;

          const patient =
            hprId
              ? hospitalPatientMap.get(
                  hprId,
                ) || null
              : null;

          const rawSymptoms =
            visit?.chief_complaints ||
            symptomMap.get(
              appointment.id,
            ) ||
            appointment.reason ||
            null;

          encounters.push({
            encounterId:
              appointment.id,

            appointmentId:
              appointment.id,

            visitId:
              visit?.id || null,

            hospitalPatientId:
              hprId,

            patient,

            status:
              normalizeEncounterStatus(
                visit,
                appointment,
              ),

            symptoms:
              extractMainSymptoms(
                rawSymptoms,
              ),

            appointmentDate:
              appointment.appointment_date ||
              null,

            appointmentTime:
              appointment.appointment_time ||
              null,

            createdAt:
              visit?.created_at ||
              appointment.created_at ||
              null,
          });
        },
      );

      /*
       * Include walk-in / visit records that do not have
       * a matching appointment.
       */
      visits.forEach((visit) => {
        if (
          processedVisitIds.has(
            visit.id,
          )
        ) {
          return;
        }

        const hprId =
          visit.hospital_patient_id ||
          null;

        const patient =
          hprId
            ? hospitalPatientMap.get(
                hprId,
              ) || null
            : null;

        encounters.push({
          encounterId: visit.id,

          appointmentId:
            visit.appointment_id ||
            null,

          visitId: visit.id,

          hospitalPatientId:
            hprId,

          patient,

          status:
            normalizeEncounterStatus(
              visit,
              null,
            ),

          symptoms:
            extractMainSymptoms(
              visit.chief_complaints,
            ),

          appointmentDate: null,

          appointmentTime: null,

          createdAt:
            visit.created_at ||
            null,
        });
      });

      /*
       * Latest activity first.
       */
      encounters.sort((a, b) => {
        const aTime = new Date(
          a.createdAt || 0,
        ).getTime();

        const bTime = new Date(
          b.createdAt || 0,
        ).getTime();

        return bTime - aTime;
      });

      /*
       * ============================================================
       * 7. COUNTS
       * ============================================================
       */

      const counts = {
        scheduled: 0,
        active: 0,
        completed: 0,
        rescheduled: 0,
        cancelled: 0,
      };

      encounters.forEach(
        (encounter) => {
          if (
            Object.prototype.hasOwnProperty.call(
              counts,
              encounter.status,
            )
          ) {
            counts[
              encounter.status
            ] += 1;
          }
        },
      );

      /*
       * ============================================================
       * 8. UNIQUE PATIENT LIST
       * ============================================================
       *
       * If the same patient has seen this doctor several times,
       * display the patient only once using their latest encounter.
       */
      const uniquePatientMap =
        new Map();

      encounters.forEach(
        (encounter) => {
          const hprId =
            encounter.hospitalPatientId;

          if (
            !hprId ||
            uniquePatientMap.has(hprId)
          ) {
            return;
          }

          const patient =
            encounter.patient || {};

          const constructedName = [
            patient.first_name,
            patient.last_name,
          ]
            .filter(Boolean)
            .join(" ")
            .trim();

          const patientName =
            patient.full_name ||
            constructedName ||
            "Patient";

          uniquePatientMap.set(
            hprId,
            {
              hospitalPatientId:
                hprId,

              patientCode:
                patient.hospital_patient_code ||
                null,

              name:
                patientName,

              age:
                calculateAge(
                  patient.date_of_birth,
                ),

              /*
               * Latest relationship with this doctor.
               */
              status:
                encounter.status,

              /*
               * Maximum two patient-reported symptoms.
               */
              symptoms:
                encounter.symptoms,

              appointmentDate:
                encounter.appointmentDate,

              appointmentTime:
                encounter.appointmentTime,
            },
          );
        },
      );

      const patients = [
        ...uniquePatientMap.values(),
      ];

      /*
       * Number of UNIQUE patients who have at least one
       * completed visit with this doctor.
       */
      const treatedPatientIds =
        new Set(
          encounters
            .filter(
              (encounter) =>
                encounter.status ===
                "completed",
            )
            .map(
              (encounter) =>
                encounter.hospitalPatientId,
            )
            .filter(Boolean),
        );

      /*
       * ============================================================
       * 9. SAFE RESPONSE
       * ============================================================
       */
      return res.json({
        success: true,

        doctor: {
          doctorId:
            resolvedDoctorId,

          name:
            doctorRow?.doctor_name ||
            doctorRow?.full_name ||
            "Doctor",

          specialization:
            doctorRow?.doctor_specialization ||
            doctorRow?.specialization ||
            "Not specified",

          qualification:
            doctorRow?.doctor_qualification ||
            doctorRow?.qualification ||
            "",

          experience:
            doctorRow?.doctor_experience ??
            doctorRow?.experience ??
            null,
        },

        summary: {
          /*
           * Unique patients associated with this doctor.
           */
          totalPatients:
            patients.length,

          /*
           * Unique patients with at least one completed visit.
           */
          treatedPatients:
            treatedPatientIds.size,

          /*
           * Encounter/appointment counters for dashboard cards.
           */
          ...counts,
        },

        patients,
      });
    } catch (err) {
      console.error(
        "[HospitalAdmin Doctor Patients] Error:",
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          err.message ||
          "Failed to load doctor's patients.",
      });
    }
  },
);

// ============================================================================
// HOSPITAL ADMIN — DOCTOR SCHEDULE
// ============================================================================
//
// Read-only endpoints in this step.
//
// Schedule is always scoped by:
// hospital_id + doctor_id
//
// A Hospital Admin cannot read another hospital's
// doctor schedule.
// ============================================================================

/**
 * GET /api/v1/hospital-admin/doctors/:doctorId/availability
 *
 * Returns Monday-Sunday hospital-specific availability
 * for the selected doctor.
 */
router.get(
  "/doctors/:doctorId/availability",
  requirePermission(
    "doctors.view",
  ),
  async (req, res) => {
    try {
      const db =
        getSupabaseClient();

      const hospitalId =
        req.context?.hospitalId;

      const { doctorId } =
        req.params;

      if (!db) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "Database connection unavailable.",
          });
      }

      if (!hospitalId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Hospital context is required.",
          });
      }

      /*
       * Verify doctor belongs to current hospital.
       */
      const hospitalDoctor =
        await resolveHospitalDoctor(
          db,
          hospitalId,
          doctorId,
        );

      if (!hospitalDoctor) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Doctor is not assigned to this hospital.",
          });
      }

      const resolvedDoctorId =
        hospitalDoctor.doctorId;

      /*
       * Only read schedule rows belonging to:
       * current hospital + selected doctor.
       */
      const {
        data,
        error,
      } = await db
        .from("availability")
        .select(`
          id,
          hospital_id,
          doctor_id,
          day_of_week,
          is_available,
          start_time,
          end_time,
          time_windows,
          created_at,
          updated_at
        `)
        .eq(
          "hospital_id",
          hospitalId,
        )
        .eq(
          "doctor_id",
          resolvedDoctorId,
        );

      if (error) {
        throw error;
      }

      return res.json({
        success: true,

        hospitalId,

        doctorId:
          resolvedDoctorId,

        doctorStatus:
          hospitalDoctor.status,

        availability:
          buildFullHospitalSchedule(
            data || [],
            resolvedDoctorId,
            hospitalId,
          ),
      });
    } catch (err) {
      console.error(
        "[HospitalAdmin] GET doctor availability error:",
        err,
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message ||
            "Failed to load doctor availability.",
        });
    }
  },
);

/**
 * GET /api/v1/hospital-admin/doctors/:doctorId/blocked-dates
 *
 * Returns hospital-specific leave / unavailable dates.
 */
router.get(
  "/doctors/:doctorId/blocked-dates",
  requirePermission(
    "doctors.view",
  ),
  async (req, res) => {
    try {
      const db =
        getSupabaseClient();

      const hospitalId =
        req.context?.hospitalId;

      const { doctorId } =
        req.params;

      if (!db) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "Database connection unavailable.",
          });
      }

      if (!hospitalId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Hospital context is required.",
          });
      }

      /*
       * Doctor must belong to this hospital.
       */
      const hospitalDoctor =
        await resolveHospitalDoctor(
          db,
          hospitalId,
          doctorId,
        );

      if (!hospitalDoctor) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Doctor is not assigned to this hospital.",
          });
      }

      const {
        data,
        error,
      } = await db
        .from("blocked_dates")
        .select(`
          id,
          hospital_id,
          doctor_id,
          blocked_date,
          reason,
          created_at,
          updated_at
        `)
        .eq(
          "hospital_id",
          hospitalId,
        )
        .eq(
          "doctor_id",
          hospitalDoctor.doctorId,
        )
        .order(
          "blocked_date",
          {
            ascending: true,
          },
        );

      if (error) {
        throw error;
      }

      return res.json({
        success: true,

        hospitalId,

        doctorId:
          hospitalDoctor.doctorId,

        blockedDates:
          data || [],
      });
    } catch (err) {
      console.error(
        "[HospitalAdmin] GET blocked dates error:",
        err,
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message ||
            "Failed to load doctor blocked dates.",
        });
    }
  },
);

/**
 * POST /api/v1/hospital-admin/doctors/:doctorId/blocked-dates
 *
 * Add or update one hospital-specific unavailable date.
 */
router.post(
  "/doctors/:doctorId/blocked-dates",
  requirePermission("appointments.manage"),
  async (req, res) => {
    try {
      const db = getSupabaseClient();

      const hospitalId =
        req.context?.hospitalId;

      const { doctorId } =
        req.params;

      const {
        date,
        reason = "Leave / Blocked",
      } = req.body || {};

      if (!db) {
        return res.status(500).json({
          success: false,
          message:
            "Database connection unavailable.",
        });
      }

      // ---------------------------------------------------------
      // Validate YYYY-MM-DD date
      // ---------------------------------------------------------
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          String(date || ""),
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid date is required in YYYY-MM-DD format.",
        });
      }

      const parsedDate =
        new Date(`${date}T00:00:00Z`);

      if (
        Number.isNaN(
          parsedDate.getTime(),
        ) ||
        parsedDate
          .toISOString()
          .slice(0, 10) !== date
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid blocked date.",
        });
      }

      // ---------------------------------------------------------
      // Security:
      // Doctor must belong to authenticated hospital.
      // ---------------------------------------------------------
      const hospitalDoctor =
        await resolveHospitalDoctor(
          db,
          hospitalId,
          doctorId,
        );

      if (!hospitalDoctor) {
        return res.status(404).json({
          success: false,
          message:
            "Doctor is not assigned to this hospital.",
        });
      }

      if (
        hospitalDoctor.status !==
        "active"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot manage blocked dates for an inactive doctor.",
        });
      }

      const cleanReason =
        String(
          reason ||
            "Leave / Blocked",
        )
          .trim()
          .slice(0, 500) ||
        "Leave / Blocked";

      // ---------------------------------------------------------
      // Check if this hospital + doctor + date already exists.
      // ---------------------------------------------------------
      const {
        data: existing,
        error: existingError,
      } = await db
        .from("blocked_dates")
        .select("id")
        .eq(
          "hospital_id",
          hospitalId,
        )
        .eq(
          "doctor_id",
          hospitalDoctor.doctorId,
        )
        .eq(
          "blocked_date",
          date,
        )
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      let blockedDate;

      // ---------------------------------------------------------
      // Existing date -> update reason
      // ---------------------------------------------------------
      if (existing?.id) {
        const {
          data,
          error,
        } = await db
          .from("blocked_dates")
          .update({
            reason: cleanReason,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            existing.id,
          )
          .eq(
            "hospital_id",
            hospitalId,
          )
          .eq(
            "doctor_id",
            hospitalDoctor.doctorId,
          )
          .select(`
            id,
            hospital_id,
            doctor_id,
            blocked_date,
            reason,
            created_at,
            updated_at
          `)
          .single();

        if (error) {
          throw error;
        }

        blockedDate = data;
      } else {
        // -------------------------------------------------------
        // New unavailable date
        // -------------------------------------------------------
        const {
          data,
          error,
        } = await db
          .from("blocked_dates")
          .insert({
            hospital_id:
              hospitalId,

            doctor_id:
              hospitalDoctor.doctorId,

            blocked_date:
              date,

            reason:
              cleanReason,

            updated_at:
              new Date().toISOString(),
          })
          .select(`
            id,
            hospital_id,
            doctor_id,
            blocked_date,
            reason,
            created_at,
            updated_at
          `)
          .single();

        if (error) {
          throw error;
        }

        blockedDate = data;
      }

      // ---------------------------------------------------------
      // Audit the Hospital Admin action.
      // ---------------------------------------------------------
      await logAuditEvent({
        hospitalId,

        actorUserId:
          req.context.userId,

        actorRole:
          req.context.role,

        action:
          "DOCTOR_BLOCKED_DATE_ADD",

        resourceType:
          "blocked_dates",

        resourceId:
          blockedDate.id,

        metadata: {
          doctorId:
            hospitalDoctor.doctorId,

          blockedDate:
            date,

          reason:
            cleanReason,
        },
      });

      return res.status(201).json({
        success: true,

        message:
          "Doctor unavailable date saved successfully.",

        blockedDate,
      });
    } catch (err) {
      console.error(
        "[HospitalAdmin] POST blocked date error:",
        err,
      );

      return res.status(500).json({
        success: false,

        message:
          err.message ||
          "Failed to add unavailable date.",
      });
    }
  },
);

// ============================================================================
// END READ-ONLY DOCTOR SCHEDULE
// ============================================================================

// ============================================================================
// HOSPITAL ADMIN — DOCTOR SCHEDULE WRITE OPERATIONS
// ============================================================================

/**
 * PUT /api/v1/hospital-admin/doctors/:doctorId/availability
 *
 * Save the selected doctor's Monday-Sunday availability
 * for the authenticated hospital.
 */
router.put(
  "/doctors/:doctorId/availability",
  requirePermission(
    "appointments.manage",
  ),
  async (req, res) => {
    try {
      const db =
        getSupabaseClient();

      const hospitalId =
        req.context?.hospitalId;

      const { doctorId } =
        req.params;

      const { schedule } =
        req.body || {};

      if (!db) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "Database connection unavailable.",
          });
      }

      if (
        !Array.isArray(schedule) ||
        schedule.length === 0
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "A weekly schedule array is required.",
          });
      }

      /*
       * Doctor must belong to the current hospital.
       */
      const hospitalDoctor =
        await resolveHospitalDoctor(
          db,
          hospitalId,
          doctorId,
        );

      if (!hospitalDoctor) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Doctor is not assigned to this hospital.",
          });
      }

      if (
        hospitalDoctor.status !==
        "active"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Cannot update availability for an inactive doctor.",
          });
      }

      const resolvedDoctorId =
        hospitalDoctor.doctorId;

      /*
       * Validate EVERY requested day before
       * performing any database write.
       */
      const normalizedSchedule =
        [];

      const receivedDays =
        new Set();

      for (
        const item of schedule
      ) {
        const day =
          normalizeAvailabilityDay(
            item.day_of_week,
          );

        if (!day) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                `Invalid day_of_week '${item.day_of_week}'.`,
            });
        }

        if (
          receivedDays.has(day)
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                `Duplicate schedule found for ${day}.`,
            });
        }

        receivedDays.add(day);

        const isAvailable =
          Boolean(
            item.is_available,
          );

        let timeWindows = [];

        if (isAvailable) {
          try {
            timeWindows =
              normalizeScheduleTimeWindows(
                item.time_windows,
                day,
              );
          } catch (
            validationError
          ) {
            return res
              .status(400)
              .json({
                success: false,
                message:
                  validationError.message,
              });
          }
        }

        /*
         * start_time / end_time remain populated
         * for compatibility with older app code.
         *
         * Real availability comes from time_windows.
         */
        const firstWindow =
          timeWindows[0] || null;

        const lastWindow =
          timeWindows[
            timeWindows.length - 1
          ] || null;

        normalizedSchedule.push({
          hospital_id:
            hospitalId,

          doctor_id:
            resolvedDoctorId,

          day_of_week:
            day,

          is_available:
            isAvailable,

          time_windows:
            isAvailable
              ? timeWindows
              : [],

          start_time:
            firstWindow?.start_time ||
            "09:00 AM",

          end_time:
            lastWindow?.end_time ||
            "05:00 PM",

          updated_at:
            new Date().toISOString(),
        });
      }

      /*
       * Update an existing hospital schedule row,
       * otherwise create a new hospital-specific row.
       */
      for (
        const row of
        normalizedSchedule
      ) {
        const {
          data: existing,
          error: existingError,
        } = await db
          .from("availability")
          .select("id")
          .eq(
            "hospital_id",
            hospitalId,
          )
          .eq(
            "doctor_id",
            resolvedDoctorId,
          )
          .eq(
            "day_of_week",
            row.day_of_week,
          )
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        if (existing?.id) {
          const {
            error: updateError,
          } = await db
            .from("availability")
            .update({
              is_available:
                row.is_available,

              time_windows:
                row.time_windows,

              start_time:
                row.start_time,

              end_time:
                row.end_time,

              updated_at:
                row.updated_at,
            })
            .eq(
              "id",
              existing.id,
            )
            .eq(
              "hospital_id",
              hospitalId,
            )
            .eq(
              "doctor_id",
              resolvedDoctorId,
            );

          if (updateError) {
            throw updateError;
          }
        } else {
          /*
           * Existing production availability schema
           * requires slot_duration_minutes.
           *
           * Hospital Admin scheduling does not currently
           * expose slot duration, so preserve the legacy
           * compatible value of 30 minutes.
           */
          const {
            error: insertError,
          } = await db
            .from("availability")
            .insert({
              hospital_id:
                hospitalId,

              doctor_id:
                resolvedDoctorId,

              day_of_week:
                row.day_of_week,

              is_available:
                row.is_available,

              time_windows:
                row.time_windows,

              start_time:
                row.start_time,

              end_time:
                row.end_time,

              slot_duration_minutes:
                30,

              created_at:
                new Date()
                  .toISOString(),

              updated_at:
                row.updated_at,
            });

          if (insertError) {
            throw insertError;
          }
        }
      }

      await logAuditEvent({
        hospitalId,

        actorUserId:
          req.context.userId,

        actorRole:
          req.context.role,

        action:
          "DOCTOR_AVAILABILITY_UPDATE",

        resourceType:
          "availability",

        resourceId:
          resolvedDoctorId,

        metadata: {
          doctorId:
            resolvedDoctorId,

          daysUpdated:
            normalizedSchedule.map(
              (item) =>
                item.day_of_week,
            ),
        },
      });

      /*
       * Return the final persisted schedule.
       */
      const {
        data: finalRows,
        error: finalError,
      } = await db
        .from("availability")
        .select(`
          id,
          hospital_id,
          doctor_id,
          day_of_week,
          is_available,
          start_time,
          end_time,
          time_windows,
          created_at,
          updated_at
        `)
        .eq(
          "hospital_id",
          hospitalId,
        )
        .eq(
          "doctor_id",
          resolvedDoctorId,
        );

      if (finalError) {
        throw finalError;
      }

      return res.json({
        success: true,

        message:
          "Doctor weekly availability updated successfully.",

        hospitalId,

        doctorId:
          resolvedDoctorId,

        availability:
          buildFullHospitalSchedule(
            finalRows || [],
            resolvedDoctorId,
            hospitalId,
          ),
      });
    } catch (err) {
      console.error(
        "[HospitalAdmin] PUT doctor availability error:",
        err,
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message ||
            "Failed to update doctor schedule.",
        });
    }
  },
);

/**
 * POST /api/v1/hospital-admin/doctors/:doctorId/blocked-dates
 *
 * Add or update one hospital-specific unavailable date.
 */
router.post(
  "/doctors/:doctorId/blocked-dates",
  requirePermission(
    "appointments.manage",
  ),
  async (req, res) => {
    try {
      const db =
        getSupabaseClient();

      const hospitalId =
        req.context?.hospitalId;

      const { doctorId } =
        req.params;

      const {
        date,
        reason = "Leave / Blocked",
      } = req.body || {};

      if (!db) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "Database connection unavailable.",
          });
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          String(date || ""),
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Valid date is required in YYYY-MM-DD format.",
          });
      }

      const parsedDate =
        new Date(
          `${date}T00:00:00Z`,
        );

      if (
        Number.isNaN(
          parsedDate.getTime(),
        ) ||
        parsedDate
          .toISOString()
          .slice(0, 10) !== date
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid blocked date.",
          });
      }

      const hospitalDoctor =
        await resolveHospitalDoctor(
          db,
          hospitalId,
          doctorId,
        );

      if (!hospitalDoctor) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Doctor is not assigned to this hospital.",
          });
      }

      if (
        hospitalDoctor.status !==
        "active"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Cannot manage blocked dates for an inactive doctor.",
          });
      }

      const cleanReason =
        String(
          reason ||
            "Leave / Blocked",
        )
          .trim()
          .slice(0, 500) ||
        "Leave / Blocked";

      /*
       * Check whether the date already exists
       * for this hospital + doctor.
       */
      const {
        data: existing,
        error: existingError,
      } = await db
        .from("blocked_dates")
        .select("id")
        .eq(
          "hospital_id",
          hospitalId,
        )
        .eq(
          "doctor_id",
          hospitalDoctor.doctorId,
        )
        .eq(
          "blocked_date",
          date,
        )
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      let blockedDate;

      if (existing?.id) {
        const {
          data,
          error,
        } = await db
          .from("blocked_dates")
          .update({
            reason:
              cleanReason,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            existing.id,
          )
          .eq(
            "hospital_id",
            hospitalId,
          )
          .eq(
            "doctor_id",
            hospitalDoctor.doctorId,
          )
          .select(`
            id,
            hospital_id,
            doctor_id,
            blocked_date,
            reason,
            created_at,
            updated_at
          `)
          .single();

        if (error) {
          throw error;
        }

        blockedDate = data;
      } else {
        const {
          data,
          error,
        } = await db
          .from("blocked_dates")
          .insert({
            hospital_id:
              hospitalId,

            doctor_id:
              hospitalDoctor.doctorId,

            blocked_date:
              date,

            reason:
              cleanReason,

            updated_at:
              new Date()
                .toISOString(),
          })
          .select(`
            id,
            hospital_id,
            doctor_id,
            blocked_date,
            reason,
            created_at,
            updated_at
          `)
          .single();

        if (error) {
          throw error;
        }

        blockedDate = data;
      }

      await logAuditEvent({
        hospitalId,

        actorUserId:
          req.context.userId,

        actorRole:
          req.context.role,

        action:
          "DOCTOR_BLOCKED_DATE_ADD",

        resourceType:
          "blocked_dates",

        resourceId:
          blockedDate.id,

        metadata: {
          doctorId:
            hospitalDoctor.doctorId,

          blockedDate:
            date,

          reason:
            cleanReason,
        },
      });

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Doctor unavailable date saved successfully.",

          blockedDate,
        });
    } catch (err) {
      console.error(
        "[HospitalAdmin] POST blocked date error:",
        err,
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message ||
            "Failed to add unavailable date.",
        });
    }
  },
);

/**
 * DELETE /api/v1/hospital-admin/doctors/:doctorId/blocked-dates/:blockedDateId
 */
router.delete(
  "/doctors/:doctorId/blocked-dates/:blockedDateId",
  requirePermission(
    "appointments.manage",
  ),
  async (req, res) => {
    try {
      const db =
        getSupabaseClient();

      const hospitalId =
        req.context?.hospitalId;

      const {
        doctorId,
        blockedDateId,
      } = req.params;

      if (!db) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "Database connection unavailable.",
          });
      }

      const hospitalDoctor =
        await resolveHospitalDoctor(
          db,
          hospitalId,
          doctorId,
        );

      if (!hospitalDoctor) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Doctor is not assigned to this hospital.",
          });
      }

      /*
       * Lookup includes hospital + doctor + blocked-date ID.
       *
       * This prevents another hospital's record
       * from being deleted.
       */
      const {
        data: blockedRow,
        error: lookupError,
      } = await db
        .from("blocked_dates")
        .select(`
          id,
          blocked_date,
          reason
        `)
        .eq(
          "id",
          blockedDateId,
        )
        .eq(
          "hospital_id",
          hospitalId,
        )
        .eq(
          "doctor_id",
          hospitalDoctor.doctorId,
        )
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      if (!blockedRow) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Blocked date not found for this doctor and hospital.",
          });
      }

      const {
        error: deleteError,
      } = await db
        .from("blocked_dates")
        .delete()
        .eq(
          "id",
          blockedRow.id,
        )
        .eq(
          "hospital_id",
          hospitalId,
        )
        .eq(
          "doctor_id",
          hospitalDoctor.doctorId,
        );

      if (deleteError) {
        throw deleteError;
      }

      await logAuditEvent({
        hospitalId,

        actorUserId:
          req.context.userId,

        actorRole:
          req.context.role,

        action:
          "DOCTOR_BLOCKED_DATE_DELETE",

        resourceType:
          "blocked_dates",

        resourceId:
          blockedRow.id,

        metadata: {
          doctorId:
            hospitalDoctor.doctorId,

          blockedDate:
            blockedRow.blocked_date,
        },
      });

      return res.json({
        success: true,

        message:
          "Doctor unavailable date removed successfully.",
      });
    } catch (err) {
      console.error(
        "[HospitalAdmin] DELETE blocked date error:",
        err,
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message ||
            "Failed to remove unavailable date.",
        });
    }
  },
);

// Helper for Gmail validation
function validateGmailAddress(email) {
    if (!email || typeof email !== "string") {
        return { isValid: false, normalizedEmail: "", message: "Email address is required." };
    }
    const normalized = email.trim().toLowerCase();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(normalized)) {
        return {
            isValid: false,
            normalizedEmail: normalized,
            message: "Only Gmail addresses (@gmail.com) are allowed for Doctor and Staff accounts."
        };
    }
    return { isValid: true, normalizedEmail: normalized };
}

/**
 * POST /api/v1/hospital-admin/doctors
 * Create a new Doctor account & link to current hospital
 */
router.post("/doctors", requirePermission("staff.invite"), async (req, res) => {
    try {
        const {
            fullName,
            email,
            phone,
            specialization,
            qualification,
            registrationNumber,
            gender,
            customPassword
        } = req.body || {};

        if (!fullName || !email) {
            return res.status(400).json({
                success: false,
                message: "Full Name and Email address are required."
            });
        }

        const gmailCheck = validateGmailAddress(email);
        if (!gmailCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: gmailCheck.message
            });
        }
        const normalizedEmail = gmailCheck.normalizedEmail;
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) {
            return res.status(500).json({ success: false, message: "Database service unavailable." });
        }

        // 1. Check duplicate email in users, doctors, and hospital_members table
        const { data: existingUser } = await db
            .from("users")
            .select("id, email")
            .eq("email", normalizedEmail)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        const { data: existingDoc } = await db
            .from("doctors")
            .select("doctor_id, doctor_email")
            .eq("doctor_email", normalizedEmail)
            .maybeSingle();

        if (existingDoc) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        const { supabaseAdmin } = require("../config/supabase");
        if (!supabaseAdmin) {
            return res.status(500).json({
                success: false,
                message: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required to create Doctor Auth user."
            });
        }

        // Check if email already exists in Supabase Auth
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = userList?.users?.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
        if (existingAuthUser) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        // 2. Create Supabase Auth User
        let authUserId = null;
        let authUserCreated = false;
        const tempPassword = customPassword && customPassword.length >= 6 ? customPassword : generateTempPassword();

        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: "doctor",
                specialization: specialization || "General Physician"
            }
        });

        if (authErr || !authUser?.user) {
            const msg = authErr?.message || "Failed to create authentication credentials.";
            return res.status(400).json({
                success: false,
                message: msg.includes("already registered")
                    ? `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
                    : `Failed to create Auth account: ${msg}`
            });
        }

        authUserId = authUser.user.id;
        console.log("[HospitalAdmin] POST /doctors req.body:", req.body);
        authUserCreated = true;

        try {
            // 3. Upsert public.users record
            const { error: userErr } = await db.from("users").upsert({
                id: authUserId,
                email: normalizedEmail,
                full_name: fullName,
                phone: phone || null,
                role: "doctor",
                updated_at: new Date().toISOString()
            }, { onConflict: "id" });
            if (userErr) throw userErr;

            // 4. Create public.doctors record
            const docPayload = {
                user_id: authUserId,
                doctor_name: fullName,
                doctor_email: normalizedEmail,
                doctor_mobile: phone || null,
                doctor_specialization: specialization || null,
                doctor_qualification: qualification || null,
                doctor_registration_number: registrationNumber || null,
                doctor_gender: gender || null,
                doctor_is_active: true
            };

            console.log("[HospitalAdmin] POST /doctors PAYLOAD:", docPayload);

            let savedDoctor = null;
            const { data: upsertedDoc, error: docInsErr } = await db
                .from("doctors")
                .upsert(docPayload, { onConflict: "user_id" })
                .select("*")
                .maybeSingle();

            if (docInsErr) {
                console.error("[HospitalAdmin] DOCTOR UPSERT ERROR:", docInsErr);
                const { data: existingDoc } = await db
                    .from("doctors")
                    .select("doctor_id")
                    .eq("user_id", authUserId)
                    .maybeSingle();

                if (existingDoc) {
                    const { data: updatedDoc, error: updateErr } = await db
                        .from("doctors")
                        .update(docPayload)
                        .eq("doctor_id", existingDoc.doctor_id)
                        .select("*")
                        .single();

                    if (updateErr) throw updateErr;
                    savedDoctor = updatedDoc;
                } else {
                    const { data: insertedDoc, error: insertErr } = await db
                        .from("doctors")
                        .insert(docPayload)
                        .select("*")
                        .single();

                    if (insertErr) throw insertErr;
                    savedDoctor = insertedDoc;
                }
            } else if (upsertedDoc) {
                savedDoctor = upsertedDoc;
            } else {
                const { data: fetchedDoc, error: fetchErr } = await db
                    .from("doctors")
                    .select("*")
                    .eq("user_id", authUserId)
                    .maybeSingle();

                if (fetchErr || !fetchedDoc) {
                    throw new Error("Failed to persist or locate doctor profile record after creation.");
                }
                savedDoctor = fetchedDoc;
            }

            console.log("[HospitalAdmin] SAVED DOCTOR:", savedDoctor);
            const resolvedDoctorId = savedDoctor.doctor_id;

            // 5. Create hospital_members record
            const newMember = {
                hospital_id: hospitalId,
                user_id: authUserId,
                doctor_id: resolvedDoctorId,
                role: "doctor",
                status: "active",
                updated_at: new Date().toISOString()
            };

            const { data: memberData, error: memInsErr } = await db
                .from("hospital_members")
                .upsert(newMember, { onConflict: "hospital_id, user_id" })
                .select()
                .single();

            if (memInsErr) throw memInsErr;

            // 6. Write Audit Log
            await logAuditEvent({
                hospitalId: hospitalId,
                actorUserId: req.context.userId,
                actorRole: req.context.role,
                action: "DOCTOR_CREATE",
                resourceType: "hospital_members",
                resourceId: memberData.id,
                metadata: { targetUserId: authUserId, doctorId: resolvedDoctorId, email: normalizedEmail }
            });

            return res.status(201).json({
                success: true,
                message: "Doctor account created successfully.",
                credentials: {
                    hospitalName: req.context.hospitalName || "Doctors Vedika Main Hospital",
                    memberName: (savedDoctor.doctor_name || fullName).startsWith("Dr.") ? (savedDoctor.doctor_name || fullName) : `Dr. ${savedDoctor.doctor_name || fullName}`,
                    role: "Doctor",
                    email: normalizedEmail,
                    temporaryPassword: tempPassword,
                    portalName: "Doctors Vedika Doctor Portal",
                    loginUrl: "/login"
                },
                doctor: {
                    memberId: memberData.id,
                    doctorId: resolvedDoctorId,
                    userId: authUserId,
                    fullName: savedDoctor.doctor_name || fullName,
                    email: savedDoctor.doctor_email || normalizedEmail,
                    phone: savedDoctor.doctor_mobile || "",
                    specialization: savedDoctor.doctor_specialization || "Not specified",
                    qualification: savedDoctor.doctor_qualification || "",
                    registrationNumber: savedDoctor.doctor_registration_number || "",
                    status: "active"
                }
            });
        } catch (dbErr) {
            console.error("[HospitalAdmin] Doctor creation DB step failed:", dbErr.message);
            // Safe Rollback: delete Auth user if DB creation failed
            if (authUserCreated && supabaseAdmin) {
                try {
                    await supabaseAdmin.auth.admin.deleteUser(authUserId);
                    console.log(`[HospitalAdmin] Rolled back Auth user ${authUserId}`);
                } catch (rbErr) {
                    console.error("[HospitalAdmin] Rollback Auth user error:", rbErr.message);
                }
            }
            return res.status(500).json({
                success: false,
                message: `Failed to complete Doctor account setup: ${dbErr.message}`
            });
        }
    } catch (err) {
        console.error("[HospitalAdmin] POST /doctors error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /api/v1/hospital-admin/doctors/:doctorId
 * Edit existing doctor details
 */
router.put("/doctors/:doctorId", requirePermission("staff.manage"), async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { fullName, phone, specialization, qualification, registrationNumber } = req.body || {};
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        // Verify membership in hospital
        const { data: member } = await db
            .from("hospital_members")
            .select("id, user_id, doctor_id")
            .eq("hospital_id", req.context.hospitalId)
            .or(`doctor_id.eq.${doctorId},id.eq.${doctorId}`)
            .maybeSingle();

        if (!member) {
            return res.status(404).json({ success: false, message: "Doctor member not found in this hospital." });
        }

        const targetDocId = member.doctor_id || doctorId;
        const targetUserId = member.user_id;

        // Update doctors table
        await db.from("doctors").update({
            doctor_name: fullName,
            doctor_mobile: phone || null,
            doctor_specialization: specialization || "General Physician",
            doctor_qualification: qualification || null,
            doctor_registration_number: registrationNumber || null
        }).or(`doctor_id.eq.${targetDocId},user_id.eq.${targetDocId}`);

        // Update users table if user_id present
        if (targetUserId) {
            await db.from("users").update({
                full_name: fullName,
                phone: phone || null
            }).eq("id", targetUserId);
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "DOCTOR_UPDATE",
            resourceType: "doctors",
            resourceId: targetDocId,
            metadata: { fullName, phone, specialization }
        });

        return res.json({
            success: true,
            message: "Doctor profile updated successfully."
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PATCH /api/v1/hospital-admin/doctors/:doctorId/status
 * Activate or Deactivate doctor member
 */
router.patch("/doctors/:doctorId/status", requirePermission("staff.manage"), async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { status } = req.body || {}; // 'active' | 'inactive'
        const newStatus = status === "active" ? "active" : "inactive";
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        const { data: member, error: findErr } = await db
            .from("hospital_members")
            .select("id, user_id, doctor_id")
            .eq("hospital_id", req.context.hospitalId)
            .or(`doctor_id.eq.${doctorId},id.eq.${doctorId}`)
            .maybeSingle();

        if (!member) {
            return res.status(404).json({ success: false, message: "Doctor not found in this hospital." });
        }

        // Update hospital_members status
        await db.from("hospital_members")
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", member.id);

        // Update doctor_is_active in doctors table
        if (member.doctor_id) {
            await db.from("doctors")
                .update({ doctor_is_active: newStatus === "active" })
                .or(`doctor_id.eq.${member.doctor_id},id.eq.${member.doctor_id}`);
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: newStatus === "active" ? "DOCTOR_ACTIVATE" : "DOCTOR_DEACTIVATE",
            resourceType: "hospital_members",
            resourceId: member.id,
            metadata: { newStatus }
        });

        return res.json({
            success: true,
            message: `Doctor status updated to '${newStatus}'.`,
            status: newStatus
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/staff
 * List all Staff members belonging to current hospital
 */
router.get("/staff", requirePermission("staff.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) return res.json({ success: true, staff: [] });

        const { data: members, error: memErr } = await db
            .from("hospital_members")
            .select("id, hospital_id, user_id, role, status, created_at")
            .eq("hospital_id", hospitalId)
            .eq("role", "staff")
            .order("created_at", { ascending: false });

        if (memErr) throw memErr;
        if (!members || members.length === 0) return res.json({ success: true, staff: [] });

        const userIds = members.map(m => m.user_id).filter(Boolean);
        const { data: userRows } = await db
            .from("users")
            .select("*")
            .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

        const staffList = members.map(m => {
            const u = (userRows || []).find(ur => ur.id === m.user_id);
            return {
                memberId: m.id,
                userId: m.user_id,
                fullName: u?.full_name || "Staff Member",
                email: u?.email || "N/A",
                phone: u?.phone || "",
                staffRole: u?.staff_role || "Reception / Front Desk",
                status: m.status || "active",
                createdAt: m.created_at
            };
        });

        return res.json({
            success: true,
            staff: staffList
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/hospital-admin/staff
 * Create a new Staff account & link to current hospital (doctor_id = NULL)
 */
router.post("/staff", requirePermission("staff.invite"), async (req, res) => {
    try {
        const { fullName, email, phone, staffRole, customPassword } = req.body || {};

        if (!fullName || !email) {
            return res.status(400).json({
                success: false,
                message: "Full Name and Email address are required."
            });
        }

        const gmailCheck = validateGmailAddress(email);
        if (!gmailCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: gmailCheck.message
            });
        }
        const normalizedEmail = gmailCheck.normalizedEmail;
        const validStaffRole = staffRole || "Reception / Front Desk";
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) {
            return res.status(500).json({ success: false, message: "Database service unavailable." });
        }

        // 1. Check duplicate email in users table
        const { data: existingUser } = await db
            .from("users")
            .select("id, email")
            .eq("email", normalizedEmail)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        const { supabaseAdmin } = require("../config/supabase");
        if (!supabaseAdmin) {
            return res.status(500).json({
                success: false,
                message: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required to create Staff Auth user."
            });
        }

        // Check if email already exists in Supabase Auth
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = userList?.users?.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
        if (existingAuthUser) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        // 2. Create Supabase Auth User
        let authUserId = null;
        let authUserCreated = false;
        const tempPassword = customPassword && customPassword.length >= 6 ? customPassword : generateTempPassword();

        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: "staff",
                staff_role: validStaffRole
            }
        });

        if (authErr || !authUser?.user) {
            const msg = authErr?.message || "Failed to create authentication credentials.";
            return res.status(400).json({
                success: false,
                message: msg.includes("already registered")
                    ? `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
                    : `Failed to create Auth account: ${msg}`
            });
        }

        authUserId = authUser.user.id;
        authUserCreated = true;

        try {
            // 3. Upsert public.users record (app_role enum requires 'assistant' for staff personnel)
            const { error: userErr } = await db.from("users").upsert({
                id: authUserId,
                email: normalizedEmail,
                full_name: fullName,
                phone: phone || null,
                role: "assistant",
                updated_at: new Date().toISOString()
            }, { onConflict: "id" });
            if (userErr) throw userErr;

            // 4. Create hospital_members record with role='staff' and doctor_id=NULL
            const newMember = {
                hospital_id: hospitalId,
                user_id: authUserId,
                doctor_id: null, // CRITICAL: Staff members MUST have doctor_id = NULL
                role: "staff",
                status: "active",
                updated_at: new Date().toISOString()
            };

            const { data: memberData, error: memInsErr } = await db
                .from("hospital_members")
                .upsert(newMember, { onConflict: "hospital_id, user_id" })
                .select()
                .single();

            if (memInsErr) throw memInsErr;

            // 5. Write Audit Log (NEVER write plaintext password in audit log)
            await logAuditEvent({
                hospitalId: hospitalId,
                actorUserId: req.context.userId,
                actorRole: req.context.role,
                action: "STAFF_CREATE",
                resourceType: "hospital_members",
                resourceId: memberData.id,
                metadata: { targetUserId: authUserId, staffRole: validStaffRole, email: normalizedEmail }
            });

            // 6. Return safe temporary credentials payload ONE TIME to frontend
            return res.status(201).json({
                success: true,
                message: "Staff account created successfully.",
                credentials: {
                    hospitalName: req.context.hospitalName || "Doctors Vedika Main Hospital",
                    memberName: fullName,
                    role: validStaffRole,
                    email: normalizedEmail,
                    temporaryPassword: tempPassword,
                    portalName: "Doctors Vedika Staff Portal",
                    loginUrl: "/staff/login"
                },
                staff: {
                    memberId: memberData.id,
                    userId: authUserId,
                    fullName,
                    email: normalizedEmail,
                    phone: phone || "",
                    staffRole: validStaffRole,
                    status: "active"
                }
            });
        } catch (dbErr) {
            console.error("[HospitalAdmin] Staff creation DB step failed:", dbErr.message);
            // Safe Rollback: delete Auth user if DB creation failed
            if (authUserCreated && supabaseAdmin) {
                try {
                    await supabaseAdmin.auth.admin.deleteUser(authUserId);
                    console.log(`[HospitalAdmin] Rolled back Auth user ${authUserId}`);
                } catch (rbErr) {
                    console.error("[HospitalAdmin] Rollback Auth user error:", rbErr.message);
                }
            }
            return res.status(500).json({
                success: false,
                message: `Failed to complete Staff account setup: ${dbErr.message}`
            });
        }
    } catch (err) {
        console.error("[HospitalAdmin] POST /staff error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /api/v1/hospital-admin/staff/:memberId
 * Edit existing staff member details
 */
router.put("/staff/:memberId", requirePermission("staff.manage"), async (req, res) => {
    try {
        const { memberId } = req.params;
        const { fullName, phone, staffRole } = req.body || {};
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        const { data: member } = await db
            .from("hospital_members")
            .select("id, user_id")
            .eq("hospital_id", req.context.hospitalId)
            .eq("id", memberId)
            .maybeSingle();

        if (!member) {
            return res.status(404).json({ success: false, message: "Staff member not found in this hospital." });
        }

        if (member.user_id) {
            await db.from("users").update({
                full_name: fullName,
                phone: phone || null
            }).eq("id", member.user_id);
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "STAFF_UPDATE",
            resourceType: "hospital_members",
            resourceId: memberId,
            metadata: { fullName, phone, staffRole }
        });

        return res.json({
            success: true,
            message: "Staff member profile updated successfully."
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PATCH /api/v1/hospital-admin/staff/:memberId/status
 * Activate or Deactivate staff member
 */
router.patch("/staff/:memberId/status", requirePermission("staff.manage"), async (req, res) => {
    try {
        const { memberId } = req.params;
        const { status } = req.body || {}; // 'active' | 'inactive'
        const newStatus = status === "active" ? "active" : "inactive";
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        const { data: member } = await db
            .from("hospital_members")
            .select("id, user_id")
            .eq("hospital_id", req.context.hospitalId)
            .eq("id", memberId)
            .maybeSingle();

        if (!member) {
            return res.status(404).json({ success: false, message: "Staff member not found in this hospital." });
        }

        await db.from("hospital_members")
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", memberId);

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: newStatus === "active" ? "STAFF_ACTIVATE" : "STAFF_DEACTIVATE",
            resourceType: "hospital_members",
            resourceId: memberId,
            metadata: { newStatus }
        });

        return res.json({
            success: true,
            message: `Staff status updated to '${newStatus}'.`,
            status: newStatus
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/hospital
 * View current hospital details
 */
router.get("/hospital", requirePermission("hospital.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) {
            return res.json({
                success: true,
                hospital: {
                    id: hospitalId,
                    name: req.context.hospitalName || "Doctors Vedika Main Hospital",
                    code: "DV-MAIN",
                    status: "active"
                }
            });
        }

        const { data, error } = await db
            .from("hospitals")
            .select("*")
            .eq("id", hospitalId)
            .single();

        if (error) {
            return res.json({
                success: true,
                hospital: {
                    id: hospitalId,
                    name: req.context.hospitalName || "Doctors Vedika Main Hospital",
                    code: "DV-MAIN",
                    status: "active"
                }
            });
        }

        return res.json({
            success: true,
            hospital: data
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /api/v1/hospital-admin/hospital
 * Update current hospital details
 */
router.put("/hospital", requirePermission("hospital.manage"), async (req, res) => {
    try {
        const { name, phone, email, address, city, state } = req.body || {};
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        const updatePayload = {
            updated_at: new Date().toISOString()
        };
        if (name) updatePayload.name = name;
        if (phone !== undefined) updatePayload.phone = phone;
        if (email !== undefined) updatePayload.email = email;
        if (address !== undefined) updatePayload.address = address;
        if (city !== undefined) updatePayload.city = city;
        if (state !== undefined) updatePayload.state = state;

        const { data, error } = await db
            .from("hospitals")
            .update(updatePayload)
            .eq("id", hospitalId)
            .select()
            .single();

        if (error) throw error;

        await logAuditEvent({
            hospitalId: hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "HOSPITAL_PROFILE_UPDATE",
            resourceType: "hospitals",
            resourceId: hospitalId,
            metadata: { name, phone, email }
        });

        return res.json({
            success: true,
            message: "Hospital profile updated successfully.",
            hospital: data
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/audit-logs
 * Fetch tenant security audit logs
 */
router.get("/audit-logs", requirePermission("audit.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        if (!db) return res.json({ success: true, auditLogs: [] });

        const { data, error } = await db
            .from("audit_logs")
            .select("*")
            .eq("hospital_id", req.context.hospitalId)
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) throw error;

        return res.json({
            success: true,
            auditLogs: data || []
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/auth/context
 * Returns current user's authenticated context & capabilities
 */
router.get("/auth/context", (req, res) => {
    return res.json({
        success: true,
        context: req.context
    });
});

module.exports = router;

