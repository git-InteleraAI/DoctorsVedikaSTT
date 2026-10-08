import { evaluateSafety } from './safetyEngine.js';
import { patientIntakeToAppointmentSymptoms } from '../../utils/clinical/appointmentSymptomsAdapter.js';
import { formatReviewSummary, getQuestionPrompt, selectNextQuestion, } from './questionSelector.js';
import { processDialogueInput, mergeFallbackInterpretation } from './responseProcessor.js';
import { mergePatientIntake } from '../../utils/clinical/mergePatientIntake.js';
const CRITICAL_EMERGENCY_MESSAGE = 'URGENT CLINICAL WARNING: The symptoms described may indicate an emergency requiring immediate medical attention. Please visit the nearest emergency room or hospital immediately, or call local emergency services.';
/**
 * Creates the initial dialogue session and first assistant prompt from Phase 2E session context.
 */
export function initDialogue(sessionContext) {
    const intake = sessionContext.intakeDraft;
    const safetyResult = evaluateSafety(intake);
    const qKey = sessionContext.questionnaireKey || 'general';
    // 1. Safety check on initial intake
    if (safetyResult.status === 'CRITICAL') {
        return {
            state: 'SAFETY_BLOCKED',
            currentQuestionField: null,
            botMessage: CRITICAL_EMERGENCY_MESSAGE,
            quickChips: ['Emergency Services', 'Urgent Clinic Visit'],
            intake,
            safetyResult,
            isCritical: true,
        };
    }
    // 2. Select initial question deterministically
    const nextField = selectNextQuestion(intake, qKey);
    let state = 'COLLECTING_SYMPTOMS';
    if (nextField === 'review') {
        state = 'REVIEW';
    }
    else if (nextField !== 'symptoms') {
        state = 'COLLECTING_ATTRIBUTES';
    }
    const promptConfig = getQuestionPrompt(nextField, intake, qKey);
    let message = promptConfig.prompt;
    if (safetyResult.status === 'CAUTION') {
        message = `[Clinical Caution: Please monitor symptoms closely]\n\n${message}`;
    }
    return {
        state,
        currentQuestionField: nextField === 'review' ? null : nextField,
        botMessage: message,
        quickChips: promptConfig.quickChips,
        intake,
        safetyResult,
        isCritical: false,
        questionnaireKey: qKey,
        reviewSummary: nextField === 'review' ? formatReviewSummary(intake) : undefined,
    };
}
/**
 * Processes patient input (text or button) and advances the dialogue state machine.
 */
export function advanceDialogue(session, input) {
    const qKey = session.questionnaireKey || 'general';

    // If safety is already blocked, prevent normal progression
    if (session.state === 'SAFETY_BLOCKED') {
        return {
            state: 'SAFETY_BLOCKED',
            currentQuestionField: null,
            botMessage: CRITICAL_EMERGENCY_MESSAGE,
            quickChips: ['Emergency Services', 'Urgent Clinic Visit'],
            intake: session.intake,
            safetyResult: session.safetyResult,
            isCritical: true,
            questionnaireKey: qKey,
        };
    }
    // Process the input into an updated canonical intake
    const processed = processDialogueInput(input, session.intake, session.state, session.currentQuestionField, qKey);
    const updatedIntake = processed.updatedIntake;
    // Authoritative clinical safety evaluation
    const safetyResult = evaluateSafety(updatedIntake);
    // If safety triggers CRITICAL: STOP intake flow immediately
    if (safetyResult.status === 'CRITICAL') {
        return {
            state: 'SAFETY_BLOCKED',
            currentQuestionField: null,
            botMessage: CRITICAL_EMERGENCY_MESSAGE,
            quickChips: ['Emergency Services', 'Urgent Clinic Visit'],
            intake: updatedIntake,
            safetyResult,
            isCritical: true,
            questionnaireKey: qKey,
        };
    }
    // Handle Explicit Confirmation intent in REVIEW or ERROR state
    if (processed.userIntent === 'confirm' && (session.state === 'REVIEW' || session.state === 'ERROR')) {
        return {
            state: 'CONFIRMING',
            currentQuestionField: null,
            botMessage: 'Saving your clinical intake summary...',
            quickChips: [],
            intake: updatedIntake,
            safetyResult,
            isCritical: false,
            questionnaireKey: qKey,
            reviewSummary: formatReviewSummary(updatedIntake),
        };
    }
    // Handle Edit intent in REVIEW or COMPLETED state
    if (processed.userIntent === 'edit') {
        const editField = processed.targetField || 'symptoms';
        const state = editField === 'symptoms' ? 'COLLECTING_SYMPTOMS' : 'COLLECTING_ATTRIBUTES';
        const promptConfig = getQuestionPrompt(editField, updatedIntake, qKey);
        return {
            state,
            currentQuestionField: editField,
            botMessage: promptConfig.prompt,
            quickChips: promptConfig.quickChips,
            intake: updatedIntake,
            safetyResult,
            isCritical: false,
            questionnaireKey: qKey,
        };
    }
    // Determine next missing question deterministically
    const nextField = selectNextQuestion(updatedIntake, qKey);
    if (nextField === 'review') {
        const summary = formatReviewSummary(updatedIntake);
        const promptConfig = getQuestionPrompt('review', updatedIntake, qKey);
        let msg = promptConfig.prompt;
        if (safetyResult.status === 'CAUTION') {
            msg = `Clinical Note: Please monitor your symptoms carefully. If they worsen rapidly, seek emergency care.\n\n${msg}`;
        }
        return {
            state: 'REVIEW',
            currentQuestionField: null,
            botMessage: msg,
            quickChips: promptConfig.quickChips,
            intake: updatedIntake,
            safetyResult,
            isCritical: false,
            questionnaireKey: qKey,
            reviewSummary: summary,
        };
    }
    const nextState = nextField === 'symptoms' ? 'COLLECTING_SYMPTOMS' : 'COLLECTING_ATTRIBUTES';
    const promptConfig = getQuestionPrompt(nextField, updatedIntake, qKey);
    let botMessage = promptConfig.prompt;
    if (safetyResult.status === 'CAUTION') {
        botMessage = `Clinical Note: Please monitor your symptoms carefully.\n\n${botMessage}`;
    }
    return {
        state: nextState,
        currentQuestionField: nextField,
        botMessage,
        quickChips: promptConfig.quickChips,
        intake: updatedIntake,
        safetyResult,
        isCritical: false,
        questionnaireKey: qKey,
    };
}
/**
 * Advanced dialogue progression with controlled Gemini fallback for LOW/UNKNOWN confidence input (Phase 2G).
 * If deterministic parsing succeeds (HIGH or MEDIUM), fallbackFn is NEVER invoked.
 */
