export const createEmptyConsultation = (patient) => ({
    patientId: patient.id,
    patientName: patient.name,

    startedAt: null,
    endedAt: null,

    transcript: [],

    summary: null
});