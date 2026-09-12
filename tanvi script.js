// ==========================================
// 1. FIREBASE WEBRTC SIGNALING ONLY
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDHmyoBemXQFOxXsVmwFc5l4LHWKhZHtlI",
  authDomain: "teamrhythmik.firebaseapp.com",
  projectId: "teamrhythmik",
  storageBucket: "teamrhythmik.firebasestorage.app",
  messagingSenderId: "861227698308",
  appId: "1:861227698308:web:a9f8802b0565aa7b7f9ad1"
};

if (typeof firebase !== 'undefined' && firebase.apps && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;

let peerConnection = null;
let dataChannel = null;
let isHost = true;
let roomId = null;

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

// ==========================================
// 2. LOCAL USER PROFILE SYSTEM
// ==========================================
let currentUsername = localStorage.getItem('rhythmik_alias') || "PLAYER";
let userData = JSON.parse(localStorage.getItem('rhythmik_data')) || {
    coins: 0,
    highScore: 0,
    unlockedSongs: [0, 1]
};

function saveLocalProfile() {
    localStorage.setItem('rhythmik_alias', currentUsername);
    localStorage.setItem('rhythmik_data', JSON.stringify(userData));
    const uEl = document.getElementById('lobby-username');
    const cEl = document.getElementById('lobby-coins');
    if (uEl) uEl.innerText = currentUsername;
    if (cEl) cEl.innerText = userData.coins;
}

// ==========================================
// 3. DOM ELEMENTS & GAME STATE
// ==========================================
let isSplashActive = true;
let isPlaying = false;
let isPaused = false;

let leftCabFlash = 0;
let rightCabFlash = 0;

function fitArcade() {
    const scaler = document.getElementById('arcade-scaler');
    if (!scaler) return;
    const targetWidth = 1000;
    const targetHeight = 1250;
    const factor = isSplashActive ? 0.62 : 0.72;
    const scaleX = (window.innerWidth * factor) / targetWidth;
    const scaleY = (window.innerHeight * factor) / targetHeight;
    const finalScale = Math.min(scaleX, scaleY);
    scaler.style.transform = `scale(${finalScale})`;
}
window.addEventListener('resize', fitArcade);
fitArcade();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const arcadeRoom = document.getElementById('arcade-room');
const arcadeCabinet = document.getElementById('arcade-cabinet'); 

const introScreen = document.getElementById('intro-screen');
const aliasScreen = document.getElementById('alias-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const profileScreen = document.getElementById('profile-screen');
const multiplayerScreen = document.getElementById('multiplayer-screen');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');

const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives-container');
const comboEl = document.getElementById('combo');
const multiplierEl = document.getElementById('multiplier');
const roundUiEl = document.getElementById('round-ui');
const comboContainer = document.getElementById('combo-container');
const trackEl = document.getElementById('current-track');
const sessionCoinsEl = document.getElementById('session-coins');
const finalScoreEl = document.getElementById('final-score');
const earnedCoinsEl = document.getElementById('earned-coins');
const highScoreAlertEl = document.getElementById('high-score-alert');

let uiState = 'SPLASH'; 
let lobbySelect = 0; 
let mpModeSelect = 0; 
let mpJoinSelect = 0; 
let pauseSelect = 0; 
let machinePower = 0; 
let targetMachinePower = 0;

if (document.getElementById('lobby-coins')) document.getElementById('lobby-coins').innerText = userData.coins;
if (document.getElementById('lobby-username')) document.getElementById('lobby-username').innerText = currentUsername;

const playlist = [
    { title: "Master of Puppets", src: "audio/master_of_puppets.mp3", fallbackSrc: "audio/mop.mp3", bpm: 212, cost: 0 },
    { title: "Super Mario Bros.", src: "audio/super_mario_bros.mp3", fallbackSrc: "audio/smb.mp3", bpm: 130, cost: 0 },
    { title: "Shape Of You", src: "audio/shape_of_you.mp3", fallbackSrc: "audio/shape.mp3", bpm: 150, cost: 50 },
    { title: "Enter Sandman", src: "audio/enter_sandman.mp3", fallbackSrc: "audio/sandman.mp3", bpm: 180, cost: 100 },
    { title: "Scourage of Iron", src: "audio/scourage_of_iron.mp3", fallbackSrc: "audio/iron.mp3", bpm: 212, cost: 150 },
    { title: "Creep", src: "audio/creep.mp3", fallbackSrc: "audio/creep.mp3", bpm: 150, cost: 200 }
];

let currentSongIndex = 0;
let bgMusic = new Audio();
bgMusic.crossOrigin = "anonymous";
bgMusic.preservesPitch = false; 

let audioCtx, analyser, dataArray, masterGain;
let audioUnlocked = false;
let activeLetters = [];
let activeWord = null; // New active Boss Word tracker
let floatingTexts = [];
let particles = [];

let gameMode = 'solo'; 
let score = 0;
let sessionCoins = 0;
let currentRound = 1;
let comboCount = 0;
let comboMultiplier = 1;
let lives = 3;
const MAX_LIVES = 5;

let nextSpawnTime = 0;
let beatInterval = 0;
let targetPlaybackRate = 1.0; 
let currentPlaybackRate = 1.0;
let targetFallSpeed = 200; 
let currentFallSpeed = 200;
let lastTime = 0;
let songTime = 0;
let arcadeShakeIntensity = 0;
let slowMoTimer = 0;
let menuFadeInterval;

window.musicReaction = 0;
window.musicHue = 0;

const comboColors = ['#fff', '#00ffcc', '#ffaa00', '#ff0055', '#b300ff', '#ff0000'];
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const leftCab = document.querySelector('.left-cabinet');
const rightCab = document.querySelector('.right-cabinet');

function resizeBackground() { 
    bgCanvas.width = window.innerWidth; 
    bgCanvas.height = window.innerHeight; 
}
window.addEventListener('resize', resizeBackground);
resizeBackground();

// ==========================================
// 4. AUDIO VISUALIZER
// ==========================================
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!masterGain) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128; 
        masterGain = audioCtx.createGain(); 
        const audioSource = audioCtx.createMediaElementSource(bgMusic);
        audioSource.connect(analyser); 
        analyser.connect(masterGain);  
        masterGain.connect(audioCtx.destination); 
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        drawBackground();
    }
}

