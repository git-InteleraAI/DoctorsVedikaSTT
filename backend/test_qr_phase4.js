const http = require("http");

require("dotenv").config();

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port: Number(process.env.PORT || 5000),
                path,
                method,
                headers: {
                    "Content-Type": "application/json",
                    ...(payload
                        ? { "Content-Length": Buffer.byteLength(payload) }
                        : {}),
                },
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        resolve({ status: res.statusCode, data: JSON.parse(data) });
                    } catch {
                        resolve({ status: res.statusCode, raw: data });
                    }
                });
            }
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function run() {
    const hospitalCode = process.env.QR_TEST_HOSPITAL_CODE || "DV-HOSP-003";

    console.log("=== PHASE 4 QR GEMINI CONTRACT TEST ===");

    const create = await request("POST", "/api/v1/public/qr/sessions", {
        hospitalCode,
        firstName: "Phase4",
        lastName: "Test",
        phone: "9876543210",
        dateOfBirth: "1995-01-15",
        gender: "male",
    });

    if (create.status !== 201 || !create.data?.success) {
        throw new Error(`Session creation failed: ${JSON.stringify(create)}`);
    }

    const token = create.data.data.session.accessToken;

    // Consent gate must prevent Gemini access before affirmative consent.
    const blocked = await request(
        "POST",
        `/api/v1/public/qr/sessions/${token}/interpret`,
        { text: "I have chest pain", questionnaireKey: "general" }
    );

    if (blocked.status !== 403) {
        throw new Error(
            `Expected 403 before consent, got ${blocked.status}: ${JSON.stringify(blocked)}`
        );
    }

    console.log("✓ Gemini endpoint correctly enforces affirmative AI consent.");

    if (process.env.RUN_GEMINI_E2E !== "1") {
        console.log("✓ Contract test complete. Set RUN_GEMINI_E2E=1 to test the live Gemini path.");
        return;
    }

    const consent = await request(
        "PATCH",
        `/api/v1/public/qr/sessions/${token}/consent`,
        { aiProcessingConsent: true }
    );

    if (consent.status !== 200 || !consent.data?.success) {
        throw new Error(`Consent failed: ${JSON.stringify(consent)}`);
    }

    const interpreted = await request(
        "POST",
        `/api/v1/public/qr/sessions/${token}/interpret`,
        {
            text: "I have chest pain and I am having difficulty breathing.",
            questionnaireKey: "general",
        }
    );

    if (
        interpreted.status !== 200 ||
        !interpreted.data?.success ||
        !interpreted.data?.data?.extraction
    ) {
        throw new Error(`Gemini interpretation failed: ${JSON.stringify(interpreted)}`);
    }

    const symptoms = interpreted.data.data.extraction.symptoms || [];
    if (!symptoms.includes("chest_pain") || !symptoms.includes("breathlessness")) {
        throw new Error(
            `Expected canonical emergency symptoms, got: ${JSON.stringify(symptoms)}`
        );
    }

    if (interpreted.data.data.safetyResult?.status !== "CRITICAL") {
        throw new Error(
            `Expected deterministic CRITICAL safety result, got: ${JSON.stringify(
                interpreted.data.data.safetyResult
            )}`
        );
    }

    console.log("✓ Live Gemini extraction returned canonical symptoms.");
    console.log("✓ Deterministic safety re-evaluation returned CRITICAL.");
    console.log("=== PHASE 4 QR GEMINI E2E TEST PASSED ===");
}

run().catch((error) => {
    console.error("❌ PHASE 4 TEST FAILED:", error.message);
    process.exit(1);
});
