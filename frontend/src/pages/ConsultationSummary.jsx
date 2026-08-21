import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/*
|--------------------------------------------------------------------------
| Consultation Summary
|--------------------------------------------------------------------------
|
| Consultation
|      ↓
| AI generated report
|      ↓
| Doctor reviews / edits
|      ↓
| Doctor edits prescription
|      ↓
| Save Consultation & Prescription
|      ↓
| Patient Record
|
|--------------------------------------------------------------------------
*/

const dosageOptions = [
    "¼ Tablet",
    "½ Tablet",
    "1 Tablet",
    "2 Tablets",
    "5 ml",
    "10 ml",
    "15 ml",
    "20 ml",
    "1 Sachet",
    "1 Capsule",
];

const frequencyOptions = [
    "1-0-0",
    "0-1-0",
    "0-0-1",
    "1-0-1",
    "1-1-0",
    "0-1-1",
    "1-1-1",
    "2-0-2",
    "2-2-2",
    "SOS / As needed",
];

const durationOptions = [
    "1 Day",
    "2 Days",
    "3 Days",
    "5 Days",
    "7 Days",
    "10 Days",
    "14 Days",
    "21 Days",
    "1 Month",
    "2 Months",
    "3 Months",
];

const NODE_API_URL =
    import.meta.env.VITE_NODE_API_URL ||
    "http://localhost:5001";

const FALLBACK_TEXT =
    "Not documented in this consultation.";


/* ==========================================================================
   Helpers
========================================================================== */

const normalizeText = (value) => {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (
                    item &&
                    typeof item === "object"
                ) {
                    return (
                        item.text ||
                        item.name ||
                        JSON.stringify(item)
                    );
                }

                return String(item);
            })
            .filter(Boolean)
            .join("\n");
    }

    if (
        typeof value === "object"
    ) {
        return JSON.stringify(
            value,
            null,
            2
        );
    }

    return String(value);
};


const firstAvailable = (...values) => {
    for (const value of values) {
        const text =
            normalizeText(value).trim();

        if (
            text &&
            text !== "undefined" &&
            text !== "null"
        ) {
            return text;
        }
    }

    return "";
};


const arrayValue = (value) => {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (
                    item &&
                    typeof item === "object"
                ) {
                    return (
                        item.text ||
                        item.name ||
                        JSON.stringify(item)
                    );
                }

                return String(item);
            })
            .filter(Boolean);
    }

    return String(value)
        .split(/\n|•|;/)
        .map((item) =>
            item
                .replace(/^[-*]\s*/, "")
                .trim()
        )
        .filter(Boolean);
};


const emptyMedicine = () => ({
    name: "",
    dosage: "",
    frequency: "",
    duration: "",
    instructions: "",
});


const formatDate = (dateValue) => {
    if (!dateValue) {
        return "Not available";
    }

    try {
        return new Date(dateValue)
            .toLocaleDateString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }
            );
    } catch {
        return "Not available";
    }
};


const formatTime = (dateValue) => {
    if (!dateValue) {
        return "Not available";
    }

    try {
        return new Date(dateValue)
            .toLocaleTimeString(
                "en-IN",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                }
            );
    } catch {
        return "Not available";
    }
};


/* ==========================================================================
   MAIN COMPONENT
========================================================================== */

