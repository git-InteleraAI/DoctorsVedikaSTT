const express = require("express");
const router = express.Router();
const { authenticateAdapter, requirePermission } = require("../middleware/authAdapter");
const { logAuditEvent } = require("../middleware/auditLogger");
const { createClient } = require("@supabase/supabase-js");

function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey);
}

// -----------------------------------------------------------------------------
// Protect all Hospital Admin routes with Authentication & Hospital Admin guard
// -----------------------------------------------------------------------------
router.use(authenticateAdapter);

// Explicit guard: Only Hospital Administrators can access /hospital-admin routes
const requireHospitalAdminRole = (req, res, next) => {
    const role = req.context?.role;
    const isHospitalAdmin = role === "hospital_admin" || role === "admin" || req.context?.capabilities?.hospitalAdmin;
    if (!req.context || !isHospitalAdmin) {
        return res.status(403).json({
            success: false,
            message: "Access forbidden. Hospital Administrator privileges required."
        });
    }
    next();
};

router.use(requireHospitalAdminRole);

// Helper function to generate secure temporary passwords
function generateTempPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pass = "Vedika@";
    for (let i = 0; i < 6; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
}

/**
 * GET /api/v1/hospital-admin/dashboard-stats
 * Returns dynamic overview metrics & overview lists for the Hospital Admin dashboard
 */
