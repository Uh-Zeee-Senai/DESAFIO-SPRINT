// === CONFIG (edite só aqui) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",        // sprite top-down do player
	RIVAL_IMG: "bot.png",          // sprite top-down do rival
	ROAD_IMG: "road.png",          // textura/estrada (opcional)
	BG_LEFT: "bg_left.png",        // lateral esquerda (parallax), opcional
	BG_RIGHT: "bg_right.png",      // lateral direita (parallax), opcional

	MAX_SPEED: 14,    // velocidade máxima (unidade interna)
	ACCEL: 0.35,      // aceleração
	BRAKE: 0.9,       // freio
	FREEZE_FRICTION: 0.05,
	TURN_SPEED: 3.8,  // rotação lateral
	PROGRESS_SCALE: 0.6, // quanto o speed avança a pista por frame

	LAPS_TO_FINISH: 2
};

// === Globals ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetBtn, nameInput, debugDiv;
let hudPlayerName, hudPos, hudSpeed, hudLap;
let player, rival;
let keys = {}, gameRunning = false;
let lastTime = 0;
let trackOffset = 0; // deslocamento vertical da estrada (simula movimento)
let startTime = 0, bestTimeMs = parseInt(localStorage.getItem("bestTimeMs") || "0",10) || 0;
let TOTAL_TRACK = 100000; // units; we keep simple looped track
let playerProgress = 0, rivalProgress = 0;
let images = {};

// === Preload images (safe) ===
function loadImg(src) {
	const img = new Image();
	if (!src) return img;
	img.src = src;
	img.onerror = () => console.warn("Image not found:", src);
	return img;
}

// create default simple sprites (if images missing) - generate canvas images
function makePlaceholderCar(color = "#ff3b3b") {
	const c = document.createElement("canvas");
	c.width = 120; c.height = 60;
	const g = c.getContext("2d");
	g.fillStyle = color;
	g.fillRect(6,12,108,36);
	g.fillStyle = "#222";
	g.fillRect(12,16,28,28);
	g.fillRect(80,16,28,28);
	g.fillStyle = "#fff";
	g.fillRect(22,22,8,8);
	g.fillRect(88,22,8,8);
	return c;
}

// safe init (wait for DOM)
window.addEventListener("DOMContentLoaded", () => {
	// DOM refs
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");
	menuDiv = document.getElementById("menu");
	gameDiv = document.getElementById("game");
	startBtn = document.getElementById("startBtn");
	resetBtn = document.getElementById("resetBtn");
	nameInput = document.getElementById("playerName");
	debugDiv = document.getElementById("debug");

	hudPlayerName = document.getElementById("playerNameHud");
	hudPos = document.getElementById("posHud");
	hudSpeed = document.getElementById("speedHud");
	hudLap = document.getElementById("lapHud");

	// load images
	images.player = loadImg(CONFIG.PLAYER_IMG);
	images.rival = loadImg(CONFIG.RIVAL_IMG);
	images.road = loadImg(CONFIG.ROAD_IMG);
	images.bgLeft = loadImg(CONFIG.BG_LEFT);
	images.bgRight = loadImg(CONFIG.BG_RIGHT);

	// if images fail to load, use placeholder
	images.player.onerror = images.rival.onerror = images.road.onerror = () => {};
	images.player.onload = images.rival.onload = images.road.onload = () => {};

	// fallback placeholders if not loaded after short time
	setTimeout(() => {
		if (!images.player || !images.player.complete || !images.player.naturalWidth) images.player = makePlaceholderCar("#ff3b3b");
		if (!images.rival || !images.rival.complete || !images.rival.naturalWidth) images.rival = makePlaceholderCar("#4a90e2");
	}, 300);

	// events
	startBtn.addEventListener("click", startGame);
	resetBtn.addEventListener("click", () => { localStorage.removeItem("lastPlayer"); nameInput.value = ""; });

	window.addEventListener("keydown", e => { keys[e.key] = true; });
	window.addEventListener("keyup", e => { keys[e.key] = false; });

	onResize();
	window.addEventListener("resize", onResize);

	// restore name
	const saved = localStorage.getItem("lastPlayer");
	if (saved) nameInput.value = saved;
});

