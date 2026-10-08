/**
 * Shared clinical questionnaire catalog.
 *
 * Phase 3 adds deterministic symptom-specific follow-up questions while
 * preserving the existing specialty catalog and generic questions.
 *
 * Gemini is NOT used here. This file is the deterministic clinical SSOT.
 */
export const QUESTIONNAIRE_KEYS = [
    'dentist', 'dermatologist', 'cardiologist', 'orthopedist',
    'gynecologist', 'pediatrician', 'ent', 'neurologist', 'psychiatrist', 'general',
];

export const GENERAL_CONSTITUTIONAL_SYMPTOMS = [
    { id: 'fever', label: 'Fever / Chills', icon: 'thermometer' },
    { id: 'headache', label: 'Headache', icon: 'head-snowflake-outline', isRedFlag: true },
    { id: 'fatigue', label: 'Fatigue / Weakness', icon: 'battery-low' },
    { id: 'nausea', label: 'Nausea / Vomiting', icon: 'emoticon-sick-outline' },
    { id: 'body_ache', label: 'Body Ache', icon: 'human' },
];

export const SPECIALTY_SYMPTOMS_MAP = {
    dentist: [
        { id: 'toothache', label: 'Toothache / Severe Tooth Pain', icon: 'tooth' },
        { id: 'gums_bleeding', label: 'Bleeding or Swollen Gums', icon: 'water' },
        { id: 'sensitivity', label: 'Sensitivity (Hot or Cold)', icon: 'snowflake' },
        { id: 'jaw_pain', label: 'Jaw Pain / TMJ Stiffness', icon: 'skull-outline' },
        { id: 'cavity', label: 'Cavity / Visible Tooth Decay', icon: 'circle-outline' },
        { id: 'broken_tooth', label: 'Cracked or Broken Tooth', icon: 'lightning-bolt' },
        { id: 'wisdom_tooth', label: 'Wisdom Tooth Discomfort', icon: 'tooth-outline' },
        { id: 'bad_breath', label: 'Bad Breath / Halitosis', icon: 'air-filter' },
    ],
    dermatologist: [
        { id: 'skin_rash', label: 'Skin Rash / Hives / Redness', icon: 'bandage' },
        { id: 'acne', label: 'Acne / Pimples / Breakouts', icon: 'dots-hexagon' },
        { id: 'hair_fall', label: 'Excessive Hair Fall / Thinning', icon: 'face-woman-profile' },
        { id: 'itching', label: 'Itching / Dry & Flaky Skin', icon: 'hand-wash' },
        { id: 'dark_spots', label: 'Dark Spots / Discoloration', icon: 'creation' },
        { id: 'mole_check', label: 'Mole / Skin Growth Check', icon: 'shape' },
        { id: 'eczema', label: 'Eczema / Psoriasis Flare-up', icon: 'alert-circle-outline' },
    ],
    cardiologist: [
        { id: 'chest_pain', label: 'Chest Pain / Pressure', icon: 'heart-pulse', isRedFlag: true },
        { id: 'palpitations', label: 'Heart Palpitations / Racing Heart', icon: 'heart-flash' },
        { id: 'breathlessness', label: 'Shortness of Breath', icon: 'lungs', isRedFlag: true },
        { id: 'high_bp', label: 'High BP Symptoms', icon: 'gauge' },
        { id: 'dizziness', label: 'Dizziness / Lightheadedness', icon: 'rotate-right' },
        { id: 'swollen_ankles', label: 'Swelling in Ankles / Legs', icon: 'human' },
    ],
    orthopedist: [
        { id: 'knee_pain', label: 'Knee Pain / Joint Stiffness', icon: 'bone' },
        { id: 'back_pain', label: 'Lower Back / Spine Pain', icon: 'human' },
        { id: 'neck_pain', label: 'Neck Pain / Stiffness', icon: 'account-voice' },
        { id: 'shoulder_pain', label: 'Shoulder / Joint Pain', icon: 'arm-flex' },
        { id: 'muscle_cramps', label: 'Muscle Cramps / Spasms', icon: 'lightning-bolt' },
        { id: 'recent_injury', label: 'Recent Injury / Fracture Suspected', icon: 'hospital-building' },
    ],
    gynecologist: [
        { id: 'irregular_periods', label: 'Irregular / Painful Periods', icon: 'calendar-month' },
        { id: 'heavy_bleeding', label: 'Heavy Menstrual Bleeding', icon: 'water' },
        { id: 'pelvic_pain', label: 'Pelvic / Lower Abdominal Pain', icon: 'human' },
        { id: 'discharge', label: 'Vaginal Discharge / Infection', icon: 'shield-cross' },
        { id: 'pregnancy_care', label: 'Pregnancy Care Checkup', icon: 'baby-carriage' },
        { id: 'pcod_pcos', label: 'PCOD / PCOS Concerns', icon: 'medical-bag' },
    ],
    pediatrician: [
        { id: 'child_fever', label: 'Fever in Child', icon: 'thermometer' },
        { id: 'child_cough', label: 'Child Cough & Cold', icon: 'weather-dust' },
        { id: 'poor_feeding', label: 'Poor Feeding / Reduced Appetite', icon: 'baby-bottle' },
        { id: 'diaper_rash', label: 'Diaper Rash / Skin Issue', icon: 'baby' },
        { id: 'vomiting_diarrhea', label: 'Vomiting / Loose Stools', icon: 'emoticon-sick-outline' },
        { id: 'vaccination', label: 'Vaccination / Routine Growth Check', icon: 'syringe' },
    ],
    ent: [
        { id: 'earache', label: 'Earache / Fluid Discharge', icon: 'ear-hearing' },
        { id: 'tinnitus', label: 'Hearing Difficulty / Tinnitus', icon: 'volume-high' },
        { id: 'sinus', label: 'Sinus Pain / Nasal Block', icon: 'air-filter' },
        { id: 'sore_throat', label: 'Sore Throat / Pain Swallowing', icon: 'account-voice' },
        { id: 'tonsils', label: 'Tonsil Pain / Hoarse Voice', icon: 'microphone-off' },
    ],
    neurologist: [
        { id: 'migraine', label: 'Frequent Severe Migraines', icon: 'head-snowflake-outline', isRedFlag: true },
        { id: 'numbness', label: 'Numbness / Tingling in Limbs', icon: 'hand-pointing-right' },
        { id: 'memory_loss', label: 'Memory Issues / Confusion', icon: 'brain' },
        { id: 'balance_loss', label: 'Balance Loss / Dizziness', icon: 'rotate-right' },
        { id: 'seizures', label: 'Seizures / Tremors', icon: 'flash', isRedFlag: true },
    ],
    psychiatrist: [
        { id: 'anxiety', label: 'Anxiety / Panic Feelings', icon: 'brain' },
        { id: 'insomnia', label: 'Sleep Problems / Insomnia', icon: 'weather-night' },
        { id: 'depression', label: 'Low Mood / Sadness / Depression', icon: 'emoticon-sad-outline' },
        { id: 'burnout', label: 'High Stress / Burnout', icon: 'fire' },
        { id: 'mood_swings', label: 'Mood Swings / Emotional Outbursts', icon: 'swap-horizontal' },
    ],
    general: [
        { id: 'fever', label: 'High Fever / Chills', icon: 'thermometer' },
        { id: 'cough', label: 'Cold, Cough & Congestion', icon: 'weather-dust' },
        { id: 'headache', label: 'Severe Headache', icon: 'head-snowflake-outline' },
        { id: 'throat', label: 'Throat Pain / Sore Throat', icon: 'account-voice' },
        { id: 'stomach', label: 'Stomach Pain / Indigestion', icon: 'stomach' },
        { id: 'weakness', label: 'Weakness & Body Fatigue', icon: 'battery-low' },
        { id: 'vomiting', label: 'Nausea / Vomiting', icon: 'emoticon-sick-outline' },
    ],
};

