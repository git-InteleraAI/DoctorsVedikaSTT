const express = require("express");
const cors = require("cors");
const PDFDocument = require("pdfkit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const {
    completeConsultation,
    prepareConsultationSummary,
} = require("./consultation/consultationController");

const {
    generateMedicalReportPdf,
    renderPdfToStream,
} = require("./pdf/generateMedicalReportPdf");

const {
    renderPrescriptionPdfToStream,
} = require("./pdf/generatePrescriptionPdf");

const { supabase, supabaseAdmin, isSupabaseConfigured } = require("./config/supabase");
const db = supabaseAdmin || supabase;
const { encryptPayload, decryptRecord } = require("./services/encryptionService");
const { translateFreeTextToTelugu, normalizeBilingualMedicine } = require("./services/translationService");

const app = express();

const PORT = process.env.PORT || 5000;

// Global Process Resilience: Prevent uncaught 429 API quota errors from crashing Node.js server
process.on("unhandledRejection", (reason, promise) => {
    const isQuotaError = reason?.status === 429 || String(reason?.message || reason).includes("429") || String(reason?.message || reason).includes("RESOURCE_EXHAUSTED");
    if (isQuotaError) {
        console.warn("[Process Resilience] Intercepted unhandled Gemini 429 Quota Exceeded error. Server remaining active.", reason?.message || reason);
    } else {
        console.error("[Process Resilience] Unhandled Promise Rejection:", reason);
    }
});

process.on("uncaughtException", (err) => {
    console.error("[Process Resilience] Uncaught Exception:", err);
});

const allowedCorsOrigins = [
    "https://15-252-121-221.sslip.io",
    "http://15-252-121-221.sslip.io",
    "http://localhost:3000",
    "http://localhost:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5000"
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedCorsOrigins.includes(origin) || (origin && origin.endsWith(".sslip.io"))) {
            callback(null, true);
        } else {
            callback(new Error("CORS policy origin not allowed"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Portal-Context", "X-Requested-With"]
}));
app.use(express.json({ limit: "20mb" }));

// =====================================================
// DIRECTORIES
// =====================================================

const consultationUploadDir = path.join(
    __dirname,
    "consultation",
    "uploads"
);

const patientRecordsDir = path.join(
    __dirname,
    "patient-records"
);

const prescriptionDir = path.join(
    patientRecordsDir,
    "prescriptions"
);

const reportsDir = path.join(
    patientRecordsDir,
    "reports"
);

// Create directories if they don't exist
[
    consultationUploadDir,
    patientRecordsDir,
    prescriptionDir,
    reportsDir,
].forEach((directory) => {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, {
            recursive: true,
        });
    }
});

// =====================================================
// MULTER
// =====================================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, consultationUploadDir);
    },

    filename: (req, file, cb) => {
        const extension =
            path.extname(file.originalname) || ".wav";

        cb(
            null,
            `consultation-${Date.now()}${extension}`
        );
    },
});

const upload = multer({
    storage,

    limits: {
        fileSize: 200 * 1024 * 1024,
    },
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        status: "running",
        message: "Doctors Vedika backend is running",
    });
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

app.head("/health", (req, res) => {
    res.status(200).end();
});

app.get("/ping", (req, res) => {
    res.status(200).send("pong");
});

const { geminiRequestManager } = require("./consultation/GeminiRequestManager");
app.get("/api/v1/gemini/metrics", (req, res) => {
    res.json({
        success: true,
        metrics: geminiRequestManager.getMetrics()
    });
});

// =====================================================
// AUTHENTICATION & SUPABASE
// =====================================================
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// =====================================================
// APPOINTMENTS
// =====================================================
const appointmentRoutes = require("./routes/appointmentRoutes");
app.use("/api/appointments", appointmentRoutes);

// =====================================================
// AVAILABILITY & SLOTS
// =====================================================
const availabilityRoutes = require("./routes/availabilityRoutes");
app.use("/api/availability", availabilityRoutes);

// =====================================================
// PATIENTS
// =====================================================
const patientRoutes = require("./routes/patientRoutes");
app.use("/api/patients", patientRoutes);

// =====================================================
// EDUCATIONAL VIDEOS & SHORTS
// =====================================================
const videoRoutes = require("./routes/videoRoutes");
app.use("/api/educational-videos", videoRoutes);

// =====================================================
// Q&A QUESTIONS
// =====================================================
const questionRoutes = require("./routes/questionRoutes");
app.use("/api/questions", questionRoutes);

// =====================================================
// HOSPITAL ADMIN, STAFF & QUEUE API ROUTES (V1 PHASE 2B)
// =====================================================
const hospitalAdminRoutes = require("./routes/hospitalAdmin");
const staffRoutes = require("./routes/staff");
const queueRoutes = require("./routes/queue");
const qrIntakeRoutes = require("./routes/qrIntake");

app.use("/api/v1/hospital-admin", hospitalAdminRoutes);
app.use("/api/v1/staff", staffRoutes);
app.use("/api/v1/queue", queueRoutes);
app.use("/api/v1/public/qr", qrIntakeRoutes);


// =====================================================
// (Legacy duplicate route removed to ensure main clinical save and Supabase sync route is executed)

// =====================================================
// COMPLETE CONSULTATION
// =====================================================

app.post(
    "/api/consultation/complete",
    upload.single("audio"),
    completeConsultation
);

// =====================================================
// PREPARE CONSULTATION (BACKGROUND AI)
// =====================================================

app.post(
    "/api/consultation/prepare",
    prepareConsultationSummary
);

// =====================================================
// PATIENT CLINICAL RECORDS
// =====================================================
//
// THIS IS THE ROUTE YOUR FRONTEND IS CURRENTLY CALLING:
//
// =====================================================
// SAVE COMPLETE CONSULTATION + COMBINED MEDICAL PDF
// =====================================================

