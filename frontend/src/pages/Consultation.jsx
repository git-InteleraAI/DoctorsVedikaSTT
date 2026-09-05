import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";



const PYTHON_WS_URL = import.meta.env.VITE_PYTHON_WS_URL;
const NODE_API_URL = import.meta.env.VITE_NODE_API_URL;


const PROCESSING_STEPS = [
    {
        title: "Analyzing Multimodal Audio",
        desc: "Processing audio waveform & speech nuances",
        icon: "fa-solid fa-wave-square",
    },
    {
        title: "Native Script Transcription",
        desc: "Transcribing Telugu, Hindi & English verbatim with speaker diarization",
        icon: "fa-solid fa-language",
    },
    {
        title: "Clinical Entity & History Extraction",
        desc: "Extracting chief complaints, past medical history, symptoms & vitals",
        icon: "fa-solid fa-file-medical",
    },
    {
        title: "Formulating Prescriptions & Advice",
        desc: "Structuring medications, dosages, frequency & follow-up instructions",
        icon: "fa-solid fa-prescription-bottle-medical",
    },
    {
        title: "Finalizing Clinical Summary",
        desc: "Preparing comprehensive medical chart for doctor's review",
        icon: "fa-solid fa-sparkles",
    },
];

const Consultation = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const appointmentId = location.state?.appointmentId || searchParams.get("appointmentId") || null;
    const doctorId = location.state?.doctorId || "default-doctor";
    const appointmentPatient = location.state?.patient;
    const [fetchedPatientInfo, setFetchedPatientInfo] = useState(null);
    const [problemDetails, setProblemDetails] = useState({
        symptoms: location.state?.symptoms || location.state?.reason || appointmentPatient?.symptoms || appointmentPatient?.reason || "",
        duration: location.state?.duration || appointmentPatient?.duration || "",
        severity: location.state?.severity || appointmentPatient?.severity || "",
        currentMedications: location.state?.current_medications || location.state?.currentMedications || appointmentPatient?.current_medications || "",
        additionalNotes: location.state?.additional_notes || location.state?.additionalNotes || appointmentPatient?.additional_notes || "",
    });

    const [vitals, setVitals] = useState({
        bloodGroup: appointmentPatient?.bloodGroup || appointmentPatient?.blood_group || "",
        weight: appointmentPatient?.weight || "",
        bloodPressure: appointmentPatient?.bloodPressure || appointmentPatient?.blood_pressure || "",
        allergies: appointmentPatient?.allergies || "",
    });

    const resolveCleanPatientCode = (code, rawId) => {
        if (code && typeof code === "string" && !code.includes("-") && code.length <= 15) {
            return `DV-P-${code}`;
        }
        if (code && typeof code === "string" && code.startsWith("DV-P-")) {
            return code;
        }
        if (rawId && typeof rawId === "string" && rawId.length > 20) {
            return `DV-P-${rawId.slice(0, 6).toUpperCase()}`;
        }
        return code || "DV-P-000086";
    };

    useEffect(() => {
        if (!patientId) return;
        const NODE_API_URL = import.meta.env.VITE_NODE_API_URL || "http://localhost:8005";
        const token = localStorage.getItem("token") || localStorage.getItem("sb-access-token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // 1. Fetch symptoms directly from public.appointment_symptoms table
        fetch(`${NODE_API_URL}/api/appointments/symptoms/details?patientId=${patientId}&appointmentId=${appointmentId || ""}`, { headers })
            .then((res) => (res.ok ? res.json() : null))
            .then((symRes) => {
                if (symRes?.success && symRes?.symptoms) {
                    const s = symRes.symptoms;
                    setProblemDetails((prev) => ({
                        symptoms: s.symptoms || prev.symptoms || "",
                        duration: s.duration || prev.duration || "",
                        severity: s.severity || prev.severity || "",
                        currentMedications: s.current_medications || s.currentMedications || prev.currentMedications || "",
                        additionalNotes: s.additional_notes || s.additionalNotes || prev.additionalNotes || "",
                    }));
                }
            })
            .catch(() => {});

        // 2. Fetch Patient & Appointment details
        fetch(`${NODE_API_URL}/api/patients`, { headers })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data) return fetch(`${NODE_API_URL}/api/appointments`, { headers }).then((r) => (r.ok ? r.json() : null));
                const list = Array.isArray(data) ? data : data?.data || data?.patients || [];
                const matched = list.find((p) => p.user_id === patientId || p.id === patientId || p.patient_code === patientId);
                if (matched) {
                    let calcAge = "";
                    if (matched.date_of_birth) {
                        const dob = new Date(matched.date_of_birth);
                        if (!isNaN(dob.getTime())) {
                            calcAge = String(new Date().getFullYear() - dob.getFullYear());
                        }
                    }
                    setFetchedPatientInfo({
                        code: matched.patient_code || matched.patient_number || "",
                        name: matched.full_name || matched.first_name || matched.name || "",
                        age: matched.age || calcAge,
                        gender: matched.gender ? matched.gender.charAt(0).toUpperCase() + matched.gender.slice(1) : "",
                    });
                    return null;
                }
                return fetch(`${NODE_API_URL}/api/appointments`, { headers }).then((r) => (r.ok ? r.json() : null));
            })
            .then((appData) => {
                if (!appData) return;
                const list = Array.isArray(appData) ? appData : appData?.data || [];
                const matched = list.find((a) => a.patient_id === patientId || a.patientId === patientId || a.id === patientId || a.user_id === patientId || a.id === appointmentId);
                if (matched) {
                    setFetchedPatientInfo((prev) => ({
                        code: matched.patient_code || matched.patient_number || matched.patientCode || prev?.code || "",
                        name: matched.patient_name || matched.patientName || matched.full_name || matched.name || prev?.name || "",
                        age: matched.age || matched.patient_age || prev?.age || "",
                        gender: matched.gender || matched.patient_gender || prev?.gender || "",
                    }));

                    setProblemDetails((prev) => ({
                        symptoms: prev.symptoms || matched.symptoms || matched.reason || matched.chief_complaint || "",
                        duration: prev.duration || matched.duration || "",
                        severity: prev.severity || matched.severity || "",
                        currentMedications: prev.currentMedications || matched.currentMedications || matched.current_medications || "",
                        additionalNotes: prev.additionalNotes || matched.additionalNotes || matched.additional_notes || "",
                    }));

                    if (matched.blood_group || matched.weight || matched.blood_pressure || matched.allergies) {
                        setVitals((prev) => ({
                            bloodGroup: matched.blood_group || matched.bloodGroup || prev.bloodGroup,
                            weight: matched.weight || prev.weight,
                            bloodPressure: matched.blood_pressure || matched.bloodPressure || prev.bloodPressure,
                            allergies: matched.allergies || prev.allergies,
                        }));
                    }
                }
            })
            .catch(() => {});
    }, [patientId, appointmentId]);

    const patient = {
        id: resolveCleanPatientCode(fetchedPatientInfo?.code || appointmentPatient?.patient_code || appointmentPatient?.patientCode, patientId),
        name: fetchedPatientInfo?.name || (appointmentPatient?.patientName && appointmentPatient?.patientName !== "Unknown Patient" ? appointmentPatient.patientName : null) || appointmentPatient?.name || "Patient",
        age: fetchedPatientInfo?.age || (appointmentPatient?.age && appointmentPatient?.age !== "Not Available" ? appointmentPatient.age : null) || "N/A",
        gender: fetchedPatientInfo?.gender || (appointmentPatient?.gender && appointmentPatient?.gender !== "Not Available" ? appointmentPatient.gender : null) || "N/A",
        bloodGroup: vitals.bloodGroup || appointmentPatient?.bloodGroup || "",
        weight: vitals.weight || appointmentPatient?.weight || "",
        bloodPressure: vitals.bloodPressure || appointmentPatient?.bloodPressure || "",
        allergies: vitals.allergies || appointmentPatient?.allergies || "",
        history: appointmentPatient?.history || "",
        reason: problemDetails.symptoms || appointmentPatient?.reason || "General Consultation",
        isVerified: true
    };

    const getFullPatientIntakeContext = () => {
        const parts = [];
        if (patient.name && patient.name !== "Patient") parts.push(`Patient Name: ${patient.name}`);
        if (patient.age && patient.age !== "N/A") parts.push(`Patient Age: ${patient.age}`);
        if (patient.gender && patient.gender !== "N/A") parts.push(`Patient Gender: ${patient.gender}`);
        if (problemDetails.symptoms) parts.push(`Reported Symptoms: ${problemDetails.symptoms}`);
        if (problemDetails.duration) parts.push(`Duration: ${problemDetails.duration}`);
        if (problemDetails.severity) parts.push(`Severity: ${problemDetails.severity}`);
        if (problemDetails.currentMedications) parts.push(`Current Medications: ${problemDetails.currentMedications}`);
        if (problemDetails.additionalNotes) parts.push(`Additional Notes: ${problemDetails.additionalNotes}`);
        if (vitals.bloodPressure) parts.push(`BP: ${vitals.bloodPressure}`);
        if (vitals.weight) parts.push(`Weight: ${vitals.weight}`);
        if (vitals.allergies && vitals.allergies !== "None") parts.push(`Allergies: ${vitals.allergies}`);
        if (vitals.bloodGroup) parts.push(`Blood Group: ${vitals.bloodGroup}`);
        return parts.join(" | ") || patient.reason || "";
    };

    // ============================================================
    // STATE
    // ============================================================

    const [isRecording, setIsRecording] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] =
        useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);

    // Stable ID for this consultation session.
    // This will be used by the backend in the next optimization phase.
    const [consultationId] = useState(
        () => `consultation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    );

    const [transcript, setTranscript] = useState([]);
    const [liveInterimText, setLiveInterimText] = useState("");
    const [error, setError] = useState("");

    const [language, setLanguage] = useState("auto");
    const [isPaused, setIsPaused] = useState(false);

    // Summary progress states
    const [summaryProgress, setSummaryProgress] = useState(0);
    const [summaryStage, setSummaryStage] = useState(0);
    const [summaryElapsedSeconds, setSummaryElapsedSeconds] = useState(0);

    // ============================================================
    // REFS & HELPERS
    // ============================================================

    const websocketRef = useRef(null);
    const speechRecognitionRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const transcriptContainerRef = useRef(null);
    const messagesEndRef = useRef(null);
    const recognitionActiveRef = useRef(false);
    const timerIntervalRef = useRef(null);
    const startTimeRef = useRef(null);
    const summaryIntervalRef = useRef(null);

    const formatDuration = (totalSecs = 0) => {
        const total = Math.max(0, Math.floor(Number(totalSecs) || 0));
        const hrs = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        const secs = total % 60;
        if (hrs > 0) {
            return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        }
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    // Store the COMPLETE recording.
    const audioChunksRef = useRef([]);

    // Always keep the latest transcript outside React state as well.
    // This prevents the End/Process flow from reading a stale state snapshot.
    const transcriptRef = useRef([]);

    // Prevent duplicate live transcript lines.
    const lastTranscriptRef = useRef("");

    // Resolves when the Python speech service confirms that it has stopped.
    const websocketStopResolverRef = useRef(null);

    // Used to prevent stale WebSocket messages after stopping.
    const sessionActiveRef = useRef(false);

    // Instant Summary Pre-computation Optimization
    const lastPreparedCountRef = useRef(0);
    const lastPrepareTimeRef = useRef(0);

    const triggerBackgroundSummaryPrepare = (currentTranscript, force = false) => {
        if (!currentTranscript || currentTranscript.length < 2) return;
        const now = Date.now();
        if (force || (currentTranscript.length >= lastPreparedCountRef.current + 3 && (now - lastPrepareTimeRef.current) > 8000)) {
            lastPreparedCountRef.current = currentTranscript.length;
            lastPrepareTimeRef.current = now;
            console.log(`[Consultation] Pre-generating background AI summary for ${currentTranscript.length} transcript lines...`);
            fetch(`${NODE_API_URL}/api/consultation/prepare`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doctorId,
                    patientId: patient.id,
                    appointmentId: String(appointmentId),
                    consultationId,
                    liveTranscript: JSON.stringify(currentTranscript),
                    patientReason: getFullPatientIntakeContext(),
                }),
            }).catch((err) => console.warn("[Consultation] Background summary prepare notice:", err.message));
        }
    };

    // ============================================================
    // CLEANUP & AUTO-SCROLL
    // ============================================================

    useEffect(() => {
        return () => {
            cleanupRecording();
        };
    }, []);

    useEffect(() => {
        if (!isGeneratingSummary) {
            return;
        }

        if (summaryProgress < 22) setSummaryStage(0);
        else if (summaryProgress < 48) setSummaryStage(1);
        else if (summaryProgress < 72) setSummaryStage(2);
        else if (summaryProgress < 92) setSummaryStage(3);
        else setSummaryStage(4);
    }, [summaryProgress, isGeneratingSummary]);

    useEffect(() => {
        if (isRecording && language) {
            console.log("[Consultation] Language updated during recording:", language);
            // stopBrowserSpeechRecognition();
            // startBrowserSpeechRecognition();
        }
    }, [language]);

    // Continuous smooth auto-scroll transcript to bottom as new text arrives
    useEffect(() => {
        const scrollToBottom = () => {
            if (transcriptContainerRef.current) {
                transcriptContainerRef.current.scrollTo({
                    top: transcriptContainerRef.current.scrollHeight,
                    behavior: "smooth"
                });
            }
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
            }
        };

        scrollToBottom();
        const rAF = requestAnimationFrame(scrollToBottom);
        const timeoutId = setTimeout(scrollToBottom, 120);
        return () => {
            cancelAnimationFrame(rAF);
            clearTimeout(timeoutId);
        };
    }, [transcript, liveInterimText]);

    // ============================================================
    // BACKGROUND AI SUMMARY SYNC
    // ============================================================
    useEffect(() => {
        if (!isListening || !sessionActiveRef.current) return;

        const syncInterval = setInterval(async () => {
            const currentTranscript = transcriptRef.current;
            if (!currentTranscript || currentTranscript.length === 0) return;

            try {
                await fetch(`${NODE_API_URL}/api/consultation/prepare`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        doctorId: doctorId,
                        patientId: patient.id,
                        appointmentId: String(appointmentId),
                        consultationId: consultationId,
                        liveTranscript: currentTranscript,
                        patientReason: getFullPatientIntakeContext(),
                    }),
                });
            } catch (error) {
                console.warn("[Background Sync] Failed to sync transcript:", error);
            }
        }, 30000); // Sync every 30 seconds

        return () => clearInterval(syncInterval);
    }, [isListening, doctorId, patient.id, appointmentId, consultationId]);

    // ============================================================
    // CLEANUP
    // ============================================================

    const cleanupRecording = () => {
        sessionActiveRef.current = false;
        setIsPaused(false);

        if (summaryIntervalRef.current) {
            clearInterval(summaryIntervalRef.current);
            summaryIntervalRef.current = null;
        }

        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }

        try {
            if (mediaRecorderRef.current) {
                if (
                    mediaRecorderRef.current.state !== "inactive"
                ) {
                    mediaRecorderRef.current.stop();
                }
            }
        } catch (error) {
            console.warn(
                "MediaRecorder cleanup error:",
                error
            );
        }

        try {
            if (mediaStreamRef.current) {
                mediaStreamRef.current
                    .getTracks()
                    .forEach((track) => track.stop());
            }
        } catch (error) {
            console.warn(
                "Media stream cleanup error:",
                error
            );
        }

        try {
            if (websocketRef.current) {
                if (
                    websocketRef.current.readyState ===
                    WebSocket.OPEN
                ) {
                    websocketRef.current.send(
                        JSON.stringify({
                            type: "stop"
                        })
                    );
                }

                websocketRef.current.close();
            }
        } catch (error) {
            console.warn(
                "WebSocket cleanup error:",
                error
            );
        }

        websocketRef.current = null;
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
    };

    // ============================================================
    // PAUSE & RESUME CONSULTATION
    // ============================================================

    const pauseConsultation = () => {
        if (!isRecording || isPaused) return;

        console.log("[Consultation] Pausing consultation...");
        setIsPaused(true);
        setIsListening(false);

        // Pause timer
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }

        // Pause MediaRecorder
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                mediaRecorderRef.current.pause();
                console.log("[Consultation] MediaRecorder paused.");
            }
        } catch (e) {
            console.warn("Pause MediaRecorder warning:", e);
        }

        // Pause Speech Recognition
        try {
            stopBrowserSpeechRecognition();
        } catch (e) {
            console.warn("Pause SpeechRecognition warning:", e);
        }

        // Send pause to Python WebSocket
        try {
            if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
                websocketRef.current.send(JSON.stringify({ type: "pause" }));
            }
        } catch (e) {
            console.warn("Pause WS warning:", e);
        }
    };

    const resumeConsultation = () => {
        if (!isRecording || !isPaused) return;

        console.log("[Consultation] Resuming consultation...");
        setIsPaused(false);
        setIsListening(true);

        // Resume timer
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
            setRecordingSeconds((prev) => prev + 1);
        }, 1000);

        // Resume MediaRecorder
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
                mediaRecorderRef.current.resume();
                console.log("[Consultation] MediaRecorder resumed.");
            } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
                mediaRecorderRef.current.start(1500);
            }
        } catch (e) {
            console.warn("Resume MediaRecorder warning:", e);
        }

        // Resume Speech Recognition removed (relying exclusively on Sarvam STT)
        // try {
        //     startBrowserSpeechRecognition();
        // } catch (e) {
        //     console.warn("Resume SpeechRecognition warning:", e);
        // }

        // Send resume to Python WebSocket
        try {
            if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
                websocketRef.current.send(JSON.stringify({ type: "resume" }));
            }
        } catch (e) {
            console.warn("Resume WS warning:", e);
        }
    };

    // ============================================================
    // LANGUAGE
    // ============================================================

    const getLanguageParameter = () => {
        if (language === "te-IN" || language === "telugu" || language === "telugu+english") {
            return "telugu+english";
        }

        if (language === "hi-IN" || language === "hindi" || language === "hindi+english") {
            return "hindi+english";
        }

        if (language === "en-IN" || language === "english") {
            return "english";
        }

        return "auto";
    };

    // ============================================================
    // WEBSOCKET
    // ============================================================

    const connectWebSocket = () => {
        return new Promise((resolve, reject) => {
            const doctorIdValue = doctorId;
            const patientIdValue = patient.id;

            const url =
                `${PYTHON_WS_URL}` +
                `?doctor_id=${encodeURIComponent(
                    doctorIdValue
                )}` +
                `&patient_id=${encodeURIComponent(
                    patientIdValue
                )}` +
                `&language=${encodeURIComponent(
                    getLanguageParameter()
                )}`;

            console.log(
                "[Consultation] Connecting:",
                url
            );

            let ws;

            try {
                ws = new WebSocket(url);
            } catch (error) {
                reject(error);
                return;
            }

            websocketRef.current = ws;

            ws.onopen = () => {
                console.log(
                    "[Consultation] WebSocket connected"
                );

                setIsListening(true);

                resolve(ws);
            };

            ws.onmessage = (event) => {
                try {
                    const message =
                        JSON.parse(event.data);

                    console.log(
                        "[Consultation] WS message:",
                        message
                    );

                    // --------------------------------------------
                    // CONNECTION
                    // --------------------------------------------

                    if (
                        message.type === "connected"
                    ) {
                        return;
                    }

                    // --------------------------------------------
                    // LIVE TRANSCRIPT
                    // --------------------------------------------

                    if (
                        message.type === "transcript"
                    ) {
                        const text =
                            message.text?.trim();

                        if (!text) {
                            return;
                        }

                        /*
                         * Avoid adding exactly the same
                         * segment repeatedly.
                         */
                        if (
                            text ===
                            lastTranscriptRef.current
                        ) {
                            return;
                        }

                        lastTranscriptRef.current =
                            text;

                        const newLine = {
                            speaker:
                                message.speaker ||
                                "Conversation",
                            text,
                            timestamp:
                                message.timestamp ??
                                new Date().toISOString(),
                            isFinal: true,
                        };

                        setTranscript((previous) => {
                            const nextTranscript = [
                                ...previous,
                                newLine,
                            ];

                            transcriptRef.current = nextTranscript;
                            triggerBackgroundSummaryPrepare(nextTranscript);
                            return nextTranscript;
                        });

                        return;
                    }

                    // --------------------------------------------
                    // ERROR
                    // --------------------------------------------

                    if (
                        message.type === "error"
                    ) {
                        console.error(
                            "[Consultation] Python service error:",
                            message.message
                        );

                        setError(
                            message.message ||
                            "Speech processing error."
                        );

                        return;
                    }

                    // --------------------------------------------
                    // STOPPED
                    // --------------------------------------------

                    if (message.type === "stopped") {
                        console.log(
                            "[Consultation] Python service stopped"
                        );

                        if (websocketStopResolverRef.current) {
                            const resolveStop = websocketStopResolverRef.current;
                            websocketStopResolverRef.current = null;
                            resolveStop();
                        }
                    }
                } catch (error) {
                    console.error(
                        "[Consultation] Invalid WS message:",
                        error
                    );
                }
            };

            ws.onerror = (event) => {
                console.error(
                    "[Consultation] WebSocket error:",
                    event
                );

                setIsListening(false);

                reject(
                    new Error(
                        "Unable to connect to the speech processing server."
                    )
                );
            };

            ws.onclose = () => {
                console.log(
                    "[Consultation] WebSocket closed"
                );

                setIsListening(false);
            };
        });
    };

    // ============================================================
    // BROWSER SPEECH RECOGNITION (LIVE STREAMING TO SCREEN)
    // ============================================================

    const startBrowserSpeechRecognition = () => {
        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn(
                "[SpeechRecognition] Browser does not support Web Speech API."
            );
            return false;
        }

        try {
            const recognition = new SpeechRecognition();
            speechRecognitionRef.current = recognition;

            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;

            let recLang = "te-IN";
            if (language === "hi-IN" || language === "hindi") recLang = "hi-IN";
            else if (language === "en-IN" || language === "english") recLang = "en-IN";
            else if (language === "te-IN" || language === "telugu") recLang = "te-IN";
            else recLang = "te-IN";

            recognition.lang = recLang;
            recognitionActiveRef.current = true;

            console.log(
                "[SpeechRecognition] Starting live stream:",
                recognition.lang
            );

            recognition.onresult = (event) => {
                if (!sessionActiveRef.current) return;

                let currentInterim = "";

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (!result || !result[0]) continue;

                    const text = result[0].transcript ? result[0].transcript.trim() : "";
                    if (!text) continue;

                    if (result.isFinal) {
                        console.log("[SpeechRecognition] Final text:", text);

                        setTranscript((previous) => {
                            const lastLine = previous[previous.length - 1];
                            if (lastLine && lastLine.text.trim().toLowerCase() === text.toLowerCase()) {
                                transcriptRef.current = previous;
                                return previous;
                            }

                            const nextTranscript = [
                                ...previous,
                                {
                                    speaker: "Conversation",
                                    text: text,
                                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                                    isFinal: true,
                                },
                            ];

                            transcriptRef.current = nextTranscript;
                            return nextTranscript;
                        });
                        setLiveInterimText("");
                    } else {
                        currentInterim += (currentInterim ? " " : "") + text;
                    }
                }

                if (currentInterim.trim()) {
                    setLiveInterimText(currentInterim.trim());
                }
            };

            recognition.onerror = (event) => {
                console.warn("[SpeechRecognition] Error event:", event.error);
            };

            recognition.onend = () => {
                if (
                    recognitionActiveRef.current &&
                    sessionActiveRef.current
                ) {
                    setTimeout(() => {
                        try {
                            if (recognitionActiveRef.current && sessionActiveRef.current) {
                                recognition.start();
                            }
                        } catch (error) {
                            console.warn("[SpeechRecognition] Restart attempt warning:", error);
                        }
                    }, 100);
                }
            };

            recognition.start();
            return true;
        } catch (error) {
            console.error("[SpeechRecognition] Start error:", error);
            recognitionActiveRef.current = false;
            return false;
        }
    };

    const stopBrowserSpeechRecognition = () => {
        recognitionActiveRef.current = false;
        setLiveInterimText("");

        try {
            if (speechRecognitionRef.current) {
                speechRecognitionRef.current.onend = null;
                speechRecognitionRef.current.onerror = null;
                speechRecognitionRef.current.onresult = null;
                speechRecognitionRef.current.stop();
            }
        } catch (error) {
            console.warn("[SpeechRecognition] Stop warning:", error);
        }

        speechRecognitionRef.current = null;
    };

    // ============================================================
    // START CONSULTATION
    // ============================================================

    const startConsultation = async () => {
        setError("");

        setTranscript([]);
        transcriptRef.current = [];
        setLiveInterimText("");

        audioChunksRef.current = [];

        lastTranscriptRef.current = "";

        sessionActiveRef.current = true;

        try {
            // ----------------------------------------------------
            // Check MediaRecorder support
            // ----------------------------------------------------

            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia
            ) {
                throw new Error(
                    "Microphone access is not supported in this browser."
                );
            }

            if (
                typeof MediaRecorder ===
                "undefined"
            ) {
                throw new Error(
                    "Audio recording is not supported in this browser."
                );
            }

            // ----------------------------------------------------
            // Get microphone
            // ----------------------------------------------------

            const stream =
                await navigator.mediaDevices.getUserMedia(
                    {
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                    }
                );

            mediaStreamRef.current = stream;

            // Connect Python WebSocket STT for real-time multilingual transcription
            connectWebSocket()
                .then(() => {
                    console.log("[Consultation] Sarvam AI STT connected successfully.");
                })
                .catch((err) => {
                    console.warn("[WebSocket] Speech service warning, using Web Speech API fallback:", err);
                    startBrowserSpeechRecognition();
                });

            // ----------------------------------------------------
            // Select recording format
            // ----------------------------------------------------

            let mimeType =
                "audio/webm;codecs=opus";

            if (
                !MediaRecorder.isTypeSupported(
                    mimeType
                )
            ) {
                mimeType = "audio/webm";
            }

            if (
                !MediaRecorder.isTypeSupported(
                    mimeType
                )
            ) {
                mimeType = "";
            }

            // ----------------------------------------------------
            // Create recorder
            // ----------------------------------------------------

            const recorder =
                mimeType
                    ? new MediaRecorder(
                        stream,
                        {
                            mimeType,
                        }
                    )
                    : new MediaRecorder(
                        stream
                    );

            mediaRecorderRef.current =
                recorder;

            // ----------------------------------------------------
            // AUDIO CHUNK
            // ----------------------------------------------------

            recorder.ondataavailable = (
                event
            ) => {
                if (
                    !event.data ||
                    event.data.size === 0
                ) {
                    return;
                }

                /*
                 * Always save the chunk.
                 *
                 * These chunks will later be
                 * combined into the COMPLETE
                 * consultation recording.
                 */

                audioChunksRef.current.push(
                    event.data
                );

                // ------------------------------------------------
                // Send chunk to Python
                // ------------------------------------------------

                const ws =
                    websocketRef.current;

                if (
                    ws &&
                    ws.readyState ===
                    WebSocket.OPEN &&
                    sessionActiveRef.current
                ) {
                    ws.send(event.data);

                    console.log(
                        "[Consultation] Audio chunk sent:",
                        event.data.size,
                        "bytes"
                    );
                }
            };

            recorder.onerror = (event) => {
                console.error(
                    "[Consultation] MediaRecorder error:",
                    event
                );

                setError(
                    "Audio recording failed."
                );
            };

            recorder.onstart = () => {
                console.log(
                    "[Consultation] Audio recording started"
                );

                setIsRecording(true);
                setIsListening(true);
                setRecordingSeconds(0);
                if (timerIntervalRef.current) {
                    clearInterval(timerIntervalRef.current);
                }
                startTimeRef.current = new Date().toISOString();
                timerIntervalRef.current = setInterval(() => {
                    setRecordingSeconds((prev) => prev + 1);
                }, 1000);
            };

            recorder.onstop = () => {
                console.log(
                    "[Consultation] Audio recording stopped"
                );

                setIsRecording(false);
            };

            /*
             * Send an audio chunk every 2 seconds.
             *
             * This gives the Python service
             * data during the consultation.
             */

            recorder.start(1500);

            console.log(
                "[Consultation] Consultation started"
            );
        } catch (error) {
            console.error(
                "[Consultation] Start error:",
                error
            );

            cleanupRecording();

            setIsRecording(false);
            setIsListening(false);

            setError(
                error?.message ||
                "Unable to start consultation."
            );
        }
    };

    // ============================================================
    // END CONSULTATION
    // ============================================================

    const stopRecording = async () => {
        if (!isRecording && !isListening) return;

        // Switch UI state synchronously to Reviewing mode to eliminate 2s button blink
        setIsReviewing(true);
        setIsRecording(false);
        setIsListening(false);
        setIsPaused(false);
        triggerBackgroundSummaryPrepare(transcriptRef.current, true);

        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }

        const recorder = mediaRecorderRef.current;
        const stream = mediaStreamRef.current;
        const websocket = websocketRef.current;

        try {
            if (recorder && recorder.state !== "inactive") {
                await new Promise((resolve) => {
                    let resolved = false;
                    const finish = () => { if (resolved) return; resolved = true; resolve(); };
                    const originalOnStop = recorder.onstop;
                    recorder.onstop = (event) => {
                        console.log("[Consultation] Audio recording stopped");
                        if (typeof originalOnStop === "function") {
                            try { originalOnStop(event); } catch (e) { }
                        }
                        finish();
                    };
                    try { recorder.requestData(); } catch (e) { }
                    try { recorder.stop(); } catch (e) { finish(); }
                    setTimeout(finish, 1500);
                });
            }
            if (stream) stream.getTracks().forEach((track) => track.stop());

            // Ask the speech service to flush its final audio/transcript before
            // closing the socket. The previous fixed 200ms delay could close the
            // connection before the final Whisper segment arrived.
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                await new Promise((resolve) => {
                    let settled = false;

                    const finish = () => {
                        if (settled) return;
                        settled = true;
                        if (websocketStopResolverRef.current === finish) {
                            websocketStopResolverRef.current = null;
                        }
                        resolve();
                    };

                    websocketStopResolverRef.current = finish;

                    try {
                        websocket.send(JSON.stringify({ type: "stop" }));
                    } catch (e) {
                        console.warn("[Consultation] Final WS stop warning:", e);
                        finish();
                        return;
                    }

                    // Never block the UI indefinitely if the speech service does
                    // not send its stopped acknowledgement.
                    setTimeout(finish, 2000);
                });
            }

            websocketStopResolverRef.current = null;

            try {
                if (websocket) websocket.close();
            } catch (e) { }

            websocketRef.current = null;
            mediaRecorderRef.current = null;
            mediaStreamRef.current = null;

            setIsReviewing(true);
            sessionActiveRef.current = false;
            triggerBackgroundSummaryPrepare(transcriptRef.current, true);
        } catch (error) {
            console.error(error);
        }
    };

    const discardRecording = () => {
        cleanupRecording();
        setTranscript([]);
        transcriptRef.current = [];
        setLiveInterimText("");
        setRecordingSeconds(0);
        audioChunksRef.current = [];
        setIsReviewing(false);
        setIsRecording(false);
        setIsListening(false);
        setIsPaused(false);
        setError("");
    };

    const extractMedicinesFromTranscript = (transcriptList = []) => {
        const textLines = transcriptList.map((t) => String(t?.text || t?.transcript || "")).filter(Boolean);
        const lowerText = textLines.join("\n").toLowerCase();
        const extractedMeds = [];

        const pharmaList = [
            { patterns: ["dolo", "డోలో", "డోలర్", "calpol", "crocin", "క్రోసిన్"], name: "Dolo 650 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food for fever/pain relief" },
            { patterns: ["paracetamol", "పారాసిటమాల్", "పరసిటమల్"], name: "Paracetamol 500 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food as needed for fever" },
            { patterns: ["combiflam", "కాంబిఫ్లామ్"], name: "Combiflam Tablet", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food for body ache/pain" },
            { patterns: ["meftal", "మెఫ్తాల్", "meftal spas"], name: "Meftal-Spas Tablet", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food for pain/spasms" },
            { patterns: ["zerodol", "జెరోడోల్", "aceclofenac"], name: "Zerodol-SP Tablet", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take after food for pain and swelling" },
            { patterns: ["augmentin", "clavam", "క్లావమ్", "అగ్‌మెంటిన్", "amoxicillin"], name: "Clavam 625 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take complete 5-day antibiotic course after food" },
            { patterns: ["azithromycin", "azithral", "అజిత్రోమైసిన్", "అజిత్రో", "asithro"], name: "Azithromycin 500 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily)", instructions: "Take 1 hour before or 2 hours after food" },
            { patterns: ["cefixime", "taxim", "టాక్సిమ్", "సెఫిక్సిమ్"], name: "Taxim-O 200 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily after food)", instructions: "Take complete course after food" },
            { patterns: ["cetirizine", "సిట్రోజన్", "సెటిరిజిన్", "citrozine", "setrizine"], name: "Cetirizine 10 mg", dosage: "1 Tablet", defaultFreq: "0-0-1 (Once daily at night)", instructions: "Take after food for allergy/cold" },
            { patterns: ["levocetirizine", "లెవోసెటిరిజిన్"], name: "Levocetirizine 5 mg", dosage: "1 Tablet", defaultFreq: "0-0-1 (Once daily at night)", instructions: "Take at bedtime" },
            { patterns: ["montair", "montelukast", "monticope", "మోంటైర్"], name: "Montair LC Tablet", dosage: "1 Tablet", defaultFreq: "0-0-1 (Once daily at night)", instructions: "Take at bedtime for allergy/cough" },
            { patterns: ["allegra", "అలెగ్రా", "fexofenadine"], name: "Allegra 120 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily)", instructions: "Take once daily for allergy relief" },
            { patterns: ["wikoryl", "cheston", "వికోరిల్", "చెస్ట్ ఆన్"], name: "Wikoryl Tablet", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily)", instructions: "Take after food for cold and congestion" },
            { patterns: ["syrup", "సిరప్", "cough syrup", "కాఫ్ సిరప్", "ascoril", "benadryl", "alex"], name: "Ascoril LS Cough Syrup", dosage: "10 ml", defaultFreq: "1-1-1 (Three times daily)", instructions: "Take 10 ml 3 times daily after food" },
            { patterns: ["pantocid", "pantoprazole", "pan 40", "ప్యాంటోసిడ్", "పాంతో"], name: "Pantocid 40 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily before breakfast)", instructions: "Take on an empty stomach in the morning" },
            { patterns: ["omez", "omeprazole", "ఒమెజ్"], name: "Omez 20 mg", dosage: "1 Capsule", defaultFreq: "1-0-0 (Once daily before breakfast)", instructions: "Take before food in morning" },
            { patterns: ["rantac", "ranitidine", "రాన్ టాక్"], name: "Rantac 150 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily before food)", instructions: "Take 30 mins before food" },
            { patterns: ["ondem", "vomikind", "ondansetron", "ఒండెమ్", "వామికిండ్"], name: "Ondem 4 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily as needed)", instructions: "Take for nausea or vomiting" },
            { patterns: ["metformin", "glycomet", "గ్లైకోమెట్"], name: "Glycomet 500 mg", dosage: "1 Tablet", defaultFreq: "1-0-1 (Twice daily with meals)", instructions: "Take with or immediately after meals" },
            { patterns: ["telma", "telmisartan", "టెల్మా"], name: "Telma 40 mg", dosage: "1 Tablet", defaultFreq: "1-0-0 (Once daily in morning)", instructions: "Take every morning for blood pressure" },
            { patterns: ["shelcal", "calcium", "షెల్కాల్"], name: "Shelcal 500 mg", dosage: "1 Tablet", defaultFreq: "0-1-0 (Once daily after lunch)", instructions: "Take after food with water" },
            { patterns: ["evion", "vitamin e", "ఎవియాన్"], name: "Evion 400 mg", dosage: "1 Capsule", defaultFreq: "0-0-1 (Once daily at night)", instructions: "Take after dinner" }
        ];

        let detectedFreq = null;
        if (lowerText.includes("3 times") || lowerText.includes("three times") || lowerText.includes("3 టైమ్స్") || lowerText.includes("మూడు సార్లు") || lowerText.includes("త్రీ టైమ్స్")) {
            detectedFreq = "1-1-1 (Three times daily after food)";
        } else if (lowerText.includes("2 times") || lowerText.includes("twice") || lowerText.includes("2 టైమ్స్") || lowerText.includes("రెండు సార్లు") || lowerText.includes("ట్వైస్")) {
            detectedFreq = "1-0-1 (Twice daily after food)";
        } else if (lowerText.includes("once") || lowerText.includes("1 time") || lowerText.includes("ఒకసారి")) {
            detectedFreq = "1-0-0 (Once daily)";
        }

        for (const item of pharmaList) {
            if (item.patterns.some(p => lowerText.includes(p))) {
                if (!extractedMeds.some(m => m.name.toLowerCase() === item.name.toLowerCase())) {
                    extractedMeds.push({
                        name: item.name,
                        dosage: item.dosage,
                        frequency: detectedFreq || item.defaultFreq,
                        duration: "3-5 days",
                        instructions: item.instructions
                    });
                }
            }
        }

        return extractedMeds;
    };

    const processRecording = async () => {
        if (!isReviewing || isProcessing) {
            return;
        }

        setIsProcessing(true);
        setError("");

        const latestTranscript = Array.isArray(transcriptRef.current) && transcriptRef.current.length > 0
            ? transcriptRef.current
            : (Array.isArray(transcript) ? transcript : []);

        const localMeds = extractMedicinesFromTranscript(latestTranscript);

        let finalSummary = {
            consultation_overview: `Patient presented with ${problemDetails.symptoms || "clinical symptoms"}. Evaluation conducted and treatment advised.`,
            chief_complaint: problemDetails.symptoms || patient.reason || "General Consultation",
            symptoms: [problemDetails.symptoms || patient.reason || "Fever / Clinical Symptoms Discussed"],
            history_of_present_illness: `Patient reported symptoms: ${problemDetails.symptoms || "clinical symptoms"} (Duration: ${problemDetails.duration || "N/A"}, Severity: ${problemDetails.severity || "N/A"}). Current medications: ${problemDetails.currentMedications || "None"}. Notes: ${problemDetails.additionalNotes || "None"}`,
            assessment: "Clinical evaluation completed during consultation.",
            diagnosis: ["Acute Symptomatic Illness"],
            treatment_plan: "Prescribed symptomatic pharmacological treatment and lifestyle advice.",
            medications_discussed: localMeds.length > 0 ? localMeds : [],
            advice: ["Rest well", "Drink plenty of warm fluids", "Review if symptoms persist"],
            follow_up: "Review in 3-5 days if symptoms persist."
        };
        let detectedLanguage = "Auto-detected";

        try {
            const formData = new FormData();
            formData.append("doctorId", doctorId || "default-doctor");
            formData.append("patientId", patient.id);
            formData.append("appointmentId", String(appointmentId));
            formData.append("liveTranscript", JSON.stringify(latestTranscript));
            formData.append("consultationId", consultationId);
            formData.append("patientReason", getFullPatientIntakeContext());

            const res = await fetch(`${NODE_API_URL}/api/consultation/complete`, {
                method: "POST",
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                if (data?.consultation?.summary && Object.keys(data.consultation.summary).length > 0) {
                    finalSummary = data.consultation.summary;
                }
                if (data?.consultation?.detectedLanguage) {
                    detectedLanguage = data.consultation.detectedLanguage;
                }
            }
        } catch (err) {
            console.warn("[Consultation] Completion API notice:", err.message);
        }

        const summaryPayload = {
            patient,
            doctorId: doctorId || "default-doctor",
            patientId: patient.id,
            appointmentId: String(appointmentId),
            consultationId,
            detectedLanguage,
            transcript: latestTranscript,
            finalGeminiTranscript: latestTranscript,
            liveTranscript: latestTranscript,
            summary: finalSummary,
            duration: formatDuration(recordingSeconds),
            durationSeconds: recordingSeconds,
            startedAt: startTimeRef.current || new Date().toISOString(),
            endedAt: new Date().toISOString(),
            generatedAt: new Date().toISOString(),
        };

        sessionStorage.setItem(`consultation-result-${patient.id}`, JSON.stringify(summaryPayload));

        setIsProcessing(false);

        navigate(`/consultation/${patient.id}/summary`, {
            state: summaryPayload,
            replace: false,
        });
    };

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <div className="consultation-page-wrapper" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#f8fafc" }}>
            <style>{`
                @media (max-width: 1024px) {
                    .consultation-layout {
                        flex-direction: column !important;
                        padding: 14px !important;
                        gap: 16px !important;
                        overflow-y: auto !important;
                        height: auto !important;
                    }
                    .patient-sidebar {
                        width: 100% !important;
                        max-height: none !important;
                    }
                    .transcript-section {
                        width: 100% !important;
                        min-height: 420px !important;
                    }
                    .action-bar {
                        flex-direction: column !important;
                        gap: 12px !important;
                    }
                }
                @media (max-width: 600px) {
                    .consultation-page-wrapper {
                        height: auto !important;
                        min-height: 100vh !important;
                    }
                    .consultation-layout {
                        padding: 10px !important;
                        gap: 12px !important;
                    }
                    .transcript-scroll-box {
                        padding: 14px 12px !important;
                    }
                }
            `}</style>

            {/* ERROR */}
            {error && (
                <div style={{ margin: "15px", padding: "12px 16px", borderRadius: "10px", background: "rgba(255,51,102,0.12)", border: "1px solid rgba(255,51,102,0.3)", color: "#ff6b8a" }}>
                    {error}
                </div>
            )}

            {!isGeneratingSummary && (
                <main className="consultation-layout" style={{ display: "flex", flex: 1, padding: "24px", gap: "24px", boxSizing: "border-box", minHeight: 0 }}>
                    {/* ... sidebar ... */}

                    {/* ====================================================
                    PATIENT SIDEBAR (STUNNING CLINICAL PROFILE & INTAKE)
                ==================================================== */}
                    <aside className="patient-sidebar" style={{
                        width: "380px",
                        background: "#ffffff",
                        borderRadius: "20px",
                        display: "flex",
                        flexDirection: "column",
                        position: "relative",
                        overflow: "hidden",
                        flexShrink: 0,
                        boxShadow: "0 10px 30px rgba(8, 43, 104, 0.06)",
                        border: "1px solid #e2e8f0"
                    }}>
                        {/* TOP PATIENT PROFILE HEADER CARD - TEAL GRADIENT HERO */}
                        <div style={{
                            background: "linear-gradient(135deg, #01b6af 0%, #0d9488 50%, #082b68 100%)",
                            padding: "16px 18px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                            color: "#ffffff",
                            position: "relative",
                            boxShadow: "0 4px 14px rgba(1, 182, 175, 0.25)"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                <button
                                    onClick={() => navigate("/dashboard")}
                                    style={{
                                        background: "rgba(255, 255, 255, 0.18)",
                                        backdropFilter: "blur(8px)",
                                        color: "#ffffff",
                                        border: "1px solid rgba(255, 255, 255, 0.3)",
                                        padding: "4px 12px",
                                        borderRadius: "20px",
                                        fontSize: "0.8rem",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        transition: "all 0.2s ease"
                                    }}
                                >
                                    <i className="fa-solid fa-arrow-left" style={{ fontSize: "0.75rem" }}></i> Back
                                </button>
                                <span style={{
                                    background: "rgba(255, 255, 255, 0.2)",
                                    backdropFilter: "blur(6px)",
                                    padding: "4px 10px",
                                    borderRadius: "12px",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.5px",
                                    whiteSpace: "nowrap"
                                }}>
                                    PATIENT CHART
                                </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "2px" }}>
                                <div style={{
                                    width: "46px",
                                    height: "46px",
                                    borderRadius: "14px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "20px",
                                    fontWeight: "800",
                                    color: "#0f766e",
                                    background: "#ffffff",
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                    flexShrink: 0
                                }}>
                                    {patient.name ? patient.name[0] : "P"}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3 style={{ margin: 0, color: "#ffffff", fontSize: "1.15rem", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{patient.name}</h3>
                                    <div style={{ color: "rgba(255, 255, 255, 0.9)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", fontWeight: 600, flexWrap: "wrap" }}>
                                        <span>{patient.age} yrs • {patient.gender}</span>
                                        <span style={{ background: "rgba(255,255,255,0.25)", padding: "2px 8px", borderRadius: "10px", fontSize: "0.7rem", fontWeight: 700 }}>{patient.id}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CLINICAL INTAKE PROBLEM INFO */}
                        <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px", flex: 1, overflowY: "auto" }}>
                            
                            {/* PATIENT REPORTED PROBLEM & INTAKE CARD */}
                            <div style={{
                                background: "#ffffff",
                                border: "1px solid #e2e8f0",
                                borderRadius: "14px",
                                padding: "14px",
                                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.03)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px"
                            }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                    <div style={{ fontSize: "0.85rem", color: "#082b68", fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}>
                                        <span style={{ width: "24px", height: "24px", borderRadius: "6px", background: "rgba(1, 182, 175, 0.12)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>
                                            <i className="fa-solid fa-clipboard-question"></i>
                                        </span>
                                        <span>Patient Reported Problem</span>
                                    </div>
                                    {problemDetails.severity && (
                                        (() => {
                                            const s = String(problemDetails.severity).toLowerCase();
                                            const isSevere = s.includes("severe");
                                            const isMod = s.includes("mod");
                                            const isMild = s.includes("mild");
                                            const bg = isSevere ? "rgba(239, 68, 68, 0.12)" : isMod ? "rgba(245, 158, 11, 0.12)" : isMild ? "rgba(16, 185, 129, 0.12)" : "rgba(1, 182, 175, 0.12)";
                                            const color = isSevere ? "#ef4444" : isMod ? "#d97706" : isMild ? "#10b981" : "#01b6af";
                                            const border = isSevere ? "1px solid rgba(239, 68, 68, 0.3)" : isMod ? "1px solid rgba(245, 158, 11, 0.3)" : isMild ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(1, 182, 175, 0.3)";
                                            return (
                                                <span style={{
                                                    fontSize: "0.68rem",
                                                    fontWeight: 800,
                                                    textTransform: "uppercase",
                                                    padding: "3px 9px",
                                                    borderRadius: "20px",
                                                    background: bg,
                                                    color: color,
                                                    border: border,
                                                    flexShrink: 0,
                                                    whiteSpace: "nowrap"
                                                }}>
                                                    {problemDetails.severity}
                                                </span>
                                            );
                                        })()
                                    )}
                                </div>

                                {/* 1. Reported Symptoms Box */}
                                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 12px", borderRadius: "10px" }}>
                                    <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px", display: "flex", alignItems: "center", gap: "5px" }}>
                                        <i className="fa-solid fa-stethoscope" style={{ color: "#01b6af" }}></i> Reported Symptoms
                                    </div>
                                    <div style={{ fontSize: "0.85rem", color: problemDetails.symptoms ? "#0f172a" : "#94a3b8", fontWeight: 600, lineHeight: 1.4, wordBreak: "break-word" }}>
                                        {problemDetails.symptoms || (patient.reason && patient.reason !== "General Consultation" ? patient.reason : null) || "Not reported"}
                                    </div>
                                </div>

                                {/* 2. Metadata Grid: 2 columns for Duration & Current Meds */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "8px 10px", borderRadius: "8px" }}>
                                        <div style={{ fontSize: "0.64rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                                            <i className="fa-solid fa-clock" style={{ color: "#01b6af" }}></i> Duration
                                        </div>
                                        <div style={{ fontSize: "0.82rem", color: problemDetails.duration ? "#082b68" : "#94a3b8", fontWeight: 700, wordBreak: "break-word" }}>
                                            {problemDetails.duration || "N/A"}
                                        </div>
                                    </div>

                                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "8px 10px", borderRadius: "8px" }}>
                                        <div style={{ fontSize: "0.64rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                                            <i className="fa-solid fa-pills" style={{ color: "#01b6af" }}></i> Current Meds
                                        </div>
                                        <div style={{ fontSize: "0.82rem", color: problemDetails.currentMedications ? "#082b68" : "#94a3b8", fontWeight: 600, wordBreak: "break-word" }}>
                                            {problemDetails.currentMedications || "None"}
                                        </div>
                                    </div>
                                </div>

                                {/* 3. Additional Notes (Full Width Row if Present) */}
                                {problemDetails.additionalNotes && (
                                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "8px 10px", borderRadius: "8px" }}>
                                        <div style={{ fontSize: "0.64rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                                            <i className="fa-solid fa-note-sticky" style={{ color: "#01b6af" }}></i> Additional Notes
                                        </div>
                                        <div style={{ fontSize: "0.82rem", color: "#334155", fontWeight: 500, lineHeight: 1.4, wordBreak: "break-word" }}>
                                            {problemDetails.additionalNotes}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Editable Patient Vitals Card */}
                            <div style={{
                                background: "#ffffff",
                                border: "1px solid #e2e8f0",
                                padding: "14px",
                                borderRadius: "14px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.03)"
                            }}>
                                <div style={{ fontSize: "0.85rem", color: "#082b68", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <span style={{ width: "24px", height: "24px", borderRadius: "6px", background: "rgba(1, 182, 175, 0.12)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>
                                            <i className="fa-solid fa-heart-pulse"></i>
                                        </span>
                                        <span>Patient Vitals</span>
                                    </span>
                                    <span style={{ fontSize: "0.68rem", color: "#01b6af", fontWeight: 700, background: "rgba(1, 182, 175, 0.12)", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(1, 182, 175, 0.2)", flexShrink: 0, whiteSpace: "nowrap" }}>
                                        <i className="fa-solid fa-pen" style={{ fontSize: "9px" }}></i> Editable
                                    </span>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                    {/* Blood Group */}
                                    <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "6px 10px", borderRadius: "8px", boxSizing: "border-box" }}>
                                        <div style={{ fontSize: "0.64rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Blood Group</div>
                                        <input
                                            type="text"
                                            value={vitals.bloodGroup}
                                            onChange={(e) => setVitals((prev) => ({ ...prev, bloodGroup: e.target.value }))}
                                            style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "0.88rem", fontWeight: 800, color: "#01b6af", padding: "2px 0 0 0", boxSizing: "border-box" }}
                                            placeholder="O+"
                                        />
                                    </div>

                                    {/* Weight */}
                                    <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "6px 10px", borderRadius: "8px", boxSizing: "border-box" }}>
                                        <div style={{ fontSize: "0.64rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Weight</div>
                                        <input
                                            type="text"
                                            value={vitals.weight}
                                            onChange={(e) => setVitals((prev) => ({ ...prev, weight: e.target.value }))}
                                            style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "0.88rem", fontWeight: 800, color: "#082b68", padding: "2px 0 0 0", boxSizing: "border-box" }}
                                            placeholder="68 kg"
                                        />
                                    </div>

                                    {/* Blood Pressure */}
                                    <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "6px 10px", borderRadius: "8px", boxSizing: "border-box" }}>
                                        <div style={{ fontSize: "0.64rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Blood Pressure</div>
                                        <input
                                            type="text"
                                            value={vitals.bloodPressure}
                                            onChange={(e) => setVitals((prev) => ({ ...prev, bloodPressure: e.target.value }))}
                                            style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "0.88rem", fontWeight: 800, color: "#082b68", padding: "2px 0 0 0", boxSizing: "border-box" }}
                                            placeholder="120/80 mmHg"
                                        />
                                    </div>

                                    {/* Allergies */}
                                    <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "6px 10px", borderRadius: "8px", boxSizing: "border-box" }}>
                                        <div style={{ fontSize: "0.64rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Allergies</div>
                                        <input
                                            type="text"
                                            value={vitals.allergies}
                                            onChange={(e) => setVitals((prev) => ({ ...prev, allergies: e.target.value }))}
                                            style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "0.88rem", fontWeight: 800, color: "#01b6af", padding: "2px 0 0 0", boxSizing: "border-box" }}
                                            placeholder="None"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </aside>


                    {/* ====================================================
                        TRANSCRIPTION AREA (PREMIUM HIGH-END MEDICAL DESIGN)
                    ==================================================== */}

                    <div className="transcription-area" style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1, minWidth: 0, minHeight: 0 }}>

                        {/* TOP HEADER CARD */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff", padding: "14px 22px", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(8, 43, 104, 0.04)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(1, 182, 175, 0.15) 0%, rgba(8, 43, 104, 0.08) 100%)", border: "1px solid rgba(1, 182, 175, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(1, 182, 175, 0.15)" }}>
                                    <i className="fa-solid fa-microphone-lines" style={{ color: "#01b6af", fontSize: "18px" }}></i>
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#082b68", letterSpacing: "-0.2px" }}>
                                        Live Clinical Transcription
                                    </h2>
                                    <span style={{ fontSize: "0.8rem", color: isListening ? "#01b6af" : "#64748b", display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, marginTop: "1px" }}>
                                        <i className={`fa-solid ${isListening ? "fa-circle blink" : "fa-circle"}`} style={{ fontSize: "7px", color: isListening ? "#01b6af" : "#94a3b8" }}></i>
                                        {isListening ? "Live Audio Streaming Active" : "Microphone Ready"}
                                    </span>
                                </div>
                            </div>

                            {/* Auto Detect Language Selector Pill */}
                            <div style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "6px 14px", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                                <i className="fa-solid fa-language" style={{ color: "#01b6af", fontSize: "1rem" }}></i>
                                <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isGeneratingSummary} style={{ background: "transparent", border: "none", color: "#082b68", fontWeight: 700, fontSize: "0.85rem", outline: "none", cursor: "pointer" }}>
                                    <option value="auto">Auto Detect (Multilingual)</option>
                                    <option value="te-IN">Telugu + English</option>
                                    <option value="hi-IN">Hindi + English</option>
                                    <option value="en-IN">English</option>
                                </select>
                            </div>
                        </div>

                        {/* MAIN TRANSCRIPTION DISPLAY BOX */}
                        <div style={{ background: "#ffffff", borderRadius: "18px", border: "1px solid #e2e8f0", boxShadow: "0 6px 24px rgba(8, 43, 104, 0.04)", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

                            {/* Container Header */}
                            <div style={{ padding: "12px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <span style={{ background: isListening ? "rgba(1, 182, 175, 0.12)" : "#f1f5f9", color: isListening ? "#01b6af" : "#64748b", border: `1px solid ${isListening ? 'rgba(1, 182, 175, 0.3)' : '#cbd5e1'}`, padding: "3px 10px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}>
                                        <i className="fa-solid fa-circle" style={{ fontSize: "5px" }}></i> {isListening ? "REC LIVE" : "STANDBY"}
                                    </span>
                                    <span style={{ color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>
                                        {isPaused ? "Consultation paused." : isListening ? "Transcribing speech in real-time..." : "Click 'Start Consultation' to record conversation."}
                                    </span>
                                </div>
                                <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600, background: "#ffffff", padding: "2px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                    ID: {consultationId.slice(0, 22)}
                                </span>
                            </div>

                            {/* SCROLLABLE TRANSCRIPT */}
                            <div className="transcript-scroll-box" ref={transcriptContainerRef} style={{ padding: "24px 28px", overflowY: "auto", flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "16px", minHeight: "280px", background: "linear-gradient(180deg, #ffffff 0%, #fafcfd 100%)" }}>

                                {transcript.length === 0 && !liveInterimText && (
                                    <div style={{ textAlign: "center", color: "#94a3b8", paddingTop: "50px", paddingBottom: "50px" }}>
                                        <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg, rgba(1, 182, 175, 0.15) 0%, rgba(8, 43, 104, 0.06) 100%)", color: "#01b6af", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto", fontSize: "26px", border: "1px solid rgba(1, 182, 175, 0.25)", boxShadow: "0 4px 16px rgba(1, 182, 175, 0.12)" }}>
                                            <i className="fa-solid fa-stethoscope"></i>
                                        </div>
                                        <h3 style={{ margin: 0, color: "#082b68", fontSize: "1.2rem", fontWeight: 800 }}>Ready for Live Medical Consultation</h3>
                                        <p style={{ marginTop: "6px", fontSize: "0.88rem", color: "#64748b", maxWidth: "420px", margin: "8px auto 0 auto", fontWeight: 500, lineHeight: 1.5 }}>
                                            Begin speaking naturally. AI speaker diarization will automatically capture patient & doctor notes in real-time.
                                        </p>
                                    </div>
                                )}

                                {transcript.map((line, index) => {
                                    const isDoctor = line.speaker?.toLowerCase().includes("doctor");
                                    return (
                                        <div key={index} style={{
                                            display: "flex",
                                            gap: "14px",
                                            alignSelf: "flex-start",
                                            maxWidth: "92%",
                                            background: isDoctor ? "rgba(1, 182, 175, 0.06)" : "#ffffff",
                                            border: `1px solid ${isDoctor ? 'rgba(1, 182, 175, 0.25)' : '#cbd5e1'}`,
                                            borderRadius: "14px",
                                            padding: "12px 16px",
                                            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)"
                                        }}>
                                            {/* Icon Avatar */}
                                            <div style={{
                                                width: "36px",
                                                height: "36px",
                                                borderRadius: "10px",
                                                background: isDoctor ? "linear-gradient(135deg, #01b6af 0%, #082b68 100%)" : "linear-gradient(135deg, #475569 0%, #1e293b 100%)",
                                                color: "#ffffff",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                                fontWeight: 700,
                                                fontSize: "14px",
                                                boxShadow: "0 2px 6px rgba(0,0,0,0.12)"
                                            }}>
                                                <i className={`fa-solid ${isDoctor ? 'fa-user-doctor' : 'fa-user'}`}></i>
                                            </div>

                                            {/* Content */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "3px" }}>
                                                    <span style={{ fontWeight: 800, color: isDoctor ? "#01b6af" : "#082b68", fontSize: "0.88rem", letterSpacing: "0.2px" }}>
                                                        {line.speaker || (isDoctor ? "Doctor" : "Patient")}
                                                    </span>
                                                    {line.timestamp && <span style={{ color: "#94a3b8", fontSize: "0.75rem", fontWeight: 600 }}>{line.timestamp}</span>}
                                                </div>
                                                <div style={{ fontSize: "0.95rem", lineHeight: "1.5", color: "#0f172a", fontWeight: 500 }}>
                                                    {line.text}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {liveInterimText && !isPaused && (
                                    <div style={{
                                        display: "flex",
                                        gap: "14px",
                                        maxWidth: "90%",
                                        background: "rgba(1, 182, 175, 0.08)",
                                        border: "1px solid rgba(1, 182, 175, 0.3)",
                                        borderRadius: "14px",
                                        padding: "12px 16px",
                                        boxShadow: "0 2px 8px rgba(1, 182, 175, 0.08)"
                                    }}>
                                        <div style={{
                                            width: "36px",
                                            height: "36px",
                                            borderRadius: "10px",
                                            background: "#01b6af",
                                            color: "#ffffff",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            flexShrink: 0,
                                            fontSize: "14px"
                                        }}>
                                            <i className="fa-solid fa-microphone fa-fade"></i>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 800, color: "#01b6af", fontSize: "0.85rem", marginBottom: "2px" }}>Speaking...</div>
                                            <div style={{ fontSize: "0.95rem", lineHeight: "1.5", color: "#0f172a", fontWeight: 500 }}>
                                                {liveInterimText}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Auto-scroll anchor target */}
                                <div ref={messagesEndRef} style={{ height: "1px", width: "100%", clear: "both" }} />
                            </div>
                        </div>


                        {/* ====================================================
                                CONTROLS (ELEGANT ACTION BAR)
                            ==================================================== */}

                        <div className="action-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>

                            {/* Left Block: Secure & Confidential */}
                            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", flex: 1 }}>
                                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(1, 182, 175, 0.12)", border: "1px solid rgba(1, 182, 175, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <i className="fa-solid fa-shield-halved" style={{ color: "#01b6af", fontSize: "14px" }}></i>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 800, color: "#082b68", fontSize: "0.85rem" }}>Secure & Confidential</div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        End-to-end encrypted medical chart.
                                    </div>
                                </div>
                            </div>

                            {/* Center Block: Action Buttons */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                                {!isRecording && !isGeneratingSummary && !isReviewing && (
                                    <div
                                        onClick={startConsultation}
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            cursor: "pointer",
                                            userSelect: "none"
                                        }}
                                        title="Click to Start Consultation"
                                    >
                                        <img
                                            src="/images/start_mic.png"
                                            alt="Start Consultation"
                                            style={{
                                                width: "56px",
                                                height: "56px",
                                                objectFit: "contain",
                                                filter: "drop-shadow(0 6px 16px rgba(1, 182, 175, 0.35))",
                                                transition: "transform 0.2s ease"
                                            }}
                                        />
                                        <span
                                            style={{
                                                marginTop: "4px",
                                                fontWeight: 800,
                                                fontSize: "0.92rem",
                                                color: "#082b68"
                                            }}
                                        >
                                            Start Consultation
                                        </span>
                                    </div>
                                )}

                                {isRecording && !isReviewing && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <button
                                            onClick={isPaused ? resumeConsultation : pauseConsultation}
                                            style={{
                                                background: "#ffffff",
                                                color: "#082b68",
                                                border: "1px solid #cbd5e1",
                                                padding: "8px 16px",
                                                borderRadius: "8px",
                                                fontSize: "0.88rem",
                                                fontWeight: 700,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "6px",
                                                boxShadow: "0 2px 4px rgba(0,0,0,0.03)"
                                            }}
                                        >
                                            <i className={`fa-solid ${isPaused ? "fa-play" : "fa-pause"}`}></i>
                                            {isPaused ? "Resume" : "Pause"}
                                        </button>
                                        <button
                                            onClick={discardRecording}
                                            style={{
                                                background: "#ffffff",
                                                color: "#64748b",
                                                border: "1px solid #cbd5e1",
                                                padding: "8px 16px",
                                                borderRadius: "8px",
                                                fontSize: "0.88rem",
                                                fontWeight: 700,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "6px"
                                            }}
                                        >
                                            <i className="fa-solid fa-trash"></i> Delete
                                        </button>
                                        <button
                                            onClick={stopRecording}
                                            style={{
                                                background: "linear-gradient(135deg, #01b6af 0%, #0f766e 100%)",
                                                color: "white",
                                                border: "none",
                                                padding: "8px 20px",
                                                borderRadius: "8px",
                                                fontSize: "0.88rem",
                                                fontWeight: 800,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                boxShadow: "0 4px 12px rgba(1, 182, 175, 0.3)"
                                            }}
                                        >
                                            Stop Consultation
                                        </button>
                                    </div>
                                )}

                                {isReviewing && !isGeneratingSummary && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <button
                                            onClick={discardRecording}
                                            style={{
                                                background: "#ffffff",
                                                color: "#64748b",
                                                border: "1px solid #cbd5e1",
                                                padding: "8px 16px",
                                                borderRadius: "8px",
                                                fontSize: "0.88rem",
                                                fontWeight: 700,
                                                cursor: "pointer"
                                            }}
                                        >
                                            Discard
                                        </button>
                                        <button
                                            onClick={processRecording}
                                            disabled={isProcessing}
                                            style={{
                                                background: isProcessing ? "#0f766e" : "linear-gradient(135deg, #01b6af 0%, #0f766e 100%)",
                                                color: "white",
                                                border: "none",
                                                padding: "8px 20px",
                                                borderRadius: "8px",
                                                fontSize: "0.88rem",
                                                fontWeight: 800,
                                                cursor: isProcessing ? "not-allowed" : "pointer",
                                                boxShadow: "0 4px 12px rgba(1, 182, 175, 0.3)",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px"
                                            }}
                                        >
                                            {isProcessing ? (
                                                <>
                                                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                                                    <span>Processing...</span>
                                                </>
                                            ) : (
                                                "Save & Process"
                                            )}
                                        </button>
                                    </div>
                                )}
                                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>
                                    {isReviewing ? "Audio saved locally. Ready to process." : "Consultation will be saved automatically"}
                                </div>
                            </div>

                            {/* Right Block: Duration Timer */}
                            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", flex: 1, justifyContent: "flex-end" }}>
                                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(1, 182, 175, 0.12)", border: "1px solid rgba(1, 182, 175, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <i className="fa-solid fa-clock" style={{ color: "#01b6af", fontSize: "15px" }}></i>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Duration</div>
                                    <div style={{ color: "#082b68", fontWeight: 800, fontSize: "1.15rem", fontVariantNumeric: "tabular-nums" }}>
                                        {formatDuration(recordingSeconds)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {isGeneratingSummary && (
                            <div style={{ background: "#ffffff", border: "1px solid #01b6af", padding: "16px 32px", borderRadius: "40px", display: "flex", alignItems: "center", gap: "16px", boxShadow: "0 8px 25px rgba(1, 182, 175, 0.15)" }}>
                                <i className="fa-solid fa-circle-notch fa-spin" style={{ color: "#01b6af", fontSize: "1.4rem" }}></i>
                                <span style={{ color: "#082b68", fontWeight: 700, fontSize: "1.1rem" }}>Synthesizing AI Medical Report...</span>
                            </div>
                        )}
                    </div>
                </main>
            )}

            {/* ============================================================
                    AI SUMMARY GENERATION PROGRESS MODAL OVERLAY
                ============================================================ */}
            {isGeneratingSummary && (
                <div
                    style={{
                        flex: 1,
                        backgroundColor: "#f8fafc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                    }}
                >
                    <div
                        style={{
                            width: "100%",
                            maxWidth: "580px",
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "24px",
                            padding: "40px",
                            boxShadow: "0 20px 60px rgba(1, 182, 175, 0.1)",
                            color: "#082b68",
                            textAlign: "center",
                            position: "relative",
                            overflow: "hidden"
                        }}
                    >
                        {/* Icon */}
                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", borderRadius: "50%", background: "rgba(1, 182, 175, 0.12)", marginBottom: "24px" }}>
                            <i className="fa-solid fa-heart-pulse fa-fade" style={{ fontSize: "36px", color: "#01b6af" }}></i>
                        </div>

                        <h2 style={{ fontSize: "1.6rem", fontWeight: 750, margin: "0 0 8px 0", color: "#082b68" }}>
                            Generating AI Consultation Summary
                        </h2>
                        <p style={{ color: "#64748B", fontSize: "1rem", margin: "0 0 32px 0", lineHeight: "1.5" }}>
                            Gemini 3.5 Flash is analyzing your consultation audio & extracting clinical insights.
                        </p>

                        {/* Progress Bar Header */}
                        <div style={{ marginBottom: "24px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                                <span style={{ fontSize: "0.95rem", fontWeight: 650, color: "#01b6af", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                                    {PROCESSING_STEPS[summaryStage]?.title || "Processing..."}
                                </span>
                                <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "#01b6af" }}>
                                    {Math.round(summaryProgress)}%
                                </span>
                            </div>

                            {/* Progress Bar */}
                            <div
                                style={{
                                    width: "100%",
                                    height: "12px",
                                    backgroundColor: "#f1f5f9",
                                    borderRadius: "10px",
                                    overflow: "hidden"
                                }}
                            >
                                <div
                                    style={{
                                        height: "100%",
                                        width: `${summaryProgress}%`,
                                        background: "linear-gradient(90deg, #01b6af 0%, #0f766e 100%)",
                                        borderRadius: "10px",
                                        transition: "width 0.3s ease-out"
                                    }}
                                />
                            </div>
                        </div>

                        {/* Step-by-Step Checklist */}
                        <div
                            style={{
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: "16px",
                                padding: "16px 24px",
                                textAlign: "left",
                                marginBottom: "24px"
                            }}
                        >
                            {PROCESSING_STEPS.map((step, idx) => {
                                const isCompleted = summaryStage > idx || summaryProgress >= 100;
                                const isCurrent = summaryStage === idx && summaryProgress < 100;

                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "14px",
                                            padding: "8px 0",
                                            opacity: isCompleted ? 0.8 : isCurrent ? 1 : 0.4,
                                            transition: "all 0.3s ease"
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: "24px",
                                                height: "24px",
                                                borderRadius: "50%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontSize: "0.8rem",
                                                background: isCompleted || isCurrent
                                                    ? "rgba(1, 182, 175, 0.12)"
                                                    : "#E2E8F0",
                                                color: isCompleted || isCurrent
                                                    ? "#01b6af"
                                                    : "#94A3B8",
                                                flexShrink: 0
                                            }}
                                        >
                                            {isCompleted ? (
                                                <i className="fa-solid fa-check"></i>
                                            ) : isCurrent ? (
                                                <i className="fa-solid fa-spinner fa-spin"></i>
                                            ) : (
                                                <i className={step.icon}></i>
                                            )}
                                        </div>

                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: "0.95rem", fontWeight: isCurrent ? 700 : 500, color: isCurrent ? "#082b68" : isCompleted ? "#475569" : "#94A3B8" }}>
                                                {step.title}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer Metrics */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "#64748B", flexWrap: "wrap", gap: "8px" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <i className="fa-solid fa-clock" style={{ color: "#01b6af" }}></i>
                                Elapsed: <strong style={{ color: "#082b68" }}>{summaryElapsedSeconds}s</strong> &nbsp;(Expected ~5–10s)
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#01b6af", fontWeight: 650 }}>
                                <i className="fa-solid fa-shield-halved"></i>
                                Auto-redirecting on finish
                            </span>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Consultation;