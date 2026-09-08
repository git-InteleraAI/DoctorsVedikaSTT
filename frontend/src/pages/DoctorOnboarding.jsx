import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import authService from "../services/authService";
import { specializationsData } from "../data/specializations";
import { useAuth } from "../context/AuthContext";
import "../index.css";

const CustomDropdown = ({
  options,
  value,
  onChange,
  placeholder,
  icon,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, []);

  return (
    <div
      className={`holo-custom-dropdown ${isOpen ? "open" : ""
        }`}
      ref={dropdownRef}
      onClick={() => setIsOpen(!isOpen)}
    >
      <i className={icon}></i>

      <div className="holo-selected-value">
        {value || (
          <span
            style={{
              color: "rgba(255, 255, 255, 0.4)",
            }}
          >
            {placeholder}
          </span>
        )}
      </div>

      <i
        className={`fa-solid fa-chevron-down holo-dropdown-arrow ${isOpen ? "open" : ""
          }`}
      ></i>

      {isOpen && (
        <ul className="holo-dropdown-list">
          <li
            onClick={() => onChange("")}
            style={{
              color: "rgba(255, 255, 255, 0.5)",
              fontStyle: "italic",
            }}
          >
            Clear Selection
          </li>

          {options.map((opt) => (
            <li
              key={opt}
              onClick={() => onChange(opt)}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const LanguageChipBoxGroup = ({
  options,
  value,
  onChange,
}) => {
  const selectedValues = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? value.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const handleToggleOption = (opt) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter((item) => item !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  return (
    <div
      className="language-chips-wrapper"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "10px",
        marginTop: "8px",
        width: "100%",
      }}
    >
      {options.map((opt) => {
        const isSelected = selectedValues.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => handleToggleOption(opt)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "50px",
              fontSize: "0.92rem",
              fontWeight: isSelected ? "600" : "500",
              color: isSelected ? "#FFFFFF" : "#E2E8F0",
              background: isSelected
                ? "linear-gradient(135deg, #08AEB8 0%, #068992 100%)"
                : "rgba(255, 255, 255, 0.08)",
              border: isSelected
                ? "1px solid #08AEB8"
                : "1px solid rgba(255, 255, 255, 0.18)",
              boxShadow: isSelected
                ? "0 4px 14px rgba(8, 174, 184, 0.38)"
                : "0 2px 5px rgba(0, 0, 0, 0.1)",
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              userSelect: "none",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.16)";
                e.currentTarget.style.borderColor = "rgba(8, 174, 184, 0.5)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.18)";
                e.currentTarget.style.transform = "translateY(0)";
              }
            }}
          >
            {isSelected && (
              <i
                className="fa-solid fa-check"
                style={{
                  fontSize: "0.85rem",
                  color: "#FFFFFF",
                }}
              ></i>
            )}
            {opt}
          </button>
        );
      })}
    </div>
  );
};

const DoctorOnboarding = () => {
  const navigate = useNavigate();
  const { doctor: authDoctor, updateDoctor } = useAuth();

  const maxDobAllowed = new Date(
    new Date().getFullYear() - 18,
    new Date().getMonth(),
    new Date().getDate()
  ).toISOString().split("T")[0];

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [currentStep, setCurrentStep] = useState(1);

  // File Upload States
  const [uploadingPhoto, setUploadingPhoto] =
    useState(false);
  const [uploadingDoc, setUploadingDoc] =
    useState(false);
  const [uploadingGovId, setUploadingGovId] =
    useState(false);

  // Cascading Dropdown States
  const [selectedDomain, setSelectedDomain] =
    useState("");
  const [selectedSubdomain, setSelectedSubdomain] =
    useState("");
  const [otherSpecialization, setOtherSpecialization] =
    useState("");

  const [formData, setFormData] = useState({
    doctor_first_name: "",
    doctor_last_name: "",
    doctor_email: "",
    doctor_mobile: "",
    doctor_registration_number: "",
    doctor_specialization: "",
    doctor_qualification: "",
    doctor_experience: "",
    doctor_clinic_name: "",
    doctor_clinic_address: "",
    doctor_consultation_fee: "",
    doctor_languages: "",
    doctor_gender: "Male",
    doctor_dob: "",
    doctor_gmaps_location: "",
    doctor_profile_photo: "",
    doctor_medical_license_url: "",
    doctor_gov_id_url: "",
    doctor_description: "",
    doctor_quote: "",
  });

  /*
   * Load the currently authenticated doctor.
   *
   * Dynamically pre-fills existing profile information from database/Auth.
   */
  useEffect(() => {
    const doctor = authDoctor || authService.getCurrentDoctor();

    if (doctor) {
      if (doctor.onboardingCompleted) {
        navigate("/dashboard");
        return;
      }

      let rawName = (doctor.fullName || doctor.name || doctor.doctor_name || "").trim();
      if (rawName.toLowerCase().startsWith("dr.")) {
        rawName = rawName.slice(3).trim();
      } else if (rawName.toLowerCase().startsWith("dr ")) {
        rawName = rawName.slice(3).trim();
      }

      const nameParts = rawName.split(" ").filter(Boolean);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      const mobile = (doctor.mobileNumber || doctor.mobile_number || doctor.phone || doctor.doctor_mobile || "").trim();
      const cleanMobile = mobile === "0000000000" ? "" : mobile;

      setFormData((prev) => ({
        ...prev,
        doctor_first_name: firstName || prev.doctor_first_name,
        doctor_last_name: lastName || prev.doctor_last_name,
        doctor_email: doctor.email || doctor.doctor_email || prev.doctor_email,
        doctor_mobile: cleanMobile || prev.doctor_mobile,
        doctor_registration_number: doctor.registrationNumber || doctor.registration_number || doctor.doctor_registration_number || prev.doctor_registration_number,
        doctor_dob: doctor.dob || doctor.doctor_dob || prev.doctor_dob,
        doctor_gender: doctor.gender || doctor.doctor_gender || prev.doctor_gender || "Male",
        doctor_qualification: doctor.qualification || doctor.doctor_qualification || prev.doctor_qualification,
        doctor_clinic_name: doctor.clinicName || doctor.doctor_clinic_name || prev.doctor_clinic_name,
        doctor_clinic_address: doctor.clinicAddress || doctor.doctor_clinic_address || prev.doctor_clinic_address,
        doctor_consultation_fee: doctor.consultationFee || doctor.doctor_consultation_fee || prev.doctor_consultation_fee,
        doctor_experience: doctor.experience || doctor.doctor_experience || prev.doctor_experience,
        doctor_description: doctor.description || doctor.doctor_description || prev.doctor_description,
        doctor_quote: doctor.quote || doctor.doctor_quote || prev.doctor_quote,
        doctor_languages: Array.isArray(doctor.languages) && doctor.languages.length > 0 ? doctor.languages : (doctor.languages || prev.doctor_languages),
      }));

      // Prefill domain and subdomain if specialization exists
      const spec = (doctor.specialization || doctor.doctor_specialization || "").trim();
      if (spec) {
        for (const [domain, subdomains] of Object.entries(specializationsData)) {
          if (domain.toLowerCase() === spec.toLowerCase()) {
            setSelectedDomain(domain);
            break;
          }
          if (subdomains.some((sub) => sub.toLowerCase() === spec.toLowerCase())) {
            setSelectedDomain(domain);
            setSelectedSubdomain(subdomains.find((sub) => sub.toLowerCase() === spec.toLowerCase()) || spec);
            break;
          }
        }
      }
    } else {
      navigate("/login");
    }
  }, [authDoctor, navigate]);

  /*
   * IMPORTANT:
   *
   * When the user enters a different step,
   * clear only old validation messages.
   *
   * We DO NOT validate the new step automatically.
   *
   * This prevents messages such as:
   *
   * "Please enter your Clinic or Hospital Name."
   *
   * from appearing immediately when Step 3 opens.
   */
  useEffect(() => {
    setErrorMsg("");
    setSuccessMsg("");
  }, [currentStep]);

  /*
   * Normal text input handler.
   *
   * Uses functional state update to avoid stale state.
   */
  const handleChange = (e) => {
    const {
      name,
      value,
    } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Remove an existing validation message
    // when the user starts correcting a field.
    if (errorMsg) {
      setErrorMsg("");
    }
  };

  /*
   * File Upload
   */
  const handleFileUpload = async (
    e,
    type
  ) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    setErrorMsg("");

    if (type === "profile") {
      setUploadingPhoto(true);
    }

    if (type === "document") {
      setUploadingDoc(true);
    }

    if (type === "gov_id") {
      setUploadingGovId(true);
    }

    try {
      const url =
        await authService.uploadDocument(
          file,
          type
        );

      setFormData((prev) => {
        if (type === "profile") {
          return {
            ...prev,
            doctor_profile_photo:
              url,
          };
        }

        if (type === "document") {
          return {
            ...prev,
            doctor_medical_license_url:
              url,
          };
        }

        if (type === "gov_id") {
          return {
            ...prev,
            doctor_gov_id_url:
              url,
          };
        }

        return prev;
      });
    } catch (err) {
      console.error(
        "[DoctorOnboarding] File upload error:",
        err
      );

      setErrorMsg(
        err?.message ||
        "Failed to upload file. Please try again."
      );
    } finally {
      if (type === "profile") {
        setUploadingPhoto(false);
      }

      if (type === "document") {
        setUploadingDoc(false);
      }

      if (type === "gov_id") {
        setUploadingGovId(false);
      }
    }
  };

  /*
   * NEXT BUTTON
   *
   * This function ONLY validates the current step.
   *
   * Step 3 is NEVER validated here because
   * Step 3 is the final submission step.
   */
  const handleNext = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Clear previous error
    setErrorMsg("");
    setSuccessMsg("");

    /*
     * ==========================================
     * STEP 1 VALIDATION
     * ==========================================
     */
    if (currentStep === 1) {
      if (
        !formData.doctor_first_name?.trim()
      ) {
        setErrorMsg(
          "Please enter your First Name."
        );
        return;
      }

      if (
        !formData.doctor_last_name?.trim()
      ) {
        setErrorMsg(
          "Please enter your Last Name."
        );
        return;
      }

      if (
        !formData.doctor_mobile?.trim()
      ) {
        setErrorMsg(
          "Please enter your Mobile Number."
        );
        return;
      }

      const digitsOnly =
        formData.doctor_mobile.replace(
          /\D/g,
          ""
        );

      if (digitsOnly.length !== 10) {
        setErrorMsg(
          "Mobile number must be exactly 10 digits."
        );
        return;
      }

      if (!/^[6-9]/.test(digitsOnly)) {
        setErrorMsg(
          "Mobile number must start with 6, 7, 8, or 9."
        );
        return;
      }

      /*
       * Date of birth is optional.
       * If supplied, validate it.
       */
      if (formData.doctor_dob) {
        const dobDate =
          new Date(
            formData.doctor_dob
          );

        const today =
          new Date();

        let age =
          today.getFullYear() -
          dobDate.getFullYear();

        const monthDiff =
          today.getMonth() -
          dobDate.getMonth();

        if (
          monthDiff < 0 ||
          (
            monthDiff === 0 &&
            today.getDate() <
            dobDate.getDate()
          )
        ) {
          age--;
        }

        if (age < 21) {
          setErrorMsg(
            "Doctor must be at least 21 years of age to register."
          );
          return;
        }

        if (
          age > 100 ||
          dobDate > today
        ) {
          setErrorMsg(
            "Please enter a valid Date of Birth."
          );
          return;
        }
      }
    }

    /*
     * ==========================================
     * STEP 2 VALIDATION
     * ==========================================
     */
    if (currentStep === 2) {
      if (!selectedDomain) {
        setErrorMsg(
          "Please select your Domain Area."
        );
        return;
      }

      if (
        selectedDomain !== "Other" &&
        !selectedSubdomain
      ) {
        setErrorMsg(
          "Please select your Specialization."
        );
        return;
      }

      if (
        showOtherInput &&
        !otherSpecialization?.trim()
      ) {
        setErrorMsg(
          "Please specify your Specialization."
        );
        return;
      }

      if (
        !formData.doctor_qualification?.trim()
      ) {
        setErrorMsg(
          "Please enter your Qualification (e.g., MBBS, MD)."
        );
        return;
      }

      if (
        !formData.doctor_registration_number?.trim()
      ) {
        setErrorMsg(
          "Please enter your Medical Registration Number."
        );
        return;
      }
    }

    /*
     * ==========================================
     * MOVE TO NEXT STEP
     * ==========================================
     *
     * There is intentionally NO Step 3
     * validation here.
     */
    if (currentStep < 3) {
      setCurrentStep(
        (prev) => prev + 1
      );
    }
  };

  /*
   * PREVIOUS BUTTON
   */
  const handlePrev = () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (currentStep > 1) {
      setCurrentStep(
        (prev) => prev - 1
      );
    }
  };

  /*
   * FINAL SUBMISSION
   *
   * This function runs ONLY when the user
   * clicks "Complete Setup".
   *
   * It does NOT run while moving from
   * Step 2 → Step 3 because the Step 2
   * button is type="button".
   */
  const handleSubmit = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    /*
     * Safety guard.
     *
     * Never execute final submission logic
     * for Step 1 or Step 2.
     */
    if (currentStep !== 3) {
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");

    /*
     * ==========================================
     * STEP 3 VALIDATION
     * ==========================================
     *
     * These checks happen ONLY after the
     * user clicks "Complete Setup".
     */

    if (
      !formData.doctor_clinic_name?.trim()
    ) {
      setErrorMsg(
        "Please enter your Clinic or Hospital Name."
      );
      return;
    }

    if (
      !formData.doctor_clinic_address?.trim()
    ) {
      setErrorMsg(
        "Please enter your Clinic/Hospital Address."
      );
      return;
    }

    if (
      !formData.doctor_profile_photo
    ) {
      setErrorMsg(
        "Please upload your Profile Photo before submitting."
      );
      return;
    }

    if (
      !formData.doctor_medical_license_url
    ) {
      setErrorMsg(
        "Please upload your Medical License / Registration document."
      );
      return;
    }

    if (
      !formData.doctor_gov_id_url
    ) {
      setErrorMsg(
        "Please upload your Government ID (Aadhaar or PAN)."
      );
      return;
    }

    if (
      !formData.doctor_description?.trim()
    ) {
      setErrorMsg(
        "Please write a brief description about your practice and expertise."
      );
      return;
    }

    /*
     * ==========================================
     * FINAL SPECIALIZATION
     * ==========================================
     */

    let finalSpecialization = "";

    if (
      selectedDomain === "Other" ||
      selectedSubdomain === "Other"
    ) {
      finalSpecialization =
        otherSpecialization?.trim() ||
        "";
    } else if (
      selectedSubdomain
    ) {
      finalSpecialization =
        `${selectedDomain} - ${selectedSubdomain}`;
    } else {
      finalSpecialization =
        selectedDomain;
    }

    if (!finalSpecialization) {
      setErrorMsg(
        "Please select your specialization from the dropdown options."
      );

      setCurrentStep(2);

      return;
    }

    /*
     * ==========================================
     * SUBMIT TO BACKEND
     * ==========================================
     */

    setLoading(true);

    try {
      const payload = {
        ...formData,

        doctor_specialization:
          finalSpecialization,

        doctor_domain:
          selectedDomain,
      };

      const res =
        await authService.completeOnboarding(
          payload
        );

      if (
        res &&
        res.success
      ) {
        setSuccessMsg(
          "Profile completed successfully! Redirecting to Dashboard..."
        );

        if (res.doctor) {
          updateDoctor(
            res.doctor
          );
        }

        setTimeout(() => {
          navigate("/dashboard");
        }, 1200);
      } else {
        setErrorMsg(
          res?.message ||
          "Failed to complete onboarding."
        );
      }
    } catch (err) {
      console.error(
        "[DoctorOnboarding] Submission error:",
        err
      );

      setErrorMsg(
        err?.message ||
        "Unable to connect to backend server."
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * ==========================================
   * DROPDOWN OPTIONS
   * ==========================================
   */

  const domainOptions = [
    ...Object.keys(
      specializationsData
    ),
    "Other",
  ];

  const subdomainOptions =
    selectedDomain &&
      selectedDomain !== "Other"
      ? [
        ...specializationsData[
        selectedDomain
        ],
        "Other",
      ]
      : [];

  const showOtherInput =
    selectedDomain === "Other" ||
    selectedSubdomain === "Other";

  /*
   * ==========================================
   * UI
   * ==========================================
   */

  return (
    <div className="holo-onboarding-wrapper">
      <div className="holo-card">

        <h1>
          Complete Your Profile
        </h1>

        <p className="subtitle">
          Let's set up your professional
          medical workspace.
        </p>

        {/* =====================================
            STEPPER UI
        ====================================== */}

        <div className="holo-stepper">
          <div
            className="holo-stepper-progress"
            style={{
              width: `${(currentStep - 1) * 50
                }%`,
            }}
          ></div>

          <div
            className={`holo-step ${currentStep >= 1
                ? "active"
                : ""
              }`}
          >
            <div className="holo-step-circle">
              1
            </div>

            <div className="holo-step-label">
              Basic Info
            </div>
          </div>

          <div
            className={`holo-step ${currentStep >= 2
                ? "active"
                : ""
              }`}
          >
            <div className="holo-step-circle">
              2
            </div>

            <div className="holo-step-label">
              Professional
            </div>
          </div>

          <div
            className={`holo-step ${currentStep >= 3
                ? "active"
                : ""
              }`}
          >
            <div className="holo-step-circle">
              3
            </div>

            <div className="holo-step-label">
              Clinic & Bio
            </div>
          </div>
        </div>

        {/* =====================================
            ERROR MESSAGE
        ====================================== */}

        {errorMsg && (
          <div
            style={{
              background:
                "rgba(239, 68, 68, 0.2)",
              color: "#FFB4B4",
              padding: "12px 16px",
              borderRadius: "12px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontWeight: 600,
              border:
                "1px solid rgba(239, 68, 68, 0.5)",
            }}
          >
            <i className="fa-solid fa-circle-exclamation"></i>

            {errorMsg}
          </div>
        )}

        {/* =====================================
            SUCCESS MESSAGE
        ====================================== */}

        {successMsg && (
          <div
            style={{
              background:
                "rgba(16, 185, 129, 0.2)",
              color: "#A7F3D0",
              padding: "12px 16px",
              borderRadius: "12px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontWeight: 600,
              border:
                "1px solid rgba(16, 185, 129, 0.5)",
            }}
          >
            <i className="fa-solid fa-circle-check"></i>

            {successMsg}
          </div>
        )}

        {/* =====================================
            FORM
        ====================================== */}

        <form
          onSubmit={handleSubmit}
          noValidate
        >

          {/* ===================================
              STEP 1: BASIC INFO
          ==================================== */}

          {currentStep === 1 && (
            <div
              className="holo-step-content"
              style={{
                animation:
                  "fadeIn 0.5s ease",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: "20px",
                }}
              >

                {/* First Name */}

                <div className="holo-input-group">
                  <label>
                    First Name *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-user-doctor"></i>

                    <input
                      type="text"
                      name="doctor_first_name"
                      value={
                        formData.doctor_first_name
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter First Name"
                    />
                  </div>
                </div>

                {/* Last Name */}

                <div className="holo-input-group">
                  <label>
                    Last Name *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-user"></i>

                    <input
                      type="text"
                      name="doctor_last_name"
                      value={
                        formData.doctor_last_name
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter Last Name"
                    />
                  </div>
                </div>

                {/* Email */}

                <div className="holo-input-group">
                  <label>
                    Email Address *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-envelope"></i>

                    <input
                      type="email"
                      name="doctor_email"
                      value={
                        formData.doctor_email
                      }
                      disabled
                      placeholder="Enter Email Address"
                      style={{
                        opacity: 0.6,
                        cursor:
                          "not-allowed",
                      }}
                    />
                  </div>
                </div>

                {/* Mobile */}

                <div className="holo-input-group">
                  <label>
                    Mobile Number *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-phone"></i>

                    <input
                      type="tel"
                      name="doctor_mobile"
                      value={
                        formData.doctor_mobile
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter 10-Digit Mobile Number"
                    />
                  </div>
                </div>

                {/* DOB */}

                <div className="holo-input-group">
                  <label>
                    Date of Birth (Must be 18+)
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-calendar"></i>

                    <input
                      type="date"
                      name="doctor_dob"
                      max={maxDobAllowed}
                      value={
                        formData.doctor_dob
                      }
                      onChange={
                        handleChange
                      }
                    />
                  </div>
                </div>

                {/* Gender */}

                <div className="holo-input-group">
                  <label>
                    Gender
                  </label>

                  <div className="holo-input-wrapper">
                    <CustomDropdown
                      options={[
                        "Male",
                        "Female",
                        "Other",
                      ]}
                      value={
                        formData.doctor_gender
                      }
                      onChange={(val) =>
                        setFormData(
                          (prev) => ({
                            ...prev,
                            doctor_gender:
                              val,
                          })
                        )
                      }
                      placeholder="Select Gender"
                      icon="fa-solid fa-venus-mars"
                    />
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ===================================
              STEP 2: PROFESSIONAL DETAILS
          ==================================== */}

          {currentStep === 2 && (
            <div
              className="holo-step-content"
              style={{
                animation:
                  "fadeIn 0.5s ease",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: "20px",
                }}
              >

                {/* Domain */}

                <div className="holo-input-group">
                  <label>
                    Domain Area *
                  </label>

                  <div className="holo-input-wrapper">
                    <CustomDropdown
                      options={
                        domainOptions
                      }
                      value={
                        selectedDomain
                      }
                      onChange={(val) => {
                        setSelectedDomain(
                          val
                        );

                        setSelectedSubdomain(
                          ""
                        );

                        setErrorMsg("");
                      }}
                      placeholder="Select Domain (e.g., Dental, Cardiology)..."
                      icon="fa-solid fa-stethoscope"
                    />
                  </div>
                </div>

                {/* Subdomain */}

                {selectedDomain &&
                  selectedDomain !==
                  "Other" && (
                    <div className="holo-input-group">
                      <label>
                        Specialization *
                      </label>

                      <div className="holo-input-wrapper">
                        <CustomDropdown
                          options={
                            subdomainOptions
                          }
                          value={
                            selectedSubdomain
                          }
                          onChange={(
                            val
                          ) => {
                            setSelectedSubdomain(
                              val
                            );

                            setErrorMsg(
                              ""
                            );
                          }}
                          placeholder="Select Specialization..."
                          icon="fa-solid fa-user-md"
                        />
                      </div>
                    </div>
                  )}

                {/* Other Specialization */}

                {showOtherInput && (
                  <div
                    className="holo-input-group"
                    style={{
                      gridColumn:
                        selectedDomain ===
                          "Other"
                          ? "2 / 3"
                          : "1 / -1",
                    }}
                  >
                    <label>
                      Specify Specialization *
                    </label>

                    <div className="holo-input-wrapper">
                      <i className="fa-solid fa-pencil"></i>

                      <input
                        type="text"
                        value={
                          otherSpecialization
                        }
                        onChange={(e) => {
                          setOtherSpecialization(
                            e.target
                              .value
                          );

                          if (
                            errorMsg
                          ) {
                            setErrorMsg(
                              ""
                            );
                          }
                        }}
                        placeholder="e.g., Aerospace Medicine"
                      />
                    </div>
                  </div>
                )}

                {/* Qualification */}

                <div className="holo-input-group">
                  <label>
                    Qualification *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-graduation-cap"></i>

                    <input
                      type="text"
                      name="doctor_qualification"
                      value={
                        formData.doctor_qualification
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter Qualification (e.g., MBBS, MD)"
                    />
                  </div>
                </div>

                {/* Registration Number */}

                <div className="holo-input-group">
                  <label>
                    Registration Number *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-id-card"></i>

                    <input
                      type="text"
                      name="doctor_registration_number"
                      value={
                        formData.doctor_registration_number
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter Registration Number"
                    />
                  </div>
                </div>

                {/* Experience */}

                <div className="holo-input-group">
                  <label>
                    Years of Experience
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-briefcase"></i>

                    <input
                      type="text"
                      name="doctor_experience"
                      value={
                        formData.doctor_experience
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter Years of Experience (e.g., 5 Years)"
                    />
                  </div>
                </div>

                {/* Consultation Fee */}

                <div className="holo-input-group">
                  <label>
                    Consultation Fee (₹)
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-indian-rupee-sign"></i>

                    <input
                      type="number"
                      name="doctor_consultation_fee"
                      value={
                        formData.doctor_consultation_fee
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter Consultation Fee in ₹"
                    />
                  </div>
                </div>

                {/* Languages */}

                <div
                  className="holo-input-group"
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <i className="fa-solid fa-language" style={{ color: "#08AEB8" }}></i>
                    Languages Spoken
                  </label>

                  <LanguageChipBoxGroup
                    options={[
                      "English",
                      "Hindi",
                      "Telugu",
                      "Tamil",
                      "Kannada",
                      "Malayalam",
                      "Marathi",
                      "Gujarati",
                      "Bengali",
                      "Punjabi",
                      "Urdu",
                    ]}
                    value={formData.doctor_languages}
                    onChange={(val) => {
                      setFormData((prev) => ({
                        ...prev,
                        doctor_languages: val,
                      }));
                      setErrorMsg("");
                    }}
                  />
                </div>

              </div>
            </div>
          )}

          {/* ===================================
              STEP 3: CLINIC & DOCUMENTS
          ==================================== */}

          {currentStep === 3 && (
            <div
              className="holo-step-content"
              style={{
                animation:
                  "fadeIn 0.5s ease",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: "20px",
                }}
              >

                {/* Clinic Name */}

                <div
                  className="holo-input-group"
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <label>
                    Clinic/Hospital Name *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-hospital"></i>

                    <input
                      type="text"
                      name="doctor_clinic_name"
                      value={
                        formData.doctor_clinic_name
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter Clinic or Hospital Name"
                    />
                  </div>
                </div>

                {/* Clinic Address */}

                <div
                  className="holo-input-group"
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <label>
                    Clinic/Hospital Address *
                  </label>

                  <div className="holo-input-wrapper">
                    <i
                      className="fa-solid fa-map-location-dot"
                      style={{
                        top: "16px",
                      }}
                    ></i>

                    <textarea
                      name="doctor_clinic_address"
                      value={
                        formData.doctor_clinic_address
                      }
                      onChange={
                        handleChange
                      }
                      rows="2"
                      placeholder="Enter Clinic/Hospital Street Address"
                      style={{
                        resize:
                          "vertical",
                      }}
                    ></textarea>
                  </div>
                </div>

                {/* Google Maps */}

                <div
                  className="holo-input-group"
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <label>
                    Google Maps Location Link
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-location-dot"></i>

                    <input
                      type="url"
                      name="doctor_gmaps_location"
                      value={
                        formData.doctor_gmaps_location
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="e.g., https://maps.google.com/?q=..."
                    />
                  </div>
                </div>

                {/* =================================
                    PROFILE PHOTO
                ================================== */}

                <div className="holo-input-group">
                  <label>
                    Profile Photo *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-image"></i>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        handleFileUpload(
                          e,
                          "profile"
                        )
                      }
                      style={{
                        padding:
                          "10px 14px 10px 45px",
                        color:
                          "#94A3B8",
                      }}
                    />
                  </div>

                  {uploadingPhoto && (
                    <span
                      style={{
                        fontSize:
                          "0.85rem",
                        color:
                          "#08AEB8",
                        marginTop:
                          "5px",
                        display:
                          "inline-block",
                      }}
                    >
                      <i className="fa-solid fa-spinner fa-spin"></i>{" "}
                      Uploading...
                    </span>
                  )}

                  {formData.doctor_profile_photo &&
                    !uploadingPhoto && (
                      <span
                        style={{
                          fontSize:
                            "0.85rem",
                          color:
                            "#10B981",
                          marginTop:
                            "5px",
                          display:
                            "inline-block",
                        }}
                      >
                        <i className="fa-solid fa-check"></i>{" "}
                        Uploaded Successfully
                      </span>
                    )}
                </div>

                {/* =================================
                    MEDICAL LICENSE
                ================================== */}

                <div className="holo-input-group">
                  <label>
                    Medical License / ID *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-file-medical"></i>

                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) =>
                        handleFileUpload(
                          e,
                          "document"
                        )
                      }
                      style={{
                        padding:
                          "10px 14px 10px 45px",
                        color:
                          "#94A3B8",
                      }}
                    />
                  </div>

                  {uploadingDoc && (
                    <span
                      style={{
                        fontSize:
                          "0.85rem",
                        color:
                          "#08AEB8",
                        marginTop:
                          "5px",
                        display:
                          "inline-block",
                      }}
                    >
                      <i className="fa-solid fa-spinner fa-spin"></i>{" "}
                      Uploading...
                    </span>
                  )}

                  {formData.doctor_medical_license_url &&
                    !uploadingDoc && (
                      <span
                        style={{
                          fontSize:
                            "0.85rem",
                          color:
                            "#10B981",
                          marginTop:
                            "5px",
                          display:
                            "inline-block",
                        }}
                      >
                        <i className="fa-solid fa-check"></i>{" "}
                        Uploaded Successfully
                      </span>
                    )}
                </div>

                {/* =================================
                    GOVERNMENT ID
                ================================== */}

                <div className="holo-input-group">
                  <label>
                    Government ID (Aadhar/PAN) *
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-id-badge"></i>

                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) =>
                        handleFileUpload(
                          e,
                          "gov_id"
                        )
                      }
                      style={{
                        padding:
                          "10px 14px 10px 45px",
                        color:
                          "#94A3B8",
                      }}
                    />
                  </div>

                  {uploadingGovId && (
                    <span
                      style={{
                        fontSize:
                          "0.85rem",
                        color:
                          "#08AEB8",
                        marginTop:
                          "5px",
                        display:
                          "inline-block",
                      }}
                    >
                      <i className="fa-solid fa-spinner fa-spin"></i>{" "}
                      Uploading...
                    </span>
                  )}

                  {formData.doctor_gov_id_url &&
                    !uploadingGovId && (
                      <span
                        style={{
                          fontSize:
                            "0.85rem",
                          color:
                            "#10B981",
                          marginTop:
                            "5px",
                          display:
                            "inline-block",
                        }}
                      >
                        <i className="fa-solid fa-check"></i>{" "}
                        Uploaded Successfully
                      </span>
                    )}
                </div>

                {/* =================================
                    DESCRIPTION
                ================================== */}

                <div
                  className="holo-input-group"
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <label>
                    About Me / Description *
                  </label>

                  <div className="holo-input-wrapper">
                    <i
                      className="fa-solid fa-align-left"
                      style={{
                        top: "16px",
                      }}
                    ></i>

                    <textarea
                      name="doctor_description"
                      value={
                        formData.doctor_description
                      }
                      onChange={
                        handleChange
                      }
                      rows="3"
                      placeholder="Brief overview of your medical practice, experience, and patient care philosophy..."
                      style={{
                        resize:
                          "vertical",
                      }}
                    ></textarea>
                  </div>
                </div>

                {/* =================================
                    QUOTE
                ================================== */}

                <div
                  className="holo-input-group"
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <label>
                    Favorite Medical Quote
                  </label>

                  <div className="holo-input-wrapper">
                    <i className="fa-solid fa-quote-left"></i>

                    <input
                      type="text"
                      name="doctor_quote"
                      value={
                        formData.doctor_quote
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="e.g., Wherever the art of Medicine is loved, there is also a love of Humanity."
                    />
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* =====================================
              NAVIGATION BUTTONS
          ====================================== */}

          <div className="holo-btn-group">

            {/* Previous */}

            {currentStep > 1 ? (
              <button
                type="button"
                className="holo-btn holo-btn-outline"
                onClick={handlePrev}
              >
                <i className="fa-solid fa-arrow-left"></i>{" "}
                Previous
              </button>
            ) : (
              <div></div>
            )}

            {/* Next / Complete */}

            {currentStep < 3 ? (
              <button
                type="button"
                className="holo-btn holo-btn-primary"
                onClick={handleNext}
              >
                Next{" "}
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            ) : (
              <button
                type="submit"
                className="holo-btn holo-btn-primary"
                disabled={
                  loading ||
                  uploadingPhoto ||
                  uploadingDoc ||
                  uploadingGovId
                }
              >
                {loading ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin"></i>{" "}
                    Finalizing...
                  </>
                ) : (
                  <>
                    Complete Setup{" "}
                    <i className="fa-solid fa-check"></i>
                  </>
                )}
              </button>
            )}

          </div>
        </form>
      </div>
    </div>
  );
};

export default DoctorOnboarding;