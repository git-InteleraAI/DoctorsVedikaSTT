-- =========================================================================
-- MIGRATION 0057: ATOMIC HARDENED VISIT STAGE TRANSITION RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.transition_visit_stage_hardened(
  p_visit_id UUID,
  p_expected_stage TEXT,
  p_target_stage TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public,pg_temp
AS $$
DECLARE
  v_caller_user_id UUID := auth.uid();
  v_hospital_id UUID;
  v_doctor_id UUID;
  v_current_stage TEXT;
  v_authorized BOOLEAN := FALSE;
  v_affected INTEGER := 0;
BEGIN
  IF v_caller_user_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','Unauthenticated request');
  END IF;

  SELECT hospital_id,doctor_id,visit_stage
  INTO v_hospital_id,v_doctor_id,v_current_stage
  FROM public.patient_visits
  WHERE id = p_visit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','Visit encounter not found');
  END IF;

  IF v_current_stage <> p_expected_stage THEN
    RETURN jsonb_build_object(
      'success',false,
      'error','Stage conflict: visit is currently ' || v_current_stage
    );
  END IF;

  IF NOT (
    (p_expected_stage = 'scheduled' AND p_target_stage IN ('checked_in','cancelled')) OR
    (p_expected_stage = 'checked_in' AND p_target_stage IN ('waiting','cancelled')) OR
    (p_expected_stage = 'waiting' AND p_target_stage IN ('in_consultation','cancelled')) OR
    (p_expected_stage = 'in_consultation' AND p_target_stage IN ('completed','cancelled'))
  ) THEN
    RETURN jsonb_build_object('success',false,'error','Illegal state transition');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.hospital_members hm
    WHERE hm.user_id = v_caller_user_id
      AND hm.hospital_id = v_hospital_id
      AND hm.status = 'active'
      AND (
        hm.role IN ('hospital_admin','staff')
        OR (hm.role = 'doctor' AND hm.doctor_id = v_doctor_id)
      )
  )
  INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('success',false,'error','Access denied');
  END IF;

  UPDATE public.patient_visits
  SET
    visit_stage = p_target_stage,
    status = CASE
      WHEN p_target_stage = 'completed' THEN 'completed'
      WHEN p_target_stage = 'cancelled' THEN 'cancelled'
      WHEN p_target_stage = 'in_consultation' THEN 'in_progress'
      ELSE status
    END,
    checked_in_at = CASE
      WHEN p_target_stage = 'checked_in' THEN COALESCE(checked_in_at,NOW())
      ELSE checked_in_at
    END,
    consultation_started_at = CASE
      WHEN p_target_stage = 'in_consultation' THEN COALESCE(consultation_started_at,NOW())
      ELSE consultation_started_at
    END,
    consultation_completed_at = CASE
      WHEN p_target_stage = 'completed' THEN COALESCE(consultation_completed_at,NOW())
      ELSE consultation_completed_at
    END,
    completed_at = CASE
      WHEN p_target_stage = 'completed' THEN COALESCE(completed_at,NOW())
      ELSE completed_at
    END,
    started_at = CASE
      WHEN p_target_stage = 'in_consultation' THEN COALESCE(started_at,NOW())
      ELSE started_at
    END,
    updated_at = NOW()
  WHERE id = p_visit_id
    AND visit_stage = p_expected_stage;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected = 1 THEN
    RETURN jsonb_build_object(
      'success',true,
      'visit_id',p_visit_id,
      'new_stage',p_target_stage
    );
  END IF;

  RETURN jsonb_build_object('success',false,'error','Concurrent transition conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.transition_visit_stage_hardened(UUID,TEXT,TEXT)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_visit_stage_hardened(UUID,TEXT,TEXT)
TO authenticated;
