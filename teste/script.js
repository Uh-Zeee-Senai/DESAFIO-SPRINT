// === CONFIG (mude apenas aqui se quiser trocar imagens/valores) ===
const CONFIG = {
	PLAYER_IMG: "carro1.png",            // seu carro (player)
	RIVAL_IMAGES: ["carro2.png","carro3.png","carro2.png"], // rivais possíveis
	TRACK_BG: "pista.jpg",               // opcional
	CANVAS_BG_COLOR: "#071427",

	PLAYER_SIDE_SPEED: 6,    // px por frame lateral
	SCROLL_BASE: 3.5,        // velocidade base de "descida" da pista (px/frame)
	SCROLL_ACCEL: 2.8,       // quanto aumenta ao apertar ↑
	SCROLL_DECEL: 3.5,       // quanto diminui ao apertar ↓
	MAX_SCROLL: 18,          // cap na velocidade de scroll
	SPAWN_INTERVAL: 900,     // ms base entre rivais spawn
	SPAWN_VARIANCE: 800,     // ms random extra
	MAX_DISTANCE: 999999     // máxima contagem da distância
};

// === Globals ===
let canvas, ctx, W, H;
let menu, startBtn, restartBtn, playerNameInput, debugDiv;
let hudName, hudDistance, hudSpeed, hudPos, hudLaps;

let keys = {};
let gameRunning = false;
let lastTime = 0;
let scrollSpeed = CONFIG.SCROLL_BASE; // how fast the road moves down

let player = null;
let rivals = [];
let spawnTimer = 0;
let distance = 0; // virtual units (we'll display as meters)
let playerName = "Piloto";

// Images
const IMAGES = {
	player: new Image(),
	rivals: [],
	track: new Image()
};

// preload
IMAGES.player.src = CONFIG.PLAYER_IMG;
for (let i = 0; i < CONFIG.RIVAL_IMAGES.length; i++) {
	const im = new Image();
	im.src = CONFIG.RIVAL_IMAGES[i];
	IMAGES.rivals.push(im);
}
IMAGES.track.src = CONFIG.TRACK_BG;

// === DOM READY ===
window.addEventListener("DOMContentLoaded", () => {
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");

	menu = document.getElementById("menu");
	startBtn = document.getElementById("startBtn");
	restartBtn = document.getElementById("restartBtn");
	playerNameInput = document.getElementById("playerName");
	debugDiv = document.getElementById("debug");

	hudName = document.getElementById("hud-name");
	hudDistance = document.getElementById("hud-distance");
	hudSpeed = document.getElementById("hud-speed");
	hudPos = document.getElementById("hud-pos");
	hudLaps = document.getElementById("hud-laps");

	startBtn.addEventListener("click", startGame);
	restartBtn.addEventListener("click", restartGame);

	window.addEventListener("resize", resize);
	window.addEventListener("keydown", e => { keys[e.key] = true; });
	window.addEventListener("keyup", e => { keys[e.key] = false; });

	resize();
	drawMenuPreview();
});

// === Setup / Start / Restart ===
function startGame() {
	playerName = (playerNameInput && playerNameInput.value.trim()) ? playerNameInput.value.trim() : "Piloto";
	hudName.textContent = playerName;
	menu.style.display = "none";
	restartBtn.style.display = "none";
	initRun();
	gameRunning = true;
	lastTime = performance.now();
	requestAnimationFrame(loop);
}
function restartGame() {
	// clear state and show menu again quickly then start
	resetState();
	menu.style.display = "flex";
	restartBtn.style.display = "none";
}
function resetState() {
	gameRunning = false;
	player = null;
	rivals = [];
	distance = 0;
	scrollSpeed = CONFIG.SCROLL_BASE;
	spawnTimer = 0;
}

// initialize player & first state
function initRun() {
	resize();
	player = {
		img: IMAGES.player,
		width: Math.min(140, Math.floor(W * 0.12)),
		height: Math.min(200, Math.floor(H * 0.18)),
		x: Math.floor(W/2 - Math.min(140, Math.floor(W * 0.12))/2),
		y: Math.floor(H - Math.min(200, Math.floor(H * 0.18)) - 24),
		speedSide: CONFIG.PLAYER_SIDE_SPEED,
		crashed: false
	};
	rivals = [];
	spawnTimer = performance.now() + randInterval();
	distance = 0;
	scrollSpeed = CONFIG.SCROLL_BASE;
	hudName.textContent = playerName;
}

