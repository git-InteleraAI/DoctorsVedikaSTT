const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const COLORS = {
    navy: '#102A43',
    blueTitle: '#0B4F8A',
    teal: '#00A6B4',
    tealDark: '#00838F',
    cyan: '#00B4D8',
    cyanLight: '#E0F7FA',
    textDark: '#1E293B',
    textMuted: '#64748B',
    border: '#CBD5E1',
    borderLight: '#E2E8F0',
    cardBg: '#FFFFFF',
    headerSoft: '#F0F9FF',
    softBlue: '#F1F7FC',
    pillDark: '#334155',
    white: '#FFFFFF',
    danger: '#EF4444',
    success: '#10B981',
};

const PAGE = {
    width: 595.28,
    height: 841.89,
    marginX: 36,
    contentWidth: 595.28 - 72,
    top: 76,
    bottom: 58,
    maxUsableY: 841.89 - 58,
};

function hasValue(val) {
    if (val === undefined || val === null) return false;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed !== '' && trimmed !== '-' && trimmed !== '—' && !trimmed.toLowerCase().startsWith('not documented') && !trimmed.toLowerCase().startsWith('not reported');
    }
    if (Array.isArray(val)) {
        return val.filter(hasValue).length > 0;
    }
    if (typeof val === 'object') {
        return Object.values(val).some(hasValue);
    }
    return true;
}

function cleanString(val, fallback = '') {
    if (!hasValue(val)) return fallback;
    if (typeof val === 'string') return val.trim();
    if (Array.isArray(val)) {
        return val.map((v) => cleanString(v, '')).filter(Boolean).join(', ');
    }
    if (typeof val === 'object') {
        return Object.entries(val)
            .filter(([, v]) => hasValue(v))
            .map(([k, v]) => `${k}: ${cleanString(v, '')}`)
            .join(' | ');
    }
    return String(val);
}

function getFirst(...values) {
    for (const v of values) {
        if (hasValue(v)) return v;
    }
    return '';
}

function safeFilePart(value) {
    return String(value || 'patient')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'patient';
}

