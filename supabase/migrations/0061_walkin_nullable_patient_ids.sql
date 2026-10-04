-- =========================================================================
-- MIGRATION 0061: MAKE PATIENT_ID NULLABLE FOR TEMPORARY WALK-IN PATIENTS
-- =========================================================================

BEGIN;

-- 1. Drop NOT NULL on appointments.patient_id
ALTER TABLE public.appointments
    ALTER COLUMN patient_id DROP NOT NULL;

-- 2. Drop NOT NULL on patient_visits.patient_id
ALTER TABLE public.patient_visits
    ALTER COLUMN patient_id DROP NOT NULL;

-- 3. Drop NOT NULL on consultation_notes.patient_id
ALTER TABLE public.consultation_notes
    ALTER COLUMN patient_id DROP NOT NULL;

-- 4. Drop NOT NULL on prescriptions.patient_id
ALTER TABLE public.prescriptions
    ALTER COLUMN patient_id DROP NOT NULL;

-- 5. Add index on hospital_patient_id for fast patient history lookup
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_patient_id
    ON public.appointments(hospital_patient_id)
    WHERE hospital_patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_visits_hospital_patient_id
    ON public.patient_visits(hospital_patient_id)
    WHERE hospital_patient_id IS NOT NULL;

COMMIT;
