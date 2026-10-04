-- =========================================================================
-- MIGRATION 0062: ADD EXITED_AT AND SUPPORT EXITED VISIT STAGE
-- =========================================================================

-- 1. Add exited_at column to patient_visits
ALTER TABLE public.patient_visits
    ADD COLUMN IF NOT EXISTS exited_at TIMESTAMPTZ;

-- 2. Safely update check constraint on visit_stage to include 'exited'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'patient_visits_visit_stage_check'
    ) THEN
        ALTER TABLE public.patient_visits DROP CONSTRAINT patient_visits_visit_stage_check;
    END IF;
END $$;

ALTER TABLE public.patient_visits
    ADD CONSTRAINT patient_visits_visit_stage_check
    CHECK (
        visit_stage IN (
            'scheduled',
            'checked_in',
            'waiting',
            'in_consultation',
            'completed',
            'exited',
            'cancelled'
        )
    );
