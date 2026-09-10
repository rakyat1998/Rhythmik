// ==========================================
// 1. FIREBASE & WEBRTC SETUP
// ==========================================
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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentUsername = "";
let peerConnection = null;
let dataChannel = null;
let isHost = true;
let roomId = null;

const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

// ==========================================
// 2. DOM ELEMENTS & GAME STATE
// ==========================================
function fitArcade() {
    const scaler = document.getElementById('arcade-scaler');
    const scaleX = window.innerWidth / 2200; 
    const scaleY = window.innerHeight / 1300;
    scaler.style.transform = `scale(${Math.min(scaleX, scaleY, 1.2)})`;
}
window.addEventListener('resize', fitArcade);
fitArcade();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const arcadeRoom = document.getElementById('arcade-room');
const arcadeCabinet = document.getElementById('arcade-cabinet'); 

const introScreen = document.getElementById('intro-screen');
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
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
const finalScoreEl = document.getElementById('final-score');
const tugBar = document.getElementById('tug-of-war-bar');
const tugP1 = document.getElementById('tug-p1');
const resumeBtn = document.getElementById('resume-btn');
const quitBtn = document.getElementById('quit-btn');

// UI State Machine
let uiState = 'SPLASH'; 
let authSelect = 0; 
let lobbyModeSelect = 0; 
let lobbyJoinSelect = 0; 
let pauseSelect = 0; 
let machinePower = 0; // Visual Power level (0 to 1)
let targetMachinePower = 0;

const playlist = [
    { title: "Master of Puppets", src: "audio/mop.mp3", bpm: 212 },
    { title: "Super Mario Bros.", src: "audio/smb.mp3", bpm: 130 },
    { title: "Shape Of You", src: "audio/shape.mp3", bpm: 150 },
    { title: "Scourage of Iron", src: "audio/iron.mp3", bpm: 212 },
    { title: "Creep", src: "audio/creep.mp3", bpm: 150 }
];

let currentSongIndex = 0;
let bgMusic = new Audio();
bgMusic.crossOrigin = "anonymous";
bgMusic.preservesPitch = false; 

let audioCtx, analyser, dataArray, masterGain;
let audioUnlocked = false;
let activeLetters = [];
let particles = [];
let floatingTexts = [];

let gameMode = 'solo'; 
let score = 0;
let opponentScore = 0;
let currentRound = 1;
let comboCount = 0;
let comboMultiplier = 1;
let lives = 3;
const MAX_LIVES = 5;
const MAX_SCORE_DIFF = 2000;

let isPlaying = false;
let isPaused = false;
let nextSpawnTime = 0;
let beatInterval = 0;
let targetPlaybackRate = 1.0; 
let currentPlaybackRate = 1.0;
let targetFallSpeed = 200; 
let currentFallSpeed = 200;
let lastTime = 0;
let arcadeShakeIntensity = 0;
let slowMoTimer = 0;
let menuFadeInterval;

const comboColors = ['#fff', '#00ffcc', '#ffaa00', '#ff0055', '#b300ff', '#ff0000'];
const shredPhrases = ["NICE!", "BRUTAL!", "SHREDDING!", "UNREAL!", "GODLIKE!"];

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const leftCab = document.querySelector('.left-cabinet');
const rightCab = document.querySelector('.right-cabinet');
const bgParticles = [];
for(let i=0; i<300; i++) bgParticles.push({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, baseSize: Math.random() * 1.5 + 0.5, hueOffset: Math.random() * 60 - 30 });

// ==========================================
// 3. AUDIO CORE & BROWSER UNLOCK
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
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer; source.connect(audioCtx.destination); source.start(0);
    audioUnlocked = true;
    if (currentUser && uiState !== 'SPLASH' && uiState !== 'AUTH' && !isPlaying && bgMusic.paused) startMenuMusic(true);
}
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

function startMenuMusic(fadeIn = false) {
    if (!audioUnlocked || isPlaying) return;
    clearInterval(menuFadeInterval);
    
    bgMusic.src = playlist[currentSongIndex].src;
    bgMusic.loop = true;
    currentPlaybackRate = 1.0;
    bgMusic.playbackRate = 1.0;
    
    if (fadeIn && masterGain) {
        masterGain.gain.value = 0;
        bgMusic.play().catch(()=>{});
        let fadeVol = 0;
        menuFadeInterval = setInterval(() => {
            fadeVol += 0.02;
            if (fadeVol >= 0.4) { masterGain.gain.value = 0.4; clearInterval(menuFadeInterval); } 
            else { masterGain.gain.value = fadeVol; }
        }, 100);
    } else {
        if (masterGain) masterGain.gain.value = 0.4;
        bgMusic.play().catch(()=>{});
    }
}