function unlockAudio() {
    if (audioUnlocked) return;
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    audioUnlocked = true;
    if (uiState !== 'SPLASH' && uiState !== 'ALIAS' && !isPlaying && bgMusic.paused) {
        startMenuMusic(true);
    }
}
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

function startMenuMusic(fadeIn = false) {
    if (!audioUnlocked || isPlaying) return;
    clearInterval(menuFadeInterval);
    
    const track = playlist[currentSongIndex];
    bgMusic.src = track.src;
    bgMusic.loop = true;
    currentPlaybackRate = 1.0; 
    bgMusic.playbackRate = 1.0;
    
    if (fadeIn && masterGain) {
        masterGain.gain.value = 0;
        bgMusic.play().catch(() => {
            if (track.fallbackSrc) {
                bgMusic.src = track.fallbackSrc;
                bgMusic.play().catch(() => {});
            }
        });
        let fadeVol = 0;
        menuFadeInterval = setInterval(() => {
            fadeVol += 0.02;
            if (fadeVol >= 0.4) { 
                masterGain.gain.value = 0.4; 
                clearInterval(menuFadeInterval); 
            } else { 
                masterGain.gain.value = fadeVol; 
            }
        }, 100);
    } else {
        if (masterGain) masterGain.gain.value = 0.4;
        bgMusic.play().catch(() => {
            if (track.fallbackSrc) {
                bgMusic.src = track.fallbackSrc;
                bgMusic.play().catch(() => {});
            }
        });
    }
}

function drawBackground() {
    requestAnimationFrame(drawBackground);
    if (!analyser) return;
    
    machinePower += (targetMachinePower - machinePower) * 0.05;

    analyser.getByteFrequencyData(dataArray);
    let bassSum = 0; 
    let bassCount = Math.floor(dataArray.length / 4); 
    for (let i = 0; i < bassCount; i++) bassSum += dataArray[i];
    const reaction = (bassCount > 0 ? (bassSum / bassCount) : 0) / 255;
    
    window.musicReaction = reaction;
    window.musicHue = ((bassSum / bassCount) * 1.5) % 360;

    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    const cx = bgCanvas.width / 2; 
    const cy = bgCanvas.height / 2; 
    
    if (uiState !== 'PLAYING' && uiState !== 'PAUSED' && uiState !== 'GAMEOVER' && uiState !== 'SPLASH') {
        const grad = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, reaction * (cx * 1.2) + 150);
        grad.addColorStop(0, `hsla(${window.musicHue}, 90%, 50%, ${(0.1 + reaction * 0.2) * machinePower})`); 
        grad.addColorStop(1, `transparent`);
        bgCtx.fillStyle = grad; 
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        const barWidth = Math.ceil(bgCanvas.width / dataArray.length) * 2;
        for (let i = 0; i < dataArray.length; i++) {
            const heightPct = dataArray[i] / 255;
            const barHeight = heightPct * bgCanvas.height * 1.2 * machinePower;
            let barGrad = bgCtx.createLinearGradient(0, bgCanvas.height, 0, bgCanvas.height - barHeight);
            barGrad.addColorStop(0, `hsla(${(window.musicHue + i*3) % 360}, 100%, 20%, ${0.8 * machinePower})`);
            barGrad.addColorStop(1, `hsla(${(window.musicHue + i*3) % 360}, 100%, 60%, ${0.8 * machinePower})`);
            bgCtx.fillStyle = barGrad;
            bgCtx.fillRect(i * barWidth, bgCanvas.height - barHeight, barWidth + 1, barHeight);
        }
    } else {
        const grad = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, reaction * (cx * 1.2) + 150);
        grad.addColorStop(0, `hsla(${window.musicHue}, 90%, 50%, ${(0.05 + reaction * 0.1) * machinePower})`); 
        grad.addColorStop(1, `transparent`);
        bgCtx.fillStyle = grad; 
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    }

    let dynBright = 0.1 + (0.55 + reaction * 0.5) * machinePower; 
    let gray = 1 - machinePower;

    leftCabFlash = Math.max(0, leftCabFlash - 0.05);
    rightCabFlash = Math.max(0, rightCabFlash - 0.05);
    
    let dynBrightLeft = dynBright + leftCabFlash;
    let dynBrightRight = dynBright + rightCabFlash;

    if (leftCab) {
        leftCab.style.filter = `grayscale(${gray}) hue-rotate(${window.musicHue}deg) brightness(${dynBrightLeft}) contrast(1.2)`;
        leftCab.style.boxShadow = `0 40px 100px rgba(0,0,0,1), 0 0 ${50 + reaction * 250 + (leftCabFlash * 200)}px hsla(${window.musicHue}, 100%, 60%, ${reaction * 0.8 * machinePower + leftCabFlash})`;
    }
    if (rightCab) {
        rightCab.style.filter = `grayscale(${gray}) hue-rotate(${window.musicHue}deg) brightness(${dynBrightRight}) contrast(1.2)`;
        rightCab.style.boxShadow = `0 40px 100px rgba(0,0,0,1), 0 0 ${50 + reaction * 250 + (rightCabFlash * 200)}px hsla(${window.musicHue}, 100%, 60%, ${reaction * 0.8 * machinePower + rightCabFlash})`;
    }

    if (arcadeCabinet) {
        const parts = arcadeCabinet.querySelectorAll('.chameleon-part');
        if (slowMoTimer <= 0) {
            parts.forEach(p => { 
                if (!p.classList.contains('flash-nuke') && !p.classList.contains('flash-1up') && !p.classList.contains('flash-combo') && !p.classList.contains('flash-skull')) {
                    p.style.animation = 'none'; 
                    if (uiState === 'PLAYING') p.style.filter = `hue-rotate(${window.musicHue}deg) brightness(${1 + reaction * 0.5})`;
                    else p.style.filter = `grayscale(${gray}) hue-rotate(${window.musicHue}deg) brightness(${dynBright}) contrast(1.2)`; 
                }
            });
            if (uiState === 'PLAYING') {
                arcadeCabinet.style.boxShadow = `0 40px 100px rgba(0,0,0,1), 0 0 ${100 + reaction * 400}px hsla(${window.musicHue}, 100%, 60%, ${0.5 + reaction * 0.5})`;
            } else {
                arcadeCabinet.style.boxShadow = `0 40px 100px rgba(0,0,0,1), 0 0 ${50 + reaction * 200}px hsla(${window.musicHue}, 100%, 50%, ${reaction * 0.6 * machinePower})`;
            }
        }
    }
}

