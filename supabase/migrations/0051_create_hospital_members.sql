-- =========================================================================
-- MIGRATION 0051: CREATE HOSPITAL_MEMBERS TABLE (TENANT MEMBERSHIPS & RBAC)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.hospital_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL
        REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL,
    doctor_id UUID
        REFERENCES public.doctors ON DELETE RESTRICT,
    role TEXT NOT NULL
        CHECK (role IN ('hospital_admin', 'staff', 'doctor')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('invited', 'active', 'inactive', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_per_hospital UNIQUE (hospital_id, user_id),
    CONSTRAINT check_doctor_role_id CHECK (
        (role = 'doctor' AND doctor_id IS NOT NULL) OR
        (role <> 'doctor' AND doctor_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_hospital_members_user ON public.hospital_members(user_id);
CREATE INDEX IF NOT EXISTS idx_hospital_members_hospital ON public.hospital_members(hospital_id);
