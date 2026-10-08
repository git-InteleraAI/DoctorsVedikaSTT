import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";
import "./QRPatientForm.css";

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

    // Registration/session information returned by backend
    const [registeredSession, setRegisteredSession] = useState(null);

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
            const sessionData = {
                accessToken: session.accessToken,
                sessionId: session.id,
                hospitalId: session.hospitalId,
                patientName: session.patientName,
                status: session.status,
                expiresAt: session.expiresAt,
            };

            sessionStorage.setItem(
                "dv_qr_intake_session",
                JSON.stringify(sessionData)
            );

            /*
             * IMPORTANT:
             * Do NOT navigate immediately to the chatbot.
             *
             * First show the registration success screen.
             */
            setRegisteredSession(sessionData);
        } catch (err) {
            console.error(
                "[QR Intake] Session creation failed:",
                err
            );

            setError(
                err.response?.data?.message ||
                    err.message ||
                    "Unable to complete registration. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    /*
     * Start the actual clinical symptoms assessment.
     */
    const handleStartAssessment = () => {
        if (!registeredSession?.accessToken) {
            setError(
                "Your registration session could not be found. Please register again."
            );
            return;
        }

        navigate(
            `/qr/${encodeURIComponent(
                hospitalCode
            )}/chat/${encodeURIComponent(
                registeredSession.accessToken
            )}`
        );
    };

    /*
     * ============================================================
     * REGISTRATION SUCCESS SCREEN
     * ============================================================
     */
    if (registeredSession) {
        return (
            <div
                className="qr-patient-form-page"
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
                        padding: "40px 32px",
                        boxShadow:
                            "0 10px 40px rgba(0,0,0,0.08)",
                        textAlign: "center",
                    }}
                >
                    {/* Success Icon */}
                    <div
                        style={{
                            width: "76px",
                            height: "76px",
                            margin: "0 auto 22px",
                            borderRadius: "50%",
                            background: "#e6fffb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#01b6af",
                            fontSize: "42px",
                            fontWeight: 700,
                        }}
                    >
                        ✓
                    </div>

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
                            margin: "12px 0 10px",
                            fontSize: "28px",
                            color: "#0f172a",
                        }}
                    >
                        Registration Successful
                    </h1>

                    <p
                        style={{
                            margin: "0 auto",
                            maxWidth: "440px",
                            color: "#64748b",
                            lineHeight: 1.6,
                            fontSize: "15px",
                        }}
                    >
                        Your information has been successfully
                        registered with the hospital.
                    </p>

                    <div
                        style={{
                            marginTop: "24px",
                            padding: "16px",
                            borderRadius: "12px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            textAlign: "left",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "13px",
                                color: "#64748b",
                                marginBottom: "6px",
                            }}
                        >
                            Patient
                        </div>

                        <div
                            style={{
                                fontSize: "17px",
                                fontWeight: 700,
                                color: "#0f172a",
                            }}
                        >
                            {registeredSession.patientName ||
                                `${form.firstName} ${form.lastName}`}
                        </div>
                    </div>

                    <div
                        style={{
                            marginTop: "28px",
                            padding: "16px",
                            borderRadius: "12px",
                            background: "#f0fdfa",
                            border: "1px solid #ccfbf1",
                            textAlign: "left",
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 700,
                                color: "#0f766e",
                                marginBottom: "6px",
                            }}
                        >
                            Next Step
                        </div>

                        <div
                            style={{
                                color: "#475569",
                                lineHeight: 1.5,
                                fontSize: "14px",
                            }}
                        >
                            Start the symptoms assessment with
                            our clinical assistant. You will be
                            asked a few questions about your
                            current symptoms before seeing the
                            doctor.
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleStartAssessment}
                        style={{
                            width: "100%",
                            marginTop: "28px",
                            padding: "15px 18px",
                            border: "none",
                            borderRadius: "12px",
                            background: "#01b6af",
                            color: "#ffffff",
                            fontSize: "16px",
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                    >
                        Start Symptoms Assessment
                    </button>
                    <div
    style={{
        marginTop: "22px",
        padding: "14px 16px",
        borderRadius: "10px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        color: "#475569",
        fontSize: "14px",
        lineHeight: 1.5,
        textAlign: "center",
    }}
>
    <strong style={{ color: "#334155" }}>
        Please note:
    </strong>{" "}
    Please inform the Front Desk Staff that your registration
    is complete.
</div>
                </div>
            </div>
        );
    }

    /*
     * ============================================================
     * REGISTRATION FORM
     * ============================================================
     */
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
                className="qr-patient-form-card"
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
                            margin: "10px 0 8px",
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
                    <div className="qr-patient-name-grid">
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
                            ? "Registering..."
                            : "Complete Registration"}
                    </button>
                </form>
            </div>
        </div>
    );
}