// === Start / Init ===
function startGame() {
	const name = (nameInput.value || "Piloto").trim();
	localStorage.setItem("lastPlayer", name);

	// init player and rival
	player = {
		name,
		x: 0, y: 0,
		angle: 0,
		speed: 0,
		width: 64, height: 32,
		sprite: images.player
	};
	rival = {
		name: "Rival",
		x: 0, y: 0,
		angle: 0,
		speed: CONFIG.MAX_SPEED * 0.85,
		width: 64, height: 32,
		sprite: images.rival,
		aiAggro: 0.5
	};

	// reset state
	playerProgress = 0;
	rivalProgress = 0;
	trackOffset = 0;
	startTime = performance.now();
	lastTime = performance.now();
	gameRunning = true;
	menuDiv.style.display = "none";
	gameDiv.style.display = "block";
	hudPlayerName.textContent = player.name;
	hudLap.textContent = `Volta: 0/${CONFIG.LAPS_TO_FINISH}`;

	requestAnimationFrame(loop);
}

// === Resize ===
function onResize() {
	W = canvas.width = window.innerWidth;
	H = canvas.height = window.innerHeight;
}

// === Main loop ===
function loop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(40, ts - lastTime) / 16.6667; // dt normalized ~1 per frame
	lastTime = ts;

	update(dt);
	render();

	requestAnimationFrame(loop);
}

// === Update game logic ===
function update(dt) {
	// player input
	if (keys["ArrowUp"] || keys["w"]) {
		player.speed += CONFIG.ACCEL * dt;
	} else {
		player.speed -= CONFIG.FREEZE_FRICTION * dt;
	}
	if (keys["ArrowDown"] || keys["s"]) player.speed -= CONFIG.BRAKE * dt;

	player.speed = clamp(player.speed, 0, CONFIG.MAX_SPEED);

	// steering modifies lateral movement visually (angle)
	let steer = 0;
	if (keys["ArrowLeft"] || keys["a"]) steer = -1;
	if (keys["ArrowRight"] || keys["d"]) steer = 1;
	player.angle = steer * 0.12 * (player.speed / CONFIG.MAX_SPEED);

	// simulate progress along track (vertical movement)
	const progInc = player.speed * CONFIG.PROGRESS_SCALE * dt;
	playerProgress += progInc;
	rivalProgress += rival.speed * CONFIG.PROGRESS_SCALE * dt;

	// loop track
	if (playerProgress >= TOTAL_TRACK) playerProgress -= TOTAL_TRACK;
	if (rivalProgress >= TOTAL_TRACK) rivalProgress -= TOTAL_TRACK;

	// update track scroll offset (visual)
	trackOffset += player.speed * 0.6 * dt;
	if (trackOffset > H) trackOffset -= H;

	// simple rival AI: tries to match player's progress plus small randomness
	const diff = (playerProgress - rivalProgress);
	let rivalTarget = CONFIG.MAX_SPEED * (0.8 + rival.aiAggro * 0.25) + diff * 0.0001;
	// clamp
	rivalTarget = clamp(rivalTarget, 1, CONFIG.MAX_SPEED * 1.05);
	// smooth speed change
	rival.speed += (rivalTarget - rival.speed) * 0.02 * dt;
	// small lateral wobble for visuals
	rival.angle = Math.sin(performance.now()/800) * 0.08;

	// update HUD
	const speedKmh = Math.round(player.speed * 12); // tuning
	hudSpeed.textContent = `Velocidade: ${speedKmh} km/h`;
	hudPos.textContent = (playerProgress >= rivalProgress) ? "Posição: 1/2" : "Posição: 2/2";

	// laps: count when player completes full track
	const lapsDone = Math.floor((playerProgress) / TOTAL_TRACK);
	hudLap.textContent = `Volta: ${lapsDone % CONFIG.LAPS_TO_FINISH}/${CONFIG.LAPS_TO_FINISH}`;
	// finish condition (player completes LAPS_TO_FINISH loops)
	if (Math.floor((playerProgress) / TOTAL_TRACK) >= CONFIG.LAPS_TO_FINISH) {
		endRace();
	}
}

// === Render (top-down aerial) ===
function render() {
	// clear
	ctx.clearRect(0,0,W,H);

	// background sides (parallax)
	drawBackground();

	// draw repeated road stripes (vertical scrolling)
	drawRoad();

	// compute screen positions: player always near bottom center; rival relative offset above
	const centerX = W/2;
	const playerY = H * 0.78;
	const rivalY = playerY - ((playerProgress - rivalProgress) * 0.0006 * H); // visual relative distance
	// cap rivalY within screen
	const rivalYc = clamp(rivalY, H*0.12, H*0.7);

	// draw rival behind (farther)
	drawCar(rival, centerX, rivalYc);

	// draw player on top center
	drawCar(player, centerX, playerY, true);

	// optional HUD overlays (already DOM)
}

