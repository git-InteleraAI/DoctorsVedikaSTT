const express = require("express");

const router = express.Router();

const { supabaseAdmin } = require("../config/supabase");
const { evaluateSafety } = require("../services/clinical/safetyEngine");
const { interpretQrClinicalText } = require("../consultation/qrClinicalGemini");

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

const requestCounts = new Map();

function rateLimitQrLookup(req, res, next) {
    const key = req.ip || "anonymous";
    const now = Date.now();

    const existing = requestCounts.get(key);

    if (!existing || now >= existing.resetAt) {
        requestCounts.set(key, {
            count: 1,
            resetAt: now + WINDOW_MS,
        });

        return next();
    }

    if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
        res.set(
            "Retry-After",
            String(Math.ceil((existing.resetAt - now) / 1000))
        );

        return res.status(429).json({
            success: false,
            message: "Too many requests. Please try again shortly.",
        });
    }

    existing.count += 1;
    return next();
}

/**
 * GET /api/v1/public/qr/hospitals/:hospitalCode
 *
 * Public endpoint used after a patient scans a hospital QR code.
 *
 * IMPORTANT:
 * - No patient authentication required.
 * - Only public hospital metadata is returned.
 * - Patient/staff/doctor data is NEVER exposed.
 */
router.get(
    "/hospitals/:hospitalCode",
    rateLimitQrLookup,
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                console.error(
                    "[QR Intake] Supabase service-role client is unavailable."
                );

                return res.status(503).json({
                    success: false,
                    message:
                        "Hospital service is temporarily unavailable.",
                });
            }

            const rawCode = req.params.hospitalCode;

            if (typeof rawCode !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hospital code.",
                });
            }

            const hospitalCode = rawCode.trim().toUpperCase();

            // Prevent malformed / excessively long QR parameters.
            if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(hospitalCode)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hospital code.",
                });
            }

            const { data: hospital, error } = await supabaseAdmin
                .from("hospitals")
                .select(
                    "id, name, code, address, phone, email, status"
                )
                .eq("code", hospitalCode)
                .eq("status", "active")
                .maybeSingle();

            if (error) {
                console.error(
                    "[QR Intake] Hospital lookup failed:",
                    error.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to load hospital information.",
                });
            }

            if (!hospital) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Hospital not found or currently unavailable.",
                });
            }

            // Explicit response whitelist.
            // Never return the raw database object.
            return res.status(200).json({
                success: true,
                data: {
                    hospital: {
                        id: hospital.id,
                        name: hospital.name,
                        code: hospital.code,
                        address: hospital.address || null,
                        phone: hospital.phone || null,
                        email: hospital.email || null,
                    },
                },
            });
        } catch (error) {
            console.error(
                "[QR Intake] Unexpected hospital lookup error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load hospital information.",
            });
        }
    }
);

/**
 * POST /api/v1/public/qr/sessions
 *
 * Creates a temporary QR Intake Session for a patient.
 *
 * IMPORTANT:
 * - No patient authentication required.
 * - Does NOT create a hospital patient record.
 * - Does NOT create an appointment.
 * - Does NOT create a patient visit.
 * - The session remains temporary until Staff processes it.
 */
