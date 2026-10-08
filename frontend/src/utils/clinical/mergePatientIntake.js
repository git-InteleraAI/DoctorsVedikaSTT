import { normalizePatientIntake } from './patientIntake.js';

export function mergePatientIntake(existing = {}, update = {}) {
    const pickField = (upVal, exVal) => {
        if (upVal !== undefined && upVal !== null) {
            if (typeof upVal === 'string') {
                const trimmed = upVal.trim();
                return trimmed.length > 0 ? trimmed : exVal;
            }
            return upVal;
        }
        return exVal;
    };

    return normalizePatientIntake({
        symptoms: [
            ...(existing?.symptoms ?? []),
            ...(update?.symptoms ?? []),
        ],
        location: pickField(update?.location, existing?.location),
        duration: pickField(update?.duration, existing?.duration),
        recent_actions: pickField(update?.recent_actions, existing?.recent_actions),
        severity: pickField(update?.severity, existing?.severity),
        current_medications: pickField(update?.current_medications, existing?.current_medications),
        additional_notes: pickField(update?.additional_notes, existing?.additional_notes),
        clinical_details: {
            ...(existing?.clinical_details || {}),
            ...(update?.clinical_details || {}),
        },
    });
}
