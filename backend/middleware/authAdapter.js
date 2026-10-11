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
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            success: false,
            message: "Authentication service misconfiguration: JWT_SECRET is not configured.",
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId || decoded.id;
    } catch (jwtErr) {
        // If custom JWT verification failed, check if it's a valid Supabase Auth token
        const { supabase, supabaseAdmin } = require("../config/supabase");
        const client = supabase || supabaseAdmin;
        if (client) {
            try {
                const { data: userData, error: userErr } = await client.auth.getUser(token);
                if (!userErr && userData?.user?.id) {
                    userId = userData.user.id;
                    authType = "supabase_auth";
                }
            } catch (sbErr) {
                // Not a valid Supabase token
            }
        }
    }

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authorization token.",
        });
    }

    // 2. Load Hospital Memberships and Identity from DB
    try {
        let activeMembership = null;
        let allMemberships = [];
        let doctorRecord = null;
        let userRecord = null;

        if (supabaseAdmin) {
            const { data: members, error: memErr } = await supabaseAdmin
                .from("hospital_members")
                .select("id, hospital_id, user_id, doctor_id, role, status, hospitals(id, name, code)")
                .eq("user_id", userId);

            if (!memErr && members && members.length > 0) {
                const activeMembers = members.filter(m => !m.status || String(m.status).toLowerCase() === "active");
                if (activeMembers.length > 0) {
                    allMemberships = activeMembers;
                }
            }

            const { data: docData } = await supabaseAdmin
                .from("doctors")
                .select("doctor_id, user_id, doctor_name, doctor_email, doctor_verification_status, doctor_is_active, onboarding_completed")
                .or(`user_id.eq.${userId},doctor_id.eq.${userId}`)
                .maybeSingle();

            if (docData) {
                doctorRecord = docData;
            }

            const { data: uData } = await supabaseAdmin
                .from("users")
                .select("id, email, role, full_name, status")
                .eq("id", userId)
                .maybeSingle();

            if (uData) {
                userRecord = uData;
            }
        }

        // Fail closed if user identity is not found in database
        if (allMemberships.length === 0 && !doctorRecord && !userRecord) {
            return res.status(403).json({
                success: false,
                message: "Access denied. User profile or membership not found."
            });
        }

        // 3. Resolve Hospital Context and Role from verified records
        const rawRequestedHospitalId = req.headers["x-hospital-id"];
        const requestedHospitalId = (rawRequestedHospitalId && rawRequestedHospitalId !== "null" && rawRequestedHospitalId !== "undefined") ? String(rawRequestedHospitalId).trim() : null;
        const rawPortalContext = req.headers["x-portal-context"];
        const requestedRole = rawPortalContext ? String(rawPortalContext).toLowerCase().trim() : null;

        const isStaffRoleMatch = (roleStr) => {
            const r = String(roleStr || "").toLowerCase();
            return r === "staff" || r === "assistant" || r === "receptionist" || r === "reception_staff";
        };

        const isAdminRoleMatch = (roleStr) => {
            const r = String(roleStr || "").toLowerCase();
            return r === "hospital_admin" || r === "admin";
        };

        const isDoctorRoleMatch = (roleStr, docId) => {
            const r = String(roleStr || "").toLowerCase();
            return r === "doctor" || Boolean(docId);
        };

        // Determine user's authorized roles across memberships & doctor record
        const userHasAdminMembership = allMemberships.some(m => isAdminRoleMatch(m.role));
        const userHasStaffMembership = allMemberships.some(m => isStaffRoleMatch(m.role));
        const userHasDoctorRole = Boolean(doctorRecord) || allMemberships.some(m => isDoctorRoleMatch(m.role, m.doctor_id));

        // Reject requested role if user is not authorized for it
        if (requestedRole) {
            if (requestedRole === "staff" && !userHasStaffMembership) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied. You are not authorized for the requested staff role."
                });
            }
            if (requestedRole === "hospital_admin" && !userHasAdminMembership) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied. You are not authorized for the requested hospital administrator role."
                });
            }
            if (requestedRole === "doctor" && !userHasDoctorRole) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied. You are not authorized for the requested doctor role."
                });
            }
        }

        // Resolve hospital membership
        if (requestedHospitalId) {
            const hospitalMemberships = allMemberships.filter(m => m.hospital_id === requestedHospitalId);
            if (hospitalMemberships.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied. You do not have an active membership for the requested hospital.",
                    requestedHospitalId
                });
            }

            if (requestedRole) {
                const matched = hospitalMemberships.find(m => {
                    if (requestedRole === "staff") return isStaffRoleMatch(m.role);
                    if (requestedRole === "hospital_admin") return isAdminRoleMatch(m.role);
                    if (requestedRole === "doctor") return isDoctorRoleMatch(m.role, m.doctor_id);
                    return m.role === requestedRole;
                });

                if (!matched) {
                    return res.status(403).json({
                        success: false,
                        message: `Access denied. You do not hold the '${requestedRole}' role at the requested hospital.`
                    });
                }
                activeMembership = matched;
            } else {
                activeMembership = hospitalMemberships[0];
            }
        } else if (allMemberships.length > 0) {
            if (requestedRole) {
                const matched = allMemberships.find(m => {
                    if (requestedRole === "staff") return isStaffRoleMatch(m.role);
                    if (requestedRole === "hospital_admin") return isAdminRoleMatch(m.role);
                    if (requestedRole === "doctor") return isDoctorRoleMatch(m.role, m.doctor_id);
                    return m.role === requestedRole;
                });
                activeMembership = matched || allMemberships[0];
            } else {
                activeMembership = allMemberships[0];
            }
        }

        // Determine effectiveRole strictly from verified authorization
        let effectiveRole = "doctor";
        if (activeMembership) {
            if (requestedRole) {
                effectiveRole = requestedRole;
            } else if (isAdminRoleMatch(activeMembership.role)) {
                effectiveRole = "hospital_admin";
            } else if (isStaffRoleMatch(activeMembership.role)) {
                effectiveRole = "staff";
            } else if (isDoctorRoleMatch(activeMembership.role, activeMembership.doctor_id)) {
                effectiveRole = "doctor";
            } else {
                effectiveRole = activeMembership.role;
            }
        } else if (doctorRecord) {
            effectiveRole = "doctor";
        } else if (userRecord && userRecord.role) {
            effectiveRole = userRecord.role;
        }

        const activeHospitalId = activeMembership?.hospital_id || null;
        const capabilities = {
            hospitalAdmin: allMemberships.some(m => (!activeHospitalId || m.hospital_id === activeHospitalId) && isAdminRoleMatch(m.role)),
            doctor: Boolean(doctorRecord) || allMemberships.some(m => (!activeHospitalId || m.hospital_id === activeHospitalId) && isDoctorRoleMatch(m.role, m.doctor_id)),
            staff: allMemberships.some(m => (!activeHospitalId || m.hospital_id === activeHospitalId) && isStaffRoleMatch(m.role))
        };

        const resolvedDoctorId = activeMembership?.doctor_id || doctorRecord?.doctor_id || userId;
        const hospitalName = activeMembership?.hospitals?.name || "Doctors Vedika Hospital";

        req.context = {
            userId,
            authType,
            hospitalId: activeHospitalId,
            hospitalName,
            role: effectiveRole,
            doctorId: resolvedDoctorId,
            membershipId: activeMembership?.id || null,
            capabilities,
            allMemberships: allMemberships.map(m => ({
                hospitalId: m.hospital_id,
                hospitalName: m.hospitals?.name,
                role: m.role
            })),
            permissions: getPermissionsForRole(effectiveRole)
        };

        // Always attach req.doctor for user identity endpoints like /api/auth/me
        req.doctor = {
            id: resolvedDoctorId,
            doctor_id: resolvedDoctorId,
            userId,
            role: effectiveRole,
            hospitalRole: effectiveRole === "staff" ? "Reception Staff" : effectiveRole === "hospital_admin" ? "Hospital Administrator" : "Doctor",
            hospitalId: activeHospitalId,
            capabilities,
            permissions: req.context.permissions
        };

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

        const userPerms = req.context.permissions || [];

        // Check if user has explicit permission
        if (userPerms.includes(permission)) {
            return next();
        }

        return res.status(403).json({
            success: false,
            message: `Forbidden. Required permission '${permission}' is missing for role '${req.context.role}'.`
        });
    };
};

module.exports = {
    authenticateAdapter,
    requirePermission,
    getPermissionsForRole
};