// === Main loop ===
function loop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(50, ts - lastTime) / 16.6667; // normalized
	lastTime = ts;

	update(dt);
	render();

	requestAnimationFrame(loop);
}

// === Update game state ===
function update(dt) {
	// Controls: ←/→ side, ↑ accelerate (increase scroll), ↓ decelerate (reduce/reverse)
	if (player && !player.crashed) {
		if (keys["ArrowLeft"] || keys["a"]) player.x -= Math.round(player.speedSide * dt);
		if (keys["ArrowRight"] || keys["d"]) player.x += Math.round(player.speedSide * dt);

		// clamp inside road-like area (we'll allow edge-to-edge)
		player.x = clamp(player.x, 8, W - player.width - 8);

		// accelerate / decelerate affects scrollSpeed
		if (keys["ArrowUp"] || keys["w"]) {
			scrollSpeed += CONFIG.SCROLL_ACCEL * dt;
		} else {
			// natural decay slightly toward base
			if (scrollSpeed > CONFIG.SCROLL_BASE) scrollSpeed -= CONFIG.SCROLL_BASE * 0.02 * dt;
			else if (scrollSpeed < CONFIG.SCROLL_BASE) scrollSpeed += CONFIG.SCROLL_BASE * 0.02 * dt;
		}
		if (keys["ArrowDown"] || keys["s"]) {
			scrollSpeed -= CONFIG.SCROLL_DECEL * dt;
		}

		// clamp scroll speed
		scrollSpeed = clamp(scrollSpeed, -CONFIG.MAX_SCROLL, CONFIG.MAX_SCROLL);
	}

	// update distance (simulate meters). Use positive scrollSpeed to increase distance.
	if (scrollSpeed > 0) {
		distance += Math.round(scrollSpeed * dt);
		if (distance > CONFIG.MAX_DISTANCE) distance = CONFIG.MAX_DISTANCE;
	} else if (scrollSpeed < 0) {
		// when negative, "go backward" a bit (but not below 0)
		distance = Math.max(0, distance + Math.round(scrollSpeed * dt));
	}
	// spawn rivals
	const now = performance.now();
	if (now >= spawnTimer) {
		spawnRival();
		spawnTimer = now + randInterval();
	}

	// update rivals positions (they move downwards at rate proportional to scrollSpeed + own speed)
	for (let i = rivals.length - 1; i >= 0; i--) {
		const r = rivals[i];
		// vertical speed = scrollSpeed * base + r.speed
		const baseDown = (scrollSpeed >= 0) ? scrollSpeed : scrollSpeed * 0.6;
		r.y += (baseDown + r.speed) * dt;
		// slight horizontal sway
		r.x += Math.sin((now + r.offset) / 600) * r.sway * dt;

		// recycle if off bottom
		if (r.y > H + 120) {
			rivals.splice(i,1);
			continue;
		}

		// collision check with player
		if (player && !player.crashed && rectOverlap(player, r)) {
			player.crashed = true;
			gameOver();
			return;
		}
	}

	// update HUD
	updateHUD();
}

// === Spawn rival ===
function spawnRival() {
	// choose image
	const idx = Math.floor(Math.random() * IMAGES.rivals.length);
	const img = IMAGES.rivals[idx];
	const w = Math.min(120, Math.floor(W * (0.10 + Math.random()*0.02)));
	const h = Math.min(170, Math.floor(H * (0.14 + Math.random()*0.03)));
	const laneX = Math.floor(16 + Math.random() * (W - 32 - w));
	const r = {
		img,
		width: w,
		height: h,
		x: laneX,
		y: -h - 20,
		speed: 2 + Math.random() * 3.2, // own downward speed
		sway: 8 + Math.random() * 12,
		offset: Math.random() * 1000
	};
	rivals.push(r);
}

