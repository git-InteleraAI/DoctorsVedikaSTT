const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/harshini/Downloads/DoctorsVedikaStt-main/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testCompleteWalkin() {
    console.log("=== TESTING COMPLETE WALKIN DB PERSISTENCE & DIRECTORY CHECK ===");

    const timestamp = Date.now();
    const cleanPhone = "9876543" + Math.floor(100 + Math.random()*900);
    const dummyEmail = `walkin_${timestamp}@doctorsvedika.com`;
    const dummyPassword = `Walkin_${timestamp}_1234!`;
    const fullName = "Swetha Walkin DB Test";

    // 1. Silent Auth User
    const { data: authData } = await supabase.auth.admin.createUser({
        email: dummyEmail,
        password: dummyPassword,
        phone: cleanPhone,
        email_confirm: true,
        user_metadata: { role: 'patient', full_name: fullName }
    });

    const finalUserId = authData.user.id;
    console.log("1. Created Auth User:", finalUserId);

    // 2. Public users
    await supabase.from("users").upsert([{
        id: finalUserId,
        email: dummyEmail,
        phone: cleanPhone,
        full_name: fullName,
        role: "patient",
        status: "active"
    }]);
    console.log("2. Inserted into public.users");

    // 3. Public patients
    const patientCode = `DV-P-${Math.floor(100000 + Math.random()*900000)}`;
    const { data: patRes } = await supabase.from("patients").insert([{
        id: finalUserId,
        user_id: finalUserId,
        patient_code: patientCode,
        full_name: fullName,
        phone: cleanPhone,
        gender: "female"
    }]).select();

    console.log("3. Inserted into public.patients:", patRes[0]?.patient_code);

    // 4. Public appointments (Doctor Association & Visit)
    const doctorId = "b82b160c-6a29-4853-a442-e9eae1660213";
    const { data: appRes } = await supabase.from("appointments").insert([{
        patient_id: finalUserId,
        doctor_id: doctorId,
        appointment_date: new Date().toISOString().split("T")[0],
        appointment_time: "10:30:00",
        status: "confirmed",
        payment_status: "paid",
        payment_method: "pay_at_clinic",
        reason: "Walk-in Consultation"
    }]).select();

    console.log("4. Inserted into public.appointments:", appRes[0]?.id);

    // 5. Query Patients Directory for this Doctor (Simulate searchPatients logic)
    const { data: docApps } = await supabase.from("appointments").select("patient_id").eq("doctor_id", doctorId);
    const pIds = [...new Set(docApps.map(a => a.patient_id))];

    const { data: directoryPatients } = await supabase.from("patients").select("*").in("user_id", pIds);

    const foundInDirectory = directoryPatients.find(p => p.id === finalUserId);
    console.log("5. Found in Doctor's Directory query?", !!foundInDirectory, foundInDirectory?.full_name);

    if (foundInDirectory) {
        console.log("\n✅ VERIFIED 100%: Walk-in patient is permanently saved in Supabase & appears in Doctor Directory!");
    }

    // Clean up
    await supabase.from("appointments").delete().eq("id", appRes[0].id);
    await supabase.from("patients").delete().eq("id", finalUserId);
    await supabase.from("users").delete().eq("id", finalUserId);
    await supabase.auth.admin.deleteUser(finalUserId);
}

testCompleteWalkin();
