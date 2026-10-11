import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";
import { getHospitalLogo } from "../../data/hospitalLogos";
import DvLogo from "../../assets/dv-logo.png";
import { Icon, ArrowIcon, LockIcon } from "./QRShared";
import "./qr-theme.css";

const API = getApiBaseUrl();

/* Screen 1 · Check-in Welcome */
export default function QRIntakeEntry() {
  const { hospitalCode } = useParams();
  const navigate = useNavigate();

  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const code = hospitalCode?.trim().toUpperCase();
        if (!code) {
          setError("Invalid hospital QR code.");
          return;
        }
        const response = await axios.get(`${API}/api/v1/public/qr/hospitals/${encodeURIComponent(code)}`);
        if (cancelled) return;
        if (!response.data?.success) {
          throw new Error(response.data?.message || "Unable to identify hospital.");
        }
        setHospital(response.data.data.hospital);
      } catch (err) {
        if (cancelled) return;
        console.error("[QR Intake] Hospital resolution failed:", err);
        setError(err.response?.data?.message || err.message || "Unable to load hospital information.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [hospitalCode]);

  const handleContinue = () => {
    if (!hospital) return;
    navigate(`/qr/${encodeURIComponent(hospital.code)}/patient`);
  };

  const topbar = (
    <div className="qr-topbar stack">
      <img className="qr-logo" src={DvLogo} alt="Doctors Vedika" />
      <div className="qr-tagline"><span />Your Health, Our Priority<span /></div>
    </div>
  );

  if (loading) {
    return (
      <div className="qr-root">
        {topbar}
        <main className="qr-card" role="status" aria-live="polite">
          <h1 className="qr-title">Loading hospital…</h1>
          <p className="qr-sub">Please wait a moment.</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="qr-root">
        {topbar}
        <main className="qr-card">
          <h1 className="qr-title">Unable to continue</h1>
          <div className="qr-error" role="alert">{error}</div>
          <button type="button" className="qr-btn qr-btn-teal" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </main>
      </div>
    );
  }

  const logo = getHospitalLogo(hospital.code);

  return (
    <div className="qr-root">
      {topbar}
      <main className="qr-card">
        <div>
          <h1 className="qr-title" style={{ fontSize: 28 }}>Welcome</h1>
          <p className="qr-sub" style={{ marginTop: 4, fontSize: 15 }}>You are checking in for</p>
        </div>

        <section className="qr-clinic">
          {logo && (
            <div className="qr-logo-tile">
              <img src={logo} alt={hospital.name} />
            </div>
          )}
          {/* name shown only if this hospital has no logo configured yet */}
          {!logo && <h2 className="qr-clinic-name">{hospital.name}</h2>}
          {hospital.address && (
            <div className="qr-address">
              <Icon><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></Icon>
              <span>{hospital.address}</span>
            </div>
          )}
        </section>

        <button type="button" className="qr-btn qr-btn-teal" onClick={handleContinue}>
          Continue <ArrowIcon />
        </button>
        <div className="qr-secure"><LockIcon /> Secure &amp; Safe · Your data is protected</div>
      </main>
    </div>
  );
}