// === Render frame ===
function render() {
	// clear
	ctx.clearRect(0,0,W,H);

	// background track (tiled or stretched)
	if (IMAGES.track && IMAGES.track.complete && IMAGES.track.naturalWidth) {
		// draw with slight vertical offset to imply movement (use distance % img.height)
		const img = IMAGES.track;
		const t = Math.floor((distance) % img.height);
		// draw two tiles to fill
		ctx.drawImage(img, 0, -t, W, img.height);
		ctx.drawImage(img, 0, img.height - t, W, img.height);
	} else {
		// simple gradient already on canvas via CSS background, but paint fallback
		ctx.fillStyle = CONFIG.CANVAS_BG_COLOR;
		ctx.fillRect(0,0,W,H);
	}

	// draw road overlay (centered rectangle) to simulate "pista"
	const roadW = Math.floor(W * 0.68);
	const roadX = Math.floor((W - roadW)/2);
	const roadY = 0;
	ctx.fillStyle = "#202830";
	ctx.fillRect(roadX, roadY, roadW, H);

	// lane markings (center dashed)
	const laneXCenter = Math.floor(W/2);
	ctx.strokeStyle = "#f2f2f2";
	ctx.lineWidth = 4;
	ctx.setLineDash([10,20]);
	for (let y = - (distance % 40); y < H; y+=40) {
		ctx.beginPath();
		ctx.moveTo(laneXCenter, y);
		ctx.lineTo(laneXCenter, y+16);
		ctx.stroke();
	}
	ctx.setLineDash([]);

	// draw rivals (behind player for depth)
	for (const r of rivals) {
		if (r.img && r.img.complete && r.img.naturalWidth) {
			ctx.drawImage(r.img, r.x, Math.floor(r.y), r.width, r.height);
		} else {
			// fallback rectangle
			ctx.fillStyle = "#b33";
			ctx.fillRect(r.x, Math.floor(r.y), r.width, r.height);
		}
		// small name label
		ctx.fillStyle = "#fff";
		ctx.font = "12px monospace";
		ctx.fillText("RIVAL", r.x + 6, Math.floor(r.y) + 14);
	}

	// draw player (on top)
	if (player) {
		if (player.img && player.img.complete && player.img.naturalWidth) {
			ctx.drawImage(player.img, player.x, player.y, player.width, player.height);
		} else {
			ctx.fillStyle = "#ff3b3b";
			ctx.fillRect(player.x, player.y, player.width, player.height);
		}
		// label
		ctx.fillStyle = "#fff";
		ctx.font = "12px monospace";
		ctx.fillText(playerName, player.x + 6, player.y + 14);
	}

	// optional debug - draw collision boxes when debug flag enabled
	// (not enabled by default)
}

// === HUD update ===
function updateHUD() {
	// distance display: meters approx (distance units are px*some factor). We'll show simple integer up to MAX_DISTANCE
	hudDistance.textContent = "DIST: " + String(Math.min(CONFIG.MAX_DISTANCE, distance)).padStart(6, "0");
	hudSpeed.textContent = "SPEED: " + Math.round(scrollSpeed);
	// position is always 1 or 2 depending if player total progressed greater than first rival's progress approximation
	const leading = (rivals.length === 0) ? 1 : ((distance >= Math.max(...rivals.map(r => Math.max(0, r._progress || 0)))) ? 1 : 2);
	hudPos.textContent = "POS: " + leading + "/2";
	// laps placeholder
	hudLaps.textContent = "LAPS: -";
}

// === Game Over ===
function gameOver() {
	gameRunning = false;
	restartBtn.style.display = "inline-block";
	menu.style.display = "flex";
	// show crash message
	debugDiv.textContent = playerName + " colisão! Distância final: " + distance;
}

// === Utils ===
function randInterval() {
	return CONFIG.SPAWN_INTERVAL + Math.random() * CONFIG.SPAWN_VARIANCE;
}
function clamp(v,a,b) { return Math.max(a, Math.min(b, v)); }
function rectOverlap(a,b) {
	return !(a.x + a.width < b.x || a.x > b.x + b.width || a.y + a.height < b.y || a.y > b.y + b.height);
}
function resize() {
	W = window.innerWidth;
	H = window.innerHeight;
	if (canvas) {
		canvas.width = W;
		canvas.height = H;
	}
	// keep player centered horizontally if exists
	if (player) {
		player.width = Math.min(140, Math.floor(W * 0.12));
		player.height = Math.min(200, Math.floor(H * 0.18));
		player.x = Math.floor(W/2 - player.width/2);
		player.y = Math.floor(H - player.height - 24);
	}
}

// small helper to draw initial menu preview
function drawMenuPreview() {
	ctx.clearRect(0,0,canvas.width,canvas.height);
	ctx.fillStyle = "rgba(0,0,0,0.45)";
	ctx.fillRect(0,0,canvas.width,canvas.height);
	ctx.fillStyle = "#fff";
	ctx.font = "18px monospace";
	ctx.fillText("Pressione Iniciar para começar a corrida (Desktop - Vista Aérea)", 24, 48);
}
