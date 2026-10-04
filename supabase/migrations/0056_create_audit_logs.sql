-- =========================================================================
-- MIGRATION 0056: CREATE AUDIT LOGS TABLE & HARDENED RLS POLICIES
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL
        REFERENCES public.hospitals(id) ON DELETE RESTRICT,
    actor_user_id UUID NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit insert policy" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit select policy" ON public.audit_logs;

CREATE POLICY "Audit insert policy"
ON public.audit_logs
FOR INSERT
WITH CHECK (
    actor_user_id = auth.uid()
    AND public.is_active_hospital_member(hospital_id, auth.uid())
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

REVOKE UPDATE, DELETE, TRUNCATE
ON public.audit_logs
FROM PUBLIC, anon, authenticated;
