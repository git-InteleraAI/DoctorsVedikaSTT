// Maps hospital code -> logo image. Add one line per partner hospital.
// (Later you can replace this with a `logo_url` column returned by the API.)
import toothMedic from "../assets/hospitals/tooth-medic.png";

export const hospitalLogos = {
  "DV-HOSP-003": toothMedic,
};

export const getHospitalLogo = (code) =>
  hospitalLogos[(code || "").trim().toUpperCase()] || null;