router.post(
    "/sessions",
    rateLimitQrLookup,
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                console.error(
                    "[QR Intake] Supabase service-role client is unavailable."
                );

                return res.status(503).json({
                    success: false,
                    message:
                        "QR intake service is temporarily unavailable.",
                });
            }

            const {
                hospitalCode,
                firstName,
                lastName,
                fullName,
                phone,
                email,
                dateOfBirth,
                gender,
            } = req.body || {};

            // ---------------------------------------------------------
            // Basic input validation
            // ---------------------------------------------------------

            if (
                typeof hospitalCode !== "string" ||
                typeof phone !== "string" ||
                typeof dateOfBirth !== "string"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Hospital code, phone number, and date of birth are required.",
                });
            }

            const normalizedHospitalCode =
                hospitalCode.trim().toUpperCase();

            if (
                !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(
                    normalizedHospitalCode
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hospital code.",
                });
            }

            // ---------------------------------------------------------
            // Validate name
            // ---------------------------------------------------------

            const normalizedFullName =
                typeof fullName === "string"
                    ? fullName.trim()
                    : `${typeof firstName === "string"
                          ? firstName.trim()
                          : ""} ${
                          typeof lastName === "string"
                              ? lastName.trim()
                              : ""
                      }`.trim();

            if (
                !normalizedFullName ||
                normalizedFullName.length < 2 ||
                normalizedFullName.length > 150
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid full name.",
                });
            }

            const normalizedFirstName =
                typeof firstName === "string"
                    ? firstName.trim()
                    : null;

            const normalizedLastName =
                typeof lastName === "string"
                    ? lastName.trim()
                    : null;

            // ---------------------------------------------------------
            // Validate phone
            // ---------------------------------------------------------

            const normalizedPhone = phone.trim();

            if (
                !/^[0-9+\-\s()]{7,20}$/.test(normalizedPhone)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid phone number.",
                });
            }

            // ---------------------------------------------------------
            // Validate date of birth
            // ---------------------------------------------------------

            const dob = dateOfBirth.trim();

            if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Date of birth must be in YYYY-MM-DD format.",
                });
            }

            const dobDate = new Date(`${dob}T00:00:00Z`);

            if (Number.isNaN(dobDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date of birth.",
                });
            }

            if (dobDate > new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Date of birth cannot be in the future.",
                });
            }

            // ---------------------------------------------------------
            // Validate optional email
            // ---------------------------------------------------------

            let normalizedEmail = null;

            if (typeof email === "string" && email.trim()) {
                normalizedEmail = email.trim().toLowerCase();

                if (
                    normalizedEmail.length > 254 ||
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                        normalizedEmail
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Please provide a valid email address.",
                    });
                }
            }

            // ---------------------------------------------------------
            // Validate optional gender
            // ---------------------------------------------------------

            let normalizedGender = null;

            if (typeof gender === "string" && gender.trim()) {
                normalizedGender = gender.trim().toLowerCase();

                if (normalizedGender.length > 50) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid gender value.",
                    });
                }
            }

            // ---------------------------------------------------------
            // Resolve hospital
            // ---------------------------------------------------------

            const {
                data: hospital,
                error: hospitalError,
            } = await supabaseAdmin
                .from("hospitals")
                .select("id, name, code, status")
                .eq("code", normalizedHospitalCode)
                .eq("status", "active")
                .maybeSingle();

            if (hospitalError) {
                console.error(
                    "[QR Intake] Hospital lookup failed:",
                    hospitalError.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to validate hospital.",
                });
            }

            if (!hospital) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Hospital not found or currently unavailable.",
                });
            }

            // ---------------------------------------------------------
            // Create temporary QR Intake Session
            // ---------------------------------------------------------

            const expiresAt = new Date(
                Date.now() + 30 * 60 * 1000
            ).toISOString();

            const {
                data: session,
                error: sessionError,
            } = await supabaseAdmin
                .from("qr_intake_sessions")
                .insert({
                    hospital_id: hospital.id,
                    first_name: normalizedFirstName,
                    last_name: normalizedLastName,
                    full_name: normalizedFullName,
                    phone: normalizedPhone,
                    email: normalizedEmail,
                    date_of_birth: dob,
                    gender: normalizedGender,
                    status: "collecting",
                    clinical_intake: {},
                    safety_status: "unknown",
                    safety_result: {},
                    ai_processing_consent: false,
                    expires_at: expiresAt,
                })
                .select(
                    "id, access_token, hospital_id, full_name, status, expires_at, created_at"
                )
                .single();

            if (sessionError) {
                console.error(
                    "[QR Intake] Session creation failed:",
                    sessionError.message
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to create QR intake session.",
                });
            }

            // ---------------------------------------------------------
            // Return only required session information
            // ---------------------------------------------------------

            return res.status(201).json({
                success: true,
                data: {
                    session: {
                        id: session.id,
                        accessToken: session.access_token,
                        hospitalId: session.hospital_id,
                        patientName: session.full_name,
                        status: session.status,
                        expiresAt: session.expires_at,
                        createdAt: session.created_at,
                    },
                    hospital: {
                        id: hospital.id,
                        name: hospital.name,
                        code: hospital.code,
                    },
                },
            });
        } catch (error) {
            console.error(
                "[QR Intake] Unexpected session creation error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to create QR intake session.",
            });
        }
    }
);

