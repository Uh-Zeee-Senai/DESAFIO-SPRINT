// === CONFIGURAÇÕES (mude só aqui) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",   // seu player sprite (troque se quiser)
	BOT_IMG: "bot.png",       // sprite do rival
	TRACK_BG: "pista.jpg",    // textura de pista (opcional)

	MAX_SPEED: 14,            // velocidade máxima "base"
	ACCEL: 0.35,              // aceleração
	BRAKE: 0.9,
	FRICTION: 0.04,
	TURN_SPEED: 4.0,

	TRACK_LENGTH_UNITS: 6000, // comprimento total da volta (unidades simples)
	LAPS_TO_FINISH: 2,

	SPAWN_EASTER_MIN: 9000,
	SPAWN_EASTER_MAX: 20000,
	AI_VARIANCE: 0.35
};

// progress scale para controlar sensação de tempo vs distância
const PROGRESS_SCALE = 0.9;

// === GLOBAIS ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetDataBtn, nameInput, debugDiv;
let hudSpeedVal, posDisplay, lapDisplay, hudTime, hudBestTime;
let hudMinimapCanvas, hudMinimapCtx;

let player, bot;
let totalTrack = CONFIG.TRACK_LENGTH_UNITS;
let gameRunning = false;
let keys = {};
let lastFrameTime = 0;
let startTime = 0;
let easter = null;
let easterTimer = null;
let bestTimeMs = parseInt(localStorage.getItem("bestTimeMs") || "0", 10) || 0;

// images (preload)
const IMG = {
	player: loadIfExists(CONFIG.PLAYER_IMG),
	bot: loadIfExists(CONFIG.BOT_IMG),
	track: loadIfExists(CONFIG.TRACK_BG)
};

function loadIfExists(src) {
	const i = new Image();
	if (!src) return i;
	i.src = src;
	i.onload = () => console.log("Loaded:", src);
	i.onerror = () => console.warn("Image missing:", src);
	return i;
}

// safe setup on DOM ready
function safeStartSetup() {
	window.addEventListener("DOMContentLoaded", async () => {
		// DOM refs
		canvas = document.getElementById("gameCanvas");
		ctx = canvas ? canvas.getContext("2d") : null;
		menuDiv = document.getElementById("menu");
		gameDiv = document.getElementById("game");
		startBtn = document.getElementById("startGameBtn");
		resetDataBtn = document.getElementById("resetDataBtn");
		nameInput = document.getElementById("playerName");
		debugDiv = document.getElementById("debug");

		hudSpeedVal = document.getElementById("hudSpeedVal");
		posDisplay = document.getElementById("pos-display");
		lapDisplay = document.getElementById("lap-display");
		hudTime = document.getElementById("hudTime");
		hudBestTime = document.getElementById("hudBestTime");

		hudMinimapCanvas = document.getElementById("hudMinimap");
		hudMinimapCtx = hudMinimapCanvas ? hudMinimapCanvas.getContext("2d") : null;

		if (!canvas || !ctx) {
			console.error("Canvas não encontrado.");
			if (debugDiv) debugDiv.textContent = "Erro: canvas não encontrado.";
			return;
		}

		// restore name if present
		const last = localStorage.getItem("lastPlayer");
		if (last) nameInput.value = last;

		// events
		startBtn && startBtn.addEventListener("click", onStartSafe);
		resetDataBtn && resetDataBtn.addEventListener("click", () => {
			localStorage.removeItem("lastPlayer");
			if (nameInput) nameInput.value = "";
			debug("Nome salvo limpo.");
		});
		window.addEventListener("resize", onResize);
		window.addEventListener("keydown", e => { keys[e.key] = true; });
		window.addEventListener("keyup", e => { keys[e.key] = false; });

		onResize();
		await waitForImages([IMG.player, IMG.bot, IMG.track], 1200);
		drawMenuFrame();
	});
}

function waitForImages(imgs, timeout = 1200) {
	return new Promise(resolve => {
		let rem = imgs.length;
		if (rem === 0) return resolve();
		let done = false;
		const one = () => {
			rem--;
			if (rem <= 0 && !done) { done = true; resolve(); }
		};
		for (const im of imgs) {
			if (!im) { one(); continue; }
			if (im.complete && im.naturalWidth) { one(); continue; }
			im.onload = one; im.onerror = one;
		}
		setTimeout(() => { if (!done) { done = true; resolve(); } }, timeout);
	});
}

