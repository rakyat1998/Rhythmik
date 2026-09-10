// ==========================================
// 1. FIREBASE & WEBRTC SETUP
// ==========================================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
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

// Auth/Lobby Elements
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');

// Score UI
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
let activeLetters = [];
let particles = [];
let floatingTexts = [];

let gameMode = 'solo'; // 'solo', 'duo', '1v1'
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
let targetFallSpeed = 200; 
let currentFallSpeed = 200;
let lastTime = 0;
let arcadeShakeIntensity = 0;
let slowMoTimer = 0;

const comboColors = ['#fff', '#00ffcc', '#ffaa00', '#ff0055', '#b300ff', '#ff0000'];

// ==========================================
// 3. AUTHENTICATION LOGIC
// ==========================================
document.getElementById('btn-register').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const username = document.getElementById('auth-username').value.trim().toUpperCase();
    
    if (username.length < 3) return showAuthError("USERNAME MUST BE 3+ CHARS");
    
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(cred.user.uid).set({ username, email });
        initAudio();
    } catch (e) { showAuthError(e.message); }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
        initAudio();
    } catch (e) { showAuthError(e.message); }
});

function showAuthError(msg) { document.getElementById('auth-error').innerText = msg; }

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        currentUsername = doc.exists ? doc.data().username : "PLAYER";
        document.getElementById('lobby-username').innerText = currentUsername;
        authScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
    } else {
        currentUser = null;
        authScreen.classList.remove('hidden');
        lobbyScreen.classList.add('hidden');
    }
});

// ==========================================
// 4. LOBBY & MATCHMAKING LOGIC
// ==========================================
document.getElementById('btn-mode-solo').addEventListener('click', () => setMode('solo'));
document.getElementById('btn-mode-duo').addEventListener('click', () => setMode('duo'));
document.getElementById('btn-mode-1v1').addEventListener('click', () => setMode('1v1'));

function setMode(mode) {
    gameMode = mode;
    document.querySelectorAll('#lobby-screen button').forEach(b => b.classList.remove('selected-btn'));
    document.getElementById(`btn-mode-${mode}`).classList.add('selected-btn');
    
    if (mode === 'solo') {
        document.getElementById('multiplayer-controls').classList.add('hidden');
        lobbyScreen.classList.add('hidden');
        document.getElementById('mode-title-display').innerText = "SOLO MODE";
        startScreen.classList.remove('hidden');
        isHost = true;
    } else {
        document.getElementById('multiplayer-controls').classList.remove('hidden');
    }
}

// Host creates WebRTC Room
document.getElementById('btn-create-room').addEventListener('click', async () => {
    isHost = true;
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
    
    await roomRef.set({
        roomId: roomId, mode: gameMode,
        offer: { type: offer.type, sdp: offer.sdp }
    });

    // Listen for client answer
    roomRef.onSnapshot(async snapshot => {
        const data = snapshot.data();
        if (!peerConnection.currentRemoteDescription && data && data.answer) {
            const answer = new RTCSessionDescription(data.answer);
            await peerConnection.setRemoteDescription(answer);
        }
    });
});

// Client joins WebRTC Room
document.getElementById('btn-join-room').addEventListener('click', async () => {
    const inputId = document.getElementById('join-room-id').value.toUpperCase();
    isHost = false;

    const roomsRef = db.collection('rooms');
    const q = await roomsRef.where('roomId', '==', inputId).get();
    if (q.empty) return alert("ROOM NOT FOUND");
    
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
});

function collectIceCandidates(roomRef, pc, localName, remoteName) {
    const localCollection = roomRef.collection(localName);
    const remoteCollection = roomRef.collection(remoteName);

    pc.onicecandidate = event => {
        if (event.candidate) localCollection.add(event.candidate.toJSON());
    };

    remoteCollection.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
                await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            }
        });
    });
}

function setupDataChannel(dc) {
    dc.onopen = () => {
        lobbyScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
        document.getElementById('mode-title-display').innerText = gameMode === 'duo' ? "DUO CO-OP" : "1V1 VERSUS";
        
        if (!isHost) {
            document.getElementById('start-btn').innerText = "WAITING FOR HOST...";
            document.getElementById('start-btn').disabled = true;
        }
    };
    
    dc.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'START_GAME') {
            currentSongIndex = msg.songIndex;
            startGameSequence();
        }
        else if (msg.type === 'SPAWN_LETTER') {
            activeLetters.push(msg.letter);
        }
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
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(msgObj));
    }
}