function playMenuSelectSound() { if (audioCtx) playTone(600, 'square', audioCtx.currentTime, 0.05, 0.2); }
function playCoinSound() { if (audioCtx) { playTone(987.77, 'square', audioCtx.currentTime, 0.08, 0.3); playTone(1318.51, 'square', audioCtx.currentTime + 0.08, 0.4, 0.3); } }
function playTone(f, type, t, dur, vol, dFreq = null) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator(); 
    const gain = audioCtx.createGain();
    osc.type = type; 
    osc.frequency.setValueAtTime(f, t);
    if (dFreq) osc.frequency.exponentialRampToValueAtTime(dFreq, t + dur);
    gain.gain.setValueAtTime(vol, t); 
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); 
    gain.connect(audioCtx.destination); 
    osc.start(t); 
    osc.stop(t + dur);
}
function playHitSound() {
    if (!audioCtx) return; 
    const t = audioCtx.currentTime; 
    playTone(1200, 'square', t, 0.05, 0.15, 800); 
}
function play1UPSound() { if (audioCtx) { playTone(523.25, 'square', audioCtx.currentTime, 0.1, 0.3); playTone(659.25, 'square', audioCtx.currentTime + 0.1, 0.1, 0.3); playTone(783.99, 'square', audioCtx.currentTime + 0.2, 0.3, 0.3); } }
function playNukeSound() {
    if (!audioCtx) return; 
    const t = audioCtx.currentTime;
    playTone(440, 'sine', t, 0.4, 0.2, 880); playTone(554.37, 'sine', t + 0.1, 0.4, 0.2, 1108.73);
    playTone(220, 'triangle', t, 1.0, 0.2, 110);
}
function playSlowMoSound() { if (audioCtx) playTone(800, 'sine', audioCtx.currentTime, 1.0, 0.5, 100); }
function playDamageSound() { if (audioCtx) { playTone(400, 'square', audioCtx.currentTime, 0.1, 0.3, 300); playTone(200, 'square', audioCtx.currentTime + 0.2, 0.2, 0.3, 100); } }

const centerButtons = document.querySelectorAll('.center-cabinet .action-button');
const centerJoystickBall = document.querySelector('.center-cabinet .joystick-ball');
function animateHardwareDeck(char) {
    if (centerJoystickBall) {
        const offset = ((char.charCodeAt(0) - 65) % 3) - 1;
        centerJoystickBall.style.transform = `translate(${offset * 14}px, -4px) scale(0.95)`;
        setTimeout(() => { centerJoystickBall.style.transform = ''; }, 110);
    }
    if (centerButtons.length > 0) {
        const btn = centerButtons[Math.floor(Math.random() * centerButtons.length)];
        btn.style.transform = 'translateY(6px)'; 
        btn.style.filter = 'brightness(2.2)';
        setTimeout(() => { btn.style.transform = ''; btn.style.filter = ''; }, 90);
    }
}

// ==========================================
// 5. KEYBOARD-ONLY UI ENGINE
// ==========================================
const btnContinue = document.getElementById('btn-continue');
if (btnContinue) {
    btnContinue.addEventListener('click', () => {
        const inputAlias = document.getElementById('player-alias');
        const alias = (inputAlias && inputAlias.value.trim().toUpperCase()) || "PLAYER";
        currentUsername = alias;
        saveLocalProfile();

        aliasScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        uiState = 'LOBBY_MODE';
        targetMachinePower = 1.0;
        updateLobbyUI(); 
        updateSongDisplays(); 
        startMenuMusic(true);
    });
}

function updateLobbyUI() {
    const btns = [document.getElementById('btn-play-arcade'), document.getElementById('btn-view-profile'), document.getElementById('btn-multiplayer')];
    btns.forEach((b, i) => { if (b) b.classList.toggle('selected-btn', i === lobbySelect); });
}

function updateMpModeUI() {
    const duo = document.getElementById('btn-mode-duo');
    const vs = document.getElementById('btn-mode-1v1');
    if (duo) duo.classList.toggle('selected-btn', mpModeSelect === 0);
    if (vs) vs.classList.toggle('selected-btn', mpModeSelect === 1);
    gameMode = ['duo', '1v1'][mpModeSelect];
}

function updateMpJoinUI() {
    const createBtn = document.getElementById('btn-create-room');
    const joinBtn = document.getElementById('btn-join-room');
    const joinInput = document.getElementById('join-room-id');
    if (createBtn) createBtn.classList.toggle('selected-btn', mpJoinSelect === 0);
    if (joinBtn) joinBtn.classList.toggle('selected-btn', mpJoinSelect === 1);
    if (joinInput) {
        if (mpJoinSelect === 1) {
            joinInput.focus();
            joinInput.style.borderColor = '#ff0055';
        } else {
            joinInput.blur();
            joinInput.style.borderColor = '#0ff';
        }
    }
}

function updatePauseUI() {
    const rBtn = document.getElementById('resume-btn');
    const qBtn = document.getElementById('quit-btn');
    if (rBtn) rBtn.classList.toggle('selected-btn', pauseSelect === 0);
    if (qBtn) qBtn.classList.toggle('selected-btn', pauseSelect === 1);
}

