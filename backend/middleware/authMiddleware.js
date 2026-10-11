const jwt = require("jsonwebtoken");
const authService = require("../services/authService");

/**
 * Protect routes: Validates Authorization Bearer token
 */
const protect = async (req, res, next) => {
    let token = null;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer ")
    ) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token || token === "null" || token === "undefined") {
        return res.status(401).json({
            success: false,
            message: "Not authorized, no token provided",
        });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            success: false,
            message: "Authentication service misconfiguration: JWT_SECRET is not configured.",
        });
    }

    let userId = null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.userId;
    } catch (jwtErr) {
        const { supabase, supabaseAdmin } = require("../config/supabase");
        const client = supabase || supabaseAdmin;
        if (client) {
            try {
                const { data: userData, error: userErr } = await client.auth.getUser(token);
                if (!userErr && userData?.user?.id) {
                    userId = userData.user.id;
                }
            } catch (sbErr) {}
        }
    }

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authorization token",
        });
    }

    try {
        const portalHeader = req.headers["x-portal-context"] || null;
        const doctor = await authService.getDoctorById(userId, portalHeader);

        if (!doctor) {
            return res.status(401).json({
                success: false,
                message: "User session expired or user no longer exists",
            });
        }

        // Only adopt requested staff context if user is authorized for staff role
        if (portalHeader === "staff" && (doctor.capabilities?.staff || doctor.role === "staff")) {
            doctor.role = "staff";
            doctor.hospitalRole = "Reception Staff";
        }

        req.doctor = doctor;
        next();
    } catch (err) {
        console.error("[AuthMiddleware] Context resolution failed:", err.message);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authorization token",
        });
    }
};

module.exports = {
    protect,
};
