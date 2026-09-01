require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupBuckets() {
  console.log("Setting up buckets...");

  const bucketsToCreate = ["doctor-profile-photos", "doctor-documents"];

  for (const bucket of bucketsToCreate) {
    const { data: existingBucket } = await supabase.storage.getBucket(bucket);
    if (!existingBucket) {
      console.log(`Creating bucket: ${bucket}`);
      const { data, error } = await supabase.storage.createBucket(bucket, {
        public: true, // we'll make them public for easy access
        fileSizeLimit: 10485760, // 10MB
      });
      if (error) {
        console.error(`Error creating ${bucket}:`, error.message);
      } else {
        console.log(`Successfully created ${bucket}`);
      }
    } else {
      console.log(`Bucket ${bucket} already exists.`);
    }
  }

  console.log("Bucket setup complete.");
}

setupBuckets();
