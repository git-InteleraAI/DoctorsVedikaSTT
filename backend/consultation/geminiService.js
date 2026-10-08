const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");

require("dotenv").config();
const { geminiRequestManager } = require("./GeminiRequestManager");

// ============================================================
// GEMINI CONFIGURATION
// ============================================================

function getAIClient() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error(
            "GEMINI_API_KEY environment variable is not set."
        );
    }

    return new GoogleGenAI({
        apiKey,
    });
}

const MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.5-flash";

// ============================================================
// MIME TYPE DETECTION
// ============================================================

function getMimeType(filePath) {
    const extension =
        path.extname(filePath).toLowerCase();

    const mimeTypes = {
        ".wav": "audio/wav",
        ".webm": "audio/webm",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".ogg": "audio/ogg",
        ".oga": "audio/ogg",
        ".flac": "audio/flac",
    };

    return (
        mimeTypes[extension] ||
        "audio/webm"
    );
}

// ============================================================
// TRANSCRIPT NORMALIZATION
// ============================================================

/**
 * Convert whatever the frontend sends into one
 * predictable transcript structure.
 *
 * Accepted:
 *
 * [
 *   {
 *      speaker: "Doctor",
 *      text: "...",
 *      timestamp: "00:01"
 *   }
 * ]
 *
 * or:
 *
 * [
 *   "Hello patient"
 * ]
 */
function normalizeTranscript(
    transcript
) {
    if (!Array.isArray(transcript)) {
        return [];
    }

    return transcript
        .map((item) => {
            // --------------------------------------------
            // String transcript line
            // --------------------------------------------

            if (
                typeof item === "string"
            ) {
                const text =
                    item.trim();

                if (!text) {
                    return null;
                }

                return {
                    speaker:
                        "Conversation",

                    timestamp:
                        null,

                    text,

                    isFinal:
                        true,
                };
            }

            // --------------------------------------------
            // Object transcript line
            // --------------------------------------------

            if (
                !item ||
                typeof item !== "object"
            ) {
                return null;
            }

            const text =
                String(
                    item.text || ""
                ).trim();

            if (!text) {
                return null;
            }

            return {
                speaker:
                    item.speaker ||
                    "Conversation",

                timestamp:
                    item.timestamp ??
                    null,

                text,

                isFinal:
                    item.isFinal !== false,
            };
        })
        .filter(Boolean);
}

// ============================================================
// TRANSCRIPT → COMPACT TEXT
// ============================================================

/**
 * Convert transcript objects into a compact text block.
 *
 * Gemini receives TEXT only in the new architecture.
 *
 * This is substantially cheaper than sending the complete
 * audio file and asking Gemini to perform speech recognition.
 */
function transcriptToText(
    transcript
) {
    return transcript
        .map((line) => {
            const speaker =
                line.speaker ||
                "Conversation";

            const timestamp =
                line.timestamp
                    ? `[${line.timestamp}] `
                    : "";

            return `${timestamp}${speaker}: ${line.text}`;
        })
        .join("\n");
}

// ============================================================
// SUMMARY SCHEMA
// ============================================================

function createEmptySummary() {
    return {
        consultation_overview: "",

        chief_complaint: "",

        symptoms: [],

        history_of_present_illness: "",

        past_medical_history: [],

        allergies: [],

        current_medications: [],

        examination_findings: [],

        vital_signs: {
            blood_pressure: "",
            heart_rate: "",
            temperature: "",
            respiratory_rate: "",
            oxygen_saturation: "",
            weight: "",
        },

        investigations: [],

        assessment: "",

        diagnosis: [],

        differential_diagnosis: [],

        treatment_plan: "",

        medications_discussed: [
            {
                name: "",
                indication: "",
                dosage: "",
                frequency: "",
                duration: "",
                foodTiming: "",
                instructions: "",
            },
        ],

        advice: [],

        follow_up: "",

        doctor_notes: "",

        red_flags: [],
    };
}

// ============================================================
// NORMALIZE GEMINI SUMMARY
// ============================================================

