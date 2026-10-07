import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";

import {
    initDialogue,
    advanceDialogue,
} from "../../services/clinical/dialogueEngine";

import { evaluateSafety } from "../../services/clinical/safetyEngine";

import {
    formatReviewSummary,
    getSymptomDisplayName,
} from "../../services/clinical/questionSelector";

import {
    createEmptyPatientIntake,
    normalizePatientIntake,
} from "../../utils/clinical/patientIntake";

import "./QRIntakeChat.css";

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

                // Initialize dialogue engine
                const dialogueContext = {
                    intakeDraft: initialIntake,
                    questionnaireKey: qKey,
                };

                const initialDialogue = initDialogue(dialogueContext);
                setDialogueSession({
                    ...initialDialogue,
                    questionnaireKey: qKey,
                });

                if (initialDialogue.isCritical) {
                    setIsCritical(true);
                    setLoading(false);
                    return;
                }

                // Welcome message + initial prompt
                const initialMessages = [
                    createMessage(
                        "assistant",
                        `Welcome to ${
                            hospitalData?.name || "the clinic"
                        }. I will assist you with a brief clinical assessment of your symptoms before you see the doctor.`
                    ),
                    createMessage("assistant", initialDialogue.botMessage),
                ];

                setMessages(initialMessages);
                setQuickChips(initialDialogue.quickChips || []);
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
                value: trimmed,
            };

            // 2. Advance canonical dialogue engine
            const nextDialogue = advanceDialogue(currentDialogueState, inputPayload);
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
                    createMessage("assistant", "Submitting your clinical assessment..."),
                ]);
                await handleFinalSubmit(updatedIntake);
                return;
            }

            // 5. Append Assistant Response Message
            setMessages((prev) => [
                ...prev,
                createMessage("assistant", nextDialogue.botMessage),
            ]);

            setQuickChips(nextDialogue.quickChips || []);

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
                        Loading Assessment...
                    </h2>
                    <p style={{ margin: 0, color: "#64748b" }}>
                        Connecting to hospital clinical desk.
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
                        Session Expired
                    </h2>
                    <p style={{ color: "#64748b", margin: "0 0 20px 0", lineHeight: 1.5 }}>
                        This QR intake session has expired for patient safety. Please scan the hospital QR code again to start a new check-in.
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
                        Scan New Check-in
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
                    <h2 className="qr-critical-title">Urgent Medical Attention Required</h2>
                    <p className="qr-critical-message">
                        The symptoms described may indicate an emergency requiring immediate medical care.
                        Normal intake has been stopped for your safety.
                        Please immediately notify the hospital reception staff or call emergency services.
                    </p>
                    <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "16px" }}>
                        <a href="tel:112" className="qr-critical-action-btn">
                            Call Emergency (112)
                        </a>
                        <a href="tel:108" className="qr-critical-action-btn" style={{ background: "#991b1b" }}>
                            Call Ambulance (108)
                        </a>
                    </div>
                    <p style={{ marginTop: "20px", fontSize: "13px", color: "#991b1b" }}>
                        Hospital: {hospital?.name || "Tooth Medic Family Dental Care"}
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
                <div className="qr-success-card">
                    <div className="qr-success-icon">✓</div>
                    <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: "0 0 8px 0" }}>
                        Intake Submitted Successfully
                    </h2>
                    <p style={{ color: "#64748b", margin: "0 0 20px 0", fontSize: "14.5px" }}>
                        Thank you, <strong>{session?.patientName || session?.firstName || "Patient"}</strong>. Your symptom details have been securely sent to the staff reception desk at <strong>{hospital?.name || "Tooth Medic Family Dental Care"}</strong>.
                    </p>

                    <div style={{ background: "#f8fafc", borderRadius: "14px", padding: "16px 20px", textAlign: "left", marginBottom: "20px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#01b6af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                            Recorded Assessment Summary
                        </div>
                        <div style={{ fontSize: "13.5px", color: "#334155", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                            {formatReviewSummary(intake)}
                        </div>
                    </div>

                    <p style={{ fontSize: "13.5px", color: "#475569", margin: "0 0 20px 0" }}>
                        Please proceed to the reception desk or take a seat in the waiting area. The staff will call your name shortly.
                    </p>

                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                        Submitted at: {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                        Unable to Continue
                    </h2>
                    <p style={{ color: "#64748b", margin: "0 0 20px 0" }}>{error}</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="qr-chip-btn"
                        style={{ background: "#01b6af", color: "#ffffff", padding: "10px 20px" }}
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    const currentSafetyStatus = safetyResult?.status || "SAFE";

    return (
        <div className="qr-intake-page">
            <div className="qr-intake-chat">
                {/* Header */}
                <header className="qr-intake-header">
                    <div>
                        <div className="qr-intake-brand-badge">DoctorsVedika</div>
                        <h1 className="qr-intake-title">Clinical Intake Assessment</h1>
                        <div className="qr-intake-hospital">
                            <span>🏥</span>
                            <span>{hospital?.name || "Tooth Medic Family Dental Care"}</span>
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
                                {message.role === "assistant" ? "Clinical Assistant" : "You"}
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
                                <span>Clinical Summary for Review</span>
                            </div>
                            <div className="qr-review-card-item">
                                <span className="qr-review-card-label">Symptoms:</span>
                                <span>
                                    {intake.symptoms?.length
                                        ? intake.symptoms.map(getSymptomDisplayName).join(", ")
                                        : "None noted"}
                                </span>
                            </div>
                            {intake.location && (
                                <div className="qr-review-card-item">
                                    <span className="qr-review-card-label">Location:</span>
                                    <span>{intake.location}</span>
                                </div>
                            )}
                            {intake.duration && (
                                <div className="qr-review-card-item">
                                    <span className="qr-review-card-label">Duration:</span>
                                    <span>{intake.duration}</span>
                                </div>
                            )}
                            {intake.severity && (
                                <div className="qr-review-card-item">
                                    <span className="qr-review-card-label">Severity:</span>
                                    <span>{intake.severity.toUpperCase()}</span>
                                </div>
                            )}
                            {intake.recent_actions && (
                                <div className="qr-review-card-item">
                                    <span className="qr-review-card-label">Actions/Meds:</span>
                                    <span>{intake.recent_actions}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {processing && (
                        <div className="qr-message-group assistant">
                            <span className="qr-message-role">Clinical Assistant</span>
                            <div className="qr-message assistant" style={{ color: "#64748b" }}>
                                Processing your response...
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
                            placeholder="Type your response here..."
                            disabled={processing}
                            className="qr-intake-input"
                            autoComplete="off"
                        />
                        <button
                            type="submit"
                            disabled={processing || !input.trim()}
                            className="qr-intake-send-btn"
                        >
                            Send
                        </button>
                    </form>
                </footer>
            </div>
        </div>
    );
}