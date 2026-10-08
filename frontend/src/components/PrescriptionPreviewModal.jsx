import React, { useEffect, useState } from "react";
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

function frequencyToTime(frequency) {
    if (!frequency) return "—";
    const normalized = String(frequency).trim().toLowerCase();
    const map = {
        "1-0-0": "Morning",
        "0-1-0": "Afternoon",
        "0-0-1": "Night",
        "1-0-1": "Morning, Night",
        "1-1-0": "Morning, Afternoon",
        "0-1-1": "Afternoon, Night",
        "1-1-1": "Morning, Afternoon, Night",
        "2-0-2": "Morning, Night",
        "2-2-2": "Morning, Afternoon, Night",
    };
    if (map[normalized]) return map[normalized];
    if (normalized.includes("sos") || normalized.includes("as needed")) return "As needed";
    return frequency;
}

export default function PrescriptionPreviewModal({ show, patient, visit, doctor, onClose }) {
    const [recordData, setRecordData] = useState(null);
    const [loading, setLoading] = useState(false);

    const consultationId = visit ? `consultation-app-${visit.appointmentId}` : "";
    const patientId = patient?.userId || patient?.id || patient?.patientCode || "";

    const pdfUrl = `${API}/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf?document=prescription`;

    useEffect(() => {
        if (!show || !visit) return;
        setRecordData(null);
        setLoading(true);

        const fetchDetails = async () => {
            try {
                const res = await fetch(`${API}/api/v1/clinical/notes/${encodeURIComponent(patientId)}/${encodeURIComponent(consultationId)}/pdf?format=json`);
                if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
                    const data = await res.json();
                    setRecordData(data?.record || data);
                }
            } catch (e) {
                console.warn("Could not load full json for preview, fallback to visit data:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [show, visit, patientId, consultationId]);

    if (!show || !visit) return null;

    // Normalize medicines from recordData or visit.prescription
    const rawMeds = recordData?.prescription?.medicines || recordData?.medications || (Array.isArray(visit?.prescription) ? visit.prescription : (visit?.prescription?.medicines || []));
    const medicines = (Array.isArray(rawMeds) ? rawMeds : []).map(m => {
        if (typeof m === "string") return { name: m, indication: "—", dosage: "—", frequency: "—", foodTiming: "—" };
        return {
            name: m.name || m.medicine || m.drug || "—",
            indication: m.indication || m.purpose || m.reason || m.for || "—",
            dosage: m.dosage || "—",
            frequency: m.frequency || m.time || "—",
            foodTiming: m.foodTiming || m.food_timing || m.food || "—",
            instructions: m.instructions || "",
        };
    });

    const patientName = patient?.fullName || patient?.name || patient?.full_name || recordData?.patientName || "Patient";
    const patientAge = patient?.age || recordData?.patientAge || "—";
    const patientGender = patient?.gender || recordData?.patientGender || "—";
    const displayPatientId = patient?.patientCode || patient?.hospital_patient_code || recordData?.patientId || (patientId ? `DV-P-${String(patientId).slice(0, 6).toUpperCase()}` : "—");

    const doctorName = doctor?.name || doctor?.doctor_name || recordData?.doctorName || "Dr. Harshini";
    const doctorSpecialty = doctor?.specialization || doctor?.specialty || recordData?.doctorSpecialty || "Cardiology";

    const formattedDate = visit?.date ? new Date(visit.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : (recordData?.consultationDate || "7 October 2026");

    const rawAdvice = recordData?.prescription?.advice || (typeof visit?.notes === "string" ? visit.notes : (visit?.notes?.text || visit?.notes?.summary?.advice)) || "";
    const adviceText = (typeof rawAdvice === "object" && rawAdvice !== null)
        ? (rawAdvice.text || rawAdvice.summary?.advice || JSON.stringify(rawAdvice))
        : String(rawAdvice || "Take medicines as prescribed. Maintain adequate hydration. If symptoms persist or worsen, please visit the hospital. Follow up after 1 week or earlier if needed.");

    const handlePrint = () => {
        window.print();
    };

    const handleDownload = () => {
        window.open(pdfUrl, "_blank");
    };

    return (
        <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
        }}>
            <div style={{
                background: "#ffffff",
                borderRadius: "16px",
                width: "100%",
                maxWidth: "680px",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                display: "flex",
                flexDirection: "column"
            }}>
                {/* MODAL HEADER */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 24px",
                    borderBottom: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    borderTopLeftRadius: "16px",
                    borderTopRightRadius: "16px"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <i className="fa-solid fa-file-prescription" style={{ color: "#08AEB8", fontSize: "1.2rem" }}></i>
                        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>Prescription Preview</h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            border: "none",
                            fontSize: "1.3rem",
                            color: "#64748b",
                            cursor: "pointer",
                            padding: "4px 8px"
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* MODAL CONTENT CONTAINER */}
                <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* HOSPITAL BRANDING HEADER */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "16px", borderBottom: "2px solid #08AEB8" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ background: "#08AEB8", borderRadius: "10px", padding: "8px 12px", color: "#fff", fontWeight: 900, fontSize: "1.1rem" }}>
                                <i className="fa-solid fa-user-doctor"></i>
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#082B68", fontWeight: 800 }}>Doctors Vedika Hospital</h2>
                                <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                                    #12, Health Care Avenue, Banjara Hills, Hyderabad - 500034, Telangana<br />
                                    📞 +91 40 4567 8900 | ✉ care@doctorsvedika.com
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* PATIENT & DOCTOR METADATA GRID */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "#f8fafc", borderRadius: "10px", padding: "14px 18px", fontSize: "0.82rem" }}>
                        <div style={{ display: "grid", gap: "4px" }}>
                            <div><span style={{ color: "#64748b" }}>Patient Name</span> : <strong style={{ color: "#0f172a" }}>{patientName}</strong></div>
                            <div><span style={{ color: "#64748b" }}>Age</span> : <strong style={{ color: "#0f172a" }}>{patientAge} Years</strong></div>
                            <div><span style={{ color: "#64748b" }}>Gender</span> : <strong style={{ color: "#0f172a" }}>{patientGender}</strong></div>
                            <div><span style={{ color: "#64748b" }}>Patient ID</span> : <strong style={{ color: "#0f172a" }}>{displayPatientId}</strong></div>
                        </div>
                        <div style={{ display: "grid", gap: "4px", textAlign: "right" }}>
                            <div><span style={{ color: "#64748b" }}>Prescribed by</span> : <strong style={{ color: "#0f172a" }}>{doctorName.startsWith("Dr") ? doctorName : `Dr. ${doctorName}`}</strong></div>
                            <div><span style={{ color: "#64748b" }}>Specialty</span> : <strong style={{ color: "#0f172a" }}>{doctorSpecialty}</strong></div>
                            <div><span style={{ color: "#64748b" }}>Date</span> : <strong style={{ color: "#0f172a" }}>{formattedDate}</strong></div>
                            <div><span style={{ color: "#64748b" }}>Visit Type</span> : <strong style={{ color: "#0f172a" }}>Consultation</strong></div>
                        </div>
                    </div>

                    {/* TITLE */}
                    <div style={{ textAlign: "center" }}>
                        <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#082B68", letterSpacing: "0.5px" }}>Prescription</h3>
                    </div>

                    {/* MEDICINE TABLE */}
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "30px", color: "#0d9488", fontWeight: 600 }}>
                            <i className="fa-solid fa-circle-notch fa-spin"></i> Loading prescription details...
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                <thead>
                                    <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#082B68", width: "24px" }}>#</th>
                                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#082B68" }}>Medicine & Instructions</th>
                                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#082B68" }}>Indication / For<br/><span style={{ fontSize: "0.7rem", color: "#0d9488", fontWeight: 600 }}>(దేనికి)</span></th>
                                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#082B68" }}>Dosage<br/><span style={{ fontSize: "0.7rem", color: "#0d9488", fontWeight: 600 }}>(మోతాదు)</span></th>
                                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#082B68" }}>Timing / Frequency<br/><span style={{ fontSize: "0.7rem", color: "#0d9488", fontWeight: 600 }}>(సమయం / ఎన్ని సార్లు)</span></th>
                                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#082B68" }}>Food Timing<br/><span style={{ fontSize: "0.7rem", color: "#0d9488", fontWeight: 600 }}>(ఆహారంతో సమయం)</span></th>
                                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#082B68" }}>Duration<br/><span style={{ fontSize: "0.7rem", color: "#0d9488", fontWeight: 600 }}>(వ్యవధి)</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {medicines.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                                                No prescription medicines documented for this visit.
                                            </td>
                                        </tr>
                                    ) : (
                                        medicines.map((m, idx) => {
                                            const rawM = (Array.isArray(rawMeds) ? rawMeds[idx] : {}) || {};
                                            const indEng = m.indication && m.indication !== "—" ? m.indication : "";
                                            const indTe = rawM.indication_te || getTeluguIndication(indEng);

                                            const dosEng = m.dosage && m.dosage !== "—" ? m.dosage : "";
                                            const dosTe = rawM.dosage_te || getTeluguDosage(dosEng);

                                            const freqEng = frequencyToTime(m.frequency || rawM.frequency);
                                            const freqClean = freqEng === "—" ? "" : freqEng;
                                            const freqTe = rawM.frequency_te || getTeluguFrequency(freqClean);

                                            const foodEng = m.foodTiming && m.foodTiming !== "—" ? m.foodTiming : (rawM.foodTiming || rawM.food_timing || "");
                                            const foodTe = rawM.foodTiming_te || getTeluguFoodTiming(foodEng);

                                            const durEng = m.duration && m.duration !== "—" ? m.duration : (rawM.duration || "");
                                            const durTe = rawM.duration_te || getTeluguDuration(durEng);

                                            const instrEng = m.instructions || rawM.instructions || "";
                                            const instrTe = rawM.instructions_te || DIRECTIONS_FALLBACK_MAP[instrEng.toLowerCase()] || "";

                                            return (
                                                <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                                                    <td style={{ padding: "10px", fontWeight: 700, color: "#475569", verticalAlign: "top" }}>{idx + 1}</td>
                                                    <td style={{ padding: "10px", verticalAlign: "top" }}>
                                                        <strong style={{ color: "#0f172a", fontSize: "0.85rem" }}>{m.name}</strong>
                                                        {instrEng && <div style={{ fontSize: "0.75rem", color: "#334155", marginTop: "2px" }}>{instrEng}</div>}
                                                        {instrTe && <div style={{ fontSize: "0.74rem", color: "#0d9488", fontWeight: 700, marginTop: "2px" }}>{instrTe}</div>}
                                                    </td>
                                                    <td style={{ padding: "10px", verticalAlign: "top" }}>
                                                        <div>{indEng || "—"}</div>
                                                        {indTe && <div style={{ fontSize: "0.74rem", color: "#0d9488", fontWeight: 700 }}>({indTe})</div>}
                                                    </td>
                                                    <td style={{ padding: "10px", verticalAlign: "top" }}>
                                                        <div>{dosEng || "—"}</div>
                                                        {dosTe && <div style={{ fontSize: "0.74rem", color: "#0d9488", fontWeight: 700 }}>({dosTe})</div>}
                                                    </td>
                                                    <td style={{ padding: "10px", verticalAlign: "top" }}>
                                                        <div style={{ color: "#082B68", fontWeight: 700 }}>{freqClean || "—"}</div>
                                                        {freqTe && <div style={{ fontSize: "0.74rem", color: "#0d9488", fontWeight: 700 }}>({freqTe})</div>}
                                                    </td>
                                                    <td style={{ padding: "10px", verticalAlign: "top" }}>
                                                        <div>{foodEng || "—"}</div>
                                                        {foodTe && <div style={{ fontSize: "0.74rem", color: "#0d9488", fontWeight: 700 }}>({foodTe})</div>}
                                                    </td>
                                                    <td style={{ padding: "10px", verticalAlign: "top" }}>
                                                        <div>{durEng || "—"}</div>
                                                        {durTe && <div style={{ fontSize: "0.74rem", color: "#0d9488", fontWeight: 700 }}>({durTe})</div>}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ADDITIONAL ADVICE / NOTES */}
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 700, color: "#082B68", marginBottom: "6px" }}>
                            <i className="fa-solid fa-file-lines" style={{ color: "#08AEB8" }}></i>
                            <span>Additional Advice / Notes:</span>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#334155", lineHeight: 1.5, whiteSpace: "pre-line" }}>
                            {adviceText}
                        </div>
                    </div>

                    {/* SIGNATURE & STAMP FOOTER */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid #f1f5f9" }}>
                        <div>
                            <div style={{ fontFamily: "cursive, 'Outfit'", fontSize: "1.2rem", color: "#082B68", fontWeight: 700, fontStyle: "italic" }}>
                                Harshini
                            </div>
                            <div style={{ height: "1px", width: "120px", background: "#cbd5e1", margin: "4px 0" }}></div>
                            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0f172a" }}>{doctorName.startsWith("Dr") ? doctorName : `Dr. ${doctorName}`}</div>
                            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>MBBS, MD ({doctorSpecialty})</div>
                            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Consultant {doctorSpecialty}</div>
                            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Doctors Vedika Hospital</div>
                        </div>

                        {/* STAMP */}
                        <div style={{
                            width: "80px",
                            height: "80px",
                            borderRadius: "50%",
                            border: "2px double #082B68",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#082B68",
                            textAlign: "center",
                            transform: "rotate(-8deg)"
                        }}>
                            <i className="fa-solid fa-[#082B68] fa-hospital-user" style={{ fontSize: "0.9rem" }}></i>
                            <span style={{ fontSize: "0.55rem", fontWeight: 800, textTransform: "uppercase" }}>Doctors Vedika</span>
                            <span style={{ fontSize: "0.5rem", fontWeight: 700 }}>Hospital</span>
                        </div>

                        <div style={{ textAlign: "right", fontSize: "0.72rem", color: "#64748b" }}>
                            <div>For any queries, contact:</div>
                            <strong style={{ color: "#0f172a" }}>📞 +91 40 4567 8900</strong><br />
                            <strong style={{ color: "#0f172a" }}>✉ care@doctorsvedika.com</strong>
                        </div>
                    </div>
                </div>

                {/* MODAL FOOTER */}
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px 24px",
                    borderTop: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    borderBottomLeftRadius: "16px",
                    borderBottomRightRadius: "16px"
                }}>
                    <div style={{ display: "flex", gap: "10px" }}>
                        <button
                            onClick={handlePrint}
                            style={{
                                background: "#ffffff",
                                color: "#334155",
                                border: "1px solid #cbd5e1",
                                padding: "8px 16px",
                                borderRadius: "8px",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}
                        >
                            <i className="fa-solid fa-print"></i> Print
                        </button>

                        <button
                            onClick={handleDownload}
                            style={{
                                background: "#eff6ff",
                                color: "#2563eb",
                                border: "1px solid #bfdbfe",
                                padding: "8px 16px",
                                borderRadius: "8px",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}
                        >
                            <i className="fa-solid fa-download"></i> Download Prescription
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: "#08AEB8",
                            color: "#ffffff",
                            border: "none",
                            padding: "8px 20px",
                            borderRadius: "8px",
                            fontWeight: 700,
                            fontSize: "0.85rem",
                            cursor: "pointer"
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
