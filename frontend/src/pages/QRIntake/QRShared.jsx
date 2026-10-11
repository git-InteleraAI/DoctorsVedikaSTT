import DvLogo from "../../assets/dv-logo.png";
import { getHospitalLogo } from "../../data/hospitalLogos";

export const Icon = ({ children, size = 18, color = "#007f7a", sw = 2 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
    {children}
  </svg>
);
export const ArrowIcon = () => <Icon size={20} color="#fff" sw={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const LockIcon = () => <Icon size={14} sw={2.2}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Icon>;
export const ShieldIcon = () => <Icon><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></Icon>;

/* Doctors Vedika logo (centered) + optional back button, then the hospital logo strip */
export function QRHeader({ hospital, hospitalCode, onBack, hideChip = false }) {
  const code = hospital?.code || hospitalCode;
  const logo = getHospitalLogo(code);
  return (
    <>
      <div className="qr-topbar">
        {onBack && (
          <button type="button" className="qr-back" aria-label="Back" onClick={onBack}>
            <Icon size={20} color="#0e2a63" sw={2.4}><path d="M15 6l-6 6 6 6" /></Icon>
          </button>
        )}
        <img className="qr-logo" src={DvLogo} alt="Doctors Vedika" />
      </div>
      {!hideChip && (logo || hospital?.name) && (
      <div className="qr-chip">
        {logo ? (
          <img src={logo} alt={hospital?.name || "Hospital"} />
        ) : (
          /* only if a hospital has no logo configured yet */
          <div className="qr-chip-name">{hospital?.name || "Hospital check-in"}</div>
        )}
      </div>
      )}
    </>
  );
}
