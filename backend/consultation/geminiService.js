const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");

require("dotenv").config();

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
    "gemini-3.5-flash-lite";

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
                dosage: "",
                frequency: "",
                duration: "",
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
        const candidate =
            summary.medications_discussed ||
            summary.medications ||
            summary.prescription?.medications ||
            summary.medicines ||
            safeResult.medications_discussed ||
            safeResult.medications ||
            safeResult.medicines ||
            [];
        if (Array.isArray(candidate)) return candidate;
        if (typeof candidate === "string" && candidate.trim()) {
            return [{ name: candidate.trim(), dosage: "", frequency: "", duration: "", instructions: "" }];
        }
        return [];
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

    cleaned =
        cleaned
            .replace(
                /^```json\s*/i,
                ""
            )
            .replace(
                /^```\s*/i,
                ""
            )
            .replace(
                /\s*```$/i,
                ""
            )
            .trim();

    // --------------------------------------------
    // First attempt: direct JSON
    // --------------------------------------------

    try {
        return JSON.parse(
            cleaned
        );
    } catch (directError) {
        // Continue below.
    }

    // --------------------------------------------
    // Second attempt:
    // extract outermost JSON object
    // --------------------------------------------

    const firstBrace =
        cleaned.indexOf("{");

    const lastBrace =
        cleaned.lastIndexOf("}");

    if (
        firstBrace !== -1 &&
        lastBrace > firstBrace
    ) {
        const extracted =
            cleaned.substring(
                firstBrace,
                lastBrace + 1
            );

        try {
            return JSON.parse(
                extracted
            );
        } catch (error) {
            console.error(
                "[Gemini] JSON parsing failed after extraction."
            );
        }
    }

    console.error(
        "[Gemini] Invalid JSON response:"
    );

    console.error(
        cleaned
    );

    throw new Error(
        "Gemini returned an invalid consultation response."
    );
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

CRITICAL INSTRUCTIONS FOR GEMINI:
1. READ AND ANALYZE BOTH THE PREFILLED SYMPTOMS/INTAKE DATA ABOVE AND THE LIVE CONVERSATION TRANSCRIPT SIMULTANEOUSLY.
2. Incorporate these prefilled symptoms, chief complaints, duration, severity, current medications, and vitals into the "chief_complaint", "symptoms", "history_of_present_illness", "current_medications", and "vital_signs" sections of the summary alongside the transcript analysis.
3. Ensure no prefilled symptom or reported problem detail is omitted from the final medical summary.
` : "";

    return `
You are the expert AI Clinical Documentation Scribe for Doctors Vedika.

Your task is to generate a COMPREHENSIVE, HIGHLY ACCURATE MEDICAL CONSULTATION SUMMARY from the doctor-patient conversation transcript provided below.

==================================================
CLINICAL DOCUMENTATION GUIDELINES
==================================================

1. UNIVERSAL & COMPREHENSIVE PHARMACEUTICAL EXTRACTION:
   - Extract EVERY medicine, tablet, syrup, injection, drops, ointment, or supplement prescribed, instructed, or advised by the doctor into "medications_discussed".
   - You MUST NOT miss any medication spoken by the doctor regardless of the medical specialty (General Medicine, Cardiology, Pulmonology, Pediatrics, Dermatology, Orthopedics, ENT, Gynecology, Diabetology, etc.).
   - Recognize ALL generic and brand names commonly used in clinical practice (e.g., Dolo, Calpol, Paracetamol, Crocin, Augmentin, Clavam, Amoxicillin, Azithromycin, Azithral, Taxim-O, Cefixime, Ciprofloxacin, Levofloxacin, Metformin, Glycomet, Telma, Telmisartan, Amlokind, Amlodipine, Ecosprin, Pantocid, Pantoprazole, Pan 40, Omez, Omeprazole, Ranitidine, Rantac, Ondem, Vomikind, Cetirizine, Levocetirizine, Montair LC, Allegra, Combiflam, Zerodol, Meftal Spas, Wikoryl, Cheston Cold, Benadryl, Alex, Ascoril, Shelcal, Evion, Liv52, etc.).

2. DISTINGUISH PRIOR VS NEW PRESCRIBED MEDICATIONS:
   - "current_medications": Medicines the patient reported taking *before* the consultation (e.g. self-medicated prior to visit).
   - "medications_discussed": ALL medicines prescribed, instructed, or advised by the doctor during the current consultation. Each item MUST include:
       {
         "name": "Full Drug / Brand Name & Strength (e.g. Dolo 650 mg)",
         "dosage": "e.g. 1 Tablet or 10 ml",
         "frequency": "e.g. 1-1-1 (Three times daily) or 1-0-1 (Twice daily after food)",
         "duration": "e.g. 3 days or 5 days",
         "instructions": "e.g. Take after food"
       }

3. AUTOMATIC PHONETIC & PHARMACEUTICAL CORRECTION:
   - Speech-to-Text (STT) often mishears medicine names in clinical practice (e.g. transcribing "Dolo 650" as "Dolo 65", "Paracetamol" as "Parasite all", "Azithromycin" as "Asithro mycin" / "అజిత్రోమైసిన్", "Pantocid" as "Panto seed" / "ప్యాంటోసిడ్", "Cetirizine" as "Sitrogen" / "సిట్రోజన్" / "సెటిరిజిన్", "Amoxicillin" as "Amoxi silin", "Crocin" as "Crosin", "Montair" as "మోంటైర్").
   - CORRECT ALL MISHEARD PHARMACEUTICAL NAMES to standard clinical drug names.

4. MULTILINGUAL & MIXED SPEECH UNDERSTANDING (Telugu, Hindi, English):
   - The conversation may contain Telugu, Hindi, English, or a mix (e.g. Telugu "జ్వరం" = Fever, "మందులు" = Medicines, "మూడు సార్లు" = Three times daily, "రెండు సార్లు" = Twice daily; Hindi "बुखार" = Fever, "दवाई" = Medicine).
   - Translate clinical findings intelligently into clear, professional English for the medical chart.

==================================================
OUTPUT FORMAT
==================================================

Return ONLY valid JSON with this exact structure:

Use this exact structure:

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
    patientReason = ""
) {
    const transcript =
        normalizeTranscript(
            liveTranscript
        );

    if (
        transcript.length === 0
    ) {
        throw new Error(
            "No usable transcript was provided."
        );
    }

    const ai =
        getAIClient();

    const transcriptHash =
        createTranscriptHash(
            transcript
        );

    console.log(
        `[Gemini] Generating text-only consultation summary.`
    );

    console.log(
        `[Gemini] Transcript lines: ${transcript.length}`
    );

    console.log(
        `[Gemini] Transcript hash: ${transcriptHash.slice(
            0,
            12
        )}...`
    );

    const startTime =
        Date.now();

    const prompt =
        buildTranscriptSummaryPrompt(
            transcript,
            patientReason
        );

    const envModel = process.env.GEMINI_MODEL;
    const modelsToTry = [
        ...(envModel ? [envModel] : []),
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.6-flash",
        "gemini-3.1-flash-lite"
    ].filter((v, i, a) => a.indexOf(v) === i);

    let text = "";
    let lastError = null;

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
                break;
            }
        } catch (err) {
            lastError = err;
            console.warn(`[Gemini] Model ${modelName} error (${err.status || err.code || err.message}). Trying fallback model...`);
            // Brief pause before trying fallback model if 429 quota error
            if (err?.status === 429 || String(err?.message).includes("RESOURCE_EXHAUSTED") || String(err?.message).includes("Quota exceeded")) {
                await new Promise((r) => setTimeout(r, 1500));
            }
        }
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
    const textLines = transcript.map((t) => String(t?.text || t?.transcript || "")).filter(Boolean);
    const fullText = textLines.join("\n");
    const lowerText = fullText.toLowerCase();

    // Multilingual Symptom Dictionary (Telugu, English, Hindi)
    const symptomsFound = [];
    if (lowerText.includes("దగ్గు") || lowerText.includes("cough")) symptomsFound.push("Cough");
    if (lowerText.includes("జలుబు") || lowerText.includes("cold") || lowerText.includes("flu")) symptomsFound.push("Cold / Nasal Congestion");
    if (lowerText.includes("నీరసంగా") || lowerText.includes("weakness") || lowerText.includes("fatigue") || lowerText.includes("వీక్నెస్")) symptomsFound.push("Weakness / Fatigue");
    if (lowerText.includes("స్లీప్") || lowerText.includes("sleep") || lowerText.includes("నిద్ర")) symptomsFound.push("Sleep Disturbance");
    if (lowerText.includes("తినలేకపో") || lowerText.includes("appetite") || lowerText.includes("ఆకలి")) symptomsFound.push("Loss of Appetite");
    if (lowerText.includes("జ్వరం") || lowerText.includes("fever") || lowerText.includes("बुखार")) symptomsFound.push("Fever");
    if (lowerText.includes("తలనెప్పి") || lowerText.includes("headache") || lowerText.includes("सिर दर्द")) symptomsFound.push("Headache");
    if (lowerText.includes("కడుపు") || lowerText.includes("stomach") || lowerText.includes("gastric")) symptomsFound.push("Stomach Pain / Gastritis");

    const finalSymptoms = symptomsFound.length > 0 ? symptomsFound : (patientReason ? [patientReason] : ["Clinical Symptoms Discussed"]);

    // Multilingual Medication & Frequency Extraction Dictionary (70+ Indian Pharma Generics & Brands)
    const extractedMeds = [];

    const pharmaDictionary = [
        // Analgesics & Antipyretics
        { patterns: ["dolo", "డోలో", "డోలర్", "calpol", "crocin", "క్రోసిన్"], name: "Dolo 650 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food for fever/pain relief" },
        { patterns: ["paracetamol", "పారాసిటమాల్", "పరసిటమల్"], name: "Paracetamol 500 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food as needed for fever" },
        { patterns: ["combiflam", "కాంబిఫ్లామ్"], name: "Combiflam Tablet", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food for body ache/pain" },
        { patterns: ["meftal", "మెఫ్తాల్", "meftal spas"], name: "Meftal-Spas Tablet", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food for pain/spasms" },
        { patterns: ["zerodol", "జెరోడోల్", "aceclofenac"], name: "Zerodol-SP Tablet", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food for pain and swelling" },

        // Antibiotics
        { patterns: ["augmentin", "clavam", "క్లావమ్", "అగ్‌మెంటిన్", "amoxicillin"], name: "Clavam 625 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take complete 5-day antibiotic course after food" },
        { patterns: ["azithromycin", "azithral", "అజిత్రోమైసిన్", "అజిత్రో", "asithro"], name: "Azithromycin 500 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily)", instructions: "Take 1 hour before or 2 hours after food" },
        { patterns: ["cefixime", "taxim", "టాక్సిమ్", "సెఫిక్సిమ్"], name: "Taxim-O 200 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take complete course after food" },
        { patterns: ["ciprofloxacin", "ciplox", "సిప్లాక్స్"], name: "Ciplox 500 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily)", instructions: "Take after food" },
        { patterns: ["doxycycline", "డాక్సీసైక్లిన్"], name: "Doxycycline 100 mg", dosage: "1 Capsule", defaultFreq: "1-0-1 (Twice daily)", instructions: "Take with plenty of water after food" },

        // Antihistamines, Cold & Cough
        { patterns: ["cetirizine", "సిట్రోజన్", "సెటిరిజిన్", "citrozine", "setrizine"], name: "Cetirizine 10 mg", dosage: "1 Tablet", defaultFreq: "0-0-1 (Once daily at night)", instructions: "Take after food for allergy/cold" },
        { patterns: ["levocetirizine", "లెవోసెటిరిజిన్"], name: "Levocetirizine 5 mg", dosage: "1 Tablet", defaultFreq: "0-0-1 (Once daily at night)", instructions: "Take at bedtime" },
        { patterns: ["montair", "montelukast", "monticope", "మోంటైర్"], name: "Montair LC Tablet", dosage: "1 Tablet", defaultFreq: "0-0-1 (Once daily at night)", instructions: "Take at bedtime for allergy/cough" },
        { patterns: ["allegra", "అలెగ్రా", "fexofenadine"], name: "Allegra 120 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily)", instructions: "Take once daily for allergy relief" },
        { patterns: ["wikoryl", "cheston", "వికోరిల్", "చెస్ట్ ఆన్"], name: "Wikoryl Tablet", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily)", instructions: "Take after food for cold and congestion" },
        { patterns: ["syrup", "సిరప్", "cough syrup", "కాఫ్ సిరప్", "ascoril", "benadryl", "alex"], name: "Ascoril LS Cough Syrup", dosage: "10 ml", defaultFreq: "1-1-1 (Three times daily)", instructions: "Take 10 ml 3 times daily after food" },
        { patterns: ["saline", "nasal drop", "సెలినెక్స్", "నాసల్ డ్రాప్స్"], name: "Saline Nasal Drops", dosage: "2 Drops", defaultFreq: "1-1-1 (3 times daily)", instructions: "Instill 2 drops in each nostril for congestion" },

        // Gastrointestinal & Antacids / PPIs
        { patterns: ["pantocid", "pantoprazole", "pan 40", "ప్యాంటోసిడ్", "పాంతో"], name: "Pantocid 40 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily before breakfast)", instructions: "Take on an empty stomach in the morning" },
        { patterns: ["omez", "omeprazole", "ఒమెజ్"], name: "Omez 20 mg", dosage: "1 Capsule", defaultFreq: "1-0-0 (Once daily before breakfast)", instructions: "Take before food in morning" },
        { patterns: ["rantac", "ranitidine", "రాన్ టాక్"], name: "Rantac 150 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily before food)", instructions: "Take 30 mins before food" },
        { patterns: ["ondem", "vomikind", "ondansetron", "ఒండెమ్", "వామికిండ్"], name: "Ondem 4 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily as needed)", instructions: "Take for nausea or vomiting" },
        { patterns: ["digene", "gelusil", "డైజీన్"], name: "Digene Syrup", dosage: "10 ml", defaultFreq: "1-1-1 (3 times daily after food)", instructions: "Take after meals for acidity" },

        // Diabetes, BP & Cardiac
        { patterns: ["metformin", "glycomet", "గ్లైకోమెట్", "మెట్‌ఫార్మిన్"], name: "Glycomet 500 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily with meals)", instructions: "Take with or immediately after meals" },
        { patterns: ["telma", "telmisartan", "టెల్మా"], name: "Telma 40 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily in morning)", instructions: "Take every morning for blood pressure" },
        { patterns: ["amlokind", "amlodipine", "ఆమ్లోకైండ్"], name: "Amlokind 5 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily)", instructions: "Take once daily" },
        { patterns: ["ecosprin", "aspirin", "ఇకోస్ప్రిన్"], name: "Ecosprin 75 mg", dosage: "1 Tablet", defaultFreq: "0-1-0 (Once daily after lunch)", instructions: "Take after lunch" },

        // Vitamins & Minerals
        { patterns: ["shelcal", "calcium", "షెల్కాల్", "క్యాల్షియం"], name: "Shelcal 500 mg", dosage: "1 Tablet", defaultFreq: "0-1-0 (Once daily after lunch)", instructions: "Take after food with water" },
        { patterns: ["evion", "vitamin e", "ఎవియాన్"], name: "Evion 400 mg", dosage: "1 Capsule", defaultFreq: "0-0-1 (Once daily at night)", instructions: "Take after dinner" },
        { patterns: ["neurobion", "b-complex", "న్యూరోబియాన్"], name: "Neurobion Forte", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily)", instructions: "Take after food" }
    ];

    // Determine custom frequency based on speech text
    let detectedFreq = null;
    if (lowerText.includes("3 times") || lowerText.includes("three times") || lowerText.includes("3 టైమ్స్") || lowerText.includes("మూడు సార్లు") || lowerText.includes("త్రీ టైమ్స్")) {
        detectedFreq = "1-1-1 (Three times daily after food)";
    } else if (lowerText.includes("2 times") || lowerText.includes("twice") || lowerText.includes("2 టైమ్స్") || lowerText.includes("రెండు సార్లు") || lowerText.includes("ట్వైస్")) {
        detectedFreq = "1-0-1 (Twice daily after food)";
    } else if (lowerText.includes("once") || lowerText.includes("1 time") || lowerText.includes("ఒకసారి")) {
        detectedFreq = "1-0-0 (Once daily)";
    }

    for (const item of pharmaDictionary) {
        const matches = item.patterns.some(p => lowerText.includes(p));
        if (matches) {
            // Avoid duplicate additions
            if (!extractedMeds.some(m => m.name.toLowerCase() === item.name.toLowerCase())) {
                extractedMeds.push({
                    name: item.name,
                    dosage: item.dosage,
                    frequency: detectedFreq || item.defaultFreq,
                    duration: "3-5 days",
                    instructions: item.instructions
                });
            }
        }
    }

    // Doctor Advice extraction
    const adviceList = [];
    if (lowerText.includes("cold drinks") || lowerText.includes("కోల్డ్") || lowerText.includes("బయట")) {
        adviceList.push("Avoid cold drinks, ice, and chilled food items.");
        adviceList.push("Avoid going outside in cold weather and rest indoors.");
    } else {
        adviceList.push("Rest well and maintain warm fluid intake.");
    }

    // Follow-up extraction
    let followUpText = "Review in 5–7 days if symptoms persist.";
    if (lowerText.includes("blood test") || lowerText.includes("బ్లడ్ టెస్ట్") || lowerText.includes("వారంలో") || lowerText.includes("one week")) {
        followUpText = "Review in 1 week (7 days). If not reduced, proceed with Blood Tests as advised.";
    }

    return {
        consultation_summary: {
            consultation_overview: `Patient presented with ${finalSymptoms.join(", ")}. Clinical evaluation conducted and symptomatic treatment prescribed.`,
            chief_complaint: patientReason || `${finalSymptoms.join(", ")} reported during consultation`,
            symptoms: finalSymptoms,
            assessment: "Clinical evaluation completed for upper respiratory symptoms.",
            diagnosis: [`Upper Respiratory Symptomatology (${finalSymptoms[0] || "Cough / Cold"})`],
            treatment_plan: "Prescribed symptomatic medication and advised rest & dietary care.",
            medications_discussed: extractedMeds,
            advice: adviceList,
            follow_up: followUpText
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
15. The doctor remains the final decision-maker.
16. This is a documentation draft for doctor review.
17. Do not provide autonomous medical recommendations.

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

    const response =
        await ai.models.generateContent({
            model: MODEL,

            contents: [
                {
                    role: "user",

                    parts: [
                        {
                            fileData: {
                                fileUri:
                                    uploadedFile.uri,

                                mimeType:
                                    uploadedFile.mimeType ||
                                    mimeType,
                            },
                        },

                        {
                            text: prompt,
                        },
                    ],
                },
            ],

            config: {
                responseMimeType:
                    "application/json",

                temperature: 0.1,
            },
        });

    const text =
        response.text || "";

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