const isUuid = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Helper function to resolve valid UUIDs for patient_id, doctor_id, appointment_id and doctor_name from Supabase
async function resolveSupabaseDetails({ patientId, doctorId, appointmentId, reqDoctor = null }) {
    let patUuid = isUuid(patientId) ? patientId : null;
    let docUuid = isUuid(doctorId) ? doctorId : null;
    let appUuid = isUuid(appointmentId) ? appointmentId : null;
    let doctorName = null;

    if (!isSupabaseConfigured || !db) {
        return { patUuid, docUuid, appUuid, doctorName: doctorName || "Doctor", patientDetails: { age: null, gender: null, name: null } };
    }

    let patientDetails = { age: null, gender: null, name: null };

    // 1. Resolve Patient UUID & Details
    if (patientId) {
        try {
            let pData = null;
            let isWalkIn = false;
            if (isUuid(patientId)) {
                const { data } = await db.from("patients").select("id, user_id, full_name, age, gender, date_of_birth").or(`user_id.eq.${patientId},id.eq.${patientId}`).maybeSingle();
                pData = data;
            }
            if (!pData) {
                const cleanId = String(patientId).trim();
                const { data } = await db.from("patients").select("id, user_id, full_name, age, gender, date_of_birth")
                    .or(`patient_code.ilike.${cleanId},full_name.ilike.%${cleanId}%`)
                    .limit(1)
                    .maybeSingle();
                pData = data;
            }
            if (!pData) {
                const cleanId = String(patientId).trim();
                let hprQuery = db.from("hospital_patient_records").select("id, hospital_patient_code, full_name, age, gender, date_of_birth");
                if (isUuid(cleanId)) {
                    hprQuery = hprQuery.eq("id", cleanId);
                } else {
                    hprQuery = hprQuery.or(`hospital_patient_code.ilike.${cleanId},full_name.ilike.%${cleanId}%`);
                }
                const { data: hprData } = await hprQuery.limit(1).maybeSingle();
                if (hprData) {
                    pData = hprData;
                    isWalkIn = true;
                }
            }

            if (pData) {
                patUuid = isWalkIn ? null : (pData.user_id || pData.id);
                let calcAge = pData.age;
                if (!calcAge && pData.date_of_birth) {
                    const dob = new Date(pData.date_of_birth);
                    if (!isNaN(dob.getTime())) {
                        calcAge = String(new Date().getFullYear() - dob.getFullYear());
                    }
                }
                patientDetails = {
                    age: calcAge ? String(calcAge) : null,
                    gender: pData.gender ? String(pData.gender) : null,
                    name: pData.full_name || null,
                };
            }
        } catch (err) {
            console.warn("[DB Helper] Patient resolution notice:", err.message);
        }
    }

    if (appUuid) {
        try {
            const { data: appRow } = await db.from("appointments").select("patient_id, doctor_id, hospital_patient_id").eq("id", appUuid).maybeSingle();
            if (appRow) {
                if (!patUuid && appRow.patient_id) patUuid = appRow.patient_id;
                if (!docUuid && appRow.doctor_id) docUuid = appRow.doctor_id;
            }
        } catch (err) {}
    }

    // 2. Resolve Doctor UUID & Doctor Name
    if (docUuid) {
        try {
            const { data: dData } = await db.from("doctors").select("doctor_id, user_id, doctor_name").or(`doctor_id.eq.${docUuid},user_id.eq.${docUuid}`).maybeSingle();
            if (dData) {
                docUuid = dData.doctor_id || dData.user_id;
                doctorName = dData.doctor_name;
            }
        } catch (err) {}
    }

    if ((!docUuid || !doctorName) && reqDoctor) {
        docUuid = reqDoctor.id || reqDoctor.doctor_id || reqDoctor.userId || docUuid;
        doctorName = reqDoctor.fullName || reqDoctor.doctor_name || reqDoctor.name || doctorName;
    }

    if (!docUuid || !doctorName) {
        try {
            const { data: anyDoc } = await db.from("doctors").select("doctor_id, user_id, doctor_name").limit(1).maybeSingle();
            if (anyDoc) {
                if (!docUuid) docUuid = anyDoc.doctor_id || anyDoc.user_id;
                if (!doctorName) doctorName = anyDoc.doctor_name;
            }
        } catch (err) {}
    }

    if (doctorName && !doctorName.toLowerCase().startsWith("dr")) {
        doctorName = `Dr. ${doctorName}`;
    }

    // 3. Resolve Appointment UUID
    if (!appUuid && patUuid && docUuid) {
        try {
            const { data: appData } = await db
                .from("appointments")
                .select("id")
                .eq("patient_id", patUuid)
                .eq("doctor_id", docUuid)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (appData) {
                appUuid = appData.id;
            } else {
                const { data: anyApp } = await db
                    .from("appointments")
                    .select("id")
                    .eq("patient_id", patUuid)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (anyApp) {
                    appUuid = anyApp.id;
                }
            }
        } catch (err) {}
    }

    if (!appUuid && patUuid && docUuid) {
        try {
            const { data: newApp, error: appInsErr } = await db
                .from("appointments")
                .insert([
                    {
                        patient_id: patUuid,
                        doctor_id: docUuid,
                        appointment_date: new Date().toISOString().split("T")[0],
                        appointment_time: new Date().toLocaleTimeString("en-IN"),
                        status: "completed",
                        payment_method: "pay_at_clinic",
                        payment_status: "pending",
                        reason: "General Consultation",
                    },
                ])
                .select("id")
                .single();

            if (newApp) {
                appUuid = newApp.id;
                console.log("[DB Helper] Created fallback appointment record:", appUuid);
            } else if (appInsErr) {
                console.warn("[DB Helper] Appointment creation notice:", appInsErr.message);
            }
        } catch (err) {
            console.warn("[DB Helper] Appointment creation exception:", err.message);
        }
    }

    return { patUuid, docUuid, appUuid, doctorName, patientDetails };
}

function formatFollowUpDate(val) {
    if (!val || typeof val !== "string") return null;
    const trimmed = val.trim();
    if (!trimmed || trimmed.toLowerCase() === "none" || trimmed.toLowerCase() === "n/a") return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
    }
    return null;
}

function formatAdvice(val) {
    if (!val) return null;
    if (Array.isArray(val)) {
        const joined = val.filter(Boolean).join("\n");
        return joined.trim() || null;
    }
    const str = String(val).trim();
    return str || null;
}

function formatMedicines(meds, rx) {
    let list = Array.isArray(meds) && meds.length > 0 ? meds : null;
    if (!list && rx) {
        if (Array.isArray(rx.medications) && rx.medications.length > 0) list = rx.medications;
        else if (Array.isArray(rx.medicines) && rx.medicines.length > 0) list = rx.medicines;
    }
    return Array.isArray(list) ? list : [];
}

