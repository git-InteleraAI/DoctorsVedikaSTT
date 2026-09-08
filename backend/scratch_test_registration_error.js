const { supabase, supabaseAdmin } = require('./config/supabase');
const authService = require('./services/authService');

async function testDuplicateRegistrationError() {
    console.log("=== TESTING DUPLICATE DOCTOR REGISTRATION ERROR RESPONSE ===");

    // Fetch existing doctor email from doctors table
    const { data: docs } = await supabaseAdmin.from('doctors').select('doctor_email, user_id').limit(1);
    console.log("Sample existing doctor in DB:", docs);

    const targetEmail = docs && docs.length > 0 && docs[0].doctor_email ? docs[0].doctor_email : "aadhyasdental@gmail.com";

    try {
        await authService.register({
            fullName: "Dr. Test Duplicate",
            email: targetEmail,
            password: "password123",
            mobileNumber: "9876543210"
        });
        console.error("❌ Test failed: Expected duplicate registration error was not thrown");
    } catch (err) {
        console.log("Caught Error Message:", err.message);

        const isUserFriendly = !err.message.includes("Database error:") &&
                               !err.message.includes("duplicate key") &&
                               !err.message.includes("doctors_user_id_key");

        if (isUserFriendly) {
            console.log("✅ SUCCESS: Error message is clean and user-friendly!");
        } else {
            console.error("❌ FAILED: Error message still contains raw SQL/database detail!");
        }
    }
}

testDuplicateRegistrationError();
