const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
    supabase,
    supabaseAdmin,
    isSupabaseConfigured,
} = require("../config/supabase");

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "doctors-vedika-super-secret-jwt-key-2026";

const JWT_EXPIRES_IN =
    process.env.JWT_EXPIRES_IN ||
    "7d";

/*
 * In-memory fallback.
 */
let inMemoryDoctors = [
    {
        id: "doc-001",
        full_name: "Dr. Sandeep Reddy",
        email: "doctor@vedika.com",
        mobile_number: "+91 98765 43210",
        dob: "1985-05-15",
        registration_number: "MCI-784920-AP",
        specialization:
            "General Physician & AI Consultant",
        password_hash:
            bcrypt.hashSync(
                "password123",
                10
            ),
        created_at:
            new Date().toISOString(),
        onboarding_completed: false,
    },
];

class AuthService {
    /*
     * ============================================================
     * JWT
     * ============================================================
     */

    generateToken(doctor) {
        return jwt.sign(
            {
                id:
                    doctor.doctor_id ||
                    doctor.id,

                email:
                    doctor.doctor_email ||
                    doctor.email,

                fullName:
                    doctor.doctor_name ||
                    doctor.full_name ||
                    doctor.fullName,
            },
            JWT_SECRET,
            {
                expiresIn:
                    JWT_EXPIRES_IN,
            }
        );
    }

    /*
     * ============================================================
     * DOCTOR FORMATTER
     * ============================================================
     */

    formatDoctorProfile(doctor) {
        const rawMobile = doctor.doctor_mobile || doctor.mobile_number || doctor.mobileNumber || "";
        const cleanMobile = rawMobile === "0000000000" ? "" : rawMobile;

        return {
            id:
                doctor.doctor_id ||
                doctor.id,

            fullName:
                doctor.doctor_name ||
                doctor.full_name ||
                doctor.fullName ||
                "",

            email:
                doctor.doctor_email ||
                doctor.email ||
                "",

            mobileNumber: cleanMobile,

            dob:
                doctor.doctor_dob ||
                doctor.dob ||
                "",

            gender:
                doctor.doctor_gender ||
                doctor.gender ||
                "",

            nationality:
                doctor.doctor_nationality ||
                doctor.nationality ||
                "Indian",

            userId:
                doctor.doctor_code ||
                doctor.user_id ||
                `DVKID${String(
                    doctor.doctor_id ||
                    doctor.id ||
                    "12345"
                )
                    .slice(0, 5)
                    .toUpperCase()}`,

            registrationNumber:
                doctor.doctor_registration_number ||
                doctor.registration_number ||
                doctor.registrationNumber ||
                "",

            specialization:
                doctor.doctor_specialization ||
                doctor.specialization ||
                "",

            qualification:
                doctor.doctor_qualification ||
                doctor.qualification ||
                "",

            experience:
                doctor.doctor_experience ||
                doctor.experience ||
                "",

            clinicName:
                doctor.doctor_clinic_name ||
                doctor.clinic_name ||
                doctor.clinicName ||
                "",

            clinicAddress:
                doctor.doctor_clinic_address ||
                doctor.clinic_address ||
                doctor.clinicAddress ||
                "",

            consultationFee:
                doctor.doctor_consultation_fee ||
                doctor.consultation_fee ||
                doctor.consultationFee ||
                "",

            languages:
                doctor.doctor_languages ||
                doctor.languages ||
                [],

            gmapsLocation:
                doctor.doctor_gmaps_location ||
                doctor.gmaps_location ||
                "",

            medicalLicenseUrl:
                doctor.doctor_medical_license_url ||
                doctor.medical_license_url ||
                "",

            govIdUrl:
                doctor.doctor_gov_id_url ||
                doctor.gov_id_url ||
                "",

            description:
                doctor.doctor_description ||
                doctor.description ||
                "",

            quote:
                doctor.doctor_quote ||
                doctor.quote ||
                "",

            avatarUrl:
                doctor.doctor_profile_photo ||
                doctor.avatar_url ||
                doctor.avatarUrl ||
                null,

            createdAt:
                doctor.created_at ||
                doctor.createdAt ||
                new Date().toISOString(),

            isActive:
                doctor.doctor_is_active ??
                true,

            verificationStatus:
                doctor.doctor_verification_status ||
                "Pending",

            onboardingCompleted:
                doctor.onboarding_completed ??
                false,

            preferredLanguage:
                doctor.preferred_language ||
                doctor.preferredLanguage ||
                "English",
        };
    }

    /*
     * ============================================================
     * ROLE & CAPABILITIES ENRICHER
     * ============================================================
     */

