import { mergePatientIntake } from '../../utils/clinical/mergePatientIntake.js';
import { parsePatientText, parseSelectedSymptom } from '../../utils/clinical/deterministicParser.js';
import { extractDuration, extractLaterality, extractRecentActions, extractSeverity, } from '../../utils/clinical/matcher.js';
import { SYMPTOM_DICTIONARY } from '../../data/clinical/symptomDictionary.js';
const SEVERITY_BUTTON_MAP = {
    mild: 'mild',
    moderate: 'moderate',
    severe: 'severe',
    unsure: 'unsure',
    'unsure / need evaluation': 'unsure',
};
/**
 * Maps a display label to its symptom ID by checking the symptom dictionary.
 */
function findSymptomIdByLabel(label) {
    const norm = label.trim().toLowerCase();
    for (const entry of SYMPTOM_DICTIONARY) {
        if (entry.canonicalLabel.toLowerCase() === norm ||
            entry.id.toLowerCase() === norm ||
            entry.clinicalTerms.some((t) => t.toLowerCase() === norm)) {
            return entry.id;
        }
    }
    return null;
}
/**
 * Processes either button or typed natural language input into a canonical intake update.
 */
export function processDialogueInput(input, currentIntake, currentState, currentQuestionField, activeSpecialtyKey) {
    const rawValue = (input.value || '').trim();
    // 1. Check for Confirmation / Edit actions in REVIEW or other states
    if (currentState === 'REVIEW' || currentState === 'ERROR' || input.type === 'button') {
        const lower = rawValue.toLowerCase();
        // Confirmation / Retry intents
        if (lower === 'confirm & save' ||
            lower === 'confirm' ||
            lower === 'save' ||
            lower === 'yes, save' ||
            lower === 'looks good' ||
            lower === 'all good' ||
            lower === 'retry save' ||
            lower === 'retry' ||
            ((currentState === 'REVIEW' || currentState === 'ERROR') && /\b(confirm|save|proceed|correct|looks good|yes|retry)\b/i.test(lower))) {
            return {
                updatedIntake: currentIntake,
                userIntent: 'confirm',
                confidence: 'HIGH',
                isButtonSelection: input.type === 'button',
            };
        }
        // Edit intents
        if (lower.startsWith('edit') ||
            (currentState === 'REVIEW' && /\b(edit|change|modify|update|wrong|no)\b/i.test(lower))) {
            let targetField = 'symptoms';
            if (lower.includes('duration') || lower.includes('time'))
                targetField = 'duration';
            else if (lower.includes('severity') || lower.includes('pain scale'))
                targetField = 'severity';
            else if (lower.includes('location') || lower.includes('side') || lower.includes('where'))
                targetField = 'location';
            else if (lower.includes('action') || lower.includes('remedy') || lower.includes('medicine'))
                targetField = 'recent_actions';
            else if (lower.includes('symptom'))
                targetField = 'symptoms';
            return {
                updatedIntake: currentIntake,
                userIntent: 'edit',
                targetField,
                confidence: 'HIGH',
                isButtonSelection: input.type === 'button',
            };
        }
    }
    // 2. Handle Canonical Button Selection
    if (input.type === 'button') {
        const lower = rawValue.toLowerCase();
        // A. Severity chip
        if (SEVERITY_BUTTON_MAP[lower] !== undefined) {
            const merged = mergePatientIntake(currentIntake, {
                severity: SEVERITY_BUTTON_MAP[lower],
            });
            return {
                updatedIntake: merged,
                userIntent: 'continue',
                confidence: 'HIGH',
                isButtonSelection: true,
            };
        }
        // B. Duration chip
        if (lower === 'today' ||
            lower.includes('day') ||
            lower.includes('week') ||
            lower.includes('month') ||
            lower.includes('chronic') ||
            lower.includes('hours')) {
            const merged = mergePatientIntake(currentIntake, {
                duration: rawValue,
            });
            return {
                updatedIntake: merged,
                userIntent: 'continue',
                confidence: 'HIGH',
                isButtonSelection: true,
            };
        }
        // C. Location chip
        if (lower.includes('side') ||
            lower.includes('upper') ||
            lower.includes('lower') ||
            lower.includes('generalized') ||
            lower.includes('center')) {
            const merged = mergePatientIntake(currentIntake, {
                location: rawValue,
            });
            return {
                updatedIntake: merged,
                userIntent: 'continue',
                confidence: 'HIGH',
                isButtonSelection: true,
            };
        }
        // D. Recent actions chip
        if (lower.includes('otc') ||
            lower.includes('remedies') ||
            lower.includes('doctor') ||
            lower.includes('cream') ||
            lower.includes('nothing')) {
            const merged = mergePatientIntake(currentIntake, {
                recent_actions: rawValue,
            });
            return {
                updatedIntake: merged,
                userIntent: 'continue',
                confidence: 'HIGH',
                isButtonSelection: true,
            };
        }
        // E. Symptom button (check by ID or label)
        const symptomId = findSymptomIdByLabel(rawValue);
        if (symptomId) {
            const parseRes = parseSelectedSymptom(symptomId, {
                existingIntake: currentIntake,
                activeSpecialtyKey,
            });
            return {
                updatedIntake: parseRes.patientIntake,
                parseResult: parseRes,
                userIntent: 'continue',
                confidence: 'HIGH',
                isButtonSelection: true,
            };
        }
        // F. Fallback button -> treat value as free text
    }
    // 3. Handle Typed Free Text via Phase 2C Deterministic Parser
    const parseRes = parsePatientText(rawValue, {
        existingIntake: currentIntake,
        activeSpecialtyKey,
    });
    let merged = parseRes.patientIntake;
    // Question-specific attribute fallback if user directly answered current question:
    if (currentQuestionField === 'duration' && !merged.duration) {
        const dur = extractDuration(rawValue);
        if (dur.duration || dur.rawDuration) {
            merged = mergePatientIntake(merged, { duration: dur.duration || dur.rawDuration });
        }
    }
    else if (currentQuestionField === 'severity' && !merged.severity) {
        const sev = extractSeverity(rawValue);
        if (sev.severity) {
            merged = mergePatientIntake(merged, { severity: sev.severity });
        }
    }
    else if (currentQuestionField === 'location' && !merged.location) {
        const loc = extractLaterality(rawValue);
        if (loc.location) {
            merged = mergePatientIntake(merged, { location: loc.location });
        }
        else if (rawValue.length < 40 && !/\b(no|nothing|none|dont know)\b/i.test(rawValue)) {
            merged = mergePatientIntake(merged, { location: rawValue });
        }
    }
    else if (currentQuestionField === 'recent_actions' && !merged.recent_actions) {
        const act = extractRecentActions(rawValue);
        if (act.recent_actions) {
            merged = mergePatientIntake(merged, { recent_actions: act.recent_actions });
        }
        else if (rawValue.length < 80) {
            merged = mergePatientIntake(merged, { recent_actions: rawValue });
        }
    }
    return {
        updatedIntake: merged,
        parseResult: parseRes,
        userIntent: 'continue',
        confidence: parseRes.confidence,
        isButtonSelection: false,
        unmatchedText: parseRes.unmatchedText,
    };
}
/**
 * Merges controlled Gemini structured extraction into canonical PatientIntake (Phase 2G).
 * Does not overwrite non-null intake fields with null.
 */
export function mergeFallbackInterpretation(currentIntake, interpretResult) {
    if (!interpretResult || !interpretResult.extraction) {
        return currentIntake;
    }
    const ext = interpretResult.extraction;
    const update = {
        symptoms: Array.isArray(ext.symptoms) && ext.symptoms.length > 0 ? ext.symptoms : undefined,
        location: ext.location || undefined,
        duration: ext.duration || undefined,
        severity: ext.severity || undefined,
        recent_actions: ext.recent_actions || undefined,
        current_medications: ext.current_medications || undefined,
        additional_notes: ext.additional_notes || undefined,
    };
    return mergePatientIntake(currentIntake, update);
}
