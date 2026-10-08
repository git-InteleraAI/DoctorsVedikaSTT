import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiConfig";
import {
    getTeluguIndication,
    getTeluguDosage,
    getTeluguFrequency,
    getTeluguFoodTiming,
    getTeluguDuration,
    translateFreeTextApi,
    DIRECTIONS_FALLBACK_MAP
} from "../utils/translationUtils";

const API = getApiBaseUrl();

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

const foodTimingOptions = [
    "Before food",
    "After food",
    "With food",
    "Empty stomach",
    "Any time",
];

const NODE_API_URL = getApiBaseUrl();

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


/**
 * Standard Doctors Vedika prescription medicine structure.
 *
 * Existing fields are preserved so old consultation data
 * remains compatible.
 *
 * New:
 * indication  -> why medicine was prescribed
 * foodTiming  -> before / after / with food
 */
const emptyMedicine = () => ({
    name: "",
    indication: "",
    indication_te: "",
    dosage: "",
    dosage_te: "",
    frequency: "",
    frequency_te: "",
    duration: "",
    duration_te: "",
    foodTiming: "",
    foodTiming_te: "",
    instructions: "",
    instructions_te: "",
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
                    hour12: true,
                    timeZone: "Asia/Kolkata"
                }
            );
    } catch {
        return "Not available";
    }
};

const formatTranscriptTimestamp = (ts) => {
    if (!ts) return "";
    const str = String(ts).trim();
    const num = Number(str);
    if (!isNaN(num) && num > 1000000000) {
        try {
            return new Date(num * 1000).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
                timeZone: "Asia/Kolkata",
            });
        } catch {
            return str;
        }
    }
    return str;
};


/* ==========================================================================
   MAIN COMPONENT
========================================================================== */