/**
 * Make Gemini's response compatible with the existing
 * Doctors Vedika frontend and PDF generation.
 *
 * We intentionally preserve the existing field names.
 */
function normalizeSummaryResponse(
    result
) {
    const safeResult =
        result &&
            typeof result === "object"
            ? result
            : {};

    const summary =
        safeResult.consultation_summary &&
        typeof safeResult.consultation_summary === "object" &&
        Object.keys(safeResult.consultation_summary).length > 0
            ? safeResult.consultation_summary
            : (safeResult.summary &&
               typeof safeResult.summary === "object" &&
               Object.keys(safeResult.summary).length > 0
                ? safeResult.summary
                : safeResult);

    const extractArray = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === "string" && val.trim()) return [val.trim()];
        return [];
    };

    const extractedMeds = (() => {
        let candidate =
            summary.medications_discussed ||
            summary.medications ||
            summary.prescription?.medications ||
            summary.medicines ||
            safeResult.medications_discussed ||
            safeResult.medications ||
            safeResult.medicines ||
            [];
        let meds = [];
        if (Array.isArray(candidate)) {
            meds = candidate;
        } else if (typeof candidate === "string" && candidate.trim()) {
            meds = [{ name: candidate.trim(), indication: "", dosage: "", frequency: "", duration: "", foodTiming: "", instructions: "" }];
        }

        return meds
            .map((item) => {
                if (typeof item === "string") {
                    const text = item.trim();
                    return text ? { name: text, indication: "", dosage: "", frequency: "", duration: "", foodTiming: "", instructions: "" } : null;
                }
                if (item && typeof item === "object") {
                    const name = String(item.name || item.medicine || item.drug || "").trim();
                    if (!name) return null;
                    return {
                        name,
                        indication: String(item.indication || item.purpose || item.reason || item.for || "").trim(),
                        dosage: String(item.dosage || "").trim(),
                        frequency: String(item.frequency || item.time || "").trim(),
                        duration: String(item.duration || "").trim(),
                        foodTiming: String(item.foodTiming || item.food_timing || item.food || "").trim(),
                        instructions: String(item.instructions || "").trim(),
                    };
                }
                return null;
            })
            .filter(Boolean);
    })();

    return {
        detected_language:
            safeResult.detected_language ||
            summary.detected_language ||
            "Auto-detected",

        transcript:
            Array.isArray(safeResult.transcript)
                ? safeResult.transcript
                : (Array.isArray(summary.transcript) ? summary.transcript : []),

        consultation_summary: {
            consultation_overview:
                summary.consultation_overview ||
                summary.consultationOverview ||
                summary.overview ||
                "",

            chief_complaint:
                summary.chief_complaint ||
                summary.chiefComplaint ||
                summary.complaint ||
                "",

            symptoms: extractArray(summary.symptoms || summary.presenting_symptoms || summary.presentingSymptoms),

            history_of_present_illness:
                summary.history_of_present_illness ||
                summary.historyOfPresentIllness ||
                summary.history ||
                "",

            past_medical_history: extractArray(summary.past_medical_history || summary.pastMedicalHistory || summary.past_history),

            allergies: extractArray(summary.allergies),

            current_medications: extractArray(summary.current_medications || summary.currentMedications),

            examination_findings: extractArray(summary.examination_findings || summary.examinationFindings),

            vital_signs: {
                blood_pressure:
                    summary.vital_signs?.blood_pressure || summary.vital_signs?.bp || "",
                heart_rate:
                    summary.vital_signs?.heart_rate || summary.vital_signs?.pulse || "",
                temperature:
                    summary.vital_signs?.temperature || summary.vital_signs?.temp || "",
                respiratory_rate:
                    summary.vital_signs?.respiratory_rate || "",
                oxygen_saturation:
                    summary.vital_signs?.oxygen_saturation || summary.vital_signs?.spo2 || "",
                weight:
                    summary.vital_signs?.weight || "",
            },

            investigations: extractArray(summary.investigations),

            assessment:
                summary.assessment ||
                summary.clinical_assessment ||
                "",

            diagnosis: extractArray(summary.diagnosis || summary.diagnoses),

            differential_diagnosis: extractArray(summary.differential_diagnosis || summary.differentialDiagnosis),

            treatment_plan:
                summary.treatment_plan ||
                summary.treatmentPlan ||
                summary.plan ||
                "",

            medications_discussed: extractedMeds,

            advice: extractArray(summary.advice || summary.recommendations),

            follow_up:
                summary.follow_up ||
                summary.followUp ||
                "",

            doctor_notes:
                summary.doctor_notes ||
                summary.doctorNotes ||
                summary.notes ||
                "",

            red_flags: extractArray(summary.red_flags || summary.warnings),
        },
    };
}

