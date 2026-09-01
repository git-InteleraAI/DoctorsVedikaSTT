const express = require("express");
const multer = require("multer");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Public routes
router.post("/register", (req, res) => authController.register(req, res));
router.post("/login", (req, res) => authController.login(req, res));
router.post("/forgot-password", (req, res) => authController.forgotPassword(req, res));

// Google OAuth routes
router.get("/google", (req, res) => authController.googleRedirect(req, res));
router.post("/google/verify", (req, res) => authController.googleVerify(req, res));

// Protected routes
router.get("/me", protect, (req, res) => authController.getMe(req, res));
router.put("/profile", protect, (req, res) => authController.updateProfile(req, res));
router.post("/onboarding", protect, (req, res) => authController.completeOnboarding(req, res));
router.post("/upload", protect, upload.single("file"), (req, res) => authController.uploadFile(req, res));

module.exports = router;
