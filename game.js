const player = document.getElementById("player");
const game = document.getElementById("game");
const gameWrapper = document.getElementById("gameWrapper");
const scoreDisplay = document.getElementById("score");
const highScoreDisplay = document.getElementById("highscore");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverScore = document.getElementById("gameOverScore");
const gameOverTitle = document.getElementById("gameOverTitle");
const topRunsList = document.getElementById("topRunsList");
const nearMissEl = document.getElementById("nearMiss");
const sprintTimerEl = document.getElementById("sprintTimer");
const startScreen = document.getElementById("startScreen");
const statsScreen = document.getElementById("statsScreen");
const statsBody = document.getElementById("statsBody");


// ===============================
// PLAYER
// ===============================

let playerX = 185;
const playerSpeed = 6;

let moveLeft = false;
let moveRight = false;


// ===============================
// GAME
// ===============================

let score = 0;
let gameRunning = false;   // true only while actively playing
let gameStarted = false;   // becomes true once a mode is picked (stays true after game-over)
let gamePaused = false;

let highScore = Number(localStorage.getItem("neonDodgeHighScore")) || 0;
highScoreDisplay.textContent = "Best: " + highScore;

// Difficulty ramps up the longer you survive
let startTime = Date.now();
let difficulty = 1;

// Combo: consecutive dodges raise your score multiplier
let comboCount = 0;
let comboMultiplier = 1;
const comboDisplay = document.getElementById("combo");

// Power-up state
let hasShield = false;
let slowMoFactor = 1; // 1 = normal speed, 0.5 = slow-mo active
let slowMoTimeoutId = null;
const slowmoOverlay = document.getElementById("slowmoOverlay");

let magnetActive = false;
let magnetTimeoutId = null;

let scoreMultiplierActive = false;
let scoreMultiplierTimeoutId = null;


// ===============================
// GAME MODE / DIFFICULTY SELECT
// ===============================

let gameMode = "normal"; // "easy" | "normal" | "hard" | "sprint"

const modeSpeedMultiplier = {
    easy: 0.7,
    normal: 1,
    hard: 1.35,
    sprint: 1
};

const SPRINT_DURATION = 60; // seconds
let sprintTimeLeft = SPRINT_DURATION;
let sprintIntervalId = null;

document.querySelectorAll(".mode-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
        getAudioCtx();
        resumeMusicIfPending();
        gameMode = btn.dataset.mode;
        startScreen.classList.remove("visible");
        beginRun();
    });
});


// ===============================
// SOUND (Web Audio API - no files needed)
// ===============================

let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playTone(freq, duration, type) {

    const ctx = getAudioCtx();

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type || "sine";
    oscillator.frequency.value = freq;

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
}

function playDodgeSound() {
    playTone(880, 0.08, "sine");
}

function playCrashSound() {
    playTone(120, 0.4, "sawtooth");
}

function playPowerUpSound() {
    playTone(660, 0.12, "triangle");
    setTimeout(function() { playTone(990, 0.15, "triangle"); }, 90);
}

function playShieldBreakSound() {
    playTone(440, 0.2, "square");
}

function playComboSound() {
    playTone(1320, 0.1, "sine");
}

function playNearMissSound() {
    playTone(1760, 0.05, "sine");
}

function playMultiplierSound() {
    playTone(520, 0.1, "sawtooth");
    setTimeout(function() { playTone(780, 0.14, "sawtooth"); }, 80);
}


// ===============================
// BACKGROUND MUSIC (procedural, multiple tracks)
// ===============================
// Every track is generated live with the Web Audio API - no audio files
// to source or host. Clicking the music button cycles: Off -> Chill ->
// Synthwave -> Ambient -> Off, each with its own chords, tempo, and tone.

let musicGainNode = null;
let musicFilterNode = null;
let musicPlaying = false;
let musicTimeoutId = null;
let chordIndex = 0;

// currentTrackIndex: -1 means off, otherwise an index into musicTracks
// Restored from localStorage so the player's last-picked track persists
// across reloads. Browsers block audio before a user gesture, so we only
// mark it "pending" here and actually start it on the first keypress/touch.
let currentTrackIndex = Number(localStorage.getItem("neonDodgeMusicTrack"));
if (isNaN(currentTrackIndex) || currentTrackIndex < -1) {
    currentTrackIndex = -1;
}
let pendingMusicResume = currentTrackIndex !== -1;