function resolveLogoPath() {
    const candidates = [
        path.join(__dirname, '..', 'assets', 'doctors-vedika-logo.png'),
        path.join(__dirname, '..', 'data', 'assests', 'doctors-vedika-logo.png'),
        path.join(__dirname, '..', '..', 'frontend', 'public', 'images', 'logo.png'),
        path.join(__dirname, '..', '..', 'frontend', 'dist', 'images', 'logo.png'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

async function generateMedicalReportPdf(patientRecord, patientFolder) {
    if (!patientRecord || !patientRecord.patientId) {
        throw new Error('patientRecord.patientId is required to generate the PDF.');
    }

    fs.mkdirSync(patientFolder, { recursive: true });

    const safeName = safeFilePart(patientRecord.patientName);
    const consultationId = patientRecord.consultationId || `consultation-${Date.now()}`;
    const fileName = `${consultationId}-${safeName}.pdf`;
    const filePath = path.join(patientFolder, fileName);

    const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true,
        autoFirstPage: false,
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Register Universal Indic & Latin Unicode TrueType font (Nirmala UI supports Telugu, Hindi/Devanagari, Tamil, etc.)
    const bundledNirmala = path.join(__dirname, '..', 'fonts', 'Nirmala.ttc');
    const systemNirmala = 'C:\\Windows\\Fonts\\Nirmala.ttc';
    const nirmalaPath = fs.existsSync(bundledNirmala) ? bundledNirmala : (fs.existsSync(systemNirmala) ? systemNirmala : null);

    const segoeRegular = 'C:\\Windows\\Fonts\\segoeui.ttf';
    const segoeBold = 'C:\\Windows\\Fonts\\segoeuib.ttf';
    const arialRegular = 'C:\\Windows\\Fonts\\arial.ttf';
    const arialBold = 'C:\\Windows\\Fonts\\arialbd.ttf';

    let fontRegular = 'Helvetica';
    let fontBold = 'Helvetica-Bold';

    if (nirmalaPath && fs.existsSync(nirmalaPath)) {
        try {
            doc.registerFont('AppRegular', nirmalaPath, 'NirmalaUI');
            doc.registerFont('AppBold', nirmalaPath, 'NirmalaUI-Bold');
            fontRegular = 'AppRegular';
            fontBold = 'AppBold';
            console.log('[PDF] Registered bundled Nirmala font successfully for Telugu & Hindi support.');
        } catch (fontErr) {
            console.warn('[PDF] Nirmala font registration warning:', fontErr.message);
        }
    } else if (fs.existsSync(segoeRegular)) {
        try {
            doc.registerFont('AppRegular', segoeRegular);
            if (fs.existsSync(segoeBold)) doc.registerFont('AppBold', segoeBold);
            fontRegular = 'AppRegular';
            fontBold = fs.existsSync(segoeBold) ? 'AppBold' : 'AppRegular';
        } catch {}
    } else if (fs.existsSync(arialRegular)) {
        try {
            doc.registerFont('AppRegular', arialRegular);
            if (fs.existsSync(arialBold)) doc.registerFont('AppBold', arialBold);
            fontRegular = 'AppRegular';
            fontBold = fs.existsSync(arialBold) ? 'AppBold' : 'AppRegular';
        } catch {}
    }

    const logoPath = resolveLogoPath();
    const s = patientRecord.summary || {};

    // Normalize data fields
    const chiefComplaint = getFirst(s.chief_complaint, s.chiefComplaint, s.chief_complaints, s.chiefComplaints);
    const overview = getFirst(s.consultation_overview, s.consultationOverview, s.overview);
    const historyOfIllness = getFirst(s.history_of_present_illness, s.historyOfPresentIllness, s.history);
    const symptoms = getFirst(s.symptoms, s.presenting_symptoms, s.presentingSymptoms);
    const pastHistory = getFirst(s.past_medical_history, s.pastMedicalHistory);
    const allergies = getFirst(s.allergies, patientRecord.patient?.allergies);
    const currentMeds = getFirst(s.current_medications, s.currentMedications);
    const examination = getFirst(s.examination_findings, s.examinationFindings, s.examination);
    const vitalsData = s.vital_signs || s.vitalSigns || {};
    const investigations = getFirst(s.investigations);
    const assessment = getFirst(s.assessment);
    const diagnosis = getFirst(patientRecord.diagnosis, s.diagnosis, s.possible_diagnosis, s.possibleDiagnosis);
    const diffDiagnosis = getFirst(s.differential_diagnosis, s.differentialDiagnosis);
    const treatmentPlan = getFirst(s.treatment_plan, s.treatmentPlan);
    const advice = getFirst(s.advice, s.general_advice, s.generalAdvice);
    const followUp = getFirst(s.follow_up, s.followUp);
    const doctorNotes = getFirst(s.doctor_notes, s.doctorNotes, s.notes, s.clinical_notes, s.clinicalNotes);
    const redFlags = getFirst(s.red_flags, s.redFlags);

    const prescriptionMeds = Array.isArray(patientRecord.prescription?.medications)
        ? patientRecord.prescription.medications
        : Array.isArray(patientRecord.medications) && patientRecord.medications.length
            ? patientRecord.medications
            : Array.isArray(s.medicines)
                ? s.medicines
                : Array.isArray(s.medications_discussed)
                    ? s.medications_discussed
                    : [];

    const transcriptItems = Array.isArray(patientRecord.transcript)
        ? patientRecord.transcript.filter((t) => hasValue(t?.text))
        : [];

    // Helper functions for page management
    function startNewPage(isFirstPage = false) {
        doc.addPage({ size: 'A4', margin: 0 });
        drawHeader(isFirstPage);
    }

    function checkPageBreak(requiredHeight = 35) {
        if (doc.y + requiredHeight > PAGE.maxUsableY) {
            startNewPage(false);
            return true;
        }
        return false;
    }

    function drawHeader(isFirstPage = false) {
        const topY = 20;
        const leftX = PAGE.marginX;

        // Logo
        if (logoPath) {
            try {
                doc.image(logoPath, leftX, topY, { fit: [36, 36] });
            } catch {
                // fallback
            }
        }

        // Branding
        const brandX = logoPath ? leftX + 42 : leftX;
        doc.fillColor(COLORS.navy).font(fontBold).fontSize(13)
            .text('DOCTORS VEDIKA', brandX, topY + 2);
        doc.fillColor(COLORS.teal).font(fontBold).fontSize(8)
            .text('AI Powered Care', brandX, topY + 17);

        // Page 1 Title on Right
        if (isFirstPage) {
            const titleWidth = 240;
            const titleX = PAGE.width - PAGE.marginX - titleWidth;
            doc.fillColor(COLORS.navy).font(fontBold).fontSize(11.5)
                .text('AI CONSULTATION REPORT', titleX, topY + 2, { width: titleWidth, align: 'right' });
            doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(10.5)
                .text('& PRESCRIPTION', titleX, topY + 16, { width: titleWidth, align: 'right' });
        }

        // Horizontal teal separator line
        doc.strokeColor(COLORS.teal).lineWidth(1)
            .moveTo(PAGE.marginX, 60).lineTo(PAGE.width - PAGE.marginX, 60).stroke();

        doc.y = PAGE.top;
        doc.x = PAGE.marginX;
    }

    // Start First Page
    startNewPage(true);

    // =========================================================================
    // SECTION: PATIENT & CONSULTATION DETAILS CARD
    // =========================================================================
    function drawPatientDetailsCard() {
        const cardX = PAGE.marginX;
        const cardY = doc.y;
        const cardW = PAGE.contentWidth;
        const cardH = 82;

        // Outer border
        doc.roundedRect(cardX, cardY, cardW, cardH, 6)
            .strokeColor(COLORS.border)
            .lineWidth(0.8)
            .stroke();

        // Card header icon & title
        doc.circle(cardX + 15, cardY + 14, 5.5).fillColor(COLORS.cyanLight).fill();
        doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(7.5)
            .text('P', cardX + 12.5, cardY + 10.5);

        doc.fillColor(COLORS.navy).font(fontBold).fontSize(8)
            .text('PATIENT & CONSULTATION DETAILS', cardX + 26, cardY + 10.5);

        // Header divider
        doc.strokeColor(COLORS.borderLight).lineWidth(0.5)
            .moveTo(cardX + 10, cardY + 24).lineTo(cardX + cardW - 10, cardY + 24).stroke();

        const col1X = cardX + 12;
        const col1LabelW = 78;
        const col1ValX = col1X + col1LabelW;
        const col1ValW = (cardW / 2) - col1LabelW - 8;

        const col2X = cardX + (cardW / 2) + 6;
        const col2LabelW = 82;
        const col2ValX = col2X + col2LabelW;
        const col2ValW = (cardW / 2) - col2LabelW - 12;

        const patientName = cleanString(patientRecord.patientName, 'Patient');
        const patientId = cleanString(patientRecord.patientId, '-');
        const age = patientRecord.patient?.age ? `${patientRecord.patient.age} Y` : (patientRecord.age ? `${patientRecord.age} Y` : '');
        const gender = patientRecord.patient?.gender || patientRecord.gender || '';
        const ageGender = [age, gender].filter(Boolean).join(' / ') || '-';
        const appointmentId = cleanString(patientRecord.appointmentId, '1');

        const doctorId = cleanString(patientRecord.doctorId, 'default-doctor');
        const dateStr = cleanString(patientRecord.consultationDate, new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
        const timeStr = cleanString(patientRecord.consultationTime, new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
        const consultType = patientRecord.type || 'General Consultation';

        const rowY1 = cardY + 30;
        const rowY2 = cardY + 42;
        const rowY3 = cardY + 54;
        const rowY4 = cardY + 66;

        const printPair = (lbl, val, lx, vx, vw, y) => {
            doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.2).text(lbl, lx, y);
            doc.fillColor(COLORS.navy).font(fontRegular).fontSize(7.2).text(`:  ${val}`, vx, y, { width: vw, lineBreak: false });
        };

        printPair('Patient Name', patientName, col1X, col1ValX, col1ValW, rowY1);
        printPair('Patient ID', patientId, col1X, col1ValX, col1ValW, rowY2);
        printPair('Age / Gender', ageGender, col1X, col1ValX, col1ValW, rowY3);
        printPair('Appointment ID', appointmentId, col1X, col1ValX, col1ValW, rowY4);

        printPair('Doctor ID', doctorId, col2X, col2ValX, col2ValW, rowY1);
        printPair('Date', dateStr, col2X, col2ValX, col2ValW, rowY2);
        printPair('Time', timeStr, col2X, col2ValX, col2ValW, rowY3);
        printPair('Consultation Type', consultType, col2X, col2ValX, col2ValW, rowY4);

        doc.y = cardY + cardH + 8;
    }

    drawPatientDetailsCard();

    // =========================================================================
    // SECTION BUILDERS (Page-Safe Modular Design)
    // =========================================================================
    function drawSectionHeader(title, iconText) {
        checkPageBreak(36);
        const cardX = PAGE.marginX;
        const startY = doc.y;

        doc.circle(cardX + 12, startY + 8, 5).fillColor(COLORS.cyanLight).fill();
        doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(7.2)
            .text(iconText || '•', cardX + 9.5, startY + 4.8);

        doc.fillColor(COLORS.navy).font(fontBold).fontSize(8.2)
            .text(title.toUpperCase(), cardX + 22, startY + 4.8);

        doc.strokeColor(COLORS.borderLight).lineWidth(0.5)
            .moveTo(cardX, startY + 16).lineTo(cardX + PAGE.contentWidth, startY + 16).stroke();

        doc.y = startY + 20;
        doc.x = cardX + 6;
    }

    function drawFieldBlock(label, val, contentW = PAGE.contentWidth - 12) {
        if (!hasValue(val)) return;
        const text = cleanString(val);
        const textH = doc.heightOfString(text, { width: contentW, font: fontRegular, fontSize: 7.4, lineGap: 1.5 });
        checkPageBreak(textH + 18);

        const curX = PAGE.marginX + 6;
        doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5)
            .text(label, curX, doc.y, { width: contentW });
        doc.y += 2;
        doc.fillColor(COLORS.textDark).font(fontRegular).fontSize(7.4)
            .text(text, curX, doc.y, { width: contentW, lineGap: 1.5 });
        doc.y += 5;
    }

    function drawBulletsBlock(items, contentW = PAGE.contentWidth - 12) {
        const list = Array.isArray(items) ? items : String(items || '').split(/\n|•/).map((x) => x.trim()).filter(Boolean);
        if (!list.length) return;

        const curX = PAGE.marginX + 6;
        list.forEach((item) => {
            if (!hasValue(item)) return;
            const text = cleanString(item);
            const textH = doc.heightOfString(text, { width: contentW - 12, font: fontRegular, fontSize: 7.4, lineGap: 1.5 });
            checkPageBreak(textH + 6);

            const rowY = doc.y;
            doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(7.5).text('• ', curX, rowY);
            doc.fillColor(COLORS.textDark).font(fontRegular).fontSize(7.4).text(text, curX + 10, rowY, { width: contentW - 10, lineGap: 1.5 });
            doc.y = rowY + Math.max(12, textH + 3);
        });
        doc.y += 2;
    }

    // =========================================================================
    // 1. CONSULTATION OVERVIEW (Only if filled)
    // =========================================================================
    const hasOverview = hasValue(chiefComplaint) || hasValue(overview) || hasValue(historyOfIllness);
    if (hasOverview) {
        drawSectionHeader('1. Consultation Overview', '1');
        if (hasValue(chiefComplaint)) {
            drawFieldBlock('Chief Complaint', chiefComplaint);
        }
        if (hasValue(overview)) {
            drawFieldBlock('Consultation Overview', overview);
        }
        if (hasValue(historyOfIllness)) {
            drawFieldBlock('History of Present Illness', historyOfIllness);
        }
        doc.y += 4;
    }

    // =========================================================================
    // 2. PATIENT HISTORY & OBSERVATIONS (Only if filled)
    // =========================================================================
    const hasHistory = hasValue(symptoms) || hasValue(pastHistory) || hasValue(allergies) || hasValue(currentMeds);
    if (hasHistory) {
        drawSectionHeader('2. Patient History & Symptoms', '2');
        if (hasValue(symptoms)) {
            const sympList = Array.isArray(symptoms) ? symptoms : [symptoms];
            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5).text('Symptoms Reported', PAGE.marginX + 6, doc.y);
            doc.y += 2;
            drawBulletsBlock(sympList);
        }
        if (hasValue(pastHistory)) {
            const pastList = Array.isArray(pastHistory) ? pastHistory : [pastHistory];
            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5).text('Past Medical History', PAGE.marginX + 6, doc.y);
            doc.y += 2;
            drawBulletsBlock(pastList);
        }
        if (hasValue(allergies)) {
            const allList = Array.isArray(allergies) ? allergies : [allergies];
            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5).text('Known Allergies', PAGE.marginX + 6, doc.y);
            doc.y += 2;
            drawBulletsBlock(allList);
        }
        if (hasValue(currentMeds)) {
            const curList = Array.isArray(currentMeds) ? currentMeds : [currentMeds];
            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5).text('Pre-existing Regular Medications', PAGE.marginX + 6, doc.y);
            doc.y += 2;
            drawBulletsBlock(curList);
        }
        doc.y += 4;
    }

    // =========================================================================
    // 3. CLINICAL EXAMINATION & VITALS (Only if filled)
    // =========================================================================
    const vitalsList = [
        ['Blood Pressure', vitalsData.blood_pressure || vitalsData.bloodPressure || vitalsData.bp],
        ['Heart Rate', vitalsData.heart_rate || vitalsData.heartRate || vitalsData.pulse],
        ['Temperature', vitalsData.temperature || vitalsData.temp],
        ['Oxygen Saturation', vitalsData.oxygen_saturation || vitalsData.oxygenSaturation || vitalsData.spo2],
        ['Respiratory Rate', vitalsData.respiratory_rate || vitalsData.respiratoryRate],
        ['Weight', vitalsData.weight],
    ].filter(([, v]) => hasValue(v));

    const hasExam = hasValue(examination) || vitalsList.length > 0 || hasValue(investigations);
    if (hasExam) {
        drawSectionHeader('3. Clinical Examination & Vitals', '3');

        if (hasValue(examination)) {
            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5).text('Physical Examination Findings', PAGE.marginX + 6, doc.y);
            doc.y += 2;
            drawBulletsBlock(Array.isArray(examination) ? examination : [examination]);
        }

        // Vitals Grid
        if (vitalsList.length > 0) {
            checkPageBreak(40);
            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5).text('Recorded Vital Signs', PAGE.marginX + 6, doc.y);
            doc.y += 4;

            const gridStartX = PAGE.marginX + 6;
            const gridW = PAGE.contentWidth - 12;
            const numCols = Math.min(3, vitalsList.length);
            const boxW = (gridW - (numCols - 1) * 8) / numCols;
            const boxH = 22;

            for (let i = 0; i < vitalsList.length; i += numCols) {
                checkPageBreak(boxH + 4);
                const rowItems = vitalsList.slice(i, i + numCols);
                const rowY = doc.y;

                rowItems.forEach(([lbl, val], colIdx) => {
                    const bx = gridStartX + colIdx * (boxW + 8);
                    doc.roundedRect(bx, rowY, boxW, boxH, 4)
                        .fillColor(COLORS.softBlue)
                        .fill();
                    doc.roundedRect(bx, rowY, boxW, boxH, 4)
                        .strokeColor(COLORS.borderLight)
                        .lineWidth(0.5)
                        .stroke();

                    doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.5)
                        .text(lbl, bx + 5, rowY + 3, { width: boxW - 10 });
                    doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.5)
                        .text(cleanString(val), bx + 5, rowY + 11, { width: boxW - 10 });
                });

                doc.y = rowY + boxH + 6;
            }
        }

        if (hasValue(investigations)) {
            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5).text('Investigations / Diagnostic Tests', PAGE.marginX + 6, doc.y);
            doc.y += 2;
            drawBulletsBlock(Array.isArray(investigations) ? investigations : [investigations]);
        }
        doc.y += 4;
    }

    // =========================================================================
    // 4. CLINICAL ASSESSMENT & PLAN (Only if filled)
    // =========================================================================
    const planItems = [
        ['Assessment', assessment],
        ['Diagnosis', Array.isArray(diagnosis) ? diagnosis.join(', ') : diagnosis],
        ['Differential Diagnosis', diffDiagnosis],
        ['Treatment Plan', treatmentPlan],
    ].filter(([, v]) => hasValue(v));

    if (planItems.length > 0) {
        drawSectionHeader('4. Clinical Assessment & Diagnosis', '4');
        const pillW = 95;
        const valW = PAGE.contentWidth - pillW - 20;

        planItems.forEach(([lbl, val]) => {
            const valText = cleanString(val);
            const textH = doc.heightOfString(valText, { width: valW, font: fontRegular, fontSize: 7.4, lineGap: 1.5 });
            const rowH = Math.max(16, textH + 4);
            checkPageBreak(rowH + 6);

            const rowY = doc.y;
            const contentX = PAGE.marginX + 6;

            doc.roundedRect(contentX, rowY, pillW, Math.min(rowH, 16), 3)
                .fillColor(COLORS.softBlue)
                .fill();
            doc.roundedRect(contentX, rowY, pillW, Math.min(rowH, 16), 3)
                .strokeColor(COLORS.borderLight)
                .lineWidth(0.5)
                .stroke();

            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.2)
                .text(lbl, contentX + 4, rowY + 3.5, { width: pillW - 8 });

            doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.2)
                .text(':', contentX + pillW + 2, rowY + 3.5);

            doc.fillColor(COLORS.textDark).font(fontRegular).fontSize(7.4)
                .text(valText, contentX + pillW + 10, rowY + 3.5, { width: valW, lineGap: 1.5 });

            doc.y = rowY + rowH + 3;
        });
        doc.y += 4;
    }

    // =========================================================================
    // 5. ADVICE & FOLLOW-UP (Only if filled)
    // =========================================================================
    const hasAdvice = hasValue(advice) || hasValue(followUp) || hasValue(doctorNotes) || hasValue(redFlags);
    if (hasAdvice) {
        drawSectionHeader('5. Medical Advice & Follow-Up', '5');
        if (hasValue(advice)) {
            doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7.5).text('Doctor Advice', PAGE.marginX + 6, doc.y);
            doc.y += 2;
            drawBulletsBlock(advice);
        }
        if (hasValue(followUp)) {
            drawFieldBlock('Follow-up Review', followUp);
        }
        if (hasValue(doctorNotes)) {
            drawFieldBlock('Doctor Clinical Notes', doctorNotes);
        }
        if (hasValue(redFlags)) {
            drawFieldBlock('Red Flags / Warning Signs', redFlags);
        }
        doc.y += 4;
    }

    // =========================================================================
    // 6. PRESCRIPTION TABLE (Page-Safe Row by Row)
    // =========================================================================
    if (prescriptionMeds.length > 0) {
        drawSectionHeader('6. Prescription', 'Rx');
        const contentW = PAGE.contentWidth;
        const tableX = PAGE.marginX;
        const cols = [0.08, 0.28, 0.16, 0.16, 0.14, 0.18].map((p) => contentW * p);
        const headers = ['S. No.', 'Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions'];

        const drawTableHeader = () => {
            const hY = doc.y;
            doc.rect(tableX, hY, contentW, 16).fillColor(COLORS.softBlue).fill();
            doc.rect(tableX, hY, contentW, 16).strokeColor(COLORS.borderLight).lineWidth(0.5).stroke();

            let curX = tableX;
            headers.forEach((h, idx) => {
                doc.fillColor(COLORS.navy).font(fontBold).fontSize(7)
                    .text(h, curX + 4, hY + 4, { width: cols[idx] - 8, align: idx === 0 ? 'center' : 'left' });
                curX += cols[idx];
            });
            doc.y = hY + 16;
        };

        checkPageBreak(36);
        drawTableHeader();

        prescriptionMeds.forEach((med, mIdx) => {
            const values = [
                `${mIdx + 1}`,
                cleanString(med.name, 'Medicine'),
                cleanString(med.dosage, '-'),
                cleanString(med.frequency, '-'),
                cleanString(med.duration, '-'),
                cleanString(med.instructions, '-'),
            ];

            const heights = values.map((v, i) => doc.heightOfString(v, {
                width: cols[i] - 8,
                font: fontRegular,
                fontSize: 7.2,
            }));
            const rowH = Math.max(16, Math.max(...heights) + 5);

            if (checkPageBreak(rowH + 4)) {
                drawTableHeader();
            }

            const rowY = doc.y;
            doc.rect(tableX, rowY, contentW, rowH).strokeColor(COLORS.borderLight).lineWidth(0.5).stroke();

            let rx = tableX;
            values.forEach((v, i) => {
                doc.fillColor(COLORS.textDark).font(i === 1 ? fontBold : fontRegular).fontSize(7.2)
                    .text(v, rx + 4, rowY + 3.5, { width: cols[i] - 8, align: i === 0 ? 'center' : 'left' });
                rx += cols[i];
            });

            doc.y = rowY + rowH;
        });

        doc.y += 6;

        // Important Note Callout Box
        checkPageBreak(26);
        const calloutY = doc.y;
        doc.roundedRect(tableX, calloutY, contentW, 20, 3)
            .fillColor(COLORS.softBlue)
            .fill();
        doc.roundedRect(tableX, calloutY, contentW, 20, 3)
            .strokeColor(COLORS.borderLight)
            .lineWidth(0.5)
            .stroke();

        doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7)
            .text('Important Note', tableX + 6, calloutY + 3);
        doc.fillColor(COLORS.textDark).font(fontRegular).fontSize(6.6)
            .text('This prescription is based on the current consultation only. Do not self-medicate. Consult again if symptoms persist or worsen.', tableX + 6, calloutY + 10.5, { width: contentW - 12 });

        doc.y = calloutY + 26;
    }

    // =========================================================================
    // 7. CONSULTATION TRANSCRIPT (Clean 2-Column Dialogue Layout)
    // =========================================================================
    if (transcriptItems.length > 0) {
        checkPageBreak(45);
        const cardX = PAGE.marginX;
        const cardW = PAGE.contentWidth;

        // Card header banner
        drawSectionHeader('7. Consultation Transcript', '7');

        const colSpeakerW = 76;
        const colTextW = cardW - colSpeakerW - 20;

        transcriptItems.forEach((t, tIdx) => {
            const speaker = cleanString(t.speaker, 'Speaker');
            const timestamp = t.timestamp ? `[${t.timestamp}]` : '';
            const text = cleanString(t.text);
            if (!text) return;

            // Accurately measure required height for the dialogue text
            const textH = doc.heightOfString(text, {
                width: colTextW,
                font: fontRegular,
                fontSize: 7.5,
                lineGap: 1.5,
            });

            const rowHeight = Math.max(18, textH + 8);

            // Trigger clean page break BEFORE drawing this dialogue entry
            checkPageBreak(rowHeight + 4);

            const curY = doc.y;
            const curX = cardX + 10;

            // Speaker & Timestamp on Left Column
            const isDoctor = speaker.toLowerCase().includes('doctor');
            doc.fillColor(isDoctor ? COLORS.navy : COLORS.tealDark)
                .font(fontBold)
                .fontSize(7.5)
                .text(speaker, curX, curY, { width: colSpeakerW - 6 });

            if (timestamp) {
                doc.fillColor(COLORS.textMuted)
                    .font(fontRegular)
                    .fontSize(6.8)
                    .text(timestamp, curX, curY + 9, { width: colSpeakerW - 6 });
            }

            // Dialogue Text on Right Column (Full Width)
            doc.fillColor(COLORS.textDark)
                .font(fontRegular)
                .fontSize(7.5)
                .text(text, curX + colSpeakerW, curY, {
                    width: colTextW,
                    lineGap: 1.5,
                });

            // Advance Y by exact measured height
            doc.y = curY + rowHeight;

            // Subtle divider between dialogue entries
            if (tIdx < transcriptItems.length - 1) {
                doc.strokeColor(COLORS.borderLight)
                    .lineWidth(0.4)
                    .moveTo(curX, doc.y - 2)
                    .lineTo(curX + cardW - 20, doc.y - 2)
                    .stroke();
            }
        });

        doc.y += 8;
    }

    // =========================================================================
    // 8. DOCTOR CONFIRMATION CARD
    // =========================================================================
    checkPageBreak(70);
    const confCardX = PAGE.marginX;
    const confCardW = PAGE.contentWidth;
    const confStartY = doc.y;

    drawSectionHeader('8. Doctor Confirmation', '8');

    doc.fillColor(COLORS.textDark).font(fontRegular).fontSize(7.2)
        .text('This document contains the consultation information reviewed and approved by the treating doctor.', confCardX + 12, doc.y, { width: confCardW - 24 });
    doc.y += 10;

    const confirmY = doc.y;
    const leftW = confCardW - 130;

    // Left: Signature & Date lines
    doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.5)
        .text('Doctor Signature  :', confCardX + 12, confirmY + 8);
    doc.strokeColor(COLORS.border).lineWidth(0.7)
        .moveTo(confCardX + 90, confirmY + 15).lineTo(confCardX + leftW - 15, confirmY + 15).stroke();

    const dateFormatted = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.5)
        .text('Date', confCardX + 12, confirmY + 24, { continued: true });
    doc.font(fontRegular).text(`                       :  ${dateFormatted}`);

    // Right: Dashed stamp box
    const stampW = 110;
    const stampH = 40;
    const stampX = confCardX + confCardW - stampW - 12;
    const stampY = confirmY;

    doc.roundedRect(stampX, stampY, stampW, stampH, 4)
        .dash(2.5, { space: 2 })
        .strokeColor(COLORS.border)
        .stroke()
        .undash();

    doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.8)
        .text('(Signature & Stamp)', stampX, stampY + 16, { width: stampW, align: 'center' });

    doc.y = confirmY + stampH + 8;

    // Disclaimer box
    const discY = doc.y;
    doc.roundedRect(confCardX + 12, discY, confCardW - 24, 22, 3)
        .fillColor(COLORS.softBlue)
        .fill();
    doc.roundedRect(confCardX + 12, discY, confCardW - 24, 22, 3)
        .strokeColor(COLORS.borderLight)
        .stroke();

    doc.fillColor(COLORS.blueTitle).font(fontBold).fontSize(7)
        .text('Disclaimer', confCardX + 18, discY + 3);
    doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.5)
        .text('This report is generated based on the consultation and is intended for clinical use only. It is confidential and should not be shared without permission.', confCardX + 18, discY + 11.5, { width: confCardW - 36 });

    doc.y = discY + 28;

    // =========================================================================
    // TWO-PASS FOOTER RENDERING (Page X of Y on all pages)
    // =========================================================================
    const range = doc.bufferedPageRange();
    const totalPages = range.count;

    for (let i = 0; i < totalPages; i += 1) {
        doc.switchToPage(i);

        const footerLineY = PAGE.height - 44;

        // Separator line
        doc.strokeColor(COLORS.teal).lineWidth(0.8)
            .moveTo(PAGE.marginX, footerLineY).lineTo(PAGE.width - PAGE.marginX, footerLineY).stroke();

        // Footer 3 Columns
        const footTextY = footerLineY + 5;
        const colW = PAGE.contentWidth / 3;

        // Col 1: Clinic location
        doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.5)
            .text('Doctors Vedika Clinic', PAGE.marginX, footTextY, { width: colW })
            .text('Hyderabad, Telangana, India', PAGE.marginX, footTextY + 7.5, { width: colW });

        // Col 2: Web & Email
        doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.5)
            .text('www.doctorsvedika.com', PAGE.marginX + colW, footTextY, { width: colW, align: 'center' })
            .text('care@doctorsvedika.com', PAGE.marginX + colW, footTextY + 7.5, { width: colW, align: 'center' });

        // Col 3: Phone
        doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.5)
            .text('+91 91234 56789', PAGE.marginX + colW * 2, footTextY + 3.5, { width: colW, align: 'right' });

        // Page Number Pill at very bottom center
        const pillW = 56;
        const pillH = 13;
        const pillX = (PAGE.width - pillW) / 2;
        const pillY = PAGE.height - 22;

        doc.roundedRect(pillX, pillY, pillW, pillH, 6.5)
            .fillColor(COLORS.pillDark)
            .fill();

        doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(6.5)
            .text(`Page ${i + 1} of ${totalPages}`, pillX, pillY + 3, { width: pillW, align: 'center' });
    }

    doc.end();

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
        doc.on('error', reject);
    });

    const stat = fs.statSync(filePath);
    if (!stat.size) throw new Error('Generated PDF is empty.');

    return { filePath, fileName, size: stat.size, totalPages };
}

module.exports = { generateMedicalReportPdf };
