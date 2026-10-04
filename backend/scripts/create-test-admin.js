require("dotenv").config({ path: "../.env" });
const { supabaseAdmin } = require("../config/supabase");

async function createHospitalAdmin() {
  console.log("==========================================");
  console.log(" CREATING TEST HOSPITAL ADMIN ACCOUNT");
  console.log("==========================================");

  if (!supabaseAdmin) {
    console.error("Error: supabaseAdmin is not initialized. Check SUPABASE_SERVICE_ROLE_KEY in .env.");
    process.exit(1);
  }

  const email = process.env.TEST_ADMIN_EMAIL || "admin@doctorsvedika.com";
  const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123456";
  const fullName = "Dr. Harshini Admin";
  const hospitalId = "00000000-0000-0000-0000-000000000001";

  console.log(`Checking if user ${email} already exists...`);

  // 1. Create or retrieve Supabase Auth User
  let userId = null;
  const { data: existingUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  
  if (!listErr && existingUsers && existingUsers.users) {
    const found = existingUsers.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (found) {
      console.log(`User already exists in Supabase Auth with ID: ${found.id}`);
      userId = found.id;
    }
  }

  if (!userId) {
    console.log(`Creating new user in Supabase Auth (email_confirm: true)...`);
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "hospital_admin" }
    });

    if (createErr) {
      console.error("Failed to create Supabase Auth user:", createErr.message);
      process.exit(1);
    }
    userId = newUser.user.id;
    console.log(`Successfully created Auth user! ID: ${userId}`);
  }

  // 2. Insert into public.users if table exists
  console.log("Updating public.users table...");
  const { error: userErr } = await supabaseAdmin.from("users").upsert({
    id: userId,
    email: email,
    full_name: fullName,
    role: "hospital_admin",
    updated_at: new Date().toISOString()
  }, { onConflict: "id" });
  if (userErr) console.warn("Notice (public.users):", userErr.message);

  // 3. Create or resolve Doctor Profile for Admin + Doctor dual role
  console.log("Setting up Doctor Profile for Admin...");
  let doctorId = null;
  const { data: existingDoctor } = await supabaseAdmin.from("doctors").select("doctor_id").eq("user_id", userId).maybeSingle();
  
  if (existingDoctor) {
    doctorId = existingDoctor.doctor_id;
  } else {
    const { data: newDoc, error: docErr } = await supabaseAdmin.from("doctors").insert({
      user_id: userId,
      full_name: fullName,
      specialization: "General Hospital Administration & Medicine",
      mobile_number: "9999999999",
      doctor_is_active: true
    }).select().single();
    
    if (!docErr && newDoc) {
      doctorId = newDoc.doctor_id;
    } else {
      console.warn("Notice (doctors table):", docErr?.message);
    }
  }

  // 4. Link into public.hospital_members
  console.log("Linking into public.hospital_members...");
  const { data: member, error: memErr } = await supabaseAdmin.from("hospital_members").upsert({
    hospital_id: hospitalId,
    user_id: userId,
    doctor_id: doctorId,
    role: "hospital_admin",
    status: "active",
    updated_at: new Date().toISOString()
  }, { onConflict: "hospital_id, user_id" }).select().single();

  if (memErr) {
    console.error("Error creating hospital membership:", memErr.message);
  } else {
    console.log("Successfully created Hospital Admin Membership! ID:", member.id);
  }

  console.log("==========================================");
  console.log(" TEST HOSPITAL ADMIN CREATION COMPLETE!");
  console.log(` Credentials:`);
  console.log(` - Email:    ${email}`);
  console.log(` - Password: ${password}`);
  console.log(` - Hospital: DV-MAIN (${hospitalId})`);
  console.log("==========================================");
}

createHospitalAdmin().catch(console.error);