export async function advanceDialogueWithFallback(session, input, fallbackFn) {
    // If safety is already blocked, prevent normal progression
    if (session.state === 'SAFETY_BLOCKED') {
        return advanceDialogue(session, input);
    }
    // 1. First run the deterministic local processor
    const localProcessed = processDialogueInput(input, session.intake, session.state, session.currentQuestionField, session.questionnaireKey);
    // If button selection or user confirmation/edit intent, always stay deterministic
    if (localProcessed.isButtonSelection || localProcessed.userIntent !== 'continue') {
        return advanceDialogue(session, input);
    }
    // 2. Determine if Gemini fallback is allowed:
    // ONLY when confidence is LOW (no reliable match or severe ambiguity)
    // If deterministic parser recognized negation (e.g. "I don't have chest pain"), do NOT call Gemini.
    const isNegationHandled = (localProcessed.parseResult?.negatedSymptoms?.length ?? 0) > 0;
    const isLowConfidence = localProcessed.confidence === 'LOW' && !isNegationHandled;
    const hasNoExtractedSymptoms = localProcessed.updatedIntake.symptoms.length === session.intake.symptoms.length;
    const isAnsweringSpecificAttribute = session.currentQuestionField &&
        session.currentQuestionField !== 'symptoms' &&
        session.currentQuestionField !== 'review';
    const shouldTriggerFallback = Boolean(fallbackFn) &&
        input.type === 'text' &&
        isLowConfidence &&
        (hasNoExtractedSymptoms || !isAnsweringSpecificAttribute);
    let finalIntake = localProcessed.updatedIntake;
    if (shouldTriggerFallback && fallbackFn) {
        try {
            const fallbackResult = await fallbackFn(input.value, {
                appointmentId: session.activeAppointmentId,
                questionnaireKey: session.questionnaireKey,
                knownIntake: session.intake,
            });
            if (fallbackResult && fallbackResult.extraction) {
                finalIntake = mergeFallbackInterpretation(session.intake, fallbackResult);
            }
        }
        catch (err) {
            // Graceful failure: preserve original text in additional notes
            console.warn('[DialogueEngine] Fallback interpretation failed, continuing deterministically:', err.message);
            if (input.value) {
                finalIntake = mergePatientIntake(finalIntake, {
                    additional_notes: `Patient note: ${input.value}`,
                });
            }
        }
    }
    // 3. Authoritative clinical safety evaluation
    const safetyResult = evaluateSafety(finalIntake);
    // If safety triggers CRITICAL: STOP intake flow immediately
    if (safetyResult.status === 'CRITICAL') {
        return {
            state: 'SAFETY_BLOCKED',
            currentQuestionField: null,
            botMessage: CRITICAL_EMERGENCY_MESSAGE,
            quickChips: ['Emergency Services', 'Urgent Clinic Visit'],
            intake: finalIntake,
            safetyResult,
            isCritical: true,
        };
    }
    // 4. Select next question deterministically
    const nextField = selectNextQuestion(finalIntake, session.questionnaireKey);
    if (nextField === 'review') {
        const summary = formatReviewSummary(finalIntake);
        const promptConfig = getQuestionPrompt('review', finalIntake, session.questionnaireKey);
        let msg = promptConfig.prompt;
        if (safetyResult.status === 'CAUTION') {
            msg = `Clinical Note: Please monitor your symptoms carefully. If they worsen rapidly, seek emergency care.\n\n${msg}`;
        }
        return {
            state: 'REVIEW',
            currentQuestionField: null,
            botMessage: msg,
            quickChips: promptConfig.quickChips,
            intake: finalIntake,
            safetyResult,
            isCritical: false,
            reviewSummary: summary,
        };
    }
    const nextState = nextField === 'symptoms' ? 'COLLECTING_SYMPTOMS' : 'COLLECTING_ATTRIBUTES';
    const promptConfig = getQuestionPrompt(nextField, finalIntake, session.questionnaireKey);
    let botMessage = promptConfig.prompt;
    if (safetyResult.status === 'CAUTION') {
        botMessage = `Clinical Note: Please monitor your symptoms carefully.\n\n${botMessage}`;
    }
    return {
        state: nextState,
        currentQuestionField: nextField,
        botMessage,
        quickChips: promptConfig.quickChips,
        intake: finalIntake,
        safetyResult,
        isCritical: false,
    };
}
/**
 * Persists the finalized intake through the authoritative backend API.
 * Never called for CRITICAL intakes.
 */