// draw background (simple parallax left/right, and horizon)
function drawBackground() {
	// sky gradient
	const g = ctx.createLinearGradient(0,0,0,H*0.6);
	g.addColorStop(0, "#87CEEB");
	g.addColorStop(1, "#cfefff");
	ctx.fillStyle = g;
	ctx.fillRect(0,0,W,H*0.6);

	// ground sides
	ctx.fillStyle = "#2ecc71";
	ctx.fillRect(0,H*0.6,W,H*0.4);

	// draw left/right decorative if images exist
	if (images.bgLeft && images.bgLeft.complete && images.bgLeft.naturalWidth) {
		const scale = (H/ images.bgLeft.height) * 0.6;
		const w = images.bgLeft.width * scale;
		ctx.drawImage(images.bgLeft, 20, H*0.58 - (trackOffset%100), w, images.bgLeft.height*scale);
	}
	if (images.bgRight && images.bgRight.complete && images.bgRight.naturalWidth) {
		const scale = (H/ images.bgRight.height) * 0.6;
		const w = images.bgRight.width * scale;
		ctx.drawImage(images.bgRight, W - w - 20, H*0.58 - (trackOffset%100), w, images.bgRight.height*scale);
	}
}

// draw road with center dashed line and lane markers
function drawRoad() {
	const roadW = Math.min(W*0.5, 900);
	const x = (W - roadW)/2;
	const laneW = roadW/3;

	// road base
	ctx.fillStyle = "#3a3a3a";
	ctx.fillRect(x, 0, roadW, H);

	// side markers
	ctx.fillStyle = "#111";
	ctx.fillRect(x+4, 0, 6, H);
	ctx.fillRect(x+roadW-10, 0, 6, H);

	// dashed center line (scrolling)
	const dashH = 40;
	const gap = 28;
	const total = dashH + gap;
	let start = - (trackOffset % total);
	ctx.fillStyle = "#f8f3e3";
	for (let y = start; y < H; y += total) {
		ctx.fillRect(W/2 - 6/2, y, 6, dashH);
	}

	// lane boundaries (subtle)
	ctx.strokeStyle = "rgba(255,255,255,0.06)";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(x + laneW, 0);
	ctx.lineTo(x + laneW, H);
	ctx.moveTo(x + 2*laneW, 0);
	ctx.lineTo(x + 2*laneW, H);
	ctx.stroke();
}

// draw car (rotated), flip for top-down look if needed
function drawCar(car, sx, sy, isPlayer = false) {
	ctx.save();
	ctx.translate(sx, sy);
	ctx.rotate(car.angle || 0);
	// scale a bit by speed (visual feedback)
	const scale = 1 + (car.speed / CONFIG.MAX_SPEED) * 0.06;
	ctx.scale(scale, scale);

	if (car.sprite && car.sprite.complete && car.sprite.naturalWidth) {
		ctx.drawImage(car.sprite, -car.width/2, -car.height/2, car.width, car.height);
	} else if (car.sprite && car.sprite.getContext) {
		// canvas placeholder
		ctx.drawImage(car.sprite, -car.width/2, -car.height/2, car.width, car.height);
	} else {
		// fallback simple rectangle
		ctx.fillStyle = isPlayer ? "#ff3b3b" : "#4a90e2";
		ctx.fillRect(-car.width/2, -car.height/2, car.width, car.height);
	}
	// small shadow
	ctx.fillStyle = "rgba(0,0,0,0.12)";
	ctx.beginPath();
	ctx.ellipse(6, car.height/2 + 8, car.width*0.5, 6, 0, 0, Math.PI*2);
	ctx.fill();

	ctx.restore();
}

// === End race / reset ===
function endRace() {
	gameRunning = false;
	const elapsed = performance.now() - startTime;
	if (!bestTimeMs || elapsed < bestTimeMs || bestTimeMs === 0) {
		bestTimeMs = Math.floor(elapsed);
		localStorage.setItem("bestTimeMs", bestTimeMs.toString());
	}
	alert(`${player.name} finalizou a corrida!`);
	menuDiv.style.display = "flex";
	gameDiv.style.display = "none";
}

// helpers
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
