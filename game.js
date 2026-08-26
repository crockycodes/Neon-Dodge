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

let highScore = Number(localStorage.getItem("neonDodgeHighScore")) || 0;
highScoreDisplay.textContent = "Best: " + highScore;

// Difficulty ramps up the longer you survive
let startTime = Date.now();
let difficulty = 1;


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


// ===============================
// BACKGROUND MUSIC (procedural chill pad loop)
// ===============================

let musicGainNode = null;
let musicFilterNode = null;
let musicPlaying = false;
let musicTimeoutId = null;
let chordIndex = 0;

// Soft chord progression (Am7 - Fmaj7 - Cmaj7 - G) for a chill, ambient feel
const chordProgression = [
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63, 349.23],
    [130.81, 164.81, 196.00, 261.63],
    [196.00, 246.94, 293.66, 392.00]
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

    if (!musicPlaying) return;

    const chordDuration = 4.5;

    playChordPad(chordProgression[chordIndex], chordDuration);
    chordIndex = (chordIndex + 1) % chordProgression.length;

    // Slight overlap between chords keeps it smooth instead of choppy
    musicTimeoutId = setTimeout(musicLoop, chordDuration * 1000 * 0.85);
}

function toggleMusic() {

    const ctx = getAudioCtx();

    if (!musicGainNode) {
        setupMusicBus();
    }

    musicPlaying = !musicPlaying;

    musicGainNode.gain.cancelScheduledValues(ctx.currentTime);

    if (musicPlaying) {
        musicGainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
        musicLoop();
    } else {
        musicGainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
        clearTimeout(musicTimeoutId);
    }

    const musicButton = document.getElementById("musicToggle");
    if (musicButton) {
        musicButton.textContent = musicPlaying ? "🔊 Music: On" : "🔈 Music: Off";
    }
}


const musicToggleButton = document.getElementById("musicToggle");

if (musicToggleButton) {
    musicToggleButton.addEventListener("click", toggleMusic);
}


// ===============================
// KEYBOARD CONTROLS
// ===============================

document.addEventListener("keydown", function(event) {

    // First keypress unlocks audio (browsers block autoplay until interaction)
    getAudioCtx();

    if (event.key === "ArrowLeft") {
        moveLeft = true;
        event.preventDefault();
    }

    if (event.key === "ArrowRight") {
        moveRight = true;
        event.preventDefault();
    }

    if (event.code === "Space") {
        event.preventDefault();
        if (!gameRunning) {
            restartGame();
        }
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
    if (gameRunning) {
        moveToTouch(event);
    }
}, { passive: true });

game.addEventListener("touchmove", function(event) {
    if (gameRunning) {
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

    score++;
    scoreDisplay.textContent = "Score: " + score;

    playDodgeSound();
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
        triggerGameOver();
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

    if (score > highScore) {
        highScore = score;
        localStorage.setItem("neonDodgeHighScore", highScore);
    }

    highScoreDisplay.textContent = "Best: " + highScore;
    gameOverScore.textContent = "Score: " + score;
    gameOverOverlay.classList.add("visible");
}


function restartGame() {

    gameOverOverlay.classList.remove("visible");

    score = 0;
    scoreDisplay.textContent = "Score: 0";

    playerX = 185;
    player.style.left = playerX + "px";

    startTime = Date.now();
    difficulty = 1;

    enemies.forEach(function(enemy) {
        placeEnemy(enemy);
    });

    gameRunning = true;

    gameLoop();
}


// ===============================
// GAME LOOP
// ===============================

function gameLoop() {

    if (!gameRunning) return;


    updateDifficulty();


    // PLAYER MOVEMENT

    if (moveLeft) {
        playerX -= playerSpeed;
    }

    if (moveRight) {
        playerX += playerSpeed;
    }

    playerX = Math.max(0, Math.min(370, playerX));

    player.style.left = playerX + "px";


    // ENEMIES

    enemies.forEach(function(enemy) {

        enemy.y += enemy.speed;

        enemy.element.style.top = enemy.y + "px";

        checkCollision(enemy);

        if (!gameRunning) return;


        // Enemy successfully dodged

        if (enemy.y > 600) {
            dodgeEnemy(enemy);
        }

    });


    requestAnimationFrame(gameLoop);
}


// ===============================
// START GAME
// ===============================

for (let i = 0; i < enemyCount; i++) {

    createEnemy();

}

gameLoop();
