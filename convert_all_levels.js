const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const WORD_DATA_DIR = path.join(__dirname, 'word_data');
const OUTPUT_DIR = path.join(__dirname, 'public', 'data');
const OUTPUT_JS_PATH = path.join(__dirname, 'words_data.js');

// 처리할 레벨 목록
const LEVELS = [1, 2, 3, 4, 5, 6];

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function convertAllLevels() {
    const allLevelData = {};

    LEVELS.forEach(level => {
        const excelPath = path.join(WORD_DATA_DIR, `TES_VOCA_Lv${level}.xlsx`);

        if (!fs.existsSync(excelPath)) {
            console.log(`Skip: Lv${level} file not found`);
            return;
        }

        console.log(`Processing Lv${level}...`);

        const workbook = XLSX.readFile(excelPath);
        const sheetNames = workbook.SheetNames;
        const levelData = {};

        sheetNames.forEach(sheetName => {
            const match = sheetName.match(/(\d+)/);
            if (!match) return;

            const unitNum = parseInt(match[1], 10);
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            let startIndex = 0;
            if (rows.length > 0 && typeof rows[0][0] === 'string' &&
                ['english', 'word', 'term', '영단어'].includes(rows[0][0].toLowerCase())) {
                startIndex = 1;
            }

            const unitWords = [];

            for (let i = startIndex; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length < 2) continue;

                const en = row[0];
                const kr = row[1];
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
                levelData[unitNum] = unitWords;
            }
        });

        if (Object.keys(levelData).length > 0) {
            allLevelData[level] = levelData;

            // 개별 레벨 JSON 저장
            const jsonPath = path.join(OUTPUT_DIR, `words_lv${level}.json`);
            fs.writeFileSync(jsonPath, JSON.stringify(levelData, null, 2), 'utf-8');

            const totalWords = Object.values(levelData).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`  Lv${level}: ${Object.keys(levelData).length} units, ${totalWords} words`);
        }
    });

    // 전체 데이터를 JS 파일로 저장 (인라인 사용)
    const jsContent = `// 모든 레벨 단어 데이터
// 자동 생성됨: ${new Date().toISOString()}
const WORD_DATA_ALL = ${JSON.stringify(allLevelData, null, 2)};

// 현재 선택된 레벨의 데이터를 반환
function getWordDataForLevel(level) {
    return WORD_DATA_ALL[level] || {};
}

// 기본값: Lv3 (호환성 유지)
const WORD_DATA = WORD_DATA_ALL[3] || {};
`;

    fs.writeFileSync(OUTPUT_JS_PATH, jsContent, 'utf-8');

    console.log(`\n✅ All levels converted!`);
    console.log(`   JS file: ${OUTPUT_JS_PATH}`);

    const totalLevels = Object.keys(allLevelData).length;
    let totalWords = 0;
    Object.values(allLevelData).forEach(levelData => {
        Object.values(levelData).forEach(unitData => {
            totalWords += unitData.length;
        });
    });
    console.log(`   Total: ${totalLevels} levels, ${totalWords} words`);
}

convertAllLevels();
