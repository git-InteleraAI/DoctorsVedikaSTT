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
} = require("./pdf/generateMedicalReportPdf");

const { supabase, isSupabaseConfigured } = require("./config/supabase");

const app = express();

const PORT = process.env.PORT || 5000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
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

// Helper function to resolve valid UUIDs for patient_id, doctor_id, appointment_id and doctor_name from Supabase
async function resolveSupabaseDetails({ patientId, doctorId, appointmentId, reqDoctor = null }) {
    const isUuid = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    let patUuid = isUuid(patientId) ? patientId : null;
    let docUuid = isUuid(doctorId) ? doctorId : null;
    let appUuid = isUuid(appointmentId) ? appointmentId : null;
    let doctorName = null;

    if (!isSupabaseConfigured || !supabase) {
        return { patUuid, docUuid, appUuid, doctorName: doctorName || "Dr. Harshini Jakki", patientDetails: { age: null, gender: null, name: null } };
    }

    let patientDetails = { age: null, gender: null, name: null };

    // 1. Resolve Patient UUID & Details
    if (patientId) {
        try {
            const query = supabase.from("patients").select("id, user_id, full_name, age, gender, date_of_birth");
            let pData = null;
            if (isUuid(patientId)) {
                const { data } = await query.or(`user_id.eq.${patientId},id.eq.${patientId}`).maybeSingle();
                pData = data;
            } else {
                const { data } = await query.eq("patient_code", patientId).maybeSingle();
                pData = data;
            }
            if (pData) {
                patUuid = pData.user_id || pData.id;
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

    if (!patUuid) {
        try {
            const { data: pFirst } = await supabase.from("patients").select("id, user_id, full_name, age, gender, date_of_birth").limit(1).maybeSingle();
            if (pFirst) {
                patUuid = pFirst.user_id || pFirst.id;
                let calcAge = pFirst.age;
                if (!calcAge && pFirst.date_of_birth) {
                    const dob = new Date(pFirst.date_of_birth);
                    if (!isNaN(dob.getTime())) {
                        calcAge = String(new Date().getFullYear() - dob.getFullYear());
                    }
                }
                patientDetails = {
                    age: calcAge ? String(calcAge) : null,
                    gender: pFirst.gender ? String(pFirst.gender) : null,
                    name: pFirst.full_name || null,
                };
            }
        } catch (err) {}
    }

    // 2. Resolve Doctor UUID & Doctor Name
    if (docUuid) {
        try {
            const { data: dData } = await supabase.from("doctors").select("doctor_id, user_id, doctor_name").or(`doctor_id.eq.${docUuid},user_id.eq.${docUuid}`).maybeSingle();
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
            const { data: dData } = await supabase
                .from("doctors")
                .select("doctor_id, user_id, doctor_name")
                .or("doctor_email.ilike.%harshini%,doctor_name.ilike.%harshini%")
                .limit(1)
                .maybeSingle();

            if (dData) {
                if (!docUuid) docUuid = dData.doctor_id || dData.user_id;
                if (!doctorName) doctorName = dData.doctor_name;
            } else {
                const { data: anyDoc } = await supabase.from("doctors").select("doctor_id, user_id, doctor_name").limit(1).maybeSingle();
                if (anyDoc) {
                    if (!docUuid) docUuid = anyDoc.doctor_id || anyDoc.user_id;
                    if (!doctorName) doctorName = anyDoc.doctor_name;
                }
            }
        } catch (err) {}
    }

    if (!doctorName) {
        doctorName = "Dr. Harshini Jakki";
    } else if (!doctorName.toLowerCase().startsWith("dr")) {
        doctorName = `Dr. ${doctorName}`;
    }

    // 3. Resolve Appointment UUID
    if (!appUuid && patUuid && docUuid) {
        try {
            const { data: appData } = await supabase
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
                const { data: anyApp } = await supabase
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
            const { data: newApp, error: appInsErr } = await supabase
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

            if (!patientId) {
                return res.status(400).json({
                    success: false,
                    message: "patientId is required",
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
            const savedTime = consultationTime || now.toLocaleTimeString("en-IN");

            const patientFolder = path.join(
                patientRecordsDir,
                String(patientId)
            );
            fs.mkdirSync(patientFolder, { recursive: true });

            const consultationId = `consultation-${Date.now()}`;

            const isCompleted = req.body.completed === true || String(req.body.status || "").toLowerCase() === "completed";

            const finalAge = req.body.patientAge || req.body.age || req.body.patient?.age || patientDetails?.age || null;
            const finalGender = req.body.patientGender || req.body.gender || req.body.patient?.gender || patientDetails?.gender || null;
            const finalName = patientName || req.body.patientName || req.body.patient?.name || patientDetails?.name || "Unknown Patient";

            const patientRecord = {
                consultationId,
                doctorId: docUuid || doctorId || "default-doctor",
                doctorName: doctorName || req.body.doctorName || "Dr. Harshini Jakki",
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
                summary: summary || {},
                diagnosis: Array.isArray(diagnosis) ? diagnosis : [],
                medications: formatMedicines(medications, prescription),
                prescription: prescription || null,
            };

            const recordPath = path.join(
                patientFolder,
                `${consultationId}.json`
            );

            const reportPath = path.join(
                patientFolder,
                `${consultationId}.txt`
            );

            // 1. Generate the final professional PDF FIRST.
            console.log("[Clinical Save] Generating combined medical PDF for Doctor:", patientRecord.doctorName);
            const pdf = await generateMedicalReportPdf(
                patientRecord,
                patientFolder
            );
            console.log("[Clinical Save] PDF created:", pdf.filePath);

            // 2. Save JSON only after PDF generation succeeds.
            fs.writeFileSync(
                recordPath,
                JSON.stringify(patientRecord, null, 2),
                "utf8"
            );

            // 3. Save a simple text backup.
            const s = patientRecord.summary || {};
            const text = [
                "========================================",
                "DOCTORS VEDIKA",
                "CONSULTATION REPORT",
                "========================================",
                `Patient: ${patientRecord.patientName}`,
                `Patient ID: ${patientRecord.patientId}`,
                `Doctor ID: ${patientRecord.doctorId}`,
                `Doctor Name: ${patientRecord.doctorName}`,
                `Appointment ID: ${patientRecord.appointmentId || "N/A"}`,
                `Date: ${savedDate}`,
                `Time: ${savedTime}`,
                "",
                "CLINICAL NOTES",
                `Chief Complaint: ${s.chiefComplaint || s.chief_complaint || ""}`,
                `Consultation Overview: ${s.consultationOverview || s.consultation_overview || ""}`,
                `Symptoms: ${s.presentingSymptoms || s.presenting_symptoms || s.symptoms || ""}`,
                `History: ${s.historyOfPresentIllness || s.history_of_present_illness || ""}`,
                `Assessment: ${s.assessment || ""}`,
                `Diagnosis: ${Array.isArray(s.diagnosis) ? s.diagnosis.join(", ") : (s.diagnosis || "")}`,
                `Treatment Plan: ${s.treatmentPlan || s.treatment_plan || ""}`,
                `Advice: ${s.advice || ""}`,
                `Follow-up: ${s.followUp || s.follow_up || ""}`,
                `Doctor Notes: ${s.notes || s.doctorNotes || s.doctor_notes || ""}`,
                "",
                "TRANSCRIPT",
                ...(Array.isArray(transcript)
                    ? transcript.map((item) => `[${item?.timestamp || ""}] ${item?.speaker || "Conversation"}: ${item?.text || ""}`)
                    : []),
            ].join("\n");

            fs.writeFileSync(reportPath, text, "utf8");

            // 4. Sync directly to public.consultation_notes and public.prescriptions if completed or requested
            if (isCompleted && isSupabaseConfigured && supabase && appUuid && docUuid && patUuid) {
                try {
                    if (appUuid) {
                        await supabase
                            .from("appointments")
                            .update({ status: "completed", updated_at: new Date().toISOString() })
                            .eq("id", appUuid);
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

                    const noteRecord = {
                        appointment_id: appUuid,
                        doctor_id: docUuid,
                        patient_id: patUuid,
                        notes: formattedNotesText || "Consultation completed.",
                        symptoms: symptomsText || "No symptoms recorded",
                        diagnosis: diagnosisText || null,
                        language: req.body.language || s.detected_language || "English",
                        audio_transcript: rawAudioTranscript,
                        audio_url: req.body.audio_url || req.body.audioUrl || null,
                        visit_id: req.body.visit_id || req.body.visitId || null,
                        updated_at: new Date().toISOString(),
                    };

                    const { error: noteErr } = await supabase.from("consultation_notes").upsert(noteRecord, { onConflict: "appointment_id" });
                    if (noteErr) console.warn("[Clinical Save] consultation_notes sync warning:", noteErr.message);
                    else console.log("[Clinical Save] Successfully synced to public.consultation_notes table.");

                    const prescriptionRecord = {
                        appointment_id: appUuid,
                        doctor_id: docUuid,
                        patient_id: patUuid,
                        medicines: formatMedicines(medications, prescription),
                        advice: formatAdvice(prescription?.advice || s.advice),
                        follow_up_date: formatFollowUpDate(prescription?.follow_up_date || prescription?.follow_up),
                        pdf_url: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
                        visit_id: req.body.visit_id || req.body.visitId || null,
                        updated_at: new Date().toISOString(),
                    };

                    const { error: rxErr } = await supabase.from("prescriptions").upsert(prescriptionRecord, { onConflict: "appointment_id" });
                    if (rxErr) console.warn("[Clinical Save] prescriptions sync warning:", rxErr.message);
                    else console.log("[Clinical Save] Successfully synced to public.prescriptions table.");

                } catch (dbErr) {
                    console.warn("[Clinical Save] Supabase sync exception:", dbErr.message);
                }
            }

            // 5. Return explicit PDF information to the frontend.
            return res.status(201).json({
                success: true,
                message: "Consultation saved and professional PDF generated successfully.",
                consultationId,
                patientId,
                appointmentId: appointmentId || null,
                consultationDate: savedDate,
                consultationTime: savedTime,
                status: patientRecord.status,
                record: patientRecord,
                files: {
                    json: recordPath,
                    report: reportPath,
                    pdf: pdf.filePath,
                    pdfFileName: pdf.fileName,
                    pdfSize: pdf.size,
                    pdfUrl: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
                },
            });
        } catch (error) {
            console.error("[Clinical Save] FAILED:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to save consultation and generate PDF.",
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
// VIEW THE COMBINED PDF FOR A PATIENT CONSULTATION
// =====================================================
app.get(
    "/api/v1/clinical/notes/:patientId/:consultationId/pdf",
    (req, res) => {
        try {
            const { patientId, consultationId } = req.params;
            const patientFolder = resolvePatientFolder(patientId);

            if (!fs.existsSync(patientFolder)) {
                return res.status(404).json({
                    success: false,
                    message: "Patient record folder not found.",
                });
            }

            const jsonPath = path.join(patientFolder, `${consultationId}.json`);
            if (!fs.existsSync(jsonPath)) {
                return res.status(404).json({
                    success: false,
                    message: "Consultation record not found.",
                });
            }

            const record = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
            const safeName = String(record.patientName || "patient")
                .replace(/[^a-zA-Z0-9_-]+/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "")
                .toLowerCase() || "patient";
            const pdfPath = path.join(
                patientFolder,
                `${consultationId}-${safeName}.pdf`
            );

            if (!fs.existsSync(pdfPath)) {
                return res.status(404).json({
                    success: false,
                    message: "Combined medical PDF not found.",
                });
            }

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `inline; filename="${path.basename(pdfPath)}"`
            );
            return res.sendFile(pdfPath);
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
// MARK CONSULTATION AS COMPLETED
// =====================================================
app.patch(
    "/api/v1/clinical/notes/:patientId/:consultationId/complete",
    async (req, res) => {
        try {
            const { patientId, consultationId } = req.params;
            const patientFolder = resolvePatientFolder(patientId);

            if (!fs.existsSync(patientFolder)) {
                return res.status(404).json({
                    success: false,
                    message: "Patient record folder not found.",
                });
            }

            const jsonPath = path.join(patientFolder, `${consultationId}.json`);
            if (!fs.existsSync(jsonPath)) {
                return res.status(404).json({
                    success: false,
                    message: "Consultation record not found.",
                });
            }

            const record = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
            record.status = "Completed";
            record.completed = true;
            record.completedAt = new Date().toISOString();

            fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2), "utf8");

            // Sync to consultation_notes, prescriptions, and appointments in Supabase upon completion
            if (isSupabaseConfigured && supabase) {
                try {
                    const { patUuid, docUuid, appUuid, doctorName } = await resolveSupabaseDetails({
                        patientId: record.patientId || patientId,
                        doctorId: record.doctorId,
                        appointmentId: record.appointmentId,
                        reqDoctor: req.doctor,
                    });

                    if (appUuid) {
                        await supabase
                            .from("appointments")
                            .update({ status: "completed", updated_at: new Date().toISOString() })
                            .eq("id", appUuid);
                        console.log(`[Appointment] Updated appointment ${appUuid} to completed in Supabase.`);
                    }

                    if (appUuid && docUuid && patUuid) {
                        const s = record.summary || {};
                        const formattedNotesText = [
                            s.consultationOverview || s.consultation_overview || "",
                            s.chiefComplaint || s.chief_complaint || "",
                            s.historyOfPresentIllness || s.history_of_present_illness || "",
                            s.assessment || "",
                            s.treatmentPlan || s.treatment_plan || "",
                            s.doctorNotes || s.doctor_notes || s.notes || "",
                        ]
                            .filter((val) => val && String(val).trim())
                            .join("\n\n");

                        const symptomsText = Array.isArray(s.symptoms)
                            ? s.symptoms.filter(Boolean).join(", ")
                            : String(s.symptoms || s.presentingSymptoms || s.presenting_symptoms || "No symptoms recorded");

                        const diagnosisText = Array.isArray(s.diagnosis)
                            ? s.diagnosis.filter(Boolean).join(", ")
                            : String(s.diagnosis || "");

                        const rawAudioTranscript = Array.isArray(record.transcript)
                            ? record.transcript.map((item) => `[${item?.timestamp || ""}] ${item?.speaker || "Conversation"}: ${item?.text || ""}`).join("\n")
                            : null;

                        const noteRecord = {
                            appointment_id: appUuid,
                            doctor_id: docUuid,
                            patient_id: patUuid,
                            notes: formattedNotesText || "Consultation completed.",
                            symptoms: symptomsText || "No symptoms recorded",
                            diagnosis: diagnosisText || null,
                            language: s.detected_language || record.detectedLanguage || "English",
                            audio_transcript: rawAudioTranscript,
                            audio_url: record.audio_url || record.audioUrl || null,
                            visit_id: record.visit_id || record.visitId || null,
                            updated_at: new Date().toISOString(),
                        };

                        const { error: noteErr } = await supabase
                            .from("consultation_notes")
                            .upsert(noteRecord, { onConflict: "appointment_id" });

                        if (noteErr) {
                            console.warn("[Clinical Complete] Supabase consultation_notes sync notice:", noteErr.message);
                        } else {
                            console.log("[Clinical Complete] Successfully synced to public.consultation_notes table.");
                        }

                        const prescriptionRecord = {
                            appointment_id: appUuid,
                            doctor_id: docUuid,
                            patient_id: patUuid,
                            medicines: formatMedicines(record.medications, record.prescription),
                            advice: formatAdvice(record.prescription?.advice || s.advice),
                            follow_up_date: formatFollowUpDate(record.prescription?.follow_up_date || record.prescription?.follow_up),
                            pdf_url: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
                            visit_id: record.visit_id || record.visitId || null,
                            updated_at: new Date().toISOString(),
                        };

                        const { error: rxErr } = await supabase
                            .from("prescriptions")
                            .upsert(prescriptionRecord, { onConflict: "appointment_id" });

                        if (rxErr) {
                            console.warn("[Clinical Complete] Supabase prescriptions sync notice:", rxErr.message);
                        } else {
                            console.log("[Clinical Complete] Successfully synced to public.prescriptions table.");
                        }
                    }
                } catch (dbErr) {
                    console.warn("[Clinical Complete] Supabase sync notice:", dbErr.message);
                }
            }

            console.log(`[Clinical Record] Marked consultation ${consultationId} as Completed.`);

            return res.json({
                success: true,
                message: "Consultation marked as completed successfully.",
                consultationId,
                patientId,
                status: "Completed",
                record,
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

            const patientFolder = resolvePatientFolder(patientId);
            if (fs.existsSync(patientFolder)) {
                const files = fs.readdirSync(patientFolder);
                const jsonFiles = files.filter((file) => file.endsWith(".json"));

                records = jsonFiles
                    .map((file) => {
                        try {
                            const filePath = path.join(patientFolder, file);
                            const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
                            if (!data || !data.consultationId) return null;
                            data.pdfUrl = `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(data.consultationId)}/pdf`;
                            return data;
                        } catch {
                            return null;
                        }
                    })
                    .filter((r) => {
                        if (!r) return false;
                        const hasSummary = r.summary && Object.keys(r.summary).length > 0;
                        const hasDiag = Array.isArray(r.diagnosis) && r.diagnosis.length > 0;
                        const hasTranscript = Array.isArray(r.transcript) && r.transcript.length > 0;
                        return hasSummary || hasDiag || hasTranscript;
                    });
            }

            // Filter patient records to return only completed consultations unless explicitly requested
            const includeDrafts = req.query.includeDrafts === "true";
            if (!includeDrafts) {
                records = records.filter((r) => r && (r.completed === true || String(r.status).toLowerCase() === "completed"));
            }

            // Sync with Supabase consultation_notes and prescriptions if configured
            if (isSupabaseConfigured && supabase) {
                try {
                    const { patUuid } = await resolveSupabaseDetails({ patientId });
                    const targetPatId = patUuid || patientId;

                    const { data: dbNotes } = await supabase
                        .from("consultation_notes")
                        .select("*")
                        .or(`patient_id.eq.${targetPatId},patient_id.eq.${patientId}`);

                    const { data: dbRxs } = await supabase
                        .from("prescriptions")
                        .select("*")
                        .or(`patient_id.eq.${targetPatId},patient_id.eq.${patientId}`);

                    if (dbNotes && dbNotes.length > 0) {
                        const rxMap = {};
                        (dbRxs || []).forEach((rx) => { rxMap[rx.appointment_id] = rx; });

                        dbNotes.forEach((note) => {
                            const rx = rxMap[note.appointment_id] || {};
                            const consId = `consultation-db-${note.id || note.appointment_id}`;
                            const exists = records.some((r) => r.appointmentId === note.appointment_id || r.consultationId === consId);

                            if (!exists) {
                                records.push({
                                    consultationId: consId,
                                    id: consId,
                                    doctorId: note.doctor_id,
                                    patientId: note.patient_id,
                                    appointmentId: note.appointment_id,
                                    status: "Completed",
                                    completed: true,
                                    savedAt: note.updated_at || note.created_at,
                                    consultationDate: (note.created_at || new Date().toISOString()).split("T")[0],
                                    consultationTime: new Date(note.created_at || Date.now()).toLocaleTimeString("en-IN"),
                                    summary: {
                                        notes: note.notes,
                                        symptoms: note.symptoms,
                                        diagnosis: note.diagnosis,
                                        language: note.language,
                                    },
                                    diagnosis: note.diagnosis ? note.diagnosis.split(", ") : [],
                                    medications: rx.medicines || [],
                                    prescription: {
                                        medicines: rx.medicines || [],
                                        advice: rx.advice || "",
                                        follow_up_date: rx.follow_up_date || "",
                                    },
                                    pdfUrl: rx.pdf_url || `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consId)}/pdf`,
                                });
                            }
                        });
                    }
                } catch (dbErr) {
                    console.warn("[Clinical Notes GET] Supabase sync read notice:", dbErr.message);
                }
            }

            // Latest consultation first
            records.sort((a, b) => new Date(b.savedAt || b.createdAt || 0) - new Date(a.savedAt || a.createdAt || 0));

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