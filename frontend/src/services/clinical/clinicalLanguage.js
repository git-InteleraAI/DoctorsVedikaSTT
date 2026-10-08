/**
 * DoctorsVedika QR Clinical Chatbot — patient-facing language layer.
 *
 * IMPORTANT:
 * - Clinical engine values remain canonical English IDs internally.
 * - Only patient-facing text and quick-reply labels are translated.
 * - Translated quick replies are converted back to canonical values before
 *   they enter the deterministic dialogue engine.
 */

const LANGUAGE_ALIASES = {
    English: "en",
    english: "en",
    en: "en",
    Telugu: "te",
    telugu: "te",
    తెలుగు: "te",
    te: "te",
    Hindi: "hi",
    hindi: "hi",
    हिन्दी: "hi",
    hi: "hi",
};

export function normalizeQrLanguage(value) {
    return LANGUAGE_ALIASES[String(value || "").trim()] || "en";
}

export function getQrLanguage() {
    try {
        const stored = JSON.parse(
            sessionStorage.getItem("dv_qr_intake_onboarding") || "null"
        );
        return normalizeQrLanguage(stored?.language || "en");
    } catch (_) {
        return "en";
    }
}

const UI = {
    en: {
        clinicalAssistant: "Health Assistant",
        you: "You",
        loadingAssessment: "Loading Assessment...",
        connecting: "Connecting to hospital clinical desk.",
        sessionExpired: "Session Expired",
        sessionExpiredBody:
            "This QR session has expired. Please scan the hospital QR code again to start a new check-in.",
        hospitalNameFallback: "Hospital",
        registrationSuccessful: "Registration Successful",
        registrationBody: (name, hospital) =>
            `Thank you, ${name}. Your registration at ${hospital} is complete.`,
        registrationNote:
            "Before seeing the doctor, please provide a few details about your symptoms.",
        continue: "Continue",
        chooseLanguage: "Choose Your Language",
        chooseLanguageBody:
            "Choose the language that is easiest for you to understand.",
        aiConsent: "Before You Meet the Doctor",
        consentBody:
            `Before you meet the doctor, we’ll ask a few simple questions about your symptoms. Your answers will be shared with the doctor so they can understand your concerns better.

It only takes a few minutes. Please tell us what you’re experiencing in your own words.`,
        language: "Language",
        notSelected: "Not selected",
        consentNote:
            "Your answers help the doctor understand your problem. They do not replace a doctor’s consultation or diagnosis.",
        doNotConsent: "Not Now",
        changeLanguage: "Change Language",
        agreeContinue: "Continue",
        saving: "Saving...",
        ready: "Ready to Start",
        readyBody: (language) =>
            `You selected ${language}. You can now tell us about your symptoms.`,
        readyNote:
            "Your answers will help the doctor understand your problem before the consultation.",
        startAssessment: "Start Symptoms Assessment",
        clinicalIntake: "Symptoms Check",
        urgentTitle: "Urgent Medical Attention Required",
        urgentBody:
            "The symptoms described may indicate an emergency requiring immediate medical care. Normal intake has been stopped for your safety. Please immediately notify the hospital reception staff or call emergency services.",
        emergency112: "Call Emergency (112)",
        ambulance108: "Call Ambulance (108)",
        submittedTitle: "Intake Submitted Successfully",
        submittedAt: "Submitted at",
        submittedBody: (name, hospital) =>
            `Thank you, ${name}. Your symptom details have been securely sent to the staff reception desk at ${hospital}.`,
        recordedSummary: "Your Details",
        scanNewCheckin: "Scan New Check-in",
        proceedReception:
            "Please proceed to the reception desk or take a seat in the waiting area. The staff will call your name shortly.",
        symptoms: "Symptoms",
        noneNoted: "None noted",
        location: "Location",
        duration: "Duration",
        severity: "Severity",
        actionsMeds: "Actions/Meds",
        processing: "Processing your response...",
        typeResponse: "Type your response here...",
        send: "Send",
        submitting: "Submitting your clinical assessment...",
        unableContinue: "Unable to Continue",
        tryAgain: "Try Again",
        hospital: "Hospital",
        noneReported: "None reported",
        recentActions: "Recent Actions",
        medications: "Medications",
        patientNotes: "Patient Notes",
        confirmSave: "Confirm & Save",
        editSymptoms: "Edit Symptoms",
        editDuration: "Edit Duration",
        editSeverity: "Edit Severity",
        editLocation: "Edit Location",
        mild: "Mild",
        moderate: "Moderate",
        severe: "Severe",
        unsure: "Unsure",
        yes: "Yes",
        no: "No",
        notSure: "Not Sure",
        welcome: (hospital) =>
            `Welcome to ${hospital}. I will assist you with a brief clinical assessment of your symptoms before you see the doctor.`,
        describeSymptoms:
            "Please describe the symptoms you are experiencing today, or select an option below:",
        otherSymptoms:
            "Are there any other symptoms you would like to mention, or are these all?",
        locationQuestion:
            "Where exactly are you feeling this discomfort or symptom?",
        durationQuestion:
            "How long have you been experiencing these symptoms?",
        recentActionsQuestion:
            "Have you taken any medicines, home remedies, or seen another doctor for this?",
        severityQuestion:
            "How severe would you describe your symptoms right now?",
        medicationsQuestion:
            "Are you currently taking any regular medications or supplements?",
        moreDetails: "Please tell me more about what you are experiencing.",
        reviewIntro: "Please check the details you gave us.",
        reviewConfirm: "Is this information correct? Can we share it with your doctor?",
        caution:
            "Please keep an eye on your symptoms.",
        urgentMessage:
            "URGENT CLINICAL WARNING: The symptoms described may indicate an emergency requiring immediate medical attention. Please visit the nearest emergency room or hospital immediately, or call local emergency services.",
    },

    te: {
        clinicalAssistant: "హెల్త్ అసిస్టెంట్",
        you: "మీరు",
        loadingAssessment: "అంచనా లోడ్ అవుతోంది...",
        connecting: "హాస్పిటల్ టీమ్‌కు కనెక్ట్ అవుతోంది...",
        sessionExpired: "సెషన్ ముగిసింది",
        sessionExpiredBody:
            "ఈ QR సెషన్ ముగిసింది. కొత్తగా చెక్-ఇన్ చేయడానికి హాస్పిటల్ QR కోడ్‌ను మళ్లీ స్కాన్ చేయండి.",
        hospitalNameFallback: "హాస్పిటల్",
        registrationSuccessful: "రిజిస్ట్రేషన్ అయింది",
        registrationBody: (name, hospital) =>
            `ధన్యవాదాలు ${name}. ${hospital}లో మీ రిజిస్ట్రేషన్ పూర్తైంది.`,
        registrationNote:
            "డాక్టర్‌ని కలవడానికి ముందు మీకు ఉన్న లక్షణాల గురించి కొన్ని వివరాలు చెప్పండి.",
        continue: "కొనసాగండి",
        chooseLanguage: "భాష ఎంచుకోండి",
        chooseLanguageBody:
            "మీకు సులభంగా అర్థమయ్యే భాషను ఎంచుకోండి.",
        aiConsent: "డాక్టర్‌ను కలిసే ముందు",
        consentBody:
            `డాక్టర్‌ను కలవడానికి ముందు, మీకు ఉన్న ఇబ్బంది గురించి కొన్ని సులభమైన ప్రశ్నలు అడుగుతాము. మీ సమాధానాలను డాక్టర్‌తో పంచుకుంటాము. దాంతో మీ సమస్యను డాక్టర్‌కు ముందుగానే బాగా అర్థం చేసుకోవడానికి సహాయపడుతుంది.

ఇది కొన్ని నిమిషాలు మాత్రమే పడుతుంది. మీకు ఏమి ఇబ్బంది ఉందో మీ మాటల్లోనే చెప్పండి.`,
        language: "భాష",
        notSelected: "ఎంచుకోలేదు",
        consentNote:
            "మీ సమాధానాలు డాక్టర్‌కు మీ సమస్యను అర్థం చేసుకోవడానికి సహాయపడతాయి. ఇవి డాక్టర్ సంప్రదింపులకు లేదా నిర్ధారణకు బదులు కావు.",
        doNotConsent: "ఇప్పుడు వద్దు",
        changeLanguage: "భాష మార్చండి",
        agreeContinue: "కొనసాగండి",
        saving: "సేవ్ అవుతోంది...",
        ready: "ప్రారంభించడానికి రెడీ",
        readyBody: (language) =>
            `మీరు ${language} భాషను ఎంచుకున్నారు. ఇప్పుడు మీకు ఉన్న ఇబ్బంది గురించి చెప్పండి.`,
        readyNote:
            "మీ సమాధానాలు డాక్టర్‌కు మీ సమస్యను ముందుగానే అర్థం చేసుకోవడానికి సహాయపడతాయి.",
        startAssessment: "లక్షణాల అంచనా ప్రారంభించండి",
        clinicalIntake: "లక్షణాల వివరాలు",
        urgentTitle: "వెంటనే వైద్య సహాయం అవసరం",
        urgentBody:
            "మీరు చెప్పిన లక్షణాలు అత్యవసర సమస్యకు సంకేతం కావచ్చు. మీ భద్రత కోసం ఈ అంచనాను ఆపుతున్నాము. వెంటనే హాస్పిటల్ రిసెప్షన్‌కు చెప్పండి లేదా అత్యవసర సేవలకు కాల్ చేయండి.",
        emergency112: "అత్యవసర సేవలకు కాల్ చేయండి (112)",
        ambulance108: "అంబులెన్స్‌కు కాల్ చేయండి (108)",
        submittedTitle: "లక్షణాల వివరాలు పంపించాం",
        submittedAt: "పంపిన సమయం",
        submittedBody: (name, hospital) =>
            `ధన్యవాదాలు ${name}. మీ లక్షణాల వివరాలు ${hospital} హాస్పిటల్ టీమ్‌కు సురక్షితంగా పంపించాం.`,
        recordedSummary: "మీ వివరాలు",
        scanNewCheckin: "కొత్తగా చెక్-ఇన్ చేయండి",
        proceedReception:
            "రిసెప్షన్‌కు వెళ్లి కూర్చోండి. స్టాఫ్ త్వరలో మీ పేరును పిలుస్తారు.",
        symptoms: "లక్షణాలు",
        noneNoted: "ఏమీ చెప్పలేదు",
        location: "ఎక్కడ ఉంది",
        duration: "ఎప్పటి నుంచి",
        severity: "ఎంత ఇబ్బందిగా ఉంది",
        actionsMeds: "ఏం చేశారు / మందులు",
        processing: "మీ సమాధానాన్ని చూస్తున్నాను...",
        typeResponse: "మీ సమాధానం టైప్ చేయండి...",
        send: "పంపండి",
        submitting: "మీ వివరాలు పంపుతున్నాం...",
        unableContinue: "కొనసాగించలేకపోతున్నాం",
        tryAgain: "మళ్లీ ప్రయత్నించండి",
        hospital: "హాస్పిటల్",
        noneReported: "ఏమీ చెప్పలేదు",
        recentActions: "ఇటీవల ఏం చేశారు",
        medications: "మందులు",
        patientNotes: "మీ గమనిక",
        confirmSave: "నిర్ధారించి సేవ్ చేయండి",
        editSymptoms: "లక్షణాలు మార్చండి",
        editDuration: "ఎప్పటి నుంచి మార్చండి",
        editSeverity: "తీవ్రత మార్చండి",
        editLocation: "స్థానం మార్చండి",
        mild: "తక్కువ",
        moderate: "మధ్యస్థం",
        severe: "తీవ్రంగా",
        unsure: "తెలియదు",
        yes: "అవును",
        no: "కాదు",
        notSure: "తెలియదు",
        welcome: (hospital) =>
            `${hospital}కి స్వాగతం. డాక్టర్‌ని కలవడానికి ముందు మీ లక్షణాల గురించి కొన్ని ప్రశ్నలు అడుగుతాను.`,
        describeSymptoms:
            "ఈరోజు మీకు ఏమి ఇబ్బంది ఉందో చెప్పండి లేదా కింద ఉన్న ఆప్షన్‌ను ఎంచుకోండి:",
        otherSymptoms:
            "ఇంకా ఏమైనా లక్షణాలు ఉన్నాయా? లేక ఇవేనా?",
        locationQuestion:
            "నొప్పి లేదా ఇబ్బంది ఎక్కడ ఉంది?",
        durationQuestion:
            "ఈ లక్షణాలు ఎప్పటి నుంచి ఉన్నాయి?",
        recentActionsQuestion:
            "ఏదైనా మందు తీసుకున్నారా, ఇంట్లో ఏదైనా చేసారా లేదా మరో డాక్టర్‌ను కలిశారా?",
        severityQuestion:
            "ఇప్పుడు ఈ లక్షణం ఎంత ఇబ్బందిగా ఉంది?",
        medicationsQuestion:
            "మీరు రోజూ ఏమైనా మందులు తీసుకుంటున్నారా?",
        moreDetails: "మీకు ఏమి ఇబ్బందిగా ఉందో ఇంకొంచెం చెప్పండి.",
        reviewIntro: "మీరు చెప్పిన వివరాలు ఇవి:",
        reviewConfirm: "ఈ వివరాలు సరైనవేనా? డాక్టర్‌తో షేర్ చేయాలా?",
        caution: "మీ లక్షణాలను గమనిస్తూ ఉండండి.",
        urgentMessage:
            "అత్యవసర హెచ్చరిక: మీరు చెప్పిన లక్షణాలు అత్యవసర సమస్యకు సంకేతం కావచ్చు. వెంటనే దగ్గరలోని హాస్పిటల్‌కు వెళ్లండి లేదా అత్యవసర సేవలకు కాల్ చేయండి.",
    },

    hi: {
        clinicalAssistant: "हेल्थ असिस्टेंट",
        you: "आप",
        loadingAssessment: "जानकारी लोड हो रही है...",
        connecting: "हॉस्पिटल टीम से कनेक्ट हो रहा है...",
        sessionExpired: "सेशन खत्म हो गया",
        sessionExpiredBody:
            "यह QR सेशन खत्म हो गया है। नया चेक-इन करने के लिए हॉस्पिटल का QR कोड फिर से स्कैन करें।",
        hospitalNameFallback: "हॉस्पिटल",
        registrationSuccessful: "रजिस्ट्रेशन हो गया",
        registrationBody: (name, hospital) =>
            `धन्यवाद ${name}। ${hospital} में आपका रजिस्ट्रेशन पूरा हो गया है।`,
        registrationNote:
            "डॉक्टर से मिलने से पहले अपने लक्षणों के बारे में कुछ जानकारी दें।",
        continue: "आगे बढ़ें",
        chooseLanguage: "भाषा चुनें",
        chooseLanguageBody:
            "लक्षणों से जुड़े सवालों के लिए अपनी आसान भाषा चुनें।",
        aiConsent: "डॉक्टर से मिलने से पहले",
        consentBody:
            `आपके लक्षणों के बारे में हम कुछ आसान सवाल पूछेंगे। आपके जवाब डॉक्टर से मिलने से पहले उनके साथ शेयर किए जाएंगे, ताकि डॉक्टर आपकी परेशानी को बेहतर समझ सकें और आपको सही देखभाल दे सकें।

इसमें बस कुछ मिनट लगेंगे। आपको जो परेशानी हो रही है, उसे अपने शब्दों में बताइए।`,
        language: "भाषा",
        notSelected: "चुनी नहीं गई",
        consentNote:
            "आपके जवाब डॉक्टर को आपकी परेशानी पहले से समझने में मदद करेंगे। ये जवाब डॉक्टर की जांच या सलाह की जगह नहीं लेते हैं।",
        doNotConsent: "अभी नहीं",
        changeLanguage: "भाषा बदलें",
        agreeContinue: "आगे बढ़ें",
        saving: "सेव हो रहा है...",
        ready: "शुरू करने के लिए तैयार",
        readyBody: (language) =>
            `आपने ${language} भाषा चुनी है। अब अपने लक्षणों के बारे में बताएं।`,
        readyNote:
            "आपके जवाबों से डॉक्टर को आपकी परेशानी पहले से समझने में मदद मिलेगी।",
        startAssessment: "लक्षणों की जांच शुरू करें",
        clinicalIntake: "लक्षणों की जानकारी",
        urgentTitle: "तुरंत डॉक्टर की मदद चाहिए",
        urgentBody:
            "आपके बताए लक्षण किसी गंभीर समस्या का संकेत हो सकते हैं। आपकी सुरक्षा के लिए यह जांच रोक दी गई है। तुरंत हॉस्पिटल रिसेप्शन को बताएं या इमरजेंसी सेवा को कॉल करें।",
        emergency112: "इमरजेंसी कॉल करें (112)",
        ambulance108: "एम्बुलेंस कॉल करें (108)",
        submittedTitle: "आपकी जानकारी भेज दी गई है",
        submittedAt: "भेजने का समय",
        submittedBody: (name, hospital) =>
            `धन्यवाद ${name}। आपके लक्षणों की जानकारी ${hospital} की हॉस्पिटल टीम को सुरक्षित रूप से भेज दी गई है।`,
        recordedSummary: "आपकी जानकारी",
        scanNewCheckin: "नया चेक-इन करें",
        proceedReception:
            "रिसेप्शन पर जाएं और बैठें। स्टाफ जल्द ही आपका नाम बुलाएगा।",
        symptoms: "लक्षण",
        noneNoted: "कुछ नहीं बताया",
        location: "कहां है",
        duration: "कब से",
        severity: "कितनी परेशानी है",
        actionsMeds: "क्या किया / दवाएं",
        processing: "आपके जवाब को देख रहे हैं...",
        typeResponse: "अपना जवाब यहां लिखें...",
        send: "भेजें",
        submitting: "आपकी जानकारी भेजी जा रही है...",
        unableContinue: "आगे नहीं बढ़ पा रहे हैं",
        tryAgain: "फिर से कोशिश करें",
        hospital: "हॉस्पिटल",
        noneReported: "कुछ नहीं बताया",
        recentActions: "हाल में क्या किया",
        medications: "दवाएं",
        patientNotes: "आपकी बात",
        confirmSave: "पुष्टि करके सेव करें",
        editSymptoms: "लक्षण बदलें",
        editDuration: "कब से बदलें",
        editSeverity: "गंभीरता बदलें",
        editLocation: "जगह बदलें",
        mild: "हल्का",
        moderate: "मध्यम",
        severe: "ज्यादा",
        unsure: "पक्का नहीं",
        yes: "हां",
        no: "नहीं",
        notSure: "पक्का नहीं",
        welcome: (hospital) =>
            `${hospital} में आपका स्वागत है। डॉक्टर से मिलने से पहले मैं आपके लक्षणों के बारे में कुछ आसान सवाल पूछूंगा।`,
        describeSymptoms:
            "आज आपको क्या परेशानी हो रही है? बताएं या नीचे कोई विकल्प चुनें:",
        otherSymptoms:
            "और कोई लक्षण हैं? या बस यही हैं?",
        locationQuestion:
            "दर्द या परेशानी कहां है?",
        durationQuestion:
            "ये लक्षण कब से हैं?",
        recentActionsQuestion:
            "क्या आपने कोई दवा ली, घर पर कुछ किया या किसी दूसरे डॉक्टर को दिखाया?",
        severityQuestion:
            "अभी यह परेशानी कितनी ज्यादा है?",
        medicationsQuestion:
            "क्या आप रोज कोई दवा लेते हैं?",
        moreDetails: "आपको क्या परेशानी हो रही है, थोड़ा और बताएं।",
        reviewIntro: "आपने जो जानकारी बताई है:",
        reviewConfirm: "क्या यह जानकारी सही है? इसे डॉक्टर के साथ शेयर करें?",
        caution: "अपने लक्षणों पर नजर रखें।",
        urgentMessage:
            "इमरजेंसी चेतावनी: आपके बताए लक्षण गंभीर समस्या का संकेत हो सकते हैं। तुरंत नजदीकी हॉस्पिटल जाएं या इमरजेंसी सेवा को कॉल करें।",
    },

};