// ==========================================
// 5. GAME ENGINE & LOOP
// ==========================================

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const bgParticles = [];
for(let i=0; i<300; i++) bgParticles.push({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, baseSize: Math.random() * 1.5 + 0.5, hueOffset: Math.random() * 60 - 30 });

function drawBackground() {
    requestAnimationFrame(drawBackground);
    if (!analyser) return;
    
    analyser.getByteFrequencyData(dataArray);
    let bassSum = 0;
    let bassCount = Math.floor(dataArray.length / 4); 
    for(let i = 0; i < bassCount; i++) bassSum += dataArray[i];
    
    const reaction = (bassCount > 0 ? (bassSum / bassCount) : 0) / 255;
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    const cx = bgCanvas.width / 2; const cy = bgCanvas.height / 2;
    const hue = ((bassSum / bassCount) * 1.5) % 360;
    
    const grad = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, reaction * (cx*1.2) + 150);
    grad.addColorStop(0, `hsla(${hue}, 90%, 50%, ${0.1 + reaction * 0.2})`);
    grad.addColorStop(1, `transparent`);
    bgCtx.fillStyle = grad; bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
}

function updateSongDisplays() {
    const len = playlist.length;
    document.getElementById('left-screen-title').innerText = playlist[(currentSongIndex - 1 + len) % len].title;
    document.getElementById('right-screen-title').innerText = playlist[(currentSongIndex + 1) % len].title;
    document.getElementById('center-song-title').innerText = `◀ ${playlist[currentSongIndex].title} ▶`;
}
updateSongDisplays();

function spawnLetterLogic() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const char = chars[Math.floor(Math.random() * chars.length)];
    let x, color, owner = 1;
    let type = 'normal';

    if (Math.random() < 0.12) {
        const roll = Math.random();
        if (roll < 0.33) type = '1up';
        else if (roll < 0.66) type = 'slow';
        else type = 'nuke';
    }

    // Multiplayer Positioning & Ownership
    if (gameMode === 'solo') {
        x = Math.random() * (canvas.width - 120) + 60;
        color = comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)];
    } 
    else if (gameMode === 'duo') {
        x = Math.random() * (canvas.width - 120) + 60;
        owner = Math.random() > 0.5 ? 1 : 2; 
        color = owner === 1 ? '#0ff' : '#ff0055'; // Host Blue, Guest Red
    } 
    else if (gameMode === '1v1') {
        // Spawn 2 letters (One left, One right)
        owner = 1; x = Math.random() * 300 + 50; color = '#0ff';
        const letterP1 = { id: Date.now()+1, char, x, y: -30, color, type, owner };
        
        const owner2 = 2; const x2 = Math.random() * 300 + 450; const color2 = '#ff0055';
        const letterP2 = { id: Date.now()+2, char, x: x2, y: -30, color: color2, type, owner: owner2 };
        
        activeLetters.push(letterP1, letterP2);
        broadcast({ type: 'SPAWN_LETTER', letter: letterP1 });
        broadcast({ type: 'SPAWN_LETTER', letter: letterP2 });
        return; 
    }

    if (type !== 'normal') color = type === '1up' ? '#0f0' : type === 'slow' ? '#0ff' : '#ff4400';

    const newLetter = { id: Date.now(), char, x, y: -30, color, type, owner };
    activeLetters.push(newLetter);
    if (gameMode !== 'solo') broadcast({ type: 'SPAWN_LETTER', letter: newLetter });
}