// Generate prescription and save clinical report
app.post(
    ["/api/v1/clinical/notes", "/api/prescription/generate"],
    async (req, res) => {
        try {
            const {
                patientId,
                doctorId,
                appointmentId,
                patientName,
                consultationDate,
                consultationTime,
                transcript,
                summary,
                diagnosis,
                medications,
                prescription,
            } = req.body || {};

            if (!patientId && !req.body.hospitalPatientId && !req.body.appointmentId) {
                return res.status(400).json({
                    success: false,
                    message: "patientId, hospitalPatientId, or appointmentId is required",
                });
            }

            // Resolve Supabase valid UUIDs, doctor name & patient details
            const { patUuid, docUuid, appUuid, doctorName, patientDetails } = await resolveSupabaseDetails({
                patientId,
                doctorId,
                appointmentId,
                reqDoctor: req.doctor,
            });

            const now = new Date();
            const savedDate = consultationDate || now.toISOString().split("T")[0];
            const savedTime = consultationTime || now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

            const patientFolder = path.join(
                patientRecordsDir,
                String(patientId)
            );
            fs.mkdirSync(patientFolder, { recursive: true });

            const resolvedAppId = appUuid || appointmentId || req.body.appointmentId;
            const consultationId = req.body.consultationId || req.body.consultation_id || req.body.id || (resolvedAppId ? `consultation-app-${resolvedAppId}` : `consultation-pat-${patientId}`);
            const isCompleted = req.body.completed === true || String(req.body.status || "").toLowerCase() === "completed";

            const finalAge = req.body.patientAge || req.body.age || req.body.patient?.age || patientDetails?.age || null;
            const finalGender = req.body.patientGender || req.body.gender || req.body.patient?.gender || patientDetails?.gender || null;
            const finalName = patientName || req.body.patientName || req.body.patient?.name || patientDetails?.name || "Unknown Patient";

            const s = summary || {};
            const patientRecord = {
                consultationId,
                doctorId: docUuid || doctorId || "default-doctor",
                doctorName: doctorName || req.body.doctorName || req.doctor?.fullName || req.doctor?.name || "Doctor",
                patientId,
                patientName: finalName,
                patientAge: finalAge,
                patientGender: finalGender,
                age: finalAge,
                gender: finalGender,
                patient: {
                    id: patientId,
                    name: finalName,
                    age: finalAge,
                    gender: finalGender,
                },
                appointmentId: appUuid || appointmentId || null,
                consultationDate: savedDate,
                consultationTime: savedTime,
                savedAt: now.toISOString(),
                status: isCompleted ? "Completed" : "Saved",
                completed: isCompleted,
                completedAt: isCompleted ? now.toISOString() : null,
                transcript: Array.isArray(transcript) ? transcript : [],
                summary: s,
                diagnosis: Array.isArray(diagnosis) ? diagnosis : [],
                medications: formatMedicines(medications, prescription),
                prescription: prescription || null,
                pdfUrl: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
            };

            // Save JSON record to local disk storage
            try {
                fs.writeFileSync(
                    path.join(patientFolder, `${consultationId}.json`),
                    JSON.stringify(patientRecord, null, 2)
                );
            } catch (diskWriteErr) {
                console.warn("[Clinical Save] Unable to write local JSON record to disk:", diskWriteErr.message);
            }

            // Save strictly to public.consultation_notes, public.prescriptions, and public.appointments in Supabase
            const targetDb = supabaseAdmin || db || supabase;
            if (isSupabaseConfigured && targetDb) {
                try {
                    let resolvedAppUuid = appUuid;
                    let resolvedDocUuid = docUuid;
                    let resolvedPatUuid = patUuid;

                    if (!resolvedAppUuid || !resolvedDocUuid) {
                        const details = await resolveSupabaseDetails({
                            patientId: patientId,
                            doctorId: doctorId || req.doctor?.id,
                            appointmentId: appointmentId || appUuid,
                            reqDoctor: req.doctor,
                        });
                        resolvedAppUuid = details.appUuid;
                        resolvedDocUuid = details.docUuid;
                        resolvedPatUuid = details.patUuid;
                    }

                    if (resolvedAppUuid || req.body.visit_id || req.body.visitId || resolvedPatUuid) {
                        const nowIso = new Date().toISOString();
                        
                        // Update appointments status to completed
                        if (resolvedAppUuid) {
                            await targetDb
                                .from("appointments")
                                .update({ status: "completed", updated_at: nowIso })
                                .eq("id", resolvedAppUuid);
                        }

                        // Update patient_visits visit_stage to completed
                        const isUuidStr = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                        const visitConds = [];
                        if (resolvedAppUuid) visitConds.push(`appointment_id.eq.${resolvedAppUuid}`);
                        if (req.body.visit_id || req.body.visitId) visitConds.push(`id.eq.${req.body.visit_id || req.body.visitId}`);
                        if (resolvedPatUuid && isUuidStr(resolvedPatUuid)) {
                            visitConds.push(`hospital_patient_id.eq.${resolvedPatUuid}`);
                            visitConds.push(`patient_id.eq.${resolvedPatUuid}`);
                        }

                        if (visitConds.length > 0) {
                            await targetDb
                                .from("patient_visits")
                                .update({
                                    visit_stage: "completed",
                                    status: "completed",
                                    completed_at: nowIso,
                                    consultation_completed_at: nowIso,
                                    updated_at: nowIso
                                })
                                .or(visitConds.join(","));
                        }

                        const formattedNotesText = req.body.notes || [
                            s.consultationOverview || s.consultation_overview || "",
                            s.chiefComplaint || s.chief_complaint || "",
                            s.historyOfPresentIllness || s.history_of_present_illness || "",
                            s.assessment || "",
                            s.treatmentPlan || s.treatment_plan || "",
                            s.doctorNotes || s.doctor_notes || s.notes || "",
                        ].filter((val) => val && String(val).trim()).join("\n\n");

                        const symptomsText = req.body.symptoms || (Array.isArray(s.symptoms)
                            ? s.symptoms.filter(Boolean).join(", ")
                            : String(s.symptoms || s.presentingSymptoms || s.presenting_symptoms || "No symptoms recorded"));

                        const diagnosisText = req.body.diagnosis || (Array.isArray(s.diagnosis)
                            ? s.diagnosis.filter(Boolean).join(", ")
                            : String(s.diagnosis || ""));

                        const rawAudioTranscript = req.body.audio_transcript || (Array.isArray(transcript) && transcript.length > 0
                            ? transcript.map((item) => `[${item?.timestamp || ""}] ${item?.speaker || "Conversation"}: ${item?.text || ""}`).join("\n")
                            : null);

                        const fullSummaryData = {
                            chief_complaint: s.chiefComplaint || s.chief_complaint || "",
                            consultation_overview: s.consultationOverview || s.consultation_overview || "",
                            history_of_present_illness: s.historyOfPresentIllness || s.history_of_present_illness || "",
                            symptoms: symptomsText,
                            past_medical_history: s.pastMedicalHistory || s.past_medical_history || "",
                            allergies: s.allergies || "",
                            current_medications: s.currentMedications || s.current_medications || "",
                            examination_findings: s.examinationFindings || s.examination_findings || "",
                            vital_signs: s.vitalSigns || s.vital_signs || {},
                            investigations: s.investigations || "",
                            assessment: s.assessment || "",
                            diagnosis: diagnosisText,
                            differential_diagnosis: s.differentialDiagnosis || s.differential_diagnosis || "",
                            treatment_plan: s.treatmentPlan || s.treatment_plan || "",
                            advice: formatAdvice(prescription?.advice || s.advice),
                            follow_up: formatFollowUpDate(prescription?.follow_up_date || prescription?.follow_up),
                            doctor_notes: s.doctorNotes || s.doctor_notes || s.notes || "",
                            red_flags: s.redFlags || s.red_flags || "",
                            medications_discussed: formatMedicines(medications, prescription),
                            medicines: formatMedicines(medications, prescription),
                        };

                        const notesStorageString = JSON.stringify({
                            text: formattedNotesText || "Consultation completed.",
                            summary: fullSummaryData
                        });

                        const hospitalId = req.doctor?.hospital_id || req.body.hospitalId || req.body.hospital_id || null;

                        const noteRecord = {
                            appointment_id: resolvedAppUuid,
                            doctor_id: resolvedDocUuid,
                            patient_id: resolvedPatUuid || (isUuid(patientId) ? patientId : '00000000-0000-0000-0000-000000000000'),
                            notes: notesStorageString,
                            symptoms: symptomsText || "No symptoms recorded",
                            diagnosis: diagnosisText || null,
                            language: req.body.language || s.detected_language || "English",
                            audio_transcript: rawAudioTranscript,
                            audio_url: req.body.audio_url || req.body.audioUrl || null,
                            visit_id: req.body.visit_id || req.body.visitId || null,
                            hospital_id: hospitalId,
                            updated_at: new Date().toISOString(),
                        };

                        const encNoteRecord = encryptPayload("consultation_notes", noteRecord);
                        const { error: noteErr } = await targetDb.from("consultation_notes").upsert(encNoteRecord, { onConflict: "appointment_id" });
                        if (noteErr) console.warn("[Clinical Save] consultation_notes sync warning:", noteErr.message);
                        else console.log("[Clinical Save] Successfully synced to public.consultation_notes table.");

                        const prescriptionRecord = {
                            appointment_id: resolvedAppUuid,
                            doctor_id: resolvedDocUuid,
                            patient_id: resolvedPatUuid || (isUuid(patientId) ? patientId : '00000000-0000-0000-0000-000000000000'),
                            medicines: formatMedicines(medications, prescription),
                            advice: formatAdvice(prescription?.advice || s.advice),
                            follow_up_date: formatFollowUpDate(prescription?.follow_up_date || prescription?.follow_up),
                            pdf_url: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
                            visit_id: req.body.visit_id || req.body.visitId || null,
                            hospital_id: hospitalId,
                            updated_at: new Date().toISOString(),
                        };

                        const encPrescriptionRecord = encryptPayload("prescriptions", prescriptionRecord);
                        const { error: rxErr } = await targetDb.from("prescriptions").upsert(encPrescriptionRecord, { onConflict: "appointment_id" });
                        if (rxErr) console.warn("[Clinical Save] prescriptions sync warning:", rxErr.message);
                        else console.log("[Clinical Save] Successfully synced to public.prescriptions table.");
                    } else {
                        console.warn("[Clinical Save] Could not resolve complete UUIDs for DB sync:", { resolvedAppUuid, resolvedDocUuid, resolvedPatUuid });
                    }

                } catch (dbErr) {
                    console.warn("[Clinical Save] Supabase sync exception:", dbErr.message);
                }
            }

            return res.status(201).json({
                success: true,
                message: "Consultation saved to Supabase successfully.",
                consultationId,
                patientId,
                appointmentId: appointmentId || null,
                consultationDate: savedDate,
                consultationTime: savedTime,
                status: patientRecord.status,
                record: patientRecord,
                files: {
                    pdfUrl: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
                },
            });
        } catch (error) {
            console.error("[Clinical Save] FAILED:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to save consultation.",
                error: error.message,
            });
        }
    }
);

