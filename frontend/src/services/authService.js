import { getApiBaseUrl } from "../utils/apiConfig";

const API_BASE_URL = getApiBaseUrl();

class AuthService {
    getToken() {
        const t = localStorage.getItem("doctors_vedika_token");
        if (!t || t === "null" || t === "undefined" || t === "[object Object]") {
            return null;
        }
        return t;
    }

    getCurrentDoctor() {
        const stored =
            localStorage.getItem(
                "doctors_vedika_user"
            );

        if (!stored || stored === "null" || stored === "undefined") {
            return null;
        }

        try {
            return JSON.parse(
                stored
            );
        } catch {
            return null;
        }
    }

    isAuthenticated() {
        return Boolean(
            this.getToken()
        );
    }

    async register(
        doctorData
    ) {
        const response =
            await fetch(
                `${API_BASE_URL}/api/auth/register`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify(
                        doctorData
                    ),
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "Registration failed."
            );
        }

        return data;
    }

    async login(
        email,
        password,
        portal
    ) {
        const response =
            await fetch(
                `${API_BASE_URL}/api/auth/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        email,
                        password,
                        portal,
                    }),
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "Invalid email or password."
            );
        }

        if (data.token) {
            localStorage.setItem(
                "doctors_vedika_token",
                data.token
            );

            localStorage.setItem(
                "doctors_vedika_user",
                JSON.stringify(
                    data.doctor
                )
            );
        }

        return data;
    }

    async fetchProfile() {
        const token = this.getToken();
        if (!token) {
            return null;
        }

        const cachedUser = this.getCurrentDoctor();
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
        const isStaffPortal = currentPath.startsWith("/staff") || cachedUser?.role === "staff" || cachedUser?.capabilities?.staff === true;
        const contextHeader = isStaffPortal ? "staff" : (cachedUser?.role === "hospital_admin" ? "hospital_admin" : "doctor");

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "X-Portal-Context": contextHeader
                },
            });

            if (response.status === 401 || response.status === 403) {
                if (cachedUser) {
                    return cachedUser;
                }
                this.logout();
                return null;
            }

            if (!response.ok) {
                return cachedUser;
            }

            const data = await response.json();

            if (data?.doctor) {
                const mergedDoctor = {
                    ...cachedUser,
                    ...data.doctor,
                    role: isStaffPortal ? "staff" : (data.doctor.role || cachedUser?.role || "doctor"),
                    capabilities: {
                        ...(cachedUser?.capabilities || {}),
                        ...(data.doctor.capabilities || {}),
                        staff: isStaffPortal || data.doctor.capabilities?.staff || cachedUser?.capabilities?.staff || false
                    }
                };

                localStorage.setItem(
                    "doctors_vedika_user",
                    JSON.stringify(mergedDoctor)
                );
                return mergedDoctor;
            } else {
                return cachedUser;
            }
        } catch (err) {
            console.warn("[AuthService] fetchProfile network/parse error:", err.message);
            return cachedUser;
        }
    }

    async forgotPassword(
        email
    ) {
        const response =
            await fetch(
                `${API_BASE_URL}/api/auth/forgot-password`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        email,
                    }),
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "Failed to process request."
            );
        }

        return data;
    }

    async resetPassword(
        accessToken,
        newPassword
    ) {
        const response =
            await fetch(
                `${API_BASE_URL}/api/auth/reset-password`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        accessToken,
                        newPassword,
                    }),
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "Failed to reset password."
            );
        }

        return data;
    }

    /*
     * GOOGLE AUTH
     */
    async verifyGoogleAuth(accessToken) {
        if (
            !accessToken ||
            typeof accessToken !== "string"
        ) {
            throw new Error(
                "Google authentication token was not received."
            );
        }

        console.log(
            "[AuthService] Sending Google token to backend..."
        );

        const response = await fetch(
            `${API_BASE_URL}/api/auth/google/verify`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body: JSON.stringify({
                    token: accessToken,
                }),
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch (jsonError) {
            console.error(
                "[AuthService] Backend returned invalid JSON:",
                jsonError
            );

            throw new Error(
                `Authentication server returned HTTP ${response.status}.`
            );
        }

        console.log(
            "[AuthService] Google verification response:",
            {
                status: response.status,
                ok: response.ok,
                data,
            }
        );

        if (!response.ok) {
            /*
             * IMPORTANT:
             * Return the actual backend/Supabase
             * error instead of hiding it.
             */
            const message =
                data?.message ||
                data?.error?.message ||
                `Google authentication failed with HTTP ${response.status}.`;

            const error = new Error(message);

            error.status =
                response.status;

            error.code =
                data?.error?.code || null;

            error.details =
                data?.error?.details || null;

            error.hint =
                data?.error?.hint || null;

            throw error;
        }

        if (
            !data?.token ||
            !data?.doctor
        ) {
            throw new Error(
                "Google authentication succeeded, but the Doctor Portal session was not created."
            );
        }

        localStorage.setItem(
            "doctors_vedika_token",
            data.token
        );

        localStorage.setItem(
            "doctors_vedika_user",
            JSON.stringify(data.doctor)
        );

        return data;
    }

    logout() {
        localStorage.removeItem(
            "doctors_vedika_token"
        );

        localStorage.removeItem(
            "doctors_vedika_user"
        );
    }

    async completeOnboarding(
        onboardingData
    ) {
        const token =
            this.getToken();

        if (!token) {
            throw new Error(
                "Not authenticated."
            );
        }

        const response =
            await fetch(
                `${API_BASE_URL}/api/auth/onboarding`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`,
                    },

                    body: JSON.stringify(
                        onboardingData
                    ),
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "Failed to save onboarding details."
            );
        }

        if (data.doctor) {
            localStorage.setItem(
                "doctors_vedika_user",
                JSON.stringify(
                    data.doctor
                )
            );
        }

        return data;
    }

    async uploadDocument(
        file,
        type
    ) {
        const token =
            this.getToken();

        if (!token) {
            throw new Error(
                "Not authenticated."
            );
        }

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );

        formData.append(
            "type",
            type
        );

        const response =
            await fetch(
                `${API_BASE_URL}/api/auth/upload`,
                {
                    method: "POST",

                    headers: {
                        Authorization:
                            `Bearer ${token}`,
                    },

                    body: formData,
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "Failed to upload file."
            );
        }

        return data.url;
    }

    async updateProfile(
        profileData
    ) {
        const token =
            this.getToken();

        if (!token) {
            throw new Error(
                "Not authenticated."
            );
        }

        const response =
            await fetch(
                `${API_BASE_URL}/api/auth/profile`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`,
                    },

                    body: JSON.stringify(
                        profileData
                    ),
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "Failed to update profile."
            );
        }

        if (data.doctor) {
            localStorage.setItem(
                "doctors_vedika_user",
                JSON.stringify(
                    data.doctor
                )
            );
        }

        return data;
    }

    async changePassword(currentPassword, newPassword) {
        const token = this.getToken();
        if (!token) {
            throw new Error("Not authenticated.");
        }

        const response = await fetch(
            `${API_BASE_URL}/api/auth/change-password`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            }
        );

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || "Failed to change password.");
        }
        return data;
    }
}

export default new AuthService();