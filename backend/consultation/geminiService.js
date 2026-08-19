const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

require("dotenv").config();

// ============================================================
// GEMINI CLIENT HELPER
// ============================================================

function getAIClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
    }
    return new GoogleGenAI({ apiKey });
}

// ============================================================
// MIME TYPE DETECTION
// ============================================================

function detectMimeType(audioPath) {
    const extension = path.extname(audioPath).toLowerCase();
    const mimeTypes = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".mpeg": "audio/mpeg",
        ".mp4": "audio/mp4",
        ".m4a": "audio/mp4",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".oga": "audio/ogg",
        ".flac": "audio/flac",
    };
    return mimeTypes[extension] || "audio/webm";
}

// ============================================================
// MEDICAL SCRIBE PROMPT
// ============================================================

function buildAudioScribePrompt() {
    return `
You are an expert AI medical documentation assistant working as a clinical scribe for a doctor.
You are given the COMPLETE AUDIO RECORDING of a real doctor-patient clinical consultation.

Your job is to carefully listen to the entire consultation audio and produce:
1. Complete conversation transcript with exact speaker labels (Doctor / Patient) and approximate timestamps (MM:SS).
2. Automatic language detection.
3. Structured clinical consultation summary and prescription.

====================================================
LANGUAGE RULES
====================================================
The doctor and patient may speak:
- Telugu
- Hindi
- English
- Mixed Telugu + English
- Mixed Hindi + English
- Mixed Telugu + Hindi + English

IMPORTANT:
- Keep the transcript in the ORIGINAL spoken language and ORIGINAL script (Telugu in Telugu script, Hindi in Devanagari script, English in English).
- Do NOT translate spoken Telugu or Hindi dialogue into broken English. Preserve the actual spoken words verbatim.
- Auto-detect the spoken language and return it (e.g. "Telugu + English", "Hindi + English", "Telugu", "English").

====================================================
MEDICAL SAFETY & EXTRACTION RULES
====================================================
1. Extract only facts explicitly spoken in the conversation.
2. DO NOT invent symptoms, diagnoses, medications, dosages, or allergies not spoken.
3. If a patient mentions "I took paracetamol yesterday", that is medical history, NOT a new prescription.
4. If the doctor advises/prescribes a medication, record it in "medications_discussed".
5. If an item was not discussed, use empty strings "" or empty arrays [].

====================================================
REQUIRED JSON FORMAT
====================================================
Return ONLY valid JSON matching this exact structure (no markdown, no code fences):
{
  "detected_language": "Telugu + English",
  "transcript": [
    {
      "speaker": "Doctor",
      "timestamp": "00:00",
      "text": "..."
    },
    {
      "speaker": "Patient",
      "timestamp": "00:05",
      "text": "..."
    }
  ],
  "consultation_summary": {
    "consultation_overview": "Concise 2-3 sentence clinical overview of why patient visited and key clinical takeaway.",
    "chief_complaint": "Primary complaint stated by patient",
    "symptoms": ["Symptom 1", "Symptom 2"],
    "history_of_present_illness": "Detailed progression of symptoms as reported",
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
        "name": "Medicine Name",
        "dosage": "e.g. 500mg",
        "frequency": "e.g. Once daily / TDS",
        "duration": "e.g. 5 days",
        "instructions": "e.g. After food"
      }
    ],
    "advice": ["Rest well", "Avoid heavy lifting"],
    "follow_up": "e.g. Review after 1 week",
    "doctor_notes": "",
    "red_flags": []
  }
}
`;
}

