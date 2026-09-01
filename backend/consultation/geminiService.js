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
    "gemini-3.6-flash";

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
            typeof safeResult.consultation_summary === "object"
            ? safeResult.consultation_summary
            : {};

    const emptySummary =
        createEmptySummary();

    return {
        detected_language:
            safeResult.detected_language ||
            "Auto-detected",

        transcript:
            Array.isArray(
                safeResult.transcript
            )
                ? safeResult.transcript
                : [],

        consultation_summary: {
            consultation_overview:
                summary.consultation_overview ||
                "",

            chief_complaint:
                summary.chief_complaint ||
                "",

            symptoms:
                Array.isArray(
                    summary.symptoms
                )
                    ? summary.symptoms
                    : [],

            history_of_present_illness:
                summary.history_of_present_illness ||
                "",

            past_medical_history:
                Array.isArray(
                    summary.past_medical_history
                )
                    ? summary.past_medical_history
                    : [],

            allergies:
                Array.isArray(
                    summary.allergies
                )
                    ? summary.allergies
                    : [],

            current_medications:
                Array.isArray(
                    summary.current_medications
                )
                    ? summary.current_medications
                    : [],

            examination_findings:
                Array.isArray(
                    summary.examination_findings
                )
                    ? summary.examination_findings
                    : [],

            vital_signs: {
                blood_pressure:
                    summary.vital_signs?.blood_pressure ||
                    "",

                heart_rate:
                    summary.vital_signs?.heart_rate ||
                    "",

                temperature:
                    summary.vital_signs?.temperature ||
                    "",

                respiratory_rate:
                    summary.vital_signs?.respiratory_rate ||
                    "",

                oxygen_saturation:
                    summary.vital_signs?.oxygen_saturation ||
                    "",

                weight:
                    summary.vital_signs?.weight ||
                    "",
            },

            investigations:
                Array.isArray(
                    summary.investigations
                )
                    ? summary.investigations
                    : [],

            assessment:
                summary.assessment ||
                "",

            diagnosis:
                Array.isArray(
                    summary.diagnosis
                )
                    ? summary.diagnosis
                    : [],

            differential_diagnosis:
                Array.isArray(
                    summary.differential_diagnosis
                )
                    ? summary.differential_diagnosis
                    : [],

            treatment_plan:
                summary.treatment_plan ||
                "",

            medications_discussed:
                Array.isArray(
                    summary.medications_discussed
                )
                    ? summary.medications_discussed
                    : emptySummary
                        .medications_discussed,

            advice:
                Array.isArray(
                    summary.advice
                )
                    ? summary.advice
                    : [],

            follow_up:
                summary.follow_up ||
                "",

            doctor_notes:
                summary.doctor_notes ||
                "",

            red_flags:
                Array.isArray(
                    summary.red_flags
                )
                    ? summary.red_flags
                    : [],
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
PRE-FILLED PATIENT SYMPTOMS / REASON FOR VISIT
==================================================

The patient provided the following symptoms/reason for visit before the consultation:
"${patientReason}"

Please ensure you incorporate these pre-filled complaints into the final summary, merging them intelligently with the live transcript below.
` : "";

    return `
You are the AI clinical documentation assistant for Doctors Vedika.

Your task is to create a STRUCTURED MEDICAL CONSULTATION SUMMARY from an already-transcribed doctor-patient conversation.

IMPORTANT ARCHITECTURE RULE:

The speech has ALREADY been transcribed.
Do NOT perform speech recognition.
Do NOT reconstruct missing audio.
Do NOT invent dialogue.
Do NOT invent medical information.

The transcript is the only source of truth.

==================================================
MEDICAL ACCURACY RULES
==================================================

1. Use ONLY information explicitly present in the transcript.

2. Never invent:
   - diagnosis
   - symptoms
   - medicine
   - dosage
   - frequency
   - duration
   - allergy
   - medical history
   - examination finding
   - vital sign
   - investigation
   - treatment
   - follow-up instruction

3. If information is not present, return:
   - empty string ""
   - or empty array []

4. If the doctor says a medicine name but does not provide
   dosage/frequency/duration, leave those fields empty.

5. If the doctor does not explicitly diagnose the patient,
   do not create a diagnosis from symptoms.

6. Do not turn a differential possibility into a confirmed diagnosis.

7. Preserve the distinction between what the patient reported
   and what the doctor assessed.

8. PHONETIC CORRECTION: The STT may mishear medicine names (e.g., transcribing "Aspirin" as "Rajilin", or "Paracetamol" as "Parasite all"). If you see a phonetically similar or out-of-context word where a medicine was clearly prescribed, CORRECT IT to the proper pharmacological name in the summary.

9. This is clinical documentation assistance, not autonomous
   medical decision-making.

10. The doctor remains the final decision-maker.

==================================================
LANGUAGE RULES
==================================================

The conversation may contain:

- English
- Telugu
- Hindi
- Telugu + English
- Hindi + English
- Telugu + Hindi + English

HALLUCINATION FILTERING:
The Speech-to-Text engine may occasionally hallucinate out-of-context words from unsupported languages (like Kannada or Tamil). 
If you see stray Kannada words or completely nonsensical text that does not fit the medical context, IGNORE THEM COMPLETELY. Do not include them in the summary.

Do not translate the transcript.

Keep the transcript exactly as received (minus obvious hallucinations).

The structured summary may be written in clear English
for the doctor's medical record.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

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

    /*
     * SINGLE TEXT REQUEST
     *
     * This is the major optimization.
     *
     * Gemini no longer receives the complete audio.
     */
    const response =
        await ai.models.generateContent({
            model: MODEL,

            contents: [
                {
                    role: "user",

                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],

            config: {
                responseMimeType:
                    "application/json",

                /*
                 * Keep the model deterministic for
                 * medical documentation.
                 */
                temperature: 0.1,
            },
        });

    const text =
        response.text || "";

    console.log(
        `[Gemini] Text-only summary completed in ${Date.now() - startTime
        }ms.`
    );

    const parsed =
        parseGeminiJson(
            text
        );

    const normalized =
        normalizeSummaryResponse(
            parsed
        );

    /*
     * Gemini may not need to return the transcript.
     *
     * We explicitly preserve our authoritative transcript
     * rather than trusting Gemini to reproduce it.
     */
    normalized.transcript =
        transcript;

    return normalized;
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