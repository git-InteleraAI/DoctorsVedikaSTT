import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiConfig";
import {
    getTeluguIndication,
    getTeluguDosage,
    getTeluguFrequency,
    getTeluguFoodTiming,
    getTeluguDuration,
    translateFreeTextApi,
    DIRECTIONS_FALLBACK_MAP
} from "../utils/translationUtils";
import "./ConsultationSummary.css";

const API = getApiBaseUrl();

const dosageOptions = [
    "¼ Tablet",
    "½ Tablet",
    "1 Tablet",
    "2 Tablets",
    "5 ml",
    "10 ml",
    "15 ml",
    "20 ml",
    "1 Sachet",
    "1 Capsule",
];

const frequencyOptions = [
    "1-0-0",
    "0-1-0",
    "0-0-1",
    "1-0-1",
    "1-1-0",
    "0-1-1",
    "1-1-1",
    "2-0-2",
    "2-2-2",
    "SOS / As needed",
];

const durationOptions = [
    "1 Day",
    "2 Days",
    "3 Days",
    "5 Days",
    "7 Days",
    "10 Days",
    "14 Days",
    "21 Days",
    "1 Month",
    "2 Months",
    "3 Months",
];

const foodTimingOptions = [
    "Before food",
    "After food",
    "With food",
    "Empty stomach",
    "Any time",
];

const emptyMedicine = () => ({
    name: "",
    indication: "",
    dosage: "",
    frequency: "",
    duration: "",
    foodTiming: "",
    instructions: "",
});

