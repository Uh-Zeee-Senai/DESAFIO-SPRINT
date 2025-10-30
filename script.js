//	=== CONFIGURAÇÕES (mude só aqui) ===
const CONFIG = {
	// arquivos de imagem (coloque na mesma pasta ou use caminhos)
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "bot.png",
	BOOST_IMG: "supercar.png",
	EASTER_IMG: "ea.png",
	TRACK_BG: "pista.jpg",

	// carros / física
	MAX_SPEED: 14,            // velocidade máxima (unidade interna)
	ACCEL: 0.45,              // aceleração ao segurar ↑
	BRAKE: 0.9,               // desaceleração ao frear ↓
	FRICTION: 0.04,           // desaceleração natural
	TURN_SPEED: 3.6,          // movimento lateral base (px/frame)
	BOOST_MULTIPLIER: 1.9,    // multiplicador durante boost
	BOOST_DURATION: 5000,     // ms

	// pistas e fases
	SECTORS: [
		{ name: "Rampa do Lago", color: "#dbeefd", length: 1500, obstacleMult: 1.2, aiMult: 1.05, img: "sector_lake.jpg" },
		{ name: "Fase de Nadar", color: "#cfe8f5", length: 1300, obstacleMult: 1.4, aiMult: 1.08, img: "sector_water.jpg" },
		{ name: "Fase da Escalada", color: "#e8e0ff", length: 1400, obstacleMult: 1.3, aiMult: 1.06, img: "sector_climb.jpg" },
		{ name: "Fase do Espaço", color: "#e0ffd9", length: 1600, obstacleMult: 1.6, aiMult: 1.12, img: "sector_space.jpg" },
		{ name: "Fase do Flash", color: "#fff0d6", length: 1100, obstacleMult: 1.8, aiMult: 1.15, img: "sector_flash.jpg" },
		{ name: "Fase do Multiverso", color: "#f0d6ff", length: 1800, obstacleMult: 2.0, aiMult: 1.2, img: "sector_multi.jpg" }
	],
	LAPS_TO_FINISH: 2,

	// obstáculos / spawn
	BASE_OBSTACLE_RATE: 0.014, // chance/frame de spawn base (increase per sector)
	OBSTACLE_SPEED_BASE: 4,    // velocidade de queda dos obstáculos
	OBSTACLE_WIDTH: 64,
	OBSTACLE_HEIGHT: 40,

	// easter egg
	SPAWN_EASTER_MIN: 6000,
	SPAWN_EASTER_MAX: 14000,

	// misc
	CANVAS_BG: "#0b1220"
};

//	=== VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetDataBtn, nameInput, debugDiv;
let hudPlayer, hudPhase, hudLap, hudSpeed, hudDist, hudPos;

let player, bot;
let currentSectorIndex = 0;
let sectorProgress = 0;
let laps = 0;

let obstacles = []; // {x,y,w,h,spd}
let easter = null;   // {x,y,w,h,img}
let easterTimer = null;
let gameRunning = false;
let keys = {};
let lastFrame = 0;

// imagens (pré-load)
const IMG = {
	player: loadIfExists(CONFIG.PLAYER_IMG),
	bot: loadIfExists(CONFIG.BOT_IMG),
	boost: loadIfExists(CONFIG.BOOST_IMG),
	easter: loadIfExists(CONFIG.EASTER_IMG),
	track: loadIfExists(CONFIG.TRACK_BG)
};

// carrega imagens de sector (nome em CONFIG.SECTORS[].img)
for (let s of CONFIG.SECTORS) {
	s._img = loadIfExists(s.img);
}

//	=== DOM READY ===
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

	// restore name
	const last = localStorage.getItem("lastPlayer");
	if (last) nameInput.value = last;

	startBtn.addEventListener("click", onStart);
	resetDataBtn.addEventListener("click", ()=>{ localStorage.removeItem("lastPlayer"); nameInput.value=""; debug('Cleared saved name'); });

	window.addEventListener("resize", onResize);
	window.addEventListener("keydown", e => keys[e.key] = true);
	window.addEventListener("keyup", e => keys[e.key] = false);

	onResize();
	drawMenuFrame();
});

//	=== HELPERS ===
function loadIfExists(src) {
	const img = new Image();
	if (!src) return img;
	img.src = src;
	img.onload = ()=> console.log("Loaded:", src);
	img.onerror = ()=> console.warn("Image missing:", src);
	return img;
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function debug(m){ if (debugDiv) debugDiv.textContent = m; console.log("[G]", m); }

//	=== LAYOUT ===
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

//	=== START / INIT ===
function onStart() {
	const name = (nameInput.value || "Piloto").trim();
	localStorage.setItem("lastPlayer", name);
	initRace(name);
	menuDiv.style.display = "none";
	gameDiv.style.display = "block";
	gameRunning = true;
	lastFrame = performance.now();
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
		width: 100, height: 140,
		speed: 0, angle: 0, boosting: false
	};
	bot = {
		name: "Rival",
		img: IMG.bot,
		x: W/2 + 40,
		y: H - 300,
		width: 100, height: 140,
		speed: CONFIG.MAX_SPEED * 0.95, aiTimer: 0
	};
	currentSectorIndex = 0;
	sectorProgress = 0; laps = 0;
	obstacles = []; easter = null;
	debug("Race init — images: player=" + IMG.player.complete + " bot=" + IMG.bot.complete);
	updateHUD();
}

