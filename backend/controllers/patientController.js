const { supabase } = require("../config/supabase");
const crypto = require("crypto");

class PatientController {
    /**
     * Generate a unique Patient Code like DV-P-000009
     */
    async generatePatientCode() {
        try {
            // Find the highest existing patient code
            const { data, error } = await supabase
                .from("patients")
                .select("patient_code")
                .ilike("patient_code", "DV-P-%")
                .order("created_at", { ascending: false })
                .limit(1);

            if (error) {
                console.warn("[PatientController] Could not fetch latest patient code:", error.message);
            }

            let nextNumber = 1;
            if (data && data.length > 0 && data[0].patient_code) {
                const parts = data[0].patient_code.split("DV-P-");
                if (parts.length === 2) {
                    const lastNumber = parseInt(parts[1], 10);
                    if (!isNaN(lastNumber)) {
                        nextNumber = lastNumber + 1;
                    }
                }
            }

            // Fallback to random if something goes wrong to avoid collisions
            if (nextNumber === 1 && (!data || data.length === 0)) {
                // First patient ever
            } else if (nextNumber === 1) {
                nextNumber = Math.floor(Math.random() * 900000) + 100000;
            }

            return `DV-P-${String(nextNumber).padStart(6, "0")}`;
        } catch (error) {
            console.error("[PatientController] Error generating patient code:", error);
            // Fallback unique ID
            return `DV-P-${crypto.randomInt(100000, 999999)}`;
        }
    }