export const LATERALITY_OPTIONS = ['Left Side', 'Right Side', 'Both Sides', 'Upper Area', 'Lower Area', 'Not Applicable'];
export const DURATION_OPTIONS = ['< 24 Hours', '1 - 3 Days', '4 - 7 Days', '1 - 2 Weeks', '1+ Month', 'Chronic / Ongoing'];
export const RECENT_ACTIONS_OPTIONS = [
    'Took OTC Medicine (e.g. Paracetamol)',
    'Tried Home Remedies / Ice / Rest',
    'Consulted Another Doctor Recently',
    'Applied Topical Gel / Cream',
    'Nothing Yet',
];
export const SEVERITY_OPTIONS = [
    { key: 'mild', label: 'Mild', badgeColor: '#10B981', textColor: '#065F46', bgColor: '#ECFDF5', borderColor: '#A7F3D0', description: 'Minor discomfort. Able to carry out regular daily activities.' },
    { key: 'moderate', label: 'Moderate', badgeColor: '#F59E0B', textColor: '#92400E', bgColor: '#FFFBEB', borderColor: '#FDE68A', description: 'Noticeable pain/distress. Normal routine is partly affected.' },
    { key: 'severe', label: 'Severe', badgeColor: '#EF4444', textColor: '#991B1B', bgColor: '#FEF2F2', borderColor: '#FECACA', description: 'Acute or intense pain. Greatly disrupts daily functioning.' },
    { key: 'unsure', label: 'Unsure / Need Evaluation', badgeColor: '#6366F1', textColor: '#3730A3', bgColor: '#EEF2FF', borderColor: '#C7D2FE', description: 'Uncertain of severity. Seeking doctor’s professional evaluation.' },
];

/**
 * Phase 3 deterministic symptom-specific questions.
 *
 * Only three pathways are intentionally activated in this phase:
 * chest pain, toothache, and skin rash. Other symptoms continue through
 * the existing generic questionnaire until their dedicated branch is added.
 */
