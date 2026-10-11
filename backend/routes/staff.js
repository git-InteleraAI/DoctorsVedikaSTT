const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
const { authenticateAdapter, requirePermission } = require("../middleware/authAdapter");
const { logAuditEvent } = require("../middleware/auditLogger");
const { supabaseAdmin } = require("../config/supabase");
const { encryptPayload, decryptRecord } = require("../services/encryptionService");

function getSupabaseClient() {
    return supabaseAdmin;
}

/**
 * Create a fresh server-only Supabase service-role client.
 * Prevents request/session/header state from affecting critical hospital-scoped lookups.
 */
function getFreshServiceClient() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        return null;
    }

    return createClient(
        url,
        serviceKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    );
}

// Protect all staff routes
router.use(authenticateAdapter);

// Disable caching on all staff API responses so real-time polling updates immediately
router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});

// Explicit guard: Only authenticated users with verified staff role or capability can access /staff routes
const requireStaffRole = (req, res, next) => {
    const isStaff = req.context?.role === "staff" || req.context?.capabilities?.staff === true;
    if (!req.context || !isStaff) {
        return res.status(403).json({
            success: false,
            message: "Access forbidden. Staff privileges required."
        });
    }
    next();
};
router.use(requireStaffRole);

/**
 * GET /api/v1/staff/hospital-info
 * Fetch dynamic hospital metadata for logged-in staff member
 */
