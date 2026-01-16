const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, 'word_data', 'TES_VOCA_Lv3.xlsx');
const OUTPUT_DIR = path.join(__dirname, 'public', 'data');
// Vite serves from public defaults, or we can put in src/data. 
// Let's put in 'public/data' so fetch('/data/words_lv3.json') works easily.

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function convertData() {
    if (!fs.existsSync(EXCEL_PATH)) {
        console.error(`Error: File not found at ${EXCEL_PATH}`);
        return;
    }

    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheetNames = workbook.SheetNames;

    // Structure: { "1": [words...], "2": [words...] }
    const unitsData = {};

    sheetNames.forEach(sheetName => {
        // Check if sheet name is just a number or "Unit X"
        // User said "Sheet 1 parameter 30", assuming names might be "Sheet1" or just "1".
        // Let's try to extract a number from the sheet name.
        const match = sheetName.match(/(\d+)/);
        if (!match) return; // Skip non-numeric sheets if any

        const unitNum = parseInt(match[1], 10);
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Rows content: [En, Kr, En_Ex, Kr_Ex]
        // Assuming row 0 is header? User didn't imply header, just "A열 영어..."
        // Often first row is header. Let's check.
        // If row[0][0] looks like "Word" or "English", skip it.

        let startIndex = 0;
        if (rows.length > 0 && typeof rows[0][0] === 'string' &&
            (['english', 'word', 'term'].includes(rows[0][0].toLowerCase()))) {
            startIndex = 1;
        }

        const unitWords = [];

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 2) continue;

            const en = row[0];
            const kr = row[1];
            // Optional examples
            const en_ex = row[2] || "";
            const kr_ex = row[3] || "";

            if (en && kr) {
                unitWords.push({
                    en: String(en).trim(),
                    kr: String(kr).trim(),
                    en_ex: String(en_ex).trim(),
                    kr_ex: String(kr_ex).trim()
                });
            }
        }

        if (unitWords.length > 0) {
            unitsData[unitNum] = unitWords;
        }
    });

    const outputPath = path.join(OUTPUT_DIR, 'words_lv3.json');
    fs.writeFileSync(outputPath, JSON.stringify(unitsData, null, 2), 'utf-8');
    console.log(`Successfully converted ${Object.keys(unitsData).length} units to ${outputPath}`);
}

convertData();