/**
 * GET /api/v1/public/qr/sessions/:accessToken
 *
 * Loads a QR Intake Session for the patient-facing flow.
 *
 * IMPORTANT:
 * - No patient authentication required.
 * - Access is controlled by the session access token.
 * - Only the minimum required session information is returned.
 * - Expired sessions cannot be used.
 */
router.get(
    "/sessions/:accessToken",
    rateLimitQrLookup,
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                console.error(
                    "[QR Intake] Supabase service-role client is unavailable."
                );

                return res.status(503).json({
                    success: false,
                    message:
                        "QR intake service is temporarily unavailable.",
                });
            }

            const accessToken = req.params.accessToken?.trim();

            // Supabase UUID validation.
            if (
                !accessToken ||
                !/^[0-9a-fA-F-]{36}$/.test(accessToken)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid QR intake session token.",
                });
            }

            // ---------------------------------------------------------
            // Load session
            // ---------------------------------------------------------

            const {
                data: session,
                error,
            } = await supabaseAdmin
                .from("qr_intake_sessions")
                .select(`
                    id,
                    access_token,
                    hospital_id,
                    full_name,
                    first_name,
                    last_name,
                    phone,
                    email,
                    date_of_birth,
                    gender,
                    status,
                    clinical_intake,
                    safety_status,
                    safety_result,
                    ai_processing_consent,
                    submitted_at,
                    expires_at,
                    created_at,
                    updated_at
                `)
                .eq("access_token", accessToken)
                .maybeSingle();

            if (error) {
                console.error(
                    "[QR Intake] Session lookup failed:",
                    error.message
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load QR intake session.",
                });
            }

            if (!session) {
                return res.status(404).json({
                    success: false,
                    message:
                        "QR intake session not found.",
                });
            }

            // ---------------------------------------------------------
            // Check expiry
            // ---------------------------------------------------------

            if (
                session.expires_at &&
                new Date(session.expires_at).getTime() <= Date.now()
            ) {
                if (
                    session.status === "collecting" ||
                    session.status === "review"
                ) {
                    const { error: expiryUpdateError } =
                        await supabaseAdmin
                            .from("qr_intake_sessions")
                            .update({
                                status: "expired",
                                updated_at:
                                    new Date().toISOString(),
                            })
                            .eq("id", session.id);

                    if (expiryUpdateError) {
                        console.error(
                            "[QR Intake] Failed to mark session expired:",
                            expiryUpdateError.message
                        );
                    }
                }

                return res.status(410).json({
                    success: false,
                    message:
                        "This QR intake session has expired. Please scan the hospital QR code again.",
                });
            }

            // ---------------------------------------------------------
            // Validate session state
            // ---------------------------------------------------------

            const allowedStatuses = [
                "collecting",
                "review",
                "submitted",
                "safety_blocked",
            ];

            if (!allowedStatuses.includes(session.status)) {
                return res.status(409).json({
                    success: false,
                    message:
                        "This QR intake session is no longer available.",
                });
            }

            // ---------------------------------------------------------
            // Load hospital
            // ---------------------------------------------------------

            const {
                data: hospital,
                error: hospitalError,
            } = await supabaseAdmin
                .from("hospitals")
                .select("id, name, code")
                .eq("id", session.hospital_id)
                .eq("status", "active")
                .maybeSingle();

            if (hospitalError) {
                console.error(
                    "[QR Intake] Hospital lookup failed:",
                    hospitalError.message
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load hospital information.",
                });
            }

            if (!hospital) {
                return res.status(404).json({
                    success: false,
                    message:
                        "The hospital associated with this session is unavailable.",
                });
            }

            // ---------------------------------------------------------
            // Return patient-safe session data
            // ---------------------------------------------------------

            return res.status(200).json({
                success: true,
                data: {
                    session: {
                        id: session.id,
                        accessToken: session.access_token,
                        hospitalId: session.hospital_id,

                        firstName: session.first_name,
                        lastName: session.last_name,
                        patientName: session.full_name,

                        phone: session.phone,
                        email: session.email,
                        dateOfBirth: session.date_of_birth,
                        gender: session.gender,

                        status: session.status,

                        clinicalIntake:
                            session.clinical_intake || {},

                        safetyStatus:
                            session.safety_status || "unknown",

                        safetyResult:
                            session.safety_result || {},

                        aiProcessingConsent:
                            session.ai_processing_consent === true,

                        submittedAt:
                            session.submitted_at,

                        expiresAt:
                            session.expires_at,

                        createdAt:
                            session.created_at,

                        updatedAt:
                            session.updated_at,
                    },

                    hospital: {
                        id: hospital.id,
                        name: hospital.name,
                        code: hospital.code,
                    },
                },
            });
        } catch (error) {
            console.error(
                "[QR Intake] Unexpected session lookup error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load QR intake session.",
            });
        }
    }
);

