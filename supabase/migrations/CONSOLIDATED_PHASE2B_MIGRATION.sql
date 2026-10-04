BEGIN;

-- ============================================================================
-- DOCTORS VEDIKA PHASE 2B - SAFE REBUILT MIGRATION
-- Built against the supplied existing Doctors Vedika schema.
-- IMPORTANT: run this only after taking a database backup/snapshot.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. BASELINE GUARD
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.patients') IS NULL
     OR to_regclass('public.doctors') IS NULL
     OR to_regclass('public.appointments') IS NULL
     OR to_regclass('public.patient_visits') IS NULL
     OR to_regclass('public.consultation_notes') IS NULL
     OR to_regclass('public.prescriptions') IS NULL
  THEN
    RAISE EXCEPTION 'Required Doctors Vedika baseline tables are missing.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. HOSPITALS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.hospitals (id,name,code,status)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Doctors Vedika Main Hospital',
  'DV-MAIN',
  'active'
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. HOSPITAL MEMBERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hospital_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  doctor_id UUID REFERENCES public.doctors(doctor_id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('hospital_admin','staff','doctor')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited','active','inactive','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_per_hospital UNIQUE (hospital_id,user_id),
  CONSTRAINT check_doctor_role_id CHECK (
    (role = 'doctor' AND doctor_id IS NOT NULL)
    OR
    (role <> 'doctor' AND doctor_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_hospital_members_user
  ON public.hospital_members(user_id);
CREATE INDEX IF NOT EXISTS idx_hospital_members_hospital
  ON public.hospital_members(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_members_doctor
  ON public.hospital_members(hospital_id,doctor_id)
  WHERE doctor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. HOSPITAL PATIENT RECORDS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hospital_patient_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  hospital_patient_code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  date_of_birth DATE,
  gender TEXT,
  blood_group TEXT,
  address TEXT,
  registration_type TEXT NOT NULL DEFAULT 'walk_in'
    CHECK (registration_type IN ('walk_in','registered')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_hospital_patient_code
    UNIQUE (hospital_id,hospital_patient_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hpr_unique_registered_patient
  ON public.hospital_patient_records(hospital_id,patient_id)
  WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hpr_hospital_phone
  ON public.hospital_patient_records(hospital_id,phone);
CREATE INDEX IF NOT EXISTS idx_hpr_hospital_code
  ON public.hospital_patient_records(hospital_id,hospital_patient_code);

-- ---------------------------------------------------------------------------
-- 4. LEGACY EXCEPTIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unmapped_legacy_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','ignored')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unmapped_legacy_status
  ON public.unmapped_legacy_exceptions(status,source_table);

-- ---------------------------------------------------------------------------
-- 5. EXISTING PATIENT_VISITS: EXTEND, DO NOT RECREATE
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS hospital_id UUID
    REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS hospital_patient_id UUID
    REFERENCES public.hospital_patient_records(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS visit_stage TEXT,
  ADD COLUMN IF NOT EXISTS chief_complaints TEXT,
  ADD COLUMN IF NOT EXISTS intake_vitals JSONB,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID;

UPDATE public.patient_visits
SET visit_stage = CASE
  WHEN LOWER(status) = 'completed' THEN 'completed'
  WHEN LOWER(status) = 'cancelled' THEN 'cancelled'
  WHEN LOWER(status) = 'in_progress' THEN 'in_consultation'
  WHEN LOWER(status) = 'doctor_review' THEN 'in_consultation'
  ELSE 'scheduled'
END
WHERE visit_stage IS NULL;

UPDATE public.patient_visits
SET chief_complaints = chief_complaint
WHERE chief_complaints IS NULL
  AND chief_complaint IS NOT NULL;

UPDATE public.patient_visits
SET intake_vitals = '{}'::jsonb
WHERE intake_vitals IS NULL;

UPDATE public.patient_visits
SET hospital_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE hospital_id IS NULL;

-- ---------------------------------------------------------------------------
-- 6. EXTEND EXISTING APPOINTMENTS
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS hospital_id UUID
    REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS hospital_patient_id UUID
    REFERENCES public.hospital_patient_records(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IS NULL OR source IN ('app','walk_in','legacy'));

UPDATE public.appointments
SET hospital_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE hospital_id IS NULL;

UPDATE public.appointments
SET source = 'legacy'
WHERE source IS NULL;

-- ---------------------------------------------------------------------------
-- 7. EXTEND EXISTING CLINICAL OUTPUTS
-- ---------------------------------------------------------------------------
ALTER TABLE public.consultation_notes
  ADD COLUMN IF NOT EXISTS visit_id UUID
    REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hospital_id UUID
    REFERENCES public.hospitals(id) ON DELETE RESTRICT;

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS visit_id UUID
    REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hospital_id UUID
    REFERENCES public.hospitals(id) ON DELETE RESTRICT;

UPDATE public.consultation_notes
SET hospital_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE hospital_id IS NULL;

UPDATE public.prescriptions
SET hospital_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE hospital_id IS NULL;

-- ---------------------------------------------------------------------------
-- 8. LEGACY DOCTORS -> MAIN HOSPITAL MEMBERS
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 9. LEGACY REGISTERED PATIENTS -> ONE HPR PER HOSPITAL
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 10. LINK APPOINTMENTS TO HPRs
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 11. LINK EXISTING VISITS TO HPRs
-- ---------------------------------------------------------------------------
UPDATE public.patient_visits pv
SET hospital_patient_id = h.id
FROM public.hospital_patient_records h
WHERE pv.hospital_patient_id IS NULL
  AND h.hospital_id = pv.hospital_id
  AND h.patient_id = pv.patient_id;

-- ---------------------------------------------------------------------------
-- 12. CREATE MISSING VISITS FOR APPOINTMENTS
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 13. LINK CLINICAL NOTES / PRESCRIPTIONS TO VISITS
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 14. VALIDATE BEFORE ADDING UNIQUE APPOINTMENT-VISIT INDEX
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT appointment_id
    FROM public.patient_visits
    WHERE appointment_id IS NOT NULL
    GROUP BY appointment_id
    HAVING COUNT(*) > 1
  ) d;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Migration stopped: % appointment(s) have multiple patient_visits. Existing clinical data was not changed to resolve this ambiguity.',
      duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_visits_unique_appointment
  ON public.patient_visits(appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_visits_stage
  ON public.patient_visits(hospital_id,visit_stage);
CREATE INDEX IF NOT EXISTS idx_patient_visits_doctor_stage
  ON public.patient_visits(hospital_id,doctor_id,visit_stage);
CREATE INDEX IF NOT EXISTS idx_appointments_hospital
  ON public.appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_patient
  ON public.appointments(hospital_id,hospital_patient_id);

-- ---------------------------------------------------------------------------
-- 15. AUDIT LOGS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_hospital_created
  ON public.audit_logs(hospital_id,created_at DESC);

-- ---------------------------------------------------------------------------
-- 16. SECURITY HELPER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_hospital_member(
  p_hospital_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public,pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hospital_members hm
    WHERE hm.hospital_id = p_hospital_id
      AND hm.user_id = p_user_id
      AND hm.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_hospital_member(UUID,UUID)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_active_hospital_member(UUID,UUID)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 17. ATOMIC QUEUE TRANSITION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_visit_stage_hardened(
  p_visit_id UUID,
  p_expected_stage TEXT,
  p_target_stage TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public,pg_temp
AS $$
DECLARE
  v_caller_user_id UUID := auth.uid();
  v_hospital_id UUID;
  v_doctor_id UUID;
  v_current_stage TEXT;
  v_authorized BOOLEAN := FALSE;
  v_affected INTEGER := 0;
BEGIN
  IF v_caller_user_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','Unauthenticated request');
  END IF;

  SELECT hospital_id,doctor_id,visit_stage
  INTO v_hospital_id,v_doctor_id,v_current_stage
  FROM public.patient_visits
  WHERE id = p_visit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','Visit encounter not found');
  END IF;

  IF v_current_stage <> p_expected_stage THEN
    RETURN jsonb_build_object(
      'success',false,
      'error','Stage conflict: visit is currently ' || v_current_stage
    );
  END IF;

  IF NOT (
    (p_expected_stage = 'scheduled' AND p_target_stage IN ('checked_in','cancelled')) OR
    (p_expected_stage = 'checked_in' AND p_target_stage IN ('waiting','cancelled')) OR
    (p_expected_stage = 'waiting' AND p_target_stage IN ('in_consultation','cancelled')) OR
    (p_expected_stage = 'in_consultation' AND p_target_stage IN ('completed','cancelled'))
  ) THEN
    RETURN jsonb_build_object('success',false,'error','Illegal state transition');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.hospital_members hm
    WHERE hm.user_id = v_caller_user_id
      AND hm.hospital_id = v_hospital_id
      AND hm.status = 'active'
      AND (
        hm.role IN ('hospital_admin','staff')
        OR (hm.role = 'doctor' AND hm.doctor_id = v_doctor_id)
      )
  )
  INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('success',false,'error','Access denied');
  END IF;

  UPDATE public.patient_visits
  SET
    visit_stage = p_target_stage,
    status = CASE
      WHEN p_target_stage = 'completed' THEN 'completed'
      WHEN p_target_stage = 'cancelled' THEN 'cancelled'
      WHEN p_target_stage = 'in_consultation' THEN 'in_progress'
      ELSE status
    END,
    checked_in_at = CASE
      WHEN p_target_stage = 'checked_in' THEN COALESCE(checked_in_at,NOW())
      ELSE checked_in_at
    END,
    consultation_started_at = CASE
      WHEN p_target_stage = 'in_consultation' THEN COALESCE(consultation_started_at,NOW())
      ELSE consultation_started_at
    END,
    consultation_completed_at = CASE
      WHEN p_target_stage = 'completed' THEN COALESCE(consultation_completed_at,NOW())
      ELSE consultation_completed_at
    END,
    completed_at = CASE
      WHEN p_target_stage = 'completed' THEN COALESCE(completed_at,NOW())
      ELSE completed_at
    END,
    started_at = CASE
      WHEN p_target_stage = 'in_consultation' THEN COALESCE(started_at,NOW())
      ELSE started_at
    END,
    updated_at = NOW()
  WHERE id = p_visit_id
    AND visit_stage = p_expected_stage;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected = 1 THEN
    RETURN jsonb_build_object(
      'success',true,
      'visit_id',p_visit_id,
      'new_stage',p_target_stage
    );
  END IF;

  RETURN jsonb_build_object('success',false,'error','Concurrent transition conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.transition_visit_stage_hardened(UUID,TEXT,TEXT)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_visit_stage_hardened(UUID,TEXT,TEXT)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 18. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_patient_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "User hospital membership read" ON public.hospital_members;
DROP POLICY IF EXISTS "Tenant isolation hospital_patient_records" ON public.hospital_patient_records;
DROP POLICY IF EXISTS "Tenant isolation patient_visits" ON public.patient_visits;
DROP POLICY IF EXISTS "Tenant isolation appointments" ON public.appointments;
DROP POLICY IF EXISTS "Tenant isolation consultation_notes" ON public.consultation_notes;
DROP POLICY IF EXISTS "Tenant isolation prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Audit insert policy" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit select policy" ON public.audit_logs;

CREATE POLICY "Tenant isolation hospitals"
ON public.hospitals
FOR SELECT
USING (public.is_active_hospital_member(id));

CREATE POLICY "User hospital membership read"
ON public.hospital_members
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Tenant isolation hospital_patient_records"
ON public.hospital_patient_records
FOR ALL
USING (public.is_active_hospital_member(hospital_id))
WITH CHECK (public.is_active_hospital_member(hospital_id));

CREATE POLICY "Tenant isolation patient_visits"
ON public.patient_visits
FOR ALL
USING (public.is_active_hospital_member(hospital_id))
WITH CHECK (public.is_active_hospital_member(hospital_id));

CREATE POLICY "Tenant isolation appointments"
ON public.appointments
FOR ALL
USING (public.is_active_hospital_member(hospital_id))
WITH CHECK (public.is_active_hospital_member(hospital_id));

CREATE POLICY "Tenant isolation consultation_notes"
ON public.consultation_notes
FOR ALL
USING (public.is_active_hospital_member(hospital_id))
WITH CHECK (public.is_active_hospital_member(hospital_id));

CREATE POLICY "Tenant isolation prescriptions"
ON public.prescriptions
FOR ALL
USING (public.is_active_hospital_member(hospital_id))
WITH CHECK (public.is_active_hospital_member(hospital_id));

CREATE POLICY "Audit insert policy"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  actor_user_id = auth.uid()
  AND public.is_active_hospital_member(hospital_id,auth.uid())
);

CREATE POLICY "Audit select policy"
ON public.audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.hospital_members hm
    WHERE hm.user_id = auth.uid()
      AND hm.hospital_id = audit_logs.hospital_id
      AND hm.status = 'active'
      AND hm.role = 'hospital_admin'
  )
);

-- ---------------------------------------------------------------------------
-- 19. FINAL IN-TRANSACTION VALIDATION
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad_hpr INTEGER;
  bad_visits INTEGER;
  duplicate_hpr INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_hpr
  FROM public.hospital_patient_records h
  WHERE h.hospital_id IS NULL
     OR h.hospital_patient_code IS NULL;

  IF bad_hpr > 0 THEN
    RAISE EXCEPTION 'Validation failed: % hospital patient records are invalid.',bad_hpr;
  END IF;

  SELECT COUNT(*) INTO bad_visits
  FROM public.patient_visits v
  WHERE v.hospital_id IS NULL
     OR v.hospital_patient_id IS NULL
     OR v.visit_stage IS NULL;

  IF bad_visits > 0 THEN
    RAISE EXCEPTION 'Validation failed: % patient visits remain without hospital/HPR/stage.',bad_visits;
  END IF;

  SELECT COUNT(*) INTO duplicate_hpr
  FROM (
    SELECT hospital_id,patient_id
    FROM public.hospital_patient_records
    WHERE patient_id IS NOT NULL
    GROUP BY hospital_id,patient_id
    HAVING COUNT(*) > 1
  ) d;

  IF duplicate_hpr > 0 THEN
    RAISE EXCEPTION 'Validation failed: % duplicate registered HPR mappings remain.',duplicate_hpr;
  END IF;
END $$;

COMMIT;
