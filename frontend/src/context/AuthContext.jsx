import React, {
    createContext,
    useContext,
    useEffect,
    useState,
} from "react";

import authService from "../services/authService";

const AuthContext =
    createContext(null);

export function AuthProvider({
    children,
}) {
    const [doctor, setDoctor] =
        useState(
            authService.getCurrentDoctor()
        );

    const [loading, setLoading] =
        useState(
            !authService.getCurrentDoctor() && authService.isAuthenticated()
        );

    useEffect(() => {
        let mounted = true;

        const initialize =
            async () => {
                try {
                    if (
                        authService.isAuthenticated()
                    ) {
                        const profile =
                            await authService.fetchProfile();

                        if (mounted && profile) {
                            setDoctor(profile);
                        }
                    } else if (mounted) {
                        setDoctor(null);
                    }
                } catch (error) {
                    console.warn(
                        "[AuthContext] Initialization warning:",
                        error
                    );
                } finally {
                    if (mounted) {
                        setLoading(
                            false
                        );
                    }
                }
            };

        initialize();

        return () => {
            mounted = false;
        };
    }, []);

    const login = async (
        email,
        password,
        portal
    ) => {
        const result =
            await authService.login(
                email,
                password,
                portal
            );

        if (result?.doctor) {
            setDoctor(
                result.doctor
            );
            setLoading(false);
        }

        return result;
    };

    const signup = async (
        doctorData
    ) => {
        return authService.register(
            doctorData
        );
    };

    const verifyGoogleAuth =
        async (
            token
        ) => {
            const result =
                await authService.verifyGoogleAuth(
                    token
                );

            if (result?.doctor) {
                setDoctor(
                    result.doctor
                );
            }

            return result;
        };

    const logout = () => {
        authService.logout();
        setDoctor(null);
    };

    const currentDoctor = doctor || authService.getCurrentDoctor();

    return (
        <AuthContext.Provider
            value={{
                doctor: currentDoctor,
                user: currentDoctor,

                isAuthenticated:
                    Boolean(
                        currentDoctor ||
                        authService.isAuthenticated()
                    ),

                loading,

                login,
                signup,
                verifyGoogleAuth,
                logout,

                updateDoctor:
                    setDoctor,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context =
        useContext(
            AuthContext
        );

    if (!context) {
        throw new Error(
            "useAuth must be used inside AuthProvider."
        );
    }

    return context;
}

export default AuthContext;