/**
 * PATCH /api/v1/public/qr/sessions/:accessToken/consent
 *
 * Records the patient's affirmative AI-processing consent for the QR intake
 * session. The access token is the only session credential required because
 * QR patients are not authenticated users yet.
 */
router.patch(
    "/sessions/:accessToken/consent",
    rateLimitQrLookup,
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                return res.status(503).json({
                    success: false,
                    message: "QR intake service is temporarily unavailable.",
                });
            }

            const accessToken = req.params.accessToken?.trim();
            if (!accessToken || !/^[0-9a-fA-F-]{36}$/.test(accessToken)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid QR intake session token.",
                });
            }

            const consentValue =
                req.body?.aiProcessingConsent ?? req.body?.consent;

            if (typeof consentValue !== "boolean") {
                return res.status(400).json({
                    success: false,
                    message: "Consent value must be true or false.",
                });
            }

            const { data: session, error: sessionError } = await supabaseAdmin
                .from("qr_intake_sessions")
                .select("id, access_token, status, expires_at, ai_processing_consent")
                .eq("access_token", accessToken)
                .maybeSingle();

            if (sessionError) {
                console.error(
                    "[QR Intake] Consent session lookup failed:",
                    sessionError.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to load QR intake session.",
                });
            }

            if (!session) {
                return res.status(404).json({
                    success: false,
                    message: "QR intake session not found.",
                });
            }

            if (
                session.expires_at &&
                new Date(session.expires_at).getTime() <= Date.now()
            ) {
                await supabaseAdmin
                    .from("qr_intake_sessions")
                    .update({
                        status: "expired",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", session.id);

                return res.status(410).json({
                    success: false,
                    message:
                        "This QR intake session has expired. Please scan the QR code again.",
                });
            }

            const allowedStatuses = ["collecting", "review"];
            if (!allowedStatuses.includes(session.status)) {
                return res.status(409).json({
                    success: false,
                    message:
                        `Session is in '${session.status}' state and cannot be modified.`,
                });
            }

            const now = new Date().toISOString();
            const updatePayload = {
                ai_processing_consent: consentValue,
                ai_processing_consented_at: consentValue ? now : null,
                updated_at: now,
            };

            const { data: updatedSession, error: updateError } =
                await supabaseAdmin
                    .from("qr_intake_sessions")
                    .update(updatePayload)
                    .eq("id", session.id)
                    .select(
                        "id, access_token, status, ai_processing_consent, ai_processing_consented_at, updated_at"
                    )
                    .single();

            if (updateError) {
                console.error(
                    "[QR Intake] Consent update failed:",
                    updateError.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to save consent.",
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    session: {
                        id: updatedSession.id,
                        status: updatedSession.status,
                        aiProcessingConsent:
                            updatedSession.ai_processing_consent === true,
                        aiProcessingConsentedAt:
                            updatedSession.ai_processing_consented_at,
                        updatedAt: updatedSession.updated_at,
                    },
                },
            });
        } catch (error) {
            console.error(
                "[QR Intake] Unexpected consent update error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Unable to save consent.",
            });
        }
    }
);

