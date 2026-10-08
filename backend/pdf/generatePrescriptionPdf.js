const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const {
    translateIndication,
    translateDosage,
    translateTiming,
    translateFoodTiming,
    translateDuration,
} = require('../services/translationService');

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
        return trimmed !== '' && trimmed !== '-' && trimmed !== '—' && !trimmed.toLowerCase().startsWith('not documented');
    }
    if (Array.isArray(val)) return val.filter(hasValue).length > 0;
    if (typeof val === 'object') return Object.values(val).some(hasValue);
    return true;
}

function cleanString(val, fallback = '') {
    if (!hasValue(val)) return fallback;
    if (typeof val === 'string') return val.trim();
    if (Array.isArray(val)) return val.map(v => cleanString(v, '')).filter(Boolean).join(', ');
    return String(val);
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

function formatISTDate(rawDate) {
    if (!hasValue(rawDate)) {
        return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    }
    const str = String(rawDate).trim();
    if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(str)) return str;
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    }
    return str;
}

function formatISTTime(rawTime, fallbackTimestamp) {
    if (hasValue(rawTime) && !String(rawTime).includes('05:30')) {
        const str = String(rawTime).trim();
        if (/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(str)) return str;
        const dTime = new Date(str);
        if (!isNaN(dTime.getTime())) {
            return dTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        }
    }
    if (fallbackTimestamp) {
        const d = new Date(fallbackTimestamp);
        if (!isNaN(d.getTime())) {
            return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        }
    }
    return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

function frequencyToTime(frequency) {
    if (!frequency) return '—';
    const normalized = String(frequency).trim().toLowerCase();
    const map = {
        '1-0-0': 'Morning',
        '0-1-0': 'Afternoon',
        '0-0-1': 'Night',
        '1-0-1': 'Morning, Night',
        '1-1-0': 'Morning, Afternoon',
        '0-1-1': 'Afternoon, Night',
        '1-1-1': 'Morning, Afternoon, Night',
        '2-0-2': 'Morning, Night',
        '2-2-2': 'Morning, Afternoon, Night',
    };
    if (map[normalized]) return map[normalized];
    if (normalized.includes('sos') || normalized.includes('as needed')) return 'As needed';
    return frequency;
}

function renderPrescriptionPdfToStream(patientRecord, stream) {
    const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true,
        autoFirstPage: false,
    });

    doc.pipe(stream);

    const logoPath = resolveLogoPath();

    // Universal TrueType font support
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
        } catch (fontErr) {}
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

    /* ==================== HEADER ==================== */
    function drawHeader(isFirstPage = false) {
        const topY = 20;
        const leftX = PAGE.marginX;

        if (logoPath) {
            try {
                doc.image(logoPath, leftX, topY, { fit: [36, 36] });
            } catch {}
        }

        const brandX = logoPath ? leftX + 42 : leftX;
        doc.fillColor(COLORS.navy).font(fontBold).fontSize(13).text('DOCTORS VEDIKA', brandX, topY + 2);
        doc.fillColor(COLORS.teal).font(fontBold).fontSize(8).text('AI Powered Care', brandX, topY + 17);

        if (isFirstPage) {
            const titleWidth = 260;
            const titleX = PAGE.width - PAGE.marginX - titleWidth;
            doc.fillColor(COLORS.navy).font(fontBold).fontSize(11.5).text('OFFICIAL MEDICAL PRESCRIPTION', titleX, topY + 2, { width: titleWidth, align: 'right' });
            doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(10.5).text('& TREATMENT PLAN', titleX, topY + 16, { width: titleWidth, align: 'right' });
        }

        doc.strokeColor(COLORS.teal).lineWidth(1).moveTo(PAGE.marginX, 60).lineTo(PAGE.width - PAGE.marginX, 60).stroke();

        doc.y = PAGE.top;
        doc.x = PAGE.marginX;
    }

    startNewPage(true);

    /* ==================== PATIENT & CLINICAL DETAILS CARD ==================== */
    const cardX = PAGE.marginX;
    const cardY = doc.y;
    const cardW = PAGE.contentWidth;
    const cardH = 94;

    doc.roundedRect(cardX, cardY, cardW, cardH, 6).strokeColor(COLORS.border).lineWidth(0.8).stroke();
    doc.circle(cardX + 15, cardY + 14, 5.5).fillColor(COLORS.cyanLight).fill();
    doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(7.5).text('P', cardX + 12.5, cardY + 10.5);
    doc.fillColor(COLORS.navy).font(fontBold).fontSize(8).text('PATIENT & PRESCRIPTION DETAILS', cardX + 26, cardY + 10.5);

    doc.strokeColor(COLORS.borderLight).lineWidth(0.5).moveTo(cardX + 10, cardY + 24).lineTo(cardX + cardW - 10, cardY + 24).stroke();

    const col1X = cardX + 12;
    const col1LabelW = 78;
    const col1ValX = col1X + col1LabelW;
    const col1ValW = (cardW / 2) - col1LabelW - 8;

    const col2X = cardX + (cardW / 2) + 6;
    const col2LabelW = 88;
    const col2ValX = col2X + col2LabelW;
    const col2ValW = (cardW / 2) - col2LabelW - 12;

    const patientName = cleanString(patientRecord.patientName || patientRecord.patient?.name, '');
    const patientId = cleanString(patientRecord.patientId || patientRecord.patient?.id || patientRecord.patient_code, '-');
    const rawAppCode = patientRecord.appointmentId || patientRecord.appointment_id || (patientRecord.consultationId ? String(patientRecord.consultationId).replace('consultation-app-', '').replace('consultation-db-', '') : '');
    const appointmentId = cleanString(rawAppCode, '-');

    let rawAge = patientRecord.patientAge || patientRecord.age || patientRecord.patient?.age;
    let rawGender = patientRecord.patientGender || patientRecord.gender || patientRecord.patient?.gender;
    const dobVal = patientRecord.dateOfBirth || patientRecord.date_of_birth || patientRecord.dob;

    const ageStr = hasValue(rawAge) ? (String(rawAge).toLowerCase().includes('y') ? String(rawAge) : `${rawAge} Y`) : '';
    const genderStr = hasValue(rawGender) ? String(rawGender).trim() : '';
    const dobStr = hasValue(dobVal) ? formatISTDate(dobVal) : '';
    const ageGender = [ageStr, genderStr, dobStr ? `DOB: ${dobStr}` : ''].filter(Boolean).join(' / ') || '-';

    let rawDocName = patientRecord.doctorName || patientRecord.doctor_name || patientRecord.doctor?.name;
    if (rawDocName && !rawDocName.toLowerCase().startsWith('dr')) {
        rawDocName = `Dr. ${rawDocName}`;
    }
    const doctorName = cleanString(rawDocName, '');
    const doctorSpecialty = cleanString(patientRecord.doctorSpecialty || patientRecord.doctor_specialization || patientRecord.doctor?.specialization, '');
    const doctorQual = cleanString(patientRecord.doctorQualification || patientRecord.qualification, '');
    const doctorRegNo = cleanString(patientRecord.doctorRegNo || patientRecord.registration_number, '');
    const qualRegCombined = [doctorQual, doctorRegNo ? `Reg: ${doctorRegNo}` : ''].filter(Boolean).join(' | ');

    const dateStr = formatISTDate(patientRecord.consultationDate);
    const timeStr = formatISTTime(patientRecord.consultationTime, patientRecord.created_at || patientRecord.consultationDate);
    const hospitalName = cleanString(patientRecord.hospitalName || patientRecord.clinicName || patientRecord.clinic_name, '');

    const rowY1 = cardY + 28;
    const rowY2 = cardY + 40;
    const rowY3 = cardY + 52;
    const rowY4 = cardY + 64;
    const rowY5 = cardY + 76;

    const printPair = (lbl, val, lx, vx, vw, y) => {
        doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.1).text(lbl, lx, y);
        doc.fillColor(COLORS.navy).font(fontRegular).fontSize(7.1).text(`:  ${val || '-'}`, vx, y, { width: vw, lineBreak: false });
    };

    printPair('Patient Name', patientName, col1X, col1ValX, col1ValW, rowY1);
    printPair('Patient ID', patientId, col1X, col1ValX, col1ValW, rowY2);
    printPair('Age / Gender', ageGender, col1X, col1ValX, col1ValW, rowY3);
    printPair('Appointment ID', appointmentId, col1X, col1ValX, col1ValW, rowY4);

    printPair('Doctor Name', doctorName || doctorSpecialty, col2X, col2ValX, col2ValW, rowY1);
    printPair('Qual. / Reg No.', qualRegCombined || '-', col2X, col2ValX, col2ValW, rowY2);
    printPair('Specialty', doctorSpecialty || '-', col2X, col2ValX, col2ValW, rowY3);
    printPair('Date / Time', `${dateStr}  ${timeStr}`, col2X, col2ValX, col2ValW, rowY4);
    printPair('Hospital / Clinic', hospitalName || '-', col2X, col2ValX, col2ValW, rowY5);

    doc.y = cardY + cardH + 10;

    /* ==================== 1. PRESCRIPTION MEDICINES TABLE ==================== */
    const startY1 = doc.y;
    doc.circle(cardX + 12, startY1 + 8, 5).fillColor(COLORS.cyanLight).fill();
    doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(7.2).text('1', cardX + 9.5, startY1 + 4.8);
    doc.fillColor(COLORS.navy).font(fontBold).fontSize(8.2).text('PRESCRIPTION MEDICINES', cardX + 22, startY1 + 4.8);

    doc.strokeColor(COLORS.borderLight).lineWidth(0.5).moveTo(cardX, startY1 + 16).lineTo(cardX + PAGE.contentWidth, startY1 + 16).stroke();
    doc.y = startY1 + 22;

    const medicines = Array.isArray(patientRecord?.prescription?.medicines)
        ? patientRecord.prescription.medicines
        : Array.isArray(patientRecord.medications)
            ? patientRecord.medications
            : Array.isArray(patientRecord.summary?.medications_discussed)
                ? patientRecord.summary.medications_discussed
                : [];

    const cols = [
        { name: '#', width: 22 },
        { name: 'Medicine Name & Instructions', width: 145 },
        { name: 'Indication / For', width: 95 },
        { name: 'Dosage', width: 55 },
        { name: 'Timing (Frequency)', width: 85 },
        { name: 'Food Timing', width: 65 },
        { name: 'Duration', width: 56 },
    ];

    const tableX = PAGE.marginX;
    const headerHeight = 20;

    const drawTableHeader = () => {
        const hY = doc.y;
        doc.roundedRect(tableX, hY, PAGE.contentWidth, headerHeight, 4).fill(COLORS.tealDark);

        let curColX = tableX + 4;
        cols.forEach(col => {
            doc.font(fontBold).fontSize(7.2).fillColor(COLORS.white).text(col.name, curColX, hY + 5, { width: col.width - 2 });
            curColX += col.width;
        });

        doc.y = hY + headerHeight + 2;
    };

    drawTableHeader();

    if (medicines.length === 0) {
        doc.roundedRect(tableX, doc.y, PAGE.contentWidth, 28, 4).fillAndStroke(COLORS.softBlue, COLORS.borderLight);
        doc.font(fontRegular).fontSize(8).fillColor(COLORS.textMuted).text('No prescription medicines documented.', tableX, doc.y + 8, { width: PAGE.contentWidth, align: 'center' });
        doc.y += 34;
    } else {
        medicines.forEach((med, idx) => {
            const medName = cleanString(med.name || med.medicine || med.drug, '—');
            const indication = cleanString(med.indication || med.purpose || med.reason, '');
            const indicationTe = cleanString(med.indication_te || translateIndication(indication), '');

            const dosage = cleanString(med.dosage, '');
            const dosageTe = cleanString(med.dosage_te || translateDosage(dosage), '');

            const freq = frequencyToTime(med.frequency || med.time);
            const freqClean = freq === '—' ? '' : freq;
            const freqTe = cleanString(med.frequency_te || translateTiming(freqClean), '');

            const food = cleanString(med.foodTiming || med.food_timing || med.food, '');
            const foodTe = cleanString(med.foodTiming_te || translateFoodTiming(food), '');

            const duration = cleanString(med.duration, '');
            const durationTe = cleanString(med.duration_te || translateDuration(duration), '');

            const instructions = cleanString(med.instructions, '');
            const instructionsTe = cleanString(med.instructions_te, '');

            // Calculate heights for English + Telugu in each column
            const nameH = doc.heightOfString(medName, { width: cols[1].width - 4, font: fontBold, fontSize: 7.8 })
                + (instructions ? doc.heightOfString(instructions, { width: cols[1].width - 4, font: fontRegular, fontSize: 6.5 }) + 1 : 0)
                + (instructionsTe ? doc.heightOfString(instructionsTe, { width: cols[1].width - 4, font: fontBold, fontSize: 6.5 }) + 1 : 0);

            const indH = (indication ? doc.heightOfString(indication, { width: cols[2].width - 4, font: fontRegular, fontSize: 7.0 }) : 0)
                + (indicationTe ? doc.heightOfString(indicationTe, { width: cols[2].width - 4, font: fontBold, fontSize: 6.5 }) + 1 : 0);

            const dosH = (dosage ? doc.heightOfString(dosage, { width: cols[3].width - 4, font: fontRegular, fontSize: 7.0 }) : 0)
                + (dosageTe ? doc.heightOfString(dosageTe, { width: cols[3].width - 4, font: fontBold, fontSize: 6.5 }) + 1 : 0);

            const freqH = (freqClean ? doc.heightOfString(freqClean, { width: cols[4].width - 4, font: fontBold, fontSize: 7.0 }) : 0)
                + (freqTe ? doc.heightOfString(freqTe, { width: cols[4].width - 4, font: fontBold, fontSize: 6.5 }) + 1 : 0);

            const foodH = (food ? doc.heightOfString(food, { width: cols[5].width - 4, font: fontRegular, fontSize: 7.0 }) : 0)
                + (foodTe ? doc.heightOfString(foodTe, { width: cols[5].width - 4, font: fontBold, fontSize: 6.5 }) + 1 : 0);

            const durH = (duration ? doc.heightOfString(duration, { width: cols[6].width - 4, font: fontRegular, fontSize: 7.0 }) : 0)
                + (durationTe ? doc.heightOfString(durationTe, { width: cols[6].width - 4, font: fontBold, fontSize: 6.5 }) + 1 : 0);

            const rowHeight = Math.max(26, Math.max(nameH, indH, dosH, freqH, foodH, durH) + 8);

            if (checkPageBreak(rowHeight + 4)) {
                drawTableHeader();
            }

            const rowBg = idx % 2 === 0 ? COLORS.cardBg : COLORS.softBlue;
            doc.roundedRect(tableX, doc.y, PAGE.contentWidth, rowHeight, 3).fillAndStroke(rowBg, COLORS.borderLight);

            let xPos = tableX + 4;
            const curY = doc.y + 4;

            // # Column
            doc.font(fontBold).fontSize(7.2).fillColor(COLORS.textMuted).text(String(idx + 1), xPos, curY + 2, { width: cols[0].width - 2 });
            xPos += cols[0].width;

            // Medicine Name & Instructions Column
            doc.font(fontBold).fontSize(7.8).fillColor(COLORS.navy).text(medName, xPos, curY, { width: cols[1].width - 4 });
            let nextInstrY = curY + doc.heightOfString(medName, { width: cols[1].width - 4, font: fontBold, fontSize: 7.8 });
            if (instructions) {
                doc.font(fontRegular).fontSize(6.5).fillColor(COLORS.textDark).text(instructions, xPos, nextInstrY, { width: cols[1].width - 4 });
                nextInstrY += doc.heightOfString(instructions, { width: cols[1].width - 4, font: fontRegular, fontSize: 6.5 }) + 1;
            }
            if (instructionsTe) {
                doc.font(fontBold).fontSize(6.5).fillColor(COLORS.tealDark).text(instructionsTe, xPos, nextInstrY, { width: cols[1].width - 4 });
            }
            xPos += cols[1].width;

            // Indication Column
            let indY = curY;
            if (indication) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textDark).text(indication, xPos, indY, { width: cols[2].width - 4 });
                indY += doc.heightOfString(indication, { width: cols[2].width - 4, font: fontRegular, fontSize: 7.0 }) + 1;
            } else if (!indicationTe) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textMuted).text('—', xPos, indY, { width: cols[2].width - 4 });
            }
            if (indicationTe) {
                doc.font(fontBold).fontSize(6.5).fillColor(COLORS.tealDark).text(indicationTe, xPos, indY, { width: cols[2].width - 4 });
            }
            xPos += cols[2].width;

            // Dosage Column
            let dosY = curY;
            if (dosage) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textDark).text(dosage, xPos, dosY, { width: cols[3].width - 4 });
                dosY += doc.heightOfString(dosage, { width: cols[3].width - 4, font: fontRegular, fontSize: 7.0 }) + 1;
            } else if (!dosageTe) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textMuted).text('—', xPos, dosY, { width: cols[3].width - 4 });
            }
            if (dosageTe) {
                doc.font(fontBold).fontSize(6.5).fillColor(COLORS.tealDark).text(dosageTe, xPos, dosY, { width: cols[3].width - 4 });
            }
            xPos += cols[3].width;

            // Frequency Column
            let freqY = curY;
            if (freqClean) {
                doc.font(fontBold).fontSize(7.0).fillColor(COLORS.navy).text(freqClean, xPos, freqY, { width: cols[4].width - 4 });
                freqY += doc.heightOfString(freqClean, { width: cols[4].width - 4, font: fontBold, fontSize: 7.0 }) + 1;
            } else if (!freqTe) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textMuted).text('—', xPos, freqY, { width: cols[4].width - 4 });
            }
            if (freqTe) {
                doc.font(fontBold).fontSize(6.5).fillColor(COLORS.tealDark).text(freqTe, xPos, freqY, { width: cols[4].width - 4 });
            }
            xPos += cols[4].width;

            // Food Timing Column
            let foodY = curY;
            if (food) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textDark).text(food, xPos, foodY, { width: cols[5].width - 4 });
                foodY += doc.heightOfString(food, { width: cols[5].width - 4, font: fontRegular, fontSize: 7.0 }) + 1;
            } else if (!foodTe) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textMuted).text('—', xPos, foodY, { width: cols[5].width - 4 });
            }
            if (foodTe) {
                doc.font(fontBold).fontSize(6.5).fillColor(COLORS.tealDark).text(foodTe, xPos, foodY, { width: cols[5].width - 4 });
            }
            xPos += cols[5].width;

            // Duration Column
            let durY = curY;
            if (duration) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textDark).text(duration, xPos, durY, { width: cols[6].width - 4 });
                durY += doc.heightOfString(duration, { width: cols[6].width - 4, font: fontRegular, fontSize: 7.0 }) + 1;
            } else if (!durationTe) {
                doc.font(fontRegular).fontSize(7.0).fillColor(COLORS.textMuted).text('—', xPos, durY, { width: cols[6].width - 4 });
            }
            if (durationTe) {
                doc.font(fontBold).fontSize(6.5).fillColor(COLORS.tealDark).text(durationTe, xPos, durY, { width: cols[6].width - 4 });
            }

            doc.y += rowHeight + 2;
        });

        doc.y += 8;
    }

    /* ==================== 2. MEDICAL ADVICE & FOLLOW-UP ==================== */
    const adviceStr = cleanString(patientRecord?.prescription?.advice || patientRecord?.summary?.advice || patientRecord?.summary?.treatment_plan, '');
    const followUpStr = cleanString(patientRecord?.prescription?.follow_up_date || patientRecord?.prescription?.follow_up || patientRecord?.summary?.follow_up, '');

    if (adviceStr || followUpStr) {
        const adviceCardHeight = adviceStr ? (followUpStr ? 54 : 40) : 28;
        checkPageBreak(adviceCardHeight + 30);

        const startY2 = doc.y;
        doc.circle(cardX + 12, startY2 + 8, 5).fillColor(COLORS.cyanLight).fill();
        doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(7.2).text('2', cardX + 9.5, startY2 + 4.8);
        doc.fillColor(COLORS.navy).font(fontBold).fontSize(8.2).text('MEDICAL ADVICE & FOLLOW-UP', cardX + 22, startY2 + 4.8);

        doc.strokeColor(COLORS.borderLight).lineWidth(0.5).moveTo(cardX, startY2 + 16).lineTo(cardX + PAGE.contentWidth, startY2 + 16).stroke();
        doc.y = startY2 + 22;

        doc.roundedRect(PAGE.marginX, doc.y, PAGE.contentWidth, adviceCardHeight, 6).fillAndStroke(COLORS.headerSoft, COLORS.border);

        let advY = doc.y + 6;
        if (adviceStr) {
            doc.font(fontBold).fontSize(7.5).fillColor(COLORS.navy).text('Doctor Advice:', PAGE.marginX + 12, advY);
            doc.font(fontRegular).fontSize(7.2).fillColor(COLORS.textDark).text(adviceStr, PAGE.marginX + 80, advY, { width: PAGE.contentWidth - 96 });
            advY += 20;
        }

        if (followUpStr) {
            doc.font(fontBold).fontSize(7.5).fillColor(COLORS.tealDark).text('Follow-up Date:', PAGE.marginX + 12, advY);
            doc.font(fontBold).fontSize(7.5).fillColor(COLORS.navy).text(followUpStr, PAGE.marginX + 80, advY);
        }

        doc.y += adviceCardHeight + 14;
    }

    /* ==================== 3. DOCTOR CONFIRMATION & STAMP ==================== */
    checkPageBreak(70);

    const confCardX = PAGE.marginX;
    const confCardW = PAGE.contentWidth;

    const startY3 = doc.y;
    doc.circle(confCardX + 12, startY3 + 8, 5).fillColor(COLORS.cyanLight).fill();
    doc.fillColor(COLORS.tealDark).font(fontBold).fontSize(7.2).text('3', confCardX + 9.5, startY3 + 4.8);
    doc.fillColor(COLORS.navy).font(fontBold).fontSize(8.2).text('DOCTOR CONFIRMATION & SEAL', confCardX + 22, startY3 + 4.8);

    doc.strokeColor(COLORS.borderLight).lineWidth(0.5).moveTo(confCardX, startY3 + 16).lineTo(confCardX + PAGE.contentWidth, startY3 + 16).stroke();
    doc.y = startY3 + 22;

    const confirmY = doc.y;
    const leftW = confCardW - 130;

    doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.5).text('Doctor Signature  :', confCardX + 12, confirmY + 4);
    doc.strokeColor(COLORS.border).lineWidth(0.7).moveTo(confCardX + 95, confirmY + 11).lineTo(confCardX + leftW - 15, confirmY + 11).stroke();

    if (doctorName) {
        doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.2).text('Prescribed By', confCardX + 12, confirmY + 18, { continued: true });
        doc.font(fontRegular).text(`         :  ${doctorName}`);
    }
    if (qualRegCombined) {
        doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.2).text('Qual. / Reg No.', confCardX + 12, confirmY + 28, { continued: true });
        doc.font(fontRegular).text(`     :  ${qualRegCombined}`);
    }
    if (hospitalName) {
        doc.fillColor(COLORS.navy).font(fontBold).fontSize(7.2).text('Hospital / Clinic', confCardX + 12, confirmY + 38, { continued: true });
        doc.font(fontRegular).text(`     :  ${hospitalName}`);
    }

    const stampW = 110;
    const stampH = 42;
    const stampX = confCardX + confCardW - stampW - 12;
    const stampY = confirmY;

    doc.roundedRect(stampX, stampY, stampW, stampH, 4).dash(2.5, { space: 2 }).strokeColor(COLORS.border).stroke().undash();
    doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.8).text('(Signature & Stamp)', stampX, stampY + 16, { width: stampW, align: 'center' });

    doc.y = confirmY + stampH + 10;

    /* ==================== FOOTER ==================== */
    const range = doc.bufferedPageRange();
    const totalPages = range.count;

    for (let i = 0; i < totalPages; i += 1) {
        doc.switchToPage(i);
        const footerLineY = PAGE.height - 44;

        doc.strokeColor(COLORS.teal).lineWidth(0.8).moveTo(PAGE.marginX, footerLineY).lineTo(PAGE.width - PAGE.marginX, footerLineY).stroke();

        const footTextY = footerLineY + 5;
        const colW = PAGE.contentWidth / 3;

        const footClinic = cleanString(patientRecord.clinicName || patientRecord.clinic_name || patientRecord.hospitalName, '');
        const footAddr = cleanString(patientRecord.clinicAddress || patientRecord.clinic_address || patientRecord.hospitalAddress, '');
        const footPhone = cleanString(patientRecord.hospitalPhone || patientRecord.clinicPhone || patientRecord.phone, '');
        const footEmail = cleanString(patientRecord.hospitalEmail || patientRecord.clinicEmail || patientRecord.email, '');

        if (footClinic || footAddr) {
            doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.5)
                .text(footClinic, PAGE.marginX, footTextY, { width: colW, lineBreak: false })
                .text(footAddr, PAGE.marginX, footTextY + 7.5, { width: colW, lineBreak: false });
        }

        if (footEmail) {
            doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.5)
                .text(footEmail, PAGE.marginX + colW, footTextY + 3.5, { width: colW, align: 'center' });
        }

        if (footPhone) {
            doc.fillColor(COLORS.textMuted).font(fontRegular).fontSize(6.5)
                .text(footPhone, PAGE.marginX + colW * 2, footTextY + 3.5, { width: colW, align: 'right' });
        }

        const pillW = 56;
        const pillH = 13;
        const pillX = (PAGE.width - pillW) / 2;
        const pillY = PAGE.height - 22;

        doc.roundedRect(pillX, pillY, pillW, pillH, 6.5).fillColor(COLORS.pillDark).fill();
        doc.fillColor(COLORS.white).font(fontBold).fontSize(6.5).text(`Page ${i + 1} of ${totalPages}`, pillX, pillY + 3, { width: pillW, align: 'center' });
    }

    doc.end();
}

module.exports = {
    renderPrescriptionPdfToStream,
    frequencyToTime,
};
