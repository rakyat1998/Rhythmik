/* =========================================================
   1. FIREBASE CONFIGURATION & INITIALIZATION
   ========================================================= */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDHmyoBemXQFOxXsVmwFc5l4LHWKhZHtlI",
  authDomain: "teamrhythmik.firebaseapp.com",
  projectId: "teamrhythmik",
  storageBucket: "teamrhythmik.firebasestorage.app",
  messagingSenderId: "861227698308",
  appId: "1:861227698308:web:a9f8802b0565aa7b7f9ad1",
  measurementId: "G-TGPGDJDJMD"
};

// Initialize Firebase & Firestore
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

/* =========================================================
   2. GLOBAL STATE & MODES
   ========================================================= */
let isSplashActive = true;
let isPlaying = false;
let isPaused = false;

// Game modes: 'solo', 'duo', '1v1'
let selectedMode = 'solo';
// Network role: 'solo', 'host' (P1 - Blue), 'peer' (P2 - Red)
let networkRole = 'solo'; 
let currentRoomId = null;

// WebRTC State
let peerConnection = null;
let dataChannel = null;
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

// Responsive Scaler
function fitArcade() {
    const scaler = document.getElementById('arcade-scaler');
    const targetWidth = 1000;
    const targetHeight = 1250;
    const factor = isSplashActive ? 0.62 : 0.72;
    const scaleX = (window.innerWidth * factor) / targetWidth;
    const scaleY = (window.innerHeight * factor) / targetHeight;
    const finalScale = Math.min(scaleX, scaleY);
    scaler.style.transform = `scale(${finalScale})`;
    scaler.style.webkitTransform = `scale(${finalScale})`;
}
window.addEventListener('resize', fitArcade);
fitArcade();

/* =========================================================
   3. DOM ELEMENTS
   ========================================================= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const arcadeCabinet = document.getElementById('arcade-cabinet'); 
const arcadeRoom = document.getElementById('arcade-room');

// Overlays
const introScreen = document.getElementById('intro-screen');
const modeSelectScreen = document.getElementById('mode-select-screen');
const multiSelectScreen = document.getElementById('multi-select-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');

// UI Elements
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives-container');
const comboEl = document.getElementById('combo');
const multiplierEl = document.getElementById('multiplier');
const roundUiEl = document.getElementById('round-ui');
const comboContainer = document.getElementById('combo-container');
const trackEl = document.getElementById('current-track');
const finalScoreEl = document.getElementById('final-score');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverDesc = document.getElementById('game-over-desc');
const roomRoleIndicator = document.getElementById('room-role-indicator');
const modeInstructions = document.getElementById('mode-instructions');

// 1v1 Tug of War Elements
const versusUi = document.getElementById('versus-ui');
const tugBarP1 = document.getElementById('tug-bar-p1');
const tugBarP2 = document.getElementById('tug-bar-p2');
const versusTimerEl = document.getElementById('versus-timer');

// Lobby Elements
const roomCodeDisplay = document.getElementById('room-code-display');
const generatedCodeEl = document.getElementById('generated-code');
const roomInput = document.getElementById('room-input');
const lobbyStatusMsg = document.getElementById('lobby-status-msg');

/* =========================================================
   4. PLAYLIST & AUDIO PIPELINE
   ========================================================= */
const playlist = [
    { title: "Master of Puppets", bpm: 130, path: "audio/master_of_puppets.mp3" },
    { title: "Super Mario Bros.", bpm: 120, path: "audio/super_mario_bros.mp3" },
    { title: "Shape Of You", bpm: 140, path: "audio/shape_of_you.mp3" },
    { title: "Enter Sandman", bpm: 155, path: "audio/enter_sandman.mp3" },
    { title: "Scourage of Iron", bpm: 160, path: "audio/scourage_of_iron.mp3" },
    { title: "New Divide", bpm: 125, path: "audio/new_divide.mp3" },
    { title: "Creep", bpm: 135, path: "audio/creep.mp3" },
    { title: "For Whom The Bell Tolls", bpm: 150, path: "audio/for_whom_the_bell_tolls.mp3" }
];

let currentSongIndex = 0;
let audioCtx, analyser, masterGain, dataArray;
let isMusicPlaying = false;
let musicTimer = null;
let songTime = 0;
let currentTrackAudio = new Audio();
let trackSource = null;

function initAudio() {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        if (audioCtx && !masterGain) {
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 128;
            masterGain = audioCtx.createGain();
            masterGain.connect(analyser);
            analyser.connect(audioCtx.destination);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
    } catch (err) {
        console.warn("Audio Context initialization deferred:", err);
    }
}

function startSynthEngine() {
    isMusicPlaying = true;
    currentTrackAudio.src = playlist[currentSongIndex].path;
    currentTrackAudio.play().catch(e => console.warn("Track audio playback deferred:", e));

    if (audioCtx && !trackSource) {
        try {
            trackSource = audioCtx.createMediaElementSource(currentTrackAudio);
            trackSource.connect(masterGain);
        } catch(e) {}
    }

    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(() => {
        if (!isMusicPlaying || isPaused || !audioCtx) {
            currentTrackAudio.pause();
            return;
        } else if (currentTrackAudio.paused && isPlaying) {
            currentTrackAudio.play().catch(() => {});
        }
        songTime = currentTrackAudio.currentTime; 
    }, 100);
}

function stopSynthEngine() {
    isMusicPlaying = false;
    currentTrackAudio.pause();
    currentTrackAudio.currentTime = 0;
    if (musicTimer) clearInterval(musicTimer);
}

