-- =========================================================================
-- MIGRATION 0058: COMPREHENSIVE DATA INTEGRITY VALIDATION BLOCK
-- =========================================================================

DO $$
DECLARE
    v_count BIGINT;
BEGIN

    SELECT COUNT(*) INTO v_count
    FROM public.appointments a
    LEFT JOIN public.hospital_patient_records hpr
      ON hpr.id = a.hospital_patient_id
    WHERE a.hospital_id IS NULL
       OR a.hospital_patient_id IS NULL
       OR hpr.id IS NULL
       OR hpr.hospital_id <> a.hospital_id;

    IF v_count > 0 THEN
        RAISE EXCEPTION
        'MIGRATION INTEGRITY FAILURE: appointment tenant/HPR mismatch: %',
        v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.patient_visits v
    JOIN public.hospital_patient_records hpr
      ON hpr.id = v.hospital_patient_id
    WHERE hpr.hospital_id <> v.hospital_id;

    IF v_count > 0 THEN
        RAISE EXCEPTION
        'MIGRATION INTEGRITY FAILURE: visit/HPR hospital mismatch: %',
        v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.patient_visits v
    LEFT JOIN public.hospital_members hm
      ON hm.hospital_id = v.hospital_id
     AND hm.doctor_id = v.doctor_id
     AND hm.role = 'doctor'
     AND hm.status = 'active'
    WHERE hm.id IS NULL;

    IF v_count > 0 THEN
        RAISE EXCEPTION
        'MIGRATION INTEGRITY FAILURE: visit doctor membership mismatch: %',
        v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.consultation_notes n
    JOIN public.patient_visits v ON v.id = n.visit_id
    WHERE n.hospital_id <> v.hospital_id;

    IF v_count > 0 THEN
        RAISE EXCEPTION
        'MIGRATION INTEGRITY FAILURE: consultation note tenant mismatch: %',
        v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.prescriptions p
    JOIN public.patient_visits v ON v.id = p.visit_id
    WHERE p.hospital_id <> v.hospital_id;

    IF v_count > 0 THEN
        RAISE EXCEPTION
        'MIGRATION INTEGRITY FAILURE: prescription tenant mismatch: %',
        v_count;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.unmapped_legacy_exceptions
    WHERE status = 'open';

    IF v_count > 0 THEN
        RAISE EXCEPTION
        'MIGRATION INTEGRITY FAILURE: unresolved legacy exceptions: %',
        v_count;
    END IF;

END $$;