// ==========================================
// 4. AUTHENTICATION LOGIC
// ==========================================
document.getElementById('btn-register').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const username = document.getElementById('auth-username').value.trim().toUpperCase();
    if (username.length < 3) return showAuthError("USERNAME MUST BE 3+ CHARS");
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(cred.user.uid).set({ username, email });
        unlockAudio();
    } catch (e) { showAuthError(e.message); }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
        unlockAudio();
    } catch (e) { showAuthError(e.message); }
});

function showAuthError(msg) { document.getElementById('auth-error').innerText = msg; }

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        currentUsername = doc.exists ? doc.data().username : "PLAYER";
        document.getElementById('lobby-username').innerText = currentUsername;

        // Skip auth screen completely if returning user passes Splash
        if (uiState !== 'SPLASH') {
            authScreen.classList.add('hidden');
            lobbyScreen.classList.remove('hidden');
            arcadeRoom.classList.remove('zoomed-in-view'); 
            uiState = 'LOBBY_MODE';
            targetMachinePower = 1.0;
            updateLobbyUI();
            updateSongDisplays();
            startMenuMusic(true);
        }
    } else {
        currentUser = null;
        if (uiState !== 'SPLASH') {
            authScreen.classList.remove('hidden');
            lobbyScreen.classList.add('hidden');
            uiState = 'AUTH';
            targetMachinePower = 0.0;
            updateAuthUI();
        }
    }
});

// ==========================================
// 5. KEYBOARD-ONLY UI NAVIGATION ENGINE
// ==========================================
function updateAuthUI() {
    document.getElementById('btn-login').classList.toggle('selected-btn', authSelect === 0);
    document.getElementById('btn-register').classList.toggle('selected-btn', authSelect === 1);
}

function updateLobbyUI() {
    const btns = [document.getElementById('btn-mode-solo'), document.getElementById('btn-mode-duo'), document.getElementById('btn-mode-1v1')];
    btns.forEach((b, i) => b.classList.toggle('selected-btn', i === lobbyModeSelect));
    gameMode = ['solo', 'duo', '1v1'][lobbyModeSelect];
}

function updateJoinUI() {
    document.getElementById('btn-create-room').classList.toggle('selected-btn', lobbyJoinSelect === 0);
    document.getElementById('btn-join-room').classList.toggle('selected-btn', lobbyJoinSelect === 1);
    if(lobbyJoinSelect === 1) {
        document.getElementById('join-room-id').focus();
        document.getElementById('join-room-id').style.borderColor = '#ff0055';
    } else {
        document.getElementById('join-room-id').blur();
        document.getElementById('join-room-id').style.borderColor = '#0ff';
    }
}

function updatePauseUI() {
    document.getElementById('resume-btn').classList.toggle('selected-btn', pauseSelect === 0);
    document.getElementById('quit-btn').classList.toggle('selected-btn', pauseSelect === 1);
}