// onStart wrapper
function onStartSafe() {
	try {
		const name = (nameInput && nameInput.value) ? nameInput.value.trim() : "Piloto";
		localStorage.setItem("lastPlayer", name);
		initRace(name);
		menuDiv.style.display = "none";
		gameDiv.style.display = "block";
		gameRunning = true;
		startTime = performance.now();
		lastFrameTime = performance.now();
		requestAnimationFrame(gameLoop);
	} catch (err) {
		console.error("Erro start:", err);
		debug("Erro start: " + err.message);
	}
}

// init race minimal
function initRace(playerName) {
	onResize();
	player = {
		name: playerName,
		img: IMG.player,
		x: W / 2 - 80,
		y: H - 220,
		width: 120, height: 140,
		speed: 0,
		angle: 0,
		totalProgress: 0,
		lapsCompleted: 0
	};
	bot = {
		name: "Rival",
		img: IMG.bot,
		x: W / 2 + 40,
		y: H - 260,
		width: 120, height: 140,
		speed: CONFIG.MAX_SPEED * 0.9,
		totalProgress: 0,
		lapsCompleted: 0,
		aiOff: Math.random() * 1000
	};
	totalTrack = CONFIG.TRACK_LENGTH_UNITS;
	easter = null;
	clearTimeout(easterTimer);
	updateHUD();
}

// main loop
function gameLoop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(48, ts - lastFrameTime) / 16.6667;
	lastFrameTime = ts;

	update(dt);
	render();

	requestAnimationFrame(gameLoop);
}

// update physics & AI
function update(dt) {
	// player controls
	if (keys["ArrowUp"] || keys["w"]) player.speed += CONFIG.ACCEL * dt;
	else player.speed -= CONFIG.FRICTION * dt;
	if (keys["ArrowDown"] || keys["s"]) player.speed -= CONFIG.BRAKE * dt;
	player.speed = clamp(player.speed, 0, CONFIG.MAX_SPEED);

	let lateral = 0;
	if (keys["ArrowLeft"] || keys["a"]) lateral = -1;
	if (keys["ArrowRight"] || keys["d"]) lateral = 1;
	player.x += lateral * CONFIG.TURN_SPEED * (1 + player.speed / CONFIG.MAX_SPEED) * dt;
	player.angle = lateral * -0.12 * (player.speed / CONFIG.MAX_SPEED);
	const margin = 0.15 * W;
	player.x = clamp(player.x, margin, W - margin - player.width);

	// bot AI (simple chase + small randomness)
	const base = CONFIG.MAX_SPEED * (1 + (Math.sin(performance.now()/1200 + bot.aiOff) * 0.05));
	const diff = (player.totalProgress - bot.totalProgress);
	const want = clamp(base + (diff > 0 ? 0.6 : -0.4) + (Math.random() - 0.5) * CONFIG.AI_VARIANCE, 1, CONFIG.MAX_SPEED * 1.12);
	bot.speed += (want - bot.speed) * 0.02 * dt;
	// bot lateral line
	const desiredX = W/2 + Math.sin(performance.now()/900 + bot.aiOff) * 60;
	bot.x += (desiredX - bot.x) * 0.015 * dt;
	bot.x = clamp(bot.x, margin, W - margin - bot.width);

	// progress
	const pInc = player.speed * PROGRESS_SCALE * dt;
	const bInc = bot.speed * PROGRESS_SCALE * dt;
	player.totalProgress += pInc;
	bot.totalProgress += bInc;

	// compute laps & sector progress (simple: current sector = totalProgress % totalTrack)
	const playerLaps = Math.floor(player.totalProgress / totalTrack);
	if (playerLaps !== player.lapsCompleted) {
		player.lapsCompleted = playerLaps;
		if (player.lapsCompleted >= CONFIG.LAPS_TO_FINISH) { finishRace(); return; }
	}
	bot.lapsCompleted = Math.floor(bot.totalProgress / totalTrack);

	// update timer/hud
	updateTimer();
	updateHUD();
}

