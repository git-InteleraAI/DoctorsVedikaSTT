/**
 * frontend/src/shared/clinical/symptoms/deterministicParser.ts
 *
 * Deterministic Patient Input Parser.
 * Converts free-text patient statements and button selections into canonical PatientIntake records.
 *
 * Principles:
 * - Advanced in language understanding (clinical, colloquial, typos, multiple symptoms, context).
 * - Conservative in clinical interpretation (no diagnoses, no invented severity/duration, null preservation).
 * - Full preservation of unmatched patient text.
 * - Single convergence point: PatientIntake.
 */
import { normalizeText, segmentClauses } from './normalizer.js';
import { extractDuration, extractLaterality, extractMedications, extractRecentActions, extractSeverity, extractUnmatchedText, matchSymptomsInClause, } from './matcher.js';
import { DICTIONARY_BY_ID } from '../../data/clinical/symptomDictionary.js';
import { createEmptyPatientIntake, normalizePatientIntake } from './patientIntake.js';
import { mergePatientIntake } from './mergePatientIntake.js';
/**
 * Parses free-text patient input into structured clinical concepts and canonical PatientIntake.
 */
export function parsePatientText(rawText, context) {
    const rawInput = typeof rawText === 'string' ? rawText : '';
    const normalizedInput = normalizeText(rawInput);
    if (!normalizedInput) {
        return {
            matchedSymptoms: [],
            negatedSymptoms: [],
            thirdPartySymptoms: [],
            attributes: {
                location: null,
                duration: null,
                rawDuration: null,
                severity: null,
                recent_actions: null,
                current_medications: null,
                additional_notes: null,
            },
            confidence: 'LOW',
            unmatchedText: null,
            rawInput,
            normalizedInput: '',
            patientIntake: context?.existingIntake || createEmptyPatientIntake(),
        };
    }
    // 1. Segment text into logical clauses with negation and third-party annotations
    const clauses = segmentClauses(normalizedInput);
    const matchedSymptoms = [];
    const negatedSymptoms = [];
    const thirdPartySymptoms = [];
    const allMatchedPhrases = [];
    const seenMatchedIds = new Set();
    for (const clause of clauses) {
        const clauseRes = matchSymptomsInClause(clause, context?.activeSpecialtyKey);
        for (const match of clauseRes.matched) {
            if (!seenMatchedIds.has(match.id)) {
                seenMatchedIds.add(match.id);
                matchedSymptoms.push(match);
            }
        }
        negatedSymptoms.push(...clauseRes.negated);
        thirdPartySymptoms.push(...clauseRes.thirdParty);
        allMatchedPhrases.push(...clauseRes.matchedPhrases);
    }
    // 2. Extract clinical attributes from raw message
    const latRes = extractLaterality(normalizedInput);
    if (latRes.matchedPhrase)
        allMatchedPhrases.push(latRes.matchedPhrase);
    const durRes = extractDuration(normalizedInput);
    if (durRes.matchedPhrase)
        allMatchedPhrases.push(durRes.matchedPhrase);
    const sevRes = extractSeverity(normalizedInput);
    if (sevRes.matchedPhrase)
        allMatchedPhrases.push(sevRes.matchedPhrase);
    const actRes = extractRecentActions(normalizedInput);
    if (actRes.matchedPhrase)
        allMatchedPhrases.push(actRes.matchedPhrase);
    const medRes = extractMedications(normalizedInput);
    if (medRes.matchedPhrase)
        allMatchedPhrases.push(medRes.matchedPhrase);
    const attributes = {
        location: latRes.location,
        duration: durRes.duration,
        rawDuration: durRes.rawDuration,
        severity: sevRes.severity,
        recent_actions: actRes.recent_actions,
        current_medications: medRes.current_medications,
        additional_notes: durRes.rawDuration ? `Duration noted: ${durRes.rawDuration}` : null,
    };
    // 3. Extract unmatched residual text to ensure zero clinical data loss
    const unmatchedText = extractUnmatchedText(rawInput, allMatchedPhrases);
    if (unmatchedText) {
        attributes.additional_notes = attributes.additional_notes
            ? `${attributes.additional_notes}; Patient note: ${unmatchedText}`
            : unmatchedText;
    }
    // 4. Calculate deterministic confidence tier
    let confidence = 'HIGH';
    if (matchedSymptoms.length === 0) {
        // If no symptoms recognized at all, or only third-party symptoms present
        confidence = 'LOW';
    }
    else if (matchedSymptoms.some((s) => s.confidence === 'LOW')) {
        confidence = 'LOW';
    }
    else if (matchedSymptoms.some((s) => s.confidence === 'MEDIUM')) {
        confidence = 'MEDIUM';
    }
    else if (unmatchedText && unmatchedText.length > 25) {
        // Significant unparsed text reduces certainty to MEDIUM
        confidence = 'MEDIUM';
    }
    // 5. Construct canonical PatientIntake model
    const incomingIntake = {
        symptoms: matchedSymptoms.map((m) => m.id),
        location: attributes.location ?? undefined,
        duration: attributes.duration ?? undefined,
        recent_actions: attributes.recent_actions ?? undefined,
        severity: attributes.severity ?? undefined,
        current_medications: attributes.current_medications ?? undefined,
        additional_notes: attributes.additional_notes ?? undefined,
    };
    const patientIntake = context?.existingIntake
        ? mergePatientIntake(context.existingIntake, incomingIntake)
        : normalizePatientIntake(incomingIntake);
    return {
        matchedSymptoms,
        negatedSymptoms,
        thirdPartySymptoms,
        attributes,
        confidence,
        unmatchedText,
        rawInput,
        normalizedInput,
        patientIntake,
    };
}
/**
 * Handles canonical button / chip selection without fuzzy ambiguity.
 * Always produces HIGH confidence.
 */
export function parseSelectedSymptom(canonicalSymptomId, context) {
    const entry = DICTIONARY_BY_ID.get(canonicalSymptomId);
    const matchedSymptoms = entry
        ? [
            {
                id: entry.id,
                canonicalLabel: entry.canonicalLabel,
                matchCategory: 'BUTTON_SELECTION',
                matchedPhrase: entry.canonicalLabel,
                isRedFlag: entry.isRedFlag,
                confidence: 'HIGH',
            },
        ]
        : [
            {
                id: canonicalSymptomId,
                canonicalLabel: canonicalSymptomId,
                matchCategory: 'BUTTON_SELECTION',
                matchedPhrase: canonicalSymptomId,
                confidence: 'HIGH',
            },
        ];
    const incomingIntake = {
        symptoms: [canonicalSymptomId],
    };
    const patientIntake = context?.existingIntake
        ? mergePatientIntake(context.existingIntake, incomingIntake)
        : normalizePatientIntake(incomingIntake);
    return {
        matchedSymptoms,
        negatedSymptoms: [],
        thirdPartySymptoms: [],
        attributes: {
            location: null,
            duration: null,
            rawDuration: null,
            severity: null,
            recent_actions: null,
            current_medications: null,
            additional_notes: null,
        },
        confidence: 'HIGH',
        unmatchedText: null,
        rawInput: entry?.canonicalLabel || canonicalSymptomId,
        normalizedInput: normalizeText(entry?.canonicalLabel || canonicalSymptomId),
        patientIntake,
    };
}
