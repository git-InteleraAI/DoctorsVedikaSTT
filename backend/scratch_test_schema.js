const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSchema() {
    console.log("=== TESTING SCHEMA CONSTRAINTS ===");

    // Test 1: Insert into patients with user_id: null
    const test1Id = `00000000-0000-4000-a000-${Date.now().toString().slice(-12)}`;
    const { data: d1, error: e1 } = await supabase
        .from('patients')
        .insert([{
            id: test1Id,
            patient_code: `DV-P-${Math.floor(100000 + Math.random()*900000)}`,
            full_name: "Test Null UserID Patient",
            phone: "9998887771",
            user_id: null
        }])
        .select();

    console.log("Test 1 (user_id: null):", { data: d1, error: e1 });

    if (d1 && d1.length > 0) {
        await supabase.from('patients').delete().eq('id', test1Id);
    }

    // Test 2: Insert into users directly (no auth.users)
    const test2UserId = `00000000-0000-4000-b000-${Date.now().toString().slice(-12)}`;
    const { data: d2, error: e2 } = await supabase
        .from('users')
        .insert([{
            id: test2UserId,
            full_name: "Test User Row",
            phone: "9998887772",
            role: "patient"
        }])
        .select();

    console.log("Test 2 (users insert without auth.users):", { data: d2, error: e2 });

    if (d2 && d2.length > 0) {
        const { data: d3, error: e3 } = await supabase
            .from('patients')
            .insert([{
                id: test1Id,
                patient_code: `DV-P-${Math.floor(100000 + Math.random()*900000)}`,
                full_name: "Test Patient With Users Row",
                phone: "9998887772",
                user_id: test2UserId
            }])
            .select();
        console.log("Test 3 (patients insert with users row):", { data: d3, error: e3 });

        await supabase.from('patients').delete().eq('id', test1Id);
        await supabase.from('users').delete().eq('id', test2UserId);
    }

    // Test 4: Sample patient row
    const { data: sample, error: sampleErr } = await supabase.from('patients').select('*').limit(1);
    console.log("Sample Patient Row keys:", sample && sample.length > 0 ? Object.keys(sample[0]) : "empty", sampleErr);
}

testSchema();
