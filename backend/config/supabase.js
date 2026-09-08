const { createClient } = require("@supabase/supabase-js");
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "../.env"),
});

const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";

const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    "";

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";

let supabase = null;
let supabaseAdmin = null;
let isSupabaseConfigured = false;

if (!SUPABASE_URL) {
    console.error(
        "[Supabase] SUPABASE_URL is missing."
    );
} else {
    try {
        /*
         * Regular client.
         * Used for validating the OAuth access token.
         */
        if (
            SUPABASE_ANON_KEY ||
            SUPABASE_SERVICE_ROLE_KEY
        ) {
            supabase = createClient(
                SUPABASE_URL,
                SUPABASE_ANON_KEY ||
                SUPABASE_SERVICE_ROLE_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false,
                    },
                }
            );
        }

        /*
         * Admin client.
         *
         * IMPORTANT:
         * This must use SERVICE_ROLE_KEY.
         */
        if (SUPABASE_SERVICE_ROLE_KEY) {
            supabaseAdmin =
                createClient(
                    SUPABASE_URL,
                    SUPABASE_SERVICE_ROLE_KEY,
                    {
                        auth: {
                            persistSession: false,
                            autoRefreshToken: false,
                            detectSessionInUrl: false,
                        },
                    }
                );

            console.log(
                "[Supabase] SERVICE_ROLE client initialized successfully."
            );
        } else {
            console.error(
                "[Supabase] SUPABASE_SERVICE_ROLE_KEY is missing."
            );

            /*
             * Do NOT silently use the anon key as the admin client.
             * Doctor provisioning requires server-side privileges.
             */
            supabaseAdmin = null;
        }

        isSupabaseConfigured =
            Boolean(supabase);

        console.log(
            "[Supabase] Authentication client configured:",
            isSupabaseConfigured
        );
    } catch (error) {
        console.error(
            "[Supabase] Initialization failed:",
            error
        );

        supabase = null;
        supabaseAdmin = null;
        isSupabaseConfigured = false;
    }
}

module.exports = {
    supabase,
    supabaseAdmin,
    isSupabaseConfigured,
};