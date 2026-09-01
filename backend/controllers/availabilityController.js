const { supabase, isSupabaseConfigured } = require("../config/supabase");

// Fallback in-memory store
const inMemoryAvailability = {};
const inMemoryBlockedDates = {};

const DAYS_TITLE_CASE = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function toTitleCaseDay(dayStr) {
    if (!dayStr) return "Monday";
    const lower = dayStr.trim().toLowerCase();
    const found = DAYS_TITLE_CASE.find(d => d.toLowerCase() === lower);
    return found || "Monday";
}

function parse12hTime(timeStr) {
    if (!timeStr) return 540; // Default 09:00 AM (540 mins)
    const str = timeStr.trim();
    const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) {
        const parts = str.split(":");
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        return h * 60 + m;
    }
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === "PM" && h < 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h * 60 + m;
}

function format12hTime(minutes) {
    let h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? "PM" : "AM";
    let displayH = h % 12;
    if (displayH === 0) displayH = 12;
    return `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

const getDefaultWeeklySchedule = () => {
    return DAYS_TITLE_CASE.map(day => ({
        day_of_week: day,
        is_available: day !== "Sunday",
        start_time: "09:00 AM",
        end_time: "05:00 PM",
        slot_duration_minutes: 30,
        time_windows: [
            { start_time: "09:00 AM", end_time: "01:00 PM" },
            { start_time: "05:00 PM", end_time: "08:00 PM" }
        ]
    }));
};

class AvailabilityController {
    /**
     * Get doctor's weekly availability schedule
     */
    async getAvailability(req, res) {
        try {
            const doctorId = req.doctor?.id || req.doctor?.doctor_id;

            if (isSupabaseConfigured) {
                const { data, error } = await supabase
                    .from("availability")
                    .select("*")
                    .eq("doctor_id", doctorId);

                if (!error && data && data.length > 0) {
                    const scheduleMap = {};
                    data.forEach(item => {
                        scheduleMap[toTitleCaseDay(item.day_of_week)] = item;
                    });

                    const fullSchedule = DAYS_TITLE_CASE.map(day => {
                        const existing = scheduleMap[day];
                        if (existing) {
                            let windows = existing.time_windows || [
                                { start_time: existing.start_time || "09:00 AM", end_time: existing.end_time || "05:00 PM" }
                            ];
                            return {
                                id: existing.id,
                                doctor_id: doctorId,
                                day_of_week: day,
                                is_available: Boolean(existing.is_available),
                                start_time: existing.start_time || "09:00 AM",
                                end_time: existing.end_time || "05:00 PM",
                                slot_duration_minutes: existing.slot_duration_minutes || existing.slot_duration || 30,
                                time_windows: windows
                            };
                        }
                        return {
                            doctor_id: doctorId,
                            day_of_week: day,
                            is_available: day !== "Sunday",
                            start_time: "09:00 AM",
                            end_time: "05:00 PM",
                            slot_duration_minutes: 30,
                            time_windows: [
                                { start_time: "09:00 AM", end_time: "01:00 PM" },
                                { start_time: "05:00 PM", end_time: "08:00 PM" }
                            ]
                        };
                    });

                    return res.json({
                        success: true,
                        availability: fullSchedule,
                        slotDuration: data[0]?.slot_duration_minutes || data[0]?.slot_duration || 30
                    });
                }
            }

            // Fallback store
            if (!inMemoryAvailability[doctorId]) {
                inMemoryAvailability[doctorId] = getDefaultWeeklySchedule();
            }

            return res.json({
                success: true,
                availability: inMemoryAvailability[doctorId],
                slotDuration: inMemoryAvailability[doctorId][0]?.slot_duration_minutes || 30
            });
        } catch (error) {
            console.error("[AvailabilityController] Get error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Save/Update weekly availability schedule directly to Supabase table
     */
    async updateAvailability(req, res) {
        try {
            const doctorId = req.doctor?.id || req.doctor?.doctor_id;
            const { schedule, slotDuration = 30 } = req.body;

            if (!Array.isArray(schedule)) {
                return res.status(400).json({ success: false, message: "Invalid schedule array" });
            }

            if (isSupabaseConfigured) {
                // Ensure doctor entry exists in doctors table if foreign key constraint exists
                try {
                    const { data: docExists } = await supabase
                        .from("doctors")
                        .select("id")
                        .eq("id", doctorId)
                        .maybeSingle();

                    if (!docExists) {
                        await supabase.from("doctors").insert([{
                            id: doctorId,
                            full_name: req.doctor?.fullName || "Doctor",
                            email: req.doctor?.email || `doctor-${Date.now()}@vedika.com`
                        }]);
                    }
                } catch (e) {
                    console.warn("[AvailabilityController] Doctor auto-insert check warning:", e.message);
                }

                // Omit id from upsert payload so Postgres ON CONFLICT (doctor_id, day_of_week) cleanly updates existing rows!
                const upsertData = schedule.map(item => {
                    const titleDay = toTitleCaseDay(item.day_of_week);
                    const windows = item.time_windows || [];
                    const firstWin = windows[0] || {};
                    const lastWin = windows[windows.length - 1] || {};

                    const startTime = item.start_time || firstWin.start_time || "09:00 AM";
                    const endTime = item.end_time || lastWin.end_time || "05:00 PM";

                    return {
                        doctor_id: doctorId,
                        day_of_week: titleDay,
                        is_available: Boolean(item.is_available),
                        start_time: startTime,
                        end_time: endTime,
                        slot_duration_minutes: Number(slotDuration) || Number(item.slot_duration_minutes) || 30,
                        updated_at: new Date().toISOString()
                    };
                });

                console.log("[AvailabilityController] Upserting without ID to Supabase for doctor:", doctorId);

                const { data, error } = await supabase
                    .from("availability")
                    .upsert(upsertData, { onConflict: "doctor_id,day_of_week" })
                    .select();

                if (!error && data) {
                    console.log("[AvailabilityController] Supabase Upsert Success! Saved rows count:", data.length);
                    inMemoryAvailability[doctorId] = data;
                    return res.json({
                        success: true,
                        message: "Availability schedule saved successfully to Supabase",
                        availability: data
                    });
                } else {
                    console.error("[AvailabilityController] Supabase upsert error:", error);
                    return res.status(500).json({
                        success: false,
                        message: `Supabase database error: ${error?.message || "Failed to update availability table"}`
                    });
                }
            }

            // Fallback in-memory update
            inMemoryAvailability[doctorId] = schedule.map(item => ({
                doctor_id: doctorId,
                day_of_week: toTitleCaseDay(item.day_of_week),
                is_available: Boolean(item.is_available),
                start_time: item.start_time || "09:00 AM",
                end_time: item.end_time || "05:00 PM",
                slot_duration_minutes: Number(slotDuration) || 30,
                time_windows: item.time_windows || []
            }));

            return res.json({
                success: true,
                message: "Availability schedule saved successfully",
                availability: inMemoryAvailability[doctorId]
            });
        } catch (error) {
            console.error("[AvailabilityController] Update error:", error);
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Get blocked dates for doctor
     */
    async getBlockedDates(req, res) {
        try {
            const doctorId = req.doctor?.id || req.doctor?.doctor_id;

            if (isSupabaseConfigured) {
                const { data, error } = await supabase
                    .from("blocked_dates")
                    .select("*")
                    .eq("doctor_id", doctorId)
                    .order("blocked_date", { ascending: true });

                if (!error && data) {
                    return res.json({ success: true, blockedDates: data });
                }
            }

            return res.json({
                success: true,
                blockedDates: inMemoryBlockedDates[doctorId] || []
            });
        } catch (error) {
            console.error("[AvailabilityController] Get blocked dates error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Block a specific date
     */
    async addBlockedDate(req, res) {
        try {
            const doctorId = req.doctor?.id || req.doctor?.doctor_id;
            const { date, reason = "Blocked / Leave" } = req.body;

            if (!date) {
                return res.status(400).json({ success: false, message: "Date is required (YYYY-MM-DD)" });
            }

            if (isSupabaseConfigured) {
                const { data, error } = await supabase
                    .from("blocked_dates")
                    .upsert([{
                        doctor_id: doctorId,
                        blocked_date: date,
                        reason: reason
                    }], { onConflict: "doctor_id,blocked_date" })
                    .select()
                    .single();

                if (!error) {
                    return res.status(201).json({ success: true, blockedDate: data });
                }
            }

            if (!inMemoryBlockedDates[doctorId]) {
                inMemoryBlockedDates[doctorId] = [];
            }
            const newItem = {
                id: `blocked-${Date.now()}`,
                doctor_id: doctorId,
                blocked_date: date,
                reason: reason
            };
            inMemoryBlockedDates[doctorId] = inMemoryBlockedDates[doctorId].filter(b => b.blocked_date !== date);
            inMemoryBlockedDates[doctorId].push(newItem);

            return res.status(201).json({ success: true, blockedDate: newItem });
        } catch (error) {
            console.error("[AvailabilityController] Add blocked date error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete a blocked date
     */
    async deleteBlockedDate(req, res) {
        try {
            const doctorId = req.doctor?.id || req.doctor?.doctor_id;
            const { id } = req.params;

            if (isSupabaseConfigured) {
                const { error } = await supabase
                    .from("blocked_dates")
                    .delete()
                    .eq("id", id)
                    .eq("doctor_id", doctorId);

                if (!error) {
                    return res.json({ success: true, message: "Blocked date removed" });
                }
            }

            if (inMemoryBlockedDates[doctorId]) {
                inMemoryBlockedDates[doctorId] = inMemoryBlockedDates[doctorId].filter(b => b.id !== id);
            }

            return res.json({ success: true, message: "Blocked date removed" });
        } catch (error) {
            console.error("[AvailabilityController] Delete blocked date error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Calculate available bookable slots for a doctor on a specific date
     */
    async getAvailableSlots(req, res) {
        try {
            const doctorId = req.query.doctorId || req.doctor?.id || req.doctor?.doctor_id;
            const dateStr = req.query.date; // YYYY-MM-DD

            if (!doctorId || !dateStr) {
                return res.status(400).json({ success: false, message: "doctorId and date (YYYY-MM-DD) are required" });
            }

            const targetDate = new Date(dateStr);
            if (isNaN(targetDate.getTime())) {
                return res.status(400).json({ success: false, message: "Invalid date format" });
            }

            // 1. Check if Date is Blocked
            let isBlocked = false;
            let blockReason = "";

            if (isSupabaseConfigured) {
                const { data: blockData } = await supabase
                    .from("blocked_dates")
                    .select("*")
                    .eq("doctor_id", doctorId)
                    .eq("blocked_date", dateStr)
                    .maybeSingle();

                if (blockData) {
                    isBlocked = true;
                    blockReason = blockData.reason || "Doctor has blocked this date.";
                }
            } else if (inMemoryBlockedDates[doctorId]) {
                const b = inMemoryBlockedDates[doctorId].find(item => item.blocked_date === dateStr);
                if (b) {
                    isBlocked = true;
                    blockReason = b.reason;
                }
            }

            if (isBlocked) {
                return res.json({
                    success: true,
                    available: false,
                    reason: `Doctor is unavailable on ${dateStr}: ${blockReason}`,
                    slots: []
                });
            }

            // 2. Check Day of Week Availability
            const dayIndex = targetDate.getDay();
            const dayNamesTitle = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const dayName = dayNamesTitle[dayIndex];

            let daySchedule = null;

            if (isSupabaseConfigured) {
                const { data: availData } = await supabase
                    .from("availability")
                    .select("*")
                    .eq("doctor_id", doctorId)
                    .eq("day_of_week", dayName)
                    .maybeSingle();

                if (availData) {
                    daySchedule = availData;
                }
            } else if (inMemoryAvailability[doctorId]) {
                daySchedule = inMemoryAvailability[doctorId].find(d => d.day_of_week === dayName);
            }

            if (!daySchedule) {
                daySchedule = {
                    is_available: dayName !== "Sunday",
                    start_time: "09:00 AM",
                    end_time: "05:00 PM",
                    slot_duration_minutes: 30,
                    time_windows: [
                        { start_time: "09:00 AM", end_time: "01:00 PM" },
                        { start_time: "05:00 PM", end_time: "08:00 PM" }
                    ]
                };
            }

            if (!daySchedule.is_available) {
                return res.json({
                    success: true,
                    available: false,
                    reason: `Doctor does not consult on ${dayName}s.`,
                    slots: []
                });
            }

            // 3. Generate Time Slots
            const slotDurationMinutes = daySchedule.slot_duration_minutes || daySchedule.slot_duration || 30;
            const windows = daySchedule.time_windows && daySchedule.time_windows.length > 0
                ? daySchedule.time_windows
                : [{ start_time: daySchedule.start_time || "09:00 AM", end_time: daySchedule.end_time || "05:00 PM" }];

            const generatedSlots = [];

            windows.forEach(w => {
                const startMins = parse12hTime(w.start_time || daySchedule.start_time || "09:00 AM");
                const endMins = parse12hTime(w.end_time || daySchedule.end_time || "05:00 PM");

                let current = startMins;

                while (current + slotDurationMinutes <= endMins) {
                    const formattedTime = format12hTime(current);

                    generatedSlots.push({
                        time: formattedTime,
                        minutes: current
                    });

                    current += slotDurationMinutes;
                }
            });

            // 4. Fetch Existing Appointments
            let bookedTimes = new Set();
            if (isSupabaseConfigured) {
                const { data: existingApps } = await supabase
                    .from("appointments")
                    .select("appointment_time, status")
                    .eq("doctor_id", doctorId)
                    .eq("appointment_date", dateStr)
                    .neq("status", "cancelled");

                if (existingApps) {
                    existingApps.forEach(a => {
                        if (a.appointment_time) {
                            bookedTimes.add(a.appointment_time.trim().toUpperCase());
                        }
                    });
                }
            }

            try {
                const appointmentController = require("./appointmentController");
                const memApps = appointmentController.getInMemoryAppointments();
                memApps.forEach(a => {
                    if (a.doctor_id === doctorId && a.appointment_date === dateStr && a.status !== "cancelled") {
                        if (a.appointment_time) {
                            bookedTimes.add(a.appointment_time.trim().toUpperCase());
                        }
                    }
                });
            } catch (err) {
                // Ignore
            }

            const now = new Date();
            const isToday = dateStr === now.toISOString().split("T")[0];
            const currentMinutesNow = now.getHours() * 60 + now.getMinutes();

            const finalSlots = generatedSlots.map(s => {
                const timeUpper = s.time.toUpperCase();
                const isBooked = bookedTimes.has(timeUpper);
                const isPast = isToday && s.minutes <= currentMinutesNow;

                return {
                    time: s.time,
                    available: !isBooked && !isPast,
                    reason: isBooked ? "Booked" : isPast ? "Passed" : "Available"
                };
            });

            return res.json({
                success: true,
                available: true,
                date: dateStr,
                dayOfWeek: dayName,
                slotDuration: slotDurationMinutes,
                slots: finalSlots
            });

        } catch (error) {
            console.error("[AvailabilityController] Get slots error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new AvailabilityController();
