import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyGoogleAuth } = useAuth();
  
  const [status, setStatus] = useState("Authenticating...");
  const [error, setError] = useState(null);
  
  // Use a ref to prevent double-firing in strict mode
  const processed = useRef(false);

  useEffect(() => {
    const processToken = async () => {
      if (processed.current) return;
      processed.current = true;

      // Supabase Implicit Flow returns the access_token in the URL hash fragment
      const hash = location.hash;
      
      if (!hash) {
        setError("No authentication token found in URL.");
        setStatus("Authentication failed");
        return;
      }

      // Parse hash manually: #access_token=XYZ&expires_in=...
      const params = new URLSearchParams(hash.replace("#", "?"));
      const accessToken = params.get("access_token");

      if (!accessToken) {
        setError("Invalid authentication token format.");
        setStatus("Authentication failed");
        return;
      }

      try {
        setStatus("Verifying account with secure backend...");
        const res = await verifyGoogleAuth(accessToken);
        
        setStatus("Success! Redirecting...");
        // Short delay for UX
        setTimeout(() => {
          if (res && res.doctor && res.doctor.onboardingCompleted) {
            navigate("/dashboard");
          } else {
            navigate("/onboarding");
          }
        }, 1000);
      } catch (err) {
        console.error("Google auth callback error:", err);
        setError(err.message || "Failed to verify account.");
        setStatus("Authentication failed");
      }
    };

    processToken();
  }, [location, navigate, verifyGoogleAuth]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8FBFF]">
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center">
        <div className="mb-6">
          {/* Simple animated spinner */}
          {!error ? (
            <div className="inline-block w-12 h-12 border-4 border-[#DDF7FB] border-t-[#08AEB8] rounded-full animate-spin"></div>
          ) : (
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>
        
        <h2 className="text-2xl font-bold text-[#082B68] mb-2">{status}</h2>
        
        {error && (
          <div className="mt-4">
            <p className="text-red-500 mb-6">{error}</p>
            <button 
              onClick={() => navigate("/login")}
              className="bg-[#082B68] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#0B2E6D] transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