function updateSongDisplays() {
    if (playlist.length === 0) return;
    const len = playlist.length;
    const prevIndex = (currentSongIndex - 1 + len) % len;
    const nextIndex = (currentSongIndex + 1) % len;
    
    const leftTitle = document.getElementById('left-screen-title');
    const rightTitle = document.getElementById('right-screen-title');
    const centerTitle = document.getElementById('center-song-title');
    if (leftTitle) leftTitle.innerText = playlist[prevIndex].title;
    if (rightTitle) rightTitle.innerText = playlist[nextIndex].title;
    if (centerTitle) centerTitle.innerText = `◀ ${playlist[currentSongIndex].title} ▶`;

    const costDisplay = document.getElementById('song-cost-display');
    const startBtn = document.getElementById('start-btn');
    
    if (userData.unlockedSongs.includes(currentSongIndex)) {
        if (costDisplay) costDisplay.classList.add('hidden');
        if (startBtn) {
            startBtn.innerText = "INSERT COIN [ENTER]";
            startBtn.style.color = "#000";
        }
    } else {
        if (costDisplay) {
            costDisplay.classList.remove('hidden');
            costDisplay.innerText = `COST: ${playlist[currentSongIndex].cost} COINS`;
        }
        if (startBtn) {
            startBtn.innerText = "UNLOCK TRACK [ENTER]";
            startBtn.style.color = "#ffaa00";
        }
    }
}

function cycleTrack(direction) {
    playMenuSelectSound();
    
    if(arcadeRoom) {
        arcadeRoom.classList.remove('shift-left', 'shift-right');
        void arcadeRoom.offsetWidth; 
    }
    
    if (direction === -1) {
        currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
        if(arcadeRoom) arcadeRoom.classList.add('shift-left');
        leftCabFlash = 1.0;
    } else {
        currentSongIndex = (currentSongIndex + 1) % playlist.length;
        if(arcadeRoom) arcadeRoom.classList.add('shift-right');
        rightCabFlash = 1.0;
    }
    
    updateSongDisplays();
    startMenuMusic();
}

window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') {
        if (e.key === 'Enter') {
            playMenuSelectSound();
            if (uiState === 'ALIAS' && btnContinue) {
                btnContinue.click();
            } else if (uiState === 'MULTIPLAYER') {
                const jBtn = document.getElementById('btn-join-room');
                if (jBtn) jBtn.click();
            }
        }
        return; 
    }

    if (uiState === 'PLAYING') {
        if (e.key === 'Escape') { togglePause(); return; }
        const key = e.key.toUpperCase();
        animateHardwareDeck(key);

        // --- Check Active Boss Word First ---
        if (activeWord) {
            if (key === activeWord.text[activeWord.progress]) {
                activeWord.progress++;
                playHitSound();
                arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 20);

                if (activeWord.progress >= activeWord.text.length) {
                    // Word completed successfully!
                    score += 50 * comboMultiplier;
                    sessionCoins += 10; // Extra reward coins for completing word
                    floatingTexts.push({ text: "WORD CLEARED! +10 COINS", x: activeWord.x, y: activeWord.y, life: 1.5, size: 16, color: '#ffaa00' });
                    createExplosion(activeWord.x, activeWord.y, '#00ffcc', 1.5);
                    activeWord = null;
                }
            }
            return; // Block regular letter matching while a word is active
        }

        // --- Regular Letter Matching ---
        let targetIndex = -1; 
        let maxY = -100;
        
        for (let i = 0; i < activeLetters.length; i++) {
            if (activeLetters[i].char === key && activeLetters[i].y > maxY) { 
                maxY = activeLetters[i].y; 
                targetIndex = i; 
            }
        }

        if (targetIndex !== -1) {
            const letter = activeLetters[targetIndex];
            activeLetters.splice(targetIndex, 1);
            if (letter.type === 'normal') playHitSound(); 
            else triggerPowerUp(letter);
            
            arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 35); 
            comboCount++; 
            if (comboCount > 0 && comboCount % 6 === 0) comboMultiplier++;
            
            if (letter.type === 'normal') {
                score += 10 * comboMultiplier;
                sessionCoins += 1;
                floatingTexts.push({ text: "+1 COIN", x: letter.x, y: letter.y + 20, life: 1.0, size: 10, color: '#ffaa00' });
                floatingTexts.push({ text: "+" + (10 * comboMultiplier), x: letter.x, y: letter.y, life: 1.0, size: 16, color: '#fff' });
            }
            targetFallSpeed = Math.min(800, targetFallSpeed + 2); 
            updateUI();
        }
        return;
    }

    switch(uiState) {
        case 'SPLASH':
            if (e.key === 'Enter') {
                unlockAudio(); 
                introScreen.classList.add('hidden'); 
                arcadeRoom.classList.remove('zoomed-in-view'); 
                isSplashActive = false; 
                fitArcade();
                uiState = 'ALIAS'; 
                aliasScreen.classList.remove('hidden'); 
                targetMachinePower = 0.0; 
                const aliasInput = document.getElementById('player-alias');
                if (aliasInput) aliasInput.focus();
            }
            break;

        case 'ALIAS':
            if (e.key === 'Enter' && btnContinue) { 
                playMenuSelectSound(); 
                btnContinue.click(); 
            }
            break;

        case 'LOBBY_MODE':
            if (e.key === 'ArrowUp') { 
                lobbySelect = (lobbySelect - 1 + 3) % 3; 
                playMenuSelectSound(); 
                updateLobbyUI(); 
            } else if (e.key === 'ArrowDown') { 
                lobbySelect = (lobbySelect + 1) % 3; 
                playMenuSelectSound(); 
                updateLobbyUI(); 
            } else if (e.key === 'Enter') {
                playMenuSelectSound();
                if (lobbySelect === 0) { 
                    uiState = 'START'; 
                    gameMode = 'solo';
                    isHost = true;
                    lobbyScreen.classList.add('hidden'); 
                    startScreen.classList.remove('hidden'); 
                    updateSongDisplays(); 
                } else if (lobbySelect === 1) { 
                    uiState = 'PROFILE'; 
                    lobbyScreen.classList.add('hidden'); 
                    profileScreen.classList.remove('hidden'); 
                    document.getElementById('prof-username').innerText = currentUsername;
                    document.getElementById('prof-highscore').innerText = userData.highScore;
                    document.getElementById('prof-coins').innerText = userData.coins;
                    document.getElementById('prof-unlocked').innerText = `${userData.unlockedSongs.length} / ${playlist.length}`;
                } else if (lobbySelect === 2) { 
                    uiState = 'MULTIPLAYER';
                    lobbyScreen.classList.add('hidden');
                    multiplayerScreen.classList.remove('hidden');
                    updateMpModeUI();
                    updateMpJoinUI();
                }
            }
            break;
            
        case 'PROFILE':
            if (e.key === 'Escape' || e.key === 'Enter') {
                playMenuSelectSound(); 
                profileScreen.classList.add('hidden'); 
                lobbyScreen.classList.remove('hidden'); 
                uiState = 'LOBBY_MODE';
            }
            break;

        case 'MULTIPLAYER':
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                mpModeSelect = mpModeSelect === 0 ? 1 : 0;
                playMenuSelectSound(); 
                updateMpModeUI();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                mpJoinSelect = mpJoinSelect === 0 ? 1 : 0;
                playMenuSelectSound(); 
                updateMpJoinUI();
            } else if (e.key === 'Enter') {
                playMenuSelectSound();
                if (mpJoinSelect === 0) createRoom(); 
                else joinRoom();
            } else if (e.key === 'Escape') {
                playMenuSelectSound(); 
                multiplayerScreen.classList.add('hidden'); 
                lobbyScreen.classList.remove('hidden'); 
                uiState = 'LOBBY_MODE';
            }
            break;

        case 'START':
            if (e.key === 'ArrowLeft') { 
                cycleTrack(-1);
            } else if (e.key === 'ArrowRight') { 
                cycleTrack(1);
            } else if (e.key === 'Enter') { 
                playMenuSelectSound(); 
                if (userData.unlockedSongs.includes(currentSongIndex)) {
                    if (gameMode !== 'solo') broadcast({ type: 'START_GAME', songIndex: currentSongIndex });
                    startGameSequence(); 
                } else {
                    const cost = playlist[currentSongIndex].cost;
                    if (userData.coins >= cost) {
                        userData.coins -= cost;
                        userData.unlockedSongs.push(currentSongIndex);
                        saveLocalProfile();
                        play1UPSound();
                        updateSongDisplays();
                        arcadeCabinet.classList.add('flash-1up'); 
                        setTimeout(() => arcadeCabinet.classList.remove('flash-1up'), 400);
                    } else {
                        playDamageSound();
                        arcadeShakeIntensity = 20;
                        arcadeCabinet.classList.add('flash-skull'); 
                        setTimeout(() => arcadeCabinet.classList.remove('flash-skull'), 200);
                    }
                }
            } else if (e.key === 'Escape') { 
                startScreen.classList.add('hidden'); 
                lobbyScreen.classList.remove('hidden'); 
                uiState = 'LOBBY_MODE'; 
                document.getElementById('lobby-coins').innerText = userData.coins; 
            }
            break;

        case 'PAUSED':
            if (e.key === 'Escape') togglePause();
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { 
                pauseSelect = pauseSelect === 0 ? 1 : 0; 
                playMenuSelectSound(); 
                updatePauseUI(); 
            } else if (e.key === 'Enter') { 
                playMenuSelectSound(); 
                if (pauseSelect === 0) togglePause(); 
                else quitGame(); 
            }
            break;

        case 'GAMEOVER':
            if (e.key === 'Enter') { 
                playMenuSelectSound(); 
                const restartBtn = document.getElementById('restart-btn');
                if (restartBtn) restartBtn.click(); 
            }
            break;
    }
});