// Sound FX Generative Synthesizer
function playTone(freq, type, time, duration, vol, dropFreq = null) {
    if (!audioCtx || !masterGain) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, time);
    if (dropFreq) osc.frequency.exponentialRampToValueAtTime(dropFreq, time + duration);
    gain.gain.setValueAtTime(vol, time); gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(time); osc.stop(time + duration);
}

function playNoise(time, duration, vol) {
    if (!audioCtx || !masterGain) return;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer;
    const gain = audioCtx.createGain(); gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    noise.connect(gain); gain.connect(masterGain);
    noise.start(time);
}

function playMenuSelectSound() { if (audioCtx) playTone(600, 'square', audioCtx.currentTime, 0.05, 0.2); }
function playCoinSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(987.77, 'square', t, 0.08, 0.3);
    playTone(1318.51, 'square', t + 0.08, 0.4, 0.3);
}
function playHitSound() { if (audioCtx) playTone(1200, 'square', audioCtx.currentTime, 0.05, 0.15, 800); }
function play1UPSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(523.25, 'square', t, 0.1, 0.3); playTone(659.25, 'square', t + 0.1, 0.1, 0.3); playTone(783.99, 'square', t + 0.2, 0.3, 0.3); 
}
function playNukeSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(440, 'sine', t, 0.4, 0.2, 880); playTone(220, 'triangle', t, 1.0, 0.2, 110);
}
function playSlowMoSound() { if (audioCtx) playTone(800, 'sine', audioCtx.currentTime, 1.0, 0.5, 100); }
function playDamageSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(400, 'square', t, 0.1, 0.3, 300); playTone(200, 'square', t + 0.2, 0.2, 0.3, 100);
}

/* =========================================================
   5. BACKGROUND VISUALIZER CANVAS
   ========================================================= */
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const leftCab = document.querySelector('.left-cabinet');
const rightCab = document.querySelector('.right-cabinet');
const bgParticles = [];

function resizeBackground() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    bgParticles.length = 0;
    for(let i=0; i<250; i++) {
        bgParticles.push({
            x: Math.random() * bgCanvas.width, y: Math.random() * bgCanvas.height,
            baseSize: Math.random() * 1.5 + 0.5, hueOffset: Math.random() * 60 - 30
        });
    }
}
window.addEventListener('resize', resizeBackground);
resizeBackground();

function drawBackground() {
    requestAnimationFrame(drawBackground);
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    let reaction = 0; let hue = 280;

    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        let bassSum = 0;
        let bassCount = Math.floor(dataArray.length / 4); 
        for(let i = 0; i < bassCount; i++) bassSum += dataArray[i];
        const bassAvg = bassCount > 0 ? (bassSum / bassCount) : 0; 
        reaction = bassAvg / 255;
        hue = (bassAvg * 1.5) % 360;
    } else {
        reaction = (Math.sin(Date.now() / 300) + 1) / 4;
    }
    
    const cx = bgCanvas.width / 2;
    const cy = bgCanvas.height / 2;
    const maxRadius = Math.max(cx, cy) * 1.2;
    const auraRadius = reaction * maxRadius + 150;
    
    const gradient = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, auraRadius);
    gradient.addColorStop(0, `hsla(${hue}, 90%, 50%, ${0.1 + reaction * 0.2})`);
    gradient.addColorStop(1, `hsla(${hue}, 80%, 10%, 0)`);
    bgCtx.fillStyle = gradient;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    leftCab.style.boxShadow = `0 40px 100px rgba(0,0,0,1), 0 0 ${40 + reaction * 220}px rgba(0, 243, 255, ${0.5 + reaction * 0.5})`;
    rightCab.style.boxShadow = `0 40px 100px rgba(0,0,0,1), 0 0 ${40 + reaction * 220}px rgba(255, 230, 0, ${0.5 + reaction * 0.5})`;

    const barWidth = bgCanvas.width / 36;
    const timeFactor = Date.now() / (300 / (playlist[currentSongIndex]?.bpm || 130));

    for (let i = 0; i < 36; i++) {
        let barHeight = 40;
        if (analyser && dataArray) {
            const dataIndex = Math.floor((i / 36) * (dataArray.length / 2));
            barHeight = (dataArray[dataIndex] / 255) * (bgCanvas.height * 0.55) + 15;
        } else {
            barHeight = Math.abs(Math.sin(timeFactor + i * 0.3)) * (bgCanvas.height * 0.35) + 30;
        }
        bgCtx.fillStyle = `hsla(${(hue + i * 10) % 360}, 90%, 55%, 0.25)`;
        bgCtx.fillRect(i * barWidth, bgCanvas.height - barHeight, barWidth - 4, barHeight);
    }

    for (let p of bgParticles) {
        const dx = p.x - cx; const dy = p.y - cy;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        p.x += (dx / dist) * (0.02 + reaction * 4);
        p.y += (dy / dist) * (0.02 + reaction * 4);
        if (p.x < 0 || p.x > bgCanvas.width || p.y < 0 || p.y > bgCanvas.height) {
            p.x = cx + (Math.random() - 0.5) * 200; p.y = cy + (Math.random() - 0.5) * 200;
        }
        bgCtx.fillStyle = `hsla(${(hue + p.hueOffset) % 360}, 90%, ${50 + reaction * 40}%, ${0.3 + reaction * 0.7})`;
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, p.baseSize * (1 + reaction * 1.5), 0, Math.PI * 2);
        bgCtx.fill();
    }
}
drawBackground();

/* =========================================================
   6. GAME STATE VARIABLES
   ========================================================= */
