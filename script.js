/* ============================================
   산성비 게임 - 메인 스크립트
   ============================================ */

/* 게임 상태 변수 */
let allData = {}; // { "1": [...], "2": [...] } - 유닛별 단어 데이터
let gameWords = []; // 실제 게임에 사용될 단어들
let activeWordsObj = []; // 현재 화면에 떨어지고 있는 단어들
let gameRunning = false;
let gamePaused = false;
let score = 0;
let life = 5;
let correctCount = 0;
let missedCount = 0;
let spawnRate = 2000;
let fallSpeedBase = 1.0;
let baseSpawnRate = 2000;
let lastSpawnTime = 0;
let gameLoopId;
let isEnglishInput = true; // true: 한글 보고 영어 입력, false: 영어 보고 한글 입력
let currentDifficulty = 'normal';
let currentLevel = 3;
let deviceMode = 'pc'; // 'pc' 또는 'mobile'
let storedGroundLevel = 0; // 게임 시작 시 play-area 높이 기준으로 고정
let lastFrameTime = 0; // delta time 계산용
let pendingDeviceMode = null; // 코드 확인 후 설정할 모드
let flashTimeoutId = null; // 플래시 애니메이션 타이머 (충돌 방지용)

/* DOM 요소 */
const gameContainer = document.getElementById('game-container');
const backgroundImage = document.getElementById('background-image');
const mainMenu = document.getElementById('main-menu');
const howToPlay = document.getElementById('how-to-play');
const settingsScreen = document.getElementById('settings-screen');
const gameScreen = document.getElementById('game-screen');
const pauseOverlay = document.getElementById('pause-overlay');
const gameOverScreen = document.getElementById('game-over');

const scoreEl = document.getElementById('score');
const lifeIconsEl = document.getElementById('life-icons');
const playArea = document.getElementById('play-area');
const wordInput = document.getElementById('word-input');
const statusMsg = document.getElementById('status-msg');

const unitGrid = document.getElementById('unit-grid');
const currentLevelLabel = document.getElementById('current-level-label');

/* 초기화 */
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // 0. destroyed 이미지 미리 로드 (전환 시 깜빡임 방지)
    new Image().src = 'img_data/destroyed_city.png';

    // 1. 데이터 로드
    await loadWordData();

    // 2. 유닛 그리드 생성
    buildUnitGrid();

    // 3. 이벤트 리스너 설정
    setupEventListeners();

    // 4. 생명 아이콘 초기화
    updateLifeIcons();

    // 5. 모바일 키보드 대응 (visualViewport API)
    setupViewportHandler();
}

/* 모바일 키보드 대응 - visualViewport API */
let viewportHeight = window.innerHeight;

function setupViewportHandler() {
    // visualViewport API 지원 확인
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportResize);
        window.visualViewport.addEventListener('scroll', handleViewportResize);
    }

    // orientation change 대응
    window.addEventListener('orientationchange', () => {
        setTimeout(handleViewportResize, 100);
    });

    // 초기값 설정
    handleViewportResize();
}

function handleViewportResize() {
    if (window.visualViewport) {
        viewportHeight = window.visualViewport.height;
    } else {
        viewportHeight = window.innerHeight;
    }

    // 게임 컨테이너 높이 조정
    const gameContainer = document.getElementById('game-container');

    if (gameContainer) {
        // 모바일 모드일 때 가로/세로 방향 감지 및 클래스 처리
        if (deviceMode === 'mobile') {
            const isLandscape = window.innerWidth > window.innerHeight;
            if (isLandscape) {
                gameContainer.classList.add('landscape-mode');
            } else {
                gameContainer.classList.remove('landscape-mode');
            }
        }

        // 게임 시작 전에만 높이 조정 (게임 중에는 groundLevel이 변하면 안 됨)
        if (!gameRunning && deviceMode === 'mobile') {
            gameContainer.style.height = viewportHeight + 'px';
            window.scrollTo(0, 0);
        }
    }

}

