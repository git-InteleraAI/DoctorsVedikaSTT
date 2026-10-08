import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getApiBaseUrl } from "../utils/apiConfig";
import {
    getTeluguIndication,
    getTeluguDosage,
    getTeluguFrequency,
    getTeluguFoodTiming,
    getTeluguDuration,
    DIRECTIONS_FALLBACK_MAP
} from "../utils/translationUtils";

const API = getApiBaseUrl();

const formatText = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === "string") return val.trim();
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (Array.isArray(val)) {
        return val
            .map((item) => formatText(item))
            .filter(Boolean)
            .join(", ");
    }
    if (typeof val === "object") {
        return Object.entries(val)
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${formatText(v)}`)
            .join(" | ");
    }
    return String(val);
};

const PatientRecord = () => {
    const { patientId } = useParams();
    const [records, setRecords] = useState([]);
    const [fetchedPatient, setFetchedPatient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError("");
            try {
                const rawId = String(patientId || "").trim();
                const slugId = rawId.replace(/\s+/g, "-");
                const token = localStorage.getItem("doctors_vedika_token") || localStorage.getItem("token") || localStorage.getItem("sb-access-token");
                const headers = token ? { Authorization: `Bearer ${token}` } : {};

                let matchedPatient = null;
                // Fetch patient profile details via /api/patients/:patientId/history or /api/patients
                try {
                    const histRes = await fetch(`${API}/api/patients/${encodeURIComponent(rawId)}/history`, { headers });
                    if (histRes.ok) {
                        const histData = await histRes.json();
                        if (histData?.patient && !cancelled) {
                            matchedPatient = histData.patient;
                            setFetchedPatient({
                                name: histData.patient.fullName || histData.patient.name,
                                code: histData.patient.patientCode || histData.patient.code || rawId,
                            });
                        }
                    }
                } catch (e) {
                    console.warn("[PatientRecord] Direct history fetch warning:", e);
                }

                if (!matchedPatient) {
                    try {
                        const patRes = await fetch(`${API}/api/patients`, { headers });
                        if (patRes.ok) {
                            const patData = await patRes.json();
                            const list = Array.isArray(patData) ? patData : patData?.data || patData?.patients || [];
                            matchedPatient = list.find((p) => p.user_id === rawId || p.id === rawId || p.patient_code === rawId || p.userId === rawId || p.patientCode === rawId);
                            if (matchedPatient && !cancelled) {
                                setFetchedPatient({
                                    name: matchedPatient.fullName || matchedPatient.full_name || matchedPatient.first_name || matchedPatient.name,
                                    code: matchedPatient.patientCode || matchedPatient.patient_code || matchedPatient.user_id || matchedPatient.id,
                                });
                            }
                        }
                    } catch (e) {
                        console.warn("[PatientRecord] Patient profile fetch warning:", e);
                    }
                }

                let res = await fetch(`${API}/api/v1/clinical/notes/${encodeURIComponent(rawId)}`);
                let data = await res.json().catch(() => ({}));

                if ((!data?.records || !data.records.length) && slugId !== rawId) {
                    const fallbackRes = await fetch(`${API}/api/v1/clinical/notes/${encodeURIComponent(slugId)}`);
                    const fallbackData = await fallbackRes.json().catch(() => ({}));
                    if (fallbackData?.records?.length) {
                        data = fallbackData;
                    }
                }

                // If still no records found and we resolved a patient_code or id, try fetching with code
                if ((!data?.records || !data.records.length) && matchedPatient) {
                    const altId = matchedPatient.patient_code || matchedPatient.patientCode || matchedPatient.user_id || matchedPatient.id;
                    if (altId && altId !== rawId) {
                        const altRes = await fetch(`${API}/api/v1/clinical/notes/${encodeURIComponent(altId)}`);
                        const altData = await altRes.json().catch(() => ({}));
                        if (altData?.records?.length) {
                            data = altData;
                        }
                    }
                }

                if (!cancelled) {
                    let finalRecords = Array.isArray(data?.records) && data.records.length > 0 ? data.records : [];
                    if (finalRecords.length === 0) {
                        try {
                            const localStr = localStorage.getItem(`patient-records-${rawId}`) ||
                                (matchedPatient ? localStorage.getItem(`patient-records-${matchedPatient.patient_code || matchedPatient.patientCode || matchedPatient.user_id}`) : null);
                            if (localStr) {
                                const parsed = JSON.parse(localStr);
                                if (Array.isArray(parsed) && parsed.length > 0) {
                                    finalRecords = parsed.filter((r) => r && (r.completed === true || String(r.status).toLowerCase() === "completed"));
                                }
                            }
                        } catch (e) { }
                    }
                    setRecords(finalRecords);
                }
            } catch (err) {
                console.error("[PatientRecord] Fetch error:", err);
                if (!cancelled) setError("Unable to load patient records. Please check if the backend server is running.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [patientId]);

    const patientInfo = useMemo(() => {
        const first = records[0];
        const resolvedName =
            fetchedPatient?.name ||
            (first?.patientName && first?.patientName !== "Unknown Patient" ? first.patientName : null) ||
            first?.summary?.patientName ||
            (records.length > 0 ? "Patient" : "");

        const resolvedCode =
            fetchedPatient?.code ||
            first?.patientCode ||
            first?.displayPatientId ||
            first?.patientId ||
            patientId;

        return {
            name: resolvedName,
            id: resolvedCode,
        };
    }, [records, patientId, fetchedPatient]);

    return (
        <div style={{ minHeight: "100vh", background: "#F8FBFF", color: "#0f172a", padding: "28px 24px 60px", boxSizing: "border-box" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                <section style={{ background: "#ffffff", borderRadius: "16px", padding: "20px 24px", border: "1px solid #e2e8f0", boxShadow: "0 4px 15px rgba(0,0,0,0.03)", marginBottom: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap" }}>
                        <div>
                            <Link to="/dashboard" style={{ color: "#01b6af", textDecoration: "none", fontWeight: 700, fontSize: "0.95rem" }}>
                                ← Back to Dashboard
                            </Link>
                            <h1 style={{ margin: "10px 0 4px", fontSize: "1.75rem", fontWeight: 800, color: "#082b68" }}>Patient Medical Record</h1>
                            {patientInfo.name && (
                                <p style={{ margin: 0, color: "#64748b", fontSize: "0.95rem" }}>
                                    {patientInfo.name} • Patient ID: <strong style={{ color: "#01b6af" }}>{patientInfo.id}</strong>
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                {loading && (
                    <div style={cardStyle}>
                        <p style={{ margin: 0, color: "#01b6af", fontWeight: 700 }}>Loading completed patient consultation records...</p>
                    </div>
                )}

                {error && (
                    <div style={{ ...cardStyle, border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.1)" }}>
                        <span style={{ color: "#ef4444", fontWeight: 700 }}>{error}</span>
                    </div>
                )}

                {!loading && !error && records.length === 0 && (
                    <div style={cardStyle}>
                        <p style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>No finalized consultation records found for this patient yet.</p>
                    </div>
                )}

                <div style={{ display: "grid", gap: 24 }}>
                    {records.map((record, index) => (
                        <RecordCard key={record.consultationId || index} record={record} patientInfo={patientInfo} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const RecordCard = ({ record, patientInfo }) => {
    const summary = record.summary || {};
    const vitals = summary.vital_signs || {};
    const diagnosis = record.diagnosis || summary.diagnosis || [];
    const medicines = Array.isArray(record.medications) && record.medications.length
        ? record.medications
        : (summary.medications_discussed || summary.medicines || []);

    let transcript = [];
    if (Array.isArray(record.transcript) && record.transcript.length > 0) {
        transcript = record.transcript;
    } else if (record.audio_transcript && typeof record.audio_transcript === 'string') {
        const lines = record.audio_transcript.split('\n').map(l => l.trim()).filter(Boolean);
        transcript = lines.map((line) => {
            const match = line.match(/^\[?(.*?)\]?\s*(Doctor|Patient|User|Speaker\s*\d*|.*?):\s*(.*)$/i);
            if (match) {
                return { timestamp: match[1] || '00:00', speaker: match[2] || 'Speaker', text: match[3] || line };
            }
            return { timestamp: '00:00', speaker: 'Transcript', text: line };
        });
    }

    const rawPdfUrl = record.pdfUrl || `/api/v1/clinical/notes/${encodeURIComponent(record.patientId || "patient")}/${encodeURIComponent(record.consultationId)}/pdf`;
    const fullPdfUrl = rawPdfUrl.startsWith("http") ? rawPdfUrl : `${API}${rawPdfUrl}`;

    const diagnosisStr = Array.isArray(diagnosis) ? diagnosis.join(", ") : formatText(diagnosis);

    return (
        <article style={{ background: "#ffffff", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 6px 20px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 15, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                    <div style={{ color: "#01b6af", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>
                        Consultation Record
                    </div>
                    <h2 style={{ margin: "4px 0", fontSize: "1.3rem", color: "#082b68", fontWeight: 800 }}>
                        {formatText(record.consultationDate) || "Today"} • {formatText(record.consultationTime)}
                    </h2>
                    <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>
                        Consultation ID: <strong style={{ color: "#334155" }}>{formatText(record.consultationId)}</strong>
                    </p>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{
                        padding: "6px 14px",
                        borderRadius: 999,
                        background: "rgba(16, 185, 129, 0.1)",
                        color: "#059669",
                        fontWeight: 800,
                        fontSize: "0.85rem",
                        border: "1px solid rgba(16, 185, 129, 0.2)",
                    }}>
                        ✓ Completed
                    </span>

                    <button
                        type="button"
                        onClick={() => window.open(fullPdfUrl, "_blank", "noopener,noreferrer")}
                        style={pdfBtnStyle}
                    >
                        📄 View / Download PDF
                    </button>
                </div>
            </div>

            <div style={{ padding: "20px 24px", display: "grid", gap: 18 }}>
                {/* PATIENT DETAILS */}
                <Section title="Patient & Consultation Details">
                    <Grid items={[
                        ["Patient Name", patientInfo?.name || formatText(record.patientName)],
                        ["Patient ID", patientInfo?.id || formatText(record.patientCode || record.displayPatientId || record.patientId)],
                        ["Doctor Name", formatText(record.doctorName || record.doctor_name || "Doctor")],
                        ["Language", formatText(summary.detected_language || record.detectedLanguage || "English")],
                    ]} />
                </Section>

                {/* DIAGNOSIS & VITALS */}
                {(diagnosisStr || Object.values(vitals).some(v => v)) && (
                    <Section title="Clinical Diagnosis & Vitals">
                        {diagnosisStr && <Detail label="Diagnosis" value={diagnosisStr} />}
                        {Object.values(vitals).some(v => v) && (
                            <Grid items={[
                                ["Blood Pressure", formatText(vitals.blood_pressure || vitals.bp)],
                                ["Heart Rate / Pulse", formatText(vitals.heart_rate || vitals.pulse)],
                                ["Temperature", formatText(vitals.temperature || vitals.temp)],
                                ["Respiratory Rate", formatText(vitals.respiratory_rate)],
                                ["SpO2", formatText(vitals.oxygen_saturation || vitals.spo2)],
                                ["Weight", formatText(vitals.weight)],
                            ].filter(([, v]) => v)} />
                        )}
                    </Section>
                )}

                {/* ASSESSMENT & PLAN */}
                <Section title="Assessment & Plan">
                    <Detail label="Assessment" value={summary.assessment} />
                    <Detail label="Diagnosis" value={diagnosis} />
                    <Detail label="Differential Diagnosis" value={summary.differential_diagnosis} />
                    <Detail label="Treatment Plan" value={summary.treatment_plan} />
                    <Detail label="Advice" value={summary.advice} />
                    <Detail label="Follow-up" value={summary.follow_up} />
                    <Detail label="Doctor Notes" value={summary.doctor_notes} />
                    <Detail label="Red Flags / Warnings" value={summary.red_flags} />
                </Section>

                {/* PRESCRIPTION */}
                <Section title="Prescription">
                    {!medicines.length ? (
                        <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>No prescription medications documented.</p>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontSize: "0.85rem" }}>
                                <thead>
                                    <tr style={{ background: "#f1f5f9" }}>
                                        <th style={thStyle}>#</th>
                                        <th style={thStyle}>Medicine & Instructions</th>
                                        <th style={thStyle}>Indication / For <span style={{ color: "#0d9488" }}>(దేనికి)</span></th>
                                        <th style={thStyle}>Dosage <span style={{ color: "#0d9488" }}>(మోతాదు)</span></th>
                                        <th style={thStyle}>Timing <span style={{ color: "#0d9488" }}>(సమయం)</span></th>
                                        <th style={thStyle}>Food Timing <span style={{ color: "#0d9488" }}>(ఆహారంతో)</span></th>
                                        <th style={thStyle}>Duration <span style={{ color: "#0d9488" }}>(వ్యవధి)</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {medicines.map((m, i) => {
                                        const medName = formatText(m.name || m.medicine) || "—";
                                        const indEng = formatText(m.indication || m.purpose) || "";
                                        const indTe = m.indication_te || getTeluguIndication(indEng);

                                        const dosEng = formatText(m.dosage) || "";
                                        const dosTe = m.dosage_te || getTeluguDosage(dosEng);

                                        const freqEng = formatText(m.frequency || m.time) || "";
                                        const freqTe = m.frequency_te || getTeluguFrequency(freqEng);

                                        const foodEng = formatText(m.foodTiming || m.food_timing || m.food) || "";
                                        const foodTe = m.foodTiming_te || getTeluguFoodTiming(foodEng);

                                        const durEng = formatText(m.duration) || "";
                                        const durTe = m.duration_te || getTeluguDuration(durEng);

                                        const instrEng = formatText(m.instructions) || "";
                                        const instrTe = m.instructions_te || DIRECTIONS_FALLBACK_MAP[instrEng.toLowerCase()] || "";

                                        return (
                                            <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                                                <td style={{ ...tdStyle, verticalAlign: "top" }}>{i + 1}</td>
                                                <td style={{ ...tdStyle, verticalAlign: "top" }}>
                                                    <strong style={{ color: "#082b68", fontSize: "0.9rem" }}>{medName}</strong>
                                                    {instrEng && <div style={{ fontSize: "0.78rem", color: "#334155", marginTop: "2px" }}>{instrEng}</div>}
                                                    {instrTe && <div style={{ fontSize: "0.76rem", color: "#0d9488", fontWeight: 700, marginTop: "2px" }}>{instrTe}</div>}
                                                </td>
                                                <td style={{ ...tdStyle, verticalAlign: "top" }}>
                                                    <div>{indEng || "—"}</div>
                                                    {indTe && <div style={{ fontSize: "0.76rem", color: "#0d9488", fontWeight: 700 }}>({indTe})</div>}
                                                </td>
                                                <td style={{ ...tdStyle, verticalAlign: "top" }}>
                                                    <div>{dosEng || "—"}</div>
                                                    {dosTe && <div style={{ fontSize: "0.76rem", color: "#0d9488", fontWeight: 700 }}>({dosTe})</div>}
                                                </td>
                                                <td style={{ ...tdStyle, verticalAlign: "top" }}>
                                                    <div style={{ color: "#01b6af", fontWeight: 700 }}>{freqEng || "—"}</div>
                                                    {freqTe && <div style={{ fontSize: "0.76rem", color: "#0d9488", fontWeight: 700 }}>({freqTe})</div>}
                                                </td>
                                                <td style={{ ...tdStyle, verticalAlign: "top" }}>
                                                    <div>{foodEng || "—"}</div>
                                                    {foodTe && <div style={{ fontSize: "0.76rem", color: "#0d9488", fontWeight: 700 }}>({foodTe})</div>}
                                                </td>
                                                <td style={{ ...tdStyle, verticalAlign: "top" }}>
                                                    <div>{durEng || "—"}</div>
                                                    {durTe && <div style={{ fontSize: "0.76rem", color: "#0d9488", fontWeight: 700 }}>({durTe})</div>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>

                {/* COMPLETE TRANSCRIPT */}
                {transcript.length > 0 && (
                    <Section title="Consultation Transcript">
                        <div style={{ display: "grid", gap: 10 }}>
                            {transcript.map((line, idx) => (
                                <div key={idx} style={{ padding: "10px 14px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <span style={{ color: String(line.speaker || "").toLowerCase().includes("doctor") ? "#01b6af" : "#082b68", fontWeight: 800, fontSize: "0.85rem" }}>
                                            {formatText(line.speaker) || "Speaker"}
                                        </span>
                                        <span style={{ color: "#373c45ff", fontSize: "0.8rem", fontWeight: 600 }}>
                                            [{formatText(line.timestamp) || "00:00"}]
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, color: "#1e293b", lineHeight: 1.6, fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                                        {formatText(line.text)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
            </div>
        </article>
    );
};

const Section = ({ title, children }) => (
    <section style={{ marginBottom: "4px" }}>
        <h3 style={{ margin: "0 0 10px", color: "#082b68", fontSize: "1rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</h3>
        {children}
    </section>
);

const Detail = ({ label, value }) => {
    const text = formatText(value);
    if (!text) return null;
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3, fontWeight: 700 }}>
                {label}
            </div>
            <div style={{ color: "#1e293b", lineHeight: 1.5, whiteSpace: "pre-wrap", fontSize: "0.9rem", fontWeight: 500 }}>
                {text}
            </div>
        </div>
    );
};

const Grid = ({ items }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 8 }}>
        {items.map(([label, value]) => (
            <div key={label} style={{ padding: "8px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
                <div style={{ marginTop: 2, fontWeight: 700, color: "#082b68", fontSize: "0.9rem" }}>{value || "—"}</div>
            </div>
        ))}
    </div>
);

const cardStyle = {
    padding: 22,
    borderRadius: 14,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 15px rgba(0,0,0,0.03)",
};

const pdfBtnStyle = {
    border: 0,
    borderRadius: 8,
    padding: "10px 18px",
    background: "linear-gradient(135deg, #01b6af 0%, #082b68 100%)",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: "0.88rem",
    boxShadow: "0 4px 12px rgba(1, 182, 175, 0.25)",
};

const thStyle = {
    textAlign: "left",
    padding: "10px 12px",
    color: "#475569",
    fontSize: "0.85rem",
    fontWeight: 700,
    borderBottom: "2px solid #cbd5e1",
};

const tdStyle = {
    padding: "10px 12px",
    color: "#1e293b",
    fontSize: "0.88rem",
    borderBottom: "1px solid #e2e8f0",
    verticalAlign: "top",
};

export default PatientRecord;
