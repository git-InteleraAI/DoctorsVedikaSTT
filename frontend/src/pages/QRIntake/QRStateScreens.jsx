import { Link } from "react-router-dom";
import { t } from "../../services/clinical/clinicalLanguage";
import { formatReviewSummary } from "../../services/clinical/questionSelector";
import { Icon, ArrowIcon, QRHeader } from "./QRShared";
import "./qr-theme.css";
import "./QRIntakeChat.css";

/* Shared page shell: Doctors Vedika logo (centered) + hospital logo + card */
function Shell({ hospital, hospitalCode, hideChip, children, wide }) {
  return (
    <div className="qr-root">
      <QRHeader hospital={hospital} hospitalCode={hospitalCode} hideChip={hideChip} />
      <main className="qr-card" style={wide ? { maxWidth: 560 } : undefined}>{children}</main>
    </div>
  );
}

const IconBadge = ({ tone = "navy", children }) => (
  <div className="qr-badge-wrap sm">
    <div className={`qr-badge sm ${tone}`}>{children}</div>
  </div>
);

/* ---------- Loading ---------- */
export function QRLoadingScreen({ qrLanguage }) {
  return (
    <Shell hideChip>
      <div className="qr-success" role="status" aria-live="polite">
        <div className="qr-spinner" aria-hidden="true" />
        <h1 className="qr-title" style={{ fontSize: 20 }}>{t("loadingAssessment", qrLanguage)}</h1>
        <p className="qr-sub">{t("connecting", qrLanguage)}</p>
      </div>
    </Shell>
  );
}

/* ---------- Session expired ---------- */
export function QRExpiredScreen({ qrLanguage, hospitalCode }) {
  return (
    <Shell hideChip>
      <div className="qr-success">
        <IconBadge tone="amber">
          <Icon size={28} color="#fff" sw={2}><path d="M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4" /></Icon>
        </IconBadge>
        <h1 className="qr-title">{t("sessionExpired", qrLanguage)}</h1>
        <p className="qr-sub">{t("sessionExpiredBody", qrLanguage)}</p>
      </div>
      <Link to={`/qr/${hospitalCode || "DV-HOSP-003"}`} className="qr-btn qr-btn-teal" style={{ textDecoration: "none" }}>
        {t("scanNewCheckin", qrLanguage)} <ArrowIcon />
      </Link>
    </Shell>
  );
}

/* ---------- General error ---------- */
export function QRErrorScreen({ qrLanguage, error }) {
  return (
    <Shell hideChip>
      <div className="qr-success">
        <IconBadge tone="red">
          <Icon size={28} color="#fff" sw={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></Icon>
        </IconBadge>
        <h1 className="qr-title">{t("unableContinue", qrLanguage)}</h1>
      </div>
      <div className="qr-error" role="alert">{error}</div>
      <button type="button" className="qr-btn qr-btn-teal" onClick={() => window.location.reload()}>
        {t("tryAgain", qrLanguage)}
      </button>
    </Shell>
  );
}

/* ---------- Critical / emergency ---------- */
export function QRCriticalScreen({ qrLanguage, hospital, hospitalCode }) {
  return (
    <Shell hospital={hospital} hospitalCode={hospitalCode} wide>
      <div className="qr-success">
        <IconBadge tone="red">
          <Icon size={30} color="#fff" sw={2.2}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></Icon>
        </IconBadge>
        <h1 className="qr-title" style={{ color: "#9b1c1c" }}>{t("urgentTitle", qrLanguage)}</h1>
        <p className="qr-sub">{t("urgentBody", qrLanguage)}</p>
      </div>
      <div className="qr-actions" style={{ flexDirection: "column" }}>
        <a href="tel:112" className="qr-btn qr-btn-red" style={{ textDecoration: "none" }}>{t("emergency112", qrLanguage)}</a>
        <a href="tel:108" className="qr-btn qr-btn-darkred" style={{ textDecoration: "none" }}>{t("ambulance108", qrLanguage)}</a>
      </div>
    </Shell>
  );
}

/* ---------- Submitted ---------- */
export function QRSubmittedScreen({ session, hospital, hospitalCode, accessToken, intake }) {
  return (
    <Shell hospital={hospital} hospitalCode={hospitalCode} wide>
      <div className="qr-success">
        <div className="qr-badge-wrap">
          <div className="qr-badge">
            <svg role="img" aria-label="Success" width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
        </div>
        <h1 className="qr-title">Intake Submitted Successfully</h1>
        <p className="qr-sub">
          Thank you, <strong>{session?.patientName || session?.firstName || "Patient"}</strong>. Your symptom
          details have been securely sent to the staff reception desk
          {hospital?.name ? <> at <strong>{hospital.name}</strong></> : null}.
        </p>
      </div>

      <section className="qr-summary">
        <h2>Recorded Assessment Summary</h2>
        <div className="qr-summary-text">{formatReviewSummary(intake)}</div>
      </section>

      <section className="qr-next">
        <h2>Your assessment is complete</h2>
        <p>You can now explore general health education resources while you wait for the staff to assist you.</p>
      </section>

      <p className="qr-sub" style={{ textAlign: "center" }}>
        Please proceed to the reception desk or take a seat in the waiting area. The staff will call your name shortly.
      </p>

      <Link
        to={`/qr/${encodeURIComponent(hospitalCode || "DV-HOSP-003")}/education/${encodeURIComponent(accessToken)}`}
        className="qr-btn qr-btn-navy"
        style={{ textDecoration: "none" }}
      >
        <Icon size={20} color="#fff"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z" /></Icon>
        Watch Health Education <ArrowIcon />
      </Link>

      <div className="qr-secure">
        Submitted at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </Shell>
  );
}
