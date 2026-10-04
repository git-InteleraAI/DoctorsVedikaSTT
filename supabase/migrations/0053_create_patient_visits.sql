-- =========================================================================
-- MIGRATION 0053: CREATE / EXTEND PATIENT_VISITS TABLE (QUEUE & ENCOUNTER TRUTH)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.patient_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL
        REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    hospital_patient_id UUID NOT NULL
        REFERENCES public.hospital_patient_records(id) ON DELETE RESTRICT,
    appointment_id UUID
        REFERENCES public.appointments ON DELETE SET NULL,
    doctor_id UUID NOT NULL
        REFERENCES public.doctors ON DELETE RESTRICT,
    visit_stage TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (
            visit_stage IN (
                'scheduled',
                'checked_in',
                'waiting',
                'in_consultation',
                'completed',
                'cancelled'
            )
        ),
    chief_complaints TEXT,
    intake_vitals JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_in_at TIMESTAMPTZ,
    consultation_started_at TIMESTAMPTZ,
    consultation_completed_at TIMESTAMPTZ,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely extend columns if patient_visits already exists in baseline
ALTER TABLE public.patient_visits
    ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS hospital_patient_id UUID REFERENCES public.hospital_patient_records(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS visit_stage TEXT DEFAULT 'scheduled',
    ADD COLUMN IF NOT EXISTS chief_complaints TEXT,
    ADD COLUMN IF NOT EXISTS intake_vitals JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS consultation_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_visits_unique_appointment
ON public.patient_visits(appointment_id)
WHERE appointment_id IS NOT NULL;
