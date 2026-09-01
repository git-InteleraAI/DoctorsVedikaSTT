const authService = require("../services/authService");

/**
 * Controller for Doctor Authentication
 */
class AuthController {
    /**
     * POST /api/auth/register
     */
    async register(req, res) {
        try {
            const { fullName, email, mobileNumber, dob, registrationNumber, password } = req.body || {};

            if (!fullName || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: "Full name, email address, and password are required.",
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "Password must be at least 6 characters long.",
                });
            }

            const result = await authService.register({
                fullName,
                email,
                mobileNumber,
                dob,
                registrationNumber,
                password,
            });

            return res.status(201).json({
                success: true,
                message: "Doctor account registered successfully.",
                doctor: result.doctor,
                token: result.token,
            });
        } catch (error) {
            console.error("[AuthController] Registration error:", error.message);
            return res.status(400).json({
                success: false,
                message: error.message || "Failed to create account.",
            });
        }
    }

    /**
     * POST /api/auth/login
     */
    async login(req, res) {
        try {
            const { email, password } = req.body || {};

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide both email and password.",
                });
            }

            const result = await authService.login({ email, password });

            return res.status(200).json({
                success: true,
                message: "Login successful.",
                doctor: result.doctor,
                token: result.token,
            });
        } catch (error) {
            console.error("[AuthController] Login error:", error.message);
            return res.status(401).json({
                success: false,
                message: error.message || "Invalid credentials.",
            });
        }
    }

    /**
     * GET /api/auth/me
     */
    async getMe(req, res) {
        try {
            return res.status(200).json({
                success: true,
                doctor: req.doctor,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Internal server error retrieving profile.",
            });
        }
    }

    /**
     * PUT /api/auth/profile
     */
    async updateProfile(req, res) {
        try {
            const data = req.body || {};
            const doctorId = req.doctor.id;
            const doctorProfile = await authService.updateProfile(doctorId, data);
            return res.status(200).json({
                success: true,
                message: "Profile updated successfully.",
                doctor: doctorProfile,
            });
        } catch (error) {
            console.error("[AuthController] Update profile error:", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update profile.",
            });
        }
    }

    /**
     * POST /api/auth/forgot-password
     */
    async forgotPassword(req, res) {
        try {
            const { email } = req.body || {};
            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide your registered email address.",
                });
            }

            // In production, send reset email with magic link or OTP
            return res.status(200).json({
                success: true,
                message: `Password reset instructions have been sent to ${email}`,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to process forgot password request.",
            });
        }
    }

    /**
     * GET /api/auth/google
     * Redirects to Supabase Google OAuth
     */
    googleRedirect(req, res) {
        try {
            // Frontend callback URL where Supabase will redirect back with the token hash
            const frontendCallbackUrl = "http://localhost:5173/auth/callback";
            const authorizeUrl = authService.generateGoogleOAuthUrl(frontendCallbackUrl);
            return res.redirect(authorizeUrl);
        } catch (error) {
            console.error("[AuthController] Google Redirect error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to initialize Google login.",
            });
        }
    }

    /**
     * POST /api/auth/google/verify
     * Verifies the Supabase access token and provisions the doctor
     */
    async googleVerify(req, res) {
        try {
            const { token } = req.body || {};
            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: "Access token is required.",
                });
            }

            const result = await authService.verifyGoogleToken(token);

            return res.status(200).json({
                success: true,
                message: "Google login successful.",
                doctor: result.doctor,
                token: result.token,
            });
        } catch (error) {
            console.error("[AuthController] Google Verify error:", error.message);
            return res.status(401).json({
                success: false,
                message: error.message || "Invalid Google authentication token.",
            });
        }
    }
    /**
     * POST /api/auth/onboarding
     */
    async completeOnboarding(req, res) {
        try {
            const data = req.body || {};
            const doctorId = req.doctor.id; // from protect middleware

            const doctorProfile = await authService.completeOnboarding(doctorId, data);

            return res.status(200).json({
                success: true,
                message: "Onboarding completed successfully.",
                doctor: doctorProfile,
            });
        } catch (error) {
            console.error("[AuthController] Onboarding error:", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to complete onboarding.",
            });
        }
    }

    /**
     * POST /api/auth/upload
     */
    async uploadFile(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: "No file provided" });
            }

            const { type } = req.body; // 'profile', 'document', or 'gov_id'
            if (!type || (type !== "profile" && type !== "document" && type !== "gov_id")) {
                return res.status(400).json({ success: false, message: "Invalid or missing file type" });
            }

            const doctorId = req.doctor.id;
            const extension = req.file.originalname.split('.').pop();
            const filename = `${doctorId}_${Date.now()}.${extension}`;

            const url = await authService.uploadToStorage(req.file.buffer, req.file.mimetype, type, filename);

            return res.status(200).json({
                success: true,
                message: "File uploaded successfully",
                url: url,
            });
        } catch (error) {
            console.error("[AuthController] Upload error:", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to upload file.",
            });
        }
    }
}

module.exports = new AuthController();
