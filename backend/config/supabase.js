const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || "";

let supabase = null;
let isSupabaseConfigured = false;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });
        isSupabaseConfigured = true;
        console.log("[Supabase] Connected successfully with Key type:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SERVICE_ROLE (RLS Bypass Active)" : "ANON_KEY");
    } catch (err) {
        console.error("[Supabase] Failed to initialize client:", err.message);
    }
} else {
    console.warn(
        "[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured in backend/.env."
    );
}

module.exports = {
    supabase,
    isSupabaseConfigured,
};
