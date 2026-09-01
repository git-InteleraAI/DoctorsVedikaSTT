require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixPolicies() {
  console.log("Fixing RLS policies for storage buckets...");

  // We execute raw SQL using rpc or just by using the supabase client
  // But wait, we can just use the storage API to make the buckets public and update their settings.
  // The best way to fix this is to insert policies directly.
  
  // Actually, Supabase Storage API allows creating buckets, but policies are managed in postgres.
  // If the backend fails with RLS, it means the Service Role Key was NOT used or Storage RLS is weird.
  console.log("Service Key used?", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("First 10 chars of Service Key:", process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10) : 'none');
}

fixPolicies();