function resolvePatientFolder(patientId) {
    const rawId = String(patientId || "").trim();
    if (!rawId) return path.join(patientRecordsDir, "unknown");
    const slugId = rawId.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
    const candidates = [
        path.join(patientRecordsDir, rawId),
        path.join(patientRecordsDir, slugId),
        path.join(patientRecordsDir, rawId.replace(/\s+/g, "-")),
        path.join(patientRecordsDir, rawId.replace(/-/g, " ")),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    // Deep scan subdirectories in patientRecordsDir to match records by UUID, patientCode, displayPatientId, or appointmentId
    try {
        if (fs.existsSync(patientRecordsDir)) {
            const subdirs = fs.readdirSync(patientRecordsDir);
            for (const sub of subdirs) {
                if (sub === "prescriptions" || sub === "reports") continue;
                const subPath = path.join(patientRecordsDir, sub);
                if (fs.statSync(subPath).isDirectory()) {
                    const files = fs.readdirSync(subPath).filter(f => f.endsWith(".json"));
                    for (const f of files) {
                        try {
                            const content = JSON.parse(fs.readFileSync(path.join(subPath, f), "utf8"));
                            if (
                                content.patientId === rawId ||
                                content.patient_id === rawId ||
                                content.patientCode === rawId ||
                                content.displayPatientId === rawId ||
                                content.appointmentId === rawId
                            ) {
                                return subPath;
                            }
                        } catch (err) {}
                    }
                }
            }
        }
    } catch (e) {}

    return path.join(patientRecordsDir, slugId || rawId);
}

// =====================================================
// BILINGUAL TRANSLATION ROUTE FOR PRESCRIPTIONS
// =====================================================
app.post("/api/v1/clinical/translate", async (req, res) => {
    try {
        const { text, medicine } = req.body || {};
        if (medicine && typeof medicine === "object") {
            const normalized = normalizeBilingualMedicine(medicine);
            if (medicine.instructions && !normalized.instructions_te) {
                normalized.instructions_te = await translateFreeTextToTelugu(medicine.instructions);
            }
            return res.json({ success: true, medicine: normalized });
        }
        const translatedText = await translateFreeTextToTelugu(text || "");
        return res.json({ success: true, translatedText });
    } catch (err) {
        console.error("[Translate Endpoint Error]:", err);
        return res.status(500).json({ success: false, error: err.message, translatedText: req.body?.text || "" });
    }
});

// =====================================================
// VIEW THE COMBINED PDF FOR A PATIENT CONSULTATION
// =====================================================
// =====================================================
// VIEW THE COMBINED PDF FOR A PATIENT CONSULTATION (Streamed directly from Supabase DB)
// =====================================================
app.get(
    "/api/v1/clinical/notes/:patientId/:consultationId/pdf",
    async (req, res) => {
        try {
            const { patientId, consultationId } = req.params;
            const targetDb = supabaseAdmin || db || supabase;

            let note = null;
            let rx = null;
            let patient = null;
            let doctor = null;
            let appointment = null;
            let visitData = null;
            let docId = null;

            const rawAppId = consultationId.replace("consultation-app-", "").replace("consultation-db-", "");

            if (isSupabaseConfigured && targetDb) {
                // 1. Fetch appointment first
                if (isUuid(rawAppId)) {
                    const { data: appData } = await targetDb
                        .from("appointments")
                        .select("*")
                        .eq("id", rawAppId)
                        .maybeSingle();
                    appointment = appData;
                }

                // 2. Fetch patient using patientId or appointment.patient_id safely
                if (isUuid(patientId)) {
                    const { data: pData } = await targetDb
                        .from("patients")
                        .select("*")
                        .or(`id.eq.${patientId},user_id.eq.${patientId}`)
                        .maybeSingle();
                    patient = pData;
                } else if (patientId) {
                    const { data: pData } = await targetDb
                        .from("patients")
                        .select("*")
                        .eq("patient_code", patientId)
                        .maybeSingle();
                    patient = pData;
                }

                if (!patient && appointment?.patient_id && isUuid(appointment.patient_id)) {
                    const { data: pData } = await targetDb
                        .from("patients")
                        .select("*")
                        .or(`id.eq.${appointment.patient_id},user_id.eq.${appointment.patient_id}`)
                        .maybeSingle();
                    patient = pData;
                }

                if (!patient && patientId) {
                    let hprQuery = targetDb.from("hospital_patient_records").select("*");
                    if (isUuid(patientId)) {
                        hprQuery = hprQuery.or(`id.eq.${patientId},patient_id.eq.${patientId}`);
                    } else {
                        hprQuery = hprQuery.eq("hospital_patient_code", patientId);
                    }
                    const { data: hprDirect } = await hprQuery.maybeSingle();
                    if (hprDirect) {
                        const decHpr = decryptRecord("hospital_patient_records", hprDirect);
                        patient = {
                            id: decHpr.id,
                            full_name: decHpr.full_name || `${decHpr.first_name || ""} ${decHpr.last_name || ""}`.trim(),
                            first_name: decHpr.first_name,
                            last_name: decHpr.last_name,
                            patient_code: decHpr.hospital_patient_code,
                            gender: decHpr.gender,
                            date_of_birth: decHpr.date_of_birth
                        };
                    }
                }

                if (!patient && appointment?.hospital_patient_id) {
                    const { data: hprData } = await targetDb
                        .from("hospital_patient_records")
                        .select("*")
                        .eq("id", appointment.hospital_patient_id)
                        .maybeSingle();
                    if (hprData) {
                        const decHpr = decryptRecord("hospital_patient_records", hprData);
                        patient = {
                            id: decHpr.id,
                            full_name: decHpr.full_name || `${decHpr.first_name || ""} ${decHpr.last_name || ""}`.trim(),
                            first_name: decHpr.first_name,
                            last_name: decHpr.last_name,
                            patient_code: decHpr.hospital_patient_code,
                            gender: decHpr.gender,
                            date_of_birth: decHpr.date_of_birth
                        };
                    }
                }

                // If appointment wasn't fetched yet by UUID, find the latest appointment for this patient
                if (!appointment && patient) {
                    const patId = patient.id || patient.user_id;
                    if (patId) {
                        const { data: latestApp } = await targetDb
                            .from("appointments")
                            .select("*")
                            .or(`patient_id.eq.${patId},hospital_patient_id.eq.${patId}`)
                            .order("created_at", { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (latestApp) appointment = latestApp;
                    }
                }

                // 3. Fetch consultation note
                if (isUuid(rawAppId)) {
                    const { data: notesData } = await targetDb
                        .from("consultation_notes")
                        .select("*")
                        .eq("appointment_id", rawAppId)
                        .maybeSingle();
                    note = notesData;
                }

                if (!note && appointment?.id && isUuid(appointment.id)) {
                    const { data: notesData } = await targetDb
                        .from("consultation_notes")
                        .select("*")
                        .eq("appointment_id", appointment.id)
                        .maybeSingle();
                    if (notesData) note = notesData;
                }

                if (!note && patient) {
                    const patUuid = patient.id || patient.user_id;
                    if (patUuid && isUuid(patUuid)) {
                        const { data: notesData } = await targetDb
                            .from("consultation_notes")
                            .select("*")
                            .eq("patient_id", patUuid)
                            .order("created_at", { ascending: false });
                        if (notesData && notesData.length > 0) note = notesData[0];
                    }
                }

                const targetAppId = note?.appointment_id || (isUuid(rawAppId) ? rawAppId : appointment?.id);

                // 4. Fetch prescription
                if (targetAppId && isUuid(targetAppId)) {
                    const { data: rxData } = await targetDb
                        .from("prescriptions")
                        .select("*")
                        .eq("appointment_id", targetAppId)
                        .maybeSingle();
                    rx = rxData;
                }

                // 5. Fetch doctor & visit record for vitals/DOB
                docId = note?.doctor_id || appointment?.doctor_id || rx?.doctor_id || null;
                if (docId && isUuid(docId)) {
                    const { data: docData } = await targetDb
                        .from("doctors")
                        .select("*")
                        .or(`doctor_id.eq.${docId},user_id.eq.${docId}`)
                        .maybeSingle();
                    doctor = docData;

                    if (!doctor) {
                        const { data: memberData } = await targetDb
                            .from("hospital_members")
                            .select("doctor_id, user_id")
                            .or(`id.eq.${docId},user_id.eq.${docId},doctor_id.eq.${docId}`)
                            .limit(1)
                            .maybeSingle();
                        const resolvedDocUuid = memberData?.doctor_id || memberData?.user_id;
                        if (resolvedDocUuid && isUuid(resolvedDocUuid)) {
                            const { data: fallbackDoc } = await targetDb
                                .from("doctors")
                                .select("*")
                                .or(`doctor_id.eq.${resolvedDocUuid},user_id.eq.${resolvedDocUuid}`)
                                .maybeSingle();
                            if (fallbackDoc) doctor = fallbackDoc;
                        }
                    }

                    if (!doctor) {
                        const { data: userData } = await targetDb
                            .from("users")
                            .select("*")
                            .eq("id", docId)
                            .maybeSingle();
                        if (userData) {
                            doctor = {
                                doctor_name: userData.full_name || `${userData.first_name || ""} ${userData.last_name || ""}`.trim(),
                                doctor_email: userData.email,
                                doctor_mobile: userData.phone,
                            };
                        }
                    }
                }

                visitData = null;
                const targetVisitId = note?.visit_id || rawAppId;
                if (targetVisitId) {
                    const { data: vData } = await targetDb
                        .from("patient_visits")
                        .select("id, intake_vitals, chief_complaints, hospital_patient_records(date_of_birth, gender, full_name, hospital_patient_code)")
                        .or(`id.eq.${targetVisitId},appointment_id.eq.${targetVisitId},hospital_patient_id.eq.${targetVisitId},patient_id.eq.${targetVisitId}`)
                        .limit(1)
                        .maybeSingle();
                    visitData = vData;
                }

                if (patient) patient = decryptRecord("patients", patient);
                if (note) note = decryptRecord("consultation_notes", note);
                if (rx) rx = decryptRecord("prescriptions", rx);
                if (visitData) visitData = decryptRecord("patient_visits", visitData);
            }

            const patientName = patient?.full_name || `${patient?.first_name || ""}`.trim() || visitData?.hospital_patient_records?.full_name || "Patient";
            const patientDob = patient?.date_of_birth || visitData?.hospital_patient_records?.date_of_birth || null;

            let age = null;
            if (patientDob) {
                const dob = new Date(patientDob);
                const diffMs = Date.now() - dob.getTime();
                age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
            }

            // Parse full summary object from JSON string, object, or paragraphs
            let summaryObj = {};
            if (note?.notes) {
                try {
                    if (typeof note.notes === "object") {
                        summaryObj = note.notes.summary || note.notes;
                    } else if (typeof note.notes === "string" && note.notes.trim().startsWith("{")) {
                        const parsed = JSON.parse(note.notes);
                        summaryObj = parsed.summary || parsed;
                    }
                } catch (e) {}
            }

            if (!summaryObj || typeof summaryObj !== "object" || Object.keys(summaryObj).length === 0) {
                // Fallback to local JSON record on disk if DB record is empty/missing
                try {
                    const folder = resolvePatientFolder(patientId);
                    const jsonFile = path.join(folder, `${consultationId}.json`);
                    let localRecord = null;
                    if (fs.existsSync(jsonFile)) {
                        localRecord = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
                    } else if (fs.existsSync(folder)) {
                        const files = fs.readdirSync(folder).filter(f => f.endsWith(".json"));
                        if (files.length > 0) {
                            localRecord = JSON.parse(fs.readFileSync(path.join(folder, files[files.length - 1]), "utf8"));
                        }
                    }

                    if (localRecord && localRecord.summary) {
                        summaryObj = localRecord.summary;
                    }
                } catch (diskFallbackErr) {
                    console.warn("[Clinical PDF] Disk fallback read notice:", diskFallbackErr.message);
                }
            }

            if (!summaryObj || typeof summaryObj !== "object" || Object.keys(summaryObj).length === 0) {
                const notesStr = typeof note?.notes === "string" ? note.notes : (note?.notes ? JSON.stringify(note.notes) : "");
                const paragraphs = notesStr.split("\n\n").map(p => p.trim()).filter(Boolean);
                summaryObj = {
                    consultation_overview: paragraphs[0] || "",
                    chief_complaint: paragraphs[1] || appointment?.reason || visitData?.chief_complaints || "",
                    history_of_present_illness: paragraphs[2] || "",
                    symptoms: note?.symptoms || visitData?.chief_complaints || "",
                    assessment: paragraphs[3] || "",
                    treatment_plan: paragraphs[4] || "",
                    advice: rx?.advice || "",
                    follow_up: rx?.follow_up_date || "",
                    doctor_notes: paragraphs[5] || "",
                };
            }

            if (visitData?.intake_vitals) {
                const iv = visitData.intake_vitals;
                summaryObj.vital_signs = {
                    ...(summaryObj.vital_signs || {}),
                    blood_pressure: iv.bp || iv.blood_pressure || iv.bloodPressure || summaryObj.vital_signs?.blood_pressure || "",
                    heart_rate: iv.pulse || iv.heart_rate || iv.heartRate || summaryObj.vital_signs?.heart_rate || "",
                    temperature: iv.temperature || iv.temp || summaryObj.vital_signs?.temperature || "",
                    respiratory_rate: iv.respiratory_rate || iv.respiratoryRate || summaryObj.vital_signs?.respiratory_rate || "",
                    oxygen_saturation: iv.spo2 || iv.oxygen_saturation || summaryObj.vital_signs?.oxygen_saturation || "",
                    weight: iv.weight || summaryObj.vital_signs?.weight || "",
                    height: iv.height || summaryObj.vital_signs?.height || "",
                    blood_group: iv.bloodGroup || iv.blood_group || summaryObj.vital_signs?.blood_group || "",
                    allergies: iv.allergies || summaryObj.vital_signs?.allergies || "",
                };
            }

            let parsedDiagnosis = [];
            if (note?.diagnosis) {
                try {
                    if (Array.isArray(note.diagnosis)) {
                        parsedDiagnosis = note.diagnosis;
                    } else if (typeof note.diagnosis === "object") {
                        parsedDiagnosis = [JSON.stringify(note.diagnosis)];
                    } else {
                        parsedDiagnosis = typeof note.diagnosis === "string" && note.diagnosis.startsWith("[")
                            ? JSON.parse(note.diagnosis)
                            : String(note.diagnosis).split(", ").map(s => s.trim()).filter(Boolean);
                    }
                } catch (e) {
                    parsedDiagnosis = [String(note.diagnosis)];
                }
            }

            let hospital = null;
            const hospitalId = rx?.hospital_id || note?.hospital_id || appointment?.hospital_id || null;
            if (hospitalId && isUuid(hospitalId)) {
                const { data: hospitalData } = await targetDb
                    .from("hospitals")
                    .select("id, name, address, phone, email, code")
                    .eq("id", hospitalId)
                    .maybeSingle();
                hospital = hospitalData;
            }

            if (!hospital && (docId || doctor)) {
                const searchDocId = doctor?.doctor_id || doctor?.user_id || docId;
                if (searchDocId && isUuid(searchDocId)) {
                    const { data: memberData } = await targetDb
                        .from("hospital_members")
                        .select("hospital_id, hospitals(id, name, address, phone, email, code)")
                        .or(`doctor_id.eq.${searchDocId},user_id.eq.${searchDocId}`)
                        .limit(1)
                        .maybeSingle();
                    if (memberData?.hospitals) {
                        hospital = memberData.hospitals;
                    } else if (memberData?.hospital_id) {
                        const { data: hData } = await targetDb
                            .from("hospitals")
                            .select("id, name, address, phone, email, code")
                            .eq("id", memberData.hospital_id)
                            .maybeSingle();
                        hospital = hData;
                    }
                }
            }

            const doctorSpecialty = doctor?.doctor_specialization || doctor?.specialization || doctor?.specialty || doctor?.doctor_specialty || doctor?.speciality || "";
            const doctorQualification = doctor?.doctor_qualification || doctor?.qualification || doctor?.qualifications || doctor?.degrees || "";
            const doctorRegNo = doctor?.doctor_registration_number || doctor?.registration_number || doctor?.reg_number || doctor?.reg_no || doctor?.registrationNumber || "";
            const rawDocName = doctor?.doctor_name || doctor?.full_name || doctor?.name;
            let doctorName = rawDocName ? (rawDocName.toLowerCase().startsWith('dr') ? rawDocName : `Dr. ${rawDocName}`) : "";
            if (!doctorName) {
                const fallbackDoc = summaryObj.doctorName || summaryObj.doctor_name || summaryObj.doctor;
                if (fallbackDoc) {
                    doctorName = fallbackDoc.toLowerCase().startsWith('dr') ? fallbackDoc : `Dr. ${fallbackDoc}`;
                }
            }

            const clinicName = hospital?.name || doctor?.doctor_clinic_name || doctor?.clinic_name || doctor?.clinicName || "";
            const clinicAddress = hospital?.address || doctor?.doctor_clinic_address || doctor?.clinic_address || doctor?.clinicAddress || "";
            const clinicPhone = hospital?.phone || doctor?.doctor_mobile || doctor?.doctor_phone || doctor?.phone || "";
            const clinicEmail = hospital?.email || doctor?.doctor_email || doctor?.email || "";

            const finalMedicinesList = (Array.isArray(rx?.medicines) && rx.medicines.length > 0)
                ? rx.medicines
                : ((Array.isArray(summaryObj.medications_discussed) && summaryObj.medications_discussed.length > 0)
                    ? summaryObj.medications_discussed
                    : (Array.isArray(summaryObj.medicines) ? summaryObj.medicines : []));

            const patientRecord = {
                consultationId,
                appointmentId: rawAppId,
                patientId: patient?.patient_code || visitData?.hospital_patient_records?.hospital_patient_code || patientId,
                patientName: patientName,
                dateOfBirth: patientDob,
                patientAge: age || patient?.age || null,
                patientGender: patient?.gender || visitData?.hospital_patient_records?.gender || "Unknown",
                doctorName: doctorName,
                doctorSpecialty: doctorSpecialty,
                doctorQualification: doctorQualification,
                doctorRegNo: doctorRegNo,
                doctorPhone: doctor?.doctor_phone || doctor?.phone || "",
                doctorEmail: doctor?.doctor_email || doctor?.email || "",
                clinicName: clinicName,
                clinicAddress: clinicAddress,
                clinicPhone: clinicPhone,
                clinicEmail: clinicEmail,
                hospitalName: hospital?.name || clinicName || "",
                hospitalAddress: hospital?.address || clinicAddress || "",
                hospitalPhone: hospital?.phone || clinicPhone || "",
                hospitalEmail: hospital?.email || clinicEmail || "",
                hospitalCode: hospital?.code || "",
                visitType: appointment?.appointment_type || "Consultation",
                consultationDate: appointment?.appointment_date || (note?.created_at ? new Date(note.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })),
                consultationTime: note?.created_at ? new Date(note.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : (rx?.created_at ? new Date(rx.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : ((appointment?.appointment_time && !String(appointment.appointment_time).startsWith('05:30') && !String(appointment.appointment_time).startsWith('00:00')) ? appointment.appointment_time : new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }))),
                summary: summaryObj,
                diagnosis: parsedDiagnosis,
                medications: finalMedicinesList,
                prescription: {
                    medicines: finalMedicinesList,
                    advice: rx?.advice || summaryObj.advice || summaryObj.treatment_plan || "",
                    follow_up_date: rx?.follow_up_date || note?.follow_up_date || summaryObj.follow_up || summaryObj.follow_up_date || "",
                    follow_up_instructions: rx?.follow_up_instructions || note?.follow_up_instructions || summaryObj.follow_up_instructions || ""
                }
            };

            const safeName = patientName.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();

            /*
             * JSON representation for Consultation Summary editing.
             */
            if (req.query.format === "json") {
                return res.json({ success: true, record: patientRecord });
            }

            /*
             * Prescription-only document.
             */
            if (req.query.document === "prescription") {
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", `inline; filename="prescription-${consultationId}-${safeName}.pdf"`);
                return renderPrescriptionPdfToStream(patientRecord, res);
            }

            /*
             * Existing full report remains unchanged.
             */
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${consultationId}-${safeName}.pdf"`);
            return renderPdfToStream(patientRecord, res);

        } catch (error) {
            console.error("[Clinical PDF] View failed:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to open consultation PDF.",
                error: error.message,
            });
        }
    }
);

// =====================================================
// EDIT CLINICAL CONSULTATION REPORT (UPDATE EXISTING RECORD)
// =====================================================
app.patch(
    "/api/v1/clinical/notes/:patientId/:consultationId",
    async (req, res) => {
        try {
            const { patientId, consultationId } = req.params;
            const { summary = {}, diagnosis = [], medications = [], prescription = {} } = req.body || {};

            const targetDb = supabaseAdmin || db || supabase;
            const rawAppId = consultationId.replace("consultation-app-", "").replace("consultation-db-", "");

            /*
             * Load current consultation so IDs and audit context are preserved.
             */
            let existingEncryptedNote = null;
            if (isSupabaseConfigured && targetDb) {
                if (isUuid(rawAppId)) {
                    const { data } = await targetDb
                        .from("consultation_notes")
                        .select("*")
                        .eq("appointment_id", rawAppId)
                        .maybeSingle();
                    existingEncryptedNote = data;
                }
                if (!existingEncryptedNote && isUuid(consultationId)) {
                    const { data } = await targetDb
                        .from("consultation_notes")
                        .select("*")
                        .eq("appointment_id", consultationId)
                        .maybeSingle();
                    existingEncryptedNote = data;
                }
                if (!existingEncryptedNote && isUuid(patientId)) {
                    const { data } = await targetDb
                        .from("consultation_notes")
                        .select("*")
                        .eq("patient_id", patientId)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    existingEncryptedNote = data;
                }
            }

            const existingNote = existingEncryptedNote ? decryptRecord("consultation_notes", existingEncryptedNote) : {};
            let previousNotes = {};
            try {
                previousNotes = typeof existingNote.notes === "string"
                    ? JSON.parse(existingNote.notes)
                    : existingNote.notes || {};
            } catch {
                previousNotes = { text: existingNote.notes || "" };
            }

            const finalSummary = {
                ...summary,
                medications_discussed: medications,
            };

            const notesStorage = JSON.stringify({
                ...previousNotes,
                summary: finalSummary,
            });

            const { patUuid, docUuid, appUuid } = await resolveSupabaseDetails({
                patientId,
                doctorId: existingNote?.doctor_id,
                appointmentId: rawAppId,
                reqDoctor: req.doctor,
            });

            const targetAppId = existingNote?.appointment_id || appUuid || (isUuid(rawAppId) ? rawAppId : (isUuid(consultationId) ? consultationId : null));
            const targetDocId = existingNote?.doctor_id || docUuid || null;
            const targetPatId = existingNote?.patient_id || patUuid || (isUuid(patientId) ? patientId : null);

            if (targetAppId) {
                const nowIso = new Date().toISOString();

                // Update appointments status to completed
                await targetDb
                    .from("appointments")
                    .update({ status: "completed", updated_at: nowIso })
                    .eq("id", targetAppId);

                // Update patient_visits visit_stage to completed
                const visitConds = [`appointment_id.eq.${targetAppId}`];
                if (targetPatId) {
                    visitConds.push(`hospital_patient_id.eq.${targetPatId}`);
                    visitConds.push(`patient_id.eq.${targetPatId}`);
                }
                await targetDb
                    .from("patient_visits")
                    .update({
                        visit_stage: "completed",
                        status: "completed",
                        completed_at: nowIso,
                        consultation_completed_at: nowIso,
                        updated_at: nowIso
                    })
                    .or(visitConds.join(","));

                const noteRecord = {
                    appointment_id: targetAppId,
                    doctor_id: targetDocId,
                    patient_id: targetPatId,
                    notes: notesStorage,
                    symptoms: Array.isArray(summary.symptoms)
                        ? summary.symptoms.join(", ")
                        : String(summary.symptoms || existingNote.symptoms || ""),
                    diagnosis: Array.isArray(diagnosis)
                        ? diagnosis.join(", ")
                        : String(diagnosis || ""),
                    updated_at: nowIso,
                };

                const notePayload = encryptPayload("consultation_notes", noteRecord);
                const { error: noteUpsertError } = await targetDb
                    .from("consultation_notes")
                    .upsert(notePayload, { onConflict: "appointment_id" });

                if (noteUpsertError) {
                    console.warn("[Clinical PATCH] Note upsert notice:", noteUpsertError.message);
                } else {
                    console.log("[Clinical PATCH] Successfully synced to public.consultation_notes table.");
                }

                const prescriptionRecord = {
                    appointment_id: targetAppId,
                    doctor_id: targetDocId,
                    patient_id: targetPatId,
                    medicines: medications,
                    advice: formatAdvice(prescription.advice || summary.advice),
                    follow_up_date: formatFollowUpDate(prescription.follow_up_date || prescription.follow_up || summary.follow_up),
                    pdf_url: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
                    updated_at: nowIso,
                };

                const prescriptionPayload = encryptPayload("prescriptions", prescriptionRecord);
                const { error: rxUpsertError } = await targetDb
                    .from("prescriptions")
                    .upsert(prescriptionPayload, { onConflict: "appointment_id" });

                if (rxUpsertError) {
                    console.warn("[Clinical PATCH] Prescription upsert notice:", rxUpsertError.message);
                } else {
                    console.log("[Clinical PATCH] Successfully synced to public.prescriptions table.");
                }
            }

            /*
             * Keep local JSON fallback aligned with Supabase.
             */
            try {
                const folder = path.join(patientRecordsDir, String(patientId));
                const file = path.join(folder, `${consultationId}.json`);

                if (fs.existsSync(file)) {
                    const current = JSON.parse(fs.readFileSync(file, "utf8"));
                    fs.writeFileSync(
                        file,
                        JSON.stringify(
                            {
                                ...current,
                                summary: finalSummary,
                                diagnosis,
                                medications,
                                prescription: {
                                    ...(current.prescription || {}),
                                    ...prescription,
                                    medicines: medications,
                                    medications: medications,
                                },
                                updatedAt: new Date().toISOString(),
                            },
                            null,
                            2
                        )
                    );
                }
            } catch (diskError) {
                console.warn("[Clinical Edit] Local fallback sync warning:", diskError.message);
            }

            return res.json({
                success: true,
                message: "Consultation report updated successfully.",
                consultationId,
                patientId,
                pdfUrl: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
                prescriptionPdfUrl: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf?document=prescription`,
            });
        } catch (error) {
            console.error("[Clinical Edit] Update error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update consultation report.",
                error: error.message,
            });
        }
    }
);

// =====================================================
// MARK CONSULTATION AS COMPLETED
// =====================================================
app.patch(
    "/api/v1/clinical/notes/:patientId/:consultationId/complete",
    async (req, res) => {
        try {
            const { patientId, consultationId } = req.params;
            const targetDb = db || supabase;

            let rawAppId = consultationId.replace("consultation-app-", "").replace("consultation-db-", "");
            const { patUuid, docUuid, appUuid } = await resolveSupabaseDetails({
                patientId,
                doctorId: req.doctor?.id,
                appointmentId: rawAppId,
                reqDoctor: req.doctor,
            });

            const targetAppId = appUuid || rawAppId;

            const nowIso = new Date().toISOString();
            if (isSupabaseConfigured && targetDb && targetAppId) {
                await targetDb
                    .from("appointments")
                    .update({ status: "completed", updated_at: nowIso })
                    .eq("id", targetAppId);

                const isUuidStr = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                const conds = [`appointment_id.eq.${targetAppId}`];
                if (isUuidStr(patientId)) {
                    conds.push(`patient_id.eq.${patientId}`);
                    conds.push(`hospital_patient_id.eq.${patientId}`);
                }
                await targetDb
                    .from("patient_visits")
                    .update({
                        visit_stage: "completed",
                        status: "completed",
                        completed_at: nowIso,
                        consultation_completed_at: nowIso,
                        updated_at: nowIso
                    })
                    .or(conds.join(","));
            }

            return res.json({
                success: true,
                message: "Consultation marked as completed successfully in Supabase.",
                consultationId,
                patientId,
                status: "Completed",
                pdfUrl: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
            });
        } catch (error) {
            console.error("[Clinical Complete] FAILED:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to mark consultation as completed.",
                error: error.message,
            });
        }
    }
);

// =====================================================
// GET PATIENT RECORDS
// =====================================================

app.get(
    "/api/v1/clinical/notes/:patientId",
    async (req, res) => {
        try {
            const { patientId } = req.params;
            let records = [];
            const targetDbRead = db || supabase;

            if (isSupabaseConfigured && targetDbRead) {
                try {
                    let pData = null;
                    let hprData = null;
                    if (isUuid(patientId)) {
                        const { data } = await targetDbRead
                            .from("patients")
                            .select("id, user_id, patient_code")
                            .or(`user_id.eq.${patientId},id.eq.${patientId}`)
                            .maybeSingle();
                        pData = data;
                    } else {
                        const { data } = await targetDbRead
                            .from("patients")
                            .select("id, user_id, patient_code")
                            .eq("patient_code", patientId)
                            .maybeSingle();
                        pData = data;
                    }

                    if (!pData) {
                        if (isUuid(patientId)) {
                            const { data: hpr } = await targetDbRead
                                .from("hospital_patient_records")
                                .select("id, hospital_patient_code")
                                .eq("id", patientId)
                                .maybeSingle();
                            hprData = hpr;
                        } else {
                            const { data: hpr } = await targetDbRead
                                .from("hospital_patient_records")
                                .select("id, hospital_patient_code")
                                .eq("hospital_patient_code", patientId)
                                .maybeSingle();
                            hprData = hpr;
                        }
                    }

                    const matchedUuids = [...new Set([patientId, pData?.id, pData?.user_id, hprData?.id].filter(Boolean))].filter(isUuid);

                    // Fetch appointments for this patient
                    let appIds = [];
                    if (matchedUuids.length > 0) {
                        const quoted = matchedUuids.map(id => `"${id}"`).join(",");
                        const { data: apps } = await targetDbRead
                            .from("appointments")
                            .select("id")
                            .or(`patient_id.in.(${quoted}),hospital_patient_id.in.(${quoted})`);
                        if (apps) appIds = apps.map(a => a.id);
                    }

                    let dbNotes = [];
                    let dbRxs = [];

                    const noteOrs = [];
                    const rxOrs = [];
                    if (appIds.length > 0) {
                        const quotedApps = appIds.map(id => `"${id}"`).join(",");
                        noteOrs.push(`appointment_id.in.(${quotedApps})`);
                        rxOrs.push(`appointment_id.in.(${quotedApps})`);
                    }
                    if (matchedUuids.length > 0) {
                        const quotedUuids = matchedUuids.map(id => `"${id}"`).join(",");
                        noteOrs.push(`patient_id.in.(${quotedUuids})`);
                        rxOrs.push(`patient_id.in.(${quotedUuids})`);
                    }

                    if (noteOrs.length > 0) {
                        const { data: notesData } = await targetDbRead
                            .from("consultation_notes")
                            .select("*")
                            .or(noteOrs.join(","));
                        if (notesData) dbNotes = notesData.map(n => decryptRecord("consultation_notes", n));
                    }

                    if (rxOrs.length > 0) {
                        const { data: rxsData } = await targetDbRead
                            .from("prescriptions")
                            .select("*")
                            .or(rxOrs.join(","));
                        if (rxsData) dbRxs = rxsData.map(r => decryptRecord("prescriptions", r));
                    }

                    if (dbNotes && dbNotes.length > 0) {
                        const rxMap = {};
                        (dbRxs || []).forEach((rx) => { rxMap[rx.appointment_id] = rx; });

                        dbNotes.forEach((note) => {
                            const rx = rxMap[note.appointment_id] || {};
                            const consId = `consultation-app-${note.appointment_id || note.id}`;

                            let summaryObj = {};
                            if (note.notes) {
                                try {
                                    if (note.notes.trim().startsWith("{")) {
                                        const parsed = JSON.parse(note.notes);
                                        summaryObj = parsed.summary || parsed;
                                    }
                                } catch (e) {}
                            }

                            if (!summaryObj || Object.keys(summaryObj).length === 0) {
                                summaryObj = {
                                    consultation_overview: note.notes || "",
                                    symptoms: note.symptoms || "",
                                    diagnosis: note.diagnosis || "",
                                    language: note.language || "English",
                                    advice: rx.advice || "",
                                    follow_up: rx.follow_up_date || ""
                                };
                            }

                            records.push({
                                consultationId: consId,
                                id: consId,
                                doctorId: note.doctor_id,
                                patientId: note.patient_id,
                                appointmentId: note.appointment_id,
                                status: "Completed",
                                completed: true,
                                savedAt: note.updated_at || note.created_at,
                                consultationDate: (note.created_at ? new Date(note.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })),
                                consultationTime: new Date(note.created_at || Date.now()).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }),
                                summary: summaryObj,
                                diagnosis: note.diagnosis ? (Array.isArray(note.diagnosis) ? note.diagnosis : (typeof note.diagnosis === "string" ? note.diagnosis.split(", ") : [String(note.diagnosis)])) : (summaryObj.diagnosis ? [summaryObj.diagnosis] : []),
                                medications: rx.medicines || [],
                                prescription: {
                                    medicines: rx.medicines || [],
                                    advice: rx.advice || summaryObj.advice || "",
                                    follow_up_date: rx.follow_up_date || summaryObj.follow_up || "",
                                },
                                audio_transcript: note.audio_transcript || null,
                                pdfUrl: rx.pdf_url || `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consId)}/pdf`,
                            });
                        });
                    }
                } catch (dbErr) {
                    console.warn("[Clinical Notes GET] Supabase sync read notice:", dbErr.message);
                }
            }

            const uniqueMap = new Map();
            records.forEach((r) => {
                const key = r.appointmentId || r.consultationId;
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, r);
                }
            });
            records = Array.from(uniqueMap.values());
            records.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

            return res.json({
                success: true,
                patientId,
                records,
            });
        } catch (error) {
            console.error("Get patient records error:", error);
            return res.status(500).json({ success: false, message: "Failed to load patient records.", error: error.message });
        }
    }
);

// =====================================================
// SAVE PRESCRIPTION FOR PATIENT
// =====================================================

async function savePrescriptionForPatient(
    patientRecord
) {
    try {
        const prescription =
            patientRecord.prescription;

        if (!prescription) {
            return null;
        }

        const patientFolder =
            path.join(
                patientRecordsDir,
                String(
                    patientRecord.patientId
                )
            );

        if (
            !fs.existsSync(
                patientFolder
            )
        ) {
            fs.mkdirSync(
                patientFolder,
                {
                    recursive: true,
                }
            );
        }

        const patientName =
            patientRecord.patientName ||
            "patient";

        const safeName =
            patientName
                .replace(
                    /[^a-zA-Z0-9]/g,
                    "-"
                )
                .toLowerCase();

        const fileName =
            `prescription-${safeName}-${Date.now()}.pdf`;

        const filePath =
            path.join(
                patientFolder,
                fileName
            );

        const doc =
            new PDFDocument({
                margin: 50,
            });

        const bundledNirmala = path.join(__dirname, 'fonts', 'Nirmala.ttc');
        const systemNirmala = 'C:\\Windows\\Fonts\\Nirmala.ttc';
        const nirmalaPath = fs.existsSync(bundledNirmala) ? bundledNirmala : (fs.existsSync(systemNirmala) ? systemNirmala : null);

        if (nirmalaPath && fs.existsSync(nirmalaPath)) {
            try {
                doc.registerFont('AppRegular', nirmalaPath, 'NirmalaUI');
                doc.registerFont('AppBold', nirmalaPath, 'NirmalaUI-Bold');
                doc.font('AppRegular');
            } catch {}
        }

        const stream =
            fs.createWriteStream(
                filePath
            );

        doc.pipe(stream);

        // Header
        doc
            .fontSize(22)
            .text(
                "Doctors Vedika",
                {
                    align: "center",
                }
            );

        doc
            .moveDown(0.3)
            .fontSize(14)
            .text(
                "Prescription",
                {
                    align: "center",
                }
            );

        doc.moveDown(1);

        doc
            .fontSize(11)
            .text(
                `Patient: ${patientName}`
            );

        doc.text(
            `Patient ID: ${patientRecord.patientId
            }`
        );

        doc.text(
            `Date: ${patientRecord.consultationDate
            }`
        );

        doc.text(
            `Time: ${patientRecord.consultationTime
            }`
        );

        doc.moveDown(1);

        doc
            .fontSize(15)
            .text(
                "Medications",
                {
                    underline: true,
                }
            );

        doc.moveDown(0.7);

        const medications =
            prescription.medications ||
            [];

        medications.forEach(
            (medication, index) => {
                doc
                    .fontSize(11)
                    .text(
                        `${index + 1}. ${medication.name ||
                        ""
                        }`
                    );

                doc.text(
                    `   Dosage: ${medication.dosage ||
                    ""
                    }`
                );

                doc.text(
                    `   Frequency: ${medication.frequency ||
                    ""
                    }`
                );

                doc.text(
                    `   Duration: ${medication.duration ||
                    ""
                    }`
                );

                if (
                    medication.instructions
                ) {
                    doc.text(
                        `   Instructions: ${medication.instructions
                        }`
                    );
                }

                doc.moveDown(0.5);
            }
        );

        doc.moveDown(2);

        doc
            .fontSize(10)
            .text(
                "Doctor Signature: __________________________",
                {
                    align: "right",
                }
            );

        doc.end();

        await new Promise(
            (resolve, reject) => {
                stream.on(
                    "finish",
                    resolve
                );

                stream.on(
                    "error",
                    reject
                );
            }
        );

        return filePath;
    } catch (error) {
        console.error(
            "Prescription save error:",
            error
        );

        return null;
    }
}

// =====================================================
// 404 HANDLER
// =====================================================

app.use(
    (req, res) => {
        res.status(404).json({
            success: false,
            message: `Cannot ${req.method} ${req.originalUrl}`,
        });
    }
);

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {
        console.error(
            "Backend error:",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({
            success: false,
            message:
                "Internal server error.",
            error:
                error.message,
        });
    }
);

// =====================================================
// START SERVER
// =====================================================
// =====================================================
// PATIENT CLINICAL RECORDS
// =====================================================

const patientRecords = [];



app.listen(
    PORT,
    () => {
        console.log("");
        console.log(
            "=========================================="
        );
        console.log(
            "       DOCTORS VEDIKA BACKEND"
        );
        console.log(
            "=========================================="
        );
        console.log(
            `Server: http://localhost:${PORT}`
        );
        console.log("");
        console.log(
            "Available routes:"
        );
        console.log(
            "GET  /"
        );
        console.log(
            "GET  /api/appointments"
        );
        console.log(
            "PATCH /api/appointments/:id"
        );
        console.log(
            "PATCH /api/appointments/:id/complete"
        );
        console.log(
            "POST /api/prescription/generate"
        );
        console.log(
            "POST /api/consultation/complete"
        );
        console.log(
            "POST /api/v1/clinical/notes"
        );
        console.log(
            "GET  /api/v1/clinical/notes/:patientId"
        );
        console.log(
            "=========================================="
        );
        console.log("");
    }
);