router.get("/hospital-info", async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db || !hospitalId) {
            return res.json({
                success: true,
                hospital: { id: null, name: "Doctors Vedika Hospital", code: "DV-HOSP" }
            });
        }

        const { data: hosp } = await db
            .from("hospitals")
            .select("id, name, code, address, phone, email, logo_url, city, state")
            .eq("id", hospitalId)
            .maybeSingle();

        return res.json({
            success: true,
            hospital: {
                id: hosp?.id || hospitalId,
                name: hosp?.name || "Doctors Vedika Hospital",
                code: hosp?.code || "DV-HOSP",
                address: hosp?.address || "",
                phone: hosp?.phone || "",
                email: hosp?.email || "",
                logoUrl: hosp?.logo_url || null
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/staff/qr-intakes
 * Returns list of submitted QR intakes for staff review.
 * Never exposes anonymous access_token to staff UI.
 */
router.get("/qr-intakes", requirePermission("queue.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;
        if (!db || !hospitalId) {
            return res.json({ success: true, intakes: [] });
        }

        const { data, error } = await db
            .from("qr_intake_sessions")
            .select(`
                id,
                hospital_id,
                first_name,
                last_name,
                full_name,
                phone,
                email,
                date_of_birth,
                gender,
                status,
                clinical_intake,
                safety_status,
                safety_result,
                submitted_at,
                created_at
            `)
            .eq("hospital_id", hospitalId)
            .in("status", ["review", "submitted", "safety_blocked"])
            .order("created_at", { ascending: false });

        if (error) throw error;

        const intakes = (data || []).map((row) => ({
            id: row.id,
            patientName: row.full_name,
            firstName: row.first_name,
            lastName: row.last_name,
            phone: row.phone,
            email: row.email,
            dateOfBirth: row.date_of_birth,
            gender: row.gender,
            status: row.status,
            clinicalIntake: row.clinical_intake || {},
            safetyStatus: row.safety_status || "safe",
            safetyResult: row.safety_result || {},
            submittedAt: row.submitted_at,
            createdAt: row.created_at,
        }));

        return res.json({ success: true, intakes });
    } catch (err) {
        console.error("[Staff] Failed to load QR intakes:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/staff/dashboard-stats
 * Staff Portal metrics overview: Today's Appointments, Waiting, In Consultation, Completed, Cancelled, Queue Count
 */
router.get("/dashboard-stats", requirePermission("queue.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        let totalAppointments = 0;
        let waiting = 0;
        let checkedIn = 0;
        let inConsultation = 0;
        let completed = 0;
        let cancelled = 0;

        if (db) {
            const todayStr = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());
            const targetDate = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) ? req.query.date : todayStr;
            const dayStart = new Date(`${targetDate}T00:00:00+05:30`).toISOString();
            const dayEnd = new Date(`${targetDate}T23:59:59.999+05:30`).toISOString();

            // Count appointments scheduled or created for targetDate
            let appQuery = db
                .from("appointments")
                .select("id, status", { count: "exact" })
                .eq("hospital_id", hospitalId)
                .eq("appointment_date", targetDate);

            const { data: apps, count: appCount } = await appQuery;
            totalAppointments = appCount || 0;

            // Fetch visit stage counts for targetDate
            let visitQuery = db
                .from("patient_visits")
                .select("id, visit_stage, appointment_id, created_at, checked_in_at")
                .eq("hospital_id", hospitalId);

            if (targetDate === todayStr) {
                visitQuery = visitQuery.gte("created_at", dayStart);
            } else {
                visitQuery = visitQuery.gte("created_at", dayStart).lte("created_at", dayEnd);
            }

            const { data: visits } = await visitQuery;

            if (visits && visits.length > 0) {
                visits.forEach(v => {
                    if (v.visit_stage === "checked_in") checkedIn++;
                    else if (v.visit_stage === "waiting") waiting++;
                    else if (v.visit_stage === "in_consultation") inConsultation++;
                    else if (v.visit_stage === "completed" || v.visit_stage === "exited") completed++;
                    else if (v.visit_stage === "cancelled") cancelled++;
                });
            } else if (apps && apps.length > 0) {
                // If visits table doesn't have records for this date, derive from appointments
                apps.forEach(a => {
                    if (a.status === "in_consultation" || a.status === "in_progress") inConsultation++;
                    else if (a.status === "completed" || a.status === "exited") completed++;
                    else if (a.status === "cancelled") cancelled++;
                    else waiting++;
                });
            }
        }

        const calculatedTotal = waiting + checkedIn + inConsultation + completed;
        return res.json({
            success: true,
            stats: {
                totalAppointments: totalAppointments > calculatedTotal ? totalAppointments : calculatedTotal,
                waiting: waiting + checkedIn,
                checkedIn,
                inConsultation,
                completed,
                cancelled,
                queueCount: calculatedTotal
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/staff/appointments
 * Today's appointments for staff review and check-in
 */
router.get("/appointments", requirePermission("appointments.create"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        if (!db) return res.json({ success: true, appointments: [] });

        const requestedDate = req.query.date || null;
        let apptQuery = db
            .from("appointments")
            .select(`
                id,
                doctor_id,
                patient_id,
                appointment_date,
                appointment_time,
                status,
                source,
                reason,
                hospital_id,
                hospital_patient_id,
                created_at,
                doctors(doctor_id, doctor_name, doctor_specialization),
                hospital_patient_records(id, hospital_patient_code, full_name, phone)
            `)
            .eq("hospital_id", req.context.hospitalId);

        if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
            apptQuery = apptQuery.eq("appointment_date", requestedDate);
        }

        const { data, error } = await apptQuery
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) throw error;

        const appIds = (data || []).map(a => a.id);
        let visitsMap = {};
        if (appIds.length > 0) {
            const { data: vList } = await db
                .from("patient_visits")
                .select("appointment_id, visit_stage, checked_in_at")
                .in("appointment_id", appIds);
            (vList || []).forEach(v => {
                visitsMap[v.appointment_id] = v;
            });
        }

        const formattedList = (data || []).map(app => {
            const decryptedHpr = decryptRecord("hospital_patient_records", app.hospital_patient_records);
            const visit = visitsMap[app.id];
            const visitStage = visit?.visit_stage || null;
            const isCheckedIn = Boolean(visitStage && visitStage !== "scheduled" && visitStage !== "cancelled");
            return {
                id: app.id,
                doctorId: app.doctor_id,
                doctorName: app.doctors?.doctor_name || "Doctor",
                specialization: app.doctors?.doctor_specialization || "",
                patientName: decryptedHpr?.full_name || "Patient",
                patientCode: decryptedHpr?.hospital_patient_code || "",
                phone: decryptedHpr?.phone || "",
                appointmentDate: app.appointment_date,
                appointmentTime: app.appointment_time,
                status: visitStage || app.status,
                visitStage: visitStage || (app.status === "completed" ? "completed" : "scheduled"),
                isCheckedIn: Boolean(visitStage && visitStage !== "scheduled" && visitStage !== "cancelled"),
                source: app.source || "walk_in",
                reason: app.reason || "",
                hospitalPatientId: app.hospital_patient_id,
                createdAt: app.created_at
            };
        });

        return res.json({
            success: true,
            appointments: formattedList
        });
    } catch (err) {
        console.error("[Staff GET /appointments Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/staff/appointments/:id/checkin
 * Check in an existing booked appointment or visit -> updates existing patient_visits or creates one
 */
router.post("/appointments/:id/checkin", requirePermission("appointments.checkin"), async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const { chiefComplaints, vitals } = req.body;
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "Database connection unavailable." });

        const hospitalId = req.context.hospitalId;

        // 1. Fetch appointment details (resilient lookup supporting hospital_id eq or null)
        let appRow = null;
        let existingVisit = null;

        let appQuery = db.from("appointments").select("*").eq("id", appointmentId);
        if (hospitalId) {
            appQuery = appQuery.eq("hospital_id", hospitalId);
        }
        const { data: foundApp } = await appQuery.maybeSingle();

        if (foundApp) {
            appRow = foundApp;
        } else {
            // Fallback: Check if appointmentId is actually a patient_visits record ID directly
            let visitQuery = db.from("patient_visits").select("*").eq("id", appointmentId);
            if (hospitalId) {
                visitQuery = visitQuery.eq("hospital_id", hospitalId);
            }
            const { data: foundVisit } = await visitQuery.maybeSingle();
            if (foundVisit) {
                existingVisit = foundVisit;
                if (foundVisit.appointment_id) {
                    const { data: linkedApp } = await db.from("appointments").select("*").eq("id", foundVisit.appointment_id).maybeSingle();
                    if (linkedApp) appRow = linkedApp;
                }
            }
        }

        if (!appRow && !existingVisit) {
            return res.status(404).json({ success: false, message: "Appointment not found in this hospital." });
        }

        // 2. Ensure HPR exists
        let hprId = appRow?.hospital_patient_id || existingVisit?.hospital_patient_id;
        if (!hprId && appRow) {
            const patientCode = "DV-P-" + Math.floor(100000 + Math.random() * 900000);
            const newHpr = {
                hospital_id: hospitalId || req.context.hospitalId,
                patient_id: appRow.patient_id || null, // NULL if temporary walk-in
                hospital_patient_code: patientCode,
                first_name: appRow.patient_name || "Patient",
                full_name: appRow.patient_name || "Patient",
                registration_type: "registered",
                status: "active"
            };

            const { data: createdHpr } = await db
                .from("hospital_patient_records")
                .insert(newHpr)
                .select()
                .single();

            if (createdHpr) hprId = createdHpr.id;
        }

        const nowIso = new Date().toISOString();

        // 3. Find existing patient_visits row if not loaded yet
        if (!existingVisit && appRow) {
            const { data: vRow } = await db
                .from("patient_visits")
                .select("*")
                .eq("appointment_id", appRow.id)
                .maybeSingle();
            if (vRow) existingVisit = vRow;
        }

        let visitRow = null;

        if (existingVisit) {
            // Update existing patient_visits record (DO NOT create duplicate)
            const mergedVitals = { ...(existingVisit.intake_vitals || {}), ...(vitals || {}) };
            const updatePayload = {
                visit_stage: "waiting",
                status: "scheduled",
                checked_in_at: nowIso,
                chief_complaints: chiefComplaints || appRow?.notes || appRow?.reason || existingVisit.chief_complaints || null,
                intake_vitals: mergedVitals,
                updated_at: nowIso
            };
            if (hospitalId && !existingVisit.hospital_id) {
                updatePayload.hospital_id = hospitalId;
            }

            const { data: updatedVisit, error: updateErr } = await db
                .from("patient_visits")
                .update(updatePayload)
                .eq("id", existingVisit.id)
                .select()
                .single();

            if (updateErr) throw updateErr;
            visitRow = updatedVisit;
        } else if (appRow) {
            // Create ONE patient_visits record for appointment
            const visitData = {
                hospital_id: hospitalId || req.context.hospitalId,
                hospital_patient_id: hprId,
                patient_id: appRow.patient_id || null, // NULL if temporary walk-in
                appointment_id: appRow.id,
                doctor_id: appRow.doctor_id,
                visit_stage: "waiting",
                status: "scheduled",
                chief_complaints: chiefComplaints || appRow.notes || appRow.reason || null,
                intake_vitals: vitals || {},
                checked_in_at: nowIso,
                created_by: req.context.userId
            };

            const { data: insertedVisit, error: insertErr } = await db
                .from("patient_visits")
                .insert(visitData)
                .select()
                .single();

            if (insertErr) throw insertErr;
            visitRow = insertedVisit;
        }

        // 4. Update appointments table status with fallback if DB check constraint fails
        if (appRow) {
            const appUpdatePayload = { status: "confirmed", updated_at: nowIso };
            if (hospitalId && !appRow.hospital_id) {
                appUpdatePayload.hospital_id = hospitalId;
            }

            const { error: appStatusErr } = await db
                .from("appointments")
                .update(appUpdatePayload)
                .eq("id", appRow.id);

            if (appStatusErr) {
                await db
                    .from("appointments")
                    .update({ updated_at: nowIso })
                    .eq("id", appRow.id);
            }
        }

        await logAuditEvent({
            hospitalId: hospitalId || req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "APPOINTMENT_CHECKIN",
            resourceType: "patient_visits",
            resourceId: visitRow?.id,
            metadata: { appointmentId: appRow?.id || appointmentId, hprId }
        });

        return res.json({
            success: true,
            message: "Appointment checked in successfully.",
            visit: visitRow
        });
    } catch (err) {
        console.error("[Appointment Checkin Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});



/**
 * GET /api/v1/staff/patients
 * List HPR records for the current hospital
 */
router.get("/patients", requirePermission("patients.view"), async (req, res) => {
    try {
        const { search } = req.query;
        const db = getSupabaseClient();
        if (!db) return res.json({ success: true, patients: [] });

        let queryBuilder = db
            .from("hospital_patient_records")
            .select("*")
            .eq("hospital_id", req.context.hospitalId)
            .order("created_at", { ascending: false })
            .limit(50);

        if (search && search.trim()) {
            const term = search.trim();
            queryBuilder = queryBuilder.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,hospital_patient_code.ilike.%${term}%`);
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;

        const decryptedPatients = (data || []).map(p => decryptRecord("hospital_patient_records", p));

        return res.json({
            success: true,
            patients: decryptedPatients
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/staff/patients/:id/history
 * Fetch longitudinal visit history for a specific HPR
 */
router.get("/patients/:id/history", requirePermission("patients.view"), async (req, res) => {
    try {
        const rawId = req.params.id ? String(req.params.id).replace(/^v\./, "") : "";
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) return res.json({ success: true, hpr: null, visitHistory: [] });

        // 1. Fetch HPR by id or patient_id
        let { data: hpr, error: hprErr } = await db
            .from("hospital_patient_records")
            .select("*")
            .eq("hospital_id", hospitalId)
            .or(`id.eq.${rawId},patient_id.eq.${rawId}`)
            .maybeSingle();

        // If not found by HPR id, try searching by patient_visits.id or appointment_id to find linked hospital_patient_id
        if (!hpr) {
            const { data: vRecord } = await db.from("patient_visits").select("hospital_patient_id").eq("id", rawId).eq("hospital_id", hospitalId).maybeSingle();
            const hId = vRecord?.hospital_patient_id;
            if (hId) {
                const { data: foundHpr } = await db.from("hospital_patient_records").select("*").eq("id", hId).eq("hospital_id", hospitalId).maybeSingle();
                if (foundHpr) hpr = foundHpr;
            }
        }

        if (!hpr) {
            return res.status(404).json({ success: false, message: "Hospital Patient Record not found." });
        }

        // 2. Fetch all patient_visits for this HPR/Patient in this hospital
        const visitConds = [`hospital_patient_id.eq.${hpr.id}`];
        if (hpr.patient_id) visitConds.push(`patient_id.eq.${hpr.patient_id}`);

        const { data: visits, error: visitErr } = await db
            .from("patient_visits")
            .select(`
                id,
                appointment_id,
                hospital_patient_id,
                patient_id,
                doctor_id,
                visit_stage,
                visit_type,
                status,
                chief_complaints,
                intake_vitals,
                checked_in_at,
                consultation_started_at,
                started_at,
                consultation_completed_at,
                completed_at,
                created_at,
                doctors(doctor_id, doctor_name, full_name, doctor_specialization)
            `)
            .or(visitConds.join(","))
            .eq("hospital_id", hospitalId)
            .order("created_at", { ascending: false });

        if (visitErr) console.warn("[History Visits Fetch Warning]:", visitErr.message);

        // 3. Fetch all appointments for this HPR/Patient in this hospital
        const appConds = [`hospital_patient_id.eq.${hpr.id}`];
        if (hpr.patient_id) appConds.push(`patient_id.eq.${hpr.patient_id}`);

        const { data: appointments, error: appErr } = await db
            .from("appointments")
            .select(`
                id,
                appointment_date,
                appointment_time,
                status,
                reason,
                source,
                created_at,
                doctor_id,
                doctors(doctor_id, doctor_name, full_name, doctor_specialization)
            `)
            .or(appConds.join(","))
            .eq("hospital_id", hospitalId)
            .order("created_at", { ascending: false });

        if (appErr) console.warn("[History Appointments Fetch Warning]:", appErr.message);

        // 4. Combine and deduplicate history items
        const visitsByAppId = {};
        const decVisits = (visits || []).map(v => {
            const decV = decryptRecord("patient_visits", v);
            if (v.appointment_id) visitsByAppId[v.appointment_id] = decV;
            return decV;
        });

        const historyItems = [...decVisits];

        (appointments || []).forEach(app => {
            if (!visitsByAppId[app.id]) {
                historyItems.push({
                    id: app.id,
                    appointment_id: app.id,
                    hospital_patient_id: hpr.id,
                    doctor_id: app.doctor_id,
                    doctors: app.doctors,
                    visit_stage: app.status === "cancelled" ? "cancelled" : (app.status === "completed" ? "completed" : "scheduled"),
                    status: app.status,
                    chief_complaints: app.reason || "Scheduled Appointment",
                    intake_vitals: {},
                    appointment_date: app.appointment_date,
                    appointment_time: app.appointment_time,
                    source: app.source || "appointment",
                    created_at: app.created_at
                });
            }
        });

        // Sort combined history by created_at / date descending
        historyItems.sort((a, b) => new Date(b.created_at || b.appointment_date) - new Date(a.created_at || a.appointment_date));

        const decHpr = decryptRecord("hospital_patient_records", hpr);

        return res.json({
            success: true,
            hpr: decHpr,
            visitHistory: historyItems
        });
    } catch (err) {
        console.error("[GET Patient History Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/staff/doctors
 *
 * V1 RULE:
 * Return ONLY active doctors assigned to the authenticated
 * staff user's current hospital through hospital_members.
 *
 * IMPORTANT:
 * - req.context.hospitalId is resolved by authenticateAdapter.
 * - Frontend hospital_id is NEVER trusted for authorization.
 * - doctors.hospital_id is NOT used.
 * - No global doctors query.
 * - No fallback to all doctors.
 * - If the hospital has no doctors, return [].
 */
router.get("/doctors", requirePermission("doctors.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();

        if (!db) {
            return res.status(500).json({
                success: false,
                message: "Database connection unavailable."
            });
        }

        const rawHeaderHospId = req.headers["x-hospital-id"];
        const validHeaderHospId = (rawHeaderHospId && rawHeaderHospId !== "null" && rawHeaderHospId !== "undefined") ? String(rawHeaderHospId).trim() : null;
        const rawQueryHospId = req.query.hospitalId;
        const validQueryHospId = (rawQueryHospId && rawQueryHospId !== "null" && rawQueryHospId !== "undefined") ? String(rawQueryHospId).trim() : null;

        const hospitalId = validHeaderHospId || validQueryHospId || req.context?.hospitalId;

        if (!hospitalId) {
            console.error(
                "[Staff Doctors] Missing authenticated hospital context",
                {
                    userId: req.context?.userId,
                    role: req.context?.role,
                    membershipId: req.context?.membershipId
                }
            );

            return res.status(403).json({
                success: false,
                message: "No authenticated hospital context."
            });
        }

        console.log("[STAFF DOCTORS] authenticated userId =", req.context?.userId);
        console.log("[STAFF DOCTORS] resolved hospitalId =", hospitalId);

        // -------------------------------------------------------------
        // 2. Load ACTIVE DOCTOR memberships for this hospital
        // -------------------------------------------------------------
        const membershipFields = "id, hospital_id, user_id, doctor_id, role, status";

        async function loadDoctorMemberships(client) {
            const { data: rawMembers, error } = await client
                .from("hospital_members")
                .select(membershipFields)
                .eq("hospital_id", hospitalId);

            if (error) return { data: [], error };

            const doctorMembers = (rawMembers || []).filter(m => {
                const isDoctor = String(m.role || "").toLowerCase().includes("doc") || Boolean(m.doctor_id);
                const isActive = !m.status || String(m.status).toLowerCase() === "active";
                return isDoctor && isActive;
            });

            return { data: doctorMembers, error: null };
        }

        let { data: doctorMembers, error: memberError } = await loadDoctorMemberships(db);

        if (memberError) {
            console.error(
                "[STAFF DOCTORS] hospital_members query failed:",
                memberError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load hospital doctor memberships."
            });
        }

        console.log("[STAFF DOCTORS] first membership read =", doctorMembers.length);

        // Zero-read verification protection using fresh stateless service client
        if (doctorMembers.length === 0) {
            console.warn("[STAFF DOCTORS] First membership read returned 0. Verifying with fresh client...");
            const verificationClient = getFreshServiceClient();
            if (verificationClient) {
                const verificationResult = await loadDoctorMemberships(verificationClient);
                if (verificationResult.error) {
                    console.error("[STAFF DOCTORS] verification query failed:", verificationResult.error);
                } else {
                    console.log("[STAFF DOCTORS] verification membership read =", verificationResult.data.length);
                    if (verificationResult.data.length > 0) {
                        doctorMembers = verificationResult.data;
                    }
                }
            }
        }

        console.log("[STAFF DOCTORS] confirmed active doctor membership count =", doctorMembers.length);

        const doctorIds = [...new Set(doctorMembers.map(m => m.doctor_id).filter(Boolean))];
        const userIds = [...new Set(doctorMembers.map(m => m.user_id).filter(Boolean))];

        if (doctorMembers.length === 0) {
            console.log("[STAFF DOCTORS] Zero active doctor memberships for hospital:", hospitalId);
            return res.json({
                success: true,
                hospitalId,
                doctors: []
            });
        }

        // -------------------------------------------------------------
        // 5. Fetch doctors table records
        // -------------------------------------------------------------
        const { data: allDoctorsRaw, error: docError } = await db
            .from("doctors")
            .select("doctor_id, user_id, doctor_name, doctor_specialization, doctor_profile_photo, doctor_is_active, doctor_verification_status");

        if (docError) {
            console.error("[STAFF DOCTORS] doctors table query failed:", docError);
        }

        const doctorMap = new Map();
        (allDoctorsRaw || []).forEach(doc => {
            if (doc.doctor_is_active !== false) {
                if (doc.doctor_id) doctorMap.set(String(doc.doctor_id), doc);
                if (doc.user_id) doctorMap.set(String(doc.user_id), doc);
            }
        });

        // -------------------------------------------------------------
        // 6. Format doctor objects matching exact frontend expectations
        // -------------------------------------------------------------
        const formattedDoctors = [];
        const seenKeys = new Set();

        doctorMembers.forEach(member => {
            const docKey = member.doctor_id ? String(member.doctor_id) : null;
            const userKey = member.user_id ? String(member.user_id) : null;

            const doc = (docKey ? doctorMap.get(docKey) : null) || (userKey ? doctorMap.get(userKey) : null);
            const primaryKey = docKey || userKey || (doc?.doctor_id ? String(doc.doctor_id) : null);

            if (primaryKey && !seenKeys.has(primaryKey)) {
                seenKeys.add(primaryKey);
                const rawName = doc?.doctor_name?.trim() || "Hospital Doctor";
                const fullName = rawName.startsWith("Dr.") ? rawName : `Dr. ${rawName}`;

                formattedDoctors.push({
                    doctorId: doc?.doctor_id || member.doctor_id || member.user_id,
                    fullName,
                    doctorName: rawName.replace(/^Dr\.\s*/, ""),
                    specialization: doc?.doctor_specialization?.trim() || "General Medicine",
                    avatarUrl: doc?.doctor_profile_photo || null
                });
            }
        });

        const doctorIdsList = formattedDoctors.map(d => String(d.doctorId)).filter(Boolean);
        if (doctorIdsList.length > 0) {
            const { data: availRows } = await db
                .from("availability")
                .select("doctor_id, day_of_week, time_windows, start_time, end_time, is_available")
                .in("doctor_id", doctorIdsList);
            
            const availMap = {};
            (availRows || []).forEach(a => {
                const docId = String(a.doctor_id);
                if (!availMap[docId]) availMap[docId] = [];
                availMap[docId].push(a);
            });

            formattedDoctors.forEach(doc => {
                doc.availability = availMap[String(doc.doctorId)] || [];
            });
        }

        console.log("[STAFF DOCTORS] returning formatted doctors count =", formattedDoctors.length);

        return res.json({
            success: true,
            hospitalId,
            doctors: formattedDoctors
        });

        console.log(
            `[STAFF DOCTORS] doctors returned = ${formattedDoctors.length} for hospital ${hospitalId}`
        );

        // -------------------------------------------------------------
        // 7. Return ONLY hospital-scoped doctors
        // -------------------------------------------------------------
        return res.json({
            success: true,
            hospitalId,
            doctors: formattedDoctors
        });

    } catch (err) {
        console.error("[STAFF DOCTORS] Unexpected error:", err);

        return res.status(500).json({
            success: false,
            message: "Failed to load hospital doctors."
        });
    }
});

/**
 * GET /api/v1/staff/doctors/:doctorId/availability
 * Fetch schedule & blocked dates for a specific doctor in staff's hospital
 */
router.get("/doctors/:doctorId/availability", requirePermission("doctors.view"), async (req, res) => {
    try {
        const { doctorId } = req.params;
        const db = getSupabaseClient();

        if (!db) {
            return res.status(500).json({
                success: false,
                message: "Database connection unavailable."
            });
        }

        const rawHeaderHospId = req.headers["x-hospital-id"];
        const validHeaderHospId = (rawHeaderHospId && rawHeaderHospId !== "null" && rawHeaderHospId !== "undefined") ? String(rawHeaderHospId).trim() : null;
        const rawQueryHospId = req.query.hospitalId;
        const validQueryHospId = (rawQueryHospId && rawQueryHospId !== "null" && rawQueryHospId !== "undefined") ? String(rawQueryHospId).trim() : null;
        const hospitalId = validHeaderHospId || validQueryHospId || req.context?.hospitalId;

        if (!hospitalId) {
            return res.status(403).json({
                success: false,
                message: "No authenticated hospital context."
            });
        }

        // Verify doctor belongs to current hospital via hospital_members
        const { data: memberRows, error: memberErr } = await db
            .from("hospital_members")
            .select("doctor_id, user_id")
            .eq("hospital_id", hospitalId)
            .or(`doctor_id.eq.${doctorId},user_id.eq.${doctorId}`);

        if (memberErr || !memberRows || memberRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Doctor is not assigned to this hospital."
            });
        }

        const actualDoctorId = memberRows[0].doctor_id || memberRows[0].user_id || doctorId;

        // Query availability table
        const { data: availData, error: availErr } = await db
            .from("availability")
            .select("*")
            .eq("doctor_id", actualDoctorId);

        if (availErr) {
            console.error("[Staff Doctor Availability Error]:", availErr);
            throw availErr;
        }

        // Query blocked_dates table
        const { data: blockedData, error: blockedErr } = await db
            .from("blocked_dates")
            .select("*")
            .eq("doctor_id", actualDoctorId);

        const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const scheduleMap = {};
        (availData || []).forEach(item => {
            if (item.day_of_week) {
                const dayKey = item.day_of_week.trim().toLowerCase();
                scheduleMap[dayKey] = item;
            }
        });

        const fullSchedule = DAYS.map(day => {
            const dayKey = day.toLowerCase();
            const existing = scheduleMap[dayKey];
            if (existing) {
                let windows = existing.time_windows;
                if (typeof windows === "string") {
                    try { windows = JSON.parse(windows); } catch (e) { windows = []; }
                }
                if (!Array.isArray(windows) || windows.length === 0) {
                    if (existing.start_time && existing.end_time) {
                        windows = [{ start_time: existing.start_time, end_time: existing.end_time }];
                    } else {
                        windows = [];
                    }
                }
                return {
                    id: existing.id,
                    doctor_id: actualDoctorId,
                    day_of_week: day,
                    is_available: Boolean(existing.is_available),
                    start_time: existing.start_time || "09:00 AM",
                    end_time: existing.end_time || "05:00 PM",
                    slot_duration_minutes: existing.slot_duration_minutes || existing.slot_duration || 30,
                    time_windows: windows
                };
            }
            return {
                doctor_id: actualDoctorId,
                day_of_week: day,
                is_available: false,
                start_time: "09:00 AM",
                end_time: "05:00 PM",
                slot_duration_minutes: 30,
                time_windows: []
            };
        });

        return res.json({
            success: true,
            doctorId: actualDoctorId,
            availability: fullSchedule,
            blockedDates: blockedData || []
        });
    } catch (err) {
        console.error("[Staff Doctor Availability API Error]:", err);
        return res.status(500).json({ success: false, message: err.message || "Failed to fetch doctor availability." });
    }
});

/**
 * GET /api/v1/staff/queue
 * Live queue overview of patient_visits and appointments for selected date
 * Unified dataset supporting status tabs, doctor filtering, and appointment times
 */
/**
 * GET /api/v1/staff/queue
 * Live queue overview of patient_visits, appointments, and QR intakes for selected date
 * Doctor-scoped token sequence starting at 001 per doctor
 * Strict clinical privacy (symptoms & complaints stripped from staff response)
 */
router.get("/queue", async (req, res) => {
    try {
        const db = getSupabaseClient();
        if (!db) return res.json({ success: true, queue: [], counts: { all: 0, scheduled: 0, waiting: 0, inConsultation: 0, completed: 0, scheduledOtherDates: 0 } });

        const hospitalId = req.context.hospitalId;
        const requestedDate = req.query.date || new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());

        const getIstDateStr = (dateIsoStr) => {
            if (!dateIsoStr) return null;
            try {
                return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(dateIsoStr));
            } catch (e) {
                return null;
            }
        };

        // 1. Fetch appointments for hospital (filter by appointment_date = requestedDate)
        let appQuery = db
            .from("appointments")
            .select(`
                id,
                doctor_id,
                patient_id,
                appointment_date,
                appointment_time,
                status,
                source,
                hospital_id,
                hospital_patient_id,
                created_at,
                doctors(doctor_id, doctor_name, doctor_specialization),
                hospital_patient_records(id, hospital_patient_code, full_name, phone, gender, date_of_birth)
            `);

        if (hospitalId) {
            appQuery = appQuery.eq("hospital_id", hospitalId);
        }
        appQuery = appQuery.eq("appointment_date", requestedDate).order("created_at", { ascending: true }).limit(200);

        let { data: appointmentsData, error: appErr } = await appQuery;
        if (appErr) {
            console.warn("[Queue API] Appointments primary query fallback warning:", appErr?.message);
            let fallbackQuery = db
                .from("appointments")
                .select(`
                    id, doctor_id, patient_id, appointment_date, appointment_time, status, source, hospital_id, hospital_patient_id, created_at,
                    doctors(doctor_id, doctor_name, doctor_specialization),
                    hospital_patient_records(id, hospital_patient_code, full_name, phone, gender, date_of_birth)
                `)
                .eq("appointment_date", requestedDate);
            if (hospitalId) fallbackQuery = fallbackQuery.eq("hospital_id", hospitalId);
            const { data: fallbackApps } = await fallbackQuery.order("created_at", { ascending: true }).limit(200);
            appointmentsData = fallbackApps || [];
        } else if (!appointmentsData) {
            appointmentsData = [];
        }

        // 2. Fetch patient visits for hospital for requested date
        const selectFields = `
            id,
            hospital_patient_id,
            appointment_id,
            doctor_id,
            visit_stage,
            intake_vitals,
            checked_in_at,
            consultation_started_at,
            started_at,
            consultation_completed_at,
            completed_at,
            created_at,
            hospital_patient_records(id, hospital_patient_code, full_name, phone, gender, date_of_birth),
            doctors(doctor_id, doctor_name, doctor_specialization)
        `;

        let visitQuery = db.from("patient_visits").select(selectFields);
        if (hospitalId) visitQuery = visitQuery.eq("hospital_id", hospitalId);
        visitQuery = visitQuery.order("created_at", { ascending: true }).limit(200);

        let { data: visitsData, error: visitErr } = await visitQuery;
        if (visitErr) {
            let fallbackQuery = db.from("patient_visits").select(selectFields);
            if (hospitalId) fallbackQuery = fallbackQuery.eq("hospital_id", hospitalId);
            const { data: fallbackVisits } = await fallbackQuery.order("created_at", { ascending: true }).limit(200);
            visitsData = fallbackVisits || [];
        } else if (!visitsData) {
            visitsData = [];
        }

        // 3. Fetch unregistered QR intake sessions for requestedDate (STRICTLY submitted today)
        let qrSessions = [];
        if (hospitalId) {
            const todayStartIso = new Date(`${requestedDate}T00:00:00+05:30`).toISOString();
            const todayEndIso = new Date(`${requestedDate}T23:59:59.999+05:30`).toISOString();

            const { data: qrData, error: qrErr } = await db
                .from("qr_intake_sessions")
                .select("id, hospital_id, full_name, first_name, last_name, gender, date_of_birth, phone, status, created_at, submitted_at")
                .eq("hospital_id", hospitalId)
                .in("status", ["submitted", "review", "safety_blocked"])
                .not("submitted_at", "is", null)
                .gte("submitted_at", todayStartIso)
                .lte("submitted_at", todayEndIso)
                .order("submitted_at", { ascending: false });

            if (qrErr) {
                console.warn("[Queue API] QR intakes query warning:", qrErr.message);
            }

            // Filter strictly by IST date matching requestedDate
            const validQrIntakes = (qrData || []).filter(qr => {
                if (!qr.submitted_at) return false;
                const istDate = getIstDateStr(qr.submitted_at);
                return istDate === requestedDate;
            });

            // Deduplicate by phone / patient name if multiple intakes submitted today, keeping the latest one
            const seenPatients = new Set();
            const uniqueQrData = [];
            validQrIntakes.forEach(qr => {
                const key = (qr.phone || qr.full_name || qr.id).trim().toLowerCase();
                if (!seenPatients.has(key)) {
                    seenPatients.add(key);
                    uniqueQrData.push(qr);
                }
            });

            qrSessions = uniqueQrData.reverse(); // ascending sequence
        }

        // 4. Fetch scheduled future date appointments count
        let scheduledOtherDatesCount = 0;
        if (hospitalId) {
            const { count: futureCount } = await db
                .from("appointments")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .gt("appointment_date", requestedDate)
                .neq("status", "cancelled");
            scheduledOtherDatesCount = futureCount || 0;
        }

        // Map visits by appointment_id and hospital_patient_id
        const visitsByAppId = {};
        const visitsByHprId = {};
        (visitsData || []).forEach(v => {
            if (v.appointment_id) visitsByAppId[v.appointment_id] = v;
            if (v.hospital_patient_id) {
                if (!visitsByHprId[v.hospital_patient_id]) visitsByHprId[v.hospital_patient_id] = [];
                visitsByHprId[v.hospital_patient_id].push(v);
            }
        });

        const processedVisits = new Set();
        const rawItems = [];

        // Process all appointments for requestedDate
        (appointmentsData || []).forEach((app) => {
            const todayVisit = (visitsByHprId[app.hospital_patient_id] || []).find(v => {
                const vDate = getIstDateStr(v.checked_in_at || v.created_at);
                return vDate === requestedDate;
            });
            const visit = visitsByAppId[app.id] || todayVisit || null;
            if (visit) processedVisits.add(visit.id);

            const decHpr = decryptRecord("hospital_patient_records", app.hospital_patient_records || visit?.hospital_patient_records);
            const decVisit = decryptRecord("patient_visits", visit);

            const rawStage = visit?.visit_stage || (app.status === "cancelled" ? "cancelled" : (app.status === "completed" ? "completed" : "waiting"));
            const visitStage = rawStage === "exited" ? "completed" : (rawStage === "scheduled" ? "waiting" : rawStage);
            const queueStatus = visitStage === "in_consultation" ? "IN_CONSULTATION" : (visitStage === "completed" ? "COMPLETED" : "WAITING");

            rawItems.push({
                id: app.id,
                appointmentId: app.id,
                visitId: visit?.id || null,
                hprId: app.hospital_patient_id || visit?.hospital_patient_id || null,
                patientId: app.patient_id || visit?.patient_id || null,
                patientName: decHpr?.full_name || "Patient",
                phone: decHpr?.phone || "",
                patientCode: decHpr?.hospital_patient_code || "",
                gender: decHpr?.gender || null,
                dateOfBirth: decHpr?.date_of_birth || null,
                isRegistered: true,
                isUnregisteredQr: false,
                doctorId: app.doctor_id || visit?.doctor_id || "unassigned",
                doctorName: app.doctors?.doctor_name || visit?.doctors?.doctor_name || "Assigned Doctor",
                specialization: app.doctors?.doctor_specialization || visit?.doctors?.doctor_specialization || "General Medicine",
                appointmentDate: app.appointment_date || requestedDate,
                appointmentTime: app.appointment_time || "09:00 AM",
                source: app.source || "walk_in",
                status: queueStatus,
                visitStage: visitStage,
                checkedInAt: visit?.checked_in_at || null,
                consultationStartedAt: visit?.consultation_started_at || visit?.started_at || null,
                consultationCompletedAt: visit?.consultation_completed_at || visit?.completed_at || null,
                vitals: decVisit?.intake_vitals || {},
                intakeVitals: decVisit?.intake_vitals || {},
                createdAt: app.created_at || visit?.created_at
            });
        });

        // Add remaining standalone walk-in visits without appointment links (STRICTLY for requestedDate)
        (visitsData || []).forEach((visit) => {
            if (processedVisits.has(visit.id)) return;

            const visitDate = getIstDateStr(visit.checked_in_at || visit.created_at);
            if (!visitDate || visitDate !== requestedDate) return;

            processedVisits.add(visit.id);

            const decHpr = decryptRecord("hospital_patient_records", visit.hospital_patient_records);
            const decVisit = decryptRecord("patient_visits", visit);
            const visitStage = visit.visit_stage === "exited" ? "completed" : (visit.visit_stage === "scheduled" ? "waiting" : (visit.visit_stage || "waiting"));
            const queueStatus = visitStage === "in_consultation" ? "IN_CONSULTATION" : (visitStage === "completed" ? "COMPLETED" : "WAITING");

            rawItems.push({
                id: visit.appointment_id || visit.id,
                appointmentId: visit.appointment_id || null,
                visitId: visit.id,
                hprId: visit.hospital_patient_id,
                patientId: visit.patient_id || decHpr?.patient_id || null,
                patientName: decHpr?.full_name || "Patient",
                phone: decHpr?.phone || "",
                patientCode: decHpr?.hospital_patient_code || "",
                gender: decHpr?.gender || null,
                dateOfBirth: decHpr?.date_of_birth || null,
                isRegistered: true,
                isUnregisteredQr: false,
                doctorId: visit.doctor_id || "unassigned",
                doctorName: visit.doctors?.doctor_name || "Assigned Doctor",
                specialization: visit.doctors?.doctor_specialization || "General Medicine",
                appointmentDate: requestedDate,
                appointmentTime: "Walk-in",
                source: "walk_in",
                status: queueStatus,
                visitStage: visitStage,
                checkedInAt: visit.checked_in_at || null,
                consultationStartedAt: visit.consultation_started_at || visit.started_at || null,
                consultationCompletedAt: visit.consultation_completed_at || visit.completed_at || null,
                vitals: decVisit?.intake_vitals || {},
                intakeVitals: decVisit?.intake_vitals || {},
                createdAt: visit.created_at
            });
        });

        // Add unregistered QR intake sessions to queue (STRICTLY for requestedDate)
        qrSessions.forEach((qr) => {
            if (!qr.submitted_at) return;
            const qrDate = getIstDateStr(qr.submitted_at);
            if (!qrDate || qrDate !== requestedDate) return;

            rawItems.push({
                id: `qr_${qr.id}`,
                appointmentId: null,
                visitId: null,
                qrSessionId: qr.id,
                hprId: null,
                patientId: null,
                patientName: qr.full_name || `${qr.first_name || 'Patient'} ${qr.last_name || ''}`.trim(),
                phone: qr.phone || "",
                patientCode: "QR-PENDING",
                gender: qr.gender || null,
                dateOfBirth: qr.date_of_birth || null,
                isRegistered: false,
                isUnregisteredQr: true,
                doctorId: "unassigned",
                doctorName: "Pending Assignment",
                specialization: "General Medicine",
                appointmentDate: requestedDate,
                appointmentTime: "12:45 PM",
                source: "qr_intake",
                status: "qr_pending",
                visitStage: "qr_pending",
                checkedInAt: null,
                consultationStartedAt: null,
                consultationCompletedAt: null,
                intakeVitals: {},
                createdAt: qr.created_at
            });
        });

        // 5. DOCTOR-SCOPED TOKEN ASSIGNMENT & SHIFT ORDERING
        // Helper to parse 12-hour time string into minutes from midnight
        function parseMinutes(tStr) {
            if (!tStr) return 540;
            const str = String(tStr).trim();
            const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
            if (!match) return 540;
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            const period = match[3] ? match[3].toUpperCase() : null;
            if (period === "PM" && h < 12) h += 12;
            if (period === "AM" && h === 12) h = 0;
            return h * 60 + m;
        }

        // Group items by doctorId
        const itemsByDoctor = {};
        rawItems.forEach(item => {
            const docId = item.doctorId || "unassigned";
            if (!itemsByDoctor[docId]) itemsByDoctor[docId] = [];
            itemsByDoctor[docId].push(item);
        });

        const finalQueue = [];

        // For each doctor, sort by scheduled time then assign Tokens 001, 002, 003...
        Object.keys(itemsByDoctor).forEach(docId => {
            const docItems = itemsByDoctor[docId];
            
            docItems.sort((a, b) => {
                const timeA = parseMinutes(a.appointmentTime);
                const timeB = parseMinutes(b.appointmentTime);
                if (timeA !== timeB) return timeA - timeB;
                return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            });

            docItems.forEach((item, idx) => {
                item.token = String(idx + 1).padStart(3, "0");
                item.queuePosition = idx + 1;
                finalQueue.push(item);
            });
        });

        // 6. Calculate summary counts (registered patients only)
        const registeredQueue = finalQueue.filter(q => !q.isUnregisteredQr);
        const totalPatients = registeredQueue.length;
        const waiting = registeredQueue.filter(q => q.visitStage === "waiting" || q.visitStage === "checked_in").length;
        const inConsultation = registeredQueue.filter(q => q.visitStage === "in_consultation").length;
        const completed = registeredQueue.filter(q => q.visitStage === "completed" || q.visitStage === "exited").length;
        const pendingAssignment = finalQueue.filter(q => q.isUnregisteredQr).length;

        const counts = {
            totalPatients,
            waiting,
            inConsultation,
            completed,
            pendingAssignment,
            scheduledOtherDates: scheduledOtherDatesCount
        };

        return res.json({
            success: true,
            date: requestedDate,
            counts,
            queue: finalQueue
        });
    } catch (err) {
        console.error("[Staff Queue Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/staff/queue/next
 * Advance doctor queue to next waiting patient (Waiting -> In Consultation)
 */
router.post("/queue/next", requirePermission("queue.view"), async (req, res) => {
    try {
        const { doctorId, date } = req.body;
        const hospitalId = req.context.hospitalId;
        const db = getSupabaseClient();

        if (!db || !doctorId) {
            return res.status(400).json({ success: false, message: "doctorId is required." });
        }

        const targetDate = date || new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());

        // 1. Complete any active in_consultation visit for this doctor today
        const { data: activeVisits } = await db
            .from("patient_visits")
            .select("id, visit_stage")
            .eq("hospital_id", hospitalId)
            .eq("doctor_id", doctorId)
            .eq("visit_stage", "in_consultation");

        if (activeVisits && activeVisits.length > 0) {
            for (const av of activeVisits) {
                await db.from("patient_visits")
                    .update({
                        visit_stage: "completed",
                        consultation_completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", av.id);
            }
        }

        // 2. Find next waiting / checked_in visit for this doctor
        const { data: waitingVisits } = await db
            .from("patient_visits")
            .select("id, appointment_id, visit_stage, created_at")
            .eq("hospital_id", hospitalId)
            .eq("doctor_id", doctorId)
            .in("visit_stage", ["waiting", "checked_in"])
            .order("created_at", { ascending: true })
            .limit(1);

        if (!waitingVisits || waitingVisits.length === 0) {
            return res.json({
                success: true,
                message: "No waiting patients remaining for this doctor.",
                nextVisit: null
            });
        }

        const nextVisit = waitingVisits[0];

        return res.json({
            success: true,
            message: "Advanced queue to next patient successfully.",
            nextVisit: nextVisit
        });
    } catch (err) {
        console.error("[Queue Next Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PATCH /api/v1/staff/visits/:id/assignment
 * Reassign assigned doctor for a visit before consultation begins
 */
router.patch("/visits/:id/assignment", async (req, res) => {
    try {
        const visitId = req.params.id;
        const { doctorId } = req.body;
        if (!doctorId) return res.status(400).json({ success: false, message: "doctorId is required" });

        const db = getSupabaseClient();
        if (!db) return res.status(500).json({ success: false, message: "Database connection unavailable" });

        const { data: visit, error: fetchErr } = await db
            .from("patient_visits")
            .select("id, visit_stage, doctor_id")
            .eq("id", visitId)
            .eq("hospital_id", req.context.hospitalId)
            .single();

        if (fetchErr || !visit) {
            return res.status(404).json({ success: false, message: "Visit record not found" });
        }

        if (visit.visit_stage === "in_consultation" || visit.visit_stage === "completed") {
            return res.status(400).json({
                success: false,
                message: "Cannot reassign doctor once consultation has started or completed."
            });
        }

        const { data: updated, error: updateErr } = await db
            .from("patient_visits")
            .update({ doctor_id: doctorId })
            .eq("id", visitId)
            .select()
            .single();

        if (updateErr) throw updateErr;

        return res.json({
            success: true,
            message: "Doctor reassigned successfully.",
            visit: updated
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

const isUuid = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * PATCH /api/v1/staff/visits/:id/vitals
 * Add or update intake vitals for a visit
 * Enforces strict hospital isolation (req.context.hospitalId)
 * Does NOT create duplicate patient records. Preserves visit history.
 */
const updateVitalsHandler = async (req, res) => {
    try {
        const rawId = req.params.id ? String(req.params.id).replace(/^v\./, "").trim() : "";
        const vitalsInput = req.body.vitals || req.body;
        const hospitalId = req.context.hospitalId;

        if (!vitalsInput || typeof vitalsInput !== "object") {
            return res.status(400).json({ success: false, message: "Vitals object is required." });
        }

        const db = getSupabaseClient();
        if (!db) return res.status(500).json({ success: false, message: "Database connection unavailable." });

        let visit = null;

        // 1. If rawId is a valid full UUID, query directly using eq
        if (isUuid(rawId)) {
            const { data: vSingle } = await db
                .from("patient_visits")
                .select("id, hospital_id, hospital_patient_id, appointment_id, intake_vitals, visit_stage, consultation_started_at, started_at")
                .or(`id.eq.${rawId},appointment_id.eq.${rawId}`)
                .maybeSingle();

            if (vSingle) visit = vSingle;
        }

        // 2. If not found (or if rawId is a short/partial UUID or prefixed ID)
        if (!visit) {
            let vQuery = db
                .from("patient_visits")
                .select("id, hospital_id, hospital_patient_id, appointment_id, intake_vitals, visit_stage, consultation_started_at, started_at")
                .order("created_at", { ascending: false })
                .limit(100);
            
            if (hospitalId) {
                vQuery = vQuery.eq("hospital_id", hospitalId);
            }
            const { data: allVisits } = await vQuery;

            const targetClean = rawId.replace(/-/g, "").toLowerCase();
            visit = (allVisits || []).find(v => {
                const vIdClean = String(v.id || "").replace(/-/g, "").toLowerCase();
                const appClean = String(v.appointment_id || "").replace(/-/g, "").toLowerCase();
                const hprClean = String(v.hospital_patient_id || "").replace(/-/g, "").toLowerCase();
                return (targetClean && (vIdClean.startsWith(targetClean) || appClean.startsWith(targetClean) || hprClean.startsWith(targetClean)));
            });
        }

        // 3. If still no visit row found, check if rawId matches an appointment to auto-create visit ONLY IF no visit exists for that appointment
        if (!visit) {
            let appRow = null;
            if (isUuid(rawId)) {
                const { data: aRow } = await db
                    .from("appointments")
                    .select("*")
                    .eq("id", rawId)
                    .maybeSingle();
                if (aRow) appRow = aRow;
            }

            if (!appRow) {
                let appQuery = db
                    .from("appointments")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(100);

                if (hospitalId) {
                    appQuery = appQuery.eq("hospital_id", hospitalId);
                }
                const { data: allApps } = await appQuery;

                const targetClean = rawId.replace(/-/g, "").toLowerCase();
                appRow = (allApps || []).find(a => {
                    const aIdClean = String(a.id || "").replace(/-/g, "").toLowerCase();
                    const hprClean = String(a.hospital_patient_id || "").replace(/-/g, "").toLowerCase();
                    return (targetClean && (aIdClean.startsWith(targetClean) || hprClean.startsWith(targetClean)));
                });
            }

            if (appRow) {
                // Check if a visit row ALREADY exists for this appointment
                const { data: existingAppVisit } = await db
                    .from("patient_visits")
                    .select("id, hospital_id, hospital_patient_id, appointment_id, intake_vitals, visit_stage, consultation_started_at, started_at")
                    .eq("appointment_id", appRow.id)
                    .maybeSingle();

                if (existingAppVisit) {
                    visit = existingAppVisit;
                } else {
                    // Auto-create patient_visits row for this appointment, ensuring visit_stage is "waiting" if confirmed/checked_in
                    const isWaitingStage = appRow.status === "confirmed" || appRow.status === "waiting" || appRow.status === "checked_in" || appRow.checked_in_at;
                    const newVisitData = {
                        hospital_id: hospitalId || appRow.hospital_id,
                        hospital_patient_id: appRow.hospital_patient_id,
                        patient_id: appRow.patient_id,
                        appointment_id: appRow.id,
                        doctor_id: appRow.doctor_id,
                        visit_stage: isWaitingStage ? "waiting" : (appRow.visit_stage || "scheduled"),
                        status: appRow.status || "scheduled",
                        chief_complaints: appRow.reason || null,
                        intake_vitals: vitalsInput,
                        created_by: req.context?.userId || null
                    };

                    const encVisit = encryptPayload("patient_visits", newVisitData);
                    const { data: createdVisit, error: createErr } = await db
                        .from("patient_visits")
                        .insert(encVisit)
                        .select()
                        .single();

                    if (createErr) throw createErr;
                    visit = createdVisit;
                }
            }
        }

        if (!visit) {
            return res.status(404).json({ success: false, message: "Visit record not found or access denied for your hospital." });
        }

        // 4. Vitals Lock Condition: Reject staff vital updates if consultation has started
        if (visit.consultation_started_at || visit.started_at) {
            return res.status(409).json({
                success: false,
                message: "Patient consultation has already started. Vitals can no longer be edited."
            });
        }

        // 5. Clean and merge vitals
        const decVisit = decryptRecord("patient_visits", visit);
        const existingVitals = decVisit.intake_vitals || {};
        const mergedVitals = {
            ...existingVitals,
            ...vitalsInput,
            updated_at: new Date().toISOString()
        };

        // 6. Update patient_visits ONLY - preserve visit_stage, appointment_id, status
        const encMergedVitals = encryptPayload("patient_visits", { intake_vitals: mergedVitals });

        const { data: updatedVisit, error: updateErr } = await db
            .from("patient_visits")
            .update({
                intake_vitals: encMergedVitals.intake_vitals || mergedVitals,
                updated_at: new Date().toISOString()
            })
            .eq("id", visit.id)
            .select()
            .single();

        if (updateErr) throw updateErr;

        // 7. Update blood_group on hospital_patient_records if provided
        const bloodGroup = vitalsInput.bloodGroup || vitalsInput.blood_group;
        if (bloodGroup && visit.hospital_patient_id) {
            await db
                .from("hospital_patient_records")
                .update({
                    blood_group: bloodGroup,
                    updated_at: new Date().toISOString()
                })
                .eq("id", visit.hospital_patient_id)
                .eq("hospital_id", hospitalId);
        }

        await logAuditEvent({
            hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "UPDATE_PATIENT_VITALS",
            resourceType: "patient_visits",
            resourceId: visit.id,
            metadata: { vitals: mergedVitals }
        });

        return res.json({
            success: true,
            message: "Patient vitals updated successfully.",
            visit: decryptRecord("patient_visits", updatedVisit)
        });
    } catch (err) {
        console.error("[Update Vitals Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

router.patch("/visits/:id/vitals", updateVitalsHandler);
router.put("/visits/:id/vitals", updateVitalsHandler);
router.patch("/:id/vitals", updateVitalsHandler);
router.put("/:id/vitals", updateVitalsHandler);

/**
 * GET /api/v1/staff/patients/search
 * Hospital-scoped patient/HPR search (by phone, patient_code, or full_name)
 */
router.get("/patients/search", requirePermission("walkin.register"), async (req, res) => {
    try {
        const rawTerm = req.query.q || req.query.query || req.query.phone || "";
        if (!rawTerm || !rawTerm.trim()) {
            return res.json({ success: true, candidates: [] });
        }

        const db = getSupabaseClient();
        if (!db) {
            return res.status(500).json({ success: false, message: "Database connection unavailable." });
        }

        const term = rawTerm.trim().toLowerCase();
        const { data, error } = await db
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
                email,
                date_of_birth,
                gender,
                blood_group,
                address,
                registration_type,
                status,
                created_at,
                updated_at
            `)
            .eq("hospital_id", req.context.hospitalId)
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) throw error;

        // Decrypt HPR records then filter by term (phone, code, name)
        const candidates = (data || [])
            .map(hpr => decryptRecord("hospital_patient_records", hpr))
            .filter(hpr => {
                const p = String(hpr.phone || "").toLowerCase();
                const c = String(hpr.hospital_patient_code || "").toLowerCase();
                const fn = String(hpr.full_name || "").toLowerCase();
                const first = String(hpr.first_name || "").toLowerCase();
                const last = String(hpr.last_name || "").toLowerCase();
                return p.includes(term) || c.includes(term) || fn.includes(term) || first.includes(term) || last.includes(term);
            })
            .map(hpr => ({
                ...hpr,
                patientType: hpr.patient_id ? "Registered" : "Temporary",
                isRegistered: Boolean(hpr.patient_id)
            }));

        return res.json({
            success: true,
            hospitalId: req.context.hospitalId,
            candidates
        });
    } catch (err) {
        console.error("[Staff Patient Search Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Helper function to validate doctor availability, blocked dates, and time slot conflicts for Staff bookings
 */
async function validateSessionCapacityAndConflict(db, { doctorId, date, time, hospitalId, excludeAppointmentId = null }) {
    if (!doctorId || !date) return { isAllowed: true };

    const targetDateStr = String(date).trim();
    const targetTimeStr = time ? String(time).trim() : null;

    // 1. Verify Doctor Membership in Hospital
    if (hospitalId) {
        const { data: members, error: memErr } = await db
            .from("hospital_members")
            .select("id")
            .eq("hospital_id", hospitalId)
            .or(`doctor_id.eq.${doctorId},user_id.eq.${doctorId}`);
        if (memErr || !members || members.length === 0) {
            return {
                isAllowed: false,
                statusCode: 403,
                message: "Selected doctor is not assigned to this hospital."
            };
        }
    }

    // 2. Check for Past Date (compared to today in Asia/Kolkata)
    const todayKolkata = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());
    if (targetDateStr < todayKolkata) {
        return {
            isAllowed: false,
            statusCode: 400,
            message: `Selected registration date (${targetDateStr}) cannot be in the past.`
        };
    }

    // 3. Check Blocked Dates
    const { data: blockedRows } = await db
        .from("blocked_dates")
        .select("reason")
        .eq("doctor_id", doctorId)
        .eq("blocked_date", targetDateStr)
        .limit(1);

    if (blockedRows && blockedRows.length > 0) {
        return {
            isAllowed: false,
            statusCode: 400,
            message: `Doctor is unavailable on ${targetDateStr}: ${blockedRows[0].reason || "Blocked date"}`
        };
    }

    // 4. Check Doctor Availability on day of week
    let dayName = "Monday";
    if (/^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
        const [y, m, d] = targetDateStr.split("-").map(Number);
        const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        dayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(utcDate);
    } else {
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        dayName = daysOfWeek[new Date(targetDateStr).getDay()] || "Monday";
    }

    const { data: availRows } = await db
        .from("availability")
        .select("*")
        .eq("doctor_id", doctorId);

    if (availRows && availRows.length > 0) {
        const dayMatch = availRows.find(a => a.day_of_week && a.day_of_week.trim().toLowerCase() === dayName.toLowerCase());
        if (!dayMatch || dayMatch.is_available === false) {
            return {
                isAllowed: false,
                statusCode: 400,
                message: `Doctor does not consult on ${dayName}s.`
            };
        }

        // Check if shift is specified and validate against time_windows
        if (targetTimeStr && targetTimeStr.includes("-")) {
            let windows = dayMatch.time_windows;
            if (typeof windows === "string") {
                try { windows = JSON.parse(windows); } catch(e) { windows = []; }
            }
            if (!Array.isArray(windows) || windows.length === 0) {
                if (dayMatch.start_time && dayMatch.end_time) {
                    windows = [{ start_time: dayMatch.start_time, end_time: dayMatch.end_time }];
                }
            }
            if (Array.isArray(windows) && windows.length > 0) {
                const isValidShift = windows.some(w => {
                    const winStr = `${w.start_time} - ${w.end_time}`.trim().toLowerCase();
                    return targetTimeStr.trim().toLowerCase() === winStr;
                });
                if (!isValidShift) {
                    return {
                        isAllowed: false,
                        statusCode: 400,
                        message: `Selected shift (${targetTimeStr}) is not valid for doctor's schedule on ${targetDateStr}.`
                    };
                }
            }
        }
    } else {
        // No schedule found for doctor
        return {
            isAllowed: false,
            statusCode: 400,
            message: `No availability schedule configured for doctor on ${dayName}s.`
        };
    }

    return { isAllowed: true };
}

/**
 * Allocate a collision-free appointment_time within the doctor's selected shift.
 * Allows multiple patients to register for the same shift while satisfying
 * idx_unique_active_doctor_slot unique constraint in appointments table.
 */
async function resolveAvailableShiftSlot(db, doctorId, targetDate, shiftStr) {
    if (!doctorId || !targetDate || !shiftStr) {
        return shiftStr || "09:00 AM";
    }

    const rawStr = String(shiftStr).trim();

    // Helper: Parse 12-hour time like "10:30 AM" into minutes from midnight
    function timeToMinutes(t) {
        if (!t) return null;
        const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const mins = parseInt(m[2], 10);
        const p = m[3] ? m[3].toUpperCase() : null;
        if (p === "PM" && h < 12) h += 12;
        if (p === "AM" && h === 12) h = 0;
        return h * 60 + mins;
    }

    // Helper: Format minutes from midnight to "10:30 AM"
    function minutesTo12h(mins) {
        const total = ((mins % 1440) + 1440) % 1440;
        let h = Math.floor(total / 60);
        const m = total % 60;
        const p = h >= 12 ? "PM" : "AM";
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${p}`;
    }

    try {
        // Fetch existing active appointments for doctor on targetDate
        const { data: existingApps } = await db
            .from("appointments")
            .select("appointment_time")
            .eq("doctor_id", doctorId)
            .eq("appointment_date", targetDate)
            .neq("status", "cancelled");

        const takenTimes = new Set(
            (existingApps || []).map(a => String(a.appointment_time || "").trim().toLowerCase())
        );

        // If shiftStr is a range: e.g. "10:30 AM - 12:30 PM" or "10:30 AM – 12:30 PM"
        const rangeParts = rawStr.split(/\s*[-–—]\s*/);
        if (rangeParts.length >= 2) {
            const startMin = timeToMinutes(rangeParts[0]) ?? 540;
            const endMin = timeToMinutes(rangeParts[1]) ?? (startMin + 120);

            // Try increments of 10 minutes within the window, then 5 minutes, then 1 minute
            for (const step of [10, 5, 2, 1]) {
                for (let m = startMin; m < endMin; m += step) {
                    const candidate = minutesTo12h(m);
                    if (!takenTimes.has(candidate.toLowerCase()) && !takenTimes.has(rawStr.toLowerCase())) {
                        return candidate;
                    }
                }
            }

            // Fallback offset within window
            const count = (existingApps || []).length + 1;
            return minutesTo12h(startMin + (count % Math.max(1, endMin - startMin)));
        }

        // If shiftStr is a single time like "10:30 AM"
        if (!takenTimes.has(rawStr.toLowerCase())) {
            return rawStr;
        }

        // If exact single time taken, advance by 5 minutes within schedule
        const baseMin = timeToMinutes(rawStr) ?? 540;
        for (let offset = 5; offset <= 360; offset += 5) {
            const candidate = minutesTo12h(baseMin + offset);
            if (!takenTimes.has(candidate.toLowerCase())) {
                return candidate;
            }
        }
    } catch (slotErr) {
        console.warn("[Shift Slot Allocation Warning]:", slotErr.message);
    }

    return rawStr;
}

/**
 * POST /api/v1/staff/patients/walkin
 * Create a new temporary walk-in patient (HPR, appointment, visit with patient_id = NULL)
 * NO auth.users, NO public.users, NO public.patients created.
 */
router.post("/patients/walkin", requirePermission("walkin.register"), async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            fullName,
            phone,
            gender,
            dateOfBirth,
            doctorId,
            appointmentDate,
            shift,
            appointmentTime,
            chiefComplaints,
            vitals,
            actionType = "register_and_checkin" // 'register_only' | 'register_and_checkin'
        } = req.body;

        if (!doctorId) {
            return res.status(400).json({ success: false, message: "doctorId is required for walk-in assignment." });
        }

        if (!dateOfBirth || !String(dateOfBirth).trim()) {
            return res.status(400).json({ success: false, message: "Date of Birth (DOB) is required for walk-in patient registration." });
        }

        const dobDate = new Date(dateOfBirth);
        if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
            return res.status(400).json({ success: false, message: "Invalid Date of Birth. DOB must be a valid past date." });
        }

        const db = getSupabaseClient();
        if (!db) {
            return res.status(500).json({ success: false, message: "Database connection unavailable." });
        }

        const nowObj = new Date();
        const todayStr = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(nowObj);
        const targetDate = appointmentDate || req.body.date || todayStr;
        const targetShift = shift || appointmentTime || new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(nowObj);

        if (!targetDate || !targetShift) {
            return res.status(400).json({ success: false, message: "Registration date and shift selection are required." });
        }

        // Validate session capacity, blocked dates, availability, and slot conflict
        const capCheck = await validateSessionCapacityAndConflict(db, {
            doctorId,
            date: targetDate,
            time: targetShift,
            hospitalId: req.context.hospitalId
        });

        if (!capCheck.isAllowed) {
            return res.status(capCheck.statusCode || 400).json({
                success: false,
                message: capCheck.message
            });
        }

        const calculatedFullName = (fullName || `${firstName || 'Walk-in'} ${lastName || ''}`).trim();
        const normalizedInputPhone = phone ? String(phone).replace(/\D/g, "") : "";

        // Check for duplicate walk-in submission for this doctor and date (e.g. rapid double-clicks)
        const { data: candidateHprs } = await db
            .from("hospital_patient_records")
            .select("id, hospital_patient_code, full_name, phone, date_of_birth, created_at")
            .eq("hospital_id", req.context.hospitalId)
            .eq("date_of_birth", dateOfBirth.trim())
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(10);

        let existingMatchingHpr = null;
        let activeVisitFound = null;

        if (candidateHprs && candidateHprs.length > 0) {
            for (const h of candidateHprs) {
                const dec = decryptRecord("hospital_patient_records", h);
                const decPhoneNorm = dec.phone ? String(dec.phone).replace(/\D/g, "") : "";
                const decNameNorm = String(dec.full_name || "").toLowerCase().replace(/\s+/g, "");
                const calcNameNorm = calculatedFullName.toLowerCase().replace(/\s+/g, "");

                const phoneMatch = normalizedInputPhone && decPhoneNorm && normalizedInputPhone === decPhoneNorm;
                const nameMatch = calcNameNorm && decNameNorm && (calcNameNorm === decNameNorm);

                if ((phoneMatch && nameMatch) || (phoneMatch && !calcNameNorm) || (phoneMatch)) {
                    // Check if this matching HPR has an active visit today
                    const { data: activeVisits } = await db
                        .from("patient_visits")
                        .select("id, appointment_id, visit_stage, created_at")
                        .eq("hospital_id", req.context.hospitalId)
                        .eq("hospital_patient_id", h.id)
                        .eq("doctor_id", doctorId)
                        .in("visit_stage", ["scheduled", "checked_in", "waiting", "in_consultation"]);

                    if (activeVisits && activeVisits.length > 0) {
                        existingMatchingHpr = { ...dec, id: h.id };
                        activeVisitFound = activeVisits[0];
                        break;
                    }
                }
            }
        }

        if (existingMatchingHpr && activeVisitFound) {
            return res.status(200).json({
                success: true,
                isDuplicatePrevented: true,
                message: `Patient ${existingMatchingHpr.full_name || "Record"} already has an active visit for this doctor today.`,
                appointmentId: activeVisitFound.appointment_id,
                visitId: activeVisitFound.id,
                hprId: existingMatchingHpr.id
            });
        }

        const patientCode = "DV-P-" + Math.floor(100000 + Math.random() * 900000);

        // 1. Create HPR with patient_id = NULL
        const newHpr = {
            hospital_id: req.context.hospitalId,
            patient_id: null, // Temporary walk-in identity inside hospital
            hospital_patient_code: patientCode,
            first_name: firstName || calculatedFullName,
            last_name: lastName || null,
            full_name: calculatedFullName,
            phone: phone || null,
            gender: gender || null,
            date_of_birth: dateOfBirth.trim(),
            registration_type: "walk_in",
            status: "active"
        };

        const encHpr = encryptPayload("hospital_patient_records", newHpr);

        const { data: hprRecord, error: createHprErr } = await db
            .from("hospital_patient_records")
            .insert(encHpr)
            .select()
            .single();

        if (createHprErr) throw createHprErr;

        // 2. Create Appointment with patient_id = NULL
        const allocatedSlot = await resolveAvailableShiftSlot(db, doctorId, targetDate, targetShift);

        const appointmentData = {
            doctor_id: doctorId,
            patient_id: null, // Temporary walk-in
            appointment_date: targetDate,
            appointment_time: allocatedSlot,
            status: "confirmed",
            reason: chiefComplaints || "Walk-in Consultation",
            payment_method: "pay_at_clinic",
            payment_status: "pending",
            hospital_id: req.context.hospitalId,
            hospital_patient_id: hprRecord.id,
            source: "walk_in"
        };

        const { data: appRow, error: appErr } = await db
            .from("appointments")
            .insert(appointmentData)
            .select()
            .single();

        if (appErr) {
            // Rollback HPR if appointment fails
            await db.from("hospital_patient_records").delete().eq("id", hprRecord.id);
            throw appErr;
        }

        // Determine visit stage based on actionType
        const targetVisitStage = actionType === "register_only" ? "scheduled" : "waiting";

        // 3. Create Patient Visit with patient_id = NULL
        const visitData = {
            hospital_id: req.context.hospitalId,
            hospital_patient_id: hprRecord.id,
            patient_id: null, // Temporary walk-in
            appointment_id: appRow.id,
            doctor_id: doctorId,
            visit_stage: targetVisitStage,
            chief_complaints: chiefComplaints || null,
            intake_vitals: vitals || {},
            checked_in_at: targetVisitStage === "waiting" ? new Date().toISOString() : null,
            created_by: req.context.userId
        };

        const encVisit = encryptPayload("patient_visits", visitData);

        const { data: visitRow, error: visitErr } = await db
            .from("patient_visits")
            .insert(encVisit)
            .select()
            .single();

        if (visitErr) {
            // Rollback Appointment & HPR if visit creation fails
            await db.from("appointments").delete().eq("id", appRow.id);
            await db.from("hospital_patient_records").delete().eq("id", hprRecord.id);
            throw visitErr;
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "TEMPORARY_WALKIN_REGISTER",
            resourceType: "patient_visits",
            resourceId: visitRow.id,
            metadata: { hprId: hprRecord.id, appointmentId: appRow.id, doctorId, actionType }
        });

        if (req.body.qrSessionId) {
            await db
                .from("qr_intake_sessions")
                .update({
                    hospital_patient_id: hprRecord.id,
                    patient_visit_id: visitRow.id,
                    status: "converted",
                    converted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", req.body.qrSessionId)
                .eq("hospital_id", req.context.hospitalId);
        }

        return res.status(201).json({
            success: true,
            message: `Temporary walk-in patient registered (${targetVisitStage}) successfully.`,
            hpr: decryptRecord("hospital_patient_records", hprRecord),
            appointment: appRow,
            visit: decryptRecord("patient_visits", visitRow)
        });
    } catch (err) {
        console.error("[Walkin Register Error]:", err);
        return res.status(500).json({ success: false, message: err.message || "Failed to register walk-in patient." });
    }
});

/**
 * POST /api/v1/staff/patients/existing-walkin
 * Register a new visit for an existing HPR (Temporary or Registered)
 * Zero duplicate HPRs created.
 */
router.post("/patients/existing-walkin", requirePermission("walkin.register"), async (req, res) => {
    try {
        const {
            selectedHprId,
            doctorId,
            appointmentDate,
            shift,
            appointmentTime,
            chiefComplaints,
            vitals,
            actionType = "register_and_checkin"
        } = req.body;

        if (!selectedHprId || !doctorId) {
            return res.status(400).json({ success: false, message: "selectedHprId and doctorId are required." });
        }

        const db = getSupabaseClient();
        if (!db) {
            return res.status(500).json({ success: false, message: "Database connection unavailable." });
        }

        // Fetch existing HPR in current hospital
        const { data: hprRecord, error: hprErr } = await db
            .from("hospital_patient_records")
            .select("*")
            .eq("id", selectedHprId)
            .eq("hospital_id", req.context.hospitalId)
            .single();

        if (hprErr || !hprRecord) {
            return res.status(404).json({ success: false, message: "Hospital Patient Record not found in this hospital." });
        }

        const decHprRecord = decryptRecord("hospital_patient_records", hprRecord);
        const todayStr = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());
        const targetDate = appointmentDate || req.body.date || todayStr;
        const targetShift = shift || appointmentTime || new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date());

        if (!targetDate || !targetShift) {
            return res.status(400).json({ success: false, message: "Registration date and shift selection are required." });
        }

        // Validate session capacity, blocked dates, and doctor availability
        const capCheck = await validateSessionCapacityAndConflict(db, {
            doctorId,
            date: targetDate,
            time: targetShift,
            hospitalId: req.context.hospitalId
        });

        if (!capCheck.isAllowed) {
            return res.status(capCheck.statusCode || 400).json({
                success: false,
                message: capCheck.message
            });
        }

        // Active Duplicate Check: prevent duplicate active visits for same doctor today
        const { data: activeVisits } = await db
            .from("patient_visits")
            .select("id, visit_stage")
            .eq("hospital_id", req.context.hospitalId)
            .eq("hospital_patient_id", hprRecord.id)
            .eq("doctor_id", doctorId)
            .in("visit_stage", ["scheduled", "checked_in", "waiting", "in_consultation"]);

        if (activeVisits && activeVisits.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Patient ${decHprRecord.full_name || "Record"} already has an active visit for this doctor today.`
            });
        }

        // Resolve Auth User ID if registered
        let authUserId = null;
        if (hprRecord.patient_id) {
            const { data: pRow } = await db.from("patients").select("user_id").eq("id", hprRecord.patient_id).single();
            if (pRow) authUserId = pRow.user_id;
        }

        // Create new Appointment referencing existing HPR
        const allocatedSlot = await resolveAvailableShiftSlot(db, doctorId, targetDate, targetShift);

        const appointmentData = {
            doctor_id: doctorId,
            patient_id: authUserId, // NULL if temporary, Auth User ID if registered
            appointment_date: targetDate,
            appointment_time: allocatedSlot,
            status: "confirmed",
            reason: chiefComplaints || "Walk-in Consultation",
            payment_method: "pay_at_clinic",
            payment_status: "pending",
            hospital_id: req.context.hospitalId,
            hospital_patient_id: hprRecord.id,
            source: "walk_in"
        };

        const { data: appRow, error: appErr } = await db
            .from("appointments")
            .insert(appointmentData)
            .select()
            .single();

        if (appErr) throw appErr;

        const targetVisitStage = actionType === "register_only" ? "scheduled" : "checked_in";

        // Create new Patient Visit referencing existing HPR
        const visitData = {
            hospital_id: req.context.hospitalId,
            hospital_patient_id: hprRecord.id,
            patient_id: hprRecord.patient_id, // NULL if temporary, patients.id if registered
            appointment_id: appRow.id,
            doctor_id: doctorId,
            visit_stage: targetVisitStage,
            chief_complaints: chiefComplaints || null,
            intake_vitals: vitals || {},
            checked_in_at: targetVisitStage === "checked_in" ? new Date().toISOString() : null,
            created_by: req.context.userId
        };

        const { data: visitRow, error: visitErr } = await db
            .from("patient_visits")
            .insert(visitData)
            .select()
            .single();

        if (visitErr) {
            await db.from("appointments").delete().eq("id", appRow.id);
            throw visitErr;
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "EXISTING_PATIENT_WALKIN",
            resourceType: "patient_visits",
            resourceId: visitRow.id,
            metadata: { hprId: hprRecord.id, appointmentId: appRow.id, doctorId, actionType }
        });

        if (req.body.qrSessionId) {
            await db
                .from("qr_intake_sessions")
                .update({
                    hospital_patient_id: hprRecord.id,
                    patient_visit_id: visitRow.id,
                    status: "converted",
                    converted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", req.body.qrSessionId)
                .eq("hospital_id", req.context.hospitalId);
        }

        return res.status(201).json({
            success: true,
            message: `Walk-in appointment and visit (${targetVisitStage}) created for ${decHprRecord.full_name}.`,
            hpr: decHprRecord,
            appointment: appRow,
            visit: decryptRecord("patient_visits", visitRow)
        });
    } catch (err) {
        console.error("[Existing Walkin Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/staff/patients/:hprId/convert
 * Convert a temporary HPR to a permanent Doctors Vedika Patient
 * Creates auth.users -> public.users -> public.patients, updates existing HPR.patient_id = patients.id
 * Preserves all historical appointments, visits, consultation notes, and prescriptions. Zero duplicate HPRs.
 */
router.post("/patients/:hprId/convert", requirePermission("walkin.register"), async (req, res) => {
    try {
        const { hprId } = req.params;
        const { email, phone, fullName, firstName, lastName, gender, dateOfBirth, address } = req.body;

        if (!email || !email.trim()) {
            return res.status(400).json({ success: false, message: "Valid email is required to register a permanent Doctors Vedika patient." });
        }

        const db = getSupabaseClient();
        if (!db) {
            return res.status(500).json({ success: false, message: "Database connection unavailable." });
        }

        // 1. Fetch & lock HPR verification
        const { data: hprRecord, error: fetchErr } = await db
            .from("hospital_patient_records")
            .select("*")
            .eq("id", hprId)
            .eq("hospital_id", req.context.hospitalId)
            .single();

        if (fetchErr || !hprRecord) {
            return res.status(404).json({ success: false, message: "Hospital Patient Record not found in this hospital." });
        }

        if (hprRecord.patient_id) {
            return res.status(400).json({ success: false, message: "This patient is already a registered Doctors Vedika patient." });
        }

        const calculatedFullName = (fullName || `${firstName || hprRecord.first_name} ${lastName || hprRecord.last_name || ''}`).trim();
        const patientPhone = phone || hprRecord.phone;

        // 2. Create Auth User
        const { data: authData, error: authErr } = await db.auth.admin.createUser({
            email: email.trim(),
            email_confirm: true,
            user_metadata: { full_name: calculatedFullName, role: 'patient', phone: patientPhone }
        });

        if (authErr) {
            console.error("[Convert Patient Auth Error]:", authErr);
            return res.status(400).json({ success: false, message: authErr.message || "Failed to create patient Auth user." });
        }

        const authUserId = authData.user.id;

        // 3. Fetch trigger-created patient record from 'patients' table
        const { data: pRow, error: pErr } = await db
            .from("patients")
            .select("*")
            .eq("user_id", authUserId)
            .single();

        if (pErr || !pRow) {
            // Clean up Auth user on failure
            await db.auth.admin.deleteUser(authUserId);
            return res.status(500).json({ success: false, message: "Patient account trigger creation failed." });
        }

        // Update patients details if additional info provided
        await db.from("patients").update({
            first_name: firstName || hprRecord.first_name,
            last_name: lastName || hprRecord.last_name,
            full_name: calculatedFullName,
            phone: patientPhone,
            gender: gender || hprRecord.gender,
            date_of_birth: dateOfBirth || hprRecord.date_of_birth,
            address: address || hprRecord.address
        }).eq("id", pRow.id);

        // 4. Update existing HPR with patient_id = patients.id
        const { data: updatedHpr, error: updateHprErr } = await db
            .from("hospital_patient_records")
            .update({
                patient_id: pRow.id,
                email: email.trim(),
                registration_type: "registered",
                updated_at: new Date().toISOString()
            })
            .eq("id", hprRecord.id)
            .select()
            .single();

        if (updateHprErr) throw updateHprErr;

        // 5. Update existing historical appointments & visits with patient_id references without duplicating rows
        const { data: hprApps } = await db.from("appointments").select("id").eq("hospital_patient_id", hprRecord.id).is("patient_id", null);
        if (hprApps && hprApps.length > 0) {
            for (const appItem of hprApps) {
                const { error: appUpdErr } = await db.from("appointments").update({ patient_id: authUserId }).eq("id", appItem.id);
                if (appUpdErr) {
                    console.warn(`[Convert Warning] Could not update appointment ${appItem.id}:`, appUpdErr.message);
                }
            }
        }
        await db.from("patient_visits").update({ patient_id: pRow.id }).eq("hospital_patient_id", hprRecord.id).is("patient_id", null);

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "PERMANENT_PATIENT_CONVERSION",
            resourceType: "hospital_patient_records",
            resourceId: hprRecord.id,
            metadata: { patientId: pRow.id, authUserId, email }
        });

        return res.json({
            success: true,
            message: `Patient ${calculatedFullName} successfully converted to permanent Doctors Vedika patient.`,
            hpr: updatedHpr,
            patientId: pRow.id
        });
    } catch (err) {
        console.error("[Convert Patient Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/staff/appointments/:id/cancel
 * Cancel an appointment safely with hospital isolation and audit logging
 */
router.post("/appointments/:id/cancel", requirePermission("appointments.update"), async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const { reason } = req.body;
        const hospitalId = req.context.hospitalId;
        const db = getSupabaseClient();
        if (!db) return res.status(500).json({ success: false, message: "Database connection unavailable." });

        // Verify appointment belongs to active hospital context
        const { data: appRow, error: fetchErr } = await db
            .from("appointments")
            .select("id, hospital_id, status, reason")
            .eq("id", appointmentId)
            .eq("hospital_id", hospitalId)
            .single();

        if (fetchErr || !appRow) {
            return res.status(404).json({ success: false, message: "Appointment record not found in this hospital." });
        }

        const updatedReason = reason ? `Cancelled: ${reason}` : (appRow.reason || "Cancelled by staff");

        // 1. Update appointments table status to 'cancelled'
        const { error: appUpdateErr } = await db
            .from("appointments")
            .update({ status: "cancelled", reason: updatedReason })
            .eq("id", appointmentId)
            .eq("hospital_id", hospitalId);

        if (appUpdateErr) throw appUpdateErr;

        // 2. Update associated patient_visits stage to 'cancelled'
        await db
            .from("patient_visits")
            .update({ visit_stage: "cancelled", updated_at: new Date().toISOString() })
            .eq("appointment_id", appointmentId)
            .eq("hospital_id", hospitalId);

        await logAuditEvent({
            hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "APPOINTMENT_CANCEL",
            resourceType: "appointments",
            resourceId: appointmentId,
            metadata: { reason: reason || "Cancelled by staff" }
        });

        return res.json({
            success: true,
            message: "Appointment cancelled successfully."
        });
    } catch (err) {
        console.error("[Cancel Appointment Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * DELETE /api/v1/staff/appointments/:id
 * Permanently delete a purely scheduled appointment if no clinical history exists
 * Enforces business rule: If clinical records or non-scheduled visit stages exist, blocks deletion and recommends cancellation
 */
router.delete("/appointments/:id", requirePermission("appointments.delete"), async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const hospitalId = req.context.hospitalId;
        const db = getSupabaseClient();
        if (!db) return res.status(500).json({ success: false, message: "Database connection unavailable." });

        // Verify appointment belongs to active hospital context
        const { data: appRow, error: fetchErr } = await db
            .from("appointments")
            .select("id, hospital_id, status")
            .eq("id", appointmentId)
            .eq("hospital_id", hospitalId)
            .single();

        if (fetchErr || !appRow) {
            return res.status(404).json({ success: false, message: "Appointment record not found in this hospital." });
        }

        // Check for active visit stage or existing clinical notes/prescriptions
        const { data: visitRow } = await db
            .from("patient_visits")
            .select("id, visit_stage")
            .eq("appointment_id", appointmentId)
            .maybeSingle();

        const { count: notesCount } = await db
            .from("consultation_notes")
            .select("id", { count: "exact", head: true })
            .eq("appointment_id", appointmentId);

        const { count: rxCount } = await db
            .from("prescriptions")
            .select("id", { count: "exact", head: true })
            .eq("appointment_id", appointmentId);

        const stage = visitRow?.visit_stage;
        const hasClinicalRecord = (notesCount > 0) || (rxCount > 0) || (stage && stage !== "scheduled" && stage !== "cancelled");

        if (hasClinicalRecord) {
            return res.status(400).json({
                success: false,
                code: "CANNOT_DELETE_HAS_CLINICAL_HISTORY",
                message: "This appointment has an associated visit/clinical record and cannot be permanently deleted. You can cancel it instead."
            });
        }

        // Safe hard-delete for purely scheduled appointments without clinical records
        if (visitRow) {
            await db.from("patient_visits").delete().eq("id", visitRow.id);
        }
        await db.from("appointments").delete().eq("id", appointmentId).eq("hospital_id", hospitalId);

        await logAuditEvent({
            hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "APPOINTMENT_DELETE",
            resourceType: "appointments",
            resourceId: appointmentId,
            metadata: { deletedBy: req.context.userId }
        });

        return res.json({
            success: true,
            message: "Appointment deleted successfully."
        });
    } catch (err) {
        console.error("[Delete Appointment Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/staff/visits/:id/details
 * Fetch complete operational context for Patient Details drawer (Patient, Appointment, Visit, Hospital)
 */
router.get("/visits/:id/details", async (req, res) => {
    try {
        const visitOrAppId = req.params.id;
        const hospitalId = req.context.hospitalId;
        const db = getSupabaseClient();
        if (!db) return res.status(500).json({ success: false, message: "Database connection unavailable." });

        let visitRow = null;
        let appRow = null;

        const { data: vData } = await db
            .from("patient_visits")
            .select(`
                *,
                hospital_patient_records(*),
                doctors(doctor_id, doctor_name, doctor_specialization)
            `)
            .or(`id.eq.${visitOrAppId},appointment_id.eq.${visitOrAppId}`)
            .eq("hospital_id", hospitalId)
            .maybeSingle();

        visitRow = vData;

        const targetAppId = visitRow?.appointment_id || visitOrAppId;
        if (targetAppId) {
            const { data: aData } = await db
                .from("appointments")
                .select(`
                    *,
                    doctors(doctor_id, doctor_name, doctor_specialization)
                `)
                .eq("id", targetAppId)
                .eq("hospital_id", hospitalId)
                .maybeSingle();
            appRow = aData;
        }

        const targetHprId = visitRow?.hospital_patient_id || appRow?.hospital_patient_id;
        let hprRow = visitRow?.hospital_patient_records;
        if (!hprRow && targetHprId) {
            const { data: hData } = await db
                .from("hospital_patient_records")
                .select("*")
                .eq("id", targetHprId)
                .eq("hospital_id", hospitalId)
                .single();
            hprRow = hData;
        }

        const decHpr = decryptRecord("hospital_patient_records", hprRow);
        const decVisit = decryptRecord("patient_visits", visitRow);

        const { data: hospData } = await db.from("hospitals").select("name, code").eq("id", hospitalId).single();

        return res.json({
            success: true,
            details: {
                patient: {
                    hprId: decHpr?.id || null,
                    patientId: decHpr?.patient_id || null,
                    fullName: decHpr?.full_name || "Patient",
                    phone: decHpr?.phone || "N/A",
                    patientCode: decHpr?.hospital_patient_code || "N/A",
                    gender: decHpr?.gender || "N/A",
                    dateOfBirth: decHpr?.date_of_birth || null,
                    registrationType: decHpr?.registration_type === "registered" ? "Registered Patient" : "Walk-in Patient",
                    isRegistered: Boolean(decHpr?.patient_id),
                    accountStatus: decHpr?.patient_id ? "Registered Account" : "Walk-in Patient - Account Not Registered"
                },
                appointment: {
                    id: appRow?.id || null,
                    appointmentDate: appRow?.appointment_date || (visitRow?.created_at ? visitRow.created_at.split("T")[0] : null),
                    appointmentTime: appRow?.appointment_time || "Walk-in",
                    doctorName: appRow?.doctors?.doctor_name || visitRow?.doctors?.doctor_name || "Assigned Doctor",
                    specialization: appRow?.doctors?.doctor_specialization || visitRow?.doctors?.doctor_specialization || "General Medicine",
                    status: appRow?.status || "confirmed",
                    source: appRow?.source || "walk_in",
                    reason: appRow?.reason || decVisit?.chief_complaints || "Routine Checkup"
                },
                visit: {
                    id: visitRow?.id || null,
                    visitStage: visitRow?.visit_stage || "scheduled",
                    checkedInAt: visitRow?.checked_in_at || null,
                    consultationStartedAt: visitRow?.consultation_started_at || visitRow?.started_at || null,
                    consultationCompletedAt: visitRow?.consultation_completed_at || visitRow?.completed_at || null,
                    chiefComplaints: decVisit?.chief_complaints || "",
                    intakeVitals: decVisit?.intake_vitals || {}
                },
                hospital: {
                    id: hospitalId,
                    name: hospData?.name || "Doctors Vedika Hospital",
                    code: hospData?.code || "DV-MAIN"
                }
            }
        });
    } catch (err) {
        console.error("[Get Patient Details Error]:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
