-- =========================================================================
-- MIGRATION 0054: EXTEND EXISTING CLINICAL TABLES WITH NULLABLE TENANT KEYS
-- =========================================================================

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS hospital_id UUID
        REFERENCES public.hospitals(id) ON DELETE RESTRICT;

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS hospital_patient_id UUID
        REFERENCES public.hospital_patient_records(id) ON DELETE RESTRICT;

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL
        CHECK (source IN ('app', 'walk_in', 'legacy'));

ALTER TABLE public.consultation_notes
    ADD COLUMN IF NOT EXISTS visit_id UUID
        REFERENCES public.patient_visits(id) ON DELETE SET NULL;

ALTER TABLE public.consultation_notes
    ADD COLUMN IF NOT EXISTS hospital_id UUID
        REFERENCES public.hospitals(id) ON DELETE RESTRICT;

ALTER TABLE public.prescriptions
    ADD COLUMN IF NOT EXISTS visit_id UUID
        REFERENCES public.patient_visits(id) ON DELETE SET NULL;

ALTER TABLE public.prescriptions
    ADD COLUMN IF NOT EXISTS hospital_id UUID
        REFERENCES public.hospitals(id) ON DELETE RESTRICT;