//	=== LOOP ===
function gameLoop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(40, ts - lastFrame) / 16.6667;
	lastFrame = ts;

	update(dt);
	render();
	requestAnimationFrame(gameLoop);
}

//	=== UPDATE GAME ===
function update(dt) {
	// INPUT: acelera/freia/turn
	if (keys["ArrowUp"] || keys["w"]) player.speed += CONFIG.ACCEL * dt;
	else player.speed -= CONFIG.FRICTION * dt;
	if (keys["ArrowDown"] || keys["s"]) player.speed -= CONFIG.BRAKE * dt;

	player.speed = clamp(player.speed, 0, CONFIG.MAX_SPEED * (player.boosting ? CONFIG.BOOST_MULTIPLIER : 1));

	let lateral = 0;
	if (keys["ArrowLeft"] || keys["a"]) lateral = -1;
	if (keys["ArrowRight"] || keys["d"]) lateral = 1;
	player.x += lateral * CONFIG.TURN_SPEED * (1 + (player.speed / CONFIG.MAX_SPEED)) * dt;
	player.angle = lateral * -0.18 * (player.speed / CONFIG.MAX_SPEED);
	const roadMargin = 0.17 * W;
	player.x = clamp(player.x, roadMargin, W - roadMargin - player.width);

	// BOT (ajustado para ficar competitivo): aumenta agressividade por setor
	const sector = CONFIG.SECTORS[currentSectorIndex];
	const aiTargetSpeed = CONFIG.MAX_SPEED * (sector.aiMult || 1) * (0.9 + Math.random()*0.12);
	bot.speed += (aiTargetSpeed - bot.speed) * 0.02 * dt + (Math.random()-0.5)*0.1;
	const sway = Math.sin(performance.now() / (800 + bot.aiTimer)) * 70;
	bot.x += ( (W/2 + sway) - bot.x ) * 0.02 * dt;
	bot.x = clamp(bot.x, roadMargin, W - roadMargin - bot.width);

	// spawn obstáculos (chance por frame)
	const obstacleRate = CONFIG.BASE_OBSTACLE_RATE * (sector.obstacleMult || 1);
	if (Math.random() < obstacleRate) spawnObstacle();

	// move obstacles toward player
	for (let ob of obstacles) {
		ob.y += ob.spd * (1 + player.speed/8) * dt;
	}
	// remove passed
	obstacles = obstacles.filter(o => o.y < H + 200);

	// trocas de setor / progresso
	const progInc = player.speed * 18 * dt;
	sectorProgress += progInc;
	if (sectorProgress >= sector.length) {
		sectorProgress -= sector.length;
		currentSectorIndex = (currentSectorIndex + 1) % CONFIG.SECTORS.length;
		if (currentSectorIndex === 0) {
			laps++;
			if (laps >= CONFIG.LAPS_TO_FINISH) finishRace();
		}
		applySectorEffects(currentSectorIndex);
	}

	// easter movement + collide
	if (easter) {
		easter.y += (3 + player.speed * 0.3) * dt * 10;
		if (rectsOverlap(easter, player)) {
			collectEaster();
			easter = null;
			scheduleEasterSpawn();
		} else if (easter.y > H + 200) {
			easter = null;
			scheduleEasterSpawn();
		}
	}

	// collisions with obstacles
	for (let o of obstacles) {
		if (rectsOverlap(o, player)) {
			// penalty
			player.speed = Math.max(1, player.speed * 0.6);
			// slight push
			player.x += (Math.random() - 0.5) * 40;
			// remove obstacle
			o.y = H + 999;
		}
		// bot collision
		if (rectsOverlap(o, bot)) {
			bot.speed = Math.max(1, bot.speed * 0.7);
			o.y = H + 999;
		}
	}

	updateHUD();
}

//	=== SPAWN OBSTÁCULO ===
function spawnObstacle() {
	const minX = W * 0.18; const maxX = W * 0.82;
	const x = minX + Math.random() * (maxX - minX - CONFIG.OBSTACLE_WIDTH);
	const y = -80;
	const spd = CONFIG.OBSTACLE_SPEED_BASE + Math.random()*2;
	obstacles.push({ x, y, w: CONFIG.OBSTACLE_WIDTH, h: CONFIG.OBSTACLE_HEIGHT, spd });
}