const SYMPTOMS = {
    chest_pain: {
        en: "Chest Pain / Pressure",
        te: "ఛాతీ నొప్పి / ఒత్తిడి",
        hi: "सीने में दर्द / दबाव",
    },
    palpitations: {
        en: "Heart Palpitations / Racing Heart",
        te: "గుండె దడ / గుండె వేగంగా కొట్టుకోవడం",
        hi: "दिल की धड़कन तेज होना / धड़कन महसूस होना",
    },
    breathlessness: {
        en: "Shortness of Breath",
        te: "శ్వాస తీసుకోవడంలో ఇబ్బంది",
        hi: "सांस लेने में तकलीफ",
    },
    high_bp: { en: "High BP Symptoms", te: "అధిక రక్తపోటు లక్షణాలు", hi: "उच्च रक्तचाप के लक्षण" },
    dizziness: { en: "Dizziness / Lightheadedness", te: "తల తిరగడం / తేలికగా అనిపించడం", hi: "चक्कर / हल्कापन महसूस होना" },
    swollen_ankles: { en: "Swelling in Ankles / Legs", te: "చీలమండలు / కాళ్లలో వాపు", hi: "टखनों / पैरों में सूजन" },
    knee_pain: { en: "Knee Pain / Joint Stiffness", te: "మోకాలి నొప్పి / కీళ్ల బిగుతు", hi: "घुटने में दर्द / जोड़ में जकड़न" },
    back_pain: { en: "Lower Back / Spine Pain", te: "నడుము / వెన్నెముక నొప్పి", hi: "कमर / रीढ़ की हड्डी में दर्द" },
    neck_pain: { en: "Neck Pain / Stiffness", te: "మెడ నొప్పి / బిగుతు", hi: "गर्दन में दर्द / जकड़न" },
    shoulder_pain: { en: "Shoulder / Joint Pain", te: "భుజం / కీళ్ల నొప్పి", hi: "कंधे / जोड़ में दर्द" },
    muscle_cramps: { en: "Muscle Cramps / Spasms", te: "కండరాల తిమ్మిరి / సంకోచాలు", hi: "मांसपेशियों में ऐंठन / खिंचाव" },
    recent_injury: { en: "Recent Injury / Fracture Suspected", te: "ఇటీవలి గాయం / ఫ్రాక్చర్ అనుమానం", hi: "हाल की चोट / फ्रैक्चर का संदेह" },
    skin_rash: { en: "Skin Rash / Hives / Redness", te: "చర్మంపై దద్దుర్లు / ఎర్రదనం", hi: "त्वचा पर दाने / लालिमा" },
    acne: { en: "Acne / Pimples / Breakouts", te: "మొటిమలు", hi: "मुंहासे / पिंपल्स" },
    hair_fall: { en: "Excessive Hair Fall / Thinning", te: "అధిక జుట్టు రాలడం / జుట్టు పలుచబడటం", hi: "अधिक बाल झड़ना / बाल पतले होना" },
    itching: { en: "Itching / Dry & Flaky Skin", te: "దురద / పొడి చర్మం", hi: "खुजली / सूखी त्वचा" },
    dark_spots: { en: "Dark Spots / Discoloration", te: "నల్ల మచ్చలు / చర్మ రంగు మార్పు", hi: "काले धब्बे / त्वचा का रंग बदलना" },
    mole_check: { en: "Mole / Skin Growth Check", te: "పుట్టుమచ్చ / చర్మ పెరుగుదల పరిశీలన", hi: "तिल / त्वचा की वृद्धि की जांच" },
    eczema: { en: "Eczema / Psoriasis Flare-up", te: "ఎగ్జిమా / సోరియాసిస్ సమస్య", hi: "एक्जिमा / सोरायसिस की समस्या" },
    toothache: { en: "Toothache / Severe Tooth Pain", te: "పంటి నొప్పి / తీవ్రమైన పంటి నొప్పి", hi: "दाँत में दर्द / तेज़ दाँत का दर्द" },
    gums_bleeding: { en: "Bleeding or Swollen Gums", te: "చిగుళ్ల నుండి రక్తస్రావం లేదా వాపు", hi: "मसूड़ों से खून आना या सूजन" },
    sensitivity: { en: "Sensitivity (Hot or Cold)", te: "వేడి లేదా చల్లదనానికి సున్నితత్వం", hi: "गर्म या ठंडे पदार्थ से संवेदनशीलता" },
    jaw_pain: { en: "Jaw Pain / TMJ Stiffness", te: "దవడ నొప్పి / దవడ బిగుతు", hi: "जबड़े में दर्द / जकड़न" },
    cavity: { en: "Cavity / Visible Tooth Decay", te: "పంటి గుంట / పంటి క్షయం", hi: "दाँत में कैविटी / दाँत खराब होना" },
    broken_tooth: { en: "Cracked or Broken Tooth", te: "పగిలిన లేదా విరిగిన పంటి", hi: "टूटा या चटका हुआ दाँत" },
    wisdom_tooth: { en: "Wisdom Tooth Discomfort", te: "విజ్డమ్ టూత్ అసౌకర్యం", hi: "अक्ल की दाढ़ में परेशानी" },
    bad_breath: { en: "Bad Breath / Halitosis", te: "నోటి దుర్వాసన", hi: "मुंह से दुर्गंध" },
    irregular_periods: { en: "Irregular / Painful Periods", te: "క్రమం తప్పిన / నొప్పితో కూడిన పీరియడ్స్", hi: "अनियमित / दर्दनाक पीरियड्स" },
    heavy_bleeding: { en: "Heavy Menstrual Bleeding", te: "అధిక నెలసరి రక్తస్రావం", hi: "अधिक मासिक रक्तस्राव" },
    pelvic_pain: { en: "Pelvic / Lower Abdominal Pain", te: "పెల్విక్ / దిగువ పొత్తికడుపు నొప్పి", hi: "पेल्विक / पेट के निचले हिस्से में दर्द" },
    discharge: { en: "Vaginal Discharge / Infection", te: "యోని స్రావం / ఇన్ఫెక్షన్", hi: "योनि स्राव / संक्रमण" },
    pregnancy_care: { en: "Pregnancy Care Checkup", te: "గర్భధారణ సంరక్షణ పరీక్ష", hi: "गर्भावस्था देखभाल जांच" },
    pcod_pcos: { en: "PCOD / PCOS Concerns", te: "PCOD / PCOS సమస్యలు", hi: "PCOD / PCOS संबंधी समस्या" },
    child_fever: { en: "Fever in Child", te: "పిల్లలో జ్వరం", hi: "बच्चे को बुखार" },
    child_cough: { en: "Child Cough & Cold", te: "పిల్లలో దగ్గు మరియు జలుబు", hi: "बच्चे को खांसी और जुकाम" },
    poor_feeding: { en: "Poor Feeding / Reduced Appetite", te: "తక్కువగా తినడం / ఆకలి తగ్గడం", hi: "कम खाना / भूख कम होना" },
    diaper_rash: { en: "Diaper Rash / Skin Issue", te: "డైపర్ రాష్ / చర్మ సమస్య", hi: "डायपर रैश / त्वचा की समस्या" },
    vomiting_diarrhea: { en: "Vomiting / Loose Stools", te: "వాంతులు / విరేచనాలు", hi: "उल्टी / दस्त" },
    vaccination: { en: "Vaccination / Routine Growth Check", te: "టీకాలు / సాధారణ ఎదుగుదల పరీక్ష", hi: "टीकाकरण / सामान्य विकास जांच" },
    earache: { en: "Earache / Fluid Discharge", te: "చెవి నొప్పి / ద్రవం రావడం", hi: "कान में दर्द / तरल पदार्थ निकलना" },
    tinnitus: { en: "Hearing Difficulty / Tinnitus", te: "వినికిడి సమస్య / చెవిలో శబ్దం", hi: "सुनने में कठिनाई / कान में आवाज़" },
    sinus: { en: "Sinus Pain / Nasal Block", te: "సైనస్ నొప్పి / ముక్కు బ్లాక్", hi: "साइनस दर्द / नाक बंद" },
    sore_throat: { en: "Sore Throat / Pain Swallowing", te: "గొంతు నొప్పి / మింగేటప్పుడు నొప్పి", hi: "गले में दर्द / निगलने में दर्द" },
    tonsils: { en: "Tonsil Pain / Hoarse Voice", te: "టాన్సిల్ నొప్పి / గొంతు బొంగురుపోవడం", hi: "टॉन्सिल दर्द / आवाज़ बैठना" },
    migraine: { en: "Frequent Severe Migraines", te: "తరచుగా వచ్చే తీవ్రమైన మైగ్రేన్", hi: "बार-बार होने वाला तेज़ माइग्रेन" },
    numbness: { en: "Numbness / Tingling in Limbs", te: "చేతులు లేదా కాళ్లలో మొద్దుబారడం / జలదరింపు", hi: "हाथ-पैर में सुन्नपन / झुनझुनी" },
    memory_loss: { en: "Memory Issues / Confusion", te: "జ్ఞాపకశక్తి సమస్యలు / గందరగోళం", hi: "याददाश्त की समस्या / भ्रम" },
    balance_loss: { en: "Balance Loss / Dizziness", te: "సమతుల్యత కోల్పోవడం / తల తిరగడం", hi: "संतुलन बिगड़ना / चक्कर" },
    seizures: { en: "Seizures / Tremors", te: "మూర్ఛ / వణుకు", hi: "दौरे / कंपकंपी" },
    anxiety: { en: "Anxiety / Panic Feelings", te: "ఆందోళన / భయాందోళన భావాలు", hi: "चिंता / घबराहट" },
    insomnia: { en: "Sleep Problems / Insomnia", te: "నిద్ర సమస్యలు / నిద్రలేమి", hi: "नींद की समस्या / अनिद्रा" },
    depression: { en: "Low Mood / Sadness / Depression", te: "తక్కువ మానసిక స్థితి / విచారం / డిప్రెషన్", hi: "उदास मन / उदासी / अवसाद" },
    burnout: { en: "High Stress / Burnout", te: "అధిక ఒత్తిడి / బర్నౌట్", hi: "अधिक तनाव / बर्नआउट" },
    mood_swings: { en: "Mood Swings / Emotional Outbursts", te: "మూడ్ మార్పులు / భావోద్వేగ ఉద్ధృతులు", hi: "मूड में बदलाव / भावनात्मक प्रतिक्रिया" },
    fever: { en: "Fever / Chills", te: "జ్వరం / చలి", hi: "बुखार / ठंड लगना" },
    headache: { en: "Headache", te: "తలనొప్పి", hi: "सिरदर्द" },
    fatigue: { en: "Fatigue / Weakness", te: "అలసట / బలహీనత", hi: "थकान / कमजोरी" },
    nausea: { en: "Nausea / Vomiting", te: "వికారం / వాంతులు", hi: "मतली / उल्टी" },
    body_ache: { en: "Body Ache", te: "శరీర నొప్పి", hi: "शरीर में दर्द" },
    cough: { en: "Cold, Cough & Congestion", te: "జలుబు, దగ్గు మరియు ముక్కు దిబ్బడ", hi: "जुकाम, खांसी और नाक बंद" },
    stomach: { en: "Stomach Pain / Indigestion", te: "కడుపు నొప్పి / అజీర్ణం", hi: "पेट दर्द / अपच" },
    throat: { en: "Throat Pain / Sore Throat", te: "గొంతు నొప్పి", hi: "गले में दर्द" },
    weakness: { en: "Weakness & Body Fatigue", te: "బలహీనత మరియు శరీర అలసట", hi: "कमजोरी और शरीर में थकान" },
};

