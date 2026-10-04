const { supabase, supabaseAdmin } = require("../config/supabase");
const db = supabaseAdmin || supabase;
const { encryptPayload, decryptRecord } = require("../services/encryptionService");

// Shared in-memory appointments store for fallback conflict checking
const inMemoryAppointments = [];

class AppointmentController {
    static getInMemoryAppointments() {
        return inMemoryAppointments;
    }

    /**
     * Helper to extract all doctor identifier keys
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
     * Get appointments for the logged-in doctor
     * Supports filtering by tab and date
     */
    async getAppointments(req, res) {
        try {
            const doctorIds = this._getDoctorIds(req.doctor);
            const { tab = "confirmed", dateFilter = "all", customDate } = req.query;
            const todayDateStr = new Date().toISOString().split("T")[0];

            // 1. Fetch all appointments for doctor matching any doctor identifier
            let appointmentsDataRaw = [];
            if (db && doctorIds.length > 0) {
                const { data, error: appointmentsError } = await db
                    .from("appointments")
                    .select("*")
                    .in("doctor_id", doctorIds);

                if (appointmentsError) {
                    console.error("[AppointmentController] Fetch error:", appointmentsError.message);
                } else if (data) {
                    appointmentsDataRaw = data;
                }
            }

            // Fallback to in-memory if DB yields nothing
            if (appointmentsDataRaw.length === 0 && inMemoryAppointments.length > 0) {
                appointmentsDataRaw = inMemoryAppointments.filter(a => doctorIds.includes(a.doctor_id));
            }

            if (!appointmentsDataRaw || appointmentsDataRaw.length === 0) {
                return res.json({ success: true, appointments: [] });
            }

            // 2. Filter appointments by tab & date filter
            const appointmentsData = appointmentsDataRaw.filter((app) => {
                const appDate = app.appointment_date;
                const status = (app.status || "").toLowerCase();

                // Specific Date Filter condition
                if (dateFilter && dateFilter !== "all") {
                    let targetDateStr = todayDateStr;
                    if (dateFilter === "tomorrow") {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        targetDateStr = tomorrow.toISOString().split("T")[0];
                    } else if (dateFilter === "custom" && customDate) {
                        targetDateStr = customDate;
                    }
                    if (appDate !== targetDateStr) {
                        return false;
                    }
                }

                // Tab Filter condition
                if (tab === "completed") {
                    return status === "completed";
                } else if (tab === "pending") {
                    const isExplicitPending = status === "pending" || status === "pending_consultation";
                    const isPastConfirmed = status === "confirmed" && appDate < todayDateStr;
                    return isExplicitPending || isPastConfirmed;
                } else if (tab === "confirmed" || tab === "upcoming") {
                    const isConfirmedStatus = status === "confirmed";
                    if (dateFilter === "all") {
                        return isConfirmedStatus && appDate >= todayDateStr;
                    }
                    return isConfirmedStatus;
                } else if (tab === "today") {
                    return appDate === todayDateStr && status !== "cancelled";
                }
                return status !== "cancelled";
            });

            if (!appointmentsData || appointmentsData.length === 0) {
                return res.json({ success: true, appointments: [] });
            }

            // Sort appointments by time / date
            appointmentsData.sort((a, b) => {
                if (a.appointment_date !== b.appointment_date) {
                    return a.appointment_date.localeCompare(b.appointment_date);
                }
                return (a.appointment_time || "").localeCompare(b.appointment_time || "");
            });

            // 3. Fetch related Patient details, HPR details & Appointment Symptoms
            const patientIds = [...new Set(appointmentsData.map((a) => a.patient_id).filter(Boolean))];
            const hprIds = [...new Set(appointmentsData.map((a) => a.hospital_patient_id).filter(Boolean))];
            const appointmentIds = appointmentsData.map((a) => a.id).filter(Boolean);
            
            let patientsMap = {};
            if (patientIds.length > 0 && db) {
                const formattedIds = patientIds.map(id => `"${id}"`).join(",");
                const { data: patientsData } = await db
                    .from("patients")
                    .select("id, user_id, first_name, last_name, full_name, profile_photo, blood_group, gender, date_of_birth, patient_code")
                    .or(`user_id.in.(${formattedIds}),id.in.(${formattedIds})`);

                if (patientsData) {
                    patientsData.forEach(p => {
                        const decP = decryptRecord("patients", p);
                        if (p.user_id) patientsMap[p.user_id] = decP;
                        if (p.id) patientsMap[p.id] = decP;
                    });
                }
            }

            let hprMap = {};
            if (hprIds.length > 0 && db) {
                const { data: hprData } = await db
                    .from("hospital_patient_records")
                    .select("id, hospital_patient_code, first_name, last_name, full_name, phone, gender, date_of_birth")
                    .in("id", hprIds);
                if (hprData) {
                    hprData.forEach(h => { hprMap[h.id] = decryptRecord("hospital_patient_records", h); });
                }
            }

            let visitsMap = {};
            if (appointmentIds.length > 0 && db) {
                const { data: visitsData } = await db
                    .from("patient_visits")
                    .select("id, appointment_id, visit_stage, checked_in_at, consultation_started_at, consultation_completed_at, chief_complaints")
                    .in("appointment_id", appointmentIds);
                if (visitsData) {
                    visitsData.forEach(v => { visitsMap[v.appointment_id] = decryptRecord("patient_visits", v); });
                }
            }

            let symptomsMap = {};
            if (appointmentIds.length > 0 && db) {
                const { data: symptomsData } = await db
                    .from("appointment_symptoms")
                    .select("*")
                    .in("appointment_id", appointmentIds);

                if (symptomsData) {
                    symptomsData.forEach(s => {
                        symptomsMap[s.appointment_id] = decryptRecord("appointment_symptoms", s);
                    });
                }
            }

            // 4. Merge and format the response
            const formattedAppointments = appointmentsData.map((app) => {
                const patient = patientsMap[app.patient_id] || {};
                const hpr = hprMap[app.hospital_patient_id] || {};
                const visit = visitsMap[app.id] || {};
                const sym = symptomsMap[app.id] || {};
                
                // Calculate age dynamically
                const dobStr = patient.date_of_birth || hpr.date_of_birth;
                let age = null;
                if (dobStr) {
                    const dob = new Date(dobStr);
                    const diffMs = Date.now() - dob.getTime();
                    const ageDt = new Date(diffMs);
                    age = Math.abs(ageDt.getUTCFullYear() - 1970);
                }

                const name = patient.full_name || (patient.first_name ? `${patient.first_name} ${patient.last_name || ""}`.trim() : "") || hpr.full_name || app.patient_name || "Walk-in Patient";

                return {
                    id: app.id,
                    patientId: patient.user_id || patient.id || app.patient_id || null,
                    hospital_patient_id: app.hospital_patient_id || null,
                    patientCode: patient.patient_code || hpr.hospital_patient_code || (hpr.id ? `DV-P-${hpr.id.slice(0, 6).toUpperCase()}` : ""),
                    patientName: name,
                    patient_name: name,
                    patientPhoto: patient.profile_photo || null,
                    profile_photo: patient.profile_photo || null,
                    age: age || app.age || null,
                    gender: patient.gender || hpr.gender || app.gender || "Unknown",
                    bloodGroup: patient.blood_group || app.blood_group || "-",
                    appointmentDate: app.appointment_date,
                    appointment_date: app.appointment_date,
                    time: app.appointment_time,
                    appointment_time: app.appointment_time,
                    visitStage: visit.visit_stage || "scheduled",
                    checkedInAt: visit.checked_in_at || null,
                    startedAt: visit.consultation_started_at || null,
                    completedAt: visit.consultation_completed_at || null,
                    type: app.appointment_type || "Consultation",
                    status: app.status,
                    reason: visit.chief_complaints || sym.symptoms || app.reason || app.notes || "",
                    symptoms: visit.chief_complaints || sym.symptoms || app.reason || "",
                    duration: sym.duration || "",
                    severity: sym.severity || "",
                    current_medications: sym.current_medications || "",
                    currentMedications: sym.current_medications || "",
                    additional_notes: sym.additional_notes || "",
                    additionalNotes: sym.additional_notes || "",
                    paymentMethod: app.payment_method || "pay_at_clinic",
                    payment_method: app.payment_method || "pay_at_clinic",
                    paymentStatus: app.payment_status || "pending",
                    payment_status: app.payment_status || "pending",
                    consultationFee: req.doctor?.consultationFee || app.consultation_fee || "500",
                };
            });

            return res.json({ success: true, appointments: formattedAppointments });
        } catch (error) {
            console.error("Error fetching appointments:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get a single appointment by ID including patient details and appointment symptoms
     */
    async getAppointmentById(req, res) {
        try {
            const { id } = req.params;
            const doctorIds = this._getDoctorIds(req.doctor);

            const { data: appointment, error: appointmentError } = await db
                .from("appointments")
                .select("*")
                .eq("id", id)
                .in("doctor_id", doctorIds)
                .single();

            if (appointmentError || !appointment) {
                return res.status(404).json({ success: false, error: "Appointment not found" });
            }

            let patient = null;
            if (appointment.patient_id) {
                const { data: pRow } = await db
                    .from("patients")
                    .select("id, user_id, first_name, last_name, full_name, profile_photo, blood_group, gender, date_of_birth, patient_code")
                    .or(`user_id.eq."${appointment.patient_id}",id.eq."${appointment.patient_id}"`)
                    .maybeSingle();
                if (pRow) patient = pRow;
            }

            let hpr = null;
            if (appointment.hospital_patient_id) {
                const { data: hprRow } = await db
                    .from("hospital_patient_records")
                    .select("id, hospital_patient_code, first_name, last_name, full_name, phone, gender, date_of_birth")
                    .eq("id", appointment.hospital_patient_id)
                    .maybeSingle();
                if (hprRow) hpr = decryptRecord("hospital_patient_records", hprRow);
            }

            let visit = null;
            const { data: visitRow } = await db
                .from("patient_visits")
                .select("id, visit_stage, checked_in_at, consultation_started_at, consultation_completed_at, chief_complaints")
                .eq("appointment_id", appointment.id)
                .maybeSingle();
            if (visitRow) visit = decryptRecord("patient_visits", visitRow);

            let sym = null;
            const { data: symRow } = await db
                .from("appointment_symptoms")
                .select("*")
                .eq("appointment_id", appointment.id)
                .maybeSingle();
            if (symRow) sym = decryptRecord("appointment_symptoms", symRow);
            if (patient) patient = decryptRecord("patients", patient);

            const dobStr = patient?.date_of_birth || hpr?.date_of_birth;
            let age = null;
            if (dobStr) {
                const dob = new Date(dobStr);
                const diffMs = Date.now() - dob.getTime();
                const ageDt = new Date(diffMs);
                age = Math.abs(ageDt.getUTCFullYear() - 1970);
            }

            const name = patient?.full_name || (patient?.first_name ? `${patient.first_name} ${patient.last_name || ""}`.trim() : "") || hpr?.full_name || appointment.patient_name || "Walk-in Patient";

            const formattedAppointment = {
                id: appointment.id,
                patientId: patient?.user_id || patient?.id || appointment.patient_id || null,
                hospital_patient_id: appointment.hospital_patient_id || null,
                patientCode: patient?.patient_code || hpr?.hospital_patient_code || (hpr?.id ? `DV-P-${hpr.id.slice(0, 6).toUpperCase()}` : ""),
                patientName: name,
                patient_name: name,
                patientPhoto: patient?.profile_photo || null,
                profile_photo: patient?.profile_photo || null,
                age: age,
                gender: patient?.gender || hpr?.gender || appointment.gender || "Unknown",
                bloodGroup: patient?.blood_group || appointment.blood_group || "-",
                appointmentDate: appointment.appointment_date,
                appointment_date: appointment.appointment_date,
                time: appointment.appointment_time,
                appointment_time: appointment.appointment_time,
                visitStage: visit?.visit_stage || "scheduled",
                checkedInAt: visit?.checked_in_at || null,
                startedAt: visit?.consultation_started_at || null,
                completedAt: visit?.consultation_completed_at || null,
                type: appointment.appointment_type || "Consultation",
                status: appointment.status,
                symptoms: visit?.chief_complaints || sym?.symptoms || appointment.reason || "",
                reason: visit?.chief_complaints || sym?.symptoms || appointment.reason || "",
                duration: sym?.duration || "",
                severity: sym?.severity || "",
                current_medications: sym?.current_medications || "",
                currentMedications: sym?.current_medications || "",
                additional_notes: sym?.additional_notes || "",
                additionalNotes: sym?.additional_notes || "",
                fee: req.doctor?.consultationFee || appointment.consultation_fee || "500",
                consultationFee: req.doctor?.consultationFee || appointment.consultation_fee || "500",
                paymentStatus: appointment.payment_status || "pending",
                paymentMethod: appointment.payment_method || "pay_at_clinic"
            };

            return res.json({ success: true, appointment: formattedAppointment });
        } catch (error) {
            console.error("Error fetching appointment by ID:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get appointment symptoms from appointment_symptoms table
     */
    async getAppointmentSymptoms(req, res) {
        try {
            const { appointmentId, patientId } = req.query;
            const validApptId = appointmentId && appointmentId !== "null" && appointmentId !== "undefined" && String(appointmentId).trim() !== "" ? String(appointmentId).trim() : null;
            const validPatientId = patientId && patientId !== "null" && patientId !== "undefined" && String(patientId).trim() !== "" ? String(patientId).trim() : null;

            let query = db.from("appointment_symptoms").select("*");

            if (validApptId) {
                query = query.eq("appointment_id", validApptId);
            } else if (validPatientId) {
                query = query.eq("patient_id", validPatientId);
            } else {
                return res.json({ success: true, symptoms: null });
            }

            const { data, error } = await query.order("created_at", { ascending: false }).limit(1);

            if (error) {
                console.warn("[AppointmentController] Error querying appointment_symptoms:", error.message);
                return res.json({ success: true, symptoms: null });
            }

            return res.json({
                success: true,
                symptoms: data?.[0] ? decryptRecord("appointment_symptoms", data[0]) : null
            });
        } catch (error) {
            console.error("Error fetching appointment symptoms:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Update appointment status
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const doctorIds = this._getDoctorIds(req.doctor);

            if (!status) {
                return res.status(400).json({ success: false, message: "Status is required" });
            }

            const { data, error } = await db
                .from("appointments")
                .update({ status: status, updated_at: new Date().toISOString() })
                .eq("id", id)
                .in("doctor_id", doctorIds)
                .select()
                .single();

            if (error) {
                throw new Error(error.message);
            }

            return res.status(200).json({
                success: true,
                appointment: data,
                message: `Appointment marked as ${status}`,
            });

        } catch (error) {
            console.error("[AppointmentController] Update Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to update appointment",
            });
        }
    }

    /**
     * Book a new confirmed appointment with strict backend availability validation
     */
    async bookAppointment(req, res) {
        try {
            const doctorIds = this._getDoctorIds(req.doctor);
            const doctorId = req.body.doctorId || doctorIds[0] || req.doctor?.id;
            const { patientId, date, time, appointmentType = "Consultation", reason = "", fee = "500" } = req.body;

            if (!doctorId || !patientId || !date || !time) {
                return res.status(400).json({
                    success: false,
                    message: "doctorId, patientId, date (YYYY-MM-DD), and time are required."
                });
            }

            // 1. Check Blocked Dates
            const { data: blocked } = await db
                .from("blocked_dates")
                .select("*")
                .in("doctor_id", doctorIds)
                .eq("blocked_date", date)
                .maybeSingle();

            if (blocked) {
                return res.status(400).json({
                    success: false,
                    message: `Booking failed: Doctor has blocked ${date} (${blocked.reason || "Unavailable"}).`
                });
            }

            // 2. Check Day of Week Availability
            const targetDate = new Date(date);
            const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
            const dayName = dayNames[targetDate.getDay()];

            const { data: avail } = await db
                .from("availability")
                .select("*")
                .in("doctor_id", doctorIds)
                .eq("day_of_week", dayName)
                .maybeSingle();

            if (avail && !avail.is_available) {
                return res.status(400).json({
                    success: false,
                    message: `Booking failed: Doctor does not take appointments on ${dayName.toUpperCase()}s.`
                });
            }

            // 3. Conflict Check (Existing Bookings)
            let existingInDb = null;
            if (db) {
                const { data } = await db
                    .from("appointments")
                    .select("id, status")
                    .in("doctor_id", doctorIds)
                    .eq("appointment_date", date)
                    .eq("appointment_time", time)
                    .neq("status", "cancelled")
                    .maybeSingle();
                existingInDb = data;
            }

            const existingInMemory = inMemoryAppointments.find(
                a => doctorIds.includes(a.doctor_id) && a.appointment_date === date && a.appointment_time === time && a.status !== "cancelled"
            );

            if (existingInDb || existingInMemory) {
                return res.status(409).json({
                    success: false,
                    message: `Conflict Error: Slot ${time} on ${date} is already booked.`
                });
            }

            // 4. Create Confirmed Appointment
            const newApp = {
                doctor_id: doctorId,
                patient_id: patientId,
                appointment_date: date,
                appointment_time: time,
                status: "confirmed",
                reason: reason || `${appointmentType} Appointment`,
                payment_status: "pending",
                payment_method: "pay_at_clinic"
            };

            let created = null;
            if (db) {
                const { data: inserted, error: createErr } = await db
                    .from("appointments")
                    .insert([newApp])
                    .select()
                    .single();

                if (createErr) {
                    console.warn("[AppointmentController] Supabase insert warning:", createErr.message);
                    created = {
                        id: Date.now(),
                        ...newApp,
                        created_at: new Date().toISOString()
                    };
                } else {
                    created = inserted;
                }
            } else {
                created = {
                    id: Date.now(),
                    ...newApp,
                    created_at: new Date().toISOString()
                };
            }

            inMemoryAppointments.push(newApp);

            return res.status(201).json({
                success: true,
                message: "Appointment confirmed successfully",
                appointment: created
            });

        } catch (error) {
            console.error("[AppointmentController] Book Error:", error.message);
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get Dashboard metrics summary
     */
    async getDashboardMetrics(req, res) {
        try {
            const doctorIds = this._getDoctorIds(req.doctor);
            const todayStr = new Date().toISOString().split("T")[0];
            
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split("T")[0];

            let apps = [];
            if (db && doctorIds.length > 0) {
                const { data: allApps, error: fetchErr } = await db
                    .from("appointments")
                    .select("*")
                    .in("doctor_id", doctorIds);

                if (fetchErr) {
                    console.error("[AppointmentController] Metrics fetch error:", fetchErr.message);
                } else if (allApps) {
                    apps = allApps;
                }
            }

            if (apps.length === 0 && inMemoryAppointments.length > 0) {
                apps = inMemoryAppointments.filter(a => doctorIds.includes(a.doctor_id));
            }

            const todayAppsRaw = apps.filter(a => a.appointment_date === todayStr && (a.status || "").toLowerCase() === "confirmed");
            const tomorrowAppsRaw = apps.filter(a => a.appointment_date === tomorrowStr && (a.status || "").toLowerCase() === "confirmed");
            const pendingAppsRaw = apps.filter(a => {
                const s = (a.status || "").toLowerCase();
                return s === "pending" || s === "pending_consultation" || (s === "confirmed" && a.appointment_date < todayStr);
            });
            const completedAppsRaw = apps.filter(a => (a.status || "").toLowerCase() === "completed");
            const confirmedAppsRaw = apps.filter(a => (a.status || "").toLowerCase() === "confirmed" && a.appointment_date >= todayStr);

            // Populate Patient Details for today/tomorrow apps
            const formatAppListWithPatients = async (appList) => {
                if (!appList.length) return [];
                const patientIds = [...new Set(appList.map(a => a.patient_id).filter(Boolean))];
                let pMap = {};
                if (patientIds.length > 0 && db) {
                    const formattedIds = patientIds.map(id => `"${id}"`).join(",");
                    const { data: pData } = await db
                        .from("patients")
                        .select("id, user_id, first_name, last_name, full_name, profile_photo, blood_group, gender, date_of_birth, patient_code")
                        .or(`user_id.in.(${formattedIds}),id.in.(${formattedIds})`);
                    if (pData) {
                        pData.forEach(p => {
                            const decP = decryptRecord("patients", p);
                            if (p.user_id) pMap[p.user_id] = decP;
                            if (p.id) pMap[p.id] = decP;
                        });
                    }
                }
                return appList.map(app => {
                    const patient = pMap[app.patient_id] || {};
                    let age = null;
                    if (patient.date_of_birth) {
                        const dob = new Date(patient.date_of_birth);
                        const diffMs = Date.now() - dob.getTime();
                        age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                    }
                    const name = patient.full_name || (patient.first_name ? `${patient.first_name} ${patient.last_name || ""}`.trim() : "") || app.patient_name || "Unknown Patient";
                    return {
                        ...app,
                        patientId: patient.user_id || patient.id || app.patient_id,
                        patientCode: patient.patient_code || "",
                        patientName: name,
                        patient_name: name,
                        patientPhoto: patient.profile_photo || null,
                        age: age || app.age || null,
                        gender: patient.gender || app.gender || "Unknown",
                        bloodGroup: patient.blood_group || app.blood_group || "-",
                    };
                });
            };

            const todayApps = await formatAppListWithPatients(todayAppsRaw);
            const tomorrowApps = await formatAppListWithPatients(tomorrowAppsRaw);

            // Fetch upcoming follow-ups from consultation_notes
            let followUps = [];
            if (db && doctorIds.length > 0) {
                const { data: notes } = await db
                    .from("consultation_notes")
                    .select("*")
                    .in("doctor_id", doctorIds)
                    .not("follow_up_date", "is", null);

                followUps = (notes || []).map(n => ({
                    id: n.id,
                    patientId: n.patient_id,
                    patientName: n.patient_name || "Patient",
                    followUpDate: n.follow_up_date,
                    notes: n.follow_up || n.advice || ""
                }));
            }

            return res.json({
                success: true,
                metrics: {
                    todayCount: todayAppsRaw.length,
                    tomorrowCount: tomorrowAppsRaw.length,
                    pendingCount: pendingAppsRaw.length,
                    completedCount: completedAppsRaw.length,
                    confirmedCount: confirmedAppsRaw.length,
                    totalCount: apps.length
                },
                todayAppointments: todayApps,
                tomorrowAppointments: tomorrowApps,
                upcomingFollowUps: followUps
            });

        } catch (error) {
            console.error("[AppointmentController] Metrics Error:", error.message);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new AppointmentController();