function update(time) {
    if (!isPlaying || isPaused) return;
    const dt = (time - lastTime) / 1000; lastTime = time;

    // Progression
    if (score >= 2000 && currentRound === 1) { currentRound = 2; targetPlaybackRate = 1.05; targetFallSpeed += 30; updateUI(); }
    else if (score >= 4000 && currentRound === 2) { currentRound = 3; targetPlaybackRate = 1.10; targetFallSpeed += 30; updateUI(); }

    if (slowMoTimer > 0) {
        slowMoTimer -= dt; currentFallSpeed = targetFallSpeed * 0.4; bgMusic.playbackRate = 0.6;
    } else {
        currentFallSpeed = targetFallSpeed; bgMusic.playbackRate = targetPlaybackRate;
    }

    // Camera Shake
    if (arcadeShakeIntensity > 0.5) {
        arcadeCabinet.style.transform = `translate3d(${(Math.random() - 0.5) * arcadeShakeIntensity}px, ${94 + (Math.random() - 0.5) * arcadeShakeIntensity}px, 1380px)`;
        arcadeShakeIntensity *= 0.85; 
    } else {
        arcadeCabinet.style.transform = `translate3d(0px, 94px, 1380px)`;
    }

    // Host handles spawning
    if (isHost && bgMusic.currentTime >= nextSpawnTime && bgMusic.currentTime > 0) {
        spawnLetterLogic();
        let interval = currentRound === 1 ? beatInterval * 2 : currentRound === 2 ? beatInterval * 1.5 : beatInterval * 1.2;
        nextSpawnTime = bgMusic.currentTime + interval; 
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw 1V1 Divider
    if (gameMode === '1v1') {
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(400, 0); ctx.lineTo(400, 600); ctx.stroke();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; p.vy += 1800 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 2.5; 
        if (p.life <= 0) particles.splice(i, 1);
        else { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, p.size, p.size); }
    }
    ctx.globalAlpha = 1.0;

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i]; ft.y -= dt * 60; ft.life -= dt * 1.5;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
        else {
            ctx.globalAlpha = Math.min(1.0, ft.life); ctx.fillStyle = ft.color;
            ctx.font = ft.size + 'px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.fillText(ft.text, ft.x, ft.y);
        }
    }
    ctx.globalAlpha = 1.0;

    ctx.font = '24px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    
    for (let i = activeLetters.length - 1; i >= 0; i--) {
        let l = activeLetters[i]; l.y += currentFallSpeed * dt;
        
        ctx.fillStyle = l.color; ctx.shadowBlur = l.type !== 'normal' ? 15 : 0; ctx.shadowColor = l.color;
        
        let text = l.char;
        if (l.type === 'nuke') text = `[ ${l.char} ]`; else if (l.type === '1up') text = `+ ${l.char} +`; else if (l.type === 'slow') text = `~ ${l.char} ~`;
        ctx.fillText(text, l.x, l.y);
        ctx.shadowBlur = 0; 
        
        if (l.y > canvas.height + 20) { 
            // If it's my letter that dropped, I lose a life.
            let myId = isHost ? 1 : 2;
            if (gameMode === 'solo' || l.owner === myId) loseLife();
            activeLetters.splice(i, 1); 
            if (lives <= 0) return; 
        }
    }
    requestAnimationFrame(update);
}

// ==========================================
// 6. INPUT HANDLING
// ==========================================
window.addEventListener('keydown', (e) => {
    if (!isPlaying && !isPaused && isHost) {
        if (e.key === 'ArrowLeft') {
            initAudio(); playMenuSelectSound();
            currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
            updateSongDisplays(); bgMusic.src = playlist[currentSongIndex].src; bgMusic.play(); return;
        }
        if (e.key === 'ArrowRight') {
            initAudio(); playMenuSelectSound();
            currentSongIndex = (currentSongIndex + 1) % playlist.length;
            updateSongDisplays(); bgMusic.src = playlist[currentSongIndex].src; bgMusic.play(); return;
        }
        if (e.key === 'Enter') return document.getElementById('start-btn').click();
    }

    if (!isPlaying) return;

    const key = e.key.toUpperCase();
    const myId = isHost ? 1 : 2;
    
    let targetIndex = -1; let maxY = -100;
    for (let i = 0; i < activeLetters.length; i++) {
        // Validate ownership in multiplayer
        if ((gameMode === 'solo' || activeLetters[i].owner === myId) && activeLetters[i].char === key && activeLetters[i].y > maxY) {
            maxY = activeLetters[i].y; targetIndex = i;
        }
    }

    if (targetIndex !== -1) {
        const letter = activeLetters[targetIndex];
        activeLetters.splice(targetIndex, 1);
        
        if (letter.type === 'normal') playHitSound(); else triggerPowerUp(letter);
        
        arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 15); 
        comboCount++;
        if (comboCount > 0 && comboCount % 6 === 0) comboMultiplier++;
        
        createExplosion(letter.x, letter.y, letter.color);
        
        if (letter.type === 'normal') {
            score += 10 * comboMultiplier;
            floatingTexts.push({ text: "+" + (10 * comboMultiplier), x: letter.x, y: letter.y, life: 1.0, size: 16, color: '#fff' });
        }
        targetFallSpeed = Math.min(800, targetFallSpeed + 2); 
        updateUI();

        // Broadcast hit
        if (gameMode !== 'solo') broadcast({ type: 'HIT_LETTER', id: letter.id, score });
    }
});

