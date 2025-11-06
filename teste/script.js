// === CONFIGURAÇÕES (troque apenas aqui se quiser) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "bot.png",
	TRACK_BG: "track.jpg",

	MAX_SPEED: 18,    // unidade interna
	ACCEL: 0.36,
	BRAKE: 1.2,
	FRICTION: 0.04,
	TURN_SPEED: 5.2,

	SECTORS: [
		{ name: "Alpha Track", length: 30000 },
		{ name: "Bravo Track", length: 30000 }
	],
	LAPS_TO_FINISH: 2
};

// progress scale (affects how fast you cross long sectors)
const PROGRESS_SCALE = 0.65;

// === variáveis globais ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetBtn, nameInput, debugDiv;
let hudSpeedVal, posDisplay, lapDisplay, hudTime;
let hudMinimapCanvas, hudMinimapCtx;

let player, bot;
let TOTAL_TRACK_LENGTH = CONFIG.SECTORS.reduce((a,s)=>a+(s.length||0), 0);
let currentSectorIndex = 0;
let sectorProgress = 0;
let gameRunning = false;
let keys = {};
let lastFrame = 0;
let startTime = 0;
let bestTimeMs = parseInt(localStorage.getItem("bestTimeMs")||"0",10) || 0;

// preload images (fallbacks allowed)
const IMG = {
	player: loadIfExists(CONFIG.PLAYER_IMG),
	bot: loadIfExists(CONFIG.BOT_IMG),
	track: loadIfExists(CONFIG.TRACK_BG)
};

function loadIfExists(src) {
	const im = new Image();
	if (!src) return im;
	im.src = src;
	im.onload = ()=> console.log("Loaded:", src);
	im.onerror = ()=> console.warn("Missing:", src);
	return im;
}

// === setup seguro ===
function safeStartSetup() {
	window.addEventListener("DOMContentLoaded", async () => {
		canvas = document.getElementById("gameCanvas");
		ctx = canvas ? canvas.getContext("2d") : null;
		menuDiv = document.getElementById("menu");
		gameDiv = document.getElementById("game");
		startBtn = document.getElementById("startGameBtn");
		resetBtn = document.getElementById("resetDataBtn");
		nameInput = document.getElementById("playerName");
		debugDiv = document.getElementById("debug");
		hudSpeedVal = document.getElementById("hudSpeedVal");
		posDisplay = document.getElementById("pos-display");
		lapDisplay = document.getElementById("lap-display");
		hudTime = document.getElementById("hud-time");
		hudMinimapCanvas = document.getElementById("hudMinimap");
		hudMinimapCtx = hudMinimapCanvas ? hudMinimapCanvas.getContext("2d") : null;

		if (!canvas || !ctx) {
			console.error("Canvas não encontrado (id=gameCanvas).");
			if (debugDiv) debugDiv.textContent = "Erro: canvas não encontrado.";
			return;
		}

		// restore name
		const last = localStorage.getItem("lastPlayer");
		if (last) nameInput.value = last;

		// events
		startBtn && startBtn.addEventListener("click", onStart);
		resetBtn && resetBtn.addEventListener("click", ()=>{
			localStorage.removeItem("lastPlayer");
			if (nameInput) nameInput.value = "";
			debug("Nome salvo limpo.");
		});
		window.addEventListener("resize", onResize);
		window.addEventListener("keydown", e => { keys[e.key] = true; });
		window.addEventListener("keyup", e => { keys[e.key] = false; });

		onResize();
		await waitForImages([IMG.player, IMG.bot, IMG.track], 1200);
		drawMenuPreview();
	});
}
function waitForImages(arr, timeout=1200) {
	return new Promise(resolve=>{
		let rem = arr.length;
		if (rem===0) return resolve();
		let done=false;
		const one = ()=>{ rem--; if(rem<=0 && !done){ done=true; resolve(); } };
		for(const im of arr) {
			if(!im) { one(); continue; }
			if(im.complete && im.naturalWidth) { one(); continue; }
			im.onload = one; im.onerror = one;
		}
		setTimeout(()=>{ if(!done){ done=true; resolve(); } }, timeout);
	});
}

// === start / init ===
function onStart() {
	try {
		const name = (nameInput && nameInput.value) ? nameInput.value.trim() : "Piloto";
		localStorage.setItem("lastPlayer", name);
		initRace(name);
		menuDiv.style.display = "none";
		document.getElementById("game").style.display = "block";
		gameRunning = true;
		startTime = performance.now();
		lastFrame = performance.now();
		requestAnimationFrame(loop);
	} catch(e) {
		console.error("Erro onStart:", e);
		debug("Erro onStart: " + e.message);
	}
}
function initRace(name) {
	onResize();
	player = {
		name,
		x: W*0.5 - 60,
		y: H - 200,
		width: 120, height: 160,
		speed: 0, angle: 0, boosting: false,
		totalProgress: 0, laps: 0
	};
	bot = {
		name: "Rival",
		x: W*0.5 + 80,
		y: H - 260,
		width: 120, height: 160,
		speed: CONFIG.MAX_SPEED*0.9, aiPhase: 0,
		totalProgress: 0, laps: 0
	};
	currentSectorIndex = 0;
	sectorProgress = 0;
	TOTAL_TRACK_LENGTH = CONFIG.SECTORS.reduce((a,s)=>a+(s.length||0),0);
	debug("Corrida iniciada. track=" + TOTAL_TRACK_LENGTH);
	updateHUD();
}

// === main loop ===
function loop(ts) {
	if(!gameRunning) return;
	const dt = Math.min(48, ts - lastFrame) / 16.6667;
	lastFrame = ts;
	update(dt);
	render();
	requestAnimationFrame(loop);
}

// === update game logic ===
function update(dt) {
	// player controls
	if (keys["ArrowUp"] || keys["w"]) player.speed += CONFIG.ACCEL * dt;
	else player.speed -= CONFIG.FRICTION * dt;
	if (keys["ArrowDown"] || keys["s"]) player.speed -= CONFIG.BRAKE * dt;
	player.speed = clamp(player.speed, 0, CONFIG.MAX_SPEED);

	let lat = 0;
	if (keys["ArrowLeft"] || keys["a"]) lat = -1;
	if (keys["ArrowRight"] || keys["d"]) lat = 1;
	player.x += lat * CONFIG.TURN_SPEED * (1 + (player.speed / CONFIG.MAX_SPEED)) * dt;
	player.angle = lat * -0.12 * (player.speed / CONFIG.MAX_SPEED);
	const margin = 0.12 * W;
	player.x = clamp(player.x, margin, W - margin - player.width);

	// bot AI simple: fluctuate, try to match progress
	const noise = (Math.sin(performance.now()/800 + bot.aiPhase) * 0.4) + (Math.random()-0.5)*0.2;
	const want = CONFIG.MAX_SPEED * (0.85 + noise*0.05);
	bot.speed += (want - bot.speed) * 0.02 * dt;
	bot.aiPhase += 0.005 * dt;
	const desiredX = W*0.5 + Math.sin(performance.now()/1000 + bot.aiPhase)*80;
	bot.x += (desiredX - bot.x) * 0.02 * dt;
	bot.x = clamp(bot.x, margin, W - margin - bot.width);

	// progress both
	const pInc = player.speed * PROGRESS_SCALE * dt;
	const bInc = bot.speed * PROGRESS_SCALE * dt;
	player.totalProgress += pInc;
	bot.totalProgress += bInc;

	// compute sector/progress from player
	let pRem = player.totalProgress % TOTAL_TRACK_LENGTH;
	let acc = 0;
	for (let i=0;i<CONFIG.SECTORS.length;i++){
		const len = CONFIG.SECTORS[i].length;
		if (pRem < acc + len) {
			currentSectorIndex = i;
			sectorProgress = pRem - acc;
			break;
		}
		acc += len;
	}

	// laps
	const playerLap = Math.floor(player.totalProgress / TOTAL_TRACK_LENGTH);
	if (playerLap !== player.laps) {
		player.laps = playerLap;
		if (player.laps >= CONFIG.LAPS_TO_FINISH) {
			finishRace();
			return;
		}
	}
	bot.laps = Math.floor(bot.totalProgress / TOTAL_TRACK_LENGTH);

	// update timer & hud
	updateTimer();
	updateHUD();
}

// === render visuals ===
function render() {
	// clear
	ctx.clearRect(0,0,W,H);

	// brighter background sky + horizon
	const grad = ctx.createLinearGradient(0,0,0,H);
	grad.addColorStop(0,"#bde7ff");
	grad.addColorStop(0.6,"#e8fbff");
	grad.addColorStop(1,"#fffdfa");
	ctx.fillStyle = grad;
	ctx.fillRect(0,0,W,H);

	// faint track texture
	if (IMG.track && IMG.track.complete && IMG.track.naturalWidth) {
		ctx.save();
		ctx.globalAlpha = 0.18;
		const h = Math.min(H*0.5, IMG.track.height || H*0.5);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.restore();
	}

	// road slices
	drawRoad();

	// draw cars (bot behind player to create overlap)
	drawCar(bot);
	drawCar(player);

	// minimap
	drawMinimap();
}

function drawRoad() {
	const slices = 28;
	for (let i=0;i<slices;i++){
		const t = i / slices;
		const roadWTop = Math.max(200, W*0.18);
		const roadWBottom = Math.min(W*0.92, W*0.78);
		const roadW = roadWTop + (roadWBottom - roadWTop)*(1 - t);
		const x = (W - roadW)/2;
		const y = Math.floor(H*(0.12 + t*0.86));
		ctx.fillStyle = (i%2===0) ? "#e6e6e6" : "#d9d9d9";
		ctx.fillRect(x, y, roadW, Math.ceil(H/slices)+1);
		// center line
		if (i%3===0) {
			ctx.fillStyle = "#ffd95a";
			ctx.fillRect(W/2 - 6/2, y, 6, Math.ceil(H/slices)+1);
		}
	}
}

// car drawing with image fallback
function drawCar(c) {
	const img = (c===player) ? IMG.player : IMG.bot;
	if (img && img.complete && img.naturalWidth) {
		ctx.save();
		const cx = c.x + c.width/2;
		const cy = c.y + c.height/2;
		ctx.translate(cx, cy);
		ctx.rotate(c.angle || 0);
		const scale = 1 + ((c === player) ? 0.03 : 0.0);
		ctx.drawImage(img, -c.width/2*scale, -c.height/2*scale, c.width*scale, c.height*scale);
		ctx.restore();
	} else {
		ctx.save();
		ctx.fillStyle = (c===player) ? "#ff3b3b" : "#2b78ff";
		ctx.fillRect(c.x, c.y, c.width, c.height);
		ctx.restore();
	}
}

// minimap simple
function drawMinimap() {
	if (!hudMinimapCtx || !hudMinimapCanvas) return;
	const mmW = hudMinimapCanvas.width = Math.min(160, Math.floor(W*0.12));
	const mmH = hudMinimapCanvas.height = Math.min(90, Math.floor(H*0.12));
	hudMinimapCtx.clearRect(0,0,mmW,mmH);
	hudMinimapCtx.fillStyle = "#eee";
	hudMinimapCtx.fillRect(4,4,mmW-8, mmH-8);
	hudMinimapCtx.fillStyle = "#bbb";
	hudMinimapCtx.fillRect(8,10, mmW-16, mmH-28);
	const px = 8 + ((player.totalProgress % TOTAL_TRACK_LENGTH)/TOTAL_TRACK_LENGTH)*(mmW-16);
	const bx = 8 + ((bot.totalProgress % TOTAL_TRACK_LENGTH)/TOTAL_TRACK_LENGTH)*(mmW-16);
	hudMinimapCtx.fillStyle = "#c62828";
	hudMinimapCtx.fillRect(px-3, mmH/2 - 6, 6, 12);
	hudMinimapCtx.fillStyle = "#1565c0";
	hudMinimapCtx.fillRect(bx-3, mmH/2 - 6, 6, 12);
}

// === HUD/timer helpers ===
function updateHUD() {
	posDisplay.textContent = (player.totalProgress >= bot.totalProgress) ? "POS 1/2" : "POS 2/2";
	lapDisplay.textContent = `LAP ${player.laps}/${CONFIG.LAPS_TO_FINISH}`;
	hudSpeedVal.textContent = String(Math.round(player.speed*15)).padStart(3,"0");
}
function updateTimer() {
	if (!startTime) startTime = performance.now();
	const now = performance.now();
	const elapsed = now - startTime;
	const s = Math.floor(elapsed/1000)%60;
	const m = Math.floor(elapsed/60000);
	hudTime.textContent = `TIME ${String(m).padStart(2,"0")}'${String(s).padStart(2,"0")}"`;
}

// finish
function finishRace() {
	gameRunning = false;
	const elapsed = performance.now() - startTime;
	if (!bestTimeMs || elapsed < bestTimeMs || bestTimeMs === 0) {
		bestTimeMs = Math.floor(elapsed);
		localStorage.setItem("bestTimeMs", String(bestTimeMs));
	}
	alert(`${player.name}, corrida finalizada! Voltas: ${player.laps}/${CONFIG.LAPS_TO_FINISH}`);
	menuDiv.style.display = "flex";
	document.getElementById("game").style.display = "none";
}

// helpers
function rectsOverlap(a,b) {
	if(!a||!b) return false;
	return !(a.x > b.x+(b.width||b.w) || a.x+(a.width||a.w) < b.x || a.y > b.y+(b.height||b.h) || a.y+(a.height||a.h) < b.y);
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function debug(m){ if (debugDiv) debugDiv.textContent = m; console.log("[GAME]", m); }
function drawMenuPreview(){
	onResize();
	ctx.fillStyle = "#0b2340";
	ctx.fillRect(0,0,W,H);
	if (IMG.track && IMG.track.complete) {
		ctx.globalAlpha = 0.12;
		const h = Math.min(H*0.5, IMG.track.height||H*0.5);
		ctx.drawImage(IMG.track, 0, H-h, W, h);
		ctx.globalAlpha = 1;
	}
}
function onResize(){
	W = window.innerWidth; H = window.innerHeight;
	if (canvas) { canvas.width = W; canvas.height = H; }
	if (hudMinimapCanvas) {
		hudMinimapCanvas.width = Math.min(160, Math.floor(W*0.12));
		hudMinimapCanvas.height = Math.min(90, Math.floor(H*0.12));
	}
}

// start
safeStartSetup();
