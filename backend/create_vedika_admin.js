const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { supabaseAdmin, supabase, isSupabaseConfigured } = require("./config/supabase");

const db = supabaseAdmin || supabase;

async function createVedikaHospitalAdmin({
    email = "vedika.admin@doctorsvedika.com",
    password = "Admin@123456",
    fullName = "Vedika Hospital Admin",
    hospitalName = "Vedika Hospital",
    phone = "9876543210"
} = {}) {
    console.log("==========================================");
    console.log(" Creating Hospital Admin for:", hospitalName);
    console.log("==========================================");

    if (!isSupabaseConfigured || !supabaseAdmin) {
        console.error("Error: SUPABASE_SERVICE_ROLE_KEY is required in backend/.env to manage users.");
        process.exit(1);
    }

    // 1. Ensure "Vedika Hospital" exists (or update default test hospital name)
    const hospitalId = "00000000-0000-0000-0000-000000000001";
    
    const { data: existingHosp } = await db
        .from("hospitals")
        .select("*")
        .eq("id", hospitalId)
        .maybeSingle();

    let finalHospital = null;

    if (existingHosp) {
        const { data: updatedHosp, error: hospErr } = await db
            .from("hospitals")
            .update({ name: hospitalName, code: "VEDIKA-MAIN", status: "active", updated_at: new Date().toISOString() })
            .eq("id", hospitalId)
            .select()
            .single();

        if (hospErr) {
            console.error("Failed to update hospital name:", hospErr.message);
        } else {
            finalHospital = updatedHosp;
            console.log(`[1/4] Hospital name updated to: "${finalHospital.name}" (ID: ${finalHospital.id})`);
        }
    } else {
        const { data: createdHosp, error: createErr } = await db
            .from("hospitals")
            .insert({ id: hospitalId, name: hospitalName, code: "VEDIKA-MAIN", status: "active" })
            .select()
            .single();

        if (createErr) {
            console.error("Failed to create hospital:", createErr.message);
        } else {
            finalHospital = createdHosp;
            console.log(`[1/4] Created new hospital: "${finalHospital.name}" (ID: ${finalHospital.id})`);
        }
    }

    // 2. Create or Get Supabase Auth User
    const normalizedEmail = email.trim().toLowerCase();
    let authUser = null;

    // Check if auth user already exists
    const { data: listUsers } = await supabaseAdmin.auth.admin.listUsers();
    const foundAuth = listUsers?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);

    if (foundAuth) {
        authUser = foundAuth;
        // Update password if needed
        await supabaseAdmin.auth.admin.updateUserById(foundAuth.id, {
            password,
            user_metadata: { full_name: fullName, role: "hospital_admin" }
        });
        console.log(`[2/4] Existing Supabase Auth user updated for: ${normalizedEmail}`);
    } else {
        const { data: newAuth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, role: "hospital_admin" }
        });

        if (authErr || !newAuth?.user) {
            console.error("Failed to create Supabase Auth user:", authErr?.message);
            process.exit(1);
        }
        authUser = newAuth.user;
        console.log(`[2/4] Created new Supabase Auth user: ${normalizedEmail}`);
    }

    const userId = authUser.id;

    // 3. Upsert into public.users
    const { error: userErr } = await db.from("users").upsert(
        {
            id: userId,
            email: normalizedEmail,
            full_name: fullName,
            phone: phone,
            role: "admin",
            status: "active",
            updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
    );

    if (userErr) {
        console.warn("Notice updating public.users:", userErr.message);
    } else {
        console.log(`[3/4] Synced user record in public.users table (Role: hospital_admin).`);
    }

    // 4. Link to Hospital Members table
    const targetHospId = finalHospital?.id || hospitalId;
    const { error: memberErr } = await db.from("hospital_members").upsert(
        {
            hospital_id: targetHospId,
            user_id: userId,
            role: "hospital_admin",
            status: "active",
            created_at: new Date().toISOString()
        },
        { onConflict: "hospital_id,user_id" }
    );

    if (memberErr) {
        console.warn("Notice updating hospital_members:", memberErr.message);
    } else {
        console.log(`[4/4] Linked admin user to "${hospitalName}" in public.hospital_members table.`);
    }

    console.log("==========================================");
    console.log(" SUCCESS! Hospital Admin Created/Configured:");
    console.log(" Hospital Name :", hospitalName);
    console.log(" Portal URL    : http://localhost:3000/login (Select Admin Portal tab)");
    console.log(" Email         :", normalizedEmail);
    console.log(" Password      :", password);
    console.log("==========================================");
}

// Run if called directly
if (require.main === module) {
    const customEmail = process.argv[2] || "vedika.admin@doctorsvedika.com";
    const customPass = process.argv[3] || "Admin@123456";
    const customName = process.argv[4] || "Vedika Hospital Admin";

    createVedikaHospitalAdmin({
        email: customEmail,
        password: customPass,
        fullName: customName,
        hospitalName: "Vedika Hospital"
    }).then(() => process.exit(0)).catch(err => {
        console.error("Fatal error:", err);
        process.exit(1);
    });
}

module.exports = { createVedikaHospitalAdmin };