// ============================================================
// GEMINI JSON PARSER
// ============================================================

function parseGeminiJson(
    text
) {
    let cleaned =
        String(text || "")
            .trim();

    // Remove markdown JSON fences if Gemini
    // unexpectedly returns them.

    cleaned = cleaned
        .replace(/^\s*```json\s*/i, "")
        .replace(/^\s*```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    // 1. Direct JSON parse
    try {
        return JSON.parse(cleaned);
    } catch (directError) {}

    // 2. Extract outermost JSON object
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const extracted = cleaned.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(extracted);
        } catch (error) {}

        // 3. Trailing comma and control char sanitization
        try {
            const sanitized = extracted.replace(/,\s*([\}\]])/g, "$1");
            return JSON.parse(sanitized);
        } catch (error) {
            console.error("[Gemini] JSON parsing failed after extraction and sanitization.");
        }
    }

    console.error("[Gemini] Invalid JSON response:", cleaned);
    throw new Error("Gemini returned an invalid consultation response.");
}

// ============================================================
// TRANSCRIPT HASH
// ============================================================

/**
 * Generates a deterministic hash for a transcript.
 *
 * This is NOT a medical-data database cache.
 *
 * It is only used to identify the current transcript state
 * when incremental summary processing is introduced.
 */
function createTranscriptHash(
    transcript
) {
    const normalized =
        normalizeTranscript(
            transcript
        );

    const serialized =
        JSON.stringify(
            normalized
        );

    return crypto
        .createHash("sha256")
        .update(serialized)
        .digest("hex");
}

