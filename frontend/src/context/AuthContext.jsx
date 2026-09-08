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
        useState(true);

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

                        if (
                            mounted &&
                            profile
                        ) {
                            setDoctor(
                                profile
                            );
                        }
                    }
                } catch (error) {
                    console.error(
                        "[AuthContext] Initialization error:",
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
        password
    ) => {
        const result =
            await authService.login(
                email,
                password
            );

        if (result?.doctor) {
            setDoctor(
                result.doctor
            );
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

    return (
        <AuthContext.Provider
            value={{
                doctor,
                user: doctor,

                isAuthenticated:
                    Boolean(
                        doctor ||
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