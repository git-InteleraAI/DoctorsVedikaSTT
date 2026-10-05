const crypto = require("crypto");

// Standard prefix for AES-256-GCM encrypted strings
const PREFIX = "enc:gcm:v1:";

/**
 * Get 32-byte key derived strictly from process.env.ENCRYPTION_KEY
 */
function getKeyBuffer() {
    const rawKey = process.env.ENCRYPTION_KEY || "";
    if (!rawKey) {
        throw new Error("ENCRYPTION_KEY environment variable is missing in process.env.");
    }
    if (rawKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
        return Buffer.from(rawKey, "hex");
    }
    return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Check if a value is already AES-256-GCM encrypted by inspecting prefix
 */
function isEncrypted(value) {
    return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt a value (string, number, object, array, boolean, date) using AES-256-GCM
 */
function encrypt(value) {
    if (value === null || value === undefined || value === "") {
        return value;
    }
    if (isEncrypted(value)) {
        return value; // Prevent double encryption
    }

    let textToEncrypt;
    if (typeof value === "object") {
        textToEncrypt = JSON.stringify(value);
    } else {
        textToEncrypt = String(value);
    }

    const key = getKeyBuffer();
    const iv = crypto.randomBytes(12); // 12-byte IV for AES-256-GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(textToEncrypt, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * If value is old plaintext, null, or untampered non-encrypted data, returns as-is.
 */
function decrypt(value) {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value !== "string" || !isEncrypted(value)) {
        return value; // Support legacy/old plaintext records seamlessly
    }

    try {
        const payload = value.slice(PREFIX.length);
        const parts = payload.split(":");
        if (parts.length !== 3) {
            return value;
        }

        const iv = Buffer.from(parts[0], "hex");
        const authTag = Buffer.from(parts[1], "hex");
        const encryptedText = parts[2];

        const key = getKeyBuffer();
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");

        const trimmed = decrypted.trim();
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
                return JSON.parse(decrypted);
            } catch (_) {
                return decrypted;
            }
        }

        return decrypted;
    } catch (err) {
        console.warn("[EncryptionService Notice] Decryption skipped or tampered ciphertext:", err.message);
        return value;
    }
}

// Field maps for the 6 target tables
const ENCRYPTED_FIELDS = {
    patients: [
        "email",
        "blood_group",
        "locality",
        "address",
        "first_name",
        "last_name",
        "full_name",
        "phone"
    ],
    hospital_patient_records: [
        "first_name",
        "last_name",
        "full_name",
        "phone",
        "email",
        "gender",
        "blood_group",
        "address"
    ],
    patient_visits: [
        "chief_complaint",
        "symptoms",
        "diagnosis",
        "clinical_notes",
        "follow_up_notes",
        "chief_complaints",
        "intake_vitals"
    ],
    consultation_notes: [
        "notes",
        "symptoms",
        "diagnosis",
        "audio_transcript",
        "confirmed_symptoms",
        "new_symptoms",
        "objective_findings"
    ],
    prescriptions: [
        "medicines",
        "advice",
        "route"
    ],
    appointment_symptoms: [
        "symptoms",
        "duration",
        "severity",
        "current_medications",
        "additional_notes"
    ],
    appointments: [
        "reason",
        "notes",
        "patient_name",
        "patient_phone"
    ]
};

/**
 * Encrypt target fields of a payload before database insert/update
 */
function encryptPayload(tableName, payload) {
    if (!payload || typeof payload !== "object") return payload;
    const fields = ENCRYPTED_FIELDS[tableName] || [];
    const result = { ...payload };

    for (const field of fields) {
        if (field in result && result[field] !== null && result[field] !== undefined) {
            result[field] = encrypt(result[field]);
        }
    }
    return result;
}

/**
 * Decrypt target fields (or any encrypted strings) of a database record/payload
 */
function decryptRecord(tableName, record) {
    if (!record || typeof record !== "object") return record;
    if (Array.isArray(record)) {
        return record.map(item => decryptRecord(tableName, item));
    }

    const result = { ...record };

    for (const field of Object.keys(result)) {
        if (isEncrypted(result[field])) {
            result[field] = decrypt(result[field]);
        }
    }

    // Handle nested join structures
    for (const key of Object.keys(result)) {
        if (result[key] && typeof result[key] === "object") {
            if (key === "hospital_patient_records") {
                result[key] = decryptRecord("hospital_patient_records", result[key]);
            } else if (key === "patient_visits") {
                result[key] = decryptRecord("patient_visits", result[key]);
            } else if (key === "consultation_notes") {
                result[key] = decryptRecord("consultation_notes", result[key]);
            } else if (key === "prescriptions") {
                result[key] = decryptRecord("prescriptions", result[key]);
            } else if (key === "appointment_symptoms") {
                result[key] = decryptRecord("appointment_symptoms", result[key]);
            } else if (key === "patients") {
                result[key] = decryptRecord("patients", result[key]);
            } else if (Array.isArray(result[key])) {
                result[key] = result[key].map(item => (typeof item === "object" ? decryptRecord(key, item) : decrypt(item)));
            }
        }
    }

    return result;
}

module.exports = {
    encrypt,
    decrypt,
    isEncrypted,
    encryptPayload,
    decryptRecord,
    ENCRYPTED_FIELDS
};
