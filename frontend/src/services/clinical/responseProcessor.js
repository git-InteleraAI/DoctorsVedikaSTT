import { mergePatientIntake } from '../../utils/clinical/mergePatientIntake.js';
import { parsePatientText, parseSelectedSymptom } from '../../utils/clinical/deterministicParser.js';
import { extractDuration, extractLaterality, extractRecentActions, extractSeverity } from '../../utils/clinical/matcher.js';
import { getSymptomSpecificQuestion } from '../../data/clinical/questionnaires.js';
import { SYMPTOM_DICTIONARY } from '../../data/clinical/symptomDictionary.js';

const SEVERITY_BUTTON_MAP = {
    mild: 'mild',
    moderate: 'moderate',
    severe: 'severe',
    unsure: 'unsure',
    'unsure / need evaluation': 'unsure',
};

function findSymptomIdByLabel(label) {
    const norm = label.trim().toLowerCase();
    for (const entry of SYMPTOM_DICTIONARY) {
        if (
            entry.canonicalLabel.toLowerCase() === norm ||
            entry.id.toLowerCase() === norm ||
            entry.clinicalTerms.some((term) => term.toLowerCase() === norm)
        ) return entry.id;
    }
    return null;
}

function storeSpecificAnswer(currentIntake, question, rawValue) {
    let value = rawValue.trim();
    const lower = value.toLowerCase();

    if (lower === 'yes') value = true;
    else if (lower === 'no') value = false;

    const update = {
        clinical_details: {
            ...(currentIntake.clinical_details || {}),
            [question.field]: value,
        },
    };

    if (value === true && question.yesSymptom) {
        update.symptoms = [question.yesSymptom];
    }

    return mergePatientIntake(currentIntake, update);
}

