/**
 * Frontend Auth Service
 * Communicates ONLY with backend API endpoints (NO direct Supabase SDK on frontend)
 */

const API_BASE_URL = import.meta.env.VITE_NODE_API_URL;

class AuthService {
    /**
     * Get stored JWT token
     */
    getToken() {
        return localStorage.getItem("doctors_vedika_token");
    }

    /**
     * Get stored Doctor profile
     */
    getCurrentDoctor() {
        const stored = localStorage.getItem("doctors_vedika_user");
        if (!stored) return null;
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }

    /**
     * Check if doctor is logged in
     */
    isAuthenticated() {
        return Boolean(this.getToken());
    }

    /**
     * Register a new doctor
     */
    async register(doctorData) {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(doctorData),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Registration failed. Please check your details.");
        }

        // We do not save to localStorage here so that the user is forced to go through Login as per Phase 1 flow

        return data;
    }

    /**
     * Login doctor with email and password
     */
    async login(email, password) {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Invalid email or password.");
        }

        if (data.token) {
            localStorage.setItem("doctors_vedika_token", data.token);
            localStorage.setItem("doctors_vedika_user", JSON.stringify(data.doctor));
        }

        return data;
    }

    /**
     * Fetch current doctor session from backend
     */
    async fetchProfile() {
        const token = this.getToken();
        if (!token) return null;

        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            this.logout();
            return null;
        }

        const data = await response.json();
        if (data.doctor) {
            localStorage.setItem("doctors_vedika_user", JSON.stringify(data.doctor));
        }
        return data.doctor;
    }

    /**
     * Forgot password
     */
    async forgotPassword(email) {
        const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || "Failed to process request.");
        }
        return data;
    }

    /**
     * Verify Google OAuth Token with Backend
     */
    async verifyGoogleAuth(token) {
        const response = await fetch(`${API_BASE_URL}/api/auth/google/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Google authentication failed.");
        }

        if (data.token) {
            localStorage.setItem("doctors_vedika_token", data.token);
            localStorage.setItem("doctors_vedika_user", JSON.stringify(data.doctor));
        }

        return data;
    }

    /**
     * Logout
     */
    logout() {
        localStorage.removeItem("doctors_vedika_token");
        localStorage.removeItem("doctors_vedika_user");
    }

    /**
     * Complete Doctor Onboarding
     */
    async completeOnboarding(onboardingData) {
        const token = this.getToken();
        if (!token) throw new Error("Not authenticated");

        const response = await fetch(`${API_BASE_URL}/api/auth/onboarding`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(onboardingData),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Failed to save onboarding details.");
        }

        // Update stored profile with new onboarding_completed status and fields
        if (data.doctor) {
            localStorage.setItem("doctors_vedika_user", JSON.stringify(data.doctor));
        }

        return data;
    }

    /**
     * Upload a document or profile photo
     */
    async uploadDocument(file, type) {
        const token = this.getToken();
        if (!token) throw new Error("Not authenticated");

        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", type); // 'profile' or 'document'

        const response = await fetch(`${API_BASE_URL}/api/auth/upload`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Failed to upload file.");
        }

        return data.url;
    }

    /**
     * Update Doctor Profile
     */
    async updateProfile(profileData) {
        const token = this.getToken();
        if (!token) throw new Error("Not authenticated");

        const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(profileData),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || "Failed to update profile.");
        }

        if (data.doctor) {
            localStorage.setItem("doctors_vedika_user", JSON.stringify(data.doctor));
        }

        return data;
    }
}

export default new AuthService();
