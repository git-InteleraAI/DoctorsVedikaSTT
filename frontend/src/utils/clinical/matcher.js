/**
 * frontend/src/shared/clinical/symptoms/matcher.ts
 *
 * Linguistic matching engine:
 * - Word-boundary token-aware phrase matching
 * - False-positive protection (e.g. "gastroenterologist" != ENT, "painting" != pain)
 * - Attribute extraction (laterality, duration, severity, recent actions, medications)
 * - Preservation of unmatched patient expressions
 */
import { SYMPTOM_DICTIONARY } from '../../data/clinical/symptomDictionary.js';
/**
 * Escapes string for safe regex creation.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Creates a word-boundary regex for a phrase.
 * Ensures whole-token matching so "ent" doesn't match inside "gastroenterologist"
 * and "pain" doesn't match inside "painting".
 */
function makePhraseRegex(phrase) {
    const escaped = escapeRegex(phrase.trim());
    return new RegExp(`\\b${escaped}\\b`, 'i');
}
/**
 * Checks if a clause contains any exclusion expression for a dictionary entry.
 */
function isExcluded(clauseText, exclusions) {
    if (!exclusions || exclusions.length === 0)
        return false;
    return exclusions.some((ex) => makePhraseRegex(ex).test(clauseText));
}
/**
 * Matches symptoms in a single clause, respecting negation and third-party context.
 */
export function matchSymptomsInClause(clause, activeSpecialtyKey) {
    const result = {
        matched: [],
        negated: [],
        thirdParty: [],
        matchedPhrases: [],
    };
    const seenIds = new Set();
    const text = clause.normalizedClause;
    for (const entry of SYMPTOM_DICTIONARY) {
        if (isExcluded(text, entry.exclusionExpressions)) {
            continue;
        }
        let bestMatch = null;
        // 1. Check Canonical Label
        if (makePhraseRegex(entry.canonicalLabel).test(text)) {
            bestMatch = { category: 'CANONICAL', phrase: entry.canonicalLabel, confidence: 'HIGH' };
        }
        // 2. Check Clinical Terms (HIGH)
        if (!bestMatch) {
            for (const term of (entry.clinicalTerms || [])) {
                if (makePhraseRegex(term).test(text)) {
                    bestMatch = { category: 'CLINICAL', phrase: term, confidence: 'HIGH' };
                    break;
                }
            }
        }
        // 3. Check Patient Expressions (HIGH)
        if (!bestMatch) {
            for (const expr of (entry.patientExpressions || [])) {
                if (makePhraseRegex(expr).test(text)) {
                    bestMatch = { category: 'PATIENT_EXPRESSION', phrase: expr, confidence: 'HIGH' };
                    break;
                }
            }
        }
        // 4. Check Descriptive Expressions (HIGH)
        if (!bestMatch) {
            for (const desc of (entry.descriptiveExpressions || [])) {
                if (makePhraseRegex(desc).test(text)) {
                    bestMatch = { category: 'DESCRIPTIVE', phrase: desc, confidence: 'HIGH' };
                    break;
                }
            }
        }
        // 5. Check Colloquial Expressions (HIGH or MEDIUM)
        if (!bestMatch) {
            for (const col of (entry.colloquialExpressions || [])) {
                if (makePhraseRegex(col).test(text)) {
                    bestMatch = { category: 'COLLOQUIAL', phrase: col, confidence: 'HIGH' };
                    break;
                }
            }
        }
        // 6. Check Spelling Variants / Typos (MEDIUM)
        if (!bestMatch) {
            for (const typo of (entry.spellingVariants || [])) {
                if (makePhraseRegex(typo).test(text)) {
                    bestMatch = { category: 'SPELLING_VARIANT', phrase: typo, confidence: 'MEDIUM' };
                    break;
                }
            }
        }
        // 7. Check Abbreviations (MEDIUM or HIGH if specialty matches)
        if (!bestMatch && entry.abbreviations) {
            for (const abbr of (entry.abbreviations || [])) {
                if (makePhraseRegex(abbr).test(text)) {
                    const isSpecialtyMatch = activeSpecialtyKey && entry.specialtyKeys.includes(activeSpecialtyKey);
                    bestMatch = { category: 'CLINICAL', phrase: abbr, confidence: isSpecialtyMatch ? 'HIGH' : 'MEDIUM' };
                    break;
                }
            }
        }
        // 8. Check Contextual Expressions (MEDIUM)
        if (!bestMatch && entry.contextualExpressions) {
            for (const ctx of (entry.contextualExpressions || [])) {
                if (makePhraseRegex(ctx).test(text)) {
                    bestMatch = { category: 'CONTEXTUAL', phrase: ctx, confidence: 'MEDIUM' };
                    break;
                }
            }
        }
        if (bestMatch && !seenIds.has(entry.id)) {
            seenIds.add(entry.id);
            result.matchedPhrases.push(bestMatch.phrase);
            if (clause.isThirdParty) {
                result.thirdParty.push({
                    id: entry.id,
                    canonicalLabel: entry.canonicalLabel,
                    matchCategory: bestMatch.category,
                    matchedPhrase: bestMatch.phrase,
                    isRedFlag: entry.isRedFlag,
                    confidence: 'LOW', // Third party symptoms are not patient-actionable
                });
            }
            else if (clause.isNegated) {
                result.negated.push({
                    id: entry.id,
                    canonicalLabel: entry.canonicalLabel,
                    matchedPhrase: bestMatch.phrase,
                });
            }
            else if (clause.isHistorical) {
                // Historical resolved symptoms: preserve phrase but do not record as active current
                result.negated.push({
                    id: entry.id,
                    canonicalLabel: entry.canonicalLabel,
                    matchedPhrase: `${bestMatch.phrase} (historical)`,
                });
            }
            else {
                result.matched.push({
                    id: entry.id,
                    canonicalLabel: entry.canonicalLabel,
                    matchCategory: bestMatch.category,
                    matchedPhrase: bestMatch.phrase,
                    isRedFlag: entry.isRedFlag,
                    confidence: bestMatch.confidence,
                });
            }
        }
    }
    return result;
}
/**
 * Extracts explicit laterality/location matching the catalog LATERALITY_OPTIONS.
 */
