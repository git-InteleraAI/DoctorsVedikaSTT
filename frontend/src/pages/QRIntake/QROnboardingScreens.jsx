import { t, LANGUAGE_DISPLAY_NAMES } from "../../services/clinical/clinicalLanguage";
import { Icon, ArrowIcon, ShieldIcon, QRHeader } from "./QRShared";
import "./qr-theme.css";

const LANGUAGES = [
  ["English", "English"],
  ["Telugu", "తెలుగు"],
  ["Hindi", "हिन्दी"],
];

/* Rounded badge with rings (same as the success screen, smaller) */
const Badge = ({ children }) => (
  <div className="qr-badge-wrap sm">
    <div className="qr-badge sm">{children}</div>
  </div>
);
const ChatIcon = () => (
  <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 15a2 2 0 01-2 2H9l-5 4V6a2 2 0 012-2h12a2 2 0 012 2z" />
    <path d="M7 11h2l1.5-2.5 2 5L14 11h3" stroke="#35d3cc" />
  </svg>
);
const GlobeIcon = () => (
  <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
  </svg>
);

/**
 * Screens 4 (+ language + ready) of the QR flow.
 * Replaces the old `onboardingCard` block inside QRIntakeChat.jsx.
 * All text still comes from t(...) so Telugu / Hindi keep working.
 */
export default function QROnboardingScreens({
  step, qrLanguage, selectedLanguage, hospital, hospitalCode,
  error, consentSaving, onSelectLanguage, onChangeLanguage, onConsent, onStart,
}) {
  const header = <QRHeader hospital={hospital} hospitalCode={hospitalCode} />;

  /* ---------- Language ---------- */
  if (step === "language") {
    return (
      <div className="qr-root">
        {header}
        <main className="qr-card">
          <div className="qr-success">
            <Badge><GlobeIcon /></Badge>
            <h1 className="qr-title">{t("chooseLanguage", qrLanguage)}</h1>
            <p className="qr-sub">{t("chooseLanguageBody", qrLanguage)}</p>
          </div>
          <div className="qr-lang-list" role="group" aria-label={t("chooseLanguage", qrLanguage)}>
            {LANGUAGES.map(([value, label]) => (
              <button key={value} type="button"
                className={`qr-lang-btn ${selectedLanguage === value ? "selected" : ""}`}
                aria-pressed={selectedLanguage === value}
                onClick={() => onSelectLanguage(value)}>
                {label}
                <Icon size={20} color="#00b3ad" sw={2.6}><path d="M9 6l6 6-6 6" /></Icon>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  /* ---------- Screen 4 · Before You Meet the Doctor ---------- */
  if (step === "consent") {
    // consentBody = intro paragraph + "\n\n" + time reassurance (all 3 languages)
    const [intro, ...rest] = String(t("consentBody", qrLanguage)).split(/\n\s*\n/);
    const timeNote = rest.join(" ");
    return (
      <div className="qr-root">
        {header}
        <main className="qr-card">
          <div className="qr-success">
            <Badge><ChatIcon /></Badge>
            <h1 className="qr-title">{t("aiConsent", qrLanguage)}</h1>
            <p className="qr-sub">{intro}</p>
          </div>

          {timeNote && (
            <div className="qr-next qr-next-row">
              <Icon size={20}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
              <p>{timeNote}</p>
            </div>
          )}

          <div className="qr-info">
            <ShieldIcon />
            <p>{t("consentNote", qrLanguage)}</p>
          </div>

          {error && <div className="qr-error" role="alert">{error}</div>}

          <div className="qr-actions">
            <button type="button" className="qr-btn qr-btn-outline" disabled={consentSaving} onClick={onChangeLanguage}>
              <Icon size={18} color="#0e2a63" sw={2.4}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>
              {t("changeLanguage", qrLanguage)}
            </button>
            <button type="button" className="qr-btn qr-btn-teal" disabled={consentSaving} onClick={() => onConsent(true)}>
              {consentSaving ? t("saving", qrLanguage) : t("startAssessment", qrLanguage)}
              {!consentSaving && <ArrowIcon />}
            </button>
          </div>
          <button type="button" className="qr-link" disabled={consentSaving} onClick={() => onConsent(false)}>
            {t("doNotConsent", qrLanguage)}
          </button>
        </main>
      </div>
    );
  }

  /* ---------- Ready ---------- */
  if (step === "ready") {
    return (
      <div className="qr-root">
        {header}
        <main className="qr-card">
          <div className="qr-success">
            <Badge><ChatIcon /></Badge>
            <h1 className="qr-title">{t("ready", qrLanguage)}</h1>
            <p className="qr-sub">
              {t("readyBody", qrLanguage)(LANGUAGE_DISPLAY_NAMES[selectedLanguage] || selectedLanguage)}
            </p>
          </div>
          <div className="qr-info"><ShieldIcon /><p>{t("readyNote", qrLanguage)}</p></div>
          <button type="button" className="qr-btn qr-btn-teal" onClick={onStart}>
            {t("startAssessment", qrLanguage)} <ArrowIcon />
          </button>
        </main>
      </div>
    );
  }

  return null;
}