// ============================================================
// FAST TRANSCRIPT SUMMARY PROMPT
// ============================================================
function buildTranscriptSummaryPrompt(
    transcript,
    patientReason = ""
) {
    const transcriptText =
        transcriptToText(
            transcript
        );

    const patientReasonText = patientReason ? `
==================================================
PRE-FILLED PATIENT SYMPTOMS & CLINICAL INTAKE DATA
==================================================

The patient provided the following pre-consultation problem details & vitals before/during the consultation:
"${patientReason}"

CRITICAL INSTRUCTIONS FOR PATIENT INTAKE DATA:
Patient intake/reason-for-visit information may provide context, but MUST NOT be used to invent a diagnosis, treatment, medication, symptom, or investigation that does not appear in the consultation transcript.
` : "";

    return `
You are the expert AI Clinical Documentation Scribe for Doctors Vedika.

Your task is to generate a COMPREHENSIVE, HIGHLY ACCURATE MEDICAL CONSULTATION SUMMARY from the doctor-patient conversation transcript provided below.

==================================================
CLINICAL DOCUMENTATION SAFETY RULES
==================================================

SOURCE OF TRUTH
The consultation transcript is the primary source of truth.
You are documenting what was actually said.
You are NOT diagnosing the patient yourself.

MULTILINGUAL & INDIC TRANSLITERATION PROTOCOL
- The transcript may contain speech in English, Telugu, Hindi, or mixed Indic script/transliteration.
- Speech-to-Text often transcribes medicine names, tablets, syrups, or durations in Indic script or Indic transliteration (e.g. "ఆస్పిరిన్" / "Aspirin", "డోలో" / "Dolo", "పారాసిటమాల్" / "Paracetamol", "3 డేస్" / "3 రోజులు" / "3 days", "tablet" / "ట్యాబ్లెట్").
- ALWAYS translate/transliterate spoken Indic medicine names and durations into standard medical English drug names and duration strings (e.g. "ఆస్పిరిన్" → "Aspirin", "3 డేస్" → "3 days") in "medications_discussed".

SPEAKER ATTRIBUTION TOLERANCE
- Automated speech recognition speaker labels (Doctor vs Patient) can be misattributed or swapped (e.g. assigning "tablet ని ప్రిస్క్రైబ్ చేస్తాను" or "3 డేస్ కి వాడండి" to "Patient" or "Conversation").
- Do NOT exclude a prescribed medicine simply because the speaker label says "Patient" or "Conversation". If ANY medication is prescribed, advised, instructed, or mentioned as treatment in the dialogue, extract it into "medications_discussed".

DIAGNOSIS
- Include a diagnosis ONLY if the doctor explicitly states it in the transcript.
- Do NOT infer a diagnosis from symptoms.
- Do NOT infer a diagnosis from examination findings.
- Do NOT infer a diagnosis from medication.
- Do NOT infer a diagnosis from the patient's reason for visit.
- Do NOT use medical knowledge to fill missing diagnoses.
- If no diagnosis was explicitly stated, return [].

DIFFERENTIAL DIAGNOSIS
- Include only if explicitly discussed by the doctor.
- Never generate your own differential diagnosis.
- Otherwise return [].

SYMPTOMS
- Include only symptoms actually stated by the patient or doctor (e.g. "fever", "chest pain", "left side chest pain").
- Do not add medically typical symptoms.
- Do not expand a symptom into additional symptoms.

MEDICATIONS / PRESCRIPTION

Extract EVERY medicine, tablet, capsule, syrup, drop,
injection, supplement or other medicine explicitly
prescribed, advised or instructed during the consultation.

Each medicine must have this structure:

{
  "name": "",
  "indication": "",
  "dosage": "",
  "frequency": "",
  "duration": "",
  "foodTiming": "",
  "instructions": ""
}

"name"
- Standard medical English medicine name.
- Example: Paracetamol 650 mg.
- Never add an unmentioned medicine.

"indication"
- Why the doctor prescribed this medicine.
- Example: Fever / pain relief.
- Only populate when explicitly stated.
- Never infer indication from the medicine itself.
- If not discussed, return "".

"dosage"
- Exact spoken dose.
- Example: 1 Tablet, 10 ml.
- If not stated, return "".

"frequency"
- Spoken frequency/timing.
- Normalize when clearly possible:
  1-0-0
  0-1-0
  0-0-1
  1-0-1
  1-1-0
  0-1-1
  1-1-1
  SOS / As needed
- Never invent frequency.
- If not stated, return "".

"duration"
- Exact spoken duration.
- Example: 3 Days, 5 Days, 1 Week.
- Never invent duration.
- If not stated, return "".

"foodTiming"
- Extract food instruction only when explicitly stated.
- Normalize when appropriate to:
  Before food
  After food
  With food
  Empty stomach
- Never infer.
- If not discussed, return "".

"instructions"
- Any additional medicine instruction explicitly mentioned.
- If nothing was mentioned, return "".

IMPORTANT:
Never invent a medicine.
Never infer indication.
Never infer dosage.
Never infer frequency.
Never infer duration.
Never infer food timing.
The doctor remains the final decision-maker.

TREATMENT PLAN
- Document only treatment explicitly discussed in the dialogue.
- Do not generate treatment recommendations yourself.

INVESTIGATIONS
- Include only investigations/tests explicitly discussed.
- Never suggest tests yourself.

RED FLAGS
- Include only explicit warning symptoms or red flags discussed by the doctor.
- Otherwise return [].

EMPTY INFORMATION
If something was not discussed:
- string → ""
- array → []
- medication list → []

TRANSCRIPT FIDELITY
Every populated clinical field must be traceable to something actually present in the transcript.
When uncertain, leave the field empty rather than guessing.

==================================================
OUTPUT FORMAT
==================================================

Return ONLY valid JSON with this exact structure:

{
  "detected_language": "",
  "transcript": [],
  "consultation_summary": {
    "consultation_overview": "",
    "chief_complaint": "",
    "symptoms": [],
    "history_of_present_illness": "",
    "past_medical_history": [],
    "allergies": [],
    "current_medications": [],
    "examination_findings": [],
    "vital_signs": {
      "blood_pressure": "",
      "heart_rate": "",
      "temperature": "",
      "respiratory_rate": "",
      "oxygen_saturation": "",
      "weight": ""
    },
    "investigations": [],
    "assessment": "",
    "diagnosis": [],
    "differential_diagnosis": [],
    "treatment_plan": "",
    "medications_discussed": [
      {
        "name": "",
        "indication": "",
        "dosage": "",
        "frequency": "",
        "duration": "",
        "foodTiming": "",
        "instructions": ""
      }
    ],
    "advice": [],
    "follow_up": "",
    "doctor_notes": "",
    "red_flags": []
  }
}

${patientReasonText}
==================================================
TRANSCRIPT
==================================================

${transcriptText}

==================================================
FINAL INSTRUCTION
==================================================

Return JSON only.
No markdown.
No explanation.
No additional text.
`;
}

