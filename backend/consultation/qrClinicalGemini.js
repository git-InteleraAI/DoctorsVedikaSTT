const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const { geminiRequestManager } = require("./GeminiRequestManager");

require("dotenv").config();

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const MAX_TEXT_LENGTH = 2000;

// Canonical IDs already used by the DoctorsVedika clinical dictionary.
// Gemini is explicitly restricted to these IDs; unknown/hallucinated symptom
// names are discarded before they can reach the deterministic safety engine.
const ALLOWED_SYMPTOMS = new Set([
    "chest_pain", "palpitations", "breathlessness", "high_bp", "dizziness", "swollen_ankles",
    "knee_pain", "back_pain", "neck_pain", "shoulder_pain", "muscle_cramps", "recent_injury",
    "skin_rash", "acne", "hair_fall", "itching", "dark_spots", "mole_check", "eczema",
    "toothache", "gums_bleeding", "sensitivity", "jaw_pain", "cavity", "broken_tooth", "wisdom_tooth", "bad_breath",
    "irregular_periods", "heavy_bleeding", "pelvic_pain", "discharge", "pregnancy_care", "pcod_pcos",
    "child_fever", "child_cough", "poor_feeding", "diaper_rash", "vomiting_diarrhea", "vaccination",
    "earache", "tinnitus", "sinus", "sore_throat", "tonsils", "migraine", "numbness", "memory_loss",
    "balance_loss", "seizures", "anxiety", "insomnia", "depression", "burnout", "mood_swings",
    "fever", "headache", "fatigue", "nausea", "body_ache", "cough", "stomach", "throat", "weakness", "vomiting",
]);

const ALLOWED_SEVERITIES = new Set(["mild", "moderate", "severe", "unsure"]);

function getAIClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
    }
    return new GoogleGenAI({ apiKey });
}

function cleanString(value, maxLength = 500) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text ? text.slice(0, maxLength) : null;
}

function normalizeExtraction(raw) {
    const value = raw && typeof raw === "object" ? raw : {};

    const symptoms = Array.isArray(value.symptoms)
        ? Array.from(new Set(
            value.symptoms
                .map((item) => String(item).trim().toLowerCase())
                .filter((item) => ALLOWED_SYMPTOMS.has(item))
        ))
        : [];

    const severityValue = cleanString(value.severity, 20)?.toLowerCase();
    const severity = ALLOWED_SEVERITIES.has(severityValue) ? severityValue : null;

    const clinicalDetails = {};
    if (value.clinical_details && typeof value.clinical_details === "object" && !Array.isArray(value.clinical_details)) {
        for (const [key, rawValue] of Object.entries(value.clinical_details)) {
            if (!/^[a-zA-Z0-9_]{1,80}$/.test(key)) continue;
            if (typeof rawValue === "boolean") {
                clinicalDetails[key] = rawValue;
            } else if (typeof rawValue === "string" && rawValue.trim()) {
                clinicalDetails[key] = rawValue.trim().slice(0, 300);
            }
        }
    }

    return {
        symptoms,
        location: cleanString(value.location, 200),
        duration: cleanString(value.duration, 120),
        severity,
        recent_actions: cleanString(value.recent_actions, 300),
        current_medications: cleanString(value.current_medications, 500),
        additional_notes: cleanString(value.additional_notes, 1000),
        clinical_details: clinicalDetails,
    };
}

function parseJsonResponse(text) {
    if (typeof text !== "string") return {};
    const trimmed = text.trim();

    try {
        return JSON.parse(trimmed);
    } catch (_) {
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenced) {
            try {
                return JSON.parse(fenced[1]);
            } catch (_) {
                return {};
            }
        }

        const first = trimmed.indexOf("{");
        const last = trimmed.lastIndexOf("}");
        if (first >= 0 && last > first) {
            try {
                return JSON.parse(trimmed.slice(first, last + 1));
            } catch (_) {
                return {};
            }
        }
    }

    return {};
}

function buildPrompt({ text, questionnaireKey, knownIntake }) {
    return `You are a controlled clinical-information extraction component inside the DoctorsVedika patient intake system.

Your ONLY task is to extract facts explicitly stated by the patient from the latest message. Do NOT diagnose, recommend treatment, invent symptoms, infer unstated severity, or convert a possibility into a confirmed symptom.

The deterministic clinical safety engine is authoritative. You must preserve negations and uncertainty by leaving fields empty when the patient did not clearly state them.

Questionnaire context: ${questionnaireKey || "general"}

Existing canonical intake (context only; do not repeat unstated values as new facts):
${JSON.stringify(knownIntake || {})}

Latest patient message:
${text.slice(0, MAX_TEXT_LENGTH)}

Return ONLY valid JSON with this exact shape:
{
  "symptoms": [],
  "location": null,
  "duration": null,
  "severity": null,
  "recent_actions": null,
  "current_medications": null,
  "additional_notes": null,
  "clinical_details": {}
}

Rules:
1. symptoms must contain only canonical IDs from this list:
${Array.from(ALLOWED_SYMPTOMS).join(", ")}
2. If the patient negates a symptom (for example, "no chest pain"), do not put that symptom in symptoms.
3. severity may only be: mild, moderate, severe, unsure, or null.
4. clinical_details may contain only simple string/boolean values. Use it for specific questionnaire facts such as chest_character, chest_radiation, tooth_area, tooth_swelling, skin_itching, etc.
5. Never create a diagnosis such as heart_attack, pneumonia, abscess, migraine, or cancer unless that exact canonical symptom ID is in the allowed list. Diagnosis is outside this component's scope.
6. Do not copy values from Existing canonical intake unless the latest message explicitly refers to them.
7. Preserve patient wording in additional_notes only when useful and only for information not represented elsewhere.`;
}

async function interpretQrClinicalText({ text, questionnaireKey, knownIntake, accessToken }) {
    const value = String(text || "").trim();
    if (!value || value.length > MAX_TEXT_LENGTH) {
        throw new Error("Invalid clinical text length.");
    }

    const ai = getAIClient();
    const prompt = buildPrompt({ text: value, questionnaireKey, knownIntake });
    const idempotencyKey = crypto
        .createHash("sha256")
        .update(`${accessToken}:${questionnaireKey || "general"}:${value}`)
        .digest("hex");

    const response = await geminiRequestManager.enqueue({
        priority: "LOW",
        idempotencyKey: `qr-clinical:${idempotencyKey}`,
        requestFn: async () => ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0,
            },
        }),
    });

    const responseText = typeof response?.text === "string"
        ? response.text
        : typeof response?.candidates?.[0]?.content?.parts?.[0]?.text === "string"
            ? response.candidates[0].content.parts[0].text
            : "{}";

    const parsed = parseJsonResponse(responseText);

    return {
        confidence: "LOW",
        extraction: normalizeExtraction(parsed),
    };
}

module.exports = {
    interpretQrClinicalText,
};
