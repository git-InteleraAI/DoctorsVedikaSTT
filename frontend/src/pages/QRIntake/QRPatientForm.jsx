import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";
import { Icon, ArrowIcon, LockIcon, QRHeader } from "./QRShared";
import "./qr-theme.css";

const API = getApiBaseUrl();

const UserIcon = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></Icon>;
const PhoneIcon = () => <Icon><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></Icon>;
const HashIcon = () => <Icon><path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" /></Icon>;
const ChevronIcon = () => <Icon color="#0e2a63" sw={2.4}><path d="M6 9l6 6 6-6" /></Icon>;

/* Age -> approximate date of birth (same rule Staff Portal uses: 1 Jan of birth year).
   The backend + database still store a date_of_birth, so this keeps them unchanged. */
const ageToDob = (age) => `${new Date().getFullYear() - age}-01-01`;

export default function QRPatientForm() {
  const { hospitalCode } = useParams();
  const navigate = useNavigate();

  // Only the four fields we keep: Full Name, Mobile Number, Age, Gender
  const [form, setForm] = useState({ fullName: "", phone: "", age: "", gender: "" });
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registeredSession, setRegisteredSession] = useState(null);

  // Hospital name for the clinic strip (non-blocking; page works without it)
  useEffect(() => {
    let cancelled = false;
    const code = hospitalCode?.trim().toUpperCase();
    if (!code) return;
    axios
      .get(`${API}/api/v1/public/qr/hospitals/${encodeURIComponent(code)}`)
      .then((res) => { if (!cancelled && res.data?.success) setHospital(res.data.data.hospital); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hospitalCode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((cur) => ({ ...cur, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const age = Number(form.age);

    if (fullName.length < 2) return setError("Please enter your full name.");
    if (!phone) return setError("Please enter your mobile number.");
    if (!Number.isInteger(age) || age < 0 || age > 120) return setError("Please enter a valid age (0–120).");
    if (!form.gender) return setError("Please select your gender.");

    try {
      setLoading(true);
      const response = await axios.post(`${API}/api/v1/public/qr/sessions`, {
        hospitalCode: hospitalCode?.trim().toUpperCase(),
        fullName,
        phone,
        dateOfBirth: ageToDob(age),
        gender: form.gender,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Unable to create intake session.");
      }
      const session = response.data?.data?.session;
      if (!session?.accessToken) {
        throw new Error("The intake session was created but no access token was returned.");
      }

      const sessionData = {
        accessToken: session.accessToken,
        sessionId: session.id,
        hospitalId: session.hospitalId,
        patientName: session.patientName,
        status: session.status,
        expiresAt: session.expiresAt,
      };
      sessionStorage.setItem("dv_qr_intake_session", JSON.stringify(sessionData));
      setRegisteredSession(sessionData); // show the success screen first
    } catch (err) {
      console.error("[QR Intake] Session creation failed:", err);
      setError(err.response?.data?.message || err.message || "Unable to complete registration. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartAssessment = () => {
    if (!registeredSession?.accessToken) {
      setError("Your registration session could not be found. Please register again.");
      return;
    }
    navigate(`/qr/${encodeURIComponent(hospitalCode)}/chat/${encodeURIComponent(registeredSession.accessToken)}`);
  };

  /* ================= SCREEN 3 · REGISTRATION SUCCESSFUL ================= */
  if (registeredSession) {
    return (
      <div className="qr-root">
        <QRHeader hospital={hospital} hospitalCode={hospitalCode} />
        <main className="qr-card">
          <div className="qr-success">
            <div className="qr-badge-wrap">
              <div className="qr-badge">
                <svg role="img" aria-label="Success" width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
            </div>
            <h1 className="qr-title">Registration Successful</h1>
            <p className="qr-sub" style={{ maxWidth: 340 }}>
              Your information has been successfully registered with the hospital.
            </p>
          </div>

          <div className="qr-patient">
            <div className="qr-patient-icon"><UserIcon /></div>
            <div>
              <small>Patient</small>
              <strong>{registeredSession.patientName || form.fullName}</strong>
            </div>
          </div>

          <section className="qr-next">
            <h2>Next Step</h2>
            <p>
              Start the symptoms assessment with our clinical assistant. You will be asked a few
              questions about your current symptoms before seeing the doctor.
            </p>
          </section>

          {error && <div className="qr-error" role="alert">{error}</div>}

          <button type="button" className="qr-btn qr-btn-navy" onClick={handleStartAssessment}>
            Start Symptoms Assessment <ArrowIcon />
          </button>

          <div className="qr-note">
            <Icon color="#8a5a00"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></Icon>
            <div><strong>Please note:</strong> Please inform the Front Desk Staff that your registration is complete.</div>
          </div>
        </main>
      </div>
    );
  }

  /* ================= SCREEN 2 · YOUR INFORMATION ================= */
  return (
    <div className="qr-root">
      <QRHeader hospital={hospital} hospitalCode={hospitalCode} onBack={() => navigate(`/qr/${encodeURIComponent(hospitalCode)}`)} />
      <main className="qr-card">
        <div>
          <h1 className="qr-title">Your Information</h1>
          <p className="qr-sub" style={{ marginTop: 6 }}>
            Please provide your basic information before starting the symptoms assessment.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: "contents" }}>
          <div className="qr-field">
            <label className="qr-label" htmlFor="qr-fullName">Full Name</label>
            <div className="qr-input-wrap">
              <UserIcon />
              <input id="qr-fullName" className="qr-input" name="fullName" type="text"
                autoComplete="name" placeholder="Full name" value={form.fullName} onChange={handleChange} />
            </div>
          </div>

          <div className="qr-field">
            <label className="qr-label" htmlFor="qr-phone">Mobile Number</label>
            <div className="qr-input-wrap">
              <PhoneIcon />
              <input id="qr-phone" className="qr-input" name="phone" type="tel" inputMode="tel"
                autoComplete="tel" placeholder="Mobile number" value={form.phone} onChange={handleChange} />
            </div>
          </div>

          <div className="qr-row">
            <div className="qr-field">
              <label className="qr-label" htmlFor="qr-age">Age</label>
              <div className="qr-input-wrap">
                <HashIcon />
                <input id="qr-age" className="qr-input" name="age" type="number" inputMode="numeric"
                  min="0" max="120" placeholder="Age" value={form.age} onChange={handleChange} />
              </div>
            </div>
            <div className="qr-field">
              <label className="qr-label" htmlFor="qr-gender">Gender</label>
              <div className="qr-input-wrap">
                <UserIcon />
                <select id="qr-gender" className="qr-input" name="gender" value={form.gender} onChange={handleChange}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <ChevronIcon />
              </div>
            </div>
          </div>

          {error && <div className="qr-error" role="alert">{error}</div>}

          <button type="submit" className="qr-btn qr-btn-teal" disabled={loading}>
            {loading ? "Registering..." : "Complete Registration"} {!loading && <ArrowIcon />}
          </button>
        </form>

        <div className="qr-secure"><LockIcon /> Secure &amp; Safe · Your data is protected</div>
      </main>
    </div>
  );
}
