-- =========================================================================
-- MIGRATION 0060: ENABLE ROW LEVEL SECURITY & TENANT ISOLATION POLICIES
-- =========================================================================

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_patient_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "User hospital membership read" ON public.hospital_members;
DROP POLICY IF EXISTS "Tenant isolation hospital_patient_records" ON public.hospital_patient_records;
DROP POLICY IF EXISTS "Tenant isolation patient_visits" ON public.patient_visits;
DROP POLICY IF EXISTS "Tenant isolation appointments" ON public.appointments;
DROP POLICY IF EXISTS "Tenant isolation consultation_notes" ON public.consultation_notes;
DROP POLICY IF EXISTS "Tenant isolation prescriptions" ON public.prescriptions;

CREATE POLICY "Tenant isolation hospitals"
ON public.hospitals
FOR SELECT
USING (
    public.is_active_hospital_member(id)
);

CREATE POLICY "User hospital membership read"
ON public.hospital_members
FOR SELECT
USING (
    user_id = auth.uid()
);

CREATE POLICY "Tenant isolation hospital_patient_records"
ON public.hospital_patient_records
FOR ALL
USING (
    public.is_active_hospital_member(hospital_id)
)
WITH CHECK (
    public.is_active_hospital_member(hospital_id)
);

CREATE POLICY "Tenant isolation patient_visits"
ON public.patient_visits
FOR ALL
USING (
    public.is_active_hospital_member(hospital_id)
)
WITH CHECK (
    public.is_active_hospital_member(hospital_id)
);

CREATE POLICY "Tenant isolation appointments"
ON public.appointments
FOR ALL
USING (
    public.is_active_hospital_member(hospital_id)
)
WITH CHECK (
    public.is_active_hospital_member(hospital_id)
);

CREATE POLICY "Tenant isolation consultation_notes"
ON public.consultation_notes
FOR ALL
USING (
    public.is_active_hospital_member(hospital_id)
)
WITH CHECK (
    public.is_active_hospital_member(hospital_id)
);

CREATE POLICY "Tenant isolation prescriptions"
ON public.prescriptions
FOR ALL
USING (
    public.is_active_hospital_member(hospital_id)
)
WITH CHECK (
    public.is_active_hospital_member(hospital_id)
);
