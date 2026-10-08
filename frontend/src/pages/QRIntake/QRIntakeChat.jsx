import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";


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
    formatLocalizedReviewSummary,
    LANGUAGE_DISPLAY_NAMES,
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
import "./QRPatientOnboarding.css";
import LogoWithName from "../../assets/Logo_with_Name_Beside.png";

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
    if (loading) {
        return (
            <div className="qr-intake-page">
                <div className="qr-loading-container">
                    <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 8px 0" }}>
                        {t("loadingAssessment", qrLanguage)}
                    </h2>
                    <p style={{ margin: 0, color: "#64748b" }}>
                        {t("connecting", qrLanguage)}
                    </p>
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------
    // Render States: Expired
    // -------------------------------------------------------------
    if (isExpired) {
        return (
            <div className="qr-intake-page">
                <div className="qr-error-container">
                    <div style={{ fontSize: "40px", color: "#f59e0b", marginBottom: "12px" }}>
                        ⏳
                    </div>
                    <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 10px 0" }}>
                        {t("sessionExpired", qrLanguage)}
                    </h2>
                    <p style={{ color: "#64748b", margin: "0 0 20px 0", lineHeight: 1.5 }}>
                        {t("sessionExpiredBody", qrLanguage)}
                    </p>
                    <Link
                        to={`/qr/${hospitalCode || "DV-HOSP-003"}`}
                        style={{
                            display: "inline-block",
                            background: "#01b6af",
                            color: "#ffffff",
                            padding: "12px 24px",
                            borderRadius: "12px",
                            textDecoration: "none",
                            fontWeight: 700,
                        }}
                    >
                        {t("scanNewCheckin", qrLanguage)}
                    </Link>
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------
    // Render States: CRITICAL Emergency Flow
    // -------------------------------------------------------------
    if (isCritical) {
        return (
            <div className="qr-intake-page">
                <div className="qr-critical-banner" style={{ maxWidth: "560px", width: "100%" }}>
                    <div className="qr-critical-icon">⚠️</div>
                    <h2 className="qr-critical-title">{t("urgentTitle", qrLanguage)}</h2>
                    <p className="qr-critical-message">
                        {t("urgentBody", qrLanguage)}
                    </p>
                    <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "16px" }}>
                        <a href="tel:112" className="qr-critical-action-btn">
                            {t("emergency112", qrLanguage)}
                        </a>
                        <a href="tel:108" className="qr-critical-action-btn" style={{ background: "#991b1b" }}>
                            {t("ambulance108", qrLanguage)}
                        </a>
                    </div>
                    <p style={{ marginTop: "20px", fontSize: "13px", color: "#991b1b" }}>
                        {t("hospital", qrLanguage)}: {hospital?.name || t("hospitalNameFallback", qrLanguage)}
                    </p>
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------
    // Render States: COMPLETED / Submitted
    // -------------------------------------------------------------
    if (isSubmitted) {
    return (
        <div className="qr-intake-page">
            <div
                className="qr-success-card"
                style={{
                    maxWidth: "920px",
                }}
            >
                <div className="qr-success-icon">✓</div>

                <h2
                    style={{
                        fontSize: "22px",
                        fontWeight: 800,
                        color: "#0f172a",
                        margin: "0 0 8px 0",
                    }}
                >
                    Intake Submitted Successfully
                </h2>

                <p
                    style={{
                        color: "#64748b",
                        margin: "0 0 20px 0",
                        fontSize: "14.5px",
                        lineHeight: 1.6,
                    }}
                >
                    Thank you,{" "}
                    <strong>
                        {session?.patientName ||
                            session?.firstName ||
                            "Patient"}
                    </strong>
                    . Your symptom details have been securely sent
                    to the staff reception desk at{" "}
                    <strong>
                        {hospital?.name ||
                            "Doctors Vedika Hospital"}
                    </strong>
                    .
                </p>

                <div
                    style={{
                        background: "#f8fafc",
                        borderRadius: "14px",
                        padding: "16px 20px",
                        textAlign: "left",
                        marginBottom: "20px",
                        border: "1px solid #e2e8f0",
                    }}
                >
                    <div
                        style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#01b6af",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            marginBottom: "8px",
                        }}
                    >
                        Recorded Assessment Summary
                    </div>

                    <div
                        style={{
                            fontSize: "13.5px",
                            color: "#334155",
                            lineHeight: 1.6,
                            whiteSpace: "pre-line",
                        }}
                    >
                        {formatReviewSummary(intake)}
                    </div>
                </div>

                <div
                    style={{
                        padding: "16px",
                        borderRadius: "14px",
                        background: "#f0fdfa",
                        border: "1px solid #ccfbf1",
                        marginBottom: "20px",
                    }}
                >
                    <div
                        style={{
                            fontSize: "15px",
                            fontWeight: 800,
                            color: "#115e59",
                            marginBottom: "5px",
                        }}
                    >
                        Your assessment is complete
                    </div>

                    <p
                        style={{
                            margin: 0,
                            color: "#475569",
                            fontSize: "13px",
                            lineHeight: 1.5,
                        }}
                    >
                        You can now explore general health
                        education resources while you wait for the
                        staff to assist you.
                    </p>
                </div>

                <p
                    style={{
                        fontSize: "13.5px",
                        color: "#475569",
                        margin: "0 0 20px 0",
                    }}
                >
                    Please proceed to the reception desk or take a
                    seat in the waiting area. The staff will call
                    your name shortly.
                </p>
                <Link
    to={`/qr/${encodeURIComponent(
        hospitalCode || "DV-HOSP-003"
    )}/education/${encodeURIComponent(accessToken)}`}
    className="qr-health-education-btn"
>
    <span>
        <i className="fa-solid fa-heart-pulse" />
        Watch Health Education
    </span>

    <i className="fa-solid fa-arrow-right" />
</Link>

                <div
                    style={{
                        marginTop: "20px",
                        fontSize: "12px",
                        color: "#94a3b8",
                    }}
                >
                    Submitted at:{" "}
                    {new Date().toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </div>
            </div>
        </div>
    );
}

    // -------------------------------------------------------------
    // Render States: General Error
    // -------------------------------------------------------------
    if (error && messages.length === 0) {
        return (
            <div className="qr-intake-page">
                <div className="qr-error-container">
                    <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 10px 0" }}>
                        {t("unableContinue", qrLanguage)}
                    </h2>
                    <p style={{ color: "#64748b", margin: "0 0 20px 0" }}>{error}</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="qr-chip-btn"
                        style={{ background: "#01b6af", color: "#ffffff", padding: "10px 20px" }}
                    >
                        {t("tryAgain", qrLanguage)}
                    </button>
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------
    // Render States: Phase 2 Registration / Language / Consent / Ready
    // -------------------------------------------------------------
    if (onboardingStep !== "started" && !dialogueSession) {
        const onboardingCard = (title, body, content) => (
            <div className="qr-patient-shell">
                <div className="qr-patient-card">
                    <div className="qr-patient-logo-wrap">
                        <img
                            src={LogoWithName}
                            alt="DoctorsVedika"
                            className="qr-patient-logo"
                        />
                    </div>
                    <div className="qr-patient-content">
                        <h2 className="qr-patient-title">{title}</h2>
                        {body && <div className="qr-patient-body">{body}</div>}
                        {content}
                    </div>
                </div>
            </div>
        );

        if (onboardingStep === "language") {
            return (
                <div className="qr-intake-page">
                    {onboardingCard(
                        t("chooseLanguage", qrLanguage),
                        t("chooseLanguageBody", qrLanguage),
                        <div className="qr-patient-language-options">
                            {[
                                ["English", "English"],
                                ["Telugu", "తెలుగు"],
                                ["Hindi", "हिन्दी"],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={`qr-patient-language-btn ${selectedLanguage === value ? "selected" : ""}`}
                                    onClick={() => handleLanguageSelect(value)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (onboardingStep === "consent") {
            return (
                <div className="qr-intake-page">
                    {onboardingCard(
                        t("aiConsent", qrLanguage),
                        t("consentBody", qrLanguage),
                        <>
                            <div className="qr-patient-note">
                                {t("consentNote", qrLanguage)}
                            </div>

                            {error && (
                                <div className="qr-onboarding-error" role="alert">
                                    {error}
                                </div>
                            )}

                            <div className="qr-patient-actions">
                                <button
                                    type="button"
                                    className="qr-patient-secondary"
                                    disabled={consentSaving}
                                    onClick={() => {
                                        setError("");
                                        setOnboardingStep("language");
                                    }}
                                >
                                    ← {t("changeLanguage", qrLanguage)}
                                </button>

                                <button
                                    type="button"
                                    className="qr-patient-primary"
                                    disabled={consentSaving}
                                    onClick={() => handleConsent(true)}
                                >
                                    {consentSaving
                                        ? t("saving", qrLanguage)
                                        : t("startAssessment", qrLanguage)}
                                </button>
                            </div>

                            <button
                                type="button"
                                className="qr-patient-not-now"
                                disabled={consentSaving}
                                onClick={() => handleConsent(false)}
                            >
                                {t("doNotConsent", qrLanguage)}
                            </button>
                        </>
                    )}
                </div>
            );
        }

        if (onboardingStep === "ready") {
            return (
                <div className="qr-intake-page">
                    {onboardingCard(
                        t("ready", qrLanguage),
                        t("readyBody", qrLanguage)(LANGUAGE_DISPLAY_NAMES[selectedLanguage] || selectedLanguage),
                        <>
                            <div className="qr-onboarding-note">
                                {t("readyNote", qrLanguage)}
                            </div>
                            <button
                                type="button"
                                className="qr-onboarding-primary"
                                onClick={startSymptomsAssessment}
                            >
                                {t("startAssessment", qrLanguage)}
                            </button>
                        </>
                    )}
                </div>
            );
        }
    }

    const currentSafetyStatus = safetyResult?.status || "SAFE";

    return (
        <div className="qr-intake-page">
            <div className="qr-intake-chat">
                {/* Header */}
                <header className="qr-intake-header">
                    <div>
                        <div className="qr-intake-brand-badge">DoctorsVedika</div>
                        <h1 className="qr-intake-title">{t("clinicalIntake", qrLanguage)}</h1>
                        <div className="qr-intake-hospital">
                            <span>🏥</span>
                            <span>{hospital?.name || t("hospitalNameFallback", qrLanguage)}</span>
                        </div>
                    </div>
                    <div>
                        <span
                            className={`qr-intake-safety-badge ${
                                currentSafetyStatus === "CRITICAL"
                                    ? "critical"
                                    : currentSafetyStatus === "CAUTION"
                                    ? "caution"
                                    : "safe"
                            }`}
                        >
                            {currentSafetyStatus}
                        </span>
                    </div>
                </header>

                {/* Messages stream */}
                <main className="qr-intake-messages">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`qr-message-group ${message.role}`}
                        >
                            <span className="qr-message-role">
                                {message.role === "assistant" ? t("clinicalAssistant", qrLanguage) : t("you", qrLanguage)}
                            </span>
                            <div className={`qr-message ${message.role}`}>
                                {message.text}
                            </div>
                        </div>
                    ))}

                    {/* Dedicated Review Card when in REVIEW state */}
                    {dialogueSession?.state === "REVIEW" && (
                        <div className="qr-review-card">
                            <div className="qr-review-card-title">
                                <span>📋</span>
                                <span>{t("recordedSummary", qrLanguage)}</span>
                            </div>
                            <div className="qr-review-card-item">
                                <span className="qr-review-card-label">{t("symptoms", qrLanguage)}:</span>
                                <span>
                                    {intake.symptoms?.length
                                        ? intake.symptoms.map((id) => translateDisplayValue(getSymptomDisplayName(id), qrLanguage)).join(", ")
                                        : t("noneNoted", qrLanguage)}
                                </span>
                            </div>
                            {intake.location && (
                                <div className="qr-review-card-item">
                                    <span className="qr-review-card-label">{t("location", qrLanguage)}:</span>
                                    <span>{translateDisplayValue(intake.location, qrLanguage)}</span>
                                </div>
                            )}
                            {intake.duration && (
                                <div className="qr-review-card-item">
                                    <span className="qr-review-card-label">{t("duration", qrLanguage)}:</span>
                                    <span>{translateDisplayValue(intake.duration, qrLanguage)}</span>
                                </div>
                            )}
                            {intake.severity && (
                                <div className="qr-review-card-item">
                                    <span className="qr-review-card-label">{t("severity", qrLanguage)}:</span>
                                    <span>{translateDisplayValue(intake.severity.charAt(0).toUpperCase() + intake.severity.slice(1), qrLanguage)}</span>
                                </div>
                            )}
                            {intake.recent_actions && (
                                <div className="qr-review-card-item">
                                    <span className="qr-review-card-label">{t("actionsMeds", qrLanguage)}:</span>
                                    <span>{translateDisplayValue(intake.recent_actions, qrLanguage)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {processing && (
                        <div className="qr-message-group assistant">
                            <span className="qr-message-role">{t("clinicalAssistant", qrLanguage)}</span>
                            <div className="qr-message assistant" style={{ color: "#64748b" }}>
                                {t("processing", qrLanguage)}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </main>

                {/* Quick Reply Chips */}
                {quickChips && quickChips.length > 0 && !processing && (
                    <div className="qr-quick-chips-container">
                        {quickChips.map((chip, idx) => {
                            const isConfirm = chip.toLowerCase().includes("confirm");
                            return (
                                <button
                                    key={`chip-${idx}-${chip}`}
                                    type="button"
                                    onClick={() => handleProcessInput(chip, true)}
                                    disabled={processing}
                                    className={`qr-chip-btn ${isConfirm ? "confirm" : ""}`}
                                >
                                    {isConfirm ? "✓ " : ""}
                                    {chip}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Message Composer */}
                <footer className="qr-intake-composer">
                    <form onSubmit={handleSubmitForm} className="qr-intake-form">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t("typeResponse", qrLanguage)}
                            disabled={processing}
                            className="qr-intake-input"
                            autoComplete="off"
                        />
                        <button
                            type="submit"
                            disabled={processing || !input.trim()}
                            className="qr-intake-send-btn"
                        >
                            {t("send", qrLanguage)}
                        </button>
                    </form>
                </footer>
            </div>
        </div>
    );
}