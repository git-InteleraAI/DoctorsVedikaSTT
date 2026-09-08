const { supabase, supabaseAdmin } = require("../config/supabase");
const db = supabaseAdmin || supabase;
const crypto = require("crypto");

// In-memory fallback maps for walk-in patients created without auth accounts
const inMemoryPatients = new Map();
const inMemoryVisits = new Map();

class PatientController {
    /**
     * Helper to extract doctor identifiers
     */
    _getDoctorIds(reqDoctor) {
        if (!reqDoctor) return [];
        return [...new Set([
            reqDoctor.id,
            reqDoctor.doctor_id,
            reqDoctor.userId,
            reqDoctor.user_id,
            reqDoctor.doctorId
        ].filter(Boolean))];
    }

    /**
     * Generate a unique Patient Code like DV-P-000009
     */
    async generatePatientCode() {
        try {
            const { data } = await db
                .from("patients")
                .select("patient_code");

            let maxNum = 0;
            if (data && data.length > 0) {
                data.forEach(p => {
                    if (p.patient_code && p.patient_code.includes("DV-P-")) {
                        const parts = p.patient_code.split("DV-P-");
                        if (parts[1]) {
                            const num = parseInt(parts[1], 10);
                            if (!isNaN(num) && num > maxNum) {
                                maxNum = num;
                            }
                        }
                    }
                });
            }
            const nextNumber = maxNum + 1;
            return `DV-P-${String(nextNumber).padStart(6, "0")}`;
        } catch (error) {
            console.error("[PatientController] Error generating patient code:", error);
            return `DV-P-${crypto.randomInt(100000, 999999)}`;
        }
    }

