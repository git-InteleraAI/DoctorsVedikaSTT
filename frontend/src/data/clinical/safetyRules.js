/**
 * frontend/src/shared/clinical/safety/safetyRules.ts
 *
 * Controlled deterministic clinical safety rules for Phase 2D.
 * Priority: CRITICAL > CAUTION > SAFE.
 *
 * Rules are purely deterministic and describe explicit facts only.
 * No medical guessing or disease inference.
 */
function hasSymptom(activeSymptoms, id) {
    return activeSymptoms.some((s) => s.toLowerCase() === id.toLowerCase());
}
function hasAnySymptom(activeSymptoms, ids) {
    return ids.some((id) => hasSymptom(activeSymptoms, id));
}
function isSevere(severity) {
    return typeof severity === 'string' && severity.trim().toLowerCase() === 'severe';
}
export const SAFETY_RULES = [
    // =========================================================================
    // CRITICAL RULES (requiresImmediateAction: true)
    // =========================================================================
    {
        id: 'CRIT_CARDIAC_RESPIRATORY',
        status: 'CRITICAL',
        triggerDescription: 'Active chest pain reported concurrently with breathing difficulty',
        reasonCode: 'CRIT_CARDIAC_RESPIRATORY',
        reason: 'Explicit chest pain reported concurrently with breathing difficulty.',
        check: (ctx) => hasSymptom(ctx.activeSymptoms, 'chest_pain') &&
            hasSymptom(ctx.activeSymptoms, 'breathlessness'),
    },
    {
        id: 'CRIT_SEVERE_CHEST_PAIN',
        status: 'CRITICAL',
        triggerDescription: 'Active chest pain reported with severe intensity',
        reasonCode: 'CRIT_SEVERE_CHEST_PAIN',
        reason: 'Explicit chest pain reported with severe intensity.',
        check: (ctx) => hasSymptom(ctx.activeSymptoms, 'chest_pain') && isSevere(ctx.severity),
    },
    {
        id: 'CRIT_SEVERE_BREATHLESSNESS',
        status: 'CRITICAL',
        triggerDescription: 'Active breathing difficulty reported with severe intensity',
        reasonCode: 'CRIT_SEVERE_BREATHLESSNESS',
        reason: 'Explicit breathing difficulty reported with severe intensity.',
        check: (ctx) => hasSymptom(ctx.activeSymptoms, 'breathlessness') && isSevere(ctx.severity),
    },
    {
        id: 'CRIT_ACTIVE_SEIZURES',
        status: 'CRITICAL',
        triggerDescription: 'Explicit seizure or convulsion symptoms reported',
        reasonCode: 'CRIT_ACTIVE_SEIZURES',
        reason: 'Explicit seizure or convulsion symptoms reported.',
        check: (ctx) => hasSymptom(ctx.activeSymptoms, 'seizures'),
    },
    {
        id: 'CRIT_NEURO_COMBINATION',
        status: 'CRITICAL',
        triggerDescription: 'Severe headache reported in conjunction with associated neurological/systemic symptoms',
        reasonCode: 'CRIT_NEURO_COMBINATION',
        reason: 'Severe headache reported in conjunction with associated neurological or systemic symptoms.',
        check: (ctx) => hasAnySymptom(ctx.activeSymptoms, ['headache', 'migraine']) &&
            isSevere(ctx.severity) &&
            hasAnySymptom(ctx.activeSymptoms, ['vomiting', 'numbness', 'balance_loss']),
    },
    {
        id: 'CRIT_PSYCHIATRIC_EMERGENCY',
        status: 'CRITICAL',
        triggerDescription: 'Explicit acute psychiatric crisis symptoms reported',
        reasonCode: 'CRIT_PSYCHIATRIC_EMERGENCY',
        reason: 'Explicit acute psychiatric crisis symptoms reported.',
        check: (ctx) => hasSymptom(ctx.activeSymptoms, 'suicidal_thoughts'),
    },
    {
        id: 'CRIT_ANAPHYLAXIS_AIRWAY',
        status: 'CRITICAL',
        triggerDescription: 'Severe acute airway / allergic reaction presentation reported',
        reasonCode: 'CRIT_ANAPHYLAXIS_AIRWAY',
        reason: 'Severe acute airway and allergic presentation reported concurrently.',
        check: (ctx) => hasAnySymptom(ctx.activeSymptoms, ['breathlessness', 'difficulty_swallowing', 'throat']) &&
            hasAnySymptom(ctx.activeSymptoms, ['itching', 'skin_rash']) &&
            isSevere(ctx.severity),
    },
    // =========================================================================
    // CAUTION RULES (requiresImmediateAction: false)
    // =========================================================================
    {
        id: 'CAUT_CHEST_PAIN_ISOLATED',
        status: 'CAUTION',
        triggerDescription: 'Chest pain reported without acute severe markers or concurrent respiratory distress',
        reasonCode: 'CAUT_CHEST_PAIN_ISOLATED',
        reason: 'Chest pain reported without acute severe markers; timely medical assessment advised.',
        check: (ctx) => hasSymptom(ctx.activeSymptoms, 'chest_pain') &&
            !isSevere(ctx.severity) &&
            !hasSymptom(ctx.activeSymptoms, 'breathlessness'),
    },
    {
        id: 'CAUT_BREATHLESSNESS_ISOLATED',
        status: 'CAUTION',
        triggerDescription: 'Shortness of breath reported without acute severe markers or concurrent chest pain',
        reasonCode: 'CAUT_BREATHLESSNESS_ISOLATED',
        reason: 'Shortness of breath reported without acute severe markers; timely medical assessment advised.',
        check: (ctx) => hasSymptom(ctx.activeSymptoms, 'breathlessness') &&
            !isSevere(ctx.severity) &&
            !hasSymptom(ctx.activeSymptoms, 'chest_pain'),
    },
    {
        id: 'CAUT_SEVERE_HEADACHE_ISOLATED',
        status: 'CAUTION',
        triggerDescription: 'Severe headache reported without focal neurological deficit',
        reasonCode: 'CAUT_SEVERE_HEADACHE_ISOLATED',
        reason: 'Severe headache reported without focal neurological deficit; clinical evaluation recommended.',
        check: (ctx) => hasAnySymptom(ctx.activeSymptoms, ['headache', 'migraine']) &&
            isSevere(ctx.severity) &&
            !hasAnySymptom(ctx.activeSymptoms, ['vomiting', 'numbness', 'balance_loss']),
    },
    {
        id: 'CAUT_HIGH_BP',
        status: 'CAUTION',
        triggerDescription: 'Elevated blood pressure symptoms reported',
        reasonCode: 'CAUT_HIGH_BP',
        reason: 'Elevated blood pressure symptoms reported; clinical review advised.',
        check: (ctx) => hasSymptom(ctx.activeSymptoms, 'high_bp'),
    },
];
