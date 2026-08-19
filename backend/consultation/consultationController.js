const fs = require("fs");
const { processConsultationAudio } = require("./geminiService");

async function completeConsultation(req, res) {
  let audioPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Consultation audio is required." });
    }

    audioPath = req.file.path;

    const { doctorId, patientId, appointmentId } = req.body;
    if (!doctorId || !patientId || !appointmentId) {
      return res.status(400).json({
        success: false,
        message: "doctorId, patientId and appointmentId are required.",
      });
    }

    let liveTranscript = [];
    const raw = req.body.liveTranscript || req.body.transcript;
    if (raw) {
      try {
        liveTranscript = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {}
    }

    const result = await processConsultationAudio(audioPath, liveTranscript);

    res.json({
      success: true,
      consultation: {
        doctorId,
        patientId,
        appointmentId: String(appointmentId),
        detectedLanguage: result.detected_language || "Auto-detected",
        transcript: result.transcript || liveTranscript || [],
        summary: result.consultation_summary || {},
      },
    });
  } catch (error) {
    console.error("[Consultation] Processing failed:", error);
    res.status(500).json({
      success: false,
      message: "Unable to process consultation.",
      error: error.message,
    });
  } finally {
    if (audioPath) {
      try { fs.unlinkSync(audioPath); } catch {}
    }
  }
}

module.exports = { completeConsultation };
