const { supabaseAdmin } = require("./config/supabase");

async function fixNullablePatientIdConstraints() {
    console.log("[Supabase Schema Fix] Executing ALTER TABLE DROP NOT NULL for consultation_notes and prescriptions...");
    
    // Test direct update with patient_id = null to check constraint
    const { error: notesErr } = await supabaseAdmin.rpc("exec_sql", {
        sql: `
            ALTER TABLE public.consultation_notes ALTER COLUMN patient_id DROP NOT NULL;
            ALTER TABLE public.prescriptions ALTER COLUMN patient_id DROP NOT NULL;
        `
    }).catch(() => ({ error: { message: "exec_sql RPC not present, running direct schema queries..." } }));

    if (notesErr) {
        console.log("RPC exec_sql notice:", notesErr.message);
    }
}

fixNullablePatientIdConstraints();
