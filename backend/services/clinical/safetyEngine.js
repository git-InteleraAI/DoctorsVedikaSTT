/**
 * backend/services/clinical/safetyEngine.js
 *
 * Deterministic Clinical Safety Engine for backend server-side re-evaluation.
 * Ensures 100% parity with frontend clinical safety rules.
 * Priority: CRITICAL > CAUTION > SAFE.
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

const SAFETY_RULES = [
    // CRITICAL RULES
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
    // CAUTION RULES
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

function buildSafetyContext(input) {
    if (!input || typeof input !== 'object') {
        return {
            activeSymptoms: [],
            severity: null,
            location: null,
            duration: null,
            additional_notes: null,
            recent_actions: null,
        };
    }

    let active = [];
    if (Array.isArray(input.symptoms)) {
        active = input.symptoms.map((s) => String(s).trim());
    } else if (typeof input.symptoms === 'string') {
        active = input.symptoms
            .split(/[,;\n]+/)
            .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
            .filter(Boolean);
    }

    return {
        activeSymptoms: active,
        severity: input.severity || null,
        location: input.location || null,
        duration: input.duration || null,
        additional_notes: input.additional_notes || null,
        recent_actions: input.recent_actions || null,
    };
}

function evaluateSafety(input) {
    const ctx = buildSafetyContext(input);
    const matchedRules = SAFETY_RULES.filter((rule) => rule.check(ctx));

    let finalStatus = 'SAFE';
    if (matchedRules.some((r) => r.status === 'CRITICAL')) {
        finalStatus = 'CRITICAL';
    } else if (matchedRules.some((r) => r.status === 'CAUTION')) {
        finalStatus = 'CAUTION';
    }

    const matchedRedFlags = Array.from(new Set(matchedRules.map((r) => r.id)));
    const reasonCodes = matchedRules.map((r) => r.reasonCode);
    const reasons = matchedRules.map((r) => r.reason);

    return {
        status: finalStatus,
        matchedRedFlags,
        reasonCodes,
        reasons,
        requiresImmediateAction: finalStatus === 'CRITICAL',
        source: 'deterministic',
        evaluatedAt: new Date().toISOString(),
    };
}

module.exports = {
    evaluateSafety,
    buildSafetyContext,
    SAFETY_RULES,
};