const CHIP_TRANSLATIONS = {
    "Pressure / Tightness": { te: "ఒత్తిడి / బిగుతు", hi: "दबाव / जकड़न" },
    "Sharp / Stabbing": { te: "తీవ్రమైన / గుచ్చుకునే నొప్పి", hi: "तेज़ / चुभने वाला दर्द" },
    Burning: { te: "మంట", hi: "जलन" },
    "Heavy / Squeezing": { te: "భారం / పిండుతున్నట్లు", hi: "भारीपन / दबाव जैसा" },
    "Arm / Shoulder": { te: "చేయి / భుజం", hi: "हाथ / कंधा" },
    "Jaw / Neck": { te: "దవడ / మెడ", hi: "जबड़ा / गर्दन" },
    Back: { te: "వెనుక భాగం", hi: "पीठ" },
    "Multiple Areas": { te: "అనేక ప్రాంతాలు", hi: "कई स्थान" },
    "Front Teeth": { te: "ముందు పళ్లు", hi: "आगे के दाँत" },
    "Back Teeth / Molars": { te: "వెనుక పళ్లు / మోలర్స్", hi: "पीछे के दाँत / मोलर्स" },
    "Upper Teeth": { te: "పై పళ్లు", hi: "ऊपर के दाँत" },
    "Lower Teeth": { te: "కింది పళ్లు", hi: "नीचे के दाँत" },
    "Gum Area": { te: "చిగుళ్ల ప్రాంతం", hi: "मसूड़ों का क्षेत्र" },
    Today: { te: "ఈరోజు", hi: "आज" },
    "More than 2 Weeks": { te: "2 వారాలకు పైగా", hi: "2 सप्ताह से अधिक" },
    "Left Side": { te: "ఎడమ వైపు", hi: "बाईं ओर" },
    "Right Side": { te: "కుడి వైపు", hi: "दाईं ओर" },
    "Both Sides": { te: "రెండు వైపులా", hi: "दोनों ओर" },
    "Upper Area": { te: "పై భాగం", hi: "ऊपरी भाग" },
    "Lower Area": { te: "కింది భాగం", hi: "निचला भाग" },
    "Not Applicable": { te: "వర్తించదు", hi: "लागू नहीं" },
    "Not Specific / Generalized": { te: "నిర్దిష్ట స్థానం లేదు / మొత్తం ప్రాంతం", hi: "विशिष्ट नहीं / पूरे क्षेत्र में" },
    "< 24 Hours": { te: "24 గంటలలోపు", hi: "24 घंटे से कम" },
    "1 - 3 Days": { te: "1 - 3 రోజులు", hi: "1 - 3 दिन" },
    "4 - 7 Days": { te: "4 - 7 రోజులు", hi: "4 - 7 दिन" },
    "1 - 2 Weeks": { te: "1 - 2 వారాలు", hi: "1 - 2 सप्ताह" },
    "1+ Month": { te: "1 నెలకు పైగా", hi: "1 महीने से अधिक" },
    "Chronic / Ongoing": { te: "దీర్ఘకాలిక / కొనసాగుతున్నది", hi: "पुरानी / जारी" },
    "Not Sure": { te: "తెలియదు", hi: "निश्चित नहीं" },
    "Took OTC Medicine (e.g. Paracetamol)": { te: "OTC మందు తీసుకున్నాను (ఉదా: పారాసెటమాల్)", hi: "OTC दवा ली (जैसे पैरासिटामोल)" },
    "Tried Home Remedies / Ice / Rest": { te: "ఇంటి చిట్కాలు / ఐస్ / విశ్రాంతి ప్రయత్నించాను", hi: "घरेलू उपचार / बर्फ / आराम किया" },
    "Consulted Another Doctor Recently": { te: "ఇటీవల మరొక వైద్యుడిని సంప్రదించాను", hi: "हाल ही में दूसरे डॉक्टर से परामर्श लिया" },
    "Applied Topical Gel / Cream": { te: "జెల్ / క్రీమ్ రాసుకున్నాను", hi: "जेल / क्रीम लगाई" },
    "Nothing Yet": { te: "ఇంకా ఏమీ చేయలేదు", hi: "अभी कुछ नहीं किया" },
    "No Regular Medications": { te: "క్రమం తప్పకుండా మందులు లేవు", hi: "कोई नियमित दवा नहीं" },
    "Blood Pressure Meds": { te: "రక్తపోటు మందులు", hi: "ब्लड प्रेशर की दवाएं" },
    "Diabetes Meds": { te: "డయాబెటిస్ మందులు", hi: "डायबिटीज की दवाएं" },
    "Other Prescriptions": { te: "ఇతర ప్రిస్క్రిప్షన్ మందులు", hi: "अन्य प्रिस्क्रिप्शन दवाएं" },
};