export default function EditConsultationReport() {
    const { patientId, consultationId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const [summary, setSummary] = useState({
        consultation_overview: "",
        chief_complaint: "",
        history_of_present_illness: "",
        assessment: "",
        diagnosis: [],
        treatment_plan: "",
        advice: [],
        follow_up: "",
        doctor_notes: "",
    });

    const [medicines, setMedicines] = useState([]);

    useEffect(() => {
        const fetchRecord = async () => {
            try {
                setLoading(true);
                // Fetch existing consultation pdf/data JSON
                const res = await fetch(`${API}/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf?format=json`);
                if (!res.ok) {
                    // Fallback fetch: try patient records endpoint if available
                    const recordRes = await fetch(`${API}/api/v1/clinical/patient-records/${encodeURIComponent(patientId)}`);
                    if (recordRes.ok) {
                        const recData = await recordRes.json();
                        const note = (recData.consultations || recData.history || []).find(
                            c => c.consultationId === consultationId || c.appointmentId === consultationId || String(c.id) === String(consultationId)
                        );
                        if (note) {
                            populateData(note);
                            setLoading(false);
                            return;
                        }
                    }
                }
                
                // If PDF/json fetch returns data directly
                if (res.headers.get("content-type")?.includes("application/json")) {
                    const data = await res.json();
                    populateData(data);
                } else {
                    // Fetch via patient visits endpoint
                    const visitsRes = await fetch(`${API}/api/v1/clinical/patient-records/${encodeURIComponent(patientId)}`);
                    if (visitsRes.ok) {
                        const vData = await visitsRes.json();
                        const match = (vData.consultationHistory || vData.visits || []).find(
                            v => v.consultationId === consultationId || v.appointmentId === consultationId
                        );
                        if (match) {
                            populateData(match);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to load consultation for editing:", err);
                setError("Unable to load consultation details. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        fetchRecord();
    }, [patientId, consultationId]);

    const populateData = (record) => {
        const s = record.summary || record;
        setSummary({
            consultation_overview: s.consultation_overview || s.overview || "",
            chief_complaint: s.chief_complaint || s.chiefComplaint || "",
            history_of_present_illness: s.history_of_present_illness || s.historyOfPresentIllness || "",
            assessment: s.assessment || "",
            diagnosis: Array.isArray(s.diagnosis) ? s.diagnosis : (s.diagnosis ? [String(s.diagnosis)] : []),
            treatment_plan: s.treatment_plan || s.treatmentPlan || "",
            advice: Array.isArray(s.advice) ? s.advice : (s.advice ? [String(s.advice)] : []),
            follow_up: s.follow_up || s.followUp || "",
            doctor_notes: s.doctor_notes || s.doctorNotes || "",
        });

        const rawMeds = record.medications || record.prescription?.medicines || s.medications_discussed || [];
        const normMeds = (Array.isArray(rawMeds) ? rawMeds : []).map(m => ({
            name: m.name || m.medicine || m.drug || "",
            indication: m.indication || m.purpose || m.reason || m.for || "",
            dosage: m.dosage || "",
            frequency: m.frequency || m.time || "",
            duration: m.duration || "",
            foodTiming: m.foodTiming || m.food_timing || m.food || "",
            instructions: m.instructions || "",
        }));

        setMedicines(normMeds);
    };

    const updateField = (field, value) => {
        setSummary(prev => ({ ...prev, [field]: value }));
    };

    const updateMedicine = (index, key, value) => {
        setMedicines(prev => {
            const next = [...prev];
            const updated = { ...next[index], [key]: value };
            if (key === "indication") updated.indication_te = getTeluguIndication(value);
            if (key === "dosage") updated.dosage_te = getTeluguDosage(value);
            if (key === "frequency") updated.frequency_te = getTeluguFrequency(value);
            if (key === "foodTiming") updated.foodTiming_te = getTeluguFoodTiming(value);
            if (key === "duration") updated.duration_te = getTeluguDuration(value);
            if (key === "instructions") {
                const fallback = DIRECTIONS_FALLBACK_MAP[String(value || "").trim().toLowerCase()];
                if (fallback) updated.instructions_te = fallback;
            }
            next[index] = updated;
            return next;
        });
    };

    const handleTranslateDirections = async (index) => {
        const med = medicines[index];
        if (!med || !med.instructions) return;
        const translated = await translateFreeTextApi(med.instructions);
        if (translated) {
            setMedicines(prev => prev.map((m, i) => i === index ? { ...m, instructions_te: translated } : m));
        }
    };

    const addMedicine = () => {
        setMedicines(prev => [...prev, emptyMedicine()]);
    };

    const removeMedicine = (index) => {
        setMedicines(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);

            const validMedicines = medicines
                .filter(m => m.name && m.name.trim())
                .map(m => ({
                    name: m.name.trim(),
                    indication: (m.indication || "").trim(),
                    indication_te: (m.indication_te || getTeluguIndication(m.indication)).trim(),
                    dosage: (m.dosage || "").trim(),
                    dosage_te: (m.dosage_te || getTeluguDosage(m.dosage)).trim(),
                    frequency: (m.frequency || "").trim(),
                    frequency_te: (m.frequency_te || getTeluguFrequency(m.frequency)).trim(),
                    duration: (m.duration || "").trim(),
                    duration_te: (m.duration_te || getTeluguDuration(m.duration)).trim(),
                    foodTiming: (m.foodTiming || "").trim(),
                    foodTiming_te: (m.foodTiming_te || getTeluguFoodTiming(m.foodTiming)).trim(),
                    instructions: (m.instructions || "").trim(),
                    instructions_te: (m.instructions_te || "").trim(),
                }));

            const updatedSummary = {
                ...summary,
                medications_discussed: validMedicines,
            };

            const payload = {
                summary: updatedSummary,
                diagnosis: Array.isArray(updatedSummary.diagnosis) ? updatedSummary.diagnosis : [],
                medications: validMedicines,
                prescription: {
                    medicines: validMedicines,
                    advice: Array.isArray(updatedSummary.advice)
                        ? updatedSummary.advice.join("\n")
                        : (updatedSummary.advice || ""),
                    follow_up: updatedSummary.follow_up || "",
                },
            };

            const res = await fetch(`${API}/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to update consultation record.");
            }

            navigate(`/patients/${encodeURIComponent(patientId)}`, {
                state: {
                    reportUpdated: true,
                    updatedConsultationId: consultationId,
                },
            });
        } catch (err) {
            console.error("Save error:", err);
            setError(err.message || "Failed to save updated consultation report.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: "40px", textAlign: "center", fontFamily: "Outfit, sans-serif" }}>
                <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: "2rem", color: "#0d9488" }}></i>
                <p style={{ marginTop: "12px", color: "#64748b", fontWeight: 600 }}>Loading consultation record...</p>
            </div>
        );
    }

    return (
        <div className="consultation-summary-page" style={{ maxWidth: "1000px", margin: "0 auto" }}>
            {/* TOP HEADER NAVBAR */}
            <div className="summary-header">
                <div className="title-row">
                    <button
                        onClick={() => navigate(-1)}
                        style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}
                    >
                        <i className="fa-solid fa-arrow-left"></i> Back
                    </button>
                    <div>
                        <h1>Edit Consultation Report</h1>
                        <p>Modify and update saved clinical notes and prescription details.</p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ background: "#ffffff", border: "1px solid #cbd5e1", color: "#334155", padding: "10px 18px", borderRadius: "10px", fontWeight: 700, cursor: "pointer" }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ background: "#0d9488", border: "none", color: "#ffffff", padding: "10px 22px", borderRadius: "10px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
                    >
                        {saving ? (
                            <>
                                <i className="fa-solid fa-circle-notch fa-spin"></i> Saving...
                            </>
                        ) : (
                            <>
                                <i className="fa-solid fa-floppy-disk"></i> Save Report Changes
                            </>
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "12px 16px", borderRadius: "10px", marginBottom: "20px", fontWeight: 600 }}>
                    {error}
                </div>
            )}

            {/* CLINICAL SECTIONS */}
            <div style={{ display: "grid", gap: "24px" }}>
                {/* OVERVIEW & COMPLAINT */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "20px" }}>
                    <h3 style={{ margin: "0 0 16px 0", color: "#082B68", fontSize: "1.1rem" }}>Consultation Overview & Complaint</h3>
                    <div style={{ display: "grid", gap: "14px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Consultation Overview</label>
                            <textarea
                                value={summary.consultation_overview}
                                onChange={(e) => updateField("consultation_overview", e.target.value)}
                                rows={3}
                                style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontFamily: "inherit" }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Chief Complaint</label>
                            <input
                                type="text"
                                value={summary.chief_complaint}
                                onChange={(e) => updateField("chief_complaint", e.target.value)}
                                style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontFamily: "inherit" }}
                            />
                        </div>
                    </div>
                </div>

                {/* CLINICAL HISTORY & ASSESSMENT */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "20px" }}>
                    <h3 style={{ margin: "0 0 16px 0", color: "#082B68", fontSize: "1.1rem" }}>History & Assessment</h3>
                    <div style={{ display: "grid", gap: "14px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>History of Present Illness</label>
                            <textarea
                                value={summary.history_of_present_illness}
                                onChange={(e) => updateField("history_of_present_illness", e.target.value)}
                                rows={3}
                                style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontFamily: "inherit" }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Assessment & Diagnosis</label>
                            <textarea
                                value={summary.assessment}
                                onChange={(e) => updateField("assessment", e.target.value)}
                                rows={2}
                                placeholder="Clinical Assessment"
                                style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontFamily: "inherit", marginBottom: "10px" }}
                            />
                            <input
                                type="text"
                                value={Array.isArray(summary.diagnosis) ? summary.diagnosis.join(", ") : summary.diagnosis}
                                onChange={(e) => updateField("diagnosis", e.target.value.split(",").map(s => s.trim()))}
                                placeholder="Diagnosis (comma separated)"
                                style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontFamily: "inherit" }}
                            />
                        </div>
                    </div>
                </div>

                {/* PRESCRIPTION MEDICINES */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <h3 style={{ margin: 0, color: "#082B68", fontSize: "1.1rem" }}>Prescription Medicines</h3>
                        <button
                            onClick={addMedicine}
                            style={{ background: "#ccfbf1", color: "#0f766e", border: "1px solid #99f6e4", padding: "6px 14px", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
                        >
                            + Add Medicine
                        </button>
                    </div>

                    {medicines.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>
                            No prescription medicines added. Click <strong>+ Add Medicine</strong> to add items.
                        </div>
                    ) : (
                        <div style={{ display: "grid", gap: "16px" }}>
                            {medicines.map((med, idx) => {
                                const indTe = med.indication_te || getTeluguIndication(med.indication);
                                const dosTe = med.dosage_te || getTeluguDosage(med.dosage);
                                const freqTe = med.frequency_te || getTeluguFrequency(med.frequency);
                                const foodTe = med.foodTiming_te || getTeluguFoodTiming(med.foodTiming);
                                const durTe = med.duration_te || getTeluguDuration(med.duration);

                                return (
                                    <div key={idx} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", display: "grid", gap: "12px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontWeight: 800, color: "#0d9488" }}>#{idx + 1} Medicine Entry</span>
                                            <button
                                                onClick={() => removeMedicine(idx)}
                                                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "4px 10px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}
                                            >
                                                Remove
                                            </button>
                                        </div>

                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>Medicine Name</label>
                                                <input
                                                    type="text"
                                                    value={med.name}
                                                    onChange={(e) => updateMedicine(idx, "name", e.target.value)}
                                                    placeholder="Example: Paracetamol 650 mg"
                                                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                                                    Indication / For <span style={{ color: "#0d9488" }}>(దేనికి)</span>
                                                    {indTe && <span style={{ marginLeft: "6px", background: "#ccfbf1", color: "#0f766e", padding: "1px 6px", borderRadius: "4px" }}>[ {indTe} ]</span>}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={med.indication}
                                                    onChange={(e) => updateMedicine(idx, "indication", e.target.value)}
                                                    placeholder="Example: Fever (జ్వరం)"
                                                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                                                    Dosage <span style={{ color: "#0d9488" }}>(మోతాదు)</span>
                                                    {dosTe && <span style={{ display: "block", color: "#0f766e" }}>[ {dosTe} ]</span>}
                                                </label>
                                                <select
                                                    value={med.dosage}
                                                    onChange={(e) => updateMedicine(idx, "dosage", e.target.value)}
                                                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                                                >
                                                    <option value="">Select dosage</option>
                                                    {dosageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                                                    Timing <span style={{ color: "#0d9488" }}>(సమయం)</span>
                                                    {freqTe && <span style={{ display: "block", color: "#0f766e" }}>[ {freqTe} ]</span>}
                                                </label>
                                                <select
                                                    value={med.frequency}
                                                    onChange={(e) => updateMedicine(idx, "frequency", e.target.value)}
                                                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                                                >
                                                    <option value="">Select frequency</option>
                                                    {frequencyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                                                    Duration <span style={{ color: "#0d9488" }}>(వ్యవధి)</span>
                                                    {durTe && <span style={{ display: "block", color: "#0f766e" }}>[ {durTe} ]</span>}
                                                </label>
                                                <select
                                                    value={med.duration}
                                                    onChange={(e) => updateMedicine(idx, "duration", e.target.value)}
                                                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                                                >
                                                    <option value="">Select duration</option>
                                                    {durationOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                                                    Food Timing <span style={{ color: "#0d9488" }}>(ఆహారంతో)</span>
                                                    {foodTe && <span style={{ display: "block", color: "#0f766e" }}>[ {foodTe} ]</span>}
                                                </label>
                                                <select
                                                    value={med.foodTiming}
                                                    onChange={(e) => updateMedicine(idx, "foodTiming", e.target.value)}
                                                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                                                >
                                                    <option value="">Select timing</option>
                                                    {foodTimingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", display: "grid", gap: "8px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#082B68" }}>
                                                    Directions / Instructions <span style={{ color: "#0d9488" }}>(ఎలా తీసుకోవాలి)</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => handleTranslateDirections(idx)}
                                                    style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", padding: "3px 10px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
                                                >
                                                    🌐 Translate to Telugu
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={med.instructions || ""}
                                                onChange={(e) => updateMedicine(idx, "instructions", e.target.value)}
                                                placeholder="Example: Take one tablet after food."
                                                style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                                            />
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#0f766e", marginBottom: "2px" }}>Telugu Translation Review & Edit:</label>
                                                <input
                                                    type="text"
                                                    value={med.instructions_te || ""}
                                                    onChange={(e) => updateMedicine(idx, "instructions_te", e.target.value)}
                                                    placeholder="భోజనం తర్వాత ఒక మాత్ర తీసుకోండి."
                                                    style={{ width: "100%", padding: "8px", border: "1px solid #99f6e4", background: "#f0fdf4", color: "#065f46", fontWeight: 600, borderRadius: "6px" }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ADVICE & FOLLOW-UP */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "20px" }}>
                    <h3 style={{ margin: "0 0 16px 0", color: "#082B68", fontSize: "1.1rem" }}>Treatment Plan & Doctor Notes</h3>
                    <div style={{ display: "grid", gap: "14px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Treatment Plan</label>
                            <textarea
                                value={summary.treatment_plan}
                                onChange={(e) => updateField("treatment_plan", e.target.value)}
                                rows={2}
                                style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontFamily: "inherit" }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Advice</label>
                            <textarea
                                value={Array.isArray(summary.advice) ? summary.advice.join("\n") : summary.advice}
                                onChange={(e) => updateField("advice", e.target.value.split("\n"))}
                                rows={2}
                                placeholder="Advice (one item per line)"
                                style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontFamily: "inherit" }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>Follow-up Date / Advice</label>
                            <input
                                type="text"
                                value={summary.follow_up}
                                onChange={(e) => updateField("follow_up", e.target.value)}
                                placeholder="Example: 7 days or 2026-10-14"
                                style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", fontFamily: "inherit" }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
