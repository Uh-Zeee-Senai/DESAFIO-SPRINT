// === CONFIGURAÇÕES GERAIS DO JOGO ===
const CONFIG = {
    TRACK_WIDTH: 800,
    TRACK_HEIGHT: 1200,
    PLAYER_SPEED: 4,
    BOT_SPEED: 3.5,
    FRICTION: 0.98,
    ACCELERATION: 0.2,
    MAX_SPEED: 6,
    SECTORS: [
        { x: 80, y: 140, length: 300 },
        { x: 400, y: 200, length: 400 },
        { x: 300, y: 500, length: 300 },
        { x: 100, y: 300, length: 300 },
    ]
};

// === VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetDataBtn, nameInput;
let hudSpeedVal, posDisplay, lapDisplay, hudTime, hudBestTime;
let hudMinimapCanvas, hudMinimapCtx;

let player, bot;
let currentSectorIndex = 0;
let sectorProgress = 0;
let laps = 0;
let gameRunning = false;
let keys = {};
let lastFrameTime = 0;
let obstacles = []; // ✅ Agora declarado corretamente
let startTime = 0;
let bestTimeMs = parseInt(localStorage.getItem("bestTimeMs") || "0", 10);
let TOTAL_TRACK_LENGTH = CONFIG.SECTORS.reduce((a, s) => a + (s.length || 0), 0);

// === OBJETOS PRINCIPAIS ===
class Car {
    constructor(x, y, color, isPlayer) {
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.speed = 0;
        this.color = color;
        this.isPlayer = isPlayer;
    }

    update() {
        if (this.isPlayer) {
            if (keys["ArrowUp"]) this.speed += CONFIG.ACCELERATION;
            if (keys["ArrowDown"]) this.speed -= CONFIG.ACCELERATION;
            if (keys["ArrowLeft"]) this.angle -= 0.05;
            if (keys["ArrowRight"]) this.angle += 0.05;
        }

        this.speed *= CONFIG.FRICTION;
        this.speed = Math.max(-3, Math.min(this.speed, CONFIG.MAX_SPEED));

        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.fillRect(-10, -20, 20, 40);
        ctx.restore();
    }
}

// === INICIALIZA O JOGO ===
function init() {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");
    W = canvas.width = 800;
    H = canvas.height = 600;

    menuDiv = document.getElementById("menu");
    gameDiv = document.getElementById("game");
    startBtn = document.getElementById("startBtn");
    resetDataBtn = document.getElementById("resetDataBtn");
    nameInput = document.getElementById("playerName");

    hudSpeedVal = document.getElementById("hud-speed-value");
    posDisplay = document.getElementById("hud-position");
    lapDisplay = document.getElementById("hud-lap");
    hudTime = document.getElementById("hud-time");
    hudBestTime = document.getElementById("hud-best-time");

    hudMinimapCanvas = document.getElementById("hud-minimap");
    hudMinimapCtx = hudMinimapCanvas.getContext("2d");

    startBtn.addEventListener("click", startGame);
    resetDataBtn.addEventListener("click", resetData);

    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup', e => keys[e.key] = false);

    if (bestTimeMs > 0) {
        hudBestTime.textContent = formatTime(bestTimeMs);
    } else {
        hudBestTime.textContent = "--:--.---";
    }
}

// === INICIA O JOGO ===
function startGame() {
    let name = nameInput.value.trim();
    if (!name) {
        alert("Digite seu nome para começar a corrida!");
        return;
    }
    player = new Car(200, 500, "blue", true);
    bot = new Car(220, 520, "red", false);

    currentSectorIndex = 0;
    sectorProgress = 0;
    laps = 1;
    startTime = performance.now();
    obstacles = []; // Zera os obstáculos se houver

    menuDiv.style.display = "none";
    gameDiv.style.display = "block";
    gameRunning = true;

    requestAnimationFrame(gameLoop);
}

// === LOOP PRINCIPAL DO JOGO ===
function gameLoop(timestamp) {
    if (!gameRunning) return;

    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}

// === LÓGICA DO JOGO ===
function update(dt) {
    player.update();
    bot.update();

    hudSpeedVal.textContent = Math.abs(player.speed).toFixed(1);
    lapDisplay.textContent = laps;
    hudTime.textContent = formatTime(performance.now() - startTime);
}

// === DESENHAR TELA ===
function draw() {
    ctx.clearRect(0, 0, W, H);
    drawTrack();
    player.draw();
    bot.draw();
}

// --- Desenhar a pista ---
function drawTrack() {
    ctx.fillStyle = "gray";
    ctx.fillRect(0, 0, W, H);
}

// === FORMATAR TEMPO ===
function formatTime(ms) {
    let totalSeconds = ms / 1000;
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = (totalSeconds % 60).toFixed(3);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(6, '0')}`;
}

function resetData() {
    localStorage.removeItem("bestTimeMs");
    hudBestTime.textContent = "--:--.---";
}

window.onload = init;
