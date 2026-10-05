const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const { supabaseAdmin } = require("../config/supabase");

// Validate JWT_SECRET on initialization
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.warn("[AuthAdapter Warning] JWT_SECRET environment variable is not defined!");
}

// Permission matrix by role
const ROLE_PERMISSIONS = {
    hospital_admin: [
        "hospital.view", "hospital.manage", "staff.view", "staff.manage", "staff.invite",
        "doctors.view", "doctors.assign", "queue.view", "reports.view", "patients.view",
        "appointments.manage", "audit.view", "walkin.register", "appointments.create", "appointments.checkin"
    ],
    staff: [
        "patients.view", "patients.search", "walkin.register", "appointments.create",
        "appointments.checkin", "queue.view", "doctors.view", "hospital.view"
    ],
    doctor: [
        "queue.view_own", "queue.view", "consultation.start", "consultation.write", "prescription.write",
        "reports.generate", "patients.view_clinical", "doctors.view", "patients.view"
    ]
};

function getPermissionsForRole(role) {
    if (!role) return ROLE_PERMISSIONS.staff;
    const cleanRole = String(role).toLowerCase().trim();
    if (ROLE_PERMISSIONS[cleanRole]) return ROLE_PERMISSIONS[cleanRole];
    if (cleanRole.includes("admin")) return ROLE_PERMISSIONS.hospital_admin;
    if (cleanRole.includes("staff") || cleanRole.includes("assistant") || cleanRole.includes("reception")) return ROLE_PERMISSIONS.staff;
    if (cleanRole.includes("doc")) return ROLE_PERMISSIONS.doctor;
    return ROLE_PERMISSIONS.staff;
}

/**
 * Unified Authentication & Multi-Hospital Context Adapter Middleware
 */
const authenticateAdapter = async (req, res, next) => {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token || token === "null" || token === "undefined") {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Bearer token missing.",
        });
    }

    let userId = null;
    let authType = "custom_jwt";

    // 1. Verify Token
    try {
        const secret = process.env.JWT_SECRET || "doctors-vedika-super-secret-jwt-key-2026";
        const decoded = jwt.verify(token, secret);
        userId = decoded.userId || decoded.id;
    } catch (jwtErr) {
        // Fallback: Check Supabase Auth JWT token
        try {
            const decodedSupabase = jwt.decode(token);
            if (decodedSupabase && decodedSupabase.sub) {
                userId = decodedSupabase.sub;
                authType = "supabase_auth";
            } else {
                return res.status(401).json({
                    success: false,
                    message: "Invalid or expired authorization token.",
                });
            }
        } catch (e) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization token format.",
            });
        }
    }

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unable to resolve caller identity from token.",
        });
    }

    // 2. Load Hospital Memberships
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        let activeMembership = null;
        let allMemberships = [];

        if (supabaseAdmin) {
            const { data: members, error: memErr } = await supabaseAdmin
                .from("hospital_members")
                .select("id, hospital_id, user_id, doctor_id, role, status, hospitals(id, name, code)")
                .eq("user_id", userId)
                .eq("status", "active");

            if (!memErr && members && members.length > 0) {
                allMemberships = members;
            }
        }

        // Default Primary Legacy Hospital fallback if no DB memberships recorded yet
        if (allMemberships.length === 0) {
            const legacyHospitalId = "00000000-0000-0000-0000-000000000001";
            allMemberships = [{
                id: `legacy-${userId}`,
                hospital_id: legacyHospitalId,
                user_id: userId,
                doctor_id: userId,
                role: "doctor",
                status: "active",
                hospitals: {
                    id: legacyHospitalId,
                    name: "Doctors Vedika Main Hospital",
                    code: "DV-MAIN"
                }
            }];
        }

        // 3. Resolve Hospital Context from X-Hospital-Id Header & X-Portal-Context Header
        const requestedHospitalId = req.headers["x-hospital-id"];
        const portalContext = req.headers["x-portal-context"] || (req.originalUrl?.includes("/hospital-admin") ? "hospital_admin" : null);

        if (requestedHospitalId) {
            activeMembership = allMemberships.find(m => m.hospital_id === requestedHospitalId && (portalContext ? m.role === portalContext : true));
            if (!activeMembership) {
                activeMembership = allMemberships.find(m => m.hospital_id === requestedHospitalId);
            }
            if (!activeMembership) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied. You do not have an active membership for the requested hospital.",
                    requestedHospitalId
                });
            }
        } else if (portalContext) {
            activeMembership = allMemberships.find(m => m.role === portalContext) || allMemberships[0];
        } else {
            activeMembership = allMemberships[0];
        }

        // 4. Construct req.context with explicit clean capabilities
        const resolvedDoctorId = activeMembership.doctor_id ?? null;

        const capabilities = {
            hospitalAdmin: allMemberships.some(m => m.hospital_id === activeMembership.hospital_id && (m.role === 'hospital_admin' || m.role === 'admin')),
            doctor: allMemberships.some(m => m.hospital_id === activeMembership.hospital_id && (m.role === 'doctor' || m.doctor_id !== null)),
            staff: allMemberships.some(m => m.hospital_id === activeMembership.hospital_id && (m.role === 'staff' || m.role === 'assistant' || m.role === 'receptionist'))
        };

        req.context = {
            userId,
            authType,
            hospitalId: activeMembership.hospital_id,
            hospitalName: activeMembership.hospitals?.name || "Doctors Vedika Main Hospital",
            role: activeMembership.role,
            doctorId: resolvedDoctorId,
            membershipId: activeMembership.id,
            capabilities,
            allMemberships: allMemberships.map(m => ({
                hospitalId: m.hospital_id,
                hospitalName: m.hospitals?.name,
                role: m.role
            })),
            permissions: getPermissionsForRole(activeMembership.role)
        };

        // Attach backward-compatible req.doctor for existing endpoints
        if (req.context.doctorId) {
            req.doctor = {
                id: req.context.doctorId,
                doctor_id: req.context.doctorId,
                userId: req.context.userId,
                role: req.context.role,
                hospitalId: req.context.hospitalId
            };
        }

        next();
    } catch (err) {
        console.error("[AuthAdapter Error]:", err.message);
        return res.status(500).json({
            success: false,
            message: "Authentication context resolution failed.",
            error: err.message
        });
    }
};

/**
 * Authorization Guard helper for specific permissions
 */
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.context) {
            return res.status(403).json({ success: false, message: "Forbidden. Context not initialized." });
        }

        if (req.context.role === "hospital_admin" || req.context.role === "admin" || req.context.capabilities?.hospitalAdmin) {
            return next();
        }

        const userPerms = req.context.permissions || [];
        if (!userPerms.includes(permission)) {
            const isStaffPerm = ["patients.view", "patients.search", "walkin.register", "appointments.create", "appointments.checkin", "queue.view", "doctors.view"].includes(permission);
            if (isStaffPerm && (req.context.capabilities?.staff || req.context.role === "staff" || req.context.role === "assistant")) {
                return next();
            }

            return res.status(403).json({
                success: false,
                message: `Forbidden. Required permission '${permission}' is missing for role '${req.context.role}'.`
            });
        }

        next();
    };
};

module.exports = {
    authenticateAdapter,
    requirePermission,
    getPermissionsForRole
};
