import { evaluateSafety } from "./safetyEngine";

const test = (name, condition) => {
    if (!condition) {
        throw new Error(`❌ FAILED: ${name}`);
    }

    console.log(`✅ PASSED: ${name}`);
};

console.log("\n=== DoctorsVedika Clinical Safety Engine Test ===\n");

// 1. SAFE
const safe = evaluateSafety({
    symptoms: ["headache"],
    severity: "mild",
});

test(
    "Mild headache → SAFE",
    safe.status === "SAFE" &&
    safe.requiresImmediateAction === false
);

// 2. CAUTION
const caution = evaluateSafety({
    symptoms: ["chest_pain"],
    severity: "mild",
});

test(
    "Isolated mild chest pain → CAUTION",
    caution.status === "CAUTION" &&
    caution.requiresImmediateAction === false
);

// 3. CAUTION
const breathlessness = evaluateSafety({
    symptoms: ["breathlessness"],
    severity: "moderate",
});

test(
    "Isolated moderate breathlessness → CAUTION",
    breathlessness.status === "CAUTION" &&
    breathlessness.requiresImmediateAction === false
);

// 4. CRITICAL
const critical = evaluateSafety({
    symptoms: ["chest_pain", "breathlessness"],
    severity: "moderate",
});

test(
    "Chest pain + breathlessness → CRITICAL",
    critical.status === "CRITICAL" &&
    critical.requiresImmediateAction === true
);

// 5. CRITICAL priority
const priority = evaluateSafety({
    symptoms: ["high_bp", "chest_pain", "breathlessness"],
    severity: "moderate",
});

test(
    "CRITICAL takes priority over CAUTION",
    priority.status === "CRITICAL" &&
    priority.requiresImmediateAction === true &&
    priority.reasonCodes.includes("CRIT_CARDIAC_RESPIRATORY")
);

// 6. Empty intake
const empty = evaluateSafety({
    symptoms: [],
    severity: null,
});

test(
    "Empty intake → SAFE",
    empty.status === "SAFE" &&
    empty.requiresImmediateAction === false
);

console.log("\n=== All Safety Engine Tests Passed ===\n");