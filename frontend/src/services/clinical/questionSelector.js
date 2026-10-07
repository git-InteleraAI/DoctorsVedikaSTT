import { getQuestionnaire } from '../../data/clinical/questionnaires.js';
import { DICTIONARY_BY_ID } from '../../data/clinical/symptomDictionary.js';
const LOCATION_KEYWORDS = [
    'pain',
    'ache',
    'stiff',
    'swell',
    'rash',
    'cramp',
    'burn',
    'itch',
    'injury',
    'fracture',
    'wound',
    'headache',
    'chest_pain',
    'abdominal_pain',
    'back_pain',
    'toothache',
    'ear_pain',
    'joint_pain',
    'knee_pain',
    'neck_pain',
    'shoulder_pain',
    'sore_throat',
];
const ANATOMICAL_QUESTIONNAIRES = new Set(['dentist', 'orthopedist', 'ent', 'dermatologist']);
/**
 * Determines whether asking for an anatomical location / laterality is clinically relevant.
 */
export function isLocationRelevant(symptoms, questionnaireKey) {
    if (questionnaireKey && ANATOMICAL_QUESTIONNAIRES.has(questionnaireKey)) {
        return true;
    }
    for (const symptom of symptoms) {
        const lower = symptom.toLowerCase();
        if (LOCATION_KEYWORDS.some((kw) => lower.includes(kw))) {
            return true;
        }
    }
    return false;
}
/**
 * Returns a human-readable display string for a symptom identifier.
 */
export function getSymptomDisplayName(symptomId) {
    const dictEntry = DICTIONARY_BY_ID.get(symptomId);
    if (dictEntry) {
        return dictEntry.canonicalLabel;
    }
    return symptomId
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
/**
 * Selects the next missing, relevant question field deterministically.
 * Priority order:
 * 1. symptoms (required)
 * 2. location (conditional on symptom relevance)
 * 3. duration (required / high-value)
 * 4. recent_actions (conditional / high-value)
 * 5. severity (required / high-value)
 * 6. review
 */
export function selectNextQuestion(intake, questionnaireKey, targetField) {
    // If specifically targeting an edit field, respect that choice
    if (targetField && targetField !== 'review') {
        return targetField;
    }
    // 1. Symptoms is strictly required
    if (!intake.symptoms || intake.symptoms.length === 0) {
        return 'symptoms';
    }
    // 2. Location is conditional on relevance
    if (!intake.location && isLocationRelevant(intake.symptoms, questionnaireKey)) {
        return 'location';
    }
    // 3. Duration is standard clinical information
    if (!intake.duration) {
        return 'duration';
    }
    // 4. Recent actions (medications / remedies already tried)
    if (!intake.recent_actions) {
        return 'recent_actions';
    }
    // 5. Severity
    if (!intake.severity) {
        return 'severity';
    }
    // All standard attributes collected -> Ready for Review
    return 'review';
}
/**
 * Builds the deterministic assistant message and quick chips for a question field.
 */
export function getQuestionPrompt(field, intake, questionnaireKey) {
    const qDef = getQuestionnaire(questionnaireKey);
    switch (field) {
        case 'symptoms': {
            // Pick top symptoms from current specialty catalog + top general constitutional symptoms
            const topSpecialty = qDef.symptoms.slice(0, 4).map((s) => s.label);
            const topConstitutional = qDef.constitutionalSymptoms.slice(0, 2).map((s) => s.label);
            const chips = Array.from(new Set([...topSpecialty, ...topConstitutional]));
            return {
                prompt: intake.symptoms.length > 0
                    ? 'Are there any other symptoms you would like to mention, or are these all?'
                    : 'Please describe the symptoms you are experiencing today, or select an option below:',
                quickChips: chips,
            };
        }
        case 'location': {
            const chips = [...qDef.locationOptions, 'Not Specific / Generalized'];
            return {
                prompt: 'Where exactly are you feeling this discomfort or symptom?',
                quickChips: chips,
            };
        }
        case 'duration': {
            const chips = [...qDef.durationOptions, 'Not Sure'];
            return {
                prompt: 'How long have you been experiencing these symptoms?',
                quickChips: chips,
            };
        }
        case 'recent_actions': {
            const chips = [...qDef.recentActionOptions];
            return {
                prompt: 'Have you taken any medicines, home remedies, or seen another doctor for this?',
                quickChips: chips,
            };
        }
        case 'severity': {
            const chips = ['Mild', 'Moderate', 'Severe', 'Unsure'];
            return {
                prompt: 'How severe would you describe your symptoms right now?',
                quickChips: chips,
            };
        }
        case 'current_medications': {
            const chips = ['No Regular Medications', 'Blood Pressure Meds', 'Diabetes Meds', 'Other Prescriptions'];
            return {
                prompt: 'Are you currently taking any regular medications or supplements?',
                quickChips: chips,
            };
        }
        case 'review': {
            const summary = formatReviewSummary(intake);
            return {
                prompt: `Please review your clinical intake summary:\n\n${summary}\n\nIs this accurate and ready to share with your doctor?`,
                quickChips: ['Confirm & Save', 'Edit Symptoms', 'Edit Duration', 'Edit Severity', 'Edit Location'],
            };
        }
        default: {
            return {
                prompt: 'Please tell me more about what you are experiencing.',
                quickChips: [],
            };
        }
    }
}
/**
 * Formats a clean clinical review summary string from PatientIntake.
 */
export function formatReviewSummary(intake) {
    const symptomLabels = intake.symptoms.length > 0
        ? intake.symptoms.map(getSymptomDisplayName).join(', ')
        : 'None reported';
    const lines = [
        `• Symptoms: ${symptomLabels}`,
        intake.location ? `• Location: ${intake.location}` : null,
        intake.duration ? `• Duration: ${intake.duration}` : null,
        intake.severity ? `• Severity: ${intake.severity.charAt(0).toUpperCase() + intake.severity.slice(1)}` : null,
        intake.recent_actions ? `• Recent Actions: ${intake.recent_actions}` : null,
        intake.current_medications ? `• Medications: ${intake.current_medications}` : null,
        intake.additional_notes ? `• Patient Notes: ${intake.additional_notes}` : null,
    ].filter(Boolean);
    return lines.join('\n');
}
