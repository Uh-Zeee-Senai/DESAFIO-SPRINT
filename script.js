// === CONFIGURAÇÕES (edite AQUI) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "bot.png",
	BOOST_IMG: "supercar.png",
	EASTER_IMG: "ea.png",
	TRACK_BG: "pista.jpg",

	// Física e controle
	MAX_SPEED: 18,          // maior para corrida mais longa
	ACCEL: 0.28,            // aceleração por frame (segurando ↑)
	BRAKE: 1.0,             // desaceleração ao frear (↓)
	FRICTION: 0.025,        // desaceleração natural
	TURN_SPEED: 4.6,        // movimento lateral (px/frame)
	BOOST_MULTIPLIER: 1.9,
	BOOST_DURATION: 5000,

	// Pistas / fases (mude aqui para aumentar/diminuir)
	SECTORS: [
		{ name: "Rampa do Lago", color: "#dbeefd", length: 30000, aiMult: 1.05, img: "sector_lake.jpg" },
		{ name: "Fase de Nadar", color: "#cfe8f5", length: 35000, aiMult: 1.08, img: "sector_water.jpg" },
		{ name: "Fase da Escalada", color: "#e8e0ff", length: 40000, aiMult: 1.10, img: "sector_climb.jpg" },
		{ name: "Fase do Espaço", color: "#c6f7c3", length: 45000, aiMult: 1.12, img: "sector_space.jpg" },
		{ name: "Fase do Flash", color: "#fff0d6", length: 50000, aiMult: 1.15, img: "sector_flash.jpg" },
		{ name: "Fase do Multiverso", color: "#f0d6ff", length: 60000, aiMult: 1.18, img: "sector_multi.jpg" }
	],
	LAPS_TO_FINISH: 2,

	// misc
	SPAWN_EASTER_MIN: 9000,
	SPAWN_EASTER_MAX: 20000,
	AI_VARIANCE: 0.35 // menos caos, IA mais estável
};

// === Ajustes de progressão / mapeamento ===
// PROGRESS_SCALE: controla quantas "unidades" do track cada unidade de speed percorre por frame.
// Ajuste se quiser corridas mais rápidas/mais lentas.
// Calibrei em ~0.7 para que setores com 30k-60k unidades resultem em corridas de dezenas de segundos a alguns minutos, dependendo da velocidade.
const PROGRESS_SCALE = 0.7;

// Map 1 "unidade do jogo" = 0.1 metros (configurável mentalmente).
// Assim para HUD convertimos unidades -> km com: km = units * 0.1 / 1000 = units * 0.0001

// === VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetDataBtn, nameInput, debugDiv;
let hudPlayer, hudPhase, hudLap, hudSpeed, hudDist, hudPos;

let player, bot;
let currentSectorIndex = 0;
let sectorProgress = 0;
let laps = 0;
let easter = null;
let easterTimer = null;
let obstacles = []; // deixamos, mas não usaremos por enquanto
let gameRunning = false;
let keys = {};
let lastFrameTime = 0;

// total track length (soma de setores) - calculado depois
let TOTAL_TRACK_LENGTH = CONFIG.SECTORS.reduce((acc, s) => acc + (s.length || 0), 0);

// === CARREGA IMAGENS (fallbacks se não existirem) ===
const IMG = {
	player: loadIfExists(CONFIG.PLAYER_IMG),
	bot: loadIfExists(CONFIG.BOT_IMG),
	boost: loadIfExists(CONFIG.BOOST_IMG),
	easter: loadIfExists(CONFIG.EASTER_IMG),
	track: loadIfExists(CONFIG.TRACK_BG)
};
// carrega imagens de sector se tiverem
for (let s of CONFIG.SECTORS) s._img = s.img ? loadIfExists(s.img) : null;

function loadIfExists(src) {
	const img = new Image();
	if (!src) return img;
	img.src = src;
	img.onload = () => console.log("Loaded image:", src);
	img.onerror = () => console.warn("Image not found (using placeholder):", src);
	return img;
}