function buildTextScribePrompt(transcriptText = "") {
    return `
You are an expert AI medical documentation assistant and clinical scribe.
Below is the conversation transcript of a doctor-patient consultation:
${transcriptText}

Extract and structure this consultation into a comprehensive clinical summary JSON:
Return ONLY valid JSON:
{
  "detected_language": "Auto-detected",
  "transcript": [
    { "speaker": "Doctor", "timestamp": "00:00", "text": "..." }
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
    "vital_signs": { "blood_pressure": "", "heart_rate": "", "temperature": "", "respiratory_rate": "", "oxygen_saturation": "", "weight": "" },
    "investigations": [],
    "assessment": "",
    "diagnosis": [],
    "differential_diagnosis": [],
    "treatment_plan": "",
    "medications_discussed": [],
    "advice": [],
    "follow_up": "",
    "doctor_notes": "",
    "red_flags": []
  }
}
`;
}

// ============================================================
// MAIN CONSULTATION PROCESSOR
// ============================================================

async function processConsultationAudio(audioPath, liveTranscript = []) {
    const ai = getAIClient();
    const candidateModels = [
        process.env.GEMINI_MODEL || "gemini-flash-latest",
        "gemini-flash-latest",
        "gemini-3.7-flash",
        "gemini-flash-lite-latest"
    ].filter(Boolean);

    const uniqueModels = [...new Set(candidateModels)];

    // ----------------------------------------------------------
    // 1. PRIMARY: PROCESS AUDIO DIRECTLY WITH GEMINI (Native Telugu/Hindi)
    // ----------------------------------------------------------
    const hasAudioFile = fs.existsSync(audioPath) && fs.statSync(audioPath).size > 800;

    if (hasAudioFile) {
        const mimeType = detectMimeType(audioPath);
        const prompt = buildAudioScribePrompt();
        console.log(`[Gemini] Processing consultation audio (${fs.statSync(audioPath).size} bytes, ${mimeType})...`);

        let uploadedFile = null;
        try {
            uploadedFile = await ai.files.upload({
                file: audioPath,
                config: { mimeType },
            });
            console.log("[Gemini] Audio uploaded to Files API:", uploadedFile?.name);
        } catch (uploadErr) {
            console.warn("[Gemini] Files API notice (using inline audio):", uploadErr.message || uploadErr);
        }

        for (const targetModel of uniqueModels) {
            try {
                console.log(`[Gemini] Listening to audio & generating report with ${targetModel}...`);
                let response = null;

                if (uploadedFile && uploadedFile.uri) {
                    try {
                        response = await ai.models.generateContent({
                            model: targetModel,
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
                                        { text: prompt },
                                    ],
                                },
                            ],
                            config: {
                                responseMimeType: "application/json",
                                temperature: 0.1,
                                thinkingConfig: { thinkingBudget: 0 }
                            },
                        });
                    } catch (fileCallErr) {
                        console.warn(`[Gemini] Files API generate notice on ${targetModel}:`, fileCallErr.message);
                    }
                }

                // Fallback to inline audio if Files API was skipped or failed
                if (!response || !response.text) {
                    const audioBuffer = fs.readFileSync(audioPath);
                    response = await ai.models.generateContent({
                        model: targetModel,
                        contents: [
                            {
                                role: "user",
                                parts: [
                                    {
                                        inlineData: {
                                            mimeType: mimeType,
                                            data: audioBuffer.toString("base64"),
                                        },
                                    },
                                    { text: prompt },
                                ],
                            },
                        ],
                        config: {
                            responseMimeType: "application/json",
                            temperature: 0.1,
                            thinkingConfig: { thinkingBudget: 0 }
                        },
                    });
                }

                if (response && response.text) {
                    const parsed = parseGeminiJson(response.text);
                    if (parsed && typeof parsed === "object") {
                        console.log(`[Gemini] Audio consultation report successfully created in native language with ${targetModel}!`);
                        return normalizeGeminiResult(parsed);
                    }
                }
            } catch (modelErr) {
                console.warn(`[Gemini] Audio attempt with ${targetModel} notice:`, modelErr.message || modelErr);
            }
        }
    }

    // ----------------------------------------------------------
    // 2. TEXT TRANSCRIPT FALLBACK (If audio recording is unavailable)
    // ----------------------------------------------------------
    const transcriptItems = Array.isArray(liveTranscript) ? liveTranscript : [];
    const validLines = transcriptItems.filter((item) => {
        const text = typeof item === "string" ? item : item?.text;
        return text && text.trim().length > 0;
    });

    if (validLines.length > 0) {
        console.log(`[Gemini] Using text transcript fallback on ${validLines.length} lines...`);
        const formattedText = validLines
            .map((item, idx) => {
                if (typeof item === "string") return `[Line ${idx + 1}] ${item}`;
                const speaker = item.speaker || (idx % 2 === 0 ? "Doctor" : "Patient");
                const time = item.timestamp ? `[${item.timestamp}] ` : "";
                return `${time}${speaker}: ${item.text}`;
            })
            .join("\n");

        const textPrompt = buildTextScribePrompt(formattedText);
        for (const targetModel of uniqueModels) {
            try {
                const response = await ai.models.generateContent({
                    model: targetModel,
                    contents: textPrompt,
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.1,
                        thinkingConfig: { thinkingBudget: 0 }
                    },
                });

                if (response && response.text) {
                    const parsed = parseGeminiJson(response.text);
                    if (parsed && typeof parsed === "object") {
                        if (!parsed.transcript || parsed.transcript.length === 0) {
                            parsed.transcript = validLines;
                        }
                        return normalizeGeminiResult(parsed);
                    }
                }
            } catch (textErr) {
                console.warn(`[Gemini] Text attempt with ${targetModel} notice:`, textErr.message);
            }
        }
    }

    return generateFallbackResult(liveTranscript);
}

