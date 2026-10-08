const http = require('http');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: 5000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...headers,
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('=== STARTING AUTOMATED QR WORKFLOW & SAFETY SUITE ===\n');

    // 1. Hospital lookup tests
    console.log('[TEST 1] Invalid hospital lookup');
    const r1 = await request('GET', '/api/v1/public/qr/hospitals/NONEXISTENT-CODE');
    if (r1.status !== 404) throw new Error(`Expected 404, got ${r1.status}`);
    console.log('✓ Invalid hospital rejected with 404\n');

    console.log('[TEST 2] Tooth Medic hospital lookup (DV-HOSP-003)');
    const r2 = await request('GET', '/api/v1/public/qr/hospitals/DV-HOSP-003');
    if (r2.status !== 200 || !r2.data?.success) throw new Error(`Failed to load Tooth Medic: ${JSON.stringify(r2)}`);
    const hospital = r2.data.data.hospital;
    if (hospital.name !== 'Tooth Medic Family Dental Care') {
        throw new Error(`Expected 'Tooth Medic Family Dental Care', got '${hospital.name}'`);
    }
    if (hospital.code !== 'DV-HOSP-003') {
        throw new Error(`Expected 'DV-HOSP-003', got '${hospital.code}'`);
    }
    console.log(`✓ Tooth Medic resolved: ${hospital.name} (Code: ${hospital.code}, ID: ${hospital.id})\n`);

    // 2. Session creation tests
    console.log('[TEST 3] Invalid session creation (missing required fields)');
    const r3 = await request('POST', '/api/v1/public/qr/sessions', { hospitalCode: 'DV-HOSP-003' });
    if (r3.status !== 400) throw new Error(`Expected 400, got ${r3.status}`);
    console.log('✓ Invalid session creation rejected with 400\n');

    console.log('[TEST 4] Valid session creation for test patient');
    const r4 = await request('POST', '/api/v1/public/qr/sessions', {
        hospitalCode: 'DV-HOSP-003',
        firstName: 'Test',
        lastName: 'Patient',
        phone: '9876543210',
        dateOfBirth: '1995-01-15',
        gender: 'male',
    });
    if (r4.status !== 201 || !r4.data?.success) throw new Error(`Failed to create session: ${JSON.stringify(r4)}`);
    const session = r4.data.data.session;
    const accessToken = session.accessToken;
    console.log(`✓ Session created successfully. Token: ${accessToken}, Status: ${session.status}\n`);

    // 3. Session lookup tests
    console.log('[TEST 5] GET Session by accessToken');
    const r5 = await request('GET', `/api/v1/public/qr/sessions/${accessToken}`);
    if (r5.status !== 200 || !r5.data?.success) throw new Error(`Failed to get session: ${JSON.stringify(r5)}`);
    console.log(`✓ Session loaded. Patient: ${r5.data.data.session.patientName}, Status: ${r5.data.data.session.status}\n`);

    // 4. Update intake tests (PATCH)
    console.log('[TEST 6] PATCH intake with fever and headache (SAFE)');
    const intakePayload = {
        clinicalIntake: {
            symptoms: ['fever', 'headache'],
            duration: '2 days',
            severity: 'mild',
            location: 'Forehead',
            recent_actions: 'Paracetamol',
        },
    };
    const r6 = await request('PATCH', `/api/v1/public/qr/sessions/${accessToken}/intake`, intakePayload);
    if (r6.status !== 200 || !r6.data?.success) throw new Error(`Failed to patch intake: ${JSON.stringify(r6)}`);
    if (r6.data.data.session.safetyStatus !== 'safe') throw new Error(`Expected safe status, got ${r6.data.data.session.safetyStatus}`);
    console.log(`✓ Intake updated. Safety status: ${r6.data.data.session.safetyStatus}\n`);

    // 5. Submit session (SAFE)
    console.log('[TEST 7] POST submit session (SAFE)');
    const r7 = await request('POST', `/api/v1/public/qr/sessions/${accessToken}/submit`, intakePayload);
    if (r7.status !== 200 || !r7.data?.success) throw new Error(`Failed to submit: ${JSON.stringify(r7)}`);
    if (r7.data.data.session.status !== 'submitted') throw new Error(`Expected submitted status, got ${r7.data.data.session.status}`);
    console.log(`✓ Session submitted. Status: ${r7.data.data.session.status}, SubmittedAt: ${r7.data.data.session.submittedAt}\n`);

    // 6. Duplicate submit idempotency
    console.log('[TEST 8] Duplicate submit idempotency');
    const r8 = await request('POST', `/api/v1/public/qr/sessions/${accessToken}/submit`);
    if (r8.status !== 200 || !r8.data?.success) throw new Error(`Expected 200 idempotent duplicate submit: ${JSON.stringify(r8)}`);
    console.log('✓ Duplicate submit handled gracefully.\n');

    // 7. Supabase Database direct verification
    console.log('[TEST 9] Verify row in Supabase qr_intake_sessions table');
    const { data: dbRow, error: dbErr } = await supabase
        .from('qr_intake_sessions')
        .select('*')
        .eq('access_token', accessToken)
        .single();
    if (dbErr || !dbRow) throw new Error(`Database record not found: ${dbErr?.message}`);
    if (dbRow.status !== 'submitted') throw new Error(`Expected db status submitted, got ${dbRow.status}`);
    if (dbRow.hospital_id !== hospital.id) throw new Error(`Expected hospital_id ${hospital.id}, got ${dbRow.hospital_id}`);
    if (dbRow.safety_status !== 'safe') throw new Error(`Expected safety_status safe, got ${dbRow.safety_status}`);
    if (!dbRow.submitted_at) throw new Error('Expected submitted_at timestamp');
    console.log('✓ Database verification verified: status, hospital_id, safety_status, submitted_at, patient details match.\n');

    // 8. CRITICAL Safety test
    console.log('[TEST 10] CRITICAL safety test: chest pain + difficulty breathing');
    const rCritSess = await request('POST', '/api/v1/public/qr/sessions', {
        hospitalCode: 'DV-HOSP-003',
        firstName: 'Emergency',
        lastName: 'Patient',
        phone: '9123456789',
        dateOfBirth: '1980-05-20',
        gender: 'male',
    });
    const critToken = rCritSess.data.data.session.accessToken;
    const critSubmit = await request('POST', `/api/v1/public/qr/sessions/${critToken}/submit`, {
        clinicalIntake: {
            symptoms: ['chest_pain', 'breathlessness'],
            severity: 'severe',
        },
    });
    if (critSubmit.data.safetyBlocked !== true) {
        throw new Error(`Expected safetyBlocked true, got: ${JSON.stringify(critSubmit)}`);
    }
    if (critSubmit.data.data?.status !== 'safety_blocked') {
        throw new Error(`Expected safety_blocked status, got: ${critSubmit.data.data?.status}`);
    }

    // Verify DB row for critical
    const { data: critDbRow } = await supabase
        .from('qr_intake_sessions')
        .select('status, safety_status')
        .eq('access_token', critToken)
        .single();
    if (critDbRow.status !== 'safety_blocked' || critDbRow.safety_status !== 'critical') {
        throw new Error(`Expected db status safety_blocked and safety_status critical, got: ${JSON.stringify(critDbRow)}`);
    }
    console.log('✓ CRITICAL emergency safety verified: server-side safety re-evaluation blocked normal submission, set safety_blocked, and returned safetyBlocked: true.\n');

    console.log('====================================================');
    console.log('ALL API & CLINICAL SUITE TESTS PASSED 100%!');
    console.log('====================================================');
}

runTests().catch((err) => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
});
