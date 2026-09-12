let isSplashActive = true;
let isPlaying = false;
let isPaused = false;


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

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const arcadeCabinet = document.getElementById('arcade-cabinet'); 
const arcadeRoom = document.getElementById('arcade-room');

const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives-container');
const comboEl = document.getElementById('combo');
const multiplierEl = document.getElementById('multiplier');
const roundUiEl = document.getElementById('round-ui');
const comboContainer = document.getElementById('combo-container');
const trackEl = document.getElementById('current-track');

const introScreen = document.getElementById('intro-screen');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');

const resumeBtn = document.getElementById('resume-btn');
const quitBtn = document.getElementById('quit-btn');

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

let activeLetters = [];
let particles = [];
let floatingTexts = [];

let score = 0;
let currentRound = 1;
let comboCount = 0;
let comboMultiplier = 1;
let lives = 3;
const MAX_LIVES = 5;

let lettersSpawnedCount = 0;
let powerUpCooldown = 0;

let arcadeShakeIntensity = 0;
let pauseSelectedIndex = 0;

let slowMoTimer = 0;
let targetFallSpeed = 200; 
let currentFallSpeed = 200;
let beatInterval = 0;
let nextSpawnTime = 0;
let lastTime = 0;

const comboColors = ['#ffffff', '#00f3ff', '#ffe600', '#ff0055', '#b300ff', '#ff0033'];
const shredPhrases = ["NICE!", "BRUTAL!", "SHREDDING!", "UNREAL!", "GODLIKE!"];

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const leftCab = document.querySelector('.left-cabinet');
const rightCab = document.querySelector('.right-cabinet');

const bgParticles = [];
const NUM_BG_PARTICLES = 250; 

function resizeBackground() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    bgParticles.length = 0;
    for(let i=0; i<NUM_BG_PARTICLES; i++) {
        bgParticles.push({
            x: Math.random() * bgCanvas.width, 
            y: Math.random() * bgCanvas.height,
            baseSize: Math.random() * 1.5 + 0.5, 
            hueOffset: Math.random() * 60 - 30
        });
    }
}
window.addEventListener('resize', resizeBackground);
resizeBackground();

function drawBackground() {
    requestAnimationFrame(drawBackground);
    
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    let reaction = 0;
    let hue = 280;

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
    
    const cabGlowLeft = `0 40px 100px rgba(0,0,0,1), 0 0 ${40 + reaction * 220}px rgba(0, 243, 255, ${0.5 + reaction * 0.5})`;
    const cabGlowRight = `0 40px 100px rgba(0,0,0,1), 0 0 ${40 + reaction * 220}px rgba(255, 230, 0, ${0.5 + reaction * 0.5})`;
    leftCab.style.boxShadow = cabGlowLeft;
    rightCab.style.boxShadow = cabGlowRight;

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

        const barHue = (hue + i * 10) % 360;
        bgCtx.fillStyle = `hsla(${barHue}, 90%, 55%, 0.25)`;
        bgCtx.fillRect(i * barWidth, bgCanvas.height - barHeight, barWidth - 4, barHeight);
    }

    for (let p of bgParticles) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        p.x += nx * (0.02 + reaction * 4);
        p.y += ny * (0.02 + reaction * 4);
        
        if (p.x < 0 || p.x > bgCanvas.width || p.y < 0 || p.y > bgCanvas.height) {
            p.x = cx + (Math.random() - 0.5) * 200;
            p.y = cy + (Math.random() - 0.5) * 200;
        }
        
        bgCtx.fillStyle = `hsla(${(hue + p.hueOffset) % 360}, 90%, ${50 + reaction * 40}%, ${0.3 + reaction * 0.7})`;
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, p.baseSize * (1 + reaction * 1.5), 0, Math.PI * 2);
        bgCtx.fill();
    }
}

drawBackground();

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
        console.warn("Audio Context init deferred:", err);
    }
}



let currentTrackAudio = new Audio();
let trackSource = null;