function sanitizeClinicalIntake(input) {
    if (!input || typeof input !== "object") {
        return {
            symptoms: [],
            location: null,
            duration: null,
            recent_actions: null,
            severity: null,
            current_medications: null,
            additional_notes: null,
        };
    }

    const symptoms = Array.isArray(input.symptoms)
        ? Array.from(new Set(input.symptoms.map((s) => String(s).trim()).filter(Boolean)))
        : [];

    const location =
        typeof input.location === "string" && input.location.trim()
            ? input.location.trim()
            : null;

    const duration =
        typeof input.duration === "string" && input.duration.trim()
            ? input.duration.trim()
            : null;

    const recent_actions =
        typeof input.recent_actions === "string" && input.recent_actions.trim()
            ? input.recent_actions.trim()
            : null;

    const validSeverities = ["mild", "moderate", "severe", "unsure"];
    const severity =
        typeof input.severity === "string" &&
        validSeverities.includes(input.severity.toLowerCase().trim())
            ? input.severity.toLowerCase().trim()
            : null;

    const current_medications =
        typeof input.current_medications === "string" &&
        input.current_medications.trim()
            ? input.current_medications.trim()
            : null;

    const additional_notes =
        typeof input.additional_notes === "string" &&
        input.additional_notes.trim()
            ? input.additional_notes.trim()
            : null;

    const clinical_details = {};
    if (input.clinical_details && typeof input.clinical_details === "object" && !Array.isArray(input.clinical_details)) {
        for (const [key, value] of Object.entries(input.clinical_details)) {
            if (!/^[a-zA-Z0-9_]{1,80}$/.test(key)) continue;
            if (typeof value === "boolean") {
                clinical_details[key] = value;
            } else if (typeof value === "string" && value.trim()) {
                clinical_details[key] = value.trim().slice(0, 300);
            }
        }
    }

    return {
        symptoms,
        location,
        duration,
        recent_actions,
        severity,
        current_medications,
        additional_notes,
        clinical_details,
    };
}

/**
 * POST /api/v1/public/qr/sessions/:accessToken/interpret
 *
 * Phase 4 Gemini fallback endpoint.
 * The browser sends only the latest patient message. The server owns the
 * Gemini credential, session state, consent state, and authoritative safety
 * re-evaluation.
 */
router.post(
    "/sessions/:accessToken/interpret",
    rateLimitQrLookup,
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                return res.status(503).json({
                    success: false,
                    message: "QR intake service is temporarily unavailable.",
                });
            }

            const accessToken = req.params.accessToken?.trim();
            if (!accessToken || !/^[0-9a-fA-F-]{36}$/.test(accessToken)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid QR intake session token.",
                });
            }

            const text = typeof req.body?.text === "string"
                ? req.body.text.trim()
                : "";
            const questionnaireKey = typeof req.body?.questionnaireKey === "string"
                ? req.body.questionnaireKey.trim().slice(0, 80)
                : "general";

            if (!text || text.length > 2000) {
                return res.status(400).json({
                    success: false,
                    message: "Clinical text must contain between 1 and 2000 characters.",
                });
            }

            const { data: session, error: sessionError } = await supabaseAdmin
                .from("qr_intake_sessions")
                .select("id, status, expires_at, clinical_intake, ai_processing_consent")
                .eq("access_token", accessToken)
                .maybeSingle();

            if (sessionError) {
                console.error(
                    "[QR Intake] Gemini session lookup failed:",
                    sessionError.message
                );
                return res.status(500).json({
                    success: false,
                    message: "Unable to load QR intake session.",
                });
            }

            if (!session) {
                return res.status(404).json({
                    success: false,
                    message: "QR intake session not found.",
                });
            }

            if (
                session.expires_at &&
                new Date(session.expires_at).getTime() <= Date.now()
            ) {
                await supabaseAdmin
                    .from("qr_intake_sessions")
                    .update({
                        status: "expired",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", session.id);

                return res.status(410).json({
                    success: false,
                    message: "This QR intake session has expired. Please scan the QR code again.",
                });
            }

            if (!["collecting", "review"].includes(session.status)) {
                return res.status(409).json({
                    success: false,
                    message: `Session is in '${session.status}' state and cannot be interpreted.`,
                });
            }

            // Gemini processing is permitted only after affirmative patient consent.
            if (session.ai_processing_consent !== true) {
                return res.status(403).json({
                    success: false,
                    message: "AI processing consent is required before clinical interpretation.",
                });
            }

            // Never trust client-supplied knownIntake as clinical context.
            // The session's persisted intake is the authoritative context.
            const knownIntake = session.clinical_intake || {};
            const result = await interpretQrClinicalText({
                text,
                questionnaireKey,
                knownIntake,
                accessToken,
            });

            const extraction = result?.extraction || {};
            const existingSymptoms = Array.isArray(knownIntake.symptoms)
                ? knownIntake.symptoms
                : [];
            const extractedSymptoms = Array.isArray(extraction.symptoms)
                ? extraction.symptoms
                : [];

            const mergedIntake = {
                ...knownIntake,
                ...Object.fromEntries(
                    Object.entries(extraction).filter(([, value]) =>
                        value !== null && value !== undefined && value !== "" &&
                        !(Array.isArray(value) && value.length === 0) &&
                        !(typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
                    )
                ),
                symptoms: Array.from(new Set([...existingSymptoms, ...extractedSymptoms])),
            };

            const safetyResult = evaluateSafety(mergedIntake);

            return res.status(200).json({
                success: true,
                data: {
                    confidence: result?.confidence || "LOW",
                    extraction,
                    safetyResult,
                },
            });
        } catch (error) {
            console.error(
                "[QR Intake] Gemini clinical interpretation failed:",
                error.message
            );

            return res.status(502).json({
                success: false,
                message: "Clinical AI interpretation is temporarily unavailable.",
            });
        }
    }
);

