/**
 * Phase 4 — QR clinical Gemini fallback client.
 *
 * The browser NEVER receives the Gemini API key. It calls the DoctorsVedika
 * backend using the temporary QR access token, and the backend performs the
 * actual Gemini request only when the deterministic dialogue engine decides
 * that the current free-text input has LOW confidence.
 */
export function createQrGeminiFallback(apiBaseUrl, accessToken) {
    return async function qrGeminiFallback(text, context = {}) {
        const value = typeof text === "string" ? text.trim() : "";

        if (!value) {
            return null;
        }

        const response = await fetch(
            `${apiBaseUrl}/api/v1/public/qr/sessions/${encodeURIComponent(accessToken)}/interpret`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: value,
                    questionnaireKey: context.questionnaireKey || "general",
                    knownIntake: context.knownIntake || {},
                }),
            }
        );

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.success) {
            const error = new Error(
                payload?.message || "Clinical AI interpretation is temporarily unavailable."
            );
            error.status = response.status;
            throw error;
        }

        return {
            extraction: payload.data?.extraction || {},
            confidence: payload.data?.confidence || "LOW",
            safetyResult: payload.data?.safetyResult || null,
        };
    };
}
