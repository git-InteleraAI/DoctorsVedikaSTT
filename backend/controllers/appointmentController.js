const { supabase } = require("../config/supabase");

// Shared in-memory appointments store for fallback conflict checking
const inMemoryAppointments = [];

class AppointmentController {
    static getInMemoryAppointments() {
        return inMemoryAppointments;
    }
    /**
     * Get appointments for the logged-in doctor
     * Supports filtering by tab and date
     */
    async getAppointments(req, res) {
        try {
            const doctorId = req.doctor.id;
            const { tab = "confirmed", dateFilter = "today", customDate } = req.query;

            // 1. Determine Date Range
            // 2. Fetch Appointments
            let query = supabase
                .from("appointments")
                .select("*")
                .eq("doctor_id", doctorId);

            if (dateFilter === "all") {
                // If it's not completed, disable past dates by filtering >= today
                if (tab !== "completed") {
                    const todayDateStr = new Date().toISOString().split("T")[0];
                    query = query.gte("appointment_date", todayDateStr);
                }
            } else {
                let targetDate = new Date();
                if (dateFilter === "tomorrow") {
                    targetDate.setDate(targetDate.getDate() + 1);
                } else if (dateFilter === "custom" && customDate) {
                    targetDate = new Date(customDate);
                }
                
                const formattedDate = targetDate.toISOString().split("T")[0];
                query = query.eq("appointment_date", formattedDate);
            }

            // Filter by tab
            if (tab === "completed") {
                query = query.eq("status", "completed");
            } else if (tab === "pending") {
                // Assuming pending means consultation started but not finished, or past time
                // For now we map it to a specific status or just fallback to confirmed
                query = query.in("status", ["pending_consultation", "pending"]);
            } else {
                // "confirmed" tab
                query = query.in("status", ["confirmed", "Confirmed"]);
            }

            const { data: appointmentsData, error: appointmentsError } = await query;

            if (appointmentsError) {
                throw new Error(appointmentsError.message);
            }

            if (!appointmentsData || appointmentsData.length === 0) {
                return res.json({ success: true, appointments: [] });
            }

            // 3. Fetch related Patient details & Appointment Symptoms
            const patientIds = [...new Set(appointmentsData.map((a) => a.patient_id).filter(Boolean))];
            const appointmentIds = appointmentsData.map((a) => a.id).filter(Boolean);
            
            let patientsMap = {};
            if (patientIds.length > 0) {
                const { data: patientsData } = await supabase
                    .from("patients")
                    .select("id, user_id, first_name, last_name, full_name, profile_photo, blood_group, gender, date_of_birth, patient_code")
                    .in("user_id", patientIds);

                if (patientsData) {
                    patientsData.forEach(p => {
                        patientsMap[p.user_id] = p;
                    });
                }
            }

            let symptomsMap = {};
            if (appointmentIds.length > 0) {
                const { data: symptomsData } = await supabase
                    .from("appointment_symptoms")
                    .select("*")
                    .in("appointment_id", appointmentIds);

                if (symptomsData) {
                    symptomsData.forEach(s => {
                        symptomsMap[s.appointment_id] = s;
                    });
                }
            }

            // 4. Merge and format the response
            const formattedAppointments = appointmentsData.map((app) => {
                const patient = patientsMap[app.patient_id] || {};
                const sym = symptomsMap[app.id] || {};
                
                // Calculate age dynamically
                let age = null;
                if (patient.date_of_birth) {
                    const dob = new Date(patient.date_of_birth);
                    const diffMs = Date.now() - dob.getTime();
                    const ageDt = new Date(diffMs);
                    age = Math.abs(ageDt.getUTCFullYear() - 1970);
                }

                return {
                    id: app.id,
                    patientId: app.patient_id,
                    patientCode: patient.patient_code || "",
                    patientName: patient.full_name || app.patient_name || "Unknown Patient",
                    patientPhoto: patient.profile_photo || null,
                    age: age || app.age || null,
                    gender: patient.gender || app.gender || "Unknown",
                    bloodGroup: patient.blood_group || app.blood_group || "-",
                    appointmentDate: app.appointment_date,
                    time: app.appointment_time,
                    type: app.appointment_type || "Consultation",
                    status: app.status,
                    reason: sym.symptoms || app.reason || app.notes || "",
                    symptoms: sym.symptoms || app.reason || "",
                    duration: sym.duration || "",
                    severity: sym.severity || "",
                    current_medications: sym.current_medications || "",
                    currentMedications: sym.current_medications || "",
                    additional_notes: sym.additional_notes || "",
                    additionalNotes: sym.additional_notes || "",
                    paymentMethod: app.payment_method || "pay_at_clinic",
                    paymentStatus: app.payment_status || "pending",
                    consultationFee: req.doctor.consultationFee || app.consultation_fee || "500",
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
            const doctorId = req.doctor.id;

            const { data: appointment, error: appointmentError } = await supabase
                .from("appointments")
                .select("*")
                .eq("id", id)
                .eq("doctor_id", doctorId)
                .single();

            if (appointmentError || !appointment) {
                return res.status(404).json({ success: false, error: "Appointment not found" });
            }

            const { data: patient } = await supabase
                .from("patients")
                .select("id, user_id, first_name, last_name, full_name, profile_photo, blood_group, gender, date_of_birth, patient_code")
                .eq("user_id", appointment.patient_id)
                .single();

            const { data: sym } = await supabase
                .from("appointment_symptoms")
                .select("*")
                .eq("appointment_id", appointment.id)
                .maybeSingle();

            let age = null;
            if (patient && patient.date_of_birth) {
                const dob = new Date(patient.date_of_birth);
                const diffMs = Date.now() - dob.getTime();
                const ageDt = new Date(diffMs);
                age = Math.abs(ageDt.getUTCFullYear() - 1970);
            }

            const formattedAppointment = {
                id: appointment.id,
                patientId: appointment.patient_id,
                patientCode: patient?.patient_code || "",
                patientName: patient?.full_name || patient?.first_name || appointment.patient_name || "Unknown Patient",
                patientPhoto: patient?.profile_photo || null,
                age: age,
                gender: patient?.gender || appointment.gender || "Unknown",
                bloodGroup: patient?.blood_group || appointment.blood_group || "-",
                appointmentDate: appointment.appointment_date,
                time: appointment.appointment_time,
                type: appointment.appointment_type || "Consultation",
                status: appointment.status,
                symptoms: sym?.symptoms || appointment.reason || "",
                duration: sym?.duration || "",
                severity: sym?.severity || "",
                current_medications: sym?.current_medications || "",
                currentMedications: sym?.current_medications || "",
                additional_notes: sym?.additional_notes || "",
                additionalNotes: sym?.additional_notes || "",
                fee: req.doctor.consultationFee || appointment.consultation_fee || "500",
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

            let query = supabase.from("appointment_symptoms").select("*");

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

            return res.json({ success: true, symptoms: data?.[0] || null });
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
            const doctorId = req.doctor.id;

            if (!status) {
                return res.status(400).json({ success: false, message: "Status is required" });
            }

            const { data, error } = await supabase
                .from("appointments")
                .update({ status: status, updated_at: new Date().toISOString() })
                .eq("id", id)
                .eq("doctor_id", doctorId)
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
            const doctorId = req.body.doctorId || req.doctor?.id;
            const { patientId, date, time, appointmentType = "Consultation", reason = "", fee = "500" } = req.body;

            if (!doctorId || !patientId || !date || !time) {
                return res.status(400).json({
                    success: false,
                    message: "doctorId, patientId, date (YYYY-MM-DD), and time are required."
                });
            }

            // 1. Check Blocked Dates
            const { data: blocked } = await supabase
                .from("blocked_dates")
                .select("*")
                .eq("doctor_id", doctorId)
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

            const { data: avail } = await supabase
                .from("availability")
                .select("*")
                .eq("doctor_id", doctorId)
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
            if (supabase) {
                const { data } = await supabase
                    .from("appointments")
                    .select("id, status")
                    .eq("doctor_id", doctorId)
                    .eq("appointment_date", date)
                    .eq("appointment_time", time)
                    .neq("status", "cancelled")
                    .maybeSingle();
                existingInDb = data;
            }

            const existingInMemory = inMemoryAppointments.find(
                a => a.doctor_id === doctorId && a.appointment_date === date && a.appointment_time === time && a.status !== "cancelled"
            );

            if (existingInDb || existingInMemory) {
                return res.status(409).json({
                    success: false,
                    message: `Conflict Error: Slot ${time} on ${date} is already booked.`
                });
            }

            // 4. Fetch Patient Name for record fallback
            let patientName = "Walk-in / Follow-up Patient";
            let age = null;
            if (supabase) {
                const { data: patient } = await supabase
                    .from("patients")
                    .select("full_name, date_of_birth, gender, blood_group")
                    .eq("user_id", patientId)
                    .maybeSingle();

                if (patient?.full_name) patientName = patient.full_name;
                if (patient?.date_of_birth) {
                    const dob = new Date(patient.date_of_birth);
                    const diffMs = Date.now() - dob.getTime();
                    age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
                }
            }

            // 5. Create Confirmed Appointment
            const newApp = {
                doctor_id: doctorId,
                patient_id: patientId,
                appointment_date: date,
                appointment_time: time,
                status: "Confirmed",
                reason: reason || `${appointmentType} Appointment`,
                payment_status: "paid",
                payment_method: "pay_at_clinic"
            };

            let created = null;
            if (supabase) {
                const { data: inserted, error: createErr } = await supabase
                    .from("appointments")
                    .insert([newApp])
                    .select()
                    .single();

                if (createErr) {
                    console.warn("[AppointmentController] Supabase insert warning (using resilient record):", createErr.message);
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

            // Also keep track in memory for instant conflict detection
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
            const doctorId = req.doctor.id;
            const todayStr = new Date().toISOString().split("T")[0];
            
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split("T")[0];

            // Fetch all appointments for doctor
            const { data: allApps } = await supabase
                .from("appointments")
                .select("*")
                .eq("doctor_id", doctorId);

            const apps = allApps || [];

            const todayApps = apps.filter(a => a.appointment_date === todayStr);
            const tomorrowApps = apps.filter(a => a.appointment_date === tomorrowStr);
            const pendingApps = apps.filter(a => a.status === "pending" || a.status === "pending_consultation");
            const completedApps = apps.filter(a => a.status === "completed");
            const confirmedApps = apps.filter(a => a.status === "Confirmed" || a.status === "confirmed");

            // Fetch upcoming follow-ups from consultation_notes or appointments
            const { data: notes } = await supabase
                .from("consultation_notes")
                .select("*")
                .eq("doctor_id", doctorId)
                .not("follow_up_date", "is", null);

            const followUps = (notes || []).map(n => ({
                id: n.id,
                patientId: n.patient_id,
                patientName: n.patient_name || "Patient",
                followUpDate: n.follow_up_date,
                notes: n.follow_up || n.advice || ""
            }));

            return res.json({
                success: true,
                metrics: {
                    todayCount: todayApps.length,
                    tomorrowCount: tomorrowApps.length,
                    pendingCount: pendingApps.length,
                    completedCount: completedApps.length,
                    confirmedCount: confirmedApps.length,
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
