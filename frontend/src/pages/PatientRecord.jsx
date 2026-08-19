import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

const API = import.meta.env.VITE_NODE_API_URL || "http://localhost:5000";

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

                let res = await fetch(`${API}/api/v1/clinical/notes/${encodeURIComponent(rawId)}`);
                let data = await res.json().catch(() => ({}));

                if ((!data?.records || !data.records.length) && slugId !== rawId) {
                    const fallbackRes = await fetch(`${API}/api/v1/clinical/notes/${encodeURIComponent(slugId)}`);
                    const fallbackData = await fallbackRes.json().catch(() => ({}));
                    if (fallbackData?.records?.length) {
                        data = fallbackData;
                    }
                }

                if (!cancelled) {
                    if (Array.isArray(data?.records) && data.records.length > 0) {
                        setRecords(data.records);
                    } else {
                        setRecords([]);
                    }
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
        return {
            name: first?.patientName || "Patient",
            id: patientId || first?.patientId || "—",
        };
    }, [records, patientId]);

    return (
        <div style={{ minHeight: "100vh", background: "#050b14", color: "#f8fafc", padding: "28px 24px 60px", boxSizing: "border-box" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, marginBottom: 24, flexWrap: "wrap" }}>
                    <div>
                        <Link to="/dashboard" style={{ color: "#00d8ff", textDecoration: "none", fontWeight: 700, fontSize: "0.95rem" }}>
                            ← Back to Dashboard
                        </Link>
                        <h1 style={{ margin: "12px 0 4px", fontSize: "1.75rem", fontWeight: 800 }}>Patient Medical Record</h1>
                        <p style={{ margin: 0, color: "#8fa1b7", fontSize: "0.95rem" }}>
                            {patientInfo.name} • Patient ID: <strong style={{ color: "#cbd5e1" }}>{patientInfo.id}</strong>
                        </p>
                    </div>
                </div>

                {loading && (
                    <div style={cardStyle}>
                        <p style={{ margin: 0, color: "#00d8ff", fontWeight: 600 }}>Loading patient consultation records...</p>
                    </div>
                )}

                {error && (
                    <div style={{ ...cardStyle, border: "1px solid rgba(255,51,102,0.3)", background: "rgba(255,51,102,0.05)" }}>
                        <span style={{ color: "#ff7b99", fontWeight: 600 }}>{error}</span>
                    </div>
                )}

                {!loading && !error && records.length === 0 && (
                    <div style={cardStyle}>
                        <p style={{ margin: 0, color: "#8fa1b7" }}>No saved consultation records found for this patient yet.</p>
                    </div>
                )}

                <div style={{ display: "grid", gap: 20 }}>
                    {records.map((record, index) => (
                        <RecordCard key={record.consultationId || index} record={record} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const RecordCard = ({ record }) => {
    const summary = record.summary || {};
    const vitals = summary.vital_signs || {};
    const diagnosis = record.diagnosis || summary.diagnosis || [];
    const medicines = Array.isArray(record.medications) && record.medications.length
        ? record.medications
        : (summary.medications_discussed || summary.medicines || []);

    const transcript = Array.isArray(record.transcript) ? record.transcript : [];

    const rawPdfUrl = record.pdfUrl || `/api/v1/clinical/notes/${encodeURIComponent(record.patientId || "patient")}/${encodeURIComponent(record.consultationId)}/pdf`;
    const fullPdfUrl = rawPdfUrl.startsWith("http") ? rawPdfUrl : `${API}${rawPdfUrl}`;

    return (
        <article style={{ background: "#0b1628", border: "1px solid rgba(100,122,151,.25)", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(100,122,151,.18)", display: "flex", justifyContent: "space-between", gap: 15, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                    <div style={{ color: "#00d8ff", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>
                        Consultation Record
                    </div>
                    <h2 style={{ margin: "6px 0", fontSize: "1.3rem" }}>
                        {formatText(record.consultationDate) || "Today"} • {formatText(record.consultationTime)}
                    </h2>
                    <p style={{ margin: 0, color: "#8fa1b7", fontSize: "0.85rem" }}>
                        Consultation ID: {formatText(record.consultationId)} • Appointment ID: {formatText(record.appointmentId) || "—"}
                    </p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{
                        padding: "6px 14px",
                        borderRadius: 999,
                        background: record.status === "Completed" ? "rgba(34,197,94,.15)" : "rgba(0,210,255,.12)",
                        color: record.status === "Completed" ? "#4ade80" : "#00d8ff",
                        fontWeight: 800,
                        fontSize: "0.85rem",
                    }}>
                        {formatText(record.status) || "Saved"}
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

            <div style={{ padding: "22px 24px", display: "grid", gap: 18 }}>
                {/* PATIENT DETAILS */}
                <Section title="Patient & Consultation Details">
                    <Grid items={[
                        ["Patient Name", formatText(record.patientName)],
                        ["Patient ID", formatText(record.patientId)],
                        ["Doctor ID", formatText(record.doctorId)],
                        ["Language", formatText(summary.detected_language || record.detectedLanguage)],
                    ]} />
                </Section>

                {/* CLINICAL SUMMARY */}
                <Section title="Clinical Summary">
                    <Detail label="Chief Complaint" value={summary.chief_complaint} />
                    <Detail label="Consultation Overview" value={summary.consultation_overview} />
                    <Detail label="History of Present Illness" value={summary.history_of_present_illness} />
                    <Detail label="Symptoms" value={summary.symptoms} />
                    <Detail label="Past Medical History" value={summary.past_medical_history} />
                    <Detail label="Allergies" value={summary.allergies} />
                    <Detail label="Current Medications" value={summary.current_medications} />
                    <Detail label="Examination Findings" value={summary.examination_findings} />
                </Section>

                {/* VITALS & INVESTIGATIONS */}
                <Section title="Vitals & Investigations">
                    <Grid items={[
                        ["Blood Pressure", formatText(vitals.blood_pressure || vitals.bp)],
                        ["Heart Rate / Pulse", formatText(vitals.heart_rate || vitals.pulse)],
                        ["Temperature", formatText(vitals.temperature || vitals.temp)],
                        ["Respiratory Rate", formatText(vitals.respiratory_rate)],
                        ["SpO2", formatText(vitals.oxygen_saturation || vitals.spo2)],
                        ["Weight", formatText(vitals.weight)],
                    ]} />
                    <Detail label="Investigations" value={summary.investigations} />
                </Section>

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
                        <p style={{ color: "#8fa1b7", margin: 0 }}>No prescription medications documented.</p>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                                <thead>
                                    <tr>
                                        {["S.No", "Medicine", "Dosage", "Frequency", "Duration", "Instructions"].map((h) => (
                                            <th key={h} style={thStyle}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {medicines.map((m, i) => (
                                        <tr key={i}>
                                            <td style={tdStyle}>{i + 1}</td>
                                            <td style={{ ...tdStyle, fontWeight: 700, color: "#ffffff" }}>{formatText(m.name || m.medicine) || "—"}</td>
                                            <td style={tdStyle}>{formatText(m.dosage) || "—"}</td>
                                            <td style={tdStyle}>{formatText(m.frequency) || "—"}</td>
                                            <td style={tdStyle}>{formatText(m.duration) || "—"}</td>
                                            <td style={tdStyle}>{formatText(m.instructions) || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>

                {/* COMPLETE TRANSCRIPT */}
                <Section title="Consultation Transcript">
                    {!transcript.length ? (
                        <p style={{ color: "#8fa1b7", margin: 0 }}>No transcript available.</p>
                    ) : (
                        <div style={{ display: "grid", gap: 8 }}>
                            {transcript.map((line, idx) => (
                                <div key={idx} style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,122,151,0.12)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <span style={{ color: String(line.speaker || "").toLowerCase().includes("doctor") ? "#00d8ff" : "#4ade80", fontWeight: 800, fontSize: "0.85rem" }}>
                                            {formatText(line.speaker) || "Speaker"}
                                        </span>
                                        <span style={{ color: "#75859c", fontSize: "0.8rem", fontWeight: 600 }}>
                                            [{formatText(line.timestamp) || "00:00"}]
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, color: "#d6deea", lineHeight: 1.6, fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                                        {formatText(line.text)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            </div>
        </article>
    );
};

const Section = ({ title, children }) => (
    <section style={{ padding: 18, border: "1px solid rgba(100,122,151,.2)", borderRadius: 14, background: "rgba(255,255,255,.015)" }}>
        <h3 style={{ margin: "0 0 14px", color: "#00d8ff", fontSize: "1.05rem", fontWeight: 700 }}>{title}</h3>
        {children}
    </section>
);

const Detail = ({ label, value }) => {
    const text = formatText(value);
    if (!text) return null;
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#75859c", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4, fontWeight: 700 }}>
                {label}
            </div>
            <div style={{ color: "#e9eef7", lineHeight: 1.6, whiteSpace: "pre-wrap", fontSize: "0.92rem" }}>
                {text}
            </div>
        </div>
    );
};

const Grid = ({ items }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 10 }}>
        {items.map(([label, value]) => (
            <div key={label} style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,.025)", border: "1px solid rgba(100,122,151,0.12)" }}>
                <div style={{ color: "#75859c", fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
                <div style={{ marginTop: 4, fontWeight: 700, color: "#cbd5e1", fontSize: "0.92rem" }}>{value || "—"}</div>
            </div>
        ))}
    </div>
);

const cardStyle = {
    padding: 22,
    borderRadius: 14,
    background: "#0b1628",
    border: "1px solid rgba(100,122,151,.25)",
};

const pdfBtnStyle = {
    border: 0,
    borderRadius: 10,
    padding: "10px 18px",
    background: "linear-gradient(135deg, #00d2ff, #0099cc)",
    color: "#031019",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: "0.88rem",
    boxShadow: "0 4px 12px rgba(0,210,255,0.2)",
};

const thStyle = {
    textAlign: "left",
    padding: "10px 12px",
    background: "rgba(0,210,255,0.1)",
    color: "#00d2ff",
    fontSize: "0.85rem",
    fontWeight: 700,
    borderBottom: "1px solid rgba(100,122,151,0.2)",
};

const tdStyle = {
    padding: "10px 12px",
    color: "#d6deea",
    fontSize: "0.88rem",
    borderBottom: "1px solid rgba(100,122,151,.12)",
    verticalAlign: "top",
};

export default PatientRecord;
