import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";

const API = getApiBaseUrl();

export default function QRPatientForm() {
    const { hospitalCode } = useParams();
    const navigate = useNavigate();

    const [form, setForm] = useState({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (event) => {
        const { name, value } = event.target;

        setForm((current) => ({
            ...current,
            [name]: value,
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        setError("");

        const firstName = form.firstName.trim();
        const lastName = form.lastName.trim();
        const fullName = `${firstName} ${lastName}`.trim();
        const phone = form.phone.trim();

        if (!firstName) {
            setError("Please enter your first name.");
            return;
        }

        if (!lastName) {
            setError("Please enter your last name.");
            return;
        }

        if (!phone) {
            setError("Please enter your mobile number.");
            return;
        }

        if (!form.dateOfBirth) {
            setError("Please select your date of birth.");
            return;
        }

        if (!form.gender) {
            setError("Please select your gender.");
            return;
        }

        try {
            setLoading(true);

            const response = await axios.post(
                `${API}/api/v1/public/qr/sessions`,
                {
                    hospitalCode: hospitalCode
                        ?.trim()
                        .toUpperCase(),

                    firstName,
                    lastName,
                    fullName,

                    phone,

                    email: form.email.trim() || null,

                    dateOfBirth: form.dateOfBirth,

                    gender: form.gender,
                }
            );

            if (!response.data?.success) {
                throw new Error(
                    response.data?.message ||
                        "Unable to create intake session."
                );
            }

            const session =
                response.data?.data?.session;

            if (!session?.accessToken) {
                throw new Error(
                    "The intake session was created but no access token was returned."
                );
            }

            /*
             * Store only the temporary QR session information.
             *
             * This is NOT the authenticated patient session.
             */
            sessionStorage.setItem(
                "dv_qr_intake_session",
                JSON.stringify({
                    accessToken: session.accessToken,
                    sessionId: session.id,
                    hospitalId: session.hospitalId,
                    patientName: session.patientName,
                    status: session.status,
                    expiresAt: session.expiresAt,
                })
            );

            navigate(
                `/qr/${encodeURIComponent(
                    hospitalCode
                )}/chat/${encodeURIComponent(
                    session.accessToken
                )}`
            );
        } catch (err) {
            console.error(
                "[QR Intake] Session creation failed:",
                err
            );

            setError(
                err.response?.data?.message ||
                    err.message ||
                    "Unable to start the intake process. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                background: "#f7fafc",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: "560px",
                    background: "#ffffff",
                    borderRadius: "20px",
                    padding: "32px",
                    boxShadow:
                        "0 10px 40px rgba(0,0,0,0.08)",
                }}
            >
                <div style={{ marginBottom: "28px" }}>
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
                            margin:
                                "10px 0 8px",
                            fontSize: "28px",
                        }}
                    >
                        Your Information
                    </h1>

                    <p
                        style={{
                            margin: 0,
                            color: "#64748b",
                            lineHeight: 1.5,
                        }}
                    >
                        Please provide your basic information
                        before starting the symptoms assessment.
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "1fr 1fr",
                            gap: "16px",
                        }}
                    >
                        <div>
                            <label>
                                First Name
                            </label>

                            <input
                                type="text"
                                name="firstName"
                                value={form.firstName}
                                onChange={handleChange}
                                autoComplete="given-name"
                                required
                                placeholder="First name"
                            />
                        </div>

                        <div>
                            <label>
                                Last Name
                            </label>

                            <input
                                type="text"
                                name="lastName"
                                value={form.lastName}
                                onChange={handleChange}
                                autoComplete="family-name"
                                required
                                placeholder="Last name"
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: "16px" }}>
                        <label>
                            Mobile Number
                        </label>

                        <input
                            type="tel"
                            name="phone"
                            value={form.phone}
                            onChange={handleChange}
                            autoComplete="tel"
                            inputMode="tel"
                            required
                            placeholder="Mobile number"
                        />
                    </div>

                    <div style={{ marginTop: "16px" }}>
                        <label>
                            Email
                            <span
                                style={{
                                    marginLeft: "6px",
                                    color: "#94a3b8",
                                    fontWeight: 400,
                                }}
                            >
                                Optional
                            </span>
                        </label>

                        <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={handleChange}
                            autoComplete="email"
                            placeholder="Email address"
                        />
                    </div>

                    <div style={{ marginTop: "16px" }}>
                        <label>
                            Date of Birth
                        </label>

                        <input
                            type="date"
                            name="dateOfBirth"
                            value={form.dateOfBirth}
                            onChange={handleChange}
                            max={
                                new Date()
                                    .toISOString()
                                    .split("T")[0]
                            }
                            required
                        />
                    </div>

                    <div style={{ marginTop: "16px" }}>
                        <label>
                            Gender
                        </label>

                        <select
                            name="gender"
                            value={form.gender}
                            onChange={handleChange}
                            required
                        >
                            <option value="">
                                Select gender
                            </option>

                            <option value="male">
                                Male
                            </option>

                            <option value="female">
                                Female
                            </option>

                            <option value="other">
                                Other
                            </option>

                            <option value="prefer_not_to_say">
                                Prefer not to say
                            </option>
                        </select>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            style={{
                                marginTop: "18px",
                                padding: "12px 14px",
                                borderRadius: "10px",
                                background: "#fef2f2",
                                color: "#b91c1c",
                                fontSize: "14px",
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: "100%",
                            marginTop: "24px",
                            padding: "14px 18px",
                            border: "none",
                            borderRadius: "12px",
                            background: loading
                                ? "#94a3b8"
                                : "#01b6af",
                            color: "#ffffff",
                            fontSize: "16px",
                            fontWeight: 700,
                            cursor: loading
                                ? "not-allowed"
                                : "pointer",
                        }}
                    >
                        {loading
                            ? "Starting..."
                            : "Start Symptoms Assessment"}
                    </button>
                </form>
            </div>
        </div>
    );
}