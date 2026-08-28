const player = document.getElementById("player");
const game = document.getElementById("game");
const gameWrapper = document.getElementById("gameWrapper");
const scoreDisplay = document.getElementById("score");
const highScoreDisplay = document.getElementById("highscore");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverScore = document.getElementById("gameOverScore");


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
let gameRunning = true;
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
        if (!gameRunning) {
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
    if (!gameRunning) {
        restartGame();
    }
});

// Also handle mouse clicks on the overlay, for desktop users who'd
// rather click than reach for the keyboard
gameOverOverlay.addEventListener("click", function() {
    if (!gameRunning) {
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


function createEnemy() {

    const enemy = document.createElement("div");

    enemy.style.width = "30px";
    enemy.style.height = "30px";
    enemy.style.background = "#ff2a6d";
    enemy.style.boxShadow = "0 0 8px #ff2a6d, 0 0 16px #ff2a6d";
    enemy.style.position = "absolute";

    game.appendChild(enemy);

    const enemyData = {
        element: enemy,
        x: Math.random() * 370,
        y: -30,
        speed: 3 + Math.random() * 2
    };

    enemies.push(enemyData);

    placeEnemy(enemyData);
}


// Places an enemy at a fresh random spawn point (no score change)
function placeEnemy(enemy) {

    enemy.x = Math.random() * 370;
    enemy.y = -30;

    enemy.speed = (3 + Math.random() * 2) * difficulty;

    enemy.element.style.left = enemy.x + "px";
    enemy.element.style.top = enemy.y + "px";
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

    score += comboMultiplier;
    scoreDisplay.textContent = "Score: " + score;

    updateComboDisplay();

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
// POWER-UPS
// ===============================

const powerUps = [];

const powerUpTypes = {
    shield: { symbol: "🛡", color: "#05d9e8" },
    slowmo: { symbol: "⏱", color: "#ffde59" }
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

    game.appendChild(el);

    powerUps.push({
        element: el,
        type: type,
        x: Math.random() * 370,
        y: -30,
        speed: 2.5
    });
}

function schedulePowerUp() {

    const delay = 7000 + Math.random() * 6000; // every 7-13 seconds

    setTimeout(function() {
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


// ===============================
// DIFFICULTY
// ===============================

function updateDifficulty() {

    const secondsSurvived = (Date.now() - startTime) / 1000;

    // Speeds up gradually, caps out so it stays playable
    difficulty = 1 + Math.min(secondsSurvived / 20, 2.5);
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

    const playerTop = 550;
    const playerBottom = 580;

    const enemyLeft = enemy.x;
    const enemyRight = enemy.x + 30;

    const enemyTop = enemy.y;
    const enemyBottom = enemy.y + 30;

    if (
        playerX < enemyRight &&
        playerX + 30 > enemyLeft &&
        playerTop < enemyBottom &&
        playerBottom > enemyTop
    ) {
        if (hasShield) {
            consumeShield(enemy);
        } else {
            triggerGameOver();
        }
    }
}


// ===============================
// GAME OVER / RESTART
// ===============================

function triggerGameOver() {

    gameRunning = false;

    playCrashSound();
    triggerShake();
    spawnParticles(playerX + 15, 565);

    const isNewBest = score > highScore;

    if (isNewBest) {
        highScore = score;
        localStorage.setItem("neonDodgeHighScore", highScore);
    }

    highScoreDisplay.textContent = "Best: " + highScore;

    if (submitStatus) {
        submitStatus.textContent = "";
        submitStatus.className = "";
    }
    if (submitScoreBtn) submitScoreBtn.disabled = false;

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

    hasShield = false;
    player.classList.remove("shielded");

    slowMoFactor = 1;
    slowmoOverlay.classList.remove("active");
    clearTimeout(slowMoTimeoutId);

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

function togglePause() {

    if (!gameRunning) return; // no pausing on the game-over screen

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


// ===============================
// LEADERBOARD (Firebase Firestore)
// ===============================
// Replace these placeholder values with your own project's config from
// the Firebase console (Project settings -> General -> Your apps ->
// SDK setup and configuration). Until you do, the leaderboard UI still
// shows but every action reports "not set up yet" instead of erroring.

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

let db = null;

try {
    if (typeof firebase !== "undefined" && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
    }
} catch (err) {
    console.warn("Firebase not configured — leaderboard disabled.", err);
}

const LEADERBOARD_COLLECTION = "neonDodgeScores";

// Anonymous per-device ID. This (not the typed name) is what identifies
// "the same player" so a new high score updates their existing row
// instead of adding a duplicate. No account, no personal info involved.
function getDeviceId() {

    let id = localStorage.getItem("neonDodgeDeviceId");

    if (!id) {
        id = "player_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("neonDodgeDeviceId", id);
    }

    return id;
}

const nameInput = document.getElementById("nameInput");
const submitScoreBtn = document.getElementById("submitScoreBtn");
const submitStatus = document.getElementById("submitStatus");

// Prefill with whatever name they used last time
const savedName = localStorage.getItem("neonDodgeName");
if (savedName && nameInput) nameInput.value = savedName;


async function submitScore() {

    if (!db) {
        submitStatus.textContent = "Leaderboard isn't set up yet.";
        submitStatus.className = "error";
        return;
    }

    const name = (nameInput.value || "").trim().slice(0, 20);

    if (!name) {
        submitStatus.textContent = "Enter a name first.";
        submitStatus.className = "error";
        return;
    }

    submitScoreBtn.disabled = true;
    submitStatus.textContent = "Submitting...";
    submitStatus.className = "";

    localStorage.setItem("neonDodgeName", name);

    const deviceId = getDeviceId();
    const docRef = db.collection(LEADERBOARD_COLLECTION).doc(deviceId);

    try {

        const existing = await docRef.get();

        // Only overwrite this device's row if the new run actually beats
        // their stored best - otherwise leave the leaderboard untouched.
        if (existing.exists && existing.data().score >= score) {
            submitStatus.textContent =
                "Didn't beat your best (" + existing.data().score + ").";
            submitStatus.className = "";
            submitScoreBtn.disabled = false;
            return;
        }

        await docRef.set({
            name: name,
            score: score,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        submitStatus.textContent = "Score submitted!";
        submitStatus.className = "success";

    } catch (err) {
        console.error(err);
        submitStatus.textContent = "Couldn't submit - try again.";
        submitStatus.className = "error";
    }

    submitScoreBtn.disabled = false;
}

const scoreSubmitRow = document.getElementById("scoreSubmitRow");

// The game-over overlay restarts the game on any click/tap - stop clicks
// inside the name box and submit button from bubbling up into that, or
// clicking the input just instantly restarts and closes it.
if (scoreSubmitRow) {
    scoreSubmitRow.addEventListener("click", function(event) {
        event.stopPropagation();
    });
    scoreSubmitRow.addEventListener("touchstart", function(event) {
        event.stopPropagation();
    });
}

if (submitScoreBtn) {
    submitScoreBtn.addEventListener("click", submitScore);
}

if (nameInput) {
    nameInput.addEventListener("keydown", function(event) {
        // Stop typing (including Space) from reaching the document-level
        // handlers that move the player or restart the game.
        event.stopPropagation();
        if (event.key === "Enter") {
            submitScore();
        }
    });
}


async function loadLeaderboard() {

    const list = document.getElementById("leaderboardList");
    const empty = document.getElementById("leaderboardEmpty");

    if (!list || !empty) return;

    list.innerHTML = "";

    if (!db) {
        empty.style.display = "block";
        empty.textContent = "Leaderboard isn't set up yet.";
        return;
    }

    try {

        const snapshot = await db.collection(LEADERBOARD_COLLECTION)
            .orderBy("score", "desc")
            .limit(10)
            .get();

        if (snapshot.empty) {
            empty.style.display = "block";
            empty.textContent = "No scores yet - be the first!";
            return;
        }

        empty.style.display = "none";

        let rank = 1;

        snapshot.forEach(function(doc) {

            const data = doc.data();

            const li = document.createElement("li");

            const rankSpan = document.createElement("span");
            rankSpan.className = "lb-rank";
            rankSpan.textContent = "#" + rank;

            const nameSpan = document.createElement("span");
            nameSpan.className = "lb-name";
            nameSpan.textContent = data.name || "???"; // textContent, never innerHTML - names are user input

            const scoreSpan = document.createElement("span");
            scoreSpan.className = "lb-score";
            scoreSpan.textContent = data.score;

            li.appendChild(rankSpan);
            li.appendChild(nameSpan);
            li.appendChild(scoreSpan);

            list.appendChild(li);
            rank++;
        });

    } catch (err) {
        console.error(err);
        empty.style.display = "block";
        empty.textContent = "Couldn't load leaderboard.";
    }
}

const leaderboardModal = document.getElementById("leaderboardModal");
const leaderboardToggle = document.getElementById("leaderboardToggle");
const leaderboardClose = document.getElementById("leaderboardClose");

if (leaderboardToggle) {
    leaderboardToggle.addEventListener("click", function() {
        leaderboardModal.classList.add("visible");
        loadLeaderboard();
    });
}

if (leaderboardClose) {
    leaderboardClose.addEventListener("click", function() {
        leaderboardModal.classList.remove("visible");
    });
}

if (leaderboardModal) {
    leaderboardModal.addEventListener("click", function(event) {
        if (event.target === leaderboardModal) {
            leaderboardModal.classList.remove("visible");
        }
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


    // ENEMIES

    enemies.forEach(function(enemy) {

        enemy.y += enemy.speed * slowMoFactor * deltaFactor;

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

        powerUp.y += powerUp.speed * slowMoFactor * deltaFactor;
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
// START GAME
// ===============================

for (let i = 0; i < enemyCount; i++) {

    createEnemy();

}

schedulePowerUp();
gameLoop();