const musicTracks = [
    {
        name: "Chill",
        icon: "🎵",
        chordDuration: 4.5,
        filterFreq: 1000,
        chords: [
            [220.00, 261.63, 329.63, 392.00], // Am7
            [174.61, 220.00, 261.63, 349.23], // Fmaj7
            [130.81, 164.81, 196.00, 261.63], // Cmaj7
            [196.00, 246.94, 293.66, 392.00]  // G
        ]
    },
    {
        name: "Synthwave",
        icon: "🌆",
        chordDuration: 2.6,
        filterFreq: 2200,
        chords: [
            [164.81, 196.00, 246.94, 329.63], // Em
            [130.81, 164.81, 196.00, 261.63], // C
            [196.00, 246.94, 293.66, 392.00], // G
            [146.83, 185.00, 220.00, 293.66]  // D
        ]
    },
    {
        name: "Ambient",
        icon: "🌌",
        chordDuration: 7,
        filterFreq: 550,
        chords: [
            [110.00, 146.83, 220.00], // A
            [98.00, 130.81, 196.00],  // G
            [87.31, 130.81, 174.61],  // F
            [110.00, 146.83, 220.00]  // A
        ]
    }
];

function setupMusicBus() {

    const ctx = getAudioCtx();

    musicFilterNode = ctx.createBiquadFilter();
    musicFilterNode.type = "lowpass";
    musicFilterNode.frequency.value = 1000;

    musicGainNode = ctx.createGain();
    musicGainNode.gain.value = 0;

    musicFilterNode.connect(musicGainNode);
    musicGainNode.connect(ctx.destination);
}

function playChordPad(freqs, duration) {

    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    freqs.forEach(function(freq, i) {

        const osc = ctx.createOscillator();
        osc.type = (i % 2 === 0) ? "sine" : "triangle";
        osc.frequency.value = freq;

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.05, now + 1.5); // slow, gentle attack
        noteGain.gain.linearRampToValueAtTime(0, now + duration); // slow release

        osc.connect(noteGain);
        noteGain.connect(musicFilterNode);

        osc.start(now);
        osc.stop(now + duration + 0.1);
    });
}

function musicLoop() {

    if (!musicPlaying || currentTrackIndex === -1) return;

    const track = musicTracks[currentTrackIndex];

    playChordPad(track.chords[chordIndex], track.chordDuration);
    chordIndex = (chordIndex + 1) % track.chords.length;

    // Slight overlap between chords keeps it smooth instead of choppy
    musicTimeoutId = setTimeout(musicLoop, track.chordDuration * 1000 * 0.85);
}

function cycleMusic() {

    const ctx = getAudioCtx();

    if (!musicGainNode) {
        setupMusicBus();
    }

    clearTimeout(musicTimeoutId);

    currentTrackIndex++;
    if (currentTrackIndex >= musicTracks.length) {
        currentTrackIndex = -1;
    }

    localStorage.setItem("neonDodgeMusicTrack", currentTrackIndex);
    pendingMusicResume = false;

    musicGainNode.gain.cancelScheduledValues(ctx.currentTime);

    if (currentTrackIndex === -1) {

        musicPlaying = false;
        musicGainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);

    } else {

        musicPlaying = true;
        chordIndex = 0;
        musicFilterNode.frequency.setTargetAtTime(
            musicTracks[currentTrackIndex].filterFreq, ctx.currentTime, 0.3
        );
        musicGainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + 1);
        musicLoop();
    }

    updateMusicButtonLabel();
}

function updateMusicButtonLabel() {

    const musicButton = document.getElementById("musicToggle");
    if (!musicButton) return;

    if (currentTrackIndex === -1) {
        musicButton.textContent = "🔈 Music: Off";
    } else {
        const track = musicTracks[currentTrackIndex];
        musicButton.textContent = track.icon + " " + track.name;
    }
}


const musicToggleButton = document.getElementById("musicToggle");

if (musicToggleButton) {
    musicToggleButton.addEventListener("click", cycleMusic);
}

// Starts the previously-picked track (if any) the first time audio is
// unlocked by a real user gesture. Browsers won't allow sound before that.
function resumeMusicIfPending() {

    if (!pendingMusicResume || currentTrackIndex === -1) return;
    pendingMusicResume = false;

    const ctx = getAudioCtx();

    if (!musicGainNode) {
        setupMusicBus();
    }

    musicPlaying = true;
    chordIndex = 0;
    musicFilterNode.frequency.setTargetAtTime(
        musicTracks[currentTrackIndex].filterFreq, ctx.currentTime, 0.3
    );
    musicGainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + 1);
    musicLoop();

    updateMusicButtonLabel();
}

updateMusicButtonLabel();


// ===============================
// KEYBOARD CONTROLS
// ===============================

document.addEventListener("keydown", function(event) {

    // First keypress unlocks audio (browsers block autoplay until interaction)
    getAudioCtx();
    resumeMusicIfPending();

    if (event.key === "ArrowLeft" && !gamePaused) {
        moveLeft = true;
        event.preventDefault();
    }

    if (event.key === "ArrowRight" && !gamePaused) {
        moveRight = true;
        event.preventDefault();
    }

    if (event.code === "Space") {
        event.preventDefault();
        if (gameStarted && !gameRunning && !statsScreen.classList.contains("visible")) {
            restartGame();
        }
    }

    if (event.key === "Escape" || event.key === "p" || event.key === "P") {
        event.preventDefault();
        togglePause();
    }
});


