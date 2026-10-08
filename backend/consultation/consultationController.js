const fs = require("fs");
const crypto = require("crypto");
const { supabaseAdmin } = require("../config/supabase");

const {
  processConsultationAudio,
  generateSummaryFromTranscript,
} = require("./geminiService");

/**
 * SHA-256 Deterministic Transcript Hashing
 */
function createConsultationTranscriptHash(transcript = []) {
  const normalized = Array.isArray(transcript)
    ? transcript.map((item) => ({
        speaker: item?.speaker || "Conversation",
        timestamp: item?.timestamp ?? null,
        text: String(item?.text || "").trim(),
      }))
    : [];

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}



// ============================================================
// CONFIGURATION
// ============================================================

// How long a prepared summary is kept in memory.
//
// This is only a temporary performance cache.
// The actual consultation/PDF data should eventually be
// persisted in Supabase.
const SUMMARY_STATE_TTL_MS =
  30 * 60 * 1000; // 30 minutes


// Minimum number of new transcript lines before another
// background Gemini preparation request is started.
//
// This prevents a Gemini request for every single speech
// segment.
const MIN_NEW_LINES_FOR_BACKGROUND_SUMMARY =
  2;

const MIN_BACKGROUND_SUMMARY_INTERVAL_MS =
  4000; // 4 seconds


// ============================================================
// PER-CONSULTATION SUMMARY STATE
// ============================================================

/**
 * IMPORTANT:
 *
 * This Map is keyed by consultationId.
 *
 * Each consultation gets its own state:
 *
 * consultation-A
 *   ├── transcript
 *   ├── summary
 *   ├── lastPreparedAt
 *   └── preparationPromise
 *
 * consultation-B
 *   ├── transcript
 *   ├── summary
 *   ├── lastPreparedAt
 *   └── preparationPromise
 *
 * Therefore multiple doctors can work simultaneously without
 * sharing one global summary.
 *
 * This is an in-memory optimization layer.
 *
 * Later, for multi-instance production deployment, this state
 * should move to Redis or Supabase.
 */
const consultationSummaryStates =
  new Map();


// ============================================================
// TRANSCRIPT PARSING
// ============================================================

/**
 * Safely parse the transcript received from the frontend.
 *
 * The frontend may send:
 *
 * - JSON string
 * - already parsed array
 * - empty / undefined value
 */
