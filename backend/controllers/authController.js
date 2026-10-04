const authService =
    require("../services/authService");

class AuthController {
    async register(req, res) {
        try {
            const {
                fullName,
                email,
                mobileNumber,
                dob,
                registrationNumber,
                password,
            } = req.body || {};

            if (
                !fullName ||
                !email ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Full name, email address, and password are required.",
                });
            }

            if (
                password.length < 6
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Password must be at least 6 characters long.",
                });
            }

            const result =
                await authService.register({
                    fullName,
                    email,
                    mobileNumber,
                    dob,
                    registrationNumber,
                    password,
                });

            return res.status(201).json({
                success: true,
                message:
                    "Doctor account registered successfully.",
                doctor:
                    result.doctor,
                token:
                    result.token,
            });
        } catch (error) {
            console.error(
                "[AuthController] Registration error:",
                error
            );

            let friendlyMessage = error?.message || "Failed to create account. Please try again.";

            if (
                friendlyMessage.includes("duplicate key") ||
                friendlyMessage.includes("violates unique constraint") ||
                friendlyMessage.includes("23505") ||
                friendlyMessage.includes("doctors_user_id_key")
            ) {
                friendlyMessage = "An account with this email address already exists. Please log in instead.";
            } else if (friendlyMessage.includes("Database error:")) {
                friendlyMessage = "An account with these details already exists. Please log in instead.";
            }

            return res.status(400).json({
                success: false,
                message: friendlyMessage,
            });
        }
    }

    async login(req, res) {
        try {
            const {
                email,
                password,
                portal,
            } = req.body || {};

            if (
                !email ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please provide both email and password.",
                });
            }

            const result =
                await authService.login({
                    email,
                    password,
                    portal,
                });

            return res.status(200).json({
                success: true,
                message:
                    "Login successful.",
                doctor:
                    result.doctor,
                token:
                    result.token,
            });
        } catch (error) {
            console.error(
                "[AuthController] Login error:",
                error
            );

            return res.status(401).json({
                success: false,
                message:
                    error.message ||
                    "Invalid credentials.",
            });
        }
    }

    async getMe(req, res) {
        return res.status(200).json({
            success: true,
            doctor:
                req.doctor,
        });
    }

    async updateProfile(req, res) {
        try {
            const doctor =
                await authService.updateProfile(
                    req.doctor.id,
                    req.body || {}
                );

            return res.status(200).json({
                success: true,
                message:
                    "Profile updated successfully.",
                doctor,
            });
        } catch (error) {
            console.error(
                "[AuthController] Profile error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Failed to update profile.",
            });
        }
    }

    async forgotPassword(req, res) {
        try {
            const { email } = req.body || {};

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide your registered email address.",
                });
            }

            const result = await authService.requestPasswordReset({ email });
            return res.status(200).json(result);
        } catch (error) {
            console.error("[AuthController] Forgot password error:", error);
            return res.status(400).json({
                success: false,
                message: error.message || "Failed to process password reset request.",
            });
        }
    }

    async resetPassword(req, res) {
        try {
            const { accessToken, newPassword } = req.body || {};

            if (!accessToken || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: "Reset token and new password are required.",
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "Password must be at least 6 characters long.",
                });
            }

            const result = await authService.resetPasswordWithToken({ accessToken, newPassword });
            return res.status(200).json(result);
        } catch (error) {
            console.error("[AuthController] Reset password error:", error);
            return res.status(400).json({
                success: false,
                message: error.message || "Failed to reset password.",
            });
        }
    }

    /*
     * GOOGLE REDIRECT
     */
    googleRedirect(
        req,
        res
    ) {
        try {
            const redirectTo =
                req.query.redirect_to ||
                "http://localhost:3000/auth/callback";

            const url =
                authService.generateGoogleOAuthUrl(
                    redirectTo
                );

            return res.redirect(url);
        } catch (error) {
            console.error(
                "[AuthController] Google redirect error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Failed to initialize Google login.",
            });
        }
    }

    /*
     * GOOGLE VERIFY
     */
    async googleVerify(req, res) {
        try {
            const { token } = req.body || {};

            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: "Google access token is required.",
                });
            }

            console.log(
                "[GoogleVerify] Received Google/Supabase access token."
            );

            const result =
                await authService.verifyGoogleToken(token);

            console.log(
                "[GoogleVerify] Doctor authentication completed successfully:",
                {
                    doctorId: result?.doctor?.id,
                    email: result?.doctor?.email,
                }
            );

            return res.status(200).json({
                success: true,
                message: "Google login successful.",
                doctor: result.doctor,
                token: result.token,
            });

        } catch (error) {
            console.error(
                "================================================"
            );

            console.error(
                "[GoogleVerify] GOOGLE AUTH ERROR"
            );

            console.error(
                "message:",
                error?.message
            );

            console.error(
                "code:",
                error?.code
            );

            console.error(
                "details:",
                error?.details
            );

            console.error(
                "hint:",
                error?.hint
            );

            console.error(
                "stack:",
                error?.stack
            );

            console.error(
                "================================================"
            );

            return res.status(500).json({
                success: false,

                message:
                    error?.message ||
                    "Google authentication failed.",

                error: {
                    code:
                        error?.code || null,

                    details:
                        error?.details || null,

                    hint:
                        error?.hint || null,
                },
            });
        }
    }
    async completeOnboarding(
        req,
        res
    ) {
        try {
            const doctor =
                await authService.completeOnboarding(
                    req.doctor.id,
                    req.body || {}
                );

            return res.status(200).json({
                success: true,
                message:
                    "Onboarding completed successfully.",
                doctor,
            });
        } catch (error) {
            console.error(
                "[AuthController] Onboarding error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Failed to complete onboarding.",
            });
        }
    }

    async uploadFile(
        req,
        res
    ) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message:
                        "No file provided.",
                });
            }

            const {
                type,
            } = req.body;

            if (
                ![
                    "profile",
                    "document",
                    "gov_id",
                ].includes(type)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid file type.",
                });
            }

            const extension =
                req.file.originalname
                    .split(".")
                    .pop();

            const filename =
                `${req.doctor.id}_${Date.now()}.${extension}`;

            const url =
                await authService.uploadToStorage(
                    req.file.buffer,
                    req.file.mimetype,
                    type,
                    filename
                );

            return res.status(200).json({
                success: true,
                message:
                    "File uploaded successfully.",
                url,
            });
        } catch (error) {
            console.error(
                "[AuthController] Upload error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Failed to upload file.",
            });
        }
    }

    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body || {};
            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "New password must be at least 6 characters long.",
                });
            }

            const result = await authService.changePassword({
                doctorId: req.doctor.id,
                currentPassword,
                newPassword,
            });

            return res.status(200).json({
                success: true,
                message: result.message || "Password changed successfully.",
            });
        } catch (error) {
            console.error("[AuthController] Change password error:", error);
            return res.status(400).json({
                success: false,
                message: error.message || "Failed to change password.",
            });
        }
    }
}

module.exports =
    new AuthController();