let activeLetters = [];
let particles = [];
let floatingTexts = [];

let score = 0;
let currentRound = 1;
let comboCount = 0;
let comboMultiplier = 1;
let lives = 3;
let MAX_LIVES = 5;

let lettersSpawnedCount = 0;
let powerUpCooldown = 0;
let letterIdCounter = 0;

let arcadeShakeIntensity = 0;
let pauseSelectedIndex = 0;

let slowMoTimer = 0;
let targetFallSpeed = 200; 
let currentFallSpeed = 200;
let beatInterval = 0;
let nextSpawnTime = 0;
let lastTime = 0;

// 1v1 Specific State
let versusBalance = 50; // 50% = Dead center
let versusTimeLeft = 60;
let versusInterval = null;

const comboColors = ['#ffffff', '#00f3ff', '#ffe600', '#ff0055', '#b300ff', '#ff0033'];
const shredPhrases = ["NICE!", "BRUTAL!", "SHREDDING!", "UNREAL!", "GODLIKE!"];

/* =========================================================
   7. WEBRTC P2P DATA CHANNEL (FIREBASE SIGNALING)
   ========================================================= */
function setupDataChannel(channel) {
    dataChannel = channel;
    dataChannel.onopen = () => {
        lobbyStatusMsg.style.color = '#00ff66';
        lobbyStatusMsg.innerText = "PEER CONNECTED! READY.";
        setTimeout(() => {
            lobbyScreen.classList.add('hidden');
            startScreen.classList.remove('hidden');
            
            if (networkRole === 'host') {
                roomRoleIndicator.innerText = `HOST: ${selectedMode.toUpperCase()} (P1 - BLUE)`;
                document.getElementById('start-btn').style.display = 'block';
            } else {
                roomRoleIndicator.innerText = `JOINED: ${selectedMode.toUpperCase()} (P2 - RED)`;
                document.getElementById('start-btn').style.display = 'none';
                document.getElementById('song-selection-display').innerHTML = 
                    `<div style="font-size:10px; color:#0ff;">WAITING FOR HOST TO SELECT TRACK...</div>`;
            }
        }, 1200);
    };

    dataChannel.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleNetworkMessage(msg);
        } catch(e) {
            console.error("Malformed peer payload:", e);
        }
    };

    dataChannel.onclose = () => {
        if (isPlaying) {
            alert("Peer disconnected. Returning to main menu.");
            quitGame();
        }
    };
}

function broadcast(payload) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(payload));
    }
}

async function createRoom() {
    try {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        currentRoomId = roomId;
        networkRole = 'host';

        lobbyStatusMsg.style.color = '#fff';
        lobbyStatusMsg.innerText = "ALLOCATING SIGNALING ROOM...";
        
        peerConnection = new RTCPeerConnection(rtcConfig);
        const roomRef = db.collection('arcade_rooms').doc(roomId);
        const callerCandidatesCollection = roomRef.collection('callerCandidates');

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) callerCandidatesCollection.add(event.candidate.toJSON());
        };

        const dc = peerConnection.createDataChannel("gameSync");
        setupDataChannel(dc);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        await roomRef.set({
            offer: { type: offer.type, sdp: offer.sdp },
            mode: selectedMode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Display room code
        generatedCodeEl.innerText = roomId;
        roomCodeDisplay.classList.remove('hidden');
        document.getElementById('btn-create-room').style.display = 'none';
        document.getElementById('lobby-join-sec').style.display = 'none';
        lobbyStatusMsg.innerText = "";

        // Listen for Remote Answer
        roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            if (!peerConnection.currentRemoteDescription && data && data.answer) {
                const rtcSessionDesc = new RTCSessionDescription(data.answer);
                await peerConnection.setRemoteDescription(rtcSessionDesc);
            }
        });

        // Listen for Remote ICE Candidates
        roomRef.collection('calleeCandidates').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    await peerConnection.addIceCandidate(candidate);
                }
            });
        });

    } catch (err) {
        lobbyStatusMsg.style.color = '#ff0055';
        lobbyStatusMsg.innerText = "FIREBASE ERROR: CHECK CONFIG.";
        console.error(err);
    }
}

async function joinRoom() {
    const code = roomInput.value.trim();
    if (code.length !== 4) {
        lobbyStatusMsg.innerText = "ENTER VALID 4-DIGIT CODE";
        return;
    }

    try {
        currentRoomId = code;
        networkRole = 'peer';
        lobbyStatusMsg.style.color = '#fff';
        lobbyStatusMsg.innerText = "SEARCHING ROOM...";

        const roomRef = db.collection('arcade_rooms').doc(code);
        const roomSnapshot = await roomRef.get();

        if (!roomSnapshot.exists) {
            lobbyStatusMsg.style.color = '#ff0055';
            lobbyStatusMsg.innerText = "ROOM DOES NOT EXIST.";
            return;
        }

        const roomData = roomSnapshot.data();
        selectedMode = roomData.mode; // Inherit game mode from host

        peerConnection = new RTCPeerConnection(rtcConfig);
        const calleeCandidatesCollection = roomRef.collection('calleeCandidates');

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) calleeCandidatesCollection.add(event.candidate.toJSON());
        };

        peerConnection.ondatachannel = (event) => {
            setupDataChannel(event.channel);
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(roomData.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        await roomRef.update({
            answer: { type: answer.type, sdp: answer.sdp }
        });

        roomRef.collection('callerCandidates').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    await peerConnection.addIceCandidate(candidate);
                }
            });
        });

        lobbyStatusMsg.style.color = '#00f3ff';
        lobbyStatusMsg.innerText = "CONNECTED! ESTABLISHING P2P...";

    } catch (err) {
        lobbyStatusMsg.style.color = '#ff0055';
        lobbyStatusMsg.innerText = "ERROR JOINING ROOM.";
        console.error(err);
    }
}

