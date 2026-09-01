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
        const doctor = await authService.getDoctorById(decoded.id);

        if (!doctor) {
            return res.status(401).json({
                success: false,
                message: "User session expired or user no longer exists",
            });
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
