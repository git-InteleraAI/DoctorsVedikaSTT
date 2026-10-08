import { getApiBaseUrl } from "./apiConfig";

const API = getApiBaseUrl();

export const INDICATION_MAP = {
    "fever": "జ్వరం",
    "high fever": "అధిక జ్వరం",
    "gas / acidity": "గ్యాస్ / ఆమ్లత్వం",
    "gas and acidity": "గ్యాస్ మరియు ఆమ్లత్వం",
    "gas": "గ్యాస్",
    "acidity": "ఆమ్లత్వం",
    "headache": "తలనొప్పి",
    "cough": "దగ్గు",
    "cold": "జలుబు",
    "body pain": "శరీర నొప్పులు",
    "body pains": "శరీర నొప్పులు",
    "pain": "నొప్పి",
    "pain relief": "నొప్పి నివారణ",
    "vomiting": "వాంతులు",
    "nausea": "వికారం",
    "diarrhea": "విరేచనాలు",
    "loose motions": "విరేచనాలు",
    "infection": "ఇన్ఫెక్షన్",
    "allergy": "అలర్ジー",
    "stomach pain": "కడుపు నొప్పి",
    "chest pain": "ఛాతీ నొప్పి",
    "blood pressure": "రక్తపోటు",
    "bp": "రక్తపోటు",
    "diabetes": "మధుమేహం",
    "sugar": "మధుమేహం",
    "asthma": "ఆస్త్మా",
    "back pain": "వెన్నునొప్పి",
    "joint pain": "కీళ్ల నొప్పులు",
};

export const DOSAGE_UNITS = {
    "tablet": "మాత్ర",
    "tablets": "మాత్రలు",
    "capsule": "క్యాప్సూల్",
    "capsules": "క్యాప్సూల్స్",
    "ml": "మి.లీ.",
    "puff": "పఫ్",
    "puffs": "పఫ్‌లు",
    "sachet": "సాచెట్",
    "sachets": "సాచెట్‌లు",
    "drop": "చుక్క",
    "drops": "చుక్కలు",
    "injection": "ఇంజెక్షన్",
    "injections": "ఇంజెక్షన్లు",
    "teaspoon": "టీస్పూన్",
    "teaspoons": "టీస్పూన్లు",
    "tsp": "టీస్పూన్",
    "ointment": "ఆయింట్‌మెంట్",
    "cream": "క్రీమ్",
    "gel": "జెల్",
    "patch": "ప్యాచ్",
    "spray": "స్ప్రే",
    "suppository": "సపోసిటరీ",
    "bottle": "సీసా",
    "unit": "యూనిట్",
    "units": "యూనిట్లు",
};

export const TIMING_MAP = {
    "morning": "ఉదయం",
    "afternoon": "మధ్యాహ్నం",
    "night": "రాత్రి",
    "evening": "సాయంత్రం",
    "as needed": "అవసరమైనప్పుడు",
    "sos": "అవసరమైనప్పుడు",
    "1-0-0": "ఉదయం",
    "0-1-0": "మధ్యాహ్నం",
    "0-0-1": "రాత్రి",
    "1-0-1": "ఉదయం, రాత్రి",
    "1-1-0": "ఉదయం, మధ్యాహ్నం",
    "0-1-1": "మధ్యాహ్నం, రాత్రి",
    "1-1-1": "ఉదయం, మధ్యాహ్నం, రాత్రి",
    "2-0-2": "ఉదయం, రాత్రి",
    "2-2-2": "ఉదయం, మధ్యాహ్నం, రాత్రి",
};

export const FOOD_TIMING_MAP = {
    "before food": "భోజనానికి ముందు",
    "after food": "భోజనం తర్వాత",
    "with food": "భోజనంతో",
    "any time": "ఏ సమయంలోనైనా",
    "empty stomach": "ఖాళీ కడుపుతో",
    "before meals": "భోజనానికి ముందు",
    "after meals": "భోజనం తర్వాత",
    "with meals": "భోజనంతో",
};

export const DURATION_UNITS = {
    "day": "రోజు",
    "days": "రోజులు",
    "week": "వారం",
    "weeks": "వారాలు",
    "month": "నెల",
    "months": "నెలలు",
};

export const DIRECTIONS_FALLBACK_MAP = {
    "take one tablet after food.": "భోజనం తర్వాత ఒక మాత్ర తీసుకోండి.",
    "take 1 tablet after food.": "భోజనం తర్వాత 1 మాత్ర తీసుకోండి.",
    "take one tablet before food.": "భోజనానికి ముందు ఒక మాత్ర తీసుకోండి.",
    "take 1 tablet before food.": "భోజనానికి ముందు 1 మాత్ర తీసుకోండి.",
    "take after food.": "భోజనం తర్వాత తీసుకోండి.",
    "take before food.": "భోజనానికి ముందు తీసుకోండి.",
    "take with food.": "భోజనంతో తీసుకోండి.",
    "take at night before bed.": "రాత్రి పడుకునే ముందు తీసుకోండి.",
    "take as needed for fever.": "జ్వరం వచ్చినప్పుడు అవసరమైతే తీసుకోండి.",
    "take with warm water.": "గోరువెచ్చని నీటితో తీసుకోండి.",
    "take on empty stomach.": "ఖాళీ కడుపుతో తీసుకోండి.",
    "take twice daily after food.": "రోజుకు రెండుసార్లు భోజనం తర్వాత తీసుకోండి.",
    "take three times daily after food.": "రోజుకు మూడుసార్లు భోజనం తర్వాత తీసుకోండి.",
    "stop taking if fever reduces.": "జ్వరం తగ్గిన తర్వాత వాడటం ఆపండి.",
    "take on time": "సమయానికి తీసుకోండి",
    "take on time.": "సమయానికి తీసుకోండి.",
};