    /**
     * Search patients (Only returns patients with completed consultations / visits for logged-in doctor)
     */
    async searchPatients(req, res) {
        try {
            const { q } = req.query;
            const doctorIds = this._getDoctorIds(req.doctor);

            let allowedPatientIds = [];
            let docApps = [];
            let docNotes = [];

            if (db && doctorIds.length > 0) {
                const { data: appsData } = await db
                    .from("appointments")
                    .select("patient_id, appointment_date, status, doctor_id")
                    .in("doctor_id", doctorIds)
                    .ilike("status", "completed");

                const { data: notesData } = await db
                    .from("consultation_notes")
                    .select("patient_id, doctor_id, created_at, appointment_id")
                    .in("doctor_id", doctorIds);

                docApps = appsData || [];
                docNotes = notesData || [];

                allowedPatientIds = [...new Set([
                    ...docApps.map(a => a.patient_id),
                    ...docNotes.map(n => n.patient_id),
                ].filter(Boolean))];
            }

            if (allowedPatientIds.length === 0) {
                return res.json({ success: true, patients: [] });
            }

            let query = db.from("patients").select("*");
            const quotedIds = allowedPatientIds.map(id => `"${id}"`).join(",");
            query = query.or(`user_id.in.(${quotedIds}),id.in.(${quotedIds}),patient_code.in.(${quotedIds})`);

            if (q && String(q).trim()) {
                const searchStr = `%${q.trim()}%`;
                query = query.or(`first_name.ilike.${searchStr},last_name.ilike.${searchStr},full_name.ilike.${searchStr},email.ilike.${searchStr},patient_code.ilike.${searchStr}`);
            }

            query = query.order("created_at", { ascending: false }).limit(50);
            const { data: patients, error } = await query;
            if (error) throw new Error(error.message);

            // Fetch real phone and email from users table
            const userIds = [...new Set((patients || []).map(p => p.user_id).filter(Boolean))];
            let usersMap = {};
            if (db && userIds.length > 0) {
                const { data: usersData } = await db
                    .from("users")
                    .select("id, phone, email")
                    .in("id", userIds);
                if (usersData) {
                    usersData.forEach(u => {
                        usersMap[u.id] = u;
                    });
                }
            }

            const formattedPatients = (patients || []).map(p => {
                const pIdKeys = [p.user_id, p.id, p.patient_code].filter(Boolean);
                const patientApps = docApps.filter(a => pIdKeys.includes(a.patient_id));
                const patientNotes = docNotes.filter(n => pIdKeys.includes(n.patient_id));

                const totalVisits = Math.max(patientApps.length, patientNotes.length, 1);
                const dates = [
                    ...patientApps.map(a => a.appointment_date),
                    ...patientNotes.map(n => n.created_at ? n.created_at.split("T")[0] : null)
                ].filter(Boolean).sort().reverse();

                const lastVisit = dates[0] || new Date().toISOString().split("T")[0];

                let age = null;
                if (p.date_of_birth) {
                    const dob = new Date(p.date_of_birth);
                    const diffMs = Date.now() - dob.getTime();
                    age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                }

                const matchedUser = usersMap[p.user_id] || {};
                const realPhone = p.phone || matchedUser.phone || "";

                let realEmail = p.email || matchedUser.email || "";
                if (realEmail && (realEmail.includes("@doctorsvedika.com") || realEmail.startsWith("dv-p-"))) {
                    realEmail = "";
                }

                return {
                    id: p.id,
                    userId: p.user_id || p.id,
                    patientCode: p.patient_code || "",
                    fullName: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Patient",
                    age: age || p.age || null,
                    gender: p.gender || "Unknown",
                    mobile: realPhone,
                    email: realEmail,
                    totalVisits: totalVisits,
                    lastVisit: lastVisit,
                    profilePhoto: p.profile_photo || null
                };
            });

            return res.json({ success: true, patients: formattedPatients });
        } catch (error) {
            console.error("[PatientController] Search Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get patient profile and medical visit history
     */
    async getPatientHistory(req, res) {
        try {
            const { patientId } = req.params;
            const doctorIds = this._getDoctorIds(req.doctor);

            const isUuid = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
            let patient = null;
            if (db) {
                if (isUuid(patientId)) {
                    const { data } = await db
                        .from("patients")
                        .select("*")
                        .or(`user_id.eq.${patientId},id.eq.${patientId}`)
                        .maybeSingle();
                    patient = data;
                } else {
                    const { data } = await db
                        .from("patients")
                        .select("*")
                        .eq("patient_code", patientId)
                        .maybeSingle();
                    patient = data;
                }
            }

            if (!patient) {
                return res.status(404).json({ success: false, error: "Patient not found" });
            }

            const pUserId = patient.user_id || patient.id;
            const matchedUuidList = [...new Set([patientId, pUserId, patient.id].filter(Boolean))].filter(isUuid);
            const validDoctorUuids = doctorIds.filter(isUuid);

            let age = null;
            if (patient.date_of_birth) {
                const dob = new Date(patient.date_of_birth);
                const diffMs = Date.now() - dob.getTime();
                age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
            }

            // Fetch user table details for real phone & email
            let userData = null;
            if (db && pUserId) {
                const { data: uRes } = await db
                    .from("users")
                    .select("phone, email")
                    .eq("id", pUserId)
                    .maybeSingle();
                userData = uRes;
            }

            const realPhone = patient.phone || userData?.phone || "";
            let realEmail = patient.email || userData?.email || "";
            if (realEmail && (realEmail.includes("@doctorsvedika.com") || realEmail.startsWith("dv-p-"))) {
                realEmail = "";
            }

            const formattedPatient = {
                id: patient.id,
                userId: pUserId,
                patientCode: patient.patient_code || "",
                fullName: patient.full_name || `${patient.first_name || ""} ${patient.last_name || ""}`.trim(),
                age: age,
                dob: patient.date_of_birth,
                gender: patient.gender,
                bloodGroup: patient.blood_group,
                mobile: realPhone,
                email: realEmail,
                address: patient.address,
                profilePhoto: patient.profile_photo
            };

            let appointments = [];
            if (db && matchedUuidList.length > 0) {
                let appQuery = db
                    .from("appointments")
                    .select("*")
                    .in("patient_id", matchedUuidList);
                if (validDoctorUuids.length > 0) {
                    appQuery = appQuery.in("doctor_id", validDoctorUuids);
                }
                const { data: appData } = await appQuery.order("appointment_date", { ascending: false });
                if (appData) appointments = appData;
            }

            let notes = [];
            if (db && matchedUuidList.length > 0) {
                let noteQuery = db
                    .from("consultation_notes")
                    .select("*")
                    .in("patient_id", matchedUuidList);
                if (validDoctorUuids.length > 0) {
                    noteQuery = noteQuery.in("doctor_id", validDoctorUuids);
                }
                const { data: noteData } = await noteQuery;
                if (noteData) notes = noteData;
            }

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
                    chiefComplaint: note.symptoms || app.reason || "",
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
     * Lookup existing patient by phone number or email globally
     */
    async lookupPatient(req, res) {
        try {
            const queryVal = (req.query.q || req.query.phone || req.query.email || "").trim();
            if (!queryVal) {
                return res.json({ success: true, found: false });
            }

            const cleanPhone = queryVal.replace(/\D/g, "");
            const isEmail = queryVal.includes("@");

            // 1. Search in-memory patients
            for (const [id, p] of inMemoryPatients.entries()) {
                if ((cleanPhone && p.mobile && p.mobile.replace(/\D/g, "").includes(cleanPhone)) ||
                    (isEmail && p.email && p.email.toLowerCase() === queryVal.toLowerCase()) ||
                    (p.patientCode && p.patientCode.toLowerCase() === queryVal.toLowerCase())) {
                    return res.json({ success: true, found: true, patient: p });
                }
            }

            // 2. Search database patients
            if (db) {
                const searchTerms = [];

                if (cleanPhone.length >= 6) {
                    searchTerms.push(`phone.ilike.%${cleanPhone}%`);
                }
                if (isEmail) {
                    searchTerms.push(`email.ilike.%${queryVal}%`);
                }
                searchTerms.push(`patient_code.ilike.%${queryVal}%`);
                searchTerms.push(`full_name.ilike.%${queryVal}%`);

                // Also search users table by phone or email to resolve user_id
                try {
                    const uFilters = [];
                    if (cleanPhone.length >= 6) uFilters.push(`phone.ilike.%${cleanPhone}%`);
                    if (isEmail) uFilters.push(`email.ilike.%${queryVal}%`);
                    if (uFilters.length > 0) {
                        const { data: matchedUsers } = await db.from("users").select("id").or(uFilters.join(","));
                        if (matchedUsers && matchedUsers.length > 0) {
                            const uIds = matchedUsers.map(u => u.id).filter(Boolean);
                            if (uIds.length > 0) {
                                searchTerms.push(`user_id.in.(${uIds.map(id => `"${id}"`).join(",")})`);
                            }
                        }
                    }
                } catch (uErr) {
                    console.warn("[PatientController] Users lookup warning:", uErr.message);
                }

                let query = db.from("patients").select("*");
                if (searchTerms.length > 0) {
                    query = query.or(searchTerms.join(","));
                }

                const { data: matchedPatients } = await query.limit(1);

                if (matchedPatients && matchedPatients.length > 0) {
                    const p = matchedPatients[0];

                    let age = null;
                    if (p.date_of_birth) {
                        const dob = new Date(p.date_of_birth);
                        const diffMs = Date.now() - dob.getTime();
                        age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                    }

                    let realPhone = p.phone || "";
                    let realEmail = p.email || "";

                    if ((!realPhone || !realEmail) && p.user_id) {
                        const { data: uData } = await db.from("users").select("phone, email").eq("id", p.user_id).maybeSingle();
                        if (uData) {
                            if (!realPhone) realPhone = uData.phone || "";
                            if (!realEmail) realEmail = uData.email || "";
                        }
                    }

                    if (realEmail && (realEmail.includes("@doctorsvedika.com") || realEmail.startsWith("dv-p-"))) {
                        realEmail = "";
                    }

                    const formattedPatient = {
                        id: p.id,
                        userId: p.user_id || p.id,
                        patientCode: p.patient_code || "",
                        fullName: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Patient",
                        age: age || p.age || null,
                        gender: p.gender || "Unknown",
                        mobile: realPhone,
                        email: realEmail,
                        address: p.address || "",
                        bloodGroup: p.blood_group || ""
                    };

                    return res.json({ success: true, found: true, patient: formattedPatient });
                }
            }

            return res.json({ success: true, found: false });
        } catch (error) {
            console.error("[PatientController] Lookup Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create Walk-in Patient
     */
    async createWalkInPatient(req, res) {
        try {
            const { fullName, mobile, dob, gender, bloodGroup, address, email: inputEmail } = req.body;

            if (!fullName || !mobile) {
                return res.status(400).json({ success: false, message: "Name and Mobile are required" });
            }

            const cleanPhone = String(mobile).trim();
            const realEmail = inputEmail && inputEmail.trim() ? inputEmail.trim() : null;

            // 1. Backend Duplicate Prevention Check: Search if patient already exists by phone or email
            let existingPatient = null;

            for (const [id, p] of inMemoryPatients.entries()) {
                if ((cleanPhone && p.mobile && p.mobile.replace(/\D/g, "") === cleanPhone.replace(/\D/g, "")) ||
                    (realEmail && p.email && p.email.toLowerCase() === realEmail.toLowerCase())) {
                    existingPatient = p;
                    break;
                }
            }

            if (!existingPatient && db) {
                const searchFilters = [];
                if (cleanPhone) searchFilters.push(`phone.eq.${cleanPhone}`);
                if (realEmail) searchFilters.push(`email.eq.${realEmail}`);

                if (searchFilters.length > 0) {
                    const { data: dbMatch } = await db
                        .from("patients")
                        .select("*")
                        .or(searchFilters.join(","))
                        .limit(1);

                    if (dbMatch && dbMatch.length > 0) {
                        const p = dbMatch[0];
                        let age = null;
                        if (p.date_of_birth) {
                            const dobDate = new Date(p.date_of_birth);
                            const diffMs = Date.now() - dobDate.getTime();
                            age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                        }
                        existingPatient = {
                            id: p.id,
                            userId: p.user_id || p.id,
                            patientCode: p.patient_code || "",
                            fullName: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Patient",
                            mobile: p.phone || cleanPhone,
                            email: p.email || realEmail || "",
                            gender: p.gender,
                            bloodGroup: p.blood_group,
                            dob: p.date_of_birth,
                            age: age,
                            address: p.address
                        };
                    }
                }
            }

            // If patient exists, reuse existing Patient ID without creating duplicates
            if (existingPatient) {
                return res.status(200).json({
                    success: true,
                    existing: true,
                    patient: existingPatient,
                    message: "Existing patient reused"
                });
            }

            // 2. Create New Walk-in Patient with permanent Supabase DB persistence
            const patientCode = await this.generatePatientCode();

            // Normalize gender to valid PostgreSQL enum gender_type ('male', 'female', 'other')
            let normalizedGender = null;
            if (gender) {
                const gLower = String(gender).trim().toLowerCase();
                if (gLower === "male" || gLower === "m") normalizedGender = "male";
                else if (gLower === "female" || gLower === "f") normalizedGender = "female";
                else if (gLower === "other" || gLower === "o") normalizedGender = "other";
            }

            const timestamp = Date.now();
            const dummyEmail = realEmail || `walkin_${timestamp}@doctorsvedika.com`;
            const dummyPassword = `Walkin_${timestamp}_${Math.floor(1000 + Math.random()*9000)}!`;

            let finalUserId = null;

            if (db) {
                try {
                    // Step 1: Create silent Auth user in Supabase auth.users
                    let authUserId = null;
                    if (supabaseAdmin && supabaseAdmin.auth && supabaseAdmin.auth.admin) {
                        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
                            email: dummyEmail,
                            password: dummyPassword,
                            phone: cleanPhone ? cleanPhone : undefined,
                            email_confirm: true,
                            user_metadata: { role: "patient", full_name: fullName }
                        });
                        if (authData && authData.user) {
                            authUserId = authData.user.id;
                        } else if (authErr) {
                            console.warn("[PatientController] Silent Auth createUser warning:", authErr.message);
                        }
                    }

                    finalUserId = authUserId || (crypto.randomUUID ? crypto.randomUUID() : `pat_${timestamp}`);

                    // Step 2: Insert into public.users
                    const { error: uErr } = await db
                        .from("users")
                        .upsert([{
                            id: finalUserId,
                            email: dummyEmail,
                            phone: cleanPhone,
                            full_name: fullName,
                            first_name: fullName.split(" ")[0],
                            last_name: fullName.split(" ").slice(1).join(" ") || "",
                            role: "patient",
                            status: "active"
                        }], { onConflict: "id" });

                    if (uErr) {
                        console.warn("[PatientController] public.users insert warning:", uErr.message);
                    }

                    // Step 3: Insert into public.patients
                    const newPatientData = {
                        id: finalUserId,
                        user_id: finalUserId,
                        patient_code: patientCode,
                        full_name: fullName,
                        first_name: fullName.split(" ")[0],
                        last_name: fullName.split(" ").slice(1).join(" ") || "",
                        phone: cleanPhone,
                        email: realEmail || null,
                        date_of_birth: dob || null,
                        gender: normalizedGender,
                        blood_group: bloodGroup || null,
                        address: address || null,
                    };

                    const { data: pData, error: pErr } = await db
                        .from("patients")
                        .insert([newPatientData])
                        .select()
                        .single();

                    if (!pErr && pData) {
                        console.log("[PatientController] Walk-in Patient PERMANENTLY SAVED IN SUPABASE! ID:", pData.id, "Code:", pData.patient_code);
                    } else if (pErr) {
                        console.warn("[PatientController] public.patients insert warning:", pErr.message);
                    }
                } catch (dbErr) {
                    console.warn("[PatientController] DB Walk-in save exception:", dbErr.message);
                }
            }

            if (!finalUserId) {
                finalUserId = crypto.randomUUID ? crypto.randomUUID() : `pat_${timestamp}`;
            }

            const newPatientObj = {
                id: finalUserId,
                userId: finalUserId,
                patientCode: patientCode,
                fullName: fullName,
                mobile: cleanPhone,
                email: realEmail || "",
                gender: normalizedGender || "male",
                bloodGroup: bloodGroup || null,
                dob: dob || null,
                address: address || null
            };

            // Save in memory fallback store as well
            inMemoryPatients.set(newPatientObj.id, newPatientObj);
            inMemoryPatients.set(newPatientObj.patientCode, newPatientObj);
            inMemoryPatients.set(newPatientObj.patientCode, newPatientObj);

            return res.status(201).json({
                success: true,
                existing: false,
                patient: newPatientObj
            });

        } catch (error) {
            console.error("[PatientController] Create Walk-in error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Update Patient Record (email, phone, address, etc.)
     */
    async updatePatientRecord(req, res) {
        try {
            const { patientId } = req.params;
            const { email, mobile, address, bloodGroup, gender, dob, fullName } = req.body;

            let patient = null;
            if (db) {
                const { data } = await db
                    .from("patients")
                    .select("*")
                    .or(`user_id.eq."${patientId}",id.eq."${patientId}",patient_code.eq."${patientId}"`)
                    .maybeSingle();
                patient = data;
            }

            if (!patient) {
                patient = inMemoryPatients.get(patientId);
            }

            if (!patient) {
                return res.status(404).json({ success: false, error: "Patient not found" });
            }

            const pUserId = patient.user_id || patient.id;
            const updates = {};
            if (email !== undefined) updates.email = email ? email.trim() : null;
            if (mobile !== undefined) updates.phone = mobile ? mobile.trim() : null;
            if (address !== undefined) updates.address = address;
            if (bloodGroup !== undefined) updates.blood_group = bloodGroup;
            if (gender !== undefined) updates.gender = gender ? gender.toLowerCase() : null;
            if (dob !== undefined) updates.date_of_birth = dob;
            if (fullName !== undefined) {
                updates.full_name = fullName;
                updates.first_name = fullName.split(" ")[0];
                updates.last_name = fullName.split(" ").slice(1).join(" ") || "";
            }

            updates.updated_at = new Date().toISOString();

            if (db) {
                const { data: updatedPat } = await db
                    .from("patients")
                    .update(updates)
                    .or(`user_id.eq."${pUserId}",id.eq."${patient.id}"`)
                    .select()
                    .single()
                    .catch(() => ({ data: null }));

                if (updatedPat) patient = updatedPat;
            }

            return res.json({
                success: true,
                message: "Patient details updated successfully",
                patient: patient
            });
        } catch (error) {
            console.error("[PatientController] Update Patient error:", error);
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
            const doctorIds = this._getDoctorIds(req.doctor);
            const doctorId = doctorIds[0] || req.doctor.id;

            const now = new Date();
            const dateStr = now.toISOString().split("T")[0];
            const timeStr = now.toLocaleTimeString("en-IN", { hour12: false });
            const visitKey = `${doctorId}_${patientId}_${dateStr}`;

            // Prevent duplicate visits on the same day from repeated clicks
            if (inMemoryVisits.has(visitKey)) {
                return res.status(200).json({
                    success: true,
                    appointment: inMemoryVisits.get(visitKey),
                    message: "Existing walk-in visit reused for today"
                });
            }

            if (db) {
                const { data: existingApp } = await db
                    .from("appointments")
                    .select("*")
                    .eq("doctor_id", doctorId)
                    .eq("patient_id", patientId)
                    .eq("appointment_date", dateStr)
                    .maybeSingle();

                if (existingApp) {
                    inMemoryVisits.set(visitKey, existingApp);
                    return res.status(200).json({
                        success: true,
                        appointment: existingApp,
                        message: "Existing walk-in visit reused for today"
                    });
                }
            }

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

            let appData = null;
            if (db) {
                const { data, error } = await db
                    .from("appointments")
                    .insert([newAppointment])
                    .select()
                    .single();

                if (!error && data) {
                    appData = data;
                } else if (error) {
                    console.warn("[PatientController] Visit DB Insert warning:", error.message);
                }
            }

            if (!appData) {
                appData = {
                    id: `app_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                    ...newAppointment,
                    created_at: new Date().toISOString()
                };
            }

            inMemoryVisits.set(visitKey, appData);

            return res.status(201).json({
                success: true,
                appointment: appData,
                message: "Walk-in visit created successfully"
            });
        } catch (error) {
            console.error("[PatientController] Create Walk-in Visit error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete a single visit/appointment record
     */
    async deleteVisitRecord(req, res) {
        try {
            const { patientId, appointmentId } = req.params;
            const path = require("path");
            const fs = require("fs");

            if (db) {
                await db.from("consultation_notes").delete().eq("appointment_id", appointmentId);
                await db.from("prescriptions").delete().eq("appointment_id", appointmentId);
                await db.from("appointments").delete().eq("id", appointmentId);
            }

            return res.json({ success: true, message: "Appointment record deleted successfully" });
        } catch (error) {
            console.error("[PatientController] Delete Visit error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete entire patient and all respective records
     */
    async deletePatientRecord(req, res) {
        try {
            const { patientId } = req.params;

            if (db) {
                const { data: pData } = await db.from("patients").select("id, user_id, patient_code").or(`user_id.eq."${patientId}",id.eq."${patientId}",patient_code.eq."${patientId}"`).maybeSingle();
                const matchedIds = [...new Set([patientId, pData?.id, pData?.user_id, pData?.patient_code].filter(Boolean))];

                const quotedIds = matchedIds.map(i => `"${i}"`).join(",");
                await db.from("consultation_notes").delete().or(`patient_id.in.(${quotedIds})`);
                await db.from("prescriptions").delete().or(`patient_id.in.(${quotedIds})`);
                await db.from("appointments").delete().or(`patient_id.in.(${quotedIds})`);
                await db.from("patients").delete().or(`user_id.in.(${quotedIds}),id.in.(${quotedIds}),patient_code.in.(${quotedIds})`);
            }

            return res.json({ success: true, message: "Patient and all respective records deleted successfully" });
        } catch (error) {
            console.error("[PatientController] Delete Patient error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new PatientController();