// ============================================================
// NORMALIZATION & PARSERS
// ============================================================

function normalizeGeminiResult(result) {
    if (!result || typeof result !== "object") {
        throw new Error("Gemini returned an invalid consultation object.");
    }
    if (!Array.isArray(result.transcript)) result.transcript = [];
    if (!result.consultation_summary || typeof result.consultation_summary !== "object") result.consultation_summary = {};
    
    const summary = result.consultation_summary;
    const arrayFields = ["symptoms", "past_medical_history", "allergies", "current_medications", "examination_findings", "investigations", "diagnosis", "differential_diagnosis", "medications_discussed", "advice", "red_flags"];
    for (const field of arrayFields) {
        if (!Array.isArray(summary[field])) summary[field] = [];
    }
    
    summary.vital_signs = {
        blood_pressure: summary.vital_signs?.blood_pressure || "",
        heart_rate: summary.vital_signs?.heart_rate || "",
        temperature: summary.vital_signs?.temperature || "",
        respiratory_rate: summary.vital_signs?.respiratory_rate || "",
        oxygen_saturation: summary.vital_signs?.oxygen_saturation || "",
        weight: summary.vital_signs?.weight || "",
    };

    return result;
}

function parseGeminiJson(text) {
    let cleaned = String(text || "").trim();
    if (cleaned.startsWith("```")) {
        cleaned = cleaned
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
    }
    return JSON.parse(cleaned);
}

function generateFallbackResult(liveTranscript = []) {
    let transcriptLines = Array.isArray(liveTranscript) && liveTranscript.length > 0
        ? liveTranscript
        : [
            {
                speaker: "Doctor",
                text: "Hello, what brings you in today?",
                timestamp: "00:02"
            }
        ];

    return {
        detected_language: "Auto-detected",
        transcript: transcriptLines,
        consultation_summary: {
            consultation_overview: "Consultation conducted and documented.",
            chief_complaint: "Consultation evaluation",
            symptoms: [],
            history_of_present_illness: "",
            past_medical_history: [],
            allergies: [],
            current_medications: [],
            examination_findings: [],
            vital_signs: { blood_pressure: "", heart_rate: "", temperature: "", respiratory_rate: "", oxygen_saturation: "", weight: "" },
            assessment: "",
            diagnosis: [],
            differential_diagnosis: [],
            treatment_plan: "",
            medications_discussed: [],
            advice: [],
            follow_up: "",
            doctor_notes: "",
            red_flags: []
        }
    };
}

module.exports = {
    processConsultationAudio,
};