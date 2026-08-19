import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { mockPatients } from "../data/mockPatients";

const PYTHON_WS_URL = import.meta.env.VITE_PYTHON_WS_URL || "ws://localhost:8005/ws/live";
const NODE_API_URL = import.meta.env.VITE_NODE_API_URL || "http://localhost:5000";


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
    const mockPatient = mockPatients.find((p) => p.id === patientId) || mockPatients[0];
    const patient = appointmentPatient
        ? {
            ...mockPatient,
            id: appointmentPatient.patientId || patientId,
            name: appointmentPatient.patient || mockPatient.name,
            age: appointmentPatient.age ?? mockPatient.age,
            gender: appointmentPatient.gender ?? mockPatient.gender,
            bloodGroup: appointmentPatient.bloodGroup ?? mockPatient.bloodGroup,
            weight: appointmentPatient.weight ?? mockPatient.weight,
            bloodPressure: appointmentPatient.bloodPressure ?? mockPatient.bloodPressure,
            allergies: appointmentPatient.allergies ?? mockPatient.allergies,
            history: appointmentPatient.history ?? mockPatient.history,
        }
        : mockPatient;

    // ============================================================
    // STATE
    // ============================================================

    const [isRecording, setIsRecording] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] =
        useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);

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

    // Prevent duplicate live transcript lines.
    const lastTranscriptRef = useRef("");

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
        if (transcriptContainerRef.current) {
            transcriptContainerRef.current.scrollTop =
                transcriptContainerRef.current.scrollHeight;
        }
    }, [transcript, liveInterimText]);

    useEffect(() => {
        if (isRecording && !isPaused && sessionActiveRef.current) {
            console.log("[Consultation] Language updated during recording:", language);
            stopBrowserSpeechRecognition();
            startBrowserSpeechRecognition();
        }
    }, [language]);

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

        // Resume Speech Recognition
        try {
            startBrowserSpeechRecognition();
        } catch (e) {
            console.warn("Resume SpeechRecognition warning:", e);
        }

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

                        setTranscript(
                            (previous) => [
                                ...previous,
                                newLine,
                            ]
                        );

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

                    if (
                        message.type === "stopped"
                    ) {
                        console.log(
                            "[Consultation] Python service stopped"
                        );
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
                                return previous;
                            }
                            return [
                                ...previous,
                                {
                                    speaker: "Conversation",
                                    text: text,
                                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                                    isFinal: true,
                                },
                            ];
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

            // Start live Web Speech API on screen
            startBrowserSpeechRecognition();

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

    const endConsultation = async () => {
        if (!isRecording) {
            return;
        }

        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }

        setError("");
        setIsGeneratingSummary(true);
        setSummaryProgress(10);
        setSummaryStage(0);
        setSummaryElapsedSeconds(0);
        sessionActiveRef.current = false;

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

        const recorder = mediaRecorderRef.current;
        const stream = mediaStreamRef.current;
        const websocket = websocketRef.current;

        try {
            // --------------------------------------------------------
            // STOP RECORDER AND WAIT FOR THE FINAL AUDIO CHUNK
            // --------------------------------------------------------

            if (recorder && recorder.state !== "inactive") {
                await new Promise((resolve) => {
                    let resolved = false;

                    const finish = () => {
                        if (resolved) return;
                        resolved = true;
                        resolve();
                    };

                    const originalOnStop = recorder.onstop;

                    recorder.onstop = (event) => {
                        console.log(
                            "[Consultation] Audio recording stopped"
                        );

                        setIsRecording(false);

                        if (typeof originalOnStop === "function") {
                            try {
                                originalOnStop(event);
                            } catch (error) {
                                console.warn(
                                    "Previous onstop handler error:",
                                    error
                                );
                            }
                        }

                        finish();
                    };

                    try {
                        recorder.requestData();
                    } catch (error) {
                        console.warn(
                            "requestData failed:",
                            error
                        );
                    }

                    try {
                        recorder.stop();
                    } catch (error) {
                        console.warn(
                            "Recorder stop error:",
                            error
                        );
                        finish();
                    }

                    // Safety timeout so the UI never gets stuck.
                    setTimeout(finish, 1500);
                });
            }

            // --------------------------------------------------------
            // STOP MICROPHONE
            // --------------------------------------------------------

            if (stream) {
                stream
                    .getTracks()
                    .forEach((track) => track.stop());
            }

            setIsRecording(false);
            setIsListening(false);

            // --------------------------------------------------------
            // STOP PYTHON LIVE TRANSCRIPTION
            // --------------------------------------------------------

            try {
                if (
                    websocket &&
                    websocket.readyState === WebSocket.OPEN
                ) {
                    websocket.send(
                        JSON.stringify({
                            type: "stop",
                        })
                    );
                }
            } catch (error) {
                console.warn(
                    "Could not send stop to Python:",
                    error
                );
            }

            // Give the final WebSocket message a moment to arrive.
            await new Promise((resolve) =>
                setTimeout(resolve, 200)
            );

            try {
                if (websocket) {
                    websocket.close();
                }
            } catch (error) {
                console.warn(
                    "WebSocket close error:",
                    error
                );
            }

            websocketRef.current = null;
            mediaRecorderRef.current = null;
            mediaStreamRef.current = null;

            // --------------------------------------------------------
            // BUILD COMPLETE AUDIO
            // --------------------------------------------------------

            const chunks = audioChunksRef.current;

            console.log(
                "[Consultation] Total audio chunks:",
                chunks.length
            );

            if (!chunks.length) {
                throw new Error(
                    "No audio was recorded. Please try the consultation again."
                );
            }

            const completeAudio = new Blob(chunks, {
                type: "audio/webm",
            });

            console.log(
                "[Consultation] Complete audio size:",
                completeAudio.size,
                "bytes"
            );

            if (completeAudio.size < 1000) {
                throw new Error(
                    "The consultation recording is too short or empty."
                );
            }

            // --------------------------------------------------------
            // SEND COMPLETE AUDIO TO NODE -> GEMINI
            // --------------------------------------------------------

            const formData = new FormData();

            formData.append(
                "audio",
                completeAudio,
                `consultation-${Date.now()}.webm`
            );

            formData.append(
                "doctorId",
                doctorId
            );

            formData.append(
                "patientId",
                patient.id
            );

            formData.append(
                "appointmentId",
                String(appointmentId)
            );

            // Send the complete live transcript as a reference as well.
            // This prevents the final AI pass from dropping or rewriting
            // the last few spoken lines of the consultation.
            formData.append(
                "liveTranscript",
                JSON.stringify(transcript)
            );

            console.log(
                "[Consultation] Sending COMPLETE recording to Node/Gemini..."
            );

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

            let response;
            try {
                response = await fetch(
                    `${NODE_API_URL}/api/consultation/complete`,
                    {
                        method: "POST",
                        body: formData,
                        signal: controller.signal,
                    }
                );
            } catch (requestError) {
                if (requestError?.name === "AbortError") {
                    throw new Error(
                        "AI consultation processing exceeded 5 minutes. Check the backend terminal for the Gemini error and try again."
                    );
                }
                throw requestError;
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const errorText = await response.text();

                throw new Error(
                    errorText ||
                    `Backend returned ${response.status}`
                );
            }

            const data = await response.json();

            console.log(
                "[Consultation] Final consultation response:",
                data
            );

            if (!data.success || !data.consultation) {
                throw new Error(
                    data.message ||
                    "Consultation processing failed."
                );
            }

            const consultation = data.consultation;

            // --------------------------------------------------------
            // PROTECT THE COMPLETE TRANSCRIPT
            // --------------------------------------------------------
            // The live WebSocket transcript is already captured locally.
            // If the final AI transcript is noticeably shorter, use the
            // live transcript for the report so the end of the consultation
            // is not silently lost. The Gemini summary is still preserved.
            const finalTranscript = Array.isArray(
                consultation.transcript
            )
                ? consultation.transcript
                : [];

            const liveTranscript = Array.isArray(
                transcript
            )
                ? transcript
                : [];

            const transcriptChars = (items) =>
                items
                    .map((item) =>
                        String(
                            item?.text ||
                            item?.transcript ||
                            ""
                        )
                    )
                    .join(" ")
                    .trim()
                    .length;

            const finalChars = transcriptChars(
                finalTranscript
            );

            const liveChars = transcriptChars(
                liveTranscript
            );

            const finalTranscriptHasContent = finalTranscript.length > 0;

            const displayTranscript =
                finalTranscriptHasContent
                    ? finalTranscript
                    : liveTranscript;

            console.log(
                "[Consultation] Transcript selection:",
                {
                    finalSegments: finalTranscript.length,
                    liveSegments: liveTranscript.length,
                    finalChars,
                    liveChars,
                    usingFinalTranscript: finalTranscriptHasContent,
                }
            );

            // --------------------------------------------------------
            // SAVE RESULT SO THE SUMMARY PAGE ALSO WORKS AFTER
            // REFRESH / DIRECT NAVIGATION.
            // --------------------------------------------------------

            const summaryPayload = {
                patient,
                doctorId: consultation.doctorId,
                patientId: consultation.patientId,
                appointmentId: consultation.appointmentId,
                detectedLanguage:
                    consultation.detectedLanguage || "",
                transcript: displayTranscript,
                finalGeminiTranscript: finalTranscript,
                liveTranscript,
                summary:
                    consultation.summary || {},
                duration: formatDuration(recordingSeconds),
                durationSeconds: recordingSeconds,
                startedAt: startTimeRef.current || new Date().toISOString(),
                endedAt: new Date().toISOString(),
                generatedAt:
                    new Date().toISOString(),
            };

            sessionStorage.setItem(
                `consultation-result-${patient.id}`,
                JSON.stringify(summaryPayload)
            );

            // --------------------------------------------------------
            // OPEN FINAL SUMMARY
            // --------------------------------------------------------

            setSummaryProgress(100);
            setSummaryStage(4);
            if (summaryIntervalRef.current) {
                clearInterval(summaryIntervalRef.current);
                summaryIntervalRef.current = null;
            }

            navigate(
                `/consultation/${patient.id}/summary`,
                {
                    state: summaryPayload,
                    replace: false,
                }
            );

        } catch (error) {
            console.error(
                "[Consultation] Final processing error:",
                error
            );

            setError(
                error?.message ||
                "Unable to generate the final AI consultation report."
            );
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
        <div className="portal-container">

            <main
                className="main-content"
                style={{
                    paddingTop: "1rem",
                }}
            >

                {/* HEADER */}

                <div className="header-top">

                    <button
                        onClick={() =>
                            navigate("/dashboard")
                        }
                        className="btn btn-secondary"
                    >
                        <i className="fa-solid fa-arrow-left"></i>
                        &nbsp;
                        Back
                    </button>

                    {isRecording && (
                        <div
                            className="recording-indicator"
                            style={{
                                borderColor: isPaused ? "rgba(245, 158, 11, 0.5)" : undefined,
                                color: isPaused ? "#fbbf24" : undefined,
                                background: isPaused ? "rgba(245, 158, 11, 0.12)" : undefined
                            }}
                        >
                            <i
                                className={`fa-solid ${isPaused ? "fa-pause" : "fa-circle blink"}`}
                                style={{ color: isPaused ? "#f59e0b" : "#ef4444" }}
                            ></i>
                            {isPaused ? "Consultation Paused" : "Live Consultation"}
                        </div>
                    )}

                </div>


                {/* ERROR */}

                {error && (
                    <div
                        style={{
                            margin: "15px 0",
                            padding:
                                "12px 16px",
                            borderRadius: "10px",
                            background:
                                "rgba(255,51,102,0.12)",
                            border:
                                "1px solid rgba(255,51,102,0.3)",
                            color: "#ff6b8a",
                        }}
                    >
                        {error}
                    </div>
                )}


                <div className="consultation-layout">

                    {/* ====================================================
                        PATIENT SIDEBAR
                    ==================================================== */}

                    <aside className="patient-sidebar">

                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "15px",
                                marginBottom:
                                    "25px",
                            }}
                        >

                            <div
                                style={{
                                    width: "55px",
                                    height: "55px",
                                    borderRadius:
                                        "50%",
                                    background:
                                        "linear-gradient(135deg, var(--primary), var(--secondary))",
                                    display:
                                        "flex",
                                    alignItems:
                                        "center",
                                    justifyContent:
                                        "center",
                                    fontSize:
                                        "22px",
                                    fontWeight:
                                        "bold",
                                    color: "white",
                                }}
                            >
                                {patient.name
                                    ? patient.name[0]
                                    : "P"}
                            </div>

                            <div>
                                <h3
                                    style={{
                                        margin: 0,
                                    }}
                                >
                                    {
                                        patient.name
                                    }
                                </h3>

                                <span
                                    style={{
                                        color: "var(--text-muted)",
                                        fontSize:
                                            "0.85rem",
                                    }}
                                >
                                    {
                                        patient.age
                                    }{" "}
                                    years •{" "}
                                    {
                                        patient.gender
                                    }
                                </span>
                            </div>

                        </div>

                        {/* Patient Quick Vitals / Info */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                            <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--glass-border)", padding: "10px 14px", borderRadius: "10px" }}>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Blood Group</div>
                                <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: "2px", color: "var(--primary)" }}>{patient.bloodGroup || "O+"}</div>
                            </div>
                            <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--glass-border)", padding: "10px 14px", borderRadius: "10px" }}>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Weight</div>
                                <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: "2px", color: "#ffffff" }}>{patient.weight || "65 kg"}</div>
                            </div>
                            <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--glass-border)", padding: "10px 14px", borderRadius: "10px" }}>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Blood Pressure</div>
                                <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: "2px", color: "#ffffff" }}>{patient.bloodPressure || "120/80"}</div>
                            </div>
                            <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--glass-border)", padding: "10px 14px", borderRadius: "10px" }}>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Allergies</div>
                                <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: "2px", color: "#f87171" }}>{patient.allergies || "None"}</div>
                            </div>
                        </div>

                        {/* Known Medical History */}
                        <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--glass-border)", padding: "14px", borderRadius: "12px" }}>
                            <div style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                                <i className="fa-solid fa-notes-medical"></i> Medical Background
                            </div>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: "1.5" }}>
                                {patient.history || "No prior major chronic conditions on record."}
                            </div>
                        </div>

                    </aside>


                    {/* ====================================================
                        TRANSCRIPTION AREA
                    ==================================================== */}

                    <div className="transcription-area">

                        <div className="panel">

                            {/* PANEL HEADER */}

                            <div
                                style={{
                                    display: "flex",
                                    alignItems:
                                        "center",
                                    gap: "15px",
                                    marginBottom:
                                        "20px",
                                    paddingBottom:
                                        "15px",
                                    borderBottom:
                                        "1px solid var(--glass-border)",
                                }}
                            >

                                <i
                                    className="fa-solid fa-microphone"
                                    style={{
                                        fontSize:
                                            "24px",
                                        color:
                                            isPaused
                                                ? "#f59e0b"
                                                : isListening
                                                    ? "var(--primary)"
                                                    : "#666",
                                    }}
                                ></i>


                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                                        <h3
                                            style={{
                                                margin: 0,
                                            }}
                                        >
                                            Live Transcription
                                        </h3>

                                        {isRecording && (
                                            <span
                                                style={{
                                                    background: isPaused ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)",
                                                    color: isPaused ? "#fbbf24" : "#f87171",
                                                    border: isPaused ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(239, 68, 68, 0.35)",
                                                    padding: "2px 10px",
                                                    borderRadius: "12px",
                                                    fontSize: "0.8rem",
                                                    fontWeight: 700,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "6px"
                                                }}
                                            >
                                                <i className={`fa-solid ${isPaused ? "fa-pause" : "fa-circle blink"}`} style={{ fontSize: "8px", color: isPaused ? "#f59e0b" : "#ef4444" }}></i>
                                                {isPaused ? `PAUSED (${formatDuration(recordingSeconds)})` : `REC ${formatDuration(recordingSeconds)}`}
                                            </span>
                                        )}
                                    </div>

                                    <span
                                        style={{
                                            color:
                                                isPaused
                                                    ? "#fbbf24"
                                                    : "var(--text-muted)",
                                            fontSize:
                                                "0.85rem",
                                            display: "block",
                                            marginTop: "4px"
                                        }}
                                    >
                                        {isPaused
                                            ? "Consultation paused. Click 'Resume Consultation' to continue recording."
                                            : isListening
                                                ? "Listening..."
                                                : isGeneratingSummary
                                                    ? "Synthesizing AI medical report in seconds..."
                                                    : "Microphone inactive"}
                                    </span>
                                </div>


                                <div
                                    style={{
                                        marginLeft:
                                            "auto",
                                    }}
                                >

                                    <select
                                        value={
                                            language
                                        }
                                        onChange={(
                                            e
                                        ) =>
                                            setLanguage(
                                                e.target
                                                    .value
                                            )
                                        }
                                        disabled={
                                            isGeneratingSummary
                                        }
                                        style={{
                                            padding:
                                                "8px 12px",
                                            borderRadius:
                                                "8px",
                                            background:
                                                "rgba(255,255,255,0.05)",
                                            color:
                                                "white",
                                            border:
                                                "1px solid var(--glass-border)",
                                            cursor: isGeneratingSummary ? "not-allowed" : "pointer"
                                        }}
                                    >

                                        <option
                                            value="auto"
                                            style={{
                                                color: "black",
                                            }}
                                        >
                                            Auto Detect (All Languages)
                                        </option>

                                        <option
                                            value="en-IN"
                                            style={{
                                                color: "black",
                                            }}
                                        >
                                            English
                                        </option>

                                        <option
                                            value="te-IN"
                                            style={{
                                                color: "black",
                                            }}
                                        >
                                            Telugu (తెలుగు)
                                        </option>

                                        <option
                                            value="hi-IN"
                                            style={{
                                                color: "black",
                                            }}
                                        >
                                            Hindi (हिन्दी)
                                        </option>

                                    </select>

                                </div>

                            </div>


                            {/* ====================================================
                                LIVE TRANSCRIPT
                            ==================================================== */}

                            <div
                                ref={transcriptContainerRef}
                                style={{
                                    minHeight:
                                        "350px",
                                    maxHeight:
                                        "500px",
                                    overflowY:
                                        "auto",
                                    scrollBehavior:
                                        "smooth",
                                }}
                            >

                                {transcript.length ===
                                    0 &&
                                    !liveInterimText &&
                                    !isRecording && (
                                        <div
                                            style={{
                                                textAlign:
                                                    "center",
                                                color:
                                                    "#666",
                                                paddingTop:
                                                    "120px",
                                            }}
                                        >

                                            <i
                                                className="fa-solid fa-microphone"
                                                style={{
                                                    fontSize:
                                                        "45px",
                                                    marginBottom:
                                                        "15px",
                                                }}
                                            ></i>

                                            <p>
                                                Start the consultation to begin live transcription.
                                            </p>

                                        </div>
                                    )}

                                {isRecording && transcript.length === 0 && !liveInterimText && (
                                    <div
                                        style={{
                                            textAlign: "center",
                                            padding: "80px 20px",
                                            color: "var(--primary)",
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: "14px"
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <span style={{ width: "4px", height: "18px", background: "var(--primary)", borderRadius: "2px", display: "inline-block" }}></span>
                                            <span style={{ width: "4px", height: "30px", background: "var(--primary)", borderRadius: "2px", display: "inline-block" }}></span>
                                            <span style={{ width: "4px", height: "24px", background: "var(--primary)", borderRadius: "2px", display: "inline-block" }}></span>
                                            <span style={{ width: "4px", height: "16px", background: "var(--primary)", borderRadius: "2px", display: "inline-block" }}></span>
                                        </div>
                                        <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#ffffff" }}>
                                            Listening to Doctor & Patient Speech...
                                        </div>
                                        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "420px", lineHeight: "1.5" }}>
                                            Speak in Telugu, Hindi, or English. Spoken words will type out live here on your screen.
                                        </p>
                                    </div>
                                )}


                                {transcript.map(
                                    (
                                        line,
                                        index
                                    ) => (
                                        <div
                                            key={
                                                index
                                            }
                                            style={{
                                                marginBottom:
                                                    "18px",
                                                background: "rgba(255, 255, 255, 0.02)",
                                                border: "1px solid rgba(255, 255, 255, 0.05)",
                                                padding: "12px 16px",
                                                borderRadius: "10px"
                                            }}
                                        >

                                            <div
                                                style={{
                                                    fontSize:
                                                        "0.75rem",
                                                    color:
                                                        line.speaker?.toLowerCase().includes("doctor")
                                                            ? "var(--primary)"
                                                            : "#10b981",
                                                    fontWeight: 700,
                                                    marginBottom:
                                                        "6px",
                                                    display: "flex",
                                                    justifyContent: "space-between"
                                                }}
                                            >
                                                <span>{line.speaker || "Conversation"}</span>
                                                {line.timestamp && (
                                                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                                                        {line.timestamp}
                                                    </span>
                                                )}
                                            </div>


                                            <div
                                                style={{
                                                    fontSize:
                                                        "1.05rem",
                                                    lineHeight:
                                                        "1.6",
                                                    color: "#ffffff"
                                                }}
                                            >
                                                {
                                                    line.text
                                                }
                                            </div>

                                        </div>
                                    )
                                )}

                                {liveInterimText && !isPaused && (
                                    <div
                                        style={{
                                            marginTop: "12px",
                                            marginBottom: "20px",
                                            padding: "14px 18px",
                                            borderLeft: "4px solid var(--primary)",
                                            background: "rgba(0, 210, 255, 0.08)",
                                            borderRadius: "10px",
                                            border: "1px solid rgba(0, 210, 255, 0.25)",
                                            boxShadow: "0 0 15px rgba(0, 210, 255, 0.1)"
                                        }}
                                    >
                                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                                            <i className="fa-solid fa-microphone-lines fa-fade"></i>
                                            Speaking now:
                                        </div>
                                        <div style={{ fontSize: "1.1rem", lineHeight: "1.6", color: "#ffffff", fontWeight: 500 }}>
                                            {liveInterimText}
                                            <span style={{ display: "inline-block", width: "2px", height: "1em", background: "var(--primary)", marginLeft: "4px", verticalAlign: "middle" }}></span>
                                        </div>
                                    </div>
                                )}

                            </div>


                            {/* ====================================================
                                CONTROLS
                            ==================================================== */}

                            <div
                                style={{
                                    marginTop:
                                        "20px",
                                    paddingTop:
                                        "20px",
                                    borderTop:
                                        "1px solid var(--glass-border)",
                                    display:
                                        "flex",
                                    justifyContent:
                                        "center",
                                }}
                            >

                                {!isRecording &&
                                    !isGeneratingSummary && (

                                        <button
                                            className="btn btn-accept"
                                            onClick={
                                                startConsultation
                                            }
                                            style={{
                                                padding:
                                                    "12px 25px",
                                            }}
                                        >

                                            <i className="fa-solid fa-play"></i>
                                            &nbsp;

                                            Start Consultation

                                        </button>

                                    )}


                                {isRecording && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
                                        {/* Timer Badge */}
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                background: isPaused ? "rgba(245, 158, 11, 0.15)" : "rgba(255, 255, 255, 0.05)",
                                                border: isPaused ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--glass-border)",
                                                padding: "10px 18px",
                                                borderRadius: "10px",
                                                color: isPaused ? "#fbbf24" : "#f87171",
                                                fontWeight: 700,
                                                fontSize: "1.05rem",
                                                letterSpacing: "1px"
                                            }}
                                        >
                                            <i className={isPaused ? "fa-solid fa-pause" : "fa-solid fa-stopwatch"} style={{ color: isPaused ? "#f59e0b" : "var(--primary)" }}></i>
                                            <span>{formatDuration(recordingSeconds)}</span>
                                            {isPaused && (
                                                <span style={{ fontSize: "0.72rem", background: "#f59e0b", color: "#000", fontWeight: 800, padding: "1px 6px", borderRadius: "4px", marginLeft: "4px" }}>
                                                    PAUSED
                                                </span>
                                            )}
                                        </div>

                                        {/* Pause / Resume Button */}
                                        <button
                                            className="btn"
                                            onClick={isPaused ? resumeConsultation : pauseConsultation}
                                            style={{
                                                padding: "12px 24px",
                                                background: isPaused
                                                    ? "linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.4))"
                                                    : "linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.4))",
                                                borderColor: isPaused ? "#10b981" : "#f59e0b",
                                                color: "#ffffff",
                                                fontWeight: 600,
                                                borderRadius: "10px",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                boxShadow: isPaused ? "0 0 15px rgba(16, 185, 129, 0.3)" : "0 0 15px rgba(245, 158, 11, 0.3)",
                                                cursor: "pointer",
                                                transition: "all 0.2s ease"
                                            }}
                                        >
                                            <i className={`fa-solid ${isPaused ? "fa-play" : "fa-pause"}`}></i>
                                            {isPaused ? "Resume Consultation" : "Pause Consultation"}
                                        </button>

                                        {/* End Consultation Button */}
                                        <button
                                            className="btn btn-secondary"
                                            onClick={
                                                endConsultation
                                            }
                                            style={{
                                                padding:
                                                    "12px 28px",
                                                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(220, 38, 38, 0.4))",
                                                borderColor: "#ef4444",
                                                color: "#ffffff",
                                                fontWeight: 600,
                                                borderRadius: "10px",
                                                boxShadow: "0 0 15px rgba(239, 68, 68, 0.25)",
                                                cursor: "pointer"
                                            }}
                                        >
                                            <i className="fa-solid fa-stop"></i>
                                            &nbsp;
                                            End Consultation
                                        </button>
                                    </div>
                                )}


                                {isGeneratingSummary && (
                                    <div
                                        style={{
                                            textAlign:
                                                "center",
                                            color:
                                                "var(--primary)",
                                            padding: "14px 24px",
                                            background: "rgba(0, 210, 255, 0.08)",
                                            borderRadius: "12px",
                                            border: "1px solid rgba(0, 210, 255, 0.25)",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "12px"
                                        }}
                                    >
                                        <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: "1.2rem" }}></i>

                                        <span
                                            style={{
                                                fontWeight: 600,
                                                fontSize: "0.95rem"
                                            }}
                                        >
                                            Processing consultation and generating AI clinical report in seconds...
                                        </span>
                                    </div>
                                )}

                            </div>

                        </div>

                    </div>

                </div>

                {/* ============================================================
                    AI SUMMARY GENERATION PROGRESS MODAL OVERLAY
                ============================================================ */}
                {isGeneratingSummary && (
                    <div
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 99999,
                            backgroundColor: "rgba(3, 7, 18, 0.88)",
                            backdropFilter: "blur(16px)",
                            WebkitBackdropFilter: "blur(16px)",
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
                                background: "linear-gradient(145deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.98))",
                                border: "1px solid rgba(0, 210, 255, 0.35)",
                                borderRadius: "24px",
                                padding: "34px 28px",
                                boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 50px rgba(0, 210, 255, 0.18)",
                                color: "#ffffff",
                                textAlign: "center",
                                position: "relative",
                                overflow: "hidden"
                            }}
                        >
                            {/* Ambient Glow */}
                            <div
                                style={{
                                    position: "absolute",
                                    top: "-80px",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    width: "280px",
                                    height: "160px",
                                    background: "radial-gradient(circle, rgba(0, 210, 255, 0.3) 0%, transparent 70%)",
                                    pointerEvents: "none"
                                }}
                            />

                            {/* Glowing Heart Pulse Icon */}
                            <div style={{ position: "relative", display: "inline-block", marginBottom: "18px" }}>
                                <div
                                    style={{
                                        width: "72px",
                                        height: "72px",
                                        borderRadius: "50%",
                                        background: "linear-gradient(135deg, #00d2ff 0%, #3a7bd5 60%, #00f2fe 100%)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        boxShadow: "0 0 35px rgba(0, 210, 255, 0.65)",
                                    }}
                                >
                                    <i className="fa-solid fa-heart-pulse" style={{ fontSize: "32px", color: "#ffffff" }}></i>
                                </div>
                            </div>

                            <h2 style={{ fontSize: "1.45rem", fontWeight: 700, margin: "0 0 6px 0", letterSpacing: "-0.3px", color: "#ffffff" }}>
                                Generating AI Consultation Summary
                            </h2>
                            <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: "0 0 24px 0", lineHeight: "1.4" }}>
                                Gemini 3.5 Flash is analyzing your consultation audio & extracting clinical insights
                            </p>

                            {/* Progress Bar Header */}
                            <div style={{ marginBottom: "20px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#00d2ff", display: "flex", alignItems: "center", gap: "6px" }}>
                                        <i className="fa-solid fa-circle-notch fa-spin"></i>
                                        {PROCESSING_STEPS[summaryStage]?.title || "Processing..."}
                                    </span>
                                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", letterSpacing: "0.5px" }}>
                                        {Math.round(summaryProgress)}%
                                    </span>
                                </div>

                                {/* Glowing Progress Bar */}
                                <div
                                    style={{
                                        width: "100%",
                                        height: "12px",
                                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                                        borderRadius: "10px",
                                        overflow: "hidden",
                                        padding: "2px",
                                        border: "1px solid rgba(255, 255, 255, 0.12)",
                                        boxSizing: "border-box"
                                    }}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            width: `${summaryProgress}%`,
                                            background: "linear-gradient(90deg, #00d2ff 0%, #3a7bd5 50%, #00f2fe 100%)",
                                            borderRadius: "8px",
                                            transition: "width 0.3s ease-out",
                                            boxShadow: "0 0 15px rgba(0, 210, 255, 0.85)"
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Step-by-Step Checklist */}
                            <div
                                style={{
                                    background: "rgba(255, 255, 255, 0.03)",
                                    border: "1px solid rgba(255, 255, 255, 0.07)",
                                    borderRadius: "14px",
                                    padding: "12px 18px",
                                    textAlign: "left",
                                    marginBottom: "20px"
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
                                                gap: "12px",
                                                padding: "6px 0",
                                                opacity: isCompleted ? 0.75 : isCurrent ? 1 : 0.3,
                                                transition: "all 0.3s ease"
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: "22px",
                                                    height: "22px",
                                                    borderRadius: "50%",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: "0.75rem",
                                                    background: isCompleted
                                                        ? "rgba(16, 185, 129, 0.25)"
                                                        : isCurrent
                                                            ? "rgba(0, 210, 255, 0.25)"
                                                            : "rgba(255, 255, 255, 0.05)",
                                                    color: isCompleted
                                                        ? "#10b981"
                                                        : isCurrent
                                                            ? "#00d2ff"
                                                            : "#64748b",
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
                                                <div style={{ fontSize: "0.85rem", fontWeight: isCurrent ? 700 : 500, color: isCurrent ? "#ffffff" : isCompleted ? "#cbd5e1" : "#64748b" }}>
                                                    {step.title}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Footer Metrics */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", color: "#94a3b8", flexWrap: "wrap", gap: "8px" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <i className="fa-solid fa-clock" style={{ color: "#38bdf8" }}></i>
                                    Elapsed: <strong style={{ color: "#ffffff" }}>{summaryElapsedSeconds}s</strong> &nbsp;(Expected ~5–10s)
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10b981", fontWeight: 600 }}>
                                    <i className="fa-solid fa-shield-halved"></i>
                                    Auto-redirecting on finish
                                </span>
                            </div>
                        </div>
                    </div>
                )}

            </main>

        </div>
    );
};

export default Consultation;