// === DOM READY ===
window.addEventListener("DOMContentLoaded", () => {
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");

	menuDiv = document.getElementById("menu");
	gameDiv = document.getElementById("game");
	startBtn = document.getElementById("startBtn");
	resetDataBtn = document.getElementById("resetDataBtn");
	nameInput = document.getElementById("playerName");
	debugDiv = document.getElementById("debug");

	hudPlayer = document.getElementById("hudPlayer");
	hudPhase = document.getElementById("hudPhase");
	hudLap = document.getElementById("hudLap");
	hudSpeed = document.getElementById("hudSpeed");
	hudDist = document.getElementById("hudDist");
	hudPos = document.getElementById("hudPos");

	// restore nome salvo
	const last = localStorage.getItem("lastPlayer");
	if (last) nameInput.value = last;

	startBtn.addEventListener("click", onStart);
	resetDataBtn.addEventListener("click", ()=>{ localStorage.removeItem("lastPlayer"); nameInput.value=""; debug("Saved name cleared"); });

	window.addEventListener("resize", onResize);
	window.addEventListener("keydown", e => keys[e.key] = true);
	window.addEventListener("keyup", e => keys[e.key] = false);

	onResize();
	drawMenuFrame();
});

// === LAYOUT / MENU PREVIEW ===
function onResize() {
	W = window.innerWidth; H = window.innerHeight;
	if (canvas) { canvas.width = W; canvas.height = H; }
}
function drawMenuFrame() {
	onResize();
	ctx.fillStyle = "#071023";
	ctx.fillRect(0,0,W,H);
	if (IMG.track && IMG.track.complete) {
		ctx.globalAlpha = 0.12;
		ctx.drawImage(IMG.track, 0, H - Math.min(H*0.6, IMG.track.height || H), W, Math.min(H*0.6, IMG.track.height || H));
		ctx.globalAlpha = 1;
	}
}

// === START / INIT RACE ===
function onStart() {
	const name = (nameInput.value || "Piloto").trim();
	localStorage.setItem("lastPlayer", name);
	initRace(name);
	menuDiv.style.display = "none";
	gameDiv.style.display = "block";
	gameRunning = true;
	lastFrameTime = performance.now();
	requestAnimationFrame(gameLoop);
	scheduleEasterSpawn();
}

function initRace(playerName) {
	onResize();
	player = {
		name: playerName,
		img: IMG.player,
		x: W/2 - 140,
		y: H - 260,
		width: 110, height: 150,
		speed: 0, angle: 0, boosting: false,
		totalProgress: 0, // total progress along track (units)
		lapsCompleted: 0
	};
	bot = {
		name: "Rival",
		img: IMG.bot,
		x: W/2 + 40,
		y: H - 300,
		width: 110, height: 150,
		speed: CONFIG.MAX_SPEED * 0.9,
		aiOffset: 0,
		totalProgress: 0,
		lapsCompleted: 0
	};
	currentSectorIndex = 0; sectorProgress = 0; laps = 0; easter = null; obstacles = [];
	// recalc total track length in case CONFIG changed at runtime
	TOTAL_TRACK_LENGTH = CONFIG.SECTORS.reduce((acc, s) => acc + (s.length || 0), 0);
	debug("Race initialized. Images ok? player=" + IMG.player.complete + " bot=" + IMG.bot.complete + " totalTrack=" + TOTAL_TRACK_LENGTH);
	updateHUD();
}

// === GAME LOOP ===
function gameLoop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(48, ts - lastFrameTime) / 16.6667; // normalized delta (approx frames)
	lastFrameTime = ts;

	update(dt);
	render();

	requestAnimationFrame(gameLoop);
}