window.addEventListener('keydown', (e) => {

    // Safely allow users to type in input fields without triggering game menus
    if (document.activeElement.tagName === 'INPUT') {
        if (e.key === 'Enter') {
            playMenuSelectSound();
            if (uiState === 'AUTH') {
                if(authSelect === 0) document.getElementById('btn-login').click();
                else document.getElementById('btn-register').click();
            } else if (uiState === 'LOBBY_JOIN') {
                document.getElementById('btn-join-room').click();
            }
        }
        return; 
    }

    if (uiState === 'PLAYING') {
        if (e.key === 'Escape') { togglePause(); return; }
        
        const key = e.key.toUpperCase();
        const myId = isHost ? 1 : 2;
        let targetIndex = -1; let maxY = -100;
        for (let i = 0; i < activeLetters.length; i++) {
            if ((gameMode === 'solo' || activeLetters[i].owner === myId) && activeLetters[i].char === key && activeLetters[i].y > maxY) {
                maxY = activeLetters[i].y; targetIndex = i;
            }
        }

        if (targetIndex !== -1) {
            const letter = activeLetters[targetIndex];
            activeLetters.splice(targetIndex, 1);
            if (letter.type === 'normal') playHitSound(); else triggerPowerUp(letter);
            
            arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 15); 
            comboCount++; if (comboCount > 0 && comboCount % 6 === 0) comboMultiplier++;
            createExplosion(letter.x, letter.y, letter.color);
            
            if (letter.type === 'normal') {
                score += 10 * comboMultiplier;
                floatingTexts.push({ text: "+" + (10 * comboMultiplier), x: letter.x, y: letter.y, life: 1.0, size: 16, color: '#fff' });
            }
            targetFallSpeed = Math.min(800, targetFallSpeed + 2); 
            updateUI();
            if (gameMode !== 'solo') broadcast({ type: 'HIT_LETTER', id: letter.id, score });
        }
        return;
    }

    switch(uiState) {
        case 'SPLASH':
            if (e.key === 'Enter') {
                unlockAudio();
                document.getElementById('intro-screen').classList.add('hidden');
                arcadeRoom.classList.remove('zoomed-in-view'); // Zooms out to powered-down machines
                
                if (currentUser) {
                    uiState = 'LOBBY_MODE';
                    lobbyScreen.classList.remove('hidden');
                    updateLobbyUI();
                    updateSongDisplays();
                    targetMachinePower = 1.0;
                    startMenuMusic(true);
                } else {
                    uiState = 'AUTH';
                    authScreen.classList.remove('hidden');
                    targetMachinePower = 0.0;
                    updateAuthUI();
                }
            }
            break;

        case 'AUTH':
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                authSelect = authSelect === 0 ? 1 : 0;
                playMenuSelectSound(); updateAuthUI();
            } else if (e.key === 'Enter') {
                playMenuSelectSound();
                if(authSelect === 0) document.getElementById('btn-login').click();
                else document.getElementById('btn-register').click();
            }
            break;

        case 'LOBBY_MODE':
            if (e.key === 'ArrowLeft') { lobbyModeSelect = (lobbyModeSelect - 1 + 3) % 3; playMenuSelectSound(); updateLobbyUI(); }
            else if (e.key === 'ArrowRight') { lobbyModeSelect = (lobbyModeSelect + 1) % 3; playMenuSelectSound(); updateLobbyUI(); }
            else if (e.key === 'Enter') {
                playMenuSelectSound();
                if (lobbyModeSelect === 0) {
                    uiState = 'START'; isHost = true;
                    lobbyScreen.classList.add('hidden');
                    document.getElementById('mode-title-display').innerText = "SOLO MODE";
                    startScreen.classList.remove('hidden');
                } else {
                    uiState = 'LOBBY_JOIN'; lobbyJoinSelect = 0;
                    document.getElementById('multiplayer-controls').classList.remove('hidden');
                    updateJoinUI();
                }
            }
            break;

        case 'LOBBY_JOIN':
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                lobbyJoinSelect = lobbyJoinSelect === 0 ? 1 : 0;
                playMenuSelectSound(); updateJoinUI();
            } else if (e.key === 'Enter') {
                playMenuSelectSound();
                if (lobbyJoinSelect === 0) createRoom();
                else joinRoom();
            } else if (e.key === 'Escape') {
                document.getElementById('multiplayer-controls').classList.add('hidden');
                uiState = 'LOBBY_MODE'; updateLobbyUI();
            }
            break;

        case 'START':
            if (isHost && !document.getElementById('start-btn').classList.contains('hidden')) {
                if (e.key === 'ArrowLeft') {
                    currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
                    playMenuSelectSound(); updateSongDisplays(); startMenuMusic();
                } else if (e.key === 'ArrowRight') {
                    currentSongIndex = (currentSongIndex + 1) % playlist.length;
                    playMenuSelectSound(); updateSongDisplays(); startMenuMusic();
                } else if (e.key === 'Enter') {
                    playMenuSelectSound();
                    if (gameMode !== 'solo') broadcast({ type: 'START_GAME', songIndex: currentSongIndex });
                    startGameSequence();
                } else if (e.key === 'Escape' && gameMode === 'solo') {
                    startScreen.classList.add('hidden'); lobbyScreen.classList.remove('hidden');
                    uiState = 'LOBBY_MODE'; updateLobbyUI();
                }
            }
            break;

        case 'PAUSED':
            if (e.key === 'Escape') togglePause();
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { pauseSelect = pauseSelect === 0 ? 1 : 0; playMenuSelectSound(); updatePauseUI(); }
            else if (e.key === 'Enter') { playMenuSelectSound(); if (pauseSelect === 0) togglePause(); else quitGame(); }
            break;

        case 'GAMEOVER':
            if (e.key === 'Enter') { playMenuSelectSound(); document.getElementById('restart-btn').click(); }
            break;
    }
});

