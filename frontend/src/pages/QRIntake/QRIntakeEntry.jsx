import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";
import "./QRIntakeEntry.css";

const API = getApiBaseUrl();

export default function QRIntakeEntry() {
    const { hospitalCode } = useParams();
    const navigate = useNavigate();

    const [hospital, setHospital] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadHospital = async () => {
            try {
                setLoading(true);
                setError("");

                const normalizedCode = hospitalCode
                    ?.trim()
                    .toUpperCase();

                if (!normalizedCode) {
                    setError("Invalid hospital QR code.");
                    return;
                }

                const response = await axios.get(
                    `${API}/api/v1/public/qr/hospitals/${encodeURIComponent(
                        normalizedCode
                    )}`
                );

                if (cancelled) return;

                if (!response.data?.success) {
                    throw new Error(
                        response.data?.message ||
                            "Unable to identify hospital."
                    );
                }

                setHospital(response.data.data.hospital);
            } catch (err) {
                if (cancelled) return;

                console.error(
                    "[QR Intake] Hospital resolution failed:",
                    err
                );

                setError(
                    err.response?.data?.message ||
                        err.message ||
                        "Unable to load hospital information."
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadHospital();

        return () => {
            cancelled = true;
        };
    }, [hospitalCode]);

    const handleContinue = () => {
        if (!hospital) return;

        navigate(
            `/qr/${encodeURIComponent(
                hospital.code
            )}/patient`
        );
    };

    if (loading) {
        return (
            <div
                className="qr-entry-page"
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                }}
            >
                <div style={{ textAlign: "center" }}>
                    <h2>Loading hospital...</h2>
                    <p>Please wait.</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                }}
            >
                <div
                    style={{
                        maxWidth: "480px",
                        width: "100%",
                        textAlign: "center",
                    }}
                >
                    <h2>Unable to continue</h2>

                    <p>{error}</p>

                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
            }}
        >
            <div
                className="qr-entry-card"
                style={{
                    width: "100%",
                    maxWidth: "520px",
                    padding: "32px",
                    borderRadius: "20px",
                    background: "#ffffff",
                    boxShadow:
                        "0 10px 40px rgba(0,0,0,0.08)",
                }}
            >
                <div style={{ marginBottom: "24px" }}>
                    <p
                        style={{
                            margin: 0,
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "#01b6af",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                        }}
                    >
                        DoctorsVedika
                    </p>

                    <h1
                        style={{
                            marginTop: "10px",
                            marginBottom: "8px",
                        }}
                    >
                        Welcome
                    </h1>

                    <p
                        style={{
                            margin: 0,
                            color: "#64748b",
                        }}
                    >
                        You are checking in for:
                    </p>
                </div>

                <div
                    style={{
                        padding: "18px",
                        marginBottom: "24px",
                        borderRadius: "14px",
                        background: "#f8fafc",
                    }}
                >
                    <h2
                        style={{
                            margin: 0,
                            fontSize: "20px",
                        }}
                    >
                        {hospital.name}
                    </h2>

                    <p
                        style={{
                            marginTop: "6px",
                            marginBottom: 0,
                            color: "#64748b",
                        }}
                    >
                        Hospital Code: {hospital.code}
                    </p>

                    {hospital.address && (
                        <p
                            style={{
                                marginTop: "8px",
                                marginBottom: 0,
                                color: "#64748b",
                            }}
                        >
                            {hospital.address}
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleContinue}
                    style={{
                        width: "100%",
                        border: "none",
                        borderRadius: "12px",
                        padding: "14px 18px",
                        background: "#01b6af",
                        color: "#ffffff",
                        fontSize: "16px",
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    Continue
                </button>
            </div>
        </div>
    );
}