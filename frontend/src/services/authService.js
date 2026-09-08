const API_BASE_URL =
    import.meta.env.VITE_NODE_API_URL || "";

class AuthService {
    getToken() {
        return localStorage.getItem(
            "doctors_vedika_token"
        );
    }

    getCurrentDoctor() {
        const stored =
            localStorage.getItem(
                "doctors_vedika_user"
            );

        if (!stored) {
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
        password
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
        const token =
            this.getToken();

        if (!token) {
            return null;
        }

        const response =
            await fetch(
                `${API_BASE_URL}/api/auth/me`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`,
                    },
                }
            );

        if (!response.ok) {
            this.logout();
            return null;
        }

        const data =
            await response.json();

        if (data.doctor) {
            localStorage.setItem(
                "doctors_vedika_user",
                JSON.stringify(
                    data.doctor
                )
            );
        }

        return data.doctor;
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
}

export default new AuthService();