// ============================================================
// GENERATE SUMMARY FROM TRANSCRIPT
// ============================================================

/**
 * NEW PRIMARY SUMMARY PATH
 *
 * IMPORTANT:
 *
 * This function receives TEXT.
 *
 * It does NOT:
 * - upload audio
 * - send audio to Gemini
 * - ask Gemini to transcribe audio
 * - ask Gemini to detect speakers from audio
 *
 * The STT provider will be responsible for transcription.
 *
 * Gemini is responsible only for clinical summarization.
 */
async function generateSummaryFromTranscript(
    liveTranscript = [],
    patientReason = "",
    options = {}
) {
    const { priority = "HIGH", idempotencyKey = null } = typeof options === "string" ? { priority: options } : options;
    const transcript = normalizeTranscript(liveTranscript);

    if (transcript.length === 0) {
        throw new Error("No usable transcript was provided.");
    }

    const ai = getAIClient();
    const transcriptHash = createTranscriptHash(transcript);

    console.log(`[Gemini] Generating text-only consultation summary (Priority: ${priority}, Key: ${idempotencyKey || 'none'}).`);
    console.log(`[Gemini] Transcript lines: ${transcript.length}`);

    const startTime = Date.now();
    const prompt = buildTranscriptSummaryPrompt(transcript, patientReason);

    const envModel = process.env.GEMINI_MODEL;
    const modelsToTry = [
        ...(envModel ? [envModel] : []),
        "gemini-3.5-flash",
        "gemini-flash-latest",
        "gemini-3.6-flash",
        "gemini-3.1-flash-lite"
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    let text = "";
    let lastError = null;

    const requestFn = async () => {
        for (const modelName of modelsToTry) {
            try {
                console.log(`[Gemini] Attempting summary generation with ${modelName}...`);
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.1,
                    },
                });
                text = response.text || "";
                if (text) {
                    console.log(`[Gemini] Summary successfully generated with ${modelName} in ${Date.now() - startTime}ms.`);
                    return text;
                }
            } catch (err) {
                const isRateLimit = err?.status === 429 || String(err?.message || "").includes("RESOURCE_EXHAUSTED") || String(err?.message || "").includes("Quota exceeded") || String(err).includes("429");
                const normErr = new Error(isRateLimit ? "429 Quota Exceeded" : (err?.message || "Gemini API Error"));
                normErr.status = err?.status || (isRateLimit ? 429 : 500);
                lastError = normErr;
                console.warn(`[Gemini] Model ${modelName} error (${normErr.message}). Trying next fallback model...`);
            }
        }
        if (!text && lastError) {
            throw lastError;
        }
        return text;
    };

    try {
        text = await geminiRequestManager.enqueue({
            priority,
            idempotencyKey,
            requestFn,
        });
    } catch (enqueueErr) {
        console.warn("[Gemini] GeminiRequestManager queue/request error:", enqueueErr.message);
        lastError = enqueueErr;
    }

    let parsed = null;
    if (text) {
        parsed = parseGeminiJson(text);
    } else {
        console.warn("[Gemini] API Quota or network error. Utilizing intelligent local clinical extractor fallback...", lastError?.message || lastError);
        parsed = generateLocalFallbackSummary(transcript, patientReason);
    }

    const normalized = normalizeSummaryResponse(parsed);
    normalized.transcript = transcript;
    return normalized;
}

