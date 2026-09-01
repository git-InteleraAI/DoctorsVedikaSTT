require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function resetOnboarding() {
  const email = "jakkiharshini@gmail.com";
  console.log(`Resetting onboarding_completed to false for ${email}...`);
  const { data, error } = await supabase
    .from("doctors")
    .update({ onboarding_completed: false })
    .eq("doctor_email", email);

  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("Successfully reset onboarding status in Supabase!");
  }
}

resetOnboarding();
