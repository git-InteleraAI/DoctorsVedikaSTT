-- =========================================================================
-- MIGRATION 0055: LEGACY DATA CLASSIFICATION & DETERMINISTIC BACKFILL
-- =========================================================================

-- 1. LEGACY DOCTORS -> MAIN HOSPITAL MEMBERS
INSERT INTO public.hospital_members
  (hospital_id,user_id,doctor_id,role,status)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  d.user_id,
  d.doctor_id,
  'doctor',
  CASE WHEN d.doctor_is_active IS FALSE THEN 'inactive' ELSE 'active' END
FROM public.doctors d
WHERE d.user_id IS NOT NULL
ON CONFLICT (hospital_id,user_id)
DO UPDATE SET
  doctor_id = EXCLUDED.doctor_id,
  role = 'doctor',
  status = EXCLUDED.status,
  updated_at = NOW();

-- 2. EXTEND APPOINTMENTS TO LEGACY HOSPITAL
UPDATE public.appointments
SET hospital_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE hospital_id IS NULL;

UPDATE public.appointments
SET source = 'legacy'
WHERE source IS NULL;

-- 3. LEGACY REGISTERED PATIENTS -> ONE HPR PER HOSPITAL
WITH resolved AS (
  SELECT
    a.id AS appointment_id,
    a.hospital_id,
    CASE
      WHEN p_by_id.id IS NOT NULL AND p_by_user.id IS NULL THEN p_by_id.id
      WHEN p_by_id.id IS NULL AND p_by_user.id IS NOT NULL THEN p_by_user.id
      WHEN p_by_id.id IS NOT NULL
       AND p_by_user.id IS NOT NULL
       AND p_by_id.id = p_by_user.id THEN p_by_id.id
      ELSE NULL
    END AS patient_id
  FROM public.appointments a
  LEFT JOIN public.patients p_by_id
    ON p_by_id.id = a.patient_id
  LEFT JOIN public.patients p_by_user
    ON p_by_user.user_id = a.patient_id
),
unique_patients AS (
  SELECT DISTINCT hospital_id,patient_id
  FROM resolved
  WHERE patient_id IS NOT NULL
)
INSERT INTO public.hospital_patient_records (
  hospital_id,
  patient_id,
  hospital_patient_code,
  first_name,
  last_name,
  full_name,
  phone,
  email,
  date_of_birth,
  gender,
  blood_group,
  address,
  registration_type,
  status
)
SELECT
  up.hospital_id,
  p.id,
  'DV-P-' || UPPER(SUBSTRING(MD5(up.hospital_id::text || ':' || p.id::text) FROM 1 FOR 10)),
  COALESCE(p.first_name,'Unknown'),
  p.last_name,
  COALESCE(NULLIF(p.full_name,''),NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')),''),'Unknown'),
  p.phone,
  p.email,
  p.date_of_birth,
  p.gender::text,
  p.blood_group,
  p.address,
  'registered',
  'active'
FROM unique_patients up
JOIN public.patients p ON p.id = up.patient_id
ON CONFLICT (hospital_id,patient_id) WHERE patient_id IS NOT NULL
DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  full_name = EXCLUDED.full_name,
  phone = COALESCE(EXCLUDED.phone,public.hospital_patient_records.phone),
  email = COALESCE(EXCLUDED.email,public.hospital_patient_records.email),
  date_of_birth = COALESCE(EXCLUDED.date_of_birth,public.hospital_patient_records.date_of_birth),
  gender = COALESCE(EXCLUDED.gender,public.hospital_patient_records.gender),
  blood_group = COALESCE(EXCLUDED.blood_group,public.hospital_patient_records.blood_group),
  address = COALESCE(EXCLUDED.address,public.hospital_patient_records.address),
  updated_at = NOW();

INSERT INTO public.hospital_patient_records (
  hospital_id,
  patient_id,
  hospital_patient_code,
  first_name,
  last_name,
  full_name,
  phone,
  email,
  date_of_birth,
  gender,
  blood_group,
  address,
  registration_type,
  status
)
SELECT DISTINCT
  pv.hospital_id,
  p.id,
  'DV-P-' || UPPER(SUBSTRING(MD5(pv.hospital_id::text || ':' || p.id::text) FROM 1 FOR 10)),
  COALESCE(p.first_name,'Unknown'),
  p.last_name,
  COALESCE(NULLIF(p.full_name,''),NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')),''),'Unknown'),
  p.phone,
  p.email,
  p.date_of_birth,
  p.gender::text,
  p.blood_group,
  p.address,
  'registered',
  'active'
FROM public.patient_visits pv
JOIN public.patients p ON p.id = pv.patient_id
WHERE pv.hospital_id IS NOT NULL
ON CONFLICT (hospital_id,patient_id) WHERE patient_id IS NOT NULL DO NOTHING;

-- 4. LINK APPOINTMENTS TO HPRs & LOG UNMAPPED EXCEPTIONS
UPDATE public.appointments a
SET hospital_patient_id = h.id
FROM public.hospital_patient_records h
JOIN public.patients p ON p.id = h.patient_id
WHERE a.hospital_patient_id IS NULL
  AND h.hospital_id = a.hospital_id
  AND (p.id = a.patient_id OR p.user_id = a.patient_id);

INSERT INTO public.unmapped_legacy_exceptions
  (source_table,source_id,reason,raw_data)
SELECT
  'appointments',
  a.id::text,
  CASE
    WHEN a.patient_id IS NULL THEN 'Appointment has no patient identity'
    ELSE 'No unambiguous hospital patient record could be mapped'
  END,
  jsonb_build_object(
    'appointment_id',a.id,
    'patient_id',a.patient_id,
    'hospital_id',a.hospital_id
  )
FROM public.appointments a
WHERE a.hospital_id IS NOT NULL
  AND a.hospital_patient_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.unmapped_legacy_exceptions e
    WHERE e.source_table = 'appointments'
      AND e.source_id = a.id::text
      AND e.status = 'open'
  );

-- 5. LINK EXISTING VISITS TO HPRs
UPDATE public.patient_visits pv
SET hospital_patient_id = h.id
FROM public.hospital_patient_records h
WHERE pv.hospital_patient_id IS NULL
  AND h.hospital_id = pv.hospital_id
  AND h.patient_id = pv.patient_id;

-- 6. CREATE MISSING VISITS FOR APPOINTMENTS (PRESERVING EXISTING ENCOUNTERS)
INSERT INTO public.patient_visits (
  patient_id,
  doctor_id,
  appointment_id,
  visit_type,
  status,
  visit_date,
  hospital_id,
  hospital_patient_id,
  visit_stage,
  chief_complaints,
  created_at,
  updated_at
)
SELECT
  COALESCE(p.id,pv_existing.patient_id),
  a.doctor_id,
  a.id,
  'online',
  CASE
    WHEN LOWER(a.status) = 'completed' THEN 'completed'
    WHEN LOWER(a.status) = 'cancelled' THEN 'cancelled'
    ELSE 'scheduled'
  END,
  a.appointment_date,
  a.hospital_id,
  a.hospital_patient_id,
  CASE
    WHEN LOWER(a.status) = 'completed' THEN 'completed'
    WHEN LOWER(a.status) = 'cancelled' THEN 'cancelled'
    ELSE 'scheduled'
  END,
  a.reason,
  a.created_at,
  a.updated_at
FROM public.appointments a
LEFT JOIN public.patients p
  ON p.id = a.patient_id OR p.user_id = a.patient_id
LEFT JOIN LATERAL (
  SELECT v.patient_id
  FROM public.patient_visits v
  WHERE v.appointment_id = a.id
  LIMIT 1
) pv_existing ON TRUE
WHERE a.hospital_id IS NOT NULL
  AND a.hospital_patient_id IS NOT NULL
  AND a.doctor_id IS NOT NULL
  AND p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.patient_visits v
    WHERE v.appointment_id = a.id
  );

-- 7. LINK CLINICAL NOTES / PRESCRIPTIONS TO VISITS
UPDATE public.consultation_notes cn
SET
  visit_id = pv.id,
  hospital_id = pv.hospital_id
FROM public.patient_visits pv
WHERE cn.visit_id IS NULL
  AND cn.appointment_id = pv.appointment_id;

UPDATE public.prescriptions pr
SET
  visit_id = pv.id,
  hospital_id = pv.hospital_id
FROM public.patient_visits pv
WHERE pr.visit_id IS NULL
  AND pr.appointment_id = pv.appointment_id;
