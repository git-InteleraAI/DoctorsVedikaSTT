/**
 * frontend/src/shared/clinical/safety/safetyEngine.ts
 *
 * Deterministic Clinical Safety Engine (Phase 2D).
 * Evaluates patient intake or parser output to detect red-flag criteria.
 *
 * Rules:
 * - Deterministic, explainable, auditable
 * - Conservative in clinical interpretation (NO medical diagnosis)
 * - Excludes negated, historical, and third-party symptoms
 * - Priority: CRITICAL > CAUTION > SAFE
 */
import { SAFETY_RULES } from '../../data/clinical/safetyRules.js';
/**
 * Normalizes input from either a Phase 2C ParseResult, canonical PatientIntake,
 * or direct SafetyEvaluationContext into a clean SafetyEvaluationContext.
 */
export function buildSafetyContext(input) {
    // 1. If it's a Phase 2C ParseResult
    if ('matchedSymptoms' in input && Array.isArray(input.matchedSymptoms)) {
        const parseRes = input;
        // Active symptoms ONLY (ignoring negated and third-party)
        const active = parseRes.matchedSymptoms.map((m) => m.id);
        const negated = (parseRes.negatedSymptoms || []).map((n) => n.id);
        const thirdParty = (parseRes.thirdPartySymptoms || []).map((t) => t.id);
        return {
            activeSymptoms: active.filter((id) => !negated.includes(id) && !thirdParty.includes(id)),
            negatedSymptoms: negated,
            thirdPartySymptoms: thirdParty,
            severity: parseRes.attributes.severity,
            location: parseRes.attributes.location,
            duration: parseRes.attributes.duration,
            additional_notes: parseRes.attributes.additional_notes,
            recent_actions: parseRes.attributes.recent_actions,
        };
    }
    // 2. If it's a direct SafetyEvaluationContext
    if ('activeSymptoms' in input && Array.isArray(input.activeSymptoms)) {
        return input;
    }
    // 3. If it's a canonical PatientIntake or partial intake
    const intake = input;
    let active = [];
    if (Array.isArray(intake.symptoms)) {
        active = intake.symptoms.map((s) => String(s).trim());
    }
    else if (typeof intake.symptoms === 'string') {
        active = intake.symptoms
            .split(/[,;\n]+/)
            .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
            .filter(Boolean);
    }
    return {
        activeSymptoms: active,
        severity: intake.severity || null,
        location: intake.location || null,
        duration: intake.duration || null,
        additional_notes: intake.additional_notes || null,
        recent_actions: intake.recent_actions || null,
    };
}
/**
 * Authoritatively evaluates safety for patient intake.
 * Priority: CRITICAL > CAUTION > SAFE.
 */
export function evaluateSafety(input) {
    const ctx = buildSafetyContext(input);
    const matchedRules = SAFETY_RULES.filter((rule) => rule.check(ctx));
    let finalStatus = 'SAFE';
    if (matchedRules.some((r) => r.status === 'CRITICAL')) {
        finalStatus = 'CRITICAL';
    }
    else if (matchedRules.some((r) => r.status === 'CAUTION')) {
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