document.addEventListener("keyup", function(event) {

    if (event.key === "ArrowLeft") {
        moveLeft = false;
    }

    if (event.key === "ArrowRight") {
        moveRight = false;
    }
});


// ===============================
// TOUCH CONTROLS (drag to move, tap to restart)
// ===============================

function moveToTouch(touchEvent) {

    const touch = touchEvent.touches[0];
    if (!touch) return;

    const rect = game.getBoundingClientRect();

    // Convert the real on-screen touch position into the game's
    // internal 400px-wide coordinate space (the same one game.js
    // has always used), regardless of how small the screen is.
    const scaleX = 400 / rect.width;
    const touchXInGame = (touch.clientX - rect.left) * scaleX;

    playerX = touchXInGame - 15; // center the 30px player under the finger
    playerX = Math.max(0, Math.min(370, playerX));
}

game.addEventListener("touchstart", function(event) {
    getAudioCtx(); // unlocks audio on first touch, same as first keypress
    resumeMusicIfPending();
    if (gameRunning && !gamePaused) {
        moveToTouch(event);
    }
}, { passive: true });

game.addEventListener("touchmove", function(event) {
    if (gameRunning && !gamePaused) {
        moveToTouch(event);
    }
}, { passive: true });

gameOverOverlay.addEventListener("touchstart", function(event) {
    event.preventDefault();
    if (gameStarted && !gameRunning) {
        restartGame();
    }
});

// Also handle mouse clicks on the overlay, for desktop users who'd
// rather click than reach for the keyboard
gameOverOverlay.addEventListener("click", function(event) {
    // Don't restart when the click was on the share/screenshot buttons
    if (event.target.closest("#gameOverActions")) return;
    if (gameStarted && !gameRunning) {
        restartGame();
    }
});


// ===============================
// RESPONSIVE SCALING
// ===============================
// The game's internal logic (playerX, enemy.x/y, collision boxes) all
// runs in a fixed 400x600 coordinate space. Instead of rewriting that
// math to work in percentages, we just visually scale the whole #game
// element down to fit the screen with CSS transform, and keep the
// wrapper's real size in sync so there's no leftover empty space.

function resizeGame() {

    const scale = gameWrapper.clientWidth / 400;

    game.style.transform = "scale(" + scale + ")";
    gameWrapper.style.height = (600 * scale) + "px";
}

window.addEventListener("resize", resizeGame);
window.addEventListener("orientationchange", resizeGame);
resizeGame();


// ===============================
// ENEMY SYSTEM
// ===============================

const enemies = [];

const enemyCount = 3;

// Each type tweaks size/speed; zigzag only starts appearing once
// difficulty has ramped up a bit, so early game stays predictable.
const enemyTypeDefs = {
    normal: { size: 30, speedMult: 1,    color: "#ff2a6d", minDifficulty: 0 },
    fast:   { size: 20, speedMult: 1.6,  color: "#ff5ea3", minDifficulty: 0 },
    big:    { size: 44, speedMult: 0.65, color: "#c91f52", minDifficulty: 0 },
    zigzag: { size: 26, speedMult: 1,    color: "#ff2ad4", minDifficulty: 1.5 }
};

function pickEnemyType() {

    const available = Object.keys(enemyTypeDefs).filter(function(key) {
        return difficulty >= enemyTypeDefs[key].minDifficulty;
    });

    return available[Math.floor(Math.random() * available.length)];
}

function createEnemy() {

    const enemy = document.createElement("div");

    enemy.style.position = "absolute";

    game.appendChild(enemy);

    const enemyData = {
        element: enemy,
        x: Math.random() * 370,
        y: -30,
        size: 30,
        speed: 3 + Math.random() * 2,
        type: "normal",
        zigzagPhase: 0,
        nearMissAwarded: false,
        spawning: false,
        spawnTimeoutId: null
    };

    enemies.push(enemyData);

    placeEnemy(enemyData);
}


// Places an enemy at a fresh random spawn point (no score change).
// Enemies briefly telegraph where they'll fall (a warning flash at the
// spawn x) before actually appearing and starting to move.
function placeEnemy(enemy) {

    clearTimeout(enemy.spawnTimeoutId);

    const type = pickEnemyType();
    const def = enemyTypeDefs[type];

    enemy.type = type;
    enemy.size = def.size;
    enemy.x = Math.random() * (400 - def.size);
    enemy.y = -def.size;
    enemy.speed = (3 + Math.random() * 2) * def.speedMult * difficulty;
    enemy.zigzagPhase = Math.random() * Math.PI * 2;
    enemy.nearMissAwarded = false;

    enemy.element.style.width = def.size + "px";
    enemy.element.style.height = def.size + "px";
    enemy.element.style.background = def.color;
    enemy.element.style.boxShadow = "0 0 8px " + def.color + ", 0 0 16px " + def.color;
    enemy.element.style.borderRadius = (type === "zigzag") ? "6px" : "0px";
    enemy.element.style.left = enemy.x + "px";
    enemy.element.style.top = enemy.y + "px";

    // Telegraph the spawn: hide the enemy, flash a warning at its spot,
    // then reveal it and let it start falling.
    enemy.spawning = true;
    enemy.element.style.opacity = "0";
    spawnWarningFlash(enemy.x, enemy.size, def.color);

    enemy.spawnTimeoutId = setTimeout(function() {
        enemy.spawning = false;
        enemy.element.style.opacity = "1";
    }, 260);
}


