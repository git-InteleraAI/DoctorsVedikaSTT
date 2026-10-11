import { t, translateDisplayValue } from "../../services/clinical/clinicalLanguage";
import { getSymptomDisplayName } from "../../services/clinical/questionSelector";
import DvLogo from "../../assets/dv-logo.png";
import { getHospitalLogo } from "../../data/hospitalLogos";
import { Icon } from "./QRShared";
import "./qr-theme.css";
import "./QRIntakeChat.css";

/* The symptom-intake chat itself (replaces the final `return (...)` of QRIntakeChat.jsx) */
export default function QRChatView({
  qrLanguage, hospital, hospitalCode, safetyStatus = "SAFE",
  messages, dialogueSession, intake, processing, quickChips,
  input, setInput, onSubmit, onChip, messagesEndRef,
}) {
  const hospitalLogo = getHospitalLogo(hospital?.code || hospitalCode);
  const tone = safetyStatus === "CRITICAL" ? "critical" : safetyStatus === "CAUTION" ? "caution" : "safe";

  const row = (label, value) => (
    <div className="qr-review-card-item">
      <span className="qr-review-card-label">{label}:</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="qr-root qr-chatpage">
      <div className="qr-intake-chat">
        <header className="qr-intake-header">
          <div className="qr-intake-brandrow">
            <img src={DvLogo} alt="Doctors Vedika" className="qr-intake-logo" />
            {hospitalLogo && (<><span className="qr-intake-sep" /><img src={hospitalLogo} alt={hospital?.name || "Hospital"} className="qr-intake-hlogo" /></>)}
          </div>
          <span className={`qr-intake-safety-badge ${tone}`}>{safetyStatus}</span>
          <h1 className="qr-intake-title">{t("clinicalIntake", qrLanguage)}</h1>
        </header>

        <main className="qr-intake-messages">
          {messages.map((message) => (
            <div key={message.id} className={`qr-message-group ${message.role}`}>
              <span className="qr-message-role">
                {message.role === "assistant" ? t("clinicalAssistant", qrLanguage) : t("you", qrLanguage)}
              </span>
              <div className={`qr-message ${message.role}`}>{message.text}</div>
            </div>
          ))}

          {dialogueSession?.state === "REVIEW" && (
            <div className="qr-review-card">
              <div className="qr-review-card-title">
                <Icon size={18}><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" /></Icon>
                <span>{t("recordedSummary", qrLanguage)}</span>
              </div>
              {row(t("symptoms", qrLanguage),
                intake.symptoms?.length
                  ? intake.symptoms.map((id) => translateDisplayValue(getSymptomDisplayName(id), qrLanguage)).join(", ")
                  : t("noneNoted", qrLanguage))}
              {intake.location && row(t("location", qrLanguage), translateDisplayValue(intake.location, qrLanguage))}
              {intake.duration && row(t("duration", qrLanguage), translateDisplayValue(intake.duration, qrLanguage))}
              {intake.severity && row(t("severity", qrLanguage),
                translateDisplayValue(intake.severity.charAt(0).toUpperCase() + intake.severity.slice(1), qrLanguage))}
              {intake.recent_actions && row(t("actionsMeds", qrLanguage), translateDisplayValue(intake.recent_actions, qrLanguage))}
            </div>
          )}

          {processing && (
            <div className="qr-message-group assistant">
              <span className="qr-message-role">{t("clinicalAssistant", qrLanguage)}</span>
              <div className="qr-message assistant qr-typing">{t("processing", qrLanguage)}</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        {quickChips && quickChips.length > 0 && !processing && (
          <div className="qr-quick-chips-container">
            {quickChips.map((chip, idx) => {
              const isConfirm = chip.toLowerCase().includes("confirm");
              return (
                <button key={`chip-${idx}-${chip}`} type="button" onClick={() => onChip(chip)}
                  disabled={processing} className={`qr-chip-btn ${isConfirm ? "confirm" : ""}`}>
                  {isConfirm ? "✓ " : ""}{chip}
                </button>
              );
            })}
          </div>
        )}

        <footer className="qr-intake-composer">
          <form onSubmit={onSubmit} className="qr-intake-form">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={t("typeResponse", qrLanguage)} disabled={processing}
              className="qr-intake-input" autoComplete="off" />
            <button type="submit" disabled={processing || !input.trim()} className="qr-intake-send-btn">
              {t("send", qrLanguage)}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
