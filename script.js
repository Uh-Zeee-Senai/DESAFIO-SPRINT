// === CONFIGURAÇÕES (edite apenas aqui) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "bot.png",
	BOOST_IMG: "supercar.png",
	EASTER_IMG: "ea.png",
	TRACK_BG: "pista.jpg",

	MAX_SPEED: 14,
	ACCEL: 0.35,
	BRAKE: 0.6,
	FRICTION: 0.03,
	TURN_SPEED: 3.6,
	BOOST_MULTIPLIER: 1.9,
	BOOST_DURATION: 5000,

	SECTORS: [
		{ name: "Rampa do Lago", color: "#f5e9a8", length: 1500 },
		{ name: "Fase de Nadar", color: "#f1c7c7", length: 1200 },
		{ name: "Fase da Escalada", color: "#b9c5f7", length: 1300 },
		{ name: "Fase do Espaço", color: "#c6f7c3", length: 1500 },
		{ name: "Fase do Flash", color: "#ffd8b0", length: 1000 },
		{ name: "Fase do Multiverso", color: "#e4c3f0", length: 2000 }
	],
	LAPS_TO_FINISH: 2,

	SPAWN_EASTER_MIN: 6000,
	SPAWN_EASTER_MAX: 14000,
	AI_VARIANCE: 0.6
};

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
let gameRunning = false;
let keys = {};
let lastFrameTime = 0;

// imagens (pré-load)
const IMG = {
	player: loadIfExists(CONFIG.PLAYER_IMG),
	bot: loadIfExists(CONFIG.BOT_IMG),
	boost: loadIfExists(CONFIG.BOOST_IMG),
	easter: loadIfExists(CONFIG.EASTER_IMG),
	track: loadIfExists(CONFIG.TRACK_BG)
};

function loadIfExists(src) {
	const img = new Image();
	img.src = src;
	// no error throw, we'll fallback to placeholder if not loaded
	img.onload = () => console.log(`Loaded image: ${src}`);
	img.onerror = () => console.warn(`Image not found (will use placeholder): ${src}`);
	return img;
}

// === INICIALIZA DOM E EVENTOS ===
window.addEventListener("DOMContentLoaded", () => {
	// DOM refs
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

	// restore name
	const last = localStorage.getItem("lastPlayer");
	if (last) nameInput.value = last;

	// events
	startBtn.addEventListener("click", onStart);
	resetDataBtn.addEventListener("click", ()=>{ localStorage.removeItem("lastPlayer"); nameInput.value=""; });
	window.addEventListener("resize", onResize);
	window.addEventListener("keydown", e => keys[e.key] = true);
	window.addEventListener("keyup", e => keys[e.key] = false);

	onResize();
	drawMenuFrame();
});

// === HELPERS ===
function onResize() {
	W = window.innerWidth;
	H = window.innerHeight;
	if (canvas) {
		canvas.width = W;
		canvas.height = H;
	}
}

function drawMenuFrame() {
	// menu background simple preview so user sees something
	onResize();
	ctx.fillStyle = "#071023";
	ctx.fillRect(0,0,W,H);
	if (IMG.track.complete) {
		ctx.globalAlpha = 0.15;
		ctx.drawImage(IMG.track, 0, H - Math.min(H*0.6, IMG.track.height), W, Math.min(H*0.6, IMG.track.height));
		ctx.globalAlpha = 1;
	}
}

// === START / RESET ===
function onStart() {
	const pName = (nameInput.value || "Piloto").trim();
	localStorage.setItem("lastPlayer", pName);
	initRace(pName);
	menuDiv.style.display = "none";
	gameDiv.style.display = "block";
	gameRunning = true;
	lastFrameTime = performance.now();
	requestAnimationFrame(gameLoop);
	scheduleEasterSpawn();
}

function initRace(playerName) {
	onResize();
	// player setup
	player = {
		name: playerName,
		x: W/2 - 140,
		y: H - 260,
		width: 100,
		height: 140,
		speed: 0,
		angle: 0,
		img: IMG.player,
		boosting: false
	};
	// bot setup
	bot = {
		name: "Rival",
		x: W/2 + 40,
		y: H - 300,
		width: 100,
		height: 140,
		speed: CONFIG.MAX_SPEED * 0.9,
		angle: 0,
		img: IMG.bot
	};
	// reset race state
	currentSectorIndex = 0;
	sectorProgress = 0;
	laps = 0;
	easter = null;
	debug("Race initialized. Images loaded? player=" + IMG.player.complete + " bot=" + IMG.bot.complete);
	updateHUD();
}