// ==========================================
// 6. WEBRTC MULTIPLAYER SIGNALING 
// ==========================================
async function createRoom() {
    if (!db) { alert("Firebase is not initialized for multiplayer."); return; }
    document.getElementById('multiplayer-controls').classList.add('hidden');
    document.getElementById('room-waiting').classList.remove('hidden');
    
    peerConnection = new RTCPeerConnection(servers);
    dataChannel = peerConnection.createDataChannel('gameData');
    setupDataChannel(dataChannel);

    const roomRef = db.collection('rooms').doc();
    roomId = roomRef.id.slice(0, 5).toUpperCase();
    document.getElementById('display-room-id').innerText = roomId;

    collectIceCandidates(roomRef, peerConnection, 'callerCandidates', 'calleeCandidates');
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await roomRef.set({ roomId: roomId, mode: gameMode, offer: { type: offer.type, sdp: offer.sdp } });

    roomRef.onSnapshot(async snapshot => {
        const data = snapshot.data();
        if (!peerConnection.currentRemoteDescription && data && data.answer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    });
}

async function joinRoom() {
    if (!db) { alert("Firebase is not initialized for multiplayer."); return; }
    const inputId = document.getElementById('join-room-id').value.toUpperCase();
    if (inputId.length < 5) return;
    
    isHost = false;
    const roomsRef = db.collection('rooms');
    const q = await roomsRef.where('roomId', '==', inputId).get();
    if (q.empty) { alert("ROOM NOT FOUND"); return; }
    
    const roomRef = q.docs[0].ref;
    gameMode = q.docs[0].data().mode;

    peerConnection = new RTCPeerConnection(servers);
    peerConnection.ondatachannel = event => { 
        dataChannel = event.channel; 
        setupDataChannel(dataChannel); 
    };

    collectIceCandidates(roomRef, peerConnection, 'calleeCandidates', 'callerCandidates');
    const offer = q.docs[0].data().offer;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
}

function collectIceCandidates(roomRef, pc, localName, remoteName) {
    const localCollection = roomRef.collection(localName);
    const remoteCollection = roomRef.collection(remoteName);
    pc.onicecandidate = event => { if (event.candidate) localCollection.add(event.candidate.toJSON()); };
    remoteCollection.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
    });
}

function setupDataChannel(dc) {
    dc.onopen = () => {
        uiState = 'START';
        multiplayerScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
        const startBtn = document.getElementById('start-btn');
        if (!isHost && startBtn) { 
            startBtn.innerText = "WAITING FOR HOST..."; 
            startBtn.style.color = "#888";
        } else { 
            updateSongDisplays();
        }
    };
    
    dc.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'START_GAME') { 
            currentSongIndex = msg.songIndex; 
            startGameSequence(); 
        } else if (msg.type === 'SPAWN_LETTER') { 
            activeLetters.push(msg.letter); 
        } else if (msg.type === 'HIT_LETTER') {
            const idx = activeLetters.findIndex(l => l.id === msg.id);
            if (idx > -1) activeLetters.splice(idx, 1);
        }
    };
}

