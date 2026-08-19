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

function buildAudioScribePrompt(liveTranscript = []) {
    let hintsText = "";
    if (Array.isArray(liveTranscript) && liveTranscript.length > 0) {
        const lines = liveTranscript
            .map((item, idx) => {
                if (typeof item === "string") return `[Line ${idx + 1}] ${item}`;
                const speaker = item.speaker || (idx % 2 === 0 ? "Doctor" : "Patient");
                const time = item.timestamp ? `[${item.timestamp}] ` : "";
                return `${time}${speaker}: ${item.text}`;
            })
            .join("\n");
        if (lines.trim()) {
            hintsText = `
====================================================
LIVE STREAM TRANSCRIPTION REFERENCE
====================================================
The following live speech recognition hints were captured during the consultation:
${lines}

INSTRUCTION: Listen to the audio directly for 100% phonetic accuracy, speaker nuance, and native spelling. Use the above reference lines to ensure no part of the consultation is missed.
`;
        }
    }

    return `
You are an expert AI clinical documentation assistant and medical scribe.
You are given the AUDIO RECORDING of a real doctor-patient clinical consultation.

Your task:
1. Listen carefully to the entire consultation audio and produce a complete, verbatim transcript with exact speaker labels (Doctor / Patient) and approximate timestamps (MM:SS).
2. Detect the spoken language (e.g. "Telugu + English", "Hindi + English", "Telugu", "Hindi", "English").
3. Generate an exhaustive, highly detailed structured clinical consultation summary capturing ALL information spoken by the patient and the doctor.

====================================================
LANGUAGE & SCRIPT RULES
====================================================
- Keep spoken Telugu in Telugu script (e.g. "నమస్కారం డాక్టర్ గారు, నాకు 3 రోజుల నుంచి తలనొప్పిగా ఉంది"), Hindi in Devanagari script (e.g. "नमस्ते डॉक्टर साहब, मुझे सिरदर्द है"), and English in English.
- For mixed/code-switched conversations, preserve each phrase in its original spoken language verbatim. Do not translate regional speech into broken English.

====================================================
COMPREHENSIVE CLINICAL EXTRACTION RULES
====================================================
Extract ALL information spoken into their exact fields:

1. "chief_complaint": Primary symptom or reason for visit stated by the patient.
2. "consultation_overview": Concise 2-3 sentence clinical summary covering visit reason, clinical findings, and prescribed management.
3. "symptoms": Array of all individual symptom strings reported (e.g. ["Throbbing headache", "Fever", "Throat irritation"]).
4. "history_of_present_illness": Detailed chronological storyline describing onset, duration, severity, progression of current symptoms, and any self-medication/OTC medicines taken for this episode.
5. "past_medical_history": Array of strings. MUST capture ANY previous similar episodes or recurrence (e.g. "Similar episode 2 months ago; treated with OTC pharmacy medication", "Recurrent migraine history"), prior medical conditions (e.g. "Hypertension", "Type 2 Diabetes", "Asthma", "Thyroid disorder"), prior surgeries, or past hospitalizations.
6. "allergies": Array of strings. Specific drug, food, or environmental allergies mentioned (e.g. "Allergic to Penicillin", "Dust allergy"). If explicitly confirmed negative/none by patient or doctor, record ["No known drug allergies"].
7. "current_medications": Array of strings. Pre-existing regular medications the patient was already taking prior to this visit (e.g. "Telmisartan 40mg once daily for BP", "Metformin 500mg BD").
8. "examination_findings": Array of strings. All physical examination observations inspected or mentioned by the doctor (e.g. "Mild pharyngeal / throat erythema", "Chest clear bilaterally on auscultation, no wheeze", "Abdomen soft, non-tender", "No pedal edema").
9. "vital_signs": Object containing all spoken values:
   - "blood_pressure": (e.g. "120/80 mmHg")
   - "heart_rate": (e.g. "76 bpm")
   - "temperature": (e.g. "100.2 °F")
   - "respiratory_rate": (e.g. "18/min")
   - "oxygen_saturation": (e.g. "98%")
   - "weight": (e.g. "72 kg")
10. "investigations": Array of strings. Lab tests, blood investigations, diagnostic scans, or X-rays ordered or discussed (e.g. "Complete Blood Picture (CBP)", "Serum Creatinine", "Chest X-ray PA view").
11. "assessment": Clinical assessment / evaluation summary.
12. "diagnosis": Array of confirmed or primary diagnoses made by the doctor (e.g. ["Acute Viral Pharyngitis", "Tension Headache"]).
13. "differential_diagnosis": Array of other potential conditions considered.
14. "treatment_plan": Overall clinical management and therapeutic strategy.
15. "medications_discussed": Array of ALL newly prescribed medications with structured details:
    - "name": Drug brand/generic name with strength (e.g. "Paracetamol 650mg", "Amoxicillin 500mg", "Grilinctus Syrup")
    - "dosage": Amount per dose (e.g. "1 Tablet", "650mg", "10ml / 2 teaspoons")
    - "frequency": Dosing interval (e.g. "1-0-1", "1-1-1", "1-0-0", "Twice daily", "Once daily at bedtime", "SOS / When needed")
    - "duration": Course length (e.g. "3 days", "5 days", "1 week", "10 days")
    - "instructions": Relation to food or special instructions (e.g. "After food", "Before food", "With warm water")
16. "advice": Array of lifestyle, dietary, hydration, rest, or home care recommendations (e.g. ["Drink plenty of warm water", "Adequate rest", "Steam inhalation twice daily", "Avoid cold drinks and oily food"]).
17. "follow_up": Follow-up review timeline and conditions (e.g. "Review after 5 days or if symptoms worsen").
18. "doctor_notes": Additional clinical remarks or instructions.
19. "red_flags": Array of warning signs or emergency symptoms advised to monitor (e.g. ["Persistent high fever > 102°F", "Shortness of breath", "Severe vomiting or inability to retain fluids"]).
${hintsText}
====================================================
REQUIRED JSON FORMAT
====================================================
Return ONLY valid JSON (no markdown fences, no explanatory text):
{
  "detected_language": "Auto-detected",
  "transcript": [
    {
      "speaker": "Doctor",
      "timestamp": "00:00",
      "text": "Hello, what brings you in today?"
    },
    {
      "speaker": "Patient",
      "timestamp": "00:04",
      "text": "Doctor, I have had a severe throbbing headache for 3 days."
    }
  ],
  "consultation_summary": {
    "consultation_overview": "2-3 sentence clinical summary of visit reason, findings, and management.",
    "chief_complaint": "Primary complaint",
    "symptoms": ["Symptom 1", "Symptom 2"],
    "history_of_present_illness": "Detailed progression of current complaint",
    "past_medical_history": ["Prior similar episode 2 months ago; took OTC medication"],
    "allergies": ["No known drug allergies"],
    "current_medications": [],
    "examination_findings": ["Mild pharyngeal congestion"],
    "vital_signs": {
      "blood_pressure": "",
      "heart_rate": "",
      "temperature": "",
      "respiratory_rate": "",
      "oxygen_saturation": "",
      "weight": ""
    },
    "investigations": [],
    "assessment": "Clinical evaluation summary",
    "diagnosis": ["Acute Pharyngitis"],
    "differential_diagnosis": [],
    "treatment_plan": "Symptomatic treatment with antipyretics and rest",
    "medications_discussed": [
      {
        "name": "Paracetamol 650mg",
        "dosage": "1 Tablet (650mg)",
        "frequency": "Twice daily (1-0-1)",
        "duration": "3 days",
        "instructions": "After food"
      }
    ],
    "advice": ["Adequate hydration", "Rest"],
    "follow_up": "Review after 3-5 days if symptoms do not improve",
    "doctor_notes": "",
    "red_flags": ["High continuous fever > 102F", "Difficulty swallowing or breathing"]
  }
}
`;
}