function parseLiveTranscript(rawTranscript) {
  if (!rawTranscript) {
    return [];
  }

  if (Array.isArray(rawTranscript)) {
    return rawTranscript;
  }

  if (typeof rawTranscript === "string") {
    try {
      const parsed =
        JSON.parse(rawTranscript);

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch (error) {
      console.warn(
        "[Consultation] Unable to parse live transcript JSON:",
        error.message
      );

      return [];
    }
  }

  return [];
}


// ============================================================
// TRANSCRIPT NORMALIZATION
// ============================================================

/**
 * Remove empty transcript entries and normalize the minimum
 * structure required by the transcript-first Gemini service.
 */
function normalizeLiveTranscript(
  transcript
) {
  if (!Array.isArray(transcript)) {
    return [];
  }

  return transcript
    .map((item) => {

      if (typeof item === "string") {

        const text =
          item.trim();

        if (!text) {
          return null;
        }

        return {
          speaker: "Conversation",
          text,
          timestamp: null,
          isFinal: true,
        };
      }


      if (
        !item ||
        typeof item !== "object"
      ) {
        return null;
      }


      const text =
        String(
          item.text || ""
        ).trim();


      if (!text) {
        return null;
      }


      return {
        speaker:
          item.speaker ||
          "Conversation",

        text,

        timestamp:
          item.timestamp ??
          null,

        isFinal:
          item.isFinal !== false,
      };
    })
    .filter(Boolean);
}


// ============================================================
// CONSULTATION ID
// ============================================================

/**
 * Create a stable key for a consultation.
 *
 * consultationId is preferred.
 *
 * The fallback prevents different doctors/patients from
 * accidentally sharing state if the frontend has not yet
 * provided consultationId.
 */
function getConsultationKey({
  consultationId,
  doctorId,
  patientId,
  appointmentId,
}) {
  if (consultationId) {
    return String(
      consultationId
    );
  }

  return [
    doctorId || "unknown-doctor",
    patientId || "unknown-patient",
    appointmentId || "unknown-appointment",
  ].join(":");
}


// ============================================================
// STATE MANAGEMENT
// ============================================================

function createConsultationState({
  consultationId,
  doctorId,
  patientId,
  appointmentId,
}) {
  return {
    consultationId:
      consultationId || null,

    doctorId:
      doctorId || null,

    patientId:
      patientId || null,

    appointmentId:
      appointmentId
        ? String(appointmentId)
        : null,

    // Latest transcript received from frontend.
    transcript: [],
    transcriptHash: null,

    // Latest Gemini-generated summary.
    summary: null,

    // Detected language if available.
    detectedLanguage:
      "Auto-detected",

    // SHA-256 hash of the transcript snapshot used to generate summary.
    preparedTranscriptHash: null,

    // Number of transcript lines that were included
    // in the latest background summary.
    preparedTranscriptLength: 0,

    // Time when Gemini last generated a summary.
    lastPreparedAt: 0,

    // Indicates that a Gemini request is currently running.
    preparationInProgress: false,

    // Promise of the currently running preparation.
    preparationPromise: null,

    // Last error is retained for debugging but does not
    // break the consultation.
    lastPreparationError: null,

    // Last activity for TTL cleanup.
    lastActivityAt:
      Date.now(),
  };
}


function getConsultationState({
  consultationId,
  doctorId,
  patientId,
  appointmentId,
}) {
  const key =
    getConsultationKey({
      consultationId,
      doctorId,
      patientId,
      appointmentId,
    });


  let state =
    consultationSummaryStates.get(
      key
    );


  if (!state) {

    state =
      createConsultationState({
        consultationId,
        doctorId,
        patientId,
        appointmentId,
      });

    consultationSummaryStates.set(
      key,
      state
    );
  }


  state.lastActivityAt =
    Date.now();


  return {
    key,
    state,
  };
}


// ============================================================
// CLEANUP
// ============================================================

/**
 * Remove expired in-memory consultation states.
 *
 * This keeps the Node process from accumulating states
 * indefinitely.
 */
function cleanupExpiredConsultationStates() {
  const now =
    Date.now();


  for (
    const [
      key,
      state,
    ] of consultationSummaryStates
  ) {

    if (
      now -
      state.lastActivityAt >
      SUMMARY_STATE_TTL_MS
    ) {

      // Do not delete a consultation while Gemini is actively
      // preparing its summary.
      if (
        !state.preparationInProgress
      ) {
        consultationSummaryStates.delete(
          key
        );
      }
    }
  }
}


// Run lightweight cleanup periodically.
const cleanupTimer =
  setInterval(
    cleanupExpiredConsultationStates,
    5 * 60 * 1000
  );


// Do not keep the Node process alive just because of the
// cleanup timer.
if (
  cleanupTimer &&
  typeof cleanupTimer.unref ===
  "function"
) {
  cleanupTimer.unref();
}


// ============================================================
// BACKGROUND SUMMARY DECISION
// ============================================================

function shouldPrepareBackgroundSummary(
  state,
  transcript
) {
  if (
    !Array.isArray(transcript) ||
    transcript.length === 0
  ) {
    return false;
  }


  // If a Gemini request is already running, do not start
  // another one for the same consultation.
  if (
    state.preparationInProgress
  ) {
    return false;
  }


  // First usable transcript should be prepared.
  if (
    state.preparedTranscriptLength ===
    0
  ) {
    return true;
  }


  const newLines =
    transcript.length -
    state.preparedTranscriptLength;


  if (
    newLines <
    MIN_NEW_LINES_FOR_BACKGROUND_SUMMARY
  ) {
    return false;
  }


  const timeSinceLastPreparation =
    Date.now() -
    state.lastPreparedAt;


  if (
    timeSinceLastPreparation <
    MIN_BACKGROUND_SUMMARY_INTERVAL_MS
  ) {
    return false;
  }


  return true;
}


// ============================================================
// BACKGROUND SUMMARY PREPARATION
// ============================================================

/**
 * Start a Gemini summary request without making the HTTP
 * request wait for it.
 *
 * IMPORTANT:
 *
 * This function intentionally does NOT await Gemini from the
 * calling request.
 *
 * Therefore:
 *
 * Frontend transcript update
 *        ↓
 * backend receives it
 *        ↓
 * background Gemini request starts
 *        ↓
 * HTTP request can finish immediately
 *
 * The doctor does not wait for Gemini.
 */
function startBackgroundSummaryPreparation(
  state,
  transcript,
  patientReason = ""
) {
  if (
    state.preparationInProgress
  ) {
    return;
  }


  if (
    !Array.isArray(transcript) ||
    transcript.length === 0
  ) {
    return;
  }


  // Snapshot the transcript so that the state can continue
  // receiving new transcript lines while Gemini processes
  // this snapshot.
  const transcriptSnapshot =
    transcript.map(
      (item) => ({
        ...item,
      })
    );

  const snapshotHash =
    createConsultationTranscriptHash(transcriptSnapshot);

  state.preparationInProgress =
    true;

  state.lastPreparationError =
    null;


  const startedAt =
    Date.now();


  console.log(
    `[Consultation] Starting background AI summary preparation for ${state.consultationId || state.appointmentId || "consultation"} with ${transcriptSnapshot.length} transcript lines (Hash: ${snapshotHash.slice(0, 8)}).`
  );


  const preparationPromise =
    generateSummaryFromTranscript(
      transcriptSnapshot,
      patientReason,
      { priority: "LOW" }
    )
      .then((result) => {

        // ------------------------------------------------------
        // Only replace the summary if this background operation
        // succeeded.
        // ------------------------------------------------------

        if (
          result &&
          result.consultation_summary
        ) {

          state.summary =
            result.consultation_summary;

          state.detectedLanguage =
            result.detected_language ||
            state.detectedLanguage ||
            "Auto-detected";

          state.preparedTranscriptLength =
            transcriptSnapshot.length;

          state.preparedTranscriptHash =
            snapshotHash;

          state.lastPreparedAt =
            Date.now();

          state.lastPreparationError = null;
        }


        console.log(
          `[Consultation] Background AI summary prepared in ${Date.now() - startedAt}ms for ${state.consultationId || state.appointmentId || "consultation"}.`
        );


        return result;
      })
      .catch((error) => {

        state.lastPreparationError =
          error?.message ||
          "Background summary preparation failed.";


        console.error(
          `[Consultation] Background AI summary failed for ${state.consultationId || state.appointmentId || "consultation"}:`,
          error
        );


        return null;
      })
      .finally(() => {

        state.preparationInProgress =
          false;

        state.preparationPromise =
          null;

        state.lastActivityAt =
          Date.now();
      });


  state.preparationPromise =
    preparationPromise;
}


// ============================================================
// PUBLIC: PREPARE CONSULTATION SUMMARY
// ============================================================

/**
 * This endpoint/controller function is called DURING the
 * consultation.
 *
 * It receives the current live transcript and starts Gemini
 * processing in the background.
 *
 * It intentionally responds immediately.
 *
 * This is the critical piece required to remove the
 * Processing bar from the END flow.
 */
async function prepareConsultationSummary(
  req,
  res
) {
  try {

    const {
      doctorId,
      patientId,
      appointmentId,
      consultationId,
      patientReason,
    } = req.body;


    if (
      !doctorId ||
      !appointmentId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "doctorId and appointmentId are required.",
      });
    }


    const rawTranscript =
      req.body.liveTranscript ||
      req.body.transcript;


    const parsedTranscript =
      parseLiveTranscript(
        rawTranscript
      );


    const liveTranscript =
      normalizeLiveTranscript(
        parsedTranscript
      );


    if (
      liveTranscript.length === 0
    ) {
      return res.json({
        success: true,

        prepared: false,

        status:
          "waiting_for_transcript",

        message:
          "No usable transcript available yet.",
      });
    }


    const {
      key,
      state,
    } =
      getConsultationState({
        consultationId,
        doctorId,
        patientId,
        appointmentId,
      });


    // ----------------------------------------------------------
    // Always keep the latest transcript in memory.
    // ----------------------------------------------------------

    state.transcript =
      liveTranscript;


    state.lastActivityAt =
      Date.now();


    // ----------------------------------------------------------
    // Start background Gemini only when required.
    // ----------------------------------------------------------

    const shouldPrepare =
      shouldPrepareBackgroundSummary(
        state,
        liveTranscript
      );


    if (shouldPrepare) {

      startBackgroundSummaryPreparation(
        state,
        liveTranscript,
        patientReason
      );
    }


    // ----------------------------------------------------------
    // RESPOND IMMEDIATELY.
    //
    // We do NOT await Gemini here.
    // ----------------------------------------------------------

    return res.json({
      success: true,

      prepared:
        Boolean(
          state.summary
        ),

      processing:
        state.preparationInProgress,

      consultationId:
        state.consultationId,

      transcriptLength:
        liveTranscript.length,

      preparedTranscriptLength:
        state.preparedTranscriptLength,

      detectedLanguage:
        state.detectedLanguage,

      // If a summary already exists, the frontend can use it
      // immediately.
      summary:
        state.summary || null,

      stateKey:
        key,
    });

  } catch (error) {

    console.error(
      "[Consultation] Background summary preparation request failed:",
      error
    );


    return res.status(500).json({
      success: false,

      message:
        "Unable to prepare consultation summary.",

      error:
        error?.message ||
        "Unknown preparation error.",
    });
  }
}