// === GAME LOOP ===
function gameLoop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(40, ts - lastFrameTime) / 16.6667;
	lastFrameTime = ts;

	update(dt);
	draw();
	requestAnimationFrame(gameLoop);
}

// === UPDATE ===
function update(dt) {
	// input accel / brake
	if (keys["ArrowUp"] || keys["w"]) player.speed += CONFIG.ACCEL * dt;
	else player.speed -= CONFIG.FRICTION * dt;
	if (keys["ArrowDown"] || keys["s"]) player.speed -= CONFIG.BRAKE * dt;

	player.speed = clamp(player.speed, 0, CONFIG.MAX_SPEED * (player.boosting ? CONFIG.BOOST_MULTIPLIER : 1));

	// lateral movement
	let lateral = 0;
	if (keys["ArrowLeft"] || keys["a"]) lateral = -1;
	if (keys["ArrowRight"] || keys["d"]) lateral = 1;
	player.x += lateral * CONFIG.TURN_SPEED * (1 + (player.speed / CONFIG.MAX_SPEED)) * dt;
	player.angle = lateral * -0.18 * (player.speed / CONFIG.MAX_SPEED);

	// road bounds
	const roadMargin = 0.17 * W;
	player.x = clamp(player.x, roadMargin, W - roadMargin - player.width);

	// simple bot AI: speed adjusts slightly, lateral sway
	const aiAdjust = (Math.sin(performance.now() / 3000) * CONFIG.AI_VARIANCE) + (Math.random() - 0.5) * 0.2;
	bot.speed += (((CONFIG.MAX_SPEED * 0.9) - bot.speed) * 0.02 * dt) + aiAdjust * 0.02;
	const desiredX = W/2 + Math.sin(performance.now()/1200) * 80;
	bot.x += (desiredX - bot.x) * 0.015 * dt;
	bot.x = clamp(bot.x, roadMargin, W - roadMargin - bot.width);

	// progress
	const progressInc = player.speed * 18 * dt;
	sectorProgress += progressInc;

	// sector finish check
	const currentSector = CONFIG.SECTORS[currentSectorIndex];
	if (sectorProgress >= currentSector.length) {
		sectorProgress -= currentSector.length;
		currentSectorIndex = (currentSectorIndex + 1) % CONFIG.SECTORS.length;
		if (currentSectorIndex === 0) {
			laps++;
			if (laps >= CONFIG.LAPS_TO_FINISH) finishRace();
		}
		applySectorEffects(currentSectorIndex);
	}

	// easter movement & pickup
	if (easter) {
		easter.y += 3 + player.speed * 0.3;
		if (rectsOverlap(easter, player)) {
			collectEaster();
			easter = null;
			scheduleEasterSpawn();
		} else if (easter.y > H + 100) {
			easter = null;
			scheduleEasterSpawn();
		}
	}

	updateHUD();
}

// === DRAW ===
function draw() {
	// background (phase color)
	const s = CONFIG.SECTORS[currentSectorIndex];
	ctx.fillStyle = s.color || "#102030";
	ctx.fillRect(0,0,W,H);

	// faded track image if available
	if (IMG.track.complete) {
		ctx.save();
		ctx.globalAlpha = 0.18;
		const h = Math.min(H * 0.6, IMG.track.height || H*0.5);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.restore();
	}

	// road slices for pseudo-3D
	drawRoadSlices();

	// easter
	if (easter) {
		if (IMG.easter.complete) ctx.drawImage(IMG.easter, easter.x, easter.y, easter.width, easter.height);
		else {
			ctx.fillStyle = "#ffcc00";
			ctx.beginPath();
			ctx.arc(easter.x + easter.width/2, easter.y + easter.height/2, 18, 0, Math.PI*2);
			ctx.fill();
		}
	}

	// draw bot and player
	drawCar(bot);
	drawCar(player);
}

// === AUX: desenha fatias da pista ===
function drawRoadSlices() {
	const slices = 28;
	for (let i = 0; i < slices; i++) {
		const t = i / slices;
		const roadWTop = Math.max(240, W*0.18);
		const roadWBottom = Math.min(W*0.92, W*0.78);
		const roadW = roadWTop + (roadWBottom - roadWTop) * (1 - t);
		const x = (W - roadW) / 2;
		const y = Math.floor(H * (0.12 + t * 0.88));
		ctx.fillStyle = "#2b2b2b";
		ctx.fillRect(x, y, roadW, Math.ceil(H / slices) + 1);
		if (i % 4 === 0) {
			ctx.fillStyle = "#f2f2f2";
			const dashW = 6;
			ctx.fillRect(W/2 - dashW/2, y, dashW, Math.ceil(H / slices) + 1);
		}
	}
}

// === AUX: desenha carro com fallback ===
function drawCar(c) {
	const img = (c === player && c.boosting) ? IMG.boost : c.img;
	if (img && img.complete && img.naturalWidth !== 0) {
		ctx.save();
		const cx = c.x + c.width/2;
		const cy = c.y + c.height/2;
		ctx.translate(cx, cy);
		ctx.rotate(c.angle || 0);
		ctx.drawImage(img, -c.width/2, -c.height/2, c.width, c.height);
		ctx.restore();
	} else {
		// fallback rectangle + text so you always see the car
		ctx.save();
		ctx.fillStyle = c === player ? "#ff3b3b" : "#4a90e2";
		ctx.fillRect(c.x, c.y, c.width, c.height);
		ctx.fillStyle = "#fff";
		ctx.font = "bold 14px Arial";
		ctx.fillText(c === player ? "PLAYER" : "BOT", c.x + 8, c.y + c.height/2 + 6);
		ctx.restore();
	}
}

// === EASTER SPAWN / COLLECT ===
function scheduleEasterSpawn() {
	clearTimeout(easterTimer);
	const delay = CONFIG.SPAWN_EASTER_MIN + Math.random() * (CONFIG.SPAWN_EASTER_MAX - CONFIG.SPAWN_EASTER_MIN);
	easterTimer = setTimeout(()=> {
		easter = {
			x: (W * 0.18) + Math.random() * (W * 0.64),
			y: -120,
			width: 68,
			height: 68
		};
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

// === SECTOR EFFECTS (exemplos) ===
function applySectorEffects(sectorIndex) {
	const s = CONFIG.SECTORS[sectorIndex];
	// tweak examples (these are light, you can make stronger)
	if (s.name.includes("Nadar")) {
		// reduce max speed slightly
		CONFIG.MAX_SPEED = Math.max(8, CONFIG.MAX_SPEED - 0.5);
	} else if (s.name.includes("Flash")) {
		CONFIG.MAX_SPEED = Math.min(22, CONFIG.MAX_SPEED + 0.7);
	} else if (s.name.includes("Espaço")) {
		CONFIG.TURN_SPEED = Math.min(6, CONFIG.TURN_SPEED + 0.6);
	}
	debug("Entered sector: " + s.name);
}

// === HUD, FINISH, UTIL ===
function updateHUD() {
	hudPlayer.textContent = player.name;
	hudPhase.textContent = CONFIG.SECTORS[currentSectorIndex].name;
	hudLap.textContent = `${laps}/${CONFIG.LAPS_TO_FINISH}`;
	hudSpeed.textContent = Math.round(player.speed * 10) + " km/h";
	hudDist.textContent = Math.max(0, Math.floor(CONFIG.SECTORS[currentSectorIndex].length - sectorProgress)) + "m";
	hudPos.textContent = (player.x < bot.x) ? "1º" : "2º";
}

function finishRace() {
	gameRunning = false;
	alert(`${player.name}, corrida finalizada! Voltas: ${laps}/${CONFIG.LAPS_TO_FINISH}`);
	menuDiv.style.display = "flex";
	gameDiv.style.display = "none";
}

function rectsOverlap(a,b) {
	if (!a || !b) return false;
	return !(a.x > b.x + b.width || a.x + a.width < b.x || a.y > b.y + b.height || a.y + a.height < b.y);
}

function clamp(v,min,max) { return Math.max(min, Math.min(max, v)); }

function debug(msg) {
	if (debugDiv) debugDiv.textContent = msg;
	console.log("[GAME]", msg);
}