function handleNetworkMessage(msg) {
    if (msg.type === 'TRACK_SELECT') {
        currentSongIndex = msg.index;
        updateSongDisplays();
    } 
    else if (msg.type === 'START_GAME') {
        currentSongIndex = msg.index;
        executeGameStart();
    }
    else if (msg.type === 'SPAWN_LETTER') {
        activeLetters.push(msg.letter);
    }
    else if (msg.type === 'LETTER_HIT') {
        handleRemoteHit(msg);
    }
    else if (msg.type === 'LOSE_LIFE') {
        processLifeLoss();
    }
    else if (msg.type === 'VERSUS_UPDATE') {
        versusBalance = msg.balance;
        versusTimeLeft = msg.timeLeft;
        updateVersusUI();
    }
    else if (msg.type === 'VERSUS_END') {
        concludeVersus(msg.winner);
    }
}

/* =========================================================
   8. INPUT & MENU ROUTING
   ========================================================= */
function updateSongDisplays() {
    const len = playlist.length;
    const prevIndex = (currentSongIndex - 1 + len) % len;
    const nextIndex = (currentSongIndex + 1) % len;
    document.getElementById('left-screen-title').innerText = playlist[prevIndex].title;
    document.getElementById('right-screen-title').innerText = playlist[nextIndex].title;
    document.getElementById('center-song-title').innerText = `◀ ${playlist[currentSongIndex].title} ▶`;
}
updateSongDisplays();

function handleInput(e) {
    // 1. Initial Splash Screen
    if (isSplashActive) {
        if (e.key === 'Enter') {
            initAudio();
            isSplashActive = false;
            introScreen.classList.add('hidden');
            modeSelectScreen.classList.remove('hidden');
            arcadeRoom.classList.remove('zoomed-in-view');
            fitArcade();
            playMenuSelectSound();
        }
        return; 
    }

    // 2. Host Song Selection Menu
    if (!isPlaying && !isPaused && !startScreen.classList.contains('hidden')) {
        if (networkRole !== 'peer') {
            if (e.key === 'ArrowLeft') {
                playMenuSelectSound();
                currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
                updateSongDisplays();
                if (networkRole === 'host') broadcast({ type: 'TRACK_SELECT', index: currentSongIndex });
                return;
            }
            if (e.key === 'ArrowRight') {
                playMenuSelectSound();
                currentSongIndex = (currentSongIndex + 1) % playlist.length;
                updateSongDisplays();
                if (networkRole === 'host') broadcast({ type: 'TRACK_SELECT', index: currentSongIndex });
                return;
            }
            if (e.key === 'Enter') { 
                triggerGameStart(); 
                return; 
            }
        }
    }

    if (e.key === 'Escape' && isPlaying) {
        togglePause();
        return;
    }

    if (isPaused) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            pauseSelectedIndex = 0; playMenuSelectSound(); updatePauseMenuUI(); e.preventDefault();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            pauseSelectedIndex = 1; playMenuSelectSound(); updatePauseMenuUI(); e.preventDefault();
        } else if (e.key === 'Enter') {
            if (pauseSelectedIndex === 0) togglePause(); else quitGame();
        }
        return;
    }

    if (!isPlaying) return;

    // 3. Typing Gameplay Logic
    const key = e.key.toUpperCase();
    animateHardwareDeck(key);

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
        const isLocalPlayer1 = (networkRole === 'host' || networkRole === 'solo');
        const playerColor = isLocalPlayer1 ? '#00f3ff' : '#ff0055';
        const playerRoleTag = isLocalPlayer1 ? 'p1' : 'p2';

        activeLetters.splice(targetIndex, 1);
        
        // Execute local hit aesthetics
        if (letter.type === 'normal') playHitSound(); 
        else triggerPowerUp(letter);

        createExplosion(letter.x, letter.y, (selectedMode === 'duo') ? playerColor : letter.color);
        arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 10);

        // MODE 1: DUO (CO-OP)
        if (selectedMode === 'duo') {
            comboCount++;
            if (comboCount > 0 && comboCount % 6 === 0) {
                comboMultiplier++;
                arcadeCabinet.classList.add('flash-combo');
                setTimeout(() => arcadeCabinet.classList.remove('flash-combo'), 150);
            }
            score += 10 * comboMultiplier;
            floatingTexts.push({ 
                text: `${playerRoleTag.toUpperCase()} +${10 * comboMultiplier}`, 
                x: letter.x, y: letter.y, life: 1.0, size: 16, color: playerColor 
            });
            updateUI();

            // Broadcast hit to peer
            broadcast({
                type: 'LETTER_HIT',
                id: letter.id,
                player: playerRoleTag,
                x: letter.x,
                y: letter.y,
                score: score,
                combo: comboCount,
                multiplier: comboMultiplier
            });
        } 
        // MODE 2: 1v1 (VERSUS TUG-OF-WAR)
        else if (selectedMode === '1v1') {
            if (isLocalPlayer1) {
                versusBalance = Math.min(100, versusBalance + 3);
            } else {
                versusBalance = Math.max(0, versusBalance - 3);
            }

            floatingTexts.push({ 
                text: "PUSH!", 
                x: letter.x, y: letter.y, life: 0.8, size: 16, color: playerColor 
            });
            updateVersusUI();

            broadcast({
                type: 'VERSUS_UPDATE',
                balance: versusBalance,
                timeLeft: versusTimeLeft
            });

            // Immediate knockout check
            if (versusBalance >= 100) {
                concludeVersus('p1');
                broadcast({ type: 'VERSUS_END', winner: 'p1' });
            } else if (versusBalance <= 0) {
                concludeVersus('p2');
                broadcast({ type: 'VERSUS_END', winner: 'p2' });
            }
        } 
        // MODE 3: SOLO
        else {
            comboCount++;
            const judgement = (letter.y > canvas.height * 0.75) ? "PERFECT!" : "GREAT!";
            floatingTexts.push({
                text: judgement, x: letter.x, y: letter.y - 30, life: 0.8, size: 14,
                color: (judgement === "PERFECT!") ? '#ffe600' : '#00f3ff'
            });

            if (comboCount > 0 && comboCount % 6 === 0) {
                comboMultiplier++;
                arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 30);
                arcadeCabinet.classList.add('flash-combo');
                setTimeout(() => arcadeCabinet.classList.remove('flash-combo'), 150);
                
                const phraseIndex = Math.min(comboMultiplier - 2, shredPhrases.length - 1);
                floatingTexts.push({
                    text: shredPhrases[phraseIndex] + " x" + comboMultiplier,
                    x: canvas.width / 2, y: canvas.height / 2, life: 1.5, size: 36,
                    color: comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)]
                });
            }

            if (letter.type === 'normal') {
                score += 10 * comboMultiplier;
                floatingTexts.push({ text: "+" + (10 * comboMultiplier), x: letter.x, y: letter.y, life: 1.0, size: 16, color: '#fff' });
            }
            targetFallSpeed = Math.min(800, targetFallSpeed + 2);
            updateUI();
        }
    }
}
window.addEventListener('keydown', handleInput);