const ConsultationSummary = () => {

    const location = useLocation();

    const navigate = useNavigate();


    /* ----------------------------------------------------------------------
       Patient ID
    ---------------------------------------------------------------------- */

    const pathParts =
        location.pathname
            .split("/")
            .filter(Boolean);

    const patientIdFromPath =
        pathParts.length >= 2
            ? pathParts[1]
            : "";


    /* ----------------------------------------------------------------------
       Read stored consultation
    ---------------------------------------------------------------------- */

    let storedResult = null;

    try {

        const stored =
            sessionStorage.getItem(
                `consultation-result-${patientIdFromPath}`
            );

        if (stored) {
            storedResult =
                JSON.parse(stored);
        }

    } catch (error) {

        console.warn(
            "[ConsultationSummary] Unable to read session storage:",
            error
        );

    }


    /* ----------------------------------------------------------------------
       Consultation state
    ---------------------------------------------------------------------- */

    const state =
        location.state ||
        storedResult ||
        {};


    /* ----------------------------------------------------------------------
       Patient
    ---------------------------------------------------------------------- */

    const patient =
        state.patient ||
        storedResult?.patient ||
        {
            id: patientIdFromPath,
            name: "Patient",
            age: "",
            gender: "",
            bloodGroup: "",
            weight: "",
            bloodPressure: "",
            allergies: "",
            history: [],
        };


    /*
     * Make absolutely sure we have one patient ID.
     *
     * Priority:
     * 1. patient.id
     * 2. state.patientId
     * 3. storedResult.patientId
     * 4. URL
     */

    const resolvedPatientId =
        patient?.id ||
        state?.patientId ||
        storedResult?.patientId ||
        patientIdFromPath ||
        "";


    /* ----------------------------------------------------------------------
       Summary
    ---------------------------------------------------------------------- */

    /*
     * The consultation response has appeared in a few shapes during the
     * different consultation flows.  Always unwrap the actual
     * consultation_summary object before rendering it.
     */
    const rawSummarySource =
        state.summary ||
        state.consultation_summary ||
        state.consultationSummary ||
        state.result?.consultation_summary ||
        state.result?.summary ||
        storedResult?.summary ||
        storedResult?.consultation_summary ||
        {};

    const rawSummary =
        rawSummarySource?.consultation_summary &&
            typeof rawSummarySource.consultation_summary === "object"
            ? rawSummarySource.consultation_summary
            : rawSummarySource;

    const normalizeTranscript = (value) => {
        if (Array.isArray(value)) {
            return value
                .map((line) => {
                    if (line && typeof line === "object") {
                        return {
                            speaker: line.speaker || line.role || "Unknown",
                            timestamp: line.timestamp || line.time || "00:00",
                            text: line.text || line.transcript || line.content || "",
                        };
                    }
                    return {
                        speaker: "Unknown",
                        timestamp: "00:00",
                        text: String(line || ""),
                    };
                })
                .filter((line) => line.text.trim());
        }

        if (typeof value === "string" && value.trim()) {
            return value
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                    const match = line.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
                    if (match) {
                        return {
                            timestamp: match[1] || "00:00",
                            speaker: match[2] || "Unknown",
                            text: match[3] || "",
                        };
                    }
                    return {
                        timestamp: "00:00",
                        speaker: "Unknown",
                        text: line,
                    };
                });
        }

        return [];
    };

    const transcript = normalizeTranscript(
        state.transcript ??
        state.audio_transcript ??
        storedResult?.transcript ??
        storedResult?.audio_transcript ??
        rawSummary.transcript ??
        rawSummary.audio_transcript ??
        []
    );


    const detectedLanguage =
        state.detectedLanguage ||
        storedResult?.detectedLanguage ||
        rawSummary.detectedLanguage ||
        rawSummary.detected_language ||
        rawSummary.language ||
        "Auto-detected";


    const generatedAt =
        state.generatedAt ||
        storedResult?.generatedAt ||
        new Date().toISOString();


    const startedAt =
        state.startedAt ||
        storedResult?.startedAt ||
        null;


    const endedAt =
        state.endedAt ||
        storedResult?.endedAt ||
        generatedAt;


    const doctorId =
        state.doctorId ||
        storedResult?.doctorId ||
        "default-doctor";


    const appointmentId =
        state.appointmentId ||
        storedResult?.appointmentId ||
        null;


    /* ----------------------------------------------------------------------
       Initial report
    ---------------------------------------------------------------------- */

    const initialReport = useMemo(() => {

        return {

            chief_complaint:
                firstAvailable(
                    rawSummary.chief_complaint,
                    rawSummary.chiefComplaint
                ),

            consultation_overview:
                firstAvailable(
                    rawSummary.consultation_overview,
                    rawSummary.consultationOverview,
                    rawSummary.overview,
                    rawSummary.chief_complaint
                        ? `Patient presented for consultation reporting ${rawSummary.chief_complaint.toLowerCase()}. Clinical evaluation was conducted and appropriate medical management was advised.`
                        : "Patient presented for clinical consultation. Comprehensive evaluation and treatment recommendations were documented."
                ),

            symptoms:
                arrayValue(
                    rawSummary.symptoms ||
                    rawSummary.presenting_symptoms
                ),

            history_of_present_illness:
                firstAvailable(
                    rawSummary.history_of_present_illness,
                    rawSummary.historyOfPresentIllness,
                    rawSummary.history
                ),

            past_medical_history: (() => {
                const direct = arrayValue(
                    rawSummary.past_medical_history ||
                    rawSummary.pastMedicalHistory ||
                    rawSummary.past_history ||
                    rawSummary.pastHistory ||
                    rawSummary.medical_history
                );
                if (direct && direct.length > 0) return direct;

                // Fallback: check if history_of_present_illness mentions prior recurrence or OTC medications
                const hpi = firstAvailable(
                    rawSummary.history_of_present_illness,
                    rawSummary.historyOfPresentIllness,
                    rawSummary.history
                );
                if (hpi && /similar|months ago|weeks ago|years ago|previous|past episode|prior episode|self-treated|over-the-counter|pharmacy/i.test(hpi)) {
                    const sentences = hpi.split(/(?<=[.?!])\s+/);
                    const match = sentences.find((s) => /similar|months ago|weeks ago|years ago|previous|past|prior|self-treated|over-the-counter|pharmacy/i.test(s));
                    if (match && match.trim()) return [match.trim()];
                }
                return [];
            })(),

            allergies:
                arrayValue(
                    rawSummary.allergies
                ),

            current_medications:
                arrayValue(
                    rawSummary.current_medications ||
                    rawSummary.currentMedications
                ),

            examination_findings:
                arrayValue(
                    rawSummary.examination_findings ||
                    rawSummary.examinationFindings
                ),

            vital_signs:
                rawSummary.vital_signs ||
                rawSummary.vitalSigns ||
                {
                    blood_pressure: "",
                    heart_rate: "",
                    temperature: "",
                    respiratory_rate: "",
                    oxygen_saturation: "",
                    weight: "",
                },

            investigations:
                arrayValue(
                    rawSummary.investigations
                ),

            assessment:
                firstAvailable(
                    rawSummary.assessment,
                    rawSummary.diagnosis
                ),

            diagnosis:
                arrayValue(
                    rawSummary.diagnosis
                ),

            differential_diagnosis:
                arrayValue(
                    rawSummary.differential_diagnosis ||
                    rawSummary.differentialDiagnosis
                ),

            treatment_plan:
                firstAvailable(
                    rawSummary.treatment_plan,
                    rawSummary.treatmentPlan
                ),

            advice:
                arrayValue(
                    rawSummary.advice
                ),

            follow_up:
                firstAvailable(
                    rawSummary.follow_up,
                    rawSummary.followUp
                ),

            doctor_notes:
                firstAvailable(
                    rawSummary.doctor_notes,
                    rawSummary.doctorNotes,
                    rawSummary.notes,
                    rawSummary.clinical_notes
                ),

            red_flags:
                arrayValue(
                    rawSummary.red_flags ||
                    rawSummary.redFlags
                ),
        };

    }, [rawSummary]);


    /* ----------------------------------------------------------------------
       Initial medicines
    ---------------------------------------------------------------------- */

    const initialMedicines = useMemo(() => {

        const medicines =
            rawSummary.medications_discussed ||
            rawSummary.medicines ||
            [];

        if (!Array.isArray(medicines)) {
            return [];
        }

        return medicines.map(
            (medicine) => ({
                name:
                    medicine?.name ||
                    "",

                dosage:
                    medicine?.dosage ||
                    "",

                frequency:
                    medicine?.frequency ||
                    "",

                duration:
                    medicine?.duration ||
                    "",

                instructions:
                    medicine?.instructions ||
                    "",
            })
        );

    }, [rawSummary]);


    /* ----------------------------------------------------------------------
       STATE
    ---------------------------------------------------------------------- */

    const [report, setReport] =
        useState(initialReport);

    const [medicines, setMedicines] =
        useState(initialMedicines);

    const [isSaving, setIsSaving] =
        useState(false);

    const [saveMessage, setSaveMessage] =
        useState("");

    const [saveSuccess, setSaveSuccess] =
        useState(false);

    const [showSaveModal, setShowSaveModal] =
        useState(false);

    const [isCompleting, setIsCompleting] =
        useState(false);

    const [consultationCompleted, setConsultationCompleted] =
        useState(false);

    const [savedPdfUrl, setSavedPdfUrl] =
        useState("");

    const [savedConsultationId, setSavedConsultationId] =
        useState("");

    const [error, setError] =
        useState("");

    const [editingTranscript, setEditingTranscript] =
        useState(false);

    const [editableTranscript, setEditableTranscript] =
        useState(() =>
            transcript.map((line) => ({
                speaker: line?.speaker || "Unknown",
                timestamp: line?.timestamp || "00:00",
                text: line?.text || "",
            }))
        );


    /* ----------------------------------------------------------------------
       Report update
    ---------------------------------------------------------------------- */

    const updateField = (
        field,
        value
    ) => {

        setReport(
            (previous) => ({
                ...previous,
                [field]: value,
            })
        );

    };


    /* ----------------------------------------------------------------------
       Array update
    ---------------------------------------------------------------------- */

    const updateArrayField = (
        field,
        index,
        value
    ) => {

        setReport(
            (previous) => {

                const next =
                    [
                        ...(previous[field] || [])
                    ];

                next[index] =
                    value;

                return {
                    ...previous,
                    [field]: next,
                };

            }
        );

    };


    const addArrayItem = (
        field
    ) => {

        setReport(
            (previous) => ({
                ...previous,

                [field]: [
                    ...(previous[field] || []),
                    "",
                ],
            })
        );

    };


    const removeArrayItem = (
        field,
        index
    ) => {

        setReport(
            (previous) => ({
                ...previous,

                [field]:
                    (
                        previous[field] ||
                        []
                    ).filter(
                        (_, itemIndex) =>
                            itemIndex !== index
                    ),
            })
        );

    };


    /* ----------------------------------------------------------------------
       Vital signs
    ---------------------------------------------------------------------- */

    const updateVital = (
        field,
        value
    ) => {

        setReport(
            (previous) => ({
                ...previous,

                vital_signs: {
                    ...(previous.vital_signs || {}),
                    [field]: value,
                },
            })
        );

    };


    /* ----------------------------------------------------------------------
       Medicines
    ---------------------------------------------------------------------- */

    const updateMedicine = (
        index,
        field,
        value
    ) => {

        setMedicines(
            (previous) =>
                previous.map(
                    (
                        medicine,
                        medicineIndex
                    ) =>
                        medicineIndex === index
                            ? {
                                ...medicine,
                                [field]:
                                    value,
                            }
                            : medicine
                )
        );

    };


    const addMedicine = () => {

        setMedicines(
            (previous) => [
                ...previous,
                emptyMedicine(),
            ]
        );

    };


    const removeMedicine = (
        index
    ) => {

        setMedicines(
            (previous) =>
                previous.filter(
                    (
                        _,
                        medicineIndex
                    ) =>
                        medicineIndex !==
                        index
                )
        );

    };


    /* ----------------------------------------------------------------------
       Transcript
    ---------------------------------------------------------------------- */

    const updateTranscript = (
        index,
        field,
        value
    ) => {

        setEditableTranscript(
            (previous) =>
                previous.map(
                    (
                        line,
                        lineIndex
                    ) =>
                        lineIndex === index
                            ? {
                                ...line,
                                [field]:
                                    value,
                            }
                            : line
                )
        );

    };


    /* ======================================================================
       SAVE CONSULTATION
    ====================================================================== */

    const handleSave = async () => {
        console.log("[ConsultationSummary] SAVE BUTTON CLICKED", {
            patientId: resolvedPatientId,
            doctorId,
            appointmentId,
        });

        setError("");
        setSaveMessage("");
        setSaveSuccess(false);
        setIsSaving(true);

        try {
            if (!resolvedPatientId) {
                throw new Error("Patient ID is required.");
            }

            const savedAt = new Date().toISOString();
            const validMedicines = medicines.filter(
                (medicine) => medicine?.name?.trim()
            );

            const transcriptForRecord = editableTranscript
                .map((line) => ({
                    speaker: line?.speaker || "Unknown",
                    timestamp: line?.timestamp || "00:00",
                    text: line?.text || "",
                }))
                .filter((line) => line.text.trim());

            const diagnosisList = Array.isArray(report.diagnosis)
                ? report.diagnosis.filter(Boolean)
                : arrayValue(report.diagnosis);

            /*
             * IMPORTANT:
             * The Node /api/v1/clinical/notes route expects the COMPLETE
             * edited report under `summary`, not only flat notes/symptoms.
             * The previous version sent only flat fields, so the server
             * created a record with an almost-empty summary.
             */
            const finalSummary = {
                ...report,
                symptoms: Array.isArray(report.symptoms)
                    ? report.symptoms.filter(Boolean)
                    : arrayValue(report.symptoms),
                diagnosis: diagnosisList,
                medications_discussed: validMedicines,
                transcript: transcriptForRecord,
                detected_language: detectedLanguage,
            };

            const consultationPayload = {
                patientId: resolvedPatientId,
                patient_id: resolvedPatientId,
                doctorId: doctorId || "default-doctor",
                doctor_id: doctorId || "default-doctor",
                appointmentId,
                appointment_id: appointmentId,
                patientName: patient?.name || "Unknown Patient",
                consultationDate: formatDate(startedAt || generatedAt),
                consultationTime: formatTime(startedAt || generatedAt),
                transcript: transcriptForRecord,
                summary: finalSummary,
                diagnosis: diagnosisList,
                medications: validMedicines,
                prescription: {
                    medications: validMedicines,
                    medicines: validMedicines,
                    advice: Array.isArray(report.advice)
                        ? report.advice.filter(Boolean).join("\n")
                        : String(report.advice || ""),
                    follow_up_date: report.follow_up || null,
                    follow_up: report.follow_up || "",
                    pdf_url: null,
                },
                /* Kept for compatibility with older backend handlers. */
                notes: [
                    report.consultation_overview,
                    report.chief_complaint,
                    report.history_of_present_illness,
                    report.assessment,
                    report.treatment_plan,
                    report.doctor_notes,
                ]
                    .filter((value) => value && String(value).trim())
                    .join("\n\n"),
                symptoms: Array.isArray(report.symptoms)
                    ? report.symptoms.filter(Boolean).join(", ")
                    : String(report.symptoms || ""),
                language: detectedLanguage || "Auto-detected",
                audio_transcript: transcriptForRecord
                    .map((line) => `[${line.timestamp}] ${line.speaker}: ${line.text}`)
                    .join("\n"),
            };

            console.log(
                "[ConsultationSummary] Saving COMPLETE consultation payload:",
                consultationPayload
            );

            const response = await fetch(
                `${NODE_API_URL}/api/v1/clinical/notes`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(consultationPayload),
                }
            );

            const raw = await response.text();
            let result = {};
            try {
                result = raw ? JSON.parse(raw) : {};
            } catch {
                result = { raw };
            }

            console.log("[ConsultationSummary] Save response:", result);

            if (!response.ok || result?.success === false) {
                throw new Error(
                    result?.message ||
                    result?.error ||
                    result?.raw ||
                    `Consultation save failed (${response.status})`
                );
            }

            /* Keep a browser-side copy so Patient Records can immediately
               display the newly approved consultation during development. */
            const consultationRecord = {
                id:
                    result?.consultationId ||
                    state.consultationId ||
                    `consultation-${Date.now()}`,
                consultationId:
                    result?.consultationId ||
                    state.consultationId ||
                    `consultation-${Date.now()}`,
                doctorId: doctorId || "default-doctor",
                patientId: resolvedPatientId,
                patientName: patient?.name || "Unknown Patient",
                appointmentId,
                consultationDate: formatDate(startedAt || generatedAt),
                consultationTime: formatTime(startedAt || generatedAt),
                startedAt,
                endedAt,
                savedAt,
                detectedLanguage,
                transcript: transcriptForRecord,
                report: finalSummary,
                prescription: {
                    medications: validMedicines,
                    medicines: validMedicines,
                    advice: report.advice || [],
                    follow_up: report.follow_up || "",
                },
                status: result?.record?.status || "Saved",
                pdfUrl: result?.record?.pdfUrl || "",
            };

            const storageKey = `patient-records-${resolvedPatientId}`;
            let existingRecords = [];
            try {
                const existing = localStorage.getItem(storageKey);
                existingRecords = existing ? JSON.parse(existing) : [];
                if (!Array.isArray(existingRecords)) existingRecords = [];
            } catch {
                existingRecords = [];
            }

            const withoutDuplicate = existingRecords.filter(
                (item) => item?.consultationId !== consultationRecord.consultationId
            );
            localStorage.setItem(
                storageKey,
                JSON.stringify([consultationRecord, ...withoutDuplicate])
            );

            const activePdfUrl =
                result?.files?.pdfUrl ||
                result?.record?.pdfUrl ||
                result?.pdfUrl ||
                `/api/v1/clinical/notes/${encodeURIComponent(resolvedPatientId)}/${encodeURIComponent(consultationRecord.consultationId)}/pdf`;

            setSavedPdfUrl(activePdfUrl);
            setSavedConsultationId(result?.consultationId || result?.record?.consultationId || consultationRecord.consultationId);

            const finalSessionResult = {
                ...state,
                patient,
                patientId: resolvedPatientId,
                doctorId: doctorId || "default-doctor",
                appointmentId,
                transcript: transcriptForRecord,
                detectedLanguage,
                summary: finalSummary,
                generatedAt,
                startedAt,
                endedAt,
                savedAt,
                consultationSaved: true,
                consultationId: consultationRecord.consultationId,
                pdfUrl: activePdfUrl,
            };

            sessionStorage.setItem(
                `consultation-result-${resolvedPatientId}`,
                JSON.stringify(finalSessionResult)
            );

            setSaveSuccess(true);
            setSaveMessage("✓ Consultation saved and medical PDF generated successfully.");
            setShowSaveModal(true);
            setError("");
        } catch (saveError) {
            console.error("[ConsultationSummary] SAVE FAILED:", saveError);
            setSaveSuccess(false);
            setSaveMessage("");
            setError(
                saveError?.message ||
                "Unable to save consultation. Please check that the backend is running."
            );
        } finally {
            setIsSaving(false);
        }
    };

    /* ======================================================================
       MARK CONSULTATION COMPLETED
    ====================================================================== */

    const handleMarkCompleted = async () => {
        const consId = savedConsultationId || state.consultationId;
        if (!consId) {
            setError("Please save the consultation before marking it as completed.");
            return;
        }

        setIsCompleting(true);
        setError("");

        try {
            // 1. Mark consultation record completed in backend
            const response = await fetch(
                `${NODE_API_URL}/api/v1/clinical/notes/${encodeURIComponent(resolvedPatientId)}/${encodeURIComponent(consId)}/complete`,
                { method: "PATCH" }
            );
            const result = await response.json();

            if (!response.ok || result?.success === false) {
                throw new Error(result?.message || "Unable to mark consultation as completed.");
            }

            // 2. Also ensure the appointment is marked completed
            if (appointmentId && String(appointmentId).startsWith("appointment-") === false) {
                try {
                    await fetch(`${NODE_API_URL}/api/appointments/${encodeURIComponent(appointmentId)}/complete`, {
                        method: "PATCH",
                    });
                } catch (appErr) {
                    console.warn("[ConsultationSummary] Appointment complete notice:", appErr);
                }
            }

            setConsultationCompleted(true);
            setSaveMessage("✓ Consultation completed! Successfully added to completed list on Dashboard.");

            const stored = sessionStorage.getItem(`consultation-result-${resolvedPatientId}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                sessionStorage.setItem(
                    `consultation-result-${resolvedPatientId}`,
                    JSON.stringify({ ...parsed, consultationCompleted: true, status: "Completed" })
                );
            }
        } catch (completeError) {
            console.error("[ConsultationSummary] Completion failed:", completeError);
            setError(completeError?.message || "Unable to mark consultation as completed.");
        } finally {
            setIsCompleting(false);
        }
    };


    /* ----------------------------------------------------------------------
       Back
    ---------------------------------------------------------------------- */

    const handleBack = () => {

        navigate(
            `/consultation/${resolvedPatientId}`
        );

    };


    /* ----------------------------------------------------------------------
       Print
    ---------------------------------------------------------------------- */

    const handlePrint = () => {

        window.print();

    };


    /* ======================================================================
       UI
    ====================================================================== */





    return (

        <div className="consultation-summary-page">

            {/* HEADER */}

            <header className="summary-header">

                <div>

                    <button
                        className="back-button"
                        onClick={handleBack}
                    >
                        ← Back
                    </button>

                    <div className="title-row">

                        <div>

                            <h1>
                                Consultation Summary
                            </h1>

                            <p>

                                {patient.name}

                                {patient.age
                                    ? ` • ${patient.age} years`
                                    : ""}

                                {patient.gender
                                    ? ` • ${patient.gender}`
                                    : ""}

                            </p>

                        </div>

                        <span className="ai-badge">
                            ✦ AI Draft
                        </span>

                    </div>

                </div>


                <button
                    className="print-button"
                    onClick={handlePrint}
                >
                    🖨 Print
                </button>

            </header>


            {/* REVIEW NOTICE */}

            <section className="review-banner">

                <div className="review-icon">
                    ✓
                </div>

                <div>

                    <strong>
                        Doctor Review Required
                    </strong>

                    <p>
                        Review and edit the
                        AI-generated consultation
                        report before saving it
                        to the patient's medical
                        record.
                    </p>

                </div>

            </section>


            {/* META */}

            <section className="meta-grid">

                <MetaCard
                    label="Patient"
                    value={patient.name}
                />

                <MetaCard
                    label="Patient ID"
                    value={resolvedPatientId}
                />

                <MetaCard
                    label="Consultation Date"
                    value={formatDate(
                        startedAt ||
                        generatedAt
                    )}
                />

                <MetaCard
                    label="Consultation Time"
                    value={formatTime(
                        startedAt ||
                        generatedAt
                    )}
                />

                <MetaCard
                    label="Language"
                    value={
                        detectedLanguage
                    }
                />

                <MetaCard
                    label="Status"
                    value={
                        consultationCompleted
                            ? "Completed"
                            : saveSuccess
                                ? "Saved — Mark as Completed"
                                : "Review Required"
                    }
                />

            </section>


            {/* ERROR */}

            {error && (

                <div className="error-banner">

                    <strong>
                        Save failed
                    </strong>

                    <span>
                        {error}
                    </span>

                </div>

            )}


            {/* SUCCESS */}

            {showSaveModal && (
                <div className="save-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="save-modal">
                        <div className="save-modal-icon">✓</div>
                        <h2>{consultationCompleted ? "Consultation Completed" : "Consultation Saved"}</h2>
                        <p>
                            The reviewed consultation report, transcript, prescription and combined PDF have been saved to {patient?.name || "the patient's"} medical record.
                        </p>
                        <div className="save-modal-actions">
                            {!consultationCompleted && (
                                <button
                                    type="button"
                                    className="modal-primary-button"
                                    onClick={handleMarkCompleted}
                                    disabled={isCompleting}
                                >
                                    {isCompleting ? "Completing..." : "✓ Mark Consultation Completed"}
                                </button>
                            )}
                            {savedPdfUrl && (
                                <button
                                    type="button"
                                    className="modal-secondary-button"
                                    onClick={() => window.open(`${NODE_API_URL}${savedPdfUrl}`, "_blank", "noopener,noreferrer")}
                                >
                                    View Combined PDF
                                </button>
                            )}
                            <button
                                type="button"
                                className="modal-secondary-button"
                                onClick={() => navigate(`/patients/${resolvedPatientId}`)}
                            >
                                View Patient Record →
                            </button>
                            {consultationCompleted && (
                                <button
                                    type="button"
                                    className="modal-primary-button"
                                    onClick={() => navigate("/dashboard")}
                                >
                                    Go to Dashboard →
                                </button>
                            )}
                            <button
                                type="button"
                                className="modal-secondary-button"
                                onClick={() => setShowSaveModal(false)}
                            >
                                Stay Here
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==============================================================
                MAIN
            ============================================================== */}

            <main className="summary-grid">


                {/* ==========================================================
                    LEFT
                ========================================================== */}

                <div className="report-column">


                    <EditableSection
                        title="Consultation Overview"
                        icon="🩺"
                    >

                        <textarea
                            value={
                                report.consultation_overview
                            }
                            onChange={(event) =>
                                updateField(
                                    "consultation_overview",
                                    event.target.value
                                )
                            }
                            placeholder={
                                FALLBACK_TEXT
                            }
                        />

                    </EditableSection>


                    <EditableSection
                        title="Chief Complaint"
                        icon="⚠️"
                    >

                        <textarea
                            value={
                                report.chief_complaint
                            }
                            onChange={(event) =>
                                updateField(
                                    "chief_complaint",
                                    event.target.value
                                )
                            }
                            placeholder={
                                FALLBACK_TEXT
                            }
                        />

                    </EditableSection>


                    <EditableListSection
                        title="Presenting Symptoms"
                        icon="🩹"
                        field="symptoms"
                        values={
                            report.symptoms
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    <EditableSection
                        title="History of Present Illness"
                        icon="📋"
                    >

                        <textarea
                            value={
                                report.history_of_present_illness
                            }
                            onChange={(event) =>
                                updateField(
                                    "history_of_present_illness",
                                    event.target.value
                                )
                            }
                            placeholder={
                                FALLBACK_TEXT
                            }
                        />

                    </EditableSection>


                    <EditableListSection
                        title="Past Medical History"
                        icon="🏥"
                        field="past_medical_history"
                        values={
                            report.past_medical_history
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    <EditableListSection
                        title="Allergies"
                        icon="⚕️"
                        field="allergies"
                        values={
                            report.allergies
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    <EditableListSection
                        title="Current Medications"
                        icon="💊"
                        field="current_medications"
                        values={
                            report.current_medications
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    <EditableListSection
                        title="Examination Findings"
                        icon="🔬"
                        field="examination_findings"
                        values={
                            report.examination_findings
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    {/* VITALS */}

                    <section className="report-card">

                        <SectionHeading
                            title="Vital Signs"
                            icon="❤️"
                        />

                        <div className="vitals-edit-grid">

                            <InputField
                                label="Blood Pressure"
                                value={
                                    report.vital_signs
                                        ?.blood_pressure ||
                                    ""
                                }
                                onChange={(value) =>
                                    updateVital(
                                        "blood_pressure",
                                        value
                                    )
                                }
                            />

                            <InputField
                                label="Heart Rate"
                                value={
                                    report.vital_signs
                                        ?.heart_rate ||
                                    ""
                                }
                                onChange={(value) =>
                                    updateVital(
                                        "heart_rate",
                                        value
                                    )
                                }
                            />

                            <InputField
                                label="Temperature"
                                value={
                                    report.vital_signs
                                        ?.temperature ||
                                    ""
                                }
                                onChange={(value) =>
                                    updateVital(
                                        "temperature",
                                        value
                                    )
                                }
                            />

                            <InputField
                                label="Respiratory Rate"
                                value={
                                    report.vital_signs
                                        ?.respiratory_rate ||
                                    ""
                                }
                                onChange={(value) =>
                                    updateVital(
                                        "respiratory_rate",
                                        value
                                    )
                                }
                            />

                            <InputField
                                label="Oxygen Saturation"
                                value={
                                    report.vital_signs
                                        ?.oxygen_saturation ||
                                    ""
                                }
                                onChange={(value) =>
                                    updateVital(
                                        "oxygen_saturation",
                                        value
                                    )
                                }
                            />

                            <InputField
                                label="Weight"
                                value={
                                    report.vital_signs
                                        ?.weight ||
                                    ""
                                }
                                onChange={(value) =>
                                    updateVital(
                                        "weight",
                                        value
                                    )
                                }
                            />

                        </div>

                    </section>


                    <EditableListSection
                        title="Investigations"
                        icon="🧪"
                        field="investigations"
                        values={
                            report.investigations
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    <EditableSection
                        title="Assessment"
                        icon="🔎"
                    >

                        <textarea
                            value={
                                report.assessment
                            }
                            onChange={(event) =>
                                updateField(
                                    "assessment",
                                    event.target.value
                                )
                            }
                            placeholder={
                                FALLBACK_TEXT
                            }
                        />

                    </EditableSection>


                    <EditableListSection
                        title="Diagnosis"
                        icon="🩺"
                        field="diagnosis"
                        values={
                            report.diagnosis
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    <EditableListSection
                        title="Differential Diagnosis"
                        icon="🔍"
                        field="differential_diagnosis"
                        values={
                            report.differential_diagnosis
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    <EditableSection
                        title="Treatment Plan"
                        icon="💊"
                    >

                        <textarea
                            value={
                                report.treatment_plan
                            }
                            onChange={(event) =>
                                updateField(
                                    "treatment_plan",
                                    event.target.value
                                )
                            }
                            placeholder={
                                FALLBACK_TEXT
                            }
                        />

                    </EditableSection>


                    <EditableListSection
                        title="Advice"
                        icon="💡"
                        field="advice"
                        values={
                            report.advice
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    <EditableSection
                        title="Follow-up"
                        icon="📅"
                    >

                        <textarea
                            value={
                                report.follow_up
                            }
                            onChange={(event) =>
                                updateField(
                                    "follow_up",
                                    event.target.value
                                )
                            }
                            placeholder={
                                "No follow-up documented."
                            }
                        />

                    </EditableSection>


                    <EditableSection
                        title="Doctor Notes"
                        icon="📝"
                    >

                        <textarea
                            value={
                                report.doctor_notes
                            }
                            onChange={(event) =>
                                updateField(
                                    "doctor_notes",
                                    event.target.value
                                )
                            }
                            placeholder={
                                FALLBACK_TEXT
                            }
                        />

                    </EditableSection>


                    <EditableListSection
                        title="Red Flags"
                        icon="🚨"
                        field="red_flags"
                        values={
                            report.red_flags
                        }
                        updateArrayField={
                            updateArrayField
                        }
                        addArrayItem={
                            addArrayItem
                        }
                        removeArrayItem={
                            removeArrayItem
                        }
                    />


                    {/* ======================================================
                        PRESCRIPTION
                    ====================================================== */}

                    <section className="report-card prescription-card">

                        <div className="section-heading-row">

                            <SectionHeading
                                title="Prescription"
                                icon="💊"
                            />

                            <button
                                className="add-button"
                                onClick={
                                    addMedicine
                                }
                            >
                                + Add Medicine
                            </button>

                        </div>


                        <p className="section-description">
                            Review the medicines
                            identified from the
                            consultation. Only save
                            medicines that the doctor
                            confirms.
                        </p>


                        {medicines.length === 0 ? (

                            <div className="empty-medicine">

                                No medicines added.

                                <br />

                                Click{" "}
                                <strong>
                                    + Add Medicine
                                </strong>{" "}
                                if a prescription
                                is required.

                            </div>

                        ) : (

                            <div className="medicine-list">

                                {medicines.map(
                                    (
                                        medicine,
                                        index
                                    ) => (

                                        <div
                                            className="medicine-row"
                                            key={
                                                index
                                            }
                                        >

                                            <div className="medicine-number">
                                                {index + 1}
                                            </div>


                                            <InputField
                                                label="Medicine"
                                                value={
                                                    medicine.name
                                                }
                                                onChange={(
                                                    value
                                                ) =>
                                                    updateMedicine(
                                                        index,
                                                        "name",
                                                        value
                                                    )
                                                }
                                            />


                                            <div className="input-field">

                                                <label>
                                                    Dosage
                                                </label>

                                                <select
                                                    value={
                                                        medicine.dosage ||
                                                        ""
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        updateMedicine(
                                                            index,
                                                            "dosage",
                                                            event.target.value
                                                        )
                                                    }
                                                    className="medicine-select"
                                                >

                                                    <option value="">
                                                        Select dosage
                                                    </option>

                                                    {dosageOptions.map(
                                                        (
                                                            option
                                                        ) => (
                                                            <option
                                                                key={
                                                                    option
                                                                }
                                                                value={
                                                                    option
                                                                }
                                                            >
                                                                {
                                                                    option
                                                                }
                                                            </option>
                                                        )
                                                    )}

                                                </select>

                                            </div>


                                            <div className="input-field">

                                                <label>
                                                    Frequency
                                                </label>

                                                <select
                                                    value={
                                                        medicine.frequency ||
                                                        ""
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        updateMedicine(
                                                            index,
                                                            "frequency",
                                                            event.target.value
                                                        )
                                                    }
                                                    className="medicine-select"
                                                >

                                                    <option value="">
                                                        Select frequency
                                                    </option>

                                                    {frequencyOptions.map(
                                                        (
                                                            option
                                                        ) => (
                                                            <option
                                                                key={
                                                                    option
                                                                }
                                                                value={
                                                                    option
                                                                }
                                                            >
                                                                {
                                                                    option
                                                                }
                                                            </option>
                                                        )
                                                    )}

                                                </select>

                                            </div>


                                            <div className="input-field">

                                                <label>
                                                    Duration
                                                </label>

                                                <select
                                                    value={
                                                        medicine.duration ||
                                                        ""
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        updateMedicine(
                                                            index,
                                                            "duration",
                                                            event.target.value
                                                        )
                                                    }
                                                    className="medicine-select"
                                                >

                                                    <option value="">
                                                        Select duration
                                                    </option>

                                                    {durationOptions.map(
                                                        (
                                                            option
                                                        ) => (
                                                            <option
                                                                key={
                                                                    option
                                                                }
                                                                value={
                                                                    option
                                                                }
                                                            >
                                                                {
                                                                    option
                                                                }
                                                            </option>
                                                        )
                                                    )}

                                                </select>

                                            </div>


                                            <InputField
                                                label="Instructions"
                                                value={
                                                    medicine.instructions
                                                }
                                                onChange={(
                                                    value
                                                ) =>
                                                    updateMedicine(
                                                        index,
                                                        "instructions",
                                                        value
                                                    )
                                                }
                                            />


                                            <button
                                                className="delete-medicine"
                                                onClick={() =>
                                                    removeMedicine(
                                                        index
                                                    )
                                                }
                                            >
                                                Remove
                                            </button>

                                        </div>

                                    )
                                )}

                            </div>

                        )}

                    </section>

                </div>


                {/* ==========================================================
                    RIGHT SIDE
                ========================================================== */}

                <aside className="side-column">


                    {/* PATIENT SUMMARY */}

                    <section className="side-card">

                        <SectionHeading
                            title="Patient Summary"
                            icon="👤"
                        />

                        <div className="patient-name">
                            {patient.name}
                        </div>

                        <div className="patient-meta">

                            {patient.age
                                ? `${patient.age} years`
                                : ""}

                            {patient.gender
                                ? ` • ${patient.gender}`
                                : ""}

                        </div>


                        <div className="patient-stat-grid">

                            <Stat
                                label="Patient ID"
                                value={
                                    resolvedPatientId
                                }
                            />

                            <Stat
                                label="Blood Group"
                                value={
                                    patient.bloodGroup ||
                                    "—"
                                }
                            />

                            <Stat
                                label="Weight"
                                value={
                                    patient.weight ||
                                    "—"
                                }
                            />

                            <Stat
                                label="BP"
                                value={
                                    patient.bloodPressure ||
                                    "—"
                                }
                            />

                            <Stat
                                label="Allergies"
                                value={
                                    patient.allergies ||
                                    "—"
                                }
                            />

                        </div>

                    </section>


                    {/* CONSULTATION DETAILS */}

                    <section className="side-card">

                        <SectionHeading
                            title="Consultation Details"
                            icon="🗓"
                        />

                        <DetailRow
                            label="Date"
                            value={formatDate(
                                startedAt ||
                                generatedAt
                            )}
                        />

                        <DetailRow
                            label="Start"
                            value={formatTime(
                                startedAt
                            )}
                        />

                        <DetailRow
                            label="End"
                            value={formatTime(
                                endedAt
                            )}
                        />

                        <DetailRow
                            label="Language"
                            value={
                                detectedLanguage
                            }
                        />

                    </section>


                    {/* TRANSCRIPT */}

                    <section className="side-card transcript-card">

                        <div className="section-heading-row">

                            <SectionHeading
                                title="Full Transcript"
                                icon="🎙"
                            />

                            <button
                                className="small-outline-button"
                                onClick={() =>
                                    setEditingTranscript(
                                        (value) =>
                                            !value
                                    )
                                }
                            >
                                {editingTranscript
                                    ? "Done"
                                    : "Edit"}
                            </button>

                        </div>


                        <p className="section-description">
                            Complete conversation
                            captured during this
                            consultation.
                        </p>


                        <div className="transcript-container">

                            {editableTranscript.length === 0 ? (

                                <div className="empty-transcript">
                                    No transcript
                                    available.
                                </div>

                            ) : (

                                editableTranscript.map(
                                    (
                                        line,
                                        index
                                    ) => (

                                        <div
                                            className="transcript-line"
                                            key={
                                                index
                                            }
                                        >

                                            <div className="transcript-meta">

                                                <strong>
                                                    {
                                                        line.speaker
                                                    }
                                                </strong>

                                                <span>
                                                    [
                                                    {
                                                        line.timestamp
                                                    }
                                                    ]
                                                </span>

                                            </div>


                                            {editingTranscript ? (

                                                <textarea
                                                    className="transcript-edit"
                                                    value={
                                                        line.text
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        updateTranscript(
                                                            index,
                                                            "text",
                                                            event.target.value
                                                        )
                                                    }
                                                />

                                            ) : (

                                                <div className="transcript-text">
                                                    {
                                                        line.text
                                                    }
                                                </div>

                                            )}

                                        </div>

                                    )
                                )

                            )}

                        </div>

                    </section>


                    {/* SAVE */}

                    <div
                        style={{
                            marginTop: "25px",
                            padding: "20px",
                            borderRadius: "14px",
                            background:
                                "rgba(255,255,255,0.025)",
                            border:
                                "1px solid rgba(255,255,255,0.08)",
                            display: "flex",
                            justifyContent:
                                "space-between",
                            alignItems: "center",
                            gap: "15px",
                            flexWrap: "wrap",
                        }}
                    >

                        <div
                            style={{
                                color: "#8e98a9",
                                fontSize: "13px",
                                lineHeight: 1.6,
                                flex: "1 1 250px",
                            }}
                        >
                            Doctor confirmation is required
                            before saving this consultation
                            to the patient's permanent record.
                        </div>


                        <div
                            style={{
                                display: "flex",
                                gap: "10px",
                                flexWrap: "wrap",
                            }}
                        >

                            <button
                                onClick={
                                    handleBack
                                }
                                style={{
                                    background:
                                        "rgba(255,255,255,0.06)",
                                    color:
                                        "#ffffff",
                                    border:
                                        "1px solid rgba(255,255,255,0.15)",
                                    borderRadius:
                                        "10px",
                                    padding:
                                        "12px 20px",
                                    cursor:
                                        "pointer",
                                    fontWeight:
                                        700,
                                }}
                            >
                                Return
                            </button>


                            <button
                                type="button"
                                onClick={
                                    handleSave
                                }
                                disabled={
                                    isSaving || saveSuccess
                                }
                                style={{
                                    background:
                                        isSaving
                                            ? "#55777d"
                                            : "#00a8b5",
                                    color:
                                        "#ffffff",
                                    border:
                                        "none",
                                    borderRadius:
                                        "10px",
                                    padding:
                                        "12px 24px",
                                    cursor:
                                        isSaving
                                            ? "not-allowed"
                                            : "pointer",
                                    fontWeight:
                                        800,
                                    minWidth:
                                        "190px",
                                }}
                            >

                                {isSaving
                                    ? "Saving & Generating PDF..."
                                    : saveSuccess
                                        ? "✓ Consultation Saved"
                                        : "✓ Save Consultation"}

                            </button>

                        </div>

                    </div>


                    {saveMessage && (
                        <div
                            style={{
                                marginTop: "12px",
                                padding:
                                    "12px 16px",
                                borderRadius:
                                    "10px",
                                background:
                                    "rgba(0,168,181,0.1)",
                                border:
                                    "1px solid rgba(0,168,181,0.3)",
                                color:
                                    "#00d2ff",
                                fontWeight:
                                    700,
                            }}
                        >
                            {saveMessage}
                        </div>
                    )}

                    {(saveSuccess || savedPdfUrl) && (
                        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                            <button
                                type="button"
                                onClick={() => {
                                    const pdfTarget = savedPdfUrl || `/api/v1/clinical/notes/${encodeURIComponent(resolvedPatientId)}/${encodeURIComponent(savedConsultationId || state.consultationId)}/pdf`;
                                    window.open(`${NODE_API_URL}${pdfTarget}`, "_blank", "noopener,noreferrer");
                                }}
                                style={{
                                    background: "linear-gradient(135deg, #00d2ff, #0099cc)",
                                    color: "#031019",
                                    border: "none",
                                    borderRadius: "10px",
                                    padding: "12px 20px",
                                    cursor: "pointer",
                                    fontWeight: 800,
                                    fontSize: "14px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "8px",
                                    boxShadow: "0 4px 15px rgba(0,210,255,0.25)",
                                }}
                            >
                                📄 View / Download Medical PDF
                            </button>

                            {!consultationCompleted ? (
                                <button
                                    type="button"
                                    onClick={handleMarkCompleted}
                                    disabled={isCompleting}
                                    style={{
                                        background: isCompleting ? "#55777d" : "#22c55e",
                                        color: "#031019",
                                        border: "none",
                                        borderRadius: "10px",
                                        padding: "12px 20px",
                                        cursor: isCompleting ? "not-allowed" : "pointer",
                                        fontWeight: 800,
                                        fontSize: "14px",
                                    }}
                                >
                                    {isCompleting ? "Completing..." : "✓ Mark Consultation Completed"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => navigate("/dashboard")}
                                    style={{
                                        background: "rgba(34,197,94,0.15)",
                                        color: "#4ade80",
                                        border: "1px solid rgba(34,197,94,0.4)",
                                        borderRadius: "10px",
                                        padding: "12px 20px",
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        fontSize: "14px",
                                    }}
                                >
                                    Go to Dashboard →
                                </button>
                            )}
                        </div>
                    )}

                </aside>

                "
                <style>{`
                .consultation-summary-page {
                    min-height: 100vh;
                    box-sizing: border-box;
                    padding: 28px 26px 70px;
                    color: #f8fafc;
                    background:
                        radial-gradient(circle at 10% 0%, rgba(0, 168, 181, 0.09), transparent 28%),
                        radial-gradient(circle at 95% 35%, rgba(81, 67, 157, 0.07), transparent 25%),
                        #050b14;
                    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                }

                .consultation-summary-page *,
                .consultation-summary-page *::before,
                .consultation-summary-page *::after {
                    box-sizing: border-box;
                }

                .summary-header {
                    width: min(1580px, 100%);
                    margin: 0 auto 24px;
                    padding: 24px 30px 28px;
                    min-height: 190px;
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 28px;
                    border: 1px solid rgba(0, 185, 215, 0.30);
                    border-radius: 20px;
                    background: linear-gradient(135deg, rgba(12, 23, 39, 0.96), rgba(7, 16, 29, 0.94));
                }

                .back-button, .print-button, .small-outline-button, .add-button, .list-add, .list-remove, .delete-medicine {
                    font: inherit;
                    cursor: pointer;
                }

                .back-button {
                    border: 1px solid rgba(148, 163, 184, 0.28);
                    background: rgba(255,255,255,0.045);
                    color: #f8fafc;
                    border-radius: 10px;
                    padding: 10px 16px;
                    font-weight: 700;
                    margin-bottom: 22px;
                }

                .title-row {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 14px;
                }

                .title-row h1 {
                    margin: 0;
                    font-size: clamp(34px, 4vw, 50px);
                    line-height: 1.08;
                    letter-spacing: -1.8px;
                    font-weight: 850;
                }

                .title-row p {
                    margin: 8px 0 0;
                    color: #9fb0c7;
                    font-size: 16px;
                }

                .ai-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    border: 1px solid rgba(0, 211, 255, 0.58);
                    background: rgba(0, 211, 255, 0.08);
                    color: #00d2ff;
                    border-radius: 999px;
                    padding: 7px 13px;
                    font-size: 13px;
                    font-weight: 800;
                }

                .print-button {
                    border: 1px solid rgba(148, 163, 184, 0.30);
                    background: rgba(255,255,255,0.045);
                    color: #f8fafc;
                    border-radius: 10px;
                    padding: 11px 16px;
                    font-weight: 700;
                    white-space: nowrap;
                }

                .review-banner {
                    width: min(1580px, 100%);
                    margin: 0 auto 22px;
                    padding: 20px 26px;
                    display: flex;
                    align-items: center;
                    gap: 18px;
                    border: 1px solid rgba(0, 188, 218, 0.38);
                    border-radius: 17px;
                    background: linear-gradient(90deg, rgba(0, 173, 201, 0.11), rgba(9, 22, 37, 0.74));
                }

                .review-icon {
                    width: 48px;
                    height: 48px;
                    flex: 0 0 48px;
                    display: grid;
                    place-items: center;
                    border-radius: 50%;
                    border: 1px solid rgba(0, 211, 255, 0.65);
                    color: #00d2ff;
                    font-size: 25px;
                }

                .review-banner strong { font-size: 16px; }
                .review-banner p { margin: 4px 0 0; color: #9fb0c7; font-size: 13px; }

                .meta-grid {
                    width: min(1580px, 100%);
                    margin: 0 auto 24px;
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 16px;
                }

                .meta-card {
                    min-height: 90px;
                    padding: 19px 20px;
                    border: 1px solid rgba(99, 120, 148, 0.27);
                    border-radius: 14px;
                    background: #0b1628;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }

                .meta-label {
                    color: #77879f;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: .08em;
                    text-transform: uppercase;
                    margin-bottom: 7px;
                }

                .meta-value {
                    color: #f5f7fb;
                    font-size: 15px;
                    font-weight: 800;
                    overflow-wrap: anywhere;
                }

                .summary-grid {
                    width: min(1580px, 100%);
                    margin: 0 auto;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(330px, 430px);
                    gap: 24px;
                    align-items: start;
                }

                .report-column, .side-column { min-width: 0; }
                .side-column { position: sticky; top: 18px; }

                .report-card, .side-card {
                    width: 100%;
                    margin: 0 0 16px;
                    padding: 22px 24px;
                    border: 1px solid rgba(95, 117, 145, 0.25);
                    border-radius: 16px;
                    background: rgba(7, 14, 26, 0.94);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.12);
                }

                .section-heading-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                .section-heading {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 15px;
                }

                .section-heading h2 {
                    margin: 0;
                    color: #00d8ff;
                    font-size: 18px;
                    line-height: 1.2;
                    font-weight: 850;
                }

                .section-icon { font-size: 17px; width: 20px; text-align: center; }
                .section-description { color: #8291a8; font-size: 12px; line-height: 1.6; margin: -4px 0 14px; }

                .report-card textarea, .report-card input, .report-card select, .transcript-edit {
                    width: 100%;
                    border: 1px solid rgba(100, 122, 151, 0.31);
                    background: #07101d;
                    color: #e9eef7;
                    border-radius: 10px;
                    padding: 12px 13px;
                    font: inherit;
                    outline: none;
                    transition: border-color .15s ease, box-shadow .15s ease;
                }

                .report-card textarea { min-height: 92px; resize: vertical; line-height: 1.55; }
                .report-card textarea:focus, .report-card input:focus, .report-card select:focus, .transcript-edit:focus {
                    border-color: rgba(0, 210, 255, 0.72);
                    box-shadow: 0 0 0 3px rgba(0, 210, 255, 0.08);
                }

                .editable-list { display: grid; gap: 10px; }
                .editable-list-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; }
                .editable-list-row textarea { min-height: 68px; }
                .list-remove, .delete-medicine {
                    border: 1px solid rgba(236, 72, 153, .55);
                    color: #ff4d8f;
                    background: rgba(236,72,153,.06);
                    border-radius: 9px;
                    padding: 10px 13px;
                    font-weight: 800;
                }
                .list-add, .add-button {
                    width: max-content;
                    border: 1px solid rgba(0, 210, 255, .45);
                    color: #00d8ff;
                    background: rgba(0,210,255,.06);
                    border-radius: 9px;
                    padding: 9px 13px;
                    font-weight: 800;
                }

                .empty-medicine, .empty-transcript {
                    border: 1px dashed rgba(105, 126, 153, .27);
                    border-radius: 11px;
                    padding: 16px;
                    color: #728198;
                    font-size: 13px;
                }

                .vitals-edit-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0,1fr));
                    gap: 13px;
                }
                .input-field { min-width: 0; }
                .input-field label { display:block; color:#8090a8; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; margin:0 0 6px; }

                .medicine-list { display: grid; gap: 14px; }
                .medicine-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                    align-items: flex-end;
                    padding: 15px;
                    border: 1px solid rgba(100,122,151,.22);
                    border-radius: 12px;
                    background: rgba(255,255,255,.018);
                }
                .medicine-row .medicine-number {
                    flex: 0 0 20px;
                    color:#00d8ff; font-weight:900; padding-bottom:12px;
                }
                .medicine-row .input-field {
                    flex: 1 1 120px;
                }
                .medicine-row .input-field:nth-of-type(2) {
                    flex: 2 1 180px;
                }
                .medicine-row .input-field:nth-of-type(6) {
                    flex: 2 1 180px;
                }
                .medicine-row .delete-medicine {
                    flex: 0 0 auto;
                }
                .medicine-select { min-height: 44px; }

                .patient-name { font-size: 20px; font-weight: 850; margin-bottom: 4px; }
                .patient-meta { color:#8d9bb0; font-size:13px; margin-bottom:18px; }
                .patient-stat-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
                .patient-stat { padding:12px; border:1px solid rgba(100,122,151,.20); border-radius:10px; background:rgba(255,255,255,.018); }
                .patient-stat-label { color:#75859c; font-size:10px; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
                .patient-stat-value { color:#eef3fa; font-size:13px; font-weight:750; overflow-wrap:anywhere; }
                .detail-row { display:flex; justify-content:space-between; gap:15px; padding:11px 0; border-bottom:1px solid rgba(100,122,151,.16); }
                .detail-row:last-child { border-bottom:0; }
                .detail-label { color:#75859c; font-size:12px; }
                .detail-value { color:#e9eef7; font-size:12px; font-weight:750; text-align:right; }

                .transcript-card { max-height: 660px; }
                .transcript-container { max-height: 510px; overflow-y:auto; padding-right:4px; }
                .transcript-line { padding:11px 0; border-bottom:1px solid rgba(100,122,151,.16); }
                .transcript-line:last-child { border-bottom:0; }
                .transcript-meta { display:flex; justify-content:space-between; gap:10px; margin-bottom:6px; color:#7f90a8; font-size:11px; }
                .transcript-meta strong { color:#00d8ff; font-size:12px; }
                .transcript-text { color:#cbd5e3; font-size:13px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
                .transcript-edit { min-height:90px; resize:vertical; font-size:13px; }
                .small-outline-button { border:1px solid rgba(0,210,255,.45); color:#00d8ff; background:rgba(0,210,255,.05); border-radius:8px; padding:7px 11px; font-size:11px; font-weight:800; }

                .error-banner { width:min(1580px,100%); margin:0 auto 18px; padding:13px 16px; display:flex; gap:10px; flex-wrap:wrap; color:#ffd0d8; background:rgba(220,38,38,.09); border:1px solid rgba(248,113,113,.35); border-radius:11px; }
                .save-modal-backdrop { position:fixed; inset:0; z-index:9999; display:grid; place-items:center; padding:20px; background:rgba(0,0,0,.70); backdrop-filter:blur(8px); }
                .save-modal { width:min(500px,100%); padding:30px; text-align:center; border:1px solid rgba(0,210,255,.38); border-radius:20px; background:linear-gradient(160deg,#0d1a2d,#07101d); box-shadow:0 30px 100px rgba(0,0,0,.55); }
                .save-modal-icon { width:64px; height:64px; margin:0 auto 16px; display:grid; place-items:center; border-radius:50%; color:#00e5ff; border:1px solid rgba(0,229,255,.55); background:rgba(0,210,255,.09); font-size:34px; font-weight:900; }
                .save-modal h2 { margin:0 0 10px; font-size:25px; }
                .save-modal p { margin:0; color:#9eb0c8; font-size:14px; line-height:1.7; }
                .save-modal-actions { display:flex; justify-content:center; gap:10px; margin-top:22px; flex-wrap:wrap; }
                .modal-secondary-button, .modal-primary-button { border-radius:10px; padding:11px 16px; font:inherit; font-weight:800; cursor:pointer; }
                .modal-secondary-button { border:1px solid rgba(148,163,184,.28); background:rgba(255,255,255,.05); color:#e8eef7; }
                .modal-primary-button { border:0; background:#00c7df; color:#031019; }

                @media (max-width: 1100px) {
                    .summary-grid { grid-template-columns: 1fr; }
                    .side-column { position: static; }
                }
                @media (max-width: 760px) {
                    .consultation-summary-page { padding:16px 12px 50px; }
                    .summary-header { padding:18px; min-height:0; flex-direction:column; }
                    .meta-grid { grid-template-columns:1fr; }
                    .review-banner { align-items:flex-start; padding:17px; }
                    .vitals-edit-grid, .patient-stat-grid { grid-template-columns:1fr; }
                    .editable-list-row { grid-template-columns:1fr; }
                    .medicine-row .medicine-number { display:none; }
                }
                @media print {
                    .consultation-summary-page { background:#fff !important; color:#111 !important; }
                    button, .save-modal-backdrop { display:none !important; }
                    .summary-grid { grid-template-columns:1fr !important; }
                    .side-column { position:static !important; }
                    .report-card, .side-card, .meta-card, .summary-header, .review-banner { background:#fff !important; color:#111 !important; border-color:#ccc !important; box-shadow:none !important; }
                }
            `}</style>
            </main>
        </div>
    );
};

/* ==========================================================================
   COMPONENTS
========================================================================== */

const EditableSection = ({
    title,
    icon,
    children,
}) => {
    return (
        <section className="report-card">
            <SectionHeading
                title={title}
                icon={icon}
            />
            {children}
        </section>
    );
};


const EditableListSection = ({
    title,
    icon,
    field,
    values,
    updateArrayField,
    addArrayItem,
    removeArrayItem,
}) => {

    return (

        <section className="report-card">

            <SectionHeading
                title={title}
                icon={icon}
            />

            <div className="editable-list">

                {values?.length > 0 ? (

                    values.map(
                        (
                            value,
                            index
                        ) => (

                            <div
                                className="editable-list-row"
                                key={index}
                            >

                                <textarea
                                    value={
                                        value
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        updateArrayField(
                                            field,
                                            index,
                                            event.target.value
                                        )
                                    }
                                />

                                <button
                                    className="list-remove"
                                    onClick={() =>
                                        removeArrayItem(
                                            field,
                                            index
                                        )
                                    }
                                >
                                    Remove
                                </button>

                            </div>

                        )
                    )

                ) : (

                    <div className="empty-medicine">
                        No information documented.
                    </div>

                )}


                <button
                    className="list-add"
                    onClick={() =>
                        addArrayItem(
                            field
                        )
                    }
                >
                    + Add
                </button>

            </div>

        </section>

    );

};


const SectionHeading = ({
    title,
    icon,
}) => (

    <div className="section-heading">

        <span className="section-icon">
            {icon}
        </span>

        <h2>
            {title}
        </h2>

    </div>

);


const InputField = ({
    label,
    value,
    onChange,
}) => (

    <div className="input-field">

        <label>
            {label}
        </label>

        <input
            value={
                value || ""
            }
            onChange={(event) =>
                onChange(
                    event.target.value
                )
            }
        />

    </div>

);


const MetaCard = ({
    label,
    value,
}) => (

    <div className="meta-card">

        <div className="meta-label">
            {label}
        </div>

        <div className="meta-value">
            {value || "—"}
        </div>

    </div>

);


const Stat = ({
    label,
    value,
}) => (

    <div className="patient-stat">

        <div className="patient-stat-label">
            {label}
        </div>

        <div className="patient-stat-value">
            {value || "—"}
        </div>

    </div>

);


const DetailRow = ({
    label,
    value,
}) => (

    <div className="detail-row">

        <span className="detail-label">
            {label}
        </span>

        <span className="detail-value">
            {value || "—"}
        </span>

    </div>

);


export default ConsultationSummary;
