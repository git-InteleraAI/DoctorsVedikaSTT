export function createEmptyPatientIntake() {
    return {
        symptoms: [],
        location: null,
        duration: null,
        recent_actions: null,
        severity: null,
        current_medications: null,
        additional_notes: null,
        clinical_details: {},
    };
}

function cleanString(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeSymptom(value) {
    return value.trim().replace(/\s+/g, ' ');
}

export function normalizeSymptoms(symptoms) {
    const seen = new Set();
    const result = [];
    for (const symptom of Array.isArray(symptoms) ? symptoms : []) {
        if (typeof symptom !== 'string') continue;
        const normalized = normalizeSymptom(symptom);
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    return result;
}

function normalizeClinicalDetails(details) {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
    const result = {};
    for (const [key, value] of Object.entries(details)) {
        if (!/^[a-zA-Z0-9_]{1,80}$/.test(key)) continue;
        if (typeof value === 'boolean') {
            result[key] = value;
        } else if (typeof value === 'string') {
            const cleaned = cleanString(value);
            if (cleaned !== null) result[key] = cleaned;
        }
    }
    return result;
}

export function normalizePatientIntake(input = {}) {
    const severity = ['mild', 'moderate', 'severe', 'unsure'].includes(input.severity)
        ? input.severity
        : null;

    return {
        symptoms: normalizeSymptoms(input.symptoms ?? []),
        location: cleanString(input.location),
        duration: cleanString(input.duration),
        recent_actions: cleanString(input.recent_actions),
        severity,
        current_medications: cleanString(input.current_medications),
        additional_notes: cleanString(input.additional_notes),
        clinical_details: normalizeClinicalDetails(input.clinical_details),
    };
}