function startSynthEngine() {
    isMusicPlaying = true;
    
    currentTrackAudio.src = playlist[currentSongIndex].path;
    currentTrackAudio.play();

    // Route the standard audio element into the existing Web Audio context for the visualizer
    if (audioCtx && !trackSource) {
        trackSource = audioCtx.createMediaElementSource(currentTrackAudio);
        trackSource.connect(masterGain);
    }

    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(() => {
        if (!isMusicPlaying || isPaused || !audioCtx) {
            currentTrackAudio.pause();
            return;
        } else if (currentTrackAudio.paused) {
            currentTrackAudio.play();
        }
        
        // Sync the game's spawn logic with the actual audio track time
        songTime = currentTrackAudio.currentTime; 
    }, 100);
}

function stopSynthEngine() {
    isMusicPlaying = false;
    currentTrackAudio.pause();
    currentTrackAudio.currentTime = 0;
    if (musicTimer) clearInterval(musicTimer);
}


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
    playTone(440, 'sine', t, 0.4, 0.2, 880);
    playTone(220, 'triangle', t, 1.0, 0.2, 110);
}
function playSlowMoSound() { if (audioCtx) playTone(800, 'sine', audioCtx.currentTime, 1.0, 0.5, 100); }
function playDamageSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(400, 'square', t, 0.1, 0.3, 300); 
    playTone(200, 'square', t + 0.2, 0.2, 0.3, 100);
}

const centerButtons = document.querySelectorAll('.center-cabinet .action-button');
const centerJoystickBall = document.querySelector('.center-cabinet .joystick-ball');

function animateHardwareDeck(char) {
    if (centerJoystickBall) {
        const offset = ((char.charCodeAt(0) - 65) % 3) - 1;
        centerJoystickBall.style.transform = `translate(${offset * 14}px, -4px) scale(0.95)`;
        centerJoystickBall.style.webkitTransform = `translate(${offset * 14}px, -4px) scale(0.95)`;
        setTimeout(() => { 
            centerJoystickBall.style.transform = ''; 
            centerJoystickBall.style.webkitTransform = ''; 
        }, 110);
    }
    if (centerButtons.length > 0) {
        const btn = centerButtons[Math.floor(Math.random() * centerButtons.length)];
        btn.style.transform = 'translateY(6px)';
        btn.style.filter = 'brightness(2.2)';
        setTimeout(() => { btn.style.transform = ''; btn.style.filter = ''; }, 90);
    }
}

function updateSongDisplays() {
    const len = playlist.length;
    const prevIndex = (currentSongIndex - 1 + len) % len;
    const nextIndex = (currentSongIndex + 1) % len;
    document.getElementById('left-screen-title').innerText = playlist[prevIndex].title;
    document.getElementById('right-screen-title').innerText = playlist[nextIndex].title;
    document.getElementById('center-song-title').innerText = `◀ ${playlist[currentSongIndex].title} ▶`;
}
updateSongDisplays();

function spawnLetter() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const char = chars[Math.floor(Math.random() * chars.length)];
    const x = Math.random() * (canvas.width - 120) + 60; 
    
    let type = 'normal';
    let color = comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)];
    
    lettersSpawnedCount++;
    if (powerUpCooldown > 0) powerUpCooldown--;

    if (lettersSpawnedCount >= 7 && powerUpCooldown === 0 && Math.random() < 0.15) {
        const roll = Math.random();
        if (roll < 0.33) { type = '1up'; color = '#0f0'; }
        else if (roll < 0.66) { type = 'slow'; color = '#0ff'; }
        else { type = 'nuke'; color = '#ff4400'; }
        
        powerUpCooldown = 5; 
    }
    activeLetters.push({ char, x, y: -30, color, type });
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

function updatePauseMenuUI() {
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
    isPaused = false; isPlaying = false; stopSynthEngine();
    arcadeRoom.classList.remove('game-running');
    pauseScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    gameContainer.classList.remove('danger-state');
    arcadeCabinet.style.transform = ''; 
    arcadeCabinet.style.webkitTransform = ''; 
    gameContainer.style.backgroundColor = '#000';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isSplashActive = true;
    arcadeRoom.classList.add('zoomed-in-view');
    fitArcade();
}