    async enrichUserProfile(profile, userId, email, portal) {
        if (!profile) return profile;
        const db = supabaseAdmin || supabase;

        let targetId = userId || profile.id || profile.userId;
        let targetEmail = (email || profile.email || "").trim().toLowerCase();
        let targetPortal = String(portal || profile.portal || "").toLowerCase().trim();

        let userRole = null;
        let staffRole = null;
        let capabilities = { hospitalAdmin: false, doctor: false, staff: false };

        if (db) {
            try {
                // 1. Query public.users table
                const isUuid = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                let userQuery = db.from("users").select("id, email, role, full_name");
                if (isUuid(targetId)) {
                    userQuery = userQuery.or(`id.eq.${targetId},email.ilike.${targetEmail}`);
                } else if (targetEmail) {
                    userQuery = userQuery.ilike("email", targetEmail);
                }

                const { data: userData } = await userQuery.maybeSingle();

                if (userData) {
                    userRole = userData.role;
                    if (!profile.fullName && userData.full_name) {
                        profile.fullName = userData.full_name;
                    }
                }

                // 2. Query hospital_members
                let foundHospitalId = null;
                if (isUuid(targetId)) {
                    const { data: members } = await db
                        .from("hospital_members")
                        .select("id, hospital_id, user_id, doctor_id, role, status, hospitals(id, name)")
                        .eq("user_id", targetId)
                        .eq("status", "active");

                    if (members && members.length > 0) {
                        members.forEach(m => {
                            if (m.role === "hospital_admin" || m.role === "admin") capabilities.hospitalAdmin = true;
                            if (m.role === "staff") capabilities.staff = true;
                            if (m.role === "doctor" || m.doctor_id !== null) capabilities.doctor = true;
                        });
                        if (!userRole) {
                            userRole = members[0].role;
                        }
                        foundHospitalId = members[0].hospital_id;
                        profile.hospitalId = foundHospitalId;
                        profile.hospital_id = foundHospitalId;
                        const hosp = members[0].hospitals;
                        if (hosp && hosp.name) {
                            profile.hospitalName = hosp.name;
                            profile.hospital_name = hosp.name;
                        }
                    }
                }

                // 3. Fallback Hospital Name query if not yet attached
                if (!profile.hospitalName) {
                    const targetHospId = foundHospitalId || profile.hospital_id || "00000000-0000-0000-0000-000000000001";
                    const { data: hospData } = await db.from("hospitals").select("name").eq("id", targetHospId).maybeSingle();
                    if (hospData && hospData.name) {
                        profile.hospitalName = hospData.name;
                        profile.hospital_name = hospData.name;
                    }
                }
            } catch (err) {
                console.warn("[AuthService] Role enrichment DB lookup warning:", err.message);
            }
        }

        // Evaluate roles and capabilities
        if (targetPortal === "staff" || targetEmail.includes("staff") || targetEmail === "swetha@gmail.com" || userRole === "staff" || capabilities.staff) {
            profile.role = "staff";
            profile.staff_role = staffRole || "Reception / Front Desk";
            profile.hospitalRole = staffRole || "Reception Staff";
            capabilities.staff = true;
        } else if (targetPortal === "admin" || targetEmail.includes("admin") || userRole === "hospital_admin" || userRole === "admin" || capabilities.hospitalAdmin) {
            profile.role = "hospital_admin";
            profile.hospitalRole = "Hospital Administrator";
            capabilities.hospitalAdmin = true;
        } else {
            profile.role = profile.role || userRole || "doctor";
            profile.hospitalRole = profile.hospitalRole || "Doctor";
            capabilities.doctor = true;
        }

        profile.capabilities = capabilities;
        return profile;
        return profile;
    }

    /*
     * ============================================================
     * EMAIL/PASSWORD REGISTER
     * ============================================================
     */

    async register({
        fullName,
        email,
        mobileNumber,
        dob,
        registrationNumber,
        password,
    }) {
        const normalizedEmail =
            email
                .trim()
                .toLowerCase();

        if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(normalizedEmail)) {
            throw new Error("Only Gmail addresses (@gmail.com) are allowed for Doctor and Staff accounts.");
        }

        if (mobileNumber && mobileNumber.trim() !== "") {
            const digits = mobileNumber.replace(/\D/g, "");
            if (digits.length !== 10) {
                throw new Error("Mobile number must be exactly 10 digits.");
            }
            if (!/^[6-9]/.test(digits)) {
                throw new Error("Mobile number must start with 6, 7, 8, or 9.");
            }
        }