// ============================================================
// COMPLETE CONSULTATION
// ============================================================

/**
 * Complete consultation.
 *
 * NEW FLOW:
 *
 * During consultation:
 *
 *     prepareConsultationSummary()
 *                ↓
 *       Gemini works in background
 *                ↓
 *       state.summary is populated
 *
 *
 * Doctor clicks END:
 *
 *     completeConsultation()
 *                ↓
 *       check prepared summary
 *                ↓
 *       return it immediately
 *
 *
 * If no prepared summary exists:
 *
 *     generateSummaryFromTranscript()
 *
 * is used as a fallback.
 *
 * If no transcript exists:
 *
 *     processConsultationAudio()
 *
 * remains the final fallback.
 */
async function completeConsultation(
  req,
  res
) {
  let audioPath = null;

  try {

    // ----------------------------------------------------------
    // REQUEST VALIDATION
    // ----------------------------------------------------------

    const {
      doctorId,
      patientId,
      appointmentId,
      consultationId,
      patientReason,
    } = req.body;


    if (
      !doctorId ||
      !appointmentId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "doctorId and appointmentId are required.",
      });
    }


    // ----------------------------------------------------------
    // AUDIO
    // ----------------------------------------------------------

    /*
     * We continue accepting the uploaded audio because the
     * existing frontend sends it.
     *
     * The prepared-summary path does NOT need Gemini to process
     * this audio again.
     */
    audioPath =
      req.file?.path ||
      null;


    // ----------------------------------------------------------
    // LIVE TRANSCRIPT
    // ----------------------------------------------------------

    const rawTranscript =
      req.body.liveTranscript ||
      req.body.transcript;


    const parsedTranscript =
      parseLiveTranscript(
        rawTranscript
      );


    const liveTranscript =
      normalizeLiveTranscript(
        parsedTranscript
      );


    console.log(
      `[Consultation] Received ${liveTranscript.length} finalized transcript lines.`
    );


    // ----------------------------------------------------------
    // GET PER-CONSULTATION STATE & EXACT TRANSCRIPT HASH MATCHING
    // ----------------------------------------------------------

    const {
      state,
    } =
      getConsultationState({
        consultationId,
        doctorId,
        patientId,
        appointmentId,
      });

    const finalTranscriptHash =
      createConsultationTranscriptHash(liveTranscript);

    if (
      liveTranscript.length > 0
    ) {
      state.transcript =
        liveTranscript;
      state.transcriptHash =
        finalTranscriptHash;
    }


    state.lastActivityAt =
      Date.now();


    // ==========================================================
    // EXACT TRANSCRIPT HASH MATCH CHECK
    // ==========================================================

    const exactPreparedSummaryAvailable =
      Boolean(
        state.summary &&
        Object.keys(state.summary).length > 0 &&
        state.preparedTranscriptHash &&
        state.preparedTranscriptHash === finalTranscriptHash
      );

    if (exactPreparedSummaryAvailable) {
      console.log(
        `[Consultation] Using pre-prepared AI summary (EXACT TRANSCRIPT HASH MATCH: ${finalTranscriptHash.slice(0, 8)}).`
      );

      return res.json({
        success: true,
        consultation: {
          doctorId,
          patientId,
          appointmentId: String(appointmentId),
          consultationId: consultationId || null,
          detectedLanguage: state.detectedLanguage || "Auto-detected",
          transcript: liveTranscript.length ? liveTranscript : state.transcript,
          summary: state.summary,
        },
        summarySource: "background-prepared-exact",
        processing: false,
      });
    }

    if (
      state.preparationInProgress &&
      state.preparationPromise
    ) {
      console.log(
        "[Consultation] Waiting briefly for in-progress background AI summary..."
      );

      try {
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3500));
        await Promise.race([state.preparationPromise, timeoutPromise]);

        if (
          state.summary &&
          Object.keys(state.summary).length > 0 &&
          state.preparedTranscriptHash === finalTranscriptHash
        ) {
          console.log(
            "[Consultation] In-progress AI summary finished with EXACT HASH MATCH."
          );

          return res.json({
            success: true,
            consultation: {
              doctorId,
              patientId,
              appointmentId: String(appointmentId),
              consultationId: consultationId || null,
              detectedLanguage: state.detectedLanguage || "Auto-detected",
              transcript: liveTranscript.length ? liveTranscript : state.transcript,
              summary: state.summary,
            },
            summarySource: "background-prepared-exact",
            processing: false,
          });
        }
      } catch (backgroundError) {
        console.warn(
          "[Consultation] In-progress summary wait notice:",
          backgroundError.message
        );
      }
    }


    // ==========================================================
    // FINAL TRANSCRIPT HIGH-PRIORITY SUMMARY GENERATION
    // ==========================================================

    if (
      liveTranscript.length > 0
    ) {

      console.log(
        `[Consultation] Prepared summary not exact match. Generating HIGH-priority summary for final transcript (Hash: ${finalTranscriptHash.slice(0, 8)})...`
      );


      const startTime =
        Date.now();


      const finalizationKey = `${consultationId || appointmentId}_final_${finalTranscriptHash}`;
      const result =
        await generateSummaryFromTranscript(
          liveTranscript,
          patientReason,
          { priority: "HIGH", idempotencyKey: finalizationKey }
        );


      console.log(
        `[Consultation] Final transcript high-priority summary completed in ${Date.now() - startTime}ms.`
      );


      // Save the result into the consultation state
      state.summary =
        result.consultation_summary ||
        {};

      state.detectedLanguage =
        result.detected_language ||
        "Auto-detected";

      state.preparedTranscriptLength =
        liveTranscript.length;

      state.preparedTranscriptHash =
        finalTranscriptHash;

      state.lastPreparedAt =
        Date.now();


      return res.json({
        success: true,

        consultation: {

          doctorId,

          patientId,

          appointmentId:
            String(
              appointmentId
            ),

          consultationId:
            consultationId ||
            null,

          detectedLanguage:
            result.detected_language ||
            "Auto-detected",

          transcript:
            result.transcript?.length
              ? result.transcript
              : liveTranscript,

          summary:
            result.consultation_summary ||
            {},
        },

        summarySource:
          "final-transcript-accurate",

        processing:
          false,
      });
    }


    // ==========================================================
    // AUDIO FALLBACK
    // ==========================================================

    console.warn(
      "[Consultation] No usable live transcript received."
    );


    if (!audioPath) {

      return res.status(400).json({
        success: false,

        message:
          "Consultation transcript or consultation audio is required.",
      });
    }


    console.log(
      "[Consultation] Falling back to existing audio-processing pipeline."
    );


    const startTime =
      Date.now();


    const result =
      await processConsultationAudio(
        audioPath,
        liveTranscript,
        patientReason
      );


    console.log(
      `[Consultation] Audio fallback completed in ${Date.now() - startTime}ms.`
    );


    // Save fallback result too.
    state.summary =
      result.consultation_summary ||
      {};

    state.detectedLanguage =
      result.detected_language ||
      "Auto-detected";

    state.transcript =
      result.transcript ||
      liveTranscript ||
      [];

    state.preparedTranscriptLength =
      state.transcript.length;

    state.lastPreparedAt =
      Date.now();


    return res.json({
      success: true,

      consultation: {

        doctorId,

        patientId,

        appointmentId:
          String(
            appointmentId
          ),

        consultationId:
          consultationId ||
          null,

        detectedLanguage:
          result.detected_language ||
          "Auto-detected",

        transcript:
          result.transcript ||
          liveTranscript ||
          [],

        summary:
          result.consultation_summary ||
          {},
      },

      summarySource:
        "audio-fallback",

      processing:
        false,
    });

  } catch (error) {

    console.error(
      "[Consultation] Processing failed:",
      error
    );


    return res.status(500).json({
      success: false,

      message:
        "Unable to process consultation.",

      error:
        error?.message ||
        "Unknown consultation processing error.",
    });

  } finally {

    // ----------------------------------------------------------
    // TEMPORARY AUDIO CLEANUP
    // ----------------------------------------------------------

    if (audioPath) {

      try {

        if (
          fs.existsSync(
            audioPath
          )
        ) {

          fs.unlinkSync(
            audioPath
          );


          console.log(
            "[Consultation] Temporary audio file removed."
          );
        }

      } catch (cleanupError) {

        console.warn(
          "[Consultation] Unable to remove temporary audio file:",
          cleanupError.message
        );
      }
    }
  }
}


