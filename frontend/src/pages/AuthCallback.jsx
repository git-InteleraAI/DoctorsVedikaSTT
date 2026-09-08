import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useLocation,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext";

const AuthCallback = () => {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const {
    verifyGoogleAuth,
  } = useAuth();

  const [status, setStatus] =
    useState(
      "Authenticating..."
    );

  const [error, setError] =
    useState(null);

  const processed =
    useRef(false);

  useEffect(() => {
    if (processed.current) {
      return;
    }

    processed.current = true;

    const processLogin = async () => {
      try {
        const hash =
          window.location.hash ||
          location.hash ||
          "";

        const search =
          window.location.search ||
          location.search ||
          "";

        console.log(
          "[AuthCallback] Processing OAuth callback parameters..."
        );

        const hashParams =
          new URLSearchParams(
            hash.startsWith("#")
              ? hash.substring(1)
              : hash
          );

        const searchParams =
          new URLSearchParams(search);

        const oauthError =
          hashParams.get("error") ||
          searchParams.get("error");

        const errorDescription =
          hashParams.get("error_description") ||
          searchParams.get("error_description");

        if (oauthError) {
          throw new Error(
            errorDescription
              ? decodeURIComponent(
                errorDescription
              )
              : `Google authentication failed: ${oauthError}`
          );
        }

        const accessToken =
          hashParams.get("access_token") ||
          searchParams.get("access_token");

        if (!accessToken) {
          throw new Error(
            "Google authentication token was not returned."
          );
        }

        setStatus(
          "Verifying your Google account..."
        );

        const result =
          await verifyGoogleAuth(
            accessToken
          );

        console.log(
          "[AuthCallback] Backend authentication successful:",
          result
        );

        if (
          !result?.token ||
          !result?.doctor
        ) {
          throw new Error(
            "Doctor Portal session could not be created."
          );
        }

        /*
         * Remove OAuth token from URL.
         */
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );

        setStatus(
          "Login successful! Redirecting..."
        );

        setTimeout(() => {
          if (
            result.doctor
              .onboardingCompleted
          ) {
            navigate(
              "/dashboard",
              {
                replace: true,
              }
            );
          } else {
            navigate(
              "/onboarding",
              {
                replace: true,
              }
            );
          }
        }, 500);

      } catch (error) {
        console.error(
          "[AuthCallback] Google authentication error:",
          error
        );

        console.error(
          "[AuthCallback] Error message:",
          error?.message
        );

        console.error(
          "[AuthCallback] Error code:",
          error?.code
        );

        console.error(
          "[AuthCallback] Error details:",
          error?.details
        );

        setStatus(
          "Authentication failed"
        );

        setError(
          error?.message ||
          "Unable to complete Google sign-in."
        );
      }
    };

    processLogin();
  }, [
    location.hash,
    navigate,
    verifyGoogleAuth,
  ]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8FBFF]">
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center">

        <div className="mb-6">
          {!error ? (
            <div className="inline-block w-12 h-12 border-4 border-[#DDF7FB] border-t-[#08AEB8] rounded-full animate-spin" />
          ) : (
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
          )}
        </div>

        <h2 className="text-2xl font-bold text-[#082B68] mb-2">
          {status}
        </h2>

        {error && (
          <>
            <p className="text-red-500 mb-6">
              {error}
            </p>

            <button
              onClick={() =>
                navigate(
                  "/login",
                  {
                    replace:
                      true,
                  }
                )
              }
              className="bg-[#082B68] text-white px-6 py-2 rounded-lg font-medium"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;