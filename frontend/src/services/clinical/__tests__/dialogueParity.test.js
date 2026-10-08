import assert from 'node:assert/strict';
import { initDialogue, advanceDialogue } from '../dialogueEngine.js';
import { createEmptyPatientIntake } from '../../../utils/clinical/patientIntake.js';
import { formatReviewSummary } from '../questionSelector.js';

console.log('=== RUNNING CLINICAL DIALOGUE PARITY REGRESSION SUITE ===\n');

// -----------------------------------------------------------------------------
// Test Suite 1: Mobile Parity Bug - Tooth Pain Multi-turn Flow
// -----------------------------------------------------------------------------
console.log('Test 1: Dental Multi-Turn Intake (Screenshot Bug Regression)');

let dentalSession = initDialogue({
    intakeDraft: createEmptyPatientIntake(),
    questionnaireKey: 'dentist',
});

assert.equal(dentalSession.state, 'COLLECTING_SYMPTOMS');
assert.equal(dentalSession.currentQuestionField, 'symptoms');
assert.ok(dentalSession.quickChips.includes('Toothache / Severe Tooth Pain'), 'Initial dental chips must include Toothache');

let questionCounts = {
    location: 0,
    duration: 0,
    recent_actions: 0,
    severity: 0,
};

// Turn 1: Patient reports toothache and cavity
dentalSession = advanceDialogue(dentalSession, {
    type: 'text',
    value: 'I am Having the Tooth Pain and Getting the Cavity',
});
assert.equal(dentalSession.currentQuestionField, 'location');
questionCounts.location++;
assert.ok(dentalSession.intake.symptoms.includes('toothache'));
assert.ok(dentalSession.intake.symptoms.includes('cavity'));

// Turn 2: Patient reports location
dentalSession = advanceDialogue(dentalSession, {
    type: 'text',
    value: 'I think it is at the right side',
});
assert.equal(dentalSession.currentQuestionField, 'duration');
questionCounts.duration++;
assert.equal(dentalSession.intake.location, 'Right Side');

// Turn 3: Patient reports duration - MUST NOT RE-ASK LOCATION!
dentalSession = advanceDialogue(dentalSession, {
    type: 'text',
    value: 'From 4 days',
});
if (dentalSession.currentQuestionField === 'location') {
    questionCounts.location++;
}
assert.notEqual(
    dentalSession.currentQuestionField,
    'location',
    'CRITICAL BUG: Location question must NOT be repeated after "From 4 days"!'
);
assert.equal(dentalSession.currentQuestionField, 'recent_actions');
questionCounts.recent_actions++;
assert.equal(dentalSession.intake.location, 'Right Side', 'Location must NOT be wiped out by duration response');
assert.equal(dentalSession.intake.duration, '4 - 7 Days');

// Turn 4: Patient selects recent actions
dentalSession = advanceDialogue(dentalSession, {
    type: 'button',
    value: 'Tried Home Remedies / Ice / Rest',
});
assert.equal(dentalSession.currentQuestionField, 'severity');
questionCounts.severity++;
assert.equal(dentalSession.intake.location, 'Right Side');
assert.equal(dentalSession.intake.duration, '4 - 7 Days');
assert.equal(dentalSession.intake.recent_actions, 'Tried Home Remedies / Ice / Rest');

// Turn 5: Patient selects severity
dentalSession = advanceDialogue(dentalSession, {
    type: 'button',
    value: 'Severe',
});
assert.equal(dentalSession.state, 'REVIEW');
assert.equal(dentalSession.currentQuestionField, null);
assert.equal(dentalSession.intake.severity, 'severe');

// Assertions on question occurrences
assert.equal(questionCounts.location, 1, 'Location asked exactly once');
assert.equal(questionCounts.duration, 1, 'Duration asked exactly once');
assert.equal(questionCounts.recent_actions, 1, 'Recent actions asked exactly once');
assert.equal(questionCounts.severity, 1, 'Severity asked exactly once');

// Assertions on final canonical intake state
assert.ok(dentalSession.intake.symptoms.includes('toothache'));
assert.ok(dentalSession.intake.symptoms.includes('cavity'));
assert.equal(dentalSession.intake.location, 'Right Side');
assert.equal(dentalSession.intake.duration, '4 - 7 Days');
assert.equal(dentalSession.intake.recent_actions, 'Tried Home Remedies / Ice / Rest');
assert.equal(dentalSession.intake.severity, 'severe');

// Assert review summary formatting
const reviewText = formatReviewSummary(dentalSession.intake);
assert.ok(reviewText.includes('Toothache / Severe Tooth Pain'));
assert.ok(reviewText.includes('Right Side'));
assert.ok(reviewText.includes('4 - 7 Days'));
assert.ok(reviewText.includes('Tried Home Remedies / Ice / Rest'));
assert.ok(reviewText.includes('Severe'));
console.log('✓ Test 1 Passed: Dental multi-turn flow has exact Mobile parity and zero field loss!\n');

// -----------------------------------------------------------------------------
// Test Suite 2: General / Systemic Flow (Fever + Headache)
// -----------------------------------------------------------------------------
console.log('Test 2: General Medical Intake (Fever + Headache)');

let genSession = initDialogue({
    intakeDraft: createEmptyPatientIntake(),
    questionnaireKey: 'general',
});

genSession = advanceDialogue(genSession, {
    type: 'text',
    value: 'I have a fever and mild headache since yesterday',
});

assert.ok(genSession.intake.symptoms.includes('fever'));
assert.ok(genSession.intake.symptoms.includes('headache'));
assert.equal(genSession.intake.duration, '1 - 3 Days');
assert.ok(genSession.state === 'COLLECTING_ATTRIBUTES');
console.log('✓ Test 2 Passed: General flow correctly extracts symptoms and duration!\n');

// -----------------------------------------------------------------------------
// Test Suite 3: Critical Emergency Safety Gate
// -----------------------------------------------------------------------------
console.log('Test 3: Critical Red-Flag Safety Emergency Gate');

let safetySession = initDialogue({
    intakeDraft: createEmptyPatientIntake(),
    questionnaireKey: 'general',
});

safetySession = advanceDialogue(safetySession, {
    type: 'text',
    value: 'I have severe chest pain and severe difficulty breathing',
});

assert.equal(safetySession.state, 'SAFETY_BLOCKED');
assert.equal(safetySession.isCritical, true);
assert.equal(safetySession.safetyResult.status, 'CRITICAL');
assert.ok(safetySession.botMessage.includes('URGENT CLINICAL WARNING'));

// Attempting further input must keep the session strictly blocked
const blockedAttempt = advanceDialogue(safetySession, {
    type: 'text',
    value: 'It is getting slightly better',
});
assert.equal(blockedAttempt.state, 'SAFETY_BLOCKED');
assert.equal(blockedAttempt.isCritical, true);
console.log('✓ Test 3 Passed: Critical emergency immediately halts dialogue and blocks further progression!\n');

console.log('================================================================');
console.log('ALL CLINICAL DIALOGUE PARITY TESTS PASSED SUCCESSFULLY (3/3)');
console.log('================================================================\n');