function broadcast(msgObj) { 
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(msgObj)); 
    }
}

// ==========================================
// 7. CORE GAMEPLAY ENGINE
// ==========================================
function startGameSequence() {
    uiState = 'LOADING'; 
    unlockAudio(); 
    playCoinSound();
    
    currentSong = playlist[currentSongIndex]; 
    if (trackEl) trackEl.innerText = currentSong.title;

    bgMusic.pause(); 
    bgMusic.src = currentSong.src; 
    bgMusic.loop = false;
    if (masterGain) masterGain.gain.value = 0; 
    
    arcadeRoom.classList.add('game-running');
    gameContainer.style.borderColor = '#fff';

    activeLetters = []; 
    activeWord = null;
    floatingTexts = []; 
    particles = [];
    score = 0; 
    currentRound = 1; 
    comboCount = 0; 
    comboMultiplier = 1; 
    lives = 3; 
    sessionCoins = 0;
    arcadeShakeIntensity = 0; 
    slowMoTimer = 0; 
    currentPlaybackRate = 1.0; 
    targetPlaybackRate = 1.0; 
    bgMusic.playbackRate = 1.0;
    currentFallSpeed = 200; 
    targetFallSpeed = 200; 
    beatInterval = 60 / currentSong.bpm; 
    
    startScreen.classList.add('hidden'); 
    if (highScoreAlertEl) highScoreAlertEl.classList.add('hidden');
    
    setTimeout(() => {
        songTime = 0; 
        bgMusic.currentTime = 0; 
        if (masterGain) masterGain.gain.value = 1.0; 
        nextSpawnTime = 0.2;
        isPlaying = true; 
        isPaused = false; 
        uiState = 'PLAYING';
        
        bgMusic.play().catch(() => {
            if (currentSong.fallbackSrc) {
                bgMusic.src = currentSong.fallbackSrc;
                bgMusic.play().catch(() => {});
            }
        });
        
        updateUI(); 
        lastTime = performance.now(); 
        requestAnimationFrame(update);
    }, 1500); 
}

function spawnLetterLogic() {
    // If a boss word is currently active, do NOT spawn anything else!
    if (activeWord) return;

    // 20% chance to spawn a Boss Word instead of a single letter
    if (Math.random() < 0.20) {
        const words = ["CYBER", "RHYTHM", "OVERKILL", "SYSTEM", "BIT", "ARCADE", "VECTOR"];
        const text = words[Math.floor(Math.random() * words.length)];
        const x = Math.random() * (canvas.width - 250) + 100;
        activeWord = { text: text, progress: 0, x: x, y: -30, color: '#00ffff' };
        return;
    }

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const char = chars[Math.floor(Math.random() * chars.length)];
    const x = Math.random() * (canvas.width - 120) + 60;
    
    let type = 'normal';
    let color = comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)];

    if (Math.random() < 0.15) {
        const roll = Math.random();
        if (roll < 0.25) { type = '1up'; color = '#0f0'; }
        else if (roll < 0.50) { type = 'slow'; color = '#0ff'; }
        else if (roll < 0.75) { type = 'nuke'; color = '#ff4400'; }
        else { type = 'skull'; color = '#ff0033'; }
    }
    const newLetter = { id: Date.now() + Math.random(), char, x, y: -30, color, type };
    activeLetters.push(newLetter);
    if (gameMode !== 'solo' && isHost) broadcast({ type: 'SPAWN_LETTER', letter: newLetter });
}

