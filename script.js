function fitArcade() {
    const scaler = document.getElementById('arcade-scaler');
    const scaleX = window.innerWidth / 2200; 
    const scaleY = window.innerHeight / 1300;
    const scale = Math.min(scaleX, scaleY, 1.2);
    scaler.style.transform = `scale(${scale})`;
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
    { title: "Master of Puppets", src: "audio/mop.mp3", bpm: 212 },
    { title: "Super Mario Bros.", src: "audio/smb.mp3", bpm: 130 },
    { title: "Shape Of You", src: "audio/shape.mp3", bpm: 150 },
    { title: "Enter Sandman", src: "audio/sandman.mp3", bpm: 180 },
    { title: "Scourage of Iron", src: "audio/iron.mp3", bpm: 212 },
    { title: "New Divide", src: "audio/divide.mp3", bpm: 130 },
    { title: "Creep", src: "audio/creep.mp3", bpm: 150 },
    { title: "For Whom The Bell Tolls", src: "audio/belltolls.mp3", bpm: 180 }
];

let currentSongIndex = 0;
let bgMusic = new Audio();
bgMusic.crossOrigin = "anonymous";
bgMusic.preservesPitch = false; 

let currentSong = null;
let nextSpawnTime = 0;
let beatInterval = 0;

let audioCtx;
let analyser;
let dataArray;
let audioSource;
let masterGain;

let activeLetters = [];
let particles = [];
let floatingTexts = [];

let score = 0;
let currentRound = 1;
let comboCount = 0;
let comboMultiplier = 1;
let lives = 3;
const MAX_LIVES = 5;

let arcadeShakeIntensity = 0;
let isSplashActive = true;
let isPlaying = false;
let isPaused = false;
let pauseSelectedIndex = 0;

let slowMoTimer = 0;
let targetPlaybackRate = 1.0; 
let targetFallSpeed = 200; 
let currentFallSpeed = 200;
let lastTime = 0;

const comboColors = ['#fff', '#00ffcc', '#ffaa00', '#ff0055', '#b300ff', '#ff0000'];
const shredPhrases = ["NICE!", "BRUTAL!", "SHREDDING!", "UNREAL!", "GODLIKE!"];

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
const leftCab = document.querySelector('.left-cabinet');
const rightCab = document.querySelector('.right-cabinet');

const bgParticles = [];
const NUM_BG_PARTICLES = 300; 

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
    if (!analyser) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    let bassSum = 0;
    let bassCount = Math.floor(dataArray.length / 4); 
    
    for(let i = 0; i < bassCount; i++) {
        bassSum += dataArray[i];
    }
    
    const bassAvg = bassCount > 0 ? (bassSum / bassCount) : 0; 
    const reaction = bassAvg / 255;
    
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    const cx = bgCanvas.width / 2;
    const cy = bgCanvas.height / 2;
    const maxRadius = Math.max(cx, cy) * 1.2;
    const auraRadius = reaction * maxRadius + 150;
    const hue = (bassAvg * 1.5) % 360;
    
    const gradient = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, auraRadius);
    gradient.addColorStop(0, `hsla(${hue}, 90%, 50%, ${0.1 + reaction * 0.2})`);
    gradient.addColorStop(1, `hsla(${hue}, 80%, 10%, 0)`);
    
    bgCtx.fillStyle = gradient;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    
    let dynamicBrightness = 0.65 + reaction * 0.5; 
    leftCab.style.filter = `hue-rotate(${hue}deg) brightness(${dynamicBrightness}) contrast(1.2)`;
    rightCab.style.filter = `hue-rotate(${hue}deg) brightness(${dynamicBrightness}) contrast(1.2)`;
    
    const cabGlow = `0 40px 100px rgba(0,0,0,1), 0 0 ${50 + reaction * 250}px hsla(${hue}, 100%, 60%, ${reaction * 0.8})`;
    leftCab.style.boxShadow = cabGlow;
    rightCab.style.boxShadow = cabGlow;

    const centerCabParts = arcadeCabinet.querySelectorAll('.chameleon-part');
    if (slowMoTimer > 0) {
        centerCabParts.forEach(p => {
            p.style.animation = 'none'; 
            p.style.filter = `hue-rotate(${hue}deg) brightness(${0.5 + reaction * 2.0}) saturate(${1 + reaction}) drop-shadow(0 0 ${20 + reaction * 80}px hsla(${hue}, 100%, 50%, ${0.5 + reaction * 0.5}))`;
        });
    } else {
        centerCabParts.forEach(p => {
            if (p.style.animation === 'none') {
                p.style.animation = ''; 
                p.style.filter = '';
            }
        });
    }

    for (let p of bgParticles) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        const outSpeed = 0.02 + reaction * 4; 
        p.x += nx * outSpeed;
        p.y += ny * outSpeed;

        const jitter = 0.2 + reaction * 1.5;
        p.x += (Math.random() - 0.5) * jitter;
        p.y += (Math.random() - 0.5) * jitter;
        
        if (p.x < 0 || p.x > bgCanvas.width || p.y < 0 || p.y > bgCanvas.height) {
            p.x = cx + (Math.random() - 0.5) * 200;
            p.y = cy + (Math.random() - 0.5) * 200;
        }
        
        const size = p.baseSize * (1 + reaction * 1.5);
        bgCtx.fillStyle = `hsla(${(hue + p.hueOffset) % 360}, 90%, ${50 + reaction * 40}%, ${0.3 + reaction * 0.7})`;
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, size, 0, Math.PI * 2);
        bgCtx.fill();
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

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!masterGain) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        masterGain = audioCtx.createGain(); 
        
        audioSource = audioCtx.createMediaElementSource(bgMusic);
        audioSource.connect(analyser); 
        analyser.connect(masterGain);  
        masterGain.connect(audioCtx.destination); 
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        drawBackground();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playMenuSelectSound() {
    if (!audioCtx) return;
    playTone(600, 'square', audioCtx.currentTime, 0.05, 0.2);
}

function playCoinSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(987.77, 'square', t, 0.08, 0.3);
    playTone(1318.51, 'square', t + 0.08, 0.4, 0.3);
}

function playTone(freq, type, time, duration, vol, dropFreq = null) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, time);
    if (dropFreq) osc.frequency.exponentialRampToValueAtTime(dropFreq, time + duration);
    gain.gain.setValueAtTime(vol, time); gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(time); osc.stop(time + duration);
}

function playNoise(time, duration, vol) {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer;
    const gain = audioCtx.createGain(); gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    noise.connect(gain); gain.connect(audioCtx.destination);
    noise.start(time);
}

function playHitSound() {
    if (!audioCtx) return;
    const time = audioCtx.currentTime;
    const sfxType = Math.floor(Math.random() * 3); 
    switch(sfxType) {
        case 0: 
            playTone(1200, 'square', time, 0.05, 0.15, 800); 
            break;
        case 1: 
            playTone(1500, 'square', time, 0.08, 0.1, 400); 
            playNoise(time, 0.02, 0.1); 
            break;
        case 2: 
            playTone(800, 'square', time, 0.05, 0.1); 
            playTone(1200, 'square', time + 0.05, 0.05, 0.15); 
            break;
    }
}

function play1UPSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(523.25, 'square', t, 0.1, 0.3); playTone(659.25, 'square', t + 0.1, 0.1, 0.3); playTone(783.99, 'square', t + 0.2, 0.3, 0.3); 
}

function playNukeSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    
    playTone(440, 'sine', t, 0.4, 0.2, 880);
    playTone(554.37, 'sine', t + 0.1, 0.4, 0.2, 1108.73);
    playTone(659.25, 'sine', t + 0.2, 0.4, 0.2, 1318.51);
    playTone(880, 'sine', t + 0.3, 0.6, 0.3, 1760);
    
    playTone(220, 'triangle', t, 1.0, 0.2, 110);
    playTone(330, 'triangle', t, 1.0, 0.2, 165);
}

function playSlowMoSound() { if (!audioCtx) return; playTone(800, 'sine', audioCtx.currentTime, 1.0, 0.5, 100); }

function playDamageSound() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(400, 'square', t, 0.1, 0.3, 300); 
    playTone(300, 'square', t + 0.1, 0.1, 0.3, 200);
    playTone(200, 'square', t + 0.2, 0.2, 0.3, 100);
}