function handleRemoteHit(msg) {
    const idx = activeLetters.findIndex(l => l.id === msg.id);
    if (idx !== -1) {
        const l = activeLetters[idx];
        activeLetters.splice(idx, 1);
        const hitColor = (msg.player === 'p1') ? '#00f3ff' : '#ff0055';
        createExplosion(l.x, l.y, hitColor);
        playHitSound();
        floatingTexts.push({
            text: `${msg.player.toUpperCase()} HIT!`, 
            x: l.x, y: l.y, life: 0.9, size: 16, color: hitColor
        });
    }
    if (selectedMode === 'duo') {
        score = msg.score;
        comboCount = msg.combo;
        comboMultiplier = msg.multiplier;
        updateUI();
    }
}

/* =========================================================
   9. LETTER SPAWNING & SYNCHRONIZATION
   ========================================================= */
function spawnLetter() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const char = chars[Math.floor(Math.random() * chars.length)];
    const x = Math.random() * (canvas.width - 120) + 60; 
    let type = 'normal';
    let color = comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)];
    
    // DUO MODE: No powerups, distinct P1/P2 color aura
    if (selectedMode === 'duo') {
        color = '#fff';
    } 
    // 1v1 MODE: Neutral neon yellow targets
    else if (selectedMode === '1v1') {
        color = '#ffe600';
    } 
    // SOLO MODE: Regular Powerup Rolling Logic
    else {
        lettersSpawnedCount++;
        if (powerUpCooldown > 0) powerUpCooldown--;

        if (lettersSpawnedCount >= 7 && powerUpCooldown === 0 && Math.random() < 0.15) {
            const roll = Math.random();
            if (roll < 0.33) { type = '1up'; color = '#0f0'; }
            else if (roll < 0.66) { type = 'slow'; color = '#0ff'; }
            else { type = 'nuke'; color = '#ff4400'; }
            powerUpCooldown = 5; 
        }
    }

    const newLetter = { id: ++letterIdCounter, char, x, y: -30, color, type };
    activeLetters.push(newLetter);

    // If host in multiplayer, broadcast spawned letter to peer
    if (networkRole === 'host') {
        broadcast({ type: 'SPAWN_LETTER', letter: newLetter });
    }
}

function triggerPowerUp(letter) {
    if (letter.type === '1up') {
        lives = Math.min(lives + 1, MAX_LIVES); play1UPSound();
        arcadeCabinet.classList.add('flash-1up');
        setTimeout(() => arcadeCabinet.classList.remove('flash-1up'), 400);
        floatingTexts.push({ text: "1-UP!", x: letter.x, y: letter.y, life: 1.5, size: 22, color: '#0f0' });
    } 
    else if (letter.type === 'nuke') {
        arcadeShakeIntensity = 50; playNukeSound();
        arcadeCabinet.classList.add('flash-nuke');
        setTimeout(() => arcadeCabinet.classList.remove('flash-nuke'), 500);
        let pointsGained = 0;
        for (let i = activeLetters.length - 1; i >= 0; i--) {
            let l = activeLetters[i]; 
            createExplosion(l.x, l.y, l.color, 1.3);
            pointsGained += (10 * comboMultiplier);
        }
        score += pointsGained;
        floatingTexts.push({ text: "NUKE DETONATED!", x: canvas.width/2, y: canvas.height/2, life: 2.0, size: 30, color: '#ff4400' });
        activeLetters = []; 
        targetFallSpeed = 200 + ((currentRound - 1) * 30); 
        nextSpawnTime = songTime + 2.0; 
    }
    else if (letter.type === 'slow') {
        slowMoTimer = 6.0; playSlowMoSound();
        floatingTexts.push({ text: "TIME WARP", x: letter.x, y: letter.y, life: 1.5, size: 22, color: '#0ff' });
    }
}

