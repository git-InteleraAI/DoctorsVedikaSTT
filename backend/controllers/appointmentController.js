const { supabase, supabaseAdmin } = require("../config/supabase");
const db = supabaseAdmin || supabase;
const { encryptPayload, decryptRecord } = require("../services/encryptionService");

// Shared in-memory appointments store for fallback conflict checking
const inMemoryAppointments = [];

// Timezone-aware date string helper (Asia/Kolkata)
const getTodayDateStr = (dateObj = new Date()) => {
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(dateObj);
    } catch (e) {
        return dateObj.toISOString().split("T")[0];
    }
};

class AppointmentController {
    static getInMemoryAppointments() {
        return inMemoryAppointments;
    }

    /**
     * Helper to extract all doctor identifier keys
     */
    async _getDoctorIds(reqDoctor) {
        if (!reqDoctor) return [];
        let ids = [...new Set([
            reqDoctor.id,
            reqDoctor.doctor_id,
            reqDoctor.userId,
            reqDoctor.user_id,
            reqDoctor.doctorId
        ].filter(Boolean))];

        if (db && ids.length > 0) {
            try {
                const { data } = await db
                    .from("doctors")
                    .select("id")
                    .in("id", ids);
                if (data) {
                    data.forEach(d => {
                        if (d.id) ids.push(d.id);
                    });
                }
            } catch (err) {}
        }
        return [...new Set(ids)];
    }

