export function createEmptyPatientIntake() {
    return {
        symptoms: [],
        location: null,
        duration: null,
        recent_actions: null,
        severity: null,
        current_medications: null,
        additional_notes: null,
    };
}
function cleanString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeSymptom(value) {
    return value.trim().replace(/\s+/g, ' ');
}
/**
 * Removes duplicate symptoms while preserving order.
 */
export function normalizeSymptoms(symptoms) {
    const seen = new Set();
    const result = [];
    for (const symptom of symptoms) {
        const normalized = normalizeSymptom(symptom);
        if (!normalized) {
            continue;
        }
        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(normalized);
    }
    return result;
}
/**
 * Normalizes canonical patient intake.
 *
 * Missing clinical information remains null.
 * Nothing is invented.
 */
export function normalizePatientIntake(input) {
    const severity = input.severity === 'mild' ||
        input.severity === 'moderate' ||
        input.severity === 'severe' ||
        input.severity === 'unsure'
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
    };
}
