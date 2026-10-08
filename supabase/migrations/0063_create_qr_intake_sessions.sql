-- ============================================================
-- 0063 — CREATE QR INTAKE SESSIONS
-- DoctorsVedika
--
-- Purpose:
-- Creates the temporary patient-side intake session used by
-- the Hospital QR → Patient Details → Clinical Chatbot flow.
--
-- IMPORTANT:
-- This does NOT create a patient_visit.
-- Existing Staff Walk-in / Appointment / Patient Visit flow
-- remains unchanged.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.qr_intake_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Random token used by the public QR intake flow.
    -- Do not expose the sequential/database identity of the session.
    access_token UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Hospital associated with the QR code.
    hospital_id UUID NOT NULL
        REFERENCES public.hospitals(id)
        ON DELETE RESTRICT,

    -- These remain NULL until Staff processes the intake.
    hospital_patient_id UUID NULL
        REFERENCES public.hospital_patient_records(id)
        ON DELETE SET NULL,

    patient_visit_id UUID NULL
        REFERENCES public.patient_visits(id)
        ON DELETE SET NULL,

    -- --------------------------------------------------------
    -- Patient information collected through the QR form
    -- --------------------------------------------------------

    first_name TEXT,
    last_name TEXT,
    full_name TEXT NOT NULL,

    phone TEXT NOT NULL,
    email TEXT,

    date_of_birth DATE NOT NULL,

    gender TEXT,

    -- --------------------------------------------------------
    -- QR Intake lifecycle
    -- --------------------------------------------------------

    status TEXT NOT NULL DEFAULT 'collecting'
        CHECK (
            status IN (
                'collecting',
                'review',
                'submitted',
                'safety_blocked',
                'converted',
                'expired',
                'cancelled'
            )
        ),

    -- --------------------------------------------------------
    -- Structured clinical chatbot output
    --
    -- This is the clinical source of truth.
    -- Raw conversation history is intentionally NOT stored here.
    -- --------------------------------------------------------

    clinical_intake JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Deterministic safety evaluation result.
    safety_status TEXT
        CHECK (
            safety_status IS NULL
            OR safety_status IN (
                'unknown',
                'safe',
                'caution',
                'critical'
            )
        ),

    safety_result JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- --------------------------------------------------------
    -- AI processing consent
    -- Used if an AI/LLM fallback processes patient-entered text.
    -- --------------------------------------------------------

    ai_processing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    ai_processing_consented_at TIMESTAMPTZ,

    -- --------------------------------------------------------
    -- Lifecycle timestamps
    -- --------------------------------------------------------

    submitted_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT qr_intake_sessions_access_token_unique
        UNIQUE (access_token)
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_qr_intake_sessions_hospital
    ON public.qr_intake_sessions (hospital_id);

CREATE INDEX IF NOT EXISTS idx_qr_intake_sessions_hospital_status
    ON public.qr_intake_sessions (hospital_id, status);

CREATE INDEX IF NOT EXISTS idx_qr_intake_sessions_access_token
    ON public.qr_intake_sessions (access_token);

CREATE INDEX IF NOT EXISTS idx_qr_intake_sessions_patient
    ON public.qr_intake_sessions (hospital_patient_id);

CREATE INDEX IF NOT EXISTS idx_qr_intake_sessions_visit
    ON public.qr_intake_sessions (patient_visit_id);

CREATE INDEX IF NOT EXISTS idx_qr_intake_sessions_created_at
    ON public.qr_intake_sessions (created_at DESC);


-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
--
-- Use a dedicated function name so we do not interfere with
-- existing application triggers/functions.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_qr_intake_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_qr_intake_sessions_updated_at
ON public.qr_intake_sessions;

CREATE TRIGGER trg_qr_intake_sessions_updated_at
BEFORE UPDATE ON public.qr_intake_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_qr_intake_sessions_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY
--
-- Public QR users must NOT access this table directly through
-- the Supabase anon client.
--
-- The application backend will use the service-role client
-- for controlled QR intake operations.
-- ============================================================

ALTER TABLE public.qr_intake_sessions ENABLE ROW LEVEL SECURITY;

-- No public/anon SELECT, INSERT, UPDATE or DELETE policies.
--
-- Backend service-role operations bypass RLS.
--
-- This prevents anonymous QR users from directly querying
-- hospital intake records through Supabase.