export async function persistDialogueIntake(session, patchFn) {
    const safetyResult = evaluateSafety(session.intake);
    // Authoritative safety gate before persistence
    if (safetyResult.status === 'CRITICAL') {
        return {
            state: 'SAFETY_BLOCKED',
            currentQuestionField: null,
            botMessage: CRITICAL_EMERGENCY_MESSAGE,
            quickChips: ['Emergency Services', 'Urgent Clinic Visit'],
            intake: session.intake,
            safetyResult,
            isCritical: true,
        };
    }
    // Entry Point 2: No Appointment -> preserve in session only
    if (session.entryPoint === 'no_appointment' || !session.activeAppointmentId) {
        return {
            state: 'COMPLETED',
            currentQuestionField: null,
            botMessage: 'Your clinical symptom summary has been recorded. You can share this summary when booking an appointment with a specialist.',
            quickChips: ['Find a Specialist', 'Start New Check'],
            intake: session.intake,
            safetyResult,
            isCritical: false,
            reviewSummary: formatReviewSummary(session.intake),
        };
    }
    // Existing Appointment or QR Walk-in -> Persist to backend
    try {
        const payload = patientIntakeToAppointmentSymptoms(session.intake);
        await patchFn(session.activeAppointmentId, payload);
        const docName = session.doctorName ? ` with Dr. ${session.doctorName}` : '';
        const dateStr = session.appointmentDate ? ` for your appointment on ${session.appointmentDate}` : '';
        return {
            state: 'COMPLETED',
            currentQuestionField: null,
            botMessage: `Your clinical intake summary has been successfully saved and synced${docName}${dateStr}. Your doctor will be able to review this prior to your consultation.`,
            quickChips: ['View Intake Summary', 'All Done'],
            intake: session.intake,
            safetyResult,
            isCritical: false,
            reviewSummary: formatReviewSummary(session.intake),
        };
    }
    catch (err) {
        const isUpdateLimitReached = err?.code === 'UPDATE_LIMIT_REACHED' ||
            err?.statusCode === 409 ||
            (typeof err?.message === 'string' &&
                (err.message.includes('UPDATE_LIMIT_REACHED') ||
                    err.message.includes('can only be updated once') ||
                    err.message.includes('already been used')));
        if (isUpdateLimitReached) {
            return {
                state: 'ERROR',
                currentQuestionField: null,
                botMessage: 'Your symptom update has already been used for this appointment.',
                quickChips: ['View Intake Summary', 'All Done'],
                intake: session.intake,
                safetyResult,
                isCritical: false,
                errorMessage: 'Your symptom update has already been used for this appointment.',
                reviewSummary: formatReviewSummary(session.intake),
            };
        }
        return {
            state: 'ERROR',
            currentQuestionField: null,
            botMessage: `We encountered an issue saving your symptoms: ${err.message || 'Unable to sync with clinic database'}. Would you like to try saving again?`,
            quickChips: ['Retry Save', 'Review Summary'],
            intake: session.intake,
            safetyResult,
            isCritical: false,
            errorMessage: err.message || 'Persistence error',
            reviewSummary: formatReviewSummary(session.intake),
        };
    }
}