/* 데이터 로드 */
async function loadWordData() {
    statusMsg.textContent = `Lv ${currentLevel} 데이터 로드 중...`;
    statusMsg.className = "status-message";

    // 1. 인라인 데이터 (WORD_DATA_ALL) 확인 - convert_all_levels.js로 생성된 구조
    if (typeof WORD_DATA_ALL !== 'undefined' && WORD_DATA_ALL[currentLevel]) {
        allData = WORD_DATA_ALL[currentLevel];
        updateDataStatus("인라인");
        return;
    }

    // 2. 개별 JSON 파일 로드 시도 (public/data/words_lvX.json)
    try {
        const response = await fetch(`public/data/words_lv${currentLevel}.json`);
        if (response.ok) {
            allData = await response.json();
            updateDataStatus("JSON");
            return;
        }
    } catch (err) {
        console.log(`Lv${currentLevel} JSON 로드 실패:`, err);
    }

    // 3. Fallback: data 폴더 JSON
    try {
        const response = await fetch(`data/words_lv${currentLevel}.json`);
        if (response.ok) {
            allData = await response.json();
            updateDataStatus("JSON(data)");
            return;
        }
    } catch (err) {
        console.log(`Lv${currentLevel} data JSON 로드 실패`);
    }

    // 4. Excel 직접 로드 시도
    try {
        const response = await fetch(`word_data/TES_VOCA_Lv${currentLevel}.xlsx`);
        if (!response.ok) throw new Error("Excel 파일을 찾을 수 없습니다.");

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        allData = {};

        workbook.SheetNames.forEach((sheetName, index) => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            const unitNumber = extractUnitNumber(sheetName) || (index + 1);

            allData[unitNumber] = jsonData.map(row => ({
                en: row['영단어'] || row['English'] || row['en'] || Object.values(row)[0],
                kr: row['뜻'] || row['Korean'] || row['kr'] || row['한글'] || Object.values(row)[1]
            })).filter(item => item.en && item.kr);
        });

        updateDataStatus("Excel");

    } catch (err) {
        console.error("데이터 로드 오류:", err);
        statusMsg.textContent = `Lv ${currentLevel} 데이터 로드 실패`;
        statusMsg.className = "status-message error";
        allData = createSampleData();
    }
}

function updateDataStatus(source) {
    const totalWords = Object.values(allData).reduce((sum, arr) => sum + arr.length, 0);
    const unitCount = Object.keys(allData).length;
    statusMsg.textContent = `Lv ${currentLevel} 로드 완료! (${unitCount} 유닛, ${totalWords} 단어)`;
    statusMsg.className = "status-message success";
    console.log(`Lv ${currentLevel} Loaded from ${source}:`, unitCount, "units");
}

function extractUnitNumber(sheetName) {
    const match = sheetName.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
}

function createSampleData() {
    const sampleData = {};
    for (let i = 1; i <= 30; i++) {
        sampleData[i] = [
            { en: 'apple', kr: '사과' },
            { en: 'banana', kr: '바나나' },
            { en: 'cat', kr: '고양이' },
            { en: 'dog', kr: '개' },
            { en: 'elephant', kr: '코끼리' },
            { en: 'fish', kr: '물고기' },
            { en: 'grape', kr: '포도' },
            { en: 'house', kr: '집' },
            { en: 'ice', kr: '얼음' },
            { en: 'juice', kr: '주스' }
        ];
    }
    return sampleData;
}

/* 유닛 그리드 생성 */
function buildUnitGrid() {
    unitGrid.innerHTML = '';
    const totalUnits = 30;

    for (let i = 1; i <= totalUnits; i++) {
        const wrapper = document.createElement('div');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `unit-${i}`;
        checkbox.dataset.unit = i;
        checkbox.className = 'unit-checkbox';
        checkbox.checked = true;

        const label = document.createElement('label');
        label.htmlFor = `unit-${i}`;
        label.className = 'unit-label';
        label.textContent = i;

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        unitGrid.appendChild(wrapper);
    }
}