export function processDialogueInput(input, currentIntake, currentState, currentQuestionField, activeSpecialtyKey) {
    const rawValue = (input.value || '').trim();

    // REVIEW / ERROR confirmation and editing.
    if (currentState === 'REVIEW' || currentState === 'ERROR' || input.type === 'button') {
        const lower = rawValue.toLowerCase();
        if (
            lower === 'confirm & save' || lower === 'confirm' || lower === 'save' ||
            lower === 'yes, save' || lower === 'looks good' || lower === 'all good' ||
            lower === 'retry save' || lower === 'retry' ||
            ((currentState === 'REVIEW' || currentState === 'ERROR') &&
                /\b(confirm|save|proceed|correct|looks good|yes|retry)\b/i.test(lower))
        ) {
            return { updatedIntake: currentIntake, userIntent: 'confirm', confidence: 'HIGH', isButtonSelection: input.type === 'button' };
        }

        if (lower.startsWith('edit') || (currentState === 'REVIEW' && /\b(edit|change|modify|update|wrong|no)\b/i.test(lower))) {
            let targetField = 'symptoms';
            if (lower.includes('duration') || lower.includes('time')) targetField = 'duration';
            else if (lower.includes('severity') || lower.includes('pain scale')) targetField = 'severity';
            else if (lower.includes('location') || lower.includes('side') || lower.includes('where')) targetField = 'location';
            else if (lower.includes('action') || lower.includes('remedy') || lower.includes('medicine')) targetField = 'recent_actions';
            return { updatedIntake: currentIntake, userIntent: 'edit', targetField, confidence: 'HIGH', isButtonSelection: input.type === 'button' };
        }
    }

    if (input.type === 'button') {
        const lower = rawValue.toLowerCase();

        if (SEVERITY_BUTTON_MAP[lower] !== undefined) {
            return {
                updatedIntake: mergePatientIntake(currentIntake, { severity: SEVERITY_BUTTON_MAP[lower] }),
                userIntent: 'continue', confidence: 'HIGH', isButtonSelection: true,
            };
        }

        const specificQuestion = getSymptomSpecificQuestion(currentQuestionField, currentIntake.symptoms);
        if (specificQuestion) {
            return {
                updatedIntake: storeSpecificAnswer(currentIntake, specificQuestion, rawValue),
                userIntent: 'continue', confidence: 'HIGH', isButtonSelection: true,
            };
        }

        if (
            lower === 'today' || lower.includes('day') || lower.includes('week') ||
            lower.includes('month') || lower.includes('chronic') || lower.includes('hours')
        ) {
            return {
                updatedIntake: mergePatientIntake(currentIntake, { duration: rawValue }),
                userIntent: 'continue', confidence: 'HIGH', isButtonSelection: true,
            };
        }

        if (lower.includes('side') || lower.includes('upper') || lower.includes('lower') || lower.includes('generalized') || lower.includes('center')) {
            return {
                updatedIntake: mergePatientIntake(currentIntake, { location: rawValue }),
                userIntent: 'continue', confidence: 'HIGH', isButtonSelection: true,
            };
        }

        if (lower.includes('otc') || lower.includes('remedies') || lower.includes('doctor') || lower.includes('cream') || lower.includes('nothing')) {
            return {
                updatedIntake: mergePatientIntake(currentIntake, { recent_actions: rawValue }),
                userIntent: 'continue', confidence: 'HIGH', isButtonSelection: true,
            };
        }

        const symptomId = findSymptomIdByLabel(rawValue);
        if (symptomId) {
            const parseRes = parseSelectedSymptom(symptomId, { existingIntake: currentIntake, activeSpecialtyKey });
            return {
                updatedIntake: parseRes.patientIntake,
                parseResult: parseRes,
                userIntent: 'continue', confidence: 'HIGH', isButtonSelection: true,
            };
        }
    }

    // Free text: first allow the existing deterministic parser to do its normal work.
    const parseRes = parsePatientText(rawValue, {
        existingIntake: currentIntake,
        activeSpecialtyKey,
    });
    let merged = parseRes.patientIntake;

    // Phase 3: if the user is answering a specific question, capture the answer explicitly.
    const specificQuestion = getSymptomSpecificQuestion(currentQuestionField, currentIntake.symptoms);
    if (specificQuestion && rawValue) {
        merged = storeSpecificAnswer(merged, specificQuestion, rawValue);
    } else if (currentQuestionField === 'duration' && !merged.duration) {
        const dur = extractDuration(rawValue);
        if (dur.duration || dur.rawDuration) merged = mergePatientIntake(merged, { duration: dur.duration || dur.rawDuration });
    } else if (currentQuestionField === 'severity' && !merged.severity) {
        const sev = extractSeverity(rawValue);
        if (sev.severity) merged = mergePatientIntake(merged, { severity: sev.severity });
    } else if (currentQuestionField === 'location' && !merged.location) {
        const loc = extractLaterality(rawValue);
        if (loc.location) merged = mergePatientIntake(merged, { location: loc.location });
        else if (rawValue.length < 40 && !/\b(no|nothing|none|dont know)\b/i.test(rawValue)) merged = mergePatientIntake(merged, { location: rawValue });
    } else if (currentQuestionField === 'recent_actions' && !merged.recent_actions) {
        const act = extractRecentActions(rawValue);
        if (act.recent_actions) merged = mergePatientIntake(merged, { recent_actions: act.recent_actions });
        else if (rawValue.length < 80) merged = mergePatientIntake(merged, { recent_actions: rawValue });
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

export function mergeFallbackInterpretation(currentIntake, interpretResult) {
    if (!interpretResult || !interpretResult.extraction) return currentIntake;
    const ext = interpretResult.extraction;
    return mergePatientIntake(currentIntake, {
        symptoms: Array.isArray(ext.symptoms) && ext.symptoms.length > 0 ? ext.symptoms : undefined,
        location: ext.location || undefined,
        duration: ext.duration || undefined,
        severity: ext.severity || undefined,
        recent_actions: ext.recent_actions || undefined,
        current_medications: ext.current_medications || undefined,
        additional_notes: ext.additional_notes || undefined,
        clinical_details: ext.clinical_details || undefined,
    });
}