function handleInput(e) {
    if (isSplashActive) {
        if (e.key === 'Enter') {
            initAudio();
            startSynthEngine();
            isSplashActive = false;
            introScreen.classList.add('hidden');
            startScreen.classList.remove('hidden');
            
            arcadeRoom.classList.remove('zoomed-in-view');
            fitArcade();
            playMenuSelectSound();
        }
        return; 
    }

    if (!isPlaying && !isPaused) {
        if (e.key === 'ArrowLeft') {
            initAudio(); playMenuSelectSound();
            currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
            updateSongDisplays();
            startSynthEngine();
            return;
        }
        if (e.key === 'ArrowRight') {
            initAudio(); playMenuSelectSound();
            currentSongIndex = (currentSongIndex + 1) % playlist.length;
            updateSongDisplays();
            startSynthEngine();
            return;
        }
        if (e.key === 'Enter') { startGame(); return; }
    }

    if (e.key === 'Escape') { if (isPlaying) togglePause(); return; }

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

    const key = e.key.toUpperCase();
    animateHardwareDeck(key);

    let targetIndex = -1; let maxY = -100;
    for (let i = 0; i < activeLetters.length; i++) {
        if (activeLetters[i].char === key && activeLetters[i].y > maxY) {
            maxY = activeLetters[i].y; targetIndex = i;
        }
    }

    if (targetIndex !== -1) {
        const letter = activeLetters[targetIndex];
        activeLetters.splice(targetIndex, 1);
        
        if (letter.type === 'normal') playHitSound(); else triggerPowerUp(letter);
        
        arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 10); 
        comboCount++;
        
        const judgement = (letter.y > canvas.height * 0.75) ? "PERFECT!" : "GREAT!";
        floatingTexts.push({
            text: judgement,
            x: letter.x,
            y: letter.y - 30,
            life: 0.8,
            size: 14,
            color: (judgement === "PERFECT!") ? '#ffe600' : '#00f3ff'
        });

        if (comboCount > 0 && comboCount % 6 === 0) {
            comboMultiplier++;
            arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 30); 
            arcadeCabinet.classList.add('flash-combo');
            setTimeout(() => arcadeCabinet.classList.remove('flash-combo'), 150);
            
            const phraseIndex = Math.min(comboMultiplier - 2, shredPhrases.length - 1);
            const currentColor = comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)];
            floatingTexts.push({
                text: shredPhrases[phraseIndex] + " x" + comboMultiplier,
                x: canvas.width / 2, y: canvas.height / 2 + (Math.random() - 0.5) * 50,
                life: 1.5, size: 36, color: currentColor
            });
        }
        createExplosion(letter.x, letter.y, letter.color);
        
        if (letter.type === 'normal') {
            score += 10 * comboMultiplier;
            floatingTexts.push({ text: "+" + (10 * comboMultiplier), x: letter.x, y: letter.y, life: 1.0, size: 16, color: '#fff' });
        }
        targetFallSpeed = Math.min(800, targetFallSpeed + 2); updateUI();
    }
}
window.addEventListener('keydown', handleInput);

function updateUI() {
    scoreEl.innerText = score; comboEl.innerText = comboCount; multiplierEl.innerText = 'x' + comboMultiplier;
    roundUiEl.innerText = 'ROUND ' + currentRound;
    
    let hearts = ""; for(let i=0; i<lives; i++) hearts += "♥"; livesEl.innerText = hearts;
    if (lives === 1) gameContainer.classList.add('danger-state'); else gameContainer.classList.remove('danger-state');
    
    const colorIndex = Math.min(comboMultiplier - 1, comboColors.length - 1);
    const currentColor = comboColors[colorIndex];
    comboContainer.style.color = currentColor;
    if(lives > 1) { 
        gameContainer.style.borderColor = currentColor;
        gameContainer.style.boxShadow = `0 0 ${10 + (comboMultiplier * 15)}px ${currentColor}`;
    }
}

