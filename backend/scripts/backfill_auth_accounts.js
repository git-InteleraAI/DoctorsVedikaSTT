const { supabaseAdmin } = require("../config/supabase");

async function runAuditAndMigration() {
    console.log("==================================================");
    console.log("DOCTORS VEDIKA AUTH AUDIT & BACKFILL MIGRATION");
    console.log("==================================================");

    if (!supabaseAdmin) {
        console.error("ERROR: supabaseAdmin client not configured. Check SUPABASE_SERVICE_ROLE_KEY.");
        process.exit(1);
    }

    // 1. Fetch Auth Users
    let allAuthUsers = [];
    try {
        const { data: authRes, error: authErr } = await supabaseAdmin.auth.admin.listUsers();
        if (authErr) throw authErr;
        allAuthUsers = authRes?.users || [];
    } catch (err) {
        console.error("Failed to list Auth users:", err.message);
    }

    const authEmailMap = new Map();
    const authIdMap = new Map();
    allAuthUsers.forEach(u => {
        if (u.email) {
            authEmailMap.set(u.email.toLowerCase(), u);
            authIdMap.set(u.id, u);
        }
    });

    // 2. Fetch Public Users
    const { data: publicUsers } = await supabaseAdmin.from("users").select("*");
    // 3. Fetch Doctors
    const { data: doctors } = await supabaseAdmin.from("doctors").select("*");
    // 4. Fetch Hospital Members
    const { data: hospitalMembers } = await supabaseAdmin.from("hospital_members").select("*");

    console.log(`[AUDIT] Total Supabase Auth Users: ${allAuthUsers.length}`);
    console.log(`[AUDIT] Total Public Users Rows: ${publicUsers?.length || 0}`);
    console.log(`[AUDIT] Total Doctors Rows: ${doctors?.length || 0}`);
    console.log(`[AUDIT] Total Hospital Members Rows: ${hospitalMembers?.length || 0}`);

    // Audit Categories
    const doctorsWithAuth = [];
    const doctorsWithoutAuth = [];
    const staffWithAuth = [];
    const staffWithoutAuth = [];
    const nonGmailAccounts = [];
    const duplicateEmails = [];

    const seenEmails = new Set();

    // Audit Doctors
    (doctors || []).forEach(doc => {
        const email = (doc.doctor_email || "").trim().toLowerCase();
        if (email) {
            if (seenEmails.has(email)) duplicateEmails.push(email);
            else seenEmails.add(email);

            if (!email.endsWith("@gmail.com")) {
                nonGmailAccounts.push({ type: "doctor", name: doc.doctor_name, email });
            }
        }

        const hasAuth = doc.user_id && authIdMap.has(doc.user_id);
        const hasAuthByEmail = email && authEmailMap.has(email);

        if (hasAuth || hasAuthByEmail) {
            doctorsWithAuth.push({ doc, authUser: hasAuth ? authIdMap.get(doc.user_id) : authEmailMap.get(email) });
        } else {
            doctorsWithoutAuth.push(doc);
        }
    });

    // Audit Staff Members
    const staffMembers = (hospitalMembers || []).filter(m => m.role === "staff");
    staffMembers.forEach(mem => {
        const userRow = (publicUsers || []).find(u => u.id === mem.user_id);
        const email = (userRow?.email || "").trim().toLowerCase();

        if (email) {
            if (!email.endsWith("@gmail.com")) {
                nonGmailAccounts.push({ type: "staff", name: userRow?.full_name || "Staff Member", email });
            }
        }

        const hasAuth = mem.user_id && authIdMap.has(mem.user_id);
        const hasAuthByEmail = email && authEmailMap.has(email);

        if (hasAuth || hasAuthByEmail) {
            staffWithAuth.push({ mem, userRow, authUser: hasAuth ? authIdMap.get(mem.user_id) : authEmailMap.get(email) });
        } else {
            staffWithoutAuth.push({ mem, userRow });
        }
    });

    console.log("\n==================================================");
    console.log("AUDIT SUMMARY:");
    console.log(`- Doctors with Auth User: ${doctorsWithAuth.length}`);
    console.log(`- Doctors WITHOUT Auth User: ${doctorsWithoutAuth.length}`);
    console.log(`- Staff with Auth User: ${staffWithAuth.length}`);
    console.log(`- Staff WITHOUT Auth User: ${staffWithoutAuth.length}`);
    console.log(`- Non-Gmail Accounts Identified: ${nonGmailAccounts.length}`);
    console.log(`- Duplicate Emails Identified: ${duplicateEmails.length}`);
    console.log("==================================================");

    if (nonGmailAccounts.length > 0) {
        console.log("\n[Notice] Existing Non-Gmail Accounts (Preserved as existing accounts):");
        nonGmailAccounts.forEach(acc => console.log(`  - [${acc.type.toUpperCase()}] ${acc.name} (${acc.email})`));
    }

    // 5. Perform Safe Backfill Migration for Missing Auth Users
    console.log("\n==================================================");
    console.log("STARTING SAFE AUTH BACKFILL MIGRATION...");
    console.log("==================================================");

    let backfilledDocsCount = 0;
    let backfilledStaffCount = 0;

    // Backfill Doctors
    for (const doc of doctorsWithoutAuth) {
        const email = (doc.doctor_email || "").trim().toLowerCase();
        if (!email) continue;

        const tempPassword = "Vedika@" + Math.random().toString(36).slice(-8);

        console.log(`Provisioning Auth user for Doctor: ${doc.doctor_name} (${email})...`);
        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
                full_name: doc.doctor_name,
                role: "doctor",
                specialization: doc.doctor_specialization || "General Physician"
            }
        });

        if (authErr) {
            console.error(`  Failed to create Auth user for doctor ${email}:`, authErr.message);
            continue;
        }

        const newAuthId = authUser.user.id;
        console.log(`  ✓ Auth user created with ID: ${newAuthId}`);

        // Link in public.users
        await supabaseAdmin.from("users").upsert({
            id: newAuthId,
            email: email,
            full_name: doc.doctor_name,
            phone: doc.doctor_mobile || null,
            role: "doctor",
            updated_at: new Date().toISOString()
        }, { onConflict: "id" });

        // Link in public.doctors
        await supabaseAdmin.from("doctors").update({ user_id: newAuthId }).eq("doctor_id", doc.doctor_id);

        // Link in public.hospital_members
        await supabaseAdmin.from("hospital_members").update({ user_id: newAuthId }).eq("doctor_id", doc.doctor_id);

        backfilledDocsCount++;
    }

    // Backfill Staff
    for (const item of staffWithoutAuth) {
        const { mem, userRow } = item;
        const email = (userRow?.email || "").trim().toLowerCase();
        const fullName = userRow?.full_name || "Staff Member";
        if (!email) continue;

        const tempPassword = "Vedika@" + Math.random().toString(36).slice(-8);

        console.log(`Provisioning Auth user for Staff: ${fullName} (${email})...`);
        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: "staff",
                staff_role: userRow?.staff_role || "Reception / Front Desk"
            }
        });

        if (authErr) {
            console.error(`  Failed to create Auth user for staff ${email}:`, authErr.message);
            continue;
        }

        const newAuthId = authUser.user.id;
        console.log(`  ✓ Auth user created with ID: ${newAuthId}`);

        // Link in public.users
        await supabaseAdmin.from("users").upsert({
            id: newAuthId,
            email: email,
            full_name: fullName,
            phone: userRow?.phone || null,
            role: "staff",
            staff_role: userRow?.staff_role || "Reception / Front Desk",
            updated_at: new Date().toISOString()
        }, { onConflict: "id" });

        // Link in public.hospital_members
        await supabaseAdmin.from("hospital_members").update({ user_id: newAuthId }).eq("id", mem.id);

        backfilledStaffCount++;
    }

    console.log("\n==================================================");
    console.log(`BACKFILL MIGRATION COMPLETE:`);
    console.log(`- Doctor Auth accounts backfilled: ${backfilledDocsCount}`);
    console.log(`- Staff Auth accounts backfilled: ${backfilledStaffCount}`);
    console.log("==================================================");
}

runAuditAndMigration().catch(err => {
    console.error("Migration error:", err);
    process.exit(1);
});
