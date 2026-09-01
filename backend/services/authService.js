const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { supabase, isSupabaseConfigured } = require("../config/supabase");

const JWT_SECRET = process.env.JWT_SECRET || "doctors-vedika-super-secret-jwt-key-2026";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// In-memory store fallback when Supabase is not yet populated with credentials
let inMemoryDoctors = [
    {
        id: "doc-001",
        full_name: "Dr. Sandeep Reddy",
        email: "doctor@vedika.com",
        mobile_number: "+91 98765 43210",
        dob: "1985-05-15",
        registration_number: "MCI-784920-AP",
        specialization: "General Physician & AI Consultant",
        password_hash: bcrypt.hashSync("password123", 10),
        created_at: new Date().toISOString(),
    },
];

class AuthService {
    /**
     * Generate JWT Token for Doctor
     */
    generateToken(doctor) {
        return jwt.sign(
            {
                id: doctor.doctor_id || doctor.id,
                email: doctor.doctor_email || doctor.email,
                fullName: doctor.doctor_name || doctor.full_name || doctor.fullName,
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
    }

    /**
     * Format Doctor profile for client response (exclude password)
     */
    formatDoctorProfile(doctor) {
        return {
            id: doctor.doctor_id || doctor.id,
            fullName: doctor.doctor_name || doctor.full_name || doctor.fullName || "Dr. Doctor",
            email: doctor.doctor_email || doctor.email || "",
            mobileNumber: doctor.doctor_mobile || doctor.mobile_number || doctor.mobileNumber || "",
            dob: doctor.doctor_dob || doctor.dob || "",
            gender: doctor.doctor_gender || doctor.gender || "",
            nationality: doctor.doctor_nationality || doctor.nationality || "Indian",
            userId: doctor.doctor_code || doctor.user_id || `DVKID${String(doctor.doctor_id || doctor.id || "12345").slice(0, 5).toUpperCase()}`,
            registrationNumber: doctor.doctor_registration_number || doctor.registration_number || doctor.registrationNumber || "",
            specialization: doctor.doctor_specialization || doctor.specialization || "Cardiologist",
            qualification: doctor.doctor_qualification || doctor.qualification || "MBBS, MD (General Medicine), DM (Cardiology)",
            experience: doctor.doctor_experience || doctor.experience || "",
            clinicName: doctor.doctor_clinic_name || doctor.clinic_name || doctor.clinicName || "",
            clinicAddress: doctor.doctor_clinic_address || doctor.clinic_address || doctor.clinicAddress || "",
            consultationFee: doctor.doctor_consultation_fee || doctor.consultation_fee || doctor.consultationFee || "",
            languages: doctor.doctor_languages || doctor.languages || ["English", "Hindi", "Telugu"],
            gmapsLocation: doctor.doctor_gmaps_location || doctor.gmaps_location || "",
            medicalLicenseUrl: doctor.doctor_medical_license_url || doctor.medical_license_url || "",
            govIdUrl: doctor.doctor_gov_id_url || doctor.gov_id_url || "",
            description: doctor.doctor_description || doctor.description || "",
            quote: doctor.doctor_quote || doctor.quote || "",
            avatarUrl: doctor.doctor_profile_photo || doctor.avatar_url || doctor.avatarUrl || null,
            createdAt: doctor.created_at || doctor.createdAt || new Date().toISOString(),
            isActive: doctor.doctor_is_active ?? true,
            verificationStatus: doctor.doctor_verification_status || "Active",
            onboardingCompleted: doctor.onboarding_completed || false,
            preferredLanguage: doctor.preferred_language || doctor.preferredLanguage || "English",
        };
    }

    /**
     * Register a new Doctor
     */
    async register({ fullName, email, mobileNumber, dob, registrationNumber, password }) {
        const normalizedEmail = email.trim().toLowerCase();

        // 1. Check if email already exists
        if (isSupabaseConfigured && supabase) {
            const { data: existingDoctor, error: checkError } = await supabase
                .from("doctors")
                .select("doctor_id, doctor_email")
                .eq("doctor_email", normalizedEmail)
                .maybeSingle();

            if (checkError && checkError.code !== "PGRST116") {
                console.error("[AuthService] Supabase check error:", checkError);
            }

            if (existingDoctor) {
                throw new Error("An account with this email address already exists.");
            }

            // Register with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: normalizedEmail,
                password: password,
                options: {
                    data: {
                        full_name: fullName.trim(),
                    }
                }
            });

            if (authError || !authData.user) {
                console.error("[AuthService] Supabase signup error:", authError);
                throw new Error(`Registration failed: ${authError?.message || "Unknown error"}`);
            }

            // Insert into Supabase doctors table
            const { data: newDoctor, error: insertError } = await supabase
                .from("doctors")
                .insert([
                    {
                        user_id: authData.user.id,
                        doctor_name: fullName.trim(),
                        doctor_email: normalizedEmail,
                        doctor_mobile: mobileNumber?.trim() || "0000000000",
                        doctor_dob: dob || null,
                        doctor_registration_number: registrationNumber?.trim() || null,
                        doctor_specialization: "General Physician",
                        doctor_verification_status: "Pending",
                        doctor_is_active: true,
                        onboarding_completed: false
                    },
                ])
                .select()
                .single();

            if (insertError) {
                console.error("[AuthService] Supabase insert error:", insertError);
                throw new Error(`Database error: ${insertError.message}`);
            }

            try {
                // Ensure the user role is set to doctor if there is a shared 'users' table or auth metadata
                await supabase.from("users").update({ role: "doctor" }).eq("id", authData.user.id);
                await supabase.auth.admin.updateUserById(authData.user.id, { user_metadata: { role: "doctor" } });
            } catch (e) {
                console.error("[AuthService] Error setting user role:", e);
            }

            const token = this.generateToken(newDoctor);
            return {
                doctor: this.formatDoctorProfile(newDoctor),
                token,
            };
        } else {
            // Fallback to in-memory store
            const existing = inMemoryDoctors.find((d) => d.email.toLowerCase() === normalizedEmail);
            if (existing) {
                throw new Error("An account with this email address already exists.");
            }

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            const newDoctor = {
                id: `doc-${Date.now()}`,
                full_name: fullName.trim(),
                email: normalizedEmail,
                mobile_number: mobileNumber?.trim() || "",
                dob: dob || "",
                registration_number: registrationNumber?.trim() || "",
                password_hash: passwordHash,
                specialization: "General Physician",
                created_at: new Date().toISOString(),
                onboarding_completed: false,
            };

            inMemoryDoctors.push(newDoctor);

            const token = this.generateToken(newDoctor);
            return {
                doctor: this.formatDoctorProfile(newDoctor),
                token,
            };
        }
    }