const ConsultationSummary = () => {

    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const paramVisitId = params?.visitId;
    const paramPatientId = params?.patientId;
    const paramConsultationId = params?.consultationId;

    /* ----------------------------------------------------------------------
       Patient ID
    ---------------------------------------------------------------------- */

    const pathParts =
        (location?.pathname || "")
            .split("/")
            .filter(Boolean);

    const patientIdFromPath =
        paramPatientId ||
        (pathParts.length >= 2 ? pathParts[1] : "");

    const effectiveConsultationId =
        paramConsultationId ||
        paramVisitId ||
        "";


    /* ----------------------------------------------------------------------
       Read stored consultation
    ---------------------------------------------------------------------- */

    let storedResult = null;

    try {
        const stored =
            sessionStorage.getItem(
                `consultation-result-${patientIdFromPath}`
            ) ||
            sessionStorage.getItem("consultation-result-latest");

        if (stored) {
            storedResult = JSON.parse(stored);
        } else {
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith("consultation-result-")) {
                    const val = sessionStorage.getItem(k);
                    if (val) {
                        storedResult = JSON.parse(val);
                        break;
                    }
                }
            }
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

    const [fetchedPatient, setFetchedPatient] = useState(null);
    const [fetchedDoctor, setFetchedDoctor] = useState(null);
    const [showPdfPreview, setShowPdfPreview] = useState(false);

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


    const resolvedPatientId =
        patient?.id ||
        state?.patientId ||
        storedResult?.patientId ||
        patientIdFromPath ||
        "";

    const calculateAgeFromDob = (dobValue) => {
        if (!dobValue) return null;
        const dob = new Date(dobValue);
        if (isNaN(dob.getTime())) return null;
        const diffMs = Date.now() - dob.getTime();
        const ageDt = new Date(diffMs);
        const age = Math.abs(ageDt.getUTCFullYear() - 1970);
        return age > 0 && age < 120 ? age : null;
    };

    useEffect(() => {
        if (!resolvedPatientId) return;
        const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token") || localStorage.getItem("sb-access-token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        fetch(`${API}/api/patients`, { headers })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data) return;
                const list = Array.isArray(data) ? data : data?.data || data?.patients || [];
                const matched = list.find((p) => p.user_id === resolvedPatientId || p.id === resolvedPatientId || p.patient_code === resolvedPatientId);
                if (matched) {
                    let ageVal = matched.age;
                    if (!ageVal && matched.date_of_birth) {
                        ageVal = calculateAgeFromDob(matched.date_of_birth);
                    }
                    setFetchedPatient({
                        name: matched.full_name || (matched.first_name ? `${matched.first_name} ${matched.last_name || ""}`.trim() : "") || matched.name || "Patient",
                        displayId: matched.patient_code || matched.id || "DV-P-000086",
                        age: ageVal || null,
                        gender: matched.gender ? (matched.gender.charAt(0).toUpperCase() + matched.gender.slice(1)) : null,
                        bloodGroup: matched.blood_group || null,
                        date_of_birth: matched.date_of_birth
                    });
                }
            })
            .catch(() => {});
    }, [resolvedPatientId]);

    // Dynamic resolution of Patient Name, Clean Patient ID, Age, Gender, and Doctor Name
    const displayPatientName =
        fetchedPatient?.name ||
        (patient?.name && patient?.name !== "Unknown Patient" && patient?.name !== "Patient" && patient?.name !== "Walk-in Patient" ? patient.name : null) ||
        state?.patientName ||
        "John";

    const displayPatientId =
        fetchedPatient?.displayId ||
        patient?.displayId ||
        patient?.patient_code ||
        (resolvedPatientId && resolvedPatientId.length > 20
            ? (patient?.patient_code || `DV-P-${resolvedPatientId.substring(0, 6).toUpperCase()}`)
            : resolvedPatientId || "DV-P-000001");

    const displayPatientAge =
        fetchedPatient?.age ||
        patient?.age ||
        patient?.patientAge ||
        state?.age ||
        state?.patientAge ||
        calculateAgeFromDob(
            fetchedPatient?.date_of_birth ||
            fetchedPatient?.dob ||
            patient?.date_of_birth ||
            patient?.dob ||
            state?.patient?.date_of_birth ||
            state?.patient?.dob ||
            state?.dob
        ) ||
        "";

    const displayPatientGender =
        fetchedPatient?.gender ||
        patient?.gender ||
        patient?.patientGender ||
        state?.gender ||
        state?.patientGender ||
        "";

    const getCurrentDoctorInfo = () => {
        try {
            const stored = localStorage.getItem("doctors_vedika_user");
            if (stored) {
                const u = JSON.parse(stored);
                const name = u.fullName || u.doctor_name || u.name || u.full_name;
                if (name) {
                    return {
                        name: name.toLowerCase().startsWith("dr") ? name : `Dr. ${name}`,
                        id: u.id || u.doctor_id || u.userId
                    };
                }
            }
        } catch {}
        return { name: "Doctor", id: null };
    };

    const currentDocInfo = getCurrentDoctorInfo();

    const displayDoctorName =
        fetchedDoctor?.name ||
        fetchedDoctor?.full_name ||
        fetchedDoctor?.fullName ||
        state?.doctorName ||
        state?.doctor_name ||
        currentDocInfo.name;


    /* ----------------------------------------------------------------------
       Summary
    ---------------------------------------------------------------------- */

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
        new URLSearchParams(location.search).get("appointmentId") ||
        new URLSearchParams(location.search).get("appointment_id") ||
        (effectiveConsultationId && effectiveConsultationId.startsWith("consultation-app-")
            ? effectiveConsultationId.replace("consultation-app-", "")
            : null);


    /* ----------------------------------------------------------------------
       Initial report
    ---------------------------------------------------------------------- */

    const cleanDisplaySummaryText = (val, isOverview = false) => {
        if (!val || typeof val !== "string") return val || "";
        let text = val.trim();
        let extractedSymptom = "";
        if (text.includes("Reported Symptoms:")) {
            const match = text.match(/Reported Symptoms:\s*([^|]+)/i);
            if (match && match[1]) {
                extractedSymptom = match[1].trim();
            }
        } else if (text.includes("|") && (text.includes("Patient Name:") || text.includes("Patient Gender:"))) {
            const parts = text.split("|").map((p) => p.trim());
            const symPart = parts.find((p) => p.toLowerCase().includes("symptom") || (!p.includes(":") && p.length < 40));
            if (symPart) {
                extractedSymptom = symPart.replace(/.*:\s*/, "").trim();
            }
        }

        if (extractedSymptom) {
            return isOverview
                ? `Patient presented for clinical evaluation regarding ${extractedSymptom}. Comprehensive consultation conducted and treatment plan formulated.`
                : extractedSymptom;
        }

        if (/Patient Name:|Patient Gender:|Patient Age:|Blood Group:/i.test(text) && text.length > 25) {
            return isOverview
                ? "Patient presented for general clinical consultation. Comprehensive evaluation conducted."
                : "General Medical Evaluation";
        }
        return text;
    };

    const initialReport = useMemo(() => {

        const rawCc = firstAvailable(
            rawSummary.chief_complaint,
            rawSummary.chiefComplaint
        );

        const rawOverview = firstAvailable(
            rawSummary.consultation_overview,
            rawSummary.consultationOverview,
            rawSummary.overview,
            ""
        );

        const rawHpi = firstAvailable(
            rawSummary.history_of_present_illness,
            rawSummary.historyOfPresentIllness,
            rawSummary.history
        );

        return {

            chief_complaint:
                cleanDisplaySummaryText(rawCc, false),

            consultation_overview:
                cleanDisplaySummaryText(rawOverview || (rawCc ? `Patient presented for clinical evaluation regarding ${cleanDisplaySummaryText(rawCc, false)}.` : ""), true),

            symptoms:
                arrayValue(
                    rawSummary.symptoms ||
                    rawSummary.presenting_symptoms
                ).map(s => cleanDisplaySummaryText(s, false)),

            history_of_present_illness:
                cleanDisplaySummaryText(rawHpi, false),

            past_medical_history: (() => {
                const direct = arrayValue(
                    rawSummary.past_medical_history ||
                    rawSummary.pastMedicalHistory ||
                    rawSummary.past_history ||
                    rawSummary.pastHistory ||
                    rawSummary.medical_history
                );
                if (direct && direct.length > 0) return direct;

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

            vital_signs: {
                blood_pressure:
                    rawSummary.vital_signs?.blood_pressure ||
                    rawSummary.vital_signs?.bp ||
                    rawSummary.vitalSigns?.blood_pressure ||
                    rawSummary.vitalSigns?.bp ||
                    state.vital_signs?.blood_pressure ||
                    state.vitals?.bloodPressure ||
                    state.intake_vitals?.bloodPressure ||
                    state.intake_vitals?.bp ||
                    state.patient?.bloodPressure ||
                    storedResult?.vital_signs?.blood_pressure ||
                    storedResult?.vitals?.bloodPressure ||
                    "",
                heart_rate:
                    rawSummary.vital_signs?.heart_rate ||
                    rawSummary.vital_signs?.pulse ||
                    rawSummary.vitalSigns?.heart_rate ||
                    rawSummary.vitalSigns?.pulse ||
                    state.vital_signs?.heart_rate ||
                    state.vitals?.pulse ||
                    state.intake_vitals?.pulse ||
                    storedResult?.vital_signs?.heart_rate ||
                    storedResult?.vitals?.pulse ||
                    "",
                temperature:
                    rawSummary.vital_signs?.temperature ||
                    rawSummary.vital_signs?.temp ||
                    rawSummary.vitalSigns?.temperature ||
                    rawSummary.vitalSigns?.temp ||
                    state.vital_signs?.temperature ||
                    state.vitals?.temperature ||
                    state.intake_vitals?.temperature ||
                    storedResult?.vital_signs?.temperature ||
                    storedResult?.vitals?.temperature ||
                    "",
                respiratory_rate:
                    rawSummary.vital_signs?.respiratory_rate ||
                    rawSummary.vitalSigns?.respiratory_rate ||
                    state.vital_signs?.respiratory_rate ||
                    state.vitals?.respiratoryRate ||
                    state.intake_vitals?.respiratoryRate ||
                    storedResult?.vital_signs?.respiratory_rate ||
                    storedResult?.vitals?.respiratoryRate ||
                    "",
                oxygen_saturation:
                    rawSummary.vital_signs?.oxygen_saturation ||
                    rawSummary.vital_signs?.spo2 ||
                    rawSummary.vitalSigns?.oxygen_saturation ||
                    rawSummary.vitalSigns?.spo2 ||
                    state.vital_signs?.oxygen_saturation ||
                    state.vitals?.spo2 ||
                    state.intake_vitals?.spo2 ||
                    storedResult?.vital_signs?.oxygen_saturation ||
                    storedResult?.vitals?.spo2 ||
                    "",
                weight:
                    rawSummary.vital_signs?.weight ||
                    rawSummary.vitalSigns?.weight ||
                    state.vital_signs?.weight ||
                    state.vitals?.weight ||
                    state.intake_vitals?.weight ||
                    state.patient?.weight ||
                    storedResult?.vital_signs?.weight ||
                    storedResult?.vitals?.weight ||
                    "",
                height:
                    rawSummary.vital_signs?.height ||
                    rawSummary.vitalSigns?.height ||
                    state.vital_signs?.height ||
                    state.vitals?.height ||
                    state.intake_vitals?.height ||
                    storedResult?.vital_signs?.height ||
                    storedResult?.vitals?.height ||
                    "",
                blood_group:
                    rawSummary.vital_signs?.blood_group ||
                    rawSummary.vitalSigns?.blood_group ||
                    state.vital_signs?.blood_group ||
                    state.vitals?.bloodGroup ||
                    state.intake_vitals?.bloodGroup ||
                    state.patient?.bloodGroup ||
                    storedResult?.vital_signs?.blood_group ||
                    storedResult?.vitals?.bloodGroup ||
                    "",
                allergies:
                    rawSummary.vital_signs?.allergies ||
                    rawSummary.vitalSigns?.allergies ||
                    state.vital_signs?.allergies ||
                    state.vitals?.allergies ||
                    state.intake_vitals?.allergies ||
                    state.patient?.allergies ||
                    storedResult?.vital_signs?.allergies ||
                    storedResult?.vitals?.allergies ||
                    "",
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
            rawSummary.medications ||
            rawSummary.prescription?.medications ||
            rawSummary.prescription?.medicines ||
            rawSummary.medicines ||
            [];

        if (!Array.isArray(medicines)) {
            if (typeof medicines === "string" && medicines.trim()) {
                return [{
                    name: medicines.trim(),
                    indication: "",
                    dosage: "",
                    frequency: "",
                    duration: "",
                    foodTiming: "",
                    instructions: "",
                }];
            }
            return [];
        }

        return medicines
            .map((medicine) => {
                if (typeof medicine === "string") {
                    return {
                        name: medicine.trim(),
                        indication: "",
                        dosage: "",
                        frequency: "",
                        duration: "",
                        foodTiming: "",
                        instructions: "",
                    };
                }
                if (!medicine || typeof medicine !== "object") return null;
                return {
                    name:
                        medicine.name ||
                        medicine.medicine ||
                        medicine.drug ||
                        "",

                    indication:
                        medicine.indication ||
                        medicine.purpose ||
                        medicine.reason ||
                        medicine.for ||
                        "",

                    indication_te:
                        medicine.indication_te ||
                        medicine.indicationTelugu ||
                        "",

                    dosage:
                        medicine.dosage ||
                        "",

                    dosage_te:
                        medicine.dosage_te ||
                        medicine.dosageTelugu ||
                        "",

                    frequency:
                        medicine.frequency ||
                        medicine.time ||
                        "",

                    frequency_te:
                        medicine.frequency_te ||
                        medicine.frequencyTelugu ||
                        "",

                    duration:
                        medicine.duration ||
                        "",

                    duration_te:
                        medicine.duration_te ||
                        medicine.durationTelugu ||
                        "",

                    foodTiming:
                        medicine.foodTiming ||
                        medicine.food_timing ||
                        medicine.food ||
                        "",

                    foodTiming_te:
                        medicine.foodTiming_te ||
                        medicine.food_timing_te ||
                        medicine.foodTimingTelugu ||
                        "",

                    instructions:
                        medicine.instructions ||
                        medicine.directions ||
                        "",

                    instructions_te:
                        medicine.instructions_te ||
                        medicine.directions_te ||
                        medicine.instructionsTelugu ||
                        "",
                };
            })
            .filter((m) => m && m.name.trim());
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

    const [savedPrescriptionPdfUrl, setSavedPrescriptionPdfUrl] =
        useState("");

    const [savedConsultationId, setSavedConsultationId] =
        useState("");

    const [error, setError] =
        useState("");

    const fetchedOnceRef = useRef(false);

    useEffect(() => {
        const consId = effectiveConsultationId || state.consultationId || state.appointmentId || appointmentId;
        const patId = resolvedPatientId || patientIdFromPath;
        if (!patId || !consId || fetchedOnceRef.current) return;
        fetchedOnceRef.current = true;

        const fetchExistingRecord = async () => {
            try {
                const res = await fetch(`${NODE_API_URL}/api/v1/clinical/notes/${encodeURIComponent(patId)}/${encodeURIComponent(consId)}/pdf?format=json`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.record) {
                        const rec = data.record;
                        if (rec.summary && typeof rec.summary === "object" && Object.keys(rec.summary).length > 0) {
                            setReport(prev => ({
                                consultation_overview: rec.summary.consultation_overview || rec.summary.overview || prev.consultation_overview || "",
                                chief_complaint: rec.summary.chief_complaint || rec.summary.chiefComplaint || prev.chief_complaint || "",
                                symptoms: Array.isArray(rec.summary.symptoms) ? rec.summary.symptoms : (rec.summary.symptoms ? String(rec.summary.symptoms).split(", ") : prev.symptoms || []),
                                history_of_present_illness: rec.summary.history_of_present_illness || rec.summary.historyOfPresentIllness || prev.history_of_present_illness || "",
                                past_medical_history: Array.isArray(rec.summary.past_medical_history) ? rec.summary.past_medical_history : (rec.summary.past_medical_history ? [String(rec.summary.past_medical_history)] : prev.past_medical_history || []),
                                allergies: Array.isArray(rec.summary.allergies) ? rec.summary.allergies : (rec.summary.allergies ? [String(rec.summary.allergies)] : prev.allergies || []),
                                current_medications: Array.isArray(rec.summary.current_medications) ? rec.summary.current_medications : (rec.summary.current_medications ? [String(rec.summary.current_medications)] : prev.current_medications || []),
                                examination_findings: Array.isArray(rec.summary.examination_findings) ? rec.summary.examination_findings : (rec.summary.examination_findings ? [String(rec.summary.examination_findings)] : prev.examination_findings || []),
                                vital_signs: rec.summary.vital_signs || prev.vital_signs || {},
                                assessment: rec.summary.assessment || prev.assessment || "",
                                diagnosis: Array.isArray(rec.diagnosis) ? rec.diagnosis : (rec.diagnosis ? [String(rec.diagnosis)] : (Array.isArray(rec.summary.diagnosis) ? rec.summary.diagnosis : prev.diagnosis || [])),
                                differential_diagnosis: Array.isArray(rec.summary.differential_diagnosis) ? rec.summary.differential_diagnosis : prev.differential_diagnosis || [],
                                treatment_plan: rec.summary.treatment_plan || rec.summary.treatmentPlan || prev.treatment_plan || "",
                                advice: Array.isArray(rec.summary.advice) ? rec.summary.advice : (rec.summary.advice ? [String(rec.summary.advice)] : (rec.prescription?.advice ? [String(rec.prescription.advice)] : prev.advice || [])),
                                follow_up: rec.summary.follow_up || rec.summary.followUp || rec.prescription?.follow_up_date || rec.prescription?.follow_up || prev.follow_up || "",
                                doctor_notes: rec.summary.doctor_notes || rec.summary.doctorNotes || rec.summary.notes || prev.doctor_notes || "",
                                red_flags: Array.isArray(rec.summary.red_flags) ? rec.summary.red_flags : prev.red_flags || [],
                            }));
                        }

                        const meds = rec.medications || rec.prescription?.medicines || rec.summary?.medications_discussed;
                        if (Array.isArray(meds) && meds.length > 0) {
                            const normMeds = meds.map(m => typeof m === "string" ? {
                                name: m,
                                indication: "",
                                indication_te: "",
                                dosage: "",
                                dosage_te: "",
                                frequency: "",
                                frequency_te: "",
                                duration: "",
                                duration_te: "",
                                foodTiming: "",
                                foodTiming_te: "",
                                instructions: "",
                                instructions_te: ""
                            } : {
                                name: m.name || m.medicine || m.drug || "",
                                indication: m.indication || m.purpose || m.reason || m.for || "",
                                indication_te: m.indication_te || m.indicationTelugu || "",
                                dosage: m.dosage || "",
                                dosage_te: m.dosage_te || m.dosageTelugu || "",
                                frequency: m.frequency || m.time || "",
                                frequency_te: m.frequency_te || m.frequencyTelugu || "",
                                duration: m.duration || "",
                                duration_te: m.duration_te || m.durationTelugu || "",
                                foodTiming: m.foodTiming || m.food_timing || m.food || "",
                                foodTiming_te: m.foodTiming_te || m.food_timing_te || m.foodTimingTelugu || "",
                                instructions: m.instructions || m.directions || "",
                                instructions_te: m.instructions_te || m.directions_te || m.instructionsTelugu || "",
                            }).filter(m => m.name && m.name.trim());
                            if (normMeds.length > 0) {
                                setMedicines(normMeds);
                            }
                        }

                        if (rec.patientName || rec.patientAge || rec.patientGender) {
                            setFetchedPatient(p => ({
                                ...p,
                                name: rec.patientName || p?.name,
                                age: rec.patientAge || rec.age || p?.age,
                                gender: rec.patientGender || rec.gender || p?.gender,
                                displayId: rec.patientId || p?.displayId,
                            }));
                        }
                    }
                }
            } catch (err) {
                console.warn("[ConsultationSummary] Auto-fetch error:", err);
            }
        };
        fetchExistingRecord();
    }, [effectiveConsultationId, resolvedPatientId, patientIdFromPath]);

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
                    ) => {
                        if (medicineIndex !== index) return medicine;
                        const updated = {
                            ...medicine,
                            [field]: value,
                        };
                        if (field === "indication") updated.indication_te = getTeluguIndication(value);
                        if (field === "dosage") updated.dosage_te = getTeluguDosage(value);
                        if (field === "frequency") updated.frequency_te = getTeluguFrequency(value);
                        if (field === "foodTiming") updated.foodTiming_te = getTeluguFoodTiming(value);
                        if (field === "duration") updated.duration_te = getTeluguDuration(value);
                        if (field === "instructions") {
                            const fallback = DIRECTIONS_FALLBACK_MAP[String(value || "").trim().toLowerCase()];
                            if (fallback) updated.instructions_te = fallback;
                        }
                        return updated;
                    }
                )
        );

    };

    const handleTranslateDirections = async (index) => {
        const med = medicines[index];
        if (!med || !med.instructions) return;
        const translated = await translateFreeTextApi(med.instructions);
        if (translated) {
            setMedicines(prev => prev.map((m, i) => i === index ? { ...m, instructions_te: translated } : m));
        }
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


    useEffect(() => {
        try {
            const savedDoc = localStorage.getItem("doctorUser") || localStorage.getItem("user");
            if (savedDoc) {
                setFetchedDoctor(JSON.parse(savedDoc));
            }
        } catch (e) {}

        const pid = patientIdFromPath || state?.patientId;
        if (pid) {
            const token = localStorage.getItem("token") || localStorage.getItem("sb-access-token") || localStorage.getItem("doctors_vedika_token");
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            fetch(`${NODE_API_URL}/api/patients`, { headers })
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                    if (!data) return fetch(`${NODE_API_URL}/api/appointments`, { headers }).then(r => r.ok ? r.json() : null);
                    const list = Array.isArray(data) ? data : data?.data || data?.patients || [];
                    const matched = list.find(
                        (p) =>
                            p.user_id === pid ||
                            p.id === pid ||
                            p.patientId === pid ||
                            p.patient_code === pid
                    );

                    if (matched) {
                        let calcAge = "36";
                        if (matched.date_of_birth) {
                            const dob = new Date(matched.date_of_birth);
                            if (!isNaN(dob.getTime())) {
                                calcAge = String(new Date().getFullYear() - dob.getFullYear());
                            }
                        }

                        setFetchedPatient({
                            name: matched.full_name || matched.first_name || matched.name || "John",
                            age: matched.age || calcAge,
                            gender: matched.gender ? (matched.gender.charAt(0).toUpperCase() + matched.gender.slice(1)) : "Male",
                            displayId: matched.patient_code || matched.patient_number || `DV-P-000086`,
                            bloodGroup: matched.blood_group || "O+",
                            weight: matched.weight || "68 kg",
                            allergies: matched.allergies || "None",
                        });
                        return null;
                    }
                    return fetch(`${NODE_API_URL}/api/appointments`, { headers }).then(r => r.ok ? r.json() : null);
                })
                .then((appData) => {
                    if (!appData) return;
                    const list = Array.isArray(appData) ? appData : appData?.data || [];
                    const matched = list.find(
                        (a) =>
                            a.patient_id === pid ||
                            a.patientId === pid ||
                            a.id === pid ||
                            a.user_id === pid ||
                            a.appointment_id === pid
                    );
                    if (matched) {
                        setFetchedPatient({
                            name: matched.patient_name || matched.patientName || matched.full_name || matched.name || "John",
                            age: matched.age || matched.patient_age || "36",
                            gender: matched.gender || matched.patient_gender || "Male",
                            displayId: matched.patient_code || matched.patient_number || `DV-P-000086`,
                            bloodGroup: matched.blood_group || matched.bloodGroup || "O+",
                            weight: matched.weight || "68 kg",
                            allergies: matched.allergies || "None",
                        });
                    }
                })
                .catch((err) => console.warn("[ConsultationSummary] Error fetching patient details:", err));
        }
    }, [patientIdFromPath]);


    /* ======================================================================
       SAVE CONSULTATION
    ====================================================================== */

    const handleSave = async (withTranscript = true) => {
        console.log("[ConsultationSummary] SAVE BUTTON CLICKED", {
            patientId: resolvedPatientId,
            doctorId,
            appointmentId,
            withTranscript,
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

            const transcriptForRecord = withTranscript
                ? editableTranscript
                      .map((line) => ({
                          speaker: line?.speaker || "Unknown",
                          timestamp: line?.timestamp || "00:00",
                          text: line?.text || "",
                      }))
                      .filter((line) => line.text.trim())
                : [];

            const diagnosisList = Array.isArray(report.diagnosis)
                ? report.diagnosis.filter(Boolean)
                : arrayValue(report.diagnosis);

            const finalSummary = {
                ...report,
                symptoms: Array.isArray(report.symptoms)
                    ? report.symptoms.filter(Boolean)
                    : arrayValue(report.symptoms),
                diagnosis: diagnosisList,
                medications_discussed: validMedicines,
                transcript: transcriptForRecord,
                detected_language: detectedLanguage,
                with_transcript: withTranscript,
            };

            const audioTranscriptString = withTranscript
                ? transcriptForRecord
                      .map((line) => `[${line.timestamp}] ${line.speaker}: ${line.text}`)
                      .join("\n")
                : "Full dialogue transcript omitted by doctor choice.";

            const targetConsId =
                effectiveConsultationId ||
                state.consultationId ||
                (appointmentId ? `consultation-app-${appointmentId}` : "") ||
                `consultation-pat-${resolvedPatientId}`;

            const resolvedAppointmentId =
                appointmentId ||
                state.appointmentId ||
                (targetConsId.startsWith("consultation-app-") ? targetConsId.replace("consultation-app-", "") : null);

            const consultationPayload = {
                consultationId: targetConsId,
                consultation_id: targetConsId,
                id: targetConsId,
                patientId: resolvedPatientId,
                patient_id: resolvedPatientId,
                patientCode: displayPatientId,
                displayPatientId: displayPatientId,
                doctorId: doctorId || "default-doctor",
                doctor_id: doctorId || "default-doctor",
                doctorName: displayDoctorName,
                doctor_name: displayDoctorName,
                appointmentId: resolvedAppointmentId,
                appointment_id: resolvedAppointmentId,
                patientName: displayPatientName,
                patientAge: displayPatientAge || patient?.age || "",
                patientGender: displayPatientGender || patient?.gender || "",
                age: displayPatientAge || patient?.age || "",
                gender: displayPatientGender || patient?.gender || "",
                patient: {
                    id: resolvedPatientId,
                    name: displayPatientName,
                    age: displayPatientAge || patient?.age || "",
                    gender: displayPatientGender || patient?.gender || "",
                },
                consultationDate: formatDate(startedAt || generatedAt || new Date()),
                consultationTime: formatTime(startedAt || generatedAt || new Date()),
                status: "Completed",
                completed: true,
                transcript: transcriptForRecord,
                summary: finalSummary,
                diagnosis: diagnosisList,
                medications: validMedicines,
                withTranscript,
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
                audio_transcript: audioTranscriptString,
            };

            console.log(
                "[ConsultationSummary] Saving COMPLETE consultation payload:",
                consultationPayload
            );

            const saveToken = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token") || localStorage.getItem("sb-access-token");
            
            let response = await fetch(
                `${NODE_API_URL}/api/v1/clinical/notes`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(saveToken ? { Authorization: `Bearer ${saveToken}` } : {})
                    },
                    body: JSON.stringify(consultationPayload),
                }
            );

            if (response.ok && targetConsId && resolvedPatientId) {
                try {
                    await fetch(
                        `${NODE_API_URL}/api/v1/clinical/notes/${encodeURIComponent(resolvedPatientId)}/${encodeURIComponent(targetConsId)}`,
                        {
                            method: "PATCH",
                            headers: {
                                "Content-Type": "application/json",
                                ...(saveToken ? { Authorization: `Bearer ${saveToken}` } : {})
                            },
                            body: JSON.stringify(consultationPayload),
                        }
                    );
                } catch (patchErr) {
                    console.warn("[ConsultationSummary] Secondary PATCH notice:", patchErr.message);
                }
            } else if (!response.ok && targetConsId && resolvedPatientId) {
                try {
                    response = await fetch(
                        `${NODE_API_URL}/api/v1/clinical/notes/${encodeURIComponent(resolvedPatientId)}/${encodeURIComponent(targetConsId)}`,
                        {
                            method: "PATCH",
                            headers: {
                                "Content-Type": "application/json",
                                ...(saveToken ? { Authorization: `Bearer ${saveToken}` } : {})
                            },
                            body: JSON.stringify(consultationPayload),
                        }
                    );
                } catch (patchErr) {
                    console.warn("[ConsultationSummary] PATCH fallback notice:", patchErr.message);
                }
            }

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
                `${NODE_API_URL}/api/v1/clinical/notes/${encodeURIComponent(resolvedPatientId)}/${encodeURIComponent(consultationRecord.consultationId)}/pdf`;

            const activeRxPdfUrl =
                result?.prescriptionPdfUrl ||
                `${NODE_API_URL}/api/v1/clinical/notes/${encodeURIComponent(resolvedPatientId)}/${encodeURIComponent(consultationRecord.consultationId)}/pdf?document=prescription`;

            setSavedPdfUrl(`${activePdfUrl}${activePdfUrl.includes('?') ? '&' : '?'}t=${Date.now()}`);
            setSavedPrescriptionPdfUrl(`${activeRxPdfUrl}${activeRxPdfUrl.includes('?') ? '&' : '?'}t=${Date.now()}`);
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

            // Trigger queue transition to completed stage for staff portal live sync
            const targetEncounterId = appointmentId || state?.visitId || resolvedPatientId || consultationRecord.consultationId;
            if (targetEncounterId) {
                try {
                    const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token") || localStorage.getItem("doctor_token");
                    await fetch(`${NODE_API_URL}/api/v1/queue/transition`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...(token ? { "Authorization": `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify({
                            visitId: targetEncounterId,
                            targetStage: "completed"
                        })
                    });
                    localStorage.setItem("doctors_vedika_queue_updated", String(Date.now()));
                    window.dispatchEvent(new Event("storage"));
                } catch (qErr) {
                    console.warn("[ConsultationSummary] Save queue transition notice:", qErr.message);
                }
            }

            setConsultationCompleted(true);
            setSaveSuccess(true);
            setSaveMessage("✓ Consultation saved and marked as completed successfully.");
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
            const response = await fetch(
                `${NODE_API_URL}/api/v1/clinical/notes/${encodeURIComponent(resolvedPatientId)}/${encodeURIComponent(consId)}/complete`,
                { method: "PATCH" }
            );
            const result = await response.json();

            if (!response.ok || result?.success === false) {
                throw new Error(result?.message || "Unable to mark consultation as completed.");
            }

            if (appointmentId && String(appointmentId).startsWith("appointment-") === false) {
                try {
                    const token = localStorage.getItem("doctors_vedika_token");
                    await fetch(`${NODE_API_URL}/api/appointments/${encodeURIComponent(appointmentId)}`, {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                            ...(token ? { "Authorization": `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify({ status: "completed" })
                    });
                } catch (appErr) {
                    console.warn("[ConsultationSummary] Appointment complete notice:", appErr);
                }
            }

            // Trigger queue transition to completed stage for staff portal live sync
            const targetEncounterId = appointmentId || resolvedPatientId || consId;
            if (targetEncounterId) {
                try {
                    const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token") || localStorage.getItem("doctor_token");
                    await fetch(`${NODE_API_URL}/api/v1/queue/transition`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...(token ? { "Authorization": `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify({
                            visitId: targetEncounterId,
                            targetStage: "completed"
                        })
                    });
                    localStorage.setItem("doctors_vedika_queue_updated", String(Date.now()));
                    window.dispatchEvent(new Event("storage"));
                } catch (qErr) {
                    console.warn("[ConsultationSummary] Queue transition completion notice:", qErr.message);
                }
            }

            setConsultationCompleted(true);
            setSaveMessage("✓ Consultation completed! Successfully saved to patient records and database.");

            const storageKey = `patient-records-${resolvedPatientId}`;
            try {
                const existing = localStorage.getItem(storageKey);
                const list = existing ? JSON.parse(existing) : [];
                if (Array.isArray(list)) {
                    const updated = list.map((item) => {
                        if (item?.consultationId === consId) {
                            return { ...item, status: "Completed", completed: true };
                        }
                        return item;
                    });
                    localStorage.setItem(storageKey, JSON.stringify(updated));
                }
            } catch (e) {}

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


    const handleDiscard = () => {
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            navigate("/patients");
        }
    };

    const handleBack = () => {
        navigate("/patients", { replace: true });
    };


    const handlePrint = () => {

        window.print();

    };


    return (

        <div className="consultation-summary-page">

            {/* HEADER */}

            <header className="summary-header">

                <div>

                    <div className="title-row">

                        <div>

                            <h1>
                                Consultation Summary
                            </h1>

                            <p>
                                {displayPatientName}
                                {displayPatientAge ? ` • ${displayPatientAge} years` : ""}
                                {displayPatientGender ? ` • ${displayPatientGender}` : ""}
                            </p>

                        </div>

                        <span className="ai-badge">
                            ✦ AI Draft
                        </span>

                    </div>

                </div>


                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <button
                        type="button"
                        onClick={handleBack}
                        style={{
                            background: "#F1F5F9",
                            color: "#475569",
                            border: "1px solid #CBD5E1",
                            borderRadius: "8px",
                            padding: "10px 16px",
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px"
                        }}
                    >
                        ← Back to Patients
                    </button>
                    {!saveSuccess ? (
                        <>
                            <button
                                type="button"
                                onClick={handleDiscard}
                                style={{
                                    background: "rgba(239, 68, 68, 0.15)",
                                    color: "#ef4444",
                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                    borderRadius: "8px",
                                    padding: "10px 18px",
                                    fontWeight: 700,
                                    fontSize: "0.9rem",
                                    cursor: "pointer",
                                }}
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSave(true)}
                                disabled={isSaving}
                                style={{
                                    background: "linear-gradient(135deg, #01b6af 0%, #082b68 100%)",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "8px",
                                    padding: "10px 22px",
                                    fontWeight: 700,
                                    fontSize: "0.9rem",
                                    cursor: isSaving ? "not-allowed" : "pointer",
                                    boxShadow: "0 2px 6px rgba(1, 182, 175, 0.25)",
                                }}
                            >
                                {isSaving ? "Saving..." : "✓ Save"}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => navigate("/patients", { replace: true })}
                            style={{
                                background: "linear-gradient(135deg, #01b6af 0%, #082b68 100%)",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "8px",
                                padding: "10px 22px",
                                fontWeight: 700,
                                fontSize: "0.9rem",
                                cursor: "pointer",
                                boxShadow: "0 2px 6px rgba(1, 182, 175, 0.25)",
                            }}
                        >
                            Go to Patients →
                        </button>
                    )}
                </div>

            </header>


            {/* REVIEW NOTICE */}

            <section className="review-notice">

                <div className="review-icon">
                    ✓
                </div>

                <div>
                    <h2>
                        Doctor Review Required
                    </h2>

                    <p>
                        Review and edit the AI-generated consultation report before saving it to the patient's medical record.
                    </p>
                </div>

            </section>


            {/* META */}

            <section className="meta-grid">

                <MetaCard
                    label="Patient"
                    value={displayPatientName}
                />

                <MetaCard
                    label="Patient ID"
                    value={displayPatientId}
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
                    value={saveSuccess ? "Completed" : "Review Required"}
                />

            </section>


            {/* ERROR */}

            {error && (

                <div
                    className="error-banner"
                    style={{
                        margin: "16px 0",
                        padding: "14px 20px",
                        borderRadius: "12px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        color: "#dc2626",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        boxShadow: "0 2px 6px rgba(220, 38, 38, 0.08)"
                    }}
                >
                    <i className="fa-solid fa-circle-exclamation" style={{ fontSize: "1.2rem", color: "#dc2626" }}></i>
                    <div>
                        <strong style={{ display: "block", fontSize: "0.92rem", marginBottom: "2px" }}>Save Failed</strong>
                        <span style={{ fontSize: "0.85rem", opacity: 0.9 }}>{error}</span>
                    </div>
                </div>

            )}


            {/* SUCCESS MODAL */}

            {showSaveModal && (
                <div className="save-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="save-modal" style={{ maxWidth: "520px", textAlign: "center" }}>
                        <div className="save-modal-icon">✓</div>
                        <h2>Consultation Report Saved</h2>
                        <p>
                            The consultation report, prescription, and updated PDFs have been generated and saved to {displayPatientName}'s medical record.
                        </p>
                        <div className="save-modal-actions" style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginTop: "24px" }}>
                            {savedPdfUrl && (
                                <button
                                    type="button"
                                    onClick={() => window.open(savedPdfUrl, "_blank")}
                                    style={{
                                        background: "#10B981",
                                        color: "#ffffff",
                                        padding: "10px 18px",
                                        borderRadius: "8px",
                                        fontWeight: 700,
                                        border: "none",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px"
                                    }}
                                >
                                    <i className="fa-solid fa-file-pdf" /> PDF Report
                                </button>
                            )}
                            {savedPrescriptionPdfUrl && (
                                <button
                                    type="button"
                                    onClick={() => window.open(savedPrescriptionPdfUrl, "_blank")}
                                    style={{
                                        background: "#2563EB",
                                        color: "#ffffff",
                                        padding: "10px 18px",
                                        borderRadius: "8px",
                                        fontWeight: 700,
                                        border: "none",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px"
                                    }}
                                >
                                    <i className="fa-solid fa-prescription" /> Prescription PDF
                                </button>
                            )}
                            <button
                                type="button"
                                className="modal-primary-button"
                                onClick={() => navigate("/patients", { replace: true })}
                                style={{
                                    background: "linear-gradient(135deg, #01b6af 0%, #082b68 100%)",
                                    color: "#ffffff",
                                    padding: "10px 20px",
                                    borderRadius: "8px",
                                    fontWeight: 700,
                                    border: "none",
                                    cursor: "pointer"
                                }}
                            >
                                Go to Patients →
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

                            <InputField
                                label="Height"
                                value={
                                    report.vital_signs
                                        ?.height ||
                                    ""
                                }
                                onChange={(value) =>
                                    updateVital(
                                        "height",
                                        value
                                    )
                                }
                            />

                            <InputField
                                label="Blood Group"
                                value={
                                    report.vital_signs
                                        ?.blood_group ||
                                    ""
                                }
                                onChange={(value) =>
                                    updateVital(
                                        "blood_group",
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


                    {/* PRESCRIPTION */}

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

                                {medicines.map((medicine, index) => {
                                    const indTe = medicine.indication_te || getTeluguIndication(medicine.indication);
                                    const dosTe = medicine.dosage_te || getTeluguDosage(medicine.dosage);
                                    const freqTe = medicine.frequency_te || getTeluguFrequency(medicine.frequency);
                                    const foodTe = medicine.foodTiming_te || getTeluguFoodTiming(medicine.foodTiming);
                                    const durTe = medicine.duration_te || getTeluguDuration(medicine.duration);

                                    return (
                                        <div className="medicine-row" key={index}>
                                            <div className="medicine-row-header">
                                                <span className="medicine-number">{index + 1}</span>

                                                <div className="input-field medicine-name-field">
                                                    <label style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.82rem" }}>
                                                        Medicine Name
                                                    </label>
                                                    <input
                                                        type="text"
                                                        className="medicine-input"
                                                        value={medicine.name || ""}
                                                        onChange={(e) => updateMedicine(index, "name", e.target.value)}
                                                        placeholder="Example: Cetirizine 10mg"
                                                    />
                                                </div>

                                                <button
                                                    type="button"
                                                    className="delete-medicine"
                                                    onClick={() => removeMedicine(index)}
                                                >
                                                    Remove
                                                </button>
                                            </div>

                                            <div className="medicine-details-grid">
                                                <div className="input-field">
                                                    <label style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.82rem", display: "flex", flexDirection: "column" }}>
                                                        <span>Indication <span style={{ color: "#0d9488" }}>(దేనికి)</span></span>
                                                        {indTe && <span style={{ color: "#0f766e", fontSize: "0.76rem" }}>[{indTe}]</span>}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        className="medicine-input"
                                                        value={medicine.indication || ""}
                                                        onChange={(e) => updateMedicine(index, "indication", e.target.value)}
                                                        placeholder="Fever (జ్వరం)"
                                                    />
                                                </div>

                                                <div className="input-field">
                                                    <label style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.82rem", display: "flex", flexDirection: "column" }}>
                                                        <span>Dosage <span style={{ color: "#0d9488" }}>(మోతాదు)</span></span>
                                                        {dosTe && <span style={{ color: "#0f766e", fontSize: "0.76rem" }}>[{dosTe}]</span>}
                                                    </label>
                                                    <select
                                                        className="medicine-select"
                                                        value={medicine.dosage || ""}
                                                        onChange={(e) => updateMedicine(index, "dosage", e.target.value)}
                                                    >
                                                        <option value="">Select dosage</option>
                                                        {dosageOptions.map((opt) => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="input-field">
                                                    <label style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.82rem", display: "flex", flexDirection: "column" }}>
                                                        <span>Frequency <span style={{ color: "#0d9488" }}>(సమయం)</span></span>
                                                        {freqTe && <span style={{ color: "#0f766e", fontSize: "0.76rem" }}>[{freqTe}]</span>}
                                                    </label>
                                                    <select
                                                        className="medicine-select"
                                                        value={medicine.frequency || ""}
                                                        onChange={(e) => updateMedicine(index, "frequency", e.target.value)}
                                                    >
                                                        <option value="">Select frequency</option>
                                                        {frequencyOptions.map((opt) => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="input-field">
                                                    <label style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.82rem", display: "flex", flexDirection: "column" }}>
                                                        <span>Food & Duration</span>
                                                        {(foodTe || durTe) && <span style={{ color: "#0f766e", fontSize: "0.76rem" }}>[{[foodTe, durTe].filter(Boolean).join(" / ")}]</span>}
                                                    </label>
                                                    <div style={{ display: "flex", gap: "6px" }}>
                                                        <select
                                                            className="medicine-select"
                                                            value={medicine.foodTiming || ""}
                                                            onChange={(e) => updateMedicine(index, "foodTiming", e.target.value)}
                                                            style={{ flex: 1, padding: "0 4px" }}
                                                        >
                                                            <option value="">Food</option>
                                                            {foodTimingOptions.map((opt) => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            className="medicine-select"
                                                            value={medicine.duration || ""}
                                                            onChange={(e) => updateMedicine(index, "duration", e.target.value)}
                                                            style={{ flex: 1, padding: "0 4px" }}
                                                        >
                                                            <option value="">Duration</option>
                                                            {durationOptions.map((opt) => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* DIRECTIONS & TELUGU TRANSLATION WORKFLOW */}
                                            <div className="medicine-directions-box" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px", marginTop: "2px", display: "flex", flexDirection: "column", gap: "8px" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <label style={{ fontWeight: 700, color: "#082B68", fontSize: "0.84rem" }}>
                                                        Directions / Instructions <span style={{ color: "#0d9488" }}>(ఎలా తీసుకోవాలి)</span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleTranslateDirections(index)}
                                                        style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", padding: "3px 10px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                                                    >
                                                        🌐 Translate to Telugu
                                                    </button>
                                                </div>

                                                <textarea
                                                    value={medicine.instructions || ""}
                                                    onChange={(e) => updateMedicine(index, "instructions", e.target.value)}
                                                    placeholder="Take one tablet after food."
                                                    rows={1}
                                                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.84rem", fontFamily: "inherit" }}
                                                />

                                                <div>
                                                    <label style={{ fontWeight: 700, color: "#0f766e", fontSize: "0.78rem", display: "block", marginBottom: "3px" }}>
                                                        Telugu Translation Review & Edit:
                                                    </label>
                                                    <textarea
                                                        value={medicine.instructions_te || ""}
                                                        onChange={(e) => updateMedicine(index, "instructions_te", e.target.value)}
                                                        placeholder="భోజనం తర్వాత ఒక మాత్ర తీసుకోండి."
                                                        rows={1}
                                                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #99f6e4", background: "#f0fdf4", color: "#065f46", fontSize: "0.84rem", fontWeight: 600, fontFamily: "inherit" }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                            </div>

                        )}

                    </section>

                </div>


                {/* ==========================================================
                    RIGHT SIDE
                ========================================================== */}

                <aside className="side-column">




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
                                                <strong className={`speaker-badge ${String(line.speaker || "").toLowerCase().includes("patient") ? "patient" : "doctor"}`}>
                                                    {line.speaker}
                                                </strong>
                                                <span>
                                                    {formatTranscriptTimestamp(line.timestamp)}
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


                    {/* SAVE & ACTION SECTION */}

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
                            {!saveSuccess
                                ? "Doctor confirmation is required before saving this consultation to the patient's permanent record."
                                : "✓ Consultation completed and saved successfully."}
                        </div>


                        <div
                            style={{
                                display: "flex",
                                gap: "10px",
                                flexWrap: "wrap",
                            }}
                        >
                            {!saveSuccess ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleDiscard}
                                        style={{
                                            background: "rgba(239, 68, 68, 0.15)",
                                            color: "#ef4444",
                                            border: "1px solid rgba(239, 68, 68, 0.4)",
                                            borderRadius: "10px",
                                            padding: "12px 20px",
                                            cursor: "pointer",
                                            fontWeight: 700,
                                        }}
                                    >
                                        Discard
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleSave(true)}
                                        disabled={isSaving}
                                        style={{
                                            background: isSaving ? "#55777d" : "#08AEB8",
                                            color: "#ffffff",
                                            border: "none",
                                            borderRadius: "10px",
                                            padding: "12px 22px",
                                            cursor: isSaving ? "not-allowed" : "pointer",
                                            fontWeight: 800,
                                            fontSize: "14px",
                                        }}
                                    >
                                        {isSaving ? "Saving..." : "✓ Save"}
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => navigate("/patients", { replace: true })}
                                    style={{
                                        background: "linear-gradient(135deg, #01b6af 0%, #082b68 100%)",
                                        color: "#ffffff",
                                        border: "none",
                                        borderRadius: "10px",
                                        padding: "12px 24px",
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        fontSize: "14px",
                                        boxShadow: "0 4px 15px rgba(1, 182, 175, 0.25)",
                                    }}
                                >
                                    Go to Patients →
                                </button>
                            )}
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

                </aside>

            </main>

            {/* PDF PREVIEW MODAL */}
            {showPdfPreview && (
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(8, 43, 104, 0.65)",
                    backdropFilter: "blur(6px)",
                    zIndex: 99999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "20px"
                }}>
                    <div style={{
                        background: "#ffffff",
                        width: "100%",
                        maxWidth: "850px",
                        maxHeight: "92vh",
                        borderRadius: "16px",
                        boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden"
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            background: "#082b68",
                            color: "#ffffff",
                            padding: "16px 24px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <i className="fa-solid fa-file-pdf" style={{ color: "#01b6af", fontSize: "1.3rem" }}></i>
                                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#ffffff" }}>Prescription & Consultation PDF Preview</h2>
                            </div>
                            <button
                                onClick={() => setShowPdfPreview(false)}
                                style={{
                                    background: "rgba(255,255,255,0.15)",
                                    border: "none",
                                    color: "#ffffff",
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "50%",
                                    cursor: "pointer",
                                    fontSize: "1rem",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Scrollable Body */}
                        <div style={{ padding: "30px 36px", overflowY: "auto", flex: 1, background: "#ffffff" }}>
                            {/* Logo & Doctor Header */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #01b6af", paddingBottom: "16px", marginBottom: "20px" }}>
                                <div>
                                    <img src="/images/logo.png" alt="Doctors Vedika" style={{ height: "45px", objectFit: "contain" }} />
                                    <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.82rem" }}>Smart AI Medical Charting & Telehealth Platform</p>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <h3 style={{ margin: 0, color: "#082b68", fontSize: "1.1rem", fontWeight: 800 }}>{displayDoctorName}</h3>
                                    <p style={{ margin: "2px 0 0 0", color: "#01b6af", fontWeight: 600, fontSize: "0.85rem" }}>MBBS, MD • General Physician</p>
                                    <p style={{ margin: "2px 0 0 0", color: "#64748b", fontSize: "0.8rem" }}>Reg. No: 88472-TEL</p>
                                </div>
                            </div>

                            {/* Patient Summary Bar */}
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 18px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                                <div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Patient Name</div>
                                    <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.95rem" }}>{displayPatientName}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Patient ID</div>
                                    <div style={{ fontWeight: 700, color: "#01b6af", fontSize: "0.95rem" }}>{displayPatientId}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Age / Gender</div>
                                    <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.9rem" }}>{fetchedPatient?.age || patient.age || "36"} yrs / {fetchedPatient?.gender || patient.gender || "Male"}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Date</div>
                                    <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.9rem" }}>{formatDate(startedAt || generatedAt)}</div>
                                </div>
                            </div>

                            {/* Vital Signs */}
                            {report.vital_signs && Object.values(report.vital_signs).some(v => v && String(v).trim() !== "") && (
                                <div style={{ marginBottom: "18px" }}>
                                    <h4 style={{ margin: "0 0 8px 0", color: "#082b68", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Vital Signs</h4>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                                        {report.vital_signs.blood_pressure && String(report.vital_signs.blood_pressure).trim() !== "" && (
                                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Blood Pressure</div>
                                                <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{report.vital_signs.blood_pressure}</div>
                                            </div>
                                        )}
                                        {report.vital_signs.heart_rate && String(report.vital_signs.heart_rate).trim() !== "" && (
                                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Heart Rate</div>
                                                <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{report.vital_signs.heart_rate}</div>
                                            </div>
                                        )}
                                        {report.vital_signs.temperature && String(report.vital_signs.temperature).trim() !== "" && (
                                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Temperature</div>
                                                <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{report.vital_signs.temperature}</div>
                                            </div>
                                        )}
                                        {report.vital_signs.respiratory_rate && String(report.vital_signs.respiratory_rate).trim() !== "" && (
                                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Resp. Rate</div>
                                                <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{report.vital_signs.respiratory_rate}</div>
                                            </div>
                                        )}
                                        {report.vital_signs.oxygen_saturation && String(report.vital_signs.oxygen_saturation).trim() !== "" && (
                                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>SpO2</div>
                                                <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{report.vital_signs.oxygen_saturation}</div>
                                            </div>
                                        )}
                                        {report.vital_signs.weight && String(report.vital_signs.weight).trim() !== "" && (
                                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Weight</div>
                                                <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{report.vital_signs.weight}</div>
                                            </div>
                                        )}
                                        {report.vital_signs.height && String(report.vital_signs.height).trim() !== "" && (
                                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Height</div>
                                                <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{report.vital_signs.height}</div>
                                            </div>
                                        )}
                                        {report.vital_signs.blood_group && String(report.vital_signs.blood_group).trim() !== "" && (
                                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Blood Group</div>
                                                <div style={{ fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{report.vital_signs.blood_group}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Consultation Overview */}
                            {report.consultation_overview && report.consultation_overview.trim() !== "" && (
                                <div style={{ marginBottom: "18px" }}>
                                    <h4 style={{ margin: "0 0 4px 0", color: "#082b68", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Consultation Overview</h4>
                                    <p style={{ margin: 0, color: "#334155", fontSize: "0.9rem", lineHeight: "1.5" }}>{report.consultation_overview}</p>
                                </div>
                            )}

                            {/* Chief Complaint & HPI */}
                            {((report.chief_complaint && report.chief_complaint.trim() !== "") || (report.history_of_present_illness && report.history_of_present_illness.trim() !== "")) && (
                                <div style={{ marginBottom: "18px" }}>
                                    <h4 style={{ margin: "0 0 4px 0", color: "#082b68", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Chief Complaint & HPI</h4>
                                    {report.chief_complaint && report.chief_complaint.trim() !== "" && (
                                        <p style={{ margin: 0, color: "#334155", fontSize: "0.9rem", lineHeight: "1.5" }}>{report.chief_complaint}</p>
                                    )}
                                    {report.history_of_present_illness && report.history_of_present_illness.trim() !== "" && (
                                        <p style={{ margin: "4px 0 0 0", color: "#475569", fontSize: "0.88rem" }}>{report.history_of_present_illness}</p>
                                    )}
                                </div>
                            )}

                            {/* Symptoms & Examination */}
                            {((Array.isArray(report.symptoms) ? report.symptoms.length > 0 : report.symptoms) || (Array.isArray(report.examination_findings) ? report.examination_findings.length > 0 : report.examination_findings)) && (
                                <div style={{ marginBottom: "18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                    {report.symptoms && (Array.isArray(report.symptoms) ? report.symptoms.length > 0 : String(report.symptoms).trim() !== "") && (
                                        <div>
                                            <h4 style={{ margin: "0 0 4px 0", color: "#082b68", fontSize: "0.88rem", textTransform: "uppercase" }}>Symptoms</h4>
                                            <p style={{ margin: 0, color: "#334155", fontSize: "0.88rem" }}>{Array.isArray(report.symptoms) ? report.symptoms.join(", ") : String(report.symptoms)}</p>
                                        </div>
                                    )}
                                    {report.examination_findings && (Array.isArray(report.examination_findings) ? report.examination_findings.length > 0 : String(report.examination_findings).trim() !== "") && (
                                        <div>
                                            <h4 style={{ margin: "0 0 4px 0", color: "#082b68", fontSize: "0.88rem", textTransform: "uppercase" }}>Examination Findings</h4>
                                            <p style={{ margin: 0, color: "#334155", fontSize: "0.88rem" }}>{Array.isArray(report.examination_findings) ? report.examination_findings.join(", ") : String(report.examination_findings)}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Diagnosis & Assessment */}
                            {((report.possible_diagnosis && (Array.isArray(report.possible_diagnosis) ? report.possible_diagnosis.length > 0 : String(report.possible_diagnosis).trim() !== "")) || (report.diagnosis && (Array.isArray(report.diagnosis) ? report.diagnosis.length > 0 : String(report.diagnosis).trim() !== "")) || (report.assessment && report.assessment.trim() !== "")) && (
                                <div style={{ marginBottom: "18px" }}>
                                    <h4 style={{ margin: "0 0 4px 0", color: "#082b68", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Clinical Impression & Diagnosis</h4>
                                    <p style={{ margin: 0, color: "#01b6af", fontWeight: 700, fontSize: "0.92rem" }}>
                                        {Array.isArray(report.possible_diagnosis) ? report.possible_diagnosis.join(", ") : (report.possible_diagnosis || (Array.isArray(report.diagnosis) ? report.diagnosis.join(", ") : (report.diagnosis || report.assessment)))}
                                    </p>
                                </div>
                            )}

                            {/* Rx / Medication Table */}
                            {medicines.filter(m => m.name && m.name.trim() !== "").length > 0 && (
                                <div style={{ marginBottom: "22px" }}>
                                    <h4 style={{ margin: "0 0 8px 0", color: "#082b68", fontSize: "0.92rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Rx — Prescribed Medications</h4>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                                        <thead>
                                            <tr style={{ background: "#f1f5f9", textAlign: "left", color: "#475569" }}>
                                                <th style={{ padding: "8px 10px", borderBottom: "2px solid #cbd5e1" }}>#</th>
                                                <th style={{ padding: "8px 10px", borderBottom: "2px solid #cbd5e1" }}>Medicine Name</th>
                                                <th style={{ padding: "8px 10px", borderBottom: "2px solid #cbd5e1" }}>Dosage</th>
                                                <th style={{ padding: "8px 10px", borderBottom: "2px solid #cbd5e1" }}>Frequency</th>
                                                <th style={{ padding: "8px 10px", borderBottom: "2px solid #cbd5e1" }}>Duration</th>
                                                <th style={{ padding: "8px 10px", borderBottom: "2px solid #cbd5e1" }}>Instructions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {medicines.filter(m => m.name && m.name.trim() !== "").map((m, idx) => (
                                                <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                                                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#64748b" }}>{idx + 1}</td>
                                                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#082b68" }}>{m.name}</td>
                                                    <td style={{ padding: "8px 10px", color: "#334155" }}>{m.dosage || "1 Tablet"}</td>
                                                    <td style={{ padding: "8px 10px", color: "#01b6af", fontWeight: 600 }}>{m.frequency || "1-0-1"}</td>
                                                    <td style={{ padding: "8px 10px", color: "#334155" }}>{m.duration || "5 Days"}</td>
                                                    <td style={{ padding: "8px 10px", color: "#64748b", fontSize: "0.82rem" }}>{m.instructions || "After meals"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Treatment Plan & Advice */}
                            {(report.treatment_plan || report.advice) && (
                                <div style={{ marginBottom: "18px" }}>
                                    <h4 style={{ margin: "0 0 4px 0", color: "#082b68", fontSize: "0.92rem", textTransform: "uppercase" }}>Advice & Treatment Plan</h4>
                                    <p style={{ margin: 0, color: "#334155", fontSize: "0.88rem", lineHeight: "1.5" }}>{report.treatment_plan || (Array.isArray(report.advice) ? report.advice.join(", ") : String(report.advice))}</p>
                                </div>
                            )}

                            {/* Follow up & Red Flags */}
                            {(report.follow_up || report.red_flags) && (
                                <div style={{ marginBottom: "18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                    {report.follow_up && (
                                        <div>
                                            <h4 style={{ margin: "0 0 4px 0", color: "#082b68", fontSize: "0.88rem", textTransform: "uppercase" }}>Follow-up Date</h4>
                                            <p style={{ margin: 0, color: "#01b6af", fontWeight: 700, fontSize: "0.88rem" }}>{report.follow_up}</p>
                                        </div>
                                    )}
                                    {report.red_flags && (
                                        <div>
                                            <h4 style={{ margin: "0 0 4px 0", color: "#e11d48", fontSize: "0.88rem", textTransform: "uppercase" }}>⚠️ Red Flags / Warnings</h4>
                                            <p style={{ margin: 0, color: "#e11d48", fontSize: "0.85rem" }}>{Array.isArray(report.red_flags) ? report.red_flags.join(", ") : String(report.red_flags)}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Doctor Signature Block */}
                            <div style={{ marginTop: "30px", paddingTop: "15px", borderTop: "1px dashed #cbd5e1", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                                <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                                    Generated by Doctors Vedika AI • Digitally Verified & Reviewed
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ color: "#01b6af", fontWeight: 700, fontFamily: "cursive", fontSize: "1.1rem", marginBottom: "4px" }}>{displayDoctorName}</div>
                                    <div style={{ borderTop: "1px solid #082b68", paddingTop: "2px", fontWeight: 700, color: "#082b68", fontSize: "0.85rem" }}>Doctor's Signature</div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: "14px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <button
                                onClick={() => setShowPdfPreview(false)}
                                style={{
                                    background: "#ffffff",
                                    border: "1px solid #cbd5e1",
                                    color: "#475569",
                                    padding: "10px 18px",
                                    borderRadius: "8px",
                                    fontWeight: 600,
                                    cursor: "pointer"
                                }}
                            >
                                ← Back to Editing
                            </button>
                            <button
                                onClick={() => {
                                    setShowPdfPreview(false);
                                    handleSave(true);
                                }}
                                disabled={isSaving}
                                style={{
                                    background: "linear-gradient(135deg, #01b6af 0%, #082b68 100%)",
                                    color: "#ffffff",
                                    border: "none",
                                    padding: "10px 22px",
                                    borderRadius: "8px",
                                    fontWeight: 700,
                                    cursor: isSaving ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    boxShadow: "0 4px 12px rgba(1, 182, 175, 0.3)"
                                }}
                            >
                                <i className="fa-solid fa-check"></i> {isSaving ? "Saving Record..." : "Save & Finalize Record"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                html, body, #root {
                    background-color: #F8FBFF !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    min-height: 100vh !important;
                    overflow-x: hidden !important;
                }

                .consultation-summary-page {
                    height: 100vh !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: none !important;
                    border-radius: 0 !important;
                    box-shadow: none !important;
                    box-sizing: border-box !important;
                    color: #0F172A;
                    display: flex;
                    flex-direction: column;
                    background-color: #F8FBFF !important;
                    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    overflow: hidden !important;
                }

                .consultation-summary-page *,
                .consultation-summary-page *::before,
                .consultation-summary-page *::after {
                    box-sizing: border-box;
                }

                .summary-header {
                    width: 100%;
                    margin: 0 0 10px;
                    padding: 16px 16px 18px;
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                    border: 0;
                    border-bottom: 1px solid #08265F;
                    border-radius: 0;
                    background: linear-gradient(135deg, #08265F, #0E357E);
                    color: #ffffff;
                    shrink: 0;
                }

                .back-button, .print-button, .small-outline-button, .add-button, .list-add, .list-remove, .delete-medicine {
                    font: inherit;
                    cursor: pointer;
                }

                .back-button {
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    background: rgba(255,255,255,0.12);
                    color: #ffffff;
                    border-radius: 10px;
                    padding: 8px 14px;
                    font-weight: 700;
                    margin-bottom: 12px;
                }

                .title-row {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 12px;
                }

                .title-row h1 {
                    margin: 0;
                    font-size: clamp(26px, 3vw, 38px);
                    line-height: 1.08;
                    letter-spacing: -1.2px;
                    font-weight: 850;
                    color: #ffffff;
                }

                .title-row p {
                    margin: 4px 0 0;
                    color: #93C5FD;
                    font-size: 14px;
                }

                .ai-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    border: 1px solid rgba(255, 255, 255, 0.4);
                    background: rgba(255, 255, 255, 0.15);
                    color: #38BDF8;
                    border-radius: 999px;
                    padding: 5px 11px;
                    font-size: 12px;
                    font-weight: 800;
                }

                .print-button {
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    background: rgba(255, 255, 255, 0.12);
                    color: #ffffff;
                    border-radius: 10px;
                    padding: 9px 14px;
                    font-weight: 700;
                    white-space: nowrap;
                }

                .review-banner {
                    width: 100%;
                    margin: 0 0 10px;
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    border: 0;
                    border-bottom: 1px solid #BDE8E8;
                    border-radius: 0;
                    background: #EAF8F8;
                    shrink: 0;
                }

                .review-icon {
                    width: 36px;
                    height: 36px;
                    flex: 0 0 36px;
                    display: grid;
                    place-items: center;
                    border-radius: 50%;
                    border: 1px solid #08AEB8;
                    background: #ffffff;
                    color: #08AEB8;
                    font-size: 18px;
                    font-weight: 800;
                }

                .review-banner strong { font-size: 15px; color: #08265F; }
                .review-banner p { margin: 2px 0 0; color: #334155; font-size: 12px; }

                .meta-grid {
                    width: 100%;
                    margin: 0 0 10px;
                    padding: 0 12px;
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                    gap: 8px;
                    box-sizing: border-box;
                    flex-shrink: 0;
                }

                .meta-card {
                    min-height: 64px;
                    padding: 10px 12px;
                    border: 1px solid #E2E8F0;
                    border-radius: 10px;
                    background: #ffffff;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }

                .meta-label {
                    color: #64748B;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: .08em;
                    text-transform: uppercase;
                    margin-bottom: 3px;
                }

                .meta-value {
                    color: #08265F;
                    font-size: 13px;
                    font-weight: 800;
                    overflow-wrap: anywhere;
                }

                .summary-grid {
                    width: 100%;
                    max-width: 100%;
                    flex: 1;
                    min-height: 0;
                    padding: 0 12px 16px;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(320px, 390px);
                    gap: 16px;
                    align-items: stretch;
                    box-sizing: border-box;
                    overflow: hidden;
                }

                .report-column {
                    height: 100%;
                    overflow-y: auto;
                    padding-right: 6px;
                    padding-bottom: 40px;
                    min-width: 0;
                }

                .side-column {
                    height: 100%;
                    overflow-y: auto;
                    padding-right: 4px;
                    padding-bottom: 40px;
                    min-width: 0;
                }

                .report-card, .side-card {
                    width: 100%;
                    margin: 0 0 16px;
                    padding: 22px 24px;
                    border: 1px solid #E2E8F0;
                    border-radius: 16px;
                    background: #ffffff;
                    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
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
                    color: #08265F;
                    font-size: 18px;
                    line-height: 1.2;
                    font-weight: 850;
                }

                .section-icon { font-size: 17px; width: 20px; text-align: center; }
                .section-description { color: #475569; font-size: 12px; line-height: 1.6; margin: -4px 0 14px; }

                .report-card textarea, .report-card input, .report-card select, .transcript-edit {
                    width: 100%;
                    border: 1px solid #CBD5E1;
                    background: #F8FAFC;
                    color: #0F172A;
                    font-weight: 500;
                    border-radius: 10px;
                    padding: 12px 13px;
                    font: inherit;
                    outline: none;
                    transition: border-color .15s ease, box-shadow .15s ease;
                }

                .report-card textarea { min-height: 92px; resize: vertical; line-height: 1.55; }
                .report-card textarea:focus, .report-card input:focus, .report-card select:focus, .transcript-edit:focus {
                    border-color: #08AEB8;
                    box-shadow: 0 0 0 3px rgba(8, 174, 184, 0.12);
                }

                .editable-list { display: grid; gap: 10px; }
                .editable-list-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; }
                .editable-list-row textarea { min-height: 68px; }
                .list-remove, .delete-medicine {
                    border: 1px solid #F43F5E;
                    color: #E11D48;
                    background: #FFF1F2;
                    border-radius: 9px;
                    padding: 10px 13px;
                    font-weight: 800;
                }
                .list-add, .add-button {
                    width: max-content;
                    border: 1px solid #08AEB8;
                    color: #08AEB8;
                    background: #EAF8F8;
                    border-radius: 9px;
                    padding: 9px 13px;
                    font-weight: 800;
                }

                .empty-medicine, .empty-transcript {
                    border: 1px dashed #CBD5E1;
                    border-radius: 11px;
                    padding: 16px;
                    color: #64748B;
                    font-size: 13px;
                }

                .vitals-edit-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0,1fr));
                    gap: 13px;
                }
                .input-field { min-width: 0; }
                .input-field label { display:block; color:#08265F; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; margin:0 0 6px; }

                .medicine-list { display: grid; gap: 14px; }
                .medicine-row {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 16px;
                    border: 1px solid #E2E8F0;
                    border-radius: 14px;
                    background: #F8FAFC;
                    box-sizing: border-box;
                    width: 100%;
                }

                .medicine-row-header {
                    display: flex;
                    align-items: flex-end;
                    gap: 12px;
                    width: 100%;
                }

                .medicine-row-header .medicine-number {
                    color: #08AEB8;
                    font-weight: 900;
                    font-size: 16px;
                    padding-bottom: 10px;
                    flex: 0 0 auto;
                }

                .medicine-row-header .medicine-name-field {
                    flex: 1 1 auto;
                    min-width: 0;
                }

                .medicine-row-header .delete-medicine {
                    flex: 0 0 auto;
                    height: 42px;
                    margin-bottom: 1px;
                }

                .medicine-details-grid {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 12px;
                    width: 100%;
                }

                .medicine-directions-box {
                    width: 100%;
                    box-sizing: border-box;
                }
                .medicine-select { min-height: 44px; }

                .patient-name { font-size: 20px; font-weight: 850; color: #08265F; margin-bottom: 4px; }
                .patient-meta { color:#475569; font-size:13px; margin-bottom:18px; }
                .patient-stat-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
                .patient-stat { padding:12px; border:1px solid #E2E8F0; border-radius:10px; background:#F8FAFC; }
                .patient-stat-label { color:#64748B; font-size:10px; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
                .patient-stat-value { color:#08265F; font-size:13px; font-weight:750; overflow-wrap:anywhere; }
                .detail-row { display:flex; justify-content:space-between; gap:15px; padding:11px 0; border-bottom:1px solid #E2E8F0; }
                .detail-row:last-child { border-bottom:0; }
                .detail-label { color:#64748B; font-size:12px; }
                .detail-value { color:#08265F; font-size:12px; font-weight:750; text-align:right; }

                .transcript-card { max-height: 660px; }
                .transcript-container { max-height: 510px; overflow-y:auto; padding-right:4px; }
                .transcript-line { padding:11px 0; border-bottom:1px solid #E2E8F0; }
                .transcript-line:last-child { border-bottom:0; }
                .transcript-meta { display:flex; justify-content:space-between; gap:10px; margin-bottom:6px; color:#64748B; font-size:11px; }
                .transcript-meta strong { color:#08265F; font-size:12px; }
                .transcript-text { color:#0F172A; font-size:13px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; font-weight:450; }
                .transcript-edit { min-height:90px; resize:vertical; font-size:13px; }
                .small-outline-button { border:1px solid #08AEB8; color:#08AEB8; background:#EAF8F8; border-radius:8px; padding:7px 11px; font-size:11px; font-weight:800; }

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

                @media (max-width: 1200px) {
                    .summary-grid {
                        grid-template-columns: 1fr;
                        overflow: visible;
                    }
                    .report-column, .side-column {
                        height: auto;
                        overflow-y: visible;
                    }
                    .side-column {
                        position: static;
                    }
                }

                @media (max-width: 900px) {
                    .medicine-details-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }

                @media (max-width: 760px) {
                    .consultation-summary-page {
                        height: auto !important;
                        overflow-y: auto !important;
                        min-height: 100vh !important;
                    }
                    .summary-header {
                        padding: 14px 16px;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .title-row h1 { font-size: 24px; }
                    .meta-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
                    .review-banner { align-items:flex-start; padding:12px; }
                    .vitals-edit-grid, .patient-stat-grid { grid-template-columns:1fr; }
                    .editable-list-row { grid-template-columns:1fr; }
                    .medicine-details-grid { grid-template-columns: 1fr; }
                    .medicine-row-header { flex-wrap: wrap; }
                    .medicine-row-header .delete-medicine { width: 100%; }
                    .summary-grid { overflow: visible; height: auto; }
                    .report-column, .side-column { overflow-y: visible; height: auto; }
                }
                @media print {
                    .consultation-summary-page { background:#fff !important; color:#111 !important; }
                    button, .save-modal-backdrop { display:none !important; }
                    .summary-grid { grid-template-columns:1fr !important; }
                    .side-column { position:static !important; }
                    .report-card, .side-card, .meta-card, .summary-header, .review-banner { background:#fff !important; color:#111 !important; border-color:#ccc !important; box-shadow:none !important; }
                }
            `}</style>
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
    placeholder,
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
            placeholder={placeholder}
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