// ============================================================
// OPTIONAL: GET CURRENT PREPARED SUMMARY
// ============================================================

/**
 * Allows the frontend to ask:
 *
 * "Is the AI summary ready yet?"
 *
 * This is useful for the consultation screen.
 */
async function getPreparedConsultationSummary(
  req,
  res
) {
  try {

    const {
      consultationId,
      doctorId,
      patientId,
      appointmentId,
    } = req.query;


    if (
      !doctorId ||
      !patientId ||
      !appointmentId
    ) {
      return res.status(400).json({
        success: false,

        message:
          "doctorId, patientId and appointmentId are required.",
      });
    }


    const {
      state,
    } =
      getConsultationState({
        consultationId,
        doctorId,
        patientId,
        appointmentId,
      });


    return res.json({
      success: true,

      ready:
        Boolean(
          state.summary
        ),

      processing:
        state.preparationInProgress,

      consultationId:
        state.consultationId,

      detectedLanguage:
        state.detectedLanguage,

      summary:
        state.summary || null,

      transcriptLength:
        state.transcript.length,

      preparedTranscriptLength:
        state.preparedTranscriptLength,
    });

  } catch (error) {

    console.error(
      "[Consultation] Unable to retrieve prepared summary:",
      error
    );


    return res.status(500).json({
      success: false,

      message:
        "Unable to retrieve consultation summary.",

      error:
        error?.message ||
        "Unknown error.",
    });
  }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  completeConsultation,

  prepareConsultationSummary,

  getPreparedConsultationSummary,
};