function spawnWarningFlash(x, size, color) {

    const flash = document.createElement("div");
    flash.className = "spawn-warning";
    flash.style.left = x + "px";
    flash.style.width = size + "px";
    flash.style.background = "radial-gradient(circle, " + color + " 0%, transparent 75%)";

    game.appendChild(flash);

    setTimeout(function() {
        flash.remove();
    }, 500);
}


// Called when the player successfully dodges an enemy off the bottom
function dodgeEnemy(enemy) {

    placeEnemy(enemy);

    comboCount++;

    const newMultiplier = Math.min(1 + Math.floor(comboCount / 5), 5);

    if (newMultiplier > comboMultiplier) {
        comboMultiplier = newMultiplier;
        playComboSound();
        pulseCombo();
    }

    let gained = comboMultiplier;
    if (scoreMultiplierActive) gained *= 2;

    score += gained;
    scoreDisplay.textContent = "Score: " + score;

    updateComboDisplay();

    runStats.dodges++;
    if (comboCount > runStats.longestStreakThisRun) {
        runStats.longestStreakThisRun = comboCount;
    }

    playDodgeSound();
}


function updateComboDisplay() {

    if (comboMultiplier > 1) {
        comboDisplay.textContent = "x" + comboMultiplier + " combo";
        comboDisplay.classList.add("visible");
    } else {
        comboDisplay.classList.remove("visible");
    }
}


function pulseCombo() {

    comboDisplay.classList.remove("pulse");
    void comboDisplay.offsetWidth; // restart the CSS animation
    comboDisplay.classList.add("pulse");
}


function resetCombo() {

    comboCount = 0;
    comboMultiplier = 1;
    updateComboDisplay();
}


// ===============================
// NEAR-MISS BONUS
// ===============================
// Awards a small score bump when the player squeezes past an enemy with
// only a small horizontal gap to spare, without needing to touch it.

const NEAR_MISS_MARGIN = 16; // px of horizontal gap counted as "close"
const NEAR_MISS_BAND_TOP = 500;
const NEAR_MISS_BAND_BOTTOM = 580;

function checkNearMiss(enemy) {

    if (enemy.nearMissAwarded) return;

    const enemyTop = enemy.y;
    const enemyBottom = enemy.y + enemy.size;

    // Only check while the enemy is passing through the player's row
    if (enemyBottom < NEAR_MISS_BAND_TOP || enemyTop > NEAR_MISS_BAND_BOTTOM) return;

    const playerLeft = playerX;
    const playerRight = playerX + 30;
    const enemyLeft = enemy.x;
    const enemyRight = enemy.x + enemy.size;

    // Not overlapping (that's a collision, handled elsewhere), but close
    const gap = (enemyLeft > playerRight)
        ? enemyLeft - playerRight
        : (playerLeft > enemyRight ? playerLeft - enemyRight : -1);

    if (gap >= 0 && gap <= NEAR_MISS_MARGIN) {
        enemy.nearMissAwarded = true;
        awardNearMiss();
    }
}

function awardNearMiss() {

    score += 1;
    scoreDisplay.textContent = "Score: " + score;

    playNearMissSound();

    nearMissEl.textContent = "+1 close call";
    nearMissEl.style.left = Math.max(0, Math.min(340, playerX - 25)) + "px";
    nearMissEl.style.top = "510px";

    nearMissEl.classList.remove("pop");
    void nearMissEl.offsetWidth;
    nearMissEl.classList.add("pop");
}


// ===============================
// POWER-UPS
// ===============================

const powerUps = [];

const powerUpTypes = {
    shield:     { symbol: "🛡", color: "#05d9e8" },
    slowmo:     { symbol: "⏱", color: "#ffde59" },
    magnet:     { symbol: "🧲", color: "#ffde59" },
    multiplier: { symbol: "✕2", color: "#ff2a6d" }
};

function spawnPowerUp() {

    if (!gameRunning) return;

    const types = Object.keys(powerUpTypes);
    const type = types[Math.floor(Math.random() * types.length)];
    const info = powerUpTypes[type];

    const el = document.createElement("div");
    el.className = "powerup";
    el.textContent = info.symbol;
    el.style.borderColor = info.color;
    el.style.boxShadow = "0 0 10px " + info.color + ", 0 0 20px " + info.color;
    if (type === "multiplier") el.style.fontSize = "12px";

    game.appendChild(el);

    powerUps.push({
        element: el,
        type: type,
        x: Math.random() * 370,
        y: -30,
        speed: 2.5
    });
}

let powerUpTimeoutId = null;