export function extractLaterality(text) {
    const norm = text.toLowerCase();
    if (/\b(left side|left-sided|left|on the left)\b/i.test(norm) && !/\bleft over\b/i.test(norm)) {
        return { location: 'Left Side', matchedPhrase: 'left' };
    }
    if (/\b(right side|right-sided|right|on the right)\b/i.test(norm)) {
        return { location: 'Right Side', matchedPhrase: 'right' };
    }
    if (/\b(both sides|both|bilateral|in both)\b/i.test(norm)) {
        return { location: 'Both Sides', matchedPhrase: 'both sides' };
    }
    if (/\b(upper area|upper back|upper chest|upper)\b/i.test(norm)) {
        return { location: 'Upper Area', matchedPhrase: 'upper area' };
    }
    if (/\b(lower area|lower back|lower tummy|lower abdominal|lower)\b/i.test(norm)) {
        return { location: 'Lower Area', matchedPhrase: 'lower area' };
    }
    return { location: null, matchedPhrase: null };
}
/**
 * Extracts explicit duration matching the catalog DURATION_OPTIONS.
 */
export function extractDuration(text) {
    const norm = text.toLowerCase();
    // Tier 1: < 24 Hours
    if (/\b(today|this morning|few hours|under 24 hours|less than 24 hours|since morning|since last night)\b/i.test(norm)) {
        return { duration: '< 24 Hours', rawDuration: null, matchedPhrase: 'today/recent hours' };
    }
    // Tier 2: 1 - 3 Days
    if (/\b(yesterday|since yesterday|1 day|one day|2 days|two days|3 days|three days|couple of days|past (2|3) days)\b/i.test(norm)) {
        return { duration: '1 - 3 Days', rawDuration: null, matchedPhrase: '1 - 3 days' };
    }
    // Tier 3: 4 - 7 Days
    if (/\b(4 days|four days|5 days|five days|6 days|six days|7 days|seven days|a week|past week|one week|few days)\b/i.test(norm)) {
        return { duration: '4 - 7 Days', rawDuration: null, matchedPhrase: '4 - 7 days / week' };
    }
    // Tier 4: 1 - 2 Weeks
    if (/\b(1-2 weeks|1 to 2 weeks|2 weeks|two weeks|10 days|ten days|12 days|twelve days|past (two|2) weeks)\b/i.test(norm)) {
        return { duration: '1 - 2 Weeks', rawDuration: null, matchedPhrase: '1 - 2 weeks' };
    }
    // Tier 5: 1+ Month
    if (/\b(month|months|1 month|one month|2 months|two months|several months|few months)\b/i.test(norm)) {
        return { duration: '1+ Month', rawDuration: null, matchedPhrase: '1+ month' };
    }
    // Tier 6: Chronic / Ongoing
    if (/\b(chronic|ongoing|long time|years|always)\b/i.test(norm)) {
        return { duration: 'Chronic / Ongoing', rawDuration: null, matchedPhrase: 'chronic/ongoing' };
    }
    // Raw unmapped temporal expressions (e.g. "since Monday", "started after dinner")
    const rawTemporalMatch = norm.match(/\b(since [a-z0-9]+|started after [a-z0-9 ]+)\b/i);
    if (rawTemporalMatch) {
        return { duration: null, rawDuration: rawTemporalMatch[0], matchedPhrase: rawTemporalMatch[0] };
    }
    return { duration: null, rawDuration: null, matchedPhrase: null };
}
/**
 * Extracts explicit severity matching the catalog SEVERITY_OPTIONS.
 */