// ==========================================
// 6. LOBBY & MATCHMAKING LOGIC
// ==========================================
async function createRoom() {
    uiState = 'WAITING'; isHost = true;
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
    const inputId = document.getElementById('join-room-id').value.toUpperCase();
    if(inputId.length < 5) return;
    
    uiState = 'WAITING'; isHost = false;
    const roomsRef = db.collection('rooms');
    const q = await roomsRef.where('roomId', '==', inputId).get();
    if (q.empty) { alert("ROOM NOT FOUND"); uiState = 'LOBBY_JOIN'; return; }
    
    const roomRef = q.docs[0].ref;
    const roomData = q.docs[0].data();
    gameMode = roomData.mode;

    peerConnection = new RTCPeerConnection(servers);
    peerConnection.ondatachannel = event => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };

    collectIceCandidates(roomRef, peerConnection, 'calleeCandidates', 'callerCandidates');

    const offer = roomData.offer;
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
        lobbyScreen.classList.add('hidden');
        document.getElementById('mode-title-display').innerText = gameMode === 'duo' ? "DUO CO-OP" : "1V1 VERSUS";
        startScreen.classList.remove('hidden');
        
        if (!isHost) {
            document.getElementById('start-btn').innerText = "WAITING FOR HOST...";
            document.getElementById('start-btn').classList.remove('selected-btn');
        } else {
            document.getElementById('start-btn').innerText = "BEGIN GAME [ENTER]";
            document.getElementById('start-btn').classList.add('selected-btn');
        }
    };
    
    dc.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'START_GAME') { currentSongIndex = msg.songIndex; startGameSequence(); }
        else if (msg.type === 'SPAWN_LETTER') { activeLetters.push(msg.letter); }
        else if (msg.type === 'HIT_LETTER') {
            const idx = activeLetters.findIndex(l => l.id === msg.id);
            if (idx > -1) {
                createExplosion(activeLetters[idx].x, activeLetters[idx].y, activeLetters[idx].color);
                activeLetters.splice(idx, 1);
            }
            if (gameMode === '1v1') updateOpponentScore(msg.score);
        }
    };
}

function broadcast(msgObj) {
    if (dataChannel && dataChannel.readyState === 'open') dataChannel.send(JSON.stringify(msgObj));
}

// ==========================================
// 7. CORE GAMEPLAY ENGINE
// ==========================================
function startGameSequence() {
    uiState = 'LOADING';
    unlockAudio();
    playCoinSound();
    currentSong = playlist[currentSongIndex];
    trackEl.innerText = currentSong.title;

    document.getElementById('start-btn').classList.add('hidden');
    document.getElementById('loading-indicator').classList.remove('hidden');

    bgMusic.pause();
    bgMusic.src = currentSong.src;
    bgMusic.loop = false;
    if (masterGain) masterGain.gain.value = 0; 
    
    bgMusic.load();

    const onAudioReady = () => {
        if(uiState === 'PLAYING') return;
        bgMusic.removeEventListener('canplaythrough', onAudioReady);

        arcadeRoom.classList.add('game-running');
        gameContainer.style.borderColor = '#fff';
        if (gameMode === '1v1') tugBar.classList.remove('hidden');

        activeLetters = []; particles = []; floatingTexts = [];
        score = 0; opponentScore = 0; currentRound = 1; comboCount = 0; comboMultiplier = 1; lives = 3;
        arcadeShakeIntensity = 0; slowMoTimer = 0; 
        currentPlaybackRate = 1.0; targetPlaybackRate = 1.0; bgMusic.playbackRate = 1.0;
        currentFallSpeed = 200; targetFallSpeed = 200; beatInterval = 60 / currentSong.bpm; 
        
        startScreen.classList.add('hidden'); 
        document.getElementById('loading-indicator').classList.add('hidden');
        
        setTimeout(() => {
            bgMusic.currentTime = 0; 
            if (masterGain) masterGain.gain.value = 1.0; 
            nextSpawnTime = 0.1;
            isPlaying = true; isPaused = false; uiState = 'PLAYING';
            bgMusic.play().catch(e => console.log("Audio play blocked", e));
            updateUI(); lastTime = performance.now(); requestAnimationFrame(update);
        }, 2200); 
    };

    bgMusic.addEventListener('canplaythrough', onAudioReady);
    if (bgMusic.readyState >= 3) onAudioReady();
    setTimeout(() => { if (uiState === 'LOADING') onAudioReady(); }, 5000); 
}