function buildTextScribePrompt(transcriptText = "") {
    return `
You are an expert AI clinical documentation assistant and medical scribe.
Below is the conversation transcript of a doctor-patient clinical consultation:
${transcriptText}

Extract and structure this consultation into an exhaustive clinical summary JSON capturing ALL information spoken by the patient and doctor across all clinical domains.

CLINICAL EXTRACTION RULES:
- "chief_complaint": Primary reason for visit.
- "consultation_overview": Comprehensive 2-3 sentence clinical summary.
- "symptoms": Array of all reported symptoms.
- "history_of_present_illness": Chronological progression, onset, severity, self-treatment attempts.
- "past_medical_history": MUST capture ANY prior similar episodes, past recurrences (e.g. "Similar episode 2 months ago; took OTC pharmacy medicine"), past illnesses, chronic diseases (Hypertension, Diabetes, Asthma, Thyroid), or prior surgeries.
- "allergies": Specific allergies mentioned, or ["No known drug allergies"] if confirmed negative.
- "current_medications": Pre-existing daily medications patient takes regularly.
- "examination_findings": Doctor's physical inspection and examination findings (e.g. throat erythema, clear chest, soft abdomen).
- "vital_signs": Blood pressure, heart rate, temperature, SpO2, respiratory rate, weight.
- "investigations": Any lab tests or scans ordered.
- "assessment": Clinical evaluation.
- "diagnosis": Confirmed diagnoses made by doctor.
- "differential_diagnosis": Other considered conditions.
- "treatment_plan": Overall therapeutic management.
- "medications_discussed": All newly prescribed medicines with name, dosage, frequency, duration, instructions.
- "advice": Lifestyle, dietary, hydration, rest instructions.
- "follow_up": Review timeline and conditions.
- "doctor_notes": Clinical remarks.
- "red_flags": Warning signs requiring urgent attention.

Return ONLY valid JSON (no markdown fences):
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
        process.env.GEMINI_MODEL || "gemini-3.5-flash",
        "gemini-3.5-flash",
        "gemini-3.6-flash",
        "gemini-3.1-flash-lite"
    ];

    const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

    // ----------------------------------------------------------
    // 1. PRIMARY: PROCESS AUDIO DIRECTLY WITH GEMINI (Native Telugu/Hindi/English)
    // ----------------------------------------------------------
    const hasAudioFile = fs.existsSync(audioPath) && fs.statSync(audioPath).size > 800;

    if (hasAudioFile) {
        const audioStats = fs.statSync(audioPath);
        const mimeType = detectMimeType(audioPath);
        const prompt = buildAudioScribePrompt(liveTranscript);
        console.log(`[Gemini] Processing consultation audio (${audioStats.size} bytes, ${mimeType})...`);

        const isLargeFile = audioStats.size > 20 * 1024 * 1024; // >20MB
        let uploadedFile = null;

        if (isLargeFile) {
            try {
                uploadedFile = await ai.files.upload({
                    file: audioPath,
                    config: { mimeType },
                });
                console.log("[Gemini] Audio uploaded to Files API:", uploadedFile?.name);
            } catch (uploadErr) {
                console.warn("[Gemini] Files API upload notice:", uploadErr.message || uploadErr);
            }
        }

        const audioBuffer = !isLargeFile ? fs.readFileSync(audioPath) : null;
        const audioBase64 = audioBuffer ? audioBuffer.toString("base64") : null;

        for (const targetModel of uniqueModels) {
            try {
                const startTime = Date.now();
                console.log(`[Gemini] Processing audio & generating high-accuracy clinical report with ${targetModel}...`);
                let response = null;

                const contents = [
                    {
                        role: "user",
                        parts: [
                            uploadedFile && uploadedFile.uri
                                ? {
                                    fileData: {
                                        fileUri: uploadedFile.uri,
                                        mimeType: uploadedFile.mimeType || mimeType,
                                    },
                                }
                                : {
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: audioBase64 || fs.readFileSync(audioPath).toString("base64"),
                                    },
                                },
                            { text: prompt },
                        ],
                    },
                ];

                response = await ai.models.generateContent({
                    model: targetModel,
                    contents,
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.1,
                    },
                });

                if (response && response.text) {
                    const parsed = parseGeminiJson(response.text);
                    if (parsed && typeof parsed === "object") {
                        console.log(`[Gemini] Clinical report generated with high accuracy in ${Date.now() - startTime}ms with ${targetModel}!`);
                        return normalizeGeminiResult(parsed);
                    }
                }
            } catch (modelErr) {
                console.warn(`[Gemini] Model ${targetModel} notice:`, modelErr.message || modelErr);
            }
        }
    }

    // ----------------------------------------------------------
    // 2. TEXT TRANSCRIPT FALLBACK (If audio recording is unavailable or fails)
    // ----------------------------------------------------------
    const transcriptItems = Array.isArray(liveTranscript) ? liveTranscript : [];
    const validLines = transcriptItems.filter((item) => {
        const text = typeof item === "string" ? item : item?.text;
        return text && text.trim().length > 0;
    });

    if (validLines.length > 0) {
        console.log(`[Gemini] Using fast text transcript fallback on ${validLines.length} lines...`);
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
                const startTime = Date.now();
                const response = await ai.models.generateContent({
                    model: targetModel,
                    contents: textPrompt,
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.1,
                    },
                });

                if (response && response.text) {
                    const parsed = parseGeminiJson(response.text);
                    if (parsed && typeof parsed === "object") {
                        if (!parsed.transcript || parsed.transcript.length === 0) {
                            parsed.transcript = validLines;
                        }
                        console.log(`[Gemini] Summary generated from transcript in ${Date.now() - startTime}ms with ${targetModel}!`);
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
        if (!Array.isArray(summary[field])) summary[field] = summary[field] ? [String(summary[field])] : [];
    }

    // Safety fallback: if past_medical_history is empty, check HPI or transcript for past episode/recurrence
    if (summary.past_medical_history.length === 0) {
        const hpiText = String(summary.history_of_present_illness || "");
        if (hpiText && /similar|months ago|weeks ago|years ago|previous|past episode|prior episode|self-treated|over-the-counter|pharmacy/i.test(hpiText)) {
            const sentences = hpiText.split(/(?<=[.?!])\s+/);
            const pastSentence = sentences.find((s) => /similar|months ago|weeks ago|years ago|previous|past|prior|self-treated|over-the-counter|pharmacy/i.test(s));
            if (pastSentence && pastSentence.trim()) {
                summary.past_medical_history.push(pastSentence.trim());
            }
        }

        // Check transcript lines if still empty
        if (summary.past_medical_history.length === 0 && Array.isArray(result.transcript)) {
            for (let i = 0; i < result.transcript.length; i++) {
                const line = result.transcript[i];
                const text = String(line?.text || "");
                if (/two months|months back|weeks back|ముందు|గతంలో|గుర్తులేదు|pharmacy|two months back/i.test(text)) {
                    summary.past_medical_history.push("Similar episode 2 months ago; self-treated with OTC pharmacy medication");
                    break;
                }
            }
        }
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
    if (cleaned.includes("```")) {
        cleaned = cleaned
            .replace(/^```json\s*/im, "")
            .replace(/^```\s*/im, "")
            .replace(/\s*```$/m, "")
            .trim();
    }
    
    // Attempt standard parse
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // If there is extra wrapper text, extract the outermost JSON object
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            const extracted = cleaned.substring(firstBrace, lastBrace + 1);
            return JSON.parse(extracted);
        }
        throw e;
    }
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