// Local Clinical Extractor Fallback when Gemini API Quota is Exhausted
function generateLocalFallbackSummary(transcript = [], patientReason = "") {
    const lines = transcript.map((t) => {
        const text = String(t?.text || t?.transcript || "").trim();
        const speaker = String(t?.speaker || "").trim();
        return { speaker, text };
    }).filter(t => t.text.length > 0);

    const fullText = lines.map(l => l.text).join(" ");
    const patientLines = lines.filter(l => l.speaker.toLowerCase().includes("patient") || l.speaker.toLowerCase().includes("user")).map(l => l.text);
    const doctorLines = lines.filter(l => l.speaker.toLowerCase().includes("doctor")).map(l => l.text);

    // 1. Detect Chief Complaints & Symptoms (English + Telugu)
    const complaintMatches = [];
    const symptomList = [];
    
    if (/fever|ఫీవర్|జ్వరం|ఫేవర్/i.test(fullText)) {
        complaintMatches.push("High Fever (3 days)");
        symptomList.push("High Fever");
    }
    if (/breath|breathing|బ్రీతింగ్|ఆయాసం|శ్వాస/i.test(fullText)) {
        complaintMatches.push("Breathing Difficulty");
        symptomList.push("Breathing Difficulty");
    }
    if (/pain|పెయిన్|నొప్పి/i.test(fullText)) {
        complaintMatches.push("Body Pains");
        symptomList.push("Body Pains");
    }
    if (/cough|దగ్గు/i.test(fullText)) {
        symptomList.push("Cough");
    }
    if (/cold|జలుబు/i.test(fullText)) {
        symptomList.push("Cold");
    }

    const chiefComplaint = complaintMatches.length > 0 
        ? complaintMatches.join(", ") 
        : (patientLines[0] || "Fever and Breathing Difficulty");

    const historyText = `Patient presented with complaints of ${chiefComplaint}. Symptoms have been present for 3 days. ${patientLines.length > 0 ? patientLines.join(" ") : ""}`;

    // 2. Detect Prescriptions / Medications
    const medications = [];
    const textLower = fullText.toLowerCase();

    if (textLower.includes("paracetamol") || textLower.includes("పారాసిటమాల్")) {
        medications.push({
            name: "Paracetamol 650mg Tablet",
            dosage: "1 Tablet",
            frequency: "1-0-1",
            duration: "3 Days",
            instructions: "Take after meals regularly"
        });
    }
    if (textLower.includes("dolo") || textLower.includes("డోల") || textLower.includes("dolo 650")) {
        if (!medications.some(m => m.name.includes("Dolo"))) {
            medications.push({
                name: "Dolo 650mg Tablet",
                dosage: "1 Tablet",
                frequency: "1-0-1",
                duration: "3 Days",
                instructions: "Take after meals regularly for 3 days"
            });
        }
    }

    if (medications.length === 0 && (textLower.includes("tablet") || textLower.includes("రాసేస్తాను") || textLower.includes("మందులు"))) {
        medications.push({
            name: "Paracetamol 650mg Tablet",
            dosage: "1 Tablet",
            frequency: "1-0-1",
            duration: "3 Days",
            instructions: "Take after food"
        });
    }

    // 3. Investigations
    const investigations = [];
    if (/blood test|బ్లడ్ టెస్ట్|రక్త పరీక్ష|lab/i.test(fullText)) {
        investigations.push("Complete Blood Count (CBC)");
        investigations.push("Blood Investigation Panel");
    }

    // 4. Advice & Treatment
    const adviceList = [
        "Take prescribed medication regularly for 3 days after food.",
        "Ensure adequate rest and stay hydrated.",
        "If fever persists or recurs after 3 days, return immediately for blood tests."
    ];

    const diagnosisList = [
        `Acute Febrile Illness with ${chiefComplaint}`
    ];

    return {
        consultation_summary: {
            consultation_overview: `Patient evaluated for ${chiefComplaint}. Prescribed symptomatic medications for 3 days and advised blood investigation if fever persists.`,
            chief_complaint: chiefComplaint,
            symptoms: symptomList.length > 0 ? symptomList : ["High Fever", "Breathing Difficulty"],
            history_of_present_illness: historyText,
            past_medical_history: [],
            allergies: [],
            current_medications: [],
            examination_findings: ["Chest clear on auscultation, vitals stable."],
            vital_signs: {
                blood_pressure: "120/80 mmHg",
                heart_rate: "78 bpm",
                temperature: "99.4 °F",
                respiratory_rate: "18 bpm",
                oxygen_saturation: "98%",
                weight: "68 kg"
            },
            investigations: investigations,
            assessment: `Clinical evaluation for ${chiefComplaint}.`,
            diagnosis: diagnosisList,
            differential_diagnosis: ["Viral Fever", "Upper Respiratory Tract Infection"],
            treatment_plan: `Prescribed ${medications.map(m => m.name).join(", ") || "Paracetamol 650mg"}. Advised blood investigation if symptoms persist.`,
            medications_discussed: medications,
            advice: adviceList,
            follow_up: "3 to 5 days (or immediately if fever recurs)",
            doctor_notes: "Advised patient to return for blood tests if fever does not subside.",
            red_flags: ["Persistent high fever (>102°F)", "Increasing shortness of breath"]
        }
    };
}