const SPECIFIC_QUESTIONS = {
    chest_character: { te: "ఛాతీ నొప్పి ఎలా ఉంది?", hi: "सीने में दर्द कैसा है?" },
    chest_radiation: { te: "ఈ నొప్పి ఇంకెక్కడికైనా వెళ్తుందా?", hi: "क्या यह दर्द कहीं और भी जाता है?" },
    breathlessness: { te: "శ్వాస తీసుకోవడంలో ఇబ్బందిగా ఉందా?", hi: "क्या सांस लेने में दिक्कत हो रही है?" },
    chest_sweating: { te: "ఈ నొప్పితో పాటు ఎక్కువగా చెమట పడుతోందా?", hi: "क्या इस दर्द के साथ ज्यादा पसीना आ रहा है?" },
    chest_dizziness: { te: "తల తిరుగుతోందా?", hi: "क्या चक्कर आ रहा है?" },
    chest_nausea: { te: "వికారం లేదా వాంతులు ఉన్నాయా?", hi: "क्या जी मिचला रहा है या उल्टी हो रही है?" },
    chest_exertional: { te: "నడిచినప్పుడు లేదా పని చేసినప్పుడు ఈ ఇబ్బంది వస్తుందా లేదా పెరుగుతుందా?", hi: "क्या चलने या काम करने से यह परेशानी होती या बढ़ती है?" },
    tooth_area: { te: "ఏ పంటికి లేదా ఏ చోట నొప్పి ఉంది?", hi: "किस दांत या किस जगह दर्द है?" },
    tooth_swelling: { te: "పంటి, చిగురు, చెంప లేదా దవడ దగ్గర వాపు ఉందా?", hi: "दांत, मसूड़े, गाल या जबड़े के पास सूजन है?" },
    tooth_sensitivity: { te: "వేడి లేదా చల్లగా తిన్నప్పుడు పంటి నొప్పి వస్తుందా?", hi: "गर्म या ठंडा खाने-पीने से दांत में दर्द होता है?" },
    tooth_fever: { te: "పంటి సమస్యతో పాటు జ్వరం లేదా చలి ఉందా?", hi: "दांत की समस्या के साथ बुखार या ठंड लग रही है?" },
    tooth_chewing: { te: "నమలేటప్పుడు లేదా కొరికేటప్పుడు నొప్పి పెరుగుతుందా?", hi: "चबाने या काटने से दर्द बढ़ता है?" },
    skin_onset: { te: "చర్మ సమస్య ఎప్పుడు మొదలైంది?", hi: "त्वचा की समस्या कब शुरू हुई?" },
    skin_itching: { te: "ఆ చోట దురద ఉందా?", hi: "क्या उस जगह खुजली है?" },
    skin_pain: { te: "ఆ చోట నొప్పి ఉందా లేదా తాకితే నొప్పిగా ఉందా?", hi: "क्या उस जगह दर्द है या छूने पर दर्द होता है?" },
    skin_spread: { te: "దద్దుర్లు ఇంకో చోటికి కూడా వస్తున్నాయా?", hi: "क्या दाने दूसरी जगह भी फैल रहे हैं?" },
    skin_exposure: { te: "కొత్త సబ్బు, క్రీమ్, మందు, ఆహారం లేదా ఇంకేదైనా వాడిన తర్వాత ఇది మొదలైందా?", hi: "क्या नया साबुन, क्रीम, दवा, खाना या कोई और चीज इस्तेमाल करने के बाद यह शुरू हुआ?" },
};

