-- =========================================================================
-- MIGRATION 0059: PERFORMANCE INDEXES & SECURITY HELPER FUNCTIONS
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_hpr_hospital_phone
ON public.hospital_patient_records(hospital_id, phone);

CREATE INDEX IF NOT EXISTS idx_hpr_hospital_code
ON public.hospital_patient_records(hospital_id, hospital_patient_code);

CREATE INDEX IF NOT EXISTS idx_patient_visits_stage
ON public.patient_visits(hospital_id, visit_stage);

CREATE INDEX IF NOT EXISTS idx_patient_visits_doctor
ON public.patient_visits(hospital_id, doctor_id, visit_stage);

CREATE INDEX IF NOT EXISTS idx_appointments_hospital
ON public.appointments(hospital_id);

CREATE INDEX IF NOT EXISTS idx_appointments_hospital_patient
ON public.appointments(hospital_id, hospital_patient_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_hospital_created
ON public.audit_logs(hospital_id, created_at DESC);

-- SECURITY HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.is_active_hospital_member(
    p_hospital_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.hospital_members hm
        WHERE hm.hospital_id = p_hospital_id
          AND hm.user_id = p_user_id
          AND hm.status = 'active'
    );
$$;

REVOKE ALL
ON FUNCTION public.is_active_hospital_member(UUID, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.is_active_hospital_member(UUID, UUID)
TO authenticated, service_role;
