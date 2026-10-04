-- =========================================================================
-- MIGRATION 0050: CREATE HOSPITALS TABLE & SEED PRIMARY LEGACY HOSPITAL
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Primary Legacy Hospital (DV-MAIN)
INSERT INTO public.hospitals (id, name, code)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Doctors Vedika Main Hospital',
    'DV-MAIN'
)
ON CONFLICT (code) DO NOTHING;