function spawnLetter() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const char = chars[Math.floor(Math.random() * chars.length)];
    const x = Math.random() * (canvas.width - 120) + 60; 
    
    let type = 'normal';
    let color = comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)];
    
    if (Math.random() < 0.12) {
        const roll = Math.random();
        if (roll < 0.33) { type = '1up'; color = '#0f0'; }
        else if (roll < 0.66) { type = 'slow'; color = '#0ff'; }
        else { type = 'nuke'; color = '#ff4400'; }
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
        floatingTexts.push({ text: "1-UP!", x: letter.x, y: letter.y, life: 1.5, size: 20, color: '#0f0' });
    } 
    else if (letter.type === 'nuke') {
        arcadeShakeIntensity = 80; playNukeSound();
        arcadeCabinet.classList.add('flash-nuke');
        setTimeout(() => arcadeCabinet.classList.remove('flash-nuke'), 500);
        let pointsGained = 0;
        
        let explosionsCount = 0;
        for (let i = activeLetters.length - 1; i >= 0; i--) {
            let l = activeLetters[i]; 
            if (explosionsCount < 8) {
                createExplosion(l.x, l.y, l.color, 1.5);
                explosionsCount++;
            }
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

function updatePauseMenuUI() {
    if (pauseSelectedIndex === 0) {
        resumeBtn.classList.add('selected-btn');
        quitBtn.classList.remove('selected-btn');
    } else {
        resumeBtn.classList.remove('selected-btn');
        quitBtn.classList.add('selected-btn');
    }
}

function togglePause() {
    if (!isPlaying) return;
    isPaused = !isPaused;
    if (isPaused) {
        bgMusic.pause();
        pauseSelectedIndex = 0;
        updatePauseMenuUI();
        pauseScreen.classList.remove('hidden');
    } else {
        pauseScreen.classList.add('hidden');
        requestAnimationFrame((t) => {
            lastTime = t; bgMusic.play(); requestAnimationFrame(update);
        });
    }
}

function quitGame() {
    isPaused = false; isPlaying = false;
    
    arcadeRoom.classList.remove('game-running');
    pauseScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    
    gameContainer.classList.remove('danger-state');
    arcadeCabinet.style.transform = ''; 
    arcadeCabinet.classList.remove('slow-mo-active');
    gameContainer.style.backgroundColor = '#000';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    bgMusic.loop = true;
    bgMusic.play().catch(console.error);
}

function handleInput(e) {
    if (isSplashActive) {
        if (e.key === 'Enter') {
            isSplashActive = false;
            
            introScreen.classList.add('hidden');
            startScreen.classList.remove('hidden');
            arcadeRoom.classList.remove('zoomed-in-view');
            
            initAudio(); 
            
            const startFadeInMenu = () => {
                playMenuSelectSound();
                currentSongIndex = Math.floor(Math.random() * playlist.length);
                updateSongDisplays();
                
                bgMusic.src = playlist[currentSongIndex].src;
                masterGain.gain.value = 0; 
                bgMusic.loop = true;
                
                bgMusic.play().then(() => {
                    let fadeVol = 0;
                    let fadeInInterval = setInterval(() => {
                        fadeVol += 0.02; 
                        if (fadeVol >= 0.4) {
                            masterGain.gain.value = 0.4; 
                            clearInterval(fadeInInterval);
                        } else {
                            masterGain.gain.value = fadeVol;
                        }
                    }, 100);
                }).catch(console.error);
            };

            if (audioCtx.state === 'suspended') {
                audioCtx.resume().then(startFadeInMenu);
            } else {
                startFadeInMenu();
            }
        }
        return; 
    }

    if (!isPlaying && !isPaused) {
        if (e.key === 'ArrowLeft') {
            initAudio(); playMenuSelectSound();
            currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
            updateSongDisplays();
            bgMusic.src = playlist[currentSongIndex].src;
            bgMusic.play().catch(console.error);
            return;
        }
        if (e.key === 'ArrowRight') {
            initAudio(); playMenuSelectSound();
            currentSongIndex = (currentSongIndex + 1) % playlist.length;
            updateSongDisplays();
            bgMusic.src = playlist[currentSongIndex].src;
            bgMusic.play().catch(console.error);
            return;
        }
        if (e.key === 'Enter') {
            startGame();
            return;
        }
    }

    if (e.key === 'Escape') {
        if (isPlaying) togglePause();
        return;
    }

    if (isPaused) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            pauseSelectedIndex = 0;
            playMenuSelectSound();
            updatePauseMenuUI();
            e.preventDefault();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            pauseSelectedIndex = 1;
            playMenuSelectSound();
            updatePauseMenuUI();
            e.preventDefault();
        } else if (e.key === 'Enter') {
            if (pauseSelectedIndex === 0) togglePause();
            else quitGame();
        }
        return;
    }

    if (!isPlaying) return;

    const key = e.key.toUpperCase();
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
        
        arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 15); 
        comboCount++;
        
        if (comboCount > 0 && comboCount % 6 === 0) {
            comboMultiplier++;
            arcadeShakeIntensity = Math.max(arcadeShakeIntensity, 50); 
            arcadeCabinet.classList.add('flash-combo');
            setTimeout(() => arcadeCabinet.classList.remove('flash-combo'), 150);
            
            const phraseIndex = Math.min(comboMultiplier - 2, shredPhrases.length - 1);
            const currentColor = comboColors[Math.min(comboMultiplier - 1, comboColors.length - 1)];
            floatingTexts.push({
                text: shredPhrases[phraseIndex] + " x" + comboMultiplier,
                x: canvas.width / 2, y: canvas.height / 2 + (Math.random() - 0.5) * 50,
                life: 1.5, size: 40, color: currentColor
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
    arcadeShakeIntensity = 60; playDamageSound();
    
    gameContainer.classList.add('damage-flicker');
    setTimeout(() => gameContainer.classList.remove('damage-flicker'), 400);
    
    updateUI();
    
    if (lives <= 0) {
        gameOver();
    } else {
        slowMoTimer = 2.0; 
        playSlowMoSound();
    }
}

function gameOver() {
    isPlaying = false; finalScoreEl.innerText = score;
    gameContainer.classList.remove('danger-state'); 
    gameOverScreen.classList.remove('hidden');
    
    bgMusic.pause();
    bgMusic.currentTime = 0;
    bgMusic.loop = false;
    
    arcadeRoom.classList.remove('game-running');
    arcadeCabinet.style.transform = '';
    arcadeCabinet.classList.remove('slow-mo-active');
    
    gameContainer.style.backgroundColor = '#600000';
    gameContainer.style.borderColor = '#ff0000';
    gameContainer.style.boxShadow = '0 0 40px #ff0000 inset, 0 0 60px #ff0000';
    
    playTone(100, 'sawtooth', audioCtx.currentTime, 0.8, 0.5, 10); 
    playNoise(audioCtx.currentTime, 0.8, 0.5);
}

function update(time) {
    if (!isPlaying || isPaused) return;
    const dt = (time - lastTime) / 1000; lastTime = time;

    if (score >= 2000 && currentRound === 1) {
        currentRound = 2; targetPlaybackRate = 1.05; targetFallSpeed += 30;
        floatingTexts.push({ text: "ROUND 2: SPEED UP", x: canvas.width/2, y: canvas.height/2, life: 2.5, size: 40, color: '#ff0055' }); updateUI();
    } else if (score >= 4000 && currentRound === 2) {
        currentRound = 3; targetPlaybackRate = 1.10; targetFallSpeed += 30;
        floatingTexts.push({ text: "ROUND 3: MAXIMUM OVERKILL", x: canvas.width/2, y: canvas.height/2, life: 2.5, size: 40, color: '#ff0000' }); updateUI();
    }

    if (slowMoTimer > 0) {
        slowMoTimer -= dt; currentFallSpeed = targetFallSpeed * 0.4; bgMusic.playbackRate = 0.6; 
        arcadeCabinet.classList.add('slow-mo-active');
        if (slowMoTimer <= 0) { 
            currentFallSpeed = targetFallSpeed; bgMusic.playbackRate = targetPlaybackRate; 
            arcadeCabinet.classList.remove('slow-mo-active');
        }
    } else {
        currentFallSpeed = targetFallSpeed; bgMusic.playbackRate = targetPlaybackRate;
        arcadeCabinet.classList.remove('slow-mo-active');
    }

    if (arcadeShakeIntensity > 0.5) {
        const dx = (Math.random() - 0.5) * arcadeShakeIntensity;
        const dy = (Math.random() - 0.5) * arcadeShakeIntensity;
        arcadeCabinet.style.transform = `translate3d(${dx}px, ${94 + dy}px, 1380px)`;
        arcadeShakeIntensity *= 0.85; 
    } else {
        arcadeCabinet.style.transform = `translate3d(0px, 94px, 1380px)`;
    }

    if (bgMusic.currentTime >= nextSpawnTime && bgMusic.currentTime > 0) {
        spawnLetter();
        let activeInterval = beatInterval * 2; 
        if (currentRound === 2) activeInterval = beatInterval * 1.5; 
        if (currentRound === 3) activeInterval = beatInterval * 1.2; 
        nextSpawnTime = bgMusic.currentTime + activeInterval; 
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
            ctx.globalAlpha = Math.min(1.0, ft.life); ctx.fillStyle = ft.color;
            ctx.font = ft.size + 'px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.fillText(ft.text, ft.x, ft.y);
        }
    }
    ctx.globalAlpha = 1.0;

    ctx.font = '24px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = activeLetters.length - 1; i >= 0; i--) {
        let l = activeLetters[i]; l.y += currentFallSpeed * dt;
        let drawX = l.x; if (currentFallSpeed > 400 && slowMoTimer <= 0) drawX += (Math.random() - 0.5) * 6; 
        
        ctx.fillStyle = l.color;
        if (l.type !== 'normal') { ctx.shadowBlur = 15; ctx.shadowColor = l.color; } else { ctx.shadowBlur = 0; }
        if (l.type === 'nuke') ctx.fillText(`[ ${l.char} ]`, drawX, l.y);
        else if (l.type === '1up') ctx.fillText(`+ ${l.char} +`, drawX, l.y);
        else if (l.type === 'slow') ctx.fillText(`~ ${l.char} ~`, drawX, l.y);
        else ctx.fillText(l.char, drawX, l.y);
        ctx.shadowBlur = 0; 
        
        if (l.y > canvas.height + 20) { activeLetters.splice(i, 1); loseLife(); if (lives <= 0) return; }
    }
    requestAnimationFrame(update);
}