function spawnLetterLogic() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const char = chars[Math.floor(Math.random() * chars.length)];
    let x, color, owner = 1; let type = 'normal';

    if (Math.random() < 0.12) {
        const roll = Math.random();
        if (roll < 0.33) type = '1up'; else if (roll < 0.66) type = 'slow'; else type = 'nuke';
    }

    if (gameMode === 'solo') {
        x = Math.random() * (canvas.width - 120) + 60;
        color = comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)];
    } else if (gameMode === 'duo') {
        x = Math.random() * (canvas.width - 120) + 60;
        owner = Math.random() > 0.5 ? 1 : 2; 
        color = owner === 1 ? '#0ff' : '#ff0055'; 
    } else if (gameMode === '1v1') {
        owner = 1; x = Math.random() * 300 + 50; color = '#0ff';
        const letterP1 = { id: Date.now()+1, char, x, y: -30, color, type, owner };
        const owner2 = 2; const x2 = Math.random() * 300 + 450; const color2 = '#ff0055';
        const letterP2 = { id: Date.now()+2, char, x: x2, y: -30, color: color2, type, owner: owner2 };
        
        activeLetters.push(letterP1, letterP2);
        broadcast({ type: 'SPAWN_LETTER', letter: letterP1 }); broadcast({ type: 'SPAWN_LETTER', letter: letterP2 });
        return; 
    }
    if (type !== 'normal') color = type === '1up' ? '#0f0' : type === 'slow' ? '#0ff' : '#ff4400';

    const newLetter = { id: Date.now(), char, x, y: -30, color, type, owner };
    activeLetters.push(newLetter);
    if (gameMode !== 'solo') broadcast({ type: 'SPAWN_LETTER', letter: newLetter });
}

function update(time) {
    if (!isPlaying || isPaused) return;
    const dt = Math.min((time - lastTime) / 1000, 0.1); 
    lastTime = time;

    if (score >= 2000 && currentRound === 1) { currentRound = 2; targetPlaybackRate = 1.05; targetFallSpeed = 230; updateUI(); }
    else if (score >= 4000 && currentRound === 2) { currentRound = 3; targetPlaybackRate = 1.10; targetFallSpeed = 260; updateUI(); }

    if (slowMoTimer > 0) {
        slowMoTimer -= dt;
        arcadeCabinet.classList.add('flash-slow');
    } else {
        arcadeCabinet.classList.remove('flash-slow');
    }
    
    let tRate = (slowMoTimer > 0) ? 0.6 : targetPlaybackRate;
    let tFall = (slowMoTimer > 0) ? targetFallSpeed * 0.4 : targetFallSpeed;
    currentPlaybackRate += (tRate - currentPlaybackRate) * dt * 2.0;
    currentFallSpeed += (tFall - currentFallSpeed) * dt * 2.0;
    bgMusic.playbackRate = Math.max(0.1, currentPlaybackRate);

    if (arcadeShakeIntensity > 0.5) {
        arcadeCabinet.style.transform = `translate3d(${(Math.random() - 0.5) * arcadeShakeIntensity}px, ${94 + (Math.random() - 0.5) * arcadeShakeIntensity}px, 1380px)`;
        arcadeShakeIntensity *= 0.85; 
    } else { arcadeCabinet.style.transform = `translate3d(0px, 94px, 1380px)`; }

    if (isHost && bgMusic.currentTime >= nextSpawnTime && bgMusic.currentTime > 0) {
        spawnLetterLogic();
        nextSpawnTime = bgMusic.currentTime + (currentRound === 1 ? beatInterval * 2 : currentRound === 2 ? beatInterval * 1.5 : beatInterval * 1.2); 
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameMode === '1v1') { ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(400, 0); ctx.lineTo(400, 600); ctx.stroke(); }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; p.vy += 1800 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 2.5; 
        if (p.life <= 0) particles.splice(i, 1); 
        else { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, p.size, p.size); }
    }
    ctx.globalAlpha = 1.0;

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i]; ft.y -= dt * 60; ft.life -= dt * 1.5;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
        else { ctx.globalAlpha = Math.min(1.0, ft.life); ctx.fillStyle = ft.color; ctx.font = ft.size + 'px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.fillText(ft.text, ft.x, ft.y); }
    }
    ctx.globalAlpha = 1.0;

    ctx.font = '24px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = activeLetters.length - 1; i >= 0; i--) {
        let l = activeLetters[i]; 
        l.y += currentFallSpeed * dt;
        
        ctx.fillStyle = l.color; ctx.shadowBlur = l.type !== 'normal' ? 15 : 0; ctx.shadowColor = l.color;
        let text = l.char;
        if (l.type === 'nuke') text = `[ ${l.char} ]`; else if (l.type === '1up') text = `+ ${l.char} +`; else if (l.type === 'slow') text = `~ ${l.char} ~`;
        ctx.fillText(text, l.x, l.y);
        ctx.shadowBlur = 0; 
        
        if (l.y > canvas.height + 20) { 
            let myId = isHost ? 1 : 2;
            if (gameMode === 'solo' || l.owner === myId) loseLife();
            activeLetters.splice(i, 1); 
            if (lives <= 0) return; 
        }
    }
    requestAnimationFrame(update);
}