// ==========================================
// 7. GAME STATE MGMT
// ==========================================
document.getElementById('start-btn').addEventListener('click', () => {
    if (isHost) {
        if (gameMode !== 'solo') broadcast({ type: 'START_GAME', songIndex: currentSongIndex });
        startGameSequence();
    }
});

function startGameSequence() {
    initAudio();
    currentSong = playlist[currentSongIndex];
    trackEl.innerText = currentSong.title;

    let fadeVol = masterGain.gain.value;
    let fadeAudioInterval = setInterval(() => {
        if (fadeVol > 0.05) { fadeVol -= 0.05; masterGain.gain.value = Math.max(fadeVol, 0); } 
        else { masterGain.gain.value = 0; clearInterval(fadeAudioInterval); bgMusic.pause(); }
    }, 100);

    arcadeRoom.classList.add('game-running');
    gameContainer.style.borderColor = '#fff';
    
    if (gameMode === '1v1') tugBar.classList.remove('hidden');

    activeLetters = []; particles = []; floatingTexts = [];
    score = 0; opponentScore = 0; currentRound = 1; comboCount = 0; comboMultiplier = 1; lives = 3;
    arcadeShakeIntensity = 0; slowMoTimer = 0; targetPlaybackRate = 1.0; bgMusic.playbackRate = 1.0;
    targetFallSpeed = 200; currentFallSpeed = 200; beatInterval = 60 / currentSong.bpm; 
    
    startScreen.classList.add('hidden'); 
    
    setTimeout(() => {
        bgMusic.src = currentSong.src;
        bgMusic.currentTime = 0; masterGain.gain.value = 1.0; bgMusic.loop = false; nextSpawnTime = 0.1;
        bgMusic.play().then(() => {
            isPlaying = true; isPaused = false; updateUI(); lastTime = performance.now(); requestAnimationFrame(update);
        });
    }, 2200); 
}

function updateUI() {
    scoreEl.innerText = score; comboEl.innerText = comboCount; multiplierEl.innerText = 'x' + comboMultiplier;
    roundUiEl.innerText = 'ROUND ' + currentRound;
    
    let hearts = ""; for(let i=0; i<lives; i++) hearts += "♥"; livesEl.innerText = hearts;
    
    // Tug of war logic
    if (gameMode === '1v1') {
        const myScore = isHost ? score : opponentScore;
        const opScore = isHost ? opponentScore : score;
        const diff = myScore - opScore;
        
        let percentage = (diff / (MAX_SCORE_DIFF * 2)) * 100 + 50;
        percentage = Math.max(0, Math.min(100, percentage));
        tugP1.style.width = percentage + "%";

        if (diff >= MAX_SCORE_DIFF) triggerWin();
        else if (diff <= -MAX_SCORE_DIFF) loseLife(true); // Instant loss
    }
}

function updateOpponentScore(opScore) {
    opponentScore = opScore; updateUI();
}

function triggerWin() {
    isPlaying = false;
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
        isPlaying = false;
        document.getElementById('game-over-title').innerText = "WASTED";
        document.getElementById('game-over-title').style.color = '#fff';
        gameOverScreen.classList.remove('hidden');
        bgMusic.pause();
    } else {
        slowMoTimer = 2.0; playSlowMoSound();
    }
}

document.getElementById('restart-btn').addEventListener('click', () => {
    window.location.reload();
});

// Audio init wrappers
function playMenuSelectSound() { if (audioCtx) playTone(600, 'square', audioCtx.currentTime, 0.05, 0.2); }
function playCoinSound() { if (audioCtx) { playTone(987.77, 'square', audioCtx.currentTime, 0.08, 0.3); playTone(1318.51, 'square', audioCtx.currentTime + 0.08, 0.4, 0.3); } }
function playTone(f, type, t, dur, vol, dFreq = null) {
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (dFreq) osc.frequency.exponentialRampToValueAtTime(dFreq, t + dur);
    gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t + dur);
}
function playHitSound() { if (audioCtx) playTone(1200, 'square', audioCtx.currentTime, 0.05, 0.15, 800); }
function playDamageSound() { if (audioCtx) { playTone(400, 'square', audioCtx.currentTime, 0.1, 0.3, 300); playTone(200, 'square', audioCtx.currentTime + 0.2, 0.2, 0.3, 100); } }