    /**
     * Search patients
     */
    async searchPatients(req, res) {
        try {
            const { q } = req.query;
            const doctorId = req.doctor.id;

            if (!doctorId) {
                console.error("[PatientController] Search error: doctorId is undefined on req.doctor", req.doctor);
                return res.status(500).json({ success: false, message: "Server error: doctor context invalid" });
            }

            const { data: docApps, error: docAppsErr } = await supabase
                .from("appointments")
                .select("patient_id")
                .eq("doctor_id", doctorId);
                
            if (docAppsErr) {
                console.error("[PatientController] Error fetching docApps:", docAppsErr);
                throw new Error(docAppsErr.message);
            }

            const docPatientIds = [...new Set((docApps || []).map(a => a.patient_id).filter(Boolean))];

            if (docPatientIds.length === 0) {
                 return res.json({ success: true, patients: [] });
            }
            
            let query = supabase.from("patients").select("*").in("user_id", docPatientIds);

            if (q) {
                const searchStr = `%${q}%`;
                query = query.or(`first_name.ilike.${searchStr},last_name.ilike.${searchStr},full_name.ilike.${searchStr},email.ilike.${searchStr},patient_code.ilike.${searchStr}`);
            }

            // Limit results to 20 for fast searching
            query = query.limit(20);

            const { data: patients, error } = await query;

            if (error) throw new Error(error.message);

            // Enhance with last visit and total visits if possible
            const patientUserIds = patients.map(p => p.user_id).filter(Boolean);
            let appointmentsData = [];
            
            if (patientUserIds.length > 0) {
                const { data: apps, error: appErr } = await supabase
                    .from("appointments")
                    .select("patient_id, appointment_date, status")
                    .in("patient_id", patientUserIds)
                    .eq("doctor_id", doctorId)
                    .order("appointment_date", { ascending: false });
                    
                if (!appErr && apps) {
                    appointmentsData = apps;
                }
            }

            const formattedPatients = patients.map(p => {
                const patientApps = appointmentsData.filter(a => a.patient_id === p.user_id);
                const totalVisits = patientApps.length;
                const completedVisits = patientApps.filter(a => a.status === 'completed');
                
                const lastVisit = completedVisits.length > 0 ? completedVisits[0].appointment_date : null;
                
                const now = new Date().toISOString().split("T")[0];
                const futureVisits = patientApps.filter(a => a.status === 'confirmed' && a.appointment_date >= now).sort((a, b) => {
                    if (!a.appointment_date) return 1;
                    if (!b.appointment_date) return -1;
                    return a.appointment_date.localeCompare(b.appointment_date);
                });
                const nextFollowUp = futureVisits.length > 0 ? futureVisits[0].appointment_date : null;

                let age = null;
                if (p.date_of_birth) {
                    const dob = new Date(p.date_of_birth);
                    const diffMs = Date.now() - dob.getTime();
                    age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                }

                return {
                    id: p.id,
                    userId: p.user_id,
                    patientCode: p.patient_code,
                    fullName: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown",
                    age: age,
                    dob: p.date_of_birth,
                    gender: p.gender,
                    bloodGroup: p.blood_group,
                    mobile: p.phone_number,
                    email: p.email,
                    address: p.address,
                    profilePhoto: p.profile_photo,
                    lastVisit: lastVisit,
                    nextFollowUp: nextFollowUp,
                    totalVisits: totalVisits
                };
            });

            return res.json({ success: true, patients: formattedPatients });
        } catch (error) {
            console.error("[PatientController] Search error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get single patient full history
     */
    async getPatientHistory(req, res) {
        try {
            const { patientId } = req.params;
            const doctorId = req.doctor.id;

            const { data: patient, error: patientErr } = await supabase
                .from("patients")
                .select("*")
                .eq("user_id", patientId)
                .single();

            if (patientErr) throw new Error(patientErr.message);

            let age = null;
            if (patient.date_of_birth) {
                const dob = new Date(patient.date_of_birth);
                const diffMs = Date.now() - dob.getTime();
                age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
            }

            const formattedPatient = {
                id: patient.id,
                userId: patient.user_id,
                patientCode: patient.patient_code,
                fullName: patient.full_name || `${patient.first_name || ""} ${patient.last_name || ""}`.trim(),
                age: age,
                dob: patient.date_of_birth,
                gender: patient.gender,
                bloodGroup: patient.blood_group,
                mobile: patient.phone_number,
                email: patient.email,
                address: patient.address,
                profilePhoto: patient.profile_photo
            };

            const { data: appointments, error: appErr } = await supabase
                .from("appointments")
                .select("*")
                .eq("patient_id", patientId)
                .eq("doctor_id", doctorId)
                .eq("status", "completed")
                .order("appointment_date", { ascending: false })
                .order("appointment_time", { ascending: false });

            if (appErr) throw new Error(appErr.message);

            const { data: notes, error: notesErr } = await supabase
                .from("consultation_notes")
                .select("*")
                .eq("patient_id", patientId)
                .eq("doctor_id", doctorId);
                
            if (notesErr) console.warn("[PatientController] Could not fetch notes:", notesErr.message);

            const formattedVisits = (appointments || []).map(app => {
                const note = (notes || []).find(n => n.appointment_id === app.id) || {};
                
                return {
                    appointmentId: app.id,
                    date: app.appointment_date,
                    time: app.appointment_time,
                    type: app.appointment_type || "Consultation",
                    status: app.status,
                    fee: req.doctor?.consultationFee || "500",
                    paymentStatus: app.payment_status || "pending",
                    reason: app.reason || "",
                    chiefComplaint: note.symptoms || app.notes || "",
                    diagnosis: note.diagnosis || "",
                    notes: note.notes || "",
                    doctorId: app.doctor_id
                };
            });

            return res.json({ 
                success: true, 
                patient: formattedPatient,
                visits: formattedVisits
            });

        } catch (error) {
            console.error("[PatientController] Get History error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create Walk-in Patient
     */
    async createWalkInPatient(req, res) {
        try {
            const { fullName, mobile, dob, gender, bloodGroup, address } = req.body;

            if (!fullName || !mobile) {
                return res.status(400).json({ success: false, message: "Name and Mobile are required" });
            }

            const patientCode = await this.generatePatientCode();
            const uniqueStamp = Date.now().toString().slice(-4);
            const email = `${patientCode.toLowerCase()}-${uniqueStamp}@doctorsvedika.com`;

            // Create user in auth.users first using admin API
            let userId = null;
            const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
                email: email,
                password: crypto.randomBytes(8).toString('hex'), // Secure random password
                email_confirm: true
            });

            if (authErr) {
                console.warn("[PatientController] Auth Admin insert warning:", authErr.message);
                // Fallback to searching existing user if already exists
                const { data: existingUser } = await supabase
                    .from("users")
                    .select("id")
                    .eq("email", email)
                    .maybeSingle();

                if (existingUser) {
                    userId = existingUser.id;
                } else {
                    throw new Error("Failed to create auth user: " + authErr.message);
                }
            } else {
                userId = authData.user.id;
            }

            const { error: userErr } = await supabase
                .from("users")
                .insert([{ id: userId, email: email, role: "patient" }]);
                
            if (userErr && userErr.code !== '23505') {
                 console.warn("[PatientController] User insert warning:", userErr.message);
            }

            const newPatientData = {
                user_id: userId,
                patient_code: patientCode,
                full_name: fullName,
                first_name: fullName.split(" ")[0],
                last_name: fullName.split(" ").slice(1).join(" ") || "",
                date_of_birth: dob || null,
                gender: gender ? gender.toLowerCase() : null,
                blood_group: bloodGroup || null,
                address: address || null,
            };

            const { data, error } = await supabase
                .from("patients")
                .insert([newPatientData])
                .select()
                .single();

            if (error) {
                throw new Error(error.message);
            }

            return res.status(201).json({
                success: true,
                patient: {
                    userId: data.user_id,
                    patientCode: data.patient_code,
                    fullName: data.full_name
                }
            });

        } catch (error) {
            console.error("[PatientController] Create Walk-in error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create Walk-in Visit
     */
    async createWalkInVisit(req, res) {
        try {
            const { patientId } = req.params;
            const { fee, paymentStatus, reason } = req.body;
            const doctorId = req.doctor.id;

            const { data: patient } = await supabase
                .from("patients")
                .select("*")
                .eq("user_id", patientId)
                .single();

            const now = new Date();
            const dateStr = now.toISOString().split("T")[0];
            const timeStr = now.toLocaleTimeString("en-IN", { hour12: false });

            const newAppointment = {
                doctor_id: doctorId,
                patient_id: patientId,
                appointment_date: dateStr,
                appointment_time: timeStr,
                status: "confirmed",
                payment_status: paymentStatus || "paid",
                payment_method: "pay_at_clinic",
                reason: reason || "Walk-in Consultation"
            };

            const { data, error } = await supabase
                .from("appointments")
                .insert([newAppointment])
                .select()
                .single();

            if (error) {
                throw new Error(error.message);
            }

            return res.status(201).json({
                success: true,
                appointment: data,
                message: "Walk-in visit created successfully"
            });

        } catch (error) {
            console.error("[PatientController] Create Walk-in Visit error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new PatientController();