export const SYMPTOM_SPECIFIC_QUESTIONS = {
    chest_pain: [
        { field: 'chest_character', label: 'Pain Character', prompt: 'How would you describe the chest discomfort?', quickChips: ['Pressure / Tightness', 'Sharp / Stabbing', 'Burning', 'Heavy / Squeezing', 'Not Sure'] },
        { field: 'chest_radiation', label: 'Radiation', prompt: 'Does the chest discomfort spread anywhere else?', quickChips: ['No', 'Arm / Shoulder', 'Jaw / Neck', 'Back', 'Multiple Areas', 'Not Sure'] },
        { field: 'breathlessness', label: 'Breathing Difficulty', prompt: 'Are you having any shortness of breath or difficulty breathing?', quickChips: ['No', 'Yes'] , yesSymptom: 'breathlessness' },
        { field: 'chest_sweating', label: 'Sweating', prompt: 'Are you having unusual sweating along with the chest discomfort?', quickChips: ['No', 'Yes'] },
        { field: 'chest_dizziness', label: 'Dizziness', prompt: 'Are you feeling dizzy or lightheaded?', quickChips: ['No', 'Yes'], yesSymptom: 'dizziness' },
        { field: 'chest_nausea', label: 'Nausea', prompt: 'Are you feeling nauseated or vomiting?', quickChips: ['No', 'Yes'], yesSymptom: 'nausea' },
        { field: 'chest_exertional', label: 'Exertional Pattern', prompt: 'Does the discomfort occur or become worse with walking, exercise, or physical effort?', quickChips: ['No', 'Yes', 'Not Sure'] },
    ],
    toothache: [
        { field: 'tooth_area', label: 'Tooth Area', prompt: 'Which tooth or area is affected?', quickChips: ['Front Teeth', 'Back Teeth / Molars', 'Upper Teeth', 'Lower Teeth', 'Gum Area', 'Not Sure'] },
        { field: 'tooth_swelling', label: 'Swelling', prompt: 'Is there any swelling around the tooth, gum, cheek, or jaw?', quickChips: ['No', 'Yes'] },
        { field: 'tooth_sensitivity', label: 'Temperature Sensitivity', prompt: 'Does the tooth hurt with hot or cold food or drinks?', quickChips: ['No', 'Hot Only', 'Cold Only', 'Both Hot and Cold', 'Not Sure'] },
        { field: 'tooth_fever', label: 'Fever', prompt: 'Have you had fever or chills along with the dental problem?', quickChips: ['No', 'Yes'] , yesSymptom: 'fever' },
        { field: 'tooth_chewing', label: 'Chewing Pain', prompt: 'Does chewing or biting make the pain worse?', quickChips: ['No', 'Yes', 'Not Sure'] },
    ],
    skin_rash: [
        { field: 'skin_onset', label: 'Onset', prompt: 'When did the skin problem first appear?', quickChips: ['Today', '1 - 3 Days', '4 - 7 Days', '1 - 2 Weeks', 'More than 2 Weeks', 'Not Sure'] },
        { field: 'skin_itching', label: 'Itching', prompt: 'Is the affected skin itchy?', quickChips: ['No', 'Yes'] , yesSymptom: 'itching' },
        { field: 'skin_pain', label: 'Skin Pain', prompt: 'Is the affected skin painful or tender?', quickChips: ['No', 'Yes'] },
        { field: 'skin_spread', label: 'Spread', prompt: 'Has the rash or skin problem been spreading to other areas?', quickChips: ['No', 'Yes', 'Not Sure'] },
        { field: 'skin_exposure', label: 'New Exposure', prompt: 'Did it start after a new product, medicine, food, cosmetic, soap, or other exposure?', quickChips: ['No', 'Yes', 'Not Sure'] },
    ],
};

export const QUESTIONNAIRE_CATALOG = QUESTIONNAIRE_KEYS.reduce((acc, key) => {
    acc[key] = {
        key,
        symptoms: SPECIALTY_SYMPTOMS_MAP[key],
        constitutionalSymptoms: GENERAL_CONSTITUTIONAL_SYMPTOMS,
        locationOptions: LATERALITY_OPTIONS,
        durationOptions: DURATION_OPTIONS,
        recentActionOptions: RECENT_ACTIONS_OPTIONS,
        severityOptions: SEVERITY_OPTIONS,
    };
    return acc;
}, {});

export function getQuestionnaire(key) {
    if (key && Object.prototype.hasOwnProperty.call(QUESTIONNAIRE_CATALOG, key)) {
        return QUESTIONNAIRE_CATALOG[key];
    }
    return QUESTIONNAIRE_CATALOG.general;
}

export function getSymptomSpecificQuestions(symptoms = []) {
    for (const symptom of symptoms) {
        const id = String(symptom).toLowerCase().trim();
        if (SYMPTOM_SPECIFIC_QUESTIONS[id]) return SYMPTOM_SPECIFIC_QUESTIONS[id];
    }
    return [];
}

export function getSymptomSpecificQuestion(field, symptoms = []) {
    return getSymptomSpecificQuestions(symptoms).find((question) => question.field === field) || null;
}