/* 이벤트 리스너 설정 */
function setupEventListeners() {
    // 메인 메뉴 버튼
    document.getElementById('how-to-btn').addEventListener('click', () => showScreen(howToPlay));
    document.getElementById('start-pc-btn').addEventListener('click', () => {
        pendingDeviceMode = 'pc';
        showAcademyGate();
    });
    document.getElementById('start-mobile-btn').addEventListener('click', () => {
        pendingDeviceMode = 'mobile';
        showAcademyGate();
    });
    document.getElementById('close-howto-btn').addEventListener('click', () => showScreen(mainMenu));

    // 설정 화면 버튼
    document.getElementById('back-to-main-btn').addEventListener('click', () => showScreen(mainMenu));
    document.getElementById('game-start-btn').addEventListener('click', startGame);

    // 난이도 버튼
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDifficulty = btn.dataset.diff;
        });
    });

    // 타이핑 모드 버튼
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            isEnglishInput = btn.dataset.mode === 'ko-en';
        });
    });

    // 레벨 버튼
    document.querySelectorAll('.level-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.classList.contains('disabled')) return;
            document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLevel = parseInt(btn.dataset.level);
            currentLevelLabel.textContent = currentLevel;

            // 레벨 변경 시 데이터 다시 로드
            await loadWordData();
            buildUnitGrid();
        });
    });

    // 범위/세부 설정 탭
    document.querySelectorAll('.range-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.range-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetPanel = tab.dataset.tab === 'range' ? 'range-panel' : 'detail-panel';
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            document.getElementById(targetPanel).classList.remove('hidden');
        });
    });

    // 유닛 전체 선택/해제
    document.getElementById('select-all-btn').addEventListener('click', () => {
        document.querySelectorAll('.unit-checkbox').forEach(cb => cb.checked = true);
    });
    document.getElementById('deselect-all-btn').addEventListener('click', () => {
        document.querySelectorAll('.unit-checkbox').forEach(cb => cb.checked = false);
    });

    // 게임 중 버튼
    document.getElementById('pause-btn').addEventListener('click', pauseGame);
    document.getElementById('resume-btn').addEventListener('click', resumeGame);
    document.getElementById('quit-btn').addEventListener('click', quitGame);

    // 게임 오버 버튼
    document.getElementById('restart-btn').addEventListener('click', () => {
        showScreen(settingsScreen);
    });
    document.getElementById('home-btn').addEventListener('click', () => {
        showScreen(mainMenu);
    });

    // 학원 코드 Enter 키
    document.getElementById('academy-code-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitAcademyCode();
        if (e.key === 'Escape') closeAcademyGate();
    });

    // 단어 입력
    wordInput.addEventListener('input', checkInput);
    wordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            wordInput.value = '';
        }
    });

    // 모바일: 게임 중 input blur 시 키보드가 내려가지 않도록 즉시 재포커스
    wordInput.addEventListener('blur', () => {
        if (gameRunning && !gamePaused && deviceMode === 'mobile') {
            requestAnimationFrame(() => wordInput.focus());
        }
    });

    // 모바일: 게임 화면 터치 시 input 포커스 유지 (키보드 유지)
    gameContainer.addEventListener('touchend', (e) => {
        if (gameRunning && !gamePaused && deviceMode === 'mobile' && e.target !== wordInput) {
            e.preventDefault();
            wordInput.focus();
        }
    }, { passive: false });
}

/* 학원 코드 게이트 */
function showAcademyGate() {
    const input = document.getElementById('academy-code-input');
    const error = document.getElementById('academy-code-error');
    input.value = '';
    error.style.display = 'none';
    const gate = document.getElementById('academy-gate');
    gate.classList.remove('hidden');
    gate.classList.add('active');
    setTimeout(() => input.focus(), 100);
}

function closeAcademyGate() {
    const gate = document.getElementById('academy-gate');
    gate.classList.remove('active');
    gate.classList.add('hidden');
    pendingDeviceMode = null;
}

function submitAcademyCode() {
    const input = document.getElementById('academy-code-input');
    const error = document.getElementById('academy-code-error');

    const code = input.value.trim().toLowerCase();
    if (code === 'tes1234' || code === 'lq4qeg') {
        closeAcademyGate();
        if (pendingDeviceMode === 'pc') {
            deviceMode = 'pc';
            gameContainer.classList.remove('mobile-mode');
            gameContainer.classList.add('pc-mode');
        } else {
            deviceMode = 'mobile';
            gameContainer.classList.remove('pc-mode');
            gameContainer.classList.add('mobile-mode');
        }
        showScreen(settingsScreen);
    } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
    }
}