// === UPDATE (gameplay) ===
function update(dt) {
	// PLAYER CONTROLS: acelera, freia, lateral
	if (keys["ArrowUp"] || keys["w"]) {
		player.speed += CONFIG.ACCEL * dt;
	} else {
		player.speed -= CONFIG.FRICTION * dt;
	}
	if (keys["ArrowDown"] || keys["s"]) player.speed -= CONFIG.BRAKE * dt;

	player.speed = clamp(player.speed, 0, CONFIG.MAX_SPEED * (player.boosting ? CONFIG.BOOST_MULTIPLIER : 1));

	let lateral = 0;
	if (keys["ArrowLeft"] || keys["a"]) lateral = -1;
	if (keys["ArrowRight"] || keys["d"]) lateral = 1;
	player.x += lateral * CONFIG.TURN_SPEED * (1 + (player.speed / CONFIG.MAX_SPEED)) * dt;
	player.angle = lateral * -0.18 * (player.speed / CONFIG.MAX_SPEED);

	// clamp player to road area
	const roadMargin = 0.17 * W;
	player.x = clamp(player.x, roadMargin, W - roadMargin - player.width);

	// BOT AI: target speed depends on sector aiMult and distance to player
	const sec = CONFIG.SECTORS[currentSectorIndex];
	const baseTarget = CONFIG.MAX_SPEED * (sec.aiMult || 1);
	// If player is ahead (player.totalProgress > bot.totalProgress), bot pushes more to catch
	const playerAhead = player.totalProgress > bot.totalProgress;
	const catchFactor = playerAhead ? 1.05 : 0.98;
	const noise = (Math.random() - 0.5) * CONFIG.AI_VARIANCE;
	const targetSpeed = clamp(baseTarget * catchFactor + noise * 2, 1, CONFIG.MAX_SPEED * 1.15);
	bot.speed += (targetSpeed - bot.speed) * 0.02 * dt;
	// lateral movement - bot tries to take an optimal line (centered with minor oscillation)
	bot.aiOffset += 0.01 * dt;
	const desiredX = W/2 + Math.sin(performance.now()/1000 + bot.aiOffset) * 60;
	bot.x += (desiredX - bot.x) * 0.015 * dt;
	bot.x = clamp(bot.x, roadMargin, W - roadMargin - bot.width);

	// PROGRESS: player and bot advance track based on speed, using PROGRESS_SCALE
	const playerProgressInc = player.speed * PROGRESS_SCALE * dt;
	const botProgressInc = bot.speed * PROGRESS_SCALE * dt;

	player.totalProgress += playerProgressInc;
	bot.totalProgress += botProgressInc;

	// calculate player's current sector index & sectorProgress from totalProgress
	let pRem = player.totalProgress % TOTAL_TRACK_LENGTH;
	let acc = 0;
	let newSectorIndex = 0;
	for (let i = 0; i < CONFIG.SECTORS.length; i++) {
		const len = CONFIG.SECTORS[i].length;
		if (pRem < acc + len) {
			newSectorIndex = i;
			sectorProgress = pRem - acc;
			break;
		}
		acc += len;
	}
	// detect sector change
	if (newSectorIndex !== currentSectorIndex) {
		currentSectorIndex = newSectorIndex;
		debug("Sector changed to: " + CONFIG.SECTORS[currentSectorIndex].name);
		applySectorEffects(currentSectorIndex);
	}

	// laps calculation (based on player totalProgress)
	const playerLaps = Math.floor(player.totalProgress / TOTAL_TRACK_LENGTH);
	if (playerLaps !== player.lapsCompleted) {
		player.lapsCompleted = playerLaps;
		laps = player.lapsCompleted; // main laps shown = player laps
		if (laps >= CONFIG.LAPS_TO_FINISH) {
			finishRace();
			return;
		}
	}

	// bot laps (for info)
	bot.lapsCompleted = Math.floor(bot.totalProgress / TOTAL_TRACK_LENGTH);

	// EASTER movement & pickup (if exists)
	if (easter) {
		easter.y += 3 + player.speed * 0.25;
		if (rectsOverlap(easter, player)) {
			collectEaster();
			easter = null;
			scheduleEasterSpawn();
		} else if (easter.y > H + 100) {
			easter = null;
			scheduleEasterSpawn();
		}
	}

	// atualiza HUD
	updateHUD();
}

// === SECTOR EFFECTS (leve) ===
function applySectorEffects(idx) {
	const s = CONFIG.SECTORS[idx];
	// ex: podemos ajustar parâmetros temporariamente; por enquanto só logamos
	debug("Changed to sector: " + s.name);
}

// === EASTER (spawn / collect) ===
function scheduleEasterSpawn() {
	clearTimeout(easterTimer);
	const delay = CONFIG.SPAWN_EASTER_MIN + Math.random() * (CONFIG.SPAWN_EASTER_MAX - CONFIG.SPAWN_EASTER_MIN);
	easterTimer = setTimeout(()=> {
		easter = { x: (W*0.2) + Math.random()*(W*0.6), y: -140, width: 64, height: 64, img: IMG.easter };
		debug("Easter spawned");
	}, delay);
}
function collectEaster() {
	if (player.boosting) return;
	player.boosting = true;
	player.img = IMG.boost;
	player.speed = Math.min(player.speed * CONFIG.BOOST_MULTIPLIER, CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER);
	setTimeout(()=> {
		player.boosting = false;
		player.img = IMG.player;
		player.speed = Math.min(player.speed, CONFIG.MAX_SPEED);
	}, CONFIG.BOOST_DURATION);
}

