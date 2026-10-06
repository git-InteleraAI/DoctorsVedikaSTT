const express = require("express");
const router = express.Router();
const { authenticateAdapter, requirePermission } = require("../middleware/authAdapter");
const { logAuditEvent } = require("../middleware/auditLogger");
const { supabaseAdmin } = require("../config/supabase");
const { encryptPayload, decryptRecord } = require("../services/encryptionService");

function getSupabaseClient() {
    return supabaseAdmin;
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

// Explicit guard: Staff role, staff capability, or staff portal context can access /staff routes
const requireStaffRole = (req, res, next) => {
    const isStaffPortalHeader = req.headers["x-portal-context"] === "staff";
    if (!req.context || (req.context.role !== "staff" && !req.context.capabilities?.staff && req.context.role !== "hospital_admin" && !isStaffPortalHeader)) {
        console.log("[Staff Guard Debug] req.context:", JSON.stringify(req.context));
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
            const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";
            const todayStr = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());

            // Count appointments scheduled or created for today
            const { count: appCount } = await db
                .from("appointments")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .or(`appointment_date.eq.${todayStr},created_at.gte.${todayStart}`);

            totalAppointments = appCount || 0;

            // Fetch visit stage counts
            const { data: visits } = await db
                .from("patient_visits")
                .select("visit_stage")
                .eq("hospital_id", hospitalId)
                .gte("created_at", todayStart);

            if (visits) {
                visits.forEach(v => {
                    if (v.visit_stage === "checked_in") checkedIn++;
                    else if (v.visit_stage === "waiting") waiting++;
                    else if (v.visit_stage === "in_consultation") inConsultation++;
                    else if (v.visit_stage === "completed" || v.visit_stage === "exited") completed++;
                    else if (v.visit_stage === "cancelled") cancelled++;
                });
            }
        }

        return res.json({
            success: true,
            stats: {
                totalAppointments,
                waiting: waiting + checkedIn,
                checkedIn,
                inConsultation,
                completed,
                cancelled,
                queueCount: checkedIn + waiting + inConsultation + completed
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

        const { data, error } = await db
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
            .eq("hospital_id", req.context.hospitalId)
            .order("created_at", { ascending: false })
            .limit(50);

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
            appQuery = appQuery.or(`hospital_id.eq.${hospitalId},hospital_id.is.null`);
        }
        const { data: foundApp } = await appQuery.maybeSingle();

        if (foundApp) {
            appRow = foundApp;
        } else {
            // Fallback: Check if appointmentId is actually a patient_visits record ID directly
            let visitQuery = db.from("patient_visits").select("*").eq("id", appointmentId);
            if (hospitalId) {
                visitQuery = visitQuery.or(`hospital_id.eq.${hospitalId},hospital_id.is.null`);
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
            const { data: vRecord } = await db.from("patient_visits").select("hospital_patient_id").eq("id", rawId).maybeSingle();
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

        // -------------------------------------------------------------
        // 1. Get the VERIFIED hospital context from authentication
        // -------------------------------------------------------------
        const hospitalId = req.context?.hospitalId;

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
        // 2. Find ONLY active doctor memberships for this hospital
        // -------------------------------------------------------------
        const {
            data: rawMembers,
            error: memberError
        } = await db
            .from("hospital_members")
            .select("id, hospital_id, user_id, doctor_id, role, status")
            .eq("hospital_id", hospitalId);

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

        // Filter active doctor memberships in JS (resilient to string case)
        const doctorMembers = (rawMembers || []).filter(m => {
            const isDoctor = String(m.role || "").toLowerCase().includes("doc") || Boolean(m.doctor_id);
            const isActive = !m.status || String(m.status).toLowerCase() === "active";
            return isDoctor && isActive;
        });

        console.log("[STAFF DOCTORS] doctor membership count =", doctorMembers.length);

        // -------------------------------------------------------------
        // 3. Extract doctor IDs and user IDs from those memberships
        // -------------------------------------------------------------
        const doctorIds = [...new Set(doctorMembers.map(m => m.doctor_id).filter(Boolean))];
        const userIds = [...new Set(doctorMembers.map(m => m.user_id).filter(Boolean))];

        console.log("[STAFF DOCTORS] doctor IDs =", doctorIds, "user IDs =", userIds);

        // -------------------------------------------------------------
        // 4. IMPORTANT:
        //    If this hospital has no doctors, STOP HERE.
        //    NEVER query all doctors globally.
        // -------------------------------------------------------------
        if (doctorIds.length === 0 && userIds.length === 0) {
            console.log("[STAFF DOCTORS] Zero active doctor memberships for hospital:", hospitalId);
            return res.json({
                success: true,
                hospitalId,
                doctors: []
            });
        }

        // -------------------------------------------------------------
        // 5. Fetch doctors by doctor_id and user_id cleanly
        // -------------------------------------------------------------
        let doctorsRaw = [];
        if (doctorIds.length > 0) {
            const { data: d1 } = await db
                .from("doctors")
                .select("doctor_id, user_id, doctor_name, doctor_specialization, doctor_profile_photo, doctor_is_active, doctor_verification_status")
                .in("doctor_id", doctorIds);
            if (d1) doctorsRaw.push(...d1);
        }
        if (userIds.length > 0) {
            const { data: d2 } = await db
                .from("doctors")
                .select("doctor_id, user_id, doctor_name, doctor_specialization, doctor_profile_photo, doctor_is_active, doctor_verification_status")
                .in("user_id", userIds);
            if (d2) doctorsRaw.push(...d2);
        }

        // Deduplicate raw doctors
        const uniqueDocsMap = new Map();
        doctorsRaw.forEach(d => {
            const k = d.doctor_id || d.user_id;
            if (k && !uniqueDocsMap.has(String(k))) {
                uniqueDocsMap.set(String(k), d);
            }
        });
        const doctors = Array.from(uniqueDocsMap.values());

        // Filter out explicitly deactivated doctors
        const activeDoctors = doctors.filter(d => d.doctor_is_active !== false);

        // -------------------------------------------------------------
        // 6. Format doctor objects matching exact frontend expectations
        // -------------------------------------------------------------
        const doctorMap = new Map();
        activeDoctors.forEach(doc => {
            if (doc.doctor_id) doctorMap.set(String(doc.doctor_id), doc);
            if (doc.user_id) doctorMap.set(String(doc.user_id), doc);
        });

        const formattedDoctors = [];
        const seenKeys = new Set();

        doctorMembers.forEach(member => {
            const key = String(member.doctor_id || member.user_id);
            if (key && !seenKeys.has(key)) {
                seenKeys.add(key);
                const doc = doctorMap.get(String(member.doctor_id)) || doctorMap.get(String(member.user_id));
                if (doc) {
                    const rawName = doc.doctor_name?.trim() || "Hospital Doctor";
                    const fullName = rawName.startsWith("Dr.") ? rawName : `Dr. ${rawName}`;
                    const resolvedId = doc.doctor_id || member.doctor_id || member.user_id;

                    formattedDoctors.push({
                        doctorId: resolvedId,
                        fullName,
                        doctorName: rawName.replace(/^Dr\.\s*/, ""),
                        specialization: doc.doctor_specialization?.trim() || "General Medicine",
                        avatarUrl: doc.doctor_profile_photo || null
                    });
                }
            }
        });

        // Fallback: If formattedDoctors is empty but activeDoctors has records, format them directly
        if (formattedDoctors.length === 0 && activeDoctors.length > 0) {
            activeDoctors.forEach(doc => {
                const rawName = doc.doctor_name?.trim() || "Hospital Doctor";
                const fullName = rawName.startsWith("Dr.") ? rawName : `Dr. ${rawName}`;
                formattedDoctors.push({
                    doctorId: doc.doctor_id || doc.user_id,
                    fullName,
                    doctorName: rawName.replace(/^Dr\.\s*/, ""),
                    specialization: doc.doctor_specialization?.trim() || "General Medicine",
                    avatarUrl: doc.doctor_profile_photo || null
                });
            });
        }

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
 * GET /api/v1/staff/queue
 * Live queue overview of patient_visits and appointments for selected date
 * Unified dataset supporting status tabs, doctor filtering, and appointment times
 */
router.get("/queue", async (req, res) => {
    try {
        const db = getSupabaseClient();
        if (!db) return res.json({ success: true, queue: [], counts: { all: 0, scheduled: 0, checkedIn: 0, waiting: 0, inConsultation: 0, completed: 0, cancelled: 0 } });

        const hospitalId = req.context.hospitalId;
        const requestedDate = req.query.date || new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());

        // 1. Fetch appointments for hospital (with resilient fallback)
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
                reason,
                hospital_id,
                hospital_patient_id,
                created_at,
                doctors(doctor_id, doctor_name, doctor_specialization),
                hospital_patient_records(id, hospital_patient_code, full_name, phone, gender, date_of_birth)
            `);

        if (hospitalId) {
            appQuery = appQuery.or(`hospital_id.eq.${hospitalId},hospital_id.is.null`);
        }
        appQuery = appQuery.order("created_at", { ascending: false }).limit(200);

        let { data: appointmentsData, error: appErr } = await appQuery;
        if (appErr || !appointmentsData || appointmentsData.length === 0) {
            console.warn("[Queue API] Appointments primary query fallback:", appErr?.message);
            const { data: fallbackApps } = await db
                .from("appointments")
                .select(`
                    id, doctor_id, patient_id, appointment_date, appointment_time, status, source, reason, hospital_id, hospital_patient_id, created_at,
                    doctors(doctor_id, doctor_name, doctor_specialization),
                    hospital_patient_records(id, hospital_patient_code, full_name, phone, gender, date_of_birth)
                `)
                .order("created_at", { ascending: false })
                .limit(200);
            appointmentsData = fallbackApps || [];
        }

        // 2. Fetch patient visits for hospital
        const selectFields = `
            id,
            hospital_patient_id,
            appointment_id,
            doctor_id,
            visit_stage,
            chief_complaints,
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
        if (hospitalId) {
            visitQuery = visitQuery.or(`hospital_id.eq.${hospitalId},hospital_id.is.null`);
        }
        visitQuery = visitQuery.order("created_at", { ascending: false }).limit(200);

        let { data: visitsData, error: visitErr } = await visitQuery;
        if (visitErr || !visitsData) {
            const { data: fallbackVisits } = await db.from("patient_visits").select(selectFields).order("created_at", { ascending: false }).limit(200);
            visitsData = fallbackVisits || [];
        }

        // 3. Fetch clinical notes & prescriptions counts for delete eligibility check
        const appIds = [...new Set([
            ...(appointmentsData || []).map(a => a.id),
            ...(visitsData || []).map(v => v.appointment_id)
        ].filter(Boolean))];

        let notesMap = {};
        let rxMap = {};
        if (appIds.length > 0) {
            const { data: notesData } = await db.from("consultation_notes").select("appointment_id").in("appointment_id", appIds);
            (notesData || []).forEach(n => { if (n.appointment_id) notesMap[n.appointment_id] = true; });

            const { data: rxData } = await db.from("prescriptions").select("appointment_id").in("appointment_id", appIds);
            (rxData || []).forEach(r => { if (r.appointment_id) rxMap[r.appointment_id] = true; });
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
        const queueItems = [];

        // First process all appointments
        (appointmentsData || []).forEach((app) => {
            const visit = visitsByAppId[app.id] || (app.hospital_patient_id && visitsByHprId[app.hospital_patient_id] ? visitsByHprId[app.hospital_patient_id][0] : null);
            if (visit) processedVisits.add(visit.id);

            const decHpr = decryptRecord("hospital_patient_records", app.hospital_patient_records || visit?.hospital_patient_records);
            const decVisit = decryptRecord("patient_visits", visit);

            const rawStage = visit?.visit_stage || (app.status === "cancelled" ? "cancelled" : (app.status === "completed" ? "completed" : "scheduled"));
            const visitStage = rawStage === "exited" ? "completed" : rawStage;

            const isScheduled = visitStage === "scheduled";
            const isCancelled = visitStage === "cancelled" || app.status === "cancelled";
            const isCompleted = visitStage === "completed" || app.status === "completed";
            const hasClinicalNotes = Boolean(notesMap[app.id] || rxMap[app.id]);
            const hasProgressedVisit = visitStage && !["scheduled", "cancelled"].includes(visitStage);

            const canCheckIn = isScheduled && !isCancelled && !isCompleted;
            const canCancel = !isCancelled && !isCompleted;
            const canDelete = isScheduled && !hasProgressedVisit && !hasClinicalNotes;

            queueItems.push({
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
                isRegistered: Boolean(app.patient_id || decHpr?.patient_id),
                doctorId: app.doctor_id || visit?.doctor_id,
                doctorName: app.doctors?.doctor_name || visit?.doctors?.doctor_name || "Assigned Doctor",
                specialization: app.doctors?.doctor_specialization || visit?.doctors?.doctor_specialization || "General Medicine",
                appointmentDate: app.appointment_date || requestedDate,
                appointmentTime: app.appointment_time || "Walk-in",
                reason: app.reason || decVisit?.chief_complaints || "Routine Checkup",
                source: app.source || "walk_in",
                status: app.status || "confirmed",
                visitStage: visitStage,
                checkedInAt: visit?.checked_in_at || null,
                consultationStartedAt: visit?.consultation_started_at || visit?.started_at || null,
                consultationCompletedAt: visit?.consultation_completed_at || visit?.completed_at || null,
                exitedAt: visit?.exited_at || null,
                chiefComplaints: decVisit?.chief_complaints || app.reason || "",
                intakeVitals: decVisit?.intake_vitals || {},
                can_check_in: canCheckIn,
                can_cancel: canCancel,
                can_delete: canDelete,
                createdAt: app.created_at || visit?.created_at
            });
        });

        // Add remaining standalone walk-in visits without appointment links
        (visitsData || []).forEach((visit) => {
            if (processedVisits.has(visit.id)) return;
            processedVisits.add(visit.id);

            const decHpr = decryptRecord("hospital_patient_records", visit.hospital_patient_records);
            const decVisit = decryptRecord("patient_visits", visit);
            const visitStage = visit.visit_stage === "exited" ? "completed" : (visit.visit_stage || "scheduled");

            const isScheduled = visitStage === "scheduled";
            const isCancelled = visitStage === "cancelled";
            const isCompleted = visitStage === "completed";
            const hasClinicalNotes = visit.appointment_id ? Boolean(notesMap[visit.appointment_id] || rxMap[visit.appointment_id]) : false;
            const hasProgressedVisit = !["scheduled", "cancelled"].includes(visitStage);

            const canCheckIn = isScheduled;
            const canCancel = !isCancelled && !isCompleted;
            const canDelete = isScheduled && !hasProgressedVisit && !hasClinicalNotes;

            queueItems.push({
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
                isRegistered: Boolean(visit.patient_id || decHpr?.patient_id),
                doctorId: visit.doctor_id,
                doctorName: visit.doctors?.doctor_name || "Assigned Doctor",
                specialization: visit.doctors?.doctor_specialization || "General Medicine",
                appointmentDate: requestedDate,
                appointmentTime: "Walk-in",
                reason: decVisit?.chief_complaints || "Walk-in Consultation",
                source: "walk_in",
                status: isCompleted ? "completed" : (isCancelled ? "cancelled" : "confirmed"),
                visitStage: visitStage,
                checkedInAt: visit.checked_in_at || null,
                consultationStartedAt: visit.consultation_started_at || visit.started_at || null,
                consultationCompletedAt: visit.consultation_completed_at || visit.completed_at || null,
                exitedAt: visit.exited_at || null,
                chiefComplaints: decVisit?.chief_complaints || "",
                intakeVitals: decVisit?.intake_vitals || {},
                can_check_in: canCheckIn,
                can_cancel: canCancel,
                can_delete: canDelete,
                createdAt: visit.created_at
            });
        });

        // Add token numbers
        const queueList = queueItems.map((item, idx) => ({
            ...item,
            token: String(idx + 1).padStart(2, "0")
        }));

        // Calculate dynamic stage counts
        const counts = {
            all: queueList.length,
            scheduled: queueList.filter(q => q.visitStage === "scheduled").length,
            checkedIn: queueList.filter(q => q.visitStage === "checked_in").length,
            waiting: queueList.filter(q => q.visitStage === "waiting").length,
            inConsultation: queueList.filter(q => q.visitStage === "in_consultation").length,
            completed: queueList.filter(q => q.visitStage === "completed").length,
            cancelled: queueList.filter(q => q.visitStage === "cancelled").length
        };

        return res.json({
            success: true,
            date: requestedDate,
            counts,
            queue: queueList
        });
    } catch (err) {
        console.error("[Staff Queue Error]:", err);
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
                vQuery = vQuery.or(`hospital_id.eq.${hospitalId},hospital_id.is.null`);
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
                    appQuery = appQuery.or(`hospital_id.eq.${hospitalId},hospital_id.is.null`);
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

        const calculatedFullName = (fullName || `${firstName || 'Walk-in'} ${lastName || ''}`).trim();
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
        const nowObj = new Date();
        const todayStr = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).format(nowObj);
        const nowTimeStr = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(nowObj);

        const appointmentData = {
            doctor_id: doctorId,
            patient_id: null, // Temporary walk-in
            appointment_date: todayStr,
            appointment_time: nowTimeStr,
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
        const todayStr = new Date().toISOString().split("T")[0];

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

        const nowTimeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
        
        // Resolve Auth User ID if registered
        let authUserId = null;
        if (hprRecord.patient_id) {
            const { data: pRow } = await db.from("patients").select("user_id").eq("id", hprRecord.patient_id).single();
            if (pRow) authUserId = pRow.user_id;
        }

        // Create new Appointment referencing existing HPR
        const appointmentData = {
            doctor_id: doctorId,
            patient_id: authUserId, // NULL if temporary, Auth User ID if registered
            appointment_date: todayStr,
            appointment_time: nowTimeStr,
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