/* 화면 전환 */
function showScreen(targetScreen) {
    const screens = [mainMenu, howToPlay, settingsScreen, gameScreen, pauseOverlay, gameOverScreen];

    screens.forEach(screen => {
        if (screen === targetScreen) {
            screen.classList.remove('hidden');
            screen.classList.add('active');
        } else {
            screen.classList.remove('active');
            screen.classList.add('hidden');
        }
    });
}

/* 생명 아이콘 업데이트 */
function updateLifeIcons() {
    lifeIconsEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const icon = document.createElement('span');
        icon.className = 'life-icon';
        icon.textContent = i < life ? '❤️' : '🖤';
        if (i >= life) icon.classList.add('lost');
        lifeIconsEl.appendChild(icon);
    }
}

/* 게임 시작 */
function startGame() {
    // 선택된 유닛 수집
    const selectedUnits = Array.from(document.querySelectorAll('.unit-checkbox:checked'))
        .map(cb => cb.dataset.unit);

    if (selectedUnits.length === 0) {
        alert("최소 한 개의 유닛을 선택해주세요!");
        return;
    }

    // 단어 수집
    gameWords = [];
    selectedUnits.forEach(unit => {
        if (allData[unit]) {
            gameWords = gameWords.concat(allData[unit]);
        }
    });

    if (gameWords.length === 0) {
        alert("선택한 유닛에 단어가 없습니다!");
        return;
    }

    // 셔플
    gameWords.sort(() => Math.random() - 0.5);

    // 난이도 설정
    setDifficulty(currentDifficulty);

    // 상태 초기화
    score = 0;
    life = 5;
    correctCount = 0;
    missedCount = 0;
    activeWordsObj = [];
    gameRunning = true;
    gamePaused = false;

    // UI 초기화
    scoreEl.textContent = score;
    updateLifeIcons();
    backgroundImage.classList.remove('destroyed');
    playArea.innerHTML = '';
    wordInput.value = '';

    // 게임 화면으로 전환 후 레이아웃 확정되면 groundLevel 측정
    showScreen(gameScreen);

    requestAnimationFrame(() => {
        storedGroundLevel = playArea.offsetHeight - 50;
        wordInput.focus();
        lastSpawnTime = performance.now();
        lastFrameTime = 0;
        gameLoopId = requestAnimationFrame(gameLoop);
    });
}

/* 난이도 설정 */
function setDifficulty(diff) {
    switch (diff) {
        case 'easy':
            baseSpawnRate = 2500;
            fallSpeedBase = 0.4;
            break;
        case 'normal':
            baseSpawnRate = 2000;
            fallSpeedBase = 1.0;
            break;
        case 'hard':
            baseSpawnRate = 1200;
            fallSpeedBase = 1.5;
            break;
    }
    spawnRate = baseSpawnRate;
}

/* 게임 루프 */
function gameLoop(timestamp) {
    if (!gameRunning || gamePaused) return;

    // delta time: 60fps 기준으로 정규화 (120Hz 기기도 동일 속도)
    const delta = lastFrameTime ? Math.min(timestamp - lastFrameTime, 50) : 16.67;
    lastFrameTime = timestamp;
    const dt = delta / 16.67; // 60fps = 1.0, 120fps = 0.5

    // 단어 생성
    if (timestamp - lastSpawnTime > spawnRate) {
        spawnWord();
        lastSpawnTime = timestamp;

        // 점진적 난이도 증가
        if (spawnRate > 800) spawnRate -= 3;
        fallSpeedBase += 0.0005;
    }

    // 게임 시작 시 고정된 groundLevel 사용 (키보드 열려도 변하지 않음)
    const groundLevel = storedGroundLevel;

    for (let i = activeWordsObj.length - 1; i >= 0; i--) {
        const wordObj = activeWordsObj[i];
        wordObj.y += wordObj.speed * dt;
        wordObj.element.style.top = wordObj.y + 'px';

        // 위험 표시 (바닥 근처)
        if (wordObj.y > groundLevel - 100) {
            wordObj.element.classList.add('danger');
        }

        // 바닥에 닿으면 생명 감소
        if (wordObj.y > groundLevel) {
            damageLife();
            removeWord(i);
        }
    }

    if (gameRunning) {
        gameLoopId = requestAnimationFrame(gameLoop);
    }
}