//	=== EASTER SPAWN / COLLECT ===
function scheduleEasterSpawn() {
	clearTimeout(easterTimer);
	const delay = CONFIG.SPAWN_EASTER_MIN + Math.random() * (CONFIG.SPAWN_EASTER_MAX - CONFIG.SPAWN_EASTER_MIN);
	easterTimer = setTimeout(()=>{
		easter = { x: (W*0.2) + Math.random()*(W*0.6), y: -140, width: 74, height: 74, img: IMG.easter };
		debug("Easter spawned");
	}, delay);
}
function collectEaster() {
	if (player.boosting) return;
	player.boosting = true;
	player.img = IMG.boost;
	player.speed = Math.min(player.speed * CONFIG.BOOST_MULTIPLIER, CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER);
	setTimeout(()=>{
		player.boosting = false;
		player.img = IMG.player;
		player.speed = Math.min(player.speed, CONFIG.MAX_SPEED);
	}, CONFIG.BOOST_DURATION);
}

//	=== APLICA EFEITOS AO MUDAR DE SECTOR ===
function applySectorEffects(idx) {
	// reset some values to defaults then tweak according to sector (keeps things stable)
	CONFIG.MAX_SPEED = Math.max(10, CONFIG.MAX_SPEED); // do not set too low accidentally
	CONFIG.TURN_SPEED = Math.max(2.5, CONFIG.TURN_SPEED);
	// you can customize stronger effects per sector if you want; currently we use obstacleMult and aiMult
	debug("Entered sector: " + CONFIG.SECTORS[idx].name);
}

//	=== DRAW ===
function render() {
	// background (sector image or color)
	const s = CONFIG.SECTORS[currentSectorIndex];
	if (s._img && s._img.complete && s._img.naturalWidth !== 0) {
		// draw sector image full screen faded
		ctx.drawImage(s._img, 0, 0, W, H);
		// overlay slight tint
		ctx.fillStyle = "rgba(0,0,0,0.20)";
		ctx.fillRect(0,0,W,H);
	} else {
		ctx.fillStyle = s.color || CONFIG.CANVAS_BG;
		ctx.fillRect(0,0,W,H);
	}

	// faint track texture bottom if available
	if (IMG.track && IMG.track.complete && IMG.track.naturalWidth !== 0) {
		ctx.save();
		ctx.globalAlpha = 0.18;
		const h = Math.min(H * 0.6, IMG.track.height || H*0.5);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.restore();
	}

	// draw road slices (pseudo-3D)
	drawRoadSlices();

	// draw obstacles
	for (let o of obstacles) {
		ctx.fillStyle = "#2a2a2a";
		ctx.fillRect(o.x, o.y, o.w, o.h);
		ctx.strokeStyle = "#111";
		ctx.strokeRect(o.x, o.y, o.w, o.h);
	}

	// draw easter
	if (easter) {
		if (easter.img && easter.img.complete && easter.img.naturalWidth) ctx.drawImage(easter.img, easter.x, easter.y, easter.width, easter.height);
		else {
			ctx.fillStyle = "#ffcc00";
			ctx.beginPath();
			ctx.arc(easter.x + easter.width/2, easter.y + easter.height/2, 18, 0, Math.PI*2);
			ctx.fill();
		}
	}

	// draw bot then player
	drawCar(bot);
	drawCar(player);
}

//	draw road slices
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

//	draw car with tilt
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
		ctx.save();
		ctx.fillStyle = c === player ? "#ff3b3b" : "#4a90e2";
		ctx.fillRect(c.x, c.y, c.width, c.height);
		ctx.fillStyle = "#fff";
		ctx.font = "bold 14px Arial";
		ctx.fillText(c === player ? "PLAYER" : "BOT", c.x + 8, c.y + c.height/2 + 6);
		ctx.restore();
	}
}

//	=== HUD / COLLISIONS / UTIL ===
function rectsOverlap(a,b) {
	if (!a || !b) return false;
	return !(a.x > b.x + (b.width || b.w) || a.x + (a.width || a.w) < b.x || a.y > b.y + (b.height || b.h) || a.y + (a.height || a.h) < b.y);
}
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
	clearTimeout(easterTimer);
}

//	=== start first easter/spawn etc. ===
function scheduleEasterSpawn() {
	clearTimeout(easterTimer);
	const delay = CONFIG.SPAWN_EASTER_MIN + Math.random() * (CONFIG.SPAWN_EASTER_MAX - CONFIG.SPAWN_EASTER_MIN);
	easterTimer = setTimeout(()=> {
		easter = { x: (W * 0.18) + Math.random() * (W * 0.64), y: -140, width: 74, height: 74, img: IMG.easter };
		debug("Easter spawned");
	}, delay);
}
