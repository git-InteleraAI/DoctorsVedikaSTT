import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";
import QRChatView from "./QRChatView";
import {
    QRLoadingScreen,
    QRExpiredScreen,
    QRCriticalScreen,
    QRErrorScreen,
    QRSubmittedScreen,
} from "./QRStateScreens";

import {
    initDialogue,
    advanceDialogueWithFallback,
} from "../../services/clinical/dialogueEngine";

import { evaluateSafety } from "../../services/clinical/safetyEngine";
import { createQrGeminiFallback } from "../../services/clinical/qrGeminiFallback";
import {
    getQrLanguage,
    localizeDialogue,
    normalizeQrLanguage,
    toCanonicalChip,
    t,
    translateDisplayValue,
} from "../../services/clinical/clinicalLanguage";

import {
    formatReviewSummary,
    getSymptomDisplayName,
} from "../../services/clinical/questionSelector";

import {
    createEmptyPatientIntake,
    normalizePatientIntake,
} from "../../utils/clinical/patientIntake";

import "./QRIntakeChat.css";
import QROnboardingScreens from "./QROnboardingScreens";

const API = getApiBaseUrl();

function createMessage(role, text) {
    return {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role,
        text,
    };
}

function resolveHospitalQuestionnaireKey(hospital) {
    if (!hospital) return "general";
    const text = `${hospital.name || ""} ${hospital.department || ""} ${hospital.specialization || ""}`.toLowerCase();
    if (/\b(dentist|dental|dentistry|tooth|teeth|cavity|orthodont|endodont|periodont)\b/i.test(text)) {
        return "dentist";
    }
    if (/\b(derma|skin|tricholog)\b/i.test(text)) {
        return "dermatologist";
    }
    if (/\b(cardio|heart)\b/i.test(text)) {
        return "cardiologist";
    }
    if (/\b(ortho|bone|joint|spine)\b/i.test(text)) {
        return "orthopedist";
    }
    if (/\b(gyne|obgyn|women|maternity)\b/i.test(text)) {
        return "gynecologist";
    }
    if (/\b(pediatric|child)\b/i.test(text)) {
        return "pediatrician";
    }
    if (/\b(ent|ear|nose|throat)\b/i.test(text)) {
        return "ent";
    }
    if (/\b(neuro|brain)\b/i.test(text)) {
        return "neurologist";
    }
    if (/\b(psychiatr|mental)\b/i.test(text)) {
        return "psychiatrist";
    }
    return "general";
}