function schedulePowerUp() {

    const delay = 7000 + Math.random() * 6000; // every 7-13 seconds

    powerUpTimeoutId = setTimeout(function() {
        spawnPowerUp();
        schedulePowerUp();
    }, delay);
}

function removePowerUp(powerUp) {

    powerUp.element.remove();

    const index = powerUps.indexOf(powerUp);
    if (index !== -1) {
        powerUps.splice(index, 1);
    }
}

function checkPowerUpCollision(powerUp) {

    const playerTop = 550;
    const playerBottom = 580;

    const puLeft = powerUp.x;
    const puRight = powerUp.x + 30;
    const puTop = powerUp.y;
    const puBottom = powerUp.y + 30;

    return (
        playerX < puRight &&
        playerX + 30 > puLeft &&
        playerTop < puBottom &&
        playerBottom > puTop
    );
}

function collectPowerUp(powerUp) {

    playPowerUpSound();

    if (powerUp.type === "shield") {
        activateShield();
    } else if (powerUp.type === "slowmo") {
        activateSlowMo();
    } else if (powerUp.type === "magnet") {
        activateMagnet();
    } else if (powerUp.type === "multiplier") {
        activateMultiplier();
    }

    removePowerUp(powerUp);
}

function activateShield() {

    hasShield = true;
    player.classList.add("shielded");
}

function consumeShield(enemy) {

    hasShield = false;
    player.classList.remove("shielded");

    playShieldBreakSound();
    triggerShake();
    spawnParticles(playerX + 15, 565);

    resetCombo();

    // The enemy that hit the shield gets sent back to the top,
    // rather than ending the run
    placeEnemy(enemy);
}

function activateSlowMo() {

    slowMoFactor = 0.5;
    slowmoOverlay.classList.add("active");

    // Stacks/refreshes duration if picked up again while already active
    clearTimeout(slowMoTimeoutId);
    slowMoTimeoutId = setTimeout(function() {
        slowMoFactor = 1;
        slowmoOverlay.classList.remove("active");
    }, 5000);
}

function activateMagnet() {

    magnetActive = true;
    player.classList.add("magnetized");

    clearTimeout(magnetTimeoutId);
    magnetTimeoutId = setTimeout(function() {
        magnetActive = false;
        player.classList.remove("magnetized");
    }, 6000);
}

function activateMultiplier() {

    scoreMultiplierActive = true;
    playMultiplierSound();
    showMultiplierFlash();

    clearTimeout(scoreMultiplierTimeoutId);
    scoreMultiplierTimeoutId = setTimeout(function() {
        scoreMultiplierActive = false;
    }, 8000);
}

function showMultiplierFlash() {

    let flash = document.getElementById("multiplierFlash");
    if (!flash) {
        flash = document.createElement("div");
        flash.id = "multiplierFlash";
        game.appendChild(flash);
    }

    flash.textContent = "✕2 SCORE!";
    flash.style.left = "130px";
    flash.style.top = "260px";
    flash.style.fontSize = "22px";
    flash.style.opacity = "1";
    flash.style.transition = "none";

    // Force reflow so the transition below actually replays
    void flash.offsetWidth;

    flash.style.transition = "opacity 1s ease, transform 1s ease";
    flash.style.transform = "translateY(-20px) scale(1.15)";
    flash.style.opacity = "0";
}


// ===============================
// DIFFICULTY
// ===============================

function updateDifficulty() {

    const secondsSurvived = (Date.now() - startTime) / 1000;

    // Speeds up gradually, caps out so it stays playable
    const ramp = 1 + Math.min(secondsSurvived / 20, 2.5);
    difficulty = ramp * modeSpeedMultiplier[gameMode];
}


// ===============================
// PARTICLES
// ===============================

function spawnParticles(x, y) {

    const particleCount = 18;

    for (let i = 0; i < particleCount; i++) {

        const particle = document.createElement("div");
        particle.className = "particle";

        particle.style.left = x + "px";
        particle.style.top = y + "px";

        game.appendChild(particle);

        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;

        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        animateParticle(particle, x, y, vx, vy);
    }
}


function animateParticle(particle, x, y, vx, vy) {

    let opacity = 1;

    function step() {

        x += vx;
        y += vy;
        opacity -= 0.03;

        particle.style.left = x + "px";
        particle.style.top = y + "px";
        particle.style.opacity = opacity;

        if (opacity > 0) {
            requestAnimationFrame(step);
        } else {
            particle.remove();
        }
    }

    requestAnimationFrame(step);
}


// ===============================
// PLAYER TRAIL
// ===============================
// A lightweight fading dot dropped behind the player every couple of
// frames - cheap enough to not need the full particle physics above.

let trailFrameCounter = 0;

