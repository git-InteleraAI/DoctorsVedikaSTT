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
    const patient = appointmentPatient
        ? {
            id: appointmentPatient.patientId || patientId,
            name: appointmentPatient.patientName || appointmentPatient.fullName || "Unknown Patient",
            age: appointmentPatient.age || "Not Available",
            gender: appointmentPatient.gender || "Not Available",
            bloodGroup: appointmentPatient.bloodGroup || "Not Available",
            weight: appointmentPatient.weight || "Not Available",
            bloodPressure: appointmentPatient.bloodPressure || "Not Available",
            allergies: appointmentPatient.allergies || "None documented",
            history: appointmentPatient.history || "None documented",
            reason: appointmentPatient.reason || "None documented",
            isVerified: true
        }
        : {
            id: patientId,
            name: "Unknown Patient",
            age: "Not Available",
            gender: "Not Available",
            bloodGroup: "Not Available",
            weight: "Not Available",
            bloodPressure: "Not Available",
            allergies: "None documented",
            history: "None documented",
            reason: "None documented",
            isVerified: false
        };

    // ============================================================
    // STATE
    // ============================================================

    const [isRecording, setIsRecording] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] =
        useState(false);
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

    // Auto-scroll transcript to bottom
    useEffect(() => {
        if (transcriptContainerRef.current) {
            transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
        }
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
                        patientReason: patient.reason,
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
        if (language === "te-IN") {
            return "Telugu";
        }

        if (language === "hi-IN") {
            return "Hindi";
        }

        if (language === "en-IN") {
            return "English";
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

            recognition.lang = language === "te-IN" ? "te-IN" : language === "hi-IN" ? "hi-IN" : "en-IN";
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

            // Start live Web Speech API on screen removed (relying exclusively on Sarvam STT)
            // startBrowserSpeechRecognition();

            // Connect Python WebSocket in background
            connectWebSocket().catch((err) => {
                console.warn("[WebSocket] Python speech service connection warning:", err);
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
        if (!isRecording) return;

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
                        setIsRecording(false);
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
            setIsRecording(false);
            setIsListening(false);

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

    const processRecording = async () => {
        if (!isReviewing) {
            return;
        }

        setError("");
        // setIsGeneratingSummary(true); // User requested no processing bar, wants it to feel instant
        setSummaryStage(0);
        setSummaryElapsedSeconds(0);

        if (summaryIntervalRef.current) clearInterval(summaryIntervalRef.current);
        const progressStartTime = Date.now();
        summaryIntervalRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - progressStartTime) / 1000);
            setSummaryElapsedSeconds(elapsed);
            setSummaryProgress((prev) => {
                if (prev < 25) return prev + 3.5;
                if (prev < 50) return prev + 2.2;
                if (prev < 75) return prev + 1.4;
                if (prev < 94) return Math.min(94, prev + 0.6);
                return prev;
            });
        }, 250);

        try {
            const chunks = audioChunksRef.current;
            console.log("[Consultation] Total audio chunks:", chunks.length);
            if (!chunks.length) {
                throw new Error("No audio was recorded. Please try the consultation again.");
            }

            // We no longer upload the heavy audio file to the backend, drastically speeding up the save process!
            // We only send the transcript data now.
            const formData = new FormData();
            // formData.append("audio", completeAudio, `consultation-${Date.now()}.webm`);
            formData.append("doctorId", doctorId);
            formData.append("patientId", patient.id);
            formData.append("appointmentId", String(appointmentId));

            // Use the ref so the exact latest transcript is sent even if a
            // WebSocket/browser recognition result arrived immediately before
            // this function was called.
            const latestTranscript = Array.isArray(transcriptRef.current)
                ? transcriptRef.current
                : transcript;

            formData.append("liveTranscript", JSON.stringify(latestTranscript));
            formData.append("consultationId", consultationId);
            formData.append("patientReason", patient.reason || "");

            console.log("[Consultation] Sending COMPLETE recording to Node/Gemini...");

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5 * 1000); // 5-second timeout as requested

            let response;
            let data;
            try {
                response = await fetch(`${NODE_API_URL}/api/consultation/complete`, {
                    method: "POST",
                    body: formData,
                    signal: controller.signal,
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || `Backend returned ${response.status}`);
                }
                data = await response.json();
            } catch (requestError) {
                if (requestError?.name === "AbortError") {
                    console.log("[Consultation] AI processing exceeded 5 seconds. Proceeding to summary page with empty summary.");
                    data = {
                        success: true,
                        consultation: {
                            doctorId,
                            patientId: patient.id,
                            appointmentId: String(appointmentId),
                            consultationId,
                            transcript: latestTranscript,
                            summary: {},
                            detectedLanguage: "Auto-detected"
                        }
                    };
                } else {
                    throw requestError;
                }
            } finally {
                clearTimeout(timeoutId);
            }

            console.log("[Consultation] Final consultation response:", data);

            if (!data.success || !data.consultation) {
                throw new Error(data.message || "Consultation processing failed.");
            }

            const consultation = data.consultation;
            const finalTranscript = Array.isArray(consultation.transcript) ? consultation.transcript : [];
            const liveTranscript = Array.isArray(transcriptRef.current)
                ? transcriptRef.current
                : (Array.isArray(transcript) ? transcript : []);

            const transcriptChars = (items) => items.map((item) => String(item?.text || item?.transcript || "")).join(" ").trim().length;
            const finalChars = transcriptChars(finalTranscript);
            const liveChars = transcriptChars(liveTranscript);
            const finalTranscriptHasContent = finalTranscript.length > 0;
            const displayTranscript = finalTranscriptHasContent ? finalTranscript : liveTranscript;

            console.log("[Consultation] Transcript selection:", {
                finalSegments: finalTranscript.length,
                liveSegments: liveTranscript.length,
                finalChars, liveChars, usingFinalTranscript: finalTranscriptHasContent,
            });

            const summaryPayload = {
                patient,
                doctorId: consultation.doctorId,
                patientId: consultation.patientId,
                appointmentId: consultation.appointmentId,
                consultationId,
                detectedLanguage: consultation.detectedLanguage || "",
                transcript: displayTranscript,
                finalGeminiTranscript: finalTranscript,
                liveTranscript,
                summary: consultation.summary || {},
                duration: formatDuration(recordingSeconds),
                durationSeconds: recordingSeconds,
                startedAt: startTimeRef.current || new Date().toISOString(),
                endedAt: new Date().toISOString(),
                generatedAt: new Date().toISOString(),
            };

            sessionStorage.setItem(`consultation-result-${patient.id}`, JSON.stringify(summaryPayload));

            setSummaryProgress(100);
            setSummaryStage(4);
            if (summaryIntervalRef.current) {
                clearInterval(summaryIntervalRef.current);
                summaryIntervalRef.current = null;
            }

            navigate(`/consultation/${patient.id}/summary`, {
                state: summaryPayload,
                replace: false,
            });

        } catch (error) {
            console.error("[Consultation] Final processing error:", error);
            setError(error?.message || "Unable to generate the final AI consultation report.");
            setIsReviewing(true);
        } finally {
            if (summaryIntervalRef.current) {
                clearInterval(summaryIntervalRef.current);
                summaryIntervalRef.current = null;
            }
            setIsGeneratingSummary(false);
        }
    };

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <div style={{ background: "#F5FBFD", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

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
                    PATIENT SIDEBAR
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
                        boxShadow: "0 8px 30px rgba(11, 43, 111, 0.08)",
                        border: "1px solid #DCECEF"
                    }}>
                        {/* TOP BLUE SECTION */}
                        <div style={{
                            background: "linear-gradient(180deg, #0B2B6F 0%, #08AFC0 100%)",
                            padding: "24px",
                            borderBottomLeftRadius: "24px",
                            borderBottomRightRadius: "24px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "24px",
                            position: "relative",
                            overflow: "hidden",
                            zIndex: 2
                        }}>
                            {/* Watermark inside top section */}
                            <i className="fa-solid fa-shield-halved" style={{ position: "absolute", right: "-20px", top: "20px", fontSize: "160px", color: "#ffffff", opacity: 0.06, transform: "rotate(15deg)" }}></i>

                            {/* Inner Back Button */}
                            <button
                                onClick={() => navigate("/dashboard")}
                                style={{ background: "#ffffff", color: "#0B2B6F", border: "none", padding: "8px 20px", borderRadius: "12px", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", alignSelf: "flex-start", zIndex: 1, boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}
                            >
                                <i className="fa-solid fa-arrow-left"></i> Back
                            </button>

                            <div style={{ display: "flex", alignItems: "center", gap: "15px", zIndex: 1 }}>
                                <div style={{ width: "65px", height: "65px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", fontWeight: "bold", color: "white", background: "rgba(255,255,255,0.15)" }}>
                                    {patient.name ? patient.name[0] : "P"}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, color: "#ffffff", fontSize: "1.4rem", fontWeight: 650 }}>{patient.name}</h3>
                                    <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.9rem", display: "block", marginTop: "4px" }}>{patient.age} years • {patient.gender}</span>
                                    <span style={{ color: "#ffffff", fontSize: "0.85rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                                        <i className="fa-solid fa-circle-check" style={{ color: "#ffffff" }}></i> Verified Patient
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM WHITE SECTION (Cards) */}
                        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", flex: 1, position: "relative", zIndex: 1, background: "#ffffff" }}>
                            {/* Patient Quick Vitals / Info */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", zIndex: 1 }}>
                                <div style={{ background: "#ffffff", border: "1px solid #DCECEF", padding: "14px", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <i className="fa-solid fa-droplet" style={{ color: "#08AFC0", fontSize: "1.2rem", marginBottom: "6px" }}></i>
                                    <div style={{ fontSize: "0.85rem", color: "#64748B", fontWeight: 500 }}>Blood Group</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 750, color: "#08AFC0" }}>{patient.bloodGroup === "Not Available" ? "-" : patient.bloodGroup}</div>
                                </div>
                                <div style={{ background: "#ffffff", border: "1px solid #DCECEF", padding: "14px", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <i className="fa-solid fa-weight-scale" style={{ color: "#1557B8", fontSize: "1.2rem", marginBottom: "6px" }}></i>
                                    <div style={{ fontSize: "0.85rem", color: "#64748B", fontWeight: 500 }}>Weight</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 750, color: "#0B2B6F" }}>{patient.weight === "Not Available" ? "-" : patient.weight}</div>
                                </div>
                                <div style={{ background: "#ffffff", border: "1px solid #DCECEF", padding: "14px", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <i className="fa-solid fa-heart-pulse" style={{ color: "#0B2B6F", fontSize: "1.2rem", marginBottom: "6px" }}></i>
                                    <div style={{ fontSize: "0.85rem", color: "#64748B", fontWeight: 500 }}>Blood Pressure</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 750, color: "#0B2B6F" }}>{patient.bloodPressure === "Not Available" ? "-" : patient.bloodPressure}</div>
                                </div>
                                <div style={{ background: "#ffffff", border: "1px solid #DCECEF", padding: "14px", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <i className="fa-solid fa-staff-snake" style={{ color: "#1557B8", fontSize: "1.2rem", marginBottom: "6px" }}></i>
                                    <div style={{ fontSize: "0.85rem", color: "#64748B", fontWeight: 500 }}>Allergies</div>
                                    <div style={{ fontSize: "1rem", fontWeight: 750, color: "#08AFC0", lineHeight: "1.3" }}>{patient.allergies === "None documented" ? "None documented" : patient.allergies}</div>
                                </div>
                            </div>

                            {/* Known Medical History */}
                            <div style={{ background: "#ffffff", border: "1px solid #DCECEF", padding: "20px", borderRadius: "18px", zIndex: 1 }}>
                                <div style={{ fontSize: "0.95rem", color: "#08AFC0", fontWeight: 750, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <i className="fa-solid fa-notes-medical"></i> Medical Background
                                </div>
                                <div style={{ fontSize: "0.9rem", color: "#0B2B6F", lineHeight: "1.6", fontWeight: 500, whiteSpace: "pre-line" }}>
                                    {patient.history || "No known medical history"}
                                </div>
                            </div>

                            {/* Patient Symptoms */}
                            <div style={{ background: "#ffffff", border: "1px solid #DCECEF", padding: "20px", borderRadius: "18px", zIndex: 1 }}>
                                <div style={{ fontSize: "0.95rem", color: "#08AFC0", fontWeight: 750, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <i className="fa-solid fa-stethoscope"></i> Patient Symptoms
                                </div>
                                <div style={{ fontSize: "0.9rem", color: "#0B2B6F", lineHeight: "1.6", fontWeight: 500, whiteSpace: "pre-line" }}>
                                    {patient.reason || "No symptoms documented"}
                                </div>
                            </div>

                            {/* Bottom Wave Graphic */}
                            <div style={{ position: "absolute", bottom: "-1px", left: 0, right: 0, zIndex: 0 }}>
                                <svg viewBox="0 0 1440 320" style={{ width: "100%", height: "auto", display: "block" }}>
                                    <path fill="#08AFC0" fillOpacity="1" d="M0,192L48,192C96,192,192,192,288,213.3C384,235,480,277,576,282.7C672,288,768,256,864,240C960,224,1056,224,1152,245.3C1248,267,1344,309,1392,330.7L1440,352L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                                    <path fill="#0B2B6F" fillOpacity="1" d="M0,256L48,245.3C96,235,192,213,288,213.3C384,213,480,235,576,250.7C672,267,768,277,864,261.3C960,245,1056,203,1152,186.7C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                                </svg>
                            </div>
                        </div>
                    </aside>


                    {/* ====================================================
                        TRANSCRIPTION AREA
                    ==================================================== */}

                    <div className="transcription-area" style={{ display: "flex", flexDirection: "column", gap: "24px", flex: 1, minWidth: 0, minHeight: 0, zIndex: 1 }}>

                        {/* TOP HEADER */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                <div style={{ width: "64px", height: "64px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <img src="/images/premium_mic.png" alt="Live Transcription Mic" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: "2rem", fontWeight: 800, color: "#0B2B6F", display: "flex", alignItems: "center", gap: "12px" }}>
                                        Live Transcription
                                        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                            <span style={{ width: "3px", height: "12px", background: "#08AFC0", borderRadius: "2px", display: "inline-block" }}></span>
                                            <span style={{ width: "3px", height: "18px", background: "#08AFC0", borderRadius: "2px", display: "inline-block" }}></span>
                                            <span style={{ width: "3px", height: "14px", background: "#08AFC0", borderRadius: "2px", display: "inline-block" }}></span>
                                            <span style={{ width: "3px", height: "10px", background: "#08AFC0", borderRadius: "2px", display: "inline-block" }}></span>
                                        </div>
                                    </h2>
                                    <span style={{ fontSize: "1rem", color: isListening ? "#10B981" : "#64748B", display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, marginTop: "4px" }}>
                                        <i className={`fa-solid ${isListening ? "fa-circle blink" : "fa-circle"}`} style={{ fontSize: "10px" }}></i>
                                        {isListening ? "Microphone active" : "Microphone inactive"}
                                    </span>
                                </div>
                            </div>

                            {/* Auto Detect Pill */}
                            <div style={{ background: "#ffffff", border: "1px solid #DCECEF", borderRadius: "24px", padding: "10px 18px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 2px 10px rgba(11, 43, 111, 0.03)" }}>
                                <i className="fa-solid fa-globe" style={{ color: "#08AFC0" }}></i>
                                <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isGeneratingSummary} style={{ background: "transparent", border: "none", color: "#0B2B6F", fontWeight: 600, fontSize: "0.95rem", outline: "none", cursor: "pointer", appearance: "none", paddingRight: "10px" }}>
                                    <option value="auto">Auto Detect (All Languages)</option>
                                    <option value="en-IN">English</option>
                                    <option value="te-IN">Telugu</option>
                                    <option value="hi-IN">Hindi</option>
                                </select>
                                <i className="fa-solid fa-chevron-down" style={{ color: "#0B2B6F", fontSize: "12px", pointerEvents: "none" }}></i>
                            </div>
                        </div>


                        {/* MAIN WHITE CONTAINER */}
                        <div style={{ background: "#ffffff", borderRadius: "20px", border: "1px solid #DCECEF", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", boxShadow: "0 8px 30px rgba(11, 43, 111, 0.06)" }}>

                            {/* Container Header */}
                            <div style={{ padding: "16px 24px", borderBottom: "1px solid #F0F4F8", display: "flex", alignItems: "center", gap: "12px", background: "#ffffff" }}>
                                <span style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10B981", padding: "4px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 650, display: "flex", alignItems: "center", gap: "6px" }}>
                                    <i className="fa-solid fa-circle" style={{ fontSize: "6px" }}></i> Live
                                </span>
                                <span style={{ color: "#1557B8", fontSize: "0.95rem", fontWeight: 500 }}>
                                    {isPaused ? "Consultation paused." : isListening ? "Transcription in progress..." : "Ready to start."}
                                </span>
                            </div>

                            {/* SCROLLABLE TRANSCRIPT */}
                            <div ref={transcriptContainerRef} style={{ padding: "32px 40px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "32px", minHeight: 0 }}>

                                {transcript.length === 0 && !liveInterimText && (
                                    <div style={{ textAlign: "center", color: "#94A3B8", paddingTop: "80px" }}>
                                        <i className="fa-solid fa-microphone-lines" style={{ fontSize: "50px", marginBottom: "20px", color: "#DCECEF" }}></i>
                                        <h3 style={{ margin: 0, color: "#0B2B6F", fontSize: "1.4rem" }}>Ready to Start Live Consultation</h3>
                                        <p style={{ marginTop: "8px", fontSize: "1rem" }}>Start the consultation to begin real-time transcription.</p>
                                    </div>
                                )}

                                {transcript.map((line, index) => {
                                    const isDoctor = line.speaker?.toLowerCase().includes("doctor");
                                    return (
                                        <div key={index} style={{ display: "flex", gap: "20px", position: "relative" }}>
                                            {/* Icon */}
                                            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: isDoctor ? "rgba(8, 174, 184, 0.1)" : "rgba(21, 87, 184, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                <i className={`fa-solid ${isDoctor ? 'fa-user-doctor' : 'fa-user'}`} style={{ color: isDoctor ? "#08AFC0" : "#1557B8", fontSize: "18px" }}></i>
                                            </div>

                                            {/* Content */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
                                                    <span style={{ fontWeight: 700, color: isDoctor ? "#08AFC0" : "#1557B8", fontSize: "1.05rem" }}>{line.speaker || (isDoctor ? "Doctor" : "Patient")}</span>
                                                    {line.timestamp && <span style={{ color: "#94A3B8", fontSize: "0.85rem" }}>{line.timestamp}</span>}
                                                </div>
                                                <div style={{ fontSize: "1.15rem", lineHeight: "1.6", color: "#0B2B6F", fontWeight: 450 }}>
                                                    {line.text}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {liveInterimText && !isPaused && (
                                    <div style={{ display: "flex", gap: "20px", position: "relative" }}>
                                        <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(8, 174, 184, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <i className="fa-solid fa-microphone fa-fade" style={{ color: "#08AFC0", fontSize: "18px" }}></i>
                                        </div>
                                        <div style={{ flex: 1, paddingRight: "40px" }}>
                                            <div style={{ fontWeight: 700, color: "#08AFC0", fontSize: "1.05rem", marginBottom: "8px" }}>Speaking...</div>
                                            <div style={{ fontSize: "1.15rem", lineHeight: "1.6", color: "#0B2B6F", fontWeight: 450 }}>
                                                {liveInterimText}
                                            </div>
                                        </div>
                                        {/* Right vertical active line */}
                                        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "4px", background: "#08AFC0", borderRadius: "2px" }}></div>
                                    </div>
                                )}

                            </div>
                        </div>


                        {/* ====================================================
                                CONTROLS
                            ==================================================== */}

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>

                            {/* Left Block: Secure & Confidential */}
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#ffffff", border: "1px solid #DCECEF", padding: "12px 20px", borderRadius: "20px", boxShadow: "0 2px 10px rgba(11, 43, 111, 0.04)", width: "32%" }}>
                                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(8, 174, 184, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <i className="fa-solid fa-shield-halved" style={{ color: "#08AFC0", fontSize: "16px" }}></i>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, color: "#0B2B6F", fontSize: "0.9rem" }}>Secure & Confidential</div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                                        Your consultation is end-to-end encrypted and private. <i className="fa-solid fa-lock" style={{ fontSize: "10px" }}></i>
                                    </div>
                                </div>
                            </div>

                            {/* Center Block: Action Buttons */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "40%" }}>
                                {!isRecording && !isGeneratingSummary && !isReviewing && (
                                    <button
                                        style={{
                                            background: "linear-gradient(90deg, #0B2B6F 0%, #1557B8 100%)",
                                            color: "white",
                                            border: "none",
                                            padding: "12px",
                                            paddingRight: "32px",
                                            borderRadius: "40px",
                                            fontSize: "1.1rem",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "16px",
                                            boxShadow: "0 8px 25px rgba(11, 43, 111, 0.2)",
                                            transition: "all 0.3s ease"
                                        }}
                                        onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; }}
                                        onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                                        onClick={startConsultation}
                                    >
                                        <img src="/images/start_mic.png" alt="Start" className="premium-glow-pulse" style={{ width: "52px", height: "52px", objectFit: "contain", margin: "-6px 0", mixBlendMode: "screen" }} />
                                        Start Consultation
                                    </button>
                                )}

                                {isRecording && !isReviewing && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        <button
                                            onClick={isPaused ? resumeConsultation : pauseConsultation}
                                            style={{
                                                background: "linear-gradient(90deg, #4e6574ff 0%, #3aa0bcff 100%)",
                                                color: "white",
                                                border: "none",
                                                padding: "12px",
                                                paddingRight: "24px",
                                                borderRadius: "40px",
                                                fontSize: "1.05rem",
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                                boxShadow: "0 8px 25px rgba(16, 185, 129, 0.3)",
                                                transition: "all 0.3s ease"
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
                                            onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
                                        >
                                            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <i className={`fa-solid ${isPaused ? "fa-play" : "fa-pause"}`} style={{ color: "#ffffff" }}></i>
                                            </div>
                                            {isPaused ? "Resume" : "Pause"}
                                        </button>
                                        <button
                                            onClick={discardRecording}
                                            style={{
                                                background: "linear-gradient(90deg, #058b97ff 0%, #28575dff 100%)",
                                                color: "white",
                                                border: "none",
                                                padding: "12px",
                                                paddingRight: "24px",
                                                borderRadius: "40px",
                                                fontSize: "1.05rem",
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                                boxShadow: "0 8px 25px rgba(239, 68, 68, 0.3)",
                                                transition: "all 0.3s ease"
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
                                            onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
                                        >
                                            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <i className="fa-solid fa-trash" style={{ color: "#ffffff" }}></i>
                                            </div>
                                            Delete
                                        </button>
                                        <button
                                            onClick={stopRecording}
                                            style={{
                                                background: "linear-gradient(90deg, #0B2B6F 0%, #0dacc1ff 100%)",
                                                color: "white",
                                                border: "none",
                                                padding: "12px",
                                                paddingRight: "32px",
                                                borderRadius: "40px",
                                                fontSize: "1.1rem",
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "16px",
                                                boxShadow: "0 8px 25px rgba(11, 43, 111, 0.2)",
                                                transition: "all 0.3s ease"
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"}
                                            onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
                                        >
                                            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "#08AFC0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <div style={{ width: "14px", height: "14px", background: "#ffffff", borderRadius: "2px" }}></div>
                                            </div>
                                            Stop Consultation
                                        </button>
                                    </div>
                                )}

                                {isReviewing && !isGeneratingSummary && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        <button
                                            onClick={discardRecording}
                                            style={{
                                                background: "#ffffff",
                                                color: "#074452ff",
                                                border: "1px solid #0b6e9fff",
                                                padding: "12px 24px",
                                                borderRadius: "40px",
                                                fontSize: "1.05rem",
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                transition: "all 0.3s ease"
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = "#FEF2F2"}
                                            onMouseOut={(e) => e.currentTarget.style.background = "#ffffff"}
                                        >
                                            <i className="fa-solid fa-trash"></i> Discard
                                        </button>
                                        <button
                                            onClick={processRecording}
                                            style={{
                                                background: "linear-gradient(90deg, #0f4d6463 0%, #056a96ff 100%)",
                                                color: "white",
                                                border: "none",
                                                padding: "12px",
                                                paddingRight: "28px",
                                                borderRadius: "40px",
                                                fontSize: "1.1rem",
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                                boxShadow: "0 8px 25px rgba(16, 185, 129, 0.3)",
                                                transition: "all 0.3s ease"
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-3px)"}
                                            onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
                                        >
                                            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <i className="fa-solid fa-cloud-arrow-up" style={{ color: "#ffffff" }}></i>
                                            </div>
                                            Save & Process
                                        </button>
                                    </div>
                                )}
                                <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
                                    {isReviewing ? "Audio saved locally. Ready to process." : "Consultation will be saved automatically"}
                                </div>
                            </div>

                            {/* Right Block: Timer */}
                            <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "#ffffff", border: "1px solid #DCECEF", padding: "12px 24px", borderRadius: "20px", boxShadow: "0 2px 10px rgba(11, 43, 111, 0.04)" }}>
                                <i className="fa-solid fa-chart-simple" style={{ color: "#08AFC0", fontSize: "24px" }}></i>
                                <div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748B", marginBottom: "2px" }}>Recording Duration</div>
                                    <div style={{ color: "#0B2B6F", fontWeight: 700, fontSize: "1.2rem", fontVariantNumeric: "tabular-nums" }}>
                                        {formatDuration(recordingSeconds)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {isGeneratingSummary && (
                            <div style={{ background: "#ffffff", border: "1px solid #08AFC0", padding: "16px 32px", borderRadius: "40px", display: "flex", alignItems: "center", gap: "16px", boxShadow: "0 8px 25px rgba(8, 174, 184, 0.15)" }}>
                                <i className="fa-solid fa-circle-notch fa-spin" style={{ color: "#08AFC0", fontSize: "1.4rem" }}></i>
                                <span style={{ color: "#0B2B6F", fontWeight: 700, fontSize: "1.1rem" }}>Synthesizing AI Medical Report...</span>
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
                        backgroundColor: "#F5FBFD",
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
                            border: "1px solid #DCECEF",
                            borderRadius: "24px",
                            padding: "40px",
                            boxShadow: "0 20px 60px rgba(11, 43, 111, 0.15)",
                            color: "#0B2B6F",
                            textAlign: "center",
                            position: "relative",
                            overflow: "hidden"
                        }}
                    >
                        {/* Icon */}
                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", borderRadius: "50%", background: "rgba(8, 174, 184, 0.1)", marginBottom: "24px" }}>
                            <i className="fa-solid fa-heart-pulse fa-fade" style={{ fontSize: "36px", color: "#08AFC0" }}></i>
                        </div>

                        <h2 style={{ fontSize: "1.6rem", fontWeight: 750, margin: "0 0 8px 0", color: "#0B2B6F" }}>
                            Generating AI Consultation Summary
                        </h2>
                        <p style={{ color: "#64748B", fontSize: "1rem", margin: "0 0 32px 0", lineHeight: "1.5" }}>
                            Gemini 3.5 Flash is analyzing your consultation audio & extracting clinical insights.
                        </p>

                        {/* Progress Bar Header */}
                        <div style={{ marginBottom: "24px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                                <span style={{ fontSize: "0.95rem", fontWeight: 650, color: "#1557B8", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                                    {PROCESSING_STEPS[summaryStage]?.title || "Processing..."}
                                </span>
                                <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "#08AFC0" }}>
                                    {Math.round(summaryProgress)}%
                                </span>
                            </div>

                            {/* Progress Bar */}
                            <div
                                style={{
                                    width: "100%",
                                    height: "12px",
                                    backgroundColor: "#F0F4F8",
                                    borderRadius: "10px",
                                    overflow: "hidden"
                                }}
                            >
                                <div
                                    style={{
                                        height: "100%",
                                        width: `${summaryProgress}%`,
                                        background: "linear-gradient(90deg, #1557B8 0%, #08AFC0 100%)",
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
                                                background: isCompleted
                                                    ? "rgba(16, 185, 129, 0.15)"
                                                    : isCurrent
                                                        ? "rgba(8, 174, 184, 0.15)"
                                                        : "#E2E8F0",
                                                color: isCompleted
                                                    ? "#10b981"
                                                    : isCurrent
                                                        ? "#08AFC0"
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
                                            <div style={{ fontSize: "0.95rem", fontWeight: isCurrent ? 700 : 500, color: isCurrent ? "#0B2B6F" : isCompleted ? "#475569" : "#94A3B8" }}>
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
                                <i className="fa-solid fa-clock" style={{ color: "#08AFC0" }}></i>
                                Elapsed: <strong style={{ color: "#0B2B6F" }}>{summaryElapsedSeconds}s</strong> &nbsp;(Expected ~5–10s)
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10b981", fontWeight: 650 }}>
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