function loseLife() {
    lives--; comboCount = 0; comboMultiplier = 1;
    arcadeShakeIntensity = 35; playDamageSound();
    gameContainer.classList.add('damage-flicker');
    setTimeout(() => gameContainer.classList.remove('damage-flicker'), 400);
    updateUI();
    if (lives <= 0) gameOver();
    else { slowMoTimer = 2.0; playSlowMoSound(); }
}

function gameOver() {
    isPlaying = false; stopSynthEngine();
    finalScoreEl.innerText = score;
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

function update(time) {
    if (!isPlaying || isPaused) return;
    const dt = (time - lastTime) / 1000; lastTime = time;

    if (score >= 2000 && currentRound === 1) {
        currentRound = 2; targetFallSpeed += 30;
        floatingTexts.push({ text: "ROUND 2: SPEED UP", x: canvas.width/2, y: canvas.height/2, life: 2.5, size: 36, color: '#ff0055' }); updateUI();
    } else if (score >= 4000 && currentRound === 2) {
        currentRound = 3; targetFallSpeed += 30;
        floatingTexts.push({ text: "ROUND 3: MAXIMUM OVERKILL", x: canvas.width/2, y: canvas.height/2, life: 2.5, size: 36, color: '#ff0000' }); updateUI();
    }

    if (slowMoTimer > 0) {
        slowMoTimer -= dt; currentFallSpeed = targetFallSpeed * 0.4;
    } else {
        currentFallSpeed = targetFallSpeed;
    }

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

    if (songTime >= nextSpawnTime) {
        spawnLetter();
        let activeInterval = beatInterval * 2; 
        if (currentRound === 2) activeInterval = beatInterval * 1.5; 
        if (currentRound === 3) activeInterval = beatInterval * 1.2; 
        nextSpawnTime = songTime + activeInterval; 
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (comboMultiplier >= 3 && Math.random() > 0.85) {
        ctx.fillStyle = comboColors[Math.floor(Math.random() * comboColors.length)];
        ctx.globalAlpha = 0.15; ctx.fillRect(0, Math.random() * canvas.height, canvas.width, Math.random() * 80);
        ctx.globalAlpha = 1.0;
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

    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = activeLetters.length - 1; i >= 0; i--) {
        let l = activeLetters[i]; l.y += currentFallSpeed * dt;
        let drawX = l.x; if (currentFallSpeed > 400 && slowMoTimer <= 0) drawX += (Math.random() - 0.5) * 6; 
        
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
        
        if (l.y > canvas.height + 20) { 
            floatingTexts.push({ text: "MISS", x: l.x, y: canvas.height - 30, life: 0.8, size: 16, color: '#ff0033' });
            activeLetters.splice(i, 1); 
            loseLife(); 
            if (lives <= 0) return; 
        }
    }
    requestAnimationFrame(update);
}

function startGame() {
    initAudio(); playCoinSound();
    const currentSong = playlist[currentSongIndex];
    trackEl.innerText = currentSong.title;

    arcadeRoom.classList.add('game-running');
    gameContainer.style.backgroundColor = '#000'; 
    gameContainer.style.borderColor = '#fff';
    gameContainer.style.boxShadow = '0 0 20px #fff';

    activeLetters = []; particles = []; floatingTexts = [];
    score = 0; currentRound = 1; comboCount = 0; comboMultiplier = 1; lives = 3;
    lettersSpawnedCount = 0; powerUpCooldown = 0;
    arcadeShakeIntensity = 0; slowMoTimer = 0;
    targetFallSpeed = 200; currentFallSpeed = 200; 
    beatInterval = 60 / currentSong.bpm; 
    nextSpawnTime = 0.5;

    startScreen.classList.add('hidden'); 
    gameOverScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    
    setTimeout(() => {
        startSynthEngine();
        isPlaying = true; isPaused = false;
        updateUI();
        lastTime = performance.now();
        requestAnimationFrame(update);
    }, 1800);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('quit-btn').addEventListener('click', quitGame);
