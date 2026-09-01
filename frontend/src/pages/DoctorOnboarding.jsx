import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import authService from "../services/authService";
import { specializationsData } from "../data/specializations";
import { useAuth } from "../context/AuthContext";
import "../index.css";

const CustomDropdown = ({ options, value, onChange, placeholder, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`holo-custom-dropdown ${isOpen ? 'open' : ''}`} ref={dropdownRef} onClick={() => setIsOpen(!isOpen)}>
      <i className={icon}></i>
      <div className="holo-selected-value">{value || <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>{placeholder}</span>}</div>
      <i className={`fa-solid fa-chevron-down holo-dropdown-arrow ${isOpen ? 'open' : ''}`}></i>
      
      {isOpen && (
        <ul className="holo-dropdown-list">
          <li onClick={() => onChange("")} style={{ color: "rgba(255, 255, 255, 0.5)", fontStyle: "italic" }}>Clear Selection</li>
          {options.map(opt => (
            <li key={opt} onClick={() => onChange(opt)}>{opt}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const CustomMultiSelectDropdown = ({ options, value, onChange, placeholder, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedValues = Array.isArray(value) ? value : [];
  
  const handleToggleOption = (opt, e) => {
    e.stopPropagation();
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter(item => item !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  const displayText = selectedValues.length > 0 ? selectedValues.join(", ") : null;

  return (
    <div className={`holo-custom-dropdown ${isOpen ? 'open' : ''}`} ref={dropdownRef} onClick={() => setIsOpen(!isOpen)}>
      <i className={icon}></i>
      <div className="holo-selected-value">{displayText || <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>{placeholder}</span>}</div>
      <i className={`fa-solid fa-chevron-down holo-dropdown-arrow ${isOpen ? 'open' : ''}`}></i>
      
      {isOpen && (
        <ul className="holo-dropdown-list">
          <li onClick={(e) => { e.stopPropagation(); onChange([]); }} style={{ color: "rgba(255, 255, 255, 0.5)", fontStyle: "italic" }}>Clear Selection</li>
          {options.map(opt => (
            <li key={opt} onClick={(e) => handleToggleOption(opt, e)} style={{ display: 'flex', justifyContent: 'space-between' }}>
              {opt}
              {selectedValues.includes(opt) && <i className="fa-solid fa-check" style={{ color: "#10B981" }}></i>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const DoctorOnboarding = () => {
  const navigate = useNavigate();
  const { updateDoctor } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [currentStep, setCurrentStep] = useState(1);

  // File Upload States
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingGovId, setUploadingGovId] = useState(false);

  // Cascading Dropdown States
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedSubdomain, setSelectedSubdomain] = useState("");
  const [otherSpecialization, setOtherSpecialization] = useState("");

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

  useEffect(() => {
    const doctor = authService.getCurrentDoctor();
    if (doctor) {
      if (doctor.onboardingCompleted) {
        navigate("/dashboard");
        return;
      }

      const nameParts = (doctor.fullName || "").trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      setFormData((prev) => ({
        ...prev,
        doctor_first_name: firstName,
        doctor_last_name: lastName,
        doctor_email: doctor.email || "",
        doctor_mobile: doctor.mobileNumber || "",
        doctor_registration_number: doctor.registrationNumber || "",
        doctor_dob: doctor.dob || "",
      }));
    } else {
      navigate("/login");
    }
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    setErrorMsg("");
    if (type === "profile") setUploadingPhoto(true);
    if (type === "document") setUploadingDoc(true);
    if (type === "gov_id") setUploadingGovId(true);

    try {
      const url = await authService.uploadDocument(file, type);
      setFormData(prev => {
        if (type === "profile") return { ...prev, doctor_profile_photo: url };
        if (type === "document") return { ...prev, doctor_medical_license_url: url };
        if (type === "gov_id") return { ...prev, doctor_gov_id_url: url };
        return prev;
      });
    } catch (err) {
      setErrorMsg(err.message || "Failed to upload file. Please try again.");
    } finally {
      if (type === "profile") setUploadingPhoto(false);
      if (type === "document") setUploadingDoc(false);
      if (type === "gov_id") setUploadingGovId(false);
    }
  };

  const handleNext = () => {
    setErrorMsg("");
    
    // Validate Step 1
    if (currentStep === 1) {
      if (!formData.doctor_first_name || !formData.doctor_last_name || !formData.doctor_mobile) {
        setErrorMsg("Please fill in all required fields (First Name, Last Name, Mobile).");
        return;
      }
    }
    
    // Validate Step 2
    if (currentStep === 2) {
      if (!selectedDomain) {
        setErrorMsg("Please select your Domain Area.");
        return;
      }
      if (selectedDomain !== "Other" && !selectedSubdomain) {
        setErrorMsg("Please select your Specialization.");
        return;
      }
      if (!formData.doctor_qualification || !formData.doctor_registration_number) {
        setErrorMsg("Please provide your Qualification and Registration Number.");
        return;
      }
    }

    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    setErrorMsg("");
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (currentStep < 3) {
      handleNext();
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    // Validate Step 3 fields manually before submission
    if (!formData.doctor_clinic_name || !formData.doctor_clinic_address || !formData.doctor_description) {
      setErrorMsg("Please fill in Clinic Name, Clinic Address, and Description.");
      setLoading(false);
      return;
    }
    if (!formData.doctor_profile_photo) {
      setErrorMsg("Please upload a Profile Photo.");
      setLoading(false);
      return;
    }
    if (!formData.doctor_medical_license_url || !formData.doctor_gov_id_url) {
      setErrorMsg("Please upload your Medical License and Government ID.");
      setLoading(false);
      return;
    }

    // Determine final specialization string
    let finalSpecialization = "";
    if (selectedDomain === "Other" || selectedSubdomain === "Other") {
      finalSpecialization = otherSpecialization;
    } else if (selectedSubdomain) {
      finalSpecialization = `${selectedDomain} - ${selectedSubdomain}`;
    } else {
      finalSpecialization = selectedDomain;
    }

    if (!finalSpecialization) {
      setErrorMsg("Please select your specialization from the dropdown options.");
      setLoading(false);
      setCurrentStep(2);
      return;
    }

    try {
      const payload = { ...formData, doctor_specialization: finalSpecialization, doctor_domain: selectedDomain };
      const res = await authService.completeOnboarding(payload);
      if (res && res.success) {
        setSuccessMsg("Profile completed successfully! Redirecting...");
        if (res.doctor) updateDoctor(res.doctor);
        setTimeout(() => {
          navigate("/dashboard");
        }, 1200);
      } else {
        setErrorMsg(res?.message || "Failed to complete onboarding.");
      }
    } catch (err) {
      setErrorMsg(err.message || "Unable to connect to backend server.");
    } finally {
      setLoading(false);
    }
  };

  const domainOptions = [...Object.keys(specializationsData), "Other"];
  const subdomainOptions = selectedDomain && selectedDomain !== "Other" ? [...specializationsData[selectedDomain], "Other"] : [];
  const showOtherInput = selectedDomain === "Other" || selectedSubdomain === "Other";

  return (
    <div className="holo-onboarding-wrapper">
      <div className="holo-card">
        
        <h1>Complete Your Profile</h1>
        <p className="subtitle">Let's set up your professional medical workspace.</p>

        {/* Stepper UI */}
        <div className="holo-stepper">
          <div className="holo-stepper-progress" style={{ width: `${(currentStep - 1) * 50}%` }}></div>
          
          <div className={`holo-step ${currentStep >= 1 ? 'active' : ''}`}>
            <div className="holo-step-circle">1</div>
            <div className="holo-step-label">Basic Info</div>
          </div>
          <div className={`holo-step ${currentStep >= 2 ? 'active' : ''}`}>
            <div className="holo-step-circle">2</div>
            <div className="holo-step-label">Professional</div>
          </div>
          <div className={`holo-step ${currentStep >= 3 ? 'active' : ''}`}>
            <div className="holo-step-circle">3</div>
            <div className="holo-step-label">Clinic & Bio</div>
          </div>
        </div>

        {errorMsg && (
          <div style={{ background: "rgba(239, 68, 68, 0.2)", color: "#FFB4B4", padding: "12px 16px", borderRadius: "12px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px", fontWeight: 600, border: "1px solid rgba(239, 68, 68, 0.5)" }}>
            <i className="fa-solid fa-circle-exclamation"></i> {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ background: "rgba(16, 185, 129, 0.2)", color: "#A7F3D0", padding: "12px 16px", borderRadius: "12px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px", fontWeight: 600, border: "1px solid rgba(16, 185, 129, 0.5)" }}>
            <i className="fa-solid fa-circle-check"></i> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
            
            {/* STEP 1: Basic Info */}
            {currentStep === 1 && (
              <div className="holo-step-content" style={{ animation: "fadeIn 0.5s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                    <div className="holo-input-group">
                        <label>First Name *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-user-doctor"></i>
                            <input type="text" name="doctor_first_name" value={formData.doctor_first_name} onChange={handleChange} required />
                        </div>
                    </div>
                    <div className="holo-input-group">
                        <label>Last Name *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-user"></i>
                            <input type="text" name="doctor_last_name" value={formData.doctor_last_name} onChange={handleChange} required />
                        </div>
                    </div>
                    <div className="holo-input-group">
                        <label>Email Address *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-envelope"></i>
                            <input type="email" name="doctor_email" value={formData.doctor_email} disabled style={{ opacity: 0.6, cursor: "not-allowed" }} />
                        </div>
                    </div>
                    <div className="holo-input-group">
                        <label>Mobile Number *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-phone"></i>
                            <input type="tel" name="doctor_mobile" value={formData.doctor_mobile} onChange={handleChange} required />
                        </div>
                    </div>
                    <div className="holo-input-group">
                        <label>Date of Birth</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-calendar"></i>
                            <input type="date" name="doctor_dob" value={formData.doctor_dob} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="holo-input-group">
                        <label>Gender</label>
                        <div className="holo-input-wrapper">
                            <CustomDropdown 
                                options={["Male", "Female", "Other"]}
                                value={formData.doctor_gender}
                                onChange={(val) => setFormData({...formData, doctor_gender: val})}
                                placeholder="Select Gender"
                                icon="fa-solid fa-venus-mars"
                            />
                        </div>
                    </div>
                </div>
              </div>
            )}

            {/* STEP 2: Professional Details */}
            {currentStep === 2 && (
              <div className="holo-step-content" style={{ animation: "fadeIn 0.5s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                    
                    {/* Domain Dropdown */}
                    <div className="holo-input-group">
                        <label>Domain Area *</label>
                        <div className="holo-input-wrapper">
                            <CustomDropdown 
                                options={domainOptions}
                                value={selectedDomain}
                                onChange={(val) => { setSelectedDomain(val); setSelectedSubdomain(""); }}
                                placeholder="Select Domain..."
                                icon="fa-solid fa-stethoscope"
                            />
                        </div>
                    </div>

                    {/* Subdomain Dropdown */}
                    {selectedDomain && selectedDomain !== "Other" && (
                        <div className="holo-input-group">
                            <label>Specialization *</label>
                            <div className="holo-input-wrapper">
                                <CustomDropdown 
                                    options={subdomainOptions}
                                    value={selectedSubdomain}
                                    onChange={(val) => setSelectedSubdomain(val)}
                                    placeholder="Select Specialization..."
                                    icon="fa-solid fa-user-md"
                                />
                            </div>
                        </div>
                    )}

                    {/* Custom Text Input if 'Other' is selected */}
                    {showOtherInput && (
                        <div className="holo-input-group" style={{ gridColumn: selectedDomain === "Other" ? "2 / 3" : "1 / -1" }}>
                            <label>Specify Specialization *</label>
                            <div className="holo-input-wrapper">
                                <i className="fa-solid fa-pencil"></i>
                                <input type="text" value={otherSpecialization} onChange={(e) => setOtherSpecialization(e.target.value)} required placeholder="e.g., Aerospace Medicine" />
                            </div>
                        </div>
                    )}

                    <div className="holo-input-group">
                        <label>Qualification *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-graduation-cap"></i>
                            <input type="text" name="doctor_qualification" value={formData.doctor_qualification} onChange={handleChange} required placeholder="e.g., MBBS, MD" />
                        </div>
                    </div>
                    <div className="holo-input-group">
                        <label>Registration Number *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-id-card"></i>
                            <input type="text" name="doctor_registration_number" value={formData.doctor_registration_number} onChange={handleChange} required />
                        </div>
                    </div>
                    <div className="holo-input-group">
                        <label>Years of Experience</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-briefcase"></i>
                            <input type="text" name="doctor_experience" value={formData.doctor_experience} onChange={handleChange} placeholder="e.g., 10 Years" />
                        </div>
                    </div>
                    <div className="holo-input-group">
                        <label>Consultation Fee (₹)</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-indian-rupee-sign"></i>
                            <input type="number" name="doctor_consultation_fee" value={formData.doctor_consultation_fee} onChange={handleChange} placeholder="e.g., 500" />
                        </div>
                    </div>
                    <div className="holo-input-group" style={{ gridColumn: "1 / -1" }}>
                        <label>Languages Spoken</label>
                        <div className="holo-input-wrapper">
                            <CustomMultiSelectDropdown 
                                options={["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Gujarati", "Bengali", "Punjabi", "Urdu"]}
                                value={Array.isArray(formData.doctor_languages) ? formData.doctor_languages : (formData.doctor_languages ? formData.doctor_languages.split(',').map(s=>s.trim()) : [])}
                                onChange={(val) => setFormData({...formData, doctor_languages: val})}
                                placeholder="Select Languages..."
                                icon="fa-solid fa-language"
                            />
                        </div>
                    </div>
                </div>
              </div>
            )}

            {/* STEP 3: Clinic & Documents */}
            {currentStep === 3 && (
              <div className="holo-step-content" style={{ animation: "fadeIn 0.5s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                    
                    <div className="holo-input-group" style={{ gridColumn: "1 / -1" }}>
                        <label>Clinic/Hospital Name *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-hospital"></i>
                            <input type="text" name="doctor_clinic_name" value={formData.doctor_clinic_name} onChange={handleChange} />
                        </div>
                    </div>
                    
                    <div className="holo-input-group" style={{ gridColumn: "1 / -1" }}>
                        <label>Clinic/Hospital Address *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-map-location-dot" style={{ top: "16px" }}></i>
                            <textarea 
                                name="doctor_clinic_address" 
                                value={formData.doctor_clinic_address} 
                                onChange={handleChange} 
                                rows="2" 
                                placeholder="Full address of your clinic/hospital..."
                                style={{ resize: "vertical" }}
                            ></textarea>
                        </div>
                    </div>

                    <div className="holo-input-group" style={{ gridColumn: "1 / -1" }}>
                        <label>Google Maps Location Link</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-location-dot"></i>
                            <input type="url" name="doctor_gmaps_location" value={formData.doctor_gmaps_location} onChange={handleChange} placeholder="https://maps.google.com/..." />
                        </div>
                    </div>
                    
                    {/* File Uploads */}
                    <div className="holo-input-group">
                        <label>Profile Photo *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-image"></i>
                            <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'profile')} style={{ padding: "10px 14px 10px 45px", color: "#94A3B8" }} />
                        </div>
                        {uploadingPhoto && <span style={{ fontSize: "0.85rem", color: "#08AEB8", marginTop: "5px", display: "inline-block" }}><i className="fa-solid fa-spinner fa-spin"></i> Uploading...</span>}
                        {formData.doctor_profile_photo && !uploadingPhoto && <span style={{ fontSize: "0.85rem", color: "#10B981", marginTop: "5px", display: "inline-block" }}><i className="fa-solid fa-check"></i> Uploaded Successfully</span>}
                    </div>
                    
                    <div className="holo-input-group">
                        <label>Medical License / ID *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-file-medical"></i>
                            <input type="file" accept=".pdf,image/*" onChange={(e) => handleFileUpload(e, 'document')} style={{ padding: "10px 14px 10px 45px", color: "#94A3B8" }} />
                        </div>
                        {uploadingDoc && <span style={{ fontSize: "0.85rem", color: "#08AEB8", marginTop: "5px", display: "inline-block" }}><i className="fa-solid fa-spinner fa-spin"></i> Uploading...</span>}
                        {formData.doctor_medical_license_url && !uploadingDoc && <span style={{ fontSize: "0.85rem", color: "#10B981", marginTop: "5px", display: "inline-block" }}><i className="fa-solid fa-check"></i> Uploaded Successfully</span>}
                    </div>

                    <div className="holo-input-group">
                        <label>Government ID (Aadhar/PAN) *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-id-badge"></i>
                            <input type="file" accept=".pdf,image/*" onChange={(e) => handleFileUpload(e, 'gov_id')} style={{ padding: "10px 14px 10px 45px", color: "#94A3B8" }} />
                        </div>
                        {uploadingGovId && <span style={{ fontSize: "0.85rem", color: "#08AEB8", marginTop: "5px", display: "inline-block" }}><i className="fa-solid fa-spinner fa-spin"></i> Uploading...</span>}
                        {formData.doctor_gov_id_url && !uploadingGovId && <span style={{ fontSize: "0.85rem", color: "#10B981", marginTop: "5px", display: "inline-block" }}><i className="fa-solid fa-check"></i> Uploaded Successfully</span>}
                    </div>

                    <div className="holo-input-group" style={{ gridColumn: "1 / -1" }}>
                        <label>About Me / Description *</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-align-left" style={{ top: "16px" }}></i>
                            <textarea 
                                name="doctor_description" 
                                value={formData.doctor_description} 
                                onChange={handleChange} 
                                rows="3" 
                                placeholder="Brief description about your practice and expertise..."
                                style={{ resize: "vertical" }}
                            ></textarea>
                        </div>
                    </div>

                    <div className="holo-input-group" style={{ gridColumn: "1 / -1" }}>
                        <label>Favorite Medical Quote</label>
                        <div className="holo-input-wrapper">
                            <i className="fa-solid fa-quote-left"></i>
                            <input type="text" name="doctor_quote" value={formData.doctor_quote} onChange={handleChange} placeholder="e.g., Medicine is a science of uncertainty..." />
                        </div>
                    </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="holo-btn-group">
              {currentStep > 1 ? (
                <button type="button" className="holo-btn holo-btn-outline" onClick={handlePrev}>
                  <i className="fa-solid fa-arrow-left"></i> Previous
                </button>
              ) : (
                <div></div>
              )}

              {currentStep < 3 ? (
                <button type="button" className="holo-btn holo-btn-primary" onClick={handleNext}>
                  Next <i className="fa-solid fa-arrow-right"></i>
                </button>
              ) : (
                <button type="submit" className="holo-btn holo-btn-primary" disabled={loading || uploadingPhoto || uploadingDoc}>
                  {loading ? (
                    <><i className="fa-solid fa-circle-notch fa-spin"></i> Finalizing...</>
                  ) : (
                    <>Complete Setup <i className="fa-solid fa-check"></i></>
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