export function extractSeverity(text) {
    const norm = text.toLowerCase();
    // Severe
    if (/\b(severe|very severe|acute|intense|excruciating|extreme|terrible|unbearable|killing me|badly)\b/i.test(norm)) {
        return { severity: 'severe', matchedPhrase: 'severe' };
    }
    // Moderate
    if (/\b(moderate|medium|noticeable|somewhat bad)\b/i.test(norm)) {
        return { severity: 'moderate', matchedPhrase: 'moderate' };
    }
    // Mild
    if (/\b(mild|slight|minor|a little bit|low grade|barely noticeable)\b/i.test(norm)) {
        return { severity: 'mild', matchedPhrase: 'mild' };
    }
    // Unsure
    if (/\b(unsure|not sure|uncertain|need evaluation)\b/i.test(norm)) {
        return { severity: 'unsure', matchedPhrase: 'unsure' };
    }
    return { severity: null, matchedPhrase: null };
}
/**
 * Extracts explicit recent self-care actions matching catalog RECENT_ACTIONS_OPTIONS.
 */
export function extractRecentActions(text) {
    const norm = text.toLowerCase();
    if (/\b(took (otc|medicine|painkiller|paracetamol|dolo|crocin|advil|tylenol|pill)|taken (medicine|painkiller))\b/i.test(norm)) {
        return { recent_actions: 'Took OTC Medicine (e.g. Paracetamol)', matchedPhrase: 'took medicine' };
    }
    if (/\b(home remedies|ice pack|applied ice|took rest|resting|steam|gargle|salt water)\b/i.test(norm)) {
        return { recent_actions: 'Tried Home Remedies / Ice / Rest', matchedPhrase: 'home remedies / ice / rest' };
    }
    if (/\b(saw another doctor|consulted (another|a) doctor|went to clinic|visited doctor)\b/i.test(norm)) {
        return { recent_actions: 'Consulted Another Doctor Recently', matchedPhrase: 'saw another doctor' };
    }
    if (/\b(applied (cream|ointment|gel)|used (gel|cream|balm)|volini|moov)\b/i.test(norm)) {
        return { recent_actions: 'Applied Topical Gel / Cream', matchedPhrase: 'applied cream/gel' };
    }
    if (/\b(nothing yet|have not taken anything|haven't taken anything|not done anything)\b/i.test(norm)) {
        return { recent_actions: 'Nothing Yet', matchedPhrase: 'nothing yet' };
    }
    return { recent_actions: null, matchedPhrase: null };
}
/**
 * Extracts specific medication names stated by the patient.
 */
export function extractMedications(text) {
    const norm = text.toLowerCase();
    // Pattern: "taking <medication>" or "taking <med> <dose>"
    const medMatch = norm.match(/\b(taking|on|took)\s+([a-z0-9\-]+(?:\s+(?:mg|mcg|tablet|tablets|pills?|capsule|650|500|250))?)\b/i);
    const nonMedWords = new Set([
        'medicine',
        'medicines',
        'pill',
        'pills',
        'painkiller',
        'painkillers',
        'something',
        'some',
        'some medicine',
        'rest',
        'any',
        'my',
        'the',
        'care',
        'it',
    ]);
    if (medMatch && !nonMedWords.has(medMatch[2].trim().toLowerCase())) {
        return { current_medications: medMatch[2].trim(), matchedPhrase: medMatch[0] };
    }
    return { current_medications: null, matchedPhrase: null };
}
/**
 * Extracts unmatched text by removing all matched phrases and cleaning conversational filler words.
 */
export function extractUnmatchedText(rawInput, matchedPhrases) {
    if (!rawInput.trim())
        return null;
    let residual = rawInput;
    for (const phrase of matchedPhrases) {
        if (!phrase || phrase.length < 2)
            continue;
        const re = new RegExp(escapeRegex(phrase), 'gi');
        residual = residual.replace(re, ' ');
    }
    // Remove common conversational filler tokens
    const fillerRegex = /\b(i have|i am|i feel|i had|i|am|have|having|feeling|there is|there was|and|also|with|for|a|an|the|my|of|to|in|on|since|it|feels?|like)\b/gi;
    residual = residual.replace(fillerRegex, ' ');
    // Clean remaining punctuation and whitespace
    residual = residual.replace(/[.,;!?\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    // Return non-trivial residual (at least 3 characters)
    return residual.length >= 3 ? residual : null;
}