function maybeSpawnTrailDot() {

    trailFrameCounter++;
    if (trailFrameCounter % 3 !== 0) return; // throttle for performance

    const dot = document.createElement("div");
    dot.className = "trail-particle";
    dot.style.left = playerX + "px";
    dot.style.top = "550px";
    dot.style.opacity = "0.35";

    game.appendChild(dot);

    let opacity = 0.35;

    function fade() {
        opacity -= 0.025;
        dot.style.opacity = opacity;
        dot.style.transform = "scale(" + (1 - (0.35 - opacity)) + ")";

        if (opacity > 0) {
            requestAnimationFrame(fade);
        } else {
            dot.remove();
        }
    }

    requestAnimationFrame(fade);
}


// ===============================
// SCREEN SHAKE
// ===============================

function triggerShake() {

    game.classList.add("shake");

    setTimeout(function() {
        game.classList.remove("shake");
    }, 350);
}


// ===============================
// COLLISION
// ===============================

function checkCollision(enemy) {

    if (enemy.spawning) return;

    const playerTop = 550;
    const playerBottom = 580;

    const enemyLeft = enemy.x;
    const enemyRight = enemy.x + enemy.size;

    const enemyTop = enemy.y;
    const enemyBottom = enemy.y + enemy.size;

    if (
        playerX < enemyRight &&
        playerX + 30 > enemyLeft &&
        playerTop < enemyBottom &&
        playerBottom > enemyTop
    ) {
        if (hasShield) {
            consumeShield(enemy);
        } else {
            triggerGameOver("crash");
        }
    } else {
        checkNearMiss(enemy);
    }
}


// ===============================
// PERSISTENT STATS (localStorage)
// ===============================

function loadLifetimeStats() {

    const raw = localStorage.getItem("neonDodgeLifetimeStats");

    if (!raw) {
        return { totalDodged: 0, longestStreak: 0, playCount: 0 };
    }

    try {
        const parsed = JSON.parse(raw);
        return {
            totalDodged: parsed.totalDodged || 0,
            longestStreak: parsed.longestStreak || 0,
            playCount: parsed.playCount || 0
        };
    } catch (e) {
        return { totalDodged: 0, longestStreak: 0, playCount: 0 };
    }
}

function saveLifetimeStats() {
    localStorage.setItem("neonDodgeLifetimeStats", JSON.stringify(lifetimeStats));
}

let lifetimeStats = loadLifetimeStats();

// Tracked during the current run, folded into lifetimeStats on game over
let runStats = { dodges: 0, longestStreakThisRun: 0 };