export default function QRIntakeChat() {
    const { hospitalCode, accessToken } = useParams();

    const [session, setSession] = useState(null);
    const [hospital, setHospital] = useState(null);
    const [questionnaireKey, setQuestionnaireKey] = useState("general");

    const [dialogueSession, setDialogueSession] = useState(null);
    const [messages, setMessages] = useState([]);
    const [intake, setIntake] = useState(createEmptyPatientIntake());
    const [safetyResult, setSafetyResult] = useState(null);

    const [quickChips, setQuickChips] = useState([]);
    const [input, setInput] = useState("");

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");
    const [isExpired, setIsExpired] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isCritical, setIsCritical] = useState(false);

    // Phase 2 onboarding state. Clinical dialogue starts only after
    // registration success, language selection, and explicit AI consent.
    const [onboardingStep, setOnboardingStep] = useState("language");
    const [selectedLanguage, setSelectedLanguage] = useState("");
    const [aiConsent, setAiConsent] = useState(false);
    const [consentSaving, setConsentSaving] = useState(false);
    const [qrLanguage, setQrLanguage] = useState(() => getQrLanguage());

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, quickChips, processing]);

    // -------------------------------------------------------------
    // Session Initialization
    // -------------------------------------------------------------
    useEffect(() => {
        let isMounted = true;

        const loadSession = async () => {
            try {
                setLoading(true);
                setError("");

                if (!accessToken) {
                    throw new Error("Invalid or missing intake session token.");
                }

                const response = await axios.get(
                    `${API}/api/v1/public/qr/sessions/${encodeURIComponent(
                        accessToken
                    )}`
                );

                if (!isMounted) return;

                if (!response.data?.success) {
                    throw new Error(
                        response.data?.message || "Unable to load intake session."
                    );
                }

                const sessionData = response.data.data.session;
                const hospitalData = response.data.data.hospital;

                setSession(sessionData);
                setHospital(hospitalData);

                // Check expired status
                if (sessionData.status === "expired") {
                    setIsExpired(true);
                    setLoading(false);
                    return;
                }

                // Check already submitted status
                if (sessionData.status === "submitted") {
                    setIsSubmitted(true);
                    setIntake(sessionData.clinicalIntake || {});
                    setLoading(false);
                    return;
                }

                // Check safety blocked status
                if (sessionData.status === "safety_blocked") {
                    setIsCritical(true);
                    setIntake(sessionData.clinicalIntake || {});
                    setLoading(false);
                    return;
                }

                const initialIntake = normalizePatientIntake(
                    sessionData.clinicalIntake || createEmptyPatientIntake()
                );
                setIntake(initialIntake);

                // Initial safety check
                const initialSafety = evaluateSafety(initialIntake);
                setSafetyResult(initialSafety);

                if (initialSafety.status === "CRITICAL") {
                    setIsCritical(true);
                    setLoading(false);
                    return;
                }

                const qKey = resolveHospitalQuestionnaireKey(hospitalData);
                setQuestionnaireKey(qKey);

                // Do not initialize the clinical dialogue until the patient
                // has selected a language and explicitly consented to AI processing.
                // Registration success is already shown by the patient registration
                // flow, so the chat flow starts at language selection.
                const storedOnboarding = JSON.parse(
                    sessionStorage.getItem("dv_qr_intake_onboarding") || "null"
                );
                const storedLanguage = storedOnboarding?.language || "";
                const normalizedLanguage = normalizeQrLanguage(storedLanguage);
                setQrLanguage(normalizedLanguage);
                const storedConsent = sessionData.aiProcessingConsent === true;

                setSelectedLanguage(storedLanguage);
                setAiConsent(storedConsent);

                if (!storedLanguage) {
                    setOnboardingStep("language");
                    setLoading(false);
                    return;
                }

                if (!storedConsent) {
                    setOnboardingStep("consent");
                    setLoading(false);
                    return;
                }

                setOnboardingStep("ready");
                setLoading(false);
                return;

            } catch (err) {
                if (!isMounted) return;
                console.error("[QR Intake] Session loading error:", err);
                if (err.response?.status === 410) {
                    setIsExpired(true);
                } else {
                    setError(
                        err.response?.data?.message ||
                            err.message ||
                            "Unable to load intake session."
                    );
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadSession();

        return () => {
            isMounted = false;
        };
    }, [accessToken]);

    // -------------------------------------------------------------
    // Asynchronous Background Persistence
    // -------------------------------------------------------------
    const persistIntakeToBackend = async (updatedIntake, nextStatus = "collecting") => {
        try {
            if (!accessToken) return;
            await axios.patch(
                `${API}/api/v1/public/qr/sessions/${encodeURIComponent(
                    accessToken
                )}/intake`,
                {
                    clinicalIntake: updatedIntake,
                    status: nextStatus,
                }
            );
        } catch (err) {
            console.warn("[QR Intake] Background sync notice:", err.message);
        }
    };

    // -------------------------------------------------------------
    // Phase 2 Onboarding Handlers
    // -------------------------------------------------------------
    const handleLanguageSelect = (language) => {
        setSelectedLanguage(language);
        setQrLanguage(normalizeQrLanguage(language));
        sessionStorage.setItem(
            "dv_qr_intake_onboarding",
            JSON.stringify({ language, consent: aiConsent })
        );
        setOnboardingStep("consent");
    };

    const handleConsent = async (consentValue) => {
        if (!accessToken || consentSaving) return;

        try {
            setConsentSaving(true);
            setError("");

            const response = await axios.patch(
                `${API}/api/v1/public/qr/sessions/${encodeURIComponent(
                    accessToken
                )}/consent`,
                { aiProcessingConsent: consentValue === true }
            );

            if (!response.data?.success) {
                throw new Error(
                    response.data?.message ||
                        "Unable to save AI processing consent."
                );
            }

            const consent = response.data?.data?.session?.aiProcessingConsent === true;
            setAiConsent(consent);

            sessionStorage.setItem(
                "dv_qr_intake_onboarding",
                JSON.stringify({ language: selectedLanguage, consent })
            );

            if (consent) {
                startSymptomsAssessment(true);
            }
        } catch (err) {
            console.error("[QR Intake] Consent update failed:", err);
            setError(
                err.response?.data?.message ||
                    err.message ||
                    "Unable to save your consent. Please try again."
            );
        } finally {
            setConsentSaving(false);
        }
    };

    function startSymptomsAssessment(consentOverride = aiConsent) {
        if (!selectedLanguage || !consentOverride) return;

        sessionStorage.setItem(
            "dv_qr_intake_onboarding",
            JSON.stringify({
                language: selectedLanguage,
                consent: true,
            })
        );

        const dialogueContext = {
            intakeDraft: intake,
            questionnaireKey: questionnaireKey || "general",
        };
        const initialDialogue = initDialogue(dialogueContext);
        const localizedDialogue = localizeDialogue(initialDialogue, qrLanguage);

        setDialogueSession({
            ...initialDialogue,
            questionnaireKey: questionnaireKey || "general",
        });
        setMessages([
            createMessage(
                "assistant",
                t("welcome", qrLanguage)(hospital?.name || "the clinic")
            ),
            createMessage("assistant", localizedDialogue.botMessage),
        ]);
        setQuickChips(localizedDialogue.quickChips || []);
        setOnboardingStep("started");
    };

    // -------------------------------------------------------------
    // Final Submission Handler
    // -------------------------------------------------------------
    const handleFinalSubmit = async (finalIntake) => {
        try {
            setProcessing(true);
            const response = await axios.post(
                `${API}/api/v1/public/qr/sessions/${encodeURIComponent(
                    accessToken
                )}/submit`,
                {
                    clinicalIntake: finalIntake,
                }
            );

            if (response.data?.safetyBlocked) {
                setIsCritical(true);
                return;
            }

            if (response.data?.success) {
                setIsSubmitted(true);
            } else {
                setError(response.data?.message || "Failed to submit assessment.");
            }
        } catch (err) {
            console.error("[QR Intake] Submission error:", err);
            setError(
                err.response?.data?.message ||
                    err.message ||
                    "Failed to submit assessment."
            );
        } finally {
            setProcessing(false);
        }
    };

    // -------------------------------------------------------------
    // Core Dialogue Progression Handler
    // -------------------------------------------------------------
    const handleProcessInput = async (userInput, isButton = false) => {
        const trimmed = (userInput || "").trim();
        if (!trimmed || processing || isCritical || isExpired || isSubmitted) {
            return;
        }

        const canonicalInput = isButton
            ? toCanonicalChip(trimmed, qrLanguage)
            : trimmed;

        setProcessing(true);
        setError("");

        // 1. Add patient message bubble
        setMessages((prev) => [...prev, createMessage("user", trimmed)]);
        setInput("");

        try {
            // Active session state for dialogue machine
            const activeQKey = dialogueSession?.questionnaireKey || questionnaireKey || "general";
            const currentDialogueState = {
                state: "COLLECTING_SYMPTOMS",
                currentQuestionField: "symptoms",
                ...dialogueSession,
                intake,
                questionnaireKey: activeQKey,
            };

            const inputPayload = {
                type: isButton ? "button" : "text",
                value: canonicalInput,
            };

            // 2. Advance canonical dialogue engine. Gemini is only used for
            // LOW-confidence free-text input; buttons remain deterministic.
            const fallbackFn = !isButton && accessToken
                ? createQrGeminiFallback(API, accessToken)
                : null;

            const nextDialogue = await advanceDialogueWithFallback(
                currentDialogueState,
                inputPayload,
                fallbackFn
            );
            const localizedDialogue = localizeDialogue(nextDialogue, qrLanguage);
            setDialogueSession({
                ...nextDialogue,
                questionnaireKey: activeQKey,
            });

            const updatedIntake = nextDialogue.intake;
            setIntake(updatedIntake);

            const evaluatedSafety = nextDialogue.safetyResult || evaluateSafety(updatedIntake);
            setSafetyResult(evaluatedSafety);

            // 3. Safety Gate Check: Critical stops normal flow immediately
            if (nextDialogue.isCritical || evaluatedSafety.status === "CRITICAL") {
                setIsCritical(true);
                // Inform backend of critical state
                persistIntakeToBackend(updatedIntake, "collecting");
                return;
            }

            // 4. Handle Confirmation intent -> Submit
            if (nextDialogue.state === "CONFIRMING") {
                setMessages((prev) => [
                    ...prev,
                    createMessage("assistant", t("submitting", qrLanguage)),
                ]);
                await handleFinalSubmit(updatedIntake);
                return;
            }

            // 5. Append Assistant Response Message
            setMessages((prev) => [
                ...prev,
                createMessage("assistant", localizedDialogue.botMessage),
            ]);

            setQuickChips(localizedDialogue.quickChips || []);

            // 6. Background persistence of current clinical intake
            const backendStatus = nextDialogue.state === "REVIEW" ? "review" : "collecting";
            persistIntakeToBackend(updatedIntake, backendStatus);
        } catch (err) {
            console.error("[QR Intake] Dialogue step failed:", err);
            setError("Something went wrong processing your message. Please try again.");
        } finally {
            setProcessing(false);
        }
    };

    const handleSubmitForm = (e) => {
        e?.preventDefault();
        handleProcessInput(input, false);
    };

    // -------------------------------------------------------------
    // Render States: Loading
    // -------------------------------------------------------------
    if (loading) { return <QRLoadingScreen qrLanguage={qrLanguage} />; }

    // -------------------------------------------------------------
    // Render States: Expired
    // -------------------------------------------------------------
    if (isExpired) { return <QRExpiredScreen qrLanguage={qrLanguage} hospitalCode={hospitalCode} />; }

    // -------------------------------------------------------------
    // Render States: CRITICAL Emergency Flow
    // -------------------------------------------------------------
    if (isCritical) { return ( <QRCriticalScreen qrLanguage={qrLanguage} hospital={hospital} hospitalCode={hospitalCode} /> ); }

    // -------------------------------------------------------------
    // Render States: COMPLETED / Submitted
    // -------------------------------------------------------------
    if (isSubmitted) { return ( <QRSubmittedScreen session={session} hospital={hospital} hospitalCode={hospitalCode} accessToken={accessToken} intake={intake} /> ); }

    // -------------------------------------------------------------
    // Render States: General Error
    // -------------------------------------------------------------
    if (error && messages.length === 0) { return <QRErrorScreen qrLanguage={qrLanguage} error={error} />; }

    // -------------------------------------------------------------
    // Render States: Phase 2 Registration / Language / Consent / Ready
    // -------------------------------------------------------------
    if (onboardingStep !== "started" && !dialogueSession) {
    return (
        <QROnboardingScreens
            step={onboardingStep}
            qrLanguage={qrLanguage}
            selectedLanguage={selectedLanguage}
            hospital={hospital}
            hospitalCode={hospitalCode}
            error={error}
            consentSaving={consentSaving}
            onSelectLanguage={handleLanguageSelect}
            onChangeLanguage={() => { setError(""); setOnboardingStep("language"); }}
            onConsent={handleConsent}
            onStart={() => startSymptomsAssessment()}
        />
    );
}

    const currentSafetyStatus = safetyResult?.status || "SAFE";

    return (
        <QRChatView
            qrLanguage={qrLanguage}
            hospital={hospital}
            hospitalCode={hospitalCode}
            safetyStatus={currentSafetyStatus}
            messages={messages}
            dialogueSession={dialogueSession}
            intake={intake}
            processing={processing}
            quickChips={quickChips}
            input={input}
            setInput={setInput}
            onSubmit={handleSubmitForm}
            onChip={(chip) => handleProcessInput(chip, true)}
            messagesEndRef={messagesEndRef}
        />
    );
}