function updateUI() {
    scoreEl.innerText = score; comboEl.innerText = comboCount; multiplierEl.innerText = 'x' + comboMultiplier;
    roundUiEl.innerText = 'ROUND ' + currentRound;
    
    let hearts = ""; for(let i=0; i<lives; i++) hearts += "♥"; livesEl.innerText = hearts;
    if (lives === 1) gameContainer.classList.add('danger-state'); else gameContainer.classList.remove('danger-state');
    
    const colorIndex = Math.min(comboMultiplier - 1, comboColors.length - 1);
    comboContainer.style.color = comboColors[colorIndex];
    
    if (gameMode === '1v1') {
        const myScore = isHost ? score : opponentScore;
        const opScore = isHost ? opponentScore : score;
        const diff = myScore - opScore;
        
        let percentage = (diff / (MAX_SCORE_DIFF * 2)) * 100 + 50;
        percentage = Math.max(0, Math.min(100, percentage));
        tugP1.style.width = percentage + "%";

        if (diff >= MAX_SCORE_DIFF) triggerWin();
        else if (diff <= -MAX_SCORE_DIFF) loseLife(true); 
    }
}

function updateOpponentScore(opScore) { opponentScore = opScore; updateUI(); }

function triggerPowerUp(letter) {
    if (letter.type === '1up') {
        lives = Math.min(lives + 1, MAX_LIVES); play1UPSound();
        arcadeCabinet.classList.add('flash-1up');
        setTimeout(() => arcadeCabinet.classList.remove('flash-1up'), 400);
        floatingTexts.push({ text: "1-UP!", x: letter.x, y: letter.y, life: 1.5, size: 20, color: '#0f0' });
    } 
    else if (letter.type === 'nuke') {
        arcadeShakeIntensity = 80; playNukeSound();
        arcadeCabinet.classList.add('flash-nuke');
        setTimeout(() => arcadeCabinet.classList.remove('flash-nuke'), 500);
        let pointsGained = 0; let explosionsCount = 0;
        for (let i = activeLetters.length - 1; i >= 0; i--) {
            let l = activeLetters[i]; 
            if (explosionsCount < 8) { createExplosion(l.x, l.y, l.color, 1.5); explosionsCount++; }
            pointsGained += (10 * comboMultiplier);
        }
        score += pointsGained;
        floatingTexts.push({ text: "NUKE DETONATED!", x: canvas.width/2, y: canvas.height/2, life: 2.0, size: 30, color: '#ff4400' });
        if (pointsGained > 0) floatingTexts.push({ text: `+${pointsGained}`, x: canvas.width/2, y: canvas.height/2 + 40, life: 2.0, size: 20, color: '#fff' });
        activeLetters = []; 
        targetFallSpeed = 200 + ((currentRound - 1) * 30); 
        nextSpawnTime = bgMusic.currentTime + 2.0; 
    }
    else if (letter.type === 'slow') {
        slowMoTimer = 6.0; playSlowMoSound();
        floatingTexts.push({ text: "TIME WARP", x: letter.x, y: letter.y, life: 1.5, size: 20, color: '#0ff' });
    }
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

function triggerWin() {
    isPlaying = false; uiState = 'GAMEOVER';
    document.getElementById('game-over-title').innerText = "VICTORY";
    document.getElementById('game-over-title').style.color = '#0ff';
    gameOverScreen.classList.remove('hidden');
    bgMusic.pause();
}

function loseLife(instantDeath = false) {
    lives = instantDeath ? 0 : lives - 1; comboCount = 0; comboMultiplier = 1;
    arcadeShakeIntensity = 60; playDamageSound();
    
    gameContainer.classList.add('damage-flicker');
    setTimeout(() => gameContainer.classList.remove('damage-flicker'), 400);
    updateUI();
    
    if (lives <= 0) {
        isPlaying = false; uiState = 'GAMEOVER';
        document.getElementById('game-over-title').innerText = "WASTED";
        document.getElementById('game-over-title').style.color = '#fff';
        gameOverScreen.classList.remove('hidden');
        bgMusic.pause();
    } else {
        slowMoTimer = 2.0; playSlowMoSound();
    }
}

function togglePause() {
    if (!isPlaying) return;
    isPaused = !isPaused;
    if (isPaused) {
        uiState = 'PAUSED'; bgMusic.pause(); pauseSelect = 0; updatePauseUI(); pauseScreen.classList.remove('hidden');
    } else {
        uiState = 'PLAYING'; pauseScreen.classList.add('hidden'); requestAnimationFrame((t) => { lastTime = t; bgMusic.play(); requestAnimationFrame(update); });
    }
}

function quitGame() {
    isPaused = false; isPlaying = false; uiState = 'LOBBY_MODE';
    arcadeRoom.classList.remove('game-running');
    pauseScreen.classList.add('hidden');
    startScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    document.getElementById('multiplayer-controls').classList.remove('hidden');
    document.getElementById('room-waiting').classList.add('hidden');
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('loading-indicator').classList.add('hidden');
    
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (dataChannel) { dataChannel.close(); dataChannel = null; }
    
    gameContainer.classList.remove('danger-state');
    arcadeCabinet.style.transform = ''; 
    arcadeCabinet.classList.remove('slow-mo-active');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    updateLobbyUI();
    startMenuMusic(true);
}

document.getElementById('restart-btn').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    quitGame();
});