router.get("/dashboard-stats", requirePermission("hospital.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        let totalDoctors = 0;
        let activeDoctors = 0;
        let totalStaff = 0;
        let activeStaff = 0;
        let hospitalName = req.context.hospitalName || "Doctors Vedika Hospital";
        let hospitalCode = "DV-MAIN";
        let hospitalStatus = "active";
        let recentDoctors = [];
        let recentStaff = [];

        if (db) {
            // 1. Fetch Hospital Info
            const { data: hospData } = await db
                .from("hospitals")
                .select("name, code, status")
                .eq("id", hospitalId)
                .maybeSingle();

            if (hospData) {
                hospitalName = hospData.name || hospitalName;
                hospitalCode = hospData.code || hospitalCode;
                hospitalStatus = hospData.status || hospitalStatus;
            }

            // 2. Fetch Doctor Counts
            const { count: docTotalCount } = await db
                .from("hospital_members")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .eq("role", "doctor");
            totalDoctors = docTotalCount || 0;

            const { count: docActiveCount } = await db
                .from("hospital_members")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .eq("role", "doctor")
                .eq("status", "active");
            activeDoctors = docActiveCount || 0;

            // 3. Fetch Staff Counts
            const { count: staffTotalCount } = await db
                .from("hospital_members")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .eq("role", "staff");
            totalStaff = staffTotalCount || 0;

            const { count: staffActiveCount } = await db
                .from("hospital_members")
                .select("id", { count: "exact", head: true })
                .eq("hospital_id", hospitalId)
                .eq("role", "staff")
                .eq("status", "active");
            activeStaff = staffActiveCount || 0;

            // 4. Fetch Recent Doctors overview list
            const { data: docMembers } = await db
                .from("hospital_members")
                .select("id, user_id, doctor_id, status, created_at")
                .eq("hospital_id", hospitalId)
                .eq("role", "doctor")
                .order("created_at", { ascending: false })
                .limit(5);

            if (docMembers && docMembers.length > 0) {
                const docIds = docMembers.map(m => m.doctor_id).filter(Boolean);
                const userIds = docMembers.map(m => m.user_id).filter(Boolean);

                const { data: docRows } = await db
                    .from("doctors")
                    .select("*")
                    .or(`doctor_id.in.(${docIds.join(",") || "00000000-0000-0000-0000-000000000000"}),user_id.in.(${userIds.join(",") || "00000000-0000-0000-0000-000000000000"})`);

                const { data: userRows } = await db
                    .from("users")
                    .select("*")
                    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

                recentDoctors = docMembers.map(m => {
                    const d = (docRows || []).find(dr => dr.doctor_id === m.doctor_id || (dr.user_id && dr.user_id === m.user_id));
                    const u = (userRows || []).find(ur => ur.id === m.user_id);
                    return {
                        memberId: m.id,
                        doctorId: m.doctor_id || d?.doctor_id,
                        userId: m.user_id,
                        fullName: d?.doctor_name || d?.full_name || u?.full_name || "Dr. Unnamed Doctor",
                        email: d?.doctor_email || d?.email || u?.email || "N/A",
                        phone: d?.doctor_mobile || d?.mobile_number || u?.phone || "N/A",
                        specialization: d?.doctor_specialization || d?.specialization || "General Physician",
                        status: m.status || "active",
                        createdAt: m.created_at
                    };
                });
            }

            // 5. Fetch Recent Staff overview list
            const { data: staffMembers } = await db
                .from("hospital_members")
                .select("id, user_id, status, created_at")
                .eq("hospital_id", hospitalId)
                .eq("role", "staff")
                .order("created_at", { ascending: false })
                .limit(5);

            if (staffMembers && staffMembers.length > 0) {
                const userIds = staffMembers.map(m => m.user_id).filter(Boolean);
                const { data: userRows } = await db
                    .from("users")
                    .select("*")
                    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

                recentStaff = staffMembers.map(m => {
                    const u = (userRows || []).find(ur => ur.id === m.user_id);
                    return {
                        memberId: m.id,
                        userId: m.user_id,
                        fullName: u?.full_name || "Staff Member",
                        email: u?.email || "N/A",
                        phone: u?.phone || "N/A",
                        staffRole: u?.staff_role || "Reception / Front Desk",
                        status: m.status || "active",
                        createdAt: m.created_at
                    };
                });
            }
        }

        return res.json({
            success: true,
            stats: {
                totalDoctors,
                activeDoctors,
                totalStaff,
                activeStaff,
                hospitalName,
                hospitalCode,
                hospitalStatus
            },
            recentDoctors,
            recentStaff
        });
    } catch (err) {
        console.error("[HospitalAdmin] dashboard-stats error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/doctors
 * List all Doctors belonging to current hospital
 */
router.get("/doctors", requirePermission("doctors.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) return res.json({ success: true, doctors: [] });

        const { data: members, error: memErr } = await db
            .from("hospital_members")
            .select("id, hospital_id, user_id, doctor_id, role, status, created_at")
            .eq("hospital_id", hospitalId)
            .eq("role", "doctor")
            .order("created_at", { ascending: false });

        if (memErr) throw memErr;

        let doctorsList = [];

        if (members && members.length > 0) {
            const docIds = members.map(m => m.doctor_id).filter(Boolean);
            const userIds = members.map(m => m.user_id).filter(Boolean);

            let docQuery = db.from("doctors").select("*");
            if (docIds.length > 0 && userIds.length > 0) {
                const dIn = docIds.join(",");
                const uIn = userIds.join(",");
                docQuery = docQuery.or(`doctor_id.in.(${dIn}),user_id.in.(${uIn})`);
            } else if (docIds.length > 0) {
                docQuery = docQuery.in("doctor_id", docIds);
            } else if (userIds.length > 0) {
                docQuery = docQuery.in("user_id", userIds);
            }
            const { data: docRows } = await docQuery;

            const { data: userRows } = await db
                .from("users")
                .select("*")
                .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

            doctorsList = members.map(m => {
                const d = (docRows || []).find(dr => dr.doctor_id === m.doctor_id || (dr.user_id && dr.user_id === m.user_id));
                const u = (userRows || []).find(ur => ur.id === m.user_id);
                return {
                    memberId: m.id,
                    doctorId: m.doctor_id || d?.doctor_id,
                    userId: m.user_id,
                    fullName: d?.doctor_name || d?.full_name || u?.full_name || "Dr. Unnamed Doctor",
                    email: d?.doctor_email || d?.email || u?.email || "N/A",
                    phone: d?.doctor_mobile ?? d?.mobile_number ?? u?.phone ?? "",
                    specialization: d?.doctor_specialization ?? d?.specialization ?? "Not specified",
                    qualification: d?.doctor_qualification ?? d?.qualification ?? "",
                    registrationNumber: d?.doctor_registration_number ?? d?.registration_number ?? d?.doctor_reg_no ?? "",
                    experience: d?.doctor_experience || null,
                    clinicName: d?.doctor_clinic_name || null,
                    clinicAddress: d?.doctor_clinic_address || null,
                    consultationFee: d?.doctor_consultation_fee || null,
                    rating: d?.doctor_rating || 4.9,
                    status: m.status || "active",
                    createdAt: m.created_at
                };
            });
        }

        return res.json({
            success: true,
            doctors: doctorsList
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// Helper for Gmail validation
function validateGmailAddress(email) {
    if (!email || typeof email !== "string") {
        return { isValid: false, normalizedEmail: "", message: "Email address is required." };
    }
    const normalized = email.trim().toLowerCase();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(normalized)) {
        return {
            isValid: false,
            normalizedEmail: normalized,
            message: "Only Gmail addresses (@gmail.com) are allowed for Doctor and Staff accounts."
        };
    }
    return { isValid: true, normalizedEmail: normalized };
}

/**
 * POST /api/v1/hospital-admin/doctors
 * Create a new Doctor account & link to current hospital
 */
router.post("/doctors", requirePermission("staff.invite"), async (req, res) => {
    try {
        const {
            fullName,
            email,
            phone,
            specialization,
            qualification,
            registrationNumber,
            gender,
            customPassword
        } = req.body || {};

        if (!fullName || !email) {
            return res.status(400).json({
                success: false,
                message: "Full Name and Email address are required."
            });
        }

        const gmailCheck = validateGmailAddress(email);
        if (!gmailCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: gmailCheck.message
            });
        }
        const normalizedEmail = gmailCheck.normalizedEmail;
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) {
            return res.status(500).json({ success: false, message: "Database service unavailable." });
        }

        // 1. Check duplicate email in users, doctors, and hospital_members table
        const { data: existingUser } = await db
            .from("users")
            .select("id, email")
            .eq("email", normalizedEmail)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        const { data: existingDoc } = await db
            .from("doctors")
            .select("doctor_id, doctor_email")
            .eq("doctor_email", normalizedEmail)
            .maybeSingle();

        if (existingDoc) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        const { supabaseAdmin } = require("../config/supabase");
        if (!supabaseAdmin) {
            return res.status(500).json({
                success: false,
                message: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required to create Doctor Auth user."
            });
        }

        // Check if email already exists in Supabase Auth
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = userList?.users?.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
        if (existingAuthUser) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        // 2. Create Supabase Auth User
        let authUserId = null;
        let authUserCreated = false;
        const tempPassword = customPassword && customPassword.length >= 6 ? customPassword : generateTempPassword();

        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: "doctor",
                specialization: specialization || "General Physician"
            }
        });

        if (authErr || !authUser?.user) {
            const msg = authErr?.message || "Failed to create authentication credentials.";
            return res.status(400).json({
                success: false,
                message: msg.includes("already registered")
                    ? `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
                    : `Failed to create Auth account: ${msg}`
            });
        }

        authUserId = authUser.user.id;
        console.log("[HospitalAdmin] POST /doctors req.body:", req.body);
        authUserCreated = true;

        try {
            // 3. Upsert public.users record
            const { error: userErr } = await db.from("users").upsert({
                id: authUserId,
                email: normalizedEmail,
                full_name: fullName,
                phone: phone || null,
                role: "doctor",
                updated_at: new Date().toISOString()
            }, { onConflict: "id" });
            if (userErr) throw userErr;

            // 4. Create public.doctors record
            const docPayload = {
                user_id: authUserId,
                doctor_name: fullName,
                doctor_email: normalizedEmail,
                doctor_mobile: phone || null,
                doctor_specialization: specialization || null,
                doctor_qualification: qualification || null,
                doctor_registration_number: registrationNumber || null,
                doctor_gender: gender || null,
                doctor_is_active: true
            };

            console.log("[HospitalAdmin] POST /doctors PAYLOAD:", docPayload);

            let savedDoctor = null;
            const { data: upsertedDoc, error: docInsErr } = await db
                .from("doctors")
                .upsert(docPayload, { onConflict: "user_id" })
                .select("*")
                .maybeSingle();

            if (docInsErr) {
                console.error("[HospitalAdmin] DOCTOR UPSERT ERROR:", docInsErr);
                const { data: existingDoc } = await db
                    .from("doctors")
                    .select("doctor_id")
                    .eq("user_id", authUserId)
                    .maybeSingle();

                if (existingDoc) {
                    const { data: updatedDoc, error: updateErr } = await db
                        .from("doctors")
                        .update(docPayload)
                        .eq("doctor_id", existingDoc.doctor_id)
                        .select("*")
                        .single();

                    if (updateErr) throw updateErr;
                    savedDoctor = updatedDoc;
                } else {
                    const { data: insertedDoc, error: insertErr } = await db
                        .from("doctors")
                        .insert(docPayload)
                        .select("*")
                        .single();

                    if (insertErr) throw insertErr;
                    savedDoctor = insertedDoc;
                }
            } else if (upsertedDoc) {
                savedDoctor = upsertedDoc;
            } else {
                const { data: fetchedDoc, error: fetchErr } = await db
                    .from("doctors")
                    .select("*")
                    .eq("user_id", authUserId)
                    .maybeSingle();

                if (fetchErr || !fetchedDoc) {
                    throw new Error("Failed to persist or locate doctor profile record after creation.");
                }
                savedDoctor = fetchedDoc;
            }

            console.log("[HospitalAdmin] SAVED DOCTOR:", savedDoctor);
            const resolvedDoctorId = savedDoctor.doctor_id;

            // 5. Create hospital_members record
            const newMember = {
                hospital_id: hospitalId,
                user_id: authUserId,
                doctor_id: resolvedDoctorId,
                role: "doctor",
                status: "active",
                updated_at: new Date().toISOString()
            };

            const { data: memberData, error: memInsErr } = await db
                .from("hospital_members")
                .upsert(newMember, { onConflict: "hospital_id, user_id" })
                .select()
                .single();

            if (memInsErr) throw memInsErr;

            // 6. Write Audit Log
            await logAuditEvent({
                hospitalId: hospitalId,
                actorUserId: req.context.userId,
                actorRole: req.context.role,
                action: "DOCTOR_CREATE",
                resourceType: "hospital_members",
                resourceId: memberData.id,
                metadata: { targetUserId: authUserId, doctorId: resolvedDoctorId, email: normalizedEmail }
            });

            return res.status(201).json({
                success: true,
                message: "Doctor account created successfully.",
                credentials: {
                    hospitalName: req.context.hospitalName || "Doctors Vedika Main Hospital",
                    memberName: (savedDoctor.doctor_name || fullName).startsWith("Dr.") ? (savedDoctor.doctor_name || fullName) : `Dr. ${savedDoctor.doctor_name || fullName}`,
                    role: "Doctor",
                    email: normalizedEmail,
                    temporaryPassword: tempPassword,
                    portalName: "Doctors Vedika Doctor Portal",
                    loginUrl: "/login"
                },
                doctor: {
                    memberId: memberData.id,
                    doctorId: resolvedDoctorId,
                    userId: authUserId,
                    fullName: savedDoctor.doctor_name || fullName,
                    email: savedDoctor.doctor_email || normalizedEmail,
                    phone: savedDoctor.doctor_mobile || "",
                    specialization: savedDoctor.doctor_specialization || "Not specified",
                    qualification: savedDoctor.doctor_qualification || "",
                    registrationNumber: savedDoctor.doctor_registration_number || "",
                    status: "active"
                }
            });
        } catch (dbErr) {
            console.error("[HospitalAdmin] Doctor creation DB step failed:", dbErr.message);
            // Safe Rollback: delete Auth user if DB creation failed
            if (authUserCreated && supabaseAdmin) {
                try {
                    await supabaseAdmin.auth.admin.deleteUser(authUserId);
                    console.log(`[HospitalAdmin] Rolled back Auth user ${authUserId}`);
                } catch (rbErr) {
                    console.error("[HospitalAdmin] Rollback Auth user error:", rbErr.message);
                }
            }
            return res.status(500).json({
                success: false,
                message: `Failed to complete Doctor account setup: ${dbErr.message}`
            });
        }
    } catch (err) {
        console.error("[HospitalAdmin] POST /doctors error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /api/v1/hospital-admin/doctors/:doctorId
 * Edit existing doctor details
 */
router.put("/doctors/:doctorId", requirePermission("staff.manage"), async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { fullName, phone, specialization, qualification, registrationNumber } = req.body || {};
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        // Verify membership in hospital
        const { data: member } = await db
            .from("hospital_members")
            .select("id, user_id, doctor_id")
            .eq("hospital_id", req.context.hospitalId)
            .or(`doctor_id.eq.${doctorId},id.eq.${doctorId}`)
            .maybeSingle();

        if (!member) {
            return res.status(404).json({ success: false, message: "Doctor member not found in this hospital." });
        }

        const targetDocId = member.doctor_id || doctorId;
        const targetUserId = member.user_id;

        // Update doctors table
        await db.from("doctors").update({
            doctor_name: fullName,
            doctor_mobile: phone || null,
            doctor_specialization: specialization || "General Physician",
            doctor_qualification: qualification || null,
            doctor_registration_number: registrationNumber || null
        }).or(`doctor_id.eq.${targetDocId},user_id.eq.${targetDocId}`);

        // Update users table if user_id present
        if (targetUserId) {
            await db.from("users").update({
                full_name: fullName,
                phone: phone || null
            }).eq("id", targetUserId);
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "DOCTOR_UPDATE",
            resourceType: "doctors",
            resourceId: targetDocId,
            metadata: { fullName, phone, specialization }
        });

        return res.json({
            success: true,
            message: "Doctor profile updated successfully."
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PATCH /api/v1/hospital-admin/doctors/:doctorId/status
 * Activate or Deactivate doctor member
 */
router.patch("/doctors/:doctorId/status", requirePermission("staff.manage"), async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { status } = req.body || {}; // 'active' | 'inactive'
        const newStatus = status === "active" ? "active" : "inactive";
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        const { data: member, error: findErr } = await db
            .from("hospital_members")
            .select("id, user_id, doctor_id")
            .eq("hospital_id", req.context.hospitalId)
            .or(`doctor_id.eq.${doctorId},id.eq.${doctorId}`)
            .maybeSingle();

        if (!member) {
            return res.status(404).json({ success: false, message: "Doctor not found in this hospital." });
        }

        // Update hospital_members status
        await db.from("hospital_members")
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", member.id);

        // Update doctor_is_active in doctors table
        if (member.doctor_id) {
            await db.from("doctors")
                .update({ doctor_is_active: newStatus === "active" })
                .or(`doctor_id.eq.${member.doctor_id},id.eq.${member.doctor_id}`);
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: newStatus === "active" ? "DOCTOR_ACTIVATE" : "DOCTOR_DEACTIVATE",
            resourceType: "hospital_members",
            resourceId: member.id,
            metadata: { newStatus }
        });

        return res.json({
            success: true,
            message: `Doctor status updated to '${newStatus}'.`,
            status: newStatus
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/staff
 * List all Staff members belonging to current hospital
 */
router.get("/staff", requirePermission("staff.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) return res.json({ success: true, staff: [] });

        const { data: members, error: memErr } = await db
            .from("hospital_members")
            .select("id, hospital_id, user_id, role, status, created_at")
            .eq("hospital_id", hospitalId)
            .eq("role", "staff")
            .order("created_at", { ascending: false });

        if (memErr) throw memErr;
        if (!members || members.length === 0) return res.json({ success: true, staff: [] });

        const userIds = members.map(m => m.user_id).filter(Boolean);
        const { data: userRows } = await db
            .from("users")
            .select("*")
            .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

        const staffList = members.map(m => {
            const u = (userRows || []).find(ur => ur.id === m.user_id);
            return {
                memberId: m.id,
                userId: m.user_id,
                fullName: u?.full_name || "Staff Member",
                email: u?.email || "N/A",
                phone: u?.phone || "",
                staffRole: u?.staff_role || "Reception / Front Desk",
                status: m.status || "active",
                createdAt: m.created_at
            };
        });

        return res.json({
            success: true,
            staff: staffList
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/hospital-admin/staff
 * Create a new Staff account & link to current hospital (doctor_id = NULL)
 */
router.post("/staff", requirePermission("staff.invite"), async (req, res) => {
    try {
        const { fullName, email, phone, staffRole, customPassword } = req.body || {};

        if (!fullName || !email) {
            return res.status(400).json({
                success: false,
                message: "Full Name and Email address are required."
            });
        }

        const gmailCheck = validateGmailAddress(email);
        if (!gmailCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: gmailCheck.message
            });
        }
        const normalizedEmail = gmailCheck.normalizedEmail;
        const validStaffRole = staffRole || "Reception / Front Desk";
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) {
            return res.status(500).json({ success: false, message: "Database service unavailable." });
        }

        // 1. Check duplicate email in users table
        const { data: existingUser } = await db
            .from("users")
            .select("id, email")
            .eq("email", normalizedEmail)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        const { supabaseAdmin } = require("../config/supabase");
        if (!supabaseAdmin) {
            return res.status(500).json({
                success: false,
                message: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required to create Staff Auth user."
            });
        }

        // Check if email already exists in Supabase Auth
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = userList?.users?.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
        if (existingAuthUser) {
            return res.status(400).json({
                success: false,
                message: `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
            });
        }

        // 2. Create Supabase Auth User
        let authUserId = null;
        let authUserCreated = false;
        const tempPassword = customPassword && customPassword.length >= 6 ? customPassword : generateTempPassword();

        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: "staff",
                staff_role: validStaffRole
            }
        });

        if (authErr || !authUser?.user) {
            const msg = authErr?.message || "Failed to create authentication credentials.";
            return res.status(400).json({
                success: false,
                message: msg.includes("already registered")
                    ? `An account with email '${normalizedEmail}' already exists. Please log in or use a different Gmail address.`
                    : `Failed to create Auth account: ${msg}`
            });
        }

        authUserId = authUser.user.id;
        authUserCreated = true;

        try {
            // 3. Upsert public.users record (app_role enum requires 'assistant' for staff personnel)
            const { error: userErr } = await db.from("users").upsert({
                id: authUserId,
                email: normalizedEmail,
                full_name: fullName,
                phone: phone || null,
                role: "assistant",
                updated_at: new Date().toISOString()
            }, { onConflict: "id" });
            if (userErr) throw userErr;

            // 4. Create hospital_members record with role='staff' and doctor_id=NULL
            const newMember = {
                hospital_id: hospitalId,
                user_id: authUserId,
                doctor_id: null, // CRITICAL: Staff members MUST have doctor_id = NULL
                role: "staff",
                status: "active",
                updated_at: new Date().toISOString()
            };

            const { data: memberData, error: memInsErr } = await db
                .from("hospital_members")
                .upsert(newMember, { onConflict: "hospital_id, user_id" })
                .select()
                .single();

            if (memInsErr) throw memInsErr;

            // 5. Write Audit Log (NEVER write plaintext password in audit log)
            await logAuditEvent({
                hospitalId: hospitalId,
                actorUserId: req.context.userId,
                actorRole: req.context.role,
                action: "STAFF_CREATE",
                resourceType: "hospital_members",
                resourceId: memberData.id,
                metadata: { targetUserId: authUserId, staffRole: validStaffRole, email: normalizedEmail }
            });

            // 6. Return safe temporary credentials payload ONE TIME to frontend
            return res.status(201).json({
                success: true,
                message: "Staff account created successfully.",
                credentials: {
                    hospitalName: req.context.hospitalName || "Doctors Vedika Main Hospital",
                    memberName: fullName,
                    role: validStaffRole,
                    email: normalizedEmail,
                    temporaryPassword: tempPassword,
                    portalName: "Doctors Vedika Staff Portal",
                    loginUrl: "/staff/login"
                },
                staff: {
                    memberId: memberData.id,
                    userId: authUserId,
                    fullName,
                    email: normalizedEmail,
                    phone: phone || "",
                    staffRole: validStaffRole,
                    status: "active"
                }
            });
        } catch (dbErr) {
            console.error("[HospitalAdmin] Staff creation DB step failed:", dbErr.message);
            // Safe Rollback: delete Auth user if DB creation failed
            if (authUserCreated && supabaseAdmin) {
                try {
                    await supabaseAdmin.auth.admin.deleteUser(authUserId);
                    console.log(`[HospitalAdmin] Rolled back Auth user ${authUserId}`);
                } catch (rbErr) {
                    console.error("[HospitalAdmin] Rollback Auth user error:", rbErr.message);
                }
            }
            return res.status(500).json({
                success: false,
                message: `Failed to complete Staff account setup: ${dbErr.message}`
            });
        }
    } catch (err) {
        console.error("[HospitalAdmin] POST /staff error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /api/v1/hospital-admin/staff/:memberId
 * Edit existing staff member details
 */
router.put("/staff/:memberId", requirePermission("staff.manage"), async (req, res) => {
    try {
        const { memberId } = req.params;
        const { fullName, phone, staffRole } = req.body || {};
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        const { data: member } = await db
            .from("hospital_members")
            .select("id, user_id")
            .eq("hospital_id", req.context.hospitalId)
            .eq("id", memberId)
            .maybeSingle();

        if (!member) {
            return res.status(404).json({ success: false, message: "Staff member not found in this hospital." });
        }

        if (member.user_id) {
            await db.from("users").update({
                full_name: fullName,
                phone: phone || null
            }).eq("id", member.user_id);
        }

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "STAFF_UPDATE",
            resourceType: "hospital_members",
            resourceId: memberId,
            metadata: { fullName, phone, staffRole }
        });

        return res.json({
            success: true,
            message: "Staff member profile updated successfully."
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PATCH /api/v1/hospital-admin/staff/:memberId/status
 * Activate or Deactivate staff member
 */
router.patch("/staff/:memberId/status", requirePermission("staff.manage"), async (req, res) => {
    try {
        const { memberId } = req.params;
        const { status } = req.body || {}; // 'active' | 'inactive'
        const newStatus = status === "active" ? "active" : "inactive";
        const db = getSupabaseClient();

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        const { data: member } = await db
            .from("hospital_members")
            .select("id, user_id")
            .eq("hospital_id", req.context.hospitalId)
            .eq("id", memberId)
            .maybeSingle();

        if (!member) {
            return res.status(404).json({ success: false, message: "Staff member not found in this hospital." });
        }

        await db.from("hospital_members")
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", memberId);

        await logAuditEvent({
            hospitalId: req.context.hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: newStatus === "active" ? "STAFF_ACTIVATE" : "STAFF_DEACTIVATE",
            resourceType: "hospital_members",
            resourceId: memberId,
            metadata: { newStatus }
        });

        return res.json({
            success: true,
            message: `Staff status updated to '${newStatus}'.`,
            status: newStatus
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/hospital
 * View current hospital details
 */
router.get("/hospital", requirePermission("hospital.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) {
            return res.json({
                success: true,
                hospital: {
                    id: hospitalId,
                    name: req.context.hospitalName || "Doctors Vedika Main Hospital",
                    code: "DV-MAIN",
                    status: "active"
                }
            });
        }

        const { data, error } = await db
            .from("hospitals")
            .select("*")
            .eq("id", hospitalId)
            .single();

        if (error) {
            return res.json({
                success: true,
                hospital: {
                    id: hospitalId,
                    name: req.context.hospitalName || "Doctors Vedika Main Hospital",
                    code: "DV-MAIN",
                    status: "active"
                }
            });
        }

        return res.json({
            success: true,
            hospital: data
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /api/v1/hospital-admin/hospital
 * Update current hospital details
 */
router.put("/hospital", requirePermission("hospital.manage"), async (req, res) => {
    try {
        const { name, phone, email, address, city, state } = req.body || {};
        const db = getSupabaseClient();
        const hospitalId = req.context.hospitalId;

        if (!db) return res.status(500).json({ success: false, message: "DB connection unavailable." });

        const updatePayload = {
            updated_at: new Date().toISOString()
        };
        if (name) updatePayload.name = name;
        if (phone !== undefined) updatePayload.phone = phone;
        if (email !== undefined) updatePayload.email = email;
        if (address !== undefined) updatePayload.address = address;
        if (city !== undefined) updatePayload.city = city;
        if (state !== undefined) updatePayload.state = state;

        const { data, error } = await db
            .from("hospitals")
            .update(updatePayload)
            .eq("id", hospitalId)
            .select()
            .single();

        if (error) throw error;

        await logAuditEvent({
            hospitalId: hospitalId,
            actorUserId: req.context.userId,
            actorRole: req.context.role,
            action: "HOSPITAL_PROFILE_UPDATE",
            resourceType: "hospitals",
            resourceId: hospitalId,
            metadata: { name, phone, email }
        });

        return res.json({
            success: true,
            message: "Hospital profile updated successfully.",
            hospital: data
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/audit-logs
 * Fetch tenant security audit logs
 */
router.get("/audit-logs", requirePermission("audit.view"), async (req, res) => {
    try {
        const db = getSupabaseClient();
        if (!db) return res.json({ success: true, auditLogs: [] });

        const { data, error } = await db
            .from("audit_logs")
            .select("*")
            .eq("hospital_id", req.context.hospitalId)
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) throw error;

        return res.json({
            success: true,
            auditLogs: data || []
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/v1/hospital-admin/auth/context
 * Returns current user's authenticated context & capabilities
 */
router.get("/auth/context", (req, res) => {
    return res.json({
        success: true,
        context: req.context
    });
});

module.exports = router;