    /**
     * Get appointments for the logged-in doctor
     * Supports filtering by tab and date
     */
    async getAppointments(req, res) {
        try {
            const doctorIds = await this._getDoctorIds(req.doctor);
            const { tab = "confirmed", dateFilter = "all", customDate } = req.query;

            // ============================================================
            // TOTAL COMPLETED CONSULTATIONS
            // ============================================================
            // This tab is driven directly from consultation_notes.
            // It must NOT depend on appointments.status or patient_visits.
            // ============================================================

            if (
                tab === "total_completed" ||
                tab === "total"
            ) {
                if (!db || doctorIds.length === 0) {
                    return res.json({
                        success: true,
                        appointments: []
                    });
                }

                try {
                    const { data: notes, error: notesError } = await db
                        .from("consultation_notes")
                        .select("*")
                        .in("doctor_id", doctorIds)
                        .order("created_at", { ascending: false });

                    if (notesError) {
                        console.error(
                            "[TOTAL CONSULTATIONS] consultation_notes error:",
                            notesError.message
                        );

                        return res.status(500).json({
                            success: false,
                            error: notesError.message
                        });
                    }

                    const completedConsultations = (notes || []).map((note) => {
                        const date =
                            note.created_at
                                ? new Date(note.created_at)
                                    .toISOString()
                                    .split("T")[0]
                                : new Date().toISOString().split("T")[0];

                        const time =
                            note.created_at
                                ? new Date(note.created_at).toLocaleTimeString(
                                    "en-IN",
                                    {
                                        hour: "2-digit",
                                        minute: "2-digit"
                                    }
                                )
                                : "";

                        return {
                            id:
                                note.appointment_id ||
                                `consultation-${note.id}`,

                            appointmentId:
                                note.appointment_id || null,

                            appointment_id:
                                note.appointment_id || null,

                            consultationNoteId:
                                note.id,

                            patientId:
                                note.patient_id || null,

                            patient_id:
                                note.patient_id || null,

                            doctorId:
                                note.doctor_id,

                            doctor_id:
                                note.doctor_id,

                            appointment_date:
                                date,

                            appointment_time:
                                time,

                            status: "completed",

                            visit_stage: "completed",

                            visitStage: "completed",

                            reason:
                                note.chief_complaint ||
                                note.chief_complaints ||
                                note.reason ||
                                "Completed Consultation",

                            patientName:
                                note.patient_name ||
                                "Patient",

                            patient_name:
                                note.patient_name ||
                                "Patient",

                            created_at:
                                note.created_at || null
                        };
                    });

                    // Apply date filter ONLY when explicitly selected.
                    let filteredConsultations = completedConsultations;

                    if (dateFilter && dateFilter !== "all") {
                        let targetDate = null;

                        if (dateFilter === "today") {
                            targetDate = new Date()
                                .toISOString()
                                .split("T")[0];
                        }

                        if (dateFilter === "tomorrow") {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);

                            targetDate = tomorrow
                                .toISOString()
                                .split("T")[0];
                        }

                        if (
                            dateFilter === "custom" &&
                            customDate
                        ) {
                            targetDate = customDate;
                        }

                        if (targetDate) {
                            filteredConsultations =
                                completedConsultations.filter(
                                    (item) =>
                                        item.appointment_date ===
                                        targetDate
                                );
                        }
                    }

                    console.log(
                        "[TOTAL CONSULTATIONS]",
                        JSON.stringify({
                            doctorIds,
                            notesFound: notes?.length || 0,
                            returned: filteredConsultations.length
                        })
                    );

                    return res.json({
                        success: true,
                        appointments: filteredConsultations
                    });

                } catch (error) {
                    console.error(
                        "[TOTAL CONSULTATIONS] Error:",
                        error
                    );

                    return res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            }

            const todayDateStr = new Date().toISOString().split("T")[0];

            let appointmentsDataRaw = [];
            let completedNotesData = [];

            // 1. Fetch all appointments for doctor matching any doctor identifier
            if (db && doctorIds.length > 0) {
                const { data, error: appointmentsError } = await db
                    .from("appointments")
                    .select("*")
                    .in("doctor_id", doctorIds);

                if (appointmentsError) {
                    console.error("[AppointmentController] Fetch error:", appointmentsError.message);
                } else if (Array.isArray(data)) {
                    appointmentsDataRaw = data;
                }
            }

            // Fallback to in-memory if DB yields nothing
            if (appointmentsDataRaw.length === 0 && inMemoryAppointments.length > 0) {
                appointmentsDataRaw = inMemoryAppointments.filter(a => doctorIds.includes(String(a.doctor_id)));
            }

            // ============================================================
            // TOTAL COMPLETED CONSULTATIONS (from consultation_notes)
            // ============================================================
            if (
                db &&
                doctorIds.length > 0 &&
                (
                    tab === "total_completed" ||
                    tab === "total" ||
                    tab === "completed"
                )
            ) {
                const { data: notesData, error: notesError } = await db
                    .from("consultation_notes")
                    .select("*")
                    .in("doctor_id", doctorIds)
                    .order("created_at", { ascending: false });

                if (notesError) {
                    console.error(
                        "[AppointmentController] Completed consultation notes fetch error:",
                        notesError.message
                    );
                } else if (Array.isArray(notesData)) {
                    completedNotesData = notesData;
                }
            }

            if (!appointmentsDataRaw) {
                appointmentsDataRaw = [];
            }

            // Fetch related patient_visits to determine visit_stage
            const appointmentIdsRaw = appointmentsDataRaw.map((a) => a.id).filter(Boolean);
            let visitsMap = {};
            if (appointmentIdsRaw.length > 0 && db) {
                const { data: visitsData } = await db
                    .from("patient_visits")
                    .select("id, appointment_id, visit_stage, checked_in_at, consultation_started_at, consultation_completed_at, chief_complaints")
                    .in("appointment_id", appointmentIdsRaw);
                if (visitsData) {
                    const stagePriority = { completed: 5, exited: 5, in_consultation: 4, waiting: 3, checked_in: 3, scheduled: 1, cancelled: 0 };
                    visitsData.forEach(v => {
                        const decV = decryptRecord("patient_visits", v);
                        const existing = visitsMap[v.appointment_id];
                        if (!existing || (stagePriority[decV.visit_stage] || 0) >= (stagePriority[existing?.visit_stage] || 0)) {
                            visitsMap[v.appointment_id] = decV;
                        }
                    });
                }
            }

            let completedAppIdsFromNotes = new Set(completedNotesData.map(n => String(n.appointment_id)).filter(Boolean));

            // 2. Filter appointments by tab & date filter
            const appointmentsData = appointmentsDataRaw.filter((app) => {
                const appDate = app.appointment_date;
                const status = (app.status || "").toLowerCase();
                const visitRecord = visitsMap[app.id];
                const rawVisitStage = (visitRecord?.visit_stage || "").toLowerCase();
                
                // Staff Check-in Verification
                const isCheckedInByStaff =
                    rawVisitStage === "checked_in" ||
                    rawVisitStage === "waiting" ||
                    rawVisitStage === "in_consultation" ||
                    rawVisitStage === "completed" ||
                    rawVisitStage === "exited" ||
                    Boolean(visitRecord?.checked_in_at);

                const visitStage = rawVisitStage || (status === "cancelled" ? "cancelled" : (status === "completed" ? "completed" : (isCheckedInByStaff ? "waiting" : "scheduled")));
                const hasNotesCompleted = completedAppIdsFromNotes.has(String(app.id));
                const isCompleted = status === "completed" || visitStage === "completed" || visitStage === "exited" || Boolean(visitRecord?.consultation_completed_at) || hasNotesCompleted;

                // Tab Filter condition for Completed
                if (
                    tab === "completed" ||
                    tab === "total_completed" ||
                    tab === "total"
                ) {
                    return isCompleted;
                }

                // For active/today/confirmed/pending tabs: REQUIRE STAFF CHECK-IN
                if (!isCheckedInByStaff) {
                    return false;
                }

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

                if (tab === "pending") {
                    if (isCompleted) return false;
                    const isExplicitPending = status === "pending" || status === "pending_consultation";
                    const isPastConfirmed = status === "confirmed" && appDate < todayDateStr && visitStage !== "waiting" && visitStage !== "in_consultation";
                    return isExplicitPending || isPastConfirmed;
                } else if (tab === "confirmed" || tab === "upcoming") {
                    if (isCompleted || status === "cancelled" || visitStage === "cancelled") {
                        return false;
                    }
                    const isWaitingOrInConsult = visitStage === "waiting" || visitStage === "checked_in" || visitStage === "in_consultation" || status === "confirmed";
                    if (!isWaitingOrInConsult) return false;

                    const isConfirmedStatus = status === "confirmed" || status === "scheduled";
                    if (dateFilter === "all") {
                        return isConfirmedStatus && appDate >= todayDateStr;
                    }
                    return isConfirmedStatus;
                } else if (tab === "today") {
                    if (isCompleted || status === "cancelled" || visitStage === "cancelled") return false;
                    const isWaitingOrInConsult = visitStage === "waiting" || visitStage === "checked_in" || visitStage === "in_consultation" || status === "confirmed";
                    return appDate === todayDateStr && isWaitingOrInConsult;
                }
                
                if (isCompleted || status === "cancelled" || visitStage === "cancelled") return false;
                if (visitStage === "scheduled") return false;
                return true;
            });

            // ============================================================
            // MERGE COMPLETED CONSULTATIONS FROM consultation_notes
            // ============================================================
            if (
                (
                    tab === "total_completed" ||
                    tab === "total" ||
                    tab === "completed"
                ) &&
                completedNotesData.length > 0
            ) {
                const existingAppointmentIds = new Set(
                    appointmentsData.map((appointment) =>
                        String(appointment.id)
                    )
                );

                completedNotesData.forEach((note) => {
                    const appointmentId = note.appointment_id || null;

                    if (
                        appointmentId &&
                        existingAppointmentIds.has(String(appointmentId))
                    ) {
                        return;
                    }

                    const consultationDate = note.created_at
                        ? new Date(note.created_at).toISOString().split("T")[0]
                        : todayDateStr;

                    const consultationTime = note.created_at
                        ? new Date(note.created_at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit"
                        })
                        : "";

                    appointmentsData.push({
                        id: appointmentId || `consultation-${note.id}`,
                        appointment_id: appointmentId,
                        visit_id: null,
                        patient_id: note.patient_id || null,
                        doctor_id: note.doctor_id,
                        appointment_date: consultationDate,
                        appointment_time: consultationTime,
                        status: "completed",
                        visit_stage: "completed",
                        reason: note.chief_complaint || note.chief_complaints || note.reason || "Completed Consultation",
                        consultation_fee: note.consultation_fee || "0",
                        payment_status: note.payment_status || "paid",
                        payment_method: note.payment_method || "pay_at_clinic",
                        patient_name: note.patient_name || "Patient",
                        created_at: note.created_at || new Date().toISOString(),
                        consultation_note_id: note.id
                    });

                    if (appointmentId) {
                        existingAppointmentIds.add(String(appointmentId));
                    }
                });
            }

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

            if (appointmentIds.length > 0 && db) {
                const { data: visitsData } = await db
                    .from("patient_visits")
                    .select("id, appointment_id, visit_stage, checked_in_at, consultation_started_at, consultation_completed_at, chief_complaints")
                    .in("appointment_id", appointmentIds);
                if (visitsData) {
                    const stagePriority = { completed: 5, exited: 5, in_consultation: 4, waiting: 3, checked_in: 3, scheduled: 1, cancelled: 0 };
                    visitsData.forEach(v => {
                        const decV = decryptRecord("patient_visits", v);
                        const existing = visitsMap[v.appointment_id];
                        if (!existing || (stagePriority[decV.visit_stage] || 0) >= (stagePriority[existing?.visit_stage] || 0)) {
                            visitsMap[v.appointment_id] = decV;
                        }
                    });
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

                const resolvedVisitStage = visit.visit_stage || (app.status === "confirmed" ? "waiting" : "scheduled");
                const isCompletedVisit = resolvedVisitStage === "completed" || resolvedVisitStage === "exited" || (app.status || "").toLowerCase() === "completed";
                const resolvedStatus = isCompletedVisit ? "completed" : app.status;

                return {
                    id: app.id,
                    visitId: visit.id || null,
                    visit_id: visit.id || null,
                    patientId: patient.user_id || patient.id || app.patient_id || app.hospital_patient_id || app.id,
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
                    visitStage: resolvedVisitStage,
                    visit_stage: resolvedVisitStage,
                    checkedInAt: visit.checked_in_at || null,
                    startedAt: visit.consultation_started_at || null,
                    completedAt: visit.consultation_completed_at || null,
                    type: app.appointment_type || "Consultation",
                    status: resolvedStatus,
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
            const doctorIds = await this._getDoctorIds(req.doctor);

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
     * Update appointment status (Synchronizes patient_visits and validates business rules)
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const doctorIds = await this._getDoctorIds(req.doctor);

            if (!status) {
                return res.status(400).json({ success: false, message: "Status is required" });
            }

            const normalizedRequested = String(status).trim().toLowerCase();

            // 1. Verify appointment ownership and fetch current state
            const { data: appRow, error: fetchErr } = await db
                .from("appointments")
                .select("*")
                .eq("id", id)
                .in("doctor_id", doctorIds)
                .maybeSingle();

            if (fetchErr || !appRow) {
                return res.status(404).json({ success: false, message: "Appointment not found or unauthorized." });
            }

            // 2. Fetch associated patient_visits record if present
            let visitRow = null;
            if (id) {
                const { data: vData } = await db
                    .from("patient_visits")
                    .select("id, visit_stage")
                    .eq("appointment_id", id)
                    .maybeSingle();
                visitRow = vData;
            }

            const currentAppStatus = String(appRow.status || "").toLowerCase();
            const currentVisitStage = String(visitRow?.visit_stage || "").toLowerCase();

            // 3. Validate cancellation business rules
            if (normalizedRequested === "cancelled") {
                if (currentAppStatus === "completed" || currentVisitStage === "completed" || currentVisitStage === "exited") {
                    return res.status(400).json({
                        success: false,
                        message: "Completed consultations cannot be cancelled."
                    });
                }
                if (currentVisitStage === "in_consultation") {
                    return res.status(400).json({
                        success: false,
                        message: "Active consultations cannot be cancelled. Complete or exit the consultation first."
                    });
                }
            }

            // 4. Update appointments record
            const { data: updatedApp, error: updateErr } = await db
                .from("appointments")
                .update({
                    status: normalizedRequested,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id)
                .in("doctor_id", doctorIds)
                .select()
                .single();

            if (updateErr) {
                throw new Error(updateErr.message);
            }

            // 5. Synchronize associated patient_visits record if cancelled
            if (normalizedRequested === "cancelled") {
                if (visitRow && visitRow.id) {
                    await db
                        .from("patient_visits")
                        .update({
                            visit_stage: "cancelled",
                            updated_at: new Date().toISOString()
                        })
                        .eq("id", visitRow.id);
                } else {
                    await db
                        .from("patient_visits")
                        .update({
                            visit_stage: "cancelled",
                            updated_at: new Date().toISOString()
                        })
                        .eq("appointment_id", id);
                }
            }

            return res.status(200).json({
                success: true,
                appointment: updatedApp,
                message: `Appointment marked as ${normalizedRequested}`
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
     * POST /api/appointments/:id/reschedule
     * Atomic Reschedule Operation (Option A1):
     * 1. Validates ownership and doctor context
     * 2. Rejects completed, cancelled, or in_consultation appointments
     * 3. Validates newDate, newTime, blocked dates, availability, and target slot conflicts
     * 4. Logs APPOINTMENT_RESCHEDULE event in audit_logs with original & target dates/times
     * 5. Updates appointment date/time, sets status='scheduled', and resets visit_stage='scheduled'
     */
    async rescheduleAppointment(req, res) {
        try {
            const { id } = req.params;
            const { newDate, newTime, reason } = req.body;
            const doctorIds = await this._getDoctorIds(req.doctor);

            if (!newDate || !newTime) {
                return res.status(400).json({
                    success: false,
                    message: "newDate (YYYY-MM-DD) and newTime are required for rescheduling."
                });
            }

            // 1. Verify appointment ownership and current state
            const { data: appRow, error: fetchErr } = await db
                .from("appointments")
                .select("*")
                .eq("id", id)
                .in("doctor_id", doctorIds)
                .maybeSingle();

            if (fetchErr || !appRow) {
                return res.status(404).json({ success: false, message: "Appointment not found or unauthorized." });
            }

            // Fetch associated patient_visits record if present
            const { data: visitRow } = await db
                .from("patient_visits")
                .select("id, visit_stage")
                .eq("appointment_id", id)
                .maybeSingle();

            const currentAppStatus = String(appRow.status || "").toLowerCase();
            const currentVisitStage = String(visitRow?.visit_stage || "").toLowerCase();

            // 2. Reject invalid states
            if (currentAppStatus === "completed" || currentVisitStage === "completed" || currentVisitStage === "exited") {
                return res.status(400).json({
                    success: false,
                    message: "Completed consultations cannot be rescheduled."
                });
            }

            if (currentAppStatus === "cancelled" || currentVisitStage === "cancelled") {
                return res.status(400).json({
                    success: false,
                    message: "Cancelled appointments cannot be rescheduled."
                });
            }

            if (currentVisitStage === "in_consultation") {
                return res.status(400).json({
                    success: false,
                    message: "Active consultations cannot be rescheduled."
                });
            }

            // 3. Validate target date & time formatting
            const targetDateStr = String(newDate).trim();
            const targetTimeStr = String(newTime).trim();

            // 4. Check Blocked Dates
            const { data: blockedRow } = await db
                .from("blocked_dates")
                .select("id, reason")
                .in("doctor_id", doctorIds)
                .eq("blocked_date", targetDateStr)
                .limit(1);

            if (blockedRow && blockedRow.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Doctor is unavailable on ${targetDateStr}: ${blockedRow[0].reason || "Blocked date"}`
                });
            }

            // 5. Check Doctor Availability for weekday
            const dateObj = new Date(targetDateStr);
            const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
            const dayName = daysOfWeek[dateObj.getDay()];

            const { data: availRow } = await db
                .from("availability")
                .select("*")
                .in("doctor_id", doctorIds)
                .eq("day_of_week", dayName)
                .limit(1);

            if (availRow && availRow.length > 0 && availRow[0].is_available === false) {
                return res.status(400).json({
                    success: false,
                    message: `Doctor does not consult on ${dayName}s.`
                });
            }

            // 6. Check Target Slot Conflict (excluding current appointment ID)
            const { data: conflictingApps } = await db
                .from("appointments")
                .select("id")
                .in("doctor_id", doctorIds)
                .eq("appointment_date", targetDateStr)
                .eq("appointment_time", targetTimeStr)
                .neq("id", id)
                .neq("status", "cancelled");

            if (conflictingApps && conflictingApps.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `The time slot ${targetTimeStr} on ${targetDateStr} is already booked by another appointment.`
                });
            }

            // 7. Record Audit Log Event for Reschedule History
            const { logAuditEvent } = require("../middleware/auditLogger");
            await logAuditEvent({
                hospitalId: appRow.hospital_id || req.context?.hospitalId || null,
                actorUserId: req.doctor?.id || "doctor",
                actorRole: "doctor",
                action: "APPOINTMENT_RESCHEDULE",
                resourceType: "appointments",
                resourceId: id,
                metadata: {
                    original_date: appRow.appointment_date,
                    original_time: appRow.appointment_time,
                    new_date: targetDateStr,
                    new_time: targetTimeStr,
                    reason: reason || "Rescheduled by doctor",
                    patient_id: appRow.patient_id,
                    patient_name: appRow.patient_name
                }
            });

            // 8. Update Existing Appointment in-place
            const updatedReason = reason ? `Rescheduled: ${reason}` : (appRow.reason || appRow.notes || "Rescheduled");
            const { data: updatedApp, error: updateErr } = await db
                .from("appointments")
                .update({
                    appointment_date: targetDateStr,
                    appointment_time: targetTimeStr,
                    status: "scheduled",
                    reason: updatedReason,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id)
                .in("doctor_id", doctorIds)
                .select()
                .single();

            if (updateErr) {
                throw new Error(updateErr.message);
            }

            // 9. Reset visit_stage to 'scheduled' if a patient_visits record exists
            if (visitRow && visitRow.id) {
                await db
                    .from("patient_visits")
                    .update({
                        visit_stage: "scheduled",
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", visitRow.id);
            }

            return res.status(200).json({
                success: true,
                appointment: updatedApp,
                message: `Appointment successfully rescheduled to ${targetDateStr} at ${targetTimeStr}.`
            });

        } catch (error) {
            console.error("[AppointmentController] Reschedule Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to reschedule appointment: " + error.message
            });
        }
    }

    /**
     * Book a new confirmed appointment with strict backend availability validation
     */
    async bookAppointment(req, res) {
        try {
            const doctorIds = await this._getDoctorIds(req.doctor);
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
     *
     * IMPORTANT:
     * completedCount represents the total number of completed
     * consultations belonging ONLY to the currently logged-in doctor.
     *
     * A consultation can be considered completed from:
     * 1. appointments.status === "completed"
     * 2. patient_visits.visit_stage === "completed"
     * 3. patient_visits.visit_stage === "exited"
     * 4. patient_visits.consultation_completed_at exists
     * 5. consultation_notes belonging to this doctor
     *
     * consultation_notes are also included because a completed
     * consultation may have a consultation note even when the
     * appointment/visit status was not updated correctly.
     */
    async getDashboardMetrics(req, res) {
        try {
            const doctorIds = await this._getDoctorIds(req.doctor);

            if (!doctorIds.length) {
                return res.json({
                    success: true,
                    metrics: {
                        todayCount: 0,
                        tomorrowCount: 0,
                        pendingCount: 0,
                        completedCount: 0,
                        confirmedCount: 0,
                        totalCount: 0
                    },
                    todayAppointments: [],
                    tomorrowAppointments: [],
                    upcomingFollowUps: []
                });
            }

            const todayStr = getTodayDateStr();

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = getTodayDateStr(tomorrow);

            // ============================================================
            // 1. FETCH THIS DOCTOR'S APPOINTMENTS ONLY
            // ============================================================

            let apps = [];

            if (db) {
                const { data: allApps, error: fetchErr } = await db
                    .from("appointments")
                    .select("*")
                    .in("doctor_id", doctorIds);

                if (fetchErr) {
                    console.error(
                        "[AppointmentController] Metrics appointment fetch error:",
                        fetchErr.message
                    );
                } else if (Array.isArray(allApps)) {
                    apps = allApps;
                }
            }

            // Fallback to in-memory appointments
            if (apps.length === 0 && inMemoryAppointments.length > 0) {
                apps = inMemoryAppointments.filter((appointment) =>
                    doctorIds.includes(String(appointment.doctor_id))
                );
            }

            // ============================================================
            // 2. FETCH VISIT STATUS FOR THIS DOCTOR'S APPOINTMENTS
            // ============================================================

            const appointmentIds = apps
                .map((appointment) => appointment.id)
                .filter(Boolean);

            let visitsMap = {};

            if (db && appointmentIds.length > 0) {
                const { data: visitsData, error: visitsError } = await db
                    .from("patient_visits")
                    .select(
                        "id, appointment_id, visit_stage, consultation_completed_at"
                    )
                    .in("appointment_id", appointmentIds);

                if (visitsError) {
                    console.error(
                        "[AppointmentController] Metrics visit fetch error:",
                        visitsError.message
                    );
                } else if (Array.isArray(visitsData)) {
                    visitsData.forEach((visit) => {
                        const decryptedVisit = decryptRecord(
                            "patient_visits",
                            visit
                        );

                        const appointmentId = visit.appointment_id;

                        if (!appointmentId) return;

                        const existing = visitsMap[appointmentId];

                        /*
                         * Prefer a completed/exited visit over an earlier
                         * waiting/in-consultation state.
                         */
                        const priority = {
                            completed: 5,
                            exited: 5,
                            in_consultation: 4,
                            waiting: 3,
                            checked_in: 2,
                            scheduled: 1,
                            cancelled: 0
                        };

                        const currentStage = (
                            decryptedVisit?.visit_stage ||
                            visit.visit_stage ||
                            ""
                        ).toLowerCase();

                        const existingStage = (
                            existing?.visit_stage ||
                            ""
                        ).toLowerCase();

                        if (
                            !existing ||
                            (priority[currentStage] || 0) >
                                (priority[existingStage] || 0)
                        ) {
                            visitsMap[appointmentId] = {
                                ...decryptedVisit,
                                ...visit,
                                visit_stage: currentStage
                            };
                        }
                    });
                }
            }

            // ============================================================
            // 3. DETERMINE EFFECTIVE APPOINTMENT STATUS
            // ============================================================

            const getEffectiveStatus = (appointment) => {
                const appointmentStatus = (
                    appointment.status || ""
                ).toLowerCase();

                const visit = visitsMap[appointment.id];

                const visitStage = (
                    visit?.visit_stage || ""
                ).toLowerCase();

                if (
                    appointmentStatus === "completed" ||
                    visitStage === "completed" ||
                    visitStage === "exited" ||
                    Boolean(visit?.consultation_completed_at)
                ) {
                    return "completed";
                }

                return appointmentStatus;
            };

            // ============================================================
            // 4. NORMAL APPOINTMENT-BASED METRICS
            // ============================================================

            const todayAppsRaw = apps.filter((app) => {
                const appDate = app.appointment_date;
                const status = (app.status || "").toLowerCase();
                const visit = visitsMap[app.id];
                const visitStage = (visit?.visit_stage || "").toLowerCase();

                if (appDate !== todayStr) return false;
                if (status === "cancelled" || visitStage === "cancelled" || status === "rescheduled") return false;
                return true;
            });

            const tomorrowAppsRaw = apps.filter((app) => {
                const appDate = app.appointment_date;
                const status = (app.status || "").toLowerCase();
                const visit = visitsMap[app.id];
                const visitStage = (visit?.visit_stage || "").toLowerCase();

                if (appDate !== tomorrowStr) return false;
                if (status === "cancelled" || visitStage === "cancelled" || status === "rescheduled") return false;
                return true;
            });

            const pendingAppsRaw = apps.filter((app) => {
                const status = (app.status || "").toLowerCase();
                return status === "pending" || status === "pending_consultation";
            });

            const confirmedAppsRaw = apps.filter((app) => {
                const status = (app.status || "").toLowerCase();
                return (status === "confirmed" || status === "scheduled") && app.appointment_date >= todayStr;
            });

            // ============================================================
            // 5. BUILD COMPLETED CONSULTATION SET FOR TODAY ONLY
            // ============================================================

            const completedTodayIds = new Set();

            // 5A. Completed appointments / visits on TODAY
            apps.forEach((app) => {
                if (app.appointment_date !== todayStr) return;
                const status = (app.status || "").toLowerCase();
                const visit = visitsMap[app.id];
                const visitStage = (visit?.visit_stage || "").toLowerCase();

                const isCompleted =
                    status === "completed" ||
                    visitStage === "completed" ||
                    visitStage === "exited" ||
                    Boolean(visit?.consultation_completed_at);

                if (isCompleted && app.id) {
                    completedTodayIds.add(String(app.id));
                }
            });

            // 5B. Consultation notes created TODAY belonging ONLY to this doctor
            let consultationNotes = [];

            if (db) {
                const { data: notesData, error: notesError } = await db
                    .from("consultation_notes")
                    .select("id, appointment_id, patient_id, doctor_id, created_at")
                    .in("doctor_id", doctorIds);

                if (notesError) {
                    console.error(
                        "[AppointmentController] Metrics consultation notes fetch error:",
                        notesError.message
                    );
                } else if (Array.isArray(notesData)) {
                    consultationNotes = notesData;
                }
            }

            consultationNotes.forEach((note) => {
                const noteDate = note.created_at ? new Date(note.created_at).toISOString().split("T")[0] : todayStr;
                if (noteDate === todayStr) {
                    if (note.appointment_id) {
                        completedTodayIds.add(String(note.appointment_id));
                    } else if (note.id) {
                        completedTodayIds.add(`note:${String(note.id)}`);
                    }
                }
            });

            const completedCount = completedTodayIds.size;

            // ============================================================
            // 6. PATIENT DETAILS FOR TODAY/TOMORROW
            // ============================================================

            const formatAppListWithPatients = async (appList) => {
                if (!appList.length) return [];

                const patientIds = [
                    ...new Set(
                        appList
                            .map((appointment) => appointment.patient_id)
                            .filter(Boolean)
                    )
                ];

                let patientMap = {};

                if (patientIds.length > 0 && db) {
                    const formattedIds = patientIds
                        .map((id) => `"${id}"`)
                        .join(",");

                    const { data: patientData, error: patientError } = await db
                        .from("patients")
                        .select(
                            "id, user_id, first_name, last_name, full_name, profile_photo, blood_group, gender, date_of_birth, patient_code"
                        )
                        .or(
                            `user_id.in.(${formattedIds}),id.in.(${formattedIds})`
                        );

                    if (patientError) {
                        console.error(
                            "[AppointmentController] Metrics patient fetch error:",
                            patientError.message
                        );
                    }

                    if (Array.isArray(patientData)) {
                        patientData.forEach((patient) => {
                            const decryptedPatient = decryptRecord(
                                "patients",
                                patient
                            );

                            if (patient.user_id) {
                                patientMap[patient.user_id] =
                                    decryptedPatient;
                            }

                            if (patient.id) {
                                patientMap[patient.id] =
                                    decryptedPatient;
                            }
                        });
                    }
                }

                return appList.map((appointment) => {
                    const patient =
                        patientMap[appointment.patient_id] || {};

                    let age = null;

                    if (patient.date_of_birth) {
                        const dob = new Date(patient.date_of_birth);

                        if (!Number.isNaN(dob.getTime())) {
                            const diffMs =
                                Date.now() - dob.getTime();

                            age =
                                Math.abs(
                                    new Date(diffMs)
                                        .getUTCFullYear() - 1970
                                );
                        }
                    }

                    const patientName =
                        patient.full_name ||
                        (
                            patient.first_name
                                ? `${patient.first_name} ${
                                      patient.last_name || ""
                                  }`.trim()
                                : ""
                        ) ||
                        appointment.patient_name ||
                        "Unknown Patient";

                    return {
                        ...appointment,
                        patientId:
                            patient.user_id ||
                            patient.id ||
                            appointment.patient_id,
                        patientCode:
                            patient.patient_code || "",
                        patientName,
                        patient_name: patientName,
                        patientPhoto:
                            patient.profile_photo || null,
                        age:
                            age ||
                            appointment.age ||
                            null,
                        gender:
                            patient.gender ||
                            appointment.gender ||
                            "Unknown",
                        bloodGroup:
                            patient.blood_group ||
                            appointment.blood_group ||
                            "-"
                    };
                });
            };

            const todayAppointments =
                await formatAppListWithPatients(todayAppsRaw);

            const tomorrowAppointments =
                await formatAppListWithPatients(tomorrowAppsRaw);

            // ============================================================
            // 7. UPCOMING FOLLOW-UPS
            // ============================================================

            let followUps = [];

            if (consultationNotes.length > 0) {
                followUps = consultationNotes
                    .filter((note) => note.follow_up_date)
                    .map((note) => ({
                        id: note.id,
                        patientId: note.patient_id,
                        patientName: note.patient_name || "Patient",
                        followUpDate: note.follow_up_date,
                        notes:
                            note.follow_up ||
                            note.advice ||
                            ""
                    }));
            }

            // ============================================================
            // 8. FINAL RESPONSE
            // ============================================================

            console.log(
                `[AppointmentController] Dashboard metrics | Doctor IDs: ${doctorIds.join(
                    ", "
                )} | Today Workload: ${todayAppsRaw.length} | Today Completed: ${completedCount}`
            );

            return res.json({
                success: true,

                metrics: {
                    todayCount: todayAppsRaw.length,
                    tomorrowCount: tomorrowAppsRaw.length,
                    pendingCount: pendingAppsRaw.length,
                    completedCount,
                    confirmedCount: confirmedAppsRaw.length,
                    totalCount: apps.length
                },

                todayAppointments: todayAppointments,
                tomorrowAppointments: tomorrowAppointments,
                upcomingFollowUps: followUps
            });

        } catch (error) {
            console.error(
                "[AppointmentController] Metrics Error:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * GET /api/appointments/daily
     * Daily operational tab API:
     * Supports status = 'waiting' | 'completed' | 'rescheduled' | 'cancelled'
     * Defaults date to today's date if omitted.
     * Returns: { success: true, date, status, count, appointments: [...] }
     */
    async getDailyAppointments(req, res) {
        try {
            const doctorIds = await this._getDoctorIds(req.doctor);
            const { date = getTodayDateStr(), status = "waiting" } = req.query;

            if (!db || doctorIds.length === 0) {
                return res.json({
                    success: true,
                    date,
                    status: (status || "waiting").toLowerCase(),
                    count: 0,
                    appointments: []
                });
            }

            const normalizedStatus = (status || "waiting").toLowerCase();
            let formattedAppointments = [];

            if (normalizedStatus === "completed") {
                // 1. Fetch completed consultation_notes for doctor on this date
                const { data: notes } = await db
                    .from("consultation_notes")
                    .select("*")
                    .in("doctor_id", doctorIds)
                    .order("created_at", { ascending: false });

                const todayNotes = (notes || []).filter(note => {
                    const noteDate = note.created_at ? new Date(note.created_at).toISOString().split("T")[0] : date;
                    return noteDate === date;
                });

                // 2. Fetch appointments marked as completed or with completed visit_stage
                const { data: appData } = await db
                    .from("appointments")
                    .select("*")
                    .in("doctor_id", doctorIds)
                    .eq("appointment_date", date);

                const appIds = (appData || []).map(a => a.id).filter(Boolean);
                let visitsMap = {};
                if (appIds.length > 0) {
                    const { data: vData } = await db
                        .from("patient_visits")
                        .select("id, appointment_id, visit_stage, consultation_completed_at, chief_complaints")
                        .in("appointment_id", appIds);
                    if (vData) {
                        vData.forEach(v => { visitsMap[v.appointment_id] = decryptRecord("patient_visits", v); });
                    }
                }

                // Combine and format
                const combinedMap = new Map();
                (appData || []).forEach(app => {
                    const v = visitsMap[app.id] || {};
                    const vStage = (v.visit_stage || "").toLowerCase();
                    const appSt = (app.status || "").toLowerCase();
                    const isComp = appSt === "completed" || vStage === "completed" || vStage === "exited" || Boolean(v.consultation_completed_at);

                    if (isComp) {
                        combinedMap.set(String(app.id), {
                            id: app.id,
                            appointment_id: app.id,
                            patient_id: app.patient_id,
                            hospital_patient_id: app.hospital_patient_id || null,
                            doctor_id: app.doctor_id,
                            appointment_date: app.appointment_date,
                            appointment_time: app.appointment_time,
                            status: "completed",
                            visit_stage: "completed",
                            patient_name: app.patient_name || "Patient",
                            reason: v.chief_complaints || app.reason || app.notes || "Completed Consultation",
                            payment_status: app.payment_status || "paid",
                            payment_method: app.payment_method || "pay_at_clinic",
                            consultation_fee: app.consultation_fee || "500",
                            created_at: app.created_at
                        });
                    }
                });

                todayNotes.forEach(note => {
                    const appKey = note.appointment_id ? String(note.appointment_id) : `consultation-${note.id}`;
                    if (!combinedMap.has(appKey)) {
                        combinedMap.set(appKey, {
                            id: note.appointment_id || `consultation-${note.id}`,
                            appointment_id: note.appointment_id || null,
                            consultation_note_id: note.id,
                            patient_id: note.patient_id || null,
                            doctor_id: note.doctor_id,
                            appointment_date: date,
                            appointment_time: note.created_at ? new Date(note.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "",
                            status: "completed",
                            visit_stage: "completed",
                            patient_name: note.patient_name || "Patient",
                            reason: note.chief_complaint || note.chief_complaints || note.reason || "Completed Consultation",
                            payment_status: note.payment_status || "paid",
                            payment_method: note.payment_method || "pay_at_clinic",
                            consultation_fee: note.consultation_fee || "500",
                            created_at: note.created_at
                        });
                    } else {
                        const existing = combinedMap.get(appKey);
                        existing.consultation_note_id = note.id;
                    }
                });

                formattedAppointments = Array.from(combinedMap.values());
            } else if (normalizedStatus === "rescheduled") {
                // Fetch audit logs for rescheduled events originating on this date
                const { data: auditLogs } = await db
                    .from("audit_logs")
                    .select("*")
                    .eq("action", "APPOINTMENT_RESCHEDULE")
                    .order("created_at", { ascending: false });

                const rescheduledOnDate = (auditLogs || []).filter(log => {
                    return log.metadata?.original_date === date;
                });

                // Format audit log reschedule records
                const auditFormatted = rescheduledOnDate.map(log => ({
                    id: log.resource_id,
                    appointment_id: log.resource_id,
                    patient_id: log.metadata?.patient_id || null,
                    patient_name: log.metadata?.patient_name || "Patient",
                    appointment_date: log.metadata?.original_date || date,
                    appointment_time: log.metadata?.original_time || "",
                    new_appointment_date: log.metadata?.new_date,
                    new_appointment_time: log.metadata?.new_time,
                    status: "rescheduled",
                    visit_stage: "rescheduled",
                    reason: log.metadata?.reason || `Rescheduled to ${log.metadata?.new_date || "new date"} ${log.metadata?.new_time || ""}`,
                    created_at: log.created_at
                }));

                // Combine with any legacy/explicit appointments marked as rescheduled
                const { data: legacyRescheduled } = await db
                    .from("appointments")
                    .select("*")
                    .in("doctor_id", doctorIds)
                    .eq("appointment_date", date)
                    .eq("status", "rescheduled");

                const legacyFormatted = (legacyRescheduled || []).map(app => ({
                    id: app.id,
                    appointment_id: app.id,
                    patient_id: app.patient_id,
                    patient_name: app.patient_name || "Patient",
                    appointment_date: app.appointment_date,
                    appointment_time: app.appointment_time,
                    status: "rescheduled",
                    visit_stage: "rescheduled",
                    reason: app.reason || app.notes || "Rescheduled",
                    created_at: app.created_at
                }));

                const resMap = new Map();
                auditFormatted.forEach(item => resMap.set(String(item.id), item));
                legacyFormatted.forEach(item => {
                    if (!resMap.has(String(item.id))) resMap.set(String(item.id), item);
                });

                formattedAppointments = Array.from(resMap.values());
            } else {
                // Fetch appointments from DB matching doctor and date
                const { data: rawApps } = await db
                    .from("appointments")
                    .select("*")
                    .in("doctor_id", doctorIds)
                    .eq("appointment_date", date);

                let appsList = rawApps || [];

                // Fetch patient_visits matching these appointments
                const appIds = appsList.map(a => a.id).filter(Boolean);
                let visitsMap = {};
                if (appIds.length > 0) {
                    const { data: visitsData } = await db
                        .from("patient_visits")
                        .select("id, appointment_id, visit_stage, checked_in_at, consultation_started_at, consultation_completed_at, chief_complaints")
                        .in("appointment_id", appIds);
                    if (visitsData) {
                        visitsData.forEach(v => {
                            visitsMap[v.appointment_id] = decryptRecord("patient_visits", v);
                        });
                    }
                }

                // Filter according to operational status
                const filtered = appsList.filter(app => {
                    const appStatus = (app.status || "").toLowerCase();
                    const visit = visitsMap[app.id] || {};
                    const visitStage = (visit.visit_stage || "").toLowerCase();
                    const isCompleted = appStatus === "completed" || visitStage === "completed" || visitStage === "exited" || Boolean(visit.consultation_completed_at);

                    if (normalizedStatus === "waiting") {
                        if (appStatus === "cancelled" || visitStage === "cancelled" || isCompleted || appStatus === "rescheduled") return false;
                        // All active appointments scheduled/checked-in/in-consultation for today
                        return true;
                    } else if (normalizedStatus === "cancelled") {
                        return appStatus === "cancelled" || visitStage === "cancelled";
                    }
                    return true;
                });

                formattedAppointments = filtered.map(app => {
                    const visit = visitsMap[app.id] || {};
                    const visitStage = (visit.visit_stage || "").toLowerCase();
                    const resolvedVisitStage = visitStage || (app.status === "confirmed" ? "waiting" : app.status);

                    return {
                        id: app.id,
                        appointment_id: app.id,
                        patient_id: app.patient_id,
                        hospital_patient_id: app.hospital_patient_id || null,
                        doctor_id: app.doctor_id,
                        appointment_date: app.appointment_date,
                        appointment_time: app.appointment_time,
                        status: app.status,
                        visit_stage: resolvedVisitStage,
                        patient_name: app.patient_name || "Patient",
                        reason: visit.chief_complaints || app.reason || app.notes || "",
                        payment_status: app.payment_status || "pending",
                        payment_method: app.payment_method || "pay_at_clinic",
                        consultation_fee: app.consultation_fee || "500",
                        checked_in_at: visit.checked_in_at || null,
                        started_at: visit.consultation_started_at || null,
                        completed_at: visit.consultation_completed_at || null,
                        created_at: app.created_at
                    };
                });
            }

            // Hydrate patient details (name, code, age, gender, photo, blood_group)
            if (formattedAppointments.length > 0) {
                const patientIds = [...new Set(formattedAppointments.map(a => a.patient_id).filter(Boolean))];
                const hprIds = [...new Set(formattedAppointments.map(a => a.hospital_patient_id).filter(Boolean))];
                const appIds = formattedAppointments.map(a => a.id).filter(Boolean);

                let patientMap = {};
                if (patientIds.length > 0) {
                    const formattedIds = patientIds.map(id => `"${id}"`).join(",");
                    const { data: pData } = await db
                        .from("patients")
                        .select("id, user_id, first_name, last_name, full_name, profile_photo, blood_group, gender, date_of_birth, patient_code")
                        .or(`user_id.in.(${formattedIds}),id.in.(${formattedIds})`);
                    if (pData) {
                        pData.forEach(p => {
                            const decP = decryptRecord("patients", p);
                            if (p.user_id) patientMap[p.user_id] = decP;
                            if (p.id) patientMap[p.id] = decP;
                        });
                    }
                }

                let hprMap = {};
                if (hprIds.length > 0) {
                    const { data: hprData } = await db
                        .from("hospital_patient_records")
                        .select("id, hospital_patient_code, first_name, last_name, full_name, phone, gender, date_of_birth")
                        .in("id", hprIds);
                    if (hprData) {
                        hprData.forEach(h => { hprMap[h.id] = decryptRecord("hospital_patient_records", h); });
                    }
                }

                let symptomsMap = {};
                if (appIds.length > 0) {
                    const { data: symData } = await db
                        .from("appointment_symptoms")
                        .select("*")
                        .in("appointment_id", appIds);
                    if (symData) {
                        symData.forEach(s => { symptomsMap[s.appointment_id] = decryptRecord("appointment_symptoms", s); });
                    }
                }

                formattedAppointments = formattedAppointments.map(app => {
                    const p = patientMap[app.patient_id] || {};
                    const hpr = hprMap[app.hospital_patient_id] || {};
                    const sym = symptomsMap[app.id] || {};

                    const dobStr = p.date_of_birth || hpr.date_of_birth;
                    let age = null;
                    if (dobStr) {
                        const dob = new Date(dobStr);
                        if (!isNaN(dob.getTime())) {
                            const diffMs = Date.now() - dob.getTime();
                            age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                        }
                    }

                    const name = p.full_name || (p.first_name ? `${p.first_name} ${p.last_name || ""}`.trim() : "") || hpr.full_name || app.patient_name || "Walk-in Patient";

                    return {
                        ...app,
                        patientId: p.user_id || p.id || app.patient_id || app.hospital_patient_id || app.id,
                        patient_id: p.user_id || p.id || app.patient_id || app.hospital_patient_id || app.id,
                        patientCode: p.patient_code || hpr.hospital_patient_code || (hpr.id ? `DV-P-${hpr.id.slice(0, 6).toUpperCase()}` : ""),
                        patientName: name,
                        patient_name: name,
                        patientPhoto: p.profile_photo || null,
                        profile_photo: p.profile_photo || null,
                        age: age || app.age || null,
                        gender: p.gender || hpr.gender || app.gender || "Unknown",
                        bloodGroup: p.blood_group || app.blood_group || "-",
                        symptoms: sym.symptoms || app.reason || "",
                        reason: sym.symptoms || app.reason || ""
                    };
                });
            }

            // Sort by appointment_time ascending
            formattedAppointments.sort((a, b) => (a.appointment_time || "").localeCompare(b.appointment_time || ""));

            return res.json({
                success: true,
                date,
                status: normalizedStatus,
                count: formattedAppointments.length,
                appointments: formattedAppointments
            });
        } catch (error) {
            console.error("[AppointmentController] getDailyAppointments error:", error);
            return res.json({ success: true, date: req.query.date || new Date().toISOString().split("T")[0], status: req.query.status || "waiting", count: 0, appointments: [] });
        }
    }

    /**
     * GET /api/appointments/calendar
     * Returns date-level aggregate metrics for the given month range
     */
    async getCalendarAppointments(req, res) {
        return this.getCalendarMonth(req, res);
    }

    async getCalendarMonth(req, res) {
        try {
            const doctorIds = await this._getDoctorIds(req.doctor);
            let { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, "0");
                const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
                startDate = `${year}-${month}-01`;
                endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
            }

            if (!db || doctorIds.length === 0) {
                return res.json({
                    success: true,
                    startDate,
                    endDate,
                    calendar: []
                });
            }

            // 1. Query appointments in range
            const { data: appsData, error: appsErr } = await db
                .from("appointments")
                .select("id, appointment_date, status")
                .in("doctor_id", doctorIds)
                .gte("appointment_date", startDate)
                .lte("appointment_date", endDate);

            if (appsErr) {
                console.error("[AppointmentController] getCalendarMonth fetch error:", appsErr.message);
                return res.status(500).json({ success: false, error: appsErr.message });
            }

            const appList = appsData || [];
            const appIds = appList.map(a => a.id).filter(Boolean);

            // 2. Fetch patient_visits for status breakdown
            let visitsMap = {};
            if (appIds.length > 0) {
                const { data: visitsData } = await db
                    .from("patient_visits")
                    .select("appointment_id, visit_stage")
                    .in("appointment_id", appIds);
                if (visitsData) {
                    visitsData.forEach(v => {
                        const decV = decryptRecord("patient_visits", v);
                        visitsMap[v.appointment_id] = decV.visit_stage || v.visit_stage;
                    });
                }
            }

            // 3. Aggregate per date
            const dateAggregates = {};

            appList.forEach(app => {
                const dateKey = app.appointment_date;
                if (!dateKey) return;

                if (!dateAggregates[dateKey]) {
                    dateAggregates[dateKey] = {
                        date: dateKey,
                        total: 0,
                        waiting: 0,
                        scheduled: 0,
                        completed: 0,
                        cancelled: 0,
                        rescheduled: 0
                    };
                }

                const agg = dateAggregates[dateKey];
                agg.total += 1;

                const appStatus = (app.status || "").toLowerCase();
                const visitStage = (visitsMap[app.id] || "").toLowerCase();

                if (appStatus === "cancelled" || visitStage === "cancelled") {
                    agg.cancelled += 1;
                } else if (appStatus === "rescheduled" || visitStage === "rescheduled") {
                    agg.rescheduled += 1;
                } else if (appStatus === "completed" || visitStage === "completed" || visitStage === "exited") {
                    agg.completed += 1;
                } else if (visitStage === "waiting" || visitStage === "checked_in" || visitStage === "in_consultation") {
                    agg.waiting += 1;
                } else {
                    agg.scheduled += 1;
                }
            });

            const calendarList = Object.values(dateAggregates).sort((a, b) => a.date.localeCompare(b.date));

            return res.json({
                success: true,
                startDate,
                endDate,
                calendar: calendarList
            });
        } catch (error) {
            console.error("[AppointmentController] getCalendarMonth error:", error);
            return res.json({ success: true, startDate: req.query.startDate, endDate: req.query.endDate, calendar: [] });
        }
    }

    /**
     * GET /api/appointments/calendar/day
     * Returns full appointment details (ALL states: completed, waiting, scheduled, cancelled, rescheduled)
     * and available/booked/blocked slots for selected date.
     */
    async getCalendarDayAppointments(req, res) {
        return this.getCalendarDay(req, res);
    }

    async getCalendarDay(req, res) {
        try {
            const doctorIds = await this._getDoctorIds(req.doctor);
            const { date = getTodayDateStr() } = req.query;

            if (!db || doctorIds.length === 0) {
                return res.json({
                    success: true,
                    date,
                    appointments: [],
                    availableSlots: [],
                    bookedSlots: [],
                    blockedSlots: [],
                    isBlocked: false,
                    blockReason: ""
                });
            }

            // 1. Check if date is blocked
            let blockedRow = null;
            try {
                const { data: blockedData } = await db
                    .from("blocked_dates")
                    .select("*")
                    .in("doctor_id", doctorIds)
                    .eq("blocked_date", date)
                    .limit(1);
                if (blockedData && blockedData.length > 0) {
                    blockedRow = blockedData[0];
                }
            } catch (e) {}

            const isBlocked = Boolean(blockedRow);
            const blockReason = blockedRow?.reason || "Unavailable";

            // 2. Fetch doctor availability schedule for day of week
            const targetDateObj = new Date(date);
            const dayNamesTitle = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const dayName = dayNamesTitle[targetDateObj.getDay()];

            let availRow = null;
            try {
                const { data: availData } = await db
                    .from("availability")
                    .select("*")
                    .in("doctor_id", doctorIds)
                    .eq("day_of_week", dayName.toLowerCase())
                    .limit(1);
                if (availData && availData.length > 0) {
                    availRow = availData[0];
                }
            } catch (e) {}

            const daySchedule = availRow || {
                is_available: dayName !== "Sunday",
                start_time: "09:00 AM",
                end_time: "05:00 PM",
                slot_duration_minutes: 30,
                time_windows: [
                    { start_time: "09:00 AM", end_time: "01:00 PM" },
                    { start_time: "05:00 PM", end_time: "08:00 PM" }
                ]
            };

            // 3. Fetch appointments for this date
            const { data: rawApps } = await db
                .from("appointments")
                .select("*")
                .in("doctor_id", doctorIds)
                .eq("appointment_date", date);

            let appsList = rawApps || [];

            // 3B. Fetch audit logs for rescheduled appointments from this date
            const { data: auditLogs } = await db
                .from("audit_logs")
                .select("*")
                .eq("action", "APPOINTMENT_RESCHEDULE");

            const rescheduledOnDate = (auditLogs || []).filter(log => log.metadata?.original_date === date);
            const rescheduledAppIds = new Set(rescheduledOnDate.map(l => String(l.resource_id)));

            const appIds = appsList.map(a => a.id).filter(Boolean);

            let visitsMap = {};
            if (appIds.length > 0) {
                const { data: visitsData } = await db
                    .from("patient_visits")
                    .select("id, appointment_id, visit_stage, checked_in_at, consultation_started_at, consultation_completed_at, chief_complaints")
                    .in("appointment_id", appIds);
                if (visitsData) {
                    visitsData.forEach(v => {
                        visitsMap[v.appointment_id] = decryptRecord("patient_visits", v);
                    });
                }
            }

            // Hydrate patient details for appointment list
            let formattedAppointments = [];
            if (appsList.length > 0) {
                const patientIds = [...new Set(appsList.map(a => a.patient_id).filter(Boolean))];
                const hprIds = [...new Set(appsList.map(a => a.hospital_patient_id).filter(Boolean))];

                let patientMap = {};
                if (patientIds.length > 0) {
                    const formattedIds = patientIds.map(id => `"${id}"`).join(",");
                    const { data: pData } = await db
                        .from("patients")
                        .select("id, user_id, first_name, last_name, full_name, profile_photo, blood_group, gender, date_of_birth, patient_code")
                        .or(`user_id.in.(${formattedIds}),id.in.(${formattedIds})`);
                    if (pData) {
                        pData.forEach(p => {
                            const decP = decryptRecord("patients", p);
                            if (p.user_id) patientMap[p.user_id] = decP;
                            if (p.id) patientMap[p.id] = decP;
                        });
                    }
                }

                let hprMap = {};
                if (hprIds.length > 0) {
                    const { data: hprData } = await db
                        .from("hospital_patient_records")
                        .select("id, hospital_patient_code, first_name, last_name, full_name, phone, gender, date_of_birth")
                        .in("id", hprIds);
                    if (hprData) {
                        hprData.forEach(h => { hprMap[h.id] = decryptRecord("hospital_patient_records", h); });
                    }
                }

                let symptomsMap = {};
                if (appIds.length > 0) {
                    const { data: symData } = await db
                        .from("appointment_symptoms")
                        .select("*")
                        .in("appointment_id", appIds);
                    if (symData) {
                        symData.forEach(s => { symptomsMap[s.appointment_id] = decryptRecord("appointment_symptoms", s); });
                    }
                }

                formattedAppointments = appsList.map(app => {
                    const p = patientMap[app.patient_id] || {};
                    const hpr = hprMap[app.hospital_patient_id] || {};
                    const visit = visitsMap[app.id] || {};
                    const sym = symptomsMap[app.id] || {};

                    const dobStr = p.date_of_birth || hpr.date_of_birth;
                    let age = null;
                    if (dobStr) {
                        const dob = new Date(dobStr);
                        if (!isNaN(dob.getTime())) {
                            const diffMs = Date.now() - dob.getTime();
                            age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                        }
                    }

                    const name = p.full_name || (p.first_name ? `${p.first_name} ${p.last_name || ""}`.trim() : "") || hpr.full_name || app.patient_name || "Walk-in Patient";

                    const appSt = (app.status || "").toLowerCase();
                    const vStage = (visit.visit_stage || "").toLowerCase();
                    
                    let resolvedVisitStage = vStage;
                    if (!resolvedVisitStage) {
                        if (appSt === "completed") resolvedVisitStage = "completed";
                        else if (appSt === "cancelled") resolvedVisitStage = "cancelled";
                        else if (appSt === "rescheduled") resolvedVisitStage = "rescheduled";
                        else if (appSt === "confirmed" || appSt === "waiting") resolvedVisitStage = "waiting";
                        else resolvedVisitStage = "scheduled";
                    }

                    return {
                        id: app.id,
                        appointment_id: app.id,
                        patientId: p.user_id || p.id || app.patient_id || app.hospital_patient_id || app.id,
                        patient_id: p.user_id || p.id || app.patient_id || app.hospital_patient_id || app.id,
                        patientCode: p.patient_code || hpr.hospital_patient_code || (hpr.id ? `DV-P-${hpr.id.slice(0, 6).toUpperCase()}` : ""),
                        patientName: name,
                        patient_name: name,
                        patientPhoto: p.profile_photo || null,
                        profile_photo: p.profile_photo || null,
                        age: age || app.age || null,
                        gender: p.gender || hpr.gender || app.gender || "Unknown",
                        bloodGroup: p.blood_group || app.blood_group || "-",
                        appointment_date: app.appointment_date,
                        appointment_time: app.appointment_time,
                        time: app.appointment_time,
                        status: app.status,
                        visitStage: resolvedVisitStage,
                        visit_stage: resolvedVisitStage,
                        reason: visit.chief_complaints || sym.symptoms || app.reason || app.notes || "",
                        payment_status: app.payment_status || "pending",
                        payment_method: app.payment_method || "pay_at_clinic",
                        consultation_fee: app.consultation_fee || "500"
                    };
                });
            }

            // Include rescheduled entries from audit_logs
            rescheduledOnDate.forEach(log => {
                const existingId = String(log.resource_id);
                if (!formattedAppointments.some(a => String(a.id) === existingId)) {
                    formattedAppointments.push({
                        id: log.resource_id,
                        appointment_id: log.resource_id,
                        patientId: log.metadata?.patient_id || null,
                        patient_id: log.metadata?.patient_id || null,
                        patientName: log.metadata?.patient_name || "Patient",
                        patient_name: log.metadata?.patient_name || "Patient",
                        appointment_date: date,
                        appointment_time: log.metadata?.original_time || "",
                        time: log.metadata?.original_time || "",
                        status: "rescheduled",
                        visitStage: "rescheduled",
                        visit_stage: "rescheduled",
                        reason: log.metadata?.reason || `Rescheduled to ${log.metadata?.new_date || "new date"} ${log.metadata?.new_time || ""}`
                    });
                }
            });

            // Sort appointments by appointment_time ascending
            formattedAppointments.sort((a, b) => (a.appointment_time || "").localeCompare(b.appointment_time || ""));

            // 4. Generate slots breakdown (available, booked, blocked)
            const bookedSlots = [];
            const availableSlots = [];
            const blockedSlots = isBlocked ? [{ date, reason: blockReason }] : [];

            if (!isBlocked && daySchedule.is_available) {
                const slotDuration = daySchedule.slot_duration_minutes || daySchedule.slot_duration || 30;
                const timeWindows = daySchedule.time_windows && daySchedule.time_windows.length > 0
                    ? daySchedule.time_windows
                    : [{ start_time: daySchedule.start_time || "09:00 AM", end_time: daySchedule.end_time || "05:00 PM" }];

                const parse12h = (tStr) => {
                    if (!tStr) return 540;
                    const match = tStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                    if (!match) return 540;
                    let h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10);
                    if (match[3].toUpperCase() === "PM" && h < 12) h += 12;
                    if (match[3].toUpperCase() === "AM" && h === 12) h = 0;
                    return h * 60 + m;
                };

                const format12h = (mins) => {
                    let h = Math.floor(mins / 60);
                    const m = mins % 60;
                    const period = h >= 12 ? "PM" : "AM";
                    let displayH = h % 12;
                    if (displayH === 0) displayH = 12;
                    return `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
                };

                const bookedTimesMap = new Map();
                formattedAppointments.forEach(app => {
                    if (app.status !== "cancelled" && app.status !== "rescheduled" && app.appointment_time) {
                        bookedTimesMap.set(app.appointment_time.trim().toUpperCase(), app);
                    }
                });

                timeWindows.forEach(w => {
                    let current = parse12h(w.start_time || "09:00 AM");
                    const endMins = parse12h(w.end_time || "05:00 PM");

                    while (current + slotDuration <= endMins) {
                        const slotTimeStr = format12h(current);
                        const matchedApp = bookedTimesMap.get(slotTimeStr.toUpperCase());

                        if (matchedApp) {
                            bookedSlots.push({
                                time: slotTimeStr,
                                appointmentId: matchedApp.id,
                                patientName: matchedApp.patient_name,
                                status: matchedApp.status
                            });
                        } else {
                            availableSlots.push({
                                time: slotTimeStr,
                                status: "Available"
                            });
                        }
                        current += slotDuration;
                    }
                });
            }

            return res.json({
                success: true,
                date,
                isBlocked,
                blockReason,
                dayOfWeek: dayName,
                appointments: formattedAppointments,
                availableSlots,
                bookedSlots,
                blockedSlots
            });
        } catch (error) {
            console.error("[AppointmentController] getCalendarDay error:", error);
            return res.json({
                success: true,
                date: req.query.date || new Date().toISOString().split("T")[0],
                isBlocked: false,
                blockReason: "",
                dayOfWeek: "Today",
                appointments: [],
                availableSlots: [],
                bookedSlots: [],
                blockedSlots: []
            });
        }
    }
}

module.exports = new AppointmentController();