// ==========================================
// 8. BACKGROUND RENDERING & AUDIO SYNTHS
// ==========================================
function updateSongDisplays() {
    if(playlist.length === 0) return;
    const len = playlist.length;
    document.getElementById('left-screen-title').innerText = playlist[(currentSongIndex - 1 + len) % len].title;
    document.getElementById('right-screen-title').innerText = playlist[(currentSongIndex + 1) % len].title;
    document.getElementById('center-song-title').innerText = `◀ ${playlist[currentSongIndex].title} ▶`;
}

function drawBackground() {
    requestAnimationFrame(drawBackground);
    if (!analyser) return;
    
    machinePower += (targetMachinePower - machinePower) * 0.05;

    analyser.getByteFrequencyData(dataArray);
    let bassSum = 0; let bassCount = Math.floor(dataArray.length / 4); 
    for(let i = 0; i < bassCount; i++) bassSum += dataArray[i];
    const reaction = (bassCount > 0 ? (bassSum / bassCount) : 0) / 255;
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    const cx = bgCanvas.width / 2; const cy = bgCanvas.height / 2; const hue = ((bassSum / bassCount) * 1.5) % 360;
    
    // Core Aura
    const grad = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, reaction * (cx*1.2) + 150);
    grad.addColorStop(0, `hsla(${hue}, 90%, 50%, ${(0.1 + reaction * 0.2) * machinePower})`); 
    grad.addColorStop(1, `transparent`);
    bgCtx.fillStyle = grad; bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    // Render either the Disco Menu Visualizer or standard Gameplay Particles
    if (uiState === 'LOBBY_MODE' || uiState === 'LOBBY_JOIN' || uiState === 'START') {
        const barWidth = Math.ceil(bgCanvas.width / dataArray.length);
        for(let i = 0; i < dataArray.length; i++) {
            const barHeight = dataArray[i] * 2.5 * machinePower;
            bgCtx.fillStyle = `hsla(${(hue + i*4) % 360}, 100%, 50%, ${0.5 * machinePower})`;
            bgCtx.fillRect(i * barWidth, bgCanvas.height - barHeight, barWidth, barHeight);
        }
    } else if (uiState === 'PLAYING') {
        for (let p of bgParticles) {
            const dx = p.x - cx; const dy = p.y - cy; const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const outSpeed = 0.02 + reaction * 4; 
            p.x += (dx / dist) * outSpeed; p.y += (dy / dist) * outSpeed;
            const jitter = 0.2 + reaction * 1.5;
            p.x += (Math.random() - 0.5) * jitter; p.y += (Math.random() - 0.5) * jitter;
            if (p.x < 0 || p.x > bgCanvas.width || p.y < 0 || p.y > bgCanvas.height) { p.x = cx + (Math.random() - 0.5) * 200; p.y = cy + (Math.random() - 0.5) * 200; }
            bgCtx.fillStyle = `hsla(${(hue + p.hueOffset) % 360}, 90%, ${50 + reaction * 40}%, ${0.3 + reaction * 0.7 * machinePower})`;
            bgCtx.beginPath(); bgCtx.arc(p.x, p.y, p.baseSize * (1 + reaction * 1.5), 0, Math.PI * 2); bgCtx.fill();
        }
    }

    // Apply Lerped machinePower to the physical arcade machines
    let dynBright = 0.2 + (0.45 + reaction * 0.5) * machinePower; 
    leftCab.style.filter = `hue-rotate(${hue}deg) brightness(${dynBright}) contrast(1.2)`;
    rightCab.style.filter = `hue-rotate(${hue}deg) brightness(${dynBright}) contrast(1.2)`;
    const cabGlow = `0 40px 100px rgba(0,0,0,1), 0 0 ${50 + reaction * 250}px hsla(${hue}, 100%, 60%, ${reaction * 0.8 * machinePower})`;
    leftCab.style.boxShadow = cabGlow; rightCab.style.boxShadow = cabGlow;

    const parts = arcadeCabinet.querySelectorAll('.chameleon-part');
    if (machinePower < 0.95) {
        parts.forEach(p => { p.style.animation = 'none'; p.style.filter = `brightness(${0.2 + 0.8 * machinePower})`; });
    } else if (slowMoTimer > 0) {
        // Handled by CSS class flash-slow, so do nothing here
    } else {
        parts.forEach(p => { if (p.style.animation === 'none' && !p.classList.contains('flash-nuke') && !p.classList.contains('flash-1up')) { p.style.animation = ''; p.style.filter = ''; } });
    }
}

