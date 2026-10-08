/**
 * Converts the canonical application-level intake
 * into the existing appointment_symptoms API shape.
 *
 * The database is NOT being redesigned here.
 */
export function patientIntakeToAppointmentSymptoms(intake) {
    return {
        symptoms: intake.symptoms.join(', '),
        location: intake.location,
        duration: intake.duration,
        recent_actions: intake.recent_actions,
        severity: intake.severity,
        current_medications: intake.current_medications,
        additional_notes: intake.additional_notes,
    };
}