function update(time) {
    if (!isPlaying || isPaused) return;
    const dt = Math.min((time - lastTime) / 1000, 0.1); 
    lastTime = time;

    if (bgMusic.readyState >= 3 && !bgMusic.paused) { 
        songTime = bgMusic.currentTime; 
    } else { 
        songTime += dt * (slowMoTimer > 0 ? 0.6 : targetPlaybackRate); 
    }

    if (score >= 2000 && currentRound === 1) { 
        currentRound = 2; 
        targetPlaybackRate = 1.05; 
        targetFallSpeed = 230; 
        updateUI(); 
    } else if (score >= 4000 && currentRound === 2) { 
        currentRound = 3; 
        targetPlaybackRate = 1.10; 
        targetFallSpeed = 260; 
        updateUI(); 
    }

    if (slowMoTimer > 0) {
        slowMoTimer -= dt; 
        arcadeCabinet.classList.add('slow-mo-active');
        currentPlaybackRate += (0.5 - currentPlaybackRate) * dt * 3.0; 
        currentFallSpeed += ((targetFallSpeed * 0.4) - currentFallSpeed) * dt * 3.0;
    } else {
        arcadeCabinet.classList.remove('slow-mo-active');
        if (currentPlaybackRate < targetPlaybackRate) { 
            currentPlaybackRate = targetPlaybackRate; 
            currentFallSpeed = targetFallSpeed; 
        }
    }
    bgMusic.playbackRate = Math.max(0.1, currentPlaybackRate);

    let currentShake = arcadeShakeIntensity;
    if (isPlaying && slowMoTimer <= 0) currentShake += (window.musicReaction || 0) * 8; 

    if (currentShake > 0.5) {
        arcadeCabinet.style.transform = `translate3d(${(Math.random() - 0.5) * currentShake}px, ${94 + (Math.random() - 0.5) * currentShake}px, 1380px)`;
        arcadeShakeIntensity *= 0.85; 
        if (arcadeShakeIntensity < 0.1) arcadeShakeIntensity = 0;
    } else { 
        arcadeCabinet.style.transform = `translate3d(0px, 94px, 1380px)`; 
    }

    if ((gameMode === 'solo' || isHost) && songTime >= nextSpawnTime) {
        spawnLetterLogic();
        let activeInterval = beatInterval * 2;
        if (currentRound === 2) activeInterval = beatInterval * 1.5;
        if (currentRound === 3) activeInterval = beatInterval * 1.2;
        nextSpawnTime = songTime + activeInterval;
    }

    // 1. Clear canvas first
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. Draw beat-synced background grid and EQ bars behind everything
    let beat = window.musicReaction || 0;
    let hue = window.musicHue || 0;
    
    ctx.fillStyle = `hsla(${hue}, 100%, 8%, ${0.2 + beat * 0.5})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${0.1 + beat * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const gridSize = 40 + (beat * 15); 
    const offsetX = (canvas.width % gridSize) / 2;
    for (let x = offsetX; x < canvas.width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = 0; y < canvas.height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();

    if (dataArray && analyser) {
        const bars = 40;
        const bWidth = canvas.width / bars;
        for (let i = 0; i < bars; i++) {
            const dataIndex = Math.floor((i / bars) * (dataArray.length / 2));
            const heightPct = dataArray[dataIndex] / 255;
            const bHeight = heightPct * 180; 
            ctx.fillStyle = `hsla(${(hue + i * 4) % 360}, 100%, 60%, ${0.2 + beat * 0.4})`;
            ctx.fillRect(i * bWidth, canvas.height - bHeight, bWidth - 2, bHeight);
        }
    }

    // 3. Render particles, floating text, and falling letters/words on top
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; 
        p.vy += 1000 * dt; 
        p.x += p.vx * dt; 
        p.y += p.vy * dt; 
        p.life -= dt * 1.5; 
        if (p.life <= 0) particles.splice(i, 1); 
        else { 
            ctx.fillStyle = p.color; 
            ctx.globalAlpha = p.life; 
            ctx.fillRect(p.x, p.y, p.size, p.size); 
        }
    }
    ctx.globalAlpha = 1.0;

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i]; 
        ft.y -= dt * 60; 
        ft.life -= dt * 1.5;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
        else { 
            ctx.globalAlpha = Math.min(1.0, ft.life); 
            ctx.fillStyle = ft.color; 
            ctx.font = ft.size + 'px "Press Start 2P", monospace'; 
            ctx.textAlign = 'center'; 
            ctx.fillText(ft.text, ft.x, ft.y); 
        }
    }
    ctx.globalAlpha = 1.0;

    // --- Draw Active Boss Word ---
    if (activeWord) {
        activeWord.y += (currentFallSpeed * 0.75) * dt; // Words fall slightly slower for readability
        ctx.font = '22px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const typedPart = activeWord.text.substring(0, activeWord.progress);
        const remainingPart = activeWord.text.substring(activeWord.progress);

        // Draw typed letters in green, remaining in cyan
        ctx.fillStyle = '#00ff66';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ff66';
        ctx.fillText(typedPart, activeWord.x - 30, activeWord.y);

        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.fillText(remainingPart, activeWord.x + 30, activeWord.y);
        ctx.shadowBlur = 0;

        if (activeWord.y > canvas.height + 20) {
            activeWord = null;
            floatingTexts.push({ text: "WORD MISSED", x: canvas.width/2, y: canvas.height - 30, life: 0.8, size: 16, color: '#ff0033' });
            loseLife();
            if (lives <= 0) return;
        }
    }

    // --- Draw Falling Normal Letters ---
    ctx.font = '24px "Press Start 2P", monospace'; 
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    for (let i = activeLetters.length - 1; i >= 0; i--) {
        let l = activeLetters[i]; 
        l.y += currentFallSpeed * dt;
        
        ctx.globalAlpha = 1.0; 
        ctx.fillStyle = l.color;
        ctx.shadowBlur = l.type !== 'normal' ? 15 : 0; 
        ctx.shadowColor = l.color;
        
        let text = l.char;
        if (l.type === 'nuke') text = `[ ${l.char} ]`; 
        else if (l.type === '1up') text = `+ ${l.char} +`; 
        else if (l.type === 'slow') text = `~ ${l.char} ~`;
        else if (l.type === 'skull') text = `☠ ${l.char} ☠`;
        ctx.fillText(text, l.x, l.y);
        ctx.shadowBlur = 0; 
        
        if (l.y > canvas.height + 20) { 
            activeLetters.splice(i, 1); 
            if (l.type === 'skull') {
                floatingTexts.push({ text: "EVADED", x: l.x, y: canvas.height - 30, life: 0.8, size: 16, color: '#00ff66' });
            } else {
                floatingTexts.push({ text: "MISS", x: l.x, y: canvas.height - 30, life: 0.8, size: 16, color: '#ff0033' });
                loseLife(); 
                if (lives <= 0) return; 
            }
        }
    }
    requestAnimationFrame(update);
}

function updateUI() {
    scoreEl.innerText = score; 
    comboEl.innerText = comboCount; 
    multiplierEl.innerText = 'x' + comboMultiplier;
    roundUiEl.innerText = 'ROUND ' + currentRound;
    if (sessionCoinsEl) sessionCoinsEl.innerText = sessionCoins;
    
    let hearts = ""; 
    for (let i = 0; i < lives; i++) hearts += "♥"; 
    livesEl.innerText = hearts;
    if (lives === 1) gameContainer.classList.add('danger-state'); 
    else gameContainer.classList.remove('danger-state');
    
    const colorIndex = Math.min(comboMultiplier - 1, comboColors.length - 1);
    comboContainer.style.color = comboColors[colorIndex];
}

function triggerPowerUp(letter) {
    let isPositive = (letter.type !== 'skull');

    if (isPositive) {
        sessionCoins = Math.ceil(sessionCoins * 1.5) + 5;
        floatingTexts.push({ text: "COINS x1.5!", x: canvas.width/2, y: canvas.height/2 + 70, life: 2.0, size: 20, color: '#ffaa00' });

        if (letter.type === '1up') {
            lives = Math.min(lives + 1, MAX_LIVES); 
            play1UPSound();
            arcadeCabinet.classList.add('flash-1up'); 
            setTimeout(() => arcadeCabinet.classList.remove('flash-1up'), 400);
            floatingTexts.push({ text: "1-UP!", x: letter.x, y: letter.y, life: 1.5, size: 20, color: '#0f0' });
        } else if (letter.type === 'nuke') {
            arcadeShakeIntensity = 80; 
            playNukeSound();
            arcadeCabinet.classList.add('flash-nuke'); 
            setTimeout(() => arcadeCabinet.classList.remove('flash-nuke'), 500);
            let pointsGained = 0;
            for (let i = activeLetters.length - 1; i >= 0; i--) { 
                pointsGained += (10 * comboMultiplier); 
                createExplosion(activeLetters[i].x, activeLetters[i].y, activeLetters[i].color, 1.3); 
            }
            score += pointsGained;
            floatingTexts.push({ text: "NUKE DETONATED!", x: canvas.width/2, y: canvas.height/2, life: 2.0, size: 30, color: '#ff4400' });
            if (pointsGained > 0) floatingTexts.push({ text: `+${pointsGained}`, x: canvas.width/2, y: canvas.height/2 + 40, life: 2.0, size: 20, color: '#fff' });
            activeLetters = []; 
            activeWord = null;
            targetFallSpeed = 200 + ((currentRound - 1) * 30); 
            nextSpawnTime = songTime + 2.0; 
        } else if (letter.type === 'slow') {
            slowMoTimer = 6.0; 
            playSlowMoSound();
            floatingTexts.push({ text: "TIME WARP", x: letter.x, y: letter.y, life: 1.5, size: 20, color: '#0ff' });
        }
    } else {
        arcadeShakeIntensity = 40; 
        playDamageSound();
        arcadeCabinet.classList.add('flash-skull'); 
        setTimeout(() => arcadeCabinet.classList.remove('flash-skull'), 400);
        
        sessionCoins = Math.floor(sessionCoins / 2); 
        comboCount = 0; 
        comboMultiplier = 1; 
        floatingTexts.push({ text: "POISON! COINS HALVED!", x: letter.x, y: letter.y, life: 1.5, size: 20, color: '#ff0033' });
    }
}

function createExplosion(x, y, color, scale = 1.0) {
    const particleCount = 35 * scale;
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 20, 
            y: y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * (800 * scale), 
            vy: (Math.random() - 0.5) * (800 * scale),
            life: 1.0 + Math.random() * 0.3, 
            size: Math.random() * (8 * scale) + 2, 
            color: color
        });
    }
}

function loseLife() {
    lives--; 
    comboCount = 0; 
    comboMultiplier = 1;
    arcadeShakeIntensity = 60; 
    playDamageSound();
    
    gameContainer.classList.add('damage-flicker');
    setTimeout(() => gameContainer.classList.remove('damage-flicker'), 400);
    updateUI();
    
    if (lives <= 0) {
        isPlaying = false; 
        uiState = 'GAMEOVER';
        finalScoreEl.innerText = score;

        let phrases = [];
        if (score < 1000) {
            phrases = ["YOU CALL THAT TYPING?", "FINGERS TIED IN KNOTS?", "BETTER LUCK NEXT TIME"];
        } else if (score < 4000) {
            phrases = ["VALIANT EFFORT!", "NOT BAD FOR A ROOKIE", "KEEP PRACTICING"];
        } else if (score < 10000) {
            phrases = ["KEYBOARD WARRIOR!", "ABSOLUTE DEVASTATION!", "UNSTOPPABLE FORCE!"];
        } else {
            phrases = ["FLAWLESS VICTORY!", "ASCENDED TO GODHOOD!", "CYBERNETIC REFLEXES!"];
        }
        
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
        const conclusionEl = document.getElementById('conclusion-phrase');
        if (conclusionEl) conclusionEl.innerText = randomPhrase;
        
        if (score > userData.highScore) {
            userData.highScore = score;
            if (highScoreAlertEl) highScoreAlertEl.classList.remove('hidden');
        }

        userData.coins += sessionCoins;
        saveLocalProfile();
        
        earnedCoinsEl.innerText = "+" + sessionCoins;
        gameOverScreen.classList.remove('hidden');
        bgMusic.pause();
    } else {
        slowMoTimer = 2.0; 
        playSlowMoSound();
    }
}

function togglePause() {
    if (!isPlaying) return;
    isPaused = !isPaused;
    if (isPaused) {
        uiState = 'PAUSED'; 
        bgMusic.pause(); 
        pauseSelect = 0; 
        updatePauseUI(); 
        pauseScreen.classList.remove('hidden');
    } else {
        uiState = 'PLAYING'; 
        pauseScreen.classList.add('hidden'); 
        requestAnimationFrame((t) => { lastTime = t; bgMusic.play(); requestAnimationFrame(update); });
    }
}

function quitGame() {
    isPaused = false; 
    isPlaying = false; 
    uiState = 'LOBBY_MODE';

    bgMusic.pause();
    bgMusic.currentTime = 0;

    arcadeRoom.classList.remove('game-running');
    pauseScreen.classList.add('hidden'); 
    startScreen.classList.add('hidden'); 
    lobbyScreen.classList.remove('hidden');
    gameContainer.classList.remove('danger-state');
    
    arcadeCabinet.style.transform = ''; 
    arcadeCabinet.classList.remove('slow-mo-active');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    updateLobbyUI(); 
    startMenuMusic(true);
}

// ==========================================
// 8. MOUSE CLICK EVENT LISTENERS
// ==========================================
const restartBtn = document.getElementById('restart-btn');
if (restartBtn) restartBtn.addEventListener('click', () => { 
    playMenuSelectSound();
    gameOverScreen.classList.add('hidden'); 
    quitGame(); 
});

const profBackBtn = document.getElementById('btn-prof-back');
if (profBackBtn) profBackBtn.addEventListener('click', () => { 
    playMenuSelectSound();
    profileScreen.classList.add('hidden'); 
    lobbyScreen.classList.remove('hidden'); 
    uiState = 'LOBBY_MODE'; 
});

const mpBackBtn = document.getElementById('btn-mp-back');
if (mpBackBtn) mpBackBtn.addEventListener('click', () => {
    playMenuSelectSound();
    multiplayerScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    uiState = 'LOBBY_MODE';
});

const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) resumeBtn.addEventListener('click', () => {
    playMenuSelectSound();
    togglePause();
});

const quitBtn = document.getElementById('quit-btn');
if (quitBtn) quitBtn.addEventListener('click', () => {
    playMenuSelectSound();
    quitGame();
});

const startBtn = document.getElementById('start-btn');
if (startBtn) startBtn.addEventListener('click', () => {
    const e = new KeyboardEvent('keydown', { key: 'Enter' });
    window.dispatchEvent(e);
});
