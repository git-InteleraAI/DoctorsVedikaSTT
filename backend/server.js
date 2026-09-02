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
// GENERATE PRESCRIPTION PDF
// =====================================================

app.post(
    "/api/prescription/generate",
    (req, res) => {
    try {
        const {
            patientName,
            medications,
            diagnosis,
        } = req.body;

        if (
            !patientName ||
            !Array.isArray(medications)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Missing patientName or medications",
            });
        }

        const safePatientName =
            patientName
                .replace(/[^a-zA-Z0-9]/g, "-")
                .toLowerCase();

        const fileName =
            `prescription-${safePatientName}-${Date.now()}.pdf`;

        const filePath = path.join(
            prescriptionDir,
            fileName
        );

        const doc = new PDFDocument({
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

        const writeStream =
            fs.createWriteStream(filePath);

        doc.pipe(writeStream);

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
            .fontSize(12)
            .text(
                "Medical Prescription",
                {
                    align: "center",
                }
            );

        doc.moveDown(1.5);

        // Patient details
        doc
            .fontSize(13)
            .text(
                `Patient Name: ${patientName}`
            );

        doc
            .fontSize(11)
            .text(
                `Date: ${new Date().toLocaleDateString(
                    "en-IN"
                )}`
            );

        doc
            .fontSize(11)
            .text(
                `Time: ${new Date().toLocaleTimeString(
                    "en-IN"
                )}`
            );

        if (diagnosis) {
            doc
                .moveDown(0.5)
                .fontSize(12)
                .text(
                    `Diagnosis: ${diagnosis}`
                );
        }

        doc.moveDown(1);

        // Medication heading
        doc
            .fontSize(15)
            .text("Medications", {
                underline: true,
            });

        doc.moveDown(0.7);

        medications.forEach(
            (medication, index) => {
                doc
                    .fontSize(11)
                    .text(
                        `${index + 1}. ${medication.name ||
                        ""
                        }`
                    );

                if (
                    medication.dosage
                ) {
                    doc.text(
                        `   Dosage: ${medication.dosage}`
                    );
                }

                if (
                    medication.frequency
                ) {
                    doc.text(
                        `   Frequency: ${medication.frequency}`
                    );
                }

                if (
                    medication.duration
                ) {
                    doc.text(
                        `   Duration: ${medication.duration}`
                    );
                }

                if (
                    medication.instructions
                ) {
                    doc.text(
                        `   Instructions: ${medication.instructions}`
                    );
                }

                doc.moveDown(0.5);
            }
        );

        doc.moveDown(2);

        doc
            .fontSize(11)
            .text(
                "Doctor Signature: __________________________",
                {
                    align: "right",
                }
            );

        doc.end();

        writeStream.on(
            "finish",
            () => {
                res.json({
                    success: true,
                    message:
                        "Prescription generated successfully",
                    fileName,
                    filePath,
                });
            }
        );

        writeStream.on(
            "error",
            (error) => {
                console.error(
                    "Prescription PDF error:",
                    error
                );

                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message:
                            "Failed to generate prescription",
                    });
                }
            }
        );
    } catch (error) {
        console.error(
            "Prescription error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to generate prescription",
            error: error.message,
        });
    }
}
);

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
app.post(
    "/api/v1/clinical/notes",
    async (req, res) => {
        try {
            console.log("------------------------------------");
            console.log("[Clinical Save] Saving consultation + PDF...");

            const {
                doctorId,
                patientId,
                appointmentId,
                patientName,
                consultationDate,
                consultationTime,
                transcript,
                summary,
                medications,
                diagnosis,
                prescription,
            } = req.body || {};

            if (!patientId) {
                return res.status(400).json({
                    success: false,
                    message: "patientId is required",
                });
            }

            if (!appointmentId) {
                return res.status(400).json({
                    success: false,
                    message: "appointmentId is required. Start the consultation from a confirmed appointment.",
                });
            }

            let appointment = null;
            if (appointmentId && isSupabaseConfigured && supabase) {
                try {
                    const { data: appData } = await supabase
                        .from("appointments")
                        .select("*")
                        .eq("id", appointmentId)
                        .maybeSingle();
                    appointment = appData;
                } catch (appQueryErr) {
                    console.warn("[Clinical Save] Appointment lookup notice:", appQueryErr.message);
                }
            }

            const now = new Date();
            const savedDate = consultationDate || now.toISOString().split("T")[0];
            const savedTime = consultationTime || now.toLocaleTimeString("en-IN");

            const patientFolder = path.join(
                patientRecordsDir,
                String(patientId)
            );
            fs.mkdirSync(patientFolder, { recursive: true });

            const consultationId = `consultation-${Date.now()}`;

            const patientRecord = {
                consultationId,
                doctorId: doctorId || "default-doctor",
                patientId,
                patientName: patientName || "Unknown Patient",
                appointmentId: appointmentId || null,
                consultationDate: savedDate,
                consultationTime: savedTime,
                savedAt: now.toISOString(),
                status: "Saved",
                completed: false,
                transcript: Array.isArray(transcript) ? transcript : [],
                summary: summary || {},
                diagnosis: Array.isArray(diagnosis) ? diagnosis : [],
                medications: Array.isArray(medications) ? medications : [],
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
            // If PDF generation fails, the API does not falsely report success.
            console.log("[Clinical Save] Generating combined medical PDF...");
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

            // 4. Sync directly to public.consultation_notes and public.prescriptions Supabase tables if configured
            if (isSupabaseConfigured && supabase) {
                try {
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
                        : String(s.symptoms || s.presentingSymptoms || s.presenting_symptoms || req.body.symptoms || "No symptoms recorded");

                    const diagnosisText = Array.isArray(s.diagnosis)
                        ? s.diagnosis.filter(Boolean).join(", ")
                        : String(s.diagnosis || req.body.diagnosis || "");

                    const rawAudioTranscript = req.body.audio_transcript || 
                        (Array.isArray(transcript) && transcript.length > 0
                            ? transcript.map((item) => `[${item?.timestamp || ""}] ${item?.speaker || "Conversation"}: ${item?.text || ""}`).join("\n")
                            : null);

                    const noteRecord = {
                        appointment_id: appointmentId,
                        doctor_id: doctorId || "default-doctor",
                        patient_id: patientId,
                        notes: formattedNotesText || "Consultation completed.",
                        symptoms: symptomsText || "No symptoms recorded",
                        diagnosis: diagnosisText || null,
                        language: req.body.language || s.detected_language || "Auto",
                        audio_transcript: rawAudioTranscript,
                        updated_at: new Date().toISOString(),
                    };

                    const { error: notesErr } = await supabase
                        .from("consultation_notes")
                        .upsert(noteRecord, { onConflict: "appointment_id" });

                    if (notesErr) {
                        console.warn("[Clinical Save] Supabase consultation_notes sync notice:", notesErr.message);
                    } else {
                        console.log("[Clinical Save] Successfully synced to Supabase consultation_notes table.");
                    }

                    const prescriptionRecord = {
                        appointment_id: appointmentId,
                        doctor_id: doctorId || "default-doctor",
                        patient_id: patientId,
                        medicines: Array.isArray(medications) && medications.length > 0
                            ? medications
                            : (prescription?.medications || prescription?.medicines || []),
                        advice: prescription?.advice || s.advice || null,
                        follow_up_date: prescription?.follow_up_date || prescription?.follow_up || null,
                        pdf_url: `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf`,
                        updated_at: new Date().toISOString(),
                    };

                    const { error: rxErr } = await supabase
                        .from("prescriptions")
                        .upsert(prescriptionRecord, { onConflict: "appointment_id" });

                    if (rxErr) {
                        console.warn("[Clinical Save] Supabase prescriptions sync notice:", rxErr.message);
                    } else {
                        console.log("[Clinical Save] Successfully synced to Supabase prescriptions table.");
                    }
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
                status: "Saved",
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

            // Update matching appointment status to completed in Supabase database
            if (isSupabaseConfigured && supabase) {
                try {
                    const targetAppId = record.appointmentId;
                    if (targetAppId) {
                        await supabase
                            .from("appointments")
                            .update({ status: "completed", updated_at: new Date().toISOString() })
                            .eq("id", targetAppId);
                        console.log(`[Appointment] Updated appointment ${targetAppId} to completed in Supabase.`);
                    }
                    if (patientId) {
                        await supabase
                            .from("appointments")
                            .update({ status: "completed", updated_at: new Date().toISOString() })
                            .eq("patient_id", patientId)
                            .neq("status", "completed");
                        console.log(`[Appointment] Updated active appointments for patient ${patientId} to completed.`);
                    }
                } catch (dbErr) {
                    console.warn("[Appointment] Error updating appointment status in Supabase:", dbErr.message);
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
            const {
                patientId,
            } = req.params;

            const patientFolder = resolvePatientFolder(patientId);

            if (
                !fs.existsSync(
                    patientFolder
                )
            ) {
                return res.json({
                    success: true,
                    patientId,
                    records: [],
                });
            }

            const files =
                fs.readdirSync(
                    patientFolder
                );

            const jsonFiles =
                files.filter(
                    (file) =>
                        file.endsWith(
                            ".json"
                        )
                );

            let records =
                jsonFiles.map(
                    (file) => {
                        try {
                            const filePath =
                                path.join(
                                    patientFolder,
                                    file
                                );

                            const data = JSON.parse(
                                fs.readFileSync(
                                    filePath,
                                    "utf8"
                                )
                            );

                            if (!data || !data.consultationId) return null;

                            // Ensure pdfUrl is always present
                            data.pdfUrl = `/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(data.consultationId)}/pdf`;
                            return data;
                        } catch {
                            return null;
                        }
                    }
                ).filter((r) => {
                    if (!r) return false;
                    // Filter out stale dummy records that contain no summary/diagnosis
                    const hasSummary = r.summary && Object.keys(r.summary).length > 0;
                    const hasDiag = Array.isArray(r.diagnosis) && r.diagnosis.length > 0;
                    const hasTranscript = Array.isArray(r.transcript) && r.transcript.length > 0;
                    return hasSummary || hasDiag || hasTranscript;
                });

            // Try to append patient code and doctor name
            if (isSupabaseConfigured && supabase && records.length > 0) {
                try {
                    const { data: pData } = await supabase.from('patients').select('patient_code').eq('user_id', patientId).maybeSingle();
                    const pCode = pData?.patient_code;
                    
                    const doctorIds = [...new Set(records.map(r => r.doctorId).filter(Boolean))];
                    const { data: dData } = await supabase.from('doctors').select('id, first_name, last_name, full_name').in('id', doctorIds);
                    const dMap = {};
                    if (dData) {
                        dData.forEach(d => {
                            dMap[d.id] = d.full_name || `Dr. ${d.first_name || ""} ${d.last_name || ""}`.trim() || "Doctor";
                        });
                    }

                    records = records.map(r => {
                        if (pCode) r.patientCode = pCode;
                        if (r.doctorId && dMap[r.doctorId]) r.doctorName = dMap[r.doctorId];
                        return r;
                    });
                } catch (dbErr) {
                    console.warn("[Clinical Notes] Name fetch error:", dbErr.message);
                }
            }

            // Latest consultation first
            records.sort(
                (a, b) =>
                    new Date(
                        b.savedAt || b.createdAt || 0
                    ) -
                    new Date(
                        a.savedAt || a.createdAt || 0
                    )
            );

            return res.json({
                success: true,
                patientId,
                records,
            });
        } catch (error) {
            console.error(
                "Get patient records error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load patient records.",
                error: error.message,
            });
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

// Save consultation to patient record
app.post(
    "/api/v1/clinical/notes",
    (req, res) => {

        try {

            const {
                patientId,
                patientName,
                doctorId,
                consultationDate,
                consultationTime,
                transcript,
                summary,
                medications,
                diagnosis,
            } = req.body;

            // Patient ID is mandatory
            if (!patientId) {
                return res.status(400).json({
                    success: false,
                    message: "patientId is required",
                });
            }

            const record = {
                id: `record-${Date.now()}`,

                patientId,

                patientName:
                    patientName || "",

                doctorId:
                    doctorId || "default-doctor",

                consultationDate:
                    consultationDate ||
                    new Date().toISOString(),

                consultationTime:
                    consultationTime ||
                    new Date().toISOString(),

                transcript:
                    Array.isArray(transcript)
                        ? transcript
                        : [],

                summary:
                    summary || {},

                medications:
                    Array.isArray(medications)
                        ? medications
                        : [],

                diagnosis:
                    Array.isArray(diagnosis)
                        ? diagnosis
                        : [],

                createdAt:
                    new Date().toISOString(),
            };

            patientRecords.push(record);

            console.log(
                "===================================="
            );

            console.log(
                "PATIENT RECORD SAVED"
            );

            console.log(
                "Patient ID:",
                patientId
            );

            console.log(
                "Patient:",
                patientName
            );

            console.log(
                "Record ID:",
                record.id
            );

            console.log(
                "===================================="
            );

            return res.status(201).json({
                success: true,

                message:
                    "Consultation saved successfully",

                record,
            });

        } catch (error) {

            console.error(
                "Patient record save error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to save patient record",
                error:
                    error.message,
            });
        }
    }
);

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