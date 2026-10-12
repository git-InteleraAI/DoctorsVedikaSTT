const express = require("express");
const router = express.Router();
const { authenticateAdapter } = require("../middleware/authAdapter");
const { logAuditEvent } = require("../middleware/auditLogger");
const { supabaseAdmin } = require("../config/supabase");
const { encryptPayload, decryptRecord } = require("../services/encryptionService");

function getSupabaseClient() {
    return supabaseAdmin;
}

const isUuid = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Protect all queue routes
router.use(authenticateAdapter);

/**
 * GET /api/v1/queue/live
 * Fetch current operational queue for active hospital
 */
router.get("/live", async (req, res) => {
    try {
        const { stage, doctorId } = req.query;
        const db = getSupabaseClient();
        if (!db) {
            return res.json({ success: true, queue: [] });
        }

        let query = db
            .from("patient_visits")
            .select(`
                id,
                hospital_id,
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
            `)
            .eq("hospital_id", req.context.hospitalId);

        if (stage) {
            query = query.eq("visit_stage", stage);
        } else {
            query = query.in("visit_stage", ["checked_in", "waiting", "in_consultation", "completed", "exited"]);
        }

        // If caller is doctor role, scope to doctor's own queue unless queue.view permission permits
        if (req.context.role === "doctor" && req.context.doctorId) {
            const filterDocId = doctorId || req.context.doctorId;
            query = query.eq("doctor_id", filterDocId);
        } else if (doctorId) {
            query = query.eq("doctor_id", doctorId);
        }

        const { data, error } = await query.order("created_at", { ascending: true });

        if (error) {
            // Fallback query if exited_at column isn't in select list yet
            const { data: fallbackData, error: fbErr } = await db
                .from("patient_visits")
                .select(`
                    id,
                    hospital_id,
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
                `)
                .eq("hospital_id", req.context.hospitalId)
                .in("visit_stage", ["checked_in", "waiting", "in_consultation", "completed", "exited"])
                .order("created_at", { ascending: true });

            if (fbErr) throw fbErr;
            return res.json({
                success: true,
                hospitalId: req.context.hospitalId,
                queue: (fallbackData || []).map(item => decryptRecord("patient_visits", item))
            });
        }

        return res.json({
            success: true,
            hospitalId: req.context.hospitalId,
            queue: (data || []).map(item => decryptRecord("patient_visits", item))
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/queue/transition
 * Transition visit stage using hardened RPC or resilient direct database update
 */
router.post("/transition", async (req, res) => {
    try {
        const { visitId, appointmentId, expectedStage, targetStage } = req.body;
        const rawTargetId = visitId || appointmentId;
        const targetId = String(rawTargetId || "")
            .replace(/^consultation-(app|pat|db)-/, "")
            .replace(/^visit-/, "")
            .replace(/^app-/, "")
            .trim();

        if (!targetId || !targetStage) {
            return res.status(400).json({
                success: false,
                message: "visitId (or appointmentId) and targetStage are required."
            });
        }

        const db = getSupabaseClient();
        if (!db) {
            return res.status(500).json({ success: false, message: "Database connection unavailable." });
        }

        let rpcSuccess = false;
        let rpcResult = null;

        // Try hardened atomic RPC if expectedStage is provided (except for in_consultation stage transition where consultation_started_at must NOT be set until mic starts)
        if (expectedStage && targetStage !== "in_consultation" && isUuid(targetId)) {
            try {
                // Verify hospital ownership first to ensure tenant isolation
                const { data: hospCheck } = await db
                    .from("patient_visits")
                    .select("id")
                    .eq("id", targetId)
                    .eq("hospital_id", req.context.hospitalId)
                    .maybeSingle();

                if (hospCheck) {
                    const { data, error } = await db.rpc("transition_visit_stage_hardened", {
                        p_visit_id: targetId,
                        p_expected_stage: expectedStage,
                        p_target_stage: targetStage
                    });

                    if (!error && data && data.success === true) {
                        rpcSuccess = true;
                        rpcResult = data;
                        if (targetStage === "completed" || targetStage === "exited") {
                            try {
                                const appTargetId = appointmentId || targetId;
                                if (isUuid(appTargetId)) {
                                    await db.from("appointments").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", appTargetId).eq("hospital_id", req.context.hospitalId);
                                }
                            } catch (appSyncErr) {
                                console.warn("[Queue Transition] RPC appointment sync notice:", appSyncErr.message);
                            }
                        }
                    }
                }
            } catch (rpcErr) {
                console.warn("[Queue Transition RPC Notice]:", rpcErr.message);
            }
        }

        // If RPC was not used or failed/returned conflict, perform resilient direct update scoped to hospital
        if (!rpcSuccess) {
            // Find patient_visits row by ID or appointment_id strictly scoped to hospital
            let vRow = null;

            if (isUuid(targetId)) {
                const { data: byId } = await db
                    .from("patient_visits")
                    .select("id, hospital_id, appointment_id, visit_stage, checked_in_at, consultation_started_at, started_at, consultation_completed_at, completed_at, intake_vitals")
                    .eq("hospital_id", req.context.hospitalId)
                    .or(`id.eq.${targetId},appointment_id.eq.${targetId},hospital_patient_id.eq.${targetId},patient_id.eq.${targetId}`)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                vRow = byId;
            } else {
                const { data: hpr } = await db
                    .from("hospital_patient_records")
                    .select("id")
                    .eq("hospital_id", req.context.hospitalId)
                    .eq("hospital_patient_code", targetId)
                    .maybeSingle();
                const hprId = hpr?.id;
                if (hprId) {
                    const { data: byHpr } = await db
                        .from("patient_visits")
                        .select("id, hospital_id, appointment_id, visit_stage, checked_in_at, consultation_started_at, started_at, consultation_completed_at, completed_at, intake_vitals")
                        .eq("hospital_id", req.context.hospitalId)
                        .eq("hospital_patient_id", hprId)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    vRow = byHpr;
                }
            }

            if (!vRow) {
                // Check if targetId is an appointment in appointments table belonging to current hospital
                if (isUuid(targetId) && (targetStage === "completed" || targetStage === "exited")) {
                    const nowIso = new Date().toISOString();
                    const { data: appRow } = await db
                        .from("appointments")
                        .select("id")
                        .eq("hospital_id", req.context.hospitalId)
                        .eq("id", targetId)
                        .maybeSingle();
                    if (appRow) {
                        await db.from("appointments").update({ status: "completed", updated_at: nowIso }).eq("id", targetId).eq("hospital_id", req.context.hospitalId);
                        await db.from("patient_visits").update({
                            visit_stage: "completed",
                            status: "completed",
                            completed_at: nowIso,
                            consultation_completed_at: nowIso,
                            updated_at: nowIso
                        }).eq("appointment_id", targetId).eq("hospital_id", req.context.hospitalId);
                        return res.json({ success: true, message: "Appointment updated to completed successfully.", newStage: targetStage });
                    }
                }

                return res.status(404).json({
                    success: false,
                    message: `Patient visit record not found for ID '${targetId}'.`
                });
            }

            const nowIso = new Date().toISOString();
            const existingVitals = vRow.intake_vitals || {};
            const updatePayload = {
                visit_stage: targetStage,
                updated_at: nowIso
            };

            if (targetStage === "in_consultation") {
                updatePayload.status = "in_progress";
                if (!vRow.consultation_started_at) updatePayload.consultation_started_at = nowIso;
                if (!vRow.started_at) updatePayload.started_at = nowIso;

                if (vRow.appointment_id) {
                    await db.from("appointments").update({ status: "in_progress", updated_at: nowIso }).eq("id", vRow.appointment_id);
                }
            } else if (targetStage === "completed") {
                updatePayload.status = "completed";
                if (!vRow.consultation_completed_at) updatePayload.consultation_completed_at = nowIso;
                if (!vRow.completed_at) updatePayload.completed_at = nowIso;

                if (vRow.appointment_id) {
                    await db.from("appointments").update({ status: "completed", updated_at: nowIso }).eq("id", vRow.appointment_id);
                }
            } else if (targetStage === "exited") {
                updatePayload.status = "exited";
                updatePayload.visit_stage = "exited";
                updatePayload.exited_at = nowIso;
                updatePayload.intake_vitals = { ...existingVitals, exited_at: nowIso };

                if (vRow.appointment_id) {
                    await db.from("appointments").update({ status: "completed", updated_at: nowIso }).eq("id", vRow.appointment_id);
                }
            } else if (targetStage === "checked_in" || targetStage === "waiting") {
                if (!vRow.checked_in_at) updatePayload.checked_in_at = nowIso;
            }

            let { data: updated, error: updateErr } = await db
                .from("patient_visits")
                .update(updatePayload)
                .eq("id", vRow.id)
                .eq("hospital_id", req.context.hospitalId)
                .select()
                .single();

            if (updateErr) {
                // If exited_at column or visit_stage constraint fails on DB, fallback gracefully
                delete updatePayload.exited_at;
                if (targetStage === "exited") {
                    updatePayload.visit_stage = "completed"; // fallback stage if check constraint limits to 'completed'
                }
                const retryRes = await db
                    .from("patient_visits")
                    .update(updatePayload)
                    .eq("id", vRow.id)
                    .eq("hospital_id", req.context.hospitalId)
                    .select()
                    .single();
                updated = retryRes.data;
                updateErr = retryRes.error;
            }

            if (updateErr) {
                console.error("[Queue Transition Direct Update Error]:", updateErr);
                return res.status(400).json({ success: false, message: updateErr.message });
            }

            rpcResult = {
                success: true,
                visit_id: updated?.id || vRow.id,
                new_stage: targetStage,
                started_at: updated?.consultation_started_at || updated?.started_at || vRow.started_at,
                completed_at: updated?.consultation_completed_at || updated?.completed_at || vRow.completed_at,
                exited_at: updated?.exited_at || updated?.intake_vitals?.exited_at || existingVitals.exited_at || nowIso
            };
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "VISIT_STAGE_TRANSITION",
            resourceType: "patient_visits",
            resourceId: targetId,
            metadata: { expectedStage, targetStage }
        });

        return res.json({
            success: true,
            message: `Visit stage transitioned successfully to '${targetStage}'.`,
            visitId: rpcResult?.visit_id || targetId,
            newStage: targetStage,
            startedAt: rpcResult?.started_at || null,
            completedAt: rpcResult?.completed_at || null
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/queue/start-recording
 * Mark actual clinical consultation microphone/recording start timestamp (backend authoritative)
 */
router.post("/start-recording", async (req, res) => {
    try {
        const { visitId, appointmentId } = req.body;
        const targetId = visitId || appointmentId;

        if (!targetId) {
            return res.status(400).json({
                success: false,
                message: "visitId or appointmentId is required."
            });
        }

        const db = getSupabaseClient();
        if (!db) {
            return res.status(500).json({ success: false, message: "Database connection unavailable." });
        }

        let vRow = null;
        if (isUuid(targetId)) {
            const { data } = await db
                .from("patient_visits")
                .select("id, consultation_started_at, started_at, visit_stage")
                .eq("hospital_id", req.context.hospitalId)
                .or(`id.eq.${targetId},appointment_id.eq.${targetId}`)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            vRow = data;
        }

        if (!vRow) {
            return res.status(404).json({
                success: false,
                message: `Patient visit record not found for ID '${targetId}'.`
            });
        }

        // If consultation_started_at is already set, return existing backend timestamp
        if (vRow.consultation_started_at || vRow.started_at) {
            const existingStart = vRow.consultation_started_at || vRow.started_at;
            return res.json({
                success: true,
                message: "Consultation recording already started.",
                consultation_started_at: existingStart,
                started_at: existingStart
            });
        }

        // Database/server timestamp is authoritative source of truth
        const nowIso = new Date().toISOString();
        const updatePayload = {
            consultation_started_at: nowIso,
            started_at: nowIso,
            visit_stage: "in_consultation",
            status: "in_progress",
            updated_at: nowIso
        };

        const { data: updated, error: updateErr } = await db
            .from("patient_visits")
            .update(updatePayload)
            .eq("id", vRow.id)
            .eq("hospital_id", req.context.hospitalId)
            .select("id, consultation_started_at, started_at, visit_stage")
            .single();

        if (updateErr) {
            console.error("[Start Recording DB Update Error]:", updateErr);
            return res.status(400).json({ success: false, message: updateErr.message });
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "CLINICAL_MICROPHONE_STARTED",
            resourceType: "patient_visits",
            resourceId: vRow.id,
            metadata: { started_at: nowIso }
        });

        return res.json({
            success: true,
            message: "Clinical consultation microphone recording started.",
            consultation_started_at: updated?.consultation_started_at || nowIso,
            started_at: updated?.started_at || nowIso
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/queue/visit/:id
 * Fetch detailed visit info including intake_vitals, patient DOB, gender, blood group, doctor details
 */
router.get("/visit/:id", async (req, res) => {
    try {
        const visitId = req.params.id;
        const db = getSupabaseClient();
        if (!db) return res.status(500).json({ success: false, message: "Database connection unavailable." });

        let query = db
            .from("patient_visits")
            .select(`
                id,
                hospital_id,
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
                hospital_patient_records(id, hospital_patient_code, full_name, first_name, last_name, phone, gender, date_of_birth, blood_group),
                doctors(doctor_id, doctor_name, doctor_specialization)
            `)
            .eq("hospital_id", req.context.hospitalId)
            .or(`id.eq.${visitId},appointment_id.eq.${visitId},hospital_patient_id.eq.${visitId},patient_id.eq.${visitId}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        const { data: visit, error } = await query;
        if (error) throw error;

        if (!visit) {
            return res.json({ success: true, visit: null });
        }

        const decVisit = decryptRecord("patient_visits", visit);

        // Enrich with QR intake if chief_complaints or vitals are missing or if QR session exists
        try {
            const orConds = [];
            if (decVisit.id) orConds.push(`patient_visit_id.eq.${decVisit.id}`);
            if (decVisit.hospital_patient_id) orConds.push(`hospital_patient_id.eq.${decVisit.hospital_patient_id}`);
            if (decVisit.appointment_id) orConds.push(`id.eq.${decVisit.appointment_id}`);

            if (orConds.length > 0) {
                const { data: linkedQr } = await db
                    .from("qr_intake_sessions")
                    .select("id, clinical_intake, safety_status, safety_result, status")
                    .or(orConds.join(","))
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (linkedQr?.clinical_intake) {
                    const qi = linkedQr.clinical_intake;
                    decVisit.qr_intake = qi;
                    decVisit.safety_status = linkedQr.safety_status;

                    if (!decVisit.chief_complaints) {
                        const qrSyms = Array.isArray(qi.symptoms) ? qi.symptoms.join(", ") : (qi.symptoms || "");
                        const parts = [];
                        if (qrSyms) parts.push(`Symptoms: ${qrSyms}`);
                        if (qi.duration) parts.push(`Duration: ${qi.duration}`);
                        if (qi.severity) parts.push(`Severity: ${qi.severity}`);
                        if (qi.location) parts.push(`Location: ${qi.location}`);
                        if (qi.recent_actions) parts.push(`Actions: ${qi.recent_actions}`);
                        decVisit.chief_complaints = parts.join(" | ") || qrSyms || qi.chief_complaint || qi.chiefComplaint || "";
                    }

                    if (!decVisit.intake_vitals || Object.keys(decVisit.intake_vitals).length === 0) {
                        decVisit.intake_vitals = qi.vitals || qi.intake_vitals || {};
                    }
                }
            }
        } catch (e) {
            console.warn("[Queue Visit] QR enrichment notice:", e.message);
        }

        return res.json({
            success: true,
            visit: decVisit
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