    /**
     * Login Doctor
     */
    async login({ email, password }) {
        const normalizedEmail = email.trim().toLowerCase();

        if (isSupabaseConfigured && supabase) {
            // First, authenticate with Supabase Auth to verify the password
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: normalizedEmail,
                password: password,
            });

            if (authError || !authData.user) {
                console.error("[AuthService] Supabase login error:", authError);
                throw new Error("Invalid email or password.");
            }

            // If password is correct, fetch the doctor profile
            const { data: doctor, error: profileError } = await supabase
                .from("doctors")
                .select("*")
                .eq("doctor_email", normalizedEmail)
                .maybeSingle();

            if (profileError || !doctor) {
                throw new Error("Doctor profile not found.");
            }

            // Link user_id if it's missing (migration from old schema)
            if (!doctor.user_id) {
                await supabase.from("doctors").update({ user_id: authData.user.id }).eq("doctor_id", doctor.doctor_id);
                doctor.user_id = authData.user.id;
            }

            const token = this.generateToken(doctor);
            return {
                doctor: this.formatDoctorProfile(doctor),
                token,
            };
        } else {
            // In-memory fallback
            const doctor = inMemoryDoctors.find((d) => d.email.toLowerCase() === normalizedEmail);
            if (!doctor) {
                throw new Error("Invalid email or password.");
            }

            const isMatch = await bcrypt.compare(password, doctor.password_hash);
            if (!isMatch) {
                throw new Error("Invalid email or password.");
            }

            const token = this.generateToken(doctor);
            return {
                doctor: this.formatDoctorProfile(doctor),
                token,
            };
        }
    }

    /**
     * Find doctor by ID
     */
    async getDoctorById(id) {
        if (isSupabaseConfigured && supabase) {
            const { data: doctor, error } = await supabase
                .from("doctors")
                .select("*")
                .eq("doctor_id", id)
                .maybeSingle();

            if (error || !doctor) return null;
            return this.formatDoctorProfile(doctor);
        } else {
            const doctor = inMemoryDoctors.find((d) => String(d.id) === String(id));
            if (!doctor) return null;
            return this.formatDoctorProfile(doctor);
        }
    }

    /**
     * Generate Google OAuth Implicit Flow URL
     */
    generateGoogleOAuthUrl(frontendCallbackUrl) {
        if (!isSupabaseConfigured || !supabase) {
            throw new Error("Supabase is not configured. Cannot perform OAuth.");
        }
        
        // Supabase implicit flow OAuth URL format
        // We use the supabase project URL directly
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) throw new Error("Supabase URL is missing.");

        const authorizeUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(frontendCallbackUrl)}`;
        return authorizeUrl;
    }

    /**
     * Verify Google Access Token and Provision Doctor
     */
    async verifyGoogleToken(accessToken) {
        if (!isSupabaseConfigured || !supabase) {
            throw new Error("Supabase is not configured.");
        }

        // Validate the access token via Supabase
        const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

        if (userError || !user) {
            console.error("[AuthService] Google token validation failed:", userError);
            throw new Error("Invalid or expired Google authentication token.");
        }

        const normalizedEmail = user.email.toLowerCase();

        // Check if doctor exists
        let { data: existingDoctor, error: checkError } = await supabase
            .from("doctors")
            .select("*")
            .eq("doctor_email", normalizedEmail)
            .maybeSingle();

        if (checkError && checkError.code !== "PGRST116") {
            console.error("[AuthService] DB check error:", checkError);
            throw new Error(`Database error: ${checkError.message}`);
        }

        let doctorRecord = existingDoctor;

        // If not exists, provision the new doctor
        if (!doctorRecord) {
            const fullName = user.user_metadata?.full_name || "Dr. Unnamed";
            const avatarUrl = user.user_metadata?.avatar_url || null;

            const { data: newDoctor, error: insertError } = await supabase
                .from("doctors")
                .insert([
                    {
                        user_id: user.id, // Supabase Auth User ID
                        doctor_name: fullName,
                        doctor_email: normalizedEmail,
                        doctor_mobile: "0000000000", // Default required value
                        doctor_verification_status: "Pending",
                        doctor_is_active: true,
                        doctor_specialization: "General Physician",
                        doctor_profile_photo: avatarUrl,
                        onboarding_completed: false
                    }
                ])
                .select()
                .single();

            if (insertError) {
                console.error("[AuthService] Failed to provision doctor from Google:", insertError);
                throw new Error("Failed to create doctor account.");
            }

            doctorRecord = newDoctor;
        } else if (!doctorRecord.user_id) {
            // Link existing doctor to Supabase Auth User ID if missing
            await supabase.from("doctors").update({ user_id: user.id }).eq("doctor_id", doctorRecord.doctor_id);
            doctorRecord.user_id = user.id;
        }

        try {
            // Ensure the user role is set to doctor if there is a shared 'users' table or auth metadata
            await supabase.from("users").update({ role: "doctor" }).eq("id", user.id);
            await supabase.auth.admin.updateUserById(user.id, { user_metadata: { role: "doctor" } });
        } catch (e) {
            console.error("[AuthService] Error setting user role:", e);
        }

        // Issue our Custom JWT
        const token = this.generateToken(doctorRecord);

        return {
            doctor: this.formatDoctorProfile(doctorRecord),
            token,
        };
    }

    /**
     * Complete Onboarding
     */
    async completeOnboarding(doctorId, data) {
        if (isSupabaseConfigured && supabase) {
            const { data: updatedDoctor, error } = await supabase
                .from("doctors")
                .update({
                    doctor_name: (data.doctor_first_name && data.doctor_last_name) ? `${data.doctor_first_name} ${data.doctor_last_name}` : data.doctor_first_name || data.doctor_last_name || data.doctor_name || null,
                    doctor_first_name: data.doctor_first_name || (data.doctor_name ? data.doctor_name.split(' ')[0] : null),
                    doctor_last_name: data.doctor_last_name || (data.doctor_name && data.doctor_name.includes(' ') ? data.doctor_name.split(' ').slice(1).join(' ') : null),
                    doctor_email: data.doctor_email || null,
                    doctor_mobile: data.doctor_mobile || null,
                    doctor_registration_number: data.doctor_registration_number || null,
                    doctor_domain: data.doctor_domain || null,
                    doctor_specialization: data.doctor_specialization || null,
                    doctor_qualification: data.doctor_qualification || null,
                    doctor_experience: data.doctor_experience || null,
                    doctor_clinic_name: data.doctor_clinic_name || null,
                    doctor_clinic_address: data.doctor_clinic_address || null,
                    doctor_consultation_fee: data.doctor_consultation_fee ? Number(data.doctor_consultation_fee) : null,
                    doctor_languages: data.doctor_languages ? (typeof data.doctor_languages === 'string' ? data.doctor_languages.split(',').map(s => s.trim()).filter(Boolean) : data.doctor_languages) : [],
                    doctor_profile_photo: data.doctor_profile_photo || null,
                    doctor_gender: data.doctor_gender || null,
                    doctor_dob: data.doctor_dob || null,
                    doctor_gmaps_location: data.doctor_gmaps_location || null,
                    doctor_medical_license_url: data.doctor_medical_license_url || null,
                    doctor_gov_id_url: data.doctor_gov_id_url || null,
                    doctor_description: data.doctor_description || null,
                    doctor_quote: data.doctor_quote || null,
                    onboarding_completed: true,
                })
                .eq("doctor_id", doctorId)
                .select()
                .single();

            if (error) {
                console.error("[AuthService] Supabase update onboarding error:", error);
                throw new Error(`Database error: ${error.message}`);
            }

            return this.formatDoctorProfile(updatedDoctor);
        } else {
            // In-memory fallback
            const doctorIndex = inMemoryDoctors.findIndex((d) => String(d.id) === String(doctorId));
            if (doctorIndex === -1) throw new Error("Doctor not found");

            const doctor = inMemoryDoctors[doctorIndex];
            // Assign fields mapping
            doctor.full_name = data.doctor_name || doctor.full_name;
            doctor.email = data.doctor_email || doctor.email;
            doctor.mobile_number = data.doctor_mobile || doctor.mobile_number;
            doctor.registration_number = data.doctor_registration_number || doctor.registration_number;
            doctor.specialization = data.doctor_specialization || doctor.specialization;
            doctor.qualification = data.doctor_qualification;
            doctor.experience = data.doctor_experience;
            doctor.clinic_name = data.doctor_clinic_name;
            doctor.clinic_address = data.doctor_clinic_address;
            doctor.consultation_fee = data.doctor_consultation_fee;
            doctor.languages = data.doctor_languages;
            doctor.avatar_url = data.doctor_profile_photo;
            doctor.gender = data.doctor_gender;
            doctor.dob = data.doctor_dob || doctor.dob;
            doctor.gmaps_location = data.doctor_gmaps_location;
            doctor.medical_license_url = data.doctor_medical_license_url;
            doctor.gov_id_url = data.doctor_gov_id_url;
            doctor.description = data.doctor_description;
            doctor.quote = data.doctor_quote;
            doctor.onboarding_completed = true;

            inMemoryDoctors[doctorIndex] = doctor;
            return this.formatDoctorProfile(doctor);
        }
    }

    /**
     * Update Doctor Profile
     */
    async updateProfile(doctorId, data) {
        if (isSupabaseConfigured && supabase) {
            const updatePayload = {};
            if (data.fullName !== undefined) {
                updatePayload.doctor_name = data.fullName;
            }
            if (data.email !== undefined) {
                updatePayload.doctor_email = data.email;
            }
            if (data.mobileNumber !== undefined) {
                updatePayload.doctor_mobile = data.mobileNumber;
            }
            if (data.registrationNumber !== undefined) updatePayload.doctor_registration_number = data.registrationNumber;
            if (data.specialization !== undefined) updatePayload.doctor_specialization = data.specialization;
            if (data.qualification !== undefined) updatePayload.doctor_qualification = data.qualification;
            if (data.experience !== undefined) updatePayload.doctor_experience = data.experience;
            if (data.clinicName !== undefined) updatePayload.doctor_clinic_name = data.clinicName;
            if (data.clinicAddress !== undefined) updatePayload.doctor_clinic_address = data.clinicAddress;
            if (data.consultationFee !== undefined) updatePayload.doctor_consultation_fee = Number(data.consultationFee) || 0;
            if (data.languages !== undefined) updatePayload.doctor_languages = typeof data.languages === 'string' ? data.languages.split(',').map(s => s.trim()).filter(Boolean) : data.languages;
            if (data.dob !== undefined) updatePayload.doctor_dob = data.dob;
            if (data.gender !== undefined) updatePayload.doctor_gender = data.gender;
            if (data.nationality !== undefined) updatePayload.doctor_nationality = data.nationality;
            if (data.avatarUrl !== undefined) {
                updatePayload.doctor_profile_photo = data.avatarUrl;
            }
            if (data.description !== undefined) updatePayload.doctor_description = data.description;
            if (data.quote !== undefined) updatePayload.doctor_quote = data.quote;
            if (data.preferredLanguage !== undefined) updatePayload.preferred_language = data.preferredLanguage;

            const { data: updatedDoctor, error } = await supabase
                .from("doctors")
                .update(updatePayload)
                .or(`doctor_id.eq.${doctorId},id.eq.${doctorId}`)
                .select()
                .single();

            if (error) {
                console.error("[AuthService] Supabase update profile error:", error);
                throw new Error(`Database error: ${error.message}`);
            }

            return this.formatDoctorProfile(updatedDoctor);
        } else {
            const doctorIndex = inMemoryDoctors.findIndex((d) => String(d.id) === String(doctorId) || String(d.doctor_id) === String(doctorId));
            if (doctorIndex !== -1) {
                const doc = inMemoryDoctors[doctorIndex];
                Object.assign(doc, data);
                return this.formatDoctorProfile(doc);
            }
            throw new Error("Doctor not found");
        }
    }

    /**
     * Upload a file to Supabase Storage
     * @param {Buffer} fileBuffer - The file buffer from multer
     * @param {string} mimeType - The mime type of the file
     * @param {string} type - 'profile' or 'document' to determine the bucket
     * @param {string} filename - The generated unique filename
     * @returns {string} public URL of the uploaded file
     */
    async uploadToStorage(fileBuffer, mimeType, type, filename) {
        if (!isSupabaseConfigured) {
            // For in-memory, we can't really upload to Supabase, just return a dummy or base64
            console.warn("Supabase not configured, bypassing actual storage upload.");
            return `https://dummy-url.com/storage/${type}/${filename}`;
        }
        // Always use doctor-profile-photos bucket for all uploads to bypass RLS issues on doctor-documents
        const bucketName = "doctor-profile-photos";
        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(filename, fileBuffer, {
                contentType: mimeType,
                upsert: true,
            });

        if (error) {
            throw new Error(`Failed to upload to storage: ${error.message}`);
        }

        const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filename);

        return publicUrlData.publicUrl;
    }
}

module.exports = new AuthService();