function translateChip(chip, language) {
    if (!chip) return chip;
    const code = normalizeQrLanguage(language);
    if (code === "en") return chip;

    if (chip === "Yes") return UI[code].yes;
    if (chip === "No") return UI[code].no;
    if (chip === "Not Sure") return UI[code].notSure;
    if (chip === "Mild") return UI[code].mild;
    if (chip === "Moderate") return UI[code].moderate;
    if (chip === "Severe") return UI[code].severe;
    if (chip === "Unsure") return UI[code].unsure;

    if (CHIP_TRANSLATIONS[chip]?.[code]) {
        return CHIP_TRANSLATIONS[chip][code];
    }

    const symptomId = Object.keys(SYMPTOMS).find(
        (id) => SYMPTOMS[id].en === chip
    );
    if (symptomId) return SYMPTOMS[symptomId][code];

    return chip;
}

export function toCanonicalChip(value, language) {
    if (!value) return value;
    const code = normalizeQrLanguage(language);
    if (code === "en") return value;

    for (const [english, translations] of Object.entries(CHIP_TRANSLATIONS)) {
        if (translations[code] === value) return english;
    }

    for (const [id, translations] of Object.entries(SYMPTOMS)) {
        if (translations[code] === value) return translations.en;
    }

    const simple = ["Yes", "No", "Not Sure", "Mild", "Moderate", "Severe", "Unsure"];
    for (const english of simple) {
        if (translateChip(english, code) === value) return english;
    }

    return value;
}