/* =========================================================
   10. GAME ENGINE LOOP
   ========================================================= */
function update(time) {
    if (!isPlaying || isPaused) return;
    const dt = (time - lastTime) / 1000; 
    lastTime = time;

    // Solo progression
    if (selectedMode === 'solo') {
        if (score >= 2000 && currentRound === 1) {
            currentRound = 2; targetFallSpeed += 30;
            floatingTexts.push({ text: "ROUND 2: SPEED UP", x: canvas.width/2, y: canvas.height/2, life: 2.5, size: 36, color: '#ff0055' }); 
            updateUI();
        } else if (score >= 4000 && currentRound === 2) {
            currentRound = 3; targetFallSpeed += 30;
            floatingTexts.push({ text: "ROUND 3: MAXIMUM OVERKILL", x: canvas.width/2, y: canvas.height/2, life: 2.5, size: 36, color: '#ff0000' }); 
            updateUI();
        }
    } else if (selectedMode === 'duo') {
        // Continuous subtle speed acceleration over time
        targetFallSpeed = Math.min(750, targetFallSpeed + (dt * 2.5));
    }

    if (slowMoTimer > 0) {
        slowMoTimer -= dt; currentFallSpeed = targetFallSpeed * 0.4;
    } else {
        currentFallSpeed = targetFallSpeed;
    }

    // Screen Shake
    if (arcadeShakeIntensity > 0.5) {
        const dx = (Math.random() - 0.5) * arcadeShakeIntensity;
        const dy = (Math.random() - 0.5) * arcadeShakeIntensity;
        arcadeCabinet.style.transform = `translateZ(1180px) translate3d(${dx}px, ${160 + dy}px, 0px)`;
        arcadeCabinet.style.webkitTransform = `translateZ(1180px) translate3d(${dx}px, ${160 + dy}px, 0px)`;
        arcadeShakeIntensity *= 0.86; 
    } else {
        arcadeCabinet.style.transform = `translateZ(1180px) translateY(160px)`;
        arcadeCabinet.style.webkitTransform = `translateZ(1180px) translateY(160px)`;
    }

    // Host or Solo triggers spawns
    if (networkRole === 'host' || networkRole === 'solo') {
        if (songTime >= nextSpawnTime) {
            spawnLetter();
            let activeInterval = beatInterval * 2; 
            if (currentRound === 2) activeInterval = beatInterval * 1.5; 
            if (currentRound === 3) activeInterval = beatInterval * 1.2; 
            nextSpawnTime = songTime + activeInterval; 
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Particle pipeline
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; p.vy += 1800 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 2.5; 
        if (p.life <= 0) particles.splice(i, 1);
        else { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, p.size, p.size); }
    }
    ctx.globalAlpha = 1.0;

    // Floating text feedback
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i]; ft.y -= dt * 60; ft.life -= dt * 1.5;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
        else {
            ctx.save();
            ctx.globalAlpha = Math.min(1.0, ft.life);
            ctx.fillStyle = ft.color;
            ctx.shadowColor = ft.color;
            ctx.shadowBlur = 10;
            ctx.font = `${ft.size}px "Press Start 2P", monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.restore();
        }
    }

    // Render active letters
    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = activeLetters.length - 1; i >= 0; i--) {
        let l = activeLetters[i]; 
        l.y += currentFallSpeed * dt;
        let drawX = l.x; 

        ctx.save();
        ctx.shadowColor = l.color;
        ctx.shadowBlur = (l.type !== 'normal') ? 24 : 14;
        ctx.fillStyle = l.color;

        let glyph = l.char;
        if (l.type === 'nuke') glyph = `[ ${l.char} ]`;
        else if (l.type === '1up') glyph = `♥ ${l.char} ♥`;
        else if (l.type === 'slow') glyph = `~ ${l.char} ~`;

        ctx.fillText(glyph, drawX, l.y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(glyph, drawX, l.y);
        ctx.restore();
        
        // Out of bounds detection
        if (l.y > canvas.height + 20) { 
            activeLetters.splice(i, 1); 
            
            if (selectedMode !== '1v1') {
                floatingTexts.push({ text: "MISS", x: l.x, y: canvas.height - 30, life: 0.8, size: 16, color: '#ff0033' });
                
                // Only host or solo player reports life losses to avoid duplicate triggers
                if (networkRole === 'host') {
                    processLifeLoss();
                    broadcast({ type: 'LOSE_LIFE' });
                } else if (networkRole === 'solo') {
                    processLifeLoss();
                }
            }
            if (lives <= 0 && selectedMode !== '1v1') return; 
        }
    }

    requestAnimationFrame(update);
}

function processLifeLoss() {
    lives--; 
    comboCount = 0; 
    comboMultiplier = 1;
    arcadeShakeIntensity = 35; 
    playDamageSound();
    
    gameContainer.classList.add('damage-flicker');
    setTimeout(() => gameContainer.classList.remove('damage-flicker'), 400);
    updateUI();
    
    if (lives <= 0) {
        gameOver();
    } else { 
        slowMoTimer = 1.5; 
        playSlowMoSound(); 
    }
}

/* =========================================================
   11. UI UPDATES & LIFECYCLE CONTROLLERS
   ========================================================= */
function updateUI() {
    scoreEl.innerText = score; 
    comboEl.innerText = comboCount; 
    multiplierEl.innerText = 'x' + comboMultiplier;
    roundUiEl.innerText = (selectedMode === 'duo') ? 'CO-OP DUO' : 'ROUND ' + currentRound;
    
    let hearts = ""; 
    for(let i = 0; i < lives; i++) hearts += "♥"; 
    livesEl.innerText = hearts;

    if (lives === 1) gameContainer.classList.add('danger-state'); 
    else gameContainer.classList.remove('danger-state');
    
    const colorIndex = Math.min(comboMultiplier - 1, comboColors.length - 1);
    const currentColor = (selectedMode === 'duo') ? '#00f3ff' : comboColors[colorIndex];
    comboContainer.style.color = currentColor;

    if (lives > 1) { 
        gameContainer.style.borderColor = currentColor;
        gameContainer.style.boxShadow = `0 0 ${10 + (comboMultiplier * 15)}px ${currentColor}`;
    }
}

function updateVersusUI() {
    tugBarP1.style.width = `${versusBalance}%`;
    tugBarP2.style.width = `${100 - versusBalance}%`;
    versusTimerEl.innerText = `${versusTimeLeft}s`;
}

function concludeVersus(winner) {
    isPlaying = false;
    stopSynthEngine();
    if (versusInterval) clearInterval(versusInterval);

    gameOverScreen.classList.remove('hidden');
    arcadeRoom.classList.remove('game-running');
    
    const isP1 = (networkRole === 'host' || networkRole === 'solo');
    const playerWon = (winner === 'p1' && isP1) || (winner === 'p2' && !isP1);

    if (winner === 'tie') {
        gameOverTitle.innerText = "DRAW!";
        gameOverTitle.style.textShadow = "0 0 20px #ffe600";
        gameOverDesc.innerText = "PERFECTLY BALANCED MATCH.";
    } else if (playerWon) {
        gameOverTitle.innerText = "VICTORY!";
        gameOverTitle.style.textShadow = "0 0 20px #00ff66";
        gameOverDesc.innerText = "YOU CRUSHED YOUR OPPONENT!";
        play1UPSound();
    } else {
        gameOverTitle.innerText = "DEFEAT!";
        gameOverTitle.style.textShadow = "0 0 20px #ff0055";
        gameOverDesc.innerText = "OPPONENT DOMINATED THE BOARD.";
        playDamageSound();
    }
}

function gameOver() {
    isPlaying = false; 
    stopSynthEngine();
    finalScoreEl.innerText = score;
    gameOverTitle.innerText = "WASTED";
    gameOverTitle.style.textShadow = "0 0 20px #f00";
    gameOverDesc.innerHTML = `FINAL SCORE: <span id="final-score">${score}</span>`;
    
    gameContainer.classList.remove('danger-state'); 
    gameOverScreen.classList.remove('hidden');
    arcadeRoom.classList.remove('game-running');
    arcadeCabinet.style.transform = '';
    arcadeCabinet.style.webkitTransform = '';
    
    gameContainer.style.backgroundColor = '#600000';
    gameContainer.style.borderColor = '#ff0000';
    gameContainer.style.boxShadow = '0 0 40px #ff0000 inset, 0 0 60px #ff0000';
    
    playTone(100, 'sawtooth', audioCtx ? audioCtx.currentTime : 0, 0.8, 0.5, 10); 
    playNoise(audioCtx ? audioCtx.currentTime : 0, 0.8, 0.5);
}

function triggerGameStart() {
    if (networkRole === 'host') {
        broadcast({ type: 'START_GAME', index: currentSongIndex });
    }
    executeGameStart();
}

function executeGameStart() {
    initAudio(); 
    playCoinSound();

    const currentSong = playlist[currentSongIndex];
    trackEl.innerText = currentSong.title;

    arcadeRoom.classList.add('game-running');
    gameContainer.style.backgroundColor = '#000'; 
    gameContainer.style.borderColor = '#fff';
    gameContainer.style.boxShadow = '0 0 20px #fff';

    activeLetters = []; 
    particles = []; 
    floatingTexts = [];
    score = 0; 
    currentRound = 1; 
    comboCount = 0; 
    comboMultiplier = 1;
    lettersSpawnedCount = 0; 
    powerUpCooldown = 0;
    arcadeShakeIntensity = 0; 
    slowMoTimer = 0;
    targetFallSpeed = 200; 
    currentFallSpeed = 200; 
    beatInterval = 60 / currentSong.bpm; 
    nextSpawnTime = 0.5;

    // Mode-specific parameter setup
    if (selectedMode === 'duo') {
        lives = 5; 
        MAX_LIVES = 5;
        versusUi.classList.add('hidden');
        document.getElementById('ui-layer').style.display = 'flex';
    } else if (selectedMode === '1v1') {
        versusBalance = 50;
        versusTimeLeft = 60;
        versusUi.classList.remove('hidden');
        document.getElementById('ui-layer').style.display = 'none';
        updateVersusUI();

        // Start countdown timer on host
        if (networkRole === 'host') {
            if (versusInterval) clearInterval(versusInterval);
            versusInterval = setInterval(() => {
                if (!isPlaying || isPaused) return;
                versusTimeLeft--;
                broadcast({ type: 'VERSUS_UPDATE', balance: versusBalance, timeLeft: versusTimeLeft });
                updateVersusUI();

                if (versusTimeLeft <= 0) {
                    clearInterval(versusInterval);
                    let finalWinner = 'tie';
                    if (versusBalance > 50) finalWinner = 'p1';
                    else if (versusBalance < 50) finalWinner = 'p2';
                    concludeVersus(finalWinner);
                    broadcast({ type: 'VERSUS_END', winner: finalWinner });
                }
            }, 1000);
        }
    } else {
        lives = 3; 
        MAX_LIVES = 5;
        versusUi.classList.add('hidden');
        document.getElementById('ui-layer').style.display = 'flex';
    }

    startScreen.classList.add('hidden'); 
    gameOverScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    
    setTimeout(() => {
        startSynthEngine();
        isPlaying = true; 
        isPaused = false;
        updateUI();
        lastTime = performance.now();
        requestAnimationFrame(update);
    }, 1800);
}

function createExplosion(x, y, color, scale = 1.0) {
    const particleCount = 45 * scale;
    for(let i = 0; i < particleCount; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40,
            vx: (Math.random() - 0.5) * (1200 * scale), vy: (Math.random() - 0.5) * (1200 * scale),
            life: 1.0 + Math.random() * 0.5, size: Math.random() * (10 * scale) + 2, color: color
        });
    }
}

function animateHardwareDeck(char) {
    const centerJoystickBall = document.querySelector('.center-cabinet .joystick-ball');
    const centerButtons = document.querySelectorAll('.center-cabinet .action-button');
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

function updatePauseMenuUI() {
    const resumeBtn = document.getElementById('resume-btn');
    const quitBtn = document.getElementById('quit-btn');
    if (pauseSelectedIndex === 0) {
        resumeBtn.classList.add('selected-btn'); quitBtn.classList.remove('selected-btn');
    } else {
        resumeBtn.classList.remove('selected-btn'); quitBtn.classList.add('selected-btn');
    }
}

function togglePause() {
    if (!isPlaying) return;
    isPaused = !isPaused;
    if (isPaused) {
        pauseSelectedIndex = 0; updatePauseMenuUI(); pauseScreen.classList.remove('hidden');
    } else {
        pauseScreen.classList.add('hidden');
        lastTime = performance.now(); requestAnimationFrame(update);
    }
}

function quitGame() {
    isPaused = false; 
    isPlaying = false; 
    stopSynthEngine();
    if (versusInterval) clearInterval(versusInterval);
    if (dataChannel) { dataChannel.close(); dataChannel = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }

    arcadeRoom.classList.remove('game-running');
    pauseScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    startScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    multiSelectScreen.classList.add('hidden');
    modeSelectScreen.classList.remove('hidden');
    
    gameContainer.classList.remove('danger-state');
    arcadeCabinet.style.transform = ''; 
    arcadeCabinet.style.webkitTransform = ''; 
    gameContainer.style.backgroundColor = '#000';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    isSplashActive = true;
    introScreen.classList.remove('hidden');
    modeSelectScreen.classList.add('hidden');
    arcadeRoom.classList.add('zoomed-in-view');
    fitArcade();
}

/* =========================================================
   12. EVENT LISTENERS FOR MODES & MENUS
   ========================================================= */
// Root Mode Select
document.getElementById('btn-mode-solo').addEventListener('click', () => {
    playMenuSelectSound();
    selectedMode = 'solo';
    networkRole = 'solo';
    modeSelectScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    roomRoleIndicator.innerText = "SOLO: OVERKILL EDITION";
    modeInstructions.innerHTML = `<span style="color:#0f0">+ A +</span> 1-UP | <span style="color:#0ff">~ A ~</span> SLOW-MO | <span style="color:#f50">[ A ]</span> NUKE`;
    document.getElementById('start-btn').style.display = 'block';
});

document.getElementById('btn-mode-multi').addEventListener('click', () => {
    playMenuSelectSound();
    modeSelectScreen.classList.add('hidden');
    multiSelectScreen.classList.remove('hidden');
});

// Multiplayer Submenu
document.getElementById('btn-multi-duo').addEventListener('click', () => {
    playMenuSelectSound();
    selectedMode = 'duo';
    multiSelectScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    document.getElementById('lobby-title').innerText = "DUO (CO-OP) LOBBY";
    modeInstructions.innerHTML = `<span style="color:#00f3ff;">P1: BLUE</span> | <span style="color:#ff0055;">P2: RED</span> | 5 SHARED LIVES`;
    resetLobbyUI();
});

document.getElementById('btn-multi-1v1').addEventListener('click', () => {
    playMenuSelectSound();
    selectedMode = '1v1';
    multiSelectScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    document.getElementById('lobby-title').innerText = "1v1 (VERSUS) LOBBY";
    modeInstructions.innerHTML = `PUSH TUG-OF-WAR BAR TOWARDS ENEMY. MOST AREA WINS!`;
    resetLobbyUI();
});

document.getElementById('btn-multi-back').addEventListener('click', () => {
    playMenuSelectSound();
    multiSelectScreen.classList.add('hidden');
    modeSelectScreen.classList.remove('hidden');
});

// Lobby Controllers
function resetLobbyUI() {
    roomCodeDisplay.classList.add('hidden');
    document.getElementById('btn-create-room').style.display = 'inline-block';
    document.getElementById('lobby-join-sec').style.display = 'block';
    lobbyStatusMsg.innerText = "";
    roomInput.value = "";
}

document.getElementById('btn-create-room').addEventListener('click', () => {
    playMenuSelectSound();
    createRoom();
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    playMenuSelectSound();
    joinRoom();
});

document.getElementById('btn-lobby-back').addEventListener('click', () => {
    playMenuSelectSound();
    lobbyScreen.classList.add('hidden');
    multiSelectScreen.classList.remove('hidden');
});

// Primary Game Action Buttons
document.getElementById('start-btn').addEventListener('click', triggerGameStart);
document.getElementById('restart-btn').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('quit-btn').addEventListener('click', quitGame);