function playMenuSelectSound() { if (audioCtx) playTone(600, 'square', audioCtx.currentTime, 0.05, 0.2); }
function playCoinSound() { if (audioCtx) { playTone(987.77, 'square', audioCtx.currentTime, 0.08, 0.3); playTone(1318.51, 'square', audioCtx.currentTime + 0.08, 0.4, 0.3); } }
function playTone(f, type, t, dur, vol, dFreq = null) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (dFreq) osc.frequency.exponentialRampToValueAtTime(dFreq, t + dur);
    gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t + dur);
}
function playNoise(time, dur, vol) {
    if (!audioCtx) return;
    const bufSize = audioCtx.sampleRate * dur; const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0); for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buf;
    const gain = audioCtx.createGain(); gain.gain.setValueAtTime(vol, time); gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    noise.connect(gain); gain.connect(audioCtx.destination); noise.start(time);
}
function playHitSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime; const sfx = Math.floor(Math.random() * 3); 
    if (sfx === 0) playTone(1200, 'square', t, 0.05, 0.15, 800); 
    else if (sfx === 1) { playTone(1500, 'square', t, 0.08, 0.1, 400); playNoise(t, 0.02, 0.1); }
    else { playTone(800, 'square', t, 0.05, 0.1); playTone(1200, 'square', t + 0.05, 0.05, 0.15); }
}
function play1UPSound() { if (audioCtx) { playTone(523.25, 'square', audioCtx.currentTime, 0.1, 0.3); playTone(659.25, 'square', audioCtx.currentTime + 0.1, 0.1, 0.3); playTone(783.99, 'square', audioCtx.currentTime + 0.2, 0.3, 0.3); } }
function playNukeSound() {
    if (!audioCtx) return; const t = audioCtx.currentTime;
    playTone(440, 'sine', t, 0.4, 0.2, 880); playTone(554.37, 'sine', t + 0.1, 0.4, 0.2, 1108.73);
    playTone(659.25, 'sine', t + 0.2, 0.4, 0.2, 1318.51); playTone(880, 'sine', t + 0.3, 0.6, 0.3, 1760);
    playTone(220, 'triangle', t, 1.0, 0.2, 110); playTone(330, 'triangle', t, 1.0, 0.2, 165);
}
function playSlowMoSound() { if (audioCtx) playTone(800, 'sine', audioCtx.currentTime, 1.0, 0.5, 100); }
function playDamageSound() { if (audioCtx) { playTone(400, 'square', audioCtx.currentTime, 0.1, 0.3, 300); playTone(300, 'square', audioCtx.currentTime + 0.1, 0.1, 0.3, 200); playTone(200, 'square', audioCtx.currentTime + 0.2, 0.2, 0.3, 100); } }