/* 단어 생성 */
function spawnWord() {
    if (gameWords.length === 0) return;

    const wordData = gameWords[Math.floor(Math.random() * gameWords.length)];
    const displayText = isEnglishInput ? wordData.kr : wordData.en;

    const el = document.createElement('div');
    el.classList.add('falling-word');
    el.textContent = displayText;

    const containerWidth = gameContainer.offsetWidth;
    const padding = 80;
    const randomLeft = Math.floor(Math.random() * (containerWidth - padding * 2)) + padding;

    el.style.left = randomLeft + 'px';
    el.style.top = '-50px';

    playArea.appendChild(el);

    activeWordsObj.push({
        element: el,
        x: randomLeft,
        y: -50,
        speed: fallSpeedBase + (Math.random() * 0.3),
        data: wordData
    });
}

/* 단어 제거 */
function removeWord(index) {
    if (index < 0 || index >= activeWordsObj.length) return;
    const wordObj = activeWordsObj[index];
    if (wordObj && wordObj.element) {
        wordObj.element.remove();
    }
    activeWordsObj.splice(index, 1);
}

/* 입력 확인 */
function checkInput(e) {
    const text = e.target.value.trim().toLowerCase();
    if (!text) return;

    const matchIndex = activeWordsObj.findIndex(wordObj => {
        let targetAnswer = isEnglishInput ? wordObj.data.en : wordObj.data.kr;
        targetAnswer = targetAnswer.toLowerCase().trim();
        return targetAnswer === text;
    });

    if (matchIndex !== -1) {
        // 정답!
        const wordObj = activeWordsObj[matchIndex];
        wordObj.element.classList.add('matched');

        score += 10;
        correctCount++;
        scoreEl.textContent = score;

        // 약간의 딜레이 후 제거 (애니메이션을 위해)
        setTimeout(() => {
            const idx = activeWordsObj.indexOf(wordObj);
            if (idx !== -1) removeWord(idx);
        }, 300);

        wordInput.value = '';
        flashPlayArea('flash-green');
    }
}

/* 플래시 효과 (타이머 충돌 방지) */
function flashPlayArea(animName) {
    clearTimeout(flashTimeoutId);
    playArea.style.animation = 'none';
    void playArea.offsetHeight; // reflow 강제 - 애니메이션 재시작
    playArea.style.animation = `${animName} 0.3s`;
    flashTimeoutId = setTimeout(() => { playArea.style.animation = ''; }, 300);
}

/* 생명 감소 */
function damageLife() {
    life--;
    missedCount++;
    updateLifeIcons();

    flashPlayArea('flash-red');

    // 배경 변경 (생명 2개 이하)
    if (life <= 2 && life > 0) {
        backgroundImage.classList.add('destroyed');
    }

    if (life <= 0) {
        endGame();
    }
}

/* 게임 일시정지 */
function pauseGame() {
    gamePaused = true;
    pauseOverlay.classList.remove('hidden');
    pauseOverlay.classList.add('active');
}

/* 게임 재개 */
function resumeGame() {
    if (!gamePaused) return; // 이미 실행 중이면 중복 루프 방지
    gamePaused = false;
    pauseOverlay.classList.remove('active');
    pauseOverlay.classList.add('hidden');
    lastSpawnTime = performance.now();
    lastFrameTime = 0;
    gameLoopId = requestAnimationFrame(gameLoop);
    wordInput.focus();
}

/* 게임 종료 (메뉴로) */
function quitGame() {
    gameRunning = false;
    gamePaused = false;
    cancelAnimationFrame(gameLoopId);
    activeWordsObj.forEach(obj => obj.element.remove());
    activeWordsObj = [];
    showScreen(mainMenu);
    backgroundImage.classList.remove('destroyed');
}

/* 게임 오버 */
function endGame() {
    gameRunning = false;
    cancelAnimationFrame(gameLoopId);

    // 결과 표시
    document.getElementById('final-score').textContent = score;
    document.getElementById('correct-count').textContent = correctCount;
    document.getElementById('missed-count').textContent = missedCount;

    showScreen(gameOverScreen);
}