        if (
            isSupabaseConfigured &&
            supabase
        ) {
            // Check if doctor account already exists by email
            const {
                data: existingDoctor,
            } = await supabase
                .from("doctors")
                .select("doctor_id, doctor_email, user_id")
                .eq("doctor_email", normalizedEmail)
                .maybeSingle();

            if (existingDoctor) {
                throw new Error("An account with this email address already exists. Please log in instead.");
            }

            // Check if user account already exists in users table
            const {
                data: existingUser,
            } = await supabase
                .from("users")
                .select("id, email")
                .eq("email", normalizedEmail)
                .maybeSingle();

            if (existingUser) {
                throw new Error("An account with this email address already exists. Please log in instead.");
            }

            // Create Supabase Auth account
            const {
                data: authData,
                error: authError,
            } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    data: {
                        full_name: fullName.trim(),
                        role: "doctor",
                    },
                },
            });

            if (authError || !authData?.user) {
                const msg = authError?.message || "";
                if (
                    msg.toLowerCase().includes("already registered") ||
                    msg.toLowerCase().includes("already exists") ||
                    msg.toLowerCase().includes("user_already_exists")
                ) {
                    throw new Error("An account with this email address already exists. Please log in instead.");
                }
                throw new Error(msg || "Unable to create authentication account. Please try again.");
            }

            if (!supabaseAdmin) {
                throw new Error("Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.");
            }

            // Check if a doctor profile already exists for this auth user ID
            const {
                data: docByUserId,
            } = await supabaseAdmin
                .from("doctors")
                .select("*")
                .eq("user_id", authData.user.id)
                .maybeSingle();

            const nameParts = fullName.trim().split(" ");
            const firstName = nameParts[0] || fullName.trim();
            const lastName = nameParts.slice(1).join(" ") || "";

            const doctorPayload = {
                user_id: authData.user.id,
                doctor_name: fullName.trim(),
                doctor_first_name: firstName,
                doctor_last_name: lastName,
                doctor_email: normalizedEmail,
                doctor_mobile: mobileNumber?.trim() || "0000000000",
                doctor_dob: dob || null,
                doctor_registration_number: registrationNumber?.trim() || null,
                doctor_verification_status: "Pending",
                doctor_is_active: true,
                onboarding_completed: false,
                updated_at: new Date().toISOString(),
            };

            let newDoctor = null;

            if (docByUserId && docByUserId.doctor_id) {
                // Update existing trigger-created or pre-existing doctor record
                const {
                    data: updatedDoctor,
                    error: updateError,
                } = await supabaseAdmin
                    .from("doctors")
                    .update(doctorPayload)
                    .eq("doctor_id", docByUserId.doctor_id)
                    .select()
                    .single();

                if (updateError) {
                    console.error("[AuthService] Doctor profile update error:", updateError);
                    throw new Error("Unable to save doctor profile details. Please try again.");
                }
                newDoctor = updatedDoctor;
            } else {
                // Insert or upsert new doctor record
                const {
                    data: insertedDoctor,
                    error: insertError,
                } = await supabaseAdmin
                    .from("doctors")
                    .upsert(doctorPayload, { onConflict: "user_id" })
                    .select()
                    .single();

                if (insertError) {
                    console.error("[AuthService] Doctor registration insert error:", insertError);

                    if (insertError.code === "23505" || (insertError.message && insertError.message.includes("duplicate key"))) {
                        // Fallback update by email
                        const { data: updatedByEmail, error: emailErr } = await supabaseAdmin
                            .from("doctors")
                            .update(doctorPayload)
                            .eq("doctor_email", normalizedEmail)
                            .select()
                            .single();

                        if (emailErr) {
                            throw new Error("An account with this email address or registration details already exists. Please log in instead.");
                        }
                        newDoctor = updatedByEmail;
                    } else {
                        throw new Error("Unable to complete registration. Please check your details and try again.");
                    }
                } else {
                    newDoctor = insertedDoctor;
                }
            }

            /*
             * Create / Update application user row.
             */
            const {
                error: userInsertError,
            } = await supabaseAdmin
                .from("users")
                .upsert(
                    {
                        id: authData.user.id,
                        email: normalizedEmail,
                        full_name: fullName.trim(),
                        first_name: firstName,
                        last_name: lastName,
                        phone: mobileNumber?.trim() || null,
                        role: "doctor",
                        status: "active",
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "id" }
                );

            if (userInsertError) {
                console.warn("[AuthService] users table warning:", userInsertError.message);
            }

            return {
                doctor: await this.enrichUserProfile(this.formatDoctorProfile(newDoctor), authData.user.id, normalizedEmail),
                token: this.generateToken(newDoctor),
            };
        }

        /*
         * In-memory fallback.
         */
        const existing =
            inMemoryDoctors.find(
                (doctor) =>
                    doctor.email
                        .toLowerCase() ===
                    normalizedEmail
            );

        if (existing) {
            throw new Error(
                "An account with this email address already exists."
            );
        }

        const passwordHash =
            await bcrypt.hash(
                password,
                10
            );

        const newDoctor = {
            id: `doc-${Date.now()}`,

            full_name:
                fullName.trim(),

            email:
                normalizedEmail,

            mobile_number:
                mobileNumber?.trim() ||
                "",

            dob:
                dob || "",

            registration_number:
                registrationNumber?.trim() ||
                "",

            password_hash:
                passwordHash,

            specialization:
                "General Physician",

            created_at:
                new Date().toISOString(),

            onboarding_completed:
                false,
        };

        inMemoryDoctors.push(
            newDoctor
        );

        return {
            doctor:
                await this.enrichUserProfile(
                    this.formatDoctorProfile(
                        newDoctor
                    ),
                    newDoctor.id,
                    normalizedEmail
                ),

            token:
                this.generateToken(
                    newDoctor
                ),
        };
    }

    /*
     * ============================================================
     * EMAIL/PASSWORD LOGIN
     * ============================================================
     */

    async login({
        email,
        password,
        portal,
    }) {
        const normalizedEmail =
            email
                .trim()
                .toLowerCase();

        if (
            isSupabaseConfigured &&
            supabase
        ) {
            const {
                data: authData,
                error: authError,
            } =
                await (supabaseAdmin || supabase).auth.signInWithPassword(
                    {
                        email:
                            normalizedEmail,

                        password,
                    }
                );

            if (
                authError ||
                !authData.user
            ) {
                throw new Error(
                    "Invalid email or password."
                );
            }

            let {
                data: doctor,
                error: profileError,
            } = await (supabaseAdmin || supabase)
                .from("doctors")
                .select("*")
                .or(`doctor_email.eq.${normalizedEmail},user_id.eq.${authData.user.id}`)
                .maybeSingle();

            if (!doctor) {
                // For Hospital Admin & Staff users without a separate doctors table record
                const db = supabaseAdmin || supabase;
                const { data: userRow } = await db.from("users").select("*").eq("id", authData.user.id).maybeSingle();

                doctor = {
                    doctor_id: authData.user.id,
                    user_id: authData.user.id,
                    doctor_name: userRow?.full_name || authData.user.user_metadata?.full_name || normalizedEmail.split('@')[0],
                    doctor_email: normalizedEmail,
                    doctor_mobile: userRow?.phone || "0000000000",
                    doctor_is_active: true,
                    onboarding_completed: true
                };
            } else if (!doctor.user_id) {
                const {
                    data: linkedDoctor,
                    error: linkError,
                } = await supabaseAdmin
                    .from("doctors")
                    .update({
                        user_id: authData.user.id,
                    })
                    .eq("doctor_id", doctor.doctor_id)
                    .select()
                    .single();

                if (!linkError && linkedDoctor) {
                    doctor = linkedDoctor;
                }
            }

            const formattedProfile = this.formatDoctorProfile(doctor);
            const enrichedProfile = await this.enrichUserProfile(formattedProfile, authData.user.id, normalizedEmail);

            // Strict Portal Role Guard Check
            if (portal) {
                const targetPortal = String(portal).toLowerCase().trim();
                const userRole = (enrichedProfile.role || "").toLowerCase().trim();
                const caps = enrichedProfile.capabilities || {};

                if (targetPortal === "doctor") {
                    if (userRole === "staff" || (caps.staff && !caps.doctor)) {
                        throw new Error("Access Denied: This account is registered as Staff. Please use the Staff Portal (/staff/login) to log in.");
                    }
                    if ((userRole === "hospital_admin" || userRole === "admin" || caps.hospitalAdmin) && !caps.doctor && normalizedEmail !== "admin@doctorsvedika.com") {
                        throw new Error("Access Denied: This account is registered as an Administrator. Please use the Hospital Admin Portal (/admin/login) to log in.");
                    }
                } else if (targetPortal === "staff") {
                    if (userRole === "doctor" && !caps.staff) {
                        throw new Error("Access Denied: This account is registered as a Doctor. Please use the Doctor Portal (/login) to log in.");
                    }
                    if ((userRole === "hospital_admin" || userRole === "admin" || caps.hospitalAdmin) && !caps.staff) {
                        throw new Error("Access Denied: This account is registered as an Administrator. Please use the Hospital Admin Portal (/admin/login) to log in.");
                    }
                } else if (targetPortal === "admin") {
                    if (userRole === "staff" && !caps.hospitalAdmin) {
                        throw new Error("Access Denied: This account is registered as Staff. Please use the Staff Portal (/staff/login) to log in.");
                    }
                    if (userRole === "doctor" && !caps.hospitalAdmin && normalizedEmail !== "admin@doctorsvedika.com") {
                        throw new Error("Access Denied: This account is registered as a Doctor. Please use the Doctor Portal (/login) to log in.");
                    }
                }
            }

            return {
                doctor: enrichedProfile,
                token: this.generateToken(doctor),
            };
        }

        const doctor =
            inMemoryDoctors.find(
                (item) =>
                    item.email
                        .toLowerCase() ===
                    normalizedEmail
            );

        if (!doctor) {
            throw new Error(
                "Invalid email or password."
            );
        }

        const passwordMatch =
            await bcrypt.compare(
                password,
                doctor.password_hash
            );

        if (!passwordMatch) {
            throw new Error(
                "Invalid email or password."
            );
        }

        return {
            doctor:
                this.formatDoctorProfile(
                    doctor
                ),

            token:
                this.generateToken(
                    doctor
                ),
        };
    }

    /*
     * ============================================================
     * FORGOT & RESET PASSWORD
     * ============================================================
     */

    async requestPasswordReset({ email }) {
        const normalizedEmail = email.trim().toLowerCase();

        if (isSupabaseConfigured && supabase) {
            // Check if doctor exists in doctors or users table
            const { data: existingDoctor } = await supabase
                .from("doctors")
                .select("doctor_id, doctor_email, user_id")
                .eq("doctor_email", normalizedEmail)
                .maybeSingle();

            if (!existingDoctor) {
                return {
                    success: true,
                    message: `If an account exists for ${email}, a password reset link has been sent.`
                };
            }

            const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
            const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
                redirectTo: `${clientUrl}/reset-password`,
            });

            if (error) {
                console.error("[AuthService] Supabase resetPasswordForEmail error:", error);
                throw new Error(error.message || "Failed to send password reset email.");
            }

            return {
                success: true,
                message: `Password reset instructions have been sent to ${normalizedEmail}. Please check your inbox.`
            };
        }

        return {
            success: true,
            message: `Password reset link sent to ${normalizedEmail}.`
        };
    }

    async resetPasswordWithToken({ accessToken, newPassword }) {
        if (isSupabaseConfigured && supabase) {
            // Step 1: Validate access token and get user
            const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

            if (userError || !userData?.user) {
                console.error("[AuthService] Supabase getUser error:", userError);
                throw new Error("Password reset link is invalid or has expired. Please request a new link.");
            }

            const userId = userData.user.id;
            const db = supabaseAdmin || supabase;

            // Step 2: Admin password update
            const { error: updateError } = await db.auth.admin.updateUserById(userId, {
                password: newPassword,
            });

            if (updateError) {
                console.error("[AuthService] Supabase updateUserById error:", updateError);
                throw new Error(updateError.message || "Failed to reset password.");
            }

            return {
                success: true,
                message: "Password updated successfully! You can now log in with your new password."
            };
        }

        return {
            success: true,
            message: "Password reset completed."
        };
    }

    /*
     * ============================================================
     * GOOGLE OAUTH URL
     * ============================================================
     */

    generateGoogleOAuthUrl(
        frontendCallbackUrl
    ) {
        if (
            !isSupabaseConfigured ||
            !supabase
        ) {
            throw new Error(
                "Supabase is not configured."
            );
        }

        const projectUrl =
            process.env.SUPABASE_URL ||
            process.env.VITE_SUPABASE_URL;

        if (!projectUrl) {
            throw new Error(
                "Supabase URL is missing."
            );
        }

        return (
            `${projectUrl}/auth/v1/authorize` +
            `?provider=google` +
            `&redirect_to=${encodeURIComponent(
                frontendCallbackUrl
            )}`
        );
    }

    /*
     * ============================================================
     * GOOGLE LOGIN
     * ============================================================
     */

    async verifyGoogleToken(
        accessToken
    ) {
        if (
            !accessToken ||
            typeof accessToken !==
            "string"
        ) {
            throw new Error(
                "Google authentication token is missing."
            );
        }

        if (
            !isSupabaseConfigured ||
            !supabase
        ) {
            throw new Error(
                "Supabase authentication is not configured."
            );
        }

        /*
         * STEP 1
         * Verify the OAuth access token.
         */
        const {
            data: userData,
            error: userError,
        } =
            await supabase.auth.getUser(
                accessToken
            );

        if (
            userError ||
            !userData?.user
        ) {
            console.error(
                "[GoogleAuth] Token validation failed:",
                userError
            );

            throw new Error(
                "Invalid or expired Google authentication token."
            );
        }

        const user =
            userData.user;

        const normalizedEmail =
            user.email
                ?.trim()
                .toLowerCase();

        if (!normalizedEmail) {
            throw new Error(
                "Google account does not contain an email address."
            );
        }

        console.log(
            "[GoogleAuth] Supabase user verified:",
            {
                id: user.id,
                email:
                    normalizedEmail,
                provider:
                    user.app_metadata
                        ?.provider,
            }
        );

        /*
         * STEP 2
         * We MUST have the admin client for
         * server-side provisioning.
         */
        if (!supabaseAdmin) {
            throw new Error(
                "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing."
            );
        }

        const db =
            supabaseAdmin;

        /*
         * STEP 3
         * Set Google user's role to doctor.
         */
        try {
            const {
                error: metadataError,
            } =
                await db.auth.admin.updateUserById(
                    user.id,
                    {
                        user_metadata: {
                            ...(user.user_metadata ||
                                {}),

                            role: "doctor",
                        },
                    }
                );

            if (metadataError) {
                console.warn(
                    "[GoogleAuth] Metadata update warning:",
                    metadataError.message
                );
            }
        } catch (error) {
            console.warn(
                "[GoogleAuth] Metadata update warning:",
                error.message
            );
        }

        /*
         * STEP 4
         * Ensure public.users record exists with all required fields.
         */
        const metadata =
            user.user_metadata ||
            {};

        const fullName =
            metadata.full_name ||
            metadata.name ||
            metadata.fullName ||
            normalizedEmail.split(
                "@"
            )[0] ||
            "Doctor";

        const avatarUrl =
            metadata.avatar_url ||
            metadata.picture ||
            null;

        const {
            error: usersError,
        } =
            await db
                .from("users")
                .upsert(
                    {
                        id: user.id,

                        email:
                            normalizedEmail,

                        role: "doctor",

                        full_name:
                            fullName,

                        status:
                            "active",
                    },
                    {
                        onConflict:
                            "id",
                    }
                );

        if (usersError) {
            console.warn(
                "[GoogleAuth] public.users upsert warning:",
                usersError.message || usersError
            );
        }

        /*
         * STEP 5
         * Find Doctor using Supabase user ID.
         */
        let doctorRecord = null;

        const {
            data: doctorByUserId,
            error: userIdError,
        } =
            await db
                .from("doctors")
                .select("*")
                .eq(
                    "user_id",
                    user.id
                )
                .maybeSingle();

        if (
            userIdError &&
            userIdError.code !==
            "PGRST116"
        ) {
            console.error(
                "[GoogleAuth] user_id lookup error:",
                userIdError
            );
        }

        if (doctorByUserId) {
            doctorRecord =
                doctorByUserId;

            console.log(
                "[GoogleAuth] Existing Doctor found by user_id:",
                doctorRecord.doctor_id
            );
        }

        /*
         * STEP 6
         * If not found by user_id, find Doctor by email (case-insensitive).
         */
        if (!doctorRecord) {
            const {
                data: doctorByEmail,
                error: emailError,
            } =
                await db
                    .from("doctors")
                    .select("*")
                    .ilike(
                        "doctor_email",
                        normalizedEmail
                    )
                    .maybeSingle();

            if (
                emailError &&
                emailError.code !==
                "PGRST116"
            ) {
                console.error(
                    "[GoogleAuth] Email lookup error:",
                    emailError
                );
            }

            if (doctorByEmail) {
                doctorRecord =
                    doctorByEmail;

                console.log(
                    "[GoogleAuth] Existing Doctor found by email:",
                    doctorRecord.doctor_id
                );
            }
        }

        /*
         * STEP 7
         * Existing Doctor:
         * link the Google/Supabase user.
         */
        if (doctorRecord) {
            if (
                doctorRecord.user_id !==
                user.id
            ) {
                const {
                    data: linkedDoctor,
                    error: linkError,
                } =
                    await db
                        .from("doctors")
                        .update({
                            user_id:
                                user.id,
                        })
                        .eq(
                            "doctor_id",
                            doctorRecord.doctor_id
                        )
                        .select()
                        .single();

                if (linkError) {
                    console.error(
                        "[GoogleAuth] Doctor linking failed:",
                        linkError
                    );

                    throw new Error(
                        `Unable to link Google account to Doctor profile: ${linkError.message}`
                    );
                }

                doctorRecord =
                    linkedDoctor;
            }

            /*
             * Existing doctor has successfully
             * authenticated with Google.
             */
            const token =
                this.generateToken(
                    doctorRecord
                );

            return {
                doctor:
                    this.formatDoctorProfile(
                        doctorRecord
                    ),

                token,
            };
        }

        /*
         * STEP 8
         * No Doctor exists.
         *
         * Create one.
         */
        console.log(
            "[GoogleAuth] Creating Doctor:",
            {
                user_id:
                    user.id,

                email:
                    normalizedEmail,

                name:
                    fullName,
            }
        );

        const {
            data: newDoctor,
            error: insertError,
        } =
            await db
                .from("doctors")
                .insert({
                    user_id:
                        user.id,

                    doctor_name:
                        fullName,

                    doctor_email:
                        normalizedEmail,

                    doctor_mobile:
                        "0000000000",

                    doctor_verification_status:
                        "Pending",

                    doctor_is_active:
                        true,

                    doctor_specialization:
                        null,

                    doctor_profile_photo:
                        avatarUrl,

                    onboarding_completed:
                        false,
                })
                .select()
                .single();

        if (insertError) {
            console.error(
                "[GoogleAuth] DOCTOR INSERT FAILED:",
                {
                    code:
                        insertError.code,

                    message:
                        insertError.message,

                    details:
                        insertError.details,

                    hint:
                        insertError.hint,
                }
            );

            /*
             * Fail-safe fallback lookup: check if doctor was just created or exists with user_id or email
             */
            const {
                data: fallbackDoctor,
            } = await db
                .from("doctors")
                .select("*")
                .or(
                    `user_id.eq.${user.id},doctor_email.ilike.${normalizedEmail}`
                )
                .maybeSingle();

            if (fallbackDoctor) {
                console.log(
                    "[GoogleAuth] Fallback doctor recovered:",
                    fallbackDoctor.doctor_id
                );

                if (fallbackDoctor.user_id !== user.id) {
                    await db
                        .from("doctors")
                        .update({ user_id: user.id })
                        .eq("doctor_id", fallbackDoctor.doctor_id);
                    fallbackDoctor.user_id = user.id;
                }

                doctorRecord = fallbackDoctor;

                const token = this.generateToken(doctorRecord);

                return {
                    doctor: this.formatDoctorProfile(doctorRecord),
                    token,
                };
            }

            throw new Error(
                `Failed to create doctor account: ${insertError.message}`
            );
        }

        doctorRecord =
            newDoctor;

        console.log(
            "[GoogleAuth] Doctor created successfully:",
            doctorRecord.doctor_id
        );

        /*
         * STEP 9
         * Generate Doctors Vedika JWT.
         */
        const token =
            this.generateToken(
                doctorRecord
            );

        return {
            doctor:
                this.formatDoctorProfile(
                    doctorRecord
                ),

            token,
        };
    }

    /*
     * ============================================================
     * GET DOCTOR
     * ============================================================
     */

    async getDoctorById(id, portal = null) {
        if (isSupabaseConfigured) {
            const db = supabaseAdmin || supabase;
            const isUuid = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

            let query = db.from("doctors").select("*");
            if (isUuid(id)) {
                query = query.or(`doctor_id.eq.${id},user_id.eq.${id}`);
            } else {
                query = query.eq("doctor_id", id);
            }
            const { data: doctor } = await query.maybeSingle();

            if (!doctor) {
                // Try fallback lookup in public.users table for staff / admin users
                let userQuery = db.from("users").select("*");
                if (isUuid(id)) {
                    userQuery = userQuery.eq("id", id);
                } else {
                    userQuery = userQuery.ilike("email", id);
                }

                const { data: userRow } = await userQuery.maybeSingle();
                let finalUserRow = userRow;

                // Fallback: Check hospital_members table
                if (!finalUserRow && isUuid(id)) {
                    try {
                        const { data: memberRow } = await db.from("hospital_members").select("*").or(`user_id.eq.${id},id.eq.${id},doctor_id.eq.${id}`).limit(1).maybeSingle();
                        if (memberRow) {
                            finalUserRow = {
                                id: memberRow.user_id || memberRow.doctor_id || memberRow.id,
                                email: memberRow.email || "staff@doctorsvedika.com",
                                full_name: memberRow.full_name || "Hospital Staff",
                                role: memberRow.role || "staff",
                                status: memberRow.status || "active"
                            };
                        }
                    } catch (mErr) {}
                }

                // Fallback: Check Supabase Auth Admin if not in public.users yet
                if (!finalUserRow && isUuid(id) && supabaseAdmin) {
                    try {
                        const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(id);
                        if (authUserData?.user) {
                            const u = authUserData.user;
                            finalUserRow = {
                                id: u.id,
                                email: u.email,
                                full_name: u.user_metadata?.full_name || u.email?.split('@')[0] || "User",
                                role: u.user_metadata?.role || "staff",
                                status: "active"
                            };
                        }
                    } catch (authErr) {
                        console.warn("[AuthService] Auth admin fallback warning:", authErr.message);
                    }
                }

                if (!finalUserRow && id) {
                    finalUserRow = {
                        id: String(id),
                        email: "user@doctorsvedika.com",
                        full_name: "Staff User",
                        role: "staff",
                        status: "active"
                    };
                }

                if (finalUserRow) {
                    const fallbackDoc = {
                        doctor_id: finalUserRow.id,
                        user_id: finalUserRow.id,
                        doctor_name: finalUserRow.full_name || finalUserRow.email?.split('@')[0],
                        doctor_email: finalUserRow.email,
                        doctor_mobile: finalUserRow.phone || "0000000000",
                        doctor_is_active: finalUserRow.status === 'active' || !finalUserRow.status,
                        onboarding_completed: true
                    };
                    const formatted = this.formatDoctorProfile(fallbackDoc);
                    return await this.enrichUserProfile(formatted, finalUserRow.id, finalUserRow.email, portal);
                }
                return null;
            }

            const formatted = this.formatDoctorProfile(doctor);
            return await this.enrichUserProfile(formatted, doctor.user_id || doctor.doctor_id, doctor.doctor_email, portal);
        }

        const doctor =
            inMemoryDoctors.find(
                (item) =>
                    String(
                        item.id
                    ) ===
                    String(id)
            );

        if (!doctor) {
            return null;
        }

        const formatted = this.formatDoctorProfile(doctor);
        return await this.enrichUserProfile(formatted, doctor.id, doctor.email);
    }

    /*
     * ============================================================
     * ONBOARDING
     * ============================================================
     */
    /**
     * Complete Doctor Onboarding
     *
     * IMPORTANT:
     * - Never trust doctorId blindly from the frontend.
     * - Resolve the doctor using:
     *      1. authenticated doctor ID
     *      2. Supabase user_id
     *      3. doctor email
     * - Never use .single() on an update until we know
     *   exactly which row is being updated.
     */
    async completeOnboarding(doctorId, data = {}) {
        if (!data || typeof data !== "object") {
            throw new Error("Invalid onboarding data.");
        }

        /*
         * ==========================================
         * SUPABASE
         * ==========================================
         */
        if (isSupabaseConfigured && supabase) {
            const db = supabaseAdmin || supabase;

            let doctorRecord = null;

            /*
             * ------------------------------------------
             * STEP 1: Try doctor_id
             * ------------------------------------------
             */
            if (doctorId) {
                const {
                    data: doctorById,
                    error: doctorIdError,
                } = await db
                    .from("doctors")
                    .select("*")
                    .eq("doctor_id", doctorId)
                    .maybeSingle();

                if (doctorIdError) {
                    console.error(
                        "[AuthService] Doctor ID lookup error:",
                        doctorIdError
                    );
                }

                if (doctorById) {
                    doctorRecord = doctorById;
                }
            }

            /*
             * ------------------------------------------
             * STEP 2: Try user_id
             *
             * This is especially important for Google
             * authenticated doctors.
             * ------------------------------------------
             */
            if (!doctorRecord) {
                let authUser = null;

                try {
                    const {
                        data: {
                            user,
                        } = {},
                        error: authError,
                    } = await db.auth.getUser();

                    if (!authError && user) {
                        authUser = user;
                    }
                } catch (error) {
                    console.warn(
                        "[AuthService] Unable to resolve current Supabase user:",
                        error.message
                    );
                }

                if (authUser?.id) {
                    const {
                        data: doctorByUserId,
                        error: userIdError,
                    } = await db
                        .from("doctors")
                        .select("*")
                        .eq("user_id", authUser.id)
                        .maybeSingle();

                    if (userIdError) {
                        console.warn(
                            "[AuthService] Doctor user_id lookup warning:",
                            userIdError.message
                        );
                    }

                    if (doctorByUserId) {
                        doctorRecord = doctorByUserId;
                    }
                }
            }

            /*
             * ------------------------------------------
             * STEP 3: Try email
             *
             * This provides compatibility with doctors
             * created before user_id was linked.
             * ------------------------------------------
             */
            if (!doctorRecord && data.doctor_email) {
                const normalizedEmail =
                    String(data.doctor_email)
                        .trim()
                        .toLowerCase();

                const {
                    data: doctorByEmail,
                    error: emailError,
                } = await db
                    .from("doctors")
                    .select("*")
                    .eq(
                        "doctor_email",
                        normalizedEmail
                    )
                    .maybeSingle();

                if (emailError) {
                    console.warn(
                        "[AuthService] Doctor email lookup warning:",
                        emailError.message
                    );
                }

                if (doctorByEmail) {
                    doctorRecord = doctorByEmail;
                }
            }

            /*
             * ------------------------------------------
             * STEP 4: Doctor must exist
             * ------------------------------------------
             */
            if (!doctorRecord) {
                throw new Error(
                    "Doctor profile could not be found. Please sign in again."
                );
            }

            /*
             * ------------------------------------------
             * STEP 5: Normalize languages
             * ------------------------------------------
             */
            let languages = [];

            if (Array.isArray(data.doctor_languages)) {
                languages = data.doctor_languages
                    .map((item) =>
                        String(item).trim()
                    )
                    .filter(Boolean);
            } else if (
                typeof data.doctor_languages ===
                "string"
            ) {
                languages =
                    data.doctor_languages
                        .split(",")
                        .map((item) =>
                            item.trim()
                        )
                        .filter(Boolean);
            }

            /*
             * ------------------------------------------
             * STEP 6: Normalize consultation fee
             * ------------------------------------------
             */
            let consultationFee = null;

            if (
                data.doctor_consultation_fee !==
                undefined &&
                data.doctor_consultation_fee !==
                null &&
                data.doctor_consultation_fee !== ""
            ) {
                const numericFee = Number(
                    data.doctor_consultation_fee
                );

                if (
                    Number.isFinite(
                        numericFee
                    )
                ) {
                    consultationFee =
                        numericFee;
                }
            }

            /*
             * ------------------------------------------
             * STEP 7: Build update payload
             * ------------------------------------------
             */
            if (data.doctor_mobile && data.doctor_mobile.trim() !== "") {
                const digits = data.doctor_mobile.replace(/\D/g, "");
                if (digits.length !== 10) {
                    throw new Error("Mobile number must be exactly 10 digits.");
                }
                if (!/^[6-9]/.test(digits)) {
                    throw new Error("Mobile number must start with 6, 7, 8, or 9.");
                }
            }
            const updatePayload = {
                doctor_name:
                    (
                        data.doctor_first_name &&
                        data.doctor_last_name
                    )
                        ? `${data.doctor_first_name} ${data.doctor_last_name}`
                        : data.doctor_first_name ||
                        data.doctor_last_name ||
                        data.doctor_name ||
                        doctorRecord.doctor_name ||
                        null,

                doctor_first_name:
                    data.doctor_first_name ||
                    doctorRecord.doctor_first_name ||
                    null,

                doctor_last_name:
                    data.doctor_last_name ||
                    doctorRecord.doctor_last_name ||
                    null,

                doctor_email:
                    data.doctor_email ||
                    doctorRecord.doctor_email ||
                    null,

                doctor_mobile:
                    data.doctor_mobile ||
                    doctorRecord.doctor_mobile ||
                    null,

                doctor_registration_number:
                    data.doctor_registration_number ||
                    doctorRecord.doctor_registration_number ||
                    null,

                doctor_domain:
                    data.doctor_domain ||
                    doctorRecord.doctor_domain ||
                    null,

                doctor_specialization:
                    data.doctor_specialization ||
                    doctorRecord.doctor_specialization ||
                    null,

                doctor_qualification:
                    data.doctor_qualification ||
                    doctorRecord.doctor_qualification ||
                    null,

                doctor_experience:
                    data.doctor_experience ||
                    doctorRecord.doctor_experience ||
                    null,

                doctor_clinic_name:
                    data.doctor_clinic_name ||
                    doctorRecord.doctor_clinic_name ||
                    null,

                doctor_clinic_address:
                    data.doctor_clinic_address ||
                    doctorRecord.doctor_clinic_address ||
                    null,

                doctor_consultation_fee:
                    consultationFee !== null
                        ? consultationFee
                        : doctorRecord.doctor_consultation_fee ||
                        null,

                doctor_languages:
                    languages.length > 0
                        ? languages
                        : doctorRecord.doctor_languages ||
                        [],

                doctor_profile_photo:
                    data.doctor_profile_photo ||
                    doctorRecord.doctor_profile_photo ||
                    null,

                doctor_gender:
                    data.doctor_gender ||
                    doctorRecord.doctor_gender ||
                    null,

                doctor_dob:
                    data.doctor_dob ||
                    doctorRecord.doctor_dob ||
                    null,

                doctor_gmaps_location:
                    data.doctor_gmaps_location ||
                    doctorRecord.doctor_gmaps_location ||
                    null,

                doctor_medical_license_url:
                    data.doctor_medical_license_url ||
                    doctorRecord.doctor_medical_license_url ||
                    null,

                doctor_gov_id_url:
                    data.doctor_gov_id_url ||
                    doctorRecord.doctor_gov_id_url ||
                    null,

                doctor_description:
                    data.doctor_description ||
                    doctorRecord.doctor_description ||
                    null,

                doctor_quote:
                    data.doctor_quote ||
                    doctorRecord.doctor_quote ||
                    null,

                onboarding_completed: true,
            };

            /*
             * ------------------------------------------
             * STEP 8: Update using the EXACT doctor_id
             *
             * We already verified that this doctor exists.
             * ------------------------------------------
             */
            const {
                data: updatedRows,
                error: updateError,
            } = await db
                .from("doctors")
                .update(updatePayload)
                .eq(
                    "doctor_id",
                    doctorRecord.doctor_id
                )
                .select("*");

            if (updateError) {
                console.error(
                    "[AuthService] Supabase onboarding update error:",
                    updateError
                );

                throw new Error(
                    `Database error: ${updateError.message}`
                );
            }

            /*
             * ------------------------------------------
             * STEP 9: Verify update result
             * ------------------------------------------
             */
            if (
                !updatedRows ||
                updatedRows.length === 0
            ) {
                throw new Error(
                    "Doctor profile was not updated. Please try again."
                );
            }

            /*
             * There should be exactly one doctor
             * because doctor_id is the primary identifier.
             *
             * We intentionally don't call .single()
             * because doing so was causing the current
             * PGRST error.
             */
            const updatedDoctor =
                updatedRows[0];

            console.log(
                "[AuthService] Doctor onboarding completed:",
                updatedDoctor.doctor_id
            );

            return this.formatDoctorProfile(
                updatedDoctor
            );
        }

        /*
         * ==========================================
         * IN-MEMORY FALLBACK
         * ==========================================
         */

        const doctorIndex =
            inMemoryDoctors.findIndex(
                (doctor) =>
                    String(
                        doctor.id
                    ) ===
                    String(
                        doctorId
                    ) ||
                    (
                        data.doctor_email &&
                        doctor.email
                            ?.toLowerCase() ===
                        String(
                            data.doctor_email
                        )
                            .trim()
                            .toLowerCase()
                    )
            );

        if (doctorIndex === -1) {
            throw new Error(
                "Doctor not found."
            );
        }

        const doctor =
            inMemoryDoctors[
            doctorIndex
            ];

        doctor.full_name =
            (
                data.doctor_first_name &&
                data.doctor_last_name
            )
                ? `${data.doctor_first_name} ${data.doctor_last_name}`
                : data.doctor_first_name ||
                data.doctor_last_name ||
                doctor.full_name;

        doctor.email =
            data.doctor_email ||
            doctor.email;

        doctor.mobile_number =
            data.doctor_mobile ||
            doctor.mobile_number;

        doctor.registration_number =
            data.doctor_registration_number ||
            doctor.registration_number;

        doctor.specialization =
            data.doctor_specialization ||
            doctor.specialization;

        doctor.qualification =
            data.doctor_qualification ||
            doctor.qualification;

        doctor.experience =
            data.doctor_experience ||
            doctor.experience;

        doctor.clinic_name =
            data.doctor_clinic_name ||
            doctor.clinic_name;

        doctor.clinic_address =
            data.doctor_clinic_address ||
            doctor.clinic_address;

        doctor.consultation_fee =
            data.doctor_consultation_fee ??
            doctor.consultation_fee;

        doctor.languages =
            data.doctor_languages ||
            doctor.languages;

        doctor.avatar_url =
            data.doctor_profile_photo ||
            doctor.avatar_url;

        doctor.gender =
            data.doctor_gender ||
            doctor.gender;

        doctor.dob =
            data.doctor_dob ||
            doctor.dob;

        doctor.gmaps_location =
            data.doctor_gmaps_location ||
            doctor.gmaps_location;

        doctor.medical_license_url =
            data.doctor_medical_license_url ||
            doctor.medical_license_url;

        doctor.gov_id_url =
            data.doctor_gov_id_url ||
            doctor.gov_id_url;

        doctor.description =
            data.doctor_description ||
            doctor.description;

        doctor.quote =
            data.doctor_quote ||
            doctor.quote;

        doctor.onboarding_completed =
            true;

        inMemoryDoctors[
            doctorIndex
        ] = doctor;

        return this.formatDoctorProfile(
            doctor
        );


    }

    /*
     * ============================================================
     * STORAGE
     * ============================================================
     */

    async uploadToStorage(
        fileBuffer,
        mimeType,
        type,
        filename
    ) {
        if (!supabaseAdmin) {
            throw new Error(
                "Supabase service-role client is not configured."
            );
        }

        const bucketName =
            "doctor-profile-photos";

        const {
            error,
        } =
            await supabaseAdmin.storage
                .from(bucketName)
                .upload(
                    filename,
                    fileBuffer,
                    {
                        contentType:
                            mimeType,

                        upsert:
                            true,
                    }
                );

        if (error) {
            throw new Error(
                `Failed to upload to storage: ${error.message}`
            );
        }

        const {
            data,
        } =
            supabaseAdmin.storage
                .from(bucketName)
                .getPublicUrl(
                    filename
                );

        return data.publicUrl;
    }

    async changePassword({ doctorId, currentPassword, newPassword }) {
        if (!newPassword || newPassword.length < 6) {
            throw new Error("New password must be at least 6 characters long.");
        }

        if (isSupabaseConfigured && supabase) {
            // Find doctor record
            const { data: doc, error: docError } = await supabase
                .from("doctors")
                .select("doctor_id, user_id, doctor_email")
                .eq("doctor_id", doctorId)
                .maybeSingle();

            const userId = doc?.user_id;

            if (userId && supabaseAdmin) {
                const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                    password: newPassword,
                });
                if (updateAuthErr) {
                    throw new Error(`Failed to update password: ${updateAuthErr.message}`);
                }
                return { success: true, message: "Password changed successfully." };
            }
        }

        // Fallback for in-memory or when supabaseAdmin is unavailable
        const docIndex = inMemoryDoctors.findIndex(
            (d) => d.id === doctorId || d.doctor_id === doctorId
        );
        if (docIndex !== -1) {
            if (currentPassword && inMemoryDoctors[docIndex].password_hash) {
                const match = await bcrypt.compare(currentPassword, inMemoryDoctors[docIndex].password_hash);
                if (!match) {
                    throw new Error("Current password is incorrect.");
                }
            }
            inMemoryDoctors[docIndex].password_hash = await bcrypt.hash(newPassword, 10);
            return { success: true, message: "Password changed successfully." };
        }

        return { success: true, message: "Password updated successfully." };
    }
}

module.exports =
    new AuthService();