// render everything
function render() {
	// background plain
	ctx.fillStyle = "#0b1220";
	ctx.fillRect(0, 0, W, H);

	// simple parallax track image at bottom if exists
	if (IMG.track && IMG.track.complete && IMG.track.naturalWidth) {
		ctx.save();
		ctx.globalAlpha = 0.12;
		const h = Math.min(H * 0.55, IMG.track.height || H * 0.5);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.restore();
	}

	// road slices pseudo-3D
	drawRoadSlices();

	// draw bot then player
	drawCar(bot);
	drawCar(player);

	// minimap
	drawMinimap();
}

// road pseudo 3D stripes
function drawRoadSlices() {
	const slices = 26;
	for (let i = 0; i < slices; i++) {
		const t = i / slices;
		const roadWTop = Math.max(200, W * 0.18);
		const roadWBottom = Math.min(W * 0.92, W * 0.78);
		const roadW = roadWTop + (roadWBottom - roadWTop) * (1 - t);
		const x = (W - roadW) / 2;
		const y = Math.floor(H * (0.12 + t * 0.88));
		ctx.fillStyle = "#222";
		ctx.fillRect(x, y, roadW, Math.ceil(H / slices) + 1);

		if (i % 4 === 0) {
			ctx.fillStyle = "#f2f2f2";
			const dashW = 6;
			ctx.fillRect(W / 2 - dashW / 2, y, dashW, Math.ceil(H / slices) + 1);
		}
	}
}

// draw car with fallback
function drawCar(c) {
	const img = (c === player) ? c.img : c.img;
	if (img && img.complete && img.naturalWidth) {
		ctx.save();
		const cx = c.x + c.width / 2;
		const cy = c.y + c.height / 2;
		ctx.translate(cx, cy);
		ctx.rotate(c.angle || 0);
		const scale = 1 + ((c.totalProgress % totalTrack) / totalTrack) * 0 * 0; // placeholder for scale effect
		ctx.drawImage(img, -c.width / 2, -c.height / 2, c.width * scale, c.height * scale);
		// shadow
		ctx.globalCompositeOperation = "destination-over";
		ctx.fillStyle = "rgba(0,0,0,0.2)";
		ctx.beginPath();
		ctx.ellipse(0 + 6, c.height / 2 + 8, c.width * 0.5, c.height * 0.12, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
		ctx.globalCompositeOperation = "source-over";
	} else {
		// fallback rectangle
		ctx.save();
		ctx.fillStyle = (c === player) ? "#ff3b3b" : "#4a90e2";
		ctx.fillRect(c.x, c.y, c.width, c.height);
		ctx.fillStyle = "#fff";
		ctx.font = "bold 14px monospace";
		ctx.fillText((c === player ? "YOU" : "BOT"), c.x + 8, c.y + c.height / 2 + 6);
		// shadow bar
		ctx.fillStyle = "rgba(0,0,0,0.2)";
		ctx.fillRect(c.x + 6, c.y + c.height + 6, c.width - 12, 6);
		ctx.restore();
	}
}

// minimap draw
function drawMinimap() {
	if (!hudMinimapCtx || !hudMinimapCanvas) return;
	const mmW = hudMinimapCanvas.width = Math.min(160, Math.round(W * 0.12));
	const mmH = hudMinimapCanvas.height = Math.min(200, Math.round(H * 0.18));
	hudMinimapCtx.clearRect(0, 0, mmW, mmH);
	hudMinimapCtx.fillStyle = "#111";
	hudMinimapCtx.fillRect(0, 0, mmW, mmH);
	hudMinimapCtx.fillStyle = "#333";
	hudMinimapCtx.fillRect(6, 10, mmW - 12, mmH - 20);

	const px = 6 + ((player.totalProgress % totalTrack) / totalTrack) * (mmW - 12);
	const bx = 6 + ((bot.totalProgress % totalTrack) / totalTrack) * (mmW - 12);

	hudMinimapCtx.fillStyle = "#ff3b3b";
	hudMinimapCtx.fillRect(px - 3, mmH / 2 - 6, 6, 12);
	hudMinimapCtx.fillStyle = "#4a90e2";
	hudMinimapCtx.fillRect(bx - 3, mmH / 2 + 10, 6, 12);
}

// HUD helpers
function updateHUD() {
	posDisplay.textContent = (player.totalProgress >= bot.totalProgress) ? "POS 1/2" : "POS 2/2";
	lapDisplay.textContent = `LAP ${player.lapsCompleted}/${CONFIG.LAPS_TO_FINISH}`;
	const speedKmh = Math.round(player.speed * 15);
	hudSpeedVal.textContent = String(speedKmh).padStart(3, "0");
	// rpm bar
	updateRpmBar(player.speed / CONFIG.MAX_SPEED);
	// distance remaining for current lap (km)
	const rem = totalTrack - (player.totalProgress % totalTrack);
	const remKm = (rem * 0.1) / 1000;
	const distElem = document.getElementById("hudDist");
	if (distElem) distElem.textContent = remKm.toFixed(2) + " km";
}

function updateRpmBar(norm) {
	const segs = document.querySelectorAll(".rpm-segment");
	const count = segs.length;
	const active = Math.round(norm * count);
	for (let i = 0; i < count; i++) {
		segs[i].className = "rpm-segment";
		if (i < active) {
			const pct = i / count;
			if (pct < 0.6) segs[i].classList.add("active-green");
			else if (pct < 0.85) segs[i].classList.add("active-yellow");
			else segs[i].classList.add("active-red");
		}
	}
}

// timer
function updateTimer() {
	if (!startTime) return;
	const now = performance.now();
	const elapsed = now - startTime;
	const ms = Math.floor(elapsed % 1000);
	const s = Math.floor((elapsed / 1000) % 60);
	const m = Math.floor((elapsed / (60 * 1000)) % 60);
	if (hudTime) hudTime.textContent = `TIME ${String(m).padStart(2,"0")}'${String(s).padStart(2,"0")}"${String(Math.floor(ms/10)).padStart(2,"0")}`;
}

// finish
function finishRace() {
	gameRunning = false;
	const elapsed = performance.now() - startTime;
	if (!bestTimeMs || elapsed < bestTimeMs || bestTimeMs === 0) {
		bestTimeMs = Math.floor(elapsed);
		localStorage.setItem("bestTimeMs", String(bestTimeMs));
	}
	// format best
	const bm = bestTimeMs;
	const ms = Math.floor(bm % 1000);
	const s = Math.floor((bm / 1000) % 60);
	const m = Math.floor((bm / (60 * 1000)) % 60);
	if (hudBestTime) hudBestTime.textContent = `BEST ${String(m).padStart(2,"0")}'${String(s).padStart(2,"0")}"${String(Math.floor(ms/10)).padStart(2,"0")}`;
	alert(`${player.name}, corrida finalizada! Voltas: ${player.lapsCompleted}/${CONFIG.LAPS_TO_FINISH}`);
	menuDiv.style.display = "flex";
	gameDiv.style.display = "none";
	clearTimeout(easterTimer);
}

// util functions
function rectsOverlap(a,b) {
	if (!a || !b) return false;
	return !(a.x > (b.x + (b.width||b.w)) || (a.x + (a.width||a.w)) < b.x || a.y > (b.y + (b.height||b.h)) || (a.y + (a.height||a.h)) < b.y);
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function debug(m) { if (debugDiv) debugDiv.textContent = m; console.log("[GAME]", m); }
function drawMenuFrame() {
	onResize();
	ctx.fillStyle = "#071023";
	ctx.fillRect(0,0,W,H);
	if (IMG.track && IMG.track.complete) {
		ctx.globalAlpha = 0.12;
		const h = Math.min(H*0.6, IMG.track.height || H*0.5);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.globalAlpha = 1;
	}
}
function onResize() {
	W = window.innerWidth; H = window.innerHeight;
	if (canvas) { canvas.width = W; canvas.height = H; }
	if (hudMinimapCanvas) {
		hudMinimapCanvas.width = Math.min(160, Math.floor(W * 0.12));
		hudMinimapCanvas.height = Math.min(200, Math.floor(H * 0.18));
	}
}

// start it
safeStartSetup();