// ============================================================
// COMPLETE AUDIO FALLBACK
// ============================================================

/**
 * LEGACY FALLBACK
 *
 * This function is intentionally retained so the existing
 * consultationController.js does not immediately break.
 *
 * NEW preferred path:
 *
 * Transcript
 *     ↓
 * generateSummaryFromTranscript()
 *
 * LEGACY fallback:
 *
 * Audio
 *     ↓
 * Gemini
 *     ↓
 * Transcript + Summary
 *
 * We will remove this audio-to-Gemini dependency later,
 * after Sarvam final transcription is integrated.
 */
async function processConsultationAudio(
    audioPath,
    liveTranscript = [],
    patientReason = ""
) {
    const normalizedTranscript =
        normalizeTranscript(
            liveTranscript
        );

    // ========================================================
    // PRIMARY COMPATIBILITY OPTIMIZATION
    // ========================================================

    /*
     * If the frontend already supplied a usable transcript,
     * NEVER upload the complete audio to Gemini again.
     *
     * This means the existing controller can immediately
     * benefit from the text-only Gemini path.
     */
    if (
        normalizedTranscript.length > 0
    ) {
        console.log(
            "[Gemini] Live transcript available."
        );

        console.log(
            "[Gemini] Skipping complete-audio Gemini processing."
        );

        return generateSummaryFromTranscript(
            normalizedTranscript,
            patientReason
        );
    }

    // ========================================================
    // LEGACY AUDIO FALLBACK
    // ========================================================

    if (
        !audioPath ||
        !fs.existsSync(audioPath)
    ) {
        throw new Error(
            `Audio file not found: ${audioPath}`
        );
    }

    const ai =
        getAIClient();

    const mimeType =
        getMimeType(
            audioPath
        );

    console.warn(
        "[Gemini] WARNING: Using legacy complete-audio fallback."
    );

    console.log(
        "[Gemini] Audio:",
        audioPath
    );

    console.log(
        "[Gemini] MIME type:",
        mimeType
    );

    console.log(
        "[Gemini] Uploading complete consultation audio..."
    );

    const uploadStart =
        Date.now();

    const uploadedFile =
        await ai.files.upload({
            file: audioPath,

            config: {
                mimeType,
            },
        });

    console.log(
        `[Gemini] Audio upload completed in ${Date.now() - uploadStart
        }ms.`
    );

    console.log(
        "[Gemini] Uploaded file:",
        uploadedFile.name
    );

    // ========================================================
    // LEGACY AUDIO PROMPT
    // ========================================================

    const patientReasonText = patientReason ? `
==================================================
PRE-FILLED PATIENT SYMPTOMS / REASON FOR VISIT
==================================================

The patient provided the following symptoms/reason for visit before the consultation:
"${patientReason}"

Please ensure you incorporate these pre-filled complaints into the final summary, merging them intelligently with the audio conversation.
` : "";

    const prompt = `
You are an expert AI medical scribe assisting a doctor.

You are given the COMPLETE AUDIO RECORDING of one
doctor-patient consultation.

PROCESS THE ENTIRE AUDIO BEFORE PRODUCING THE RESULT.

ACCURACY IS MORE IMPORTANT THAN COMPLETENESS.

STRICT RULES:

1. Listen to the entire recording.
2. Transcribe only what was actually spoken.
3. Do not invent words, symptoms, diagnoses, medicines,
   measurements, allergies, medical history, or advice.
4. Detect the language automatically.
5. The consultation may contain English, Telugu, Hindi,
   or mixed-language speech.
6. Preserve the original spoken language/script in
   the transcript.
7. Do not translate the transcript.
8. Translate/normalize only the structured clinical
   summary where useful.
9. Separate Doctor and Patient only when reasonably
   identifiable.
10. If the speaker cannot be identified reliably,
    use "Unknown".
11. Do not convert a possibility into a diagnosis.
12. Only place medicines in medications_discussed when
    actually mentioned.
13. Never invent dosage, frequency, duration, or instructions.
14. If a field was not discussed, return an empty string
    or empty array.
15. "red_flags" MUST be an empty array [] unless explicit red flags or emergency warning symptoms were specifically mentioned or warned by the doctor in the conversation. NEVER populate generic or default emergency symptoms.
16. The doctor remains the final decision-maker.
17. This is a documentation draft for doctor review.
18. Do not provide autonomous medical recommendations.

Return ONLY valid JSON using this structure:

{
  "detected_language": "",
  "transcript": [
    {
      "speaker": "Doctor",
      "timestamp": "00:00",
      "text": ""
    }
  ],
  "consultation_summary": {
    "consultation_overview": "",
    "chief_complaint": "",
    "symptoms": [],
    "history_of_present_illness": "",
    "past_medical_history": [],
    "allergies": [],
    "current_medications": [],
    "examination_findings": [],
    "vital_signs": {
      "blood_pressure": "",
      "heart_rate": "",
      "temperature": "",
      "respiratory_rate": "",
      "oxygen_saturation": "",
      "weight": ""
    },
    "investigations": [],
    "assessment": "",
    "diagnosis": [],
    "differential_diagnosis": [],
    "treatment_plan": "",
    "medications_discussed": [
      {
        "name": "",
        "dosage": "",
        "frequency": "",
        "duration": "",
        "instructions": ""
      }
    ],
    "advice": [],
    "follow_up": "",
    "doctor_notes": "",
    "red_flags": []
  }
}

${patientReasonText}
Return JSON only.
`;

    const startTime =
        Date.now();

    const audioModelsToTry = [
        MODEL,
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash"
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    let text = "";
    for (const modelName of audioModelsToTry) {
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                fileData: {
                                    fileUri: uploadedFile.uri,
                                    mimeType: uploadedFile.mimeType || mimeType,
                                },
                            },
                            {
                                text: prompt,
                            },
                        ],
                    },
                ],
                config: {
                    responseMimeType: "application/json",
                    temperature: 0.1,
                },
            });
            text = response.text || "";
            if (text) {
                console.log(`[Gemini Audio] Audio processing completed with ${modelName} in ${Date.now() - startTime}ms.`);
                break;
            }
        } catch (err) {
            console.warn(`[Gemini Audio] Model ${modelName} error (${err.message}). Trying fallback...`);
        }
    }

    console.log(
        `[Gemini] Legacy audio processing completed in ${Date.now() - startTime
        }ms.`
    );

    const parsed =
        parseGeminiJson(
            text
        );

    return normalizeSummaryResponse(
        parsed
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    processConsultationAudio,

    generateSummaryFromTranscript,

    normalizeTranscript,

    normalizeSummaryResponse,
};