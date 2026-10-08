import {
    getQuestionnaire,
    getSymptomSpecificQuestions,
    getSymptomSpecificQuestion,
} from '../../data/clinical/questionnaires.js';
import { DICTIONARY_BY_ID } from '../../data/clinical/symptomDictionary.js';

const LOCATION_KEYWORDS = [
    'pain', 'ache', 'stiff', 'swell', 'rash', 'cramp', 'burn', 'itch',
    'injury', 'fracture', 'wound', 'headache', 'chest_pain', 'abdominal_pain',
    'back_pain', 'toothache', 'ear_pain', 'joint_pain', 'knee_pain',
    'neck_pain', 'shoulder_pain', 'sore_throat',
];

const ANATOMICAL_QUESTIONNAIRES = new Set(['dentist', 'orthopedist', 'ent', 'dermatologist']);

export function isLocationRelevant(symptoms = [], questionnaireKey) {
    if (questionnaireKey && ANATOMICAL_QUESTIONNAIRES.has(questionnaireKey)) return true;
    return symptoms.some((symptom) => {
        const lower = String(symptom).toLowerCase();
        return LOCATION_KEYWORDS.some((keyword) => lower.includes(keyword));
    });
}

export function getSymptomDisplayName(symptomId) {
    const dictEntry = DICTIONARY_BY_ID.get(symptomId);
    if (dictEntry) return dictEntry.canonicalLabel;
    return String(symptomId)
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function hasValue(intake, field) {
    const value = intake?.clinical_details?.[field];
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function getActiveSpecificQuestion(intake) {
    const questions = getSymptomSpecificQuestions(intake?.symptoms || []);
    return questions.find((question) => !hasValue(intake, question.field)) || null;
}

export function selectNextQuestion(intake, questionnaireKey, targetField) {
    if (targetField && targetField !== 'review') return targetField;

    if (!intake.symptoms || intake.symptoms.length === 0) return 'symptoms';

    if (!intake.location && isLocationRelevant(intake.symptoms, questionnaireKey)) return 'location';

    if (!intake.duration) return 'duration';

    const specificQuestion = getActiveSpecificQuestion(intake);
    if (specificQuestion) return specificQuestion.field;

    if (!intake.recent_actions) return 'recent_actions';
    if (!intake.severity) return 'severity';

    return 'review';
}

export function getQuestionPrompt(field, intake, questionnaireKey) {
    const qDef = getQuestionnaire(questionnaireKey);
    const specificQuestion = getSymptomSpecificQuestion(field, intake?.symptoms || []);

    if (specificQuestion) {
        return {
            prompt: specificQuestion.prompt,
            quickChips: specificQuestion.quickChips || [],
        };
    }

    switch (field) {
        case 'symptoms': {
            const topSpecialty = qDef.symptoms.slice(0, 4).map((s) => s.label);
            const topConstitutional = qDef.constitutionalSymptoms.slice(0, 2).map((s) => s.label);
            return {
                prompt: intake.symptoms.length > 0
                    ? 'Are there any other symptoms you would like to mention, or are these all?'
                    : 'Please describe the symptoms you are experiencing today, or select an option below:',
                quickChips: Array.from(new Set([...topSpecialty, ...topConstitutional])),
            };
        }
        case 'location':
            return {
                prompt: 'Where exactly are you feeling this discomfort or symptom?',
                quickChips: [...qDef.locationOptions, 'Not Specific / Generalized'],
            };
        case 'duration':
            return {
                prompt: 'How long have you been experiencing these symptoms?',
                quickChips: [...qDef.durationOptions, 'Not Sure'],
            };
        case 'recent_actions':
            return {
                prompt: 'Have you taken any medicines, home remedies, or seen another doctor for this?',
                quickChips: [...qDef.recentActionOptions],
            };
        case 'severity':
            return {
                prompt: 'How severe would you describe your symptoms right now?',
                quickChips: ['Mild', 'Moderate', 'Severe', 'Unsure'],
            };
        case 'current_medications':
            return {
                prompt: 'Are you currently taking any regular medications or supplements?',
                quickChips: ['No Regular Medications', 'Blood Pressure Meds', 'Diabetes Meds', 'Other Prescriptions'],
            };
        case 'review':
            return {
                prompt: `Please review your clinical intake summary:\n\n${formatReviewSummary(intake)}\n\nIs this accurate and ready to share with your doctor?`,
                quickChips: ['Confirm & Save', 'Edit Symptoms', 'Edit Duration', 'Edit Severity', 'Edit Location'],
            };
        default:
            return { prompt: 'Please tell me more about what you are experiencing.', quickChips: [] };
    }
}

function formatDetailValue(value) {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

export function formatReviewSummary(intake) {
    const symptomLabels = intake.symptoms.length > 0
        ? intake.symptoms.map(getSymptomDisplayName).join(', ')
        : 'None reported';

    const lines = [
        `• Symptoms: ${symptomLabels}`,
        intake.location ? `• Location: ${intake.location}` : null,
        intake.duration ? `• Duration: ${intake.duration}` : null,
        ...Object.entries(intake.clinical_details || {}).map(([key, value]) => {
            const question = getSymptomSpecificQuestion(key, intake.symptoms);
            const label = question?.label || key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            return `• ${label}: ${formatDetailValue(value)}`;
        }),
        intake.severity ? `• Severity: ${intake.severity.charAt(0).toUpperCase() + intake.severity.slice(1)}` : null,
        intake.recent_actions ? `• Recent Actions: ${intake.recent_actions}` : null,
        intake.current_medications ? `• Medications: ${intake.current_medications}` : null,
        intake.additional_notes ? `• Patient Notes: ${intake.additional_notes}` : null,
    ].filter(Boolean);

    return lines.join('\n');
}