export function getTeluguIndication(text) {
    if (!text || typeof text !== "string") return "";
    const clean = text.trim();
    if (!clean) return "";
    const lower = clean.toLowerCase();
    if (INDICATION_MAP[lower]) return INDICATION_MAP[lower];

    const parts = clean.split(/([\/,\+]| and | మరియు )/i);
    const translatedParts = parts.map(part => {
        const trimmed = part.trim();
        const pLower = trimmed.toLowerCase();
        if (INDICATION_MAP[pLower]) return INDICATION_MAP[pLower];
        if (trimmed === "/" || trimmed === "," || trimmed === "+" || pLower === "and") return part;
        return trimmed;
    });

    return translatedParts.join(" ");
}

export function getTeluguDosage(text) {
    if (!text || typeof text !== "string") return "";
    const clean = text.trim();
    if (!clean) return "";

    const lower = clean.toLowerCase();
    if (lower === "1 tablet") return "1 మాత్ర";
    if (lower === "2 tablets") return "2 మాత్రలు";
    if (lower === "1 capsule") return "1 క్యాప్సూల్";
    if (lower === "2 capsules") return "2 క్యాప్సూల్స్";
    if (lower === "5 ml") return "5 మి.లీ.";
    if (lower === "10 ml") return "10 మి.లీ.";

    const match = clean.match(/^(\d+(?:\/\d+|\.\d+)?)\s*([a-zA-Z]+)$/);
    if (match) {
        const num = match[1];
        const unitLower = match[2].toLowerCase();
        if (DOSAGE_UNITS[unitLower]) {
            return `${num} ${DOSAGE_UNITS[unitLower]}`;
        }
    }

    return clean;
}

export function getTeluguFrequency(text) {
    if (!text || typeof text !== "string") return "";
    const clean = text.trim();
    if (!clean) return "";

    const lower = clean.toLowerCase();
    if (TIMING_MAP[lower]) return TIMING_MAP[lower];

    const parts = clean.split(/\s*,\s*/);
    if (parts.length > 1) {
        const translated = parts.map(p => TIMING_MAP[p.toLowerCase()] || p);
        return translated.join(", ");
    }

    return clean;
}

export function getTeluguFoodTiming(text) {
    if (!text || typeof text !== "string") return "";
    const clean = text.trim();
    if (!clean) return "";

    const lower = clean.toLowerCase();
    if (FOOD_TIMING_MAP[lower]) return FOOD_TIMING_MAP[lower];
    return clean;
}

export function getTeluguDuration(text) {
    if (!text || typeof text !== "string") return "";
    const clean = text.trim();
    if (!clean) return "";

    const lower = clean.toLowerCase();
    const match = clean.match(/^(\d+)\s*([a-zA-Z]+)$/);
    if (match) {
        const num = match[1];
        const unitLower = match[2].toLowerCase();
        if (DURATION_UNITS[unitLower]) {
            return `${num} ${DURATION_UNITS[unitLower]}`;
        }
    }

    return clean;
}

export async function translateFreeTextApi(text) {
    if (!text || typeof text !== "string" || !text.trim()) return "";
    const clean = text.trim();
    const lower = clean.toLowerCase();
    if (DIRECTIONS_FALLBACK_MAP[lower]) {
        return DIRECTIONS_FALLBACK_MAP[lower];
    }

    try {
        const res = await fetch(`${API}/api/v1/clinical/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean, targetLanguage: "te" })
        });
        if (res.ok) {
            const data = await res.json();
            if (data?.translatedText) {
                return data.translatedText;
            }
        }
    } catch (e) {
        console.warn("Translation API call error:", e);
    }

    // Local fallback
    if (lower.includes("after food")) return "భోజనం తర్వాత " + clean.replace(/after food\.?/i, "").replace(/take /i, "తీసుకోండి ").trim();
    if (lower.includes("before food")) return "భోజనానికి ముందు " + clean.replace(/before food\.?/i, "").replace(/take /i, "తీసుకోండి ").trim();
    return clean;
}

export function getBilingualText(eng, telugu) {
    const cleanEng = String(eng || "").trim();
    const cleanTe = String(telugu || "").trim();
    if (!cleanEng) return cleanTe;
    if (!cleanTe || cleanTe === cleanEng) return cleanEng;
    return `${cleanEng} (${cleanTe})`;
}
