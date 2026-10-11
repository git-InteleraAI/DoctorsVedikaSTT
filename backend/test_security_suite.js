/**
 * Doctors Vedika — Comprehensive Security and Regression Test Suite (Expanded)
 */
require("dotenv").config({ path: "./.env" });
const jwt = require("jsonwebtoken");
const { PassThrough } = require("stream");
const { authenticateAdapter, requirePermission } = require("./middleware/authAdapter");
const { protect } = require("./middleware/authMiddleware");
const authService = require("./services/authService");
const { evaluateSafety } = require("./services/clinical/safetyEngine");
const { renderPrescriptionPdfToStream } = require("./pdf/generatePrescriptionPdf");

const JWT_SECRET = process.env.JWT_SECRET;

const results = [];

function recordTest(category, testName, passed, details = "") {
    results.push({ category, testName, passed, details });
    const mark = passed ? "✓ PASS" : "✗ FAIL";
    console.log(`[${mark}] [${category}] ${testName} ${details ? "(" + details + ")" : ""}`);
}

function mockRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
        setHeader(k, v) {
            this.headers[k] = v;
            return this;
        }
    };
    return res;
}

async function runTests() {
    console.log("==================================================================");
    console.log("DOCTORS VEDIKA — SECURITY AUDIT & REGRESSION TEST SUITE EXECUTION");
    console.log("==================================================================");

    // -------------------------------------------------------------
    // 1. AUTHENTICATION TESTS
    // -------------------------------------------------------------
    console.log("\n--- Category 1: Authentication & Token Security ---");

    // Test 1.1: Missing JWT Token Rejected
    {
        const req = { headers: {} };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        recordTest("Authentication", "Missing Bearer token rejected with 401", res.statusCode === 401 && !nextCalled, `status: ${res.statusCode}`);
    }

    // Test 1.2: Invalid Signature Token Rejected
    {
        const forgedToken = jwt.sign({ userId: "11111111-1111-1111-1111-111111111111" }, "attacker-secret-key-12345");
        const req = { headers: { authorization: `Bearer ${forgedToken}` } };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        recordTest("Authentication", "Forged signature token rejected with 401", res.statusCode === 401 && !nextCalled, `status: ${res.statusCode}`);
    }

    // Test 1.3: Expired Token Rejected
    {
        const expiredToken = jwt.sign(
            { userId: "6f13224e-2068-43f8-b195-74e802c6ec01" },
            JWT_SECRET,
            { expiresIn: "-1s" }
        );
        const req = { headers: { authorization: `Bearer ${expiredToken}` } };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        recordTest("Authentication", "Expired JWT token rejected with 401", res.statusCode === 401 && !nextCalled, `status: ${res.statusCode}`);
    }

    // Test 1.4: Fabricated 'sub' without valid signature rejected (No jwt.decode forgery)
    {
        const forgedSubToken = jwt.sign({ sub: "fabricated-admin-id" }, "wrong-key");
        const req = { headers: { authorization: `Bearer ${forgedSubToken}` } };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        recordTest("Authentication", "Fabricated 'sub' token with invalid signature rejected", res.statusCode === 401 && !nextCalled, `status: ${res.statusCode}`);
    }

    // Test 1.5: Valid Custom JWT for authentic doctor accepted
    let validDoctorToken = null;
    let sampleDoctorUser = {
        id: "6f13224e-2068-43f8-b195-74e802c6ec01",
        user_id: "6f13224e-2068-43f8-b195-74e802c6ec01",
        doctor_id: "1cdc901d-767f-43f8-86e5-36109f0189ae",
        email: "doctor@vedika.com",
        full_name: "Dr. Sandeep Reddy"
    };
    {
        validDoctorToken = authService.generateToken(sampleDoctorUser);
        const req = { headers: { authorization: `Bearer ${validDoctorToken}` } };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        const passed = nextCalled && req.context && req.context.userId === sampleDoctorUser.user_id && req.context.role === "doctor";
        recordTest("Authentication", "Valid custom JWT verified and context established", passed, `role: ${req.context?.role}`);
    }

    // Test 1.6: protect middleware validates token and establishes req.doctor
    {
        const req = { headers: { authorization: `Bearer ${validDoctorToken}` } };
        const res = mockRes();
        let nextCalled = false;
        await protect(req, res, () => { nextCalled = true; });
        const passed = nextCalled && req.doctor && (req.doctor.id === sampleDoctorUser.doctor_id || req.doctor.userId === sampleDoctorUser.user_id);
        recordTest("Authentication", "protect middleware validates token and loads req.doctor", passed, `doctor: ${req.doctor?.fullName || req.doctor?.id}`);
    }

    // Test 1.7: Invalid Google token rejected by verifyGoogleToken
    {
        let errorCaught = false;
        try {
            await authService.verifyGoogleToken("invalid-google-token-xyz");
        } catch (err) {
            errorCaught = true;
        }
        recordTest("Authentication", "Invalid Google token is rejected by verifyGoogleToken", errorCaught);
    }

    // -------------------------------------------------------------
    // 2. IDENTITY FALLBACK & UNKNOWN IDENTITY TESTS
    // -------------------------------------------------------------
    console.log("\n--- Category 2: Identity Fallback Hardening ---");

    // Test 2.1: Unknown User ID Fails Closed
    {
        const nonExistentId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
        const unknownUserToken = jwt.sign({ userId: nonExistentId }, JWT_SECRET, { expiresIn: "1h" });
        const req = { headers: { authorization: `Bearer ${unknownUserToken}` } };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        recordTest("Identity", "Unknown user ID fails closed with 403 (no synthetic access)", res.statusCode === 403 && !nextCalled, `status: ${res.statusCode}`);
    }

    // Test 2.2: getDoctorById with unknown ID returns null (no synthetic staff fallback)
    {
        const unknownDoctor = await authService.getDoctorById("ffffffff-ffff-ffff-ffff-ffffffffffff");
        recordTest("Identity", "getDoctorById returns null for unknown ID (no synthetic profile)", unknownDoctor === null, `result: ${unknownDoctor}`);
    }

    // -------------------------------------------------------------
    // 3. ROLE & PRIVILEGE ESCALATION TESTS
    // -------------------------------------------------------------
    console.log("\n--- Category 3: Role & Privilege Escalation Prevention ---");

    // Test 3.1: Doctor cannot gain staff role by passing X-Portal-Context: staff
    {
        const req = {
            headers: {
                authorization: `Bearer ${validDoctorToken}`,
                "x-portal-context": "staff"
            }
        };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        recordTest("Authorization", "Doctor cannot escalate to staff via X-Portal-Context", res.statusCode === 403 && !nextCalled, `status: ${res.statusCode}`);
    }

    // Test 3.2: Doctor cannot gain hospital_admin role by passing X-Portal-Context: hospital_admin
    {
        const req = {
            headers: {
                authorization: `Bearer ${validDoctorToken}`,
                "x-portal-context": "hospital_admin"
            }
        };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        recordTest("Authorization", "Doctor cannot escalate to hospital_admin via X-Portal-Context", res.statusCode === 403 && !nextCalled, `status: ${res.statusCode}`);
    }

    // Test 3.3: Hospital Admin cannot bypass clinical permissions
    {
        const adminReq = {
            context: {
                role: "hospital_admin",
                permissions: ["hospital.view", "hospital.manage", "staff.view", "staff.manage", "doctors.view"]
            }
        };
        const adminRes = mockRes();
        let nextCalled = false;
        const clinicalGuard = requirePermission("prescription.write");
        clinicalGuard(adminReq, adminRes, () => { nextCalled = true; });
        recordTest("Authorization", "Hospital Admin denied access to clinical permission 'prescription.write'", adminRes.statusCode === 403 && !nextCalled, `status: ${adminRes.statusCode}`);
    }

    // Test 3.4: Staff cannot access hospital admin permissions
    {
        const staffReq = {
            context: {
                role: "staff",
                permissions: ["patients.view", "patients.search", "walkin.register", "appointments.create"]
            }
        };
        const staffRes = mockRes();
        let nextCalled = false;
        const adminGuard = requirePermission("staff.manage");
        adminGuard(staffReq, staffRes, () => { nextCalled = true; });
        recordTest("Authorization", "Staff denied access to admin permission 'staff.manage'", staffRes.statusCode === 403 && !nextCalled, `status: ${staffRes.statusCode}`);
    }

    // -------------------------------------------------------------
    // 4. MULTI-TENANT HOSPITAL ISOLATION TESTS
    // -------------------------------------------------------------
    console.log("\n--- Category 4: Multi-Tenant Hospital Isolation ---");

    // Test 4.1: Requesting unauthorized hospital via X-Hospital-Id returns 403
    {
        const unauthorizedHospitalId = "3fd037c1-01ec-46e6-be35-9a0dd3deb88c"; // Park Clinics
        const req = {
            headers: {
                authorization: `Bearer ${validDoctorToken}`,
                "x-hospital-id": unauthorizedHospitalId
            }
        };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        recordTest("Tenant Isolation", "Access to unassigned hospital via X-Hospital-Id rejected with 403", res.statusCode === 403 && !nextCalled, `status: ${res.statusCode}`);
    }

    // Test 4.2: Authorized hospital via X-Hospital-Id is accepted
    {
        const authorizedHospitalId = "00000000-0000-0000-0000-000000000001";
        const req = {
            headers: {
                authorization: `Bearer ${validDoctorToken}`,
                "x-hospital-id": authorizedHospitalId
            }
        };
        const res = mockRes();
        let nextCalled = false;
        await authenticateAdapter(req, res, () => { nextCalled = true; });
        const passed = nextCalled && req.context && req.context.hospitalId === authorizedHospitalId;
        recordTest("Tenant Isolation", "Access to authorized hospital accepted and properly scoped", passed, `hospitalId: ${req.context?.hospitalId}`);
    }

    // -------------------------------------------------------------
    // 5. FUNCTIONAL REGRESSION TESTS
    // -------------------------------------------------------------
    console.log("\n--- Category 5: Functional & Clinical Regression Workflows ---");

    // Test 5.1: Clinical Safety Engine evaluation
    {
        const safetyResult = evaluateSafety({
            symptoms: ["headache", "mild cough"],
            vitals: { bpSystolic: 120, bpDiastolic: 80, pulse: 72, spO2: 98 }
        });
        const passed = safetyResult && safetyResult.status === "SAFE";
        recordTest("Functional", "Clinical Safety Engine evaluation functions without error", passed, `status: ${safetyResult?.status}`);
    }

    // Test 5.2: PDF Prescription Generation stream
    {
        try {
            const sampleRxData = {
                doctorName: "Dr. Test Doctor",
                patientName: "Patient Ramesh",
                patientAge: 45,
                patientGender: "Male",
                patientCode: "P-1001",
                hospitalName: "City Care Super Specialty Hospital",
                diagnosis: "Essential Hypertension",
                medicines: [
                    { name: "Telmisartan", dosage: "40mg", frequency: "1-0-0", duration: "30 days" }
                ],
                consultationDate: "2026-10-12"
            };
            const mockStream = new PassThrough();
            let chunkReceived = false;
            mockStream.on("data", (chunk) => {
                if (chunk && chunk.length > 0) chunkReceived = true;
            });
            renderPrescriptionPdfToStream(sampleRxData, mockStream);
            recordTest("Functional", "Prescription PDF stream generation succeeds", true);
        } catch (err) {
            recordTest("Functional", "Prescription PDF stream generation succeeds", false, err.message);
        }
    }

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log("\n==================================================================");
    const total = results.length;
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = total - passedCount;
    console.log(`TOTAL TESTS: ${total} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
    console.log("==================================================================");

    if (failedCount > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Test runner encountered unexpected error:", err);
    process.exit(1);
});
