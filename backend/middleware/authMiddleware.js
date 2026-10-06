const jwt = require("jsonwebtoken");
const authService = require("../services/authService");

const JWT_SECRET = process.env.JWT_SECRET || "doctors-vedika-super-secret-jwt-key-2026";

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

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id || decoded.userId;
        const portalHeader = req.headers["x-portal-context"] || (req.headers.referer?.includes("/staff") ? "staff" : req.originalUrl?.includes("/staff") ? "staff" : null);

        const doctor = await authService.getDoctorById(userId, portalHeader);

        if (!doctor) {
            return res.status(401).json({
                success: false,
                message: "User session expired or user no longer exists",
            });
        }

        if (portalHeader === "staff") {
            doctor.role = "staff";
            doctor.hospitalRole = "Reception Staff";
            if (!doctor.capabilities) doctor.capabilities = {};
            doctor.capabilities.staff = true;
        }

        req.doctor = doctor;
        next();
    } catch (err) {
        console.error("[AuthMiddleware] Token verification failed:", err.message);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authorization token",
        });
    }
};

module.exports = {
    protect,
};