function loadTopRuns() {

    const raw = localStorage.getItem("neonDodgeTopRuns");

    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveTopRuns(runs) {
    localStorage.setItem("neonDodgeTopRuns", JSON.stringify(runs));
}

// Inserts a finished run into the top-5 list (sorted desc by score)
function insertTopRun(finalScore) {

    const runs = loadTopRuns();

    runs.push({
        score: finalScore,
        date: new Date().toLocaleDateString()
    });

    runs.sort(function(a, b) { return b.score - a.score; });

    const top5 = runs.slice(0, 5);
    saveTopRuns(top5);

    return top5;
}

function renderTopRuns(justPlayedScore) {

    const runs = loadTopRuns();

    if (runs.length === 0) {
        topRunsList.innerHTML = "";
        return;
    }

    let html = '<div class="top-runs-heading">TOP 5 RUNS</div>';

    let markedCurrent = false;

    runs.forEach(function(run) {
        const isCurrent = !markedCurrent && run.score === justPlayedScore;
        if (isCurrent) markedCurrent = true;

        html += '<div class="top-run-row' + (isCurrent ? ' current' : '') + '">' +
                run.score + ' pts — ' + run.date +
                '</div>';
    });

    topRunsList.innerHTML = html;
}

function renderStats() {

    statsBody.innerHTML =
        '<div>Games played: <strong>' + lifetimeStats.playCount + '</strong></div>' +
        '<div>Enemies dodged (lifetime): <strong>' + lifetimeStats.totalDodged + '</strong></div>' +
        '<div>Longest streak: <strong>' + lifetimeStats.longestStreak + '</strong></div>' +
        '<div>Best score: <strong>' + highScore + '</strong></div>';
}

const statsToggleBtn = document.getElementById("statsToggle");
const statsCloseBtn = document.getElementById("statsCloseBtn");

if (statsToggleBtn) {
    statsToggleBtn.addEventListener("click", function() {
        renderStats();
        statsScreen.classList.add("visible");
        if (gameRunning && !gamePaused) togglePause();
    });
}

if (statsCloseBtn) {
    statsCloseBtn.addEventListener("click", function() {
        statsScreen.classList.remove("visible");
    });
}


// ===============================
// SHARE / SCREENSHOT
// ===============================

const shareBtn = document.getElementById("shareBtn");
const screenshotBtn = document.getElementById("screenshotBtn");

if (shareBtn) {
    shareBtn.addEventListener("click", function(event) {
        event.stopPropagation();

        const text = "I scored " + score + " on Neon Dodge! 🎮";
        const url = window.location.href;

        if (navigator.share) {
            navigator.share({ text: text, url: url }).catch(function() {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text + " " + url).then(function() {
                shareBtn.textContent = "✓ Copied!";
                setTimeout(function() { shareBtn.textContent = "🔗 Share"; }, 1800);
            });
        } else {
            window.open(
                "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url),
                "_blank"
            );
        }
    });
}

if (screenshotBtn) {
    screenshotBtn.addEventListener("click", function(event) {
        event.stopPropagation();
        downloadScoreImage();
    });
}

function downloadScoreImage() {

    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "#12081f");
    bg.addColorStop(1, "#0a0118");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border glow
    ctx.strokeStyle = "#05d9e8";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

    ctx.textAlign = "center";

    ctx.fillStyle = "#f4f1ff";
    ctx.font = "bold 34px Arial";
    ctx.fillText("NEON DODGE", canvas.width / 2, 80);

    ctx.fillStyle = "#05d9e8";
    ctx.font = "bold 48px Arial";
    ctx.fillText("Score: " + score, canvas.width / 2, 150);

    ctx.fillStyle = "#8b7fa8";
    ctx.font = "20px Arial";
    ctx.fillText("Best: " + highScore, canvas.width / 2, 190);

    ctx.fillStyle = "#ff2a6d";
    ctx.font = "16px Arial";
    ctx.fillText("Play it yourself — link in bio", canvas.width / 2, 250);

    const link = document.createElement("a");
    link.download = "neon-dodge-score.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
}


// ===============================
// SPRINT MODE TIMER
// ===============================

function startSprintTimer() {

    sprintTimeLeft = SPRINT_DURATION;
    sprintTimerEl.classList.add("visible");
    sprintTimerEl.classList.remove("urgent");
    sprintTimerEl.textContent = "⏱ " + sprintTimeLeft + "s";

    clearInterval(sprintIntervalId);
    sprintIntervalId = setInterval(function() {

        if (gamePaused) return;

        sprintTimeLeft--;
        sprintTimerEl.textContent = "⏱ " + sprintTimeLeft + "s";

        if (sprintTimeLeft <= 10) {
            sprintTimerEl.classList.add("urgent");
        }

        if (sprintTimeLeft <= 0) {
            clearInterval(sprintIntervalId);
            triggerGameOver("time");
        }
    }, 1000);
}

function stopSprintTimer() {
    clearInterval(sprintIntervalId);
    sprintTimerEl.classList.remove("visible");
}


// ===============================
// GAME OVER / RESTART
// ===============================

function triggerGameOver(reason) {

    gameRunning = false;

    if (gameMode === "sprint") stopSprintTimer();

    if (reason !== "time") {
        playCrashSound();
        triggerShake();
        spawnParticles(playerX + 15, 565);
    }

    const isNewBest = score > highScore;

    if (isNewBest) {
        highScore = score;
        localStorage.setItem("neonDodgeHighScore", highScore);
    }

    highScoreDisplay.textContent = "Best: " + highScore;

    // Fold this run's stats into lifetime totals
    lifetimeStats.totalDodged += runStats.dodges;
    if (runStats.longestStreakThisRun > lifetimeStats.longestStreak) {
        lifetimeStats.longestStreak = runStats.longestStreakThisRun;
    }
    saveLifetimeStats();

    insertTopRun(score);
    renderTopRuns(score);

    gameOverTitle.textContent = (reason === "time") ? "TIME'S UP" : "GAME OVER";

    if (isNewBest && score > 0) {
        gameOverScore.innerHTML = "Score: " + score + '<div id="newBestFlash">★ NEW BEST! ★</div>';
    } else {
        gameOverScore.textContent = "Score: " + score;
    }

    gameOverOverlay.classList.add("visible");
}


function restartGame() {

    gameOverOverlay.classList.remove("visible");

    gamePaused = false;
    if (pauseOverlay) pauseOverlay.classList.remove("visible");

    score = 0;
    scoreDisplay.textContent = "Score: 0";

    resetCombo();

    runStats = { dodges: 0, longestStreakThisRun: 0 };

    hasShield = false;
    player.classList.remove("shielded");

    slowMoFactor = 1;
    slowmoOverlay.classList.remove("active");
    clearTimeout(slowMoTimeoutId);

    magnetActive = false;
    player.classList.remove("magnetized");
    clearTimeout(magnetTimeoutId);

    scoreMultiplierActive = false;
    clearTimeout(scoreMultiplierTimeoutId);

    powerUps.forEach(function(powerUp) {
        powerUp.element.remove();
    });
    powerUps.length = 0;

    playerX = 185;
    player.style.left = playerX + "px";

    startTime = Date.now();
    difficulty = 1;

    enemies.forEach(function(enemy) {
        placeEnemy(enemy);
    });

    lifetimeStats.playCount++;
    saveLifetimeStats();

    if (gameMode === "sprint") {
        startSprintTimer();
    } else {
        stopSprintTimer();
    }

    gameRunning = true;

    lastFrameTime = performance.now();
    gameLoop();
}


// First-ever run after a mode is picked on the start screen
function beginRun() {

    gameStarted = true;

    for (let i = 0; i < enemyCount; i++) {
        createEnemy();
    }

    schedulePowerUp();

    lifetimeStats.playCount++;
    saveLifetimeStats();

    if (gameMode === "sprint") {
        startSprintTimer();
    }

    startTime = Date.now();
    difficulty = 1;
    gameRunning = true;

    lastFrameTime = performance.now();
    gameLoop();
}


// ===============================
// PAUSE
// ===============================

const pauseOverlay = document.getElementById("pauseOverlay");
const pauseBtn = document.getElementById("pauseBtn");
let pauseStartedAt = 0;

function togglePause() {

    if (!gameRunning) return; // no pausing on the game-over/start screen

    gamePaused = !gamePaused;

    if (gamePaused) {

        moveLeft = false;
        moveRight = false;
        pauseStartedAt = performance.now();

        if (pauseOverlay) pauseOverlay.classList.add("visible");

    } else {

        if (pauseOverlay) pauseOverlay.classList.remove("visible");

        // Resync the clock so the frame after resuming doesn't think a
        // huge amount of time passed while paused, and difficulty/timing
        // stay accurate.
        const pausedDuration = performance.now() - pauseStartedAt;
        lastFrameTime = performance.now();
        startTime += pausedDuration;

        gameLoop();
    }
}

if (pauseBtn) {
    pauseBtn.addEventListener("click", function(event) {
        event.stopPropagation(); // don't let this bubble up as a "move" tap
        getAudioCtx();
        resumeMusicIfPending();
        togglePause();
    });
}

if (pauseOverlay) {
    pauseOverlay.addEventListener("click", function(event) {
        event.stopPropagation();
        togglePause();
    });
}


// ===============================
// GAME LOOP
// ===============================
// Movement is scaled by deltaFactor so the game runs at the same real-world
// speed on every screen, whether it's calling this loop 60 times a second
// (a normal monitor/phone) or 144+ times a second (a high refresh-rate
// monitor). Without this, speeds set as "pixels per frame" would make the
// game run faster on higher refresh-rate displays.

let lastFrameTime = performance.now();

function gameLoop(currentTime) {

    if (!gameRunning || gamePaused) return;

    if (currentTime === undefined) {
        currentTime = performance.now();
    }

    const deltaMs = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    // 1.0 at a normal 60fps frame; higher on faster displays, lower on
    // slower ones. Clamped so a tab coming back from being backgrounded
    // doesn't cause one giant jump.
    const deltaFactor = Math.min(deltaMs / (1000 / 60), 3);


    updateDifficulty();


    // PLAYER MOVEMENT

    if (moveLeft) {
        playerX -= playerSpeed * deltaFactor;
    }

    if (moveRight) {
        playerX += playerSpeed * deltaFactor;
    }

    playerX = Math.max(0, Math.min(370, playerX));

    player.style.left = playerX + "px";

    if (moveLeft || moveRight) {
        maybeSpawnTrailDot();
    }


    // ENEMIES

    enemies.forEach(function(enemy) {

        if (enemy.spawning) return;

        enemy.y += enemy.speed * slowMoFactor * deltaFactor;

        if (enemy.type === "zigzag") {
            enemy.zigzagPhase += 0.06 * deltaFactor;
            const drift = Math.sin(enemy.zigzagPhase) * 2.2 * deltaFactor;
            enemy.x = Math.max(0, Math.min(400 - enemy.size, enemy.x + drift));
            enemy.element.style.left = enemy.x + "px";
        }

        enemy.element.style.top = enemy.y + "px";

        checkCollision(enemy);

        if (!gameRunning) return;


        // Enemy successfully dodged

        if (enemy.y > 600) {
            dodgeEnemy(enemy);
        }

    });


    // POWER-UPS

    for (let i = powerUps.length - 1; i >= 0; i--) {

        const powerUp = powerUps[i];

        if (magnetActive) {
            // Pull nearby power-ups toward the player
            const dx = (playerX + 15) - (powerUp.x + 15);
            const dy = 565 - powerUp.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 160) {
                powerUp.x += (dx / dist) * 5 * deltaFactor;
                powerUp.y += (dy / dist) * 5 * deltaFactor;
            } else {
                powerUp.y += powerUp.speed * slowMoFactor * deltaFactor;
            }
        } else {
            powerUp.y += powerUp.speed * slowMoFactor * deltaFactor;
        }

        powerUp.element.style.top = powerUp.y + "px";
        powerUp.element.style.left = powerUp.x + "px";

        if (checkPowerUpCollision(powerUp)) {
            collectPowerUp(powerUp);
            continue;
        }

        // Missed it - remove once it falls off screen
        if (powerUp.y > 600) {
            removePowerUp(powerUp);
        }
    }


    requestAnimationFrame(gameLoop);
}


// ===============================
// START
// ===============================
// The game no longer auto-starts: it waits on the mode-select screen
// (#startScreen) and beginRun() kicks things off once a mode is chosen.

resizeGame();
