const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    getQuestions,
    getQuestionById,
    answerQuestion,
    updateQuestionStatus,
    getStats,
} = require("../controllers/questionController");

// All routes require authenticated doctor
router.use(protect);

router.get("/stats", getStats);
router.get("/", getQuestions);
router.get("/:id", getQuestionById);
router.post("/:id/answer", answerQuestion);
router.patch("/:id/status", updateQuestionStatus);

module.exports = router;
