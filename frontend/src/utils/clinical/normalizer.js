/**
 * frontend/src/shared/clinical/symptoms/normalizer.ts
 *
 * Deterministic text normalization and clause segmentation for clinical language parsing.
 * - Normalizes case, whitespace, apostrophes, and common contractions.
 * - Safely segments sentences into grammatical/logical clauses.
 * - Tags clauses with negation and third-party context.
 */
const CONTRACTIONS = {
    "don't": "do not",
    "dont": "do not",
    "didn't": "did not",
    "didnt": "did not",
    "doesn't": "does not",
    "doesnt": "does not",
    "can't": "cannot",
    "cant": "cannot",
    "won't": "will not",
    "wont": "will not",
    "haven't": "have not",
    "havent": "have not",
    "hasn't": "has not",
    "hasnt": "has not",
    "i'm": "i am",
    "im": "i am",
    "i've": "i have",
    "ive": "i have",
    "it's": "it is",
};
/**
 * Standardize text: lowercases, expands contractions, trims whitespace.
 */
export function normalizeText(input) {
    if (!input || typeof input !== 'string')
        return '';
    let text = input.trim().toLowerCase();
    // Normalize Unicode punctuation (curly quotes, backticks, em-dashes)
    text = text.replace(/[\u2018\u2019]/g, "'");
    text = text.replace(/[\u201C\u201D]/g, '"');
    text = text.replace(/[\u2013\u2014]/g, ' - ');
    // Expand contractions token-wise
    const tokens = text.split(/\s+/);
    const expanded = tokens.map((token) => {
        // Check if token has surrounding single quotes (often from converted curly quotes)
        const core = token.replace(/^[',;!?]+/, '').replace(/[',;!?]+$/, '');
        if (CONTRACTIONS[core]) {
            return CONTRACTIONS[core];
        }
        const clean = token.replace(/[.,;!?]+$/, '');
        const punct = token.slice(clean.length);
        if (CONTRACTIONS[clean]) {
            return CONTRACTIONS[clean] + punct;
        }
        return token;
    });
    text = expanded.join(' ');
    // Collapse repeated whitespaces
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}
/**
 * Common third-party subject indicator regex patterns.
 */
const THIRD_PARTY_PATTERNS = [
    /\bmy (mother|father|mom|dad|son|daughter|kid|child|wife|husband|spouse|brother|sister|friend|colleague|cousin|parent|baby|infant|toddler)\b/i,
    /\b(he|she|they) (has|is having|was having|had|feels|suffers from)\b/i,
    /\bfor my (son|daughter|child|kid|baby|mother|father|mom|dad|wife|husband)\b/i,
];
/**
 * Common negation initiator patterns.
 */
const NEGATION_PATTERNS = [
    /\b(no|not|neither|nor|without|never|negative for|zero|free of)\b/i,
    /\b(do not have|does not have|did not have|have not had|has not had|am not having|is not having)\b/i,
    /\b(not experiencing|not feeling|denies|ruled out)\b/i,
    /\b(pain free|symptom free)\b/i,
];
/**
 * Explicit historical/past indicators that indicate resolved symptoms.
 */
const HISTORICAL_PATTERNS = [
    /\bused to have\b/i,
    /\bhad\s+.*?\s+(?:last month|last year|in the past|weeks ago|months ago|previously)\b/i,
    /\bresolved (yesterday|earlier|last week)\b/i,
    /\bno longer having\b/i,
    /\b(resolved|stopped|gone now|not now)\b/i,
];
/**
 * Breaks a normalized message into logical clauses separated by conjunctions and punctuation.
 * Annotates each clause with negation, third-party subject, and historical flags.
 */
export function segmentClauses(text) {
    if (!text.trim())
        return [];
    // Check if overall sentence is a resolved historical pattern (e.g. "had X yesterday but not now")
    const isSentenceHistorical = /\b(had|experienced|felt)\b.*?\b(yesterday|last week|previously|in the past|earlier|last month)\b.*?\b(resolved|stopped|gone now|not now|(?:do\s+not|don't|dont)\s+have\s+(?:it\s+)?now)\b/i.test(text);
    // Split on clause delimiters: periods, semicolons, contrastive conjunctions, and 'and'
    const rawParts = text
        .split(/[.;!?]|\b(?:but|however|although|yet|except|except for|whereas|and)\b/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    const clauses = [];
    let currentSubjectIsThirdParty = false;
    for (const part of rawParts) {
        const normPart = normalizeText(part);
        if (!normPart)
            continue;
        // Check if third-party subject introduced in this clause
        const isThirdPartyClause = THIRD_PARTY_PATTERNS.some((pat) => pat.test(normPart));
        if (isThirdPartyClause) {
            currentSubjectIsThirdParty = true;
        }
        else if (/\b(i|i am|i have|myself|me)\b/i.test(normPart)) {
            // Re-asserts first-person subject
            currentSubjectIsThirdParty = false;
        }
        // Check negation in this clause
        const isNegated = NEGATION_PATTERNS.some((pat) => pat.test(normPart));
        // Check historical resolved pattern
        const isHistorical = HISTORICAL_PATTERNS.some((pat) => pat.test(normPart)) ||
            (isSentenceHistorical && /\b(had|experienced|felt)\b/i.test(normPart));
        clauses.push({
            rawClause: part,
            normalizedClause: normPart,
            isNegated,
            isThirdParty: isThirdPartyClause || currentSubjectIsThirdParty,
            isHistorical,
        });
    }
    return clauses;
}