/**
 * PATCH /api/v1/public/qr/sessions/:accessToken/intake
 *
 * Persists structured clinical intake and updates safety evaluation.
 */
router.patch(
    "/sessions/:accessToken/intake",
    rateLimitQrLookup,
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                return res.status(503).json({
                    success: false,
                    message: "QR intake service is temporarily unavailable.",
                });
            }

            const accessToken = req.params.accessToken?.trim();
            if (!accessToken || !/^[0-9a-fA-F-]{36}$/.test(accessToken)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid QR intake session token.",
                });
            }

            const { data: session, error: sessionError } = await supabaseAdmin
                .from("qr_intake_sessions")
                .select("id, access_token, hospital_id, status, expires_at, clinical_intake")
                .eq("access_token", accessToken)
                .maybeSingle();

            if (sessionError || !session) {
                return res.status(404).json({
                    success: false,
                    message: "QR intake session not found.",
                });
            }

            // Expiry check
            if (
                session.expires_at &&
                new Date(session.expires_at).getTime() <= Date.now()
            ) {
                await supabaseAdmin
                    .from("qr_intake_sessions")
                    .update({ status: "expired", updated_at: new Date().toISOString() })
                    .eq("id", session.id);

                return res.status(410).json({
                    success: false,
                    message: "This QR intake session has expired. Please scan the QR code again.",
                });
            }

            // Status check
            const allowedStatuses = ["collecting", "review"];
            if (!allowedStatuses.includes(session.status)) {
                return res.status(409).json({
                    success: false,
                    message: `Session is in '${session.status}' state and cannot be modified.`,
                });
            }

            // Sanitize intake
            const incomingIntake = req.body?.clinicalIntake || req.body?.intake || {};
            const sanitizedIntake = sanitizeClinicalIntake({
                ...(session.clinical_intake || {}),
                ...incomingIntake,
            });

            // Authoritative server-side safety re-evaluation
            const safetyResult = evaluateSafety(sanitizedIntake);
            const safetyStatus = (safetyResult.status || "SAFE").toLowerCase();

            const nextStatus = req.body?.status === "review" ? "review" : session.status;

            const { data: updatedSession, error: updateError } = await supabaseAdmin
                .from("qr_intake_sessions")
                .update({
                    clinical_intake: sanitizedIntake,
                    safety_status: safetyStatus,
                    safety_result: safetyResult,
                    status: nextStatus,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", session.id)
                .select("id, access_token, status, clinical_intake, safety_status, safety_result, updated_at")
                .single();

            if (updateError) {
                console.error("[QR Intake] Session update failed:", updateError.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to update clinical intake.",
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    session: {
                        id: updatedSession.id,
                        status: updatedSession.status,
                        clinicalIntake: updatedSession.clinical_intake,
                        safetyStatus: updatedSession.safety_status,
                        safetyResult: updatedSession.safety_result,
                        updatedAt: updatedSession.updated_at,
                    },
                },
            });
        } catch (err) {
            console.error("[QR Intake] Unexpected update error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to update clinical intake.",
            });
        }
    }
);

/**
 * POST /api/v1/public/qr/sessions/:accessToken/submit
 *
 * Submits the intake session for Staff desk processing.
 * Server-side safety evaluation is authoritative:
 * If CRITICAL -> sets safety_blocked and stops submission.
 * Otherwise -> sets submitted with submitted_at.
 */
