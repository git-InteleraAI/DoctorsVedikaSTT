-- =========================================================================
-- MIGRATION 0052: CREATE HOSPITAL_PATIENT_RECORDS & UNMAPPED_LEGACY_EXCEPTIONS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.hospital_patient_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL
        REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    patient_id UUID,
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
        CHECK (registration_type IN ('walk_in', 'registered')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_hospital_patient_code UNIQUE (hospital_id, hospital_patient_code)
);

CREATE TABLE IF NOT EXISTS public.unmapped_legacy_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved', 'ignored')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