export function translateSymptomId(id, language) {
    const code = normalizeQrLanguage(language);
    return SYMPTOMS[id]?.[code] || id;
}

export function translateQuestionPrompt(field, intake, language) {
    const code = normalizeQrLanguage(language);
    if (code === "en") return null;
    if (SPECIFIC_QUESTIONS[field]?.[code]) return SPECIFIC_QUESTIONS[field][code];

    const map = {
        symptoms: intake?.symptoms?.length
            ? UI[code].otherSymptoms
            : UI[code].describeSymptoms,
        location: UI[code].locationQuestion,
        duration: UI[code].durationQuestion,
        recent_actions: UI[code].recentActionsQuestion,
        severity: UI[code].severityQuestion,
        current_medications: UI[code].medicationsQuestion,
    };

    return map[field] || UI[code].moreDetails;
}

export function formatLocalizedReviewSummary(intake, language) {
    const code = normalizeQrLanguage(language);
    if (code === "en") return null;

    const symptoms = intake?.symptoms?.length
        ? intake.symptoms.map((id) => translateSymptomId(id, code)).join(", ")
        : UI[code].noneReported;

    const lines = [
        `• ${UI[code].symptoms}: ${symptoms}`,
        intake?.location ? `• ${UI[code].location}: ${translateChip(intake.location, code)}` : null,
        intake?.duration ? `• ${UI[code].duration}: ${translateChip(intake.duration, code)}` : null,
        intake?.severity ? `• ${UI[code].severity}: ${translateChip(intake.severity.charAt(0).toUpperCase() + intake.severity.slice(1), code)}` : null,
        intake?.recent_actions ? `• ${UI[code].recentActions}: ${translateChip(intake.recent_actions, code)}` : null,
        intake?.current_medications ? `• ${UI[code].medications}: ${translateChip(intake.current_medications, code)}` : null,
        intake?.additional_notes ? `• ${UI[code].patientNotes}: ${intake.additional_notes}` : null,
    ].filter(Boolean);

    return lines.join("\n");
}