router.post(
    "/sessions/:accessToken/submit",
    rateLimitQrLookup,
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                return res.status(503).json({
                    success: false,
                    message: "QR intake service is temporarily unavailable.",
                });
            }

            const accessToken = req.params.accessToken?.trim();
            if (!accessToken || !/^[0-9a-fA-F-]{36}$/.test(accessToken)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid QR intake session token.",
                });
            }

            const { data: session, error: sessionError } = await supabaseAdmin
                .from("qr_intake_sessions")
                .select("id, access_token, hospital_id, full_name, status, expires_at, clinical_intake, safety_status, safety_result")
                .eq("access_token", accessToken)
                .maybeSingle();

            if (sessionError || !session) {
                return res.status(404).json({
                    success: false,
                    message: "QR intake session not found.",
                });
            }

            // Expiry check
            if (
                session.expires_at &&
                new Date(session.expires_at).getTime() <= Date.now()
            ) {
                await supabaseAdmin
                    .from("qr_intake_sessions")
                    .update({ status: "expired", updated_at: new Date().toISOString() })
                    .eq("id", session.id);

                return res.status(410).json({
                    success: false,
                    message: "This QR intake session has expired. Please scan the QR code again.",
                });
            }

            // Idempotency: if already submitted, return success
            if (session.status === "submitted") {
                return res.status(200).json({
                    success: true,
                    message: "Session is already submitted.",
                    data: {
                        session: {
                            id: session.id,
                            status: session.status,
                            clinicalIntake: session.clinical_intake,
                            safetyStatus: session.safety_status,
                        },
                    },
                });
            }

            if (session.status === "safety_blocked") {
                return res.status(200).json({
                    success: false,
                    safetyBlocked: true,
                    message: "Session is blocked due to clinical emergency criteria.",
                    data: {
                        status: "safety_blocked",
                        safetyStatus: "critical",
                    },
                });
            }

            // Allowed to submit from collecting or review
            const allowedStatuses = ["collecting", "review"];
            if (!allowedStatuses.includes(session.status)) {
                return res.status(409).json({
                    success: false,
                    message: `Session cannot be submitted in '${session.status}' state.`,
                });
            }

            // Resolve final structured intake
            const incomingIntake = req.body?.clinicalIntake || req.body?.intake;
            const finalIntake = incomingIntake
                ? sanitizeClinicalIntake({ ...(session.clinical_intake || {}), ...incomingIntake })
                : session.clinical_intake || {};

            // MANDATORY SERVER-SIDE SAFETY RE-EVALUATION
            const safetyResult = evaluateSafety(finalIntake);
            const safetyStatus = (safetyResult.status || "SAFE").toLowerCase();

            // CRITICAL check
            if (safetyResult.status === "CRITICAL") {
                await supabaseAdmin
                    .from("qr_intake_sessions")
                    .update({
                        status: "safety_blocked",
                        clinical_intake: finalIntake,
                        safety_status: "critical",
                        safety_result: safetyResult,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", session.id);

                return res.status(200).json({
                    success: false,
                    safetyBlocked: true,
                    message: "Urgent medical attention required.",
                    data: {
                        status: "safety_blocked",
                        safetyStatus: "critical",
                        safetyResult,
                    },
                });
            }

            // Normal submission (SAFE / CAUTION)
            const submittedAt = new Date().toISOString();
            const { data: submittedSession, error: submitError } = await supabaseAdmin
                .from("qr_intake_sessions")
                .update({
                    status: "submitted",
                    clinical_intake: finalIntake,
                    safety_status: safetyStatus,
                    safety_result: safetyResult,
                    submitted_at: submittedAt,
                    updated_at: submittedAt,
                })
                .eq("id", session.id)
                .select("id, status, submitted_at, safety_status, clinical_intake")
                .single();

            if (submitError) {
                console.error("[QR Intake] Submit update failed:", submitError.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to submit clinical intake session.",
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    session: {
                        id: submittedSession.id,
                        status: submittedSession.status,
                        submittedAt: submittedSession.submitted_at,
                        safetyStatus: submittedSession.safety_status,
                        clinicalIntake: submittedSession.clinical_intake,
                    },
                },
            });
        } catch (err) {
            console.error("[QR Intake] Unexpected submit error:", err.message);
            return res.status(500).json({
                success: false,
                message: "Unable to submit clinical intake.",
            });
        }
    }
);

module.exports = router;