import React, { createContext, useContext, useState, useEffect } from "react";
import authService from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [doctor, setDoctor] = useState(authService.getCurrentDoctor());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                if (authService.isAuthenticated()) {
                    const profile = await authService.fetchProfile();
                    if (profile) {
                        setDoctor(profile);
                    }
                }
            } catch (err) {
                console.error("[AuthContext] Session init error:", err);
            } finally {
                setLoading(false);
            }
        };

        initAuth();
    }, []);

    const login = async (email, password) => {
        const res = await authService.login(email, password);
        if (res.doctor) {
            setDoctor(res.doctor);
        }
        return res;
    };

    const signup = async (doctorData) => {
        const res = await authService.register(doctorData);
        if (res.doctor) {
            setDoctor(res.doctor);
        }
        return res;
    };

    const verifyGoogleAuth = async (token) => {
        const res = await authService.verifyGoogleAuth(token);
        if (res.doctor) {
            setDoctor(res.doctor);
        }
        return res;
    };

    const logout = () => {
        authService.logout();
        setDoctor(null);
    };

    return (
        <AuthContext.Provider
            value={{
                doctor,
                user: doctor,
                isAuthenticated: Boolean(doctor || authService.isAuthenticated()),
                loading,
                login,
                signup,
                verifyGoogleAuth,
                logout,
                updateDoctor: setDoctor,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        // Safe fallback if used outside provider
        return {
            doctor: authService.getCurrentDoctor(),
            user: authService.getCurrentDoctor(),
            isAuthenticated: authService.isAuthenticated(),
            loading: false,
            login: (e, p) => authService.login(e, p),
            signup: (data) => authService.register(data),
            verifyGoogleAuth: (token) => authService.verifyGoogleAuth(token),
            logout: () => authService.logout(),
            updateDoctor: () => {},
        };
    }
    return context;
}

export default AuthContext;