export function localizeDialogue(dialogue, language) {
    const code = normalizeQrLanguage(language);
    if (!dialogue) return dialogue;
    if (code === "en") return dialogue;

    let botMessage = dialogue.botMessage || "";
    const questionText = translateQuestionPrompt(
        dialogue.currentQuestionField,
        dialogue.intake,
        code
    );

    if (questionText) {
        botMessage = questionText;
    }

    if (dialogue.state === "REVIEW") {
        const summary = formatLocalizedReviewSummary(dialogue.intake, code);
        botMessage = `${UI[code].reviewIntro}\n\n${summary}\n\n${UI[code].reviewConfirm}`;
    }

    if (dialogue.isCritical) {
        botMessage = UI[code].urgentMessage;
    }

    if (dialogue.safetyResult?.status === "CAUTION" && !dialogue.isCritical) {
        botMessage = `${UI[code].caution}\n\n${botMessage}`;
    }

    return {
        ...dialogue,
        botMessage,
        quickChips: (dialogue.quickChips || []).map((chip) => translateChip(chip, code)),
    };
}

export function t(key, language = "en") {
    const code = normalizeQrLanguage(language);
    return UI[code]?.[key] ?? UI.en[key] ?? key;
}

export function translateDisplayValue(value, language) {
    return translateChip(value, language);
}

export const LANGUAGE_DISPLAY_NAMES = {
    English: "English",
    Telugu: "తెలుగు",
    Hindi: "हिन्दी",
};