// === RENDER ===
function render() {
	// background (sector image or color)
	const s = CONFIG.SECTORS[currentSectorIndex];
	if (s._img && s._img.complete && s._img.naturalWidth) {
		ctx.drawImage(s._img, 0, 0, W, H);
		ctx.fillStyle = "rgba(0,0,0,0.18)";
		ctx.fillRect(0,0,W,H);
	} else {
		ctx.fillStyle = s.color || "#071023";
		ctx.fillRect(0,0,W,H);
	}

	// track faint texture if exists
	if (IMG.track && IMG.track.complete && IMG.track.naturalWidth) {
		ctx.save();
		ctx.globalAlpha = 0.12;
		const h = Math.min(H * 0.6, IMG.track.height || H*0.5);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.restore();
	}

	// pseudo-3D road
	drawRoadSlices();

	// draw easter if present
	if (easter) {
		if (easter.img && easter.img.complete && easter.img.naturalWidth) ctx.drawImage(easter.img, easter.x, easter.y, easter.width, easter.height);
		else {
			ctx.fillStyle = "#ffcc00";
			ctx.beginPath();
			ctx.arc(easter.x + easter.width/2, easter.y + easter.height/2, 18, 0, Math.PI*2);
			ctx.fill();
		}
	}

	// draw bot then player for depth
	drawCar(bot);
	drawCar(player);
}

function drawRoadSlices() {
	const slices = 30;
	for (let i = 0; i < slices; i++) {
		const t = i / slices;
		const roadWTop = Math.max(220, W*0.2);
		const roadWBottom = Math.min(W*0.92, W*0.78);
		const roadW = roadWTop + (roadWBottom - roadWTop) * (1 - t);
		const x = (W - roadW) / 2;
		const y = Math.floor(H * (0.12 + t * 0.86));
		ctx.fillStyle = "#2b2b2b";
		ctx.fillRect(x, y, roadW, Math.ceil(H / slices) + 1);
		if (i % 4 === 0) {
			ctx.fillStyle = "#f2f2f2";
			const dashW = 6;
			ctx.fillRect(W/2 - dashW/2, y, dashW, Math.ceil(H / slices) + 1);
		}
	}
}

function drawCar(c) {
	const img = (c === player && c.boosting) ? IMG.boost : c.img;
	if (img && img.complete && img.naturalWidth) {
		ctx.save();
		const cx = c.x + c.width/2;
		const cy = c.y + c.height/2;
		ctx.translate(cx, cy);
		ctx.rotate(c.angle || 0);
		ctx.drawImage(img, -c.width/2, -c.height/2, c.width, c.height);
		ctx.restore();
	} else {
		// fallback rect
		ctx.save();
		ctx.fillStyle = c === player ? "#ff3b3b" : "#4a90e2";
		ctx.fillRect(c.x, c.y, c.width, c.height);
		ctx.fillStyle = "#fff";
		ctx.font = "bold 14px Arial";
		ctx.fillText(c === player ? "PLAYER" : "BOT", c.x + 8, c.y + c.height/2 + 6);
		ctx.restore();
	}
}

// === HUD / UTIL ===
function updateHUD() {
	hudPlayer.textContent = player.name;
	hudPhase.textContent = CONFIG.SECTORS[currentSectorIndex].name;
	hudLap.textContent = `${player.lapsCompleted}/${CONFIG.LAPS_TO_FINISH}`;
	// speed mapping -> km/h approximation
	const speedKmh = Math.round(player.speed * 15); // factor tuned (player.speed * 15 ≈ realistic km/h)
	hudSpeed.textContent = speedKmh + " km/h";
	// distance remaining in current sector (units -> meters -> km)
	const remainingUnits = Math.max(0, CONFIG.SECTORS[currentSectorIndex].length - sectorProgress);
	const remainingMeters = remainingUnits * 0.1; // 1 unit = 0.1 m
	const remainingKm = (remainingMeters / 1000);
	hudDist.textContent = remainingKm.toFixed(2) + " km";
	// position by totalProgress
	hudPos.textContent = (player.totalProgress >= bot.totalProgress) ? "1º" : "2º";
}

function finishRace() {
	gameRunning = false;
	alert(`${player.name}, corrida finalizada! Voltas: ${player.lapsCompleted}/${CONFIG.LAPS_TO_FINISH}`);
	menuDiv.style.display = "flex";
	gameDiv.style.display = "none";
	clearTimeout(easterTimer);
}

function rectsOverlap(a,b) {
	if (!a || !b) return false;
	return !(a.x > b.x + (b.width||b.w) || a.x + (a.width||a.w) < b.x || a.y > b.y + (b.height||b.h) || a.y + (a.height||a.h) < b.y);
}

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function debug(m){ if (debugDiv) debugDiv.textContent = m; console.log("[GAME]", m); }