function startGame() {
    initAudio();
    playCoinSound();
    
    currentSong = playlist[currentSongIndex];
    trackEl.innerText = currentSong.title;

    let fadeVol = masterGain.gain.value;
    let fadeAudioInterval = setInterval(() => {
        if (fadeVol > 0.05) {
            fadeVol -= 0.05;
            masterGain.gain.value = Math.max(fadeVol, 0); 
        } else {
            masterGain.gain.value = 0;
            clearInterval(fadeAudioInterval);
            bgMusic.pause();
        }
    }, 100);

    arcadeRoom.classList.add('game-running');
    
    gameContainer.style.backgroundColor = '#000'; 
    gameContainer.style.borderColor = '#fff';
    gameContainer.style.boxShadow = '0 0 20px #fff';

    activeLetters = []; particles = []; floatingTexts = [];
    score = 0; currentRound = 1; comboCount = 0; comboMultiplier = 1; lives = 3;
    
    arcadeShakeIntensity = 0; slowMoTimer = 0; targetPlaybackRate = 1.0; bgMusic.playbackRate = 1.0;
    targetFallSpeed = 200; currentFallSpeed = 200; beatInterval = 60 / currentSong.bpm; 
    
    startScreen.classList.add('hidden'); 
    gameOverScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    
    setTimeout(() => {
        bgMusic.src = currentSong.src;
        bgMusic.currentTime = 0;
        masterGain.gain.value = 1.0; 
        bgMusic.loop = false;
        nextSpawnTime = 0.1;
        
        bgMusic.play().then(() => {
            isPlaying = true; 
            isPaused = false; 
            updateUI();
            arcadeCabinet.classList.remove('slow-mo-active');
            lastTime = performance.now();
            requestAnimationFrame(update);
        }).catch(e => {
            console.error("Audio playback failed:", e);
            alert(`AUDIO ERROR: Could not load "${currentSong.src}".\n\nEnsure audio files are present.`);
            startScreen.classList.remove('hidden'); isPlaying = false;
            arcadeRoom.classList.remove('game-running');
        });
    }, 2200); 
}

window.addEventListener('load', () => {
    window.addEventListener('click', () => {
        initAudio();
    }, { once: true });
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('quit-btn').addEventListener('click', quitGame);