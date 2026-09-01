const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/* ── helper: resolve doctor ID from req.doctor ── */
const getDoctorId = (req) => req.doctor?.id || req.doctor?.doctor_id;

/* ── helper: resolve patient details from users & patients tables ── */
const getPatientDetails = async (patientId) => {
    if (!patientId || !supabase) return null;
    try {
        // Fetch user record safely
        const { data: userData } = await supabase
            .from("users")
            .select("id, full_name, first_name, last_name, email, phone, created_at")
            .eq("id", patientId)
            .maybeSingle();

        // Fetch patient profile safely (by user_id or id)
        const { data: pData } = await supabase
            .from("patients")
            .select("id, user_id, full_name, first_name, last_name, email, gender, date_of_birth, blood_group, locality, address, profile_photo, patient_code, created_at")
            .or(`user_id.eq.${patientId},id.eq.${patientId}`)
            .maybeSingle();

        if (!userData && !pData) return null;

        const fullName = pData?.full_name 
            || userData?.full_name 
            || `${pData?.first_name || userData?.first_name || ''} ${pData?.last_name || userData?.last_name || ''}`.trim() 
            || "Patient";

        return {
            id: pData?.id || userData?.id || patientId,
            user_id: pData?.user_id || userData?.id || patientId,
            full_name: fullName,
            email: pData?.email || userData?.email || "",
            phone: userData?.phone || "",
            gender: pData?.gender || null,
            date_of_birth: pData?.date_of_birth || null,
            blood_group: pData?.blood_group || null,
            locality: pData?.locality || null,
            address: pData?.address || null,
            city: pData?.locality || null,
            patient_code: pData?.patient_code || null,
            profile_photo: pData?.profile_photo || null,
            created_at: pData?.created_at || userData?.created_at || null,
        };
    } catch (err) {
        console.error("[QuestionController] getPatientDetails error:", err);
        return null;
    }
};

/* ══════════════════════════════════════════════════
   GET /api/questions        — list all questions for doctor
   GET /api/questions?status=pending|answered
   GET /api/questions?q=searchTerm
══════════════════════════════════════════════════ */
const getQuestions = async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const doctorId = getDoctorId(req);
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    try {
        let query = supabase
            .from("questions")
            .select("id, question_text, answer_text, status, created_at, answered_at, updated_at, report_url, patient_id")
            .eq("doctor_id", doctorId)
            .order("created_at", { ascending: false });

        if (req.query.status && req.query.status !== "all") {
            query = query.eq("status", req.query.status);
        }
        if (req.query.q) {
            query = query.ilike("question_text", `%${req.query.q}%`);
        }

        const { data: questions, error } = await query;
        if (error) throw error;

        // Fetch patient info for each question
        const enriched = await Promise.all((questions || []).map(async (q) => {
            const patient = await getPatientDetails(q.patient_id);
            return { ...q, patient };
        }));

        res.json({ questions: enriched, total: enriched.length });
    } catch (err) {
        console.error("[QuestionController] getQuestions error:", err);
        res.status(500).json({ error: "Failed to fetch questions", details: err.message });
    }
};

/* ══════════════════════════════════════════════════
   GET /api/questions/:id   — single question detail
══════════════════════════════════════════════════ */
const getQuestionById = async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const doctorId = getDoctorId(req);
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    try {
        const { data, error } = await supabase
            .from("questions")
            .select("id, question_text, answer_text, status, created_at, answered_at, updated_at, report_url, patient_id")
            .eq("id", req.params.id)
            .eq("doctor_id", doctorId)
            .single();

        if (error) throw error;
        const patient = await getPatientDetails(data.patient_id);
        res.json({ question: { ...data, patient } });
    } catch (err) {
        console.error("[QuestionController] getQuestionById error:", err);
        res.status(500).json({ error: "Failed to fetch question", details: err.message });
    }
};

/* ══════════════════════════════════════════════════
   POST /api/questions/:id/answer
   Body: { answer_text }
══════════════════════════════════════════════════ */
const answerQuestion = async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const doctorId = getDoctorId(req);
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    const { answer_text } = req.body;
    if (!answer_text?.trim()) return res.status(400).json({ error: "Answer text is required" });

    try {
        const { data, error } = await supabase
            .from("questions")
            .update({
                answer_text: answer_text.trim(),
                status: "answered",
                answered_at: new Date().toISOString(),
            })
            .eq("id", req.params.id)
            .eq("doctor_id", doctorId)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, question: data });
    } catch (err) {
        console.error("[QuestionController] answerQuestion error:", err);
        res.status(500).json({ error: "Failed to save answer", details: err.message });
    }
};

/* ══════════════════════════════════════════════════
   PATCH /api/questions/:id/status
   Body: { status: "pending"|"answered" }
══════════════════════════════════════════════════ */
const updateQuestionStatus = async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const doctorId = getDoctorId(req);
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    const { status } = req.body;
    if (!["pending", "answered"].includes(status)) return res.status(400).json({ error: "Invalid status" });

    try {
        const { data, error } = await supabase
            .from("questions")
            .update({ status })
            .eq("id", req.params.id)
            .eq("doctor_id", doctorId)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, question: data });
    } catch (err) {
        console.error("[QuestionController] updateStatus error:", err);
        res.status(500).json({ error: "Failed to update status", details: err.message });
    }
};

/* ══════════════════════════════════════════════════
   GET /api/questions/stats   — summary counts
══════════════════════════════════════════════════ */
const getStats = async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const doctorId = getDoctorId(req);
    if (!doctorId) return res.status(401).json({ error: "Unauthorized" });

    try {
        const { data, error } = await supabase
            .from("questions")
            .select("status")
            .eq("doctor_id", doctorId);

        if (error) throw error;

        const total = (data || []).length;
        const pending = (data || []).filter(q => q.status === "pending").length;
        const answered = (data || []).filter(q => q.status === "answered").length;

        res.json({ total, pending, answered });
    } catch (err) {
        console.error("[QuestionController] getStats error:", err);
        res.status(500).json({ error: "Failed to fetch stats", details: err.message });
    }
};

module.exports = { getQuestions, getQuestionById, answerQuestion